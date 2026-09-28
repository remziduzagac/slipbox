// Editing in source mode (plan 4.3, 4.4; phase 3 step 3). The text is the buffer's `source`; a
// cursor is a place in it, found through the source layout's `srcMap` (every cell drawn knows the
// offset it shows). Insert mode types into it; the normal-mode commands (`i`, `o`, `x`, `u`…) are
// named commands in actions.ts that call in here.

import { graphemes } from "../core/width.ts";
import { type App, editable, type View } from "./app.ts";
import { cells } from "./cursor.ts";

/** The cursor's place in the text (a UTF-16 offset into `source`). Source mode only. */
export function offsetOf(app: App, view: View): number {
  // Lay out first: a motion that moved the lens (G, a search) left view.cur a row of the layout
  // before, and reading it against the new one lands somewhere else in the note.
  app.currentLayout(view);
  return offsetAtPos(app, view, view.cur);
}

/** The text offset of a layout position in a source-mode view. */
export function offsetAtPos(app: App, view: View, pos: { row: number; col: number }): number {
  const layout = app.currentLayout(view);
  const line = layout.lines[pos.row];
  const starts = view.buf.lineStarts();
  if (!line) return 0;
  // A rendered row (live preview, outside the lens): the start of its source line — never a guess
  // that could land an edit somewhere else.
  if (!line.srcMap) return starts[Math.max(0, Math.min(starts.length - 1, line.src - 1))] ?? 0;
  const cs = cells(line);
  const i = cs.findIndex((c) => c.x + c.w > pos.col);
  const within = i < 0 ? line.srcMap.end : line.srcMap.cells[i]!;
  return Math.min(view.buf.source.length, (starts[line.src - 1] ?? 0) + within);
}

/**
 * Put the cursor on offset `at`. `past` lets it sit just after a row's last character (insert
 * mode, `a`); otherwise it lands on a character, as in normal mode.
 */
export function placeAt(app: App, view: View, at: number, past = false): void {
  const layout = app.currentLayout(view);
  const starts = view.buf.lineStarts();
  at = Math.max(0, Math.min(at, view.buf.source.length));
  // The line holding `at`: the last start at or before it.
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  const src = lo + 1;
  const within = at - starts[lo]!;
  // A source row for that line (live preview has rendered rows and frame rows too).
  let row = layout.lines.findIndex((l) => l.src === src && l.srcMap);
  if (row < 0) row = layout.lines.findIndex((l) => l.src >= src && !l.decor);
  if (row < 0) row = Math.max(0, layout.lines.length - 1);
  // Among its wrapped rows, the one that holds it (a row's end belongs to the next row).
  while (layout.lines[row + 1]?.src === src && layout.lines[row + 1]?.srcMap && within >= (layout.lines[row]!.srcMap?.end ?? 0)) row++;
  const line = layout.lines[row]!;
  const cs = cells(line);
  const map = line.srcMap?.cells ?? [];
  let k = map.findIndex((o) => o >= within);
  let col: number;
  if (k < 0) {
    // After the row's last character: past it (insert), or on it (normal).
    const lastCell = cs[cs.length - 1];
    col = past || !lastCell ? (lastCell ? lastCell.x + lastCell.w : 0) : lastCell.x;
  } else {
    // A tab is several cells with one offset: the first of them.
    while (k > 0 && map[k - 1] === map[k]) k--;
    col = cs[k]?.x ?? 0;
  }
  view.cur = { row, col };
  view.goal = col;
  app.setCursorAnchor(view, layout);
}

