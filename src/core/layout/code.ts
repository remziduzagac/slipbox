// The code view (plan 24.x, docs/design/code-view.md): a source file read as a document. Every token is drawn as
// written; the whitespace and the decoration are the view's own — where a long line breaks and how its rest is
// indented, the blank rows between definitions, dimming, bold, a definition's kind in the margin, indent guides, a
// folded run of imports, and the doc comments rendered as prose.
//
// It starts from source mode's rows (one per line, unwrapped: highlighted, and kept between edits by the buffer's
// source cache), so a row of code here carries the same `srcMap`: each cell maps to its place in the line, and the
// cursor, find, a selection and problem marks land where they are in the file. A doc comment's rows are rendered
// prose, placed by line, as a rendered note's are.

import type { Glyphs } from "../glyphs.ts";
import { slugify } from "../parse.ts";
import type { CodeDef, CodeDoc, CodeImports, CodeModel } from "../syntax.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, stringWidth, truncate } from "../width.ts";
import { A_BOLD, A_DIM, type Layout, type LayoutHeading, type LayoutLink, type Line, type Span } from "./ir.ts";
import { renderMarkdown } from "./render.ts";

export interface CodeLayoutOptions {
  /** Columns to lay out in; with `wrap` off, a line runs on and the layout is as wide as its longest. */
  width: number;
  wrap: boolean;
  glyphs: Glyphs;
  /** The runs of imports unfolded, by their first line. */
  open: ReadonlySet<number>;
  /** Whether a line is inside a string or comment that spans lines (its blank lines are its text: never folded). */
  inside?: (line: number) => boolean;
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

/**
 * The code view's layout of `source`, from `base` (source mode's layout, unwrapped: a row per line) and what the
 * file's parse says (`model`; null while it's parsed: the code alone, its guides and its wrapping).
 */
export function layoutCode(source: string, base: Layout, model: CodeModel | null, opts: CodeLayoutOptions): Layout {
  const texts = source.split("\n").map((t) => t.replace(/\r$/, ""));
  if (texts.length > 1 && texts[texts.length - 1] === "") texts.pop();
  const rowOf = new Map<number, Line>();
  for (const l of base.lines) if (!rowOf.has(l.src)) rowOf.set(l.src, l);
  const g = opts.glyphs;
  const width = Math.max(10, opts.width);
  const defs = model?.defs ?? [];
  const docs = new Map<number, CodeDoc>((model?.docs ?? []).map((d) => [d.start, d]));
  const imports = new Map<number, CodeImports>((model?.imports ?? []).map((m) => [m.start, m]));
  const defAt = new Map<number, CodeDef>();
  const nameAt = new Map<number, CodeDef>();
  for (const d of defs) {
    if (!defAt.has(d.line)) defAt.set(d.line, d);
    if (!nameAt.has(d.name.line)) nameAt.set(d.name.line, d);
  }
  // Where a top-level function's, class's or type's block starts (its doc comment's first line, when it has one right
  // above it): one blank row before each. Values aren't sections: a run of consts stays together.
  const blockStart = new Set<number>();
  const docEnding = new Map<number, CodeDoc>((model?.docs ?? []).map((d) => [d.end, d]));
  for (const d of defs) if (d.depth === 0 && d.kind !== "value") blockStart.add(docEnding.get(d.line - 1)?.start ?? d.line);
  const unit = indentUnit(texts);
  const lines: Line[] = [];
  const links: LayoutLink[] = [];
  const firstRow = new Map<number, number>();
  let natural = 0;
  const push = (l: Line) => {
    if (!firstRow.has(l.src) && !l.decor) firstRow.set(l.src, lines.length);
    lines.push(l);
    const w = l.spans.reduce((n, s) => n + stringWidth(s.text), 0);
    if (w > natural) natural = w;
  };
  const blank = (src: number, decor: boolean): Line => (decor ? { spans: [], src, decor: true } : { spans: [], src, srcMap: { cells: [], end: 0 } });

  const code = (ln: number) => {
    const cells = cellsOf(rowOf.get(ln));
    const def = defAt.get(ln);
    decorate(cells, nameAt.get(ln), unit, g);
    const rows = opts.wrap ? breakLine(cells, width, unit, g) : [{ cells }];
    const end = texts[ln - 1]?.length ?? 0;
    rows.forEach((r, k) => {
      const line: Line = { spans: toSpans(r.cells, ln), src: ln, srcMap: { cells: r.cells.map((c) => c.at), end: rows[k + 1]?.cells[0]?.at ?? end } };
      if (k === 0 && def && def.line === ln) line.mark = { text: markOf(def, g), role: def.kind === "function" ? "syn_function" : def.kind === "value" ? "syn_variable" : "syn_type" };
      push(line);
    });
  };

  let shown = false;
  let blanks: number[] = [];
  for (let ln = 1; ln <= texts.length; ) {
    const run = imports.get(ln);
    const doc = docs.get(ln);
    if (!run && !doc && !texts[ln - 1]!.trim() && !opts.inside?.(ln)) {
      blanks.push(ln++);
      continue;
    }
    // A run of blank lines is one blank row; a top-level definition has one before it, whatever the file has.
    if (shown && blanks.length) push(blank(blanks[0]!, false));
    else if (shown && blockStart.has(ln)) push(blank(ln, true));
    blanks = [];
    shown = true;
    if (run) {
      const open = opts.open.has(run.start);
      push(foldRow(run, open, width, g));
      if (open) for (let k = run.start; k <= run.end; k++) texts[k - 1]!.trim() ? code(k) : push(blank(k, false));
      ln = run.end + 1;
      continue;
    }
    if (doc) {
      for (const l of docRows(texts, doc, width, g, links, lines.length)) push(l);
      ln = doc.end + 1;
      continue;
    }
    code(ln++);
  }
  if (!lines.length) lines.push({ spans: [], src: 1, srcMap: { cells: [], end: 0 } });
  // The sections, as the outline has them (`]]`, the breadcrumb): values are marked, not sections.
  const headings: LayoutHeading[] = [];
  for (const d of defs) {
    if (d.kind === "value") continue;
    const row = firstRow.get(d.line);
    if (row === undefined) continue;
    const text = texts[d.name.line - 1]?.slice(d.name.from, d.name.to) ?? "";
    if (lines[row]!.heading === undefined) lines[row] = { ...lines[row]!, heading: headings.length };
    headings.push({ level: Math.min(6, d.depth + 1), text, slug: slugify(text), line: row, src: d.line });
  }
  return { lines, links, headings, width: opts.wrap ? width : Math.max(width, natural + 1) };
}

/**
 * The code's blocks for the lens (24.8), covering lines 1..`lineCount`: a doc comment, a run of imports, or a line —
 * each with the blank lines after it; a string or comment that spans lines stays with the line it starts on.
 */
export function codeBlocks(texts: string[], model: CodeModel | null, lineCount: number, continues: (line: number) => boolean): [number, number][] {
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

/** The margin's mark for a definition's kind. */
function markOf(def: CodeDef, g: Glyphs): string {
  return def.kind === "function" ? g.codeFunction : def.kind === "class" ? g.codeClass : def.kind === "type" ? g.codeType : g.codeValue;
}

/** The file's indentation step: the least indentation a line of code has (2 by default, at most 8) — a doc
 *  comment's ` * ` lines and other odd ones aside. */
function indentUnit(texts: string[]): number {
  let unit = 0;
  for (const t of texts) {
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
    for (const gr of graphemes(s.text)) out.push({ g: gr, w: graphemeWidth(gr), at: at[k++] ?? 0, role: s.role, attrs: s.attrs });
  }
  return out;
}

const inText = (c: Cell) => c.role === "syn_string" || c.role === "syn_comment";

/**
 * The decoration a row of code gets: guides in its indentation, braces and semicolons dimmed, and on a definition's
 * line its name bold and what comes before it (export, async, function…) dimmed.
 */
function decorate(cells: Cell[], def: CodeDef | undefined, unit: number, g: Glyphs): void {
  let lead = 0;
  while (lead < cells.length && cells[lead]!.g === " ") lead++;
  if (lead < cells.length) for (let c = 0; c < lead; c += unit) cells[c] = { ...cells[c]!, g: g.guide, role: "tree_guide" };
  for (const c of cells) if (QUIET.test(c.g) && !inText(c)) c.attrs |= A_DIM;
  if (!def) return;
  for (const c of cells) {
    if (c.at >= def.name.from && c.at < def.name.to) c.attrs |= A_BOLD;
    else if (c.at < def.name.from && c.g !== " " && c.role !== "tree_guide") c.attrs |= A_DIM;
  }
}

/** Where a row of code may break: after an opening bracket, after a comma, before `&&` `||` `??` ` ? ` or a chained `.`. */
function breaksOf(cells: Cell[], from: number): Break[] {
  const out: Break[] = [];
  let depth = 0;
  const at = (i: number, s: string) => cells.slice(i, i + s.length).map((c) => c.g).join("") === s;
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
    } else if (cells[i - 1]?.g === " " && (at(i, "&& ") || at(i, "|| ") || at(i, "?? ") || at(i, "? "))) out.push({ i, depth });
    else if (c.g === "." && cells[i - 1]?.g === ")") out.push({ i, depth });
  }
  return out;
}

