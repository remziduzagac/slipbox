// A buffer: one open note, its text, and its layouts cached per width (3.3). Views (panes) hold
// a buffer plus their own scroll position; two panes may show the same buffer.
//
// Phase 3: the text can be edited (source mode). `source` is the truth; every change goes through
// `edit`, which keeps an undo history in steps (an insert session is one step) and marks the
// buffer dirty until it is saved. The parse is redone only when something needs it (the rendered
// layout), not on every keystroke.

import type { Diagnostic } from "vscode-languageserver-protocol";
import type { Problem } from "../core/diagnostics.ts";
import type { LintIssue } from "../core/lint.ts";
import type { Glyphs } from "../core/glyphs.ts";
import { parseData } from "../core/data.ts";
import type { FileKind } from "../core/filetypes.ts";
import { newRenderCache } from "../core/layout/render.ts";
import type { Graph } from "../core/graph.ts";
import { readText, type Stamp, stamp } from "../core/fsutil.ts";
import type { Layout } from "../core/layout/ir.ts";
import { layoutNote, type NoteRenderOptions } from "../core/note.ts";
import { layoutSource, newSourceCache } from "../core/layout/source.ts";
import { headingsOf, newParseCache, noteChunks, type ParsedNote, parseMarkdown, slugify } from "../core/parse.ts";
import { parseInBackground } from "../core/parse-pool.ts";
import { countWords } from "../core/words.ts";
import { readerFor } from "../core/readers.ts";
import type { CodeModel, CommentLink, OutlineEntry, Span as SyntaxSpan, SyntaxError } from "../core/syntax.ts";
import { codeBlocks, layoutCode } from "../core/layout/code.ts";

/** One change to the text: at `at`, `removed` was replaced by `inserted`. */
export interface TextEdit {
  at: number;
  removed: string;
  inserted: string;
}

/** An undo step: its edits in order, and the cursor (a source offset) before and after. */
interface UndoStep {
  edits: TextEdit[];
  before: number;
  after: number;
}

/** A note with at least this much to parse is parsed on other threads (15.1): about 6,000 lines. */
export const BACKGROUND_PARSE = 128 * 1024;

export class NoteBuffer {
  source = "";
  private parsedNote: ParsedNote = parseMarkdown("");
  private parsedVersion = 0;
  /** Bumped by every change to `source`; `savedVersion` is the one on disk. */
  version = 0;
  private savedVersion = 0;
  /** The text as on disk, so undoing back to it is clean again. */
  private savedText = "";
  private dirtyMemo = { version: -1, dirty: false };
  /** The file started with a UTF-8 BOM (kept on save); its lines end in CRLF (kept for new ones). */
  bom = false;
  eol: "\n" | "\r\n" = "\n";
  private undoStack: UndoStep[] = [];
  private redoStack: UndoStep[] = [];
  private openStep: UndoStep | null = null;
  stamp: Stamp | null = null;
  /** Read at least once: later loads are reloads, kept in the undo history. */
  private loaded = false;
  invalidUtf8 = false;
  deleted = false;
  /** When the file last changed under us (ms since epoch), for the change marker. */
  changedAt = 0;
  private layouts = new Map<string, Layout>();
  /** Source mode's rows line by line, reused across keystrokes (only a changed line is laid out). */
  private readonly sourceCache = newSourceCache();
  /** The note's parse in chunks, reused across edits and reloads (only a changed chunk re-parses). */
  private readonly parseCache = newParseCache();
  /** The render's blocks, reused across edits and reloads (only a changed block renders again). */
  private renderCache = newRenderCache();

  /** The linter's findings (3.21), and the version of the text they're for (the file as saved). */
  lint: { version: number; issues: LintIssue[] } | null = null;
  /** Its problems bar is kept (19.9): it has had problems, and the text keeps its place as they go. */
  problemBar = false;
  /** Its language servers' problems (19.1, 19.8), by server, with the version of the text they were found in. */
  serverProblems = new Map<string, { version: number; list: Problem[]; raw: Diagnostic[] }>();
  /** The version of its text its servers were last told. */
  serverVersion = -1;
  /** Its linters' problems without a server (19.19), by linter, with the version of the text they were found in;
   *  and the versions last linted — as typed (linters reading their input), and as saved (the others). */
  linterProblems = new Map<string, { version: number; list: Problem[] }>();
  linted = { typed: -1, saved: -1 };
  /** Its language server's symbols as an outline (19.14), for a file tree-sitter has none of. */
  serverOutline: OutlineEntry[] | null = null;

