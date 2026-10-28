// Owner-local panels drawing: drawOutline.

import { followSelection } from "../../../shell/panels/drawing/selection.ts";

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { roleStyle, pageBg } from "../../../shell/screen/style.ts";
import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { paneScrollbar } from "../../views/drawing/chrome/scrollbars.ts";
import { RIGHT_VIEWS } from "../../../shell/panels/panels.ts";
import { filterRow, paneTitle } from "../../../shell/panels/drawing/chrome.ts";
import { drawGuides, treeLines } from "../../../shell/panels/drawing/tree.ts";
import { sideHScrollbar, sideRow, sideView } from "../../../shell/panels/drawing/rows.ts";

/** The outline; returns the rect its headings occupy (under the title). */
export function drawOutline(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  let rect = paneTitle(
    app,
    c,
    pane,
    RIGHT_VIEWS.find((v) => v.id === "outline")!.title,
    app.region === "outline",
    base.bg,
  );
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.outlineView.rows();
  const lines = treeLines(rows.map((r) => r.level - 1));
  const o = app.outline;
  const g = app.glyphs;
  const text = (row: (typeof rows)[number]) => {
    const marker = row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " ";
    return `${" ".repeat(1 + (row.level - 1) * 2)}${marker} ${row.text}`;
  };
  const sv = sideView(rect, rows, text, o);
  rect = sv.list;
  const current = app.outlineView.currentSection();
  // While the outline is not focused, it follows the cursor's section.
  if (app.region !== "outline" && current >= 0) o.selected = current;
  followSelection(o, rows.length, rect.h);
  if (!rows.length) {
    drawText(c, rect.x + 1, rect.y, "no headings", roleStyle(theme, "dim", base.bg), rect.w - 1);
    return rect;
  }
  for (let i = 0; i < rect.h; i++) {
    const idx = o.scroll + i;
    const row = rows[idx];
    if (!row) break;
    const y = rect.y + i;
    const selected = idx === o.selected && app.region === "outline";
    let role: Role = idx === current ? "sidebar_active" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, base.bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    drawText(c, rect.x, y, sideRow(text(row), sv), st, rect.w);
    drawGuides(app, c, rect, y, row.level - 1, lines[idx]!, st.bg, sv.left);
  }
  paneScrollbar(app, c, rect, rows.length, o.scroll, "outline", app.region === "outline", base.bg, geo);
  sideHScrollbar(app, c, sv, "outline", app.region === "outline", base.bg, geo);
  return rect;
}
