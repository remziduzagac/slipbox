// What git knows about a vault's files (plan 5.11–5.14): each one's status, what changed on this
// branch since it left the base branch, a file as the base has it, and the repository's worktrees.
// These run git — unlike `git.ts`, which only reads `.git` — since status and history aren't in
// files slipbox could read cheaply. A git that isn't there, or fails, is "nothing known".

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join, posix, relative, sep } from "node:path";
import { climbsOut } from "../../../foundation/platform/fsutil.ts";
import type { Checkout } from "../git.ts";
import { isTrusted } from "../../vaults/trust.ts";

/** A file's state, as the explorer marks it: new (untracked or added), modified, renamed, deleted, or in conflict (a merge). */
export type GitState = "new" | "modified" | "renamed" | "deleted" | "conflict";

/** The empty tree: attributes read from it name nothing — no filter, diff or merge driver of a repository's. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
let attrSource: boolean | null = null;

/** Whether this git takes `--attr-source` (2.42 and later): without it, a repository's filters can still run. */
export function gitGuardsAttributes(): boolean {
  return takesAttrSource();
}

/**
 * Whether this git takes `--attr-source` (2.42 and later). A version that can't be read — git's start failed, as one
 * can on a machine short of memory — is guarded all the same, and asked again next time: never taken, and kept, for a
 * git too old to guard. One too old for the flag refuses the command, and nothing runs.
 */
function takesAttrSource(): boolean {
  if (attrSource === null) {
    const v = /git version (\d+)\.(\d+)/.exec(
      spawnSync("git", ["--version"], { encoding: "utf8", timeout: 15_000 }).stdout ?? "",
    );
    if (!v) return true;
    attrSource = Number(v[1]) > 2 || (Number(v[1]) === 2 && Number(v[2]) >= 42);
  }
  return attrSource;
}

/**
 * git's arguments for a command in `root` (23.6). In a root you don't trust, git runs nothing of the
 * repository's own config or files: no fsmonitor command, no hook (`status` writes the index, and that
 * runs `post-index-change`), no filter, diff or merge driver its attributes name (read from the empty
 * tree instead; git 2.42 and later), no textconv or external diff, no index written by a read. In one
 * you trust, git as the repository has it — its LFS filters too.
 */
export function gitArgs(root: string, args: string[], attributes?: boolean): string[] {
  if (isTrusted(root)) return ["-C", root, ...args];
  const [cmd, ...rest] = args;
  const diffs = cmd === "diff" || cmd === "show" ? ["--no-textconv", "--no-ext-diff"] : [];
  const attrs = (attributes ?? takesAttrSource()) ? [`--attr-source=${EMPTY_TREE}`] : [];
  return [
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "log.showSignature=false",
    ...attrs,
    "--no-optional-locks",
    "-C",
    root,
    cmd!,
    ...diffs,
    ...rest,
  ];
}

/**
 * `gitArgs` for a command given files' paths: each path is that file, read literally — `Why?.md`, `[draft] x.md`,
 * `a*.md` and `:a.md` name themselves, never a pattern or git's pathspec magic. Only for those commands: git passes the
 * setting on to the hooks it runs, which may expect their own patterns.
 */
export function literalArgs(root: string, args: string[], attributes?: boolean): string[] {
  return ["--literal-pathspecs", ...gitArgs(root, args, attributes)];
}

/** The environment for those: git refuses literal paths beside a setting of the user's for patterns. */
export function literalEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ["GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS", "GIT_LITERAL_PATHSPECS"])
    delete env[k];
  return env;
}

const OPTS = {
  encoding: "utf8" as const,
  stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
  timeout: 15_000,
  maxBuffer: 64 * 1024 * 1024,
};

function run(c: Pick<Checkout, "root">, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(c.root, args), OPTS);
  } catch {
    return null;
  }
}

/** The same, not waiting on git. */
function runLater(root: string, args: string[]): Promise<string | null> {
  return gitReadLater({ root }, args);
}

/** git's porcelain status (v1, `-z`): each path (from the checkout's top folder) and its state. */
export function parseStatus(z: string): Map<string, GitState> {
  const out = new Map<string, GitState>();
  const parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]!;
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    const path = e.slice(3);
    // A rename or copy names where it came from next.
    if (xy[0] === "R" || xy[0] === "C") i++;
    out.set(path, stateOf(xy));
  }
  return out;
}

