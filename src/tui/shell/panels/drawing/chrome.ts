// Owner-local panels drawing: paneTitle, filterRow, smallButton.

import type { App, SidePaneState } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Rect } from "../../screen/geometry.ts";
import type { Geometry } from "../../screen/geometry/contracts.ts";
import { roleStyle } from "../../screen/style.ts";
import type { Color } from "../../../../core/rendering/theme/theme.ts";
import { truncate } from "../../../../core/foundation/text/width.ts";

/** A side pane's title and the blank row under it; returns the rect left for the pane's list.
 *  Short panes skip the title. */
export function paneTitle(app: App, c: Canvas, rect: Rect, title: string, focused: boolean, bg: Color | null): Rect {
  if (rect.h < 8) return rect;
  // Bright while the pane has focus, dimmer otherwise; bold either way.
  drawText(
    c,
    rect.x + 1,
    rect.y,
    title,
    { ...roleStyle(app.theme, focused ? "pane_title_active" : "pane_title", bg), bg },
    rect.w - 1,
  );
  return { ...rect, y: rect.y + 2, h: rect.h - 2 };
}

/**
 * A pane's filter (`/`), at the top of its list while it's open or holds text: the `› text` row
 * and a rule across the pane (joined to its border), then the list. Returns the rect
 * left for the list; a short pane gets only the text row.
 */
export function filterRow(
  app: App,
  c: Canvas,
  rect: Rect,
  s: SidePaneState,
  focused: boolean,
  bg: Color | null,
  geo: Geometry,
): Rect {
  if (!(s.filtering || s.filter) || rect.h <= 2) return rect;
  const theme = app.theme;
  const px = drawText(c, rect.x + 1, rect.y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
  const fw = drawText(c, rect.x + 1 + px, rect.y, truncate(s.filter ?? "", rect.w - 4 - px), {
    ...roleStyle(theme, "text", bg),
    bg,
  });
  if (s.filtering && focused) drawText(c, rect.x + 1 + px + fw, rect.y, " ", roleStyle(theme, "cursor", bg));
  if (rect.h <= 6) return { ...rect, y: rect.y + 1, h: rect.h - 1 };
  drawText(c, rect.x, rect.y + 1, app.glyphs.hbar.repeat(rect.w), { ...roleStyle(theme, "border", bg), bg }, rect.w);
  geo.rules.push({ y: rect.y + 1, x0: rect.x, x1: rect.x + rect.w });
  return { ...rect, y: rect.y + 2, h: rect.h - 2 };
}

/** A one-row button: its text, the hover role under the mouse, a hot region for clicks. */
export function smallButton(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  text: string,
  id: string,
  geo: Geometry,
  bg: Color | null,
): number {
  const st =
    app.mouse.hover === id ? roleStyle(app.theme, "hover", bg) : { ...roleStyle(app.theme, "topbar_button", bg), bg };
  const w = drawText(c, x, y, text, st);
  geo.hot.push({ id, x, y, w, h: 1 });
  return w;
}
