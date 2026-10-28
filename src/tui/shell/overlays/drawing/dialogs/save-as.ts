// Owner-local overlays drawing: drawSaveAs.

import type { App } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import {
  type SaveAsOverlay,
  type SaveAsGeometry,
  placeOf,
  sizeText,
  dateText,
} from "../../../../documents/saving/saveas.ts";
import type { Geometry } from "../../../screen/geometry/contracts.ts";
import { roleStyle } from "../../../screen/style.ts";
import { truncate, stringWidth, truncateStart } from "../../../../../core/foundation/text/width.ts";
import { smallButton } from "../../../panels/drawing/chrome.ts";

/**
 * The Save As window (10.14), framed like the lists, near the top of the content: its title, the folder it's in; places
 * down the left, the folder's folders and files on the right (a file's size and date, dim); the name at the bottom, its
 * buttons beside it; how its keys go on the bottom border. What has the focus has its selection lit; the rest, marked.
 */
export function drawSaveAs(
  app: App,
  c: Canvas,
  o: SaveAsOverlay,
  mainY: number,
  mainH: number,
  geo: Geometry,
): SaveAsGeometry {
  const theme = app.theme;
  const W = c.width;
  const w = Math.max(30, Math.min(110, W - 8));
  const h = Math.max(9, Math.min(mainH - 1, 28));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(1, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const lit = roleStyle(theme, "overlay_selected", null);
  const g = app.glyphs;
  const b = g.box;
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  // The frame: the title on top; under the folder's row, and above the name's, rules meeting the side borders.
  const pw = Math.min(26, Math.max(12, Math.floor(w / 4)));
  const split = x + 1 + pw;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const rule = (ry: number, joint: string) =>
    drawText(
      c,
      x,
      ry,
      `${b.ml}${b.h.repeat(split - x - 1)}${joint}${b.h.repeat(Math.max(0, x + w - 2 - split))}${b.mr}`,
      border,
    );
  rule(y + 2, b.tm);
  rule(y + h - 3, b.bm);
  const top = y + 3;
  const rows = h - 6;
  for (let k = 0; k < rows; k++) drawText(c, split, top + k, b.v, border, 1);
  // The folder, its end kept in view.
  const path = app.exporter.shownDir(o.dir);
  drawText(
    c,
    x + 2,
    y + 1,
    stringWidth(path) > w - 4 ? truncateStart(path, w - 4) : path,
    { ...bg, bold: true },
    w - 4,
  );
  // The places.
  if (o.place < o.placeScroll) o.placeScroll = o.place;
  if (o.place >= o.placeScroll + rows) o.placeScroll = o.place - rows + 1;
  const holding = placeOf(o.places, o.dir);
  for (let k = 0; k < rows; k++) {
    const i = o.placeScroll + k;
    const p = o.places[i];
    if (!p) break;
    const here = i === holding;
    const selected = i === o.place && o.focus === "places";
    const st = selected ? lit : here ? { ...bg, bold: true } : bg;
    c.fill(x + 1, top + k, pw, 1, st.bg);
    drawText(c, x + 1, top + k, here ? "•" : " ", here && !selected ? border : st, 1);
    drawText(c, x + 2, top + k, truncate(p.label, pw - 2), st, pw - 2);
  }
  // The folder's entries: folders, then files with their size and date.
  const fx = split + 1;
  const fw = x + w - 1 - fx;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  const now = app.now();
  for (let k = 0; k < rows; k++) {
    const i = o.scroll + k;
    const e = o.entries[i];
    if (!e) break;
    const selected = i === o.selected;
    const st = selected && o.focus === "files" ? lit : selected ? { ...bg, bold: true } : bg;
    c.fill(fx, top + k, fw, 1, st.bg);
    const meta = e.dir ? "" : `${sizeText(e.size).padStart(7)}  ${dateText(e.mtime, now)}`;
    const metaW = meta && fw > 40 ? stringWidth(meta) + 2 : 0;
    const icon = e.up ? "  " : e.dir ? `${g.dirClosed} ` : "  ";
    const label = `${selected && o.focus !== "files" ? "›" : " "}${icon}${e.up ? e.name : e.dir ? `${e.name}/` : e.name}`;
    drawText(
      c,
      fx,
      top + k,
      truncate(label, fw - metaW - 1),
      e.dir || selected ? st : { ...dim, bg: st.bg },
      fw - metaW - 1,
    );
    if (metaW) drawText(c, fx + fw - metaW + 1, top + k, meta, { ...dim, bg: st.bg }, metaW - 1);
  }
  const shownEntries = o.entries.filter((e) => !e.up).length;
  if (o.error)
    drawText(
      c,
      fx + 1,
      top + (o.entries.length ? o.entries.length - o.scroll : 0),
      truncate(o.error, fw - 2),
      roleStyle(theme, "warn", bg.bg),
      fw - 2,
    );
  else if (!shownEntries && rows > 1)
    drawText(c, fx + 3, top + o.entries.length - o.scroll, "an empty folder", dim, fw - 4);
  // The name, or a new folder's, and the buttons.
  const ny = y + h - 2;
  const label = o.creating !== null ? "New folder: " : "Name: ";
  const text = o.creating ?? o.name;
  const buttons: [string, string][] =
    o.creating !== null
      ? []
      : [
          [" Export  enter ", "sav:ok"],
          [" Cancel  esc ", "sav:cancel"],
        ];
  const bw = buttons.reduce((n, [t]) => n + stringWidth(t) + 1, 0);
  const lw = drawText(c, x + 2, ny, label, o.focus === "name" || o.creating !== null ? { ...border, bold: true } : dim);
  const room = Math.max(4, w - 4 - lw - bw - 2);
  const tw2 = drawText(c, x + 2 + lw, ny, stringWidth(text) > room ? truncateStart(text, room) : text, bg, room);
  if (o.focus === "name" || o.creating !== null)
    drawText(c, x + 2 + lw + tw2, ny, " ", roleStyle(theme, "cursor", null));
  let bx = x + w - 2 - bw + 1;
  for (const [t, id] of buttons) bx += smallButton(app, c, bx, ny, t, id, geo, bg.bg) + 1;
  // How the keys go, on the bottom border.
  const keys =
    o.creating !== null
      ? " enter makes it · esc doesn't "
      : " tab: places · folder · name   ←: up   ctrl+n: new folder   ~: home ";
  const bottom = `${b.bl}${b.h}`;
  drawText(c, x, y + h - 1, bottom, border);
  const kw = drawText(c, x + 2, y + h - 1, truncate(keys, w - 4), dim, w - 4);
  drawText(c, x + 2 + kw, y + h - 1, b.h.repeat(Math.max(0, w - 3 - kw)) + b.br, border);
  return {
    box: { x: x - 2, y: y - 1, w: w + 4, h: h + 2 },
    places: { x: x + 1, y: top, w: pw, h: rows },
    files: { x: fx, y: top, w: fw, h: rows },
    name: { x: x + 1, y: ny, w: w - 2, h: 1 },
  };
}
