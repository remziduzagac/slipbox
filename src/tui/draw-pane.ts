// Drawing a window: the note's rows — each line's text, its marks (find, selection, spelling, problems, brackets),
// its code scrolled sideways — the gutter and its signs, the problems bar, pictures, the cursor, the scrollbars, and
// the completion and signature popups at the cursor.

import type { App, View, Tab } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Rect, type Geometry, pageBg, roleStyle, button, markStyle } from "./draw.ts";
import { drawWindowHeader } from "./draw-header.ts";
import { truncate, stringWidth, truncateStart, graphemes, graphemeWidth } from "../core/width.ts";
import { ordered, cells } from "./cursor.ts";
import { type Problem, type Severity, SEVERITIES, atLeast, worst } from "../core/diagnostics.ts";
import { snippetMark } from "./snippets.ts";
import { type Spot, spellSpots } from "./spelling.ts";
import { type GitSign, gitSigns } from "../core/gitsigns.ts";
import { codeBlocks } from "./code.ts";
import type { Role, Color, Theme } from "../core/theme/theme.ts";
import { LENS_COUNTERS } from "../core/layout/live.ts";
import { sanitize } from "../core/sanitize.ts";
import type { Glyphs } from "../core/glyphs.ts";
import { type CodeScroll, type Line, type Layout, scrolledCol, scrolledInSight } from "../core/layout/ir.ts";
import type { CommentLink } from "../core/syntax.ts";
import { DRAWING_ROWS } from "./pictures.ts";
import { spanStyle } from "../core/layout/style.ts";

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
    if ((typing || view.find) && h > 6) h -= typing?.replace ? 3 : 2;
    if (!app.ui.wrap && h > 3) h -= 1;
    if (h > 0 && rect.w > 6) {
      view.height = h;
      view.width = rect.w - 1;
    }
  }
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
  }
  // Wrapping off: the last row is the horizontal scrollbar's (kept even when the note fits, so
  // the text doesn't jump).
  const hbar = !app.ui.wrap && body.h > 3;
  if (hbar) body = { ...body, h: body.h - 1 };
  if (body.h <= 0 || body.w <= 6) return;
  view.height = body.h;
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
  view.left = app.ui.wrap ? 0 : Math.max(0, Math.min(view.left, Math.max(0, layout.width - textW)));
  const cursorSrc = layout.lines[view.cur.row]?.src;

  // The file's problems (19.8): by each source line they cover, and in the bar by the row that line starts on.
  const problems = app.problems.ofView(view);
  const onLine = problemLines(problems);
  const barW = app.views.barWidth(view);
  // A layout of its own (a diff) has no gutter: no lines of a file to number.
  const numbers = app.ui.line_numbers && !view.buf.drawn;
  const relativeNumbers = app.config.ui.relative_numbers === "lens";
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
      const num = line.src !== prevSrc && !line.decor ? String(line.src).padStart(gutter - barW - 2) : "";
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
      drawCursor(c, textX - view.left - shift, y, line, view.cur.col, theme, to);
      if (view === app.view) geo.cursor = { x: textX - view.left - shift + view.cur.col, y };
    }
  }
  if (c.image && view.left === 0 && app.pictures.now(view)) drawPictures(c, layout, shown, body.y, textX, textW);

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
export function paneScrollbar(
  app: App,
  c: Canvas,
  rect: Rect,
  total: number,
  top: number,
  pane: "sidebar" | "outline",
  active: boolean,
  bg: Color | null,
  geo: Geometry,
): void {
  if (total <= rect.h || rect.h < 2) return;
  const bar = { x: rect.x + rect.w - 1, y: rect.y, w: 1, h: rect.h };
  drawScrollbar(app, c, bar, total, top, active, bg);
  geo.scrollbars.push({ ...bar, pane, total });
}

