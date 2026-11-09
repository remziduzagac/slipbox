// What `files.show = "auto"` takes a vault for (16.5, D272): git at the vault's top decides, `.slipbox/` doesn't —
// `slipbox init --name` makes one in a code repository only to name it (#105).

import { hasMarker, isRepoRoot } from "./vault.ts";

/**
 * Why `auto` lists what it does in the vault whose top is `dir`: `git`, its top holds `.git` — a repository's top, a
 * worktree's or a submodule's `.git` file too — so every text file, `.slipbox/` or not; `notes`, a `.slipbox/` without
 * `.git` beside it — a notes folder, or a notes vault inside a repository — so notes and data files; null anywhere
 * else, every text file.
 */
export function autoWhy(dir: string): "git" | "notes" | null {
  if (isRepoRoot(dir)) return "git";
  return hasMarker(dir) ? "notes" : null;
}

/** A notes vault, as `auto` takes one: `.slipbox/` at its top and no `.git` beside it. */
export function isNotesVault(dir: string): boolean {
  return autoWhy(dir) === "notes";
}
