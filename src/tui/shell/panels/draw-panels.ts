// Drawing the side panels: on the left the explorer's tree and its breadcrumb, source control's list, the history;
// on the right the Info view, the footnotes, the outline — each with its title, its filter row, its scrolling.

import type { App } from "../../app/runtime/app.ts";
import type { Canvas } from "../terminal/canvas.ts";
import type { Rect } from "../screen/geometry.ts";
import type { Geometry } from "../screen/geometry/contracts.ts";
import { roleStyle, pageBg } from "../screen/style.ts";
import { stringWidth } from "../../../core/foundation/text/width.ts";
import { LEFT_VIEWS } from "./panels.ts";
import { drawGitPanel } from "../../workspace/git/views/panel/draw-git.ts";
import { filterRow, paneTitle, smallButton } from "./drawing/chrome.ts";
import { drawCrumbs, drawTree } from "../../workspace/explorer/drawing/panel.ts";
import { drawHistoryList } from "../../workspace/history/drawing/panel.ts";

/** The left panel: the explorer's tree or the history; returns the rect its list occupies. */
export function drawSidebar(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const view = app.leftView;
  const title = LEFT_VIEWS.find((v) => v.id === view)!.title;
  let rect = paneTitle(app, c, pane, title, app.region === "sidebar", base.bg);
  // The explorer's title: a new note and a new folder, at its right end (18.1).
  if (view === "explorer" && rect !== pane) {
    const g = app.glyphs;
    const buttons: [string, string][] = [
      [g.newNote, "xnew:note"],
      [g.newFolder, "xnew:folder"],
    ];
    let x = pane.x + pane.w - 1;
    for (const [glyph, id] of buttons.reverse()) {
      const w = stringWidth(glyph) + 2;
      x -= w;
      if (x < pane.x + stringWidth(title) + 3) break;
      smallButton(app, c, x, pane.y, ` ${glyph} `, id, geo, base.bg);
    }
    // Under the title, the breadcrumb: what's above the view (VV-D5).
    drawCrumbs(app, c, pane.x + 1, pane.y + 1, pane.w - 1, base.bg, geo);
  }
  // The git panel: its top (the branch, the message box, the buttons) above its filter (draw-git.ts).
  if (view === "git") return drawGitPanel(app, c, rect, base.bg, geo);
  const s = app.sidebar;
  rect = filterRow(app, c, rect, s, app.region === "sidebar", base.bg, geo);
  return view === "history" ? drawHistoryList(app, c, rect, base.bg, geo) : drawTree(app, c, rect, base.bg, geo);
}

export { filterRow, smallButton } from "./drawing/chrome.ts";
export { followSelection } from "./drawing/selection.ts";
export { drawInfo } from "../../documents/tools/info/draw.ts";
export { drawFootnotes } from "../../documents/tools/footnotes/draw.ts";
export { drawOutline } from "../../documents/tools/outline/draw.ts";
