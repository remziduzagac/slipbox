// Original advisory discovery of already-dirty Git trees.

import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { gitArgs } from "../../../git/branches/gitops.ts";
import { findVaultRoot } from "../../../vaults/vault.ts";

/** Roots with uncommitted changes in git, among those the plan writes to (7.3). */
export function dirtyTrees(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const p of paths) {
    // git answers for any folder in the tree; the vault's root, else the file's folder, is asked.
    roots.add(findVaultRoot(p) ?? dirname(p));
  }
  const out: string[] = [];
  for (const root of roots) {
    try {
      const status = execFileSync("git", gitArgs(root, ["status", "--porcelain"]), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      if (status.trim()) out.push(`${root} already has uncommitted changes (git): these edits will mix with them`);
    } catch {
      // not a git repository, or no git: nothing to warn about
    }
  }
  return out;
}
