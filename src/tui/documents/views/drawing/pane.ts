// Owner-local pane drawing: paneIsActive, drawPane.

import type { App, View, Tab } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../shell/screen/geometry.ts";
import type { Geometry } from "../../../shell/screen/geometry/contracts.ts";
import { pageBg, roleStyle } from "../../../shell/screen/style.ts";
import { button } from "../../../shell/screen/controls.ts";
import { drawWindowHeader } from "../draw-header.ts";
import { truncate, stringWidth, truncateStart } from "../../../../core/foundation/text/width.ts";
import { ordered } from "../../editing/cursor.ts";
import { type Problem, SEVERITIES, atLeast, worst } from "../../../../core/documents/diagnostics/diagnostics.ts";
import { snippetMark } from "../../editing/snippets.ts";
import { type Spot, spellSpots } from "../../diagnostics/spelling.ts";
import { gitSigns } from "../../../../core/workspace/git/gitsigns.ts";
import { codeBlocks } from "../code.ts";
import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { LENS_COUNTERS } from "../../../../core/rendering/layout/markdown/live.ts";
import { extentOf, scrolledCol, scrolledInSight } from "../../../../core/rendering/layout/ir.ts";
import { SEVERITY_ROLE, barRows, problemLines, problemMarks, severityGlyph } from "./marks/problems.ts";
import { commentLinksShown } from "./marks/links.ts";
import { SIGN_ROLE, gitGlyph, rowSign } from "./marks/git.ts";
import { codeMarks, drawLine, offsetMarks } from "./lines.ts";
import { drawHScrollbar, drawScrollbar } from "./chrome/scrollbars.ts";
import { drawCursor } from "./chrome/cursor.ts";
import { drawPictures } from "./pictures.ts";

function paneIsActive(app: App, view: View): boolean {
  // The floating editor, while it's open, is the only active window (3.20).
  if (app.floating) return app.floating.view === view;
  const t: Tab | null = app.tab;
  return !!t && t.views[t.active] === view;
}

/**
 * One window. `topRight`: the window at the top right, whose header carries the outline's
 * button when there's no right rail.
 */
