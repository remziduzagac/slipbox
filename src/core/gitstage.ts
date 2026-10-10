// The working tree's git (plan 26.2): each changed file by what's staged and what isn't — from `git status`'s two
// letters — and what the source control view does with them: a file staged, unstaged or its changes discarded, all
// staged or unstaged, and one change staged or unstaged, as `git add -p` does — the index given the text with that one
// change applied (`hash-object`, `update-index`), so nothing else in it moves. Every command with `23.6`'s guards in a
// root not trusted (`gitArgs`). Paths are from the checkout's top folder.

import { execFile, execFileSync } from "node:child_process";
import { posix, sep } from "node:path";
import type { Checkout } from "./git.ts";
import { gitArgs, STATUS_ARGS } from "./gitops.ts";
import { isTrusted } from "./trust.ts";
import type { GitChange } from "./gitsigns.ts";

/** One file of `git status`: its path, its staged letter (`x`) and its working tree's (`y`), where it came from. */
export interface StatusEntry {
  path: string;
  x: string;
  y: string;
  from?: string;
}

/** git's porcelain status (v1, `-z`), entry by entry, both letters kept. */
export function parseEntries(z: string): StatusEntry[] {
  const out: StatusEntry[] = [];
  const parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4) continue;
    const entry: StatusEntry = { path: e.slice(3), x: e[0]!, y: e[1]! };
    // A rename or copy names where it came from next.
    if (entry.x === "R" || entry.x === "C") entry.from = parts[++i];
    out.push(entry);
  }
  return out;
}

/** The checkout's status, entry by entry, not waiting on git; null without git. */
export function entriesLater(c: Pick<Checkout, "root">): Promise<StatusEntry[] | null> {
  return new Promise((done) => {
    execFile("git", gitArgs(c.root, STATUS_ARGS), { encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024 * 1024 }, (err, out) => done(err ? null : parseEntries(out)));
  });
}

/** Whether an entry is a merge's conflict. */
export const conflicted = (e: StatusEntry) => /^(DD|AU|UD|UA|DU|AA|UU)$/.test(e.x + e.y);

/** The view's sections, each file in the ones it's in: in conflict; staged; changed, not staged; untracked. */
export function sections(entries: StatusEntry[]): { conflicted: StatusEntry[]; staged: StatusEntry[]; unstaged: StatusEntry[]; untracked: StatusEntry[] } {
  const by = (a: StatusEntry, b: StatusEntry) => a.path.localeCompare(b.path);
  const conflicts = entries.filter(conflicted);
  const rest = entries.filter((e) => !conflicted(e));
  return {
    conflicted: conflicts.sort(by),
    staged: rest.filter((e) => e.x !== " " && e.x !== "?").sort(by),
    unstaged: rest.filter((e) => e.y !== " " && e.y !== "?").sort(by),
    untracked: rest.filter((e) => e.x === "?").sort(by),
  };
}

