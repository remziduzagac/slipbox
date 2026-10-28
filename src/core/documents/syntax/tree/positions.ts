// Source positions and the final line occupied by a syntax node.
import type { Node } from "web-tree-sitter";
import type { Pos } from "../contracts.ts";

export const before = (a: Pos, b: Pos) => a.row < b.row || (a.row === b.row && a.column < b.column);

/**
 * Where a node ends — but one that takes its line's end with it (Rust's line comments do), ending at column 0 of the
 * next line, ends at the end of its own: that next line isn't inside it.
 */
export function endOf(n: Node, lines: string[]): Pos {
  const e = n.endPosition;
  if (e.column > 0 || e.row <= n.startPosition.row) return e;
  return { row: e.row - 1, column: lines[e.row - 1]?.length ?? 0 };
}
