// Editing in source mode (plan 4.3, 4.4; phase 3 step 3). The text is the buffer's `source`; a
// cursor is a place in it, found through the source layout's `srcMap` (every cell drawn knows the
// offset it shows). Insert mode types into it; the normal-mode commands (`i`, `o`, `x`, `u`…) are
// named commands in actions-edit.ts that call in here.

import { graphemes } from "../core/width.ts";
import { type App, editable, type View } from "./app.ts";
import { cells } from "./cursor.ts";
import { keyChar } from "./keys.ts";
import { indentUnit } from "../core/indent.ts";
import { type CommentStyle, commentStyle, toggleComments } from "../core/comments.ts";
import { autoPair, emptyPair } from "../core/brackets.ts";
import { endSnippet } from "./snippets.ts";

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
      app.views.setCursorAnchor(view, layout);
      return placeAt(app, view, at, past, true);
    }
  }
  if (row < 0) row = layout.lines.findLastIndex((l) => l.src <= src && !l.decor);
  if (row < 0) row = Math.max(0, layout.lines.length - 1);
  // Among its wrapped rows, the one that holds it (a row's end belongs to the next row).
  while (
    layout.lines[row + 1]?.src === src &&
    layout.lines[row + 1]?.srcMap &&
    within >= (layout.lines[row]!.srcMap?.end ?? 0)
  )
    row++;
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
  app.views.setCursorAnchor(view, layout);
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
  if (view.buf.readOnly) return view.buf.readOnly;
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
  const mode = app.lens.editMode(view);
  app.lens.setViewMode(view, mode);
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

/** Leave insert mode: the session is one undo step; the cursor steps back onto a character, and a selection made
 *  while typing goes. */
