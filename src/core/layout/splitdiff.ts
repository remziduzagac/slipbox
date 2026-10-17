// A code file's diff side by side (GIT-D7): the two versions in two columns, `from` on the left and `to` on the right,
// each line beside the one it became — a changed line beside the line it's paired with, its changed words tinted, as
// the unified diff pairs them — and an unchanged line beside itself. The heads and folds span both. A line too long
// for its column scrolls sideways, both columns by the one offset, as a code block's lines do (D233); with `[render]
// code_wrap = "wrap"` each side wraps in its column; with wrapping off the rows are whole and the window scrolls.

import type { DiffViewRow } from "../merge.ts";
import { type Cell, cellsOf, chunks, DIFF_GUTTER, type DiffLayoutOptions, highlighted, spansOf, TINT } from "./diff.ts";
import type { CodeScroll, Layout, Line, Span } from "./ir.ts";

/** Each side's text columns for `auto` (`[git] diff_layout`) to put the two side by side: at least this many. */
export const SPLIT_MIN = 80;

/** Between the two sides' texts: the left's margin (its `›`), the rule and a space. */
const RULE = 3;

/** The text columns each side has in a window `width` wide: each with its sign and a space before it and a column
 *  after it (its `›`), the rule and a space between them. */
export function splitColumns(width: number): number {
  return Math.floor((width - 2 * DIFF_GUTTER - RULE - 1) / 2);
}

/** A row side by side: a head or a fold across both (`row`), else the unified rows shown on the left and on the right
 *  (their indexes; either may be absent). `unit` is the row it stands for: the right's, else the left's. */
export interface SplitRow {
  row?: number;
  left?: number;
  right?: number;
  unit: number;
}

/**
 * The unified rows side by side: an unchanged line on both sides; in a run of changes each removed line beside the
 * added line it's paired with (the k-th paired removed line with the k-th paired added one), those paired with none
 * beside each other, in order.
 */
export function splitRows(rows: DiffViewRow[]): SplitRow[] {
  const out: SplitRow[] = [];
  const zip = (l: number[], r: number[]) => {
    for (let k = 0; k < Math.max(l.length, r.length); k++)
      out.push({
        ...(l[k] !== undefined ? { left: l[k] } : {}),
        ...(r[k] !== undefined ? { right: r[k] } : {}),
        unit: r[k] ?? l[k]!,
      });
  };
  for (let i = 0; i < rows.length; ) {
    const r = rows[i]!;
    if (r.kind !== "-" && r.kind !== "+") {
      out.push(r.kind === " " ? { left: i, right: i, unit: i } : { row: i, unit: i });
      i++;
      continue;
    }
    const del: number[] = [];
    const add: number[] = [];
    for (; rows[i]?.kind === "-"; i++) del.push(i);
    for (; rows[i]?.kind === "+"; i++) add.push(i);
    // A paired line has its changed words; the k-th of each side are a pair.
    const pd = del.filter((k) => rows[k]!.words);
    const pa = add.filter((k) => rows[k]!.words);
    let d = 0;
    let a = 0;
    pd.forEach((l, k) => {
      const at = del.indexOf(l);
      const ar = add.indexOf(pa[k]!);
      zip(del.slice(d, at), add.slice(a, ar));
      out.push({ left: l, right: pa[k]!, unit: pa[k]! });
      d = at + 1;
      a = ar + 1;
    });
    zip(del.slice(d), add.slice(a));
  }
  return out;
}

/**
 * The diff side by side at `width`: each row's `src` the unified row it stands for (1-based), as `layoutDiff`'s are,
 * so `enter` and the folds work alike. A changed side is on its sign's tint up to the rule, its changed words more
 * strongly.
 */
