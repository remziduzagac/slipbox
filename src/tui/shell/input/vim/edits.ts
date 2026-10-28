// Existing operator effects and put behavior; note buffers and writes retain their owners.
import type { App, View } from "../../../app/runtime/app.ts";
import * as E from "../../../documents/editing/editing.ts";
import { indentUnit } from "../../../../core/documents/editing/indent.ts";
import { toggleComments } from "../../../../core/documents/editing/comments.ts";
import { takeCount, type Op, type Range } from "./state.ts";
import { firstNonBlank } from "./motions.ts";
/** Do `op` on a range: the register gets the text; d/c take it out (c then types); y copies. */
export function apply(app: App, view: View, op: Op, r: Range): void {
  const why = E.cannotEdit(view);
  if (why && op !== "y") return app.message("warn", `${why} — not editing`);
  const buf = view.buf;
  const text = buf.source.slice(r.from, r.to);
  if (op === "y") {
    app.vim.register = { text, linewise: r.linewise };
    app.copy(text, false);
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    app.message(
      "info",
      r.linewise ? `yanked ${lines} line${lines === 1 ? "" : "s"}` : `yanked ${[...text].length} characters`,
    );
    return E.placeAt(app, view, r.from);
  }
  if (op === ">" || op === "<")
    return indentLines(
      app,
      view,
      E.lineOf(view, r.from),
      E.lineOf(view, Math.max(r.from, r.to - 1)),
      op === ">" ? 1 : -1,
      r.times ?? 1,
    );
  if (op === "gc") return commentLines(app, view, E.lineOf(view, r.from), E.lineOf(view, Math.max(r.from, r.to - 1)));
  app.vim.register = { text, linewise: r.linewise };
  // A cut is a copy too: the system clipboard gets it (vim with clipboard=unnamedplus).
  if (text) app.copy(text, false);
  const cursor = E.offsetOf(app, view);
  if (op === "d") {
    // A linewise delete of the last line takes the line break before it instead.
    let { from, to } = r;
    if (r.linewise && to === buf.source.length && !text.endsWith("\n") && from > 0)
      from -= buf.source[from - 2] === "\r" ? 2 : 1;
    buf.edit(from, to - from, "", cursor);
    const at = Math.min(from, buf.source.length);
    if (r.linewise) return E.placeAt(app, view, firstNonBlank(view, E.lineOf(view, at)));
    return E.placeAt(
      app,
      view,
      Math.min(at, Math.max(E.lineStart(view, at), E.lineEnd(view, at) - (at >= E.lineEnd(view, at) ? 1 : 0))),
    );
  }
  // c: take the text out and type in its place — one undo step with the typing.
  buf.beginStep(cursor);
  if (r.linewise) {
    const indent = /^[ \t]*/.exec(text)![0];
    const eol = text.endsWith("\n") ? (text.endsWith("\r\n") ? "\r\n" : "\n") : "";
    buf.edit(r.from, r.to - r.from, indent + eol);
    E.startInsert(app, view, () => r.from + indent.length);
  } else {
    buf.edit(r.from, r.to - r.from, "");
    E.startInsert(app, view, () => r.from);
  }
}

/** > and <: a level in or out on each line, as the file indents (25.1) — not on blank ones, going in. */
export function indentLines(app: App, view: View, first: number, last: number, dir: 1 | -1, times = 1): void {
  const buf = view.buf;
  const indent = buf.indent();
  buf.beginStep(E.offsetOf(app, view));
  for (let n = last; n >= first; n--) {
    const start = buf.lineStarts()[n - 1] ?? 0;
    const text = E.lineText(view, n);
    if (dir === 1 && text.trim()) buf.edit(start, 0, indentUnit(indent).repeat(times));
    else if (dir === -1) {
      let k = 0;
      for (let t = 0; t < times; t++) k += E.outdentLength(text.slice(k), indent.size);
      if (k) buf.edit(start, k, "");
    }
  }
  const at = firstNonBlank(view, first);
  buf.endStep(at);
  E.placeAt(app, view, at);
}

/** gc and its motion, gcc, a selection's: the lines' comments toggled (25.2) — one undo step,
 *  the cursor on the first. */
export function commentLines(app: App, view: View, first: number, last: number): void {
  const style = E.commentStyleAt(view, first);
  if (!style) return app.message("info", `${view.buf.kind.format} has no comments`);
  const buf = view.buf;
  const lines = Array.from({ length: last - first + 1 }, (_, k) => E.lineText(view, first + k));
  const next = toggleComments(lines, style);
  if (!next) return;
  buf.beginStep(E.offsetOf(app, view));
  for (let k = lines.length - 1; k >= 0; k--) {
    if (next[k] === lines[k]) continue;
    buf.edit(buf.lineStarts()[first + k - 1] ?? 0, lines[k]!.length, next[k]!);
  }
  const at = firstNonBlank(view, first);
  buf.endStep(at);
  E.placeAt(app, view, at);
}

/** p / P: the register after or before the cursor (a line register: under or over its line). */
export async function put(app: App, view: View, after: boolean, pasted?: string): Promise<void> {
  const version = view.buf.version;
  // The system clipboard's text (or the register): see App.pasteText. A terminal paste in normal
  // mode brings its own text.
  const reg = pasted !== undefined ? { text: pasted, linewise: false } : await app.pasteText();
  if (app.quitting || view.buf.version !== version || app.view !== view) return;
  if (!reg) return app.message("info", "nothing to put — copy something (y, d, x or your system's copy)");
  const why = E.cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const n = takeCount(app);
  const buf = view.buf;
  const at = E.offsetOf(app, view);
  if (reg.linewise) {
    let text = reg.text.replaceAll("\r\n", "\n").replaceAll("\n", buf.eol);
    if (!text.endsWith(buf.eol)) text += buf.eol;
    text = text.repeat(n);
    const line = E.lineOf(view, at);
    let where = after ? (buf.lineStarts()[line] ?? buf.source.length) : (buf.lineStarts()[line - 1] ?? 0);
    // After the last line when it has no line break: add one first.
    if (after && where === buf.source.length && !buf.source.endsWith("\n")) {
      buf.beginStep(at);
      buf.edit(where, 0, buf.eol);
      where += buf.eol.length;
      buf.edit(where, 0, text.slice(0, -buf.eol.length));
      buf.endStep(where);
    } else buf.edit(where, 0, text, at);
    return E.placeAt(app, view, firstNonBlank(view, E.lineOf(view, where)));
  }
  // The note's own line breaks, as the linewise put has them.
  const text = reg.text.replaceAll("\r\n", "\n").replaceAll("\n", buf.eol).repeat(n);
  const where = after && at < E.lineEnd(view, at) ? E.nextBoundary(buf.source, at) : at;
  buf.edit(where, 0, text, at);
  E.placeAt(app, view, Math.max(where, where + text.length - 1));
}
