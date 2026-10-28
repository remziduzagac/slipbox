// Owner-local overlays drawing: drawFloating.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Geometry } from "../../screen/geometry/contracts.ts";
import type { Rect } from "../../screen/geometry.ts";
import { roleStyle } from "../../screen/style.ts";
import { truncate, stringWidth } from "../../../../core/foundation/text/width.ts";
import { peekTitle } from "../../../documents/navigation/peek.ts";
import { drawPane } from "../../../documents/views/drawing/pane.ts";

/**
 * The floating editor (3.20): a framed window over the others, centred near the top of the content,
 * as tall as its text (at most the content's height); its title says what it edits, its bottom
 * border how it closes. Inside, a window like any, in source mode. The scratch's (#43) is a fixed three quarters of
 * the screen, in the middle of it: room to type in, its size not jumping as entries come; rendered, as a note is.
 */
export function drawFloating(app: App, c: Canvas, mainY: number, mainH: number, geo: Geometry): Rect {
  const f = app.floating!;
  const theme = app.theme;
  const W = c.width;
  const scratch = f.kind === "scratch";
  // A peek (VV-D7): most of the screen, in the middle of it; `z`, all of it, its margin too.
  const peek = f.kind === "peek" ? f.peek : null;
  const full = !!peek?.full;
  // A diff (GIT-D2), a review's and the merge screen's too, as wide as there's room for: its lines are a file's, not
  // text to read at a measure. The merge screen as tall as a peek: its card and result change as it's settled.
  const wide = f.kind === "diff" || f.kind === "review" || f.kind === "merge";
  const w = full
    ? W
    : peek
      ? Math.max(24, W - 4 - Math.max(4, Math.floor(W / 8)))
      : Math.max(24, wide ? W - 8 : Math.min(100, scratch ? Math.floor((W * 3) / 4) : W - 8));
  // A diff (a review's too) is as tall as its rows, not its text's lines: a block's frame, a paragraph laid out again
  // (GIT-D2). Laid out at its pane's width less the scrollbar's column, as the pane will lay it out.
  const drawn = f.kind === "diff" || f.kind === "review" ? f.view.buf.drawn : undefined;
  const lines = drawn
    ? drawn(Math.max(10, w - 3), { glyphs: app.glyphs, wrap: app.ui.wrap, codeScroll: app.code.scrolls() }).lines.length
    : f.view.buf.lineStarts().length;
  const h = full
    ? Math.max(4, mainH)
    : peek || f.kind === "merge"
      ? Math.max(6, mainH - 2 - Math.max(1, Math.floor(mainH / 10)))
      : scratch
        ? Math.max(6, Math.min(mainH - 1, Math.floor((mainH * 3) / 4)))
        : Math.max(6, Math.min(mainH - 1, lines + 5));
  const x = Math.floor((W - w) / 2);
  const y = mainY + (full ? 0 : scratch || peek ? Math.floor((mainH - h) / 2) : Math.max(0, Math.min(1, mainH - h)));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const b = app.glyphs.box;
  c.fill(full ? x : x - 2, full ? y : y - 1, full ? w : w + 4, full ? h : h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  // A peek's: its path cut from the front, where it is and the file's name kept (VV-D7).
  const title = f.kind === "peek" ? peekTitle(f.peek, f.view.buf.elsewhere?.rel ?? null, w - 8) : f.title;
  const tw = drawText(c, x + 2, y, truncate(` ${title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  // A note's diff: tab switches between its blocks and its lines (GIT-D2).
  const tab = f.kind === "diff" && f.diff.blocks ? `tab: its ${f.diff.blocks.on ? "lines" : "blocks"} · ` : "";
  const hint =
    f.kind === "hover"
      ? " esc · q closes "
      : f.kind === "diff"
        ? ` ${tab}${f.diff.go ? "enter goes to the line · " : ""}esc · q ${f.diff.back ? "goes back" : "closes"} `
        : f.kind === "commit"
          ? ` ctrl+s ${f.amend ? "amends" : "commits"} · esc · q leaves it `
          : f.kind === "report"
            ? " ctrl+s sends it or adds the screen · esc · q leaves it "
            : f.kind === "scratch"
              ? " esc · q closes, saved "
              : f.kind === "peek"
                ? ` o go there · t keep as a tab · z ${f.peek.full ? "smaller" : "fill"}${f.peek.back.length ? " · ctrl+o back" : ""} · esc closes `
                : f.kind === "review"
                  ? " esc ends the review "
                  : f.kind === "merge"
                    ? ` esc ${f.merge.prompt ? "goes back to the question" : "closes, what's settled kept"} `
                    : ` esc · q closes, writing back · ctrl+s writes `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(hint)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, truncate(hint, w - stringWidth(bottom) - 1) + b.br, dim);
  drawPane(app, c, f.view, { x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, true, false, true, false, geo);
  return full ? { x, y, w, h } : { x: x - 2, y: y - 1, w: w + 4, h: h + 2 };
}
