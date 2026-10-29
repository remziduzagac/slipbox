// Existing source deletion and insert-start stopping rules.

import type { App, View } from "../../../app/runtime/app.ts";
import { emptyPair } from "../../../../core/documents/editing/brackets.ts";
import { lineOf, offsetOf, placeAt } from "./position.ts";
import { nextBoundary, prevBoundary } from "./text.ts";

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
