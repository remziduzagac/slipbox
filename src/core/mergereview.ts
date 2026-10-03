// The merge review (plan 20.21; docs/idea.md, "Git"): before a merge, git's own tentative result —
// `git merge-tree`, the working tree untouched — checked for the links it would break. Git can't see
// this itself: "refactor moves docs/plan.md; main added a link to it in docs/b.md" changes different
// files, so it merges cleanly. Each link broken in the result that wasn't broken in the branch merged
// into is said with its cause — the file moved (where to, and the fix), was deleted, isn't on either
// branch, or the note itself moved — and whose change it was. Committed work only: what isn't
// committed is in neither branch.

import { spawnSync } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { urlPath } from "./convert.ts";
import { type Checkout, headOf } from "./git.ts";
import { changedBetween, inVault } from "./gitops.ts";
import { extractText } from "./graph.ts";
import { homeDir } from "./links.ts";

export interface MergeBreak {
  /** The note linking, in the merged result (vault path). */
  path: string;
  line: number;
  column: number;
  /** The link's target, as written. */
  target: string;
  /** The file it names, from where the note is in the result (vault path). */
  names: string;
  /**
   * Why: the file it names moved (to `to`), or was deleted, by a branch; isn't on either branch; or
   * the note moved (`note-moved`), its relative link left naming another place — `to` is the file it
   * named from where it was.
   */
  cause: "moved" | "deleted" | "missing" | "note-moved";
  /** The branch whose change it is: the one that moved or deleted it; `missing`, the one merged. */
  by: string;
  to: string | null;
  /** The target to write instead, from the note, its `#fragment` kept: what reaches `to`. */
  fix: string | null;
}

export interface MergeReview {
  /** The branch merged into (its name, or the ref given) and the one merged. */
  into: string;
  from: string;
  /** Their merge base; null for histories with none in common. */
  base: string | null;
  /** The result's tree, as git wrote it — nothing checked out. */
  tree: string;
  /** Files git couldn't merge (from the checkout's top folder): conflict markers in the result. */
  conflicts: string[];
  breaks: MergeBreak[];
}

export class MergeReviewError extends Error {}

const NOTE = /\.(md|markdown)$/i;

function git(c: Pick<Checkout, "root">, args: string[], input?: string): { status: number | null; out: Buffer; err: string } {
  const r = spawnSync("git", ["-C", c.root, ...args], { input, maxBuffer: 512 * 1024 * 1024, timeout: 120_000 });
  return { status: r.error ? null : r.status, out: r.stdout ?? Buffer.alloc(0), err: r.stderr?.toString("utf8") ?? String(r.error ?? "") };
}

function commitOf(c: Pick<Checkout, "root">, ref: string): string | null {
  const r = git(c, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.status === 0 ? r.out.toString("utf8").trim() : null;
}

/** The vault's files in a tree — not under a hidden folder or node_modules, as the walk has it — each vault path to its blob. */
function filesIn(c: Checkout, root: string, tree: string): Map<string, string> {
  const r = git(c, ["ls-tree", "-r", "-z", "--full-tree", tree]);
  if (r.status !== 0) throw new MergeReviewError(`git ls-tree ${tree}: ${r.err.trim() || "failed"}`);
  const out = new Map<string, string>();
  for (const e of r.out.toString("utf8").split("\0")) {
    const tab = e.indexOf("\t");
    if (tab < 0) continue;
    const [, type, oid] = e.slice(0, tab).split(" ");
    const rel = type === "blob" ? inVault(c, root, e.slice(tab + 1)) : null;
    if (rel && !rel.split("/").some((s) => s.startsWith(".") || s === "node_modules")) out.set(rel, oid!);
  }
  return out;
}

/** Blobs' texts, by id, read in one `git cat-file --batch`. */
function readBlobs(c: Pick<Checkout, "root">, oids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!oids.length) return out;
  const r = git(c, ["cat-file", "--batch"], `${oids.join("\n")}\n`);
  const buf = r.out;
  let at = 0;
  while (at < buf.length) {
    const nl = buf.indexOf(10, at);
    if (nl < 0) break;
    const [oid, type, size] = buf.subarray(at, nl).toString("utf8").split(" ");
    at = nl + 1;
    if (type === "missing" || size === undefined) continue;
    const n = Number(size);
    out.set(oid!, buf.subarray(at, at + n).toString("utf8"));
    at += n + 1;
  }
  return out;
}

