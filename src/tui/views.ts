// A window's view of its note: its layout for the window's width (rows derived from source anchors, decision 3.5),
// its gutter, its cursor and selection, scrolling, and the marks drawn over its text.

import { readRegular } from "../core/foundation/platform/fsutil.ts";
import { taskHolding, toggleTask } from "../core/documents/editing/tasks.ts";
import { cannotEdit, lineOf, offsetOf, placeAt, typedSelection } from "./editing.ts";
import { matchBracket } from "../core/documents/editing/brackets.ts";
import { extentOf, type Layout } from "../core/rendering/layout/ir.ts";
import { layoutWidth } from "../core/documents/model/note.ts";
import { type Anchor, anchorAt, type CursorAnchor, rowFor } from "../core/workspace/session/position.ts";
import type { TextEdit } from "../core/documents/model/footnotes.ts";
import { truncate, graphemes, graphemeWidth, stringWidth } from "../core/foundation/text/width.ts";
import type { NoteBuffer } from "./buffer.ts";
import { cells, clampPos, type Pos, snap, ordered } from "./cursor.ts";
import type { App, View } from "./app.ts";
import { editable, type Selection } from "./app.ts";
import { isHidden, unparsedText } from "./lens.ts";
import { computeFind } from "./search.ts";

/** Views: layout, anchors, cursor and selection, scrolling. */
export class Views {
  constructor(readonly app: App) {}

  // -------------------------------------------------------------------------------------------
  // Layout access. Views store source anchors; rows are derived per width (decision 3.5).

  /** Width of the text column for a pane of `paneWidth`, after line numbers and readable width. */
  textWidth(paneWidth: number, gutter: number): number {
    const w = layoutWidth(paneWidth - gutter, this.app.config.render.inset, this.app.config.render.max_width);
    return this.app.ui.readable_width || this.app.ui.zen ? Math.min(w, this.app.config.ui.readable_max) : w;
  }

  /**
   * Wrapping off: the note at its natural width (laid out very wide once, then at the widest real
   * row), never narrower than the pane; the view scrolls sideways instead.
   */
  private nowrapWidth(view: View, paneWidth: number, gutter: number): number {
    const probe = view.buf.layout(
      NOWRAP_PROBE,
      this.app.glyphs,
      this.app.ui.urls,
      view.buf.rel ? this.app.graph : null,
      undefined,
      false,
      this.app.config.render.caption,
      this.app.html.options(view.buf),
    );
    let natural = naturalWidths.get(probe);
    if (natural === undefined) {
      natural = naturalWidth(probe);
      naturalWidths.set(probe, natural);
    }
    return Math.max(layoutWidth(paneWidth - gutter, this.app.config.render.inset, NOWRAP_PROBE), natural);
  }

  /** Columns of text visible in a view (what drawPane gives the text). */
  textColumns(view: View): number {
    return Math.max(1, view.width - 1 - this.gutterWidth(view));
  }

