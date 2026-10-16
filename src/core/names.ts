// How a root is named to the user (21.9; blueprint/design/roots.md § How a root is named and shown):
// its name if it has one — a `.slipbox/` name, else its repository's remote's (21.6) — else its path
// (`~/…`); no-vault, Elsewhere (VV-D3). A worktree's name carries its branch: `research@refactor`.
// Never written into a file.

import { checkoutOf, headOf } from "./git.ts";
import { tildePath } from "./paths.ts";
import type { VaultLocation } from "./vault.ts";

/** The branch checked out at `path` now (a detached head: its commit, short); null outside git. */
export function branchAt(path: string): string | null {
  const c = checkoutOf(path);
  if (!c) return null;
  const h = headOf(c);
  return h.branch ?? h.commit?.slice(0, 7) ?? null;
}

/** What no-vault is called where you read it (VV-D3): the status line, the messages, a peek's title. */
export const ELSEWHERE = "Elsewhere";

/**
 * A root as the user is told of it: `research`, `~/src/experiment`, `~/scratch`; a named worktree,
 * `research@refactor`; no-vault, `Elsewhere`.
 */
export function rootLabel(loc: Pick<VaultLocation, "mode" | "name" | "root" | "worktree">): string {
  if (loc.mode === "folder") return ELSEWHERE;
  if (loc.mode !== "vault" || !loc.name) return tildePath(loc.root);
  const b = loc.worktree ? branchAt(loc.root) : null;
  return b ? `${loc.name}@${b}` : loc.name;
}

export { tildePath };
