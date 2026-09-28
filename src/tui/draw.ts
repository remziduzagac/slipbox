// Painting the app (3.1, 3.2): tab bar, explorer | content (one split) | outline, status line,
// the which-key popup and overlays. Viewport-only: only the rows on screen are drawn.
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import type { Glyphs } from "../core/glyphs.ts";
import type { Line } from "../core/layout/ir.ts";
import { type CellStyle, spanStyle } from "../core/layout/style.ts";
import type { Color, Role, Theme } from "../core/theme/theme.ts";
import { graphemes, graphemeWidth, splitAtWidth, stringWidth, truncate } from "../core/width.ts";
import { type App, type HistoryRow, LEFT_VIEWS, type ListItem, type ListOverlay, RIGHT_VIEWS, type SidePaneState, type Tab, type TreeRow, type View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { cells, ordered } from "./cursor.ts";
import { fuzzy } from "./fuzzy.ts";
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
  /** The row under the rightmost top window's header, which spans the outline's column too. */
  headerEnd: number | null;
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
  const geo: Geometry = { panes: [], sidebar: null, outline: null, sidebarPane: null, outlinePane: null, tabs: [], overlay: null, hot: [], separators: [], scrollbars: [], tabStrip: null, popup: null, rules: [], verticals: [], headerEnd: null };
  c.fill(0, 0, W, H, page);
  if (W < 10 || H < 4) {
    drawText(c, 0, 0, "slipbox: too small", roleStyle(theme, "warn", page), W);
    return geo;
  }
  const zen = app.ui.zen;
  const topBar = app.config.ui.top_bar && !zen ? 1 : 0;
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
    // A tinted right rail starts right under the strip: the strip's rule stops at it.
    rule(head + 2, x0, theme.roles.rail.bg && RW < W ? RW : W);
  }
  // The rightmost top window's header runs over the outline's column, which starts under it.
  const overOutline = app.outlineShown && app.outlineBeside ? right : 0;
  drawContent(app, c, { x: left, y: mainY, w: Math.max(0, RW - left - right), h: mainH }, frame, overOutline, geo);
  if (LW) drawRail(app, c, "left", LW - 1, frame ? head : 0, frame ? head + 1 : 0, frame ? head + 1 : 0, bottom, borderEnd, geo);
  // The right rail's buttons start level with the breadcrumb; tinted, the rail itself starts right
  // under the tab strip (on its rule's row).
  const railTop = theme.roles.rail.bg && frame && tabBar ? head + 2 : mainY;
  if (RW < W) drawRail(app, c, "right", RW, frame ? head + (tabBar ? 2 : 0) : mainY, railTop, mainY, bottom, borderEnd, geo);

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
    // Beside the content, the outline starts under the header that spans its column.
    const top = app.outlineBeside && geo.headerEnd !== null ? geo.headerEnd : mainY;
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

  // Messages and prompts never take a row of their own, so the note never changes height for
  // them. A prompt takes over the status line while it's open (in zen, the screen's last row);
  // a message sits in the top bar, or without one takes over the status line the same way.
  const prompt = app.overlay?.kind === "prompt";
  const messageInBar = topBar && app.transient && !prompt;
  if (prompt || (app.transient && !messageInBar)) drawBottomLine(app, c, H - 1, geo);
  else if (status) drawStatus(app, c, { y: H - status, h: 1 }, geo);
  if (((app.whichKey && app.pending.length) || (app.resizeMode && !app.pending.length)) && !app.overlay) drawWhichKey(app, c, mainY, mainY + mainH, geo);
  if (app.overlay?.kind === "list") geo.overlay = app.overlay.anchor ? drawDropdown(app, c, app.overlay, app.overlay.anchor, H - 1) : drawList(app, c, app.overlay, mainY, mainH);
  return geo;
}

/**
 * A rail: a column of buttons at one edge, one per row from the top. Tinted (the `rail` role), it
 * needs no border; without colour to tint it (NO_COLOR) a border on its inner side, at `bx`,
 * sets it apart, joined to the rules it meets. The left rail runs from under the top bar and
 * holds the left panel's views; the right one from under the tab strip, with the right panel's.
 */