  layoutFor(view: View, paneWidth: number, gutter = 0): Layout {
    // A big note parsing on other threads (15.1): a line saying so, and nothing of the view moved
    // (its reading position stays for the real layout, a moment later).
    if (!view.source && !view.live && view.buf.parseAhead())
      return this.readingLayout(view.buf, this.textWidth(paneWidth, gutter));
    // A layout of its own (a diff, GIT-D2): drawn whatever the window's mode, at the whole text column less a column.
    const drawn = view.buf.drawn;
    // A data file that stopped parsing (16.14) goes to source mode, the error said — when insert
    // mode ends, never mid-typing (an open quote is normal while a value is typed).
    if (!view.source && !view.insert && !this.app.canRender(view.buf)) {
      Object.assign(view, { source: true, live: false, liveBase: undefined, layoutKey: "" });
      if (view.buf.kind.group === "data" && view.buf.parsed.error) this.app.message("warn", unparsedText(view.buf));
    }
    // Source mode: the whole text column (no readable width), less one for a cursor after a full
    // row's end; unwrapped, as long as the longest line.
    const code = !view.source && !view.live && this.app.isCodeDocument(view.buf);
    const width = drawn
      ? Math.max(10, paneWidth - gutter - 1)
      : view.source
        ? Math.max(10, paneWidth - gutter - 2)
        : this.app.ui.wrap
          ? this.textWidth(paneWidth, gutter)
          : code
            ? layoutWidth(paneWidth - gutter, this.app.config.render.inset, NOWRAP_PROBE)
            : this.nowrapWidth(view, paneWidth, gutter);
    if (view.source || this.app.isCodeDocument(view.buf)) this.app.languages.ensureSyntax(view.buf);
    this.app.languages.ensureLint(view.buf);
    this.app.languages.ensureLinters(view.buf);
    this.app.languages.ensureServers(view.buf);
    // Its pictures as this window shows them (PIC): their key places its cursor and top again, though the rows be as many.
    const pictures = !drawn && !view.source && !view.live && !code ? this.app.pictures.forView(view, width) : undefined;
    const layout = drawn
      ? drawn(width, { glyphs: this.app.glyphs, wrap: this.app.ui.wrap, codeScroll: this.app.code.scrolls() })
      : view.source
        ? view.buf.sourceLayout(width, this.app.ui.wrap, this.app.glyphs)
        : view.live
          ? this.app.lens.liveLayout(view, width)
          : code
            ? view.buf.codeLayout(
                width,
                this.app.ui.wrap,
                this.app.glyphs,
                this.app.ui.code_cells,
                this.app.code.cellProblems(view),
              )
            : view.buf.layout(
                width,
                this.app.glyphs,
                this.app.ui.urls,
                view.buf.rel ? this.app.graph : null,
                pictures,
                this.app.code.scrolls(),
                this.app.config.render.caption,
                this.app.html.options(view.buf),
              );
    const block = view.live && view.liveBase ? `${view.liveBase.active[0]}-${view.liveBase.active[1]}` : "";
    const key = `${view.source ? "s" : view.live ? "l" : "r"}${block}:${width}:${this.app.glyphs.mode}:${this.app.ui.urls}:${layout.lines.length}:${view.buf.version}:${view.height}:${view.live ? (view.liveBase?.pictures ?? "") : (pictures?.key ?? "")}`;
    if (view.layoutKey !== key) {
      view.layoutKey = key;
      view.cur = this.cursorFromAnchor(layout, view.curAnchor, view.insert);
      // Re-derive the anchor from where the cursor landed, so its fallback line tracks the file:
      // after an insertion above, a later removal of the heading must not use a stale line. Only
      // when the text changed: a re-wrap alone can leave no row starting on the anchor's line (the
      // paragraph reflowed), and the next row's line would then replace the true one for good.
      if (view.anchorVersion !== view.buf.version) {
        view.curAnchor = { ...this.cursorAnchorFor(layout, view.cur), col: view.curAnchor.col };
        view.anchorVersion = view.buf.version;
      }
      view.top = this.clampTop(view, layout, this.rowFromAnchor(layout, view.topAnchor, view.topSub ?? 0));
      this.ensureCursorVisible(view, layout);
      if (view.find)
        view.find = computeFind(
          layout,
          view.find.query,
          view.find.current,
          view.find.whole,
          view.find.regex,
          false,
          view,
        );
      // (While typing, its end may be past a row's last character, as the cursor may.)
      if (view.sel)
        view.sel.anchor = view.sel.src
          ? this.cursorFromAnchor(layout, view.sel.src, view.insert)
          : clampPos(layout, view.sel.anchor);
    }
    if (view.live && view.liveBase) this.app.lens.pin(view, layout);
    return layout;
  }