/** The horizontal scrollbar: a `▄` track with a `▄` thumb for `total` columns from `left`. */
export function drawHScrollbar(
  app: App,
  c: Canvas,
  r: Rect,
  total: number,
  left: number,
  active: boolean,
  bg: Color | null,
): void {
  const theme = app.theme;
  const thumb = Math.max(2, Math.round((r.w * r.w) / total));
  const pos = Math.round((left / Math.max(1, total - r.w)) * (r.w - thumb));
  const st = { ...roleStyle(theme, active ? "scrollbar" : "border", bg), bg };
  const track = { ...roleStyle(theme, "scrollbar_track", bg), bg };
  const trackGlyph = theme.roles.scrollbar_track.fg ? app.glyphs.hScrollTrack : " ";
  drawText(c, r.x, r.y, trackGlyph.repeat(r.w), track, r.w);
  drawText(c, r.x + pos, r.y, app.glyphs.hScrollThumb.repeat(thumb), st, thumb);
}

/** Completion's popup (19.16): up to ten items under the cursor (above it when there's no room), the chosen one marked, each item's detail dimmed beside it. */
export function drawCompletion(app: App, c: Canvas, at: { x: number; y: number }, top: number, bottom: number): Rect {
  const comp = app.completion!;
  const theme = app.theme;
  const rows = Math.min(10, comp.shown.length);
  const first = Math.max(0, Math.min(comp.selected - rows + 1, comp.shown.length - rows));
  const items = comp.shown
    .slice(first, first + rows)
    .map((i) => ({ label: sanitize(i.label), detail: sanitize(i.detail ?? i.labelDetails?.description ?? "") }));
  const labelW = Math.min(40, Math.max(...items.map((i) => stringWidth(i.label))));
  const detailW = Math.min(30, Math.max(0, ...items.map((i) => stringWidth(i.detail))));
  const w = Math.min(c.width, labelW + (detailW ? detailW + 2 : 0) + 2);
  const y0 = at.y + 1 + rows <= bottom ? at.y + 1 : Math.max(top, at.y - rows);
  const x0 = Math.max(0, Math.min(at.x, c.width - w));
  items.forEach((item, k) => {
    const chosen = first + k === comp.selected;
    const st = roleStyle(theme, chosen ? "overlay_selected" : "overlay", null);
    c.fill(x0, y0 + k, w, 1, st.bg);
    drawText(c, x0 + 1, y0 + k, truncate(item.label, labelW), st, labelW);
    if (detailW && item.detail)
      drawText(
        c,
        x0 + 1 + labelW + 2,
        y0 + k,
        truncate(item.detail, detailW),
        { ...roleStyle(theme, "overlay_dim", st.bg), bg: st.bg },
        detailW,
      );
  });
  return { x: x0, y: y0, w, h: rows };
}

/** The signature being typed (19.16): one line above the cursor, its active parameter marked. */
export function drawSignature(app: App, c: Canvas, at: { x: number; y: number }, top: number): void {
  const sig = app.signature!;
  const theme = app.theme;
  const label = sanitize(sig.label);
  const w = Math.min(c.width, stringWidth(label) + 2);
  const y = at.y - 1 >= top ? at.y - 1 : at.y + 1;
  const x = Math.max(0, Math.min(at.x, c.width - w));
  const st = roleStyle(theme, "overlay", null);
  c.fill(x, y, w, 1, st.bg);
  if (!sig.active) return void drawText(c, x + 1, y, label, st, w - 2);
  // The parameter's offsets are the server's label's: each part sanitized on its own.
  const [a, b] = sig.active;
  let px = x + 1;
  px += drawText(c, px, y, sanitize(sig.label.slice(0, a)), st);
  px += drawText(c, px, y, sanitize(sig.label.slice(a, b)), {
    ...roleStyle(theme, "overlay_match", st.bg),
    bg: st.bg,
    bold: true,
  });
  drawText(c, px, y, sanitize(sig.label.slice(b)), st, Math.max(0, x + w - 1 - px));
}

/** Each severity's sign, in the glyph set in use: beside its line (the problems bar) and on the status line. */
export function severityGlyph(g: Glyphs, s: Severity): string {
  return s === "error"
    ? g.problemError
    : s === "warning"
      ? g.problemWarn
      : s === "info"
        ? g.problemInfo
        : g.problemHint;
}

/** A git sign's colour (26.1): roles of their own (#22), softer than the explorer's new and modified files' colours. */
const SIGN_ROLE: Record<GitSign, Role> = {
  add: "git_sign_add",
  change: "git_sign_change",
  delete: "git_sign_delete",
  topdelete: "git_sign_delete",
};
const SIGN_RANK: Record<GitSign, number> = { change: 3, add: 2, delete: 1, topdelete: 1 };