function drawRail(app: App, c: Canvas, side: "left" | "right", bx: number, y0: number, top: number, buttonsTop: number, bottom: number, borderEnd: number, geo: Geometry): void {
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
    const y = buttonsTop + k;
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
  // The latest message, at the right end: it never moves the note, as a row of its own would.
  if (app.transient && app.overlay?.kind !== "prompt") rx = drawMessage(app, c, x + 2, rx, y, bar.bg, geo) - 1;
  // Vault-wide state; the watcher and reload markers are about the file, so they sit by its path.
  const items: { text: string; role: Role }[] = [];
  if (app.indexing > 0) items.push({ text: `indexing ${app.indexing}…`, role: "status_dim" });
  if (app.loc.mode === "single") items.push({ text: "single-file", role: "status_dim" });
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
    const changed = v.buf.changedAt && app.now() - v.buf.changedAt < CHANGE_MARKER_MS ? " ↻" : "";
    return ` ${i + 1} ${truncate(app.displayName(v.buf).split("/").pop()!.replace(/\.(md|markdown)$/i, ""), 24)}${changed} `;
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
  for (let i = from; i <= to && x < limit; i++) {
    const role: Role = i !== app.activeTab ? "tab" : app.region === "content" ? "tab_active" : "tab_active_idle";
    const w = button(app, c, x, band, labels[i]!, role, `tab:${i}`, geo, stripBg, limit - x);
    geo.tabs.push({ x, y: band.y, w, h: band.h, index: i });
    x += w;
    const tabBg = roleStyle(theme, role, stripBg).bg ?? stripBg;
    x += button(app, c, x, band, close, role, `tabclose:${i}`, geo, tabBg, limit - x);
    if (x < limit) separator(x);
    x += 1;
  }
  if (hidden > 0) {
    const label = moreLabel;
    const bx = c.width - stringWidth(label);
    // Its own border, unless the last tab's is (nearly) next to it already.
    if (bx - 1 - x >= 2) separator(bx - 1);
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
  for (const v of geo.verticals) {
    for (const r of geo.rules) {
      if (r.y < v.y0 || r.y > v.y1) continue;
      const l = covers(r.y, v.x - 1);
      const rt = covers(r.y, v.x + 1);
      if (!l && !rt) continue;
      const key = `${r.y > v.y0 ? "u" : ""}${r.y < v.y1 ? "d" : ""}${l ? "l" : ""}${rt ? "r" : ""}`;
      const g = app.glyphs.joints[key];
      if (g) drawText(c, v.x, r.y, g, v.style, 1);
    }
  }
}

/** `ruleAbove`: the row above `area` is a rule already, so the top windows don't draw their own. */
function drawContent(app: App, c: Canvas, area: Rect, ruleAbove: boolean, overOutline: number, geo: Geometry): void {
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
    drawPane(app, c, tab.views[tab.active]!, area, focusContent, false, ruleAbove, overOutline, geo);
    return;
  }
  if (tab.views.length === 1) {
    drawPane(app, c, tab.views[0]!, area, focusContent, false, ruleAbove, overOutline, geo);
    return;
  }
  const [a, b] = tab.views as [View, View];
  const border = roleStyle(theme, "border", page);
  if (app.effectiveOrientation(tab) === "side") {
    const w1 = Math.max(12, Math.min(area.w - 13, Math.round((area.w - 1) * tab.ratio)));
    drawPane(app, c, a, { ...area, w: w1 }, focusContent, true, ruleAbove, -1, geo);
    for (let y = area.y; y < area.y + area.h; y++) drawText(c, area.x + w1, y, app.glyphs.vbar, border, 1);
    // With a frame, rules sit right above and below the content area.
    geo.verticals.push({ x: area.x + w1, y0: area.y - (ruleAbove ? 1 : 0), y1: area.y + area.h - (ruleAbove ? 0 : 1), style: border });
    geo.separators.push({ kind: "split-side", x: area.x + w1, y: area.y, w: 1, h: area.h, area });
    drawPane(app, c, b, { x: area.x + w1 + 1, y: area.y, w: area.w - w1 - 1, h: area.h }, focusContent, true, ruleAbove, overOutline, geo);
  } else {
    const h1 = Math.max(3, Math.min(area.h - 3, Math.round(area.h * tab.ratio)));
    drawPane(app, c, a, { ...area, h: h1 }, focusContent, true, ruleAbove, overOutline, geo);
    // The lower window's title row is the stacked split's handle.
    geo.separators.push({ kind: "split-stacked", x: area.x, y: area.y + h1, w: area.w, h: 1, area });
    drawPane(app, c, b, { x: area.x, y: area.y + h1, w: area.w, h: area.h - h1 }, focusContent, true, false, -1, geo);
  }
}

