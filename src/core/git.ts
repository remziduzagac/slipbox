// A vault's git checkout (plan 17.19), read from the files under `.git` — no git process: which
// repository it belongs to, whether it's the main checkout or a linked worktree (`git worktree
// add`), that worktree's name, and the branch checked out. Worktrees are separate vaults of one
// repository: each keeps its own state, the main checkout is the one other vaults' links mean.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

export interface Checkout {
  /** The checkout's top folder (where `.git` is). */
  root: string;
  /** Its own git directory: the main checkout's `.git`, a worktree's `.git/worktrees/<name>`. */
  gitDir: string;
  /** The repository's shared git directory. */
  common: string;
  /** The main checkout's top folder; null for a bare repository (none). */
  main: string | null;
  /** A linked worktree's name (its folder under `.git/worktrees/`); null for the main checkout. */
  worktree: string | null;
}

function read(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** The git checkout holding `dir` (it, or a folder above it), or null when it isn't in one. */
export function checkoutOf(dir: string): Checkout | null {
  for (let at = resolve(dir); ; at = dirname(at)) {
    const dotGit = join(at, ".git");
    if (isDir(dotGit)) return { root: at, gitDir: dotGit, common: dotGit, main: at, worktree: null };
    const file = read(dotGit);
    if (file !== null) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(file);
      if (!m) return null;
      const gitDir = resolve(at, m[1]!);
      const commondir = read(join(gitDir, "commondir"));
      // No commondir: a submodule (or `--separate-git-dir`) — a repository of its own, checked out here.
      if (commondir === null) return { root: at, gitDir, common: gitDir, main: at, worktree: null };
      const common = resolve(gitDir, commondir.trim());
      // A non-bare repository keeps its `.git` in the main checkout; a bare one has none.
      const main = basename(common) === ".git" ? dirname(common) : null;
      return { root: at, gitDir, common, main, worktree: basename(gitDir) };
    }
    if (dirname(at) === at) return null;
  }
}

/** Where a folder of one checkout is in the main checkout: `repo/docs` in a worktree is `main/docs`. */
export function inMain(c: Checkout, path: string): string | null {
  return c.main ? join(c.main, relative(c.root, path)) : null;
}

const heads = new Map<string, { mtimeMs: number; branch: string | null; commit: string | null }>();

/**
 * The branch checked out (`refs/heads/x` → `x`), or null with the commit when HEAD is detached.
 * Read again only when HEAD changed (a cheap stat): asked for on every frame.
 */
export function headOf(c: Pick<Checkout, "gitDir">): { branch: string | null; commit: string | null } {
  const file = join(c.gitDir, "HEAD");
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return { branch: null, commit: null };
  }
  const hit = heads.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit;
  const text = (read(file) ?? "").trim();
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text);
  const head = { mtimeMs, branch: ref ? ref[1]! : null, commit: ref ? null : /^[0-9a-f]{40,64}$/.test(text) ? text : null };
  heads.set(file, head);
  return head;
}
