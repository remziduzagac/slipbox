// Painting the app (3.1, 3.2): tab bar, explorer | content (one split) | outline, status line,
// the which-key popup and overlays. Viewport-only: only the rows on screen are drawn. This file
// lays the screen out and draws its frame — the top bar, the tabs, the rails, the breadcrumb, the
// rules between panes; each region's own drawing is a draw-*.ts of its own (D235): the windows'
// (draw-pane.ts, their headers draw-header.ts), the side panels' (draw-panels.ts), the Problems
// panel's, the status line's, what floats over the windows (draw-overlays.ts).
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import type { CellStyle } from "../core/layout/style.ts";
import type { Color, Role, Theme } from "../core/theme/theme.ts";
import { stringWidth, truncate } from "../core/width.ts";
import type { App, View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { prettyKey } from "./keys.ts";
import type { SaveAsGeometry } from "./saveas.ts";
import type { DialogGeometry } from "./dialog.ts";
import { LEFT_VIEWS, RIGHT_VIEWS } from "./panels.ts";
import { drawTopBar } from "./draw-topbar.ts";
import { drawPane, drawCompletion, drawSignature } from "./draw-pane.ts";
import { drawSidebar, drawInfo, drawFootnotes, drawOutline } from "./draw-panels.ts";
import { drawProblemsPanel } from "./draw-problems.ts";
import { drawStatus, drawBottomLine, TOAST_MIN_W, drawToasts } from "./draw-status.ts";
import {
  drawSaveAs,
  drawFloating,
  DIALOG_MIN_W,
  dialogWidth,
  dialogHeight,
  drawDialog,
  drawChoiceDialog,
  drawMenu,
  drawWhichKey,
  drawList,
  drawDropdown,
} from "./draw-overlays.ts";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaneGeom extends Rect {
  view: View;
  /** Screen column of layout column 0. */
  textX: number;
}

/** A clickable region: its id says what a click does (see Mouse.clickHot). */
export interface Hot extends Rect {
  id: string;
}

/** A border the mouse can drag to resize something. */
export interface Separator extends Rect {
  kind: "sidebar" | "outline" | "split-side" | "split-stacked" | "problems";
  /** The area the split divides (for split separators). */
  area?: Rect;
}

export interface ScrollbarGeom extends Rect {
  /** A window's scrollbar, or a side pane's. */
  view?: View;
  /** The window's horizontal scrollbar (wrapping off): its position moves the view sideways. */
  horizontal?: boolean;
  /** A code block's own horizontal scrollbar, on its last row (`[render] code_wrap`): its key, the block it moves. */
  block?: string;
  pane?: "sidebar" | "outline";
  total: number;
}

export interface Geometry {
  panes: PaneGeom[];
  /** The explorer's and the outline's lists (under their titles), and the whole panes. */
  sidebar: Rect | null;
  outline: Rect | null;
  sidebarPane: Rect | null;
  outlinePane: Rect | null;
  tabs: (Rect & { index: number })[];
  overlay: (Rect & { listY: number; rows: number }) | null;
  hot: Hot[];
  separators: Separator[];
  scrollbars: ScrollbarGeom[];
  /** The pictures drawn (PIC), each where it shows: a click there is the picture's — its window, its first row drawn
   *  over. */
  pictures: (Rect & { view: View; row: number; file: string })[];
  tabStrip: Rect | null;
  /** The which-key popup, with its margin: clicks there never reach what's under it. */
  popup: Rect | null;
  /** Where each window's breadcrumb hangs its path from (its `…`, else its icon), by the window's index: kept when a
   *  popup over it takes its clicks — `space f b` with the which-key popup drawn after `space f` (#40). */
  crumbAnchors: Record<number, { x: number; y: number }>;
  /** Horizontal rules (row `y`, columns [x0, x1)) and the vertical borders they may meet. */
  rules: { y: number; x0: number; x1: number }[];
  verticals: { x: number; y0: number; y1: number; style: CellStyle }[];
  /** Find's prompt is drawn in its window (its find row), not on the bottom line. */
  findInWindow?: boolean;
  /** A question's floating window, with its margin: clicks there never reach what's under it. */
  dialog?: Rect | null;
  /** The floating editor's box (3.20), with its margin. */
  floating?: Rect | null;
  /** Completion's popup (19.16): no hit area under it can be clicked through it. */
  completion?: Rect | null;
  /** Where the active window's cursor is on screen: completion's popup hangs from it (19.16). */
  cursor?: { x: number; y: number } | null;
  /** The git panel's rows, drawn: the pointer there holds the repositories' order (`GitPanel.drawnRows`). */
  gitRows?: Rect | null;
  /** The hover the git panel drew its rows by, taken to its rows as they are (`Steady.hotNow`). */
  gitHover?: string | null;
  /** The Problems panel (1.7), at the bottom, under its rule: clicks and the wheel there are its. */
  problems?: Rect | null;
  /** How many of its entries it shows at once: the wheel's page. */
  problemsPage?: number;
  /** The Save As window's parts (10.14): clicks and the wheel there are its. */
  saveas?: SaveAsGeometry | null;
  /** The top bar said where you are (WSP-D4): the status line, drawn after it, leaves it out (WSP-D5). */
  /** A dialog of choices (UPG): its box and its rows, for clicks. */
  choices?: DialogGeometry | null;
}

export const CHANGE_MARKER_MS = 3000;

export function roleStyle(theme: Theme, role: Role, page: Color | null): CellStyle {
  const r = theme.roles[role];
  return {
    fg: r.fg ?? theme.fg,
    bg: r.bg ?? page,
    bold: !!r.bold,
    italic: !!r.italic,
    underline: !!r.underline,
    strike: false,
    dim: !!r.dim,
    inverse: !!r.inverse,
  };
}

export function pageBg(theme: Theme): Color | null {
  return theme.bg === "default" ? null : theme.bg;
}

/** A key as which-key and the status line show it (`␣ l y`; with ASCII glyphs `SPC l y`). */
export function keyText(app: App, key: string): string {
  const k = prettyKey(key, app.leader);
  return app.glyphs.mode === "ascii" ? k.replaceAll("␣", "SPC") : k;
}

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
  const mainY = frame ? head + 1 + (tabBar ? 2 : 0) : 0;
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

/**
 * A rail: a column of buttons at one edge, one per row from the top. Tinted (the `rail` role), it
 * needs no border; without colour to tint it (NO_COLOR) a border on its inner side, at `bx`,
 * sets it apart, joined to the rules it meets. The left rail runs from under the top bar and
 * holds the left panel's views; the right one from under the tab strip, with the right panel's.
 */
function drawRail(
  app: App,
  c: Canvas,
  side: "left" | "right",
  bx: number,
  y0: number,
  top: number,
  bottom: number,
  borderEnd: number,
  geo: Geometry,
): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const tint = theme.roles.rail.bg ?? null;
  const w = side === "left" ? app.panels.leftRailWidth : app.panels.rightRailWidth;
  // The rail's columns: [x0, x0 + w); with a border, the buttons sit beside it.
  const x0 = side === "left" ? 0 : c.width - w;
  const bg = tint ?? page;
  c.fill(x0, top, w, bottom + 1 - top, bg);
  let x = x0;
  if (!tint) {
    const border = roleStyle(theme, "border", page);
    for (let y = top; y <= bottom; y++) drawText(c, bx, y, app.glyphs.vbar, border, 1);
    geo.verticals.push({ x: bx, y0, y1: borderEnd, style: border });
    if (side === "right") x = bx + 1;
  }
  // A button per view of that side's panel, bright while its view shows.
  const buttons =
    side === "left"
      ? [
          ...LEFT_VIEWS.map((v) => ({
            glyph: v.glyph(app.glyphs),
            on: app.panels.sidebarShown && app.leftView === v.id,
            id: `btn:${v.id}`,
          })),
        ]
      : RIGHT_VIEWS.map((v) => ({
          glyph: v.glyph(app.glyphs),
          on: app.panels.outlineShown && app.rightView === v.id,
          id: `btn:${v.id}`,
        }));
  buttons.forEach((b, k) => {
    const y = top + k;
    if (y > bottom) return;
    button(app, c, x, { y, h: 1 }, ` ${b.glyph} `, b.on ? "topbar_button_on" : "topbar_button", b.id, geo, bg);
  });
}

