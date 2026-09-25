// The reading cursor's motions (docs/design/keymap.md). Pure functions over the layout IR: a
// position is (row, col) where row indexes Layout.lines and col is a display column, always the
// start of a grapheme. A wide character is one stop; moving up or down keeps a goal column.

import type { Layout, Line } from "../core/layout/ir.ts";
import { graphemes, graphemeWidth } from "../core/width.ts";

export interface Pos {
  row: number;
  col: number;
}

export interface Cell {
  g: string;
  x: number;
  w: number;
}

const cellCache = new WeakMap<Line, Cell[]>();

/** The graphemes of a rendered row with their display columns (zero-width ones dropped). */
export function cells(line: Line | undefined): Cell[] {
  if (!line) return [];
  let c = cellCache.get(line);
  if (c) return c;
  c = [];
  let x = 0;
  for (const span of line.spans) {
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      if (w > 0) c.push({ g, x, w });
      x += w;
    }
  }
  // Trailing spaces are padding, not text: the cursor stops at the last visible character.
  while (c.length && /^\s$/.test(c[c.length - 1]!.g)) c.pop();
  cellCache.set(line, c);
  return c;
}

export function lastRow(layout: Layout): number {
  return Math.max(0, layout.lines.length - 1);
}

/** The column of the grapheme under display column `x` (or the row's last grapheme). */
export function snap(layout: Layout, row: number, x: number): number {
  const cs = cells(layout.lines[row]);
  if (!cs.length) return 0;
  for (const c of cs) if (x < c.x + c.w) return c.x;
  return cs[cs.length - 1]!.x;
}

export function clampPos(layout: Layout, p: Pos): Pos {
  const row = Math.max(0, Math.min(p.row, lastRow(layout)));
  return { row, col: snap(layout, row, p.col) };
}

function index(cs: Cell[], col: number): number {
  const i = cs.findIndex((c) => c.x === col);
  return i < 0 ? Math.max(0, cs.findIndex((c) => c.x > col) - 1) : i;
}

export function left(layout: Layout, p: Pos): Pos {
  const cs = cells(layout.lines[p.row]);
  const i = index(cs, p.col);
  return { row: p.row, col: i > 0 ? cs[i - 1]!.x : (cs[0]?.x ?? 0) };
}

export function right(layout: Layout, p: Pos): Pos {
  const cs = cells(layout.lines[p.row]);
  const i = index(cs, p.col);
  return { row: p.row, col: i + 1 < cs.length ? cs[i + 1]!.x : (cs[i]?.x ?? 0) };
}

export function vertical(layout: Layout, p: Pos, delta: number, goal: number): Pos {
  const row = Math.max(0, Math.min(p.row + delta, lastRow(layout)));
  return { row, col: snap(layout, row, goal) };
}

export function lineStart(layout: Layout, p: Pos): Pos {
  return { row: p.row, col: cells(layout.lines[p.row])[0]?.x ?? 0 };
}

export function lineEnd(layout: Layout, p: Pos): Pos {
  const cs = cells(layout.lines[p.row]);
  return { row: p.row, col: cs[cs.length - 1]?.x ?? 0 };
}

export function firstNonBlank(layout: Layout, p: Pos): Pos {
  const cs = cells(layout.lines[p.row]);
  const c = cs.find((x) => !/^\s$/.test(x.g));
  return { row: p.row, col: c?.x ?? 0 };
}

export function top(layout: Layout): Pos {
  return firstNonBlank(layout, { row: 0, col: 0 });
}

export function bottom(layout: Layout): Pos {
  return firstNonBlank(layout, { row: lastRow(layout), col: 0 });
}

// Word motions, vim-style: a word is a run of letters, digits and underscores, or a run of
// other non-blank characters; each CJK character is a word of its own; rows end words.

type Kind = 0 | 1 | 2 | 3; // 0 blank, 1 word, 2 punctuation, 3 wide (each its own word)

function kind(c: Cell): Kind {
  if (/^\s$/.test(c.g)) return 0;
  if (c.w === 2) return 3;
  return /^[\p{L}\p{N}_\p{M}]+$/u.test(c.g) ? 1 : 2;
}

interface Stop {
  row: number;
  i: number;
}

function* forward(layout: Layout, from: Stop): Generator<Stop & { c: Cell | null }> {
  for (let r = from.row; r <= lastRow(layout); r++) {
    const cs = cells(layout.lines[r]);
    const start = r === from.row ? from.i + 1 : 0;
    // A row boundary is a word boundary; an empty row is a stop in itself (vim does this too).
    if (r !== from.row) yield { row: r, i: -1, c: null };
    for (let i = start; i < cs.length; i++) yield { row: r, i, c: cs[i]! };
  }
}

