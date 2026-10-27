// Drawing the Problems panel (1.7): its tabs, the file's problems with an excerpt of each line, the root's in
// folding sections.

import type { App } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Rect, type Geometry, pageBg, roleStyle, markStyle } from "./draw.ts";
import type { Role, Color } from "../core/theme/theme.ts";
import { smallButton } from "./draw-panels.ts";
import { truncate, stringWidth, truncateStart } from "../core/foundation/text/width.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import type { Problem } from "../core/documents/diagnostics/diagnostics.ts";
import { severityGlyph, SEVERITY_ROLE, MARK_ROLE } from "./draw-pane.ts";

/**
 * The Problems panel (1.7), across the bottom: a row of its two tabs — This file (n), All (n) — with
 * All's filter after them and a close button at the end, then the tab's list. Returns its rect.
 */
export function drawProblemsPanel(app: App, c: Canvas, rect: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const bg = roleStyle(theme, "sidebar", page).bg;
  c.fill(rect.x, rect.y, rect.w, rect.h, bg);
  const p = app.problems.panel;
  const focused = app.region === "problems";
  const file = app.problems.ofFile();
  let x = rect.x + 1;
  for (const [tab, title] of [
    ["file", `This file (${file.length})`],
    ["all", `All (${app.problems.count()})`],
  ] as const) {
    const id = `ptab:${tab}`;
    const on = p.tab === tab;
    const role: Role =
      app.mouse.hover === id ? "hover" : on ? (focused ? "sidebar_selected" : "sidebar_active") : "dim";
    const w = drawText(c, x, rect.y, ` ${title} `, { ...roleStyle(theme, role, bg), bold: on }, rect.x + rect.w - x);
    geo.hot.push({ id, x, y: rect.y, w, h: 1 });
    x += w + 1;
  }
  const closeId = "ptab:close";
  const closeX = rect.x + rect.w - 4;
  if (closeX > x) smallButton(app, c, closeX, rect.y, ` ${app.glyphs.close} `, closeId, geo, bg);
  // The tab's filter (`/`), after the titles.
  const s = app.problems.list();
  if (s.filtering || s.filter) {
    const px = drawText(c, x + 1, rect.y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
    const fw = drawText(c, x + 1 + px, rect.y, truncate(sanitize(s.filter), Math.max(0, closeX - x - 3 - px)), {
      ...roleStyle(theme, "text", bg),
      bg,
    });
    if (s.filtering && focused) drawText(c, x + 1 + px + fw, rect.y, " ", roleStyle(theme, "cursor", bg));
  }
  // The list, a blank row above and below it when there's room.
  const pad = rect.h >= 6 ? 1 : 0;
  const hidden = app.problems.hiddenCaption();
  if (hidden) drawText(c, rect.x + 1, rect.y + 1, sanitize(hidden), roleStyle(theme, "dim", bg), rect.w - 2);
  const extra = hidden ? 1 : 0;
  const list = { x: rect.x, y: rect.y + 1 + pad + extra, w: rect.w, h: Math.max(0, rect.h - 1 - 2 * pad - extra) };
  if (!list.h) return rect;
  if (p.tab === "all") drawAllProblems(app, c, list, bg, geo);
  else drawFileProblems(app, c, list, app.problems.fileRows(), bg, geo);
  return rect;
}

/** A panel list's scroll, keeping its selection in view (`per`: rows an entry takes). */
function panelScroll(s: { selected: number; scroll: number }, count: number, shown: number): void {
  s.selected = Math.max(0, Math.min(s.selected, count - 1));
  if (s.selected < s.scroll) s.scroll = s.selected;
  if (s.selected >= s.scroll + shown) s.scroll = s.selected - shown + 1;
  s.scroll = Math.max(0, Math.min(s.scroll, Math.max(0, count - shown)));
}

/**
 * This file's problems: two rows each, a blank one between them — the severity's sign, `line:col`, the
 * message and (dim, at the right) who found it; under it the line's text, the problem's part marked as in the note.
 */
function drawFileProblems(app: App, c: Canvas, list: Rect, problems: Problem[], bg: Color | null, geo: Geometry): void {
  const theme = app.theme;
  const s = app.problems.panel.file;
  const shown = Math.max(1, Math.floor((list.h + 1) / 3));
  geo.problemsPage = shown;
  panelScroll(s, problems.length, shown);
  if (!problems.length) {
    drawText(
      c,
      list.x + 2,
      list.y,
      s.filter ? "no matches" : "no problems in this file",
      roleStyle(theme, "dim", bg),
      list.w - 2,
    );
    return;
  }
  const lines = app.view?.buf.lines() ?? [];
  const cols = list.w - 2;
  for (let i = 0; i < shown; i++) {
    const at = s.scroll + i;
    const pr = problems[at];
    if (!pr) break;
    const y = list.y + i * 3;
    const selected = at === s.selected;
    const st = roleStyle(
      theme,
      selected && app.region === "problems" ? "sidebar_selected" : selected ? "sidebar_active" : "sidebar",
      bg,
    );
    if (selected) c.fill(list.x, y, list.w, 2, st.bg);
    const rowBg = st.bg;
    const sign = severityGlyph(app.glyphs, pr.severity);
    let x = list.x + 1;
    x += drawText(c, x, y, `${sign} `, { ...roleStyle(theme, SEVERITY_ROLE[pr.severity], rowBg), bg: rowBg });
    x += drawText(c, x, y, `${pr.start.line}:${pr.start.column}  `, { ...roleStyle(theme, "dim", rowBg), bg: rowBg });
    const who = sanitize(`${pr.source}${pr.code ? ` ${pr.code}` : ""}`);
    const whoW = Math.min(stringWidth(who), Math.floor(cols / 3));
    const msgRoom = list.x + 1 + cols - x - (whoW ? whoW + 2 : 0);
    drawText(
      c,
      x,
      y,
      truncate(sanitize(pr.message.replace(/\s*\n\s*/g, " ")), Math.max(0, msgRoom)),
      st,
      Math.max(0, msgRoom),
    );
    if (whoW)
      drawText(c, list.x + 1 + cols - whoW, y, truncate(who, whoW), { ...roleStyle(theme, "dim", rowBg), bg: rowBg });
    drawExcerpt(app, c, list.x + 4, y + 1, cols - 3, lines[pr.start.line - 1] ?? "", pr, rowBg);
    geo.hot.push({ id: `prow:${at}`, x: list.x, y, w: list.w, h: 2 });
  }
}

/**
 * A problem's line, cut to `w`, its leading blanks dropped: the part the problem covers (to the line's
 * end when it runs on) marked as in the note, the text before it cut from the front to keep it in sight.
 */
function drawExcerpt(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  w: number,
  raw: string,
  pr: Problem,
  bg: Color | null,
): void {
  if (w <= 0) return;
  const theme = app.theme;
  // Tabs as one space each: the columns (UTF-16 units) still count from the line's start.
  const text = raw.replace(/\r$/, "").replace(/\t/g, " ");
  const from = Math.max(0, Math.min(text.length, pr.start.column - 1));
  const to = pr.end.line === pr.start.line ? Math.max(from, Math.min(text.length, pr.end.column - 1)) : text.length;
  const lead = text.length - text.trimStart().length;
  const head = sanitize(text.slice(Math.min(lead, from), from));
  const part = sanitize(text.slice(from, to));
  const tail = sanitize(text.slice(to));
  const dim = { ...roleStyle(theme, "dim", bg), bg };
  const before = stringWidth(head) > w / 2 ? truncateStart(head, Math.floor(w / 2)) : head;
  let at = x + drawText(c, x, y, before, dim, w);
  const left = () => Math.max(0, x + w - at);
  const mark = {
    ...roleStyle(theme, "text", bg),
    bg,
    ...markStyle(theme, pr.source === "syntax" ? "syntax_error" : MARK_ROLE[pr.severity]),
  };
  // An empty part (a problem at the line's end): one cell marked where it is.
  at += drawText(c, at, y, part ? truncate(part, left()) : left() ? " " : "", mark, left());
  if (left()) drawText(c, at, y, truncate(tail, left()), dim, left());
}

/**
 * The All tab: the root's problems as the left panel's view had them — a heading per kind, with its
 * count, that folds; under it each note with problems, then its problems — the line, dim, and how the
 * link is written and why, in the link's colour — cut to the panel.
 */
function drawAllProblems(app: App, c: Canvas, rect: Rect, bg: Color | null, geo: Geometry): void {
  const theme = app.theme;
  const rows = app.problems.rows();
  const s = app.problems.panel.all;
  const g = app.glyphs;
  geo.problemsPage = rect.h;
  panelScroll(s, rows.length, rect.h);
  // Elsewhere has no index (VV-D3): said, not shown as nothing wrong.
  const none =
    app.loc.mode === "folder"
      ? "Elsewhere has no index: no check of its notes' links"
      : s.filter
        ? "no matches"
        : "no problems";
  if (!rows.length) drawText(c, rect.x + 2, rect.y, none, roleStyle(theme, "dim", bg), rect.w - 2);
  const cols = rect.w - 1;
  for (let i = 0; i < rect.h; i++) {
    const at = s.scroll + i;
    const row = rows[at];
    if (!row) break;
    const y = rect.y + i;
    const selected = at === s.selected;
    const st = roleStyle(
      theme,
      selected && app.region === "problems" ? "sidebar_selected" : selected ? "sidebar_active" : "sidebar",
      bg,
    );
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    geo.hot.push({ id: `prow:${at}`, x: rect.x, y, w: rect.w, h: 1 });
    if (row.heading) {
      drawText(
        c,
        rect.x + 1,
        y,
        truncate(`${row.folded ? g.foldClosed : g.foldOpen} ${row.label}`, cols - 1),
        { ...st, bold: true },
        cols - 1,
      );
      continue;
    }
    if (row.note) {
      drawText(c, rect.x + 4, y, truncate(row.label, cols - 4), st, cols - 4);
      continue;
    }
    const w = drawText(
      c,
      rect.x + 6,
      y,
      truncate(row.label, cols - 6),
      { ...roleStyle(theme, "dim", st.bg), bg: st.bg },
      cols - 6,
    );
    const x = rect.x + 6 + w + 2;
    const role: Role =
      row.section === "Broken links" ? "link_unresolved" : row.section === "Lint" ? "warn" : "link_ambiguous";
    if (x < rect.x + cols)
      drawText(
        c,
        x,
        y,
        truncate(sanitize(row.detail), rect.x + cols - x),
        { ...roleStyle(theme, role, st.bg), bg: st.bg },
        rect.x + cols - x,
      );
  }
}