function gitGlyph(g: Glyphs, s: GitSign): string {
  return s === "add" ? g.gitAdd : s === "change" ? g.gitChange : s === "delete" ? g.gitDelete : g.gitTopDelete;
}

/** A row's sign: its line's, or (a rendered row joining several) the strongest of theirs. */
function rowSign(signs: Map<number, GitSign>, line: Line): { sign: GitSign; src: number } | undefined {
  let best: { sign: GitSign; src: number } | undefined;
  for (const src of new Set([line.src, ...line.spans.flatMap((s) => (s.src === undefined ? [] : [s.src]))])) {
    const s = signs.get(src);
    if (s && (!best || SIGN_RANK[s] > SIGN_RANK[best.sign])) best = { sign: s, src };
  }
  return best;
}

/** Each severity's colour, in the bar, the line numbers and the status line. */
export const SEVERITY_ROLE: Record<Severity, Role> = {
  error: "error",
  warning: "warn",
  info: "info",
  hint: "status_dim",
};
/** Each severity's mark over the text (19.10); a syntax error keeps its own role (16.9). */
export const MARK_ROLE: Record<Severity, Role> = {
  error: "problem_error",
  warning: "problem_warn",
  info: "problem_info",
  hint: "problem_info",
};

/** Problems by each source line they cover (a long one's first 200). */
function problemLines(problems: Problem[]): Map<number, Problem[]> {
  const out = new Map<number, Problem[]>();
  for (const p of problems) {
    for (let l = p.start.line; l <= Math.min(p.end.line, p.start.line + 200); l++)
      out.set(l, [...(out.get(l) ?? []), p]);
  }
  return out;
}

/** Each source line's first row in a layout: where the bar counts its problems. */
const firstRowCache = new WeakMap<Layout, Map<number, number>>();
function firstRows(layout: Layout): Map<number, number> {
  let m = firstRowCache.get(layout);
  if (m) return m;
  m = new Map();
  layout.lines.forEach((line, row) => {
    if (line.decor) return;
    if (!m!.has(line.src)) m!.set(line.src, row);
    for (const span of line.spans)
      if (span.src !== undefined && span.text.trim() && !m!.has(span.src)) m!.set(span.src, row);
  });
  firstRowCache.set(layout, m);
  return m;
}

/** The bar's problems by row: each at the first row of its line, or of the next line drawn (a line the
 *  rendered view doesn't show, as a blank one between blocks). */
function barRows(layout: Layout, problems: Problem[]): Map<number, Problem[]> {
  const first = firstRows(layout);
  const out = new Map<number, Problem[]>();
  for (const p of problems) {
    let row = first.get(p.start.line);
    if (row === undefined) row = layout.lines.findIndex((l) => !l.decor && l.src >= p.start.line);
    if (row >= 0) out.set(row, [...(out.get(row) ?? []), p]);
  }
  return out;
}

/**
 * Where a row's problems are, to underline (19.10). A source row knows each cell's offset: the span
 * itself. A rendered one knows each span's line: a link's problem marks the link as drawn, any other
 * the text that came from its lines.
 */
function problemMarks(
  line: Line,
  layout: Layout,
  onLine: Map<number, Problem[]>,
  lastRow: boolean,
  as?: Role,
): { from: number; to: number; role: Role }[] {
  const out: { from: number; to: number; role: Role }[] = [];
  const role = (p: Problem): Role => as ?? (p.source === "syntax" ? "syntax_error" : MARK_ROLE[p.severity]);
  if (line.srcMap) {
    for (const p of onLine.get(line.src) ?? []) {
      const from = line.src === p.start.line ? p.start.column - 1 : 0;
      const to = line.src === p.end.line ? Math.max(p.end.column - 1, from + 1) : Number.POSITIVE_INFINITY;
      out.push(...offsetMarks(line, [{ from, to }], lastRow, role(p)));
    }
    return out;
  }
  let x = 0;
  for (const span of line.spans) {
    const w = stringWidth(span.text);
    const src = span.src ?? line.src;
    const link = span.link !== undefined ? layout.links[span.link] : undefined;
    for (const p of onLine.get(src) ?? []) {
      const hit =
        p.target !== undefined
          ? link !== undefined && link.src === p.start.line && link.target === p.target
          : span.text.trim() !== "";
      if (hit) out.push({ from: x, to: x + w, role: role(p) });
    }
    x += w;
  }
  return out;
}

