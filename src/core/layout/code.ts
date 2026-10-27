// The code view (plan 24.x, blueprint/design/code-view.md): a source file read as a notebook. Its prose — the file's
// comments, each definition's documentation (JSDoc, a docstring: Google, NumPy, reST) — at full width; its code in
// cells, one per definition (a class: its head, then a cell per method), each in a box or on a band with a header —
// the definition's kind and name, its lines, its problems, and buttons — and the separator comments as section rules.
//
// Inside a cell every token of code is drawn as written; the whitespace and the decoration are the view's own: where a
// long line breaks and how its rest is indented, indent guides, dimming, bold. A comment there is a note: its marker
// gone, in the comments' colour. The rows of code start from source mode's (one per line, unwrapped: highlighted, and
// kept between edits by the buffer's source cache), so each carries a `srcMap` — every cell mapped to its place in the
// line — and the cursor, find, a selection and problem marks land where they are in the file. Prose rows are placed
// by line, as a rendered note's are.

import { readDoc } from "../documents/model/docformats.ts";
import type { Severity } from "../documents/diagnostics/diagnostics.ts";
import type { Glyphs } from "../glyphs.ts";
import { slugify } from "../documents/markdown/parse.ts";
import { expandTabs } from "../foundation/text/sanitize.ts";
import type {
  CodeComment,
  CodeDef,
  CodeDoc,
  CodeImports,
  CodeModel,
  OutlineEntry,
} from "../documents/syntax/syntax.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, stringWidth, truncate } from "../foundation/text/width.ts";
import {
  A_BOLD,
  A_DIM,
  A_ITALIC,
  type Layout,
  type LayoutHeading,
  type LayoutLink,
  type Line,
  type Span,
} from "./ir.ts";
import { renderMarkdown } from "./render.ts";

export interface CodeLayoutOptions {
  /** Columns to lay out in; with `wrap` off, a line runs on and the layout is as wide as its longest. */
  width: number;
  wrap: boolean;
  glyphs: Glyphs;
  /** The runs of imports unfolded, by their first line. */
  open: ReadonlySet<number>;
  /** The cells folded to their header, by their first line. */
  folded?: ReadonlySet<number>;
  /** How a cell is drawn: in a box, or on a band. */
  cells?: "box" | "band";
  /** The file's problems, by the line each starts on: a cell's header counts its own. */
  problems?: readonly { line: number; severity: Severity }[];
  /** Whether a line is inside a string or comment that spans lines (its blank lines are its text: never folded). */
  inside?: (line: number) => boolean;
  /** The paths in the file's comments that name a file (16.10), by line: as written, and where each goes. In the
   *  comments' prose they're drawn as links, as source mode draws them. */
  paths?: readonly CommentPath[];
  /** The file's outline (16.8), as source mode heads it: the definitions' headings (the breadcrumb, `]]`) are its
   *  entries — a function inside a function, an impl by its outline's name — not only the cells. Without it, the
   *  cells'. */
  outline?: readonly OutlineEntry[];
}

/** A path in a comment that names a file: its line, its text as written (`notes/plan.md:12`), where it goes. */
export interface CommentPath {
  line: number;
  text: string;
  target: string;
}

/** A cell drawn: its grapheme, width, its offset in its line (UTF-16), its role and attributes. */
interface Cell {
  g: string;
  w: number;
  at: number;
  role: Role;
  attrs: number;
}

/** Where a long line may break: before cell `i`, at bracket depth `depth`. */
interface Break {
  i: number;
  depth: number;
}

const QUIET = /^[{};]$/;
const CONTINUE = 4;
const SEVERITY_ORDER: Severity[] = ["error", "warning", "info", "hint"];

