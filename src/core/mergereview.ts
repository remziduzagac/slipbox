// The merge review (plan 20.21; blueprint/design/links.md § The merge review): before a merge, git's
// own tentative result — `git merge-tree`, the working tree untouched — checked for the links it would
// break. Git can't see this itself: "refactor moves docs/plan.md; main added a link to it in docs/b.md"
// changes different files, so it merges cleanly. Each link broken in the result that wasn't broken in
// the branch merged into is said with its cause — the file moved (where to, and the fix), was deleted,
// isn't on either branch, or the note itself moved — and whose change it was. Every written form: a
// markdown link's path, a wikilink's path or name (21.3), a link to this repository's hosting (D87), a
// pointer naming this folder (21.7). Committed work only: what isn't committed is in neither branch.

import { spawnSync } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { urlPath } from "./convert.ts";
import { folderIdentity, lookupFolder, type NamedFolder, readFolders } from "./folders.ts";
import { type Checkout, headOf } from "./git.ts";
import { branchesOf, changedBetween, gitArgs, inCheckout, inVault } from "./gitops.ts";
import { inEnglish } from "./gitremote.ts";
import { extractText } from "./graph.ts";
import { checkoutRemotes, parseHosted, splitRef, withHostedPath } from "./hosting.ts";
import { extensionless, homeDir, wikiPathCandidates } from "./links.ts";
import { formatPointer, isPointer, type Pointer, parsePointer } from "./pointer.ts";

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
  /** Their merge base; null only if git can't name one (histories with none in common are refused before). */
  base: string | null;
  /** The result's tree, as git wrote it — nothing checked out. */
  tree: string;
  /** Files git couldn't merge (from the checkout's top folder): conflict markers in the result. */
  conflicts: string[];
  breaks: MergeBreak[];
}

export class MergeReviewError extends Error {}

const NOTE = /\.(md|markdown)$/i;

