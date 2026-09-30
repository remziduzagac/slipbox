// Painting the app (3.1, 3.2): tab bar, explorer | content (one split) | outline, status line,
// the which-key popup and overlays. Viewport-only: only the rows on screen are drawn.
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import type { Glyphs } from "../core/glyphs.ts";
import type { Line } from "../core/layout/ir.ts";
import { type CellStyle, spanStyle } from "../core/layout/style.ts";
import type { Color, Role, Theme } from "../core/theme/theme.ts";
import { graphemeWidth, graphemes, splitAtWidth, stringWidth, truncate, truncateStart } from "../core/width.ts";
import { sanitize } from "../core/sanitize.ts";
import { type App, type HistoryRow, LEFT_VIEWS, type ListItem, type ListOverlay, type PromptOverlay, RIGHT_VIEWS, type SidePaneState, type Tab, type TreeRow, type View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { countWords } from "../core/words.ts";
import type { CommentLink, SyntaxError } from "../core/syntax.ts";
import { cells, ordered } from "./cursor.ts";
import { match } from "./match.ts";
import { prettyKey, spellKey } from "./keys.ts";

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

/** A clickable region: its id says what a click does (see App.clickHot). */
export interface Hot extends Rect {
  id: string;
}

/** A border the mouse can drag to resize something. */
export interface Separator extends Rect {
  kind: "sidebar" | "outline" | "split-side" | "split-stacked";
  /** The area the split divides (for split separators). */
  area?: Rect;
}

export interface ScrollbarGeom extends Rect {
  /** A window's scrollbar, or a side pane's. */
  view?: View;
  /** The window's horizontal scrollbar (wrapping off): its position moves the view sideways. */
  horizontal?: boolean;
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
  tabStrip: Rect | null;
  /** The which-key popup, with its margin: clicks there never reach what's under it. */
  popup: Rect | null;
  /** Horizontal rules (row `y`, columns [x0, x1)) and the vertical borders they may meet. */
  rules: { y: number; x0: number; x1: number }[];
  verticals: { x: number; y0: number; y1: number; style: CellStyle }[];
  /** Find's prompt is drawn in its window (its find row), not on the bottom line. */
  findInWindow?: boolean;
  /** A question's floating window, with its margin: clicks there never reach what's under it. */
  dialog?: Rect | null;
}

const CHANGE_MARKER_MS = 3000;

function roleStyle(theme: Theme, role: Role, page: Color | null): CellStyle {
  const r = theme.roles[role];
  return { fg: r.fg ?? theme.fg, bg: r.bg ?? page, bold: !!r.bold, italic: !!r.italic, underline: !!r.underline, strike: false, dim: !!r.dim, inverse: !!r.inverse };
}

function pageBg(theme: Theme): Color | null {
  return theme.bg === "default" ? null : theme.bg;
}

export function drawApp(app: App, c: Canvas): Geometry {
  const theme = app.theme;
  const page = pageBg(theme);
  const W = c.width;
  const H = c.height;
  const geo: Geometry = { panes: [], sidebar: null, outline: null, sidebarPane: null, outlinePane: null, tabs: [], overlay: null, hot: [], separators: [], scrollbars: [], tabStrip: null, popup: null, rules: [], verticals: [] };
  c.fill(0, 0, W, H, page);
  if (W < 10 || H < 4) {
    drawText(c, 0, 0, "slipbox: too small", roleStyle(theme, "warn", page), W);
    return geo;
  }
  const zen = app.ui.zen;
  const topBar = app.ui.top_bar && !zen ? 1 : 0;
  const tabBar = app.tabs.length > 0 && !zen ? 1 : 0;
  const status = zen ? 0 : 1;
  const head = topBar;
  // The frame: a rule across the top of the explorer, the tab strip (or the window) and the
  // outline, and one across their bottom; with tabs, another under the strip, over the note and
  // the outline. Zen has none.
  const frame = !zen;
  const mainY = frame ? head + 1 + (tabBar ? 2 : 0) : 0;
  const mainH = H - mainY - (frame ? 1 : 0) - status;
  const bottom = mainY + mainH - 1;
  // Borders run down to the bottom rule, where they join it.
  const borderEnd = frame ? bottom + 1 : bottom;

  const sideW = app.sidebarWidth();
  const outW = app.outlineWidth();
  // The rails take the edges: the left one under the top bar, the right one under the tab strip.
  // Everything else shares what's between them (LW to RW).
  const LW = app.leftRailWidth;
  const RW = W - app.rightRailWidth;
  const beside = app.sidebarShown && app.sidebarBeside;
  const left = LW + (app.sidebarBeside ? sideW + 1 : 0);
  const right = app.outlineBeside ? outW + 1 : 0;
  const rule = (y: number, x0: number, x1: number) => {
    if (x1 <= x0) return;
    drawText(c, x0, y, app.glyphs.hbar.repeat(x1 - x0), roleStyle(theme, "border", page), x1 - x0);
    geo.rules.push({ y, x0, x1 });
  };

  if (frame) {
    rule(head, 0, W);
    rule(bottom + 1, 0, W);
  }
  if (tabBar) {
    // Tabs hold the note and its outline, not the explorer: the strip starts after the explorer.
    const x0 = beside ? left : LW;
    drawTabs(app, c, x0, { y: head + 1, h: 1 }, geo);
    rule(head + 2, x0, W);
  }
  drawContent(app, c, { x: left, y: mainY, w: Math.max(0, RW - left - right), h: mainH }, frame, geo);
  if (LW) drawRail(app, c, "left", LW - 1, frame ? head : 0, frame ? head + 1 : 0, bottom, borderEnd, geo);
  if (RW < W) drawRail(app, c, "right", RW, frame ? head + (tabBar ? 2 : 0) : mainY, mainY, bottom, borderEnd, geo);

  if (app.sidebarShown) {
    const w = app.sidebarBeside ? sideW : Math.min(sideW + 6, RW - LW - 6);
    // Beside the content, the explorer runs from under the frame's top rule to the status line,
    // whether or not the tab strip shows; its border runs up beside the strip. It starts after
    // the left rail (LW), and its border is at bx.
    const sideY = beside && frame ? head + 1 : mainY;
    const bx = LW + w;
    const rect = { x: LW, y: sideY, w, h: bottom + 1 - sideY };
    // Over the note: the note's rules end where the pane (with its border and margin) begins.
    if (!app.sidebarBeside) clipRules(geo, { x: LW, y: sideY, w: w + 3, h: bottom + 1 - sideY });
    const list = drawSidebar(app, c, rect, geo);
    const border = roleStyle(theme, "border", page);
    for (let y = sideY; y <= bottom; y++) drawText(c, bx, y, app.glyphs.vbar, border, 1);
    geo.sidebar = list;
    geo.sidebarPane = rect;
    // Over the content (narrow or zen), a two-column margin past its border sets it apart.
    if (!app.sidebarBeside) {
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
  if (app.outlineShown) {
    const w = app.outlineBeside ? outW : Math.min(outW + 6, RW - 6);
    // The outline starts right under the tab strip, beside the note's windows and their headers.
    const top = mainY;
    const rect = { x: RW - w, y: top, w, h: bottom + 1 - top };
    if (!app.outlineBeside) clipRules(geo, { x: RW - w - 3, y: top, w: w + 3, h: bottom + 1 - top });
    geo.outline = drawOutline(app, c, rect, geo);
    geo.outlinePane = rect;
    if (!app.outlineBeside) {
      c.fill(RW - w - 3, top, 2, bottom + 1 - top, roleStyle(theme, "sidebar", page).bg);
      geo.outlinePane = { x: RW - w - 3, y: top, w: w + 3, h: bottom + 1 - top };
      coverHot(geo, geo.outlinePane);
    }
    const border = roleStyle(theme, "border", page);
    for (let y = top; y <= bottom; y++) drawText(c, RW - w - 1, y, app.glyphs.vbar, border, 1);
    if (app.outlineBeside) geo.separators.push({ kind: "outline", x: RW - w - 1, y: top, w: 1, h: bottom + 1 - top });
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
  const prompt = app.overlay?.kind === "prompt" && !(app.overlay.view && geo.findInWindow) ? app.overlay : null;
  const float = W >= TOAST_MIN_W && mainH >= 5;
  const dialog = prompt && W >= DIALOG_MIN_W && mainH >= dialogHeight(prompt, dialogWidth(W)) ? prompt : null;
  if ((prompt && !dialog) || (app.transient && !float)) drawBottomLine(app, c, H - 1, geo, prompt && !dialog ? prompt : null);
  else if (status) drawStatus(app, c, { y: H - status, h: 1 }, geo);
  if (float && app.toasts.length) drawToasts(app, c, mainY, mainY + mainH, geo);
  if (((app.whichKey && app.pending.length) || (app.resizeMode && !app.pending.length)) && !app.overlay) drawWhichKey(app, c, mainY, mainY + mainH, geo);
  if (app.overlay?.kind === "list") {
    const o = app.overlay;
    // Above the frame's bottom rule, never on the status line.
    geo.overlay = o.anchor && o.menu ? drawMenu(app, c, o, o.anchor, mainY, mainY + mainH) : o.anchor ? drawDropdown(app, c, o, o.anchor, mainY + mainH) : drawList(app, c, o, mainY, mainH);
  }
  if (dialog) geo.dialog = drawDialog(app, c, dialog, mainY, mainH, geo);
  return geo;
}

/** Narrower than this, a question goes over the status line instead of floating. */
const DIALOG_MIN_W = 30;

function dialogWidth(W: number): number {
  return Math.max(24, Math.min(64, W - 8));
}

/** The question's lines, wrapped to the window (at most six). */
function dialogLines(o: PromptOverlay, w: number): string[] {
  return wrapWords(sanitize(o.label.trim()), w - 4).slice(0, 6);
}

/** Its rows: the frame, the question, the answer's row (not a yes-or-no's), a blank, the buttons. */
function dialogHeight(o: PromptOverlay, w: number): number {
  return 2 + dialogLines(o, w).length + (o.confirm ? 0 : 1) + 2;
}

/**
 * A question in a floating window near the top of the content, framed like the lists: the
 * question, the answer typed on its own row (`›`, its end kept in view), and its buttons at the
 * bottom right — OK and Cancel (enter, esc), or Yes and No (y, n) — each clickable.
 */
function drawDialog(app: App, c: Canvas, o: PromptOverlay, mainY: number, mainH: number, geo: Geometry): Rect {
  const theme = app.theme;
  const W = c.width;
  const w = dialogWidth(W);
  const lines = dialogLines(o, w);
  const h = dialogHeight(o, w);
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const b = app.glyphs.box;
  // A margin in the window's own colour, as the lists have: a row above and below, two columns.
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h.repeat(w - 2)}${b.tr}`, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  lines.forEach((line, i) => drawText(c, x + 2, y + 1 + i, line, { ...bg, bold: true }, w - 4));
  let row = y + 1 + lines.length;
  if (!o.confirm) {
    const px = drawText(c, x + 2, row, "› ", border);
    const room = w - 4 - px - 1;
    const tw = drawText(c, x + 2 + px, row, stringWidth(o.text) > room ? truncateStart(o.text, room) : o.text, bg);
    drawText(c, x + 2 + px + tw, row, " ", roleStyle(theme, "cursor", null));
    row++;
  }
  row++;
  const buttons: [string, string][] = o.confirm ? [[" Yes  y ", "dlg:ok"], [" No  n ", "dlg:cancel"]] : [[" OK  enter ", "dlg:ok"], [" Cancel  esc ", "dlg:cancel"]];
  let bx = x + w - 2 - buttons.reduce((n, [t]) => n + stringWidth(t), 0) - (buttons.length - 1);
  for (const [text, id] of buttons) bx += smallButton(app, c, bx, row, text, id, geo, bg.bg) + 1;
  return { x: x - 2, y: y - 1, w: w + 4, h: h + 2 };
}

/**
 * A menu hanging from `anchor` (the explorer row's `…`): framed, its title the row's name, as wide
 * as its entries — each a label and, dim at the right, its key — from the anchor's column (moved
 * left to fit), under its row, or over it when there's no room below.
 */
function drawMenu(app: App, c: Canvas, o: ListOverlay, anchor: { x: number; y: number }, mainY: number, maxY: number): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  const content = Math.max(stringWidth(o.title) + 4, ...o.items.map((item) => stringWidth(item.label) + hintW(item)));
  const w = Math.min(content + 4, W);
  const h = Math.min(o.filtered.length + 2, Math.max(3, maxY - mainY));
  const x = Math.max(0, Math.min(anchor.x, W - w));
  let y = anchor.y + 1;
  if (y + h > maxY) y = Math.max(mainY, anchor.y - h);
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const b = app.glyphs.box;
  c.fill(x, y, w, h, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${sanitize(o.title)} `, w - 4), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const rows = h - 2;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const item = entry.item;
    const st = idx === o.selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, y + 1 + i, w - 2, 1, st.bg);
    const hw = hintW(item);
    drawText(c, x + 2, y + 1 + i, truncate(sanitize(item.label), Math.max(1, w - 4 - hw)), st);
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), y + 1 + i, item.hint, { ...dim, bg: st.bg });
  }
  return { x, y, w, h, listY: y + 1, rows };
}

