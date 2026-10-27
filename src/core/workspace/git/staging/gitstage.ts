// The working tree's git (plan 26.2): each changed file by what's staged and what isn't — from `git status`'s two
// letters — and what the source control view does with them: a file staged, unstaged or its changes discarded, all
// staged or unstaged, and one change staged or unstaged, as `git add -p` does — the index given the text with that one
// change applied (`hash-object`, `update-index`), so nothing else in it moves. Every command with `23.6`'s guards in a
// root not trusted (`gitArgs`). Paths are from the checkout's top folder, and git takes each as that file, literally
// (`literalArgs`): never a pattern that names others.

import { execFile, execFileSync } from "node:child_process";
import { posix, sep } from "node:path";
import type { Checkout } from "../git.ts";
import { gitArgs, literalArgs, literalEnv, STATUS_ARGS } from "../branches/gitops.ts";
import { parseTrack, type Track } from "../branches/gitremote.ts";
import { isTrusted } from "../../vaults/trust.ts";
import type { GitChange } from "../gitsigns.ts";

/** One file of `git status`: its path, its staged letter (`x`) and its working tree's (`y`), where it came from. */
export interface StatusEntry {
  path: string;
  x: string;
  y: string;
  from?: string;
}

/** git's porcelain status (v1, `-z`), entry by entry, both letters kept; the branch's line (`--branch`) left out. */
export function parseEntries(z: string): StatusEntry[] {
  const out: StatusEntry[] = [];
  const parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4 || e.startsWith("## ")) continue;
    const entry: StatusEntry = { path: e.slice(3), x: e[0]!, y: e[1]! };
    // A rename or copy names where it came from next.
    if (entry.x === "R" || entry.x === "C") entry.from = parts[++i];
    out.push(entry);
  }
  return out;
}

/**
 * The checkout's status, entry by entry, and where its branch stands against its upstream (26.6, as of the last
 * fetch), not waiting on git; null without git.
 */
export function statusLater(
  c: Pick<Checkout, "root">,
): Promise<{ entries: StatusEntry[]; track: Track | null } | null> {
  return new Promise((done) => {
    execFile(
      "git",
      gitArgs(c.root, [...STATUS_ARGS, "--branch"]),
      { encoding: "utf8", timeout: 15_000, maxBuffer: 64 * 1024 * 1024 },
      (err, out) => done(err ? null : { entries: parseEntries(out), track: parseTrack(out) }),
    );
  });
}

/** Whether an entry is a merge's conflict. */
export const conflicted = (e: StatusEntry) => /^(DD|AU|UD|UA|DU|AA|UU)$/.test(e.x + e.y);

/** The view's sections, each file in the ones it's in: in conflict; staged; changed, not staged; untracked. */
export function sections(entries: StatusEntry[]): {
  conflicted: StatusEntry[];
  staged: StatusEntry[];
  unstaged: StatusEntry[];
  untracked: StatusEntry[];
} {
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

const OPTS = {
  encoding: "utf8" as const,
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
  timeout: 15_000,
  maxBuffer: 64 * 1024 * 1024,
};

/**
 * A git command run in the checkout: its output, or why it failed (its own words). One given files' paths (`literal`)
 * takes each as that file, never a pattern.
 */
function git(
  c: Pick<Checkout, "root">,
  args: string[],
  input?: string,
  literal = false,
): { ok: true; out: string } | { ok: false; why: string } {
  try {
    const out = literal
      ? execFileSync("git", literalArgs(c.root, args), { ...OPTS, input, env: literalEnv() })
      : execFileSync("git", gitArgs(c.root, args), { ...OPTS, input });
    return { ok: true, out };
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return { ok: false, why: (e.stderr || e.message).trim().split("\n")[0] ?? "git failed" };
  }
}

const posixPath = (p: string) => p.split(sep).join(posix.sep);

/** Files' paths for git to read from its input, one after another, each ended by a NUL (`listed`). */
const PATHS = ["--pathspec-from-file=-", "--pathspec-file-nul"];
const listed = (paths: string[]) => paths.map((p) => `${posixPath(p)}\0`).join("");

/** What an operation says when it fails: why, in git's words; null when it went. */
export type GitDone = string | null;
const done = (r: ReturnType<typeof git>): GitDone => (r.ok ? null : r.why);

/** A file's changes staged — a deletion's too. */
export function stageFile(c: Pick<Checkout, "root">, path: string): GitDone {
  return stageFiles(c, [path]);
}

/** Files' changes staged, in one git call: a section's, all at once (GIT-D8). */
export function stageFiles(c: Pick<Checkout, "root">, paths: string[]): GitDone {
  return paths.length ? done(git(c, ["add", "-A", ...PATHS], listed(paths), true)) : null;
}

/**
 * A file unstaged: the index back to the last commit's (with none yet, the file out of the index). A rename (`from`,
 * where it came from) is unstaged whole: its old path back in the index, its new one out.
 */
export function unstageFile(c: Pick<Checkout, "root">, path: string, from?: string): GitDone {
  return unstageFiles(c, from ? [path, from] : [path]);
}

/** Files unstaged, in one git call: the index's entries for them back to the last commit's. */
export function unstageFiles(c: Pick<Checkout, "root">, paths: string[]): GitDone {
  if (!paths.length) return null;
  const r = git(c, ["restore", "--staged", ...PATHS], listed(paths), true);
  if (r.ok) return null;
  // No commit yet: nothing to go back to, so the files leave the index.
  if (git(c, ["rev-parse", "--verify", "--quiet", "HEAD"]).ok) return r.why;
  return done(git(c, ["rm", "--cached", "-q", ...PATHS], listed(paths), true));
}

/** A file's changes not staged, discarded: the working tree back to the index's. */
export function discardFile(c: Pick<Checkout, "root">, path: string): GitDone {
  return discardFiles(c, [path]);
}

/** Files' changes not staged, discarded, in one git call. */
export function discardFiles(c: Pick<Checkout, "root">, paths: string[]): GitDone {
  return paths.length ? done(git(c, ["restore", "--worktree", ...PATHS], listed(paths), true)) : null;
}

/** Every change staged. */
export function stageAll(c: Pick<Checkout, "root">): GitDone {
  return done(git(c, ["add", "-A"]));
}

/**
 * Every change unstaged: what's staged, file by file (in one call) — never `git reset`, which would end a merge under
 * way. A file in conflict stays one, and the next commit is still the merge's.
 */
export function unstageAll(c: Pick<Checkout, "root">): GitDone {
  const r = git(c, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]);
  if (!r.ok) return r.why;
  const staged = sections(parseEntries(r.out)).staged;
  return unstageFiles(
    c,
    staged.flatMap((e) => (e.from ? [e.path, e.from] : [e.path])),
  );
}