function paneIsActive(app: App, view: View): boolean {
  const t: Tab | null = app.tab;
  return !!t && t.views[t.active] === view;
}

/**
 * `overOutline`: -1 for a window not at the top right; otherwise it is, and its header also spans
 * that many columns to its right (the outline and its border), carrying the outline's button.
 */
function drawPane(app: App, c: Canvas, view: View, rect: Rect, contentFocused: boolean, titled: boolean, ruleAbove: boolean, overOutline: number, geo: Geometry): void {
  if (rect.w < 8 || rect.h < 1) return; // too small to draw a window (a tiny terminal)
  const theme = app.theme;
  const page = pageBg(theme);
  const active = paneIsActive(app, view);
  let body = rect;
  // The header: a split window's title, then the breadcrumb, then a blank row before the text.
  const crumbs = app.config.ui.breadcrumb && !app.ui.zen && rect.h >= 8;
  if (crumbs) {
    // A rule, the title (in a split) and breadcrumb row on its own background, a rule. The top
    // rule is the frame's when the window is at the top.
    const hw = rect.w + Math.max(0, overOutline);
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
    if (overOutline >= 0) {
      // The outline's button, at the far right (on the rail instead, when it shows).
      if (!app.rightRailWidth) {
        const label = ` ${app.glyphs.outlineButton} `;
        end -= stringWidth(label);
        button(app, c, end, { y, h: 1 }, label, app.outlineShown ? "topbar_button_on" : "topbar_button", "btn:outline", geo, bg);
      }
      geo.headerEnd = y + 2;
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

  let prevSrc = view.top > 0 ? (layout.lines[view.top - 1]?.src ?? -1) : -1;
  for (let i = 0; i < body.h; i++) {
    const row = view.top + i;
    const line = layout.lines[row];
    if (!line) break;
    const y = body.y + i;
    const isCursorRow = showCursor && row === view.cur.row;
    const band = isCursorRow ? cursorBg : null;
    if (band) c.fill(body.x, y, body.w - 1, 1, band);
    if (gutter) {
      const num = line.src !== prevSrc ? String(line.src).padStart(gutter - 1) : "";
      const role: Role = line.src === cursorSrc && showCursor ? "line_number_current" : "line_number";
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
    drawLine(c, textX, y, line, textW, theme, band ?? page, underCursor, marks, view.left);
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
  if (cell && cell.x + cell.w <= end) c.cell(x + cell.x, y, cell.g, cell.w, st);
  else c.cell(x + col, y, " ", 1, st);
}

/**
 * Draw one layout row from column `left` (wrapping off, scrolled sideways), `maxW` columns of it.
 * `marks` override styles by column range; the link under the cursor too.
 */
function drawLine(c: Canvas, x: number, y: number, line: Line, maxW: number, theme: Theme, rowBg: Color | null, focusLink: number, marks: { from: number; to: number; role: Role }[], left = 0): void {
  let col = 0;
  const end = left + maxW;
  const fillBg = line.fill ? theme.roles[line.fill].bg : undefined;
  for (const span of line.spans) {
    if (col >= end) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    // The cursor-row band replaces the page and block fill, never a span's own background.
    if (!st.bg || (rowBg && st.bg === fillBg)) st.bg = rowBg;
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

function sideView<T extends object>(rect: Rect, rows: T[], text: (row: T) => string, state: SidePaneState): SideView {
  const cols = Math.max(1, rect.w - 1);
  let natural = naturalWidths.get(rows);
  if (natural === undefined) {
    natural = 0;
    for (const row of rows) natural = Math.max(natural, stringWidth(text(row)) + 1);
    naturalWidths.set(rows, natural);
  }
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
  const s = app.sidebar;
  // The filter (`/`): a row at the top of the list while it's open or holds text.
  if ((s.filtering || s.filter) && rect.h > 2) {
    const px = drawText(c, rect.x + 1, rect.y, "› ", { ...roleStyle(theme, "sidebar_dir", base.bg), bg: base.bg });
    const fw = drawText(c, rect.x + 1 + px, rect.y, truncate(s.filter ?? "", rect.w - 4 - px), { ...roleStyle(theme, "text", base.bg), bg: base.bg });
    if (s.filtering && app.region === "sidebar") drawText(c, rect.x + 1 + px + fw, rect.y, " ", roleStyle(theme, "cursor", base.bg));
    rect = { ...rect, y: rect.y + 1, h: rect.h - 1 };
  }
  return history ? drawHistoryList(app, c, rect, base.bg, geo) : drawTree(app, c, rect, base.bg, geo);
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
  const nameOf = (row: TreeRow) => (row.kind === "note" ? row.name.replace(/\.(md|markdown)$/i, "") : row.name);
  const prefix = (row: TreeRow) => `${" ".repeat(1 + row.depth * 2)}${row.kind === "dir" ? (q || app.expanded.has(row.path) ? g.dirOpen : g.dirClosed) : g.file} `;
  const text = (row: TreeRow) => prefix(row) + nameOf(row);
  const sv = sideView(list, rows, text, s);
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
    let role: Role = row.kind === "dir" ? "sidebar_dir" : row.path === current ? "sidebar_active" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    drawText(c, rect.x, y, sideRow(text(row), sv), st, rect.w);
    drawGuides(app, c, rect, y, row.depth, lines[s.scroll + i]!, st.bg, sv.left);
    // The letters the filter matched in a note's name.
    const m = q && row.kind === "note" ? fuzzy(q, nameOf(row)) : null;
    if (m) {
      const name = nameOf(row);
      const off = stringWidth(prefix(row));
      for (const p of m.positions) {
        const x = rect.x + off + stringWidth(name.slice(0, p)) - sv.left;
        if (x >= rect.x && x < rect.x + sv.cols) c.cell(x, y, name[p]!, 1, { ...st, fg: matchSt.fg, bold: true });
      }
    }
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  sideHScrollbar(app, c, sv, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}

/** The history: the window's timeline, newest first, the current place marked `here`. */
function drawHistoryList(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const rows = app.historyRows();
  const s = app.sidebar;
  const text = (row: HistoryRow) => ` ${row.label}`;
  const sv = sideView(list, rows, text, s);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length) drawText(c, rect.x + 1, rect.y, s.filter ? "no matches" : "no history yet", roleStyle(theme, "dim", bg), rect.w - 1);
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    const st = roleStyle(theme, selected ? "sidebar_selected" : row.here ? "sidebar_active" : "sidebar", bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const w = drawText(c, rect.x, y, sideRow(text(row), sv), st, rect.w);
    // Its line (or `here`) at the right, when the row has room for it.
    const hintW = stringWidth(row.hint);
    if (!sv.hbar && w + 2 + hintW <= sv.cols - 1) drawText(c, rect.x + sv.cols - 1 - hintW, y, row.hint, { ...roleStyle(theme, "dim", st.bg), bg: st.bg });
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
  const chip = app.pending.length
    ? ` ${app.pending.map((k) => prettyKey(k, app.leader)).join(" ")} `
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
            : " READ ";
  const chipSt = roleStyle(theme, "status_accent", page);
  c.fill(0, band.y, stringWidth(chip), band.h, chipSt.bg ?? null);
  let x = drawText(c, 0, y, chip, chipSt);
  if (!view) return;
  const buf = view.buf;
  const layout = app.currentLayout(view);
  const pct = layout.lines.length <= view.height ? "all" : `${Math.round((view.top / Math.max(1, layout.lines.length - view.height)) * 100)}%`;
  const src = layout.lines[view.cur.row]?.src ?? 1;
  let right = `L${src}:${view.cur.col + 1} ${pct}`;
  if (app.tabs.length > 1) right = `tab ${app.activeTab + 1}/${app.tabs.length}  ${right}`;
  const li = app.linkUnderCursor(view);
  const link = li >= 0 ? layout.links[li] : null;
  if (link) right = `→ ${link.kind === "wiki" || link.kind === "embed" ? `[[${link.target}${link.heading ? `#${link.heading}` : ""}]]` : link.target} (${link.status})  ${right}`;
  else if (view.find) right = `/${view.find.query} ${view.find.matches.length ? view.find.current + 1 : 0}/${view.find.matches.length}  ${right}`;
  const rightW = stringWidth(right) + 1;
  const changed = buf.changedAt && app.now() - buf.changedAt < CHANGE_MARKER_MS;
  x += drawText(c, x, y, " ", st);
  const pathId = "status:path";
  // The path shrinks to leave room for its marker (reloaded / deleted) and the right-hand side;
  // the watch marker after it is dropped when it doesn't fit.
  const full = app.displayName(buf);
  const marker = buf.deleted ? " ✖ deleted on disk" : changed ? " ↻ reloaded" : "";
  const pathW = Math.max(4, c.width - x - rightW - 2 - stringWidth(marker));
  const pw = drawText(c, x, y, truncate(full, pathW), app.hover === pathId ? roleStyle(theme, "hover", st.bg) : { ...st, bold: true });
  geo.hot.push({ id: pathId, x, y: band.y, w: pw, h: band.h });
  x += pw;
  if (buf.deleted) x += drawText(c, x, y, " ✖ deleted on disk", roleStyle(theme, "error", st.bg));
  else if (changed) x += drawText(c, x, y, " ↻ reloaded", roleStyle(theme, "info", st.bg));
  // Whether external changes to this file will show up.
  const w = app.watcher;
  const watch = w?.degraded
    ? { text: "⚠ not watching", role: "warn" as Role }
    : w
      ? { text: `● watching${w.polledDirs.length ? ` (${w.polledDirs.length} polled)` : ""}`, role: "check_done" as Role }
      : { text: "○ not watching", role: "status_dim" as Role };
  const rx = c.width - rightW;
  if (x + stringWidth(watch.text) + 3 < rx) x += drawText(c, x, y, `  ${watch.text}`, { ...roleStyle(theme, watch.role, st.bg), bg: st.bg });
  if (rx > x) drawText(c, rx, y, right, roleStyle(theme, "status_dim", page));
}

/** A prompt, or a message with no top bar to sit in, over the status line (zen: the last row). */
function drawBottomLine(app: App, c: Canvas, y: number, geo: Geometry): void {
  const theme = app.theme;
  const bg = app.ui.zen ? pageBg(theme) : roleStyle(theme, "status", pageBg(theme)).bg;
  c.fill(0, y, c.width, 1, bg);
  const o = app.overlay;
  if (o?.kind === "prompt") {
    const x = drawText(c, 1, y, o.label, { ...roleStyle(theme, "info", bg), bg }) + 1;
    const w = drawText(c, x, y, truncate(o.text, c.width - x - 2), { ...roleStyle(theme, "text", bg), bg });
    drawText(c, x + w, y, " ", roleStyle(theme, "cursor", bg));
    return;
  }
  if (!app.transient) return;
  drawMessage(app, c, 1, c.width - 1, y, bg, geo);
}

/** The latest message between `x0` and `x1`, right-aligned, its level as colour and a glyph;
 *  a click opens the messages. */
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
  const hint = stringWidth(hintText) + 2 <= w - 4 ? ` ${hintText} ` : "";
  const bottomRule = `${b.bl}${b.h.repeat(Math.max(0, w - 3 - stringWidth(hint)))}`;
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
    geo.hot.push({ id, x, y, w: cw.key + 1 + cw.text, h: entryH });
    const hover = app.hover === id;
    if (hover) c.fill(x, y, cw.key + 1 + cw.text, entryH, theme.roles.hover.bg ?? null);
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
  const h = Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30));
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
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 3 - stringWidth(count)))}`;
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
    const label = truncate(item.label, Math.max(4, avail - indent));
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
  const w = Math.max(10, Math.min(content + 4, 64, W - 4));
  const x = Math.max(2, Math.min(anchor.x - 2, W - w - 2));
  const y = anchor.y + 2;
  // The filter's row, then at least one row for the entries (or "no matches").
  const inputRows = o.filterable ? 1 : 0;
  const h = Math.max(3 + inputRows, Math.min(Math.max(1, o.filtered.length) + 2 + inputRows, maxY - y));
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
  const listY = y + 1 + inputRows;
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 6 - px), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
  }
  const rows = h - 2 - inputRows;
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
    const label = truncate(item.label, Math.max(1, x + w - 2 - hw - cx));
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
