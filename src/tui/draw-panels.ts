// Drawing the side panels: on the left the explorer's tree and its breadcrumb, source control's list, the history;
// on the right the Info view, the footnotes, the outline — each with its title, its filter row, its scrolling.

import type { App, SidePaneState } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Rect, type Geometry, roleStyle, pageBg } from "./draw.ts";
import type { Color, Role } from "../core/theme/theme.ts";
import { stringWidth, truncate, splitAtWidth, graphemes, graphemeWidth } from "../core/width.ts";
import { drawHScrollbar, paneScrollbar } from "./draw-pane.ts";
import { LEFT_VIEWS, RIGHT_VIEWS } from "./panels.ts";
import { sanitize } from "../core/sanitize.ts";
import { gitRows } from "./gitview.ts";
import type { TreeRow } from "./explorer.ts";
import { INDEX_ROLE, indexGlyph } from "./marks.ts";
import { GIT_MARK, marked } from "./draw-overlays.ts";
import { match } from "./match.ts";
import type { HistoryRow } from "./history.ts";

/** A side pane's title and the blank row under it; returns the rect left for the pane's list.
 *  Short panes skip the title. */
function paneTitle(app: App, c: Canvas, rect: Rect, title: string, focused: boolean, bg: Color | null): Rect {
  if (rect.h < 8) return rect;
  // Bright while the pane has focus, dimmer otherwise; bold either way.
  drawText(
    c,
    rect.x + 1,
    rect.y,
    title,
    { ...roleStyle(app.theme, focused ? "pane_title_active" : "pane_title", bg), bg },
    rect.w - 1,
  );
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
function drawGuides(
  app: App,
  c: Canvas,
  rect: Rect,
  y: number,
  depth: number,
  line: { last: boolean; more: boolean[] },
  bg: Color | null,
  left = 0,
): void {
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

function sideView<T extends object>(
  rect: Rect,
  rows: T[],
  text: (row: T) => string,
  state: SidePaneState,
  least = 0,
): SideView {
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
 *  cut with an ellipsis otherwise (a pane too short for the bar); `reserve` columns kept at its end. */
function sideRow(text: string, sv: SideView, reserve = 0): string {
  const cols = Math.max(1, sv.cols - reserve);
  if (!sv.hbar) return truncate(text, cols);
  return splitAtWidth(splitAtWidth(text, sv.left)[1], cols)[0];
}

function sideHScrollbar(
  app: App,
  c: Canvas,
  sv: SideView,
  pane: "sidebar" | "outline",
  active: boolean,
  bg: Color | null,
  geo: Geometry,
): void {
  if (!sv.hbar) return;
  drawHScrollbar(app, c, sv.hbar, sv.natural, sv.left, active, bg);
  geo.scrollbars.push({ ...sv.hbar, pane, total: sv.natural, horizontal: true });
}

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
  const s = app.sidebar;
  rect = filterRow(app, c, rect, s, app.region === "sidebar", base.bg, geo);
  return view === "history"
    ? drawHistoryList(app, c, rect, base.bg, geo)
    : view === "git"
      ? drawGitList(app, c, rect, base.bg, geo)
      : drawTree(app, c, rect, base.bg, geo);
}

/**
 * The breadcrumb over the explorer (VV-D5): the folders down to the view, `~` for home, each a click away — the
 * vault open highlighted, a vault by its icon, the view bold — then, dimmed, those past the view it can zoom back
 * into. Too long, the folders at its start give way to `…`.
 */
function drawCrumbs(app: App, c: Canvas, x: number, y: number, w: number, bg: Color | null, geo: Geometry): void {
  if (w < 4) return;
  const theme = app.theme;
  const g = app.glyphs;
  const crumbs = app.explorer.crumbs();
  const between = ` ${g.crumb} `;
  const view = crumbs.findLastIndex((cr) => !cr.past);
  type Part = { cr: (typeof crumbs)[number]; text: string };
  const width = (list: Part[], lead: boolean) =>
    list.reduce((n, p, i) => n + (i ? stringWidth(between) : 0) + stringWidth(p.text), 0) +
    (list.at(-1)?.cr.past ? 0 : stringWidth(` ${g.crumb}`)) +
    (lead ? stringWidth(g.ellipsis + between) : 0);
  let list: Part[] = crumbs.map((cr) => ({ cr, text: `${cr.vault ? `${g.vault} ` : ""}${sanitize(cr.label)}` }));
  // Too long: the view stays, and the first folder past it, the way back in (cut short if it must be); the others
  // past it give way first, from the end, then those above it, from the start, to `…`.
  const fits = (from: number) => width(list.slice(from), from > 0) <= w;
  while (list.length - 1 > view + 1 && !fits(view)) list = list.slice(0, -1);
  if (list.length - 1 > view && !fits(view)) {
    const last = list.at(-1)!;
    const room = w - (width(list.slice(view), view > 0) - stringWidth(last.text));
    list = room >= 4 ? [...list.slice(0, -1), { cr: last.cr, text: truncate(last.text, room) }] : list.slice(0, -1);
  }
  let from = 0;
  while (from < view && !fits(from)) from++;
  const end = x + w;
  let cx = x;
  const dim = { ...roleStyle(theme, "dim", bg), bg };
  const put = (s: string, st: ReturnType<typeof roleStyle>) => {
    const n = cx < end ? drawText(c, cx, y, s, st, end - cx) : 0;
    cx += n;
    return n;
  };
  if (from) put(g.ellipsis + between, dim);
  list.slice(from).forEach(({ cr, text }, i) => {
    if (i) put(between, dim);
    const id = `xcrumb:${cr.abs}`;
    const role: Role = cr.current ? "sidebar_active" : cr.past ? "dim" : cr.vault ? "sidebar_root" : "sidebar_dir";
    const st =
      app.mouse.hover === id
        ? roleStyle(theme, "hover", bg)
        : { ...roleStyle(theme, role, bg), bg, bold: i + from === view };
    const at = cx;
    const n = put(text, st);
    if (n > 0 && i + from !== view) geo.hot.push({ id, x: at, y, w: n, h: 1 });
  });
  if (!list.at(-1)?.cr.past) put(` ${g.crumb}`, dim);
}

/** A file's state letter's colour in source control (26.2): as the explorer's marks have it. */
const LETTER_ROLE: Record<string, Role> = {
  M: "git_modified",
  R: "git_modified",
  C: "git_modified",
  T: "git_modified",
  A: "git_new",
  "?": "git_new",
  D: "diff_del",
  U: "git_conflict",
};

/** The source control view (26.2): each section's heading, its files — a state letter, the name, the folder dim — and a
 *  file's changes under it when opened up. */
function drawGitList(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const rows = gitRows(app);
  const s = app.sidebar;
  const sv = sideView(list, rows, () => "", s);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length) {
    const why = !app.git.checkout
      ? "not a git checkout"
      : app.git.entries === null
        ? "asking git…"
        : s.filter
          ? "no matches"
          : "nothing changed";
    drawText(c, rect.x + 1, rect.y, why, roleStyle(theme, "dim", bg), rect.w - 1);
  }
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    if (row.kind === "heading") {
      drawText(c, rect.x, y, sideRow(` ${row.label}`, sv), { ...roleStyle(theme, "dim", bg), bold: true }, rect.w);
      continue;
    }
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    const st = roleStyle(theme, selected ? "sidebar_selected" : "sidebar", bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    let x = rect.x + 1;
    if (row.kind === "file") {
      // Its letter in its state's colour, then its name.
      const letter = row.label.slice(0, 1);
      x += drawText(c, x, y, letter, {
        ...roleStyle(theme, LETTER_ROLE[letter] ?? "git_modified", st.bg),
        bg: st.bg,
        bold: true,
      });
      x += drawText(
        c,
        x,
        y,
        truncate(row.label.slice(1), Math.max(1, sv.cols - (x - rect.x) - 1)),
        st,
        rect.w - (x - rect.x),
      );
    } else
      x += drawText(
        c,
        x,
        y,
        truncate(row.label, sv.cols - 2),
        {
          ...roleStyle(
            theme,
            row.change!.kind === "add" ? "git_new" : row.change!.kind === "delete" ? "diff_del" : "git_modified",
            st.bg,
          ),
          bg: st.bg,
        },
        rect.w - 1,
      );
    // Its folder (a file's) or its first line (a change's), dim, where there's room.
    const hint = truncate(sanitize(row.hint), Math.max(0, sv.cols - (x - rect.x) - 2));
    if (hint && x - rect.x + 1 + stringWidth(hint) <= sv.cols - 1)
      drawText(c, x + 1, y, hint, { ...roleStyle(theme, "dim", st.bg), bg: st.bg });
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}

/**
 * A pane's filter (`/`), at the top of its list while it's open or holds text: the `› text` row
 * and a rule across the pane (joined to its border), then the list. Returns the rect
 * left for the list; a short pane gets only the text row.
 */
function filterRow(
  app: App,
  c: Canvas,
  rect: Rect,
  s: SidePaneState,
  focused: boolean,
  bg: Color | null,
  geo: Geometry,
): Rect {
  if (!(s.filtering || s.filter) || rect.h <= 2) return rect;
  const theme = app.theme;
  const px = drawText(c, rect.x + 1, rect.y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
  const fw = drawText(c, rect.x + 1 + px, rect.y, truncate(s.filter ?? "", rect.w - 4 - px), {
    ...roleStyle(theme, "text", bg),
    bg,
  });
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
  const rows = app.explorer.rows();
  const lines = treeLines(rows.map((r) => r.depth));
  const s = app.sidebar;
  const g = app.glyphs;
  const q = s.filter ?? "";
  // Every file with its extension, notes too: a vault holds notes, data files and code
  // side by side, and the extension says which.
  const nameOf = (row: TreeRow) => row.name;
  const icon = (row: TreeRow) =>
    row.root
      ? row.root.kind === "vault"
        ? g.vault
        : g.dirClosed
      : row.group === "data"
        ? g.dataFile
        : row.group === "text"
          ? g.textFile
          : g.file;
  const prefix = (row: TreeRow) =>
    `${" ".repeat(1 + row.depth * 2)}${row.kind === "dir" ? (q || app.explorer.expanded.has(row.path) ? g.dirOpen : g.dirClosed) : icon(row)} `;
  const text = (row: TreeRow) => prefix(row) + nameOf(row);
  // Its marks at its right (VV-D9), in columns: the index's state in the last, git's mark (5.11: a file's letter, a
  // folder's dot) two before it. Their columns count in the row's width, so a name scrolled to its end ends before
  // them, never under them.
  const gitOf = (row: TreeRow) => (row.kind === "note" ? app.git.states?.get(row.path) : app.git.folders.get(row.path));
  const marksOf = (row: TreeRow) => app.explorer.marks.of(row);
  const reserveOf = (git: unknown, index: unknown) => (git ? 4 : index ? 2 : 0);
  const measured = (row: TreeRow) => `${text(row)}${" ".repeat(reserveOf(gitOf(row), marksOf(row).index))}`;
  // The selected note, file, folder or nested vault: a button at the row's end opening its menu
  // (18.1) — rename, move, delete… — its right edge under the title's buttons'.
  const buttonsOf = (row: TreeRow) => {
    // The rows outside the vault's own tree (VV-D5) aren't this vault's to act on: no menu, as explorerItem has it.
    if (row.outside || row.root?.here) return null;
    if (row.kind === "root" && !(row.root?.kind === "vault" && app.loc.mode !== "folder")) return null;
    const bs: (readonly [string, string])[] = [[g.itemMenu, "xrow:menu"]];
    return { bs, w: bs.reduce((n, [glyph]) => n + stringWidth(glyph) + 2, 0) };
  };
  const sel = app.region === "sidebar" ? rows[Math.max(0, Math.min(s.selected, rows.length - 1))] : undefined;
  const selButtons = sel ? buttonsOf(sel) : null;
  const buttonsFit = !!selButtons && list.w - 1 - selButtons.w >= 4;
  // A name that doesn't fit beside them: the pane scrolls sideways, its end reachable before them.
  const sv = sideView(list, rows, measured, s, sel && buttonsFit ? stringWidth(text(sel)) + selButtons!.w + 1 : 0);
  const rect = sv.list;
  followSelection(s, rows.length, rect.h);
  if (!rows.length && q) drawText(c, rect.x + 1, rect.y, "no matches", roleStyle(theme, "dim", bg), rect.w - 1);
  const current = app.view?.buf.rel;
  const currentAbs = app.view?.buf.abs;
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rect.h; i++) {
    const row = rows[s.scroll + i];
    if (!row) break;
    const y = rect.y + i;
    const selected = s.scroll + i === s.selected && app.region === "sidebar";
    // The vault open, in a view above it (VV-D5): highlighted, as the note open is.
    let role: Role = row.root?.here
      ? "sidebar_active"
      : row.root?.kind === "vault"
        ? "sidebar_root"
        : row.kind !== "note"
          ? "sidebar_dir"
          : row.path === current || (row.outside && row.path === currentAbs)
            ? "sidebar_active"
            : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const withButtons = selected && row === sel && buttonsFit;
    const buttonsW = withButtons ? selButtons!.w : 0;
    // Its marks, not under its buttons; the text cut short of them (with a `…` when it can't scroll).
    const marks = marksOf(row);
    const gst = withButtons ? undefined : gitOf(row);
    const index = withButtons ? undefined : marks.index;
    const reserve = reserveOf(gst, index);
    const shown = sideRow(text(row), sv, reserve);
    const room = sv.cols - buttonsW;
    const drawn = !withButtons ? shown : sv.hbar ? splitAtWidth(shown, room)[0] : truncate(shown, room);
    const w = drawText(c, rect.x, y, drawn, st, rect.w - (reserve ? reserve + 1 : 0));
    // Where the filter's matches may be marked: on the name as drawn, short of the `…` that cut it.
    const cut = !sv.hbar && w === stringWidth(drawn) && stringWidth(drawn) < stringWidth(text(row));
    const markEnd = rect.x + w - (cut ? 1 : 0);
    if (index)
      drawText(
        c,
        rect.x + rect.w - 2,
        y,
        indexGlyph(g, index),
        { ...roleStyle(theme, INDEX_ROLE[index], st.bg), bg: st.bg },
        1,
      );
    if (gst) {
      const mark = row.kind === "note" ? GIT_MARK[gst] : g.markGitFolder;
      const role: Role = gst === "conflict" ? "git_conflict" : gst === "new" ? "git_new" : "git_modified";
      drawText(c, rect.x + rect.w - 4, y, mark, { ...roleStyle(theme, role, st.bg), bg: st.bg }, 1);
    }
    if (withButtons) {
      let x = rect.x + rect.w - 1;
      for (const [glyph, id] of selButtons!.bs) {
        x -= stringWidth(glyph) + 2;
        smallButton(app, c, x, y, ` ${glyph} `, id, geo, st.bg);
      }
    }
    if (!sv.left)
      drawDescribed(app, c, { x: rect.x, y, w }, row.root?.name, marks.describe, {
        // Up to its buttons, or a space short of git's column: one column for every row's, so they line up.
        nameEnd: withButtons ? room : sv.cols - reserve,
        describeEnd: withButtons ? room - 1 : sv.cols - 4,
        bg: st.bg,
      });
    drawGuides(app, c, rect, y, row.depth, lines[s.scroll + i]!, st.bg, sv.left);
    // What the filter matched in a note's name (it matches the path: a word may be a folder's).
    const m = q && row.kind === "note" && row.path.endsWith(nameOf(row)) ? match(q, row.path) : null;
    if (m) {
      const name = nameOf(row);
      const off = stringWidth(prefix(row));
      const base = row.path.length - name.length;
      // Grapheme by grapheme, as the name was drawn: an accent or an emoji whole, a wide one wide.
      const shown = marked(
        name,
        m.positions.filter((x) => x >= base).map((x) => x - base),
      );
      let x = rect.x + off - sv.left;
      let ci = 0;
      for (const gr of graphemes(shown.text)) {
        const gw = graphemeWidth(gr);
        if (shown.pos.has(ci) && gw > 0 && x >= rect.x && x + gw <= markEnd)
          c.cell(x, y, gr, gw, { ...st, fg: matchSt.fg, bold: true });
        x += gw;
        ci += gr.length;
      }
    }
  }
  paneScrollbar(app, c, rect, rows.length, s.scroll, "sidebar", app.region === "sidebar", bg, geo);
  sideHScrollbar(app, c, sv, "sidebar", app.region === "sidebar", bg, geo);
  return rect;
}

/**
 * After an explorer row's name, dimmed: a vault's name when it isn't its folder's (17.13), up to `nameEnd`; then, to
 * the right, ending at `describeEnd`, what describes the row (VV-D9) — a vault's branch, where a link points — where
 * there's room for it after the name, two spaces between, cut short with `…` when it doesn't fit whole.
 */
function drawDescribed(
  app: App,
  c: Canvas,
  at: { x: number; y: number; w: number },
  vaultName: string | undefined,
  describe: string | undefined,
  o: { nameEnd: number; describeEnd: number; bg: Color | null },
): void {
  const dim = { ...roleStyle(app.theme, "dim", o.bg), bg: o.bg };
  let after = at.w;
  if (vaultName && at.w + 1 < o.nameEnd) {
    const room = o.nameEnd - at.w - 1;
    after += 1 + drawText(c, at.x + at.w + 1, at.y, truncate(vaultName, room), dim, room);
  }
  if (!describe) return;
  const room = o.describeEnd - after - 2;
  if (room < Math.min(stringWidth(describe), 6)) return;
  const text = truncate(describe, room);
  const w = stringWidth(text);
  drawText(c, at.x + o.describeEnd - w, at.y, text, dim, w);
}

/** A one-row button: its text, the hover role under the mouse, a hot region for clicks. */
export function smallButton(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  text: string,
  id: string,
  geo: Geometry,
  bg: Color | null,
): number {
  const st =
    app.mouse.hover === id ? roleStyle(app.theme, "hover", bg) : { ...roleStyle(app.theme, "topbar_button", bg), bg };
  const w = drawText(c, x, y, text, st);
  geo.hot.push({ id, x, y, w, h: 1 });
  return w;
}

/** The history: the window's timeline, newest first, the current place marked `here`. */
function drawHistoryList(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
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

/**
 * The note's footnotes (3.17), the right panel's other view: each footnote — `[label]` and its
 * text, how many references it has at the right — and, unfolded under it, each reference with its
 * line. A footnote nothing refers to, or a reference with no definition, is marked. While the view
 * isn't focused, its selection follows the cursor.
 */
export function drawFootnotes(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  const title = RIGHT_VIEWS.find((v) => v.id === "footnotes")!.title;
  let rect = paneTitle(app, c, pane, title, app.region === "outline", base.bg);
  // Its title: a new footnote, at its right end (3.18).
  const add = ` ${app.glyphs.newNote} `;
  const ax = pane.x + pane.w - 1 - stringWidth(add);
  if (rect !== pane && ax >= pane.x + stringWidth(title) + 3)
    smallButton(app, c, ax, pane.y, add, "fn:add", geo, base.bg);
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.footnotes.rows();
  const o = app.outline;
  const g = app.glyphs;
  const hint = (row: (typeof rows)[number]) =>
    row.ref
      ? ""
      : row.fn.line === null
        ? "no definition"
        : row.fn.references.length
          ? `${row.fn.references.length}×`
          : "unused";
  const text = (row: (typeof rows)[number]) =>
    row.ref
      ? `   ${g.guideLast}${g.guideDash} ${row.text}`
      : ` ${row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " "} ${row.text}`;
  // Never scrolled sideways (as the history): a long row is cut, so its count stays in sight.
  const sv = sideView(rect, rows, () => "", o);
  rect = sv.list;
  const current = app.footnotes.current();
  if (app.region !== "outline" && current >= 0) o.selected = current;
  o.selected = Math.max(0, Math.min(o.selected, rows.length - 1));
  if (!o.pinned && o.selected < o.scroll) o.scroll = o.selected;
  if (!o.pinned && o.selected >= o.scroll + rect.h) o.scroll = o.selected - rect.h + 1;
  o.scroll = Math.max(0, Math.min(o.scroll, Math.max(0, rows.length - rect.h)));
  if (!rows.length) {
    drawText(
      c,
      rect.x + 1,
      rect.y,
      o.filter ? "no matches" : "no footnotes",
      roleStyle(theme, "dim", base.bg),
      rect.w - 1,
    );
    return rect;
  }
  for (let i = 0; i < rect.h; i++) {
    const idx = o.scroll + i;
    const row = rows[idx];
    if (!row) break;
    const y = rect.y + i;
    const selected = idx === o.selected && app.region === "outline";
    let role: Role = idx === current ? "sidebar_active" : row.ref ? "dim" : "sidebar";
    if (selected) role = "sidebar_selected";
    const st = roleStyle(theme, role, base.bg);
    if (selected) c.fill(rect.x, y, rect.w, 1, st.bg);
    const h = hint(row);
    const hw = h ? stringWidth(h) + 1 : 0;
    drawText(c, rect.x, y, truncate(sideRow(text(row), sv), Math.max(1, sv.cols - hw)), st, rect.w);
    if (h)
      drawText(
        c,
        rect.x + sv.cols - hw + 1,
        y,
        h,
        { ...roleStyle(theme, row.fn.line === null ? "warn" : "dim", st.bg), bg: st.bg },
        hw,
      );
  }
  paneScrollbar(app, c, rect, rows.length, o.scroll, "outline", app.region === "outline", base.bg, geo);
  sideHScrollbar(app, c, sv, "outline", app.region === "outline", base.bg, geo);
  return rect;
}

/** The outline; returns the rect its headings occupy (under the title). */
export function drawOutline(app: App, c: Canvas, pane: Rect, geo: Geometry): Rect {
  const theme = app.theme;
  const page = pageBg(theme);
  const base = roleStyle(theme, "sidebar", page);
  c.fill(pane.x, pane.y, pane.w, pane.h, base.bg);
  let rect = paneTitle(
    app,
    c,
    pane,
    RIGHT_VIEWS.find((v) => v.id === "outline")!.title,
    app.region === "outline",
    base.bg,
  );
  rect = filterRow(app, c, rect, app.outline, app.region === "outline", base.bg, geo);
  const rows = app.outlineView.rows();
  const lines = treeLines(rows.map((r) => r.level - 1));
  const o = app.outline;
  const g = app.glyphs;
  const text = (row: (typeof rows)[number]) => {
    const marker = row.hasChildren ? (row.folded ? g.foldClosed : g.foldOpen) : " ";
    return `${" ".repeat(1 + (row.level - 1) * 2)}${marker} ${row.text}`;
  };
  const sv = sideView(rect, rows, text, o);
  rect = sv.list;
  const current = app.outlineView.currentSection();
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