/**
 * A rail: a column of buttons at one edge, one per row from the top. Tinted (the `rail` role), it
 * needs no border; without colour to tint it (NO_COLOR) a border on its inner side, at `bx`,
 * sets it apart, joined to the rules it meets. The left rail runs from under the top bar and
 * holds the left panel's views; the right one from under the tab strip, with the right panel's.
 */
function drawRail(app: App, c: Canvas, side: "left" | "right", bx: number, y0: number, top: number, bottom: number, borderEnd: number, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const tint = theme.roles.rail.bg ?? null;
  const w = side === "left" ? app.leftRailWidth : app.rightRailWidth;
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
      ? LEFT_VIEWS.map((v) => ({ glyph: v.glyph(app.glyphs), on: app.sidebarShown && app.leftView === v.id, id: `btn:${v.id}` }))
      : RIGHT_VIEWS.map((v) => ({ glyph: v.glyph(app.glyphs), on: app.outlineShown, id: `btn:${v.id}` }));
  buttons.forEach((b, k) => {
    const y = top + k;
    if (y > bottom) return;
    button(app, c, x, { y, h: 1 }, ` ${b.glyph} `, b.on ? "topbar_button_on" : "topbar_button", b.id, geo, bg);
  });
}

/** A bar's rows: `h` rows from `y`, its text on the middle one. */
interface Band {
  y: number;
  h: number;
}

const mid = (b: Band) => b.y + Math.floor(b.h / 2);

/**
 * A clickable label filling the bar's full height, drawn with the hover role while the mouse is
 * over it. `role` null draws the text on the bar's own background.
 */
function button(app: App, c: Canvas, x: number, band: Band, text: string, role: Role, id: string, geo: Geometry, barBg: Color | null, maxW = Number.POSITIVE_INFINITY): number {
  const theme = app.theme;
  const st = roleStyle(theme, app.hover === id ? "hover" : role, barBg);
  const w = Math.min(stringWidth(text), maxW);
  if (w <= 0) return 0;
  c.fill(x, band.y, w, band.h, st.bg ?? null);
  drawText(c, x, mid(band), text, st, maxW);
  geo.hot.push({ id, x, y: band.y, w, h: band.h });
  return w;
}

/**
 * The top bar: the explorer button and the app chip on the left, vault state on the right; the
 * middle is left empty. (The outline's button is on the breadcrumb row.)
 */
function drawTopBar(app: App, c: Canvas, band: Band, geo: Geometry): void {
  const theme = app.theme;
  const g = app.glyphs;
  const bar = roleStyle(theme, "topbar", pageBg(theme));
  c.fill(0, band.y, c.width, band.h, bar.bg);
  const y = mid(band);
  const icon = (glyph: string) => ` ${glyph} `;
  // The explorer's button, unless the left rail has it.
  let x = app.leftRailWidth ? 0 : button(app, c, 0, band, icon(g.explorerButton), app.sidebarShown ? "topbar_button_on" : "topbar_button", "btn:explorer", geo, bar.bg) + 1;
  x += button(app, c, x, band, " slipbox ", "topbar_chip", "btn:palette", geo, bar.bg);

  // Right side, laid out from the far right inwards. The outline's button is on the breadcrumb,
  // or here when no window drew one (breadcrumb off, a window too short for it).
  let rx = c.width - 1;
  if (app.tab && !geo.hot.some((h) => h.id === "btn:outline")) {
    const label = icon(g.outlineButton);
    rx = c.width - stringWidth(label);
    button(app, c, rx, band, label, app.outlineShown ? "topbar_button_on" : "topbar_button", "btn:outline", geo, bar.bg);
    rx -= 1;
  }
  // Vault-wide state; the watcher and reload markers are about the file, so they sit by its path.
  const items: { text: string; role: Role }[] = [];
  if (app.indexing > 0) items.push({ text: `indexing ${app.indexing}…`, role: "status_dim" });
  if (app.loc.mode === "home") items.push({ text: "home vault", role: "status_dim" });
  for (const it of items) {
    const w = stringWidth(it.text) + 2;
    if (rx - w < x + 12) break;
    rx -= w;
    drawText(c, rx + 1, y, it.text, { ...roleStyle(theme, it.role, bar.bg), bg: bar.bg });
  }
}

/**
 * A window's outline breadcrumb: the headings its cursor is under, each clickable. When they don't
 * all fit, the middle collapses into `…` (click: the whole path as a dropdown); then the texts are
 * cut; then the first goes too, then the last, leaving only `…`.
 */
function drawBreadcrumb(app: App, c: Canvas, view: View, x0: number, x1: number, y: number, bg: Color | null, geo: Geometry): void {
  const theme = app.theme;
  const crumbs = app.breadcrumb(view);
  if (!crumbs.length || x1 - x0 < 4) return;
  const index = app.tab!.views.indexOf(view);
  const sep = ` ${app.glyphs.crumb} `;
  // The icon opens the heading finder.
  const iconId = `crumbicon:${index}`;
  const iconSt = app.hover === iconId ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "breadcrumb_icon", bg), bg };
  const iw = drawText(c, x0, y, app.glyphs.crumbIcon, iconSt);
  geo.hot.push({ id: iconId, x: x0, y, w: iw, h: 1 });
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
      const st = app.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "breadcrumb", bg), bg };
      const w = drawText(c, cx, y, "…", st);
      geo.hot.push({ id, x: cx, y, w, h: 1 });
      cx += w;
      return;
    }
    const crumb = crumbs[p.i]!;
    const id = `crumb:${index}:${crumb.line}`;
    const role: Role = p.i === crumbs.length - 1 ? "breadcrumb_current" : "breadcrumb";
    const st = app.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, role, bg), bg };
    const w = drawText(c, cx, y, truncate(crumb.text, p.w), st);
    geo.hot.push({ id, x: cx, y, w, h: 1 });
    cx += w;
  });
}

/** Below this, a heading is cut no further: the breadcrumb drops it instead. */
const CRUMB_MIN = 8;

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
      return n >= 3 ? [{ i: 0, w: firstW }, "more", { i: n - 1, w: lastW }] : [{ i: 0, w: firstW }, { i: n - 1, w: lastW }];
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
    return ` ${i + 1} ${t.pinned ? `${app.glyphs.pin} ` : ""}${truncate(app.displayName(v.buf).split("/").pop()!, 24)}${changed} `;
  });
  const close = `${app.glyphs.close} `;
  const widths = labels.map((l) => stringWidth(l) + stringWidth(close) + 1);
  // What fits: from the first tab, scrolled just enough to show the active one. When some don't
  // fit, a "+N" button at the far right opens the tab list.
  const room = c.width - x0;
  const fits = (from: number, to: number, reserve: number) => widths.slice(from, to + 1).reduce((a, w) => a + w, 0) <= room - reserve;
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
function coverHot(geo: Geometry, r: Rect): void {
  geo.hot = geo.hot.filter((h) => h.x + h.w <= r.x || h.x >= r.x + r.w || h.y + h.h <= r.y || h.y >= r.y + r.h);
}

