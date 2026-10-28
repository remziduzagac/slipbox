// Owner-local pane drawing: paneScrollbar, drawHScrollbar, drawScrollbar.

import type { App } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../../shell/screen/geometry/contracts.ts";
import { roleStyle } from "../../../../shell/screen/style.ts";
import type { Color } from "../../../../../core/rendering/theme/theme.ts";

/** A side pane's scrollbar, in its list's last column, when the list is longer than the pane. */
export function paneScrollbar(
  app: App,
  c: Canvas,
  rect: Rect,
  total: number,
  top: number,
  pane: "sidebar" | "outline",
  active: boolean,
  bg: Color | null,
  geo: Geometry,
): void {
  if (total <= rect.h || rect.h < 2) return;
  const bar = { x: rect.x + rect.w - 1, y: rect.y, w: 1, h: rect.h };
  drawScrollbar(app, c, bar, total, top, active, bg);
  geo.scrollbars.push({ ...bar, pane, total });
}

/** The horizontal scrollbar: a `▄` track with a `▄` thumb for `total` columns from `left`. */
export function drawHScrollbar(
  app: App,
  c: Canvas,
  r: Rect,
  total: number,
  left: number,
  active: boolean,
  bg: Color | null,
): void {
  const theme = app.theme;
  const thumb = Math.max(2, Math.round((r.w * r.w) / total));
  const pos = Math.round((left / Math.max(1, total - r.w)) * (r.w - thumb));
  const st = { ...roleStyle(theme, active ? "scrollbar" : "border", bg), bg };
  const track = { ...roleStyle(theme, "scrollbar_track", bg), bg };
  const trackGlyph = theme.roles.scrollbar_track.fg ? app.glyphs.hScrollTrack : " ";
  drawText(c, r.x, r.y, trackGlyph.repeat(r.w), track, r.w);
  drawText(c, r.x + pos, r.y, app.glyphs.hScrollThumb.repeat(thumb), st, thumb);
}

/** A scrollbar: a `▐` track with a `▐` thumb sized and placed for `total` rows from `top`. */
export function drawScrollbar(
  app: App,
  c: Canvas,
  r: Rect,
  total: number,
  top: number,
  active: boolean,
  bg: Color | null,
): void {
  const theme = app.theme;
  const thumb = Math.max(1, Math.round((r.h * r.h) / total));
  const pos = Math.round((top / Math.max(1, total - r.h)) * (r.h - thumb));
  const st = { ...roleStyle(theme, active ? "scrollbar" : "border", bg), bg };
  const track = { ...roleStyle(theme, "scrollbar_track", bg), bg };
  // Without colour (NO_COLOR) the track is blank, so the thumb's shape shows where you are.
  const trackGlyph = theme.roles.scrollbar_track.fg ? app.glyphs.scrollTrack : " ";
  for (let k = 0; k < r.h; k++) drawText(c, r.x, r.y + k, trackGlyph, track, 1);
  for (let k = 0; k < thumb; k++) drawText(c, r.x, r.y + pos + k, app.glyphs.scrollThumb, st, 1);
}