const OPTS = { encoding: "utf8" as const, stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"], timeout: 15_000, maxBuffer: 64 * 1024 * 1024 };

/** A git command run in the checkout: its output, or why it failed (its own words). */
function git(c: Pick<Checkout, "root">, args: string[], input?: string): { ok: true; out: string } | { ok: false; why: string } {
  try {
    return { ok: true, out: execFileSync("git", gitArgs(c.root, args), { ...OPTS, input }) };
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return { ok: false, why: (e.stderr || e.message).trim().split("\n")[0] ?? "git failed" };
  }
}

const posixPath = (p: string) => p.split(sep).join(posix.sep);

/** What an operation says when it fails: why, in git's words; null when it went. */
export type GitDone = string | null;
const done = (r: ReturnType<typeof git>): GitDone => (r.ok ? null : r.why);

/** A file's changes staged — a deletion's too. */
export function stageFile(c: Pick<Checkout, "root">, path: string): GitDone {
  return done(git(c, ["add", "-A", "--", posixPath(path)]));
}

/** A file unstaged: the index back to the last commit's (with none yet, the file out of the index). */
export function unstageFile(c: Pick<Checkout, "root">, path: string): GitDone {
  const r = git(c, ["restore", "--staged", "--", posixPath(path)]);
  return r.ok ? null : done(git(c, ["rm", "--cached", "-q", "--", posixPath(path)]));
}

/** A file's changes not staged, discarded: the working tree back to the index's. */
export function discardFile(c: Pick<Checkout, "root">, path: string): GitDone {
  return done(git(c, ["restore", "--worktree", "--", posixPath(path)]));
}

/** Every change staged; every one unstaged. */
export function stageAll(c: Pick<Checkout, "root">): GitDone {
  return done(git(c, ["add", "-A"]));
}
export function unstageAll(c: Pick<Checkout, "root">): GitDone {
  const r = git(c, ["reset", "-q"]);
  return r.ok ? null : done(git(c, ["rm", "-r", "--cached", "-q", "."]));
}

/** Another branch checked out (26.5): git's own refusal — a change it would overwrite — said in its words. */
export function switchBranch(c: Pick<Checkout, "root">, name: string): GitDone {
  return done(git(c, ["switch", "--", name]));
}

/** A new branch made from where HEAD is, and checked out; a name git won't take, said why. */
export function createBranch(c: Pick<Checkout, "root">, name: string): GitDone {
  const valid = git(c, ["check-ref-format", "--branch", name]);
  if (!valid.ok) return `"${name}" isn't a name git takes for a branch`;
  return done(git(c, ["switch", "-c", name]));
}

/** A commit message as git keeps it: its `#` lines and the blank lines around it gone; "" when nothing's left. */
export function cleanMessage(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * A commit of what's staged (26.3), or the last one amended, with `message` (its `#` lines left out). In a root not
 * trusted its hooks don't run (`gitArgs`) and it isn't signed: the repository's own config could name the program that
 * signs. Not waiting on git — a hook can take a while. Its short hash and subject, or why it failed.
 */
export function commitLater(c: Pick<Checkout, "root">, message: string, amend: boolean): Promise<{ hash: string; subject: string } | { why: string }> {
  const body = cleanMessage(message);
  if (!body) return Promise.resolve({ why: "the message is empty: nothing committed" });
  const unsigned = isTrusted(c.root) ? [] : ["-c", "commit.gpgSign=false"];
  const args = [...unsigned, ...gitArgs(c.root, ["commit", "-F", "-", "--cleanup=verbatim", ...(amend ? ["--amend"] : [])])];
  return new Promise((done) => {
    const child = execFile("git", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) return done({ why: (stderr || err.message).trim().split("\n")[0] ?? "git commit failed" });
      const r = git(c, ["log", "-1", "--format=%h%x00%s"]);
      const [hash = "", subject = ""] = r.ok ? r.out.trim().split("\0") : [];
      done({ hash, subject });
    });
    // A hook that refuses at once: git gone before it reads the message — not an error of ours.
    child.stdin?.on("error", () => {});
    child.stdin?.end(`${body}\n`);
  });
}

/** The last commit's message, for an amend to start from; null without one. */
export function lastMessage(c: Pick<Checkout, "root">): string | null {
  const r = git(c, ["log", "-1", "--format=%B"]);
  return r.ok ? r.out.replace(/\s+$/, "") : null;
}

/** `text` with one change made: lines `[at, at + count)` replaced by `put` — the line breaks and the final one its own. */
export function replaceLines(text: string, at: number, count: number, put: string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  // An empty text has no line; lines put in it end as a file's do.
  const final = !text || text.endsWith("\n");
  const lines = text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : [];
  lines.splice(at, count, ...put);
  return lines.length ? lines.join(eol) + (final ? eol : "") : "";
}

/** The index's entry for a file: its mode (`100644`, `100755`), else a new file's. */
function modeOf(c: Pick<Checkout, "root">, path: string): string {
  const r = git(c, ["ls-files", "-s", "--", posixPath(path)]);
  return (r.ok && /^(\d{6}) /.exec(r.out)?.[1]) || "100644";
}

/** The index given `text` for a file — as written (read from stdin, `hash-object` runs no filter) — its mode kept. */
export function writeIndex(c: Pick<Checkout, "root">, path: string, text: string): GitDone {
  const mode = modeOf(c, path);
  const blob = git(c, ["hash-object", "-w", "--stdin"], text);
  if (!blob.ok) return blob.why;
  return done(git(c, ["update-index", "--add", "--cacheinfo", `${mode},${blob.out.trim()},${posixPath(path)}`]));
}

/**
 * One change staged: `change` is between what's staged (`staged`) and the working tree — the index given the staged text
 * with that change's lines as they are now. A file not staged before is staged whole (`git add`).
 */
export function stageChange(c: Pick<Checkout, "root">, path: string, staged: string, change: GitChange): GitDone {
  return writeIndex(c, path, replaceLines(staged, change.wasAt, change.was.length, change.now));
}

/** One change unstaged: `change` is between the last commit (`head`) and what's staged — its lines in the index put back. */
export function unstageChange(c: Pick<Checkout, "root">, path: string, staged: string, change: GitChange): GitDone {
  return writeIndex(c, path, replaceLines(staged, change.from - 1, change.now.length, change.was));
}
