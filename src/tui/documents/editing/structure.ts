// The structure keys (EG-D6, EG-D7), for a window: the text objects `f` `c` `a` `o` in code and `h` `l` `o` `k` in a
// note, the syntax jumps `] f` `] a` `] o` and their `[` halves, and growing the selection (`alt+o`, `alt+i`). A note's
// nodes are its Markdown tree's, from the parse of its text as it is; code's are its grammar's, from a query run in the
// syntax worker beside its pass — a code file's from the file's pass (`Languages.syntaxNow`, waited for when the text
// changed since), a note's fenced block's from a pass of its own, in its language. The pure work is
// `core/documents/editing/structure.ts`'s; here, which text, and where the cursor and the selection go.

import type { App, View } from "../../app/runtime/app.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import { type CodeObject, type CodeStructure, grammarForFence } from "../../../core/documents/syntax/syntax.ts";
import { structureOnThread } from "../../../core/documents/syntax/syntax-thread.ts";
import {
  codeFound,
  enclosing,
  type Fence,
  type Found,
  type NoteStructure,
  nextStart,
  noteStructure,
  objectAt,
  type Piece,
  type Span,
  spansOf,
  trimmed,
  wordAt,
} from "../../../core/documents/editing/structure.ts";
import { editable } from "./editable.ts";
import * as E from "./editing.ts";
import * as C from "./cursor.ts";

/** The text objects' letters it answers, after `i` or `a`: code's, then a note's (`o` is both: the fence in a note). */
export const STRUCTURE_OBJECTS = new Set(["f", "c", "a", "o", "h", "l", "k"]);

const CODE_KINDS: Record<string, CodeObject["kind"]> = { f: "function", c: "class", a: "argument", o: "block" };

/** What a syntax jump goes to. */
export type JumpKind = "function" | "argument" | "block";

/** How many fenced blocks' structures are kept, by their language and text. */
const FENCES_KEPT = 64;

/** Code's structure placed in the text a window shows: a code file's own, or a note's fenced blocks'. */
interface Code {
  objects: CodeObject[];
  /** Node ranges as pairs (`from, to, …`), each list placed by its shift. */
  nodes: { pairs: ArrayLike<number>; shift: number }[];
}

/** A step grown from: a selection, or the cursor with none. */
type Step = Span | number;

export class Structure {
  constructor(private readonly app: App) {}

  /** A note's structure, by its buffer, for the text it was made of. */
  private readonly notes = new WeakMap<NoteBuffer, { version: number; structure: NoteStructure }>();
  /** Fenced blocks' structures, by their grammar and code: the last asked, kept while a note is worked on. */
  private readonly fenced = new Map<string, Promise<CodeStructure | null>>();
  /** The steps `alt+o` grew through, by window (EG-D7): `alt+i` goes back along them while the selection is the one it
   *  made, in the text it was made in; any other change of the selection drops them. */
  private readonly steps = new WeakMap<View, { version: number; last: Span; stack: Step[] }>();

  /** A note's structure (a Markdown note's; null for any other file). */
  note(view: View): NoteStructure | null {
    const buf = view.buf;
    if (buf.kind.group !== "note" || buf.kind.format !== "markdown") return null;
    const kept = this.notes.get(buf);
    if (kept?.version === buf.version) return kept.structure;
    const structure = noteStructure(buf.source, buf.parsed.tree, buf.lineStarts());
    this.notes.set(buf, { version: buf.version, structure });
    return structure;
  }

  /**
   * Code's structure in the text now: a code file's, from its pass (null: no grammar, or the pass failed); a note's
   * fenced blocks' — those holding `near`, else all — each from a pass of its own.
   */
  private async code(view: View, near?: number): Promise<Code | null> {
    const buf = view.buf;
    const note = this.note(view);
    if (!note) {
      const syntax = await this.app.languages.syntaxNow(buf);
      return syntax
        ? { objects: syntax.structure.objects, nodes: [{ pairs: syntax.structure.nodes, shift: 0 }] }
        : null;
    }
    const version = buf.version;
    const fences = note.fences.filter((f) => near === undefined || (f.code.from <= near && near < f.code.to));
    const parts = await Promise.all(fences.map((f) => this.fence(buf.source, f)));
    if (buf.version !== version) return null;
    const out: Code = { objects: [], nodes: [] };
    for (const part of parts) {
      if (!part) continue;
      out.objects.push(...part.objects);
      out.nodes.push(...part.nodes);
    }
    return out;
  }