export function stateOf(xy: string): GitState {
  if (/^(DD|AU|UD|UA|DU|AA|UU)$/.test(xy)) return "conflict";
  if (xy === "??" || xy.includes("A")) return "new";
  if (xy[0] === "R" || xy[0] === "C") return "renamed";
  if (xy.includes("D")) return "deleted";
  return "modified";
}

export const STATUS_ARGS = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];

/** The checkout's status now; null without git. */
export function statusOf(c: Pick<Checkout, "root">): Map<string, GitState> | null {
  const out = run(c, STATUS_ARGS);
  return out === null ? null : parseStatus(out);
}

/**
 * Whether `ref` is a name git takes for a branch, a tag or a commit, as `git check-ref-format` has it: `main`,
 * `origin/main`, a hash — never one starting with `-`, nor with a space, a control character, `~^:?*[\`, `..` or `@{`
 * in it. A base (`[git] base`, `[git] bases`, a kept one) is used only when it is one; the one rule for every name
 * slipbox hands git, said why where it's refused (`refusedName`: a remote's, a branch's, a base rebased onto).
 */
export function refName(ref: string): boolean {
  if (!ref || ref === "@" || ref.startsWith("-") || ref.endsWith("/") || ref.endsWith(".")) return false;
  if (/[\u0000- \u007f~^:?*[\\]|\.\.|@\{|\/\//.test(ref)) return false;
  return ref.split("/").every((part) => part && !part.startsWith(".") && !part.endsWith(".lock"));
}

/** Whether a ref names a commit in the repository. */
function exists(c: Pick<Checkout, "root">, ref: string): boolean {
  return refName(ref) && run(c, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]) !== null;
}

/**
 * The branch changes are measured against: `[git] base` when set (a branch's name, a tag's or a commit's), else
 * `main`, else `master`. Null when none is there.
 */
export function baseBranch(c: Pick<Checkout, "root">, configured = ""): string | null {
  for (const ref of configured ? [configured] : ["main", "master"]) if (exists(c, ref)) return ref;
  return null;
}

/** Where this checkout's branch left `base`: what it changed is measured from there. */
export function mergeBaseOf(c: Pick<Checkout, "root">, base: string): string | null {
  return run(c, ["merge-base", "--end-of-options", base, "HEAD"])?.trim() || null;
}

export interface Changed {
  /** From the checkout's top folder. */
  path: string;
  state: GitState;
  /** A rename's old path. */
  from?: string;
}

/**
 * What this checkout has that `base` hasn't: everything changed since this branch left it (the
 * merge base), committed or not, and what isn't tracked yet. Null without git or the base.
 */
export function changedSince(c: Pick<Checkout, "root">, base: string): { mergeBase: string; files: Changed[] } | null {
  const mergeBase = mergeBaseOf(c, base);
  if (!mergeBase) return null;
  const diff = run(c, ["diff", "--name-status", "-z", "-M", "--end-of-options", mergeBase]);
  const status = statusOf(c);
  if (diff === null || status === null) return null;
  const files = new Map<string, Changed>();
  for (const f of parseNameStatus(diff)) files.set(f.path, f);
  for (const [path, state] of status) if (state === "new" && !files.has(path)) files.set(path, { path, state });
  for (const [path, state] of status) if (state === "conflict") files.set(path, { path, state });
  return { mergeBase, files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

/** `git diff --name-status -z` read: each file, its state, a rename's old path (a copy's source isn't one). */
export function parseNameStatus(z: string): Changed[] {
  const out: Changed[] = [];
  const parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i]!;
    if (!code) continue;
    if (code[0] === "R" || code[0] === "C") {
      const from = parts[++i]!;
      const to = parts[++i]!;
      out.push(code[0] === "R" ? { path: to, state: "renamed", from } : { path: to, state: "new" });
    } else {
      const path = parts[++i]!;
      out.push({
        path,
        state: code[0] === "A" ? "new" : code[0] === "D" ? "deleted" : code[0] === "U" ? "conflict" : "modified",
      });
    }
  }
  return out;
}

/** What changed from commit `from` to `to`, renames paired by git (`-M`, by similarity); null without git. */
export function changedBetween(c: Pick<Checkout, "root">, from: string, to: string): Changed[] | null {
  const out = run(c, ["diff", "--name-status", "-z", "-M", "--end-of-options", from, to]);
  return out === null ? null : parseNameStatus(out);
}

/** The repository's local branches, by name; null without git. */
export function branchesOf(c: Pick<Checkout, "root">): string[] | null {
  const out = run(c, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  return out === null ? null : out.split("\n").filter(Boolean).sort();
}

/** A file as `ref` has it (path from the checkout's top folder); null where it hasn't one. `ref` "": as staged. */
export function showAt(c: Pick<Checkout, "root">, ref: string, path: string): string | null {
  return run(c, ["show", "--end-of-options", `${ref}:${path.split(sep).join(posix.sep)}`]);
}

/** A finite read process; its deadline also covers descendants retaining stdout. */
function readProcess(args: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(value);
    };
    const cancel = () => finish(null);
    try {
      child = spawn("git", args, { env, stdio: ["ignore", "pipe", "ignore"], detached: process.platform !== "win32" });
    } catch {
      resolve(null);
      return;
    }
    timer = setTimeout(cancel, 15000);
    signal?.addEventListener("abort", cancel, { once: true });
    child.stdout!.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024 * 1024) return cancel();
      chunks.push(chunk);
    });
    child.stdout!.on("error", cancel);
    child.once("error", cancel);
    child.once("close", (code) => {
      if (!done) finish(code === 0 ? Buffer.concat(chunks).toString() : null);
    });
  });
}
/** Guard discovery and git itself both run asynchronously, including the first request. */
export async function gitReadLater(
  c: Pick<Checkout, "root">,
  args: string[],
  literal = false,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return null;
  let attributes: boolean | undefined;
  if (attrSource === null) {
    const version = await readProcess(["--version"], process.env, signal);
    if (signal?.aborted) return null;
    const match = /git version (\d+)\.(\d+)/.exec(version ?? "");
    if (match) attrSource = Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 42);
    attributes = attrSource ?? true;
  }
  return readProcess(
    literal ? literalArgs(c.root, args, attributes) : gitArgs(c.root, args, attributes),
    literal ? literalEnv() : process.env,
    signal,
  );
}

