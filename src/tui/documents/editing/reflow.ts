// Reflow in the editor (EG-D12): `g q` and `g shift+q` with a motion or a text object, a selection's, `:reflow
// [width]` and `:unwrap` — the paragraphs a range of lines touches wrapped to the width, or each joined back to one
// line, by core's reflow over the note's tree. One undo step; `.` repeats the keys. The cursor ends on the first
// non-blank of the last line reflowed, as vim's `g q` leaves it.

import { isAbsolute, relative } from "node:path";
import { reflow, type ReflowMode } from "../../../core/documents/editing/reflow.ts";
import { type TextWidth, textWidthFor } from "../../../core/documents/editing/reflow-width.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { exLines } from "../search/replacing.ts";
import { editable } from "./editable.ts";
import * as E from "./editing.ts";

/** Where a width came from, as a message says it: a config's path from the vault's top. */
function said(app: App, w: TextWidth): string {
  if (!isAbsolute(w.from)) return w.from;
  const rel = relative(app.loc.root, w.from);
  return `MD013 in ${rel.startsWith("..") ? w.from : rel}`;
}

/** The paragraphs lines `first` to `last` touch, wrapped (to `width`, else the file's) or joined; said how. */
export function reflowLines(
  app: App,
  view: View,
  first: number,
  last: number,
  mode: ReflowMode,
  width?: TextWidth,
): void {
  const buf = view.buf;
  if (buf.kind.group !== "note" || buf.kind.format !== "markdown")
    return app.message("info", "reflow wraps a Markdown note's paragraphs — this file has none");
  const w = width ?? textWidthFor(buf.abs, app.loc.root, app.config.editor.text_width, undefined, app.home);
  const r = reflow(buf.source, buf.parsed.tree, first, last, mode, w.width, buf.eol);
  if (!r.paragraphs)
    return app.message("info", "no paragraph here to reflow — headings, tables, code, HTML and front matter stay");
  if (r.edits.length) buf.beginStep(E.offsetOf(app, view));
  for (const e of [...r.edits].reverse()) buf.edit(e.from, e.to - e.from, e.text);
  const line = Math.min(r.lastLine, buf.lineStarts().length);
  const at = (buf.lineStarts()[line - 1] ?? 0) + /^\s*/.exec(E.lineText(view, line))![0].length;
  if (r.edits.length) buf.endStep(at);
  E.placeAt(app, view, at);
  const n = `${r.paragraphs} paragraph${r.paragraphs === 1 ? "" : "s"}`;
  if (mode === "join")
    return app.message("info", r.edits.length ? `unwrapped ${n}, each to one line` : `${n} already one line each`);
  app.message(
    "info",
    r.edits.length
      ? `wrapped ${n} to ${w.width} columns (${said(app, w)})`
      : `${n} already wrapped to ${w.width} columns (${said(app, w)})`,
  );
}

/**
 * `:reflow [width]` and `:unwrap`: on a range's lines — the selection's (`'<,'>`, typed for you from a selection, or
 * the selection itself), the note's (`%`), by number — else the paragraph at the cursor.
 */
export function reflowCommand(app: App, mode: ReflowMode, arg = ""): void {
  const view = app.view;
  if (!view) return app.message("info", "no note open");
  const m = /^\s*('<,'>|%|\.|\d+\s*,\s*\d+)?\s*(\S*)\s*$/.exec(arg);
  const width = m?.[2] ? Number(m[2]) : null;
  if (!m || (width !== null && (mode === "join" || !Number.isInteger(width) || width < 1 || width > 1000)))
    return app.message(
      "warn",
      mode === "join"
        ? `:unwrap takes no width (${arg.trim()})`
        : `:reflow takes a width of 1 to 1000 columns, after a range: :reflow 72, :'<,'>reflow (not ${arg.trim()})`,
    );
  const why = E.cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  let range: Parameters<typeof exLines>[2] = "line";
  if (m[1] === "'<,'>") range = "selection";
  else if (m[1] === "%") range = "all";
  else if (m[1] && m[1] !== ".") {
    const [a, b] = m[1].split(",").map((x) => Number(x.trim())) as [number, number];
    range = { from: Math.min(a, b), to: Math.max(a, b) };
  } else if (!m[1] && view.sel) {
    app.views.markSelection(view);
    range = "selection";
  }
  const span = exLines(app, view, range);
  if (typeof span === "string") return app.message("warn", span);
  // Out of visual mode, as vim's `:` leaves it; a rendered window to editing, as a filter's is.
  view.sel = null;
  view.visual = null;
  if (!editable(view)) app.lens.setViewMode(view, app.lens.editMode(view));
  reflowLines(app, view, span[0], span[1], mode, width === null ? undefined : { width, from: `:reflow ${width}` });
}
