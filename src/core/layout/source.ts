// Source mode (plan 4.13): the note's raw markdown as a layout, a source line per row (wrapped at
// the width when wrapping is on), lightly highlighted. Everything built on the layout — motions,
// find, selection, the mouse, line numbers — then works on the source as it does on the render.
//
// Every row carries `srcMap`: for each cell drawn, the offset in its source line of the grapheme
// that cell shows, so a cursor column maps back to an exact place in the text (a tab shows as
// spaces, all mapping to the tab; a wide character is one cell of width two). Control characters
// show as `�` — the terminal never receives one.

import { headingLabel, parseMarkdown, slugify } from "../parse.ts";
import type { Span as SyntaxSpan } from "../syntax.ts";
import { highlight } from "./highlight.ts";
import { graphemes, graphemeWidth } from "../width.ts";
import type { Layout, LayoutHeading, Line, Span } from "./ir.ts";
import type { Role } from "../theme/theme.ts";

export interface SourceLayoutOptions {
  /** Columns to wrap at; with `wrap` off, rows keep their full length. */
  width: number;
  wrap: boolean;
  /** Headings (from the rendered layout or the parse): their `src` lines, placed on the rows here.
   *  "scan": found in the text as it's laid out (each line once, when it changes). */
  headings: Omit<LayoutHeading, "line">[] | "scan";
  tabWidth?: number;
  /** A slice of lines (live preview's block): every line is a row, a last empty one too. */
  slice?: boolean;
  /** Not markdown (16.4): the file's language, highlighted a line at a time; "text", or a
   *  language highlight.js lacks, is plain. */
  language?: string | null;
  /** Tree-sitter's word (16.7) on what highlight.js can't see from one line: the parts of line
   *  `line` (1-based) inside a string or comment that spans lines. */
  spans?: (line: number) => SyntaxSpan[] | undefined;
  /** A line in another language than the file's (16.22: a component's script, a page's style), by
   *  highlight.js's name; undefined: the file's own. */
  languageAt?: (line: number) => string | undefined;
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

/**
 * The last layout's lines, kept by the caller between layouts of the same text as it is edited (a
 * buffer keeps one): the lines before and after an edit are reused — shifted when lines were added
 * or taken away — and only those between are laid out, so a keystroke costs a line, not the note.
 */
export interface SourceCache {
  /** The options the rows were made for: a change drops everything. */
  key: string;
  texts: string[];
  /** The highlighter's state at each line's start ("" none, "fm0"/"fm" frontmatter, "c…" code). */
  states: string[];
  /** Each line's rows, its natural width, and the ATX heading it is (outside code). */
  rows: Line[][];
  naturals: number[];
  heads: (LineHeading | null)[];
}

type LineHeading = Omit<LayoutHeading, "line" | "src">;

export function newSourceCache(): SourceCache {
  return { key: "", texts: [], states: [], rows: [], naturals: [], heads: [] };
}

export function layoutSource(source: string, opts: SourceLayoutOptions, cache: SourceCache = newSourceCache()): Layout {
  const tab = opts.tabWidth ?? 4;
  const texts = source.split("\n");
  if (!opts.slice && texts.length > 1 && texts[texts.length - 1] === "") texts.pop(); // a final newline ends the last line
  const width = opts.wrap ? Math.max(1, opts.width) : Number.POSITIVE_INFINITY;
  const lang = opts.language ?? null;
  const cacheKey = `${width}:${tab}:${lang ?? "md"}`;
  const old = cache.key === cacheKey ? cache : newSourceCache();
  const O = old.texts;
  const n = texts.length;
  // The unchanged lines at each end.
  // Code: a line is unchanged only if its tree-sitter state is too (closing a string lower down
  // recolours the lines it now covers, above the edit).
  const sig = (line: number) => {
    const s = opts.spans?.(line);
    const own = opts.languageAt?.(line);
    return (s?.length ? s.map((x) => `${x.kind}${x.from}-${x.to}`).join(",") : "") + (own ? `@${own}` : "");
  };
  let pre = 0;
  while (pre < n && pre < O.length && texts[pre] === O[pre] && (!lang || old.states[pre] === sig(pre + 1))) pre++;
  let suf = 0;
  while (suf < n - pre && suf < O.length - pre && texts[n - 1 - suf] === O[O.length - 1 - suf]) suf++;
  const states: string[] = old.states.slice(0, pre);
  const rows: Line[][] = old.rows.slice(0, pre);
  const naturals: number[] = old.naturals.slice(0, pre);
  const heads: (LineHeading | null)[] = old.heads.slice(0, pre);
  // The state at the first changed line: after the unchanged ones, as the old layout had it.
  let state = pre > 0 ? nextState(old, pre - 1, texts[pre - 1]!) : texts[0]?.replace(/\r$/, "") === "---" ? "fm0" : "";
  const lay = (i: number) => {
    const lineSpans = opts.spans?.(i + 1);
    // For code, a line's state is what tree-sitter says of it: which parts are inside a string or
    // comment opened above — so a line whose text is the same but whose context changed is laid
    // out again.
    if (lang) state = sig(i + 1);
    const built = layoutLine(texts[i]!, state, i, width, tab, lang ? (opts.languageAt?.(i + 1) ?? lang) : lang, lineSpans);
    states.push(state);
    rows.push(built.rows);
    naturals.push(built.natural);
    heads.push(state === "" ? headingOfLine(texts[i]!) : null);
    state = built.out;
  };
  let i = pre;
  for (; i < n - suf; i++) lay(i);
  // The unchanged end: reused from where the highlighter's state agrees with the old one there
  // (a new fence above changes how every line after it is coloured, until it closes).
  const shift = n - O.length;
  for (; i < n; i++) {
    const o = i - shift;
    if (lang) state = sig(i + 1); // code: each line's own state, from tree-sitter's spans
    if (old.states[o] !== state) {
      lay(i);
      continue;
    }
    for (; i < n; i++) {
      const o2 = i - shift;
      states.push(old.states[o2]!);
      naturals.push(old.naturals[o2]!);
      heads.push(old.heads[o2] ?? null);
      const r = old.rows[o2]!;
      const src = i + 1;
      rows.push(shift === 0 ? r : r.map((row) => ({ ...row, src, spans: row.spans.map((sp) => ({ ...sp, src })) })));
    }
  }
  Object.assign(cache, { key: cacheKey, texts, states, rows, naturals, heads });
  const lines: Line[] = [];
  const firstRow: number[] = [];
  let natural = 0;
  for (let k = 0; k < rows.length; k++) {
    firstRow.push(lines.length);
    for (const r of rows[k]!) lines.push(r);
    if (naturals[k]! > natural) natural = naturals[k]!;
  }
  if (!lines.length) lines.push({ spans: [], src: 1, srcMap: { cells: [], end: 0 } });
  const headings: LayoutHeading[] = [];
  const wanted = opts.headings === "scan" ? heads.flatMap((h, k) => (h ? [{ ...h, src: k + 1 }] : [])) : opts.headings;
  for (const h of wanted) {
    const row = firstRow[h.src - 1] ?? -1;
    if (row < 0 || !lines[row]) continue;
    // A copy with its heading: the rows themselves are kept and shared between layouts.
    if (lines[row]!.heading === undefined) lines[row] = { ...lines[row]!, heading: headings.length };
    headings.push({ ...h, line: row });
  }
  return { lines, links: [], headings, width: opts.wrap ? opts.width : Math.max(opts.width, natural + 1) };
}

/** The highlighter's state after line `i` of the old layout (its text unchanged). */
function nextState(old: SourceCache, i: number, raw: string): string {
  const after = old.states[i + 1];
  if (after !== undefined) return after;
  return highlightLine(raw, old.states[i]!, i).out;
}

/** One source line's rows. */
function layoutLine(raw: string, state: string, i: number, width: number, tab: number, lang: string | null = null, spans?: SyntaxSpan[]): { rows: Line[]; natural: number; out: string } {
  const src = i + 1;
  const hl = lang ? codeLine(raw, lang, spans) : highlightLine(raw, state, i);
  const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw; // CRLF: the CR isn't shown
  const cells: Cell[] = [];
  let col = 0;
  let at = 0;
  for (const g of graphemes(text)) {
    const role = hl.roles[at] ?? "text";
    if (g === "\t") {
      const k = tab - (col % tab);
      for (let j = 0; j < k; j++) cells.push({ g: " ", w: 1, at, role });
      col += k;
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
  const rows: Line[] = wrapCells(cells, width).map((row) => ({ spans: toSpans(row.cells, src), src, srcMap: { cells: row.cells.map((c) => c.at), end: row.end ?? text.length } }));
  return { rows, natural: col, out: hl.out };
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

/** A line of code: highlight.js's colours, then tree-sitter's multi-line strings and comments
 *  over them (a line inside a docstring has no quote of its own to tell highlight.js). */
function codeLine(raw: string, lang: string, spans?: SyntaxSpan[]): { roles: Role[]; out: string } {
  const roles: Role[] = new Array(raw.length).fill("text");
  const tokens = raw.trim() ? highlight(raw.replace(/\r$/, ""), lang)?.[0] : undefined;
  let at = 0;
  for (const t of tokens ?? []) {
    if (t.role) for (let k = at; k < at + t.text.length && k < roles.length; k++) roles[k] = t.role;
    at += t.text.length;
  }
  for (const s of spans ?? []) for (let k = s.from; k < Math.min(s.to, roles.length); k++) roles[k] = s.kind === "string" ? "syn_string" : "syn_comment";
  return { roles, out: "" };
}

/**
 * A role for each UTF-16 offset of a line: light markdown highlighting with a little state carried
 * from line to line — "fm0" (a first line of "---"), "fm" (inside frontmatter), "c<fence>" (inside
 * fenced code), "" (neither). Anything it doesn't know is text.
 */
function highlightLine(raw: string, state: string, i: number): { roles: Role[]; out: string } {
  const text = raw.replace(/\r$/, "");
  const roles: Role[] = new Array(raw.length).fill("text");
  const paint = (from: number, to: number, role: Role) => {
    for (let k = from; k < Math.min(to, roles.length); k++) roles[k] = role;
  };
  if (state === "fm0") {
    paint(0, text.length, "fm_border");
    return { roles, out: "fm" };
  }
  if (state === "fm") {
    if (i > 0 && (text === "---" || text === "...")) {
      paint(0, text.length, "fm_border");
      return { roles, out: "" };
    }
    const m = /^(\s*[\w-]+)(:)/.exec(text);
    paint(0, text.length, "fm_value");
    if (m) paint(0, m[1]!.length, "fm_key");
    return { roles, out: "fm" };
  }
  const f = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
  if (state.startsWith("c")) {
    const fence = state.slice(1);
    paint(0, text.length, "code_block");
    const closes = f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !text.slice(f[0].length).trim();
    return { roles, out: closes ? "" : state };
  }
  if (f) {
    paint(0, text.length, "code_label");
    return { roles, out: `c${f[1]!}` };
  }
  const h = /^\s{0,3}(#{1,6})(\s|$)/.exec(text);
  if (h) {
    paint(0, text.length, `h${h[1]!.length}` as Role);
    return { roles, out: "" };
  }
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(text)) {
    paint(0, text.length, "rule");
    return { roles, out: "" };
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
  // Inline: code spans, then links (`[text](url)`; `[[…]]` is text, 20.2) outside them.
  if (text.includes("`") || text.includes("[")) {
    const code: [number, number][] = [];
    for (const m of text.matchAll(/(`+)[^`]*?\1/g)) {
      paint(m.index, m.index + m[0].length, "code_inline");
      code.push([m.index, m.index + m[0].length]);
    }
    const inCode = (k: number) => code.some(([a, b]) => k >= a && k < b);
    for (const m of text.matchAll(/!?\[[^\]\n]*\]\([^)\n]*\)/g)) if (!inCode(m.index)) paint(m.index, m.index + m[0].length, "link");
  }
  return { roles, out: "" };
}

/**
 * The ATX headings of a text without parsing it (source mode while editing, so a keystroke never
 * re-parses the note): outside frontmatter and fenced code, their text and slugs as the render
 * has them.
 */
export function scanHeadings(source: string): Omit<LayoutHeading, "line">[] {
  const out: Omit<LayoutHeading, "line">[] = [];
  const lines = source.split("\n");
  // The highlighter's own states (frontmatter, fences): the same rule as source mode's colours.
  let state = lines[0]?.replace(/\r$/, "") === "---" ? "fm0" : "";
  lines.forEach((raw, i) => {
    if (state === "") {
      const h = headingOfLine(raw);
      if (h) out.push({ ...h, src: i + 1 });
    }
    state = highlightLine(raw, state, i).out;
  });
  return out;
}

/** An ATX heading line's level, text and slug, as the render and the graph have them (headingLabel;
 *  a repeated heading keeps its plain slug, no -1 suffix). A line with no markup is its own text;
 *  one with markup is parsed — that line alone, so a keystroke never re-parses the note — with a
 *  stand-in definition for each footnote mark and each reference label, which the whole note would
 *  have. (A shortcut `[x]` defined nowhere then reads `x`, not `[x]`; its slug is the same.) */
function headingOfLine(raw: string): LineHeading | null {
  if (!raw.includes("#")) return null;
  const line = raw.replace(/\r$/, "");
  const h = /^\s{0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(line);
  if (!h) return null;
  const body = h[2] ?? "";
  if (!/[\\[\]*_`~<&{]/.test(body)) {
    const text = body.trim();
    return { level: h[1]!.length, text, slug: slugify(text) };
  }
  // A footnote mark `[^m]`, and a reference link's or image's label: the `[label]` of a full
  // `[text][label]`, or the text of a collapsed `[text][]` or a shortcut `[text]`.
  const marks = [...new Set([...body.matchAll(/\[\^([^\]\s]+)\]/g)].map((m) => `[^${m[1]}]`))];
  const labels = [...new Set([...body.matchAll(/\[([^[\]^][^[\]]*)\]/g)].map((m) => `[${m[1]}]`))];
  const defs = [...marks, ...labels];
  const node = parseMarkdown(defs.length ? `${line}\n\n${defs.map((d) => `${d}: #`).join("\n\n")}\n` : line).tree.children[0];
  if (node?.type !== "heading") return null;
  const id = (node.data as { id?: string } | undefined)?.id;
  return { level: node.depth, ...headingLabel(node), ...(id ? { id } : {}) };
}
