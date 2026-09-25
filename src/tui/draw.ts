// Painting the app (3.1, 3.2): tab bar, explorer | content (one split) | outline, status line,
// the which-key popup and overlays. Viewport-only: only the rows on screen are drawn.
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import type { Glyphs } from "../core/glyphs.ts";
import type { Line } from "../core/layout/ir.ts";
import { type CellStyle, spanStyle } from "../core/layout/style.ts";
import type { Color, Role, Theme } from "../core/theme/theme.ts";
import { graphemes, graphemeWidth, stringWidth, truncate } from "../core/width.ts";
import type { App, ListOverlay, Tab, View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { cells, ordered } from "./cursor.ts";
import { prettyKey } from "./keys.ts";

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
  view: View;
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
  overlay: (Rect & { listY: number }) | null;
  hot: Hot[];
  separators: Separator[];
  scrollbars: ScrollbarGeom[];
  tabStrip: Rect | null;
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
  const geo: Geometry = { panes: [], sidebar: null, outline: null, sidebarPane: null, outlinePane: null, tabs: [], overlay: null, hot: [], separators: [], scrollbars: [], tabStrip: null, rules: [], verticals: [], headerEnd: null };
  c.fill(0, 0, W, H, page);
  if (W < 10 || H < 4) {
    drawText(c, 0, 0, "slipbox: too small", roleStyle(theme, "warn", page), W);
    return geo;
  }
  const zen = app.ui.zen;
  const topBar = app.config.ui.top_bar && !zen ? 1 : 0;
  const tabBar = app.tabs.length > 0 && !zen ? 1 : 0;
  const status = zen ? 0 : 1;
  const bottomLine = app.overlay?.kind === "prompt" || app.transient ? 1 : 0;
  const head = topBar;
  // The frame: a rule across the top of the explorer, the tab strip (or the window) and the
  // outline, and one across their bottom; with tabs, another under the strip, over the note and
  // the outline. Zen has none.
  const frame = !zen;
  const mainY = frame ? head + 1 + (tabBar ? 2 : 0) : 0;
  const mainH = H - mainY - (frame ? 1 : 0) - status - bottomLine;
  const bottom = mainY + mainH - 1;
  // Borders run down to the bottom rule, where they join it.
  const borderEnd = frame ? bottom + 1 : bottom;

  const sideW = app.sidebarWidth();
  const outW = app.outlineWidth();
  const beside = app.sidebarShown && app.sidebarBeside;
  const left = app.sidebarBeside ? sideW + 1 : 0;
  const right = app.outlineBeside ? outW + 1 : 0;
  const rule = (y: number, x0: number, x1: number) => {
    drawText(c, x0, y, app.glyphs.hbar.repeat(x1 - x0), roleStyle(theme, "border", page), x1 - x0);
    geo.rules.push({ y, x0, x1 });
  };

  if (topBar) drawTopBar(app, c, { y: 0, h: 1 }, geo);
  if (frame) {
    rule(head, 0, W);
    rule(bottom + 1, 0, W);
  }
  if (tabBar) {
    // Tabs hold the note and its outline, not the explorer: the strip starts after the explorer.
    const x0 = beside ? left : 0;
    drawTabs(app, c, x0, { y: head + 1, h: 1 }, geo);
    rule(head + 2, x0, W);
  }
  // The rightmost top window's header runs over the outline's column, which starts under it.
  const overOutline = app.outlineShown && app.outlineBeside ? right : 0;
  drawContent(app, c, { x: left, y: mainY, w: W - left - right, h: mainH }, frame, overOutline, geo);

  if (app.sidebarShown) {
    const w = app.sidebarBeside ? sideW : Math.min(sideW + 6, W - 6);
    // Beside the content, the explorer runs from under the frame's top rule to the status line,
    // whether or not the tab strip shows; its border runs up beside the strip.
    const sideY = beside && frame ? head + 1 : mainY;
    const rect = { x: 0, y: sideY, w, h: bottom + 1 - sideY };
    const list = drawSidebar(app, c, rect, geo);
    const border = roleStyle(theme, "border", page);
    for (let y = sideY; y <= bottom; y++) drawText(c, w, y, app.glyphs.vbar, border, 1);
    geo.sidebar = list;
    geo.sidebarPane = rect;
    if (beside) {
      geo.separators.push({ kind: "sidebar", x: w, y: sideY, w: 1, h: bottom + 1 - sideY });
      geo.verticals.push({ x: w, y0: frame ? head : sideY, y1: borderEnd, style: border });
    }
  }
  if (app.outlineShown) {
    const w = app.outlineBeside ? outW : Math.min(outW + 6, W - 6);
    // Beside the content, the outline starts under the header that spans its column.
    const top = app.outlineBeside && geo.headerEnd !== null ? geo.headerEnd : mainY;
    const rect = { x: W - w, y: top, w, h: bottom + 1 - top };
    geo.outline = drawOutline(app, c, rect);
    geo.outlinePane = rect;
    const border = roleStyle(theme, "border", page);
    for (let y = top; y <= bottom; y++) drawText(c, W - w - 1, y, app.glyphs.vbar, border, 1);
    if (app.outlineBeside) {
      geo.separators.push({ kind: "outline", x: W - w - 1, y: top, w: 1, h: bottom + 1 - top });
      geo.verticals.push({ x: W - w - 1, y0: frame ? top - 1 : top, y1: borderEnd, style: border });
    }
  }
  drawJoints(app, c, geo);

  if (status) drawStatus(app, c, { y: H - status - bottomLine, h: 1 }, geo);
  if (bottomLine) {
    drawBottomLine(app, c, H - 1);
    if (app.transient && app.overlay?.kind !== "prompt") geo.hot.push({ id: "status:message", x: 0, y: H - 1, w: W, h: 1 });
  }
  if (((app.whichKey && app.pending.length) || (app.resizeMode && !app.pending.length)) && !app.overlay) drawWhichKey(app, c, mainY, mainY + mainH, geo);
  if (app.overlay?.kind === "list") geo.overlay = drawList(app, c, app.overlay, mainY, mainH);
  return geo;
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
  let x = button(app, c, 0, band, icon(g.explorerButton), app.sidebarShown ? "topbar_button_on" : "topbar_button", "btn:explorer", geo, bar.bg);
  x += 1;
  x += button(app, c, x, band, " slipbox ", "topbar_chip", "btn:palette", geo, bar.bg);

  // Right side, laid out from the far right inwards. (The outline's button is on the breadcrumb.)
  let rx = c.width - 1;
  // Vault-wide state; the watcher and reload markers are about the file, so they sit by its path.
  // The middle is left empty.
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
 * A window's outline breadcrumb: the headings its cursor is under, each clickable. When there is
 * not enough room, the outermost headings go first.
 */
function drawBreadcrumb(app: App, c: Canvas, view: View, x0: number, x1: number, y: number, bg: Color | null, geo: Geometry): void {
  const theme = app.theme;
  const crumbs = app.breadcrumb(view);
  if (!crumbs.length || x1 - x0 < 10) return;
  const index = app.tab!.views.indexOf(view);
  const sep = ` ${app.glyphs.crumb} `;
  const widthOf = (ps: typeof crumbs) => ps.reduce((a, p) => a + Math.min(CRUMB_MAX, stringWidth(p.text)), 0) + (ps.length - 1) * stringWidth(sep);
  // The icon opens the heading finder.
  const iconId = `crumbicon:${index}`;
  const iconSt = app.hover === iconId ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "breadcrumb_icon", bg), bg };
  const iw = drawText(c, x0, y, app.glyphs.crumbIcon, iconSt);
  geo.hot.push({ id: iconId, x: x0, y, w: iw, h: 1 });
  x0 += iw + 1;
  let parts = crumbs;
  while (parts.length > 1 && widthOf(parts) > x1 - x0) parts = parts.slice(1);
  let cx = x0;
  parts.forEach((p, i) => {
    if (cx >= x1) return;
    if (i) cx += drawText(c, cx, y, sep, { ...roleStyle(theme, "breadcrumb_sep", bg), bg }, x1 - cx);
    const id = `crumb:${index}:${p.line}`;
    const role: Role = i === parts.length - 1 ? "breadcrumb_current" : "breadcrumb";
    const st = app.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, role, bg), bg };
    const w = drawText(c, cx, y, truncate(p.text, Math.min(CRUMB_MAX, x1 - cx)), st);
    geo.hot.push({ id, x: cx, y, w, h: 1 });
    cx += w;
  });
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
  let x = x0;
  for (let i = from; i <= to && x < c.width; i++) {
    const role: Role = i !== app.activeTab ? "tab" : app.region === "content" ? "tab_active" : "tab_active_idle";
    const w = button(app, c, x, band, labels[i]!, role, `tab:${i}`, geo, stripBg, c.width - x);
    geo.tabs.push({ x, y: band.y, w, h: band.h, index: i });
    x += w;
    const tabBg = roleStyle(theme, role, stripBg).bg ?? stripBg;
    x += button(app, c, x, band, close, role, `tabclose:${i}`, geo, tabBg, c.width - x);
    if (x < c.width) separator(x);
    x += 1;
  }
  const hidden = widths.length - (to - from + 1);
  if (hidden > 0) {
    const label = ` +${hidden} `;
    const bx = c.width - stringWidth(label);
    // Its own border, unless the last tab's is (nearly) next to it already.
    if (bx - 1 - x >= 2) separator(bx - 1);
    button(app, c, bx, band, label, "tab", "tabmore:", geo, stripBg);
  }
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
      // The outline's button, at the far right.
      const label = ` ${app.glyphs.outlineButton} `;
      end -= stringWidth(label);
      button(app, c, end, { y, h: 1 }, label, app.outlineShown ? "topbar_button_on" : "topbar_button", "btn:outline", geo, bg);
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
    drawLine(c, textX, y, line, textW, theme, band ?? page, underCursor, marks);
    if (isCursorRow) drawCursor(c, textX, y, line, view.cur.col, theme);
  }

  // Scrollbar in the last column.
  const total = layout.lines.length;
  if (total > body.h) {
    const thumb = Math.max(1, Math.round((body.h * body.h) / total));
    const pos = Math.round((view.top / Math.max(1, total - body.h)) * (body.h - thumb));
    const st = roleStyle(theme, active ? "scrollbar" : "border", page);
    const track = roleStyle(theme, "scrollbar_track", page);
    for (let k = 0; k < body.h; k++) drawText(c, body.x + body.w - 1, body.y + k, app.glyphs.scrollTrack, track, 1);
    for (let k = 0; k < thumb; k++) drawText(c, body.x + body.w - 1, body.y + pos + k, app.glyphs.scrollThumb, st, 1);
    geo.scrollbars.push({ view, total, x: body.x + body.w - 1, y: body.y, w: 1, h: body.h });
  }
}