function* backward(layout: Layout, from: Stop): Generator<Stop & { c: Cell | null }> {
  for (let r = from.row; r >= 0; r--) {
    const cs = cells(layout.lines[r]);
    const start = r === from.row ? from.i - 1 : cs.length - 1;
    for (let i = start; i >= 0; i--) yield { row: r, i, c: cs[i]! };
    if (r !== 0) yield { row: r, i: -1, c: null };
  }
}

function toPos(layout: Layout, s: Stop): Pos {
  const cs = cells(layout.lines[s.row]);
  return { row: s.row, col: s.i >= 0 ? (cs[s.i]?.x ?? 0) : 0 };
}

function stopAt(layout: Layout, p: Pos): Stop {
  return { row: p.row, i: index(cells(layout.lines[p.row]), p.col) };
}

/** `w`: start of the next word. */
export function wordNext(layout: Layout, p: Pos): Pos {
  const start = stopAt(layout, p);
  const cur = cells(layout.lines[p.row])[start.i];
  const k0 = cur ? kind(cur) : 0;
  let leftWord = k0 === 0 || k0 === 3;
  for (const s of forward(layout, start)) {
    if (s.c === null) {
      // Crossing a row: an empty row stops `w`; otherwise the previous word has ended.
      if (!cells(layout.lines[s.row]).length) return { row: s.row, col: 0 };
      leftWord = true;
      continue;
    }
    const k = kind(s.c);
    if (!leftWord && k === k0 && k !== 3) continue;
    leftWord = true;
    if (k !== 0) return toPos(layout, s);
  }
  return lineEnd(layout, { row: lastRow(layout), col: 0 });
}

/** `b`: start of the previous word (or of this one, when inside it). */
export function wordPrev(layout: Layout, p: Pos): Pos {
  let found: (Stop & { k: Kind }) | null = null;
  for (const s of backward(layout, stopAt(layout, p))) {
    if (s.c === null) {
      if (found) return toPos(layout, found);
      // An empty row (other than the starting one) is a stop, as in vim.
      if (s.row !== p.row && !cells(layout.lines[s.row]).length) return { row: s.row, col: 0 };
      continue;
    }
    const k = kind(s.c);
    if (!found) {
      if (k !== 0) found = { ...s, k };
      continue;
    }
    if (k === found.k && k !== 3 && s.row === found.row) found = { ...s, k };
    else return toPos(layout, found);
  }
  return found ? toPos(layout, found) : { row: 0, col: 0 };
}

/** `e`: end of this word, or of the next one when already at an end. */
export function wordEnd(layout: Layout, p: Pos): Pos {
  let found: (Stop & { k: Kind }) | null = null;
  for (const s of forward(layout, stopAt(layout, p))) {
    if (s.c === null) {
      if (found) return toPos(layout, found);
      continue;
    }
    const k = kind(s.c);
    if (!found) {
      if (k !== 0) found = { ...s, k };
      if (k === 3) return toPos(layout, s);
      continue;
    }
    if (k === found.k && k !== 3 && s.row === found.row) found = { ...s, k };
    else return toPos(layout, found);
  }
  return found ? toPos(layout, found) : p;
}

function blank(layout: Layout, row: number): boolean {
  return cells(layout.lines[row]).every((c) => /^\s$/.test(c.g));
}

/** `}`: the next blank row after this block (vim's paragraph motion over rendered rows). */
export function paragraphNext(layout: Layout, p: Pos): Pos {
  let r = p.row;
  const last = lastRow(layout);
  while (r < last && blank(layout, r)) r++;
  while (r < last && !blank(layout, r)) r++;
  return { row: r, col: 0 };
}

/** `{`: the previous blank row before this block. */
export function paragraphPrev(layout: Layout, p: Pos): Pos {
  let r = p.row;
  while (r > 0 && blank(layout, r)) r--;
  while (r > 0 && !blank(layout, r)) r--;
  return { row: r, col: 0 };
}

export function headingNext(layout: Layout, p: Pos): Pos {
  const h = layout.headings.find((x) => x.line > p.row);
  return h ? firstNonBlank(layout, { row: h.line, col: 0 }) : p;
}

export function headingPrev(layout: Layout, p: Pos): Pos {
  const h = [...layout.headings].reverse().find((x) => x.line < p.row);
  return h ? firstNonBlank(layout, { row: h.line, col: 0 }) : top(layout);
}

/** Order two positions. */
export function ordered(a: Pos, b: Pos): [Pos, Pos] {
  return b.row < a.row || (b.row === a.row && b.col < a.col) ? [b, a] : [a, b];
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col;
}