  /** What a big note shows while its parse runs on other threads (15.1); keys wait for it. */
  private readingLayout(buf: NoteBuffer, width: number): Layout {
    const parse = buf.parsing!;
    if (!this.parses.has(parse)) {
      this.parses.add(parse);
      void parse.finally(() => {
        this.parses.delete(parse);
        // The threads couldn't: the note reads as its source, and why is said once.
        const failed = buf.takeParseFailure();
        if (failed)
          this.app.message(
            "warn",
            `${this.app.displayName(buf)} is shown as its source: its parse on another thread failed (${failed.why})${failed.transient ? " — open it again to retry" : ""}`,
          );
        for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
        this.app.host.requestRender();
      });
    }
    const text = truncate(
      `reading ${this.app.displayName(buf)} — ${buf.lineStarts().length.toLocaleString("en")} lines…`,
      width,
    );
    return {
      lines: [{ spans: [{ text, role: "dim", attrs: 0 }], src: 1 }],
      links: [],
      headings: [],
      width,
      clipped: 0,
    };
  }

  /** Big notes' parses running on other threads: a key waits for them, a click is dropped. */
  readonly parses = new Set<Promise<void>>();

  /** Once every big note's parse has landed (tests, the benchmark). */
  async whenParsed(): Promise<void> {
    while (this.parses.size) await Promise.all(this.parses);
  }

  /** The gutter's width for a view: the problems bar's or the line numbers', then a column of the page's between it
   *  and the text (0 when both are off). */
  gutterWidth(view: View): number {
    // A layout of its own (a diff) has no lines of a file to number or sign: its rows say what they are.
    if (view.buf.drawn) return 0;
    const w = this.barWidth(view) + (this.app.ui.line_numbers ? String(view.buf.lineStarts().length).length + 1 : 0);
    // Its last column has the git signs (26.1); with nothing else in it, it's theirs alone, once the file has had any.
    // Before the gutter (`[git] signs_at`, #22) they take the window's margin, there with or without one.
    if (w) return w + 1;
    return this.app.config.git.signs_at === "gutter_right" && this.signsKept(view) ? 1 : 0;
  }

  /** The column the git signs take at the window's right edge, by the scrollbar (`[git] signs_at = "window_right"`,
   *  #22): 1 once the file has had changes, kept as they go so the text doesn't move; else 0. */
  signsRight(view: View): number {
    return this.app.config.git.signs_at === "window_right" && this.signsKept(view) ? 1 : 0;
  }

  /** Whether a file has had changes against what's staged (26.1): its signs' column, once given, is kept. */
  private signsKept(view: View): boolean {
    if (!view.buf.gitColumn && this.app.git.changesOf(view)?.length) view.buf.gitColumn = true;
    return view.buf.gitColumn;
  }

  /** The problems bar's width (19.9): a sign, a count when more than one, a space — while it's on; with `auto`,
   *  once the file has had problems, and from then on, so the text doesn't move as they come and go. None beside line
   *  numbers: a line's number takes its worst problem's colour, and is clicked as a sign is. */
  barWidth(view: View): number {
    if (!this.app.ui.problems_bar || this.app.ui.line_numbers) return 0;
    if (this.app.config.diagnostics.bar === "on" || view.buf.problemBar) return 3;
    if (this.app.problems.ofView(view, true).length) view.buf.problemBar = true;
    return view.buf.problemBar ? 3 : 0;
  }

  /** The view's top, remembered as its source line and the row within it: a re-layout (a resize, a
   *  reload) brings back the same row of a wrapped paragraph or a table, not the block's first. */
  anchorTop(view: View, layout: Layout): void {
    const c = this.cursorAnchorFor(layout, { row: view.top, col: 0 });
    view.topAnchor = c.anchor;
    view.topSub = c.sub;
  }

  /** The row `sub` rows into the line an anchor names (as far as that line has rows). */
  private rowFromAnchor(layout: Layout, anchor: Anchor, sub: number): number {
    const first = rowFor(layout, anchor);
    const src = layout.lines[first]?.src;
    let row = first;
    for (let k = 0; k < sub && layout.lines[row + 1]?.src === src; k++) row++;
    return row;
  }

