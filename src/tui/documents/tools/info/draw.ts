// Owner-local panels drawing: drawInfo.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { roleStyle, pageBg } from "../../../shell/screen/style.ts";
import { stringWidth, truncate } from "../../../../core/foundation/text/width.ts";
import { paneScrollbar } from "../../views/drawing/chrome/scrollbars.ts";
import { RIGHT_VIEWS } from "../../../shell/panels/panels.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { filterRow, paneTitle } from "../../../shell/panels/drawing/chrome.ts";
import { sideView } from "../../../shell/panels/drawing/rows.ts";

/**
 * The Info view (3.19): the file on screen, in sections — File, Properties, Tags, Links — each a
 * heading that folds, over its rows: a name, dim, and its value, cut to the pane (never scrolled
 * sideways). Nested properties indent under their key.
 */
export function drawInfo(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  let rect = paneTitle(
    app,
    c,
    pane,
    RIGHT_VIEWS.find((v) => v.id === "info")!.title,
    app.region === "outline",
    base.bg,
  );
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.info.rows();
  const o = app.outline;
  const g = app.glyphs;
  const sv = sideView(rect, rows, () => "", o);
  rect = sv.list;
  o.selected = Math.max(0, Math.min(o.selected, rows.length - 1));
  if (!o.pinned && o.selected < o.scroll) o.scroll = o.selected;
  if (!o.pinned && o.selected >= o.scroll + rect.h) o.scroll = o.selected - rect.h + 1;
  o.scroll = Math.max(0, Math.min(o.scroll, Math.max(0, rows.length - rect.h)));
  if (!rows.length) {
    drawText(c, rect.x + 1, rect.y, o.filter ? "no matches" : "no file", roleStyle(theme, "dim", base.bg), rect.w - 1);
    return rect;
  }
  // Names in a column, as wide as the longest one shown (at most a third of the pane).
  const keyW = Math.min(
    Math.floor(sv.cols / 3),
    Math.max(4, ...rows.filter((r) => !r.heading).map((r) => r.depth * 2 + stringWidth(r.key))),
  );
  for (let i = 0; i < rect.h; i++) {
    const idx = o.scroll + i;
    const row = rows[idx];
    if (!row) break;
    const y = rect.y + i;
    const selected = idx === o.selected && app.region === "outline";
    const st = roleStyle(theme, selected ? "sidebar_selected" : "sidebar", base.bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    if (row.heading) {
      drawText(
        c,
        rect.x,
        y,
        truncate(` ${row.folded ? g.foldClosed : g.foldOpen} ${row.key}`, sv.cols),
        { ...st, bold: true },
        rect.w,
      );
      continue;
    }
    const name = `${"  ".repeat(row.depth)}${row.key}`;
    const x0 = rect.x + 3;
    drawText(
      c,
      x0,
      y,
      truncate(name, keyW),
      { ...roleStyle(theme, row.section === "Tags" ? "tag" : "dim", st.bg), bg: st.bg },
      keyW,
    );
    const vx = x0 + keyW + 1;
    if (vx < rect.x + sv.cols)
      drawText(c, vx, y, truncate(sanitize(row.value), rect.x + sv.cols - vx), st, rect.x + sv.cols - vx);
  }
  paneScrollbar(app, c, rect, rows.length, o.scroll, "outline", app.region === "outline", base.bg, geo);
  return rect;
}