  /** The text's parse, running on other threads (15.1): until it lands, a view shows it's reading. */
  parsing: Promise<void> | null = null;
  /** The threads couldn't parse this note: the main thread does, as for any note. */
  private parseFailed = false;

  /** A buffer that isn't a file of its own (3.20): its text given, saved by `save` (into a note's
   *  frontmatter), never read from or compared with the disk. */
  virtual: { save: (text: string) => boolean } | null = null;

  /** What the file is (16.1): a note, a data file or a text file — which modes and layouts it has. */
  kind: FileKind = { group: "note", format: "markdown" };

  /**
   * What tree-sitter last found in a source file (16.7–16.9), and for which version: spans of lines
   * inside multi-line strings and comments, the outline, syntax errors. The app refreshes it
   * shortly after edits stop; until then the layout uses it as it is.
   */
  syntax: { version: number; spans: Map<number, SyntaxSpan[]>; outline: OutlineEntry[]; errors: SyntaxError[]; links: CommentLink[]; languages: Map<number, string>; code: CodeModel | null } | null = null;
  /** The code view's runs of imports unfolded (24.5), by their first line. */
  readonly codeOpen = new Set<number>();
  /** The code view's cells folded to their header (24.13), by their first line. */
  readonly codeFolded = new Set<number>();

  constructor(
    /** Vault-relative path, or null for a file outside the vault (e.g. the scratch). */
    readonly rel: string | null,
    readonly abs: string,
    /** Vault-relative path for anything inside the vault, else the absolute path. */
    readonly key: string = rel ?? abs,
  ) {}

  get name(): string {
    return (this.rel ?? this.abs).split("/").pop()!;
  }

  /** A virtual buffer's text, as if just read (3.20): clean, its own undo history from here. */
  loadText(text: string): void {
    this.source = text;
    this.version++;
    this.loaded = true;
    this.savedVersion = this.version;
    this.savedText = text;
    this.layouts.clear();
  }

  /** Read from disk. Returns false when the file is gone. */
  load(): boolean {
    if (this.virtual) return true;
    try {
      const d = readText(this.abs);
      this.bom = d.bom;
      this.eol = d.crlf ? "\r\n" : "\n";
      this.invalidUtf8 = d.invalidUtf8;
      if (this.loaded && d.text !== this.source) {
        // A reload is one more undo step (4.5): the new text replaces the old where they differ,
        // so `u` brings back what was here — an agent's rewrite, or :e! dropping your changes.
        this.endStep(0);
        let head = 0;
        const a = this.source;
        const b = d.text;
        while (head < a.length && head < b.length && a[head] === b[head]) head++;
        let tail = 0;
        while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
        this.edit(head, a.length - head - tail, b.slice(head, b.length - tail), head);
      } else if (!this.loaded) {
        this.source = d.text;
        this.version++;
      }
      this.loaded = true;
      this.conflictKept = false;
      this.markers = false;
      this.conflictWaiting = false;
      this.savedVersion = this.version;
      this.savedText = this.source;
      this.stamp = stamp(this.abs);
      this.deleted = false;
      this.layouts.clear();
      return true;
    } catch {
      this.deleted = true;
      return false;
    }
  }

  /** True when the file on disk differs from what we loaded. */
  changedOnDisk(): boolean {
    if (this.virtual) return false;
    const s = stamp(this.abs);
    if (!s) return !this.deleted;
    return !this.stamp || s.mtimeMs !== this.stamp.mtimeMs || s.size !== this.stamp.size;
  }

  invalidateLayouts(): void {
    this.layouts.clear();
    // What a render reads besides the text changed (the graph, the theme, how widths count): no
    // block or source row is reusable.
    this.renderCache = newRenderCache();
    Object.assign(this.sourceCache, newSourceCache());
  }

