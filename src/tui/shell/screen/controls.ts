import type { Theme, Color, Role } from "../../../core/rendering/theme/theme.ts";
import { stringWidth } from "../../../core/foundation/text/width.ts";
import { prettyKey } from "../input/keys.ts";
import { type Canvas, drawText } from "../terminal/canvas.ts";
import { type Band, type HotGeometry, mid } from "./geometry.ts";
import { roleStyle } from "./style.ts";

export interface KeyContext {
  leader: string;
  glyphs: { mode: string };
}
export interface ButtonContext {
  theme: Theme;
  mouse: { hover: string | null };
}
/** A key as which-key and the status line show it (`␣ l y`; with ASCII glyphs `SPC l y`). */
export function keyText(app: KeyContext, key: string): string {
  const k = prettyKey(key, app.leader);
  return app.glyphs.mode === "ascii" ? k.replaceAll("␣", "SPC") : k;
}
/**
 * A clickable label filling the bar's full height, drawn with the hover role while the mouse is
 * over it, unless `hovers` is false (a click that changes nothing, or can't). `role` null draws the text on the bar's
 * own background.
 */
export function button(
  app: ButtonContext,
  c: Canvas,
  x: number,
  band: Band,
  text: string,
  role: Role,
  id: string,
  geo: HotGeometry,
  barBg: Color | null,
  maxW = Number.POSITIVE_INFINITY,
  hovers = true,
): number {
  const theme = app.theme;
  const st = roleStyle(theme, hovers && app.mouse.hover === id ? "hover" : role, barBg);
  const w = Math.min(stringWidth(text), maxW);
  if (w <= 0) return 0;
  c.fill(x, band.y, w, band.h, st.bg ?? null);
  drawText(c, x, mid(band), text, st, maxW);
  geo.hot.push({ id, x, y: band.y, w, h: band.h });
  return w;
}
