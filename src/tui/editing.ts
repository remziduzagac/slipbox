// Editing in source mode (plan 4.3, 4.4; phase 3 step 3). The text is the buffer's `source`; a
// cursor is a place in it, found through the source layout's `srcMap` (every cell drawn knows the
// offset it shows). Insert mode types into it; the normal-mode commands (`i`, `o`, `x`, `u`…) are
// named commands in actions.ts that call in here.

import { graphemes } from "../core/width.ts";
import { type App, editable, type View } from "./app.ts";
import { cells } from "./cursor.ts";
import { keyChar } from "./keys.ts";

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
  const within = i < 0 ? line.srcMap.end : cs[i]!.at!;
  return Math.min(view.buf.source.length, (starts[line.src - 1] ?? 0) + within);
}

/**
 * Put the cursor on offset `at`. `past` lets it sit just after a row's last character (insert
 * mode, `a`); otherwise it lands on a character, as in normal mode.
 */
export function placeAt(app: App, view: View, at: number, past = false, again = false): void {
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
  if (row < 0 && view.live && !again) {
    // Outside the lens: the rendered row of the block holding the line becomes the cursor's, so
    // the lens opens there — then the line has a source row to land on (never a rendered one,
    // where an edit would go to a line's start or into the next block).
    const holder = layout.lines.findLastIndex((l) => l.src <= src && !l.decor);
    if (holder >= 0) {
      view.cur = { row: holder, col: 0 };
      app.setCursorAnchor(view, layout);
      return placeAt(app, view, at, past, true);
    }
  }
  if (row < 0) row = layout.lines.findLastIndex((l) => l.src <= src && !l.decor);
  if (row < 0) row = Math.max(0, layout.lines.length - 1);
  // Among its wrapped rows, the one that holds it (a row's end belongs to the next row).
  while (layout.lines[row + 1]?.src === src && layout.lines[row + 1]?.srcMap && within >= (layout.lines[row]!.srcMap?.end ?? 0)) row++;
  const line = layout.lines[row]!;
  const cs = cells(line);
  const k = line.srcMap ? cs.findIndex((c) => c.at! >= within) : -1;
  let col: number;
  if (k < 0) {
    // After the row's last character: past it (insert), or on it (normal).
    const lastCell = cs[cs.length - 1];
    col = past || !lastCell ? (lastCell ? lastCell.x + lastCell.w : 0) : lastCell.x;
  } else col = cs[k]!.x;
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
export function cannotEdit(view: Pick<View, "buf">): string | null {
  if (view.buf.deleted) return `${view.buf.key} was deleted on disk`;
  if (view.buf.invalidUtf8) return `${view.buf.key} isn't valid UTF-8 — editing would change bytes it doesn't show`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Insert mode

/**
 * An editing key on a rendered window switches it to editing (`[editor] edit_in`). To source mode: the key goes on and
 * edits. To the lens: the lens opens on the cursor's block as written, and the key's second press edits — as `esc esc`
 * leaves, the editing first, then the lens. True when the key goes on to edit.
 */
export function toEditing(app: App, view: View): boolean {
  if (editable(view)) return true;
  const mode = app.editMode(view);
  app.setViewMode(view, mode);
  const what = view.buf.kind.group === "text" ? "code" : "markdown";
  if (mode === "live") {
    app.message("info", `the lens: the ${what} around the cursor — the key again edits it, esc closes it`);
    return false;
  }
  app.message("info", `source — editing the ${view.buf.kind.group === "note" ? "markdown" : "file"}`);
  return true;
}

/** Enter insert mode at offset `at` (switching the window to editing first: the lens's first press only opens it). */
export function startInsert(app: App, view: View, at: (v: View) => number, past = true): void {
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  if (!toEditing(app, view)) return;
  view.sel = null;
  view.visual = null;
  const off = at(view);
  view.buf.beginStep(offsetOf(app, view));
  view.insert = true;
  placeAt(app, view, off, past);
  view.insertFrom = offsetOf(app, view);
}

/**
 * Where ctrl+u and ctrl+w stop first (vim's rule): the insert's start, when it is on this line
 * before the cursor. Once reached, it's spent — the next one goes on to the line's start.
 */
function insertStop(view: View, lineStart: number, at: number): number {
  const s = view.insertFrom;
  // After only indentation (cc, o keep it), the insert's start is the line's: the indent goes too.
  if (s !== undefined && s > lineStart && s < at && view.buf.source.slice(lineStart, s).trim()) return s;
  return lineStart;
}

/** Leave insert mode: the session is one undo step; the cursor steps back onto a character. */
export function stopInsert(app: App, view: View): void {
  if (!view.insert) return;
  view.insert = false;
  // Completion's popup and the signature are typing's (19.16).
  app.completion = null;
  app.signature = null;
  const at = offsetOf(app, view);
  view.buf.lastInsert = at; // gi comes back here
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
  // A list item continues — but not inside a code block (a diff's + lines, a - in YAML), and not
  // on a thematic break (* * *), which only looks like a bullet.
  const listy = !inFence(view, src) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  const m = listy ? /^(\s*)(?:([-*+])|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?/.exec(line) : null;
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
  // The last line of a note with no final newline (or an empty note): the new line gets a line
  // ending too, or it would be no line at all and typing would land on the line before.
  if (at === view.buf.source.length && !view.buf.source.endsWith("\n")) {
    view.buf.edit(at, 0, view.buf.eol + lead + view.buf.eol);
    return placeAt(app, view, at + view.buf.eol.length + lead.length, true);
  }
  insertText(app, view, view.buf.eol + lead);
}

/** Whether source line `src` (1-based) is inside a fenced code block: the fences above it, counted. */
function inFence(view: View, src: number): boolean {
  let fence: string | null = null;
  for (let n = 1; n < src; n++) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(lineText(view, n));
    if (!f) continue;
    if (!fence) fence = f[1]!;
    else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
  }
  return fence !== null;
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
  // The word before the cursor and the spaces after it — not the space before it (vim, readline).
  const m = /([\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(before)!;
  const stop = insertStop(view, start, at);
  const from = Math.max(at - m[0].length, stop);
  if (from === stop) view.insertFrom = undefined;
  view.buf.edit(from, at - from, "");
  placeAt(app, view, from, true);
}

/** ctrl+u: what was typed on this line; again, the rest before the cursor; at its start, a join. */
export function deleteToLineStart(app: App, view: View): void {
  const at = offsetOf(app, view);
  const start = view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0;
  if (at === start) return backspace(app, view);
  const from = insertStop(view, start, at);
  view.insertFrom = undefined;
  view.buf.edit(from, at - from, "");
  placeAt(app, view, from, true);
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
  insertKeyNow(app, view, key);
  // Moving the cursor starts the insert again there, as vim's does: ctrl+u and ctrl+w stop at it.
  if (view.insert && (MOVING.has(key) || WORD_KEYS[key])) view.insertFrom = offsetOf(app, view);
}

/** Typing's moves: the arrows, home and end — and macOS's cmd+arrows, cmd+← / cmd+→ arriving as ctrl+a / ctrl+e. */
const MOVING = new Set(["left", "right", "up", "down", "home", "end", "cmd+left", "cmd+right", "ctrl+a", "ctrl+e", "cmd+up", "cmd+down"]);

/** Typing, by words: ctrl+← / ctrl+→, alt+← / alt+→ (macOS's option+arrows), alt+b / alt+f (what its terminals send). */
const WORD_KEYS: Record<string, -1 | 1> = { "ctrl+left": -1, "alt+left": -1, "alt+b": -1, "ctrl+right": 1, "alt+right": 1, "alt+f": 1 };

/** A word back (to its start) or forward (to its end) from `at`, across lines: a run of letters and digits, or of
 *  other marks, past the spaces before it. */
function wordFrom(text: string, at: number, dir: -1 | 1): number {
  if (dir < 0) return at - /(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(text.slice(0, at))![0].length;
  return at + /^\s*(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?/u.exec(text.slice(at))![0].length;
}

function insertKeyNow(app: App, view: View, key: string): void {
  const typed = keyChar(key);
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
    case "home":
    case "cmd+left":
    case "ctrl+a": {
      const at = offsetOf(app, view);
      return placeAt(app, view, view.buf.lineStarts()[lineOf(view, at) - 1] ?? 0, true);
    }
    case "cmd+up":
      return placeAt(app, view, 0, true);
    case "cmd+down": {
      // The last line's end (a final newline ends it; it starts none).
      const src = view.buf.source;
      return placeAt(app, view, src.endsWith("\n") ? src.length - 1 : src.length, true);
    }
    case "ctrl+left":
    case "alt+left":
    case "alt+b":
    case "ctrl+right":
    case "alt+right":
    case "alt+f":
      return placeAt(app, view, wordFrom(view.buf.source, offsetOf(app, view), WORD_KEYS[key]!), true);
    case "end":
    case "cmd+right":
    case "ctrl+e": {
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

/**
 * Move the cursor's line — or, in V, the selected lines — up or down past its neighbour, one undo
 * step; the cursor (and the selection) go with them. From the render, the window switches to
 * editing first, as the other editing keys do (the lens's first press only opens it).
 */
export function moveLines(app: App, view: View, dir: -1 | 1): void {
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  if (!toEditing(app, view)) return;
  const buf = view.buf;
  const src = buf.source;
  const lines = src.split("\n");
  const real = src.endsWith("\n") ? lines.length - 1 : lines.length; // the empty string after a final newline is no line
  const cur = offsetOf(app, view);
  const anchor = view.sel && view.visual === "line" ? offsetAt(app, view, view.sel.anchor) : cur;
  const a = Math.min(lineOf(view, cur), lineOf(view, anchor));
  const b = Math.max(lineOf(view, cur), lineOf(view, anchor));
  if (dir < 0 ? a <= 1 : b >= real) return;
  const starts = buf.lineStarts();
  // Each line without its break (a CRLF one's \r too), joined again with the note's own; the
  // range ends before the last line's break, which stays where it is.
  const bare = (n: number) => lines[n]!.replace(/\r$/, "");
  const eol = buf.eol;
  const block = lines.slice(a - 1, b).map((_, k) => bare(a - 1 + k)).join(eol);
  const other = bare(dir < 0 ? a - 2 : b);
  const from = starts[dir < 0 ? a - 2 : a - 1]!;
  const to = (starts[dir < 0 ? b - 1 : b] ?? src.length) + bare(dir < 0 ? b - 1 : b).length;
  const text = dir < 0 ? `${block}${eol}${other}` : `${other}${eol}${block}`;
  const moveBy = dir < 0 ? -(other.length + eol.length) : other.length + eol.length;
  buf.beginStep(cur);
  buf.edit(from, to - from, text, cur);
  buf.endStep(cur + moveBy);
  if (view.sel && view.visual === "line") {
    placeAt(app, view, anchor + moveBy);
    view.sel = { ...view.sel, anchor: { ...view.cur } };
  }
  placeAt(app, view, cur + moveBy);
}

/** The text offset of a position on the view's layout (a selection's anchor). */
function offsetAt(app: App, view: View, pos: { row: number; col: number }): number {
  const saved = view.cur;
  view.cur = pos;
  const at = offsetOf(app, view);
  view.cur = saved;
  return at;
}

