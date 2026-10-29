// Task checkbox hit testing from laid-out spans.

import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import { stringWidth } from "../../../../core/foundation/text/width.ts";

/** The task whose checkbox glyph is at this cell, if any (its trailing space doesn't count). */
export function taskMarkAt(
  layout: Layout,
  row: number,
  col: number,
): { line: number; end: number; checked: boolean } | null {
  let x = 0;
  for (const s of layout.lines[row]?.spans ?? []) {
    const w = stringWidth(s.text);
    if (s.task && col >= x && col < x + stringWidth(s.text.trimEnd())) return s.task;
    x += w;
  }
  return null;
}
