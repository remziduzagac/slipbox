// Insert-key coordination, clipboard guards, selection and typing motions.

import type { App, View } from "../../../app/runtime/app.ts";
import { cells } from "../cursor.ts";
import { keyChar } from "../../../shell/input/keys/decoding.ts";
import { autoPair } from "../../../../core/documents/editing/brackets.ts";
import { deleteTypedSelection, typedSelection } from "./selection.ts";
import { insertText, nextBoundary, prevBoundary } from "./text.ts";
import { lineOf, lineText, offsetOf, placeAt } from "./position.ts";
import { stopInsert } from "./lifecycle.ts";
import { newline } from "./newline.ts";
import { backspace, deleteForward, deleteToLineStart, deleteWordBack } from "./deleting.ts";
import { commentLine, indentLine } from "./lines.ts";

/**
 * Keys in insert mode: text goes in; the arrows and friends move; esc leaves. As in a desktop editor (DF-D15), a move
 * with `shift` selects, and what's typed next replaces the selection (`selectionKey`).
 */
export async function insertKey(app: App, view: View, key: string): Promise<void> {
  if (key === "ctrl+v") {
    const version = view.buf.version;
    const reg = await app.pasteText();
    if (reg && !app.quitting && app.view === view && view.buf.version === version) {
      deleteTypedSelection(app, view);
      insertText(app, view, reg.text.replace(/\r\n?/g, "\n").replaceAll("\n", view.buf.eol));
    }
    return;
  }
  const move = selectingMove(key);
  if (move) selectTo(app, view, move);
  else if (!view.sel || !selectionKey(app, view, key)) insertKeyNow(app, view, key);
  // Moving the cursor starts the insert again there, as vim's does: ctrl+u and ctrl+w stop at it.
  const moved = move ?? key;
  if (view.insert && (MOVING.has(moved) || WORD_KEYS[moved])) view.insertFrom = offsetOf(app, view);
}

/** Typing's moves: the arrows, home and end, the page keys — and macOS's cmd+arrows, cmd+← / cmd+→ arriving as ctrl+a
 *  / ctrl+e — and ctrl+home / ctrl+end to the note's start and end, as cmd+↑ / cmd+↓. */
export const MOVING = new Set([
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
export function selectingMove(key: string): string | null {
  if (!/(^|\+)shift\+/.test(key)) return null;
  const move = key.replace(/(^|\+)shift\+/, "$1");
  return MOVING.has(move) || WORD_KEYS[move] ? move : null;
}

/** A shifted move while typing: the selection from where it started (the cursor, the first time) to where it goes. */
export function selectTo(app: App, view: View, move: string): void {
  if (!view.sel) app.views.select(view, { ...view.cur }, false);
  insertKeyNow(app, view, move);
  // Back where it started, nothing is selected.
  if (view.sel && view.sel.anchor.row === view.cur.row && view.sel.anchor.col === view.cur.col) view.sel = null;
}

/**
 * A key while typing with a selection (DF-D15), as a desktop editor has it: a character typed, `enter` or a paste
 * replaces it; `backspace`, `delete` and the other deleting keys delete it; `ctrl+c` copies it and `ctrl+x` cuts it;
 * `left` and `right` go to its start and end. Any other key lets it go, then does what it does. True when the key is
 * spent here.
 */
export function selectionKey(app: App, view: View, key: string): boolean {
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
export const WORD_KEYS: Record<string, -1 | 1> = {
  "ctrl+left": -1,
  "alt+left": -1,
  "alt+b": -1,
  "ctrl+right": 1,
  "alt+right": 1,
  "alt+f": 1,
};

/** A word back (to its start) or forward (to its end) from `at`, across lines: a run of letters and digits, or of
 *  other marks, past the spaces before it. */
export function wordFrom(text: string, at: number, dir: -1 | 1): number {
  if (dir < 0) return at - /(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(text.slice(0, at))![0].length;
  return at + /^\s*(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?/u.exec(text.slice(at))![0].length;
}

/**
 * Up to `n` rows up or down while typing (wrapped rows count), at the goal column, past a row's end allowed — only onto
 * rows of text: the lens's rules and the render beyond them stop it (normal mode moves on). The rows it went.
 */
export function rowsWhileTyping(app: App, view: View, n: number): number {
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
export function pageWhileTyping(app: App, view: View, dir: -1 | 1): void {
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

export function insertKeyNow(app: App, view: View, key: string): void {
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
