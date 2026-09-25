// Painting the app (3.1, 3.2): tab bar, sidebar | content (one split) | status line, overlays.
// Viewport-only: only the rows on screen are drawn, whatever the note's length.
//
// Returns the geometry of what was drawn, which the mouse handler hit-tests against.

import type { Line } from "../core/layout/ir.ts";
import { type CellStyle, spanStyle } from "../core/layout/style.ts";
import type { Color, Role, Theme } from "../core/theme/theme.ts";
import { graphemes, graphemeWidth, stringWidth, truncate } from "../core/width.ts";
import type { App, ListOverlay, View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";

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

export interface Geometry {
  panes: PaneGeom[];
  sidebar: Rect | null;
  tabs: (Rect & { index: number })[];
  overlay: (Rect & { listY: number }) | null;
}

const CHANGE_MARKER_MS = 3000;

function roleStyle(theme: Theme, role: Role, page: Color | null): CellStyle {
  const r = theme.roles[role];
  return { fg: r.fg ?? theme.fg, bg: r.bg ?? page, bold: !!r.bold, italic: !!r.italic, underline: !!r.underline, strike: false, dim: !!r.dim };
}

function pageBg(theme: Theme): Color | null {
  return theme.bg === "default" ? null : theme.bg;
}

export function drawApp(app: App, c: Canvas): Geometry {
  const theme = app.theme;
  const page = pageBg(theme);
  const W = c.width;
  const H = c.height;
  const geo: Geometry = { panes: [], sidebar: null, tabs: [], overlay: null };
  c.fill(0, 0, W, H, page);
  if (W < 10 || H < 4) {
    drawText(c, 0, 0, "slipbox: too small", roleStyle(theme, "warn", page), W);
    return geo;
  }

  const tabBar = app.tabs.length > 1 ? 1 : 0;
  const bottomLine = app.overlay?.kind === "prompt" || app.transient ? 1 : 0;
  const mainY = tabBar;
  const mainH = H - tabBar - 1 - bottomLine;

  if (tabBar) drawTabs(app, c, geo);

  // Sidebar beside the content when wide; over it when narrow (3.14).
  const sideW = Math.max(16, Math.min(app.config.ui.sidebar_width, Math.floor(W * 0.4)));
  const besides = app.sidebar.visible && !app.narrow;
  const contentX = besides ? sideW + 1 : 0;
  const content: Rect = { x: contentX, y: mainY, w: W - contentX, h: mainH };

  drawContent(app, c, content, geo);

  if (app.sidebarShown) {
    const w = besides ? sideW : Math.min(sideW + 6, W - 6);
    const rect: Rect = { x: 0, y: mainY, w, h: mainH };
    drawSidebar(app, c, rect);
    const borderRole: Role = app.region === "sidebar" ? "border_active" : "border";
    for (let y = mainY; y < mainY + mainH; y++) drawText(c, w, y, app.glyphs.vbar, roleStyle(theme, borderRole, page), 1);
    geo.sidebar = rect;
  }

  drawStatus(app, c, H - 1 - bottomLine);
  if (bottomLine) drawBottomLine(app, c, H - 1);
  if (app.overlay?.kind === "list") geo.overlay = drawList(app, c, app.overlay, mainY, mainH);
  return geo;
}

function drawTabs(app: App, c: Canvas, geo: Geometry): void {
  const theme = app.theme;
  c.fill(0, 0, c.width, 1, theme.roles.tab.bg ?? pageBg(theme));
  let x = 0;
  app.tabs.forEach((t, i) => {
    const v = t.views[t.active]!;
    const label = ` ${i + 1} ${truncate(v.buf.name.replace(/\.(md|markdown)$/i, ""), 24)}${v.buf.changedAt && app.now() - v.buf.changedAt < CHANGE_MARKER_MS ? " ↻" : ""} `;
    const role: Role = i === app.activeTab ? "tab_active" : "tab";
    const w = drawText(c, x, 0, label, roleStyle(theme, role, pageBg(theme)), c.width - x);
    geo.tabs.push({ x, y: 0, w, h: 1, index: i });
    x += w;
  });
}

function drawContent(app: App, c: Canvas, area: Rect, geo: Geometry): void {
  const tab = app.tab;
  const theme = app.theme;
  const page = pageBg(theme);
  if (!tab) {
    const msg = "No note open — Ctrl-P opens one, ? lists keys";
    drawText(c, area.x + Math.max(1, Math.floor((area.w - stringWidth(msg)) / 2)), area.y + Math.floor(area.h / 2), msg, roleStyle(theme, "dim", page), area.w);
    return;
  }
  if (tab.views.length === 1) {
    drawPane(app, c, tab.views[0]!, area, true, false, geo);
    return;
  }
  // One split (3.3): side by side when there is room, stacked when narrow.
  const [a, b] = tab.views as [View, View];
  const border = roleStyle(theme, "border", page);
  if (area.w >= 100) {
    const w1 = Math.floor((area.w - 1) / 2);
    drawPane(app, c, a, { ...area, w: w1 }, tab.active === 0, true, geo);
    for (let y = area.y; y < area.y + area.h; y++) drawText(c, area.x + w1, y, app.glyphs.vbar, border, 1);
    drawPane(app, c, b, { x: area.x + w1 + 1, y: area.y, w: area.w - w1 - 1, h: area.h }, tab.active === 1, true, geo);
  } else {
    const h1 = Math.floor(area.h / 2);
    drawPane(app, c, a, { ...area, h: h1 }, tab.active === 0, true, geo);
    drawPane(app, c, b, { x: area.x, y: area.y + h1, w: area.w, h: area.h - h1 }, tab.active === 1, true, geo);
  }
}

function drawPane(app: App, c: Canvas, view: View, rect: Rect, active: boolean, titled: boolean, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  let body = rect;
  if (titled) {
    const role: Role = active ? "tab_active" : "tab";
    const st = roleStyle(theme, role, page);
    c.fill(rect.x, rect.y, rect.w, 1, st.bg);
    drawText(c, rect.x, rect.y, ` ${truncate(app.displayName(view.buf), rect.w - 2)} `, st, rect.w);
    body = { x: rect.x, y: rect.y + 1, w: rect.w, h: rect.h - 1 };
  }
  if (body.h <= 0 || body.w <= 4) return;
  view.height = body.h;
  view.width = body.w - 1;
  const layout = app.layoutFor(view, view.width);
  const textX = body.x + 1;
  geo.panes.push({ ...body, view, textX });

  const find = view.find;
  const sel = view.selection;
  const focus = active ? view.focusLink : -1;
  for (let i = 0; i < body.h; i++) {
    const row = view.top + i;
    const line = layout.lines[row];
    if (!line) break;
    const y = body.y + i;
    const fill = line.fill ? theme.roles[line.fill].bg : undefined;
    if (fill) c.fill(textX, y, Math.min(layout.width, body.w - 2), 1, fill);
    const marks: { from: number; to: number; role: Role }[] = [];
    if (find) {
      find.matches.forEach((m, k) => {
        if (m.row === row) marks.push({ from: m.col, to: m.col + m.len, role: k === find.current ? "link_focus" : "selection" });
      });
    }
    if (sel) {
      let [a, b] = [sel.a, sel.b];
      if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
      if (row >= a.row && row <= b.row) marks.push({ from: row === a.row ? a.col : 0, to: row === b.row ? b.col + 1 : 1e9, role: "selection" });
    }
    drawLine(c, textX, y, line, body.w - 2, theme, page, focus, marks);
  }

  // Scrollbar in the last column.
  const total = layout.lines.length;
  if (total > body.h) {
    const thumb = Math.max(1, Math.round((body.h * body.h) / total));
    const pos = Math.round((view.top / Math.max(1, total - body.h)) * (body.h - thumb));
    const st = roleStyle(theme, active ? "scrollbar" : "border", page);
    for (let k = 0; k < thumb; k++) drawText(c, body.x + body.w - 1, body.y + pos + k, app.glyphs.scrollThumb, st, 1);
  }
}

/** Draw one layout row. `marks` override styles by column range; the focused link gets its own. */
function drawLine(c: Canvas, x: number, y: number, line: Line, maxW: number, theme: Theme, page: Color | null, focusLink: number, marks: { from: number; to: number; role: Role }[]): void {
  let col = 0;
  for (const span of line.spans) {
    if (col >= maxW) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    if (!st.bg) st.bg = page;
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
  return out;
}

function drawSidebar(app: App, c: Canvas, rect: Rect): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(rect.x, rect.y, rect.w, rect.h, base.bg);
  const rows = app.treeRows();
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
    const icon = row.kind === "dir" ? (s.expanded.has(row.path) ? g.dirOpen : g.dirClosed) : g.file;
    const name = row.kind === "note" ? row.name.replace(/\.(md|markdown)$/i, "") : row.name;
    const text = `${" ".repeat(1 + row.depth * 2)}${icon} ${name}`;
    drawText(c, rect.x, y, truncate(text, rect.w - 1), st, rect.w);
  }
}

