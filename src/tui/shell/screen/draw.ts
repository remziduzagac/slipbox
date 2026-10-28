// Painting the app (3.1, 3.2): tab bar, explorer | content (one split) | outline, status line,
// the which-key popup and overlays. Viewport-only: only the rows on screen are drawn. This file
// lays the screen out and draws its frame — the top bar, the tabs, the rails, the breadcrumb, the
// rules between panes; each region's own drawing is a draw-*.ts of its own (D235): the windows'
// (draw-pane.ts, their headers draw-header.ts), the side panels' (draw-panels.ts), the Problems
// panel's, the status line's, what floats over the windows (draw-overlays.ts).
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import { clipRules, coverHot } from "./geometry.ts";
import { roleStyle, pageBg } from "./style.ts";
import type { App } from "../../app/runtime/app.ts";
import { type Canvas, drawText } from "../terminal/canvas.ts";
import { drawTopBar } from "./topbar/draw-topbar.ts";
import { drawCompletion, drawSignature } from "../../documents/views/drawing/chrome/popups.ts";
import { drawSidebar } from "../panels/draw-panels.ts";
import { drawInfo } from "../../documents/tools/info/draw.ts";
import { drawFootnotes } from "../../documents/tools/footnotes/draw.ts";
import { drawOutline } from "../../documents/tools/outline/draw.ts";
import { drawProblemsPanel } from "../../documents/diagnostics/draw-problems.ts";
import { drawStatus, drawBottomLine, TOAST_MIN_W, drawToasts } from "./statusbar/draw-status.ts";
import { drawSaveAs } from "../overlays/drawing/dialogs/save-as.ts";
import { drawFloating } from "../overlays/drawing/floating.ts";
import { DIALOG_MIN_W, dialogWidth, dialogHeight, drawDialog } from "../overlays/drawing/dialogs/prompt.ts";
import { drawChoiceDialog } from "../overlays/drawing/dialogs/choices.ts";
import { drawMenu, drawDropdown } from "../overlays/drawing/menus.ts";
import { drawWhichKey } from "../overlays/drawing/which-key.ts";
import { drawList } from "../overlays/drawing/lists/list.ts";
import type { Geometry } from "./geometry/contracts.ts";
import { drawTabs } from "../../windows/drawing/tabs.ts";
import { drawContent } from "../../windows/drawing/content.ts";
import { drawJoints, drawRail } from "./frame/drawing.ts";