/** The block cursor: the character under it drawn with the cursor role (inverse without colour). */
function drawCursor(c: Canvas, x: number, y: number, line: Line, col: number, theme: Theme): void {
  const st = roleStyle(theme, "cursor", null);
  const cell = cells(line).find((k) => k.x === col);
  if (cell) c.cell(x + cell.x, y, cell.g, cell.w, st);
  else c.cell(x + col, y, " ", 1, st);
}

/** Draw one layout row. `marks` override styles by column range; the link under the cursor too. */
function drawLine(c: Canvas, x: number, y: number, line: Line, maxW: number, theme: Theme, rowBg: Color | null, focusLink: number, marks: { from: number; to: number; role: Role }[]): void {
  let col = 0;
  const fillBg = line.fill ? theme.roles[line.fill].bg : undefined;
  for (const span of line.spans) {
    if (col >= maxW) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    // The cursor-row band replaces the page and block fill, never a span's own background.
    if (!st.bg || (rowBg && st.bg === fillBg)) st.bg = rowBg;
    if (!marks.length) {
      col += drawText(c, x + col, y, span.text, st, maxW - col);
      continue;
    }
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      if (col + w > maxW) return;
      const mark = marks.find((m) => col >= m.from && col < m.to);
      const cell = mark ? { ...st, ...markStyle(theme, mark.role) } : st;
      if (w > 0) c.cell(x + col, y, g, w, cell);
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

/**
 * A side pane's title and the blank row (or, given the geometry, a rule) under it; returns the
 * rect left for the pane's list. Short panes skip the title.
 */
function paneTitle(app: App, c: Canvas, rect: Rect, title: string, focused: boolean, bg: Color | null, rule?: Geometry): Rect {
  if (rect.h < 8) return rect;
  // Bright while the pane has focus, dimmer otherwise; bold either way.
  drawText(c, rect.x + 1, rect.y, title, { ...roleStyle(app.theme, focused ? "pane_title_active" : "pane_title", bg), bg }, rect.w - 1);
  if (rule) {
    // A rule instead of the blank row, joined to the pane's border like the others.
    drawText(c, rect.x, rect.y + 1, app.glyphs.hbar.repeat(rect.w), roleStyle(app.theme, "border", pageBg(app.theme)), rect.w);
    rule.rules.push({ y: rect.y + 1, x0: rect.x, x1: rect.x + rect.w });
  }
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
function drawGuides(app: App, c: Canvas, rect: Rect, y: number, depth: number, line: { last: boolean; more: boolean[] }, bg: Color | null): void {
  const g = app.glyphs;
  const st = { ...roleStyle(app.theme, "tree_guide", bg), bg };
  for (let k = 0; k < depth; k++) {
    const x = rect.x + 1 + k * 2;
    if (x + 1 >= rect.x + rect.w - 1) break;
    if (k === depth - 1) drawText(c, x, y, `${line.last ? g.guideLast : g.guideBranch}${g.guideDash}`, st, 2);
    else if (line.more[k]) drawText(c, x, y, g.guide, st, 1);
  }
}

/** The explorer; returns the rect its tree occupies (under the title). */
function drawSidebar(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const rect = paneTitle(app, c, pane, "Explorer", app.region === "sidebar", base.bg, geo);
  const rows = app.treeRows();
  const lines = treeLines(rows.map((r) => r.depth));
  const s = app.sidebar;
  s.selected = Math.max(0, Math.min(s.selected, rows.length - 1));
  if (s.selected < s.scroll) s.scroll = s.selected;
  if (s.selected >= s.scroll + rect.h) s.scroll = s.selected - rect.h + 1;
  s.scroll = Math.max(0, Math.min(s.scroll, Math.max(0, rows.length - rect.h)));
  const current = app.view?.buf.rel;
  const g = app.glyphs;
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    let role: Role = row.kind === "dir" ? "sidebar_dir" : row.path === current ? "sidebar_active" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, base.bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const icon = row.kind === "dir" ? (app.expanded.has(row.path) ? g.dirOpen : g.dirClosed) : g.file;
    const name = row.kind === "note" ? row.name.replace(/\.(md|markdown)$/i, "") : row.name;
    drawText(c, rect.x, y, truncate(`${" ".repeat(1 + row.depth * 2)}${icon} ${name}`, rect.w - 1), st, rect.w);
    drawGuides(app, c, rect, y, row.depth, lines[s.scroll + i]!, st.bg);
  }  return rect;
}

/** The outline; returns the rect its headings occupy (under the title). */
function drawOutline(app: App, c: Canvas, pane: Rect): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const rect = paneTitle(app, c, pane, "Outline", app.region === "outline", base.bg);
  const rows = app.outlineRows();
  const lines = treeLines(rows.map((r) => r.level - 1));
  const o = app.outline;
  const current = app.currentSection();
  // While the outline is not focused, it follows the cursor's section.
  if (app.region !== "outline" && current >= 0) o.selected = current;
  o.selected = Math.max(0, Math.min(o.selected, rows.length - 1));
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rect.h) o.scroll = o.selected - rect.h + 1;
  o.scroll = Math.max(0, Math.min(o.scroll, Math.max(0, rows.length - rect.h)));
  if (!rows.length) {
    drawText(c, rect.x + 1, rect.y, "no headings", roleStyle(theme, "dim", base.bg), rect.w - 1);
    return rect;
  }
  const g = app.glyphs;
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
    const marker = row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " ";
    drawText(c, rect.x, y, truncate(`${" ".repeat(1 + (row.level - 1) * 2)}${marker} ${row.text}`, rect.w - 1), st, rect.w);
    drawGuides(app, c, rect, y, row.level - 1, lines[idx]!, st.bg);
  }  return rect;
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
  const pw = drawText(c, x, y, truncate(app.displayName(buf), Math.max(4, c.width - x - rightW - 14)), app.hover === pathId ? roleStyle(theme, "hover", st.bg) : { ...st, bold: true });
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