/** A bar's rows: `h` rows from `y`, its text on the middle one. */
export interface Band {
  y: number;
  h: number;
}

export const mid = (b: Band) => b.y + Math.floor(b.h / 2);

/**
 * A clickable label filling the bar's full height, drawn with the hover role while the mouse is
 * over it, unless `hovers` is false (a click that changes nothing, or can't). `role` null draws the text on the bar's
 * own background.
 */
export function button(
  app: App,
  c: Canvas,
  x: number,
  band: Band,
  text: string,
  role: Role,
  id: string,
  geo: Geometry,
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

/** Below this, a heading is cut no further: the breadcrumb drops it instead. */
const CRUMB_MIN = 8;
/** Fewer columns than this, and no breadcrumb is drawn at all. */
const CRUMB_FLOOR = 4;

/**
 * The columns a breadcrumb keeps before the mode's buttons beside it shorten (HDR-D4, HDR-D7): room for its icon and a
 * space, `… ›` and an innermost heading cut to `CRUMB_MIN` — crumbLayout's narrowest form but `…` alone — whatever the
 * headings the cursor is under or the mode, so the buttons don't change form as either does (well over the 4 columns
 * drawBreadcrumb draws in).
 */
export function crumbLeast(glyphs: { crumb: string; crumbIcon: string }): number {
  return stringWidth(glyphs.crumbIcon) + 1 + 1 + stringWidth(` ${glyphs.crumb} `) + CRUMB_MIN;
}

/**
 * Which headings a breadcrumb shows in `room` columns, each with its width, and where `…` stands
 * for the hidden ones. All of them if they fit; else the first, `…` and as many of the innermost as
 * fit; else the first and the last, cut (down to 8 columns each); else `…` and the last; else `…`.
 */
export function crumbLayout(widths: number[], room: number, sepW: number): ({ i: number; w: number } | "more")[] {
  const n = widths.length;
  if (!n || room < 1) return [];
  type Part = { i: number; w: number } | "more";
  const width = (parts: Part[]) => parts.reduce((a, p) => a + (p === "more" ? 1 : p.w), 0) + (parts.length - 1) * sepW;
  const all = widths.map((w, i) => ({ i, w }));
  if (width(all) <= room) return all;
  const last = all[n - 1]!;
  if (n >= 3) {
    for (let k = 2; k < n; k++) {
      const parts: Part[] = [all[0]!, "more", ...all.slice(k)];
      if (width(parts) <= room) return parts;
    }
  }
  const minW = (w: number) => Math.min(w, CRUMB_MIN);
  if (n >= 2) {
    // The first and the last, cut to fit; `…` between them when something is hidden.
    const fixed = sepW + (n >= 3 ? 1 + sepW : 0);
    const first = all[0]!;
    if (minW(first.w) + minW(last.w) + fixed <= room) {
      const lastW = Math.min(last.w, room - fixed - minW(first.w));
      const firstW = Math.min(first.w, room - fixed - lastW);
      return n >= 3
        ? [{ i: 0, w: firstW }, "more", { i: n - 1, w: lastW }]
        : [
            { i: 0, w: firstW },
            { i: n - 1, w: lastW },
          ];
    }
    if (1 + sepW + minW(last.w) <= room) return ["more", { i: n - 1, w: Math.min(last.w, room - 1 - sepW) }];
    return ["more"];
  }
  if (minW(last.w) <= room) return [{ i: 0, w: Math.min(last.w, room) }];
  return ["more"];
}

const CRUMB_MAX = 40;

/** The tab strip, under the top bar whenever a note is open, right of the explorer. */
function drawTabs(app: App, c: Canvas, x0: number, band: Band, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const stripBg = theme.roles.tab.bg ?? page;
  c.fill(x0, band.y, c.width - x0, band.h, stripBg);
  geo.tabStrip = { x: x0, y: band.y, w: c.width - x0, h: band.h };
  const border = roleStyle(theme, "border", page);
  // A ┃ after each tab, joined to the rules above and below the strip.
  const separator = (x: number) => {
    drawText(c, x, band.y, app.glyphs.vbar, border, 1);
    geo.verticals.push({ x, y0: band.y - 1, y1: band.y + band.h, style: border });
  };
  const labels = app.tabs.map((t, i) => {
    const v = t.views[t.active]!;
    // Unsaved changes (any tab showing the note), else a recent change on disk.
    const changed = v.buf.dirty ? " •" : v.buf.changedAt && app.now() - v.buf.changedAt < CHANGE_MARKER_MS ? " ↻" : "";
    // Another vault's file, kept from a peek (VV-D7): marked with that vault's name.
    const e = v.buf.elsewhere;
    const name = e?.rel ? `${e.vault}: ${e.rel.split("/").pop()!}` : app.displayName(v.buf).split("/").pop()!;
    return ` ${i + 1} ${t.pinned ? `${app.glyphs.pin} ` : ""}${truncate(name, e ? 36 : 24)}${changed} `;
  });
  const close = `${app.glyphs.close} `;
  const widths = labels.map((l) => stringWidth(l) + stringWidth(close) + 1);
  // What fits: from the first tab, scrolled just enough to show the active one. When some don't
  // fit, a "+N" button at the far right opens the tab list.
  const room = c.width - x0;
  const fits = (from: number, to: number, reserve: number) =>
    widths.slice(from, to + 1).reduce((a, w) => a + w, 0) <= room - reserve;
  let from = 0;
  let to = widths.length - 1;
  if (!fits(from, to, 0)) {
    const more = (hidden: number) => stringWidth(` +${hidden} `) + 1;
    const active = Math.min(app.activeTab, widths.length - 1);
    to = active;
    while (from < to && !fits(from, to, more(widths.length - (to - from + 1)))) from++;
    while (to + 1 < widths.length && fits(from, to + 1, more(widths.length - (to - from + 2)))) to++;
  }
  const hidden = widths.length - (to - from + 1);
  const moreLabel = ` +${hidden} `;
  // Tabs stop before the +N button (and its border), even when the one tab left is cut short.
  const limit = hidden > 0 ? c.width - stringWidth(moreLabel) - 1 : c.width;
  let x = x0;
  let lastSep = -1;
  for (let i = from; i <= to && x < limit; i++) {
    const role: Role = i !== app.activeTab ? "tab" : app.region === "content" ? "tab_active" : "tab_active_idle";
    const w = button(app, c, x, band, labels[i]!, role, `tab:${i}`, geo, stripBg, limit - x);
    geo.tabs.push({ x, y: band.y, w, h: band.h, index: i });
    x += w;
    const tabBg = roleStyle(theme, role, stripBg).bg ?? stripBg;
    x += button(app, c, x, band, close, role, `tabclose:${i}`, geo, tabBg, limit - x);
    if (x < limit) {
      separator(x);
      lastSep = x;
    }
    x += 1;
  }
  if (hidden > 0) {
    const label = moreLabel;
    const bx = c.width - stringWidth(label);
    // Its own border — also after a tab cut short — unless the last tab's is (nearly) next to it.
    if (lastSep < bx - 2) separator(bx - 1);
    button(app, c, bx, band, label, "tab", "tabmore:", geo, stripBg);
  }
}

/**
 * A pane drawn over the note: the rules under it are cut out (they're hidden, and must not make
 * joints at its border), and so are the borders it covers (the explorer's, under the outline).
 */
function clipRules(geo: Geometry, r: Rect): void {
  const out: Geometry["rules"] = [];
  for (const rule of geo.rules) {
    if (rule.y < r.y || rule.y >= r.y + r.h || rule.x1 <= r.x || rule.x0 >= r.x + r.w) {
      out.push(rule);
      continue;
    }
    if (rule.x0 < r.x) out.push({ ...rule, x1: r.x });
    if (rule.x1 > r.x + r.w) out.push({ ...rule, x0: r.x + r.w });
  }
  geo.rules = out;
  // Only borders the pane actually covers (a tab separator above it stays).
  geo.verticals = geo.verticals.filter((v) => v.x < r.x || v.x >= r.x + r.w || v.y1 < r.y || v.y0 >= r.y + r.h);
}

/** A pane drawn over the content hides the click targets under it. */
export function coverHot(geo: Geometry, r: Rect): void {
  geo.hot = geo.hot.filter((h) => h.x + h.w <= r.x || h.x >= r.x + r.w || h.y + h.h <= r.y || h.y >= r.y + r.h);
}

/** Where rules meet vertical borders, the box glyph for the lines that meet there. */
function drawJoints(app: App, c: Canvas, geo: Geometry): void {
  const covers = (y: number, x: number) => geo.rules.some((r) => r.y === y && x >= r.x0 && x < r.x1);
  // Every vertical's arms at a crossing first, then one glyph from them all: two lines meeting the
  // same rule at the same column (a tab's separator over a pane's border) make ╋, not whichever
  // was drawn last.
  const at = new Map<
    string,
    {
      x: number;
      y: number;
      u: boolean;
      d: boolean;
      l: boolean;
      r: boolean;
      style: (typeof geo.verticals)[number]["style"];
    }
  >();
  for (const v of geo.verticals) {
    for (const r of geo.rules) {
      if (r.y < v.y0 || r.y > v.y1) continue;
      const l = covers(r.y, v.x - 1);
      const rt = covers(r.y, v.x + 1);
      if (!l && !rt) continue;
      const k = `${v.x},${r.y}`;
      const j = at.get(k) ?? { x: v.x, y: r.y, u: false, d: false, l, r: rt, style: v.style };
      j.u ||= r.y > v.y0;
      j.d ||= r.y < v.y1;
      at.set(k, j);
    }
  }
  for (const j of at.values()) {
    const g = app.glyphs.joints[`${j.u ? "u" : ""}${j.d ? "d" : ""}${j.l ? "l" : ""}${j.r ? "r" : ""}`];
    if (g) drawText(c, j.x, j.y, g, j.style, 1);
  }
}

/** `ruleAbove`: the row above `area` is a rule already, so the top windows don't draw their own. */
function drawContent(app: App, c: Canvas, area: Rect, ruleAbove: boolean, geo: Geometry): void {
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

export function markStyle(theme: Theme, role: Role): Partial<CellStyle> {
  const r = theme.roles[role];
  const out: Partial<CellStyle> = {};
  if (r.bg) out.bg = r.bg;
  if (r.fg) out.fg = r.fg;
  if (r.bold) out.bold = true;
  if (r.underline) out.underline = true;
  if (r.inverse) out.inverse = true;
  return out;
}