export function drawPane(
  app: App,
  c: Canvas,
  view: View,
  rect: Rect,
  contentFocused: boolean,
  titled: boolean,
  ruleAbove: boolean,
  topRight: boolean,
  geo: Geometry,
): void {
  if (rect.w < 8 || rect.h < 1) return; // too small to draw a window (a tiny terminal)
  const theme = app.theme;
  const page = pageBg(theme);
  const active = paneIsActive(app, view);
  let body = rect;
  // The window header (HDR-D1, HDR-D3): between two rules, a split window's name, the breadcrumb, the mode's
  // buttons and ▤; none in zen, in a window under 8 rows or in the floating one.
  const header = app.ui.window_header && !app.ui.zen && rect.h >= 8 && app.floating?.view !== view;
  const typing = app.overlay?.kind === "prompt" && app.overlay.view === view ? app.overlay : null;
  {
    // The window's text size, set before anything lays it out: the header asks for the layout
    // first, and a layout at a stale size scrolls the view to fit it (a restored session lost its
    // place). The same arithmetic as the rows drawn below.
    let h = rect.h - (header ? (ruleAbove ? 2 : 3) : titled ? 1 : 0);
    // Its rows were the find row closed: what its pictures are fitted to (PIC), so opening find doesn't resize them.
    let whole = h;
    if ((typing || view.find) && h > 6) h -= typing?.replace ? 3 : 2;
    if (!app.ui.wrap && h > 3) h -= 1;
    if (!app.ui.wrap && whole > 3) whole -= 1;
    if (h > 0 && rect.w > 6) {
      view.height = h;
      view.pictureRows = whole;
      view.width = rect.w - 1;
    }
  }
  // The rows the find row (and its rule) take from the window, while it shows.
  let findRows = 0;
  if (header) {
    const y = drawWindowHeader(app, c, view, rect, { titled, ruleAbove, topRight, active }, geo);
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
      : f?.pending || rep?.pending
        ? "searching"
        : f?.error
          ? f.failed
            ? "search failed"
            : "not a regex"
          : rep
            ? rep.total
              ? `${rep.current + 1}/${rep.total}`
              : "no matches"
            : f?.matches.length
              ? `${f.current + 1}/${f.matches.length}${f.limited ? "+" : ""}`
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
    const toggles = [
      ["regex", " .* ", opts.regex],
      ["whole", " ab ", opts.whole],
      ["replace", " ⇄ ", !!rep],
    ] as const;
    for (const [id, label, on] of rep?.confirm ? [] : toggles) {
      if (!fits(rx - stringWidth(label) - 1)) break;
      rx -= stringWidth(label);
      button(
        app,
        c,
        rx,
        { y, h: 1 },
        label,
        on ? "topbar_button_on" : "topbar_button",
        `findopt:${id}:${index}`,
        geo,
        bg,
      );
      rx -= 1;
    }
    // The query in the room left of them.
    const px = drawText(c, body.x + 1, y, "› ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
    // A query longer than its room shows its end, where you type (…cut at the start).
    const fw = drawText(c, body.x + 1 + px, y, truncateStart(text, Math.max(1, rx - (body.x + 1 + px) - 2)), {
      ...roleStyle(theme, "text", bg),
      bg,
    });
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
        for (const [id, label] of [
          ["all", " all "],
          ["one", " replace "],
        ] as const) {
          if (!fits(bx - stringWidth(label) - 1)) break;
          bx -= stringWidth(label);
          button(app, c, bx, { y: ry, h: 1 }, label, "topbar_button", `findrep:${id}:${index}`, geo, bg);
          bx -= 1;
        }
      const qx = drawText(c, body.x + 1, ry, "⇄ ", { ...roleStyle(theme, "sidebar_dir", bg), bg });
      const rw = drawText(c, body.x + 1 + qx, ry, truncateStart(rep.text, Math.max(1, bx - (body.x + 1 + qx) - 2)), {
        ...roleStyle(theme, "text", bg),
        bg,
      });
      if (rep.focus && !rep.confirm) drawText(c, body.x + 1 + qx + rw, ry, " ", roleStyle(theme, "cursor", bg));
      rows = 2;
    }
    drawText(c, body.x, y + rows, app.glyphs.hbar.repeat(body.w), roleStyle(theme, "border", page), body.w);
    geo.rules.push({ y: y + rows, x0: body.x, x1: body.x + body.w });
    if (typing) geo.findInWindow = true;
    body = { ...body, y: y + rows + 1, h: body.h - rows - 1 };
    findRows = rows + 1;
  }
  // Wrapping off: the last row is the horizontal scrollbar's (kept even when the note fits, so
  // the text doesn't jump).
  const hbar = !app.ui.wrap && body.h > 3;
  if (hbar) body = { ...body, h: body.h - 1 };
  if (body.h <= 0 || body.w <= 6) return;
  view.height = body.h;
  view.pictureRows = body.h + findRows;
  // The last column is the scrollbar's; before it, the git signs' when they sit at the right edge (#22).
  const signsRight = app.views.signsRight(view);
  view.width = body.w - 1 - signsRight;
  const gutter = app.views.gutterWidth(view);
  const layout = app.views.layoutFor(view, view.width, gutter);
  // Readable width centres the text column in the pane.
  const free = view.width - gutter - layout.width - 1;
  const offset = app.ui.readable_width || app.ui.zen ? Math.max(0, Math.floor(free / 2)) : 0;
  const gutterX = body.x + 1 + offset;
  const textX = gutterX + gutter;
  geo.panes.push({ ...body, view, textX });

  const showCursor = active && contentFocused;
  const find = view.find;
  const underCursor = showCursor ? app.linking.linkUnderCursor(view) : -1;
  const cursorBg = app.ui.cursorline && showCursor ? (theme.roles.cursor_line.bg ?? null) : null;
  const sel = view.sel ? { range: ordered(view.sel.anchor, view.cur), line: view.sel.line } : null;
  const textW = Math.max(1, body.x + body.w - 1 - signsRight - textX);
  // Wrapping off: never scrolled past what this width can show (after a resize, say).
  view.left = app.ui.wrap ? 0 : Math.max(0, Math.min(view.left, Math.max(0, extentOf(layout) - textW)));
  const cursorSrc = layout.lines[view.cur.row]?.src;

  // The file's problems (19.8): by each source line they cover, and in the bar by the row that line starts on.
  const problems = app.problems.ofView(view);
  const onLine = problemLines(problems);
  const barW = app.views.barWidth(view);
  // A layout of its own (a diff) has no gutter: no lines of a file to number.
  const numbers = app.ui.line_numbers && !view.buf.drawn;
  const relative = app.config.ui.relative_numbers;
  const relativeNumbers = relative === "lens" || relative === "both";
  const sourceRelative = view.source && (relative === "source" || relative === "both");
  // Where each problem starts: the bar's sign there, or — beside line numbers, no bar — the number clicked.
  const barAt = barW || numbers ? barRows(layout, problems) : null;
  // A click on a sign (or a number) opens the Problems panel on the worst problem starting there.
  const clicked = (here: Problem[]) => {
    const top = [...here].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))[0]!;
    return `pbar:${top.start.line}:${top.start.column}`;
  };
  // The marks: the problems as bad as the level set, or worse (19.10).
  const level = app.ui.problem_marks;
  const markedOn =
    level === "off" ? new Map<number, Problem[]>() : problemLines(problems.filter((p) => atLeast(p.severity, level)));
  const marksOn = markedOn.size > 0;
  // The Problems panel's chosen problem, while it has the keys: marked whatever the level (1.7).
  const chosen = view === app.view ? app.problems.chosen() : undefined;
  const chosenOn = chosen ? problemLines([chosen]) : null;
  const links = commentLinksShown(view, app.isCodeDocument(view.buf));
  const brackets = app.views.bracketMarks(view);
  // A snippet's placeholder, untouched, at the stop the cursor is at (25.8): marked as selected, by its source line.
  const stop = snippetMark(app, view);
  const stopLines = new Map<number, { from: number; to: number }[]>();
  if (stop) {
    const starts = view.buf.lineStarts();
    for (
      let ln = starts.findLastIndex((s) => s <= stop[0]);
      ln >= 0 && starts[ln]! < Math.max(stop[1], stop[0] + 1);
      ln++
    ) {
      stopLines.set(ln + 1, [{ from: Math.max(0, stop[0] - starts[ln]!), to: stop[1] - starts[ln]! }]);
    }
  }
  // Misspelt words (25.6), by the row they show on.
  const misspelt = app.speller.misspelt(view);
  const spelling = new Map<number, Spot[]>();
  for (const s of misspelt ? spellSpots(layout, misspelt) : [])
    spelling.set(s.row, [...(spelling.get(s.row) ?? []), s]);
  let prevSrc = view.top > 0 ? (layout.lines[view.top - 1]?.src ?? -1) : -1;
  // The gutter (the problems bar, the line numbers) in a shade of its own down the window, a column of it before them;
  // its last column the page's, between it and the text.
  const gutterBg = (gutter && theme.roles.gutter.bg) || page;
  if (gutter && gutterBg !== page) c.fill(gutterX - 1, body.y, gutter, body.h, gutterBg);
  // Lines changed against what's staged (26.1), by line, signed where `[git] signs_at` puts them (#22): the gutter's
  // last column, against the text; its first, the window's margin before the problems bar and the line numbers (there
  // with or without a gutter); or the column kept at the window's right edge, by the scrollbar.
  const at = app.config.git.signs_at;
  const signX =
    at === "gutter_left"
      ? gutterX - 1
      : at === "window_right"
        ? signsRight
          ? body.x + body.w - 1 - signsRight
          : null
        : gutter
          ? gutterX + gutter - 1
          : null;
  const changes = signX === null ? null : app.git.changesOf(view);
  const signs = changes?.length ? gitSigns(changes) : null;
  const signBg = at === "gutter_left" ? gutterBg : page;
  // The rows shown: an oversized lens hides the ones outside its inner window (4.15).
  const shown = app.lens.screenRows(view, layout);
  const codeRows = codeBlocks(layout);
  const hidden = app.lens.hidden(view, layout);
  for (let i = 0; i < body.h; i++) {
    const row = shown[i];
    if (row === undefined) break;
    const line = layout.lines[row]!;
    const y = body.y + i;
    const isCursorRow = showCursor && row === view.cur.row;
    const band = isCursorRow ? cursorBg : null;
    if (band) c.fill(body.x, y, body.w - 1, 1, band);
    // The problems bar (19.9): on the row a line starts on, the worst problem's sign in its colour, and how many
    // start there when more than one.
    const here = barAt?.get(row);
    if (here && barW) {
      const n = here.length > 9 ? "+" : here.length > 1 ? String(here.length) : "";
      const w = drawText(c, gutterX, y, `${severityGlyph(app.glyphs, worst(here))}${n}`, {
        ...roleStyle(theme, SEVERITY_ROLE[worst(here)], page),
        bold: true,
        bg: band ?? gutterBg,
      });
      geo.hot.push({ id: clicked(here), x: gutterX, y, w, h: 1 });
    }
    if (numbers) {
      // A row the layout adds (the code view's blank between cells, a box's bottom, the lens's rules) has no number.
      const number = sourceRelative && line.src !== cursorSrc ? Math.abs(line.src - (cursorSrc ?? 1)) : line.src;
      const num = line.src !== prevSrc && !line.decor ? String(number).padStart(gutter - barW - 2) : "";
      // A line with problems: its number in the worst one's colour, bold; where one starts, clicked as a sign is.
      const on = onLine.get(line.src);
      const role: Role = on
        ? SEVERITY_ROLE[worst(on)]
        : line.src === cursorSrc && showCursor
          ? "line_number_current"
          : "line_number";
      if (num)
        drawText(c, gutterX + barW, y, num, {
          ...roleStyle(theme, role, page),
          ...(on ? { bold: true } : {}),
          bg: band ?? gutterBg,
        });
      if (here && !barW) geo.hot.push({ id: clicked(here), x: gutterX, y, w: gutter - 1, h: 1 });
    }
    // The git sign (26.1), in its column: a rendered row joining several lines takes their strongest. None on the blank
    // row between blocks, which carries the line above it but is no line of the note (#41).
    if (signs && signX !== null && !line.decor && !line.gap) {
      const at = rowSign(signs, line);
      if (at) {
        drawText(c, signX, y, gitGlyph(app.glyphs, at.sign), {
          ...roleStyle(theme, SIGN_ROLE[at.sign], page),
          bg: band ?? signBg,
        });
        // Clicked: the change, with Revert and Stage (GIT-D12).
        if (!view.buf.virtual) geo.hot.push({ id: `gsign:${at.src}`, x: signX, y, w: 1, h: 1 });
      }
    }
    if (!line.decor) prevSrc = line.src;
    const fill = line.fill ? theme.roles[line.fill].bg : undefined;
    if (fill && !band) c.fill(textX, y, Math.min(layout.width, textW), 1, fill);

    const marks: { from: number; to: number; role: Role }[] = [];
    if (find) {
      find.matches.forEach((m, k) => {
        if (m.row === row)
          marks.push({ from: m.col, to: m.col + m.len, role: k === find.current ? "link_focus" : "selection" });
      });
    }
    if (sel && row >= sel.range[0].row && row <= sel.range[1].row) {
      const from = sel.line || row !== sel.range[0].row ? 0 : sel.range[0].col;
      // While typing the cursor sits between characters: the one after the selection's end isn't in it (DF-D15).
      const to = sel.line || row !== sel.range[1].row ? 1e9 : sel.range[1].col + (view.insert ? 0 : 1);
      marks.push({ from, to, role: "selection" });
    }
    // Never on decoration (a code cell's header and borders, the lens's rules): they carry a line, not its text. (A
    // cell's padding never: marks go by a row's cells, and its cells are its text's.)
    if (marksOn && !line.decor)
      marks.push(...problemMarks(line, layout, markedOn, layout.lines[row + 1]?.src !== line.src));
    if (chosenOn && !line.decor)
      marks.push(...problemMarks(line, layout, chosenOn, layout.lines[row + 1]?.src !== line.src, "link_focus"));
    if (links) marks.push(...offsetMarks(line, links.get(line.src), false, "link"));
    if (brackets && !line.decor) marks.push(...offsetMarks(line, brackets.get(line.src), false, "bracket_match"));
    if (stop && !line.decor) marks.push(...offsetMarks(line, stopLines.get(line.src), false, "selection"));
    // Last: the first mark a cell has is the one drawn, so a find's match or the selection shows over a misspelt word.
    for (const s of spelling.get(row) ?? []) marks.push({ from: s.col, to: s.col + s.width, role: "spell" });
    // A code block that scrolls sideways on its own (`[render] code_wrap`): its code drawn from its offset, the rest
    // of the row where it is.
    const scroll = line.scroll && codeRows.byRow.has(row) ? line.scroll : undefined;
    const codeOff = scroll ? app.code.offset(view, layout, row) : 0;
    const clip = scroll && !scroll.part ? { ...scroll, off: codeOff } : undefined;
    drawLine(c, textX, y, line, textW, theme, band, page, underCursor, marks, view.left, clip);
    if (clip) codeMarks(app, c, textX - view.left, y, line, clip, band, page);
    // Its scrollbar, on its last row, under its code.
    if (scroll?.part === "bar" && scroll.total > scroll.w) {
      const r = { x: textX + scroll.x - view.left, y, w: scroll.w, h: 1 };
      const bg = band ?? (line.fill ? (theme.roles[line.fill].bg ?? page) : page);
      drawHScrollbar(app, c, r, scroll.total, codeOff, active, bg);
      geo.scrollbars.push({ ...r, view, total: scroll.total, horizontal: true, block: codeRows.byRow.get(row)!.key });
    }
    // The lens's counters (`[ui] relative_numbers`), in the column its rows keep free: each row's distance from the
    // cursor's, the cursor's 0 — every row a step of j and k, a wrapped line's too — so vim's counts read off them. In
    // the lens's accent; the cursor's in the current line's colour.
    if (relativeNumbers && line.lens === "source" && view.left === 0) {
      const current = row === view.cur.row;
      const n = String(Math.min(999, Math.abs(row - view.cur.row))).padStart(LENS_COUNTERS - 1);
      const tint = band ?? (line.fill ? theme.roles[line.fill].bg : undefined) ?? page;
      drawText(c, textX, y, n, {
        ...roleStyle(theme, current ? "line_number_current" : "lens", page),
        ...(current ? {} : { bold: false }),
        bg: tint,
      });
    }
    // A code cell's box (24.13): its borders over the row's spaces there; its header's buttons, each clickable.
    if (line.frame) {
      for (const fx of line.frame) {
        const x = textX + fx - view.left;
        if (x >= textX && x < textX + textW)
          drawText(c, x, y, app.glyphs.box.v, { ...roleStyle(theme, "cell_line", page), bg: band ?? page }, 1);
      }
    }
    if (line.spans.some((sp) => sp.button)) {
      let x = textX - view.left;
      for (const sp of line.spans) {
        const w = stringWidth(sp.text);
        if (sp.button && x >= textX && x + w <= textX + textW) {
          const id = `cell:${sp.button}`;
          if (app.mouse.hover === id) drawText(c, x, y, sp.text, roleStyle(theme, "hover", page));
          geo.hot.push({ id, x, y, w, h: 1 });
        }
        x += w;
      }
    }
    if (line.caption?.top) {
      const index = app.tab?.views.indexOf(view) ?? -1;
      let edge = textX + Math.min(layout.width, textW) - 1;
      for (const [action, letter] of [
        ["image", "i"],
        ["caption", "a"],
        ["path", "p"],
      ] as const) {
        const text = ` ${app.glyphs.cellCopy}${letter} `;
        const w = stringWidth(text);
        edge -= w;
        if (edge < textX + 1) break;
        const id = `caption:${index}:${row}:${action}`;
        const style = roleStyle(
          theme,
          app.mouse.hover === id ? "hover" : "image",
          theme.roles.picture_caption.bg ?? page,
        );
        drawText(c, edge, y, text, style);
        geo.hot.push({ id, x: edge, y, w, h: 1 });
      }
    }
    // An oversized lens's rules say how much of it is out of sight: ↑ above, ↓ below.
    if ((line.lens === "top" || line.lens === "bottom") && hidden.length) {
      const first = layout.lines.findIndex((l) => l.lens === "source");
      const n = hidden
        .filter(([a]) => (line.lens === "top" ? a === first : a !== first))
        .reduce((k, [a, b]) => k + b - a, 0);
      if (n) {
        const label = ` ${line.lens === "top" ? "↑" : "↓"} ${n} line${n === 1 ? "" : "s"} `;
        const x = textX + Math.max(0, Math.min(layout.width, textW) - stringWidth(label) - 2);
        drawText(c, x, y, label, { ...roleStyle(theme, view.insert ? "lens_edit" : "lens", page), bg: page });
      }
    }
    // In a scrolled code block's code, the cursor is where its character is drawn, if it's in sight: in a side by side
    // row's (GIT-D7), on its side.
    let shift = 0;
    let seen = view.cur.col >= view.left && view.cur.col < view.left + textW;
    let to = view.left + textW;
    if (clip && view.cur.col >= clip.x) {
      shift = view.cur.col - scrolledCol(clip, view.cur.col, clip.off);
      seen = scrolledInSight(clip, view.cur.col, clip.off);
      const right = clip.right !== undefined && view.cur.col >= clip.right;
      const between = clip.right !== undefined && !right && view.cur.col >= clip.x + clip.total;
      to = between ? Number.POSITIVE_INFINITY : (right ? clip.right! : clip.x) + clip.off + clip.w;
    }
    if (isCursorRow && seen) {
      if (!view.insert || !c.cursor) drawCursor(c, textX - view.left - shift, y, line, view.cur.col, theme, to);
      if (view === app.view) geo.cursor = { x: textX - view.left - shift + view.cur.col, y };
    }
  }
  if (c.image && app.pictures.now(view, layout)) drawPictures(app, c, view, layout, shown, body.y, textX, textW, geo);

  if (hbar) {
    const r = { x: textX, y: body.y + body.h, w: textW, h: 1 };
    c.fill(body.x, r.y, body.w, 1, page);
    if (extentOf(layout) > textW) {
      drawHScrollbar(app, c, r, extentOf(layout), view.left, active, page);
      geo.scrollbars.push({ ...r, view, total: extentOf(layout), horizontal: true });
    }
  }
  // Scrollbar in the last column.
  const total = layout.lines.length;
  if (total > body.h) {
    drawScrollbar(app, c, { x: body.x + body.w - 1, y: body.y, w: 1, h: body.h }, total, view.top, active, page);
    geo.scrollbars.push({ view, total, x: body.x + body.w - 1, y: body.y, w: 1, h: body.h });
  }
}