/** Whether a vault path is in a tree's files — a file, or a folder holding one — any case, as links resolve. */
function lookup(files: Map<string, string>): (rel: string) => boolean {
  const have = new Set<string>(["."]);
  for (const p of files.keys()) {
    const k = p.toLowerCase();
    have.add(k);
    for (let d = posix.dirname(k); d !== "."; d = posix.dirname(d)) have.add(d);
  }
  return (rel) => have.has(rel.toLowerCase());
}

/**
 * The vault path a link names from the note `from`: a relative path, or one from the filesystem's root
 * or `~/` that's inside the vault (20.2). Null for a URL, an anchor, or a path out of the vault —
 * whether those reach isn't the merge's to say.
 */
function named(target: string, from: string, root: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
  const hash = target.indexOf("#");
  let path = hash >= 0 ? target.slice(0, hash) : target;
  try {
    path = decodeURIComponent(path);
  } catch {}
  if (!path) return null;
  let rel: string;
  if (path.startsWith("/") || path.startsWith("~/")) {
    const r = relative(root, path.startsWith("~/") ? join(homeDir(), path.slice(2)) : path);
    if (r.startsWith("..") || posix.isAbsolute(r)) return null;
    rel = r.split(sep).join("/") || ".";
  } else rel = posix.normalize(posix.join(posix.dirname(from), path));
  return rel === ".." || rel.startsWith("../") ? null : rel.replace(/\/$/, "") || ".";
}

/** The target that reaches `to` from the note at `from`, the written one's fragment kept. */
function fixFor(from: string, to: string, written: string): string {
  const hash = written.indexOf("#");
  return urlPath(posix.relative(posix.dirname(from), to) || posix.basename(to)) + (hash >= 0 ? written.slice(hash) : "");
}

/**
 * What merging `from` into `into` (default: the branch checked out) would break (20.21): git's
 * tentative result, read without touching the working tree, its notes' links checked against its
 * files — those broken in it that weren't in `into`, each with its cause.
 */
