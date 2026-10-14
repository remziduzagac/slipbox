// The diff as slipbox draws it (GIT-D2): a row a line, `-` or `+` in its gutter; the line highlighted by its file's
// language as source mode has it; a changed line tinted, and its changed words more strongly; each group under its
// `@@ line N`, the unchanged stretches between folded to a row saying how many lines they hold. A line too long for the
// window scrolls sideways, as a code block too wide does (D233) — never cut.

import type { Glyphs } from "../glyphs.ts";
import type { DiffViewRow, WordRange } from "../merge.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth } from "../width.ts";
import type { CodeScroll, Layout, Line, Span } from "./ir.ts";
import { layoutSource } from "./source.ts";

/** The sign and a space: where a row's text starts. The space is where a scrolled row's `‹` goes. */
export const DIFF_GUTTER = 2;

export interface DiffLayoutOptions {
  width: number;
  glyphs: Glyphs;
  /** How the lines are highlighted: markdown's highlighter (null), or a highlight.js language ("text": plain). */
  language: string | null;
  tabWidth?: number;
  /** Wrapping on: a line too long scrolls sideways (`codeScroll`, `[render] code_wrap = "scroll"`) or wraps. Off: the
   *  rows are whole, and the window scrolls. */
  wrap: boolean;
  codeScroll: boolean;
}

/** What a changed line and its changed words are tinted with, by its sign. */
const TINT: Record<"-" | "+", { line: Role; word: Role }> = {
  "-": { line: "diff_del", word: "diff_del_word" },
  "+": { line: "diff_add", word: "diff_add_word" },
};

interface Cell {
  g: string;
  w: number;
  role: Role;
  bg?: Role;
}

/**
 * The diff's rows (`diffView`) laid out, `from` and `to` the texts it compares. Each row is one line of the layout's
 * own text (its `src`, 1-based, the row's place): a line too long wraps to more rows when `[render] code_wrap` says so.
 */
export function layoutDiff(rows: DiffViewRow[], from: string, to: string, opts: DiffLayoutOptions): Layout {
  const g = opts.glyphs;
  const tab = opts.tabWidth ?? 4;
  const want = (side: "from" | "to") =>
    rows.filter((r) => (side === "to" ? r.kind === "+" : r.kind === " " || r.kind === "-")).map((r) => r.own);
  const before = highlighted(from, want("from"), opts.language, tab);
  const after = highlighted(to, want("to"), opts.language, tab);
  const code: Cell[][] = rows.map((r) => {
    if (r.kind === "@@" || r.kind === "fold") return [];
    const tint = r.kind === " " ? null : TINT[r.kind];
    return cellsOf((r.kind === "+" ? after : before).get(r.own), r.words, tint);
  });
  const widths = code.map((cs) => cs.reduce((w, c) => w + c.w, 0));
  const total = widths.reduce((a, b) => Math.max(a, b), 0);
  const inner = Math.max(1, opts.width - DIFF_GUTTER - 1);
  const scroll: CodeScroll | undefined =
    opts.wrap && opts.codeScroll && total > inner ? { x: DIFF_GUTTER, w: inner, total } : undefined;
  const lines: Line[] = [];
  rows.forEach((r, i) => {
    const src = i + 1;
    if (r.kind === "@@" || r.kind === "fold") {
      const text =
        r.kind === "@@" ? `@@ ${r.text}` : `${g.foldClosed} ${r.count} unchanged line${r.count === 1 ? "" : "s"}`;
      lines.push({
        spans: [{ text, role: r.kind === "@@" ? "diff_head" : "dim", attrs: 0 }],
        src,
        ...(scroll ? { scroll: { ...scroll, part: "top" } } : {}),
      });
      return;
    }
    const tint = r.kind === " " ? null : TINT[r.kind];
    const signRole: Role = tint?.line ?? "text";
    const sign = (mark: string): Span => ({ text: `${mark} `, role: signRole, attrs: 0 });
    const own = {
      src,
      text: [DIFF_GUTTER, Number.MAX_SAFE_INTEGER] as [number, number],
      ...(tint ? { fill: tint.line } : {}),
    };
    if (scroll || !opts.wrap || widths[i]! <= inner) {
      lines.push({ spans: [sign(r.kind), ...spansOf(code[i]!)], ...own, ...(scroll ? { scroll } : {}) });
      return;
    }
    // Wrapped (`[render] code_wrap = "wrap"`): its rows after the first marked as a code block's are.
    chunks(code[i]!, inner).forEach((part, k) =>
      lines.push({ spans: [sign(k ? g.codeWrap.slice(0, 1) : r.kind), ...spansOf(part)], ...own }),
    );
  });
  // A block that scrolls: a last row under it for its scrollbar, which the cursor never takes.
  if (scroll) lines.push({ spans: [], src: rows.length, decor: true, scroll: { ...scroll, part: "bar" } });
  if (!lines.length) lines.push({ spans: [], src: 1 });
  const width = opts.wrap ? opts.width : Math.max(opts.width, DIFF_GUTTER + total + 1);
  return { lines, links: [], headings: [], width };
}

/**
 * One side's lines, those wanted (1-based), highlighted as source mode has them: a row each. Markdown's highlighter
 * carries what it knows from line to line (front matter, a fence), so it reads the text whole; code is highlighted a
 * line at a time, so only the lines shown are.
 */
function highlighted(text: string, wanted: number[], language: string | null, tabWidth: number): Map<number, Line> {
  const out = new Map<number, Line>();
  if (!wanted.length) return out;
  const opts = { width: 1, wrap: false, headings: [], language, tabWidth, slice: true };
  if (language === null) {
    const l = layoutSource(text, opts);
    for (const k of wanted) {
      const row = l.lines[k - 1];
      if (row) out.set(k, row);
    }
    return out;
  }
  const lines = text.split("\n");
  const l = layoutSource(wanted.map((k) => lines[k - 1] ?? "").join("\n"), opts);
  wanted.forEach((k, i) => {
    const row = l.lines[i];
    if (row) out.set(k, row);
  });
  return out;
}

/** A highlighted row's cells: on a changed line, each on the line's tint, its changed words on the stronger one. */
function cellsOf(
  row: Line | undefined,
  words: WordRange[] | undefined,
  tint: { line: Role; word: Role } | null,
): Cell[] {
  if (!row) return [];
  const map = row.srcMap?.cells ?? [];
  const out: Cell[] = [];
  let i = 0;
  for (const span of row.spans)
    for (const g of graphemes(span.text)) {
      const at = map[i++] ?? -1;
      const w = graphemeWidth(g);
      if (!w) continue;
      const changed = !!words?.some(([s, e]) => at >= s && at < e);
      out.push({ g, w, role: span.role, ...(tint ? { bg: changed ? tint.word : tint.line } : {}) });
    }
  return out;
}

/** Cells as spans: a run of one role and tint, one span. */
function spansOf(cells: Cell[]): Span[] {
  const out: Span[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.role === c.role && last.bg === c.bg) last.text += c.g;
    else out.push({ text: c.g, role: c.role, attrs: 0, ...(c.bg ? { bg: c.bg } : {}) });
  }
  return out;
}

/** Cells in rows of at most `width` columns (a wide character never split). */
function chunks(cells: Cell[], width: number): Cell[][] {
  const out: Cell[][] = [[]];
  let w = 0;
  for (const c of cells) {
    if (w + c.w > width && out[out.length - 1]!.length) {
      out.push([]);
      w = 0;
    }
    out[out.length - 1]!.push(c);
    w += c.w;
  }
  return out;
}