export function layoutSplitDiff(rows: DiffViewRow[], from: string, to: string, opts: DiffLayoutOptions): Layout {
  const g = opts.glyphs;
  const tab = opts.tabWidth ?? 4;
  const want = (side: "from" | "to") =>
    rows.filter((r) => (side === "to" ? r.kind === "+" : r.kind === " " || r.kind === "-")).map((r) => r.own);
  const before = highlighted(from, want("from"), opts.language, tab);
  const after = highlighted(to, want("to"), opts.language, tab);
  // An unchanged line is `from`'s, on both sides.
  const code = (i: number | undefined): Cell[] => {
    const r = i === undefined ? undefined : rows[i];
    if (!r || r.kind === "@@" || r.kind === "fold") return [];
    return cellsOf((r.kind === "+" ? after : before).get(r.own), r.words, r.kind === " " ? null : TINT[r.kind]);
  };
  const split = splitRows(rows);
  const cells = split.map((s) => ({ left: code(s.left), right: code(s.right) }));
  const width = (cs: Cell[]) => cs.reduce((n, c) => n + c.w, 0);
  const total = cells.reduce((m, c) => Math.max(m, width(c.left), width(c.right)), 0);
  const w = Math.max(10, splitColumns(opts.width));
  const scrolls = opts.wrap && opts.codeScroll && total > w;
  // Each side's text: `w` columns; scrolling or unwrapped, as wide as the widest line, the right's after it.
  const room = scrolls || !opts.wrap ? Math.max(w, total) : w;
  const right = DIFF_GUTTER + room + RULE + DIFF_GUTTER;
  const scroll: CodeScroll | undefined = scrolls ? { x: DIFF_GUTTER, w, total: room, right } : undefined;
  /** A side of a row: its sign (a wrapped line's later rows `↪`, a side with nothing blank), its text, its padding. */
  const side = (i: number | undefined, cs: Cell[] | undefined, first: boolean): Span[] => {
    const r = i === undefined ? undefined : rows[i];
    const tint = r && (r.kind === "-" || r.kind === "+") ? TINT[r.kind] : null;
    const sign = !r || r.kind === " " ? " " : first ? r.kind : cs ? g.codeWrap.slice(0, 1) : " ";
    const bg = tint ? { bg: tint.line } : {};
    return [
      { text: `${sign} `, role: tint?.line ?? "text", attrs: 0, ...bg },
      ...spansOf(cs ?? []),
      { text: " ".repeat(Math.max(0, room - width(cs ?? []))), role: "text", attrs: 0, ...bg },
    ];
  };
  const lines: Line[] = [];
  split.forEach((s, k) => {
    const src = s.unit + 1;
    if (s.row !== undefined) {
      const r = rows[s.row]!;
      const text =
        r.kind === "@@" ? `@@ ${r.text}` : `${g.foldClosed} ${r.count} unchanged line${r.count === 1 ? "" : "s"}`;
      lines.push({
        spans: [{ text, role: r.kind === "@@" ? "diff_head" : "dim", attrs: 0 }],
        src,
        ...(scroll ? { scroll: { ...scroll, part: "top" } } : {}),
      });
      return;
    }
    const { left, right: rc } = cells[k]!;
    const parts: [Cell[] | undefined, Cell[] | undefined][] =
      scrolls || !opts.wrap
        ? [[left, rc]]
        : (() => {
            const l = chunks(left, room);
            const r = chunks(rc, room);
            return Array.from({ length: Math.max(l.length, r.length) }, (_, n) => [l[n], r[n]]);
          })();
    parts.forEach(([l, r], n) => {
      lines.push({
        spans: [
          ...side(s.left, l, n === 0),
          { text: ` ${g.box.v} `, role: "dim", attrs: 0 },
          ...side(s.right, r, n === 0),
        ],
        src,
        // The cursor on the texts, never past the right's end: the padding that tints it is no line's.
        text: [DIFF_GUTTER, r?.length ? right + width(r) : DIFF_GUTTER + width(l ?? [])],
        ...(scroll ? { scroll } : {}),
      });
    });
  });
  // A block that scrolls: a last row under it for its scrollbar, which the cursor never takes.
  if (scroll) lines.push({ spans: [], src: rows.length, decor: true, scroll: { ...scroll, part: "bar" } });
  if (!lines.length) lines.push({ spans: [], src: 1 });
  return { lines, links: [], headings: [], width: opts.wrap ? opts.width : Math.max(opts.width, right + room + 1) };
}