/** A source file's links in comments by line (16.10), for the text as it is now: in source mode, and on the code
 *  view's rows of code (a note beside code, a comment kept as written; its prose has them as links of its own). */
function commentLinksShown(view: View, code: boolean): Map<number, CommentLink[]> | null {
  const syn = view.buf.syntax;
  if (!(view.source || code) || !syn?.links.length || syn.version !== view.buf.version) return null;
  const out = new Map<number, CommentLink[]>();
  for (const l of syn.links) out.set(l.line, [...(out.get(l.line) ?? []), l]);
  return out;
}

/**
 * The columns of one row that source ranges (UTF-16 offsets in its line) cover. One past the
 * line's end (an error's missing `)`) marks the last cell, on the line's last row.
 */
function offsetMarks(
  line: Line,
  ranges: { from: number; to: number }[] | undefined,
  lastRow: boolean,
  role: Role,
): { from: number; to: number; role: Role }[] {
  if (!ranges || !line.srcMap) return [];
  const cs = cells(line);
  const out: { from: number; to: number; role: Role }[] = [];
  for (const e of ranges) {
    const hit = cs.filter((k) => k.at! >= e.from && k.at! < e.to);
    if (hit.length) out.push({ from: hit[0]!.x, to: hit[hit.length - 1]!.x + hit[hit.length - 1]!.w, role });
    else if (lastRow && e.from >= line.srcMap.end && cs.length)
      out.push({ from: cs[cs.length - 1]!.x, to: cs[cs.length - 1]!.x + cs[cs.length - 1]!.w, role });
  }
  return out;
}

/**
 * A note's pictures (12.x), over the blank rows the layout keeps for them: each from its first row on screen — one whose
 * top is scrolled away (up to DRAWING_ROWS rows back, the tallest a picture is), cut there — to its last on screen.
 */
function drawPictures(c: Canvas, layout: Layout, shown: number[], top: number, x: number, textW: number): void {
  for (let i = 0; i < shown.length; i++) {
    const row = shown[i]!;
    let start = row;
    let pic = layout.lines[row]?.image;
    if (!pic && i === 0)
      for (let k = 1; k < DRAWING_ROWS && row - k >= 0; k++) {
        const p = layout.lines[row - k]?.image;
        if (!p) continue;
        if (row - k + p.rows > row) [start, pic] = [row - k, p];
        break;
      }
    if (!pic) continue;
    const skip = row - start;
    let rows = 0;
    while (i + rows < shown.length && rows < pic.rows - skip && shown[i + rows] === row + rows) rows++;
    // Where its row's text starts: past a list's indent, a quote's bar, an embedded note's (12.14).
    const at = layout.lines[start]!.spans.reduce((w, s) => w + stringWidth(s.text), 0);
    c.image!(x + at, top + i, Math.min(pic.cols, textW - at), rows, pic.src, { skip, total: pic.rows });
    i += rows - 1;
  }
}

