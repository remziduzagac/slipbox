// Line indentation, comments and undoable line movement.

import type { App, View } from "../../../app/runtime/app.ts";
import { indentUnit } from "../../../../core/documents/editing/indent.ts";
import { type CommentStyle, commentStyle, toggleComments } from "../../../../core/documents/editing/comments.ts";
import { lineOf, lineText, offsetAt, offsetOf, placeAt } from "./position.ts";
import { cannotEdit, toEditing } from "./policy.ts";

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
