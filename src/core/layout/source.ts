// Source mode (plan 4.13): the note's raw markdown as a layout, a source line per row (wrapped at
// the width when wrapping is on), lightly highlighted. Everything built on the layout — motions,
// find, selection, the mouse, line numbers — then works on the source as it does on the render.
//
// Every row carries `srcMap`: for each cell drawn, the offset in its source line of the grapheme
// that cell shows, so a cursor column maps back to an exact place in the text (a tab shows as
// spaces, all mapping to the tab; a wide character is one cell of width two). Control characters
// show as `�` — the terminal never receives one.

import { slugify } from "../parse.ts";
import { graphemes, graphemeWidth } from "../width.ts";
import type { Layout, LayoutHeading, Line, Span } from "./ir.ts";
import type { Role } from "../theme/theme.ts";

export interface SourceLayoutOptions {
  /** Columns to wrap at; with `wrap` off, rows keep their full length. */
  width: number;
  wrap: boolean;
  /** Headings (from the rendered layout): their `src` lines, placed on the rows here. */
  headings: Omit<LayoutHeading, "line">[];
  tabWidth?: number;
}

/** A displayed grapheme and the source offset (UTF-16, within its line) it came from. */
interface Cell {
  g: string;
  w: number;
  at: number;
  role: Role;
}

// biome-ignore lint: control characters are the point of this pattern
const CONTROL = /^[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/;

export function layoutSource(source: string, opts: SourceLayoutOptions): Layout {
  const tab = opts.tabWidth ?? 4;
  const lines: Line[] = [];
  const texts = source.split("\n");
  if (texts.length > 1 && texts[texts.length - 1] === "") texts.pop(); // a final newline ends the last line
  const roles = highlight(texts);
  let natural = 0;
  texts.forEach((raw, i) => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw; // CRLF: the CR isn't shown
    const lineRoles = roles[i]!;
    const cells: Cell[] = [];
    let col = 0;
    let at = 0;
    for (const g of graphemes(text)) {
      const role = lineRoles[at] ?? "text";
      if (g === "\t") {
        const n = tab - (col % tab);
        for (let k = 0; k < n; k++) cells.push({ g: " ", w: 1, at, role });
        col += n;
      } else if (CONTROL.test(g)) {
        cells.push({ g: "�", w: 1, at, role: "dim" });
        col += 1;
      } else {
        const w = graphemeWidth(g);
        cells.push({ g, w, at, role });
        col += w;
      }
      at += g.length;
    }
    natural = Math.max(natural, col);
    for (const row of wrapCells(cells, opts.wrap ? Math.max(1, opts.width) : Number.POSITIVE_INFINITY)) {
      lines.push({ spans: toSpans(row.cells, i + 1), src: i + 1, srcMap: { cells: row.cells.map((c) => c.at), end: row.end ?? text.length } });
    }
  });
  if (!lines.length) lines.push({ spans: [], src: 1, srcMap: { cells: [], end: 0 } });
  const headings: LayoutHeading[] = [];
  for (const h of opts.headings) {
    const row = lines.findIndex((l) => l.src === h.src);
    if (row < 0) continue;
    lines[row]!.heading ??= headings.length;
    headings.push({ ...h, line: row });
  }
  return { lines, links: [], headings, width: opts.wrap ? opts.width : Math.max(opts.width, natural + 1) };
}

/** Rows of cells no wider than `width`: at the last space that fits, else wherever it must.
 *  `end` is the source offset where the next row starts (undefined on the last). */
function wrapCells(cells: Cell[], width: number): { cells: Cell[]; end?: number }[] {
  const rows: { cells: Cell[]; end?: number }[] = [];
  let start = 0;
  while (true) {
    let w = 0;
    let i = start;
    while (i < cells.length && w + cells[i]!.w <= width) w += cells[i++]!.w;
    if (i >= cells.length) {
      rows.push({ cells: cells.slice(start) });
      return rows;
    }
    // Break after the last space in the row, if there is one past its start.
    let cut = i;
    for (let k = i - 1; k > start; k--) {
      if (cells[k]!.g === " ") {
        cut = k + 1;
        break;
      }
    }
    if (cut === start) cut = Math.max(start + 1, i);
    rows.push({ cells: cells.slice(start, cut), end: cells[cut]!.at });
    start = cut;
  }
}