  private cursorFromAnchor(layout: Layout, c: CursorAnchor, insert = false): Pos {
    const first = rowFor(layout, c.anchor);
    const src = layout.lines[first]?.src;
    let row = first;
    for (let k = 0; k < c.sub && layout.lines[row + 1]?.src === src; k++) row++;
    const pos = clampPos(layout, { row, col: c.col });
    // Typing at a line's end, the cursor is past its last character: a relayout then (the
    // problems bar appearing, a resize) keeps it there, or the next key goes in before that one.
    const cs = insert ? cells(layout.lines[pos.row]) : [];
    const last = cs[cs.length - 1];
    if (last && c.col >= last.x + last.w) pos.col = last.x + last.w;
    return pos;
  }

  /** After placing `view.cur` directly (editing): its anchor, and the view following it. */
  setCursorAnchor(view: View, layout: Layout): void {
    view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    this.ensureCursorVisible(view, layout);
  }

  cursorAnchorFor(layout: Layout, p: Pos): CursorAnchor {
    const src = layout.lines[p.row]?.src;
    let sub = 0;
    while (p.row - sub - 1 >= 0 && layout.lines[p.row - sub - 1]?.src === src) sub++;
    return { anchor: anchorAt(layout, p.row - sub), sub, col: p.col };
  }

  clampTop(view: View, layout: Layout, top: number): number {
    const hidden = this.app.lens.hidden(view, layout);
    if (!hidden.length) {
      const max = Math.max(0, layout.lines.length - Math.max(1, view.height));
      return Math.max(0, Math.min(top, max));
    }
    // The last screenful starts `height` visible rows before the end; never on a hidden row.
    const max = this.app.lens.stepVisible(layout, hidden, layout.lines.length, -Math.max(1, view.height));
    let t = Math.max(0, Math.min(top, max));
    while (isHidden(hidden, t) && t < layout.lines.length - 1) t++;
    return t;
  }

