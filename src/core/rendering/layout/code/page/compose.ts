// The code page composer: one layout call owns its rows, links, headings, cells and recursive page state.
import { slugify } from "../../../../documents/markdown/parse.ts";
import type { CodeComment, CodeDef, CodeDoc, CodeImports, CodeModel } from "../../../../documents/syntax/syntax.ts";
import type { Role } from "../../../theme/theme.ts";
import { stringWidth } from "../../../../foundation/text/width.ts";
import { A_ITALIC, type Layout, type LayoutHeading, type LayoutLink, type Line } from "../../ir.ts";
import type { Cell, CellSpec, CodeLayoutOptions, DocPart } from "../contracts.ts";
import { joint, putAt, plainRow, framedRow, cellHeader, sectionRow, foldRow, markOf } from "../cells/framing.ts";
import { range } from "../cells/blocks.ts";
import { indentUnit, cellsOf, decorate, signatureRows, breakLine } from "../wrapping/rows.ts";
import { noteColumns, noted, DIRECTIVE, CODELIKE, MARKER, unmark, sectionOf } from "../documentation/comments.ts";
import { proseRows, docRows, linkPaths } from "../documentation/layout.ts";

const lead = (t: string) => t.length - t.trimStart().length;

/** A class's closing brace, on a line of its own. */
/** A class's closing line: its brace (`};` in C++), or Ruby's and Lua's `end`. */
const CLOSING = /^\s*(\}\s*;?|end)\s*$/;

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
