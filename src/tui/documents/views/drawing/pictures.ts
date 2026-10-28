// Owner-local pane drawing: drawPictures.

import type { App, View } from "../../../app/runtime/app.ts";
import type { Canvas } from "../../../shell/terminal/canvas.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { stringWidth } from "../../../../core/foundation/text/width.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";

/**
 * A note's pictures (12.x), over the blank rows the layout keeps for them: each from its first row on screen — its
 * rows name it, so one whose top is scrolled away is found however tall it is (PIC) — to its last, and of its columns
 * the ones that show: past its own offset where it scrolls on its own, else in the window, scrolled sideways or not
 * (PIC-D6). Each drawn is a place a click finds it.
 */
export function drawPictures(
  app: App,
  c: Canvas,
  view: View,
  layout: Layout,
  shown: number[],
  top: number,
  x: number,
  textW: number,
  geo: Geometry,
): void {
  for (let i = 0; i < shown.length; i++) {
    const row = shown[i]!;
    const at = layout.lines[row]?.pic;
    if (!at || at.row < 0 || at.row >= at.p.rows) continue;
    const pic = at.p;
    let rows = 0;
    while (i + rows < shown.length && shown[i + rows] === row + rows && at.row + rows < pic.rows) rows++;
    // Where its first row's text starts: past a list's indent, a quote's bar, an embedded note's (12.14); a drawing's
    // centring is on its first row alone.
    const indent = (layout.lines[row - at.row] ?? layout.lines[row]!).spans.reduce(
      (w, s) => w + stringWidth(s.text),
      0,
    );
    const s = layout.lines[row]!.scroll;
    // Its columns on screen, from the text's left edge, and the first of its own that shows.
    let from: number;
    let to: number;
    let left: number;
    if (s) {
      left = app.code.offset(view, layout, row);
      from = indent;
      to = Math.min(indent + pic.cols - left, s.x + s.w, textW);
    } else {
      from = Math.max(indent, view.left) - view.left;
      to = Math.min(indent + pic.cols, view.left + textW) - view.left;
      left = Math.max(0, view.left - indent);
    }
    if (to > from) {
      const crop = { skip: at.row, total: pic.rows, left, wide: pic.cols };
      c.image!(x + from, top + i, to - from, rows, pic.src, crop);
      // A picture of a file is the click's; a drawing slipbox made isn't (a click on it places the cursor, as ever).
      if (pic.file)
        geo.pictures.push({ x: x + from, y: top + i, w: to - from, h: rows, view, row: row - at.row, file: pic.file });
    }
    i += rows - 1;
  }
}
