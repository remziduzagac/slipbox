// Owner-local overlays drawing: drawMenu, drawDropdown.

import type { App, ListOverlay, ListItem } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Rect } from "../../screen/geometry.ts";
import { roleStyle } from "../../screen/style.ts";
import { truncate, stringWidth, graphemes, graphemeWidth } from "../../../../core/foundation/text/width.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { marked } from "./common/labels.ts";

/**
 * A menu hanging from `anchor` (the explorer row's `…`): framed, its title the row's name, as wide
 * as its entries — each a label and, dim at the right, its key — from the anchor's column (moved
 * left to fit), under its row, or over it when there's no room below.
 */
export function drawMenu(
  app: App,
  c: Canvas,
  o: ListOverlay,
  anchor: { x: number; y: number },
  mainY: number,
  maxY: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  const content = Math.max(stringWidth(o.title) + 4, ...o.items.map((item) => stringWidth(item.label) + hintW(item)));
  const w = Math.min(content + 4, W);
  const h = Math.min(o.filtered.length + 2, Math.max(3, maxY - mainY));
  const x = Math.max(0, Math.min(anchor.x, W - w));
  let y = anchor.y + 1;
  if (y + h > maxY) y = Math.max(mainY, anchor.y - h);
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const b = app.glyphs.box;
  c.fill(x, y, w, h, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${sanitize(o.title)} `, w - 4), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const rows = h - 2;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const item = entry.item;
    const st = idx === o.selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, y + 1 + i, w - 2, 1, st.bg);
    const hw = hintW(item);
    drawText(c, x + 2, y + 1 + i, truncate(sanitize(item.label), Math.max(1, w - 4 - hw)), st);
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), y + 1 + i, item.hint, { ...dim, bg: st.bg });
  }
  return { x, y, w, h, listY: y + 1, rows };
}

/**
 * A list as a dropdown hanging under `anchor` (the breadcrumb's `…`): framed like the other
 * popups, as wide as its rows, entries indented as a tree. Keys, clicks and the wheel are the
 * list's. The margin row above it lies on the rule under the window header, which stays visible.
 */
export function drawDropdown(
  app: App,
  c: Canvas,
  o: ListOverlay,
  anchor: { x: number; y: number },
  maxY: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const g = app.glyphs;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  // Three columns a level: `└─` and a space.
  // Sized over every entry, not the matches, so it keeps its width while you type.
  const content = Math.max(
    20,
    ...o.items.map((item) => (item.indent ?? 0) * 3 + stringWidth(item.label) + hintW(item)),
  );
  // At least half the screen (60 to 100 columns), centred; it hangs under the anchor's row.
  const w = Math.max(10, Math.min(Math.max(content + 4, 60, Math.floor(W / 2)), 100, W - 8));
  const x = Math.max(2, Math.floor((W - w) / 2));
  const y = anchor.y + 2;
  // The filter's row, a blank row, room for at least 8 entries, a blank row.
  const inputRows = o.filterable ? 1 : 0;
  const pad = 1;
  const h = Math.max(3 + inputRows, Math.min(Math.max(8, o.filtered.length) + 2 + inputRows + 2 * pad, maxY - y));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = g.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const tight = h < Math.max(1, o.filtered.length) + 2 + inputRows + 2 * pad; // no room for the blank rows
  const listY = y + 1 + inputRows + (tight ? 0 : pad);
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 6 - px), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
  }
  const rows = h - 2 - inputRows - (tight ? 0 : 2 * pad);
  const matchSt = roleStyle(theme, "overlay_match", null);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const { item, positions } = entry;
    const ry = listY + i;
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const depth = item.indent ?? 0;
    let cx = x + 2 + depth * 3;
    // One heading under the next: each row hangs off the one above with └─.
    if (depth)
      drawText(
        c,
        cx - 3,
        ry,
        `${g.guideLast}${g.guideDash}`,
        { ...roleStyle(theme, "tree_guide", st.bg), bg: st.bg },
        2,
      );
    const hw = hintW(item);
    const shown = marked(item.label, positions);
    const label = truncate(shown.text, Math.max(1, x + w - 2 - hw - cx));
    const pos = shown.pos;
    let ci = 0;
    for (const gr of graphemes(label)) {
      const gw = graphemeWidth(gr);
      if (gw > 0) c.cell(cx, ry, gr, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : st);
      cx += gw;
      ci += gr.length;
    }
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), ry, item.hint, { ...dim, bg: st.bg });
  }
  if (!o.filtered.length) drawText(c, x + 2, listY, "no matches", dim);
  return { x, y, w, h, listY, rows };
}
