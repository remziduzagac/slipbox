// Owner-local pane drawing: drawCursor.

import type { Canvas } from "../../../../shell/terminal/canvas.ts";
import { roleStyle } from "../../../../shell/screen/style.ts";
import { cells } from "../../../editing/cursor.ts";
import type { Theme } from "../../../../../core/rendering/theme/theme.ts";
import type { Line } from "../../../../../core/rendering/layout/ir.ts";

/**
 * The block cursor on its character, drawn with the cursor role (inverse without colour); a wide one
 * at the last column (`end`) shows as one cell.
 */
export function drawCursor(
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  col: number,
  theme: Theme,
  end = Number.POSITIVE_INFINITY,
): void {
  const st = roleStyle(theme, "cursor", null);
  const cell = cells(line).find((k) => k.x === col);
  // A tab is one stop several columns wide: the cursor sits on its first column.
  if (cell && cell.g === "\t") c.cell(x + cell.x, y, " ", 1, st);
  else if (cell && cell.x + cell.w <= end) c.cell(x + cell.x, y, cell.g, cell.w, st);
  else c.cell(x + col, y, " ", 1, st);
}
