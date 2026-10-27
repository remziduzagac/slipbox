// Code in a note's view: a code block too wide for the window scrolled sideways on its own (`[render] code_wrap`),
// the code view's cells (24.13), and folding.

import { placeAt } from "./editing.ts";
import { formatEntry } from "../core/workspace/mutations/capture.ts";
import { gitSigns } from "../core/workspace/git/gitsigns.ts";
import { type Layout, scrolledCol, srcAt, unscrolledCol } from "../core/rendering/layout/ir.ts";
import type { Problem } from "../core/documents/diagnostics/diagnostics.ts";
import { graphemes } from "../core/foundation/text/width.ts";
import { cells, ordered, type Pos } from "./cursor.ts";
import type { App, View } from "./app.ts";

/** Code blocks scrolled sideways, and the code view's cells. */
export class Code {
  constructor(readonly app: App) {}

  /** Whether a code block too wide keeps its lines whole, to scroll sideways on its own (`[render] code_wrap`): never
   *  with wrapping off, where the whole window scrolls and a block only follows it. */
  scrolls(): boolean {
    return this.app.ui.wrap && this.app.ui.code_wrap === "scroll";
  }

  /** How far the code block holding `row` is scrolled sideways in a window: 0 for a row of none. */
  offset(view: View, layout: Layout, row: number): number {
    const b = codeBlocks(layout).byRow.get(row);
    if (!b) return 0;
    const at = view.codeLeft?.buf === view.buf ? view.codeLeft.at.get(b.key) : undefined;
    return Math.max(0, Math.min(at ?? 0, b.total - b.w));
  }

  /** Scroll the code block holding `row` sideways to `off` (kept within it). */
  setOffset(view: View, layout: Layout, row: number, off: number): void {
    const b = codeBlocks(layout).byRow.get(row);
    if (b) this.setOffsetOf(view, b.key, Math.max(0, Math.min(Math.round(off), b.total - b.w)));
  }

  /** A code block's offset, by its key (its scrollbar's drag). */
  setOffsetOf(view: View, key: string, off: number): void {
    if (view.codeLeft?.buf !== view.buf) view.codeLeft = { buf: view.buf, at: new Map() };
    view.codeLeft.at.set(key, Math.max(0, off));
  }

  /**
   * Where layout column `col` of `row` is drawn, from the text's left edge: past the start of a scrolled code block's
   * code (`x`), less the block's offset. What a vertical move keeps (the goal), so it goes straight up or down the
   * screen, into and out of a scrolled block alike.
   */
  screenCol(view: View, layout: Layout, row: number, col: number): number {
    const s = layout.lines[row]?.scroll;
    return s ? scrolledCol(s, col, this.offset(view, layout, row)) : col;
  }

  /** The layout column drawn at screen column `col` of `row` (screenCol's inverse): a click's, a vertical move's. */
  layoutCol(view: View, layout: Layout, row: number, col: number): number {
    const s = layout.lines[row]?.scroll;
    return s ? unscrolledCol(s, col, this.offset(view, layout, row)) : col;
  }

  /**
   * The cursor in a code block that scrolls sideways: the block scrolls to keep it 4 columns from either edge (a
   * quarter of a narrow block), as the window does with wrapping off. On the block's fixed part (its gutter, a list's
   * indent) nothing is hidden: it stays.
   */
  follow(view: View, layout: Layout): void {
    if (view.codeWheeled) return;
    const w = cells(layout.lines[view.cur.row]).find((c) => c.x === view.cur.col)?.w ?? 1;
    this.reveal(view, layout, view.cur.row, view.cur.col, view.cur.col + w);
  }

  /** Columns `from` to `to` of a row of a code block that scrolls sideways, brought into sight, 4 columns from its
   *  edges: all of them where they fit, else from `from` (a find's match, the cursor's character). */
  reveal(view: View, layout: Layout, row: number, from: number, to: number): void {
    const s = layout.lines[row]?.scroll;
    if (!s || s.part || from < s.x) return;
    // Side by side (GIT-D7): the right's text from where it starts; what's fixed between the two is never hidden.
    const start = s.right !== undefined && from >= s.right ? s.right : s.x;
    if (start === s.x && s.right !== undefined && from >= s.x + s.total) return;
    const [a, b] = [from - start, Math.max(from + 1, to) - start];
    const margin = Math.min(4, Math.floor(s.w / 4));
    const was = this.offset(view, layout, row);
    let off = was;
    if (a < off + margin) off = a - margin;
    else if (b > off + s.w - margin) off = Math.min(a - margin, b - s.w + margin);
    if (off !== was) this.setOffset(view, layout, row, off);
  }

  /** The problems the code view's cells count in their headers (24.13): each by its line and severity. */
  cellProblems(view: View): { line: number; severity: Problem["severity"] }[] {
    return this.app.problems.ofView(view).map((p) => ({ line: p.start.line, severity: p.severity }));
  }

