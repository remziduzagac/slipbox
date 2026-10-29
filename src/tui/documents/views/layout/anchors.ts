// Source-row and cursor anchor conversions below the view controller.

import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import { type Anchor, anchorAt, type CursorAnchor, rowFor } from "../../../../core/workspace/session/position.ts";
import { cells, clampPos, type Pos } from "../../editing/cursor.ts";

/** The row `sub` rows into the line an anchor names (as far as that line has rows). */
export function rowFromAnchor(layout: Layout, anchor: Anchor, sub: number): number {
  const first = rowFor(layout, anchor);
  const src = layout.lines[first]?.src;
  let row = first;
  for (let k = 0; k < sub && layout.lines[row + 1]?.src === src; k++) row++;
  return row;
}

export function cursorFromAnchor(layout: Layout, c: CursorAnchor, insert = false): Pos {
  const first = rowFor(layout, c.anchor);
  const src = layout.lines[first]?.src;
  let row = first;
  for (let k = 0; k < c.sub && layout.lines[row + 1]?.src === src; k++) row++;
  const pos = clampPos(layout, { row, col: c.col });
  // Typing at a line's end, the cursor is past its last character: a relayout then (the
  // problems bar appearing, a resize) keeps it there, or the next key goes in before that one.
  const cs = insert ? cells(layout.lines[pos.row]) : [];
  const last = cs[cs.length - 1];
  if (last && c.col >= last.x + last.w) pos.col = last.x + last.w;
  return pos;
}

export function cursorAnchorFor(layout: Layout, p: Pos): CursorAnchor {
  const src = layout.lines[p.row]?.src;
  let sub = 0;
  while (p.row - sub - 1 >= 0 && layout.lines[p.row - sub - 1]?.src === src) sub++;
  return { anchor: anchorAt(layout, p.row - sub), sub, col: p.col };
}