/** A file read without waiting on git (the TUI's gutter and history). */
export function showLater(
  c: Pick<Checkout, "root">,
  ref: string,
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  return gitReadLater(c, ["show", "--end-of-options", `${ref}:${path.split(sep).join(posix.sep)}`], false, signal);
}

export interface WorktreeEntry {
  /** Its top folder. */
  path: string;
  /** The branch checked out; null when detached (then `head`). */
  branch: string | null;
  head: string | null;
  /** The main checkout: the first git lists, unless the repository is bare (it has none then). */
  main: boolean;
}

/** A checkout as `git worktree list --porcelain -z` lists it. */
export interface WorktreeRecord {
  path: string;
  head: string | null;
  branch: string | null;
  bare: boolean;
  /** Its folder is gone: git would prune it. */
  prunable: boolean;
}

/**
 * `git worktree list --porcelain -z` read, checkout by checkout, in git's order — the main checkout first, or a bare
 * repository there instead. Each field ends with a NUL and each checkout with another, so a folder's name may hold a
 * line break.
 */
export function worktreeRecords(z: string): WorktreeRecord[] {
  const out: WorktreeRecord[] = [];
  let at: WorktreeRecord | null = null;
  for (const field of z.split("\0")) {
    if (field.startsWith("worktree ")) {
      at = { path: field.slice("worktree ".length), head: null, branch: null, bare: false, prunable: false };
      out.push(at);
    } else if (!field) at = null;
    else if (at) {
      if (field.startsWith("HEAD ")) at.head = field.slice(5);
      else if (field.startsWith("branch refs/heads/")) at.branch = field.slice("branch refs/heads/".length);
      else if (field === "bare") at.bare = true;
      else if (field === "prunable" || field.startsWith("prunable ")) at.prunable = true;
    }
  }
  return out;
}

/** `git worktree list --porcelain` as lines, read as `-z`'s: a line's end is a field's, a blank line a checkout's. */
export const worktreeLines = (out: string): WorktreeRecord[] => worktreeRecords(out.replaceAll("\n", "\0"));

/** Whether a git takes `worktree list -z` (2.36 and later), by its path: found by asking it once. */
const takesZ = new Map<string, boolean>();
const gitPaths = new Map<string, string>();