/** A scrollbar: a `▐` track with a `▐` thumb sized and placed for `total` rows from `top`. */
function drawScrollbar(
  app: App,
  c: Canvas,
  r: Rect,
  total: number,
  top: number,
  active: boolean,
  bg: Color | null,
): void {
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

/**
 * The block cursor on its character, drawn with the cursor role (inverse without colour); a wide one
 * at the last column (`end`) shows as one cell.
 */
function drawCursor(
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  col: number,
  theme: Theme,
  end = Number.POSITIVE_INFINITY,
): void {
  const st = roleStyle(theme, "cursor", null);
  const cell = cells(line).find((k) => k.x === col);
  // A tab is one stop several columns wide: the cursor sits on its first column.
  if (cell && cell.g === "\t") c.cell(x + cell.x, y, " ", 1, st);
  else if (cell && cell.x + cell.w <= end) c.cell(x + cell.x, y, cell.g, cell.w, st);
  else c.cell(x + col, y, " ", 1, st);
}

/** A code block that scrolls sideways, on one of its code rows: its code from column `x`, drawn from `off` columns in,
 *  `w` columns of it; side by side (GIT-D7), its second text from `right` the same. */
type CodeClip = CodeScroll & { off: number };

/**
 * Draw one layout row from column `left` (wrapping off, scrolled sideways), `maxW` columns of it.
 * `marks` override styles by column range; the link under the cursor too. `clip`: a code block's row scrolled on its
 * own — its code drawn `clip.off` columns to the left, inside its `clip.w` columns, what's before and after it hidden.
 */
function drawLine(
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  maxW: number,
  theme: Theme,
  band: Color | null,
  page: Color | null,
  focusLink: number,
  marks: { from: number; to: number; role: Role }[],
  left = 0,
  clip?: CodeClip,
): void {
  let col = 0;
  const end = left + maxW;
  const fillBg = line.fill ? theme.roles[line.fill].bg : undefined;
  for (const span of line.spans) {
    if (col >= end && !clip) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    // The cursor-row band replaces the page and the block's fill, never a span's own background;
    // off the cursor row, text keeps its block's fill (a code block's text on its background).
    if (band && (!st.bg || st.bg === fillBg)) st.bg = band;
    else if (!st.bg) st.bg = page;
    if (!marks.length && !left && !clip) {
      const w = drawText(c, x + col, y, span.text, st, maxW - col);
      if (w < stringWidth(span.text)) return; // cut at the edge (a wide character that didn't fit)
      col += w;
      continue;
    }
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      // Where it's drawn: in a scrolled code block's code, `off` columns to the left; scrolled out of it, not at all.
      let at = col;
      if (clip && col >= clip.x && clip.right !== undefined) {
        // Side by side (GIT-D7): each text from the one offset, what's fixed between them where it is.
        const first = scrolledInSight(clip, col, clip.off);
        const last = scrolledInSight(clip, col + w - 1, clip.off);
        if (!first || !last) {
          // A wide character cut by a text's left edge shows as a blank.
          if (!first && last) c.cell(x + scrolledCol(clip, col + w - 1, clip.off) - left, y, " ", 1, st);
          col += w;
          continue;
        }
        at = scrolledCol(clip, col, clip.off);
      } else if (clip && col >= clip.x) {
        const from = clip.x + clip.off;
        if (col < from) {
          // A wide character cut by the block's left edge shows as a blank.
          if (col + w > from) c.cell(x + clip.x - left, y, " ", 1, st);
          col += w;
          continue;
        }
        if (col + w > from + clip.w) return;
        at = col - clip.off;
      }
      if (at + w > end) return;
      // A wide character cut by the left edge shows as a blank.
      if (at < left) {
        if (at + w > left) c.cell(x, y, " ", 1, st);
        col += w;
        continue;
      }
      const mark = marks.find((m) => col >= m.from && col < m.to);
      const cell = mark ? { ...st, ...markStyle(theme, mark.role) } : st;
      if (w > 0) c.cell(x + at - left, y, g, w, cell);
      col += w;
    }
  }
}

/**
 * A scrolled code block's row: `‹` in its gutter while text of the row is hidden to the left, `›` in its right margin
 * while some is to the right. `x` is the screen column of the row's column 0.
 */
function codeMarks(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  clip: CodeClip,
  band: Color | null,
  page: Color | null,
): void {
  const fill = line.fill ? app.theme.roles[line.fill].bg : undefined;
  const st = { ...roleStyle(app.theme, "code_gutter", page), bg: band ?? fill ?? page };
  // Each text's own: one, or side by side (GIT-D7) two, the second drawn `total - w` columns to the left.
  const texts =
    clip.right === undefined
      ? [{ from: clip.x, to: Number.POSITIVE_INFINITY, at: clip.x }]
      : [
          { from: clip.x, to: clip.x + clip.total, at: clip.x },
          { from: clip.right, to: Number.POSITIVE_INFINITY, at: clip.right - (clip.total - clip.w) },
        ];
  for (const t of texts) {
    const text = cells(line).filter((k) => k.x >= t.from && k.x < t.to && !/^\s$/.test(k.g));
    if (!text.length) continue;
    if (text[0]!.x < t.from + clip.off) drawText(c, x + t.at - 1, y, app.glyphs.codeLeft, st, 1);
    const last = text[text.length - 1]!;
    if (last.x + last.w > t.from + clip.off + clip.w) drawText(c, x + t.at + clip.w, y, app.glyphs.codeRight, st, 1);
  }
}