/** Where rules meet vertical borders, the box glyph for the lines that meet there. */
function drawJoints(app: App, c: Canvas, geo: Geometry): void {
  const covers = (y: number, x: number) => geo.rules.some((r) => r.y === y && x >= r.x0 && x < r.x1);
  // Every vertical's arms at a crossing first, then one glyph from them all: two lines meeting the
  // same rule at the same column (a tab's separator over a pane's border) make ╋, not whichever
  // was drawn last.
  const at = new Map<string, { x: number; y: number; u: boolean; d: boolean; l: boolean; r: boolean; style: (typeof geo.verticals)[number]["style"] }>();
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
    drawText(c, area.x + Math.max(1, Math.floor((area.w - stringWidth(msg)) / 2)), area.y + Math.floor(area.h / 2), msg, roleStyle(theme, "dim", page), area.w);
    return;
  }
  const focusContent = app.region === "content";
  // Too short for two stacked windows: just the active one.
  const tooShort = tab.views.length === 2 && app.effectiveOrientation(tab) !== "side" && area.h < 6;
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
  if (app.effectiveOrientation(tab) === "side") {
    const w1 = Math.max(12, Math.min(area.w - 13, Math.round((area.w - 1) * tab.ratio)));
    drawPane(app, c, a, { ...area, w: w1 }, focusContent, true, ruleAbove, false, geo);
    for (let y = area.y; y < area.y + area.h; y++) drawText(c, area.x + w1, y, app.glyphs.vbar, border, 1);
    // With a frame, rules sit right above and below the content area.
    geo.verticals.push({ x: area.x + w1, y0: area.y - (ruleAbove ? 1 : 0), y1: area.y + area.h - (ruleAbove ? 0 : 1), style: border });
    geo.separators.push({ kind: "split-side", x: area.x + w1, y: area.y, w: 1, h: area.h, area });
    drawPane(app, c, b, { x: area.x + w1 + 1, y: area.y, w: area.w - w1 - 1, h: area.h }, focusContent, true, ruleAbove, true, geo);
  } else {
    const h1 = Math.max(3, Math.min(area.h - 3, Math.round(area.h * tab.ratio)));
    drawPane(app, c, a, { ...area, h: h1 }, focusContent, true, ruleAbove, true, geo);
    // The lower window's title row is the stacked split's handle.
    geo.separators.push({ kind: "split-stacked", x: area.x, y: area.y + h1, w: area.w, h: 1, area });
    drawPane(app, c, b, { x: area.x, y: area.y + h1, w: area.w, h: area.h - h1 }, focusContent, true, false, false, geo);
  }
}

function paneIsActive(app: App, view: View): boolean {
  const t: Tab | null = app.tab;
  return !!t && t.views[t.active] === view;
}

/**
 * One window. `topRight`: the window at the top right, whose breadcrumb carries the outline's
 * button when there's no right rail.
 */
