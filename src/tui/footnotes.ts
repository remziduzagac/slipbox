// The footnotes view (3.17): the note's footnotes, each with its references unfolded under it, jumped to, added,
// edited, renamed and deleted.

import { cannotEdit, offsetOf, placeAt } from "./editing.ts";
import {
  addFootnote,
  deleteFootnote,
  editFootnote,
  type Footnote,
  footnotesOf,
  renameFootnote,
  type TextEdit,
} from "../core/footnotes.ts";
import { stringWidth } from "../core/width.ts";
import { match } from "./match.ts";
import type { App, View } from "./app.ts";

/** The footnotes view. */
export class Footnotes {
  constructor(readonly app: App) {}

  /** The footnotes whose references are unfolded in the footnotes view, by id. */
  opened = new Set<string>();
  private cache: { key: string; list: Footnote[] } | null = null;

  /** The current note's footnotes (3.17), parsed once per version of its text. */
  list(): Footnote[] {
    const buf = this.app.view?.buf;
    if (buf?.kind.group !== "note") return [];
    // Parsing on other threads (15.1): none yet, rather than the whole parse here.
    if (buf.parsing) return [];
    const key = `${buf.key}:${buf.version}`;
    if (this.cache?.key !== key) this.cache = { key, list: footnotesOf(buf.parsed) };
    return this.cache.list;
  }

  /** The footnotes view's rows: each footnote, its references under it when unfolded; filtered by `/`. */
  rows(): FootnoteRow[] {
    const q = this.app.rightView === "footnotes" ? (this.app.outline.filter ?? "") : "";
    const lines = this.app.view?.buf.source.split("\n") ?? [];
    const rows: FootnoteRow[] = [];
    for (const fn of this.list()) {
      const text = `[${fn.label}] ${fn.text ?? "(no definition)"}`;
      if (q && !match(q, text)) continue;
      const folded = !this.opened.has(fn.id);
      rows.push({ fn, ref: null, text, hasChildren: fn.references.length > 0, folded });
      if (folded) continue;
      for (const ref of fn.references) {
        const around = (lines[ref.line - 1] ?? "").trim();
        rows.push({ fn, ref, text: `L${ref.line}  ${around}`, hasChildren: false, folded: false });
      }
    }
    return rows;
  }

  /** Index into rows() of the footnote the cursor's line holds (a reference to it, or its
   *  definition), else the last one before it; -1 with none. */
  current(): number {
    const view = this.app.view;
    if (!view) return -1;
    const line = this.app.cursorLine(view);
    const rows = this.rows();
    const on = rows.findIndex((r) =>
      r.ref ? r.ref.line === line : r.fn.line === line || (r.folded && r.fn.references.some((x) => x.line === line)),
    );
    if (on >= 0) return on;
    let best = -1;
    rows.forEach((r, i) => {
      if (!r.ref && Math.min(r.fn.line ?? Infinity, r.fn.references[0]?.line ?? Infinity) <= line) best = i;
    });
    return best;
  }

  /** Move the note to a footnote row's place: the definition, or that reference — the rendered
   *  reference itself when the window renders the note, the source text's place in source mode. */
  jumpTo(row: FootnoteRow): void {
    const view = this.app.view;
    if (!view) return;
    const layout = this.app.currentLayout(view);
    this.app.history.push(view);
    if (row.ref) {
      const onLine = row.fn.references.filter((r) => r.line === row.ref!.line);
      const nth = onLine.findIndex((r) => r.column === row.ref!.column);
      const drawn = layout.links.filter(
        (l) => l.kind === "footnote" && l.target.toLowerCase() === row.fn.id && l.src === row.ref!.line,
      )[nth];
      if (drawn && drawn.line >= 0) this.app.moveCursor(view, { row: drawn.line, col: drawn.col });
      else placeAt(this.app, view, (view.buf.lineStarts()[row.ref.line - 1] ?? 0) + row.ref.column - 1);
    } else {
      if (row.fn.line === null) return this.app.message("warn", `footnote [^${row.fn.label}] has no definition`);
      const def = layout.lines.findIndex(
        (l) => l.footnoteDef !== undefined && l.footnoteDef.toLowerCase() === row.fn.id,
      );
      if (def >= 0) this.app.moveCursor(view, { row: def, col: 0 });
      else placeAt(this.app, view, view.buf.lineStarts()[row.fn.line - 1] ?? 0);
    }
    this.app.region = "content";
    if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
  }