export function reviewMerge(c: Checkout, root: string, from: string, into = "HEAD"): MergeReview {
  const ours = commitOf(c, into);
  if (!ours) throw new MergeReviewError(`no branch or commit ${into}`);
  const theirs = commitOf(c, from);
  if (!theirs) throw new MergeReviewError(`no branch or commit ${from}`);
  const intoName = into === "HEAD" ? (headOf(c).branch ?? ours.slice(0, 7)) : into;
  const mt = git(c, ["merge-tree", "--write-tree", "--name-only", "--no-messages", ours, theirs]);
  if (mt.status !== 0 && mt.status !== 1) throw new MergeReviewError(`git merge-tree: ${mt.err.trim().split("\n")[0] || "failed"} (it needs git 2.38 or newer)`);
  const [tree, ...conflicted] = mt.out.toString("utf8").split("\n").filter(Boolean);
  if (!tree) throw new MergeReviewError("git merge-tree wrote no tree");
  const base = git(c, ["merge-base", ours, theirs]).out.toString("utf8").trim() || null;

  const R = filesIn(c, root, tree);
  const O = filesIn(c, root, ours);
  const inR = lookup(R);
  const inO = lookup(O);
  // What each branch did since they parted, in the vault: its renames and deletions, by old path.
  const moved = new Map<string, { to: string; by: string }>();
  const deleted = new Map<string, string>();
  const notesMoved = new Map<string, { was: string; by: string }>();
  for (const [ref, by] of base ? ([[theirs, from], [ours, intoName]] as const) : []) {
    for (const f of changedBetween(c, base!, ref) ?? []) {
      const at = inVault(c, root, f.path);
      const was = f.from ? inVault(c, root, f.from) : null;
      // Gone from the vault: deleted, or moved out of it.
      const lost = f.state === "deleted" ? at : f.state === "renamed" && !at ? was : null;
      if (f.state === "renamed" && was && at) {
        if (!moved.has(was.toLowerCase())) moved.set(was.toLowerCase(), { to: at, by });
        if (!notesMoved.has(at)) notesMoved.set(at, { was, by });
      } else if (lost && !deleted.has(lost.toLowerCase())) deleted.set(lost.toLowerCase(), by);
    }
  }
  // The notes to read: the result's that `into` hasn't as they are; the rest only when the merge takes
  // a file away — a link of theirs may name it.
  const gone = [...O.keys()].some((p) => !inR(p));
  const placeInO = (p: string) => (O.has(p) ? p : (notesMoved.get(p)?.was ?? p));
  const notes = [...R].filter(([p, oid]) => NOTE.test(p) && (gone || O.get(placeInO(p)) !== oid));
  const texts = readBlobs(c, [...new Set(notes.flatMap(([p, oid]) => [oid, O.get(placeInO(p))].filter((x): x is string => !!x)))]);
  const linksOf = (rel: string, oid: string | undefined) => {
    const text = oid ? texts.get(oid) : undefined;
    if (text === undefined) return [];
    return extractText({ rel, abs: "", size: text.length, mtimeMs: 0 }, text).links.filter((l) => l.kind === "markdown" || l.kind === "image");
  };

  const breaks: MergeBreak[] = [];
  for (const [p, oid] of notes.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const was = placeInO(p);
    // The note's links in `into`, by target: each reaching, or not.
    const before = new Map<string, boolean>();
    for (const l of linksOf(was, O.get(was))) {
      const n = named(l.target, was, root);
      if (n !== null) before.set(l.target, inO(n));
    }
    for (const l of linksOf(p, oid)) {
      const names = named(l.target, p, root);
      if (names === null || inR(names) || before.get(l.target) === false) continue;
      const site = { path: p, line: l.line, column: l.column, target: l.target, names };
      // The note moved, its link written from where it was: what it named there, still in the result.
      const there = was !== p && before.get(l.target) ? named(l.target, was, root) : null;
      const m = moved.get(names.toLowerCase());
      if (there && inR(there)) breaks.push({ ...site, cause: "note-moved", by: notesMoved.get(p)?.by ?? from, to: there, fix: fixFor(p, there, l.target) });
      else if (m && inR(m.to)) breaks.push({ ...site, cause: "moved", by: m.by, to: m.to, fix: fixFor(p, m.to, l.target) });
      else if (deleted.has(names.toLowerCase()) || m) breaks.push({ ...site, cause: "deleted", by: deleted.get(names.toLowerCase()) ?? m!.by, to: null, fix: null });
      // Neither moved nor deleted, yet it reached in `into` or wasn't there: the merged branch's doing.
      else breaks.push({ ...site, cause: "missing", by: from, to: null, fix: null });
    }
  }
  return { into: intoName, from, base, tree, conflicts: conflicted, breaks };
}

/** A break said briefly: `refactor moves docs/plan.md to docs/new/plan.md — the fix: new/plan.md`. */
export function describeBreak(b: MergeBreak): string {
  switch (b.cause) {
    case "moved":
      return `${b.by} moves ${b.names} to ${b.to} — the fix: ${b.fix}`;
    case "deleted":
      return `${b.by} deletes ${b.names}`;
    case "note-moved":
      return `${b.by} moves this note; the link named ${b.to} — the fix: ${b.fix}`;
    default:
      return `${b.names} is on neither branch (${b.by}'s link)`;
  }
}