/** The text of source line `src` (1-based), without its line ending. */
export function lineText(view: View, src: number): string {
  const starts = view.buf.lineStarts();
  const from = starts[src - 1] ?? 0;
  const next = starts[src];
  const text = view.buf.source.slice(from, next === undefined ? undefined : next - 1);
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

/** Where the line holding `at` starts, and where its text ends (before its line break). */
export function lineStart(view: View, at: number): number {
  return view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
}

export function lineEnd(view: View, at: number): number {
  const src = lineOf(view, at);
  return (view.buf.lineStarts()[src - 1] ?? 0) + lineText(view, src).length;
}

/** The source line (1-based) holding offset `at`. */
export function lineOf(view: View, at: number): number {
  const starts = view.buf.lineStarts();
  let n = 0;
  while (n + 1 < starts.length && starts[n + 1]! <= at) n++;
  return n + 1;
}

/** Why a buffer can't be edited, or null when it can. */
export function cannotEdit(view: View): string | null {
  if (view.buf.deleted) return `${view.buf.key} was deleted on disk`;
  if (view.buf.invalidUtf8) return `${view.buf.key} isn't valid UTF-8 — editing would change bytes it doesn't show`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Insert mode

/** Enter insert mode at offset `at` (switching the window to source first). */
export function startInsert(app: App, view: View, at: (v: View) => number, past = true): void {
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  if (!editable(view)) {
    const mode = app.editMode();
    app.setViewMode(view, mode);
    app.message("info", mode === "live" ? "the lens: editing the markdown around the cursor — esc esc closes it" : "source — editing the markdown");
  }
  view.sel = null;
  view.visual = null;
  const off = at(view);
  view.buf.beginStep(offsetOf(app, view));
  view.insert = true;
  placeAt(app, view, off, past);
}

/** Leave insert mode: the session is one undo step; the cursor steps back onto a character. */
export function stopInsert(app: App, view: View): void {
  if (!view.insert) return;
  view.insert = false;
  const at = offsetOf(app, view);
  view.buf.endStep(at);
  const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
  placeAt(app, view, at > start ? prevBoundary(view.buf.source, at) : at);
}

/** Type `text` at the cursor. */
export function insertText(app: App, view: View, text: string): void {
  const at = offsetOf(app, view);
  view.buf.edit(at, 0, text);
  placeAt(app, view, at + text.length, true);
}

/** The offset of the grapheme before `at` (a CRLF counts as one). */
export function prevBoundary(source: string, at: number): number {
  if (at <= 0) return 0;
  if (source[at - 1] === "\n" && source[at - 2] === "\r") return at - 2;
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const gs = graphemes(source.slice(lineStart, at));
  return at - (gs[gs.length - 1]?.length ?? 1);
}

/** The offset after the grapheme at `at`. */
export function nextBoundary(source: string, at: number): number {
  if (at >= source.length) return source.length;
  if (source[at] === "\r" && source[at + 1] === "\n") return at + 2;
  const end = source.indexOf("\n", at);
  const gs = graphemes(source.slice(at, end < 0 ? undefined : end));
  return at + (gs[0]?.length ?? 1);
}

/**
 * A new line after the cursor's text, carrying its indentation, and continuing a list: the same
 * bullet, the next number, an empty task box. On a list item with nothing after its marker, Enter
 * ends the list instead (the marker goes).
 */
export function newline(app: App, view: View): void {
  const at = offsetOf(app, view);
  const src = lineOf(view, at);
  const start = view.buf.lineStarts()[src - 1] ?? 0;
  const line = lineText(view, src);
  const before = line.slice(0, at - start);
  const m = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?/.exec(line);
  if (m && at - start >= m[0].length && !line.slice(m[0].length).trim()) {
    // An empty item: end the list.
    view.buf.edit(start, line.length, m[1]!);
    return placeAt(app, view, start + m[1]!.length, true);
  }
  let lead = /^\s*/.exec(before)![0];
  if (m && at - start >= m[0].length) {
    const marker = m[2] ?? `${Number(m[3]) + 1}${m[4]}`;
    lead = `${m[1]}${marker}${m[5]}${m[6] ? "[ ] " : ""}`;
  }
  insertText(app, view, view.buf.eol + lead);
}

/** Backspace: the grapheme before the cursor (a line break joins the lines). */
export function backspace(app: App, view: View): void {
  const at = offsetOf(app, view);
  if (at <= 0) return;
  const from = prevBoundary(view.buf.source, at);
  view.buf.edit(from, at - from, "");
  placeAt(app, view, from, true);
}

/** Delete: the grapheme at the cursor (at a line's end, the break). */
export function deleteForward(app: App, view: View, past = true): void {
  const at = offsetOf(app, view);
  const to = nextBoundary(view.buf.source, at);
  if (to === at) return;
  view.buf.edit(at, to - at, "");
  placeAt(app, view, at, past);
}

/** ctrl+w: back to the start of the word before the cursor (and the spaces after it). */
export function deleteWordBack(app: App, view: View): void {
  const at = offsetOf(app, view);
  const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
  const before = view.buf.source.slice(start, at);
  if (!before) return backspace(app, view);
  const m = /(\s*)([\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(before)!;
  const from = at - m[0].length;
  view.buf.edit(from, at - from, "");
  placeAt(app, view, from, true);
}

/** ctrl+u: back to the start of the line. */
export function deleteToLineStart(app: App, view: View): void {
  const at = offsetOf(app, view);
  const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
  if (at === start) return;
  view.buf.edit(start, at - start, "");
  placeAt(app, view, start, true);
}

/** Tab / shift+tab: indent or outdent the cursor's line by two spaces (markdown list nesting). */
export function indentLine(app: App, view: View, dir: 1 | -1): void {
  const at = offsetOf(app, view);
  const src = lineOf(view, at);
  const start = view.buf.lineStarts()[src - 1] ?? 0;
  if (dir === 1) {
    view.buf.edit(start, 0, "  ");
    return placeAt(app, view, at + 2, true);
  }
  const n = /^ {0,2}/.exec(lineText(view, src))![0].length;
  if (!n) return;
  view.buf.edit(start, n, "");
  placeAt(app, view, Math.max(start, at - n), true);
}

/** Keys in insert mode: text goes in; the arrows and friends move; esc leaves. */
export function insertKey(app: App, view: View, key: string): void {
  const typed = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
  switch (key) {
    case "escape":
    case "ctrl+c":
    case "ctrl+[":
      return stopInsert(app, view);
    case "enter":
      return newline(app, view);
    case "backspace":
    case "ctrl+h":
      return backspace(app, view);
    case "delete":
      return deleteForward(app, view);
    case "ctrl+w":
    case "ctrl+backspace":
    case "alt+backspace":
      return deleteWordBack(app, view);
    case "ctrl+u":
      return deleteToLineStart(app, view);
    case "tab":
      return indentLine(app, view, 1);
    case "shift+tab":
      return indentLine(app, view, -1);
    case "left": {
      const at = offsetOf(app, view);
      const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
      return placeAt(app, view, at > start ? prevBoundary(view.buf.source, at) : at, true);
    }
    case "right": {
      const at = offsetOf(app, view);
      const src = lineOf(view, at);
      const end = (view.buf.lineStarts()[src - 1] ?? 0) + lineText(view, src).length;
      return placeAt(app, view, at < end ? nextBoundary(view.buf.source, at) : at, true);
    }
    case "home": {
      const at = offsetOf(app, view);
      return placeAt(app, view, view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0, true);
    }
    case "end": {
      const src = lineOf(view, offsetOf(app, view));
      return placeAt(app, view, (view.buf.lineStarts()[src - 1] ?? 0) + lineText(view, src).length, true);
    }
    case "up":
    case "down": {
      // A row up or down (wrapped rows count), at the goal column, past the end allowed.
      const layout = app.currentLayout(view);
      const row = Math.max(0, Math.min(layout.lines.length - 1, view.cur.row + (key === "up" ? -1 : 1)));
      // Only onto rows of text: the lens's rules and the render beyond them stop it (normal mode moves on).
      if (!layout.lines[row]?.srcMap) return;
      const cs = cells(layout.lines[row]);
      const last = cs[cs.length - 1];
      const endCol = last ? last.x + last.w : 0;
      const col = Math.min(view.goal, endCol);
      const goal = view.goal;
      view.cur = { row, col: cs.find((c) => c.x + c.w > col)?.x ?? endCol };
      app.setCursorAnchor(view, layout);
      view.goal = goal;
      return;
    }
  }
  if (typed !== null) insertText(app, view, typed);
}
