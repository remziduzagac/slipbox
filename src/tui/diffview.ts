// The diff window (GIT-D2): one way of drawing a diff for every window that shows one — `space g d`, a file's diff from
// `space g c`'s list, a history entry's diff to now, the conflict prompt's (D)iff. In the floating window: a row a line,
// `-` or `+` in its gutter, highlighted by the file's language, a changed line's changed words tinted; each group under
// its `@@ line N`, the unchanged stretches folded. A long line scrolls sideways as a code block does (D233): the cursor,
// a sideways wheel or `shift` with the wheel. `enter` on a fold opens it; on a line, goes there (or back, where the
// window has nowhere to go); `esc` goes back where it came from.

import { isAbsolute, join } from "node:path";
import { classify } from "../core/filetypes.ts";
import { indentFor } from "../core/indent.ts";
import { layoutDiff } from "../core/layout/diff.ts";
import type { Layout } from "../core/layout/ir.ts";
import { type DiffViewRow, diffView } from "../core/merge.ts";
import { TOP } from "../core/position.ts";
import { readerFor } from "../core/readers.ts";
import type { App, View } from "./app.ts";
import { NoteBuffer } from "./buffer.ts";

/** A diff window's own: the two texts, its rows, the folds opened, and where `enter` and `esc` go. */
export interface DiffWindow {
  before: string;
  now: string;
  rows: DiffViewRow[];
  /** The folds opened, by their first line in `before`. */
  open: Set<number>;
  /** `enter` on a line: there (its line in `now`). Without, `enter` goes back as `esc` does. */
  go?: (line: number) => void;
  /** Where `esc` goes: the list or the question the diff was opened from. */
  back?: () => void;
}

export interface DiffRequest {
  before: string;
  now: string;
  /** The file's path (from the root, or absolute): its language highlights the lines. */
  path: string;
  title: string;
  /** Said when the two are the same: no window opens. */
  none?: string;
  go?: (line: number) => void;
  back?: () => void;
}

/** The rows as the window's text: what its height counts, and what its cursor's lines are. */
const textOf = (rows: DiffViewRow[]) =>
  rows
    .map((r) =>
      r.kind === "@@" ? `@@ ${r.text}` : r.kind === "fold" ? `${r.count} unchanged lines` : `${r.kind} ${r.text}`,
    )
    .join("\n");

/** A diff, `before` to `now`, in the floating window; nothing different: said, and back. */
export function openDiff(app: App, d: DiffRequest): void {
  const rows = diffView(d.before, d.now);
  if (!rows.length) {
    app.message("info", d.none ?? "no differences");
    d.back?.();
    return;
  }
  if (app.floating && !app.closeFloating()) return;
  const kind = classify(d.path, app.config.walk.extensions);
  const language = kind.group === "note" ? readerFor(kind.format).language : kind.format;
  const tabWidth = indentFor(isAbsolute(d.path) ? d.path : join(app.loc.root, d.path), d.now).tabWidth;
  const w: DiffWindow = { before: d.before, now: d.now, rows, open: new Set(), go: d.go, back: d.back };
  const buf = new NoteBuffer(null, `diff:${d.title}`, `diff:${d.title}`);
  // Not a note: never spell-checked, parsed or rendered as one.
  buf.kind = { group: "text", format: "text" };
  buf.virtual = { save: () => true };
  buf.readOnly = "the floating window is read-only";
  let made: { key: string; layout: Layout } | null = null;
  buf.drawn = (width, how) => {
    const key = `${width}:${how.glyphs.mode}:${how.wrap}:${how.codeScroll}:${buf.version}`;
    if (made?.key !== key)
      made = { key, layout: layoutDiff(w.rows, w.before, w.now, { width, language, tabWidth, ...how }) };
    return made.layout;
  };
  buf.loadText(textOf(rows));
  const view = app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
  app.floating = { kind: "diff", view, title: d.title, diff: w };
  app.region = "content";
}

/** `enter` in a diff window: a fold opens; a line goes where it is (or back). False when the window isn't a diff. */
export function diffEnter(app: App, view: View): boolean {
  const f = app.floating;
  if (f?.kind !== "diff" || f.view !== view) return false;
  const w = f.diff;
  const row = w.rows[(app.currentLayout(view).lines[view.cur.row]?.src ?? 0) - 1];
  if (!row) return true;
  if (row.kind === "fold") {
    // Its lines in its place; the cursor stays on its row, now the first of them.
    w.open.add(row.own);
    w.rows = diffView(w.before, w.now, w.open);
    view.buf.loadText(textOf(w.rows));
    return true;
  }
  if (!w.go) {
    app.leaveFloating();
    return true;
  }
  if (!app.closeFloating()) return true;
  w.go(row.line);
  return true;
}