  /**
   * A big note's parse, begun on other threads (15.1): when what's left to parse of the current
   * text — the chunks its cache hasn't got — is at least `BACKGROUND_PARSE` characters (a first
   * open, a reload that changed most of it). True while one runs; then `parsed` finds it done.
   */
  parseAhead(): boolean {
    if (this.parsing) return true;
    if (this.parseFailed || this.parsedVersion === this.version || this.source.length < BACKGROUND_PARSE) return false;
    if (this.kind.group !== "note" || this.kind.format !== "markdown" || this.virtual) return false;
    let missing = 0;
    for (const c of noteChunks(this.source)) if (!this.parseCache.chunks.has(c.text)) missing += c.text.length;
    if (missing < BACKGROUND_PARSE) return false;
    this.parsing = parseInBackground(this.source, this.parseCache)
      .then((ok) => {
        if (!ok) this.parseFailed = true;
      })
      .catch(() => {
        this.parseFailed = true;
      })
      .finally(() => {
        this.parsing = null;
      });
    return true;
  }

  /** The parse of the current text, redone only when the text changed since. */
  get parsed(): ParsedNote {
    if (this.parsedVersion !== this.version) {
      // A data file is read by its format's reader (16.11–16.13): the same tree, sections as
      // headings, keys as fields.
      if (this.kind.group === "data") {
        const d = parseData(this.kind.format, this.source);
        this.parsedNote = { tree: d.tree, frontmatter: null, source: this.source, error: d.error };
      } else this.parsedNote = readerFor(this.kind.format).parse(this.source, this.parseCache);
      this.parsedVersion = this.version;
    }
    return this.parsedNote;
  }

  /** Different from the text on disk (as loaded or saved) — undoing back to it is clean. */
  get dirty(): boolean {
    if (this.version === this.savedVersion) return false;
    if (this.dirtyMemo.version !== this.version) this.dirtyMemo = { version: this.version, dirty: this.source !== this.savedText };
    return this.dirtyMemo.dirty;
  }

  /** The file's content for `source`: with its BOM again. */
  contentToSave(): string {
    return (this.bom ? "\uFEFF" : "") + this.source;
  }

  /** After (K)eep yours in the conflict prompt: autosave is off for it until a confirmed save. */
  conflictKept = false;
  /** A merge left conflict markers in it: autosave is off until you save it yourself. */
  markers = false;
  /** Changed on disk while you were typing into it: the conflict prompt waits for esc. */
  conflictWaiting = false;

  /** The text as last loaded or saved: the merge base. */
  get baseText(): string {
    return this.savedText;
  }

  /** The file on disk is now `diskText` (after a merge): unsaved is measured against it. */
  rebase(diskText: string): void {
    this.savedText = diskText;
    this.savedVersion = -1;
    this.dirtyMemo = { version: -1, dirty: false };
    this.stamp = stamp(this.abs);
    this.conflictKept = false;
  }

  /** The text on disk is now this version (after a save). */
  markSaved(written?: Stamp): void {
    this.savedVersion = this.version;
    this.savedText = this.source;
    this.stamp = written ?? stamp(this.abs);
    this.conflictKept = false;
    this.markers = false;
  }

  /** Vim's change list (`g;` `g,`): where the text was changed, oldest first, as offsets kept in
   *  step with later edits; a change on the line of the one before replaces it. */
  changes: number[] = [];
  /** Where `g;` / `g,` are in `changes` (its length: past the newest). */
  changeAt = 0;
  /** Where the last insert session ended (`gi`). */
  lastInsert: number | null = null;
  /** The last selection's first and last lines (`'<` `'>`), as the offsets of their starts kept in
   *  step with later edits — vim's marks, which move with the text: `:'<,'>s` works on them. */
  visualMarks: [number, number] | null = null;

  /** Keep `'<` `'>` on their lines through an edit (an undo or redo too): lines inserted at a marked
   *  line's start go above it, and a mark in deleted text collapses to the line after, as vim's do. */
  private moveMarks(at: number, length: number, text: string): void {
    if (!this.visualMarks) return;
    const d = text.length - length;
    const move = (o: number) => (o > at ? Math.max(at, o + d) : o === at && !length && text.includes("\n") ? o + text.lastIndexOf("\n") + 1 : o);
    this.visualMarks = [move(this.visualMarks[0]), move(this.visualMarks[1])];
  }