  // Adding and changing footnotes (3.18): the edits core/footnotes.ts makes, to the buffer as one
  // undo step, then saved — as a task's tick is.

  /**
   * Where a new footnote's `[^N]` goes: while typing, at the cursor; else after the word the cursor
   * is on (on a sign, after the sign). A rendered row maps to its source only by line, so there the
   * word is found in its paragraph's source by how many times it came before; never inside a link's
   * or code's syntax (after it instead).
   */
  refAt(view: View): number {
    const buf = view.buf;
    const src = buf.source;
    const layout = this.app.currentLayout(view);
    const line = layout.lines[view.cur.row];
    const word = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);
    // Out of `[[…]]`, `[…](…)` and `` `…` ``: to their end.
    const outOfSyntax = (at: number, from: number, to: number) => {
      for (const m of src.slice(from, to).matchAll(/!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`/g)) {
        const s = from + m.index;
        if (at > s && at < s + m[0].length) return s + m[0].length;
      }
      return at;
    };
    const starts = buf.lineStarts();
    if (line?.srcMap) {
      const at = offsetOf(this.app, view);
      if (view.insert) return at;
      let end = at;
      // Never past a line's end: a CRLF note's blank line has the cursor on its CR.
      if (word(src[end])) while (word(src[end])) end++;
      else if (end < src.length && src[end] !== "\n" && src[end] !== "\r") end++;
      const ls = starts[line.src - 1] ?? 0;
      const nl = src.indexOf("\n", ls);
      return outOfSyntax(end, ls, nl < 0 ? src.length : src[nl - 1] === "\r" ? nl - 1 : nl);
    }
    // A rendered row: the paragraph's rows up to the cursor's, and its source lines.
    const rowText = (r: number) => layout.lines[r]?.spans.map((s) => s.text).join("") ?? "";
    let first = view.cur.row;
    while (
      first > 0 &&
      rowText(first - 1).trim() &&
      !layout.lines[first - 1]!.srcMap &&
      !layout.lines[first - 1]!.decor
    )
      first--;
    const blockStart = starts[(layout.lines[first]?.src ?? line?.src ?? 1) - 1] ?? 0;
    const blank = /\r?\n[ \t]*\r?\n/g;
    blank.lastIndex = blockStart;
    const blockEnd = blank.exec(src)?.index ?? src.replace(/\s+$/, "").length;
    const text = rowText(view.cur.row);
    // The cursor's column as an index into the row's text.
    let idx = 0;
    for (let w = 0; idx < text.length && w + stringWidth(text[idx]!) <= view.cur.col; idx++)
      w += stringWidth(text[idx]!);
    if (!word(text[idx])) while (idx > 0 && !word(text[idx])) idx--;
    let ws = idx;
    let we = idx;
    while (ws > 0 && word(text[ws - 1])) ws--;
    while (we < text.length && word(text[we])) we++;
    const w = text.slice(ws, we);
    if (!w || !word(w[0])) return blockEnd;
    const whole = (s: string) => [
      ...s.matchAll(
        new RegExp(`(?<![\\p{L}\\p{N}_])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu"),
      ),
    ];
    let k = 0;
    for (let r = first; r < view.cur.row; r++) k += whole(rowText(r)).length;
    k += whole(text.slice(0, ws)).length;
    const hits = whole(src.slice(blockStart, blockEnd));
    const hit = hits[k] ?? hits[hits.length - 1];
    return hit ? outOfSyntax(blockStart + hit.index + w.length, blockStart, blockEnd) : blockEnd;
  }

  /** Whether the current window's note can have footnotes changed: a markdown note of this vault. */
  private canChange(): boolean {
    const view = this.app.view;
    if (view?.buf.kind.group !== "note" || view.buf.rel === null) {
      this.app.message("info", "footnotes are in this vault's notes");
      return false;
    }
    // Deleted on disk, or not valid UTF-8: not edited (its save would bring it back, or change bytes).
    const why = cannotEdit(view);
    if (why) this.app.message("warn", `${why} — not editing`);
    return !why;
  }

  /** Add a footnote (3.18): its text asked; `[^N]` after the cursor's word, `[^N]: text` at the end. */
  add(): void {
    if (!this.canChange()) return;
    const view = this.app.view!;
    const at = this.refAt(view);
    const version = view.buf.version;
    this.app.overlays.prompt("Add a footnote — its text:", (text) => {
      if (!text.trim()) return;
      if (view.buf.version !== version)
        return this.app.message("warn", "the note changed while you typed: add the footnote again");
      const r = addFootnote(view.buf.source, this.list(), at, text);
      this.app.views.applyNoteEdits(r.edits, `added footnote [^${r.label}]`, at + `[^${r.label}]`.length);
    });
  }