function toSpans(cells: Cell[], src: number): Span[] {
  const spans: Span[] = [];
  for (const c of cells) {
    const last = spans[spans.length - 1];
    if (last && last.role === c.role) last.text += c.g;
    else spans.push({ text: c.g, role: c.role, attrs: 0, src });
  }
  return spans;
}

/**
 * A role for each UTF-16 offset of each line: light markdown highlighting, line by line with a
 * little state (frontmatter, fenced code). Anything it doesn't know is text.
 */
function highlight(texts: string[]): Role[][] {
  const out: Role[][] = [];
  let fence: string | null = null;
  let frontmatter = texts[0]?.replace(/\r$/, "") === "---";
  texts.forEach((raw, i) => {
    const text = raw.replace(/\r$/, "");
    const roles: Role[] = new Array(raw.length).fill("text");
    const paint = (from: number, to: number, role: Role) => {
      for (let k = from; k < Math.min(to, roles.length); k++) roles[k] = role;
    };
    out.push(roles);
    if (frontmatter) {
      if (i > 0 && (text === "---" || text === "...")) {
        frontmatter = false;
        paint(0, text.length, "fm_border");
      } else if (i === 0) paint(0, text.length, "fm_border");
      else {
        const m = /^(\s*[\w-]+)(:)/.exec(text);
        paint(0, text.length, "fm_value");
        if (m) paint(0, m[1]!.length, "fm_key");
      }
      return;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
    if (fence) {
      paint(0, text.length, "code_block");
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !text.slice(f[0].length).trim()) fence = null;
      return;
    }
    if (f) {
      fence = f[1]!;
      paint(0, text.length, "code_label");
      return;
    }
    const h = /^\s{0,3}(#{1,6})(\s|$)/.exec(text);
    if (h) {
      paint(0, text.length, `h${h[1]!.length}` as Role);
      return;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(text)) {
      paint(0, text.length, "rule");
      return;
    }
    // Quote bars, then a list marker (and a task box) after them.
    let at = 0;
    const q = /^(\s*>)+/.exec(text);
    if (q) {
      paint(0, q[0].length, "quote_bar");
      at = q[0].length;
    }
    const li = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\])?/.exec(text.slice(at));
    if (li) {
      const m0 = at + li[1]!.length;
      paint(m0, m0 + li[2]!.length, "list_marker");
      if (li[4]) {
        const b = m0 + li[2]!.length + li[3]!.length;
        paint(b, b + 3, li[4] === "[ ]" ? "check_todo" : "check_done");
      }
    }
    // Inline: code spans, then links (wikilinks and [text](url)) outside them.
    const code: [number, number][] = [];
    for (const m of text.matchAll(/(`+)[^`]*?\1/g)) {
      paint(m.index, m.index + m[0].length, "code_inline");
      code.push([m.index, m.index + m[0].length]);
    }
    const inCode = (k: number) => code.some(([a, b]) => k >= a && k < b);
    for (const m of text.matchAll(/!?\[\[[^\]\n]+\]\]/g)) if (!inCode(m.index)) paint(m.index, m.index + m[0].length, "wikilink");
    for (const m of text.matchAll(/!?\[[^\]\n]*\]\([^)\n]*\)/g)) if (!inCode(m.index)) paint(m.index, m.index + m[0].length, "link");
  });
  return out;
}

/**
 * The ATX headings of a text without parsing it (source mode while editing, so a keystroke never
 * re-parses the note): outside frontmatter and fenced code, their text with the common inline
 * markup taken off, slugged the way the render slugs them.
 */
export function scanHeadings(source: string): Omit<LayoutHeading, "line">[] {
  const out: Omit<LayoutHeading, "line">[] = [];
  const counts = new Map<string, number>();
  const lines = source.split("\n");
  let fence: string | null = null;
  let frontmatter = lines[0]?.replace(/\r$/, "") === "---";
  lines.forEach((raw, i) => {
    const text = raw.replace(/\r$/, "");
    if (frontmatter) {
      if (i > 0 && (text === "---" || text === "...")) frontmatter = false;
      return;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      return;
    }
    if (f) {
      fence = f[1]!;
      return;
    }
    const h = /^\s{0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(text);
    if (!h) return;
    const plain = (h[2] ?? "")
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/!?\[\[([^\]]+)\]\]/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    const base = slugify(plain);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.push({ level: h[1]!.length, text: plain, slug: n === 0 ? base : `${base}-${n}`, src: i + 1 });
  });
  return out;
}