  /** Replace `length` characters at `at` with `text`; part of the open undo step, else a step of
   *  its own (the cursor offsets given). */
  edit(at: number, length: number, text: string, cursor = at): void {
    const removed = this.source.slice(at, at + length);
    if (!removed && !text) return;
    const d = text.length - removed.length;
    const shift = (o: number) => (o > at ? Math.max(at, o + d) : o);
    this.changes = this.changes.map(shift);
    if (this.lastInsert !== null) this.lastInsert = shift(this.lastInsert);
    this.moveMarks(at, length, text);
    this.source = this.source.slice(0, at) + text + this.source.slice(at + length);
    const last = this.changes[this.changes.length - 1];
    if (last !== undefined && !this.source.slice(Math.min(last, at), Math.max(last, at)).includes("\n")) this.changes[this.changes.length - 1] = at;
    else {
      this.changes.push(at);
      if (this.changes.length > 100) this.changes.shift();
    }
    this.changeAt = this.changes.length;
    this.version++;
    this.layouts.clear();
    const e = { at, removed, inserted: text };
    if (this.openStep) this.openStep.edits.push(e);
    else {
      this.undoStack.push({ edits: [e], before: cursor, after: at + text.length });
      this.redoStack = [];
    }
  }

  /** Group the edits until `endStep` into one undo step (an insert session, a compound command). */
  beginStep(cursor: number): void {
    if (!this.openStep) this.openStep = { edits: [], before: cursor, after: cursor };
  }

  endStep(cursor: number): void {
    const step = this.openStep;
    this.openStep = null;
    if (!step?.edits.length) return;
    step.after = cursor;
    this.undoStack.push(step);
    this.redoStack = [];
  }

  /** Undo the last step: the cursor offset to go back to, or null when there's nothing. */
  undo(): number | null {
    this.endStep(0);
    const step = this.undoStack.pop();
    if (!step) return null;
    for (const e of [...step.edits].reverse()) this.replace(e.at, e.inserted.length, e.removed);
    this.redoStack.push(step);
    return step.before;
  }

  redo(): number | null {
    const step = this.redoStack.pop();
    if (!step) return null;
    for (const e of step.edits) this.replace(e.at, e.removed.length, e.inserted);
    this.undoStack.push(step);
    return step.after;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || !!this.openStep?.edits.length;
  }

  private replace(at: number, length: number, text: string): void {
    this.moveMarks(at, length, text);
    this.source = this.source.slice(0, at) + text + this.source.slice(at + length);
    this.version++;
    this.layouts.clear();
  }

  private wordMemo = { version: -1, words: 0 };

  /** Words in the text (a note's frontmatter not counted), counted once per edit. */
  words(): number {
    if (this.wordMemo.version !== this.version) this.wordMemo = { version: this.version, words: countWords(this.source, this.kind.group === "note") };
    return this.wordMemo.words;
  }

  /** Where each line starts (UTF-16 offsets), for the current version. */
  lineStarts(): number[] {
    if (this.starts?.version === this.version) return this.starts.at;
    const at = [0];
    for (let i = this.source.indexOf("\n"); i >= 0; i = this.source.indexOf("\n", i + 1)) at.push(i + 1);
    this.starts = { version: this.version, at };
    return at;
  }

  private starts: { version: number; at: number[] } | null = null;

  /** The text's lines (split at \n; a CRLF line keeps its \r), computed once per version. */
  lines(): string[] {
    if (this.split?.version !== this.version) this.split = { version: this.version, lines: this.source.split("\n") };
    return this.split.lines;
  }

  private split: { version: number; lines: string[] } | null = null;

