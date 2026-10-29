// Owner-local overlays drawing: choiceHelpRows, drawChoiceDialog.

import type { App } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import { type DialogGeometry, type DialogOverlay, cursorHelp, dimmed } from "../../dialog.ts";
import { roleStyle } from "../../../screen/style.ts";
import { truncate } from "../../../../../core/foundation/text/width.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { wrapWords } from "../common/labels.ts";
import { dialogWidth } from "./prompt.ts";

/** The help under a dialog's rule: as many rows as the longest row's help needs (at most three), so the window
 *  doesn't change its height as the cursor moves. */
function choiceHelpRows(o: DialogOverlay, w: number): number {
  const helps = [...o.choices.map((ch) => ch.help), ...o.checkboxes.map((b) => b.help)];
  return Math.min(3, Math.max(0, ...helps.map((h) => wrapWords(sanitize(h), w - 4).length)));
}

/**
 * A dialog of choices (UPG): framed like a question's window, its title in its top border; its text, wrapped; its
 * choices, one a row, the marked one `●` (`(*)` in ASCII's glyphs) and the others `○`; its checkboxes, `☑` or `☐` as
 * a task's, one the marked choice doesn't take dimmed; under a rule, what the row under the cursor does; its keys in
 * its bottom border. The row under the cursor is lit.
 */
export function drawChoiceDialog(app: App, c: Canvas, o: DialogOverlay, mainY: number, mainH: number): DialogGeometry {
  const theme = app.theme;
  const W = c.width;
  // What arrives before it's on the screen, and a half second after, never answers it (dialog.ts).
  o.drawnAt ??= app.now();
  // Never wider than the screen: a narrow terminal shows it whole, its rows cut short.
  const w = Math.max(8, Math.min(dialogWidth(W), W - 2));
  let text = wrapWords(sanitize(o.text.trim()), w - 4).slice(0, 6);
  let helpRows = choiceHelpRows(o, w);
  const boxes = o.checkboxes.length;
  const height = () => 2 + text.length + 1 + o.choices.length + (boxes ? 1 + boxes : 0) + (helpRows ? 1 + helpRows : 0);
  // A short screen: the help goes first, then the text's lines but one, so the choices and the keys stay on it.
  if (height() > mainH) helpRows = 0;
  if (height() > mainH) text = text.slice(0, Math.max(1, text.length - (height() - mainH)));
  const h = height();
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const lit = roleStyle(theme, "overlay_selected", null);
  const g = app.glyphs;
  const b = g.box;
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${sanitize(o.title)} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  text.forEach((line, i) => drawText(c, x + 2, y + 1 + i, line, { ...bg, bold: true }, w - 4));
  const rows: DialogGeometry["rows"] = [];
  const row = (ry: number, n: number, mark: string, label: string, st: typeof bg) => {
    const selected = n === o.cursor;
    const style = selected ? lit : st;
    c.fill(x + 1, ry, w - 2, 1, style.bg);
    drawText(c, x + 2, ry, truncate(`${mark} ${sanitize(label)}`, w - 4), style, w - 4);
    rows.push({ y: ry, x: x + 1, w: w - 2, row: n });
  };
  let ry = y + 1 + text.length + 1;
  o.choices.forEach((ch, i) => {
    row(ry++, i, i === o.chosen ? g.choiceOn : g.choiceOff, ch.label, i === o.chosen ? { ...bg, bold: true } : bg);
  });
  if (boxes) ry++;
  o.checkboxes.forEach((box, i) => {
    row(ry++, o.choices.length + i, box.ticked ? g.checkDone : g.checkTodo, box.label, dimmed(o, box) ? dim : bg);
  });
  if (helpRows) {
    drawText(c, x, ry, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, border);
    wrapWords(sanitize(cursorHelp(o)), w - 4)
      .slice(0, helpRows)
      .forEach((line, i) => drawText(c, x + 2, ry + 1 + i, line, dim, w - 4));
  }
  const keys = ` enter: do it${boxes ? " · space: tick" : ""} · esc: ${o.escape} `;
  drawText(c, x, y + h - 1, `${b.bl}${b.h}`, border);
  const kw = drawText(c, x + 2, y + h - 1, truncate(keys, w - 4), dim, w - 4);
  drawText(c, x + 2 + kw, y + h - 1, b.h.repeat(Math.max(0, w - 3 - kw)) + b.br, border);
  return { box: { x: x - 2, y: y - 1, w: w + 4, h: h + 2 }, rows };
}
