// The repository's branches, for the git panel (GIT-D9): each with where it's checked out — here, in a worktree, or
// nowhere — when it was last touched, and, asked for the rows shown, how far it is ahead of its base and behind it,
// whether it's merged into it, and a worktree's uncommitted files. Ordered as the panel lists them: this branch, those
// in a worktree, those touched lately; then, folded, the merged and those untouched for a month. And what the panel
// does with them: a branch made where it should start, a worktree made for it — in the folder `[git] worktrees` names
// (GIT-D13) — a merged one's worktree removed, a gone one's pruned, a branch merged. Every git command with
// `gitArgs`'s guards (in a vault not trusted, no hook runs); nothing waits on git but what changes the repository.

import { execFile, execFileSync } from "node:child_process";
import { type Dirent, realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Checkout } from "./git.ts";
import {
  type Changed,
  gitArgs,
  gitReadLater,
  parseNameStatus,
  type WorktreeRecord,
  worktreeRecords,
  worktreeRecordsLater,
} from "./gitops.ts";
import { failureOf, inEnglish, stopOf } from "./gitremote.ts";
import { isTrusted } from "./workspace/vaults/trust.ts";
import { isBusyName } from "./workspace/walk/walk.ts";

const OPTS = { encoding: "utf8" as const, timeout: 15_000, maxBuffer: 64 * 1024 * 1024 };

/** git in `root`, not waited on: its output, or null when it failed. */
export function gitLater(root: string, args: string[]): Promise<string | null> {
  return gitReadLater({ root }, args);
}

/** git's words for a failure: its `fatal:` or `error:` line, else its first. */
function why(stderr: string): string {
  const lines = stderr.trim().split("\n");
  return (lines.find((l) => /^(fatal|error):/.test(l)) ?? lines[0] ?? "git failed").replace(/^(fatal|error): /, "");
}

