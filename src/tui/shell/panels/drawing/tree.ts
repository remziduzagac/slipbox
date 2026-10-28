// Owner-local panels drawing: treeLines, drawGuides.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Rect } from "../../screen/geometry.ts";
import { roleStyle } from "../../screen/style.ts";
import type { Color } from "../../../../core/rendering/theme/theme.ts";

/**
 * Tree lines for rows at the given depths: for each row, whether it is the last of its siblings,
 * and for each indentation column whether the ancestor drawn there has siblings still to come
 * (so a │ runs on).
 */
export function treeLines(depths: number[]): { last: boolean; more: boolean[] }[] {
  const out: { last: boolean; more: boolean[] }[] = new Array(depths.length);
  const seen: boolean[] = []; // seen[k]: a row at depth k below, before any shallower row
  for (let i = depths.length - 1; i >= 0; i--) {
    const d = depths[i]!;
    // Column k carries the line of the ancestor at depth k + 1 (its ├─ sits in that column).
    out[i] = { last: !seen[d], more: Array.from({ length: d }, (_, k) => !!seen[k + 1]) };
    seen[d] = true;
    seen.length = d + 1;
  }
  return out;
}

/** Dim tree lines in a row's indentation: │ for ancestors that go on, then ├─ or └─ to the row. */
export function drawGuides(
  app: App,
  c: Canvas,
  rect: Rect,
  y: number,
  depth: number,
  line: { last: boolean; more: boolean[] },
  bg: Color | null,
  left = 0,
): void {
  const g = app.glyphs;
  const st = { ...roleStyle(app.theme, "tree_guide", bg), bg };
  for (let k = 0; k < depth; k++) {
    const x = rect.x + 1 + k * 2 - left;
    if (x + 1 >= rect.x + rect.w - 1) break;
    if (k === depth - 1) {
      // Scrolled sideways, the branch may be half off the left edge.
      const branch = `${line.last ? g.guideLast : g.guideBranch}${g.guideDash}`;
      if (x >= rect.x) drawText(c, x, y, branch, st, 2);
      else if (x + 1 >= rect.x) drawText(c, x + 1, y, g.guideDash, st, 1);
    } else if (line.more[k] && x >= rect.x) drawText(c, x, y, g.guide, st, 1);
  }
}