  private editRow(row: FootnoteRow): void {
    if (!this.canChange()) return;
    const fn = row.fn;
    if (!fn.def) return this.app.message("warn", `footnote [^${fn.label}] has no definition to edit`);
    this.app.overlays.prompt(`Footnote [^${fn.label}] — its text:`, (text) => {
      if (!text.trim() || text.trim() === fn.text) return;
      const now = this.list().find((f) => f.id === fn.id);
      if (!now) return this.app.message("warn", `footnote [^${fn.label}] isn't there any more`);
      this.app.views.applyNoteEdits(
        editFootnote(this.app.view!.buf.source, now, text),
        `edited footnote [^${fn.label}]`,
      );
    });
    if (this.app.overlay?.kind === "prompt") this.app.overlay.text = fn.text ?? "";
  }

  private deleteRow(row: FootnoteRow): void {
    if (!this.canChange()) return;
    const fn = row.fn;
    const n = fn.references.length;
    this.app.overlays.confirm(
      `Delete footnote [^${fn.label}]: its definition and ${n} reference${n === 1 ? "" : "s"}?`,
      () => {
        const now = this.list().find((f) => f.id === fn.id);
        if (!now) return this.app.message("warn", `footnote [^${fn.label}] isn't there any more`);
        this.app.views.applyNoteEdits(
          deleteFootnote(this.app.view!.buf.source, now),
          `deleted footnote [^${fn.label}]`,
        );
      },
    );
  }

  private renameRow(row: FootnoteRow): void {
    if (!this.canChange()) return;
    const fn = row.fn;
    this.app.overlays.prompt(`Rename footnote [^${fn.label}] to:`, (text) => {
      const label = text.trim().replace(/^\[\^|\]$/g, "");
      if (!label || label === fn.label) return;
      const list = this.list();
      const now = list.find((f) => f.id === fn.id);
      if (!now) return this.app.message("warn", `footnote [^${fn.label}] isn't there any more`);
      let edits: TextEdit[];
      try {
        edits = renameFootnote(this.app.view!.buf.source, now, list, label);
      } catch (err) {
        return this.app.message("warn", (err as Error).message);
      }
      this.app.views.applyNoteEdits(edits, `renamed footnote [^${fn.label}] → [^${label}]`);
    });
    if (this.app.overlay?.kind === "prompt") this.app.overlay.text = fn.label;
  }

  /** The footnotes view's keys (the outline's keymap): move, jump, fold its references, filter, close, leave. */
  action(action: string): void {
    this.app.outline.pinned = false;
    if (action === "filter") {
      this.app.outline.filtering = true;
      return;
    }
    const rows = this.rows();
    const row = rows[this.app.outline.selected];
    switch (action) {
      case "down":
        this.app.outline.selected = Math.min(rows.length - 1, this.app.outline.selected + 1);
        break;
      case "up":
        this.app.outline.selected = Math.max(0, this.app.outline.selected - 1);
        break;
      case "top":
        this.app.outline.selected = 0;
        break;
      case "bottom":
        this.app.outline.selected = rows.length - 1;
        break;
      case "jump":
        if (row) this.jumpTo(row);
        break;
      case "fold":
        if (!row) break;
        // A reference: to its footnote; a footnote: its references folded.
        if (row.ref) this.app.outline.selected = rows.findIndex((r) => r.fn === row.fn && !r.ref);
        else this.opened.delete(row.fn.id);
        break;
      case "unfold":
        if (row?.hasChildren) this.opened.add(row.fn.id);
        break;
      case "add":
        return this.add();
      case "edit":
      case "delete":
      case "rename":
        if (!row) return this.app.message("info", "no footnote selected");
        return action === "edit" ? this.editRow(row) : action === "delete" ? this.deleteRow(row) : this.renameRow(row);
      case "close":
        this.app.panels.showOutline(false);
        break;
      case "leave":
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
        break;
      default:
        this.app.message("error", `unknown footnotes action: ${action}`);
    }
  }
}

/**
 * One row of the footnotes view (3.17): a footnote — its label and text — or, unfolded under it,
 * one of its references with its line.
 */
export interface FootnoteRow {
  fn: Footnote;
  /** A reference's row: where it is. */
  ref: { line: number; column: number } | null;
  /** What the row shows (and the filter matches). */
  text: string;
  hasChildren: boolean;
  folded: boolean;
}