/**
 * A row of code in rows no wider than `width`: a line that fits is one row; one that doesn't breaks where its structure
 * allows — the shallowest bracket depth among the breaks that fit, the last of those — its rest four columns further
 * in than the line, with the line's guides. No break that fits: at a space, else wherever it must.
 */
function breakLine(cells: Cell[], width: number, unit: number, g: Glyphs): { cells: Cell[] }[] {
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
  const pad = (at: number) => Array.from({ length: indent }, (_, c): Cell => (c < lead && c % unit === 0 ? { g: g.guide, w: 1, at, role: "tree_guide", attrs: 0 } : { g: " ", w: 1, at, role: "text", attrs: 0 }));
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

/** A run of imports' row: folded, `▸ imports` and the modules (as many as fit) and how many; open, `▾ imports`. */
function foldRow(run: CodeImports, open: boolean, width: number, g: Glyphs): Line {
  const count = `(${run.modules.length})`;
  const head = `${open ? g.foldOpen : g.foldClosed} imports`;
  const names = open ? "" : truncate(run.modules.join(" · "), Math.max(0, width - stringWidth(head) - stringWidth(count) - 5));
  const spans: Span[] = [{ text: head, role: "dim", attrs: A_BOLD, src: run.start }];
  if (names) spans.push({ text: `  ${names}`, role: "dim", attrs: 0, src: run.start });
  spans.push({ text: ` ${count}`, role: "dim", attrs: 0, src: run.start });
  return { spans, src: run.start, fold: run.start };
}

/**
 * A doc comment as prose: its markers gone, its text rendered as markdown at its indentation and wrapped to the
 * width; JSDoc's tags as a definition list under it — each `@param`'s name, `@returns` as `returns`, another tag by
 * its name — then what it says. Its rows are placed by line: a comment's line k is the text's line k.
 */
function docRows(texts: string[], doc: CodeDoc, width: number, g: Glyphs, links: LayoutLink[], rowBase: number): Line[] {
  const raw = texts.slice(doc.start - 1, doc.end);
  const text = raw.map((l, k) => {
    let t = k === 0 ? l.slice(doc.column).replace(/^\/\*\*\s?/, "") : l.replace(/^\s*\*(?!\/)\s?/, "");
    if (k === raw.length - 1) t = t.replace(/\s*\*\/\s*$/, "");
    return t;
  });
  const tagAt = text.findIndex((t) => /^\s*@\w/.test(t));
  const body = (tagAt < 0 ? text : text.slice(0, tagAt)).join("\n").replace(/\s+$/, "");
  const indent = " ".repeat(Math.min(doc.column, Math.max(0, width - 20)));
  const room = Math.max(10, width - indent.length);
  const out: Line[] = [];
  if (body.trim()) {
    const md = renderMarkdown(body, { width: room, glyphs: g, showUrls: false });
    const shift = links.length;
    for (const l of md.links) links.push({ ...l, line: l.line < 0 ? -1 : rowBase + l.line, col: l.col + indent.length, src: doc.start + l.src - 1 });
    for (const l of md.lines) {
      const spans: Span[] = l.spans.map((s) => ({ ...s, ...(s.src !== undefined ? { src: doc.start + s.src - 1 } : {}), ...(s.link !== undefined ? { link: s.link + shift } : {}) }));
      out.push({ spans: indent ? [{ text: indent, role: "text", attrs: 0 }, ...spans] : spans, src: doc.start + Math.max(1, l.src) - 1 });
    }
  }
  if (tagAt < 0) return out.length ? out : [{ spans: [], src: doc.start }];
  // The tags: each its line and what follows it up to the next.
  const tags: { term: string; type: string; desc: string; src: number }[] = [];
  for (let k = tagAt; k < text.length; k++) {
    const t = text[k]!.trim();
    const m = /^@(\w+)\s*(\{[^}]*\})?\s*(.*)$/.exec(t);
    if (m) {
      const [, tag, type = "", rest = ""] = m;
      const param = tag === "param" || tag === "arg" || tag === "argument" || tag === "property" || tag === "prop";
      const p = param ? /^(\[?[\w$.]+(?:=[^\]]*)?\]?)\s*(?:-\s*)?(.*)$/.exec(rest) : null;
      const term = p ? p[1]! : tag === "return" || tag === "returns" ? "returns" : tag!;
      tags.push({ term, type, desc: p ? p[2]! : rest, src: doc.start + k });
    } else if (t && tags.length) tags[tags.length - 1]!.desc += ` ${t}`;
  }
  if (out.length && tags.length) out.push({ spans: [], src: doc.start + tagAt, decor: true });
  const termW = Math.min(16, Math.max(...tags.map((t) => stringWidth(t.term)))) + 3;
  for (const t of tags) {
    const descRoom = Math.max(10, room - 2 - termW);
    const words = t.desc.trim() ? wrapWords(t.desc.trim(), descRoom) : [""];
    words.forEach((w, k) => {
      const spans: Span[] = [{ text: `${indent}  `, role: "text", attrs: 0 }];
      if (k === 0) spans.push({ text: truncate(t.term, termW - 1).padEnd(termW), role: "fm_key", attrs: 0, src: t.src });
      else spans.push({ text: " ".repeat(termW), role: "text", attrs: 0 });
      // Its code spans as the prose's: the backticks gone, the code coloured.
      if (w) w.split(/(`[^`]+`)/).forEach((part, j) => part && spans.push(j % 2 ? { text: part.slice(1, -1), role: "code_inline", attrs: 0, src: t.src } : { text: part, role: "text", attrs: 0, src: t.src }));
      if (k === 0 && t.type) spans.push({ text: `  ${t.type}`, role: "dim", attrs: 0, src: t.src });
      out.push({ spans, src: t.src });
    });
  }
  return out;
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
