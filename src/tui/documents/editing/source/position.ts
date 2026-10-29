// Source/layout positions and original cursor anchoring.

import type { App, View } from "../../../app/runtime/app.ts";
import { cells } from "../cursor.ts";

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

/** The text offset of a position on the view's layout (a selection's anchor). */
export function offsetAt(app: App, view: View, pos: { row: number; col: number }): number {
  const saved = view.cur;
  view.cur = pos;
  const at = offsetOf(app, view);
  view.cur = saved;
  return at;
}
