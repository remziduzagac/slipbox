// Owner-local panels drawing: drawTree, drawCrumbs.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { roleStyle } from "../../../shell/screen/style.ts";
import type { Color, Role } from "../../../../core/rendering/theme/theme.ts";
import {
  stringWidth,
  truncate,
  splitAtWidth,
  graphemes,
  graphemeWidth,
} from "../../../../core/foundation/text/width.ts";
import { paneScrollbar } from "../../../documents/views/drawing/chrome/scrollbars.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import type { TreeRow } from "../explorer.ts";
import { INDEX_ROLE, indexGlyph } from "../marks.ts";
import { GIT_MARK } from "../../git/marks.ts";
import { marked } from "../../../shell/overlays/drawing/common/labels.ts";
import { match } from "../../../shell/overlays/match.ts";
import { drawGuides, treeLines } from "../../../shell/panels/drawing/tree.ts";
import { drawDescribed, sideHScrollbar, sideRow, sideView } from "../../../shell/panels/drawing/rows.ts";
import { followSelection } from "../../../shell/panels/drawing/selection.ts";
import { smallButton } from "../../../shell/panels/drawing/chrome.ts";

/** The explorer's tree (filtered while the filter holds text, its matches highlighted). */
export function drawTree(app: App, c: Canvas, list: Rect, bg: Color | null, geo: Geometry): Rect {
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
    // A row saying its folder is being listed, or why it couldn't be (T12): no icon, nothing to open.
    row.placeholder
      ? " "
      : row.root
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
  // Measured without the disk, which `Marks` reads for the rows drawn alone, never for every row of a big folder: the
  // index's column kept for a folder or a vault, nearly always marked, and a link the walk didn't go through; a file's
  // mark only the disk says (can't read, a broken link, too big) takes the last columns of a name as wide as the pane.
  const mayMark = (row: TreeRow) => row.kind !== "note" || !!row.link?.reason;
  const measured = (row: TreeRow) => `${text(row)}${" ".repeat(reserveOf(gitOf(row), mayMark(row)))}`;
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
    let role: Role = row.placeholder
      ? "dim"
      : row.root?.here
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
        fit: marks.fit,
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
 * The breadcrumb over the explorer (VV-D5): the folders down to the view, `~` for home, each a click away — the
 * vault open highlighted, a vault by its icon, the view bold — then, dimmed, those past the view it can zoom back
 * into. Too long, the folders at its start give way to `…`.
 */
export function drawCrumbs(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  w: number,
  bg: Color | null,
  geo: Geometry,
): void {
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