  /** Keep the cursor inside the view with `scrolloff` rows of margin. */
  ensureCursorVisible(view: View, layout: Layout): void {
    const so = Math.max(0, Math.min(this.app.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
    this.app.lens.follow(view, layout);
    const hidden = this.app.lens.hidden(view, layout);
    if (!hidden.length) {
      if (view.cur.row < view.top + so) view.top = view.cur.row - so;
      else if (view.cur.row > view.top + view.height - 1 - so) view.top = view.cur.row - view.height + 1 + so;
    } else {
      const d = this.app.lens.visibleBetween(hidden, view.top, view.cur.row);
      if (d < so) view.top = this.app.lens.stepVisible(layout, hidden, view.cur.row, -so);
      else if (d > view.height - 1 - so)
        view.top = this.app.lens.stepVisible(layout, hidden, view.cur.row, -(view.height - 1 - so));
    }
    view.top = this.clampTop(view, layout, view.top);
    this.anchorTop(view, layout);
    // Sideways, when wrapping is off: keep the cursor a few columns from either edge. With it on, a code block that
    // scrolls on its own does that for a cursor in it.
    if (this.app.ui.wrap) {
      view.left = 0;
      this.app.code.follow(view, layout);
    } else {
      const w = this.textColumns(view);
      const margin = Math.min(4, Math.floor(w / 4));
      if (view.cur.col < view.left + margin) view.left = view.cur.col - margin;
      else if (view.cur.col > view.left + w - 1 - margin) view.left = view.cur.col - w + 1 + margin;
      view.left = Math.max(0, Math.min(view.left, Math.max(0, extentOf(layout) - w)));
    }
  }

  /** Start a selection anchored at `anchor`, remembering it in source terms too. */
  select(view: View, anchor: Pos, line: boolean): void {
    view.sel = { anchor, line, src: this.cursorAnchorFor(this.app.currentLayout(view), anchor) };
  }

  /** The selection's first and last lines as the buffer's `'<` `'>` marks, which move with the text. */
  markSelection(view: View, layout: Layout = this.app.currentLayout(view)): void {
    if (!view.sel) return;
    const x = layout.lines[view.sel.anchor.row]?.src ?? 1;
    const y = layout.lines[view.cur.row]?.src ?? 1;
    const starts = view.buf.lineStarts();
    view.buf.visualMarks = [starts[Math.min(x, y) - 1] ?? 0, starts[Math.max(x, y) - 1] ?? 0];
  }

  /** Scroll by rows; the cursor moves with the view (ctrl+d/u, pages) or only as needed (wheel). */
  scrollBy(view: View, delta: number, moveCursor: boolean): void {
    this.app.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.app.currentLayout(view);
    const hidden = this.app.lens.hidden(view, layout);
    view.top = this.clampTop(view, layout, this.app.lens.stepVisible(layout, hidden, view.top, delta));
    this.anchorTop(view, layout);
    const last = Math.max(0, layout.lines.length - 1);
    let row = view.cur.row;
    if (moveCursor) row = Math.max(0, Math.min(this.app.lens.stepVisible(layout, hidden, view.cur.row, delta), last));
    else {
      // The wheel: the cursor moves only to stay on screen, scrolloff rows in.
      const so = Math.max(0, Math.min(this.app.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
      const rows = this.app.lens.screenRows(view, layout);
      const lo = rows[Math.min(so, rows.length - 1)] ?? 0;
      const hi = rows[Math.max(0, rows.length - 1 - so)] ?? last;
      if (view.cur.row < lo || isHidden(hidden, view.cur.row)) row = lo;
      else if (view.cur.row > hi) row = hi;
    }
    if (row !== view.cur.row) {
      view.cur = { row, col: snap(layout, row, this.app.code.layoutCol(view, layout, row, view.goal)) };
      view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    }
    if (moveCursor) this.ensureCursorVisible(view, layout);
  }

  /** vim's zz / zt / zb: scroll so the cursor's row is in the middle, at the top or the bottom. */
  scrollCursorTo(view: View, where: "center" | "top" | "bottom"): void {
    const layout = this.app.currentLayout(view);
    const hidden = this.app.lens.hidden(view, layout);
    // zt and zb keep ui.scrolloff rows to the edge, as the view always does (and H and L land there).
    const so = Math.max(0, Math.min(this.app.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
    const up = where === "top" ? so : where === "center" ? Math.floor((view.height - 1) / 2) : view.height - 1 - so;
    view.top = this.clampTop(view, layout, this.app.lens.stepVisible(layout, hidden, view.cur.row, -up));
    this.anchorTop(view, layout);
  }

  /** vim's H / M / L: the row on screen at the top, the middle or the bottom (scrolloff rows in,
   *  unless the note's edge is on screen), its first non-blank. */
  screenRow(view: View, where: "top" | "middle" | "bottom"): Pos {
    const layout = this.app.currentLayout(view);
    const rows = this.app.lens.screenRows(view, layout);
    if (!rows.length) return view.cur;
    const so = Math.max(0, Math.min(this.app.config.ui.scrolloff, Math.floor((rows.length - 1) / 2)));
    const lastShown = rows[rows.length - 1] === layout.lines.length - 1;
    const i =
      where === "top"
        ? view.top === 0
          ? 0
          : so
        : where === "bottom"
          ? lastShown
            ? rows.length - 1
            : rows.length - 1 - so
          : Math.floor((rows.length - 1) / 2);
    const row = rows[Math.max(0, Math.min(i, rows.length - 1))]!;
    return { row, col: 0 };
  }

  // -------------------------------------------------------------------------------------------
  // Tasks (ctrl+l, a click on [ ]): checked and unchecked in the note, through App.writeBuffer.

  /** The task item at the cursor: the innermost one whose source lines hold the cursor's row. */
  taskAt(view: View): { line: number; end: number; checked: boolean } | null {
    const layout = this.app.currentLayout(view);
    const src = layout.lines[view.cur.row]?.src;
    if (src === undefined) return null;
    // Source mode and the lens draw the Markdown, no boxes: the task item holding the cursor's line, from the parse.
    if (editable(view)) return view.buf.kind.group === "note" ? taskHolding(view.buf.parsed.tree, src) : null;
    for (let r = view.cur.row; r >= 0; r--) {
      for (const s of layout.lines[r]!.spans) if (s.task && src >= s.task.line && src <= s.task.end) return s.task;
    }
    return null;
  }

  /** Toggle a task's checkbox (plan 4.11): `ctrl+l` (`space n t`), or a click on it. */
  toggleTaskAt(view: View, task = this.taskAt(view)): void {
    if (!task) return this.app.message("info", "no task here — ctrl+l toggles a list item's [ ]");
    const buf = view.buf;
    // Read through a link not followed now (VV-D6): nothing read or written through it, nor its text changed.
    if (buf.throughLink)
      return this.app.message(
        "warn",
        `${buf.key}: not toggled — ${buf.readOnly ?? "read through a link not followed"}`,
      );
    // Read-only (a peek, a hover, a file as it was in git): its file is never written from here.
    if (buf.readOnly) return this.app.message("info", buf.readOnly);
    if (buf.deleted) return this.app.message("warn", `${buf.key} was deleted on disk — nothing to toggle`);
    if (buf.dirty || buf.virtual) {
      // Unsaved changes, or no file at all (a report): toggle in the buffer (an undo step), not on disk under them.
      const r = toggleTask(new TextEncoder().encode(buf.source), task.line);
      if (!r) return this.app.message("warn", `line ${task.line} has no task marker`);
      const at =
        buf.lineStarts()[task.line - 1]! +
        /\[([ xX])\]/.exec(buf.source.slice(buf.lineStarts()[task.line - 1]!))!.index +
        1;
      buf.edit(at, 1, r.checked ? "x" : " ");
      return this.app.message("info", r.checked ? "done ✓ (unsaved)" : "not done (unsaved)");
    }
    if (buf.changedOnDisk()) {
      // Line numbers may have moved: show the new version first.
      this.app.watch.reloadBuffer(buf);
      return this.app.message("warn", `${this.app.displayName(buf)} changed on disk — reloaded; toggle again`);
    }
    let bytes: Uint8Array;
    try {
      bytes = readRegular(buf.abs);
    } catch (err) {
      return this.app.message("error", `can't read ${buf.key}: ${(err as Error).message}`);
    }
    const r = toggleTask(bytes, task.line);
    if (!r) return this.app.message("warn", `line ${task.line} of ${buf.key} has no task marker`);
    if (this.app.writeBuffer(buf, r.bytes)) this.app.message("info", r.checked ? "done ✓" : "not done");
  }

  selectionText(view: View): string {
    if (!view.sel) return "";
    // Made while typing: the text between its ends, the character after the cursor not taken (DF-D15).
    const typed = typedSelection(this.app, view);
    if (typed) return view.buf.source.slice(typed[0], typed[1]);
    if (this.app.isCodeDocument(view.buf) && !view.source && !view.live) return this.app.code.selectionText(view);
    return selectedText(this.app.currentLayout(view), view.sel, view.cur);
  }

  /** The edits made to the current note as one undo step, then saved; `done` said when they are. */
  applyNoteEdits(edits: TextEdit[], done: string, cursorAfter?: number): void {
    const view = this.app.view;
    if (!view) return;
    const buf = view.buf;
    // Asked again when it's made: the file can go while a question is open.
    const why = cannotEdit(view);
    if (why) return this.app.message("warn", `${why} — not editing`);
    const before = view.cur;
    buf.beginStep(offsetOf(this.app, view));
    const order = edits.map((e, i) => ({ e, i })).sort((a, b) => b.e.at - a.e.at || b.i - a.i);
    // The edits' new lines (`\n`) as the note's own: a CRLF note stays CRLF.
    for (const { e } of order) buf.edit(e.at, e.length, buf.eol === "\n" ? e.text : e.text.replace(/\r?\n/g, buf.eol));
    buf.endStep(cursorAfter ?? offsetOf(this.app, view));
    for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
    // Where the cursor was: in source mode, past what was typed before it; rendered, its row.
    if (cursorAfter !== undefined && this.app.currentLayout(view).lines[before.row]?.srcMap)
      placeAt(this.app, view, cursorAfter);
    if (this.app.saving.save(buf, true)) this.app.message("info", done);
    // Any other failure has said why already.
    else if (buf.changedOnDisk() && !buf.deleted)
      this.app.message("warn", `${done} — not saved yet (the file changed on disk: space n w decides)`);
  }

  private bracketMemo: {
    buf: NoteBuffer;
    version: number;
    at: number;
    insert: boolean;
    marks: Map<number, { from: number; to: number }[]> | null;
  } | null = null;

  /**
   * The bracket at the cursor and the one matching it (25.3), each by its source line and its place in it, for the view
   * to mark — in source mode; while typing, the bracket just before the cursor too. Null where it's on none.
   */
  bracketMarks(view: View): Map<number, { from: number; to: number }[]> | null {
    if (!view.source) return null;
    const at = offsetOf(this.app, view);
    const m = this.bracketMemo;
    if (m && m.buf === view.buf && m.version === view.buf.version && m.at === at && m.insert === !!view.insert)
      return m.marks;
    const text = view.buf.source;
    let here = matchBracket(text, at) >= 0 ? at : -1;
    if (here < 0 && view.insert && at > 0 && matchBracket(text, at - 1) >= 0) here = at - 1;
    let marks: Map<number, { from: number; to: number }[]> | null = null;
    if (here >= 0) {
      marks = new Map();
      const starts = view.buf.lineStarts();
      for (const o of [here, matchBracket(text, here)]) {
        const line = lineOf(view, o);
        const col = o - (starts[line - 1] ?? 0);
        marks.set(line, [...(marks.get(line) ?? []), { from: col, to: col + 1 }]);
      }
    }
    this.bracketMemo = { buf: view.buf, version: view.buf.version, at, insert: !!view.insert, marks };
    return marks;
  }
}

/** Wrapping off: how wide a note is laid out first, to find its natural width. */
const NOWRAP_PROBE = 2000;
const naturalWidths = new WeakMap<Layout, number>();

/**
 * The widest real row of a very wide layout: trailing spaces don't count, nor does a trailing run
 * of one repeated glyph (a rule, or the tail of a titled rule like `── ≡ properties ────`), nor
 * right-aligned decorations far out (a code block's language label).
 */
function naturalWidth(layout: Layout): number {
  let max = 0;
  for (const line of layout.lines) {
    let col = 0;
    let end = 0;
    // The current run of one glyph: its glyph, where it started, and the end before it.
    let run = "";
    let runStart = 0;
    let before = 0;
    for (const span of line.spans) {
      for (const g of graphemes(span.text)) {
        const w = graphemeWidth(g);
        if (g.trim() && col < layout.width * 0.75) {
          if (g !== run) {
            run = g;
            runStart = col;
            before = end;
          }
          end = col + w;
        }
        col += w;
      }
    }
    if (run && end - runStart > 20) end = before;
    max = Math.max(max, end);
  }
  return max;
}

/** The task whose checkbox glyph is at this cell, if any (its trailing space doesn't count). */
export function taskMarkAt(
  layout: Layout,
  row: number,
  col: number,
): { line: number; end: number; checked: boolean } | null {
  let x = 0;
  for (const s of layout.lines[row]?.spans ?? []) {
    const w = stringWidth(s.text);
    if (s.task && col >= x && col < x + stringWidth(s.text.trimEnd())) return s.task;
    x += w;
  }
  return null;
}

/**
 * Text of a selection from `sel.anchor` to the cursor, inclusive, in reading order; rows joined
 * with newlines and trailing blanks trimmed. Line selections take whole rows.
 */
export function selectedText(layout: Layout, sel: Selection, cur: Pos): string {
  const [a, b] = ordered(sel.anchor, cur);
  const out: string[] = [];
  for (let r = a.row; r <= b.row; r++) {
    const cs = cells(layout.lines[r]);
    const from = sel.line || r !== a.row ? 0 : a.col;
    const to = sel.line || r !== b.row ? Number.POSITIVE_INFINITY : b.col;
    // A grapheme is selected when any of its cells is — so a wide character counts once.
    out.push(
      cs
        .filter((c) => c.x + c.w > from && c.x <= to)
        .map((c) => c.g)
        .join("")
        .replace(/\s+$/, ""),
    );
  }
  return out.join("\n");
}
