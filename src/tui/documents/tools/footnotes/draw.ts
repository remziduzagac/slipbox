// Owner-local panels drawing: drawFootnotes.

import { followSelection } from "../../../shell/panels/drawing/selection.ts";

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { roleStyle, pageBg } from "../../../shell/screen/style.ts";
import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { stringWidth, truncate } from "../../../../core/foundation/text/width.ts";
import { paneScrollbar } from "../../views/drawing/chrome/scrollbars.ts";
import { RIGHT_VIEWS } from "../../../shell/panels/panels.ts";
import { filterRow, paneTitle, smallButton } from "../../../shell/panels/drawing/chrome.ts";
import { sideHScrollbar, sideRow, sideView } from "../../../shell/panels/drawing/rows.ts";

/**
 * The note's footnotes (3.17), the right panel's other view: each footnote — `[label]` and its
 * text, how many references it has at the right — and, unfolded under it, each reference with its
 * line. A footnote nothing refers to, or a reference with no definition, is marked. While the view
 * isn't focused, its selection follows the cursor.
 */
export function drawFootnotes(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const title = RIGHT_VIEWS.find((v) => v.id === "footnotes")!.title;
  let rect = paneTitle(app, c, pane, title, app.region === "outline", base.bg);
  // Its title: a new footnote, at its right end (3.18).
  const add = ` ${app.glyphs.newNote} `;
  const ax = pane.x + pane.w - 1 - stringWidth(add);
  if (rect !== pane && ax >= pane.x + stringWidth(title) + 3)
    smallButton(app, c, ax, pane.y, add, "fn:add", geo, base.bg);
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.footnotes.rows();
  const o = app.outline;
  const g = app.glyphs;
  const hint = (row: (typeof rows)[number]) =>
    row.ref
      ? ""
      : row.fn.line === null
        ? "no definition"
        : row.fn.references.length
          ? `${row.fn.references.length}×`
          : "unused";
  const text = (row: (typeof rows)[number]) =>
    row.ref
      ? `   ${g.guideLast}${g.guideDash} ${row.text}`
      : ` ${row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " "} ${row.text}`;
  // Never scrolled sideways (as the history): a long row is cut, so its count stays in sight.
  const sv = sideView(rect, rows, () => "", o);
  rect = sv.list;
  const current = app.footnotes.current();
  if (app.region !== "outline" && current >= 0) o.selected = current;
  followSelection(o, rows.length, rect.h);
  if (!rows.length) {
    drawText(
      c,
      rect.x + 1,
      rect.y,
      o.filter ? "no matches" : "no footnotes",
      roleStyle(theme, "dim", base.bg),
      rect.w - 1,
    );
    return rect;
  }
  for (let i = 0; i < rect.h; i++) {
    const idx = o.scroll + i;
    const row = rows[idx];
    if (!row) break;
    const y = rect.y + i;
    const selected = idx === o.selected && app.region === "outline";
    let role: Role = idx === current ? "sidebar_active" : row.ref ? "dim" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, base.bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const h = hint(row);
    const hw = h ? stringWidth(h) + 1 : 0;
    drawText(c, rect.x, y, truncate(sideRow(text(row), sv), Math.max(1, sv.cols - hw)), st, rect.w);
    if (h)
      drawText(
        c,
        rect.x + sv.cols - hw + 1,
        y,
        h,
        { ...roleStyle(theme, row.fn.line === null ? "warn" : "dim", st.bg), bg: st.bg },
        hw,
      );
  }
  paneScrollbar(app, c, rect, rows.length, o.scroll, "outline", app.region === "outline", base.bg, geo);
  sideHScrollbar(app, c, sv, "outline", app.region === "outline", base.bg, geo);
  return rect;
}