/**
 * A new branch made from where HEAD is, and checked out — no file changes, so it's waited for (another branch checked
 * out, which changes files, is `switchLater`'s); a name git won't take, said why.
 */
export function createBranch(c: Pick<Checkout, "root">, name: string): GitDone {
  const valid = git(c, ["check-ref-format", "--branch", name]);
  if (!valid.ok) return `"${name}" isn't a name git takes for a branch`;
  return done(git(c, ["switch", "-c", name]));
}

/**
 * A commit message as git keeps it: its comment lines (those starting with `comment`, `#` unless said; none when null)
 * and the blank lines around it gone; "" when nothing's left.
 */
export function cleanMessage(text: string, comment: string | null = "#"): string {
  return text
    .split(/\r?\n/)
    .filter((l) => comment === null || !l.startsWith(comment))
    .join("\n")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * What the commit editor's guide lines start with, as git's `core.commentChar = auto` picks it: `#`, unless a line of
 * the message starts with one (`#12 fixed`, a Markdown heading) — then the first of git's others that none does.
 */
export function commentFor(message: string): string {
  const lines = message.split(/\r?\n/);
  return [..."#;@!$%^&|:"].find((ch) => !lines.some((l) => l.startsWith(ch))) ?? "#";
}

/**
 * A commit of what's staged (26.3), or the last one amended, with `message` — its comment lines left out, those
 * starting with `comment` (the editor's guide), none when null (the message box's text, as typed). In a root not
 * trusted its hooks don't run (`gitArgs`) and it isn't signed: the repository's own config could name the program that
 * signs. Not waiting on git — a hook can take a while. Its short hash and subject, or why it failed.
 */
export function commitLater(
  c: Pick<Checkout, "root">,
  message: string,
  amend: boolean,
  comment: string | null = "#",
): Promise<{ hash: string; subject: string } | { why: string }> {
  const body = cleanMessage(message, comment);
  if (!body) return Promise.resolve({ why: "the message is empty: nothing committed" });
  const unsigned = isTrusted(c.root) ? [] : ["-c", "commit.gpgSign=false"];
  const args = [
    ...unsigned,
    ...gitArgs(c.root, ["commit", "-F", "-", "--cleanup=verbatim", ...(amend ? ["--amend"] : [])]),
  ];
  return new Promise((done) => {
    const child = execFile(
      "git",
      args,
      { encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (err, _out, stderr) => {
        if (err) return done({ why: (stderr || err.message).trim().split("\n")[0] ?? "git commit failed" });
        const r = git(c, ["log", "-1", "--format=%h%x00%s"]);
        const [hash = "", subject = ""] = r.ok ? r.out.trim().split("\0") : [];
        done({ hash, subject });
      },
    );
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

/**
 * `text` with one change made: lines `[at, at + count)` replaced by `put` — the line breaks, the final one and a byte
 * order mark its own (a change's lines never carry the mark: `gitChanges`).
 */
export function replaceLines(raw: string, at: number, count: number, put: string[]): string {
  const bom = raw.charCodeAt(0) === 0xfeff ? "\uFEFF" : "";
  const text = raw.slice(bom.length);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  // An empty text has no line; lines put in it end as a file's do.
  const final = !text || text.endsWith("\n");
  const lines = text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : [];
  lines.splice(at, count, ...put);
  return bom + (lines.length ? lines.join(eol) + (final ? eol : "") : "");
}

/** The index's entry for a file: its mode (`100644`, `100755`), else a new file's. */
function modeOf(c: Pick<Checkout, "root">, path: string): string {
  const r = git(c, ["ls-files", "-s", "--", posixPath(path)], undefined, true);
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
