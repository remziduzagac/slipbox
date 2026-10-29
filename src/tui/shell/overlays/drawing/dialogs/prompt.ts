// Owner-local overlays drawing: DIALOG_MIN_W, dialogWidth, dialogLines.

import type { App, PromptOverlay } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import type { Geometry } from "../../../screen/geometry/contracts.ts";
import type { Rect } from "../../../screen/geometry.ts";
import { roleStyle } from "../../../screen/style.ts";
import { stringWidth, truncateStart } from "../../../../../core/foundation/text/width.ts";
import { smallButton } from "../../../panels/drawing/chrome.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { wrapWords } from "../common/labels.ts";

/** Narrower than this, a question goes over the status line instead of floating. */
export const DIALOG_MIN_W = 30;

export function dialogWidth(W: number): number {
  return Math.max(24, Math.min(64, W - 8));
}

/** The question's lines, wrapped to the window (at most six). */
function dialogLines(o: PromptOverlay, w: number): string[] {
  return wrapWords(sanitize(o.label.trim()), w - 4).slice(0, 6);
}

/** Its rows: the frame, the question, the answer's row (not a yes-or-no's), a blank, the buttons. */
export function dialogHeight(o: PromptOverlay, w: number): number {
  return 2 + dialogLines(o, w).length + (o.confirm ? 0 : 1) + 2;
}

/**
 * A question in a floating window near the top of the content, framed like the lists: the
 * question, the answer typed on its own row (`›`, its end kept in view), and its buttons at the
 * bottom right — OK and Cancel (enter, esc), or Yes and No (y, n) — each clickable.
 */
export function drawDialog(app: App, c: Canvas, o: PromptOverlay, mainY: number, mainH: number, geo: Geometry): Rect {
  const theme = app.theme;
  const W = c.width;
  const w = dialogWidth(W);
  const lines = dialogLines(o, w);
  const h = dialogHeight(o, w);
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const b = app.glyphs.box;
  // A margin in the window's own colour, as the lists have: a row above and below, two columns.
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h.repeat(w - 2)}${b.tr}`, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  lines.forEach((line, i) => drawText(c, x + 2, y + 1 + i, line, { ...bg, bold: true }, w - 4));
  let row = y + 1 + lines.length;
  if (!o.confirm) {
    const px = drawText(c, x + 2, row, "› ", border);
    const room = w - 4 - px - 1;
    const tw = drawText(c, x + 2 + px, row, stringWidth(o.text) > room ? truncateStart(o.text, room) : o.text, bg);
    drawText(c, x + 2 + px + tw, row, " ", roleStyle(theme, "cursor", null));
    row++;
  }
  row++;
  const buttons: [string, string][] = o.confirm
    ? [
        [" Yes  y ", "dlg:ok"],
        [" No  n ", "dlg:cancel"],
      ]
    : [
        [" OK  enter ", "dlg:ok"],
        [" Cancel  esc ", "dlg:cancel"],
      ];
  let bx = x + w - 2 - buttons.reduce((n, [t]) => n + stringWidth(t), 0) - (buttons.length - 1);
  for (const [text, id] of buttons) bx += smallButton(app, c, bx, row, text, id, geo, bg.bg) + 1;
  return { x: x - 2, y: y - 1, w: w + 4, h: h + 2 };
}
