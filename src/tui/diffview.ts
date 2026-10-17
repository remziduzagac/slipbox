// The diff window (GIT-D2, GIT-D7): one way of drawing a diff for every window that shows one — `:diff`, a file's diff
// from the git panel or `:changes`, a history entry's diff to now, the conflict prompt's (D)iff. In the floating
// window. A note's opens as its changed blocks before and after (`[git] diff`), `tab` switching to its lines and back;
// a code file's is its lines, side by side where each side has 80 columns (`[git] diff_layout`). The lines: a row a
// line, `-` or `+` in its gutter, highlighted by the file's language, a changed line's changed words tinted; each group
// under its `@@ line N`, the unchanged stretches folded. A long line scrolls sideways as a code block does (D233): the
// cursor, a sideways wheel or `shift` with the wheel; side by side, both sides together. `enter` on a fold opens it; on
// a line, goes there (or back, where the window has nowhere to go); `esc` goes back where it came from.

import { isAbsolute, join } from "node:path";
import { type BlockDiff, blockDiff } from "../core/blockdiff.ts";
import { classify } from "../core/filetypes.ts";
import { indentFor } from "../core/indent.ts";
import { layoutBlockDiff } from "../core/layout/blockdiff.ts";
import { diffText, layoutDiff } from "../core/layout/diff.ts";
import { type Layout, srcAt } from "../core/layout/ir.ts";
import { layoutSplitDiff, SPLIT_MIN, splitColumns } from "../core/layout/splitdiff.ts";
import { comparable, type DiffViewRow, diffView, unseenChange } from "../core/merge.ts";
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
  /** A note's diff (GIT-D2): its blocks before and after, drawn while `on` — found the first time they are (`blocksOf`)
   *  — and their folds opened; `tab` switches between them and the rows. A code file's has none. */
  blocks: { on: boolean; diff: BlockDiff | null; open: Set<number> } | null;
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

/** The window's text: a line a row of its drawing's (a unit of the blocks'), each saying what it is — what its height
 *  counts, and what its cursor's lines are. */
function textOf(w: DiffWindow): string {
  return w.blocks?.on
    ? blocksOf(w)
        .units.map((u) => u.text)
        .join("\n")
    : diffText(w.rows).join("\n");
}

/** Where each line of the window's text goes in `now`: a row's line, or a unit's. */
const linesOf = (w: DiffWindow): number[] => (w.blocks?.on ? blocksOf(w).units : w.rows).map((r) => r.line);

/** A note's diff as its blocks: found the first time it's wanted, so a diff drawn as its lines never pays for them. */
export function blocksOf(w: DiffWindow): BlockDiff {
  const b = w.blocks!;
  b.diff ??= blockDiff(w.before, w.now, b.open);
  return b.diff;
}

/** How a file's diff is highlighted: its language (a note's, markdown's highlighter: null) and its tab's width. */
export function diffLanguage(app: App, path: string, text: string): { language: string | null; tabWidth: number } {
  const kind = classify(path, app.config.walk.extensions);
  const language = kind.group === "note" ? readerFor(kind.format).language : kind.format;
  const tabWidth = indentFor(isAbsolute(path) ? path : join(app.loc.root, path), text).tabWidth;
  return { language, tabWidth };
}

/**
 * Whether a file's diff is drawn as its blocks before and after (GIT-D2): a note's, unless `[git] diff` says lines —
 * the other way round once `tab` switched it (`switched`).
 */
export function asBlocks(app: App, path: string, switched = false): boolean {
  return isNote(app, path) && (app.config.git.diff === "blocks") !== switched;
}

/** Whether a file's diff can be drawn as its blocks: a note's. */
export const isNote = (app: App, path: string): boolean => classify(path, app.config.walk.extensions).group === "note";

/** What `tab` says once a note's diff is switched: what it's drawn as now, and what `tab` goes back to. */
export const switchedText = (blocks: boolean): string =>
  blocks
    ? "the diff's blocks, before and after — tab: its lines"
    : "the diff's lines — tab: its blocks, before and after";

/** What `tab` says in a code file's diff. */
export const LINES_ONLY = "a code file's diff is drawn as its lines: only a note's has blocks";

/** Whether a code file's diff goes side by side at `width` (GIT-D7): as `[git] diff_layout` says — in `auto`, where each
 *  side has its 80 columns. A note's never does. */
export function sideBySide(app: App, path: string, width: number): boolean {
  if (classify(path, app.config.walk.extensions).group === "note") return false;
  const layout = app.config.git.diff_layout;
  return layout === "split" || (layout === "auto" && splitColumns(width) >= SPLIT_MIN);
}

/**
 * A diff, `before` to `now`, in the floating window. Line endings and a byte order mark aren't the text's, so they're
 * not compared (a checkout that turns LF into CRLF changes no line, as git and the gutter's signs have it). Nothing
 * different: said, and back — what differs that the diff doesn't show (the line endings, the mark, the final line
 * break) said too.
 */