/** The git a command runs: the first on PATH, by its path; "git" when none is found there. */
function gitOnPath(): string {
  const path = process.env.PATH ?? "";
  let found = gitPaths.get(path);
  if (found === undefined) {
    found = "git";
    const names = process.platform === "win32" ? ["git.exe", "git"] : ["git"];
    search: for (const dir of path.split(delimiter))
      for (const name of names) {
        if (!dir) continue;
        try {
          accessSync(join(dir, name), constants.X_OK);
          if (!statSync(join(dir, name)).isFile()) continue;
          found = join(dir, name);
          break search;
        } catch {}
      }
    gitPaths.set(path, found);
  }
  return found;
}

const WORKTREE_LIST = ["worktree", "list", "--porcelain"];

/**
 * The repository's checkouts as git lists them, in git's order, waited for; null without git. With `-z` where this
 * git takes it, so a folder's name may hold a line break; else (a git before 2.36 refuses it) as lines, where only
 * such a name is misread. Which one a git takes is asked once and kept, so an old git doesn't refuse `-z` on every
 * refresh.
 */
export function worktreeRecordsNow(root: string): WorktreeRecord[] | null {
  const git = gitOnPath();
  const known = takesZ.get(git);
  if (known !== false) {
    const z = run({ root }, [...WORKTREE_LIST, "-z"]);
    if (z !== null) {
      takesZ.set(git, true);
      return worktreeRecords(z);
    }
  }
  const lines = run({ root }, WORKTREE_LIST);
  if (lines === null) return null;
  // `-z` refused where the list itself isn't: a git before 2.36.
  if (known === undefined) takesZ.set(git, false);
  return worktreeLines(lines);
}

/** The same, not waiting on git. */
export async function worktreeRecordsLater(root: string): Promise<WorktreeRecord[] | null> {
  const git = gitOnPath();
  const known = takesZ.get(git);
  if (known !== false) {
    const z = await runLater(root, [...WORKTREE_LIST, "-z"]);
    if (z !== null) {
      takesZ.set(git, true);
      return worktreeRecords(z);
    }
  }
  const lines = await runLater(root, WORKTREE_LIST);
  if (lines === null) return null;
  if (known === undefined) takesZ.set(git, false);
  return worktreeLines(lines);
}

/** The repository's checkouts, the main one first (`git worktree list`); null without git. */
export function worktreeList(c: Pick<Checkout, "root">): WorktreeEntry[] | null {
  const records = worktreeRecordsNow(c.root);
  if (records === null) return null;
  // Git lists the main checkout first; a bare repository is listed there instead, and has none.
  return records.flatMap((r, i) => (r.bare ? [] : [{ path: r.path, branch: r.branch, head: r.head, main: i === 0 }]));
}

/** A path of the checkout as one of the vault's, or null when it's outside the vault's folder. */
export function inVault(c: Pick<Checkout, "root">, vaultRoot: string, path: string): string | null {
  const rel = relative(vaultRoot, join(c.root, path));
  return rel && !climbsOut(rel) ? rel.split(sep).join("/") : null;
}

/** A vault path as the checkout's (from its top folder). */
export function inCheckout(c: Pick<Checkout, "root">, vaultRoot: string, rel: string): string {
  return relative(c.root, join(vaultRoot, rel)).split(sep).join("/");
}

/** Asynchronous fallback base and branch changes, with the same literal and trust guards. */
export async function baseBranchLater(
  c: Pick<Checkout, "root">,
  configured = "",
  signal?: AbortSignal,
): Promise<string | null> {
  for (const ref of configured ? [configured] : ["main", "master"])
    if (
      refName(ref) &&
      (await gitReadLater(
        c,
        ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
        false,
        signal,
      )) !== null
    )
      return ref;
  return null;
}
export async function changedSinceLater(
  c: Pick<Checkout, "root">,
  base: string,
  signal?: AbortSignal,
): Promise<{ mergeBase: string; files: Changed[] } | null> {
  const mergeBase = (await gitReadLater(c, ["merge-base", "--end-of-options", base, "HEAD"], false, signal))?.trim();
  if (!mergeBase) return null;
  const [diff, status] = await Promise.all([
    gitReadLater(c, ["diff", "--name-status", "-z", "-M", "--end-of-options", mergeBase], false, signal),
    gitReadLater(c, STATUS_ARGS, false, signal),
  ]);
  if (diff === null || status === null) return null;
  const states = parseStatus(status);
  const files = new Map(parseNameStatus(diff).map((file) => [file.path, file]));
  for (const [path, state] of states)
    if ((state === "new" && !files.has(path)) || state === "conflict") files.set(path, { path, state });
  return { mergeBase, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
