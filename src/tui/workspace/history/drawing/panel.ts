// Owner-local panels drawing: drawHistoryList.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { roleStyle } from "../../../shell/screen/style.ts";
import type { Color } from "../../../../core/rendering/theme/theme.ts";
import { stringWidth, truncate } from "../../../../core/foundation/text/width.ts";
import { paneScrollbar } from "../../../documents/views/drawing/chrome/scrollbars.ts";
import type { HistoryRow } from "../history.ts";
import { sideHScrollbar, sideRow, sideView } from "../../../shell/panels/drawing/rows.ts";
import { followSelection } from "../../../shell/panels/drawing/selection.ts";

/** The history: the window's timeline, newest first, the current place marked `here`. */
export function drawHistoryList(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const rows = app.history.rows();
  const s = app.sidebar;
  const text = (row: HistoryRow) => ` ${row.label}`;
  // Never scrolled sideways: a name too long is cut instead, so every row keeps its hint.
  const sv = sideView(list, rows, () => "", s);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length)
    drawText(
      c,
      rect.x + 1,
      rect.y,
      s.filter ? "no matches" : "no history yet",
      roleStyle(theme, "dim", bg),
      rect.w - 1,
    );
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    if (row.heading) {
      // Over the notes read lately elsewhere: a dim heading, like a list's group.
      drawText(c, rect.x, y, sideRow(text(row), sv), { ...roleStyle(theme, "dim", bg), bold: true }, rect.w);
      continue;
    }
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    const st = roleStyle(theme, selected ? "sidebar_selected" : row.here ? "sidebar_active" : "sidebar", bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    // Its line, `here`, when it was read or which tab has it, at the right: the name is cut (…) to
    // make room for it, down to 10 columns (the hint is what the name alone doesn't say).
    const hintW = stringWidth(row.hint);
    const room = sv.cols - 1 - (hintW ? hintW + 2 : 0);
    const cut = truncate(text(row), hintW && room >= 10 ? room : sv.cols);
    const w = drawText(c, rect.x, y, cut, st, rect.w);
    if (w + 2 + hintW <= sv.cols - 1)
      drawText(c, rect.x + sv.cols - 1 - hintW, y, row.hint, { ...roleStyle(theme, "dim", st.bg), bg: st.bg });
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  sideHScrollbar(app, c, sv, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}