  /**
   * A fenced block's code structure, placed in the note. Its lines go to the worker without what the container puts
   * before each (a list's indent, a quote's `>`), as far as the fence's own: Python reads indentation.
   */
  private async fence(source: string, f: Fence): Promise<Code | null> {
    const grammar = grammarForFence(f.lang);
    if (!grammar || f.code.to <= f.code.from) return null;
    const open = source.lastIndexOf("\n", f.from - 1) + 1;
    const prefix = /^[\s>]*/.exec(source.slice(open, f.to))![0].length;
    // Each line sent: where it starts in the text sent, and what to add to a place on it for the note's.
    const lines: { at: number; shift: number }[] = [];
    let text = "";
    for (let at = f.code.from; at < f.code.to; ) {
      const end = source.indexOf("\n", at);
      const stop = end < 0 || end >= f.code.to ? f.code.to : end + 1;
      const line = source.slice(at, stop);
      const cut = Math.min(prefix, /^[\s>]*/.exec(line)![0].length, line.replace(/\r?\n$/, "").length);
      lines.push({ at: text.length, shift: at + cut - text.length });
      text += line.slice(cut);
      at = stop;
    }
    const key = `${grammar}\u0000${text}`;
    let pending = this.fenced.get(key);
    if (!pending) {
      pending = structureOnThread(grammar, text).catch(() => null);
      this.fenced.set(key, pending);
      for (const k of this.fenced.keys()) if (this.fenced.size > FENCES_KEPT) this.fenced.delete(k);
    }
    const s = await pending;
    if (!s) return null;
    // A place in the text sent, placed in the note by its line's shift.
    const place = (t: number) => {
      let lo = 0;
      let hi = lines.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lines[mid]!.at <= t) lo = mid;
        else hi = mid - 1;
      }
      return t + lines[lo]!.shift;
    };
    const objects = s.objects.map((o) => ({
      ...o,
      from: place(o.from),
      to: place(o.to),
      inner: [place(o.inner[0]), place(o.inner[1])] as [number, number],
    }));
    // Nothing cut from any line (a fence at the top level): one shift for all.
    const even = lines.every((l) => l.shift === lines[0]!.shift);
    return {
      objects,
      nodes: [even ? { pairs: s.nodes, shift: lines[0]!.shift } : { pairs: s.nodes.map(place), shift: 0 }],
    };
  }

  /**
   * The text object `kind` (`i` or `a`) and `ch` around `at`, the `count`th outward (EG-D6): in a note `h` `l` `o` `k`
   * by its tree and `f` `c` `a` by its fenced block's code; in code `f` `c` `a` `o` by its grammar. Null: none there.
   */
  async object(view: View, at: number, kind: "i" | "a", ch: string, count = 1): Promise<Piece | null> {
    const source = view.buf.source;
    const starts = view.buf.lineStarts();
    const note = this.note(view);
    let found: Found | null = null;
    if (note && (ch === "h" || ch === "l" || ch === "o" || ch === "k"))
      found = objectAt(
        source,
        note.objects.filter((o) => o.kind === ch),
        at,
        count,
        { ahead: ch === "k" },
      );
    else if (CODE_KINDS[ch]) {
      const code = await this.code(view, note ? at : undefined);
      if (code && view.buf.source === source) {
        // Only those whose lines hold the cursor become objects to choose among: a file's arguments are many.
        const line = E.lineOf(view, at);
        const first = starts[line - 1] ?? 0;
        const last = starts[line] ?? source.length;
        const near = code.objects.filter((o) => o.kind === CODE_KINDS[ch] && o.from < last && o.to >= first);
        found = objectAt(
          source,
          near.map((o) => codeFound(source, starts, o)),
          at,
          count,
          { byInside: ch === "a" },
        );
      }
    }
    if (!found) return null;
    return kind === "a" ? found.outer : found.inner;
  }

  /** `] f` `[ f`, `] a` `[ a`, `] o` `[ o` (EG-D6): the next or previous function, argument or block — in a note, `o`
   *  the next fenced block. A motion: after an operator too. */
  async jump(view: View, what: JumpKind, dir: 1 | -1, count = 1): Promise<void> {
    const buf = view.buf;
    const source = buf.source;
    const at = this.cursorOffset(view);
    const note = this.note(view);
    let starts: number[];
    if (note && what === "block") starts = note.fences.map((f) => f.from);
    else {
      const code = await this.code(view);
      if (buf.source !== source || this.app.view !== view) return;
      if (!code) return this.app.message("info", `no ${what}s here: the file has no grammar slipbox reads`);
      starts = code.objects.filter((o) => o.kind === what).map((o) => (what === "argument" ? o.inner[0] : o.from));
    }
    const to = nextStart(starts, at, dir, count);
    if (to === null)
      return this.app.message(
        "info",
        `no ${note && what === "block" ? "fenced block" : what} ${dir === 1 ? "after" : "before"} the cursor`,
      );
    this.place(view, to);
  }

  /** `alt+o` (EG-D7): the cursor's word selected, in visual mode, with nothing selected; else the node next out. */
  async grow(view: View): Promise<void> {
    if (!editable(view))
      return this.app.message("info", "alt+o grows a selection by the text: in SOURCE view (space n v) or the lens");
    const buf = view.buf;
    const source = buf.source;
    const sel = this.selection(view);
    const at = sel?.from ?? E.offsetOf(this.app, view);
    const kept = this.steps.get(view);
    const steps = kept && kept.version === buf.version && same(kept.last, sel) ? kept.stack : [];
    let next = sel ? null : wordAt(source, at);
    if (!next) {
      const nodes = await this.nodes(view, at);
      if (buf.source !== source || this.app.view !== view) return;
      next = enclosing(nodes, sel ?? { from: at, to: at + 1 });
    }
    if (!next) return this.app.message("info", "the selection is the whole text: nothing bigger to grow to");
    steps.push(sel ?? at);
    this.select(view, next);
    this.steps.set(view, { version: buf.version, last: this.selection(view) ?? next, stack: steps });
  }

  /** `alt+i` (EG-D7): back a step along those `alt+o` grew through; from the first, the cursor alone again. */
  shrink(view: View): void {
    const sel = this.selection(view);
    const kept = this.steps.get(view);
    if (!kept || kept.version !== view.buf.version || !same(kept.last, sel) || !kept.stack.length)
      return this.app.message("info", "alt+i goes back what alt+o grew: nothing grown to go back from");
    const back = kept.stack.pop()!;
    if (typeof back === "number") {
      Object.assign(view, { visual: null, sel: null });
      E.placeAt(this.app, view, back);
      this.steps.delete(view);
      return;
    }
    this.select(view, back);
    kept.last = this.selection(view) ?? back;
  }

  /** The nodes a selection grows through at `at`: a note's tree's, and its fenced block's code there; code's own. Each
   *  without the white space at its ends. */
  private async nodes(view: View, at: number): Promise<Span[]> {
    const source = view.buf.source;
    const note = this.note(view);
    const code = await this.code(view, note ? at : undefined);
    const out: Span[] = note ? [...note.nodes] : [];
    for (const part of code?.nodes ?? [])
      for (const s of spansOf(part.pairs, part.shift)) {
        const t = trimmed(source, s);
        if (t) out.push(t);
      }
    return out;
  }

  /** The selection's text as offsets — whole lines' in visual line mode, else to after its last character — or null. */
  private selection(view: View): Span | null {
    if (!view.sel) return null;
    const [s, e] = C.ordered(view.sel.anchor, view.cur);
    const from = E.offsetAtPos(this.app, view, s);
    const end = E.offsetAtPos(this.app, view, e);
    if (view.visual === "line") return { from: E.lineStart(view, from), to: E.lineEnd(view, end) };
    return { from, to: Math.min(E.nextBoundary(view.buf.source, end), Math.max(end, E.lineEnd(view, end))) };
  }

  /** A span selected, in visual mode by characters, the cursor on its last character. */
  private select(view: View, s: Span): void {
    E.placeAt(this.app, view, s.from);
    view.visual = "char";
    this.app.views.select(view, { ...view.cur }, false);
    E.placeAt(this.app, view, Math.max(s.from, E.prevBoundary(view.buf.source, s.to)));
    this.app.moveCursor(view, view.cur);
  }

  /** The cursor's place in the text: its character in an editable window or on a row of code; else its line's start. */
  private cursorOffset(view: View): number {
    const row = this.app.currentLayout(view).lines[view.cur.row];
    if (editable(view) || row?.srcMap) return E.offsetOf(this.app, view);
    return view.buf.lineStarts()[this.app.cursorLine(view) - 1] ?? 0;
  }

  /** The cursor onto offset `at`: on its character where the window has the text's rows, else onto its line as drawn. */
  private place(view: View, at: number): void {
    const line = E.lineOf(view, at);
    const layout = this.app.currentLayout(view);
    if (editable(view) || layout.lines.some((l) => l.src === line && l.srcMap)) return E.placeAt(this.app, view, at);
    const start = view.buf.lineStarts()[line - 1] ?? 0;
    this.app.placeAtLine(view, line, [...view.buf.source.slice(start, at)].length + 1);
  }
}

const same = (a: Span | null, b: Span | null): boolean =>
  (!a && !b) || (!!a && !!b && a.from === b.from && a.to === b.to);