/** git in `root`, waited on: its output, or why it failed in git's words. */
export function gitNow(root: string, args: string[]): { ok: true; out: string } | { ok: false; why: string } {
  try {
    return { ok: true, out: execFileSync("git", gitArgs(root, args), { ...OPTS, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    return { ok: false, why: why(e.stderr || e.message) };
  }
}

/** A checkout of the repository, as `git worktree list` says it. */
export interface WorktreeAt {
  path: string;
  /** The main checkout (the first git lists). */
  main: boolean;
  /** Its folder is gone: git would prune it. */
  gone: boolean;
}

/** One local branch. */
export interface Branch {
  name: string;
  /** Its tip. */
  tip: string;
  /** When its last commit was made, in ms. */
  date: number;
  /** Where it's checked out: a worktree's (or the main checkout's) folder; null when nowhere. */
  worktree: WorktreeAt | null;
  /** Checked out in the checkout asked from. */
  here: boolean;
}

/**
 * `git worktree list --porcelain -z`, read: each checkout's folder and branch, the main one first, a gone one marked.
 * A folder's name may hold a line break: each field ends with a NUL, each checkout with another.
 */
export function parseWorktrees(z: string): (WorktreeAt & { branch: string | null })[] {
  return worktreesOf(worktreeRecords(z));
}

/** Git's checkouts, as the branches have them: the main one first, a gone one marked, a bare repository left out. */
function worktreesOf(records: WorktreeRecord[]): (WorktreeAt & { branch: string | null })[] {
  return records.flatMap((r, i) =>
    r.bare ? [] : [{ path: r.path, main: i === 0, gone: r.prunable, branch: r.branch }],
  );
}

const SEP = "\u001f";

/** `git for-each-ref`'s lines for the branches, read: name, tip, date. */
export function parseBranches(out: string): { name: string; tip: string; date: number }[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", tip = "", date = "0"] = line.split(SEP);
      return { name, tip, date: Number(date) * 1000 };
    })
    .filter((b) => b.name && b.tip);
}

/** The repository's branches, asked in the background: where each is checked out, `c`'s own marked. Null without git. */
export async function branchesLater(c: Pick<Checkout, "root">): Promise<Branch[] | null> {
  const [refs, trees] = await Promise.all([
    gitLater(c.root, [
      "for-each-ref",
      `--format=%(refname:short)${SEP}%(objectname)${SEP}%(committerdate:unix)`,
      "refs/heads",
    ]),
    worktreeRecordsLater(c.root),
  ]);
  if (refs === null) return null;
  const at = new Map(
    worktreesOf(trees ?? [])
      .filter((w) => w.branch)
      .map((w) => [w.branch!, w] as const),
  );
  // Here by the folders' real paths: a checkout opened through a link to it is still this one.
  const root = realPath(c.root);
  return parseBranches(refs).map((b) => {
    const w = at.get(b.name);
    return {
      ...b,
      worktree: w ? { path: w.path, main: w.main, gone: w.gone } : null,
      here: !!w && realPath(w.path) === root,
    };
  });
}

/** A folder's real path, links followed; as written (resolved) when it can't be read. */
export function realPath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** The files a worktree's removal deletes with it unasked: git-ignored ones, notes first. */
export interface Ignored {
  /** Notes (`.md`, `.markdown`), a vault's own even when ignored. */
  notes: string[];
  /** Any other file, outside the busy folders. */
  others: string[];
  /** More than were counted: the count stopped at `IGNORED_MAX`. */
  more: boolean;
}

export const IGNORED_MAX = 1000;

/**
 * A worktree's git-ignored files (`git status --ignored`), as Remove's question names them: its notes and other files,
 * never what's in a busy folder (`node_modules`, `dist`, a cache: tools' output). An ignored folder is looked into,
 * links not followed, up to `IGNORED_MAX` files. Null without git.
 */
export async function ignoredLater(path: string): Promise<Ignored | null> {
  const out = await gitLater(path, [
    "status",
    "--porcelain=v1",
    "-z",
    "--ignored=traditional",
    "--untracked-files=normal",
  ]);
  if (out === null) return null;
  const found: Ignored = { notes: [], others: [], more: false };
  // Everything here is git-ignored, and an ignored folder with a busy name is busy (D237): its name decides.
  const busy = (rel: string) => rel.split("/").some((s) => s && isBusyName(s));
  const add = (rel: string): boolean => {
    if (found.notes.length + found.others.length >= IGNORED_MAX) return !(found.more = true);
    (/\.(md|markdown)$/i.test(rel) ? found.notes : found.others).push(rel);
    return true;
  };
  const look = async (dir: string): Promise<boolean> => {
    let entries: Dirent[];
    try {
      entries = await readdir(join(path, dir), { withFileTypes: true });
    } catch {
      return true;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = `${dir}${e.name}`;
      if (e.isDirectory()) {
        if (!isBusyName(e.name) && !(await look(`${rel}/`))) return false;
      } else if (!add(rel)) return false;
    }
    return true;
  };
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e[0] === "R" || e[0] === "C") i++;
    if (!e.startsWith("!! ")) continue;
    const rel = e.slice(3);
    if (busy(rel)) continue;
    if (!(rel.endsWith("/") ? await look(rel) : add(rel))) break;
  }
  return found;
}

/** Remove's words for a worktree's ignored files: `2 ignored notes: local/draft.md, local/b.md`; "" with none. */
export function ignoredText(ig: Ignored): string {
  const n = ig.notes.length;
  const m = ig.others.length;
  if (!n && !m) return "";
  const count = (k: number, what: string) => `${k}${ig.more ? "+" : ""} ${what}${k === 1 ? "" : "s"}`;
  const what = n
    ? `${count(n, "ignored note")}${m ? ` and ${count(m, "other ignored file")}` : ""}`
    : count(m, "ignored file");
  const names = [...ig.notes, ...ig.others];
  return `${what}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""}`;
}