/** A comment that's for tools, not readers, kept as written: a shebang, an encoding, a linter's or checker's directive. */
const DIRECTIVE =
  /^(!|-\*-|eslint|prettier-|biome-|@ts-|ts-|tslint:|istanbul |c8 |jshint|global |noqa|type:\s*ignore|pyright:|mypy:|pylint:|fmt:|isort:|pragma|nolint|go:|\+build|endregion\b|#endregion\b)/;
/** A comment that's code put aside: kept as written (dimmed), not read as prose. */
const CODELIKE =
  /([;{}]\s*$)|(^(const|let|var|return|import|export|function|def|class|from|if|elif|for|while|print|self\.|this\.)\b.*[(=:{])|(^[\w.]+\(.*\)\s*;?$)/;
/** A separator comment's title (empty: a rule alone), or null when it isn't one. */
function sectionOf(t: string): string | null {
  if (/^[-=*#~_+]{3,}$/.test(t)) return "";
  const m =
    /^[-=*#~_+]{2,}\s+(.+?)(?:\s+[-=*#~_+]{2,})?$/.exec(t) ??
    /^(?:MARK:\s*-?\s*|#?region\s+|pragma mark\s*-?\s*)(.+)$/i.exec(t);
  return m ? m[1]!.trim() : null;
}
/** A comment's text without its markers: `//`, `#`, `--`, a one-line block comment's — Rust's and Doxygen's inner doc
 *  markers (`//!`, `/*!`) too. */
const unmark = (t: string) => t.replace(/^(\/\/+!?|#+|--+|\/\*+!?)\s?/, "").replace(/\s*\*+\/\s*$/, "");
/** A comment's marker, for telling a tool's directive by what follows it (`#!` a shebang, kept; `//!` a doc). */
const MARKER = /^(\/\/+!?|#|--+|\/\*+!?)/;

/** Documentation a cell holds above its code: a doc comment or docstring, or a run of comment lines. */
type DocPart = { doc: CodeDoc } | { comments: { from: number; to: number; column: number } };

/** A cell: its first and last lines (its documentation's with its code's), where it's drawn, what it's called. */
interface CellSpec {
  from: number;
  to: number;
  /** Its code's first and last lines (after its documentation); the whole cell's when it has none. */
  code?: [number, number];
  /** Its documentation, drawn in it above its code. */
  docs?: DocPart[];
  /** Prose alone: a comment that documents nothing, a module's docstring — its documentation, no code. */
  prose?: boolean;
  column: number;
  mark: string;
  markRole: Role;
  title: string;
  /** The definition it is, for its name's and its kind's decoration; none for a run of statements. */
  def?: CodeDef;
  /** Its language's word for it (`struct`), before its name in its header, in place of `mark`. */
  term?: string;
}

/**
 * The code view's layout of `source`, from `base` (source mode's layout, unwrapped: a row per line) and what the
 * file's parse says (`model`; null while it's parsed: the code alone, a cell per run of lines).
 */
export function layoutCode(source: string, base: Layout, model: CodeModel | null, opts: CodeLayoutOptions): Layout {
  const texts = source.split("\n").map((t) => t.replace(/\r$/, ""));
  if (texts.length > 1 && texts[texts.length - 1] === "") texts.pop();
  const rowOf = new Map<number, Line>();
  for (const l of base.lines) if (!rowOf.has(l.src)) rowOf.set(l.src, l);
  const g = opts.glyphs;
  const width = Math.max(20, opts.width);
  const style = opts.cells ?? "box";
  const folded = opts.folded ?? new Set<number>();
  const defs = model?.defs ?? [];
  const imports = new Map<number, CodeImports>((model?.imports ?? []).map((m) => [m.start, m]));
  // Documentation where it is, and a definition's docstring drawn above the definition (24.12): its own lines skipped
  // where they are, with the blank lines right after them.
  const docs = new Map<number, CodeDoc>();
  const docEnding = new Map<number, CodeDoc>();
  const docsBefore = new Map<number, CodeDoc[]>();
  const moved = new Set<number>();
  for (const d of model?.docs ?? []) {
    if (d.before === undefined) {
      docs.set(d.start, d);
      docEnding.set(d.end, d);
      continue;
    }
    docsBefore.set(d.before, [...(docsBefore.get(d.before) ?? []), d]);
    for (let k = d.start; k <= d.end; k++) moved.add(k);
    for (let k = d.end + 1; k <= texts.length && !texts[k - 1]!.trim(); k++) moved.add(k);
  }
  // Comments: a line that's only a comment, and one after code (a note beside it).
  const lineComment = new Map<number, CodeComment>();
  const trailing = new Map<number, CodeComment>();
  for (const c of model?.comments ?? []) (c.trailing ? trailing : lineComment).set(c.line, c);
  const nameAt = new Map<number, CodeDef>();
  for (const d of defs) if (!nameAt.has(d.name.line)) nameAt.set(d.name.line, d);
  const unit = indentUnit(texts);
  const notes = noteColumns(texts, trailing, rowOf, width);
  const blank = (l: string | undefined, ln: number) => !l?.trim() && !opts.inside?.(ln);
  const lines: Line[] = [];
  const links: LayoutLink[] = [];
  /** The headings: a section's (level 1), a cell's (its definition's depth under the sections). */
  const heads: { section: boolean; depth: number; text: string; row: number; src: number }[] = [];
  /** A folded cell's header row, by its definition's line. */
  const shutAt = new Map<number, number>();
  const cellsOut: NonNullable<Layout["cells"]> = [];
  let natural = 0;
  const push = (l: Line) => {
    lines.push(l);
    const w = l.spans.reduce((n, s) => n + stringWidth(s.text), 0);
    if (w > natural) natural = w;
  };
  // A blank row before a box and around a section's rule (none twice) — and after a box when what follows isn't one
  // (the next box's own blank row sets the two apart): a class's closing brace, a comment kept as written.
  let boxEnded = false;
  const gap = () => {
    boxEnded = false;
    const last = lines[lines.length - 1];
    if (last?.spans.some((s) => s.text.trim())) push({ spans: [], src: last.src, decor: true });
  };
  const afterBox = () => {
    if (boxEnded) gap();
  };
  /** Each cell's header's row and column: the tree lines between a class and its members join them there. */
  const headRows: { row: number; column: number }[] = [];
  /** Where the page's cells are drawn: a class's members two columns in from it, however far the file indents them. */
  let indent = 0;
  const prose = (rows: Line[], comment: boolean, frame?: (l: Line) => Line) => {
    for (const l of rows) {
      const styled = comment
        ? {
            ...l,
            spans: l.spans.map((s) =>
              s.role === "text" ? { ...s, role: "syn_comment" as Role, attrs: s.attrs | A_ITALIC } : s,
            ),
          }
        : l;
      push(frame ? frame(styled) : styled);
    }
  };

  /** A line of code as rows of cells: its own indentation `strip` columns less, decorated, broken to `room`. */
  const codeRows = (ln: number, strip: number, room: number): { cells: Cell[] }[] => {
    let cells = cellsOf(rowOf.get(ln));
    let k = 0;
    while (k < strip && k < cells.length && cells[k]!.g === " ") k++; // strip < 0: on the page, as written
    cells = cells.slice(k);
    // In a cell, the guides from the second level: the first is the box's border.
    decorate(cells, nameAt.get(ln), unit, g, strip >= 0 ? unit : 0);
    const note = trailing.get(ln);
    if (note) cells = noted(cells, note, (notes.get(ln) ?? 0) - k);
    if (!opts.wrap) return [{ cells }];
    // A function's signature that doesn't fit: a parameter a row (24.19).
    const def = nameAt.get(ln);
    return (
      (def?.kind === "function" && signatureRows(cells, def.name.to, room, unit, g, strip >= 0 ? unit : 0)) ||
      breakLine(cells, room, unit, g, strip >= 0 ? unit : 0)
    );
  };

  /**
   * A run of comment lines from `ln` (at most to `to`), at one column, on the page. Prose alone, right above a
   * definition (`documents`): its documentation, returned for its cell. Else drawn: its prose in a box of its own, a
   * separator a section, the rest as written.
   */
  const comments = (
    ln: number,
    to: number,
    column: number,
    documents: (line: number) => boolean,
  ): { next: number; attached?: DocPart } => {
    let end = ln;
    while (end < to && lineComment.get(end + 1)?.column === column && !docs.has(end + 1) && !imports.has(end + 1))
      end++;
    const plain = (k: number) => {
      const t = unmark(texts[k - 1]!.slice(column)).trim();
      const raw = texts[k - 1]!.slice(column).replace(MARKER, "").trim();
      return !DIRECTIVE.test(raw) && !(t && CODELIKE.test(t)) && !(sectionOf(t) !== null && column === 0);
    };
    if (documents(end + 1) && range(ln, end).every(plain))
      return { next: end + 1, attached: { comments: { from: ln, to: end, column } } };
    let para: string[] = [];
    let paraStart = ln;
    const flush = () => {
      if (para.some((t) => t.trim())) {
        const n = para.length;
        cell({
          from: paraStart,
          to: paraStart + n - 1,
          prose: true,
          docs: [{ comments: { from: paraStart, to: paraStart + n - 1, column } }],
          column,
          mark: g.cellNote,
          markRole: "syn_comment",
          title: "comment",
        });
      }
      para = [];
    };
    for (let k = ln; k <= end; k++) {
      const t = unmark(texts[k - 1]!.slice(column)).trimEnd();
      const raw = texts[k - 1]!.slice(column).replace(MARKER, "");
      const section = sectionOf(t.trim());
      if (DIRECTIVE.test(raw.trim()) || (t.trim() && CODELIKE.test(t.trim()))) {
        flush();
        afterBox();
        for (const r of codeRows(k, -1, width)) push(plainRow(r.cells, k, texts[k - 1]!.length));
      } else if (section !== null && column === 0) {
        flush();
        gap();
        push(sectionRow(section, width, k, g));
        heads.push({ section: true, depth: 0, text: section, row: lines.length - 1, src: k });
        push({ spans: [], src: k, decor: true }); // and one after it: a rule's title stands clear of its cells
      } else {
        if (!para.length) paraStart = k;
        para.push(t);
      }
    }
    flush();
    return { next: end + 1 };
  };

  /** A cell: its header, then (unless folded) its lines — code, its comments as notes — in a box or on a band. */
  const cell = (c: CellSpec) => {
    // Its lines from their indentation, `col`, drawn at the page's, `left`.
    const col = Math.min(c.column, Math.max(0, width - 30));
    const left = Math.min(indent, Math.max(0, width - 30));
    const inner = width - left - (style === "box" ? 4 : 2);
    const own = (opts.problems ?? []).filter((p) => p.line >= c.from && p.line <= c.to);
    const shut = folded.has(c.from);
    cellsOut.push({
      from: c.from,
      to: c.to,
      title: c.title,
      ...(c.def ? { name: { line: c.def.name.line, column: c.def.name.from } } : {}),
    });
    // A blank row before a box, so its name stands clear of what's above it (a box has no bottom to set it apart).
    if (style === "box") gap();
    push(cellHeader(c, left, inner, style, own, shut, g));
    const header = lines.length - 1;
    headRows.push({ row: header, column: left });
    // Done: its heading, its first row of code (a folded cell's, its header).
    const done = () => {
      boxEnded = style === "box";
      if (shut && c.def) shutAt.set(c.def.line, header);
      if (!c.def || c.def.kind === "value") return;
      const first = lines.findIndex((l, i) => i > header && l.srcMap);
      heads.push({
        section: false,
        depth: c.def.depth,
        text: c.title,
        row: first > header ? first : header,
        src: c.from,
      });
    };
    if (shut) {
      done();
      return;
    }
    const lineEnd = (k: number) => texts[k - 1]?.length ?? 0;
    const framed = (l: Line): Line => framedRow(l, left, inner, style);
    // A blank row under a box's header, so its name stands clear of what's under it (a comment's box has no name).
    if (style === "box" && !c.prose) push(framed({ spans: [], src: c.from, decor: true }));
    // Its documentation first, as prose; then its code.
    const side = style === "box" ? 2 : 1;
    for (const part of c.docs ?? []) {
      const rows =
        "doc" in part
          ? docRows(texts, part.doc, inner, unit, g, links, lines.length, Number.POSITIVE_INFINITY, left + side, 0)
          : // Line comments holding tags (LuaDoc's, Doxygen's `///`): read as a doc comment is, its terms a list (24.9).
            range(part.comments.from, part.comments.to).some((k) =>
                /^\s*[@\\]\w/.test(unmark(texts[k - 1]!.slice(part.comments.column))),
              )
            ? docRows(
                texts,
                { start: part.comments.from, end: part.comments.to, column: part.comments.column, style: "lines" },
                inner,
                unit,
                g,
                links,
                lines.length,
                Number.POSITIVE_INFINITY,
                left + side,
                0,
              )
            : proseRows(
                range(part.comments.from, part.comments.to).map((k) =>
                  unmark(texts[k - 1]!.slice(part.comments.column)).trimEnd(),
                ),
                part.comments.from,
                0,
                inner,
                unit,
                g,
                links,
                lines.length,
                undefined,
                Number.POSITIVE_INFINITY,
                left + side,
              );
      for (const l of rows) push(framed(l));
    }
    // Between its documentation and its code, a blank row: the two belong together.
    if (c.docs?.length && !c.prose)
      push(
        style === "box"
          ? framed({ spans: [], src: c.code?.[0] ?? c.from, decor: true })
          : { spans: [], src: c.code?.[0] ?? c.from, decor: true, fill: "code_block" },
      );
    let blankRow = false;
    // Prose alone (a comment that documents nothing): no code.
    const [first, last] = c.prose ? [1, 0] : (c.code ?? [c.from, c.to]);
    for (let k = first; k <= last; ) {
      if (moved.has(k)) {
        k++;
        continue;
      }
      if (blank(texts[k - 1], k)) {
        if (!blankRow) push(framed({ spans: [], src: k, srcMap: { cells: [], end: 0 } }));
        blankRow = true;
        k++;
        continue;
      }
      blankRow = false;
      const lc = lineComment.get(k);
      const doc = docs.get(k);
      if (doc) {
        prose(
          docRows(texts, doc, inner, unit, g, links, lines.length, unit, 0, Math.max(0, doc.column - col)),
          true,
          framed,
        );
        k = doc.end + 1;
        continue;
      }
      if (lc && !texts[k - 1]!.slice(0, lc.column).trim()) {
        // A run of comment lines in the code: prose, in the comments' colour; a directive or code put aside, as written.
        let end = k;
        while (end < c.to && lineComment.get(end + 1)?.column === lc.column) end++;
        let para: string[] = [];
        let at = k;
        const flush = () => {
          if (para.some((t) => t.trim()))
            prose(proseRows(para, at, Math.max(0, lc.column - col), inner, unit, g, links, lines.length), true, framed);
          para = [];
        };
        for (let j = k; j <= end; j++) {
          const t = unmark(texts[j - 1]!.slice(lc.column)).trimEnd();
          const raw = texts[j - 1]!.slice(lc.column).replace(MARKER, "");
          if (DIRECTIVE.test(raw.trim()) || (t.trim() && CODELIKE.test(t.trim()))) {
            flush();
            for (const r of codeRows(j, col, inner)) push(framed(plainRow(r.cells, j, lineEnd(j))));
          } else {
            if (!para.length) at = j;
            para.push(t);
          }
        }
        flush();
        k = end + 1;
        continue;
      }
      for (const r of codeRows(k, col, inner)) push(framed(plainRow(r.cells, k, lineEnd(k))));
      k++;
    }
    // A cell's last blank row is the gap's. A box is open at the bottom: the next one's top closes it.
    if (blankRow) lines.pop();
    done();
  };

  /** The cells of a definition — one, or a class's head then its members, each its own — its documentation in it. */
  const definition = (d: CodeDef, docsOf: DocPart[]) => {
    const from = Math.min(
      d.top,
      ...docsOf.map((p) => ("doc" in p ? (p.doc.before === undefined ? p.doc.start : d.top) : p.comments.from)),
    );
    // Its header says what it is in its language's word (`struct: Frame`), else its kind's mark.
    const mark = d.term ? "" : markOf(d, g);
    const term = d.term;
    const markRole: Role = d.kind === "function" ? "syn_function" : d.kind === "value" ? "syn_variable" : "syn_type";
    const title = texts[d.name.line - 1]?.slice(d.name.from, d.name.to) ?? "";
    const kids =
      d.kind === "class"
        ? defs.filter((k) => k.depth === d.depth + 1 && k.top > d.line && k.end <= d.end && k.kind !== "value")
        : [];
    if (!kids.length)
      return cell({
        from,
        to: d.end,
        code: [d.top, d.end],
        docs: docsOf,
        column: d.column,
        mark,
        markRole,
        title,
        def: d,
        term,
      });
    // A class: its head (up to its first member's documentation), then its members on a page of their own.
    const blockOf = (k: CodeDef) => docEnding.get(k.top - 1)?.start ?? k.top;
    let head = Math.min(...kids.map(blockOf)) - 1;
    while (head > d.top && blank(texts[head - 1], head)) head--;
    while (head > d.top && lineComment.has(head)) head--;
    cell({ from, to: head, code: [d.top, head], docs: docsOf, column: d.column, mark, markRole, title, def: d, term });
    if (folded.has(d.top)) return;
    // Its members, to its closing brace (a line of its own after its last member's).
    let body = d.end;
    while (body > Math.max(...kids.map((k) => k.end)) && CLOSING.test(texts[body - 1]!)) body--;
    const start = lines.length;
    const column = indent;
    indent += 2;
    page(head + 1, body, d.depth + 1);
    indent = column;
    // Its closing brace (dimmed as braces are): a row of the class's at its left line, the tree's line on down to it.
    const left = Math.min(column, Math.max(0, width - 30));
    const tail = range(body + 1, d.end).filter((k) => !blank(texts[k - 1], k));
    if (tail.length) afterBox();
    const close = style === "box" && tail.length ? lines.length : undefined;
    if (tail.length) {
      const inner = width - left - (style === "box" ? 4 : 2);
      const col = Math.min(d.column, Math.max(0, width - 30));
      for (const k of tail)
        for (const r of codeRows(k, col, inner))
          push(framedRow(plainRow(r.cells, k, texts[k - 1]!.length), left, inner, style));
    }
    tree(start, left, close);
  };

  /**
   * The tree lines, as the explorer's, from a class's box to its members' (rows from `start`, the class at `column`): its
   * box's left line on down, `├─` to each member's box a row under its top, by its name — the same row for every one,
   * the box's corner kept — `└─` to the last's (a folded box, or a band, at its top: it has no row under it). A class's
   * closing brace (`close`, its row): the line on down to it, its own left line there.
   */
  const tree = (start: number, column: number, close?: number) => {
    const members = headRows.filter((h) => h.row >= start);
    const at = Math.min(...members.map((h) => h.column));
    if (at <= column) return;
    const meets = members
      .filter((h) => h.column === at)
      .map((h) => (lines[h.row + 1]?.frame?.includes(at) ? h.row + 1 : h.row));
    const last = Math.max(...meets);
    for (let r = start; r < (close ?? last + 1); r++) {
      if (!meets.includes(r)) lines[r] = putAt(lines[r]!, column, g.guide, "cell_line");
      else
        lines[r] = joint(
          putAt(
            lines[r]!,
            column,
            `${r === last && close === undefined ? g.guideLast : g.guideBranch}${g.guideDash.repeat(at - column - 1)}`,
            "cell_line",
          ),
          at,
          g,
        );
    }
  };

  /** A page: lines `from`–`to`, the definitions at `depth` its cells, its other runs of code cells too, its comments
   *  and documentation prose, its separator comments sections. */
  const page = (from: number, to: number, depth: number) => {
    const here = new Map<number, CodeDef>();
    for (const d of defs)
      if (d.depth === depth && d.top >= from && d.top <= to && d.kind !== "value" && !here.has(d.top))
        here.set(d.top, d);
    const stops = (k: number) =>
      here.has(k) ||
      docs.has(k) ||
      imports.has(k) ||
      moved.has(k) ||
      (lineComment.has(k) && !texts[k - 1]!.slice(0, lineComment.get(k)!.column).trim());
    // Documentation right above a definition here: its cell's.
    let pending: DocPart[] = [];
    const documents = (k: number) => here.has(k) || (docs.has(k) && here.has(docs.get(k)!.end + 1));
    for (let ln = from; ln <= to; ) {
      if (moved.has(ln) || blank(texts[ln - 1], ln)) {
        pending = [];
        ln++;
        continue;
      }
      const run = depth === 0 ? imports.get(ln) : undefined;
      if (run) {
        const open = opts.open.has(run.start);
        afterBox();
        push(foldRow(run, open, width, g));
        if (open)
          for (let k = run.start; k <= run.end; k++)
            for (const r of codeRows(k, -1, width)) push(plainRow(r.cells, k, texts[k - 1]!.length));
        ln = run.end + 1;
        continue;
      }
      const doc = docs.get(ln);
      if (doc) {
        if (here.has(doc.end + 1)) pending.push({ doc });
        else
          cell({
            from: doc.start,
            to: doc.end,
            prose: true,
            docs: [{ doc }],
            column: doc.column,
            mark: g.cellNote,
            markRole: "syn_comment",
            title: doc.style === "docstring" ? "docstring" : "comment",
          });
        ln = doc.end + 1;
        continue;
      }
      const lc = lineComment.get(ln);
      if (lc && !texts[ln - 1]!.slice(0, lc.column).trim()) {
        const r = comments(ln, to, lc.column, documents);
        if (r.attached) pending.push(r.attached);
        else pending = [];
        ln = r.next;
        continue;
      }
      const d = here.get(ln);
      if (d) {
        definition(d, [...pending, ...(docsBefore.get(d.top) ?? []).map((doc) => ({ doc }))]);
        pending = [];
        ln = d.end + 1;
        continue;
      }
      // A run of statements: to a blank line, a comment line, documentation, a definition.
      let end = ln;
      while (end < to && !stops(end + 1) && !blank(texts[end], end + 1)) end++;
      const values = defs
        .filter((v) => v.kind === "value" && v.top >= ln && v.top <= end)
        .map((v) => texts[v.name.line - 1]?.slice(v.name.from, v.name.to) ?? "");
      pending = [];
      cell({
        from: ln,
        to: end,
        column: Math.min(
          ...range(ln, end)
            .filter((k) => !blank(texts[k - 1], k))
            .map((k) => lead(texts[k - 1]!)),
        ),
        mark: values.length ? g.codeValue : "",
        markRole: "syn_variable",
        title: values.length ? values.join(" · ") : "code",
      });
      ln = end + 1;
    }
  };

  page(1, texts.length, 0);
  if (!lines.length) lines.push({ spans: [], src: 1, srcMap: { cells: [], end: 0 } });
  if (opts.paths?.length) linkPaths(lines, links, opts.paths);
  // The headings (`]]`, the breadcrumb): the sections, then the definitions under them by their depth — the outline's,
  // as source mode heads them, each at its line's first row of code (a folded cell's at its header; one folded away
  // has none); without an outline, the cells'.
  if (model && opts.outline) {
    const codeRow = new Map<number, number>();
    lines.forEach((l, i) => {
      if (l.srcMap && !codeRow.has(l.src)) codeRow.set(l.src, i);
    });
    const outlined = opts.outline.flatMap((o) => {
      const row = shutAt.get(o.line) ?? codeRow.get(o.line);
      return row === undefined ? [] : [{ section: false, depth: o.depth, text: o.name, row, src: o.line }];
    });
    const sections = heads.filter((h) => h.section);
    heads.length = 0;
    heads.push(...[...sections, ...outlined].sort((a, b) => a.row - b.row));
  }
  const under = heads.some((h) => h.section) ? 2 : 1;
  const headings: LayoutHeading[] = [];
  for (const h of heads) {
    const level = h.section ? 1 : Math.min(6, h.depth + under);
    if (lines[h.row]!.heading === undefined) lines[h.row] = { ...lines[h.row]!, heading: headings.length };
    headings.push({ level, text: h.text, slug: slugify(h.text), line: h.row, src: h.src });
  }
  return { lines, links, headings, width: opts.wrap ? width : Math.max(width, natural + 1), cells: cellsOut };
}

const lead = (t: string) => t.length - t.trimStart().length;
/** A class's closing brace, on a line of its own. */
/** A class's closing line: its brace (`};` in C++), or Ruby's and Lua's `end`. */
const CLOSING = /^\s*(\}\s*;?|end)\s*$/;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);

/**
 * A box's left line where a tree line meets it: `┤` (the line drawn into the row, no longer over it) — `┬` on a folded
 * box's top. A band has none: the line touches its header.
 */
function joint(line: Line, at: number, g: Glyphs): Line {
  let c = 0;
  let here = "";
  for (const s of line.spans) for (const gr of graphemes(s.text)) if (c++ === at) here = gr;
  if (here === g.box.tl) return putAt(line, at, g.box.tm, "cell_line");
  if (!line.frame?.includes(at)) return line;
  return { ...putAt(line, at, g.box.mr, "cell_line"), frame: line.frame.filter((x) => x !== at) };
}

/** A row with `text` drawn from column `at` (over its indentation's spaces), spaces added where the row is short. */
function putAt(line: Line, at: number, text: string, role: Role): Line {
  const put = graphemes(text);
  const out: Span[] = [];
  const emit = (t: string, base: Span | null) => {
    const s: Span = base ? { ...base, text: t } : { text: t, role, attrs: 0 };
    const last = out[out.length - 1];
    if (
      last &&
      last.role === s.role &&
      last.attrs === s.attrs &&
      last.src === s.src &&
      last.link === s.link &&
      last.button === s.button
    )
      last.text += t;
    else out.push(s);
  };
  const space: Span = { text: " ", role: "text", attrs: 0 };
  let c = 0;
  for (const s of line.spans) {
    for (const gr of graphemes(s.text)) {
      emit(c >= at && c < at + put.length ? put[c - at]! : gr, c >= at && c < at + put.length ? null : s);
      c++;
    }
  }
  for (; c < at + put.length; c++) emit(c >= at ? put[c - at]! : " ", c >= at ? null : space);
  return { ...line, spans: out };
}

/** A row of code: its cells as spans, each mapped to its place in line `src`. */
function plainRow(cells: Cell[], src: number, end: number): Line {
  return { spans: toSpans(cells, src), src, srcMap: { cells: cells.map((c) => c.at), end } };
}

/**
 * A row inside a cell: `column` in, then a column and a space (the box's border, or the band's edge), the row, and
 * spaces to the cell's right edge — every added cell of a code row mapped where the row's text starts (or ends).
 */
function framedRow(l: Line, column: number, inner: number, style: "box" | "band"): Line {
  const side = style === "box" ? 2 : 1;
  const w = l.spans.reduce((n, s) => n + stringWidth(s.text), 0);
  const left: Span = { text: " ".repeat(column + side), role: "text", attrs: 0 };
  const right: Span = { text: " ".repeat(Math.max(0, inner - w) + side), role: "text", attrs: 0 };
  const out: Line = { ...l, spans: [left, ...l.spans, right], text: [column + side, column + side + w] };
  if (l.srcMap) {
    const first = l.srcMap.cells[0] ?? l.srcMap.end;
    out.srcMap = {
      cells: [
        ...Array(column + side).fill(first),
        ...l.srcMap.cells,
        ...Array(Math.max(0, inner - w) + side).fill(l.srcMap.end),
      ],
      end: l.srcMap.end,
    };
  }
  if (style === "box")
    out.frame = [column]; // its left line: no right one
  else out.fill = "code_block";
  return out;
}

/**
 * A cell's header: in a box, its top border with the cell's kind and name in it; on a band, the band's first row. Then
 * its lines, and its buttons at the right — its problems (`⚠ 2`, opening the panel), where it's used, copy, edit (the
 * lens on it), the scratch, and fold.
 */
function cellHeader(
  c: CellSpec,
  column: number,
  inner: number,
  style: "box" | "band",
  problems: readonly { line: number; severity: Severity }[],
  shut: boolean,
  g: Glyphs,
): Line {
  const key = c.from;
  const total = inner + (style === "box" ? 4 : 2);
  const worst = problems.length ? SEVERITY_ORDER.find((s) => problems.some((p) => p.severity === s))! : null;
  const sign =
    worst === "error"
      ? g.problemError
      : worst === "warning"
        ? g.problemWarn
        : worst === "info"
          ? g.problemInfo
          : g.problemHint;
  const buttons: Span[] = [];
  const add = (text: string, action: string, role: Role = "dim") => {
    if (buttons.length) buttons.push({ text: " ", role: "text", attrs: 0 });
    buttons.push({ text, role, attrs: 0, button: `${action}:${key}` });
  };
  if (worst)
    add(
      `${sign}${problems.length > 1 ? problems.length : ""}`,
      "problems",
      worst === "error" ? "error" : worst === "warning" ? "warn" : "info",
    );
  if (c.def) add(g.cellRefs, "references");
  add(g.cellCopy, "copy");
  add(g.cellEdit, "edit");
  add(g.cellScratch, "scratch");
  add(shut ? g.foldClosed : g.foldOpen, "fold");
  const lines = c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;
  const bw = buttons.reduce((n, s) => n + stringWidth(s.text), 0);
  const box = style === "box";
  const open = box ? `${g.box.tl}${g.box.h} ` : " ";
  const close = box ? ` ${g.box.h.repeat(2)}` : " "; // its top line runs to the edge: no corner
  // A comment's box: its mark alone (`¶`), no title — what it is, it says. A definition's: its word, `struct: ` — the
  // first to go where the name wouldn't fit beside it.
  const fixed = stringWidth(open) + stringWidth(close) + bw + stringWidth(lines) + 4;
  const word = c.term && stringWidth(c.term) + 2 + stringWidth(c.title) <= total - fixed ? `${c.term}: ` : "";
  const markW = word ? stringWidth(word) : c.mark ? stringWidth(c.mark) + (c.prose ? 0 : 1) : 0;
  const room = total - stringWidth(open) - stringWidth(close) - markW - bw - stringWidth(lines) - 4;
  const title = c.prose ? "" : truncate(c.title, Math.max(1, room));
  const fill = Math.max(
    1,
    total - stringWidth(open) - stringWidth(close) - markW - stringWidth(title) - stringWidth(lines) - bw - 3,
  );
  const edge: Role = box ? "cell_line" : "text";
  const spans: Span[] = [
    { text: " ".repeat(column), role: "text", attrs: 0 },
    { text: open, role: edge, attrs: 0 },
  ];
  if (word) spans.push({ text: word, role: "dim", attrs: 0 });
  else if (c.mark) spans.push({ text: c.prose ? c.mark : `${c.mark} `, role: c.markRole, attrs: A_BOLD });
  // A definition's name in the text's own colour, bold — apart from the code's colour for it, below.
  if (title) spans.push({ text: title, role: c.def ? "strong" : "dim", attrs: c.def ? A_BOLD : 0 });
  spans.push({ text: ` ${(box ? g.box.h : " ").repeat(fill)} `, role: edge, attrs: 0 });
  spans.push({ text: `${lines} `, role: "dim", attrs: 0 });
  spans.push(...buttons);
  spans.push({ text: close, role: edge, attrs: 0 });
  // Decoration (a frame row): never the cursor's, no line number — its buttons are clicked. A folded cell's is the cell's
  // one row: the cursor stops there, so the key that folded it opens it again.
  return { spans, src: c.from, ...(shut ? {} : { decor: true }), ...(box ? {} : { fill: "breadcrumb_band" as Role }) };
}

/**
 * Where each line's note goes (its comment after code, in the margin): a run of lines with notes lines them up a
 * column past the longest code among them — unless that's past two thirds of the width; then two columns past each.
 */
function noteColumns(
  texts: string[],
  trailing: Map<number, CodeComment>,
  rowOf: Map<number, Line>,
  width: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const codeWidth = (ln: number) => {
    const c = trailing.get(ln)!;
    let w = 0;
    let end = 0;
    for (const cell of cellsOf(rowOf.get(ln))) {
      if (cell.at >= c.column) break;
      w += cell.w;
      if (cell.g !== " ") end = w;
    }
    return end;
  };
  const lines = [...trailing.keys()]
    .filter((ln) => !DIRECTIVE.test(unmark((texts[ln - 1] ?? "").slice(trailing.get(ln)!.column)).trim()))
    .sort((a, b) => a - b);
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j]! + 1) j++;
    const run = lines.slice(i, j + 1);
    const col = Math.max(...run.map(codeWidth)) + 2;
    for (const ln of run) out.set(ln, col <= width * (2 / 3) ? col : codeWidth(ln) + 2);
    i = j + 1;
  }
  return out;
}

/** A row's comment after its code as a note: its markers gone, its text in the comments' colour, slanted, at `column`. */
function noted(cells: Cell[], note: CodeComment, column: number): Cell[] {
  const k = cells.findIndex((c) => c.at >= note.column);
  if (k < 0 || !column) return cells;
  let text = k;
  while (text < cells.length && /[/#*-]/.test(cells[text]!.g)) text++;
  while (text < cells.length && cells[text]!.g === " ") text++;
  let end = cells.length;
  while (
    end > text &&
    /[*/ ]/.test(cells[end - 1]!.g) &&
    cells
      .slice(text, end)
      .map((c) => c.g)
      .join("")
      .endsWith("*/")
  )
    end--;
  const code = cells.slice(0, k);
  while (code.length && code[code.length - 1]!.g === " ") code.pop();
  const w = code.reduce((n, c) => n + c.w, 0);
  const at = cells[text]?.at ?? note.column;
  const pad = Array.from(
    { length: Math.max(2, column - w) },
    (): Cell => ({ g: " ", w: 1, at, role: "text", attrs: 0 }),
  );
  return [
    ...code,
    ...pad,
    ...cells.slice(text, end).map((c) => ({ ...c, role: "syn_comment" as Role, attrs: A_ITALIC })),
  ];
}

/** A separator comment as a section's rule: `── Title ───…` across the width (a rule alone without a title). */
function sectionRow(title: string, width: number, src: number, g: Glyphs): Line {
  const head = title ? `${g.rule.repeat(2)} ` : "";
  const name = title ? truncate(title, Math.max(1, width - 6)) : "";
  const rest = Math.max(0, width - stringWidth(head) - stringWidth(name) - (title ? 1 : 0));
  const spans: Span[] = [];
  if (head) spans.push({ text: head, role: "rule", attrs: 0, src });
  if (name) spans.push({ text: `${name} `, role: "h3", attrs: A_BOLD, src });
  spans.push({ text: g.rule.repeat(rest), role: "rule", attrs: 0, src });
  return { spans, src };
}

/** A line's indentation in front of prose: the guides of its levels from `from` (none on the page), then spaces. */
function indentSpans(column: number, unit: number, g: Glyphs, from = unit): Span[] {
  const out: Span[] = [];
  for (let c = 0; c < column; c++) {
    const guide = c >= from && c % unit === 0;
    const text = guide ? g.guide : " ";
    const role: Role = guide ? "tree_guide" : "text";
    const last = out[out.length - 1];
    if (last && last.role === role) last.text += text;
    else out.push({ text, role, attrs: 0 });
  }
  return out;
}

/** Prose (a comment's, a doc's body) rendered as markdown at `column`: line k of `text` is source line `first + k`. */
function proseRows(
  text: string[],
  first: number,
  column: number,
  width: number,
  unit: number,
  g: Glyphs,
  links: LayoutLink[],
  rowBase: number,
  map?: number[],
  guidesFrom = unit,
  shift = 0,
): Line[] {
  const at = (k: number) => (map ? (map[k] ?? map[map.length - 1] ?? 0) + first : first + k);
  const indent = Math.min(column, Math.max(0, width - 20));
  // The author's line breaks kept: each line its own row (a markdown hard break), wrapped when it's too long.
  const md = renderMarkdown(text.join("  \n"), { width: Math.max(10, width - indent), glyphs: g, showUrls: false });
  const before = links.length;
  for (const l of md.links)
    links.push({ ...l, line: l.line < 0 ? -1 : rowBase + l.line, col: l.col + indent + shift, src: at(l.src - 1) });
  return md.lines.map((l) => {
    const spans: Span[] = l.spans.map((s) => ({
      ...s,
      ...(s.src !== undefined ? { src: at(s.src - 1) } : {}),
      ...(s.link !== undefined ? { link: s.link + before } : {}),
    }));
    return { spans: [...indentSpans(indent, unit, g, guidesFrom), ...spans], src: at(Math.max(1, l.src) - 1) };
  });
}

/**
 * The code's blocks for the lens (24.8), covering lines 1..`lineCount`: a doc comment, a run of imports, or a line —
 * each with the blank lines after it; a string or comment that spans lines stays with the line it starts on.
 */
export function codeBlocks(
  texts: string[],
  model: CodeModel | null,
  lineCount: number,
  continues: (line: number) => boolean,
): [number, number][] {
  const starts: number[] = [];
  const whole = [...(model?.docs ?? []), ...(model?.imports ?? [])].sort((a, b) => a.start - b.start);
  let w = 0;
  for (let ln = 1; ln <= lineCount; ln++) {
    while (w < whole.length && whole[w]!.end < ln) w++;
    const run = whole[w];
    if (run && ln >= run.start && ln <= run.end) {
      if (ln === run.start) starts.push(ln);
      continue;
    }
    if (texts[ln - 1]?.trim() && !continues(ln)) starts.push(ln);
  }
  if (!starts.length || starts[0]! > 1) starts.unshift(1);
  return starts.map((s, i) => [s, (starts[i + 1] ?? lineCount + 1) - 1]);
}

/**
 * The lens's blocks with each cell whole (24.16) — its documentation with its code; a class's head, its doc, its
 * fields — when it fits (`fits`: its rows within the lens's maximum), and which blocks those are, by their first line.
 * A cell too tall stays its lines' blocks.
 */
export function cellBlocks(
  blocks: [number, number][],
  cells: readonly { from: number; to: number }[],
  fits: (from: number, to: number) => boolean,
): { blocks: [number, number][]; whole: Set<number> } {
  const ends = new Map(cells.map((c) => [c.from, c.to]));
  const out: [number, number][] = [];
  const whole = new Set<number>();
  for (let i = 0; i < blocks.length; ) {
    const to = ends.get(blocks[i]![0]);
    let j = i;
    while (to !== undefined && j + 1 < blocks.length && blocks[j + 1]![0] <= to) j++;
    const cell: [number, number] = [blocks[i]![0], blocks[j]![1]];
    if (to !== undefined && fits(cell[0], cell[1])) {
      out.push(cell);
      whole.add(cell[0]);
      i = j + 1;
    } else out.push(blocks[i++]!);
  }
  return { blocks: out, whole };
}

/** The margin's mark for a definition's kind. */
function markOf(def: CodeDef, g: Glyphs): string {
  return def.kind === "function"
    ? g.codeFunction
    : def.kind === "class"
      ? g.codeClass
      : def.kind === "type"
        ? g.codeType
        : g.codeValue;
}

/** The file's indentation step: the least indentation a line of code has (2 by default, at most 8), a tab as wide as
 *  its rows draw it (Go's, C's) — a doc comment's ` * ` lines and other odd ones aside. */
function indentUnit(texts: string[]): number {
  let unit = 0;
  for (const raw of texts) {
    const t = expandTabs(raw);
    const lead = /^ */.exec(t)![0].length;
    if (lead > 1 && lead < 9 && t.trim() && !t.trimStart().startsWith("*") && (!unit || lead < unit)) unit = lead;
  }
  return unit || 2;
}

/** A source row's cells, from its spans and its map: the graphemes drawn, each with its offset. */
function cellsOf(row: Line | undefined): Cell[] {
  const out: Cell[] = [];
  if (!row) return out;
  const at = row.srcMap?.cells ?? [];
  let k = 0;
  for (const s of row.spans) {
    for (const gr of graphemes(s.text))
      out.push({ g: gr, w: graphemeWidth(gr), at: at[k++] ?? 0, role: s.role, attrs: s.attrs });
  }
  return out;
}

const inText = (c: Cell) => c.role === "syn_string" || c.role === "syn_comment";

/**
 * The decoration a row of code gets: guides in its indentation, braces and semicolons dimmed, and on a definition's
 * line its name bold and what comes before it (export, async, function…) dimmed.
 */
function decorate(cells: Cell[], def: CodeDef | undefined, unit: number, g: Glyphs, from = 0): void {
  let lead = 0;
  while (lead < cells.length && cells[lead]!.g === " ") lead++;
  if (lead < cells.length)
    for (let c = from; c < lead; c += unit) cells[c] = { ...cells[c]!, g: g.guide, role: "tree_guide" };
  for (const c of cells) if (QUIET.test(c.g) && !inText(c)) c.attrs |= A_DIM;
  dimReceivers(cells);
  if (!def) return;
  for (const c of cells) {
    if (c.at >= def.name.from && c.at < def.name.to) c.attrs |= A_BOLD;
    else if (c.at < def.name.from && c.g !== " " && c.role !== "tree_guide") c.attrs |= A_DIM;
  }
}

/** A receiver and its access (24.21), dimmed: `this.`, `self.`, `$this->`, `this->` — so the member it reaches stands out.
 *  A bare one (`return this`) is the value, and stays; so does one in a string or a comment. */
function dimReceivers(cells: Cell[]): void {
  const word = (c: Cell | undefined) => !!c && /^[\w$]$/.test(c.g);
  for (let i = 0; i < cells.length; i++) {
    const start = cells[i]!.g === "$" ? i + 1 : i;
    const name = cells
      .slice(start, start + 4)
      .map((c) => c.g)
      .join("");
    if ((name !== "this" && name !== "self") || word(cells[i - 1]) || cells.slice(i, start + 4).some(inText)) continue;
    const after = start + 4;
    const access = cells[after]?.g === "." ? 1 : cells[after]?.g === "-" && cells[after + 1]?.g === ">" ? 2 : 0;
    if (!access || word(cells[after + access]) === false) continue;
    for (let k = i; k < after + access; k++) cells[k]!.attrs |= A_DIM;
    i = after + access - 1;
  }
}

/** Where a row of code may break: after an opening bracket, after a comma, before `&&` `||` `??` ` ? ` `and` `or` or a
 *  chained `.`. */
function breaksOf(cells: Cell[], from: number): Break[] {
  const out: Break[] = [];
  let depth = 0;
  const at = (i: number, s: string) =>
    cells
      .slice(i, i + s.length)
      .map((c) => c.g)
      .join("") === s;
  for (let i = from; i < cells.length; i++) {
    const c = cells[i]!;
    if (inText(c)) continue;
    if ("([{".includes(c.g)) {
      depth++;
      if (i + 1 < cells.length && !")]}".includes(cells[i + 1]!.g)) out.push({ i: i + 1, depth });
    } else if (")]}".includes(c.g)) depth = Math.max(0, depth - 1);
    else if (c.g === ",") {
      let j = i + 1;
      while (j < cells.length && cells[j]!.g === " ") j++;
      if (j < cells.length) out.push({ i: j, depth });
    } else if (
      cells[i - 1]?.g === " " &&
      (at(i, "&& ") || at(i, "|| ") || at(i, "?? ") || at(i, "? ") || at(i, "and ") || at(i, "or "))
    )
      out.push({ i, depth });
    else if (c.g === "." && cells[i - 1]?.g === ")") out.push({ i, depth });
  }
  return out;
}

/**
 * A function's signature that doesn't fit `width`, a parameter a row (24.19): its line up to the `(` after its name,
 * each parameter four columns further in (one too long broken as any row is), then its `)` and the rest back at the
 * line's indentation. Null where it fits, or its `)` isn't on this line, or it has no parameters: then it's any row.
 */
function signatureRows(
  cells: Cell[],
  nameEnd: number,
  width: number,
  unit: number,
  g: Glyphs,
  guidesFrom: number,
): { cells: Cell[] }[] | null {
  if (cells.reduce((n, c) => n + c.w, 0) <= width) return null;
  const open = cells.findIndex((c) => c.at >= nameEnd && c.g === "(" && !inText(c));
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  const commas: number[] = [];
  for (let i = open; i < cells.length && close < 0; i++) {
    const c = cells[i]!;
    if (inText(c)) continue;
    if ("([{".includes(c.g)) depth++;
    else if (")]}".includes(c.g) && --depth === 0) close = i;
    else if (c.g === "," && depth === 1) commas.push(i);
  }
  if (close < 0 || !cells.slice(open + 1, close).some((c) => c.g !== " ")) return null;
  let lead = 0;
  while (lead < cells.length && (cells[lead]!.g === " " || cells[lead]!.role === "tree_guide")) lead++;
  const head = cells.slice(0, open + 1);
  if (head.reduce((n, c) => n + c.w, 0) > width) return null;
  const pad = (n: number, at: number) =>
    Array.from(
      { length: n },
      (_, c): Cell =>
        c < lead && c >= guidesFrom && c % unit === 0
          ? { g: g.guide, w: 1, at, role: "tree_guide", attrs: 0 }
          : { g: " ", w: 1, at, role: "text", attrs: 0 },
    );
  const trim = (part: Cell[]) => {
    let a = 0;
    let b = part.length;
    while (a < b && part[a]!.g === " ") a++;
    while (b > a && part[b - 1]!.g === " ") b--;
    return part.slice(a, b);
  };
  const rows: { cells: Cell[] }[] = [{ cells: head }];
  const bounds = [open, ...commas, close];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const part = trim(cells.slice(bounds[k]! + 1, k + 2 < bounds.length ? bounds[k + 1]! + 1 : bounds[k + 1]!));
    if (part.length)
      rows.push(...breakLine([...pad(lead + CONTINUE, part[0]!.at), ...part], width, unit, g, guidesFrom));
  }
  rows.push(...breakLine([...pad(lead, cells[close]!.at), ...cells.slice(close)], width, unit, g, guidesFrom));
  return rows;
}

/**
 * A row of code in rows no wider than `width`: a line that fits is one row; one that doesn't breaks where its structure
 * allows — the shallowest bracket depth among the breaks that fit, the last of those — its rest four columns further
 * in than the line, with the line's guides. No break that fits: at a space, else wherever it must.
 */
function breakLine(cells: Cell[], width: number, unit: number, g: Glyphs, guidesFrom = 0): { cells: Cell[] }[] {
  const total = cells.reduce((n, c) => n + c.w, 0);
  if (total <= width) return [{ cells }];
  let lead = 0;
  while (lead < cells.length && (cells[lead]!.g === " " || cells[lead]!.role === "tree_guide")) lead++;
  // A comment's rest goes under its text (past `//`, `#`, `*`, `--`); code's, four columns further in.
  let text = lead;
  if (cells[lead]?.role === "syn_comment") {
    while (text < cells.length && /[/#*!-]/.test(cells[text]!.g)) text++;
    while (text < cells.length && cells[text]!.g === " ") text++;
  }
  const deeper = text > lead ? text : lead + CONTINUE;
  const indent = deeper <= width / 2 ? deeper : lead;
  const pad = (at: number) =>
    Array.from(
      { length: indent },
      (_, c): Cell =>
        c < lead && c >= guidesFrom && c % unit === 0
          ? { g: g.guide, w: 1, at, role: "tree_guide", attrs: 0 }
          : { g: " ", w: 1, at, role: "text", attrs: 0 },
    );
  const breaks = breaksOf(cells, lead);
  const rows: { cells: Cell[] }[] = [];
  let s = 0;
  for (let first = true; ; first = false) {
    const room = first ? width : width - indent;
    let w = 0;
    let i = s;
    while (i < cells.length && w + cells[i]!.w <= room) w += cells[i++]!.w;
    if (i >= cells.length) {
      const rest = cells.slice(s);
      rows.push({ cells: first ? rest : [...pad(rest[0]?.at ?? 0), ...rest] });
      return rows;
    }
    // Not so early that the row is mostly empty: past a third of the room, when a break there fits.
    const fit = breaks.filter((b) => b.i > s + (first ? lead : 0) && b.i <= i);
    const late = fit.filter((b) => b.i - s >= room / 3);
    const pick = late.length ? late : fit;
    let cut = i;
    if (pick.length) {
      const least = Math.min(...pick.map((b) => b.depth));
      cut = Math.max(...pick.filter((b) => b.depth === least).map((b) => b.i));
    } else {
      for (let k = i - 1; k > s; k--) {
        if (cells[k]!.g === " ") {
          cut = k + 1;
          break;
        }
      }
    }
    if (cut <= s) cut = Math.max(s + 1, i);
    const row = cells.slice(s, cut);
    rows.push({ cells: first ? row : [...pad(row[0]?.at ?? 0), ...row] });
    s = cut;
    while (s < cells.length && cells[s]!.g === " ") s++;
    if (s >= cells.length) return rows;
  }
}

/** Cells as spans: a run per role and attributes. */
function toSpans(cells: Cell[], src: number): Span[] {
  const out: Span[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.role === c.role && last.attrs === c.attrs) last.text += c.g;
    else out.push({ text: c.g, role: c.role, attrs: c.attrs, src });
  }
  return out;
}

/**
 * A run of imports' row: folded, `▸ imports` and the modules (as many as fit) and how many; open, `▾ imports`. A header
 * folded so (24.22): `▸ license · MIT`, `▸ generated · protoc`, else its lines' count.
 */
function foldRow(run: CodeImports, open: boolean, width: number, g: Glyphs): Line {
  const head = `${open ? g.foldOpen : g.foldClosed} ${run.kind ?? "imports"}`;
  if (run.kind) {
    const what = run.modules[0] ?? `${run.end - run.start + 1} lines`;
    const spans: Span[] = [{ text: head, role: "dim", attrs: A_BOLD, src: run.start }];
    if (!open)
      spans.push({
        text: ` · ${truncate(what, Math.max(1, width - stringWidth(head) - 3))}`,
        role: "dim",
        attrs: 0,
        src: run.start,
      });
    return { spans, src: run.start, fold: run.start };
  }
  const count = `(${run.modules.length})`;
  const names = open
    ? ""
    : truncate(run.modules.join(" · "), Math.max(0, width - stringWidth(head) - stringWidth(count) - 5));
  const spans: Span[] = [{ text: head, role: "dim", attrs: A_BOLD, src: run.start }];
  if (names) spans.push({ text: `  ${names}`, role: "dim", attrs: 0, src: run.start });
  spans.push({ text: ` ${count}`, role: "dim", attrs: 0, src: run.start });
  return { spans, src: run.start, fold: run.start };
}

/**
 * Documentation as prose (24.4): its markers gone (a docstring's quotes, dedented), read into prose and a list of
 * terms whatever its format (`docformats.ts`), the prose rendered as markdown at its column and the terms under it —
 * each name, then what it is, its type dimmed after. Placed by line: what it says is where its source line is.
 */
function docRows(
  texts: string[],
  doc: CodeDoc,
  width: number,
  unit: number,
  g: Glyphs,
  links: LayoutLink[],
  rowBase: number,
  guidesFrom = Number.POSITIVE_INFINITY,
  shift = 0,
  drawAt = doc.column,
): Line[] {
  const raw = texts.slice(doc.start - 1, doc.end);
  let text: string[];
  if (doc.style === "docstring") {
    text = raw.map((l, k) => {
      let t = k === 0 ? l.trimStart().replace(/^[rRuUbBfF]{0,2}("""|'''|"|')/, "") : l;
      if (k === raw.length - 1) t = t.replace(/("""|'''|"|')\s*$/, "");
      return t;
    });
    // PEP 257: the lines after the first lose their common indentation.
    const rest = text.slice(1).filter((t) => t.trim());
    const common = rest.length ? Math.min(...rest.map((t) => t.length - t.trimStart().length)) : 0;
    text = text.map((t, k) => (k === 0 ? t.trim() : t.slice(common)));
  } else if (doc.style === "lines") text = raw.map((l) => unmark(l.slice(doc.column)).trimEnd());
  else {
    text = raw.map((l, k) => {
      let t = k === 0 ? l.slice(doc.column).replace(/^\/\*+\s?/, "") : l.replace(/^\s*\*(?!\/)\s?/, "");
      if (k === raw.length - 1) t = t.replace(/\s*\*+\/\s*$/, "");
      return t;
    });
  }
  const read = readDoc(text, doc.style);
  const out: Line[] = [];
  if (read.body.some((b) => b.text.trim())) {
    out.push(
      ...proseRows(
        read.body.map((b) => b.text),
        doc.start,
        drawAt,
        width,
        unit,
        g,
        links,
        rowBase,
        read.body.map((b) => b.line),
        guidesFrom,
        shift,
      ),
    );
  }
  if (!read.tags.length) return out.length ? out : [{ spans: [], src: doc.start }];
  if (out.length) out.push({ spans: [], src: doc.start + read.tags[0]!.line, decor: true });
  const indent = Math.min(drawAt, Math.max(0, width - 20));
  const room = Math.max(10, width - indent);
  const termW = Math.min(16, Math.max(...read.tags.map((t) => stringWidth(t.term)))) + 3;
  for (const t of read.tags) {
    const src = doc.start + t.line;
    const descRoom = Math.max(10, room - 2 - termW);
    const words = t.desc.trim() ? wrapWords(t.desc.trim(), descRoom) : [""];
    words.forEach((w, k) => {
      const spans: Span[] = [...indentSpans(indent, unit, g, guidesFrom), { text: "  ", role: "text", attrs: 0 }];
      if (k === 0) spans.push({ text: truncate(t.term, termW - 1).padEnd(termW), role: "fm_key", attrs: 0, src });
      else spans.push({ text: " ".repeat(termW), role: "text", attrs: 0 });
      // Its code spans as the prose's: the backticks gone, the code coloured.
      if (w)
        w.split(/(`[^`]+`)/).forEach(
          (part, j) =>
            part &&
            spans.push(
              j % 2
                ? { text: part.slice(1, -1), role: "code_inline", attrs: 0, src }
                : { text: part, role: "text", attrs: 0, src },
            ),
        );
      if (k === 0 && t.type) spans.push({ text: `${w ? "  " : ""}${t.type}`, role: "dim", attrs: 0, src });
      out.push({ spans, src });
    });
  }
  return out;
}

/** A character a path is made of: one before or after a path's text means it's part of a longer word. */
const PATH_CHAR = /[\w./@~-]/;

/**
 * The comments' paths (16.10) in their prose — a doc's, a comment's box, a comment among code — as links: the text that
 * reads as one where its line says so, split out of its span (a row of code, mapped to the file, is source mode's to
 * draw). Then the links in the order they're drawn, as the keys that go from one to the next expect them.
 */
function linkPaths(lines: Line[], links: LayoutLink[], paths: readonly CommentPath[]): void {
  const byLine = new Map<number, CommentPath[]>();
  for (const p of paths) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);
  const before = links.length;
  lines.forEach((line, row) => {
    if (line.srcMap || line.decor) return;
    const spans: Span[] = [];
    let col = 0;
    let changed = false;
    for (const s of line.spans) {
      const here = s.link === undefined && s.button === undefined ? byLine.get(s.src ?? line.src) : undefined;
      // Where each path is in the span's text, whole (not part of a longer one), the first of any that overlap.
      const hits: { at: number; p: CommentPath }[] = [];
      for (const p of here ?? []) {
        for (let at = s.text.indexOf(p.text); at >= 0; at = s.text.indexOf(p.text, at + 1)) {
          if (!PATH_CHAR.test(s.text[at - 1] ?? "") && !/[\w/]/.test(s.text[at + p.text.length] ?? ""))
            hits.push({ at, p });
        }
      }
      hits.sort((a, b) => a.at - b.at);
      let from = 0;
      let x = col;
      for (const { at, p } of hits) {
        if (at < from) continue;
        if (at > from) spans.push({ ...s, text: s.text.slice(from, at) });
        x += stringWidth(s.text.slice(from, at));
        const id =
          links.push({
            kind: "markdown",
            target: p.target,
            heading: null,
            text: p.text,
            status: "resolved",
            line: row,
            col: x,
            src: p.line,
          }) - 1;
        spans.push({ ...s, text: p.text, role: "link", link: id });
        x += stringWidth(p.text);
        from = at + p.text.length;
        changed = true;
      }
      if (!from) spans.push(s);
      else if (from < s.text.length) spans.push({ ...s, text: s.text.slice(from) });
      col += stringWidth(s.text);
    }
    if (changed) lines[row] = { ...line, spans };
  });
  if (links.length === before) return;
  // In the order drawn: by row, then column; links not drawn (a row cut) last.
  const rowOf = (l: LayoutLink) => (l.line < 0 ? Number.MAX_SAFE_INTEGER : l.line);
  const order = links
    .map((_, i) => i)
    .sort((a, b) => rowOf(links[a]!) - rowOf(links[b]!) || links[a]!.col - links[b]!.col || a - b);
  const to = new Map(order.map((old, i) => [old, i]));
  const sorted = order.map((i) => links[i]!);
  sorted.forEach((l, i) => (links[i] = l));
  for (const [row, line] of lines.entries()) {
    if (!line.spans.some((s) => s.link !== undefined)) continue;
    lines[row] = {
      ...line,
      spans: line.spans.map((s) => (s.link === undefined ? s : { ...s, link: to.get(s.link)! })),
    };
  }
}

/** Words in rows no wider than `width` (a word longer than that is cut). */
function wrapWords(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of text.split(/\s+/)) {
    if (!row) row = word;
    else if (stringWidth(row) + 1 + stringWidth(word) <= width) row += ` ${word}`;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows.map((r) => truncate(r, width));
}