function drawStatus(app: App, c: Canvas, y: number): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const st = roleStyle(theme, "status", page);
  c.fill(0, y, c.width, 1, st.bg);
  const view = app.view;
  const chip = app.pending.length ? ` ${app.pending.join(" ")} ` : app.region === "sidebar" && app.sidebarShown ? " FILES " : " READ ";
  let x = drawText(c, 0, y, chip, roleStyle(theme, "status_accent", page));
  if (!view) return;
  const buf = view.buf;
  const layout = app.currentLayout(view);
  const pct = layout.lines.length <= view.height ? "all" : `${Math.round((view.top / Math.max(1, layout.lines.length - view.height)) * 100)}%`;
  const src = layout.lines[view.top]?.src ?? 1;
  let right = `L${src} ${pct}`;
  if (app.tabs.length > 1) right = `tab ${app.activeTab + 1}/${app.tabs.length}  ${right}`;
  const link = app.focusedLink(view);
  if (link) right = `→ ${link.kind === "wiki" || link.kind === "embed" ? `[[${link.target}${link.heading ? `#${link.heading}` : ""}]]` : link.target} (${link.status})  ${right}`;
  else if (view.find) right = `/${view.find.query} ${view.find.matches.length ? view.find.current + 1 : 0}/${view.find.matches.length}  ${right}`;
  const rightW = stringWidth(right) + 1;

  const changed = buf.changedAt && app.now() - buf.changedAt < CHANGE_MARKER_MS;
  x += drawText(c, x, y, " ", st);
  x += drawText(c, x, y, truncate(app.displayName(buf), Math.max(4, c.width - x - rightW - 14)), { ...st, bold: true });
  if (buf.deleted) x += drawText(c, x, y, " ✖ deleted on disk", roleStyle(theme, "error", st.bg));
  else if (changed) x += drawText(c, x, y, " ↻ reloaded", roleStyle(theme, "info", st.bg));
  if (app.watcher?.degraded) x += drawText(c, x, y, " ⚠ not watching", roleStyle(theme, "warn", st.bg));
  if (app.indexing > 200) x += drawText(c, x, y, ` indexing ${app.indexing}…`, roleStyle(theme, "status_dim", page));
  if (app.loc.mode === "single") x += drawText(c, x, y, " (single-file)", roleStyle(theme, "status_dim", page));
  const rx = c.width - rightW;
  if (rx > x) drawText(c, rx, y, right, roleStyle(theme, "status_dim", page));
}

