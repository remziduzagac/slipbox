// What git knows about a vault's files (plan 5.11–5.14): each one's status, what changed on this
// branch since it left the base branch, a file as the base has it, and the repository's worktrees.
// These run git — unlike `git.ts`, which only reads `.git` — since status and history aren't in
// files slipbox could read cheaply. A git that isn't there, or fails, is "nothing known".

import { execFile, execFileSync, spawnSync } from "node:child_process";
import { join, posix, relative, sep } from "node:path";
import { climbsOut } from "./fsutil.ts";
import type { Checkout } from "./git.ts";
import { isTrusted } from "./trust.ts";

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
export function gitArgs(root: string, args: string[]): string[] {
  if (isTrusted(root)) return ["-C", root, ...args];
  const [cmd, ...rest] = args;
  const diffs = cmd === "diff" || cmd === "show" ? ["--no-textconv", "--no-ext-diff"] : [];
  const attrs = takesAttrSource() ? [`--attr-source=${EMPTY_TREE}`] : [];
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

/** Whether a ref names a commit in the repository. */
function exists(c: Pick<Checkout, "root">, ref: string): boolean {
  return run(c, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null;
}

/**
 * The branch changes are measured against: `[git] base` when set (any ref), else `main`, else
 * `master`. Null when none is there.
 */
export function baseBranch(c: Pick<Checkout, "root">, configured = ""): string | null {
  for (const ref of configured ? [configured] : ["main", "master"]) if (exists(c, ref)) return ref;
  return null;
}

/** Where this checkout's branch left `base`: what it changed is measured from there. */
export function mergeBaseOf(c: Pick<Checkout, "root">, base: string): string | null {
  return run(c, ["merge-base", base, "HEAD"])?.trim() || null;
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
  const diff = run(c, ["diff", "--name-status", "-z", "-M", mergeBase]);
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
  const out = run(c, ["diff", "--name-status", "-z", "-M", from, to]);
  return out === null ? null : parseNameStatus(out);
}

/** The repository's local branches, by name; null without git. */
export function branchesOf(c: Pick<Checkout, "root">): string[] | null {
  const out = run(c, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  return out === null ? null : out.split("\n").filter(Boolean).sort();
}

/** A file as `ref` has it (path from the checkout's top folder); null where it hasn't one. `ref` "": as staged. */
export function showAt(c: Pick<Checkout, "root">, ref: string, path: string): string | null {
  return run(c, ["show", `${ref}:${path.split(sep).join(posix.sep)}`]);
}

/** The same, not waiting on git (the TUI's gutter, 26.1). */
export function showLater(c: Pick<Checkout, "root">, ref: string, path: string): Promise<string | null> {
  return new Promise((done) => {
    execFile("git", gitArgs(c.root, ["show", `${ref}:${path.split(sep).join(posix.sep)}`]), OPTS, (err, out) =>
      done(err ? null : out),
    );
  });
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

/** The repository's checkouts, the main one first (`git worktree list`); null without git. */
export function worktreeList(c: Pick<Checkout, "root">): WorktreeEntry[] | null {
  const out = run(c, ["worktree", "list", "--porcelain"]);
  if (out === null) return null;
  const list: WorktreeEntry[] = [];
  // Git lists the main checkout first; a bare repository is listed there instead, and has none.
  let first = true;
  for (const block of out.split(/\n\n+/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) continue;
    const main = first;
    first = false;
    if (/^bare$/m.test(block)) continue;
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    const head = /^HEAD ([0-9a-f]+)$/m.exec(block)?.[1] ?? null;
    list.push({ path, branch, head, main });
  }
  return list;
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
