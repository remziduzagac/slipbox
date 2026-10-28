// Owner-local screen drawing: drawContent.

import type { Rect } from "../../shell/screen/geometry.ts";
import { roleStyle, pageBg } from "../../shell/screen/style.ts";
import { stringWidth } from "../../../core/foundation/text/width.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../shell/terminal/canvas.ts";
import { drawPane } from "../../documents/views/drawing/pane.ts";
import type { Geometry } from "../../shell/screen/geometry/contracts.ts";

/** `ruleAbove`: the row above `area` is a rule already, so the top windows don't draw their own. */
export function drawContent(app: App, c: Canvas, area: Rect, ruleAbove: boolean, geo: Geometry): void {
  const tab = app.tab;
  const theme = app.theme;
  const page = pageBg(theme);
  if (!tab) {
    const msg = "No note open — ctrl+p opens one, ? lists keys";
    drawText(
      c,
      area.x + Math.max(1, Math.floor((area.w - stringWidth(msg)) / 2)),
      area.y + Math.floor(area.h / 2),
      msg,
      roleStyle(theme, "dim", page),
      area.w,
    );
    return;
  }
  const focusContent = app.region === "content";
  // Too short for two stacked windows: just the active one.
  const tooShort = tab.views.length === 2 && app.windows.orientation(tab) !== "side" && area.h < 6;
  if (tooShort) {
    drawPane(app, c, tab.views[tab.active]!, area, focusContent, false, ruleAbove, true, geo);
    return;
  }
  if (tab.views.length === 1) {
    drawPane(app, c, tab.views[0]!, area, focusContent, false, ruleAbove, true, geo);
    return;
  }
  const [a, b] = tab.views as [View, View];
  const border = roleStyle(theme, "border", page);
  if (app.windows.orientation(tab) === "side") {
    const w1 = Math.max(12, Math.min(area.w - 13, Math.round((area.w - 1) * tab.ratio)));
    drawPane(app, c, a, { ...area, w: w1 }, focusContent, true, ruleAbove, false, geo);
    for (let y = area.y; y < area.y + area.h; y++) drawText(c, area.x + w1, y, app.glyphs.vbar, border, 1);
    // With a frame, rules sit right above and below the content area.
    geo.verticals.push({
      x: area.x + w1,
      y0: area.y - (ruleAbove ? 1 : 0),
      y1: area.y + area.h - (ruleAbove ? 0 : 1),
      style: border,
    });
    geo.separators.push({ kind: "split-side", x: area.x + w1, y: area.y, w: 1, h: area.h, area });
    drawPane(
      app,
      c,
      b,
      { x: area.x + w1 + 1, y: area.y, w: area.w - w1 - 1, h: area.h },
      focusContent,
      true,
      ruleAbove,
      true,
      geo,
    );
  } else {
    const h1 = Math.max(3, Math.min(area.h - 3, Math.round(area.h * tab.ratio)));
    drawPane(app, c, a, { ...area, h: h1 }, focusContent, true, ruleAbove, true, geo);
    // The lower window's title row is the stacked split's handle.
    geo.separators.push({ kind: "split-stacked", x: area.x, y: area.y + h1, w: area.w, h: 1, area });
    drawPane(
      app,
      c,
      b,
      { x: area.x, y: area.y + h1, w: area.w, h: area.h - h1 },
      focusContent,
      true,
      false,
      false,
      geo,
    );
  }
}