function drawBottomLine(app: App, c: Canvas, y: number): void {
  const theme = app.theme;
  const page = pageBg(theme);
  c.fill(0, y, c.width, 1, page);
  const o = app.overlay;
  if (o?.kind === "prompt") {
    const x = drawText(c, 0, y, o.label, roleStyle(theme, "info", page));
    const shown = truncate(o.text, c.width - x - 2);
    const w = drawText(c, x, y, shown, roleStyle(theme, "text", page));
    drawText(c, x + w, y, " ", { ...roleStyle(theme, "text", page), bg: theme.roles.link_focus.bg ?? null });
    return;
  }
  const m = app.transient;
  if (!m) return;
  const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
  drawText(c, 1, y, truncate(m.text, c.width - 2), roleStyle(theme, role, page));
}

function drawList(app: App, c: Canvas, o: ListOverlay, mainY: number, mainH: number): Rect & { listY: number } {
  const theme = app.theme;
  const W = c.width;
  const w = Math.min(100, W - (W > 60 ? 8 : 0));
  const inner = o.filterable ? 3 : 2; // title (+ input) + bottom border
  const h = Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  c.fill(x, y, w, h, bg.bg);
  const b = app.glyphs.box;
  const title = ` ${o.title} `;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(title, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const count = ` ${o.filtered.length ? o.selected + 1 : 0}/${o.filtered.length} `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 3 - stringWidth(count)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, count + b.br, dim);

  let listY = y + 1;
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 8), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", { ...bg, bg: theme.roles.link_focus.bg ?? null });
    listY = y + 2;
  }
  const rows = h - (listY - y) - 1;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const ry = listY + i;
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const { item, positions } = entry;
    const hint = item.hint ?? "";
    const hintW = hint ? stringWidth(hint) + 2 : 0;
    const avail = w - 4 - hintW;
    let cx = x + 2 + (item.indent ?? 0) * 2;
    const label = truncate(item.label, Math.max(4, avail - (item.indent ?? 0) * 2));
    // Highlight fuzzy-matched characters of the label.
    const pos = new Set(positions);
    let ci = 0;
    for (const g of graphemes(label)) {
      const gw = graphemeWidth(g);
      const matched = pos.has(ci);
      if (gw > 0) c.cell(cx, ry, g, gw, matched ? { ...st, fg: matchSt.fg, bold: true } : st);
      cx += gw;
      ci += g.length;
    }
    if (item.detail) {
      const room = x + 2 + avail - cx - 2;
      if (room > 4) cx += drawText(c, cx + 2, ry, truncate(item.detail, room), { ...dim, bg: st.bg }) + 2;
    }
    if (hint) drawText(c, x + w - 2 - stringWidth(hint), ry, hint, { ...dim, bg: st.bg });
  }
  if (!o.filtered.length) drawText(c, x + 2, listY, o.input ? "no matches" : "nothing here", dim);
  return { x, y, w, h, listY };
}