  /** The raw markdown as a layout (source mode, 4.13), its headings the render's: the parse's, or
   *  while editing scanned from the text the way the render reads them. */
  sourceLayout(width: number, wrap: boolean, glyphs: Glyphs): Layout {
    const key = `src:${width}:${wrap ? 1 : 0}`;
    let l = this.layouts.get(key);
    if (!l) {
      // With a parse of this very text at hand, its headings (the render's text and slugs);
      // otherwise the ATX lines the layout finds as it goes — so a keystroke, or an undo back to
      // the saved text, never re-parses the note (a 1 MB note would take a second).
      const parsed = this.parsedVersion === this.version && !this.dirty;
      // A note is coloured and its headings scanned by its format's reader (16.2); other files
      // are highlighted by their language, with no headings from the text (a `# comment` in a
      // shell script is no heading) — a source file's outline (16.8) stands in for them.
      const note = this.kind.group === "note" ? readerFor(this.kind.format) : null;
      // Tree-sitter's outline where it has one; else the language server's symbols (19.14).
      const outline = this.syntax?.outline.length ? this.syntax.outline : (this.serverOutline ?? []);
      const code = outline.map((o) => ({ level: Math.min(6, o.depth + 1), text: o.name, slug: slugify(o.name), src: o.line }));
      const fromParse = () => headingsOf(this.parsed.tree).map(({ depth, text, slug, line, id }) => ({ level: depth, text, slug, src: line, ...(id ? { id } : {}) }));
      const headings = !note ? code : parsed ? fromParse() : note.language === null ? "scan" : note.scanHeadings(this.source);
      const spans = this.syntax?.spans;
      const langs = this.syntax?.languages;
      l = layoutSource(
        this.source,
        { width, wrap, headings, language: note ? note.language : this.kind.format, ...(spans ? { spans: (line: number) => spans.get(line) } : {}), ...(langs?.size ? { languageAt: (line: number) => langs.get(line) } : {}) },
        this.sourceCache,
      );
      if (this.layouts.size >= 6) this.layouts.delete(this.layouts.keys().next().value!);
      this.layouts.set(key, l);
    }
    return l;
  }

  /** The notes its layouts draw inside it (1.11), by absolute path: a change to one re-lays it out. */
  readonly embedded = new Set<string>();

  /**
   * The code view (24.x): the file as a document, from source mode's rows (a row per line) and what its parse says —
   * the parse of this text, or the last one while it's parsed again (its lines may have moved: the view is redrawn
   * when it lands).
   */
  codeLayout(width: number, wrap: boolean, glyphs: Glyphs, cells: "box" | "band" = "box", problems: readonly { line: number; severity: Problem["severity"] }[] = []): Layout {
    const marks = problems.map((p) => `${p.line}${p.severity[0]}`).join(",");
    const key = `code:${width}:${wrap ? 1 : 0}:${glyphs.mode}:${cells}:${[...this.codeOpen].join(",")}:${[...this.codeFolded].join(",")}:${marks}:${this.syntax?.version ?? -1}`;
    let l = this.layouts.get(key);
    if (!l) {
      const base = this.sourceLayout(1, false, glyphs);
      const spans = this.syntax?.spans;
      const fresh = this.syntax?.version === this.version;
      l = layoutCode(this.source, base, fresh ? (this.syntax?.code ?? null) : null, { width, wrap, glyphs, open: this.codeOpen, folded: this.codeFolded, cells, problems, inside: (line) => !!spans?.get(line)?.length });
      if (this.layouts.size >= 6) this.layouts.delete(this.layouts.keys().next().value!);
      this.layouts.set(key, l);
    }
    return l;
  }

  /** The code's blocks for the lens (24.8): its doc comments, its imports, its lines. */
  codeBlocks(lineCount: number): [number, number][] {
    const fresh = this.syntax?.version === this.version;
    const spans = fresh ? this.syntax?.spans : undefined;
    return codeBlocks(this.lines(), fresh ? (this.syntax?.code ?? null) : null, lineCount, (line) => !!spans?.get(line)?.some((s) => s.from === 0));
  }

  /** The note laid out; `pictures` (12.x): how its pictures are drawn, and a key that changes when they would. */
  layout(width: number, glyphs: Glyphs, showUrls: boolean, graph: Graph | null, pictures?: { picture: NonNullable<NoteRenderOptions["picture"]>; key: string }): Layout {
    const key = `${width}:${glyphs.mode}:${showUrls ? 1 : 0}:${pictures?.key ?? "-"}`;
    let l = this.layouts.get(key);
    if (!l) {
      l = layoutNote(this.parsed, graph, this.rel, { width, glyphs, showUrls, ...(pictures ? { picture: pictures.picture } : {}) }, this.renderCache);
      for (const p of l.embedded ?? []) this.embedded.add(p);
      // Keep the last few widths (a drag back and forth, a toggle and back): evict the oldest.
      if (this.layouts.size >= 6) this.layouts.delete(this.layouts.keys().next().value!);
      this.layouts.set(key, l);
    }
    return l;
  }
}