  /** The code view's cell (24.13) holding line `line` — the innermost (a method's, not its class's) — or starting there. */
  cellAt(view: View, line: number): NonNullable<Layout["cells"]>[number] | null {
    const cells = this.app.currentLayout(view).cells ?? [];
    return (
      cells.filter((c) => line >= c.from && line <= c.to).sort((a, b) => a.to - a.from - (b.to - b.from))[0] ?? null
    );
  }

  /**
   * A cell's action (24.13), from its header's button or the key on the cursor's cell: fold it to its header, edit it (the
   * lens on its lines), copy its code, where its definition is used, its problems, or add it to the scratch.
   */
  cellAction(action: string, from?: number): void {
    const v = this.app.view;
    if (!v || !this.app.isCodeDocument(v.buf) || v.source)
      return this.app.message("info", "a cell is the code view's: a file of a language it maps, as a document");
    const line = from ?? srcAt(this.app.currentLayout(v).lines[v.cur.row] ?? { src: 1, spans: [] }, v.cur.col);
    const cell =
      from !== undefined
        ? ((this.app.currentLayout(v).cells ?? []).find((c) => c.from === from) ?? null)
        : this.cellAt(v, line);
    if (!cell) return this.app.message("info", "no cell here: the cursor's on prose, or between cells");
    const text = v.buf
      .lines()
      .slice(cell.from - 1, cell.to)
      .join("\n");
    const lines = cell.from === cell.to ? `line ${cell.from}` : `lines ${cell.from}–${cell.to}`;
    switch (action) {
      case "fold":
        if (!v.buf.codeFolded.delete(cell.from)) v.buf.codeFolded.add(cell.from);
        for (const x of this.app.allViews()) if (x.buf === v.buf) x.layoutKey = "";
        // The cursor stays with the cell: on its header, folded (its one row), or its first row, open.
        if (from === undefined) {
          const rows = this.app.currentLayout(v).lines;
          const row = rows.findIndex((l) => !l.decor && l.src >= cell.from && l.src <= cell.to);
          if (row >= 0 && rows[row]!.srcMap) this.app.placeAtLine(v, rows[row]!.src);
          else if (row >= 0) this.app.moveCursor(v, { row, col: 0 });
        }
        return;
      case "edit":
        this.app.placeAtLine(v, cell.from);
        v.lensRange = [cell.from, cell.to];
        if (!v.live) this.app.lens.setViewMode(v, "live");
        else v.liveBase = undefined;
        this.app.region = "content";
        return;
      case "copy":
        this.app.copy(text, false);
        return this.app.message("info", `copied ${cell.title} — ${lines}`);
      case "references":
        if (!cell.name) return this.app.message("info", `${cell.title}: no definition to look for`);
        placeAt(this.app, v, (v.buf.lineStarts()[cell.name.line - 1] ?? 0) + cell.name.column);
        void this.app.run("lsp.references");
        return;
      case "problems": {
        this.app.problems.open("file");
        const list = this.app.problems.fileRows();
        const i = list.findIndex((p) => p.start.line >= cell.from && p.start.line <= cell.to);
        if (i >= 0) {
          this.app.problems.panel.file.selected = i;
          this.app.problems.showFileProblem(list[i]);
        }
        return;
      }
      case "scratch":
        this.app.scratch.capture(
          formatEntry(
            {
              ref: { path: v.buf.abs, startLine: cell.from, endLine: cell.to },
              snippetText: text,
              lang: "",
              ask: true,
            },
            this.app.loc.root,
          ),
        );
        return this.app.message(
          "info",
          `${cell.title} — ${lines} added to the scratch${this.app.scratch.notIndexed()}; add a note, esc then q closes it`,
        );
    }
  }

