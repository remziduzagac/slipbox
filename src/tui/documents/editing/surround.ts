// Surround in the editor (EG-D8): `y s` with a motion or a text object, then a mark; `d s` and a mark; `c s`, the mark
// there and the one wanted; a visual selection's `shift+s` and a mark; and, with `[editor] auto_pairs` on, a mark typed
// over the selection made while typing. The pure work is core's `documents/editing/surround.ts`; here, the marks
// awaited as characters, which text and tree, one undo step, and where the cursor goes: on the opening mark, or typing
// in a new link's empty target. `.` repeats the keys.

import type { Root } from "mdast";
import {
  addPair,
  changePair,
  deletePair,
  MARK_KEYS,
  MARK_NAMES,
  type Mark,
  markOf,
  NOTE_MARKS,
  type Pair,
  pairAt,
  type Surrounded,
  TYPED_NOTE_WRAPS,
  TYPED_WRAPS,
  wrapTyped,
} from "../../../core/documents/editing/surround.ts";
import type { Span } from "../../../core/documents/editing/structure.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { startInsert } from "./source/lifecycle.ts";
import { offsetOf, placeAt } from "./source/position.ts";
import { typedSelection } from "./source/selection.ts";

/** Whether the buffer is a Markdown note, whose tree finds emphasis, code and links. */
const markdown = (view: View) => view.buf.kind.group === "note" && view.buf.kind.format === "markdown";

/** A Markdown note's tree, or null for any other file. */
const treeOf = (view: View): Root | null => (markdown(view) ? view.buf.parsed.tree : null);

/** The mark `ch` names, or null, said so. */
export function markTyped(app: App, ch: string): Mark | null {
  const m = markOf(ch);
  if (!m) app.message("info", `${ch} isn't a surround mark — one of ${MARK_KEYS}`);
  return m;
}

/** The edits as one undo step; then the cursor on the opening mark, or typing in a link's target (the step goes on
 *  with what's typed, as `c`'s does). */
function made(app: App, view: View, s: Surrounded): void {
  const buf = view.buf;
  buf.beginStep(offsetOf(app, view));
  for (const e of [...s.edits].reverse()) buf.edit(e.from, e.to - e.from, e.text);
  if (s.target !== null) return startInsert(app, view, () => s.target!);
  buf.endStep(s.start);
  placeAt(app, view, s.start);
}

/** The nearest pair of `m` around the cursor, or null, said why. */
function pairHere(app: App, view: View, m: Mark): Pair | null {
  const tree = treeOf(view);
  if (!tree && NOTE_MARKS.has(m)) {
    app.message("info", `${m} (${MARK_NAMES[m]}) is found in Markdown notes — this file isn't one`);
    return null;
  }
  const pair = pairAt(view.buf.source, offsetOf(app, view), m, tree, view.buf.lineStarts());
  if (!pair) app.message("info", `no ${MARK_NAMES[m]} around the cursor`);
  return pair;
}

/** `y s` with its motion or object: the mark is the next key, then its pair goes around the text it covered. */
export function awaitAddMark(app: App, view: View, span: Span, key = "ys"): void {
  app.vim.awaitKey = key;
  app.vim.awaitChar = (ch) => addMarks(app, view, span, ch);
}

/** `ch`'s pair around `span`, the white space at its ends left outside. */
export function addMarks(app: App, view: View, span: Span, ch: string): void {
  const m = markTyped(app, ch);
  if (!m) return;
  const s = addPair(view.buf.source, span, m);
  if (!s) return app.message("info", "nothing to surround: only white space");
  made(app, view, s);
}

/** `d s`: the mark is the next key, then the nearest pair of it around the cursor is taken out. */
export function deleteSurround(app: App, view: View): void {
  app.vim.awaitKey = "ds";
  app.vim.awaitChar = (ch) => {
    const m = markTyped(app, ch);
    const pair = m && pairHere(app, view, m);
    if (pair) made(app, view, deletePair(pair));
  };
}

/** `c s`: the mark there is the next key, then the one wanted; the nearest pair of the first changed to the second. */
export function changeSurround(app: App, view: View): void {
  app.vim.awaitKey = "cs";
  app.vim.awaitChar = (ch) => {
    const from = markTyped(app, ch);
    if (!from || !pairHere(app, view, from)) return;
    app.vim.awaitKey = `cs${ch}`;
    app.vim.awaitChar = (next) => {
      const to = markTyped(app, next);
      const pair = to && pairHere(app, view, from);
      if (to && pair) made(app, view, changePair(view.buf.source, pair, to));
    };
  };
}

/**
 * A character typed over the selection made while typing (EG-D8): with `[editor] auto_pairs` on, a bracket, a quote
 * or a backtick wraps it, and in a Markdown note `*` and `~` do too — not in its fenced blocks' code, where they're
 * operators. The selection stays on the text inside, so `*` twice makes it bold. True when it wrapped.
 */
export function wrapSelectionTyped(app: App, view: View, ch: string): boolean {
  if (!app.config.editor.auto_pairs || !(TYPED_WRAPS[ch] || TYPED_NOTE_WRAPS[ch])) return false;
  const r = typedSelection(app, view);
  if (!r || r[1] <= r[0]) return false;
  if (TYPED_NOTE_WRAPS[ch] && !(markdown(view) && !inFencedCode(app, view, r[0]))) return false;
  const back = offsetOf(app, view) === r[0];
  const s = wrapTyped({ from: r[0], to: r[1] }, ch);
  for (const e of [...s.edits].reverse()) view.buf.edit(e.from, e.to - e.from, e.text);
  const [anchor, cursor] = back ? [s.inside.to, s.inside.from] : [s.inside.from, s.inside.to];
  placeAt(app, view, anchor, true);
  app.views.select(view, { ...view.cur }, false);
  placeAt(app, view, cursor, true);
  return true;
}

/** Whether `at` is in the code of one of a note's fenced blocks. */
function inFencedCode(app: App, view: View, at: number): boolean {
  return !!app.structure.note(view)?.fences.some((f) => f.code.from <= at && at < f.code.to);
}