function git(
  c: Pick<Checkout, "root">,
  args: string[],
  input?: string,
): { status: number | null; out: Buffer; err: string } {
  // git's words in English: its refusals are matched (histories unrelated, a git too old).
  const r = spawnSync("git", gitArgs(c.root, args), {
    input,
    maxBuffer: 512 * 1024 * 1024,
    timeout: 120_000,
    env: inEnglish(process.env),
  });
  return {
    status: r.error ? null : r.status,
    out: r.stdout ?? Buffer.alloc(0),
    err: r.stderr?.toString("utf8") ?? String(r.error ?? ""),
  };
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

/** What a link names besides a path: this repository's hosting (D87), a pointer naming this folder (21.7). */
interface Reading {
  c: Checkout;
  root: string;
  /** This checkout's remotes: a hosting URL naming one is the file in this copy. */
  remotes: string[];
  folders: NamedFolder[];
  /** This root's key as a named folder (21.6): a pointer naming it is a path from the root. */
  self: string | null;
  /** The repository's branches, read once when asked (a ref with a `/`). */
  branches: () => string[];
  /** Whether `into` has a vault path. */
  inO: (rel: string) => boolean;
}

/**
 * A link to this repository's hosting naming a path in it (D87): its vault path, and its path from the
 * repository's top as the URL has it — a branch with a `/` told by the repository's branches when the
 * path as first split isn't in `into`, as the graph does. Null for another repository's, a repository's
 * own page (no path a merge moves), or a path out of the vault.
 */
function hostedNamed(target: string, r: Reading): { rel: string; path: string } | null {
  if (!/^https?:\/\//i.test(target)) return null;
  const h = parseHosted(target);
  if (!h?.ref || !h.path || !r.remotes.includes(h.remote.toLowerCase())) return null;
  let path = h.path;
  const first = inVault(r.c, r.root, path);
  if (!first || reaches(first, r.inO) === null) path = splitRef(h.ref, path, r.branches).path;
  const rel = inVault(r.c, r.root, path);
  return rel ? { rel, path } : null;
}

/** A pointer naming this folder, at no branch (21.7): its path from the root, a vault path. Null for another folder's, or one at a branch. */
function pointerNamed(target: string, r: Reading): { rel: string; pointer: Pointer } | null {
  if (!r.self || !isPointer(target)) return null;
  const p = parsePointer(target, r.folders);
  if (!p || p.branch || !p.path) return null;
  const l = lookupFolder(p.name, r.folders);
  if ((l.status !== "found" && l.status !== "unavailable") || l.folder.key !== r.self) return null;
  const rel = posix.normalize(p.path).replace(/\/$/, "");
  return rel === "." || rel === ".." || rel.startsWith("../") ? null : { rel, pointer: p };
}

/**
 * The vault path a link names from the note `from`: a relative path, one from the root (`/…`, 21.2),
 * `~/` that's inside the vault, a link to this repository's hosting or a pointer naming this folder.
 * Null for another URL, an anchor, or a path out of the vault — whether those reach isn't the merge's
 * to say. Written without an extension, it's that path: `reaches` reads it.
 */
function named(target: string, from: string, r: Reading): string | null {
  const root = r.root;
  const other = hostedNamed(target, r) ?? pointerNamed(target, r);
  if (other) return other.rel;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
  const hash = target.indexOf("#");
  let path = hash >= 0 ? target.slice(0, hash) : target;
  try {
    path = decodeURIComponent(path);
  } catch {}
  if (!path) return null;
  let rel: string;
  // `/…` from the root; one already under the root's own path is the filesystem's reading of it (the
  // root holds nothing at `<root>/<root>/…`).
  if (path.startsWith("~/") || path.startsWith(`${root}/`)) {
    const r = relative(root, path.startsWith("~/") ? join(homeDir(), path.slice(2)) : path);
    if (r.startsWith("..") || posix.isAbsolute(r)) return null;
    rel = r.split(sep).join("/") || ".";
  } else if (path.startsWith("/")) rel = posix.normalize(path.slice(1) || ".");
  else rel = posix.normalize(posix.join(posix.dirname(from), path));
  return rel === ".." || rel.startsWith("../") ? null : rel.replace(/\/$/, "") || ".";
}

/** A path the tree has, written as it is or without its note's extension (21.2): the path it has, or null. */
function reaches(n: string, has: (rel: string) => boolean): string | null {
  if (has(n)) return n;
  if (!extensionless(n)) return null;
  return [`${n}.md`, `${n}.markdown`].find(has) ?? null;
}

/**
 * The vault path a wikilink written as a path names (21.3): from the root (`[[docs/plan]]`, a leading
 * `/` dropped), or from the note (`[[../plan]]`). Null for a name alone, a pointer, or a path out of
 * the vault. Without an extension it's the note: `wikiReaches` reads it.
 */
function wikiNamed(target: string, from: string): string | null {
  const t = target.trim();
  if (!t.includes("/") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("~/")) return null;
  const rel = /^\.\.?\//.test(t)
    ? posix.normalize(posix.join(posix.dirname(from), t))
    : posix.normalize(t.replace(/^\/+/, ""));
  return rel === ".." || rel.startsWith("../") ? null : rel;
}

/** The path a wikilink's path reaches in a tree: the file as written, else its note. */
function wikiReaches(n: string, has: (rel: string) => boolean): string | null {
  return wikiPathCandidates(n).find(has) ?? null;
}

/** A tree's files by the names a wikilink reaches them by (21.3), any case: a note's with and without its extension, a file's. */
function byName(files: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of files.keys()) {
    const b = posix.basename(p).toLowerCase();
    for (const k of NOTE.test(b) ? [b, b.replace(NOTE, "")] : [b]) out.set(k, [...(out.get(k) ?? []), p]);
  }
  return out;
}

/** A wikilink's target that reaches `to` from the note at `from`, in its form: a name a name, a path
 *  from the root or relative as written; `.md` only where it was written; never encoded. */
function wikiFix(from: string, to: string, written: string): string {
  const t = written.trim();
  let next = !t.includes("/")
    ? posix.basename(to)
    : /^\.\.?\//.test(t)
      ? posix.relative(posix.dirname(from), to)
      : `${t.startsWith("/") ? "/" : ""}${to}`;
  if (/^\.\.?\//.test(t) && !next.startsWith("../")) next = `./${next}`;
  return NOTE.test(t) ? next : next.replace(NOTE, "");
}

/** The target that reaches `to` from the note at `from`, in the written one's form (21.2: from the
 *  root, without the extension; a hosting URL with its new path, a pointer by its name) and with its
 *  fragment. */
function fixFor(from: string, to: string, written: string, r: Reading): string {
  const root = r.root;
  const hosted = hostedNamed(written, r);
  if (hosted) return withHostedPath(written, hosted.path, inCheckout(r.c, root, to));
  const hash = written.indexOf("#");
  const path = hash >= 0 ? written.slice(0, hash) : written;
  const pointer = pointerNamed(written, r);
  if (pointer) {
    // Its name as written, the path from the root to where the file is: without an extension, a
    // folder's `/`, encoded, each as written (as a rename writes one).
    let rel = extensionless(pointer.pointer.path) ? to.replace(NOTE, "") : to;
    if (pointer.pointer.path.endsWith("/")) rel += "/";
    const encode = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(rel);
    return (
      formatPointer(
        { name: pointer.pointer.name, branch: null, path: rel, fragment: null },
        encode ? encodeURI : undefined,
      ) + (hash >= 0 ? written.slice(hash) : "")
    );
  }
  let next = path.startsWith(`${root}/`)
    ? `${root}/${to}`
    : path.startsWith("/")
      ? `/${to}`
      : posix.relative(posix.dirname(from), to) || posix.basename(to);
  if (extensionless(path)) next = next.replace(/\.(md|markdown)$/i, "");
  return urlPath(next) + (hash >= 0 ? written.slice(hash) : "");
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
  if (mt.status !== 0 && mt.status !== 1) {
    const err = mt.err.trim();
    // Histories with nothing in common: git won't merge them, nor review the merge.
    if (/unrelated histories/i.test(err))
      throw new MergeReviewError(`${from} and ${intoName} have no commit in common: git won't merge them`);
    // An older git: no --write-tree.
    const old = /unknown option|usage:/i.test(err) ? " (it needs git 2.38 or newer)" : "";
    throw new MergeReviewError(`git merge-tree: ${err.split("\n")[0] || "failed"}${old}`);
  }
  const [tree, ...conflicted] = mt.out.toString("utf8").split("\n").filter(Boolean);
  if (!tree) throw new MergeReviewError("git merge-tree wrote no tree");
  const base = git(c, ["merge-base", ours, theirs]).out.toString("utf8").trim() || null;

  const R = filesIn(c, root, tree);
  const O = filesIn(c, root, ours);
  const inR = lookup(R);
  const inO = lookup(O);
  // Links to this repository's hosting, and pointers naming this folder, name its paths too.
  let branches: string[] | null = null;
  const reading: Reading = {
    c,
    root,
    remotes: checkoutRemotes(c),
    folders: readFolders(),
    self: folderIdentity(root)?.key ?? null,
    branches: () => (branches ??= branchesOf(c) ?? []),
    inO,
  };
  // What each branch did since they parted, in the vault: its renames and deletions, by old path.
  const moved = new Map<string, { to: string; by: string }>();
  const deleted = new Map<string, string>();
  const notesMoved = new Map<string, { was: string; by: string }>();
  for (const [ref, by] of base
    ? ([
        [theirs, from],
        [ours, intoName],
      ] as const)
    : []) {
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
  const texts = readBlobs(c, [
    ...new Set(notes.flatMap(([p, oid]) => [oid, O.get(placeInO(p))].filter((x): x is string => !!x))),
  ]);
  const linksOf = (rel: string, oid: string | undefined) => {
    const text = oid ? texts.get(oid) : undefined;
    if (text === undefined) return [];
    return extractText({ rel, abs: "", size: text.length, mtimeMs: 0 }, text).links.filter(
      (l) => l.kind === "markdown" || l.kind === "image" || l.kind === "wiki" || l.kind === "embed",
    );
  };
  const namesR = byName(R);
  const namesO = byName(O);
  const isWiki = (l: { kind: string }) => l.kind === "wiki" || l.kind === "embed";
  /** A link's key, so a wikilink and a markdown link written alike are told apart. */
  const keyOf = (l: { kind: string; target: string }) => `${isWiki(l) ? "w" : "m"}:${l.target}`;

  // A wikilink (21.3): by its path, as a markdown link's is checked; by a name alone, broken when no
  // file of the result answers to it, where one in `into` did — renamed or deleted by a branch.
  const wikiBreak = (
    p: string,
    was: string,
    l: { kind: string; target: string; line: number; column: number },
    before: Map<string, boolean>,
  ): MergeBreak | null => {
    const k = keyOf(l);
    const t = l.target.trim();
    const written = wikiNamed(t, p);
    if (written === null) {
      if (!t || t.includes(":") || t.includes("/") || namesR.has(t.toLowerCase()) || before.get(k) === false)
        return null;
      const had = namesO.get(t.toLowerCase());
      const names = had?.[0] ?? t;
      const site = { path: p, line: l.line, column: l.column, target: l.target, names };
      const m = had?.map((h) => moved.get(h.toLowerCase())).find((x) => x && inR(x.to));
      if (m) return { ...site, cause: "moved", by: m.by, to: m.to, fix: wikiFix(p, m.to, l.target) };
      const del = had?.map((h) => deleted.get(h.toLowerCase())).find((x) => x);
      if (del) return { ...site, cause: "deleted", by: del, to: null, fix: null };
      return { ...site, cause: "missing", by: from, to: null, fix: null };
    }
    if (wikiReaches(written, inR) !== null || before.get(k) === false) return null;
    const names = wikiReaches(written, inO) ?? (NOTE.test(written) ? written : `${written}.md`);
    const site = { path: p, line: l.line, column: l.column, target: l.target, names };
    const wasNamed = was !== p && before.get(k) ? wikiNamed(t, was) : null;
    const there = wasNamed === null ? null : (wikiReaches(wasNamed, inO) ?? wasNamed);
    const m = moved.get(names.toLowerCase());
    if (there && inR(there))
      return {
        ...site,
        cause: "note-moved",
        by: notesMoved.get(p)?.by ?? from,
        to: there,
        fix: wikiFix(p, there, l.target),
      };
    if (m && inR(m.to)) return { ...site, cause: "moved", by: m.by, to: m.to, fix: wikiFix(p, m.to, l.target) };
    if (deleted.has(names.toLowerCase()) || m)
      return { ...site, cause: "deleted", by: deleted.get(names.toLowerCase()) ?? m!.by, to: null, fix: null };
    return { ...site, cause: "missing", by: from, to: null, fix: null };
  };
  const breaks: MergeBreak[] = [];
  for (const [p, oid] of notes.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const was = placeInO(p);
    // The note's links in `into`, by target: each reaching, or not.
    const before = new Map<string, boolean>();
    for (const l of linksOf(was, O.get(was))) {
      if (isWiki(l)) {
        const n = wikiNamed(l.target, was);
        if (n !== null) before.set(keyOf(l), wikiReaches(n, inO) !== null);
        else if (l.target.trim() && !l.target.includes(":"))
          before.set(keyOf(l), namesO.has(l.target.trim().toLowerCase()));
        continue;
      }
      const n = named(l.target, was, reading);
      if (n !== null) before.set(keyOf(l), reaches(n, inO) !== null);
    }
    for (const l of linksOf(p, oid)) {
      if (isWiki(l)) {
        const b = wikiBreak(p, was, l, before);
        if (b) breaks.push(b);
        continue;
      }
      const written = named(l.target, p, reading);
      if (written === null || reaches(written, inR) !== null || before.get(keyOf(l)) === false) continue;
      // Its path as the base had it (a note without its extension, the note): what moved or went.
      const names = reaches(written, inO) ?? written;
      const site = { path: p, line: l.line, column: l.column, target: l.target, names };
      // The note moved, its link written from where it was: what it named there, still in the result.
      const wasNamed = was !== p && before.get(keyOf(l)) ? named(l.target, was, reading) : null;
      const there = wasNamed === null ? null : (reaches(wasNamed, inO) ?? wasNamed);
      const m = moved.get(names.toLowerCase());
      if (there && inR(there))
        breaks.push({
          ...site,
          cause: "note-moved",
          by: notesMoved.get(p)?.by ?? from,
          to: there,
          fix: fixFor(p, there, l.target, reading),
        });
      else if (m && inR(m.to))
        breaks.push({ ...site, cause: "moved", by: m.by, to: m.to, fix: fixFor(p, m.to, l.target, reading) });
      else if (deleted.has(names.toLowerCase()) || m)
        breaks.push({ ...site, cause: "deleted", by: deleted.get(names.toLowerCase()) ?? m!.by, to: null, fix: null });
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