  /**
   * The code view's cells that didn't change folded to their headers, those that did open (GIT-D7): changed against
   * what's staged, as the gutter's signs mark them (26.1), so the file reads as which definitions changed. The cursor
   * goes to the first that did. Again, with nothing left to fold: every cell opened.
   */
  foldUnchanged(): void {
    const v = this.app.view;
    if (!v || !this.app.isCodeDocument(v.buf) || v.source)
      return this.app.message("info", "a cell is the code view's: a file of a language it maps, as a document");
    const changes = this.app.git.changesOf(v);
    if (!changes) return this.app.message("info", "no changes to read: the file isn't git's, or its signs are off");
    if (!changes.length) return this.app.message("info", "nothing changed against what's staged: nothing to fold");
    const signed = [...gitSigns(changes).keys()];
    const folded = v.buf.codeFolded;
    const relayout = () => {
      for (const x of this.app.allViews()) if (x.buf === v.buf) x.layoutKey = "";
    };
    const was = [...folded];
    // Every cell, a folded class's members too: the folds taken off to find them.
    folded.clear();
    relayout();
    const cells = this.app.currentLayout(v).cells ?? [];
    const changed = cells.filter((c) => signed.some((l) => l >= c.from && l <= c.to));
    const unchanged = cells.filter((c) => !changed.includes(c)).map((c) => c.from);
    const again = unchanged.length > 0 && was.length === unchanged.length && unchanged.every((f) => was.includes(f));
    if (!again) for (const f of unchanged) folded.add(f);
    relayout();
    if (again) return this.app.message("info", "every cell open");
    const first = changed[0];
    if (first) {
      const rows = this.app.currentLayout(v).lines;
      const row = rows.findIndex((l) => !l.decor && l.src >= first.from && l.src <= first.to);
      if (row >= 0 && rows[row]!.srcMap) this.app.placeAtLine(v, rows[row]!.src);
      else if (row >= 0) this.app.moveCursor(v, { row, col: 0 });
    }
    const n = (k: number, what: string) => `${k} ${what}${k === 1 ? "" : "s"}`;
    this.app.message(
      "info",
      `${n(unchanged.length, "unchanged cell")} folded, ${n(changed.length, "changed one")} open; again, all open`,
    );
  }

  /** The code view's run of imports on the cursor's row (24.5), folded or unfolded; false when the row isn't one. */
  toggleFold(view: View): boolean {
    const at = this.app.currentLayout(view).lines[view.cur.row]?.fold;
    if (at === undefined) return false;
    if (!view.buf.codeOpen.delete(at)) view.buf.codeOpen.add(at);
    for (const v of this.app.allViews()) if (v.buf === view.buf) v.layoutKey = "";
    return true;
  }

  /**
   * A selection in the code view (24.x): the file's text between its ends — never the rows as drawn, whose guides,
   * breaks and folds are the view's. A line selection, its lines whole; a doc comment's row, its line whole.
   */
  selectionText(view: View): string {
    const layout = this.app.currentLayout(view);
    const [a, b] = ordered(view.sel!.anchor, view.cur);
    const src = view.buf.source;
    const starts = view.buf.lineStarts();
    const lineEnd = (ln: number) => {
      const e = src.indexOf("\n", starts[ln - 1] ?? src.length);
      return e < 0 ? src.length : e;
    };
    const rowLine = (row: number) => layout.lines[row]?.src ?? 1;
    const offset = (p: Pos, after: boolean): number => {
      const line = layout.lines[p.row];
      if (!line) return src.length;
      const base = starts[line.src - 1] ?? 0;
      if (!line.srcMap || view.sel!.line) return after ? lineEnd(line.src) : base;
      const c = cells(line).find((x) => p.col >= x.x && p.col < x.x + x.w);
      if (c?.at === undefined) return after ? base + line.srcMap.end : base + (line.srcMap.cells[0] ?? 0);
      return base + c.at + (after ? (graphemes(src.slice(base + c.at, base + c.at + 16))[0]?.length ?? 1) : 0);
    };
    let from = offset(a, false);
    let to = offset(b, true);
    if (view.sel!.line) {
      from = starts[rowLine(a.row) - 1] ?? 0;
      to = lineEnd(rowLine(b.row));
    }
    return src.slice(from, Math.max(from, to));
  }
}

/** A code block that scrolls sideways on its own (`[render] code_wrap`; ir.ts CodeScroll): its rows, where its code
 *  is and how wide, and its key — the line of its first row, with how many blocks before it start there (an embed's
 *  rows are all at one line). */
interface ScrollBlock {
  key: string;
  first: number;
  last: number;
  x: number;
  w: number;
  total: number;
}

const scrollBlocks = new WeakMap<Layout, { blocks: ScrollBlock[]; byRow: Map<number, ScrollBlock> }>();

/** A layout's code blocks that scroll sideways, by row: found once per layout. A block's rows run from one with
 *  `scroll` to the next with none, or to its `bar` row. */
export function codeBlocks(layout: Layout): { blocks: ScrollBlock[]; byRow: Map<number, ScrollBlock> } {
  let found = scrollBlocks.get(layout);
  if (found) return found;
  found = { blocks: [], byRow: new Map() };
  const starts = new Map<number, number>();
  let cur: ScrollBlock | null = null;
  for (let row = 0; row < layout.lines.length; row++) {
    const line = layout.lines[row]!;
    const s = line.scroll;
    if (!s) {
      cur = null;
      continue;
    }
    if (!cur) {
      const n = starts.get(line.src) ?? 0;
      starts.set(line.src, n + 1);
      cur = { key: n ? `${line.src}#${n}` : String(line.src), first: row, last: row, x: s.x, w: s.w, total: s.total };
      found.blocks.push(cur);
    }
    cur.last = row;
    found.byRow.set(row, cur);
    if (s.part === "bar") cur = null;
  }
  scrollBlocks.set(layout, found);
  return found;
}