/** The branches merged into `base` (reachable from it), asked in the background; null without git or the base. */
export async function mergedLater(root: string, base: string): Promise<Set<string> | null> {
  const out = await gitLater(root, ["for-each-ref", `--merged=${base}`, "--format=%(refname:short)", "refs/heads"]);
  return out === null ? null : new Set(out.split("\n").filter(Boolean));
}

/** How far `branch` is ahead of `base` and behind it (`git rev-list --left-right --count`); null when git can't say. */
export async function aheadBehindLater(
  root: string,
  base: string,
  branch: string,
): Promise<{ ahead: number; behind: number } | null> {
  const out = await gitLater(root, ["rev-list", "--left-right", "--count", "--end-of-options", `${base}...${branch}`]);
  const m = out && /^(\d+)\s+(\d+)/.exec(out.trim());
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null;
}

/** A checkout's uncommitted files (untracked ones too), asked in the background; null without git or the folder. */
export async function dirtyLater(path: string): Promise<number | null> {
  const out = await gitLater(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (out === null) return null;
  let n = 0;
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4) continue;
    if (e[0] === "R" || e[0] === "C") i++;
    n++;
  }
  return n;
}

/** What the panel says of a branch against its base (GIT-D9). */
export interface BranchStats {
  /** Its base (GIT-D10); null for the base itself, or with none. */
  base: string | null;
  ahead: number;
  behind: number;
  /** Merged into its base: nothing of its own left. */
  merged: boolean;
  /** Its worktree's uncommitted files; null without one. */
  dirty: number | null;
}

/** Untouched this long, a branch is folded with the merged ones. */
export const OLD_MS = 30 * 24 * 3600 * 1000;

/**
 * The branches in the panel's order (GIT-D9): this branch; those checked out in a worktree; those touched lately, the
 * newest first; then, folded, those merged into their base and those untouched for a month — a branch here or in a
 * worktree never folded. `merged` says which are merged, as far as git has said.
 */
export function orderBranches<B extends Pick<Branch, "name" | "date" | "here" | "worktree">>(
  branches: B[],
  merged: (b: B) => boolean,
  now: number,
): { shown: B[]; folded: B[] } {
  const newest = (a: B, b: B) => b.date - a.date || a.name.localeCompare(b.name);
  const here = branches.filter((b) => b.here);
  const trees = branches.filter((b) => !b.here && b.worktree).sort(newest);
  const rest = branches.filter((b) => !b.here && !b.worktree).sort(newest);
  const fold = (b: B) => merged(b) || now - b.date > OLD_MS;
  return { shown: [...here, ...trees, ...rest.filter((b) => !fold(b))], folded: rest.filter(fold) };
}