function drawBottomLine(app: App, c: Canvas, y: number): void {
  const theme = app.theme;
  const page = pageBg(theme);
  c.fill(0, y, c.width, 1, page);
  const o = app.overlay;
  if (o?.kind === "prompt") {
    const x = drawText(c, 0, y, o.label, roleStyle(theme, "info", page));
    const w = drawText(c, x, y, truncate(o.text, c.width - x - 2), roleStyle(theme, "text", page));
    drawText(c, x + w, y, " ", roleStyle(theme, "cursor", page));
    return;
  }
  const m = app.transient;
  if (!m) return;
  const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
  drawText(c, 1, y, truncate(m.text, c.width - 2), roleStyle(theme, role, page));
}

/**
 * The which-key popup: a panel along the bottom listing the next keys of the pending sequence.
 * Header bar, a blank row, then entries in at most three columns — each "key → name" with a
 * short explanation dimmed underneath — and a blank row at the bottom. When the screen is too
 * short for two rows per entry, the explanations are dropped before anything else.
 */
function drawWhichKey(app: App, c: Canvas, top: number, bottom: number, geo: Geometry): void {
  const theme = app.theme;
  const entries = app.whichKeyEntries();
  if (!entries.length) return;
  // Each column is sized to its own entries plus a small gap, and columns pack from the left,
  // so a long explanation in one column never spreads out the others; at most three, as many
  // as fit.
  const shownKey = (key: string) => key.split(" ").map((k) => prettyKey(k, app.leader)).join(" ");
  const GAP = 3;
  const layoutFor = (n: number) => {
    const perCol = Math.ceil(entries.length / n);
    const widths: { key: number; text: number }[] = [];
    for (let k = 0; k < n; k++) {
      const col = entries.slice(k * perCol, (k + 1) * perCol);
      if (!col.length) break;
      widths.push({
        key: Math.min(16, Math.max(...col.map((e) => stringWidth(shownKey(e.key))))),
        text: Math.min(48, Math.max(...col.map((e) => Math.max(stringWidth(e.label), stringWidth(e.desc))))),
      });
    }
    const total = widths.reduce((a, w) => a + w.key + 3 + w.text + GAP, 2);
    return { perCol, widths, total };
  };
  let plan = layoutFor(1);
  for (const n of [3, 2]) {
    const p = layoutFor(n);
    if (p.total <= c.width) {
      plan = p;
      break;
    }
  }
  const rows = plan.perCol;
  const room = bottom - top;
  const withDesc = entries.some((e) => e.desc) && rows * 2 + 3 <= room;
  const entryH = withDesc ? 2 : 1;
  const h = Math.min(room, 1 + 1 + rows * entryH + 1);
  const y0 = bottom - h;
  const bg = roleStyle(theme, "which_key", null);
  const dim = { ...roleStyle(theme, "overlay_dim", bg.bg) };
  c.fill(0, y0, c.width, h, bg.bg);
  const name = app.groupName(app.pending);
  const crumb = app.pending.length ? ` ${app.pending.map((k) => prettyKey(k, app.leader)).join(" ")} ›${name ? ` ${name}` : ""} ` : ` ${name} `;
  const cw = drawText(c, 0, y0, crumb, roleStyle(theme, "which_key_title", null));
  const hint = app.pending.length ? "backspace: up · esc: cancel" : "keys repeat · any other key leaves";
  drawText(c, cw + 1, y0, hint, dim, c.width - cw - 1);
  const keySt = roleStyle(theme, "which_key_key", null);
  const grpSt = roleStyle(theme, "which_key_group", null);
  const firstY = y0 + 2;
  const lastY = y0 + h - 2; // keep the bottom row blank
  const colX: number[] = [];
  plan.widths.reduce((x, w) => (colX.push(x), x + w.key + 3 + w.text + GAP), 2);
  entries.forEach((e, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const y = firstY + row * entryH;
    const w = plan.widths[col];
    if (y > lastY || !w) return;
    const x = colX[col]!;
    const textX = x + w.key + 3;
    const textW = Math.max(4, Math.min(w.text, c.width - textX - 1));
    const id = `wk:${e.key.split(" ")[0]}`;
    geo.hot.push({ id, x, y, w: w.key + 3 + w.text, h: entryH });
    if (app.hover === id) c.fill(x, y, w.key + 3 + w.text, 1, theme.roles.hover.bg ?? null);
    drawText(c, x, y, shownKey(e.key), keySt, w.key);
    drawText(c, x + w.key + 1, y, "→", bg);
    drawText(c, textX, y, truncate(e.label, textW), e.group ? grpSt : { ...bg, bold: true });
    if (withDesc && e.desc && y + 1 <= lastY) drawText(c, textX, y + 1, truncate(e.desc, textW), dim);
  });
}