export function stopInsert(app: App, view: View): void {
  if (!view.insert) return;
  // Where typing stopped, read while still typing: a new layout pending (the index done, a grammar loaded) puts the
  // cursor back by typing's rule, past a line's last character. Read after, by normal mode's, it would be on that
  // character, and the cursor and gi one short.
  const at = offsetOf(app, view);
  view.insert = false;
  if (!view.visual) view.sel = null;
  // Completion's popup and the signature are typing's (19.16); so is a snippet's stops (25.8).
  app.completion = null;
  app.signature = null;
  endSnippet(app);
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
  // Code (25.1): after an opening bracket, a level in — the closing one right after the cursor to a line of its own;
  // after a `:` in Python or YAML, a level in too.
  const after = line.slice(at - start);
  const opener = view.buf.kind.group !== "note" && !m ? before.trimEnd().at(-1) : undefined;
  if (opener && (OPENS[opener] || (opener === ":" && /^(python|yaml)$/.test(view.buf.kind.format)))) {
    const inner = lead + indentUnit(view.buf.indent());
    if (OPENS[opener] && after.trimStart().startsWith(OPENS[opener]!)) {
      insertText(app, view, view.buf.eol + inner + view.buf.eol + lead);
      return placeAt(app, view, at + view.buf.eol.length + inner.length, true);
    }
    return insertText(app, view, view.buf.eol + inner);
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

/** Backspace: the grapheme before the cursor (a line break joins the lines); an empty pair both its halves (25.3). */
export function backspace(app: App, view: View): void {
  const at = offsetOf(app, view);
  if (at <= 0) return;
  if (app.config.editor.auto_pairs && emptyPair(view.buf.source, at)) {
    view.buf.edit(at - 1, 2, "");
    return placeAt(app, view, at - 1, true);
  }
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

/** Tab / shift+tab: indent or outdent the cursor's line a level, as the file indents (25.1): a tab, or its spaces. */
export function indentLine(app: App, view: View, dir: 1 | -1): void {
  const at = offsetOf(app, view);
  const src = lineOf(view, at);
  const start = view.buf.lineStarts()[src - 1] ?? 0;
  const indent = view.buf.indent();
  if (dir === 1) {
    const unit = indentUnit(indent);
    view.buf.edit(start, 0, unit);
    return placeAt(app, view, at + unit.length, true);
  }
  const n = outdentLength(lineText(view, src), indent.size);
  if (!n) return;
  view.buf.edit(start, n, "");
  placeAt(app, view, Math.max(start, at - n), true);
}

/** How a line of the file is commented (25.2): its own part's language (a component's script, its style), else the
 *  file's; null for one with no comments. */
export function commentStyleAt(view: View, line: number): CommentStyle | null {
  const buf = view.buf;
  return commentStyle(buf.syntax?.languages.get(line) ?? buf.kind.format);
}

/** ctrl+/ while typing (25.2): the line's comment toggled, the cursor kept on the character it was on. */
export function commentLine(app: App, view: View): void {
  const at = offsetOf(app, view);
  const src = lineOf(view, at);
  const style = commentStyleAt(view, src);
  if (!style) return app.message("info", `${view.buf.kind.format} has no comments`);
  const start = view.buf.lineStarts()[src - 1] ?? 0;
  const line = lineText(view, src);
  const next = toggleComments([line], style)?.[0];
  if (next === undefined || next === line) return;
  // Where the line's own text starts, before and after: past the marker (and its space) where it's commented.
  const head = /^[ \t]*/.exec(line)![0].length;
  const marker = "line" in style ? style.line : style.open;
  const after = (text: string) =>
    head + (text.slice(head).startsWith(marker) ? marker.length + (text[head + marker.length] === " " ? 1 : 0) : 0);
  const [was, now] = [after(line), after(next)];
  const col = at - start;
  view.buf.edit(start, line.length, next);
  placeAt(app, view, start + Math.min(next.length, col <= head ? col : col < was ? now : col - was + now), true);
}

/** How much of a line's start a level out takes: its first tab, or up to `size` spaces. */
export function outdentLength(line: string, size: number): number {
  if (line.startsWith("\t")) return 1;
  return new RegExp(`^ {0,${size}}`).exec(line)![0].length;
}

/** The brackets a line ending in one opens: a new line inside goes a level in (25.1). */
const OPENS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/**
 * Keys in insert mode: text goes in; the arrows and friends move; esc leaves. As in a desktop editor (DF-D15), a move
 * with `shift` selects, and what's typed next replaces the selection (`selectionKey`).
 */
export function insertKey(app: App, view: View, key: string): void {
  const move = selectingMove(key);
  if (move) selectTo(app, view, move);
  else if (!view.sel || !selectionKey(app, view, key)) insertKeyNow(app, view, key);
  // Moving the cursor starts the insert again there, as vim's does: ctrl+u and ctrl+w stop at it.
  const moved = move ?? key;
  if (view.insert && (MOVING.has(moved) || WORD_KEYS[moved])) view.insertFrom = offsetOf(app, view);
}

/** Typing's moves: the arrows, home and end, the page keys — and macOS's cmd+arrows, cmd+← / cmd+→ arriving as ctrl+a
 *  / ctrl+e — and ctrl+home / ctrl+end to the note's start and end, as cmd+↑ / cmd+↓. */
const MOVING = new Set([
  "left",
  "right",
  "up",
  "down",
  "home",
  "end",
  "pageup",
  "pagedown",
  "cmd+left",
  "cmd+right",
  "ctrl+a",
  "ctrl+e",
  "cmd+up",
  "cmd+down",
  "ctrl+home",
  "ctrl+end",
]);

/** A key that selects while typing: one of typing's moves with `shift` added (`shift+left`, `ctrl+shift+right`,
 *  `shift+end`, `shift+pagedown`), as the move without it; null for any other key. */
function selectingMove(key: string): string | null {
  if (!/(^|\+)shift\+/.test(key)) return null;
  const move = key.replace(/(^|\+)shift\+/, "$1");
  return MOVING.has(move) || WORD_KEYS[move] ? move : null;
}

/** A shifted move while typing: the selection from where it started (the cursor, the first time) to where it goes. */
function selectTo(app: App, view: View, move: string): void {
  if (!view.sel) app.views.select(view, { ...view.cur }, false);
  insertKeyNow(app, view, move);
  // Back where it started, nothing is selected.
  if (view.sel && view.sel.anchor.row === view.cur.row && view.sel.anchor.col === view.cur.col) view.sel = null;
}

/**
 * The text a selection made while typing covers: from one end to the other, the cursor sitting between characters as
 * it does while typing (so the character after it isn't taken, as a visual selection's last one is). Null without one.
 */
export function typedSelection(app: App, view: View): [number, number] | null {
  if (!view.insert || !view.sel) return null;
  const at = offsetOf(app, view);
  const anchor = offsetAtPos(app, view, view.sel.anchor);
  return [Math.min(at, anchor), Math.max(at, anchor)];
}

/** The selection made while typing taken out of the text (not copied: a paste over it puts what was copied before),
 *  the cursor where it was. False when there's none. */
export function deleteTypedSelection(app: App, view: View): boolean {
  const r = typedSelection(app, view);
  view.sel = null;
  if (!r) return false;
  if (r[1] > r[0]) view.buf.edit(r[0], r[1] - r[0], "");
  placeAt(app, view, r[0], true);
  return true;
}

/**
 * A key while typing with a selection (DF-D15), as a desktop editor has it: a character typed, `enter` or a paste
 * replaces it; `backspace`, `delete` and the other deleting keys delete it; `ctrl+c` copies it and `ctrl+x` cuts it;
 * `left` and `right` go to its start and end. Any other key lets it go, then does what it does. True when the key is
 * spent here.
 */
function selectionKey(app: App, view: View, key: string): boolean {
  switch (key) {
    case "backspace":
    case "ctrl+h":
    case "delete":
    case "ctrl+w":
    case "ctrl+backspace":
    case "alt+backspace":
    case "ctrl+u":
      deleteTypedSelection(app, view);
      return true;
    case "ctrl+c":
    case "ctrl+x": {
      const r = typedSelection(app, view);
      if (r && r[1] > r[0]) {
        const text = view.buf.source.slice(r[0], r[1]);
        app.copy(text);
        // What a paste puts where the clipboard can't be read back, as a yank's is.
        app.vim.register = { text, linewise: false };
      }
      if (key === "ctrl+x") deleteTypedSelection(app, view);
      return true;
    }
    case "left":
    case "right": {
      const r = typedSelection(app, view);
      view.sel = null;
      if (r) placeAt(app, view, key === "left" ? r[0] : r[1], true);
      return true;
    }
  }
  if (keyChar(key) !== null || key === "enter" || key === "ctrl+v") deleteTypedSelection(app, view);
  else view.sel = null;
  return false;
}

/** Typing, by words: ctrl+← / ctrl+→, alt+← / alt+→ (macOS's option+arrows), alt+b / alt+f (what its terminals send). */
const WORD_KEYS: Record<string, -1 | 1> = {
  "ctrl+left": -1,
  "alt+left": -1,
  "alt+b": -1,
  "ctrl+right": 1,
  "alt+right": 1,
  "alt+f": 1,
};

/** A word back (to its start) or forward (to its end) from `at`, across lines: a run of letters and digits, or of
 *  other marks, past the spaces before it. */
function wordFrom(text: string, at: number, dir: -1 | 1): number {
  if (dir < 0) return at - /(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(text.slice(0, at))![0].length;
  return at + /^\s*(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?/u.exec(text.slice(at))![0].length;
}

/**
 * Up to `n` rows up or down while typing (wrapped rows count), at the goal column, past a row's end allowed — only onto
 * rows of text: the lens's rules and the render beyond them stop it (normal mode moves on). The rows it went.
 */
function rowsWhileTyping(app: App, view: View, n: number): number {
  const layout = app.currentLayout(view);
  const step = n < 0 ? -1 : 1;
  let row = view.cur.row;
  for (let k = 0; k < Math.abs(n) && layout.lines[row + step]?.srcMap; k++) row += step;
  if (row === view.cur.row) return 0;
  const cs = cells(layout.lines[row]);
  const last = cs[cs.length - 1];
  const endCol = last ? last.x + last.w : 0;
  const col = Math.min(view.goal, endCol);
  const goal = view.goal;
  const went = row - view.cur.row;
  view.cur = { row, col: cs.find((c) => c.x + c.w > col)?.x ?? endCol };
  app.views.setCursorAnchor(view, layout);
  view.goal = goal;
  return went;
}

/**
 * A page up or down while typing (DF-D15), as reading's page keys: the cursor a window's height less two rows on, and
 * in source mode the view with it, so the cursor keeps its place on the screen. In the lens it stops at the lens's
 * rules, as the arrows do.
 */
function pageWhileTyping(app: App, view: View, dir: -1 | 1): void {
  const top = view.top;
  const went = rowsWhileTyping(app, view, dir * Math.max(1, view.height - 2));
  if (!went || view.live) return;
  // The view scrolled by as many rows as the cursor went, from where it was (the cursor's move may have scrolled it).
  const cur = view.cur;
  view.top = top;
  app.views.scrollBy(view, went, false);
  view.cur = cur;
  app.views.setCursorAnchor(view, app.currentLayout(view));
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
    case "ctrl+v": {
      // The clipboard, as the terminal's own paste (cmd+v) puts it: into the text, its line breaks the note's own.
      const reg = app.pasteText();
      if (reg) insertText(app, view, reg.text.replace(/\r\n?/g, "\n").replaceAll("\n", view.buf.eol));
      return;
    }
    case "ctrl+/":
    case "ctrl+_":
      return commentLine(app, view);
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
    case "ctrl+home":
      return placeAt(app, view, 0, true);
    case "pageup":
    case "pagedown":
      return pageWhileTyping(app, view, key === "pageup" ? -1 : 1);
    case "cmd+down":
    case "ctrl+end": {
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
    case "down":
      return void rowsWhileTyping(app, view, key === "up" ? -1 : 1);
  }
  if (typed !== null && app.config.editor.auto_pairs && typed.length === 1) {
    // A pair closed as it's typed (25.3): its other half after the cursor, or one already there stepped over.
    const at = offsetOf(app, view);
    const pair = autoPair(view.buf.source, at, typed);
    if (pair !== null) {
      insertText(app, view, pair);
      return placeAt(app, view, at + 1, true);
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
  const block = lines
    .slice(a - 1, b)
    .map((_, k) => bare(a - 1 + k))
    .join(eol);
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