/** A branch's name made safe for a folder's (GIT-D13): `agent/sync-retry` → `agent-sync-retry`. */
export function folderSafe(branch: string): string {
  const safe = branch
    .replace(/[/\\:*?"<>|\s]+/g, "-")
    .replace(/[^\p{L}\p{N}._+@=-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || "branch";
}

/** Where a worktree goes by default (GIT-D13): beside the repository, `<repo>-<branch>`. */
export const DEFAULT_WORKTREES = "{parent}/{repo}-{branch}";

/**
 * Where a new worktree goes (GIT-D13): `[git] worktrees`, a path template — `{parent}` the folder holding the
 * repository's main checkout (`repo`), `{repo}` that checkout's folder's name, `{branch}` the branch made safe for a
 * folder's name; `~` home. Relative, it's from `{parent}`.
 */
export function worktreeFolder(template: string, repo: string, branch: string, home = homedir()): string {
  const filled = (template || DEFAULT_WORKTREES)
    .replaceAll("{parent}", dirname(repo))
    .replaceAll("{repo}", basename(repo))
    .replaceAll("{branch}", folderSafe(branch));
  const expanded = filled === "~" ? home : filled.startsWith("~/") ? join(home, filled.slice(2)) : filled;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(dirname(repo), expanded);
}

/**
 * What this checkout changed against `base` (GIT-D8), as `space g c` lists it: since the branch left the base (the
 * merge base), committed or not, its untracked files and its conflicts (from `entries`, git's status); in the
 * background. Null without git or a commit in common.
 */
export async function changedLater(
  c: Pick<Checkout, "root">,
  base: string,
  entries: { path: string; x: string; y: string }[],
): Promise<Changed[] | null> {
  const mergeBase = (await gitLater(c.root, ["merge-base", "--end-of-options", base, "HEAD"]))?.trim();
  if (!mergeBase) return null;
  const diff = await gitLater(c.root, ["diff", "--name-status", "-z", "-M", "--end-of-options", mergeBase]);
  if (diff === null) return null;
  const files = new Map<string, Changed>();
  for (const f of parseNameStatus(diff)) files.set(f.path, f);
  for (const e of entries) {
    if (e.x === "?" && !files.has(e.path)) files.set(e.path, { path: e.path, state: "new" });
    if (/^(DD|AU|UD|UA|DU|AA|UU)$/.test(e.x + e.y)) files.set(e.path, { path: e.path, state: "conflict" });
  }
  return [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** What a branch's commits changed against `base`, since it left it (`git diff base...branch`); null without git. */
export async function branchChangedLater(root: string, base: string, branch: string): Promise<Changed[] | null> {
  const out = await gitLater(root, ["diff", "--name-status", "-z", "-M", "--end-of-options", `${base}...${branch}`]);
  return out === null ? null : parseNameStatus(out).sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Where `branch` left `base`: the commit a diff of what it changed starts from; null without one in common. */
export async function mergeBaseLater(root: string, base: string, branch: string): Promise<string | null> {
  return (await gitLater(root, ["merge-base", "--end-of-options", base, branch]))?.trim() || null;
}

/** What an operation says when it fails: why, in git's words; null when it went. */
export type Done = string | null;

/** Why git won't take `name` for a branch; null when it will. */
export function badBranchName(root: string, name: string): string | null {
  if (!name.trim()) return "a branch needs a name";
  const r = gitNow(root, ["check-ref-format", "--branch", name]);
  return r.ok ? null : `"${name}" isn't a name git takes for a branch`;
}

/** A branch made at `from`, not checked out, not tracking anything. */
export function makeBranch(root: string, name: string, from: string): Done {
  const bad = badBranchName(root, name);
  if (bad) return bad;
  const r = gitNow(root, ["branch", "--no-track", "--", name, from]);
  return r.ok ? null : r.why;
}

/** How long a checkout may take (a switch, a worktree made or removed): a big tree, or LFS's filters, take a while. */
export const CHECKOUT_MS = 10 * 60_000;

/** What a checkout git ran did: null when it went, else why; and whether git was stopped partway (too long, too much
 *  printed), what it did then maybe half done. */
export interface Checked {
  why: Done;
  stopped: boolean;
}

/**
 * A command that checks files out or deletes them, in the background: null when it went, else why — git's words, or,
 * stopped after `CHECKOUT_MS` (or printing more than slipbox reads), that it was and what it may have left (`left`).
 */
export function checkedOutLater(root: string, args: string[], left: string, ms = CHECKOUT_MS): Promise<Checked> {
  return new Promise((done) => {
    // git's words in English, as the remote's commands have them (`failureOf`).
    execFile("git", gitArgs(root, args), { ...OPTS, timeout: ms, env: inEnglish(process.env) }, (err, out, stderr) => {
      if (!err) return done({ why: null, stopped: false });
      const stopped = stopOf(err) !== null;
      const said = failureOf(err, stderr, out);
      done({ why: stopped ? `${said}: ${left}` : said, stopped });
    });
  });
}

/** `checkedOutLater`'s why alone. */
export function checkoutLater(root: string, args: string[], left: string, ms = CHECKOUT_MS): Promise<Done> {
  return checkedOutLater(root, args, left, ms).then((r) => r.why);
}

/** Another branch checked out in `root` (26.5), in the background; git's own refusal — a change it would overwrite — said. */
export function switchLater(root: string, name: string): Promise<Done> {
  return checkoutLater(root, ["switch", "--", name], "the checkout may be half done — git status says what's left");
}

const halfMade = (folder: string) =>
  `${folder} may hold a worktree half checked out — git worktree remove --force removes it`;

/** A worktree made for a branch there is, in `folder`, in the background. Not trusted: no hook runs as it checks out. */
export function addWorktreeLater(root: string, folder: string, branch: string): Promise<Done> {
  return checkoutLater(root, ["worktree", "add", "--", folder, branch], halfMade(folder));
}

/** What making a new branch in a new worktree did: git's refusal, if it refused, and whether the branch it made is left. */
export interface NewWorktree {
  why: Done;
  /** Refused, the branch this made is still there: stopped partway, or a hook refusing once it was checked out. */
  left: boolean;
}

/**
 * A new branch made at `from` in a new worktree in `folder`, not tracking anything, in the background — or, when git
 * refuses the worktree (a folder that's taken), no branch: git makes the branch before it looks at the folder, so one
 * it made is deleted again. Unless it can't be: stopped partway, its worktree may be there, and the branch stays with
 * it; a hook refusing once it's checked out leaves the worktree, which git won't delete the branch of. A branch that
 * was there before is never one this made.
 */
export async function newWorktreeLater(root: string, folder: string, name: string, from: string): Promise<NewWorktree> {
  const bad = badBranchName(root, name);
  if (bad) return { why: bad, left: false };
  const had = () => gitNow(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `refs/heads/${name}`]).ok;
  const before = had();
  const { why, stopped } = await checkedOutLater(
    root,
    ["worktree", "add", "--no-track", "-b", name, "--", folder, from],
    halfMade(folder),
  );
  if (!why || before || !had()) return { why, left: false };
  if (stopped) return { why, left: true };
  return { why, left: !gitNow(root, ["branch", "-D", "--", name]).ok };
}

/**
 * A worktree removed — git refuses one with changes (no `--force`), and deletes its ignored files with it — and, asked,
 * its branch deleted (merged: `-d`); in the background.
 */
export async function removeWorktreeLater(root: string, folder: string, branch: string | null): Promise<Done> {
  const r = await checkoutLater(root, ["worktree", "remove", "--", folder], `${folder} may be partly deleted`);
  if (r) return r;
  if (!branch) return null;
  const d = gitNow(root, ["branch", "-d", "--", branch]);
  return d.ok ? null : `the worktree is gone, the branch kept: ${d.why}`;
}

/** The worktrees whose folders are gone, forgotten (`git worktree prune`). */
export function pruneWorktrees(root: string): Done {
  const r = gitNow(root, ["worktree", "prune"]);
  return r.ok ? null : r.why;
}

/**
 * `branch` merged into the branch checked out in `root` (`git merge --no-edit`), in the background — a hook can take a
 * while. Not trusted: no hook runs (gitArgs), nothing signed. Its conflicts are git's to say.
 */
export function mergeLater(
  root: string,
  branch: string,
): Promise<{ ok: true } | { ok: false; why: string; conflict: boolean }> {
  const unsigned = isTrusted(root) ? [] : ["-c", "commit.gpgSign=false"];
  return new Promise((done) => {
    execFile(
      "git",
      [...unsigned, ...gitArgs(root, ["merge", "--no-edit", "--", branch])],
      // git's words in English: its conflict is matched below.
      { ...OPTS, timeout: 120_000, env: inEnglish({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" }) },
      (err, out, stderr) => {
        if (!err) return done({ ok: true });
        const text = `${out}\n${stderr}`;
        const conflict = /CONFLICT|Automatic merge failed/.test(text);
        done({ ok: false, why: why(stderr || out), conflict });
      },
    );
  });
}
