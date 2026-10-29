// Owner-local pane drawing: SIGN_ROLE, SIGN_RANK, gitGlyph.

import type { GitSign } from "../../../../../core/workspace/git/gitsigns.ts";
import type { Role } from "../../../../../core/rendering/theme/theme.ts";
import type { Glyphs } from "../../../../../core/rendering/theme/glyphs.ts";
import type { Line } from "../../../../../core/rendering/layout/ir.ts";

/** A git sign's colour (26.1): roles of their own (#22), softer than the explorer's new and modified files' colours. */
export const SIGN_ROLE: Record<GitSign, Role> = {
  add: "git_sign_add",
  change: "git_sign_change",
  delete: "git_sign_delete",
  topdelete: "git_sign_delete",
};

const SIGN_RANK: Record<GitSign, number> = { change: 3, add: 2, delete: 1, topdelete: 1 };

export function gitGlyph(g: Glyphs, s: GitSign): string {
  return s === "add" ? g.gitAdd : s === "change" ? g.gitChange : s === "delete" ? g.gitDelete : g.gitTopDelete;
}

/** A row's sign: its line's, or (a rendered row joining several) the strongest of theirs. */
export function rowSign(signs: Map<number, GitSign>, line: Line): { sign: GitSign; src: number } | undefined {
  let best: { sign: GitSign; src: number } | undefined;
  for (const src of new Set([line.src, ...line.spans.flatMap((s) => (s.src === undefined ? [] : [s.src]))])) {
    const s = signs.get(src);
    if (s && (!best || SIGN_RANK[s] > SIGN_RANK[best.sign])) best = { sign: s, src };
  }
  return best;
}