export function openDiff(app: App, d: DiffRequest): void {
  const before = comparable(d.before);
  const now = comparable(d.now);
  const rows = diffView(before, now);
  if (!rows.length) {
    const only = unseenChange(d.before, d.now);
    app.message("info", only ? `only ${only} changed: no line to show` : (d.none ?? "no differences"));
    d.back?.();
    return;
  }
  if (app.floating && !app.overlays.closeFloating()) return;
  const { language, tabWidth } = diffLanguage(app, d.path, now);
  const note = classify(d.path, app.config.walk.extensions).group === "note";
  const w: DiffWindow = {
    before,
    now,
    rows,
    open: new Set(),
    blocks: note ? { on: app.config.git.diff === "blocks", diff: null, open: new Set() } : null,
    go: d.go,
    back: d.back,
  };
  const buf = new NoteBuffer(null, `diff:${d.title}`, `diff:${d.title}`);
  // Not a note: never spell-checked, parsed or rendered as one.
  buf.kind = { group: "text", format: "text" };
  buf.virtual = { save: () => true };
  buf.readOnly = "the floating window is read-only";
  let made: { key: string; layout: Layout } | null = null;
  buf.drawn = (width, how) => {
    const split = !w.blocks && sideBySide(app, d.path, width);
    const mode = w.blocks?.on ? "blocks" : split ? "split" : "lines";
    const key = `${mode}:${width}:${how.glyphs.mode}:${how.wrap}:${how.codeScroll}:${buf.version}`;
    if (made?.key !== key) {
      const opts = { width, language, tabWidth, ...how };
      made = {
        key,
        layout: w.blocks?.on
          ? layoutBlockDiff(blocksOf(w), { width, glyphs: how.glyphs, tabWidth })
          : split
            ? layoutSplitDiff(w.rows, w.before, w.now, opts)
            : layoutDiff(w.rows, w.before, w.now, opts),
      };
    }
    return made.layout;
  };
  buf.loadText(textOf(w));
  const view = app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
  app.floating = { kind: "diff", view, title: d.title, diff: w };
  app.region = "content";
}

/** `enter` in a diff window: a fold opens; a line goes where it is (or back). False when the window isn't a diff. */
export function diffEnter(app: App, view: View): boolean {
  const f = app.floating;
  if (f?.kind !== "diff" || f.view !== view) return false;
  const w = f.diff;
  // The line of what's under the cursor: in a paragraph laid out again, its word's own.
  const row = app.currentLayout(view).lines[view.cur.row];
  const at = (row ? srcAt(row, view.cur.col) : 0) - 1;
  if (w.blocks?.on) {
    const fold = blocksOf(w).items.find((i) => i.kind === "fold" && i.unit === at);
    if (fold?.kind === "fold") {
      // Its blocks in its place; the cursor stays on its row, now their first.
      w.blocks.open.add(fold.own);
      w.blocks.diff = blockDiff(w.before, w.now, w.blocks.open);
      view.buf.loadText(textOf(w));
      return true;
    }
  } else if (w.rows[at]?.kind === "fold") {
    // Its lines in its place; the cursor stays on its row, now the first of them.
    w.open.add(w.rows[at]!.own);
    w.rows = diffView(w.before, w.now, w.open);
    view.buf.loadText(textOf(w));
    return true;
  }
  const line = linesOf(w)[at];
  if (line === undefined) return true;
  if (!w.go) {
    app.overlays.leaveFloating();
    return true;
  }
  if (!app.overlays.closeFloating()) return true;
  w.go(line);
  return true;
}

/**
 * `tab` in a note's diff (`git.diff_view`, GIT-D2): its blocks before and after, or its lines, the cursor kept on the
 * first row at or after the line it was on. A code file's diff has only its lines, and says so.
 */
export function diffSwitch(app: App): void {
  const f = app.floating;
  if (f?.kind !== "diff") return app.message("info", "no diff is open: a note's diff switches its drawing here");
  const w = f.diff;
  if (!w.blocks) return app.message("info", LINES_ONLY);
  const view = f.view;
  const line = linesOf(w)[(app.currentLayout(view).lines[view.cur.row]?.src ?? 1) - 1] ?? 1;
  w.blocks.on = !w.blocks.on;
  const text = textOf(w).split("\n");
  view.buf.loadText(text.join("\n"));
  const lines = linesOf(w);
  // A line's row, not a head's or a fold's: `-`, `+` or two spaces before its text.
  const shown = (k: number) => /^[-+ ] /.test(text[k] ?? "") && (lines[k] ?? 0) >= line;
  const rows = app.currentLayout(view).lines;
  const row = rows.findIndex((l) => !l.decor && shown(l.src - 1));
  app.moveCursor(view, { row: row < 0 ? 0 : row, col: 0 });
  app.message("info", switchedText(w.blocks.on));
}