export function drawApp(app: App, c: Canvas): Geometry {
  c.cursor?.(null);
  // ASCII glyphs: what a console without Unicode can draw, every text drawn (drawText).
  c.asciiGlyphs = app.glyphs.mode === "ascii";
  const theme = app.theme;
  const page = pageBg(theme);
  const W = c.width;
  const H = c.height;
  const geo: Geometry = {
    panes: [],
    sidebar: null,
    outline: null,
    sidebarPane: null,
    outlinePane: null,
    tabs: [],
    overlay: null,
    hot: [],
    separators: [],
    scrollbars: [],
    pictures: [],
    tabStrip: null,
    popup: null,
    crumbAnchors: {},
    rules: [],
    verticals: [],
  };
  c.fill(0, 0, W, H, page);
  if (W < 10 || H < 4) {
    drawText(c, 0, 0, "slipbox: too small", roleStyle(theme, "warn", page), W);
    return geo;
  }
  const zen = app.ui.zen;
  const topBar = 1;
  const tabBar = app.tabs.length > 0 && !zen ? 1 : 0;
  const status = zen ? 0 : 1;
  const head = topBar;
  // The frame: a rule across the top of the explorer, the tab strip (or the window) and the
  // outline, and one across their bottom; with tabs, another under the strip, over the note and
  // the outline. Zen has none.
  const frame = !zen;
  const mainY = frame ? head + 1 + (tabBar ? 2 : 0) : head;
  const mainH = H - mainY - (frame ? 1 : 0) - status;
  // The Problems panel (1.7), across the whole width under the windows and the side panes, over the
  // frame's bottom rule: its tabs' row and its list, under a rule of its own that a drag resizes. As high as
  // it was resized, else a third of the rows; never leaving the note under 4 (a screen too short keeps it).
  const panel = app.problems.panelRows(mainH);
  const bodyH = mainH - (panel ? panel + 1 : 0);
  const bottom = mainY + bodyH - 1;
  // Borders run down to the bottom rule, where they join it.
  const borderEnd = frame ? bottom + 1 : bottom;

  const sideW = app.panels.sidebarWidth();
  const outW = app.panels.outlineWidth();
  // The rails take the edges: the left one under the top bar, the right one under the tab strip.
  // Everything else shares what's between them (LW to RW).
  const LW = app.panels.leftRailWidth;
  const RW = W - app.panels.rightRailWidth;
  const beside = app.panels.sidebarShown && app.panels.sidebarBeside;
  const left = LW + (app.panels.sidebarBeside ? sideW + 1 : 0);
  const right = app.panels.outlineBeside ? outW + 1 : 0;
  const rule = (y: number, x0: number, x1: number) => {
    if (x1 <= x0) return;
    drawText(c, x0, y, app.glyphs.hbar.repeat(x1 - x0), roleStyle(theme, "border", page), x1 - x0);
    geo.rules.push({ y, x0, x1 });
  };

  if (frame) {
    rule(head, 0, W);
    rule(mainY + mainH, 0, W);
  }
  if (panel) {
    rule(bottom + 1, 0, W);
    geo.separators.push({
      kind: "problems",
      x: 0,
      y: bottom + 1,
      w: W,
      h: 1,
      area: { x: 0, y: mainY, w: W, h: mainH },
    });
    geo.problems = drawProblemsPanel(app, c, { x: 0, y: bottom + 2, w: W, h: panel }, geo);
  }
  if (tabBar) {
    // Tabs hold the note and its outline, not the explorer: the strip starts after the explorer.
    const x0 = beside ? left : LW;
    drawTabs(app, c, x0, { y: head + 1, h: 1 }, geo);
    rule(head + 2, x0, W);
  }
  drawContent(app, c, { x: left, y: mainY, w: Math.max(0, RW - left - right), h: bodyH }, frame, geo);
  if (LW) drawRail(app, c, "left", LW - 1, frame ? head : 0, frame ? head + 1 : 0, bottom, borderEnd, geo);
  if (RW < W) drawRail(app, c, "right", RW, frame ? head + (tabBar ? 2 : 0) : mainY, mainY, bottom, borderEnd, geo);

  if (app.panels.sidebarShown) {
    const w = app.panels.sidebarBeside ? sideW : Math.min(sideW + 6, RW - LW - 6);
    // Beside the content, the explorer runs from under the frame's top rule to the status line,
    // whether or not the tab strip shows; its border runs up beside the strip. It starts after
    // the left rail (LW), and its border is at bx.
    const sideY = beside && frame ? head + 1 : mainY;
    const bx = LW + w;
    const rect = { x: LW, y: sideY, w, h: bottom + 1 - sideY };
    // Over the note: the note's rules end where the pane (with its border and margin) begins.
    if (!app.panels.sidebarBeside) clipRules(geo, { x: LW, y: sideY, w: w + 3, h: bottom + 1 - sideY });
    const list = drawSidebar(app, c, rect, geo);
    const border = roleStyle(theme, "border", page);
    for (let y = sideY; y <= bottom; y++) drawText(c, bx, y, app.glyphs.vbar, border, 1);
    geo.sidebar = list;
    geo.sidebarPane = rect;
    // Over the content (narrow or zen), a two-column margin past its border sets it apart.
    if (!app.panels.sidebarBeside) {
      c.fill(bx + 1, sideY, 2, bottom + 1 - sideY, roleStyle(theme, "sidebar", page).bg);
      // Over the note, its border and margin are the pane's too: clicks there stay in it.
      geo.sidebarPane = { x: LW, y: sideY, w: w + 3, h: bottom + 1 - sideY };
      coverHot(geo, geo.sidebarPane);
    }
    if (beside) {
      geo.separators.push({ kind: "sidebar", x: bx, y: sideY, w: 1, h: bottom + 1 - sideY });
      geo.verticals.push({ x: bx, y0: frame ? head : sideY, y1: borderEnd, style: border });
    } else geo.verticals.push({ x: bx, y0: frame ? sideY - 1 : sideY, y1: borderEnd, style: border });
  }
  if (app.panels.outlineShown) {
    const w = app.panels.outlineBeside ? outW : Math.min(outW + 6, RW - 6);
    // The outline starts right under the tab strip, beside the note's windows and their headers.
    const top = mainY;
    const rect = { x: RW - w, y: top, w, h: bottom + 1 - top };
    if (!app.panels.outlineBeside) clipRules(geo, { x: RW - w - 3, y: top, w: w + 3, h: bottom + 1 - top });
    geo.outline =
      app.rightView === "footnotes"
        ? drawFootnotes(app, c, rect, geo)
        : app.rightView === "info"
          ? drawInfo(app, c, rect, geo)
          : drawOutline(app, c, rect, geo);
    geo.outlinePane = rect;
    if (!app.panels.outlineBeside) {
      c.fill(RW - w - 3, top, 2, bottom + 1 - top, roleStyle(theme, "sidebar", page).bg);
      geo.outlinePane = { x: RW - w - 3, y: top, w: w + 3, h: bottom + 1 - top };
      coverHot(geo, geo.outlinePane);
    }
    const border = roleStyle(theme, "border", page);
    for (let y = top; y <= bottom; y++) drawText(c, RW - w - 1, y, app.glyphs.vbar, border, 1);
    if (app.panels.outlineBeside)
      geo.separators.push({ kind: "outline", x: RW - w - 1, y: top, w: 1, h: bottom + 1 - top });
    geo.verticals.push({ x: RW - w - 1, y0: frame ? top - 1 : top, y1: borderEnd, style: border });
  }
  drawJoints(app, c, geo);
  // After the windows and the panes: the top bar carries the outline's button when no window
  // shows one (none drew it, or an overlaid pane hides it).
  if (topBar) drawTopBar(app, c, { y: 0, h: 1 }, geo);

  // Messages and questions never take a row of their own, so the note never changes height for
  // them. Messages float as boxes at the top right of the content (a screen too small for them:
  // over the status line). A question — anything a prompt asks — floats in a window of its own
  // (a screen too small for it: over the status line; in zen, the screen's last row); find's is
  // in its window when that window had room for its find row.
  if (app.floating) {
    // What lies under the floating window can't be clicked through it (a window header's button under its margin):
    // only its own hit areas, drawn after, stay.
    const under = geo.hot;
    geo.hot = [];
    geo.floating = drawFloating(app, c, mainY, mainH, geo);
    const own = geo.hot;
    geo.hot = under;
    coverHot(geo, geo.floating);
    geo.hot.push(...own);
  }
  const prompt = app.overlay?.kind === "prompt" && !(app.overlay.view && geo.findInWindow) ? app.overlay : null;
  const float = W >= TOAST_MIN_W && mainH >= 5;
  const dialog = prompt && W >= DIALOG_MIN_W && mainH >= dialogHeight(prompt, dialogWidth(W)) ? prompt : null;
  if ((prompt && !dialog) || (app.transient && !float))
    drawBottomLine(app, c, H - 1, geo, prompt && !dialog ? prompt : null);
  else if (status) drawStatus(app, c, { y: H - status, h: 1 }, geo);
  if (float && app.toasts.length) drawToasts(app, c, mainY, mainY + mainH, geo);
  // What was drawn of them begins its time (#40): the boxes, or the newest over the status line.
  app.toastsDrawn(float ? app.toasts : !(prompt && !dialog) && app.transient ? [app.transient] : []);
  if (((app.input.whichKey && app.pending.length) || (app.panels.resizeMode && !app.pending.length)) && !app.overlay)
    drawWhichKey(app, c, mainY, mainY + mainH, geo);
  // Completion's popup and the signature being typed (19.16), from the cursor, over the text.
  if (geo.cursor && app.view?.insert && !app.overlay) {
    if (app.signature?.view === app.view) drawSignature(app, c, geo.cursor, mainY);
    if (app.completion?.view === app.view && app.completion.shown.length) {
      // Over the text, and over whatever lies under it: another window's header, its buttons (HDR-D2).
      geo.completion = drawCompletion(app, c, geo.cursor, mainY, mainY + mainH);
      coverHot(geo, geo.completion);
    }
  }
  if (app.overlay?.kind === "list") {
    const o = app.overlay;
    // Above the frame's bottom rule, never on the status line.
    geo.overlay =
      o.anchor && o.menu
        ? drawMenu(app, c, o, o.anchor, mainY, mainY + mainH)
        : o.anchor
          ? drawDropdown(app, c, o, o.anchor, mainY + mainH)
          : drawList(app, c, o, mainY, mainH);
  }
  if (app.overlay?.kind === "saveas") geo.saveas = drawSaveAs(app, c, app.overlay, mainY, mainH, geo);
  if (app.overlay?.kind === "dialog") geo.choices = drawChoiceDialog(app, c, app.overlay, mainY, mainH);
  if (dialog) geo.dialog = drawDialog(app, c, dialog, mainY, mainH, geo);
  if (geo.cursor && app.view?.insert && !app.overlay && app.region === "content") c.cursor?.(geo.cursor);
  return geo;
}

export type { PaneGeom, Separator, ScrollbarGeom, Geometry } from "./geometry/contracts.ts";
export { drawBreadcrumb } from "../../documents/views/drawing/breadcrumb.ts";
