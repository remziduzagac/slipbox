// A list of places' preview (EG-D2), drawn: where the list and its preview go — beside it on a screen
// `ui.narrow_width` wide or more, under it on a narrower one — the preview's frame and window, and the list's keys
// in its bottom border.

import type { App, ListOverlay } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import type { Rect } from "../../../screen/geometry.ts";
import type { Geometry } from "../../../screen/geometry/contracts.ts";
import { pageBg, roleStyle } from "../../../screen/style.ts";
import type { CellStyle } from "../../../../../core/rendering/layout/style.ts";
import { stringWidth, truncate, truncateStart } from "../../../../../core/foundation/text/width.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { drawPane } from "../../../../documents/views/drawing/pane.ts";

/** A list's rectangle as the mouse reads it: its rows; with a preview, the whole of both, and the preview's button. */
export type ListGeometry = Rect & { listY: number; rows: number; box?: Rect; toggle?: Rect };

/** The fewest rows and columns a preview is drawn in: less, and the list is drawn alone. */
const MIN_ROWS = 8;
const MIN_COLUMNS = 30;

/**
 * Where a list goes, and its preview: a list of places with its preview shown is as tall as a full list (30 rows, or
 * the content area less two), the list half the width (its usual 100 columns at most) and the preview the rest beside
 * it — or, narrower than `ui.narrow_width`, the list's usual width, its rows above and the preview under them.
 */
export function listBox(
  app: App,
  o: ListOverlay,
  W: number,
  mainY: number,
  mainH: number,
  inner: number,
): Rect & { preview: Rect | null } {
  const tall = Math.min(mainH, Math.max(inner + 1, Math.min(mainH - 2, 30)));
  const usual = Math.min(100, W - (W > 60 ? 8 : 0));
  const shown = !!o.places && app.preview.shown && !o.anchor;
  if (shown && W >= app.config.ui.narrow_width && W - 8 >= 2 * MIN_COLUMNS && tall >= MIN_ROWS) {
    const w = Math.min(100, Math.floor((W - 8) / 2));
    const y = mainY + Math.max(0, Math.min(2, mainH - tall));
    return { x: 4, y, w, h: tall, preview: { x: 4 + w, y, w: W - 8 - w, h: tall } };
  }
  // Under: the list keeps four rows of entries at least, the preview the rest.
  const listH = Math.max(inner + 5, Math.floor((tall * 2) / 5));
  if (shown && usual >= MIN_COLUMNS && tall - listH >= MIN_ROWS) {
    const y = mainY + Math.max(0, Math.min(2, mainH - tall));
    const x = Math.floor((W - usual) / 2);
    return { x, y, w: usual, h: listH, preview: { x, y: y + listH, w: usual, h: tall - listH } };
  }
  // Never taller than the content area: on a short screen the status line and the rule stay.
  const h = Math.min(mainH, Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30)));
  return { x: Math.floor((W - usual) / 2), y: mainY + Math.max(0, Math.min(2, mainH - h)), w: usual, h, preview: null };
}

/** The rectangle holding both. */
export function spanning(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * A list of places' keys, in its bottom border from `x`, in `room` columns: `ctrl+t hide` (`ctrl+t show` while it's
 * hidden), the button a click presses, then `alt+enter where` while there's room; the button's rectangle, or null.
 */
export function drawPlacesKeys(app: App, c: Canvas, x: number, y: number, room: number, dim: CellStyle): Rect | null {
  const toggle = ` ctrl+t ${app.preview.shown ? "hide" : "show"} `;
  const where = `· alt+enter where `;
  if (stringWidth(toggle) > room - 2) return null;
  const w = drawText(c, x, y, toggle, dim);
  if (stringWidth(toggle) + stringWidth(where) <= room - 2) drawText(c, x + w, y, where, dim);
  return { x, y, w, h: 1 };
}

/**
 * The preview in `r`: framed like the list, its title the place (`notes/index.md:12`, `kestrel › docs/x.md:3`), and in
 * it the file's window, landed at its hit — or why there's none (`reading…`). What the window registers for the mouse
 * is left out: the list has the mouse while it's open.
 */
export function drawPreview(app: App, c: Canvas, o: ListOverlay, r: Rect, geo: Geometry): void {
  const theme = app.theme;
  const b = app.glyphs.box;
  const border = roleStyle(theme, "overlay_border", null);
  const shown = app.preview.show(o, o.filtered[o.selected]?.item.place);
  const title = shown.title ? ` ${truncateStart(sanitize(shown.title), Math.max(1, r.w - 8))} ` : "";
  drawText(c, r.x, r.y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, r.x + 2, r.y, title, { ...border, bold: true });
  drawText(c, r.x + 2 + tw, r.y, b.h.repeat(Math.max(0, r.w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < r.h - 1; k++) {
    drawText(c, r.x, r.y + k, b.v, border, 1);
    drawText(c, r.x + r.w - 1, r.y + k, b.v, border, 1);
  }
  drawText(c, r.x, r.y + r.h - 1, `${b.bl}${b.h.repeat(Math.max(0, r.w - 2))}${b.br}`, border);
  const inside = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
  c.fill(inside.x, inside.y, inside.w, inside.h, pageBg(theme));
  if ("said" in shown) {
    drawText(c, inside.x + 1, inside.y, truncate(shown.said, inside.w - 2), roleStyle(theme, "dim", pageBg(theme)));
    return;
  }
  const kept = [geo.hot, geo.panes, geo.scrollbars, geo.rules, geo.pictures].map(
    (list) => [list, list.length] as const,
  );
  app.preview.land(shown.view, inside);
  drawPane(app, c, shown.view, inside, false, false, false, false, geo);
  for (const [list, length] of kept) list.length = length;
}
