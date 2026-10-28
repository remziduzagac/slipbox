// Owner-local screen drawing: drawBreadcrumb, CRUMB_MAX.

import { roleStyle } from "../../../shell/screen/style.ts";
import { CRUMB_FLOOR, crumbLayout } from "../header-layout.ts";
import type { Color, Role } from "../../../../core/rendering/theme/theme.ts";
import { stringWidth, truncate } from "../../../../core/foundation/text/width.ts";
import type { App, View } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";

/**
 * A window's outline breadcrumb, on its header: `crumbs`, the headings its cursor is under, each clickable. When they
 * don't all fit, the middle collapses into `…` (click: the whole path as a dropdown); then the texts are cut; then the
 * first goes too, then the last, leaving only `…`.
 */
export function drawBreadcrumb(
  app: App,
  c: Canvas,
  view: View,
  crumbs: { text: string; line: number }[],
  x0: number,
  x1: number,
  y: number,
  bg: Color | null,
  geo: Geometry,
): void {
  const theme = app.theme;
  if (!crumbs.length || x1 - x0 < CRUMB_FLOOR) return;
  const index = app.tab!.views.indexOf(view);
  const sep = ` ${app.glyphs.crumb} `;
  // The icon opens the heading finder.
  const iconId = `crumbicon:${index}`;
  const iconSt =
    app.mouse.hover === iconId ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "breadcrumb_icon", bg), bg };
  const iw = drawText(c, x0, y, app.glyphs.crumbIcon, iconSt);
  geo.hot.push({ id: iconId, x: x0, y, w: iw, h: 1 });
  geo.crumbAnchors[index] = { x: x0, y };
  x0 += iw + 1;
  const plan = crumbLayout(
    crumbs.map((p) => Math.min(CRUMB_MAX, stringWidth(p.text))),
    x1 - x0,
    stringWidth(sep),
  );
  let cx = x0;
  plan.forEach((p, k) => {
    if (k) cx += drawText(c, cx, y, sep, { ...roleStyle(theme, "breadcrumb_sep", bg), bg }, x1 - cx);
    if (p === "more") {
      const id = `crumbmore:${index}`;
      const st = app.mouse.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "breadcrumb", bg), bg };
      const w = drawText(c, cx, y, "…", st);
      geo.hot.push({ id, x: cx, y, w, h: 1 });
      geo.crumbAnchors[index] = { x: cx, y };
      cx += w;
      return;
    }
    const crumb = crumbs[p.i]!;
    const id = `crumb:${index}:${crumb.line}`;
    const role: Role = p.i === crumbs.length - 1 ? "breadcrumb_current" : "breadcrumb";
    const st = app.mouse.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, role, bg), bg };
    const w = drawText(c, cx, y, truncate(crumb.text, p.w), st);
    geo.hot.push({ id, x: cx, y, w, h: 1 });
    cx += w;
  });
}

export const CRUMB_MAX = 40;
