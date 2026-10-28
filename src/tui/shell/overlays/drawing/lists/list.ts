// Owner-local overlays drawing: drawList, FOOTER_ROWS.

import type { App, ListOverlay } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import type { Rect } from "../../../screen/geometry.ts";
import { roleStyle } from "../../../screen/style.ts";
import { truncate, stringWidth, graphemes, graphemeWidth } from "../../../../../core/foundation/text/width.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { drawFooter } from "./footer.ts";
import { drawKeys, marked } from "../common/labels.ts";

export function drawList(
  app: App,
  c: Canvas,
  o: ListOverlay,
  mainY: number,
  mainH: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const w = Math.min(100, W - (W > 60 ? 8 : 0));
  // Rows besides the list: the borders, the input, and the footer (a rule, the entry's name, two
  // rows of explanation, its other keys).
  // The footer only when the list keeps at least four rows beside it.
  const footer = !!o.footer && Math.min(mainH - 2, 30) - ((o.filterable ? 3 : 2) + FOOTER_ROWS + 2) >= 4;
  const inner = (o.filterable ? 3 : 2) + (footer ? FOOTER_ROWS + 1 : 0);
  // Never taller than the content area: on a short screen the status line and the rule stay.
  const h = Math.min(mainH, Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30)));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  // A margin in the window's own colour sets it apart from the content behind it: one row above
  // and below, two columns at the sides (a cell is about twice as tall as it is wide).
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const selectableCount = o.filtered.filter((e) => !e.item.header).length;
  const position = o.filtered.slice(0, o.selected + 1).filter((e) => !e.item.header).length;
  const count = ` ${selectableCount ? position : 0}/${selectableCount} `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(count)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, count + b.br, dim);

  let listY = y + 1;
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 8), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
    listY = y + 2;
  }
  if (footer) drawFooter(app, c, o, x, y + h - 2 - FOOTER_ROWS, w);
  const rows = h - (listY - y) - 1 - (footer ? FOOTER_ROWS + 1 : 0);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  // When the selected entry is the top row, bring its heading (title and rule, not the blank
  // row before them) into view above it; not while the wheel is scrolling the view.
  if (o.scroll === o.selected && !o.wheeled) {
    // …as long as the selected entry stays in view.
    while (
      o.scroll > 0 &&
      o.selected - (o.scroll - 1) < rows &&
      o.filtered[o.scroll - 1]!.item.header &&
      (o.filtered[o.scroll - 1]!.item.label || o.filtered[o.scroll - 1]!.item.rule)
    )
      o.scroll--;
  }
  // Key columns: each as wide as its widest binding in the section, so keys line up down it.
  const colWAt: number[][] = new Array(o.filtered.length);
  if (o.alignKeysAcrossList) {
    const colW = [0, 0, 0];
    for (const e of o.filtered)
      (e.item.keys ?? []).slice(0, 3).forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
    colWAt.fill(colW);
  } else
    for (let i = 0; i < o.filtered.length; ) {
      let j = i;
      while (j < o.filtered.length && o.filtered[j]!.item.header) colWAt[j++] = [0, 0, 0];
      const colW = [0, 0, 0];
      let k = j;
      for (; k < o.filtered.length && !o.filtered[k]!.item.header; k++)
        (o.filtered[k]!.item.keys ?? [])
          .slice(0, 3)
          .forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
      for (let m = j; m < k; m++) colWAt[m] = colW;
      i = k;
    }
  const lastEntry = (() => {
    let last = -1;
    for (let i = 0; i < rows; i++) if (o.filtered[o.scroll + i] && !o.filtered[o.scroll + i]!.item.header) last = i;
    return last;
  })();
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const ry = listY + i;
    const { item, positions } = entry;
    if (item.header) {
      if (item.informational) {
        const text = sanitize(`${item.label}${item.detail ? ` · ${item.detail}` : ""}`);
        drawText(c, x + 2, ry, truncate(text, w - 4), roleStyle(theme, item.role ?? "overlay_group", null));
        continue;
      }
      // Never a heading with nothing under it on screen.
      if (i > lastEntry) continue;
      if (item.rule) drawText(c, x + 2, ry, b.h.repeat(w - 4), roleStyle(theme, "overlay_dim", null), w - 4);
      else if (item.label)
        drawText(c, x + 2, ry, truncate(item.label.toUpperCase(), w - 4), roleStyle(theme, "overlay_group", null));
      continue;
    }
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const indent = (item.indent ?? 0) * 2;
    // Keys at the right: as many as fit beside the label, then an ellipsis.
    const labelW = Math.min(stringWidth(item.label), Math.max(8, Math.floor((w - 6) / 2)));
    const keysRoom = w - 4 - indent - labelW - 2;
    const keysW = item.keys?.length
      ? drawKeys(app, c, x + w - 2, ry, item.keys, keysRoom, selected, st.bg, colWAt[idx]!)
      : 0;
    const hint = item.keys ? "" : (item.hint ?? "");
    const hintW = hint ? stringWidth(hint) + 2 : 0;
    const avail = w - 4 - hintW - (keysW ? keysW + 2 : 0);
    let cx = x + 2 + indent;
    // The filter matched the label as it is: its letters marked where the sanitized label has them.
    const shown = marked(item.label, positions);
    const label = truncate(shown.text, Math.max(4, avail - indent));
    const pos = shown.pos;
    // Its own colour (a diff's line, a change's state), unless selected.
    const own =
      item.role && !selected
        ? {
            ...st,
            fg: roleStyle(theme, item.role, null).fg ?? st.fg,
            bold: roleStyle(theme, item.role, null).bold ?? st.bold,
          }
        : st;
    let ci = 0;
    for (const g of graphemes(label)) {
      const gw = graphemeWidth(g);
      if (gw > 0) c.cell(cx, ry, g, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : own);
      cx += gw;
      ci += g.length;
    }
    if (item.detail && !footer) {
      const room = x + 2 + avail - cx - 2;
      if (room > 4 && item.detailMarks?.length) {
        // A search hit's words, marked in its line.
        const marks = marked(
          item.detail,
          item.detailMarks.flatMap(([a, b]) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k)),
        );
        const detail = truncate(marks.text, room);
        let dx = cx + 2;
        let di = 0;
        for (const g of graphemes(detail)) {
          const gw = graphemeWidth(g);
          const on = marks.pos.has(di);
          if (gw > 0) c.cell(dx, ry, g, gw, on ? { ...st, fg: matchSt.fg, bold: true } : { ...dim, bg: st.bg });
          dx += gw;
          di += g.length;
        }
        cx = dx + 2;
      } else if (room > 4) cx += drawText(c, cx + 2, ry, truncate(item.detail, room), { ...dim, bg: st.bg }) + 2;
    }
    if (hint) drawText(c, x + w - 2 - stringWidth(hint), ry, hint, { ...dim, bg: st.bg });
  }
  if (!selectableCount && !o.filtered.some((entry) => entry.item.informational))
    drawText(c, x + 2, listY, o.input ? "no matches" : "nothing here", dim);
  return { x, y, w, h, listY, rows };
}

export const FOOTER_ROWS = 4;