function drawList(app: App, c: Canvas, o: ListOverlay, mainY: number, mainH: number): Rect & { listY: number } {
  const theme = app.theme;
  const W = c.width;
  const w = Math.min(100, W - (W > 60 ? 8 : 0));
  // Rows besides the list: the borders, the input, and the footer (a rule and a line).
  const inner = (o.filterable ? 3 : 2) + (o.footer ? 2 : 0);
  const h = Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  c.fill(x, y, w, h, bg.bg);
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
  if (o.footer) {
    // The selected entry's description, under a rule.
    drawText(c, x, y + h - 3, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, border);
    const detail = o.filtered[o.selected]?.item.detail ?? "";
    drawText(c, x + 2, y + h - 2, truncate(detail, w - 4), dim);
  }
  const rows = h - (listY - y) - 1 - (o.footer ? 2 : 0);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  // When the selected entry is the top row, bring its heading (title and rule, not the blank
  // row before them) into view above it.
  if (o.scroll === o.selected) {
    while (o.scroll > 0 && o.filtered[o.scroll - 1]!.item.header && (o.filtered[o.scroll - 1]!.item.label || o.filtered[o.scroll - 1]!.item.rule)) o.scroll--;
  }
  // Key columns: each as wide as its widest binding in the section, so keys line up down it.
  const colWAt: number[][] = new Array(o.filtered.length);
  for (let i = 0; i < o.filtered.length; ) {
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
    if (item.detail && !o.footer) {
      const room = x + 2 + avail - cx - 2;
      if (room > 4) cx += drawText(c, cx + 2, ry, truncate(item.detail, room), { ...dim, bg: st.bg }) + 2;
    }
    if (hint) drawText(c, x + w - 2 - stringWidth(hint), ry, hint, { ...dim, bg: st.bg });
  }
  if (!selectableCount) drawText(c, x + 2, listY, o.input ? "no matches" : "nothing here", dim);
  return { x, y, w, h, listY };
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
    if (k !== undefined) {
      if (plain && i > 0) drawText(c, x - 2, y, "·", sepSt);
      drawText(c, x, y, plain ? k : ` ${k} `, cap);
    }
    x += colW[i]! + pad + gap;
  }
  return widthOf(n);
}