function drawPane(app: App, c: Canvas, view: View, rect: Rect, contentFocused: boolean, titled: boolean, ruleAbove: boolean, topRight: boolean, geo: Geometry): void {
  if (rect.w < 8 || rect.h < 1) return; // too small to draw a window (a tiny terminal)
  const theme = app.theme;
  const page = pageBg(theme);
  const active = paneIsActive(app, view);
  let body = rect;
  // The header: a split window's title, then the breadcrumb, then a blank row before the text.
  const crumbs = app.ui.breadcrumb && !app.ui.zen && rect.h >= 8;
  const typing = app.overlay?.kind === "prompt" && app.overlay.view === view ? app.overlay : null;
  {
    // The window's text size, set before anything lays it out: the breadcrumb asks for the layout
    // first, and a layout at a stale size scrolls the view to fit it (a restored session lost its
    // place). The same arithmetic as the rows drawn below.
    let h = rect.h - (crumbs ? (ruleAbove ? 2 : 3) : titled ? 1 : 0);
    if ((typing || view.find) && h > 6) h -= typing?.replace ? 3 : 2;
    if (!app.ui.wrap && h > 3) h -= 1;
    if (h > 0 && rect.w > 6) {
      view.height = h;
      view.width = rect.w - 1;
    }
  }
  if (crumbs) {
    // A rule, the title (in a split) and breadcrumb row on its own background, a rule. The top
    // rule is the frame's when the window is at the top.
    const hw = rect.w;
    const rule = (y: number, w: number) => {
      drawText(c, rect.x, y, app.glyphs.hbar.repeat(w), roleStyle(theme, "border", page), w);
      geo.rules.push({ y, x0: rect.x, x1: rect.x + w });
    };
    const y = ruleAbove ? rect.y : rect.y + 1;
    if (!ruleAbove) rule(rect.y, rect.w);
    const bg = roleStyle(theme, "breadcrumb_band", page).bg;
    c.fill(rect.x, y, hw, 1, bg);
    let x = rect.x;
    if (titled) {
      const name = ` ${truncate(app.displayName(view.buf), Math.floor(rect.w / 2))} `;
      x += drawText(c, x, y, name, { ...roleStyle(theme, active ? "strong" : "dim", bg), bg }, rect.w);
    }
    let end = rect.x + hw;
    if (topRight && !app.rightRailWidth) {
      // The outline's button, at the far right (on the rail instead, when it shows).
      const label = ` ${app.glyphs.outlineButton} `;
      end -= stringWidth(label);
      button(app, c, end, { y, h: 1 }, label, app.outlineShown ? "topbar_button_on" : "topbar_button", "btn:outline", geo, bg);
    }
    drawBreadcrumb(app, c, view, x + 1, end - 1, y, bg, geo);
    rule(y + 1, hw);
    body = { x: rect.x, y: y + 2, w: rect.w, h: rect.y + rect.h - y - 2 };
  } else if (titled) {
    const st = roleStyle(theme, active ? "tab_active" : "tab", page);
    c.fill(rect.x, rect.y, rect.w, 1, st.bg);
    drawText(c, rect.x, rect.y, ` ${truncate(app.displayName(view.buf), rect.w - 2)} `, st, rect.w);
    body = { x: rect.x, y: rect.y + 1, w: rect.w, h: rect.h - 1 };
  }
  // Find (`/`): a row of its own under the header (or at the window's top) and a rule, while it's
  // typed and while the search is on — the window's search, like a pane's filter.
  if ((typing || view.find) && body.h > 6) {
    const y = body.y;
    const bg = page;
    const text = typing ? typing.text : view.find!.query;
    const f = view.find;
    // While replacing, the count is of the note's text: what enter and all would replace.
    const rep = typing?.replace;
    const count = !text
      ? ""
      : f?.error
        ? "not a regex"
        : rep
          ? rep.total
            ? `${rep.current + 1}/${rep.total}`
            : "no matches"
          : f && f.matches.length
            ? `${f.current + 1}/${f.matches.length}`
            : "no matches";
    // What goes right of the query, while at least QUERY_ROOM columns stay for it: the count, then
    // the toggles; in a narrow window the ones that don't fit are left out (⇄ first), never drawn
    // over the next pane.
    const QUERY_ROOM = 8;
    const queryStart = body.x + 3; // "› " after a column of margin
    const fits = (x: number) => x - queryStart >= QUERY_ROOM;
    let rx = body.x + body.w - 2;
    if (count && fits(rx - stringWidth(count) - 2)) {
      rx -= stringWidth(count);
      drawText(c, rx, y, count, { ...roleStyle(theme, f?.error ? "warn" : "dim", bg), bg });
      rx -= 2;
    }
    // Its toggles, clickable, bright while on: whole words, regex.
    const opts = view.findOpts ?? { regex: false, whole: false };
    const index = app.tab?.views.indexOf(view) ?? 0;
    // And ⇄, the replace row open or not. (None for :s…/c, whose pattern is always a regex.)
    const toggles = [["regex", " .* ", opts.regex], ["whole", " ab ", opts.whole], ["replace", " ⇄ ", !!rep]] as const;
    for (const [id, label, on] of rep?.confirm ? [] : toggles) {
      if (!fits(rx - stringWidth(label) - 1)) break;
      rx -= stringWidth(label);
      button(app, c, rx, { y, h: 1 }, label, on ? "topbar_button_on" : "topbar_button", `findopt:${id}:${index}`, geo, bg);
      rx -= 1;
    }
    // The query in the room left of them.
    const px = drawText(c, body.x + 1, y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
    // A query longer than its room shows its end, where you type (…cut at the start).
    const fw = drawText(c, body.x + 1 + px, y, truncateStart(text, Math.max(1, rx - (body.x + 1 + px) - 2)), { ...roleStyle(theme, "text", bg), bg });
    if (typing && !rep?.focus) drawText(c, body.x + 1 + px + fw, y, " ", roleStyle(theme, "cursor", bg));
    let rows = 1;
    // The replace row under it, with its buttons: replace this one, replace all.
    if (rep) {
      const ry = y + 1;
      const index = app.tab?.views.indexOf(view) ?? 0;
      let bx = body.x + body.w - 2;
      if (rep.confirm) {
        // :s…/c asks at each match instead.
        const ask = "replace? y n a q";
        bx -= stringWidth(ask);
        drawText(c, bx, ry, ask, { ...roleStyle(theme, "warn", bg), bg });
        bx -= 1;
      } else
        for (const [id, label] of [["all", " all "], ["one", " replace "]] as const) {
          if (!fits(bx - stringWidth(label) - 1)) break;
          bx -= stringWidth(label);
          button(app, c, bx, { y: ry, h: 1 }, label, "topbar_button", `findrep:${id}:${index}`, geo, bg);
          bx -= 1;
        }
      const qx = drawText(c, body.x + 1, ry, "⇄ ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
      const rw = drawText(c, body.x + 1 + qx, ry, truncateStart(rep.text, Math.max(1, bx - (body.x + 1 + qx) - 2)), { ...roleStyle(theme, "text", bg), bg });
      if (rep.focus && !rep.confirm) drawText(c, body.x + 1 + qx + rw, ry, " ", roleStyle(theme, "cursor", bg));
      rows = 2;
    }
    drawText(c, body.x, y + rows, app.glyphs.hbar.repeat(body.w), roleStyle(theme, "border", page), body.w);
    geo.rules.push({ y: y + rows, x0: body.x, x1: body.x + body.w });
    if (typing) geo.findInWindow = true;
    body = { ...body, y: y + rows + 1, h: body.h - rows - 1 };
  }
  // Wrapping off: the last row is the horizontal scrollbar's (kept even when the note fits, so
  // the text doesn't jump).
  const hbar = !app.ui.wrap && body.h > 3;
  if (hbar) body = { ...body, h: body.h - 1 };
  if (body.h <= 0 || body.w <= 6) return;
  view.height = body.h;
  view.width = body.w - 1;
  const gutter = app.gutterWidth(view);
  const layout = app.layoutFor(view, view.width, gutter);
  // Readable width centres the text column in the pane.
  const free = view.width - gutter - layout.width - 1;
  const offset = app.ui.readable_width || app.ui.zen ? Math.max(0, Math.floor(free / 2)) : 0;
  const gutterX = body.x + 1 + offset;
  const textX = gutterX + gutter;
  geo.panes.push({ ...body, view, textX });

  const showCursor = active && contentFocused;
  const find = view.find;
  const underCursor = showCursor ? app.linkUnderCursor(view) : -1;
  const cursorBg = app.ui.cursorline && showCursor ? (theme.roles.cursor_line.bg ?? null) : null;
  const sel = view.sel ? { range: ordered(view.sel.anchor, view.cur), line: view.sel.line } : null;
  const textW = Math.max(1, body.x + body.w - 1 - textX);
  // Wrapping off: never scrolled past what this width can show (after a resize, say).
  view.left = app.ui.wrap ? 0 : Math.max(0, Math.min(view.left, Math.max(0, layout.width - textW)));
  const cursorSrc = layout.lines[view.cur.row]?.src;

  const errors = syntaxErrorsShown(view);
  const links = commentLinksShown(view);
  let prevSrc = view.top > 0 ? (layout.lines[view.top - 1]?.src ?? -1) : -1;
  // The rows shown: an oversized lens hides the ones outside its inner window (4.15).
  const shown = app.screenRows(view, layout);
  const hidden = app.lensHidden(view, layout);
  for (let i = 0; i < body.h; i++) {
    const row = shown[i];
    if (row === undefined) break;
    const line = layout.lines[row]!;
    const y = body.y + i;
    const isCursorRow = showCursor && row === view.cur.row;
    const band = isCursorRow ? cursorBg : null;
    if (band) c.fill(body.x, y, body.w - 1, 1, band);
    if (gutter) {
      const num = line.src !== prevSrc ? String(line.src).padStart(gutter - 1) : "";
      const role: Role = errors?.has(line.src) ? "error" : line.src === cursorSrc && showCursor ? "line_number_current" : "line_number";
      if (num) drawText(c, gutterX, y, num, { ...roleStyle(theme, role, page), bg: band ?? page });
    }
    prevSrc = line.src;
    const fill = line.fill ? theme.roles[line.fill].bg : undefined;
    if (fill && !band) c.fill(textX, y, Math.min(layout.width, textW), 1, fill);

    const marks: { from: number; to: number; role: Role }[] = [];
    if (find) {
      find.matches.forEach((m, k) => {
        if (m.row === row) marks.push({ from: m.col, to: m.col + m.len, role: k === find.current ? "link_focus" : "selection" });
      });
    }
    if (sel && row >= sel.range[0].row && row <= sel.range[1].row) {
      const from = sel.line || row !== sel.range[0].row ? 0 : sel.range[0].col;
      const to = sel.line || row !== sel.range[1].row ? 1e9 : sel.range[1].col + 1;
      marks.push({ from, to, role: "selection" });
    }
    if (errors) marks.push(...offsetMarks(line, errors.get(line.src), layout.lines[row + 1]?.src !== line.src, "syntax_error"));
    if (links) marks.push(...offsetMarks(line, links.get(line.src), false, "link"));
    drawLine(c, textX, y, line, textW, theme, band, page, underCursor, marks, view.left);
    // An oversized lens's rules say how much of it is out of sight: ↑ above, ↓ below.
    if ((line.lens === "top" || line.lens === "bottom") && hidden.length) {
      const first = layout.lines.findIndex((l) => l.lens === "source");
      const n = hidden.filter(([a]) => (line.lens === "top" ? a === first : a !== first)).reduce((k, [a, b]) => k + b - a, 0);
      if (n) {
        const label = ` ${line.lens === "top" ? "↑" : "↓"} ${n} line${n === 1 ? "" : "s"} `;
        const x = textX + Math.max(0, Math.min(layout.width, textW) - stringWidth(label) - 2);
        drawText(c, x, y, label, { ...roleStyle(theme, view.insert ? "lens_edit" : "lens", page), bg: page });
      }
    }
    if (isCursorRow && view.cur.col >= view.left && view.cur.col < view.left + textW) drawCursor(c, textX - view.left, y, line, view.cur.col, theme, view.left + textW);
  }

  if (hbar) {
    const r = { x: textX, y: body.y + body.h, w: textW, h: 1 };
    c.fill(body.x, r.y, body.w, 1, page);
    if (layout.width > textW) {
      drawHScrollbar(app, c, r, layout.width, view.left, active, page);
      geo.scrollbars.push({ ...r, view, total: layout.width, horizontal: true });
    }
  }
  // Scrollbar in the last column.
  const total = layout.lines.length;
  if (total > body.h) {
    drawScrollbar(app, c, { x: body.x + body.w - 1, y: body.y, w: 1, h: body.h }, total, view.top, active, page);
    geo.scrollbars.push({ view, total, x: body.x + body.w - 1, y: body.y, w: 1, h: body.h });
  }
}

/** A side pane's scrollbar, in its list's last column, when the list is longer than the pane. */
function paneScrollbar(app: App, c: Canvas, rect: Rect, total: number, top: number, pane: "sidebar" | "outline", active: boolean, bg: Color | null, geo: Geometry): void {
  if (total <= rect.h || rect.h < 2) return;
  const bar = { x: rect.x + rect.w - 1, y: rect.y, w: 1, h: rect.h };
  drawScrollbar(app, c, bar, total, top, active, bg);
  geo.scrollbars.push({ ...bar, pane, total });
}

/** The horizontal scrollbar: a `▄` track with a `▄` thumb for `total` columns from `left`. */
function drawHScrollbar(app: App, c: Canvas, r: Rect, total: number, left: number, active: boolean, bg: Color | null): void {
  const theme = app.theme;
  const thumb = Math.max(2, Math.round((r.w * r.w) / total));
  const pos = Math.round((left / Math.max(1, total - r.w)) * (r.w - thumb));
  const st = { ...roleStyle(theme, active ? "scrollbar" : "border", bg), bg };
  const track = { ...roleStyle(theme, "scrollbar_track", bg), bg };
  const trackGlyph = theme.roles.scrollbar_track.fg ? app.glyphs.hScrollTrack : " ";
  drawText(c, r.x, r.y, trackGlyph.repeat(r.w), track, r.w);
  drawText(c, r.x + pos, r.y, app.glyphs.hScrollThumb.repeat(thumb), st, thumb);
}

/**
 * A source file's syntax errors by line (16.9), while they're worth showing: in source mode, out
 * of insert (a half-typed line is always broken), and only for the text as it is now.
 */
function syntaxErrorsShown(view: View): Map<number, SyntaxError[]> | null {
  const syn = view.buf.syntax;
  if (!view.source || view.insert || !syn?.errors.length || syn.version !== view.buf.version) return null;
  const out = new Map<number, SyntaxError[]>();
  for (const e of syn.errors) out.set(e.line, [...(out.get(e.line) ?? []), e]);
  return out;
}

/** A source file's links in comments by line (16.10), for the text as it is now. */
function commentLinksShown(view: View): Map<number, CommentLink[]> | null {
  const syn = view.buf.syntax;
  if (!view.source || !syn?.links.length || syn.version !== view.buf.version) return null;
  const out = new Map<number, CommentLink[]>();
  for (const l of syn.links) out.set(l.line, [...(out.get(l.line) ?? []), l]);
  return out;
}

/**
 * The columns of one row that source ranges (UTF-16 offsets in its line) cover. One past the
 * line's end (an error's missing `)`) marks the last cell, on the line's last row.
 */
function offsetMarks(line: Line, ranges: { from: number; to: number }[] | undefined, lastRow: boolean, role: Role): { from: number; to: number; role: Role }[] {
  if (!ranges || !line.srcMap) return [];
  const cs = cells(line);
  const out: { from: number; to: number; role: Role }[] = [];
  for (const e of ranges) {
    const hit = cs.filter((k) => k.at! >= e.from && k.at! < e.to);
    if (hit.length) out.push({ from: hit[0]!.x, to: hit[hit.length - 1]!.x + hit[hit.length - 1]!.w, role });
    else if (lastRow && e.from >= line.srcMap.end && cs.length) out.push({ from: cs[cs.length - 1]!.x, to: cs[cs.length - 1]!.x + cs[cs.length - 1]!.w, role });
  }
  return out;
}

/** A scrollbar: a `▐` track with a `▐` thumb sized and placed for `total` rows from `top`. */
function drawScrollbar(app: App, c: Canvas, r: Rect, total: number, top: number, active: boolean, bg: Color | null): void {
  const theme = app.theme;
  const thumb = Math.max(1, Math.round((r.h * r.h) / total));
  const pos = Math.round((top / Math.max(1, total - r.h)) * (r.h - thumb));
  const st = { ...roleStyle(theme, active ? "scrollbar" : "border", bg), bg };
  const track = { ...roleStyle(theme, "scrollbar_track", bg), bg };
  // Without colour (NO_COLOR) the track is blank, so the thumb's shape shows where you are.
  const trackGlyph = theme.roles.scrollbar_track.fg ? app.glyphs.scrollTrack : " ";
  for (let k = 0; k < r.h; k++) drawText(c, r.x, r.y + k, trackGlyph, track, 1);
  for (let k = 0; k < thumb; k++) drawText(c, r.x, r.y + pos + k, app.glyphs.scrollThumb, st, 1);
}

/** The block cursor: the character under it drawn with the cursor role (inverse without colour). */
/** The cursor on its character; a wide one at the last column (`end`) shows as one cell. */
function drawCursor(c: Canvas, x: number, y: number, line: Line, col: number, theme: Theme, end = Number.POSITIVE_INFINITY): void {
  const st = roleStyle(theme, "cursor", null);
  const cell = cells(line).find((k) => k.x === col);
  // A tab is one stop several columns wide: the cursor sits on its first column.
  if (cell && cell.g === "\t") c.cell(x + cell.x, y, " ", 1, st);
  else if (cell && cell.x + cell.w <= end) c.cell(x + cell.x, y, cell.g, cell.w, st);
  else c.cell(x + col, y, " ", 1, st);
}

/**
 * Draw one layout row from column `left` (wrapping off, scrolled sideways), `maxW` columns of it.
 * `marks` override styles by column range; the link under the cursor too.
 */
function drawLine(c: Canvas, x: number, y: number, line: Line, maxW: number, theme: Theme, band: Color | null, page: Color | null, focusLink: number, marks: { from: number; to: number; role: Role }[], left = 0): void {
  let col = 0;
  const end = left + maxW;
  const fillBg = line.fill ? theme.roles[line.fill].bg : undefined;
  for (const span of line.spans) {
    if (col >= end) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    // The cursor-row band replaces the page and the block's fill, never a span's own background;
    // off the cursor row, text keeps its block's fill (a code block's text on its background).
    if (band && (!st.bg || st.bg === fillBg)) st.bg = band;
    else if (!st.bg) st.bg = page;
    if (!marks.length && !left) {
      const w = drawText(c, x + col, y, span.text, st, maxW - col);
      if (w < stringWidth(span.text)) return; // cut at the edge (a wide character that didn't fit)
      col += w;
      continue;
    }
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      if (col + w > end) return;
      // A wide character cut by the left edge shows as a blank.
      if (col < left) {
        if (col + w > left) c.cell(x, y, " ", 1, st);
        col += w;
        continue;
      }
      const mark = marks.find((m) => col >= m.from && col < m.to);
      const cell = mark ? { ...st, ...markStyle(theme, mark.role) } : st;
      if (w > 0) c.cell(x + col - left, y, g, w, cell);
      col += w;
    }
  }
}

function markStyle(theme: Theme, role: Role): Partial<CellStyle> {
  const r = theme.roles[role];
  const out: Partial<CellStyle> = {};
  if (r.bg) out.bg = r.bg;
  if (r.fg) out.fg = r.fg;
  if (r.bold) out.bold = true;
  if (r.underline) out.underline = true;
  if (r.inverse) out.inverse = true;
  return out;
}

/** A side pane's title and the blank row under it; returns the rect left for the pane's list.
 *  Short panes skip the title. */
function paneTitle(app: App, c: Canvas, rect: Rect, title: string, focused: boolean, bg: Color | null): Rect {
  if (rect.h < 8) return rect;
  // Bright while the pane has focus, dimmer otherwise; bold either way.
  drawText(c, rect.x + 1, rect.y, title, { ...roleStyle(app.theme, focused ? "pane_title_active" : "pane_title", bg), bg }, rect.w - 1);
  return { ...rect, y: rect.y + 2, h: rect.h - 2 };
}

/**
 * Tree lines for rows at the given depths: for each row, whether it is the last of its siblings,
 * and for each indentation column whether the ancestor drawn there has siblings still to come
 * (so a │ runs on).
 */
function treeLines(depths: number[]): { last: boolean; more: boolean[] }[] {
  const out: { last: boolean; more: boolean[] }[] = new Array(depths.length);
  const seen: boolean[] = []; // seen[k]: a row at depth k below, before any shallower row
  for (let i = depths.length - 1; i >= 0; i--) {
    const d = depths[i]!;
    // Column k carries the line of the ancestor at depth k + 1 (its ├─ sits in that column).
    out[i] = { last: !seen[d], more: Array.from({ length: d }, (_, k) => !!seen[k + 1]) };
    seen[d] = true;
    seen.length = d + 1;
  }
  return out;
}

/** Dim tree lines in a row's indentation: │ for ancestors that go on, then ├─ or └─ to the row. */
function drawGuides(app: App, c: Canvas, rect: Rect, y: number, depth: number, line: { last: boolean; more: boolean[] }, bg: Color | null, left = 0): void {
  const g = app.glyphs;
  const st = { ...roleStyle(app.theme, "tree_guide", bg), bg };
  for (let k = 0; k < depth; k++) {
    const x = rect.x + 1 + k * 2 - left;
    if (x + 1 >= rect.x + rect.w - 1) break;
    if (k === depth - 1) {
      // Scrolled sideways, the branch may be half off the left edge.
      const branch = `${line.last ? g.guideLast : g.guideBranch}${g.guideDash}`;
      if (x >= rect.x) drawText(c, x, y, branch, st, 2);
      else if (x + 1 >= rect.x) drawText(c, x + 1, y, g.guideDash, st, 1);
    } else if (line.more[k] && x >= rect.x) drawText(c, x, y, g.guide, st, 1);
  }
}

/** A side pane's list viewport: its rows' natural width and, when they don't fit, the sideways
 *  offset and the row under the list that the horizontal scrollbar takes. */
interface SideView {
  list: Rect;
  /** Columns for text: the last one is the vertical scrollbar's. */
  cols: number;
  natural: number;
  left: number;
  hbar: Rect | null;
}

const naturalWidths = new WeakMap<object, number>();

function sideView<T extends object>(rect: Rect, rows: T[], text: (row: T) => string, state: SidePaneState, least = 0): SideView {
  const cols = Math.max(1, rect.w - 1);
  let cached = naturalWidths.get(rows);
  if (cached === undefined) {
    cached = 0;
    for (const row of rows) cached = Math.max(cached, stringWidth(text(row)) + 1);
    naturalWidths.set(rows, cached);
  }
  const natural = Math.max(cached, least);
  if (natural <= cols || rect.h < 4) {
    state.left = 0;
    return { list: rect, cols, natural, left: 0, hbar: null };
  }
  const list = { ...rect, h: rect.h - 1 };
  state.left = Math.max(0, Math.min(state.left ?? 0, natural - cols));
  return { list, cols, natural, left: state.left, hbar: { x: rect.x, y: rect.y + rect.h - 1, w: cols, h: 1 } };
}

/** One side-pane row's text from the view's offset: clipped when the pane scrolls sideways,
 *  cut with an ellipsis otherwise (a pane too short for the bar). */
function sideRow(text: string, sv: SideView): string {
  if (!sv.hbar) return truncate(text, sv.cols);
  return splitAtWidth(splitAtWidth(text, sv.left)[1], sv.cols)[0];
}

function sideHScrollbar(app: App, c: Canvas, sv: SideView, pane: "sidebar" | "outline", active: boolean, bg: Color | null, geo: Geometry): void {
  if (!sv.hbar) return;
  drawHScrollbar(app, c, sv.hbar, sv.natural, sv.left, active, bg);
  geo.scrollbars.push({ ...sv.hbar, pane, total: sv.natural, horizontal: true });
}

/** The left panel: the explorer's tree or the history; returns the rect its list occupies. */
function drawSidebar(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const history = app.leftView === "history";
  const title = LEFT_VIEWS.find((v) => v.id === app.leftView)!.title;
  let rect = paneTitle(app, c, pane, title, app.region === "sidebar", base.bg);
  // The explorer's title: a new note and a new folder, at its right end (18.1).
  if (!history && rect !== pane) {
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
  }
  const s = app.sidebar;
  rect = filterRow(app, c, rect, s, app.region === "sidebar", base.bg, geo);
  return history ? drawHistoryList(app, c, rect, base.bg, geo) : drawTree(app, c, rect, base.bg, geo);
}

/**
 * A pane's filter (`/`), at the top of its list while it's open or holds text: the `› text` row
 * and a rule across the pane (joined to its border), then the list. Returns the rect
 * left for the list; a short pane gets only the text row.
 */
function filterRow(app: App, c: Canvas, rect: Rect, s: SidePaneState, focused: boolean, bg: Color | null, geo: Geometry): Rect {
  if (!(s.filtering || s.filter) || rect.h <= 2) return rect;
  const theme = app.theme;
  const px = drawText(c, rect.x + 1, rect.y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
  const fw = drawText(c, rect.x + 1 + px, rect.y, truncate(s.filter ?? "", rect.w - 4 - px), { ...roleStyle(theme, "text", bg), bg });
  if (s.filtering && focused) drawText(c, rect.x + 1 + px + fw, rect.y, " ", roleStyle(theme, "cursor", bg));
  if (rect.h <= 6) return { ...rect, y: rect.y + 1, h: rect.h - 1 };
  drawText(c, rect.x, rect.y + 1, app.glyphs.hbar.repeat(rect.w), { ...roleStyle(theme, "border", bg), bg }, rect.w);
  geo.rules.push({ y: rect.y + 1, x0: rect.x, x1: rect.x + rect.w });
  return { ...rect, y: rect.y + 2, h: rect.h - 2 };
}

/** Keep a side list's selection in view (unless the wheel moved it) and clamp its scroll. */
function followSelection(s: SidePaneState, count: number, h: number): void {
  s.selected = Math.max(0, Math.min(s.selected, count - 1));
  if (!s.pinned && s.selected < s.scroll) s.scroll = s.selected;
  if (!s.pinned && s.selected >= s.scroll + h) s.scroll = s.selected - h + 1;
  s.scroll = Math.max(0, Math.min(s.scroll, Math.max(0, count - h)));
}

/** The explorer's tree (filtered while the filter holds text, its matches highlighted). */
function drawTree(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const rows = app.explorerRows();
  const lines = treeLines(rows.map((r) => r.depth));
  const s = app.sidebar;
  const g = app.glyphs;
  const q = s.filter ?? "";
  // Every file with its extension, notes too: a vault holds notes, data files and code
  // side by side, and the extension says which.
  const nameOf = (row: TreeRow) => row.name;
  const icon = (row: TreeRow) =>
    row.root ? (row.root.kind === "vault" ? g.vault : g.dirClosed) : row.group === "data" ? g.dataFile : row.group === "text" ? g.textFile : g.file;
  const prefix = (row: TreeRow) => `${" ".repeat(1 + row.depth * 2)}${row.kind === "dir" ? (q || app.expanded.has(row.path) ? g.dirOpen : g.dirClosed) : icon(row)} `;
  const text = (row: TreeRow) => prefix(row) + nameOf(row);
  // The selected note, file, folder or nested vault: a button at the row's end opening its menu
  // (18.1) — rename, move, delete… — its right edge under the title's buttons'.
  const buttonsOf = (row: TreeRow) => {
    if (row.kind === "root" && !(row.root?.kind === "vault" && app.loc.mode === "vault")) return null;
    const bs: (readonly [string, string])[] = [[g.itemMenu, "xrow:menu"]];
    return { bs, w: bs.reduce((n, [glyph]) => n + stringWidth(glyph) + 2, 0) };
  };
  const sel = app.region === "sidebar" ? rows[Math.max(0, Math.min(s.selected, rows.length - 1))] : undefined;
  const selButtons = sel ? buttonsOf(sel) : null;
  const buttonsFit = !!selButtons && list.w - 1 - selButtons.w >= 4;
  // A name that doesn't fit beside them: the pane scrolls sideways, its end reachable before them.
  const sv = sideView(list, rows, text, s, sel && buttonsFit ? stringWidth(text(sel)) + selButtons!.w + 1 : 0);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length && q) drawText(c, rect.x + 1, rect.y, "no matches", roleStyle(theme, "dim", bg), rect.w - 1);
  const current = app.view?.buf.rel;
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    let role: Role =
      row.root?.kind === "vault" ? "sidebar_vault" : row.kind !== "note" ? "sidebar_dir" : row.path === current ? "sidebar_active" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const withButtons = selected && row === sel && buttonsFit;
    const buttonsW = withButtons ? selButtons!.w : 0;
    const shown = sideRow(text(row), sv);
    const room = sv.cols - buttonsW;
    const w = drawText(c, rect.x, y, !withButtons ? shown : sv.hbar ? splitAtWidth(shown, room)[0] : truncate(shown, room), st, rect.w);
    if (withButtons) {
      let x = rect.x + rect.w - 1;
      for (const [glyph, id] of selButtons!.bs) {
        x -= stringWidth(glyph) + 2;
        smallButton(app, c, x, y, ` ${glyph} `, id, geo, st.bg);
      }
    }
    // A vault named otherwise than its folder: the name, dimmed, after it (17.13) — up to its
    // buttons, when it has them.
    const vaultName = row.root?.name;
    const nameEnd = withButtons ? room : rect.w;
    if (vaultName && !sv.left && w + 1 < nameEnd) drawText(c, rect.x + w + 1, y, vaultName, { ...roleStyle(theme, "dim", st.bg), bg: st.bg }, nameEnd - w - 1);
    drawGuides(app, c, rect, y, row.depth, lines[s.scroll + i]!, st.bg, sv.left);
    // What the filter matched in a note's name (it matches the path: a word may be a folder's).
    const m = q && row.kind === "note" && row.path.endsWith(nameOf(row)) ? match(q, row.path) : null;
    if (m) {
      const name = nameOf(row);
      const off = stringWidth(prefix(row));
      const base = row.path.length - name.length;
      for (const p of m.positions.filter((x) => x >= base).map((x) => x - base)) {
        const x = rect.x + off + stringWidth(name.slice(0, p)) - sv.left;
        if (x >= rect.x && x < rect.x + sv.cols) c.cell(x, y, name[p]!, 1, { ...st, fg: matchSt.fg, bold: true });
      }
    }
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  sideHScrollbar(app, c, sv, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}

/** A one-row button: its text, the hover role under the mouse, a hot region for clicks. */
function smallButton(app: App, c: Canvas, x: number, y: number, text: string, id: string, geo: Geometry, bg: Color | null): number {
  const st = app.hover === id ? roleStyle(app.theme, "hover", bg) : { ...roleStyle(app.theme, "topbar_button", bg), bg };
  const w = drawText(c, x, y, text, st);
  geo.hot.push({ id, x, y, w, h: 1 });
  return w;
}

/** The history: the window's timeline, newest first, the current place marked `here`. */
function drawHistoryList(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const rows = app.historyRows();
  const s = app.sidebar;
  const text = (row: HistoryRow) => ` ${row.label}`;
  // Never scrolled sideways: a name too long is cut instead, so every row keeps its hint.
  const sv = sideView(list, rows, () => "", s);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length) drawText(c, rect.x + 1, rect.y, s.filter ? "no matches" : "no history yet", roleStyle(theme, "dim", bg), rect.w - 1);
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
    if (w + 2 + hintW <= sv.cols - 1) drawText(c, rect.x + sv.cols - 1 - hintW, y, row.hint, { ...roleStyle(theme, "dim", st.bg), bg: st.bg });
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  sideHScrollbar(app, c, sv, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}

/** The outline; returns the rect its headings occupy (under the title). */
function drawOutline(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  let rect = paneTitle(app, c, pane, RIGHT_VIEWS[0]!.title, app.region === "outline", base.bg);
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.outlineRows();
  const lines = treeLines(rows.map((r) => r.level - 1));
  const o = app.outline;
  const g = app.glyphs;
  const text = (row: (typeof rows)[number]) => {
    const marker = row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " ";
    return `${" ".repeat(1 + (row.level - 1) * 2)}${marker} ${row.text}`;
  };
  const sv = sideView(rect, rows, text, o);
  rect = sv.list;
  const current = app.currentSection();
  // While the outline is not focused, it follows the cursor's section.
  if (app.region !== "outline" && current >= 0) o.selected = current;
  o.selected = Math.max(0, Math.min(o.selected, rows.length - 1));
  // Keep the selection in view, unless the wheel moved the view.
  if (!o.pinned && o.selected < o.scroll) o.scroll = o.selected;
  if (!o.pinned && o.selected >= o.scroll + rect.h) o.scroll = o.selected - rect.h + 1;
  o.scroll = Math.max(0, Math.min(o.scroll, Math.max(0, rows.length - rect.h)));
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

function drawStatus(app: App, c: Canvas, band: Band, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const st = roleStyle(theme, "status", page);
  c.fill(0, band.y, c.width, band.h, st.bg);
  const y = mid(band);
  const view = app.view;
  const vim = app.vim;
  const chip = app.pending.length
    ? ` ${app.pending.map((k) => prettyKey(k, app.leader)).join(" ")} `
    : vim.op || vim.count || vim.awaitChar
      ? // An operator (or a count, or r) waiting: what's been typed so far, as in vim's showcmd.
        ` ${vim.op ? `${vim.op.count > 1 ? vim.op.count : ""}${vim.op.op}${vim.count}${vim.op.object ?? ""}${vim.op.keys.join("")}` : vim.awaitChar ? "r" : vim.count} `
    : app.resizeMode
      ? " RESIZE "
    : view?.visual === "char"
      ? " VISUAL "
      : view?.visual === "line"
        ? " V-LINE "
        : app.region === "sidebar"
          ? " FILES "
          : app.region === "outline"
            ? " OUTLINE "
            : view?.insert
              ? " INSERT "
              : view?.source
                ? " SOURCE "
                : view?.live
                  ? " LENS "
                  : " READ ";
  const chipSt = roleStyle(theme, "status_accent", page);
  c.fill(0, band.y, stringWidth(chip), band.h, chipSt.bg ?? null);
  let x = drawText(c, 0, y, chip, chipSt);
  if (!view) return;
  const buf = view.buf;
  const layout = app.currentLayout(view);
  // Where the view is among the rows shown (an oversized lens hides some; they don't count).
  const hidden = view.live ? app.lensHidden(view, layout) : [];
  const hiddenIn = (a: number, b: number) => hidden.reduce((n, [h0, h1]) => n + Math.max(0, Math.min(h1, b) - Math.max(h0, a)), 0); // ranges are [start, end)
  const shownTotal = layout.lines.length - hiddenIn(0, layout.lines.length);
  const shownTop = view.top - hiddenIn(0, view.top);
  const pct = shownTotal <= view.height ? "all" : `${Math.round((shownTop / Math.max(1, shownTotal - view.height)) * 100)}%`;
  const src = layout.lines[view.cur.row]?.src ?? 1;
  // The right side: the position always; the tab count and the link under the cursor only while
  // the path keeps a readable width (the link goes first, then the tab count).
  const pos = `L${src}:${view.cur.col + 1} ${pct}`;
  // Words: the note's, or the selection's in visual mode; dropped first when room is short.
  const n = view.visual ? countWords(app.selectionText(view)) : buf.words();
  const words = `${n.toLocaleString("en")} word${n === 1 ? "" : "s"}${view.visual ? " selected" : ""}  `;
  const tabs = app.tabs.length > 1 ? `tab ${app.activeTab + 1}/${app.tabs.length}  ` : "";
  const li = app.linkUnderCursor(view);
  const link = li >= 0 ? layout.links[li] : null;
  const linkText = link ? (link.kind === "tag" ? `→ #${link.target}  ` : `→ ${link.kind === "wiki" || link.kind === "embed" ? `[[${link.target}${link.heading ? `#${link.heading}` : ""}]]` : link.target} (${link.status})  `) : "";
  const markerW = stringWidth(pathMarker(app, view));
  const room = c.width - stringWidth(chip) - 2 - Math.min(16, stringWidth(app.displayName(view.buf))) - markerW;
  let right = `${linkText}${words}${tabs}${pos}`;
  if (stringWidth(right) + 1 > room) right = `${linkText}${tabs}${pos}`;
  if (stringWidth(right) + 1 > room) right = `${tabs}${pos}`;
  if (stringWidth(right) + 1 > room) right = pos;

  const rightW = stringWidth(right) + 1;
  const changed = buf.changedAt && app.now() - buf.changedAt < CHANGE_MARKER_MS;
  x += drawText(c, x, y, " ", st);
  const pathId = "status:path";
  // The path shrinks to leave room for its marker (reloaded / deleted) and the right-hand side;
  // the watch marker after it is dropped when it doesn't fit.
  const full = app.displayName(buf);
  // Short of room, the marker says it in symbols (• ⚠), so the path keeps a readable width and the
  // position on the right is never pushed out.
  const long = pathMarker(app, view);
  const marker = c.width - x - rightW - 2 - stringWidth(long) >= 16 ? long : pathMarker(app, view, true);
  const pathW = Math.max(4, c.width - x - rightW - 2 - stringWidth(marker));
  // Cut from the front: the note's own name is the part worth keeping.
  const pw = drawText(c, x, y, truncateStart(full, pathW), app.hover === pathId ? roleStyle(theme, "hover", st.bg) : { ...st, bold: true });
  geo.hot.push({ id: pathId, x, y: band.y, w: pw, h: band.h });
  x += pw;
  const markerRole: Role = buf.deleted ? "error" : buf.conflictKept || buf.dirty ? "warn" : "info";
  if (marker) x += drawText(c, x, y, marker, roleStyle(theme, markerRole, st.bg), Math.max(0, c.width - rightW - x));
  // Whether external changes to this file will show up.
  const w = app.watcher;
  const watch = w?.degraded
    ? { text: "⚠ not watching", role: "warn" as Role }
    : w
      ? { text: `● watching${w.polledDirs.length ? ` (${w.polledDirs.length} polled)` : ""}`, role: "check_done" as Role }
      : { text: "○ not watching", role: "status_dim" as Role };
  const rx = c.width - rightW;
  // A source file's syntax errors (16.9): the one on the cursor's line, else how many there are.
  const errs = syntaxErrorsShown(view);
  if (errs) {
    const here = errs.get(src)?.[0];
    const n = [...errs.values()].reduce((k, l) => k + l.length, 0);
    const text = here ? `  ✖ ${here.message}` : `  ✖ ${n} syntax error${n === 1 ? "" : "s"}`;
    if (x + stringWidth(text) + 1 < rx) x += drawText(c, x, y, text, { ...roleStyle(theme, "error", st.bg), bg: st.bg });
  }
  if (x + stringWidth(watch.text) + 3 < rx) x += drawText(c, x, y, `  ${watch.text}`, { ...roleStyle(theme, watch.role, st.bg), bg: st.bg });
  if (rx > x) drawText(c, rx, y, right, { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg });
}

/** The marker after the status line's path (its length is what the right side must leave room for);
 *  `short`: in symbols only, for a narrow screen. */
function pathMarker(app: App, view: View, short = false): string {
  const buf = view.buf;
  const changed = buf.changedAt && app.now() - buf.changedAt < CHANGE_MARKER_MS;
  if (short) return buf.deleted ? " ✖" : buf.conflictKept ? " • ⚠" : buf.dirty ? " •" : changed ? " ↻" : "";
  return buf.deleted ? " ✖ deleted on disk" : buf.conflictKept ? " • unsaved ⚠ differs from disk" : buf.dirty ? " • unsaved" : changed ? " ↻ reloaded" : "";
}

/** A question with no room to float, or a message with no top bar to sit in, over the status
 *  line (zen: the last row). */
function drawBottomLine(app: App, c: Canvas, y: number, geo: Geometry, o: PromptOverlay | null): void {
  const theme = app.theme;
  const bg = app.ui.zen ? pageBg(theme) : roleStyle(theme, "status", pageBg(theme)).bg;
  c.fill(0, y, c.width, 1, bg);
  if (o) {
    const x = drawText(c, 1, y, o.confirm ? `${o.label.trim()} y / n` : o.label, { ...roleStyle(theme, "info", bg), bg }) + 1;
    const w = drawText(c, x, y, truncate(o.text, c.width - x - 2), { ...roleStyle(theme, "text", bg), bg });
    drawText(c, x + w, y, " ", roleStyle(theme, "cursor", bg));
    return;
  }
  if (!app.transient) return;
  drawMessage(app, c, 1, c.width - 1, y, bg, geo);
}

/** Narrower than this, messages go over the status line instead of floating. */
const TOAST_MIN_W = 30;

/**
 * The messages still showing, as boxes at the top right of the content, newest first, stacked
 * down: each framed in its level's colour (error, warning, info), its glyph first, wrapped to three
 * rows at most. A click on one opens the messages list (every message is there, whole).
 */
function drawToasts(app: App, c: Canvas, top: number, bottom: number, geo: Geometry): void {
  const theme = app.theme;
  const g = app.glyphs;
  const b = g.box;
  const bg = roleStyle(theme, "overlay", null);
  const maxW = Math.max(16, Math.min(56, Math.floor(c.width * 0.45)));
  const right = c.width - 2; // clear of the scrollbar and the rail
  // Hanging from the rule under the chrome at the top of the window under them (breadcrumb, find
  // and replace rows, whose counts and toggles sit at the right): the rule just above its text.
  const under = geo.panes.filter((p) => p.x + p.w > right - maxW && p.x < right);
  let y = Math.max(top, (under.length ? Math.min(...under.map((p) => p.y)) : top + 1) - 1);
  app.toasts.forEach((m, i) => {
    const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
    // An info message that starts with its own symbol (`↻ … reloaded`) needs no second one.
    const mark = m.level === "error" ? g.msgError : m.level === "warn" ? g.msgWarn : /^[\p{L}\p{N}"'`(]/u.test(m.text) ? g.msgInfo : "";
    const inner = maxW - 4;
    // Wrapped at spaces where it can be, to three rows; what's past them ends in …
    const rows: string[] = [];
    let rest = (mark ? `${mark} ${m.text}` : m.text).replace(/\s+/g, " ").trim();
    while (rest && rows.length < 3) {
      let [head, tail] = splitAtWidth(rest, inner);
      const cut = tail && !tail.startsWith(" ") ? head.lastIndexOf(" ") : -1;
      if (cut > inner / 2) [head, tail] = [head.slice(0, cut), head.slice(cut) + tail];
      rows.push(head.trimEnd());
      rest = tail.trimStart();
    }
    if (rest) rows[rows.length - 1] = truncate(`${rows[rows.length - 1]} ${rest}`, inner);
    const w = Math.max(...rows.map((r) => stringWidth(r))) + 4;
    const h = rows.length + 2;
    if (y + h > bottom) return;
    const x = right - w;
    const frame = { ...roleStyle(theme, role, bg.bg), bg: bg.bg };
    const id = `toast:${i}`;
    const text = app.hover === id ? roleStyle(theme, "hover", bg.bg) : { ...roleStyle(theme, "overlay", null), bg: bg.bg };
    c.fill(x, y, w, h, bg.bg);
    drawText(c, x, y, `${b.tl}${b.h.repeat(w - 2)}${b.tr}`, frame);
    rows.forEach((r, k) => {
      drawText(c, x, y + 1 + k, b.v, frame, 1);
      const markW = k === 0 && mark ? drawText(c, x + 2, y + 1, mark, { ...frame, bold: true }) : 0;
      drawText(c, x + 2 + markW, y + 1 + k, markW ? r.slice(mark.length) : r, text, inner);
      drawText(c, x + w - 1, y + 1 + k, b.v, frame, 1);
    });
    drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, frame);
    geo.hot.push({ id, x, y, w, h });
    y += h;
  });
}

/** The latest message between `x0` and `x1`, right-aligned, its level as colour and a glyph;
 *  a click opens the messages. (A screen too small for the floating boxes: the status line.) */
function drawMessage(app: App, c: Canvas, x0: number, x1: number, y: number, bg: Color | null, geo: Geometry): number {
  const m = app.transient;
  if (!m || x1 - x0 < 6) return x1;
  const theme = app.theme;
  const g = app.glyphs;
  const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
  // An info message that starts with its own symbol (`↻ … reloaded`) needs no second one.
  const mark = m.level === "error" ? g.msgError : m.level === "warn" ? g.msgWarn : /^[\p{L}\p{N}"'`(]/u.test(m.text) ? g.msgInfo : "";
  const text = truncate(mark ? `${mark} ${m.text}` : m.text, x1 - x0);
  const w = stringWidth(text);
  const id = "status:message";
  const st = app.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, role, bg), bg };
  drawText(c, x1 - w, y, text, st);
  geo.hot.push({ id, x: x1 - w, y, w, h: 1 });
  return x1 - w;
}

/**
 * The which-key popup, framed like the other popups: a bordered box on the overlay background
 * with the pending keys as its title, the hint in the bottom border, and the same margin. Inside,
 * `key → name` entries in up to three columns (each sized to its own entries), explanations
 * underneath. It sits centred just above the bottom of the content area.
 */
function drawWhichKey(app: App, c: Canvas, top: number, bottom: number, geo: Geometry): void {
  const theme = app.theme;
  const entries = app.whichKeyEntries();
  if (!entries.length) return;
  const shownKey = (key: string) => key.split(" ").map((k) => prettyKey(k, app.leader)).join(" ");
  const GAP = 4;
  const maxW = Math.min(c.width - 8, 140);
  const layoutFor = (n: number) => {
    const perCol = Math.ceil(entries.length / n);
    const widths: { key: number; text: number }[] = [];
    for (let k = 0; k < n; k++) {
      const col = entries.slice(k * perCol, (k + 1) * perCol);
      if (!col.length) break;
      widths.push({
        key: Math.min(16, Math.max(...col.map((e) => stringWidth(shownKey(e.key))))) + 2, // " → "
        text: Math.min(44, Math.max(...col.map((e) => Math.max(stringWidth(e.label), stringWidth(e.desc))))),
      });
    }
    // Inside the borders: a column of padding each side, the columns, gaps between them.
    const total = widths.reduce((a, w) => a + w.key + 1 + w.text, 0) + (widths.length - 1) * GAP + 4;
    return { perCol, widths, total };
  };
  let plan = layoutFor(1);
  for (const n of [3, 2]) {
    const p = layoutFor(n);
    if (p.total <= maxW) {
      plan = p;
      break;
    }
  }
  const rows = plan.perCol;
  const room = bottom - top - 2; // the margin above and below
  if (room < 3) return; // no room for even a box with one row
  // Inside the borders, a blank row above and below the entries.
  const withDesc = entries.some((e) => e.desc) && rows * 2 + 2 <= room;
  const entryH = withDesc ? 2 : 1;
  // The blank rows only with the explanations: shrinking drops them first, and they don't come
  // back once the explanations are gone.
  const pad = withDesc && rows * 2 + 4 <= room ? 1 : 0;
  const h = Math.max(3, Math.min(room, rows * entryH + 2 + 2 * pad));
  const w = Math.min(maxW, Math.max(plan.total, 40));
  const x0 = Math.floor((c.width - w) / 2);
  const y0 = bottom - 1 - h;
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const desc = { ...dim, bg: bg.bg };
  c.fill(x0 - 2, y0 - 1, w + 4, h + 2, bg.bg);
  geo.popup = { x: x0 - 2, y: y0 - 1, w: w + 4, h: h + 2 };
  coverHot(geo, geo.popup);
  const b = app.glyphs.box;
  const name = app.groupName(app.pending);
  const title = app.pending.length ? ` ${shownKey(app.pending.join(" "))} ›${name ? ` ${name}` : ""} ` : ` ${name} `;
  drawText(c, x0, y0, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x0 + 2, y0, truncate(title, w - 6), { ...border, bold: true });
  drawText(c, x0 + 2 + tw, y0, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x0, y0 + k, b.v, border, 1);
    drawText(c, x0 + w - 1, y0 + k, b.v, border, 1);
  }
  // Entries that don't fit (a short screen) are counted in the bottom border; the hint is left
  // out when the box is too narrow for it.
  const visibleRows = Math.floor((h - 2 - 2 * pad) / entryH);
  const hiddenCount = entries.filter((_, i) => i % rows >= visibleRows).length;
  const hintText = `${hiddenCount ? `+${hiddenCount} more · ` : ""}${app.pending.length ? "backspace up · esc cancel" : "keys repeat · any other key leaves"}`;
  // Too narrow for the hint: the count alone, which must not be lost with it.
  const countOnly = hiddenCount ? `+${hiddenCount} more` : "";
  const hint = stringWidth(hintText) + 2 <= w - 4 ? ` ${hintText} ` : countOnly && stringWidth(countOnly) + 2 <= w - 4 ? ` ${countOnly} ` : "";
  const bottomRule = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(hint)))}`;
  drawText(c, x0, y0 + h - 1, bottomRule, border);
  drawText(c, x0 + stringWidth(bottomRule), y0 + h - 1, hint, dim);
  drawText(c, x0 + w - 1, y0 + h - 1, b.br, border);
  const keySt = { ...roleStyle(theme, "which_key_key", bg.bg), bg: bg.bg };
  const grpSt = { ...roleStyle(theme, "which_key_group", bg.bg), bg: bg.bg, bold: true };
  const colX: number[] = [];
  plan.widths.reduce((x, cw) => (colX.push(x), x + cw.key + 1 + cw.text + GAP), x0 + 2);
  entries.forEach((e, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const y = y0 + 1 + pad + row * entryH;
    const cw = plan.widths[col];
    if (y >= y0 + h - 1 - pad || !cw) return;
    const x = colX[col]!;
    const textX = x + cw.key + 1;
    const textW = Math.min(cw.text, x0 + w - 2 - textX);
    if (textW <= 0) return; // no room for the name inside the box
    const id = `wk:${e.key.split(" ")[0]}`;
    // As wide as it's drawn: a column cut by the box's edge never spills past its border.
    geo.hot.push({ id, x, y, w: cw.key + 1 + textW, h: entryH });
    const hover = app.hover === id;
    if (hover) c.fill(x, y, cw.key + 1 + textW, entryH, theme.roles.hover.bg ?? null);
    const rowBg = hover ? (theme.roles.hover.bg ?? bg.bg) : bg.bg;
    drawText(c, x, y, truncate(shownKey(e.key), cw.key - 2), { ...keySt, bg: rowBg });
    drawText(c, x + cw.key - 1, y, "→", { ...bg, bg: rowBg });
    drawText(c, textX, y, truncate(e.label, textW), e.group ? { ...grpSt, bg: rowBg } : { ...bg, bg: rowBg, bold: true });
    if (withDesc && e.desc && y + 1 < y0 + h - 1 - pad) drawText(c, textX, y + 1, truncate(e.desc, textW), { ...desc, bg: rowBg });
  });
}

function drawList(app: App, c: Canvas, o: ListOverlay, mainY: number, mainH: number): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const w = Math.min(100, W - (W > 60 ? 8 : 0));
  // Rows besides the list: the borders, the input, and the footer (a rule, the entry's name, two
  // rows of explanation, its other keys).
  // The footer only when the list keeps at least four rows beside it.
  const footer = !!o.footer && Math.min(mainH - 2, 30) - ((o.filterable ? 3 : 2) + FOOTER_ROWS + 2) >= 4;
  const inner = (o.filterable ? 3 : 2) + (footer ? FOOTER_ROWS + 1 : 0);
  // Never taller than the content area: on a short screen the status line and the rule stay.
  const h = Math.min(mainH, Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30)));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  // A margin in the window's own colour sets it apart from the content behind it: one row above
  // and below, two columns at the sides (a cell is about twice as tall as it is wide).
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const selectableCount = o.filtered.filter((e) => !e.item.header).length;
  const position = o.filtered.slice(0, o.selected + 1).filter((e) => !e.item.header).length;
  const count = ` ${selectableCount ? position : 0}/${selectableCount} `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(count)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, count + b.br, dim);

  let listY = y + 1;
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 8), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
    listY = y + 2;
  }
  if (footer) drawFooter(app, c, o, x, y + h - 2 - FOOTER_ROWS, w);
  const rows = h - (listY - y) - 1 - (footer ? FOOTER_ROWS + 1 : 0);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  // When the selected entry is the top row, bring its heading (title and rule, not the blank
  // row before them) into view above it; not while the wheel is scrolling the view.
  if (o.scroll === o.selected && !o.wheeled) {
    // …as long as the selected entry stays in view.
    while (o.scroll > 0 && o.selected - (o.scroll - 1) < rows && o.filtered[o.scroll - 1]!.item.header && (o.filtered[o.scroll - 1]!.item.label || o.filtered[o.scroll - 1]!.item.rule)) o.scroll--;
  }
  // Key columns: each as wide as its widest binding in the section, so keys line up down it.
  const colWAt: number[][] = new Array(o.filtered.length);
  if (o.alignKeysAcrossList) {
    const colW = [0, 0, 0];
    for (const e of o.filtered) (e.item.keys ?? []).slice(0, 3).forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
    colWAt.fill(colW);
  } else for (let i = 0; i < o.filtered.length; ) {
    let j = i;
    while (j < o.filtered.length && o.filtered[j]!.item.header) colWAt[j++] = [0, 0, 0];
    const colW = [0, 0, 0];
    let k = j;
    for (; k < o.filtered.length && !o.filtered[k]!.item.header; k++) (o.filtered[k]!.item.keys ?? []).slice(0, 3).forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
    for (let m = j; m < k; m++) colWAt[m] = colW;
    i = k;
  }
  const lastEntry = (() => {
    let last = -1;
    for (let i = 0; i < rows; i++) if (o.filtered[o.scroll + i] && !o.filtered[o.scroll + i]!.item.header) last = i;
    return last;
  })();
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const ry = listY + i;
    const { item, positions } = entry;
    if (item.header) {
      // Never a heading with nothing under it on screen.
      if (i > lastEntry) continue;
      if (item.rule) drawText(c, x + 2, ry, b.h.repeat(w - 4), roleStyle(theme, "overlay_dim", null), w - 4);
      else if (item.label) drawText(c, x + 2, ry, truncate(item.label.toUpperCase(), w - 4), roleStyle(theme, "overlay_group", null));
      continue;
    }
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const indent = (item.indent ?? 0) * 2;
    // Keys at the right: as many as fit beside the label, then an ellipsis.
    const labelW = Math.min(stringWidth(item.label), Math.max(8, Math.floor((w - 6) / 2)));
    const keysRoom = w - 4 - indent - labelW - 2;
    const keysW = item.keys?.length ? drawKeys(app, c, x + w - 2, ry, item.keys, keysRoom, selected, st.bg, colWAt[idx]!) : 0;
    const hint = item.keys ? "" : (item.hint ?? "");
    const hintW = hint ? stringWidth(hint) + 2 : 0;
    const avail = w - 4 - hintW - (keysW ? keysW + 2 : 0);
    let cx = x + 2 + indent;
    const label = truncate(sanitize(item.label), Math.max(4, avail - indent));
    const pos = new Set(positions);
    let ci = 0;
    for (const g of graphemes(label)) {
      const gw = graphemeWidth(g);
      if (gw > 0) c.cell(cx, ry, g, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : st);
      cx += gw;
      ci += g.length;
    }
    if (item.detail && !footer) {
      const room = x + 2 + avail - cx - 2;
      if (room > 4) cx += drawText(c, cx + 2, ry, truncate(item.detail, room), { ...dim, bg: st.bg }) + 2;
    }
    if (hint) drawText(c, x + w - 2 - stringWidth(hint), ry, hint, { ...dim, bg: st.bg });
  }
  if (!selectableCount) drawText(c, x + 2, listY, o.input ? "no matches" : "nothing here", dim);
  return { x, y, w, h, listY, rows };
}

const FOOTER_ROWS = 4;

/**
 * A list as a dropdown hanging under `anchor` (the breadcrumb's `…`): framed like the other
 * popups, as wide as its rows, entries indented as a tree. Keys, clicks and the wheel are the
 * list's. The margin row above it lies on the rule under the breadcrumb, which stays visible.
 */
function drawDropdown(app: App, c: Canvas, o: ListOverlay, anchor: { x: number; y: number }, maxY: number): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const g = app.glyphs;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  // Three columns a level: `└─` and a space.
  // Sized over every entry, not the matches, so it keeps its width while you type.
  const content = Math.max(20, ...o.items.map((item) => (item.indent ?? 0) * 3 + stringWidth(item.label) + hintW(item)));
  // At least half the screen (60 to 100 columns), centred; it hangs under the anchor's row.
  const w = Math.max(10, Math.min(Math.max(content + 4, 60, Math.floor(W / 2)), 100, W - 8));
  const x = Math.max(2, Math.floor((W - w) / 2));
  const y = anchor.y + 2;
  // The filter's row, a blank row, room for at least 8 entries, a blank row.
  const inputRows = o.filterable ? 1 : 0;
  const pad = 1;
  const h = Math.max(3 + inputRows, Math.min(Math.max(8, o.filtered.length) + 2 + inputRows + 2 * pad, maxY - y));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = g.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const tight = h < Math.max(1, o.filtered.length) + 2 + inputRows + 2 * pad; // no room for the blank rows
  const listY = y + 1 + inputRows + (tight ? 0 : pad);
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 6 - px), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
  }
  const rows = h - 2 - inputRows - (tight ? 0 : 2 * pad);
  const matchSt = roleStyle(theme, "overlay_match", null);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const { item, positions } = entry;
    const ry = listY + i;
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const depth = item.indent ?? 0;
    let cx = x + 2 + depth * 3;
    // One heading under the next: each row hangs off the one above with └─.
    if (depth) drawText(c, cx - 3, ry, `${g.guideLast}${g.guideDash}`, { ...roleStyle(theme, "tree_guide", st.bg), bg: st.bg }, 2);
    const hw = hintW(item);
    const label = truncate(sanitize(item.label), Math.max(1, x + w - 2 - hw - cx));
    const pos = new Set(positions);
    let ci = 0;
    for (const gr of graphemes(label)) {
      const gw = graphemeWidth(gr);
      if (gw > 0) c.cell(cx, ry, gr, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : st);
      cx += gw;
      ci += gr.length;
    }
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), ry, item.hint, { ...dim, bg: st.bg });
  }
  if (!o.filtered.length) drawText(c, x + 2, listY, "no matches", dim);
  return { x, y, w, h, listY, rows };
}

/**
 * A list's footer, under a rule: the selected entry's name, its explanation (wrapping to a second
 * row), and its other bindings as keycaps. Always the same height, so the list doesn't jump.
 */
function drawFooter(app: App, c: Canvas, o: ListOverlay, x: number, y: number, w: number): void {
  const theme = app.theme;
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, roleStyle(theme, "overlay_border", null));
  const item = o.filtered[o.selected]?.item;
  if (!item || item.header) return;
  const text = roleStyle(theme, "overlay", null);
  const room = w - 4;
  drawText(c, x + 2, y + 1, truncate(item.label, room), { ...text, bold: true });
  const lines = wrapWords(item.detail ?? "", room);
  lines.slice(0, 2).forEach((l, i) => drawText(c, x + 2, y + 2 + i, i === 1 && lines.length > 2 ? truncate(`${l} ${lines.slice(2).join(" ")}`, room) : l, text));
  if (item.more?.length) {
    const cap = roleStyle(theme, "keycap", text.bg);
    const plain = cap.bg === text.bg;
    let cx = x + 2 + drawText(c, x + 2, y + 4, "also ", roleStyle(theme, "overlay_dim", null));
    for (const [i, k] of item.more.entries()) {
      const label = plain ? (i ? ` · ${k}` : k) : ` ${k} `;
      if (cx + stringWidth(label) > x + w - 2) break;
      cx += drawText(c, cx, y + 4, label, plain ? text : cap) + (plain ? 0 : 1);
    }
  }
}

/** Words into lines of at most `width` columns. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && stringWidth(`${line} ${word}`) > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => truncate(l, width));
}

/**
 * Key bindings as keycaps ending at `right`, each binding one cap (a sequence stays inside it),
 * in columns `colW` wide so they line up from row to row. Without a keycap background (NO_COLOR)
 * the columns are separated by " · ". Returns the width used; keys that don't fit are dropped.
 */
function drawKeys(app: App, c: Canvas, right: number, y: number, keys: string[], room: number, selected: boolean, rowBg: Color | null, colW: number[]): number {
  const theme = app.theme;
  const cap = roleStyle(theme, selected ? "keycap_selected" : "keycap", rowBg);
  const plain = cap.bg === rowBg;
  const pad = plain ? 0 : 2; // the cap's own spaces
  const gap = plain ? 3 : 1;
  const cols = colW.filter((wd) => wd > 0).length;
  const widthOf = (n: number) => colW.slice(0, n).reduce((a, wd) => a + wd + pad, 0) + (n - 1) * gap;
  let n = cols;
  while (n > 0 && widthOf(n) > room) n--;
  if (!n) return 0;
  let x = right - widthOf(n);
  const sepSt = { ...roleStyle(theme, "overlay_dim", rowBg), bg: rowBg };
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    if (k) {
      if (plain && i > 0) drawText(c, x - 2, y, "·", sepSt);
      drawText(c, x, y, plain ? k : ` ${k} `, cap);
    }
    x += colW[i]! + pad + gap;
  }
  return widthOf(n);
}
