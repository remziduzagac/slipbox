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
  /** Source rows: the grapheme's UTF-16 offset in its source line. */
  at?: number;
}

const cellCache = new WeakMap<Line, Cell[]>();

/** The graphemes of a rendered row with their display columns (zero-width ones dropped). */
export function cells(line: Line | undefined): Cell[] {
  if (!line) return [];
  let c = cellCache.get(line);
  if (c) return c;
  c = [];
  let x = 0;
  const map = line.srcMap?.cells;
  let i = 0;
  for (const span of line.spans) {
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      const at = map?.[i++]; // srcMap has every grapheme, zero-width ones too
      if (w > 0) {
        const prev = c[c.length - 1];
        // A tab is drawn as several cells with one offset: one stop, as wide as all of them. So is a continuation
        // row's indentation in the code view (24.6), up to its first character, which is a stop of its own.
        if (map && prev && at === prev.at && /^\s$/.test(g)) {
          prev.g = "\t";
          prev.w += w;
        } else c.push(map ? { g, x, w, at } : { g, x, w });
      }
      x += w;
    }
  }
  // A rendered row's trailing spaces are padding, not text: the cursor stops at the last visible
  // character. A source row's are text (a hard break's two spaces): the cursor reaches them.
  if (!map) while (c.length && /^\s$/.test(c[c.length - 1]!.g)) c.pop();
  // A code cell's row (24.13): its stops its own text's, never the cell's padding and border (an empty row's, where its
  // text would start).
  if (line.text) {
    const [from, to] = line.text;
    c = c.filter((x) => x.x >= from && (x.x < to || x.x === from));
    // An empty row: one stop, where its text would be (an empty line's, at its start).
    if (!c.length) c = [map ? { g: " ", x: from, w: 1, at: line.srcMap!.end } : { g: " ", x: from, w: 1 }];
  }
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
  let row = Math.max(0, Math.min(p.row, lastRow(layout)));
  // Never on a frame row: the next row of text, else the one before.
  if (layout.lines[row]?.decor) {
    let r = row;
    while (layout.lines[r]?.decor && r < lastRow(layout)) r++;
    if (layout.lines[r]?.decor) for (r = row; layout.lines[r]?.decor && r > 0; ) r--;
    row = r;
  }
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
  let row = Math.max(0, Math.min(p.row + delta, lastRow(layout)));
  // Frame rows (the lens's rules) are stepped over, in the direction of travel.
  const dir = delta < 0 ? -1 : 1;
  while (layout.lines[row]?.decor && row + dir >= 0 && row + dir <= lastRow(layout)) row += dir;
  if (layout.lines[row]?.decor) row = p.row;
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

/** The word (same-kind run) under a position, as [start, end] columns — for double-click. */
export function wordAt(layout: Layout, p: Pos): [number, number] {
  const cs = cells(layout.lines[p.row]);
  const i = index(cs, p.col);
  const c = cs[i];
  if (!c) return [p.col, p.col];
  const k = kind(c);
  if (k === 0 || k === 3) return [c.x, c.x];
  let a = i;
  let b = i;
  while (a > 0 && kind(cs[a - 1]!) === k) a--;
  while (b < cs.length - 1 && kind(cs[b + 1]!) === k) b++;
  return [cs[a]!.x, cs[b]!.x];
}

/**
 * `f` / `F` / `t` / `T`: the `count`th `ch` after (f, t) or before (F, T) the cursor on its source
 * line — every row of a wrapped line — `t` / `T` stopping one short. Null when there's none.
 */
export function findChar(layout: Layout, p: Pos, kind: "f" | "F" | "t" | "T", ch: string, count = 1, repeat = false): Pos | null {
  const src = layout.lines[p.row]?.src;
  let first = p.row;
  while (first > 0 && layout.lines[first - 1]?.src === src) first--;
  const all: Pos[] = [];
  const gs: string[] = [];
  for (let r = first; layout.lines[r]?.src === src; r++) {
    for (const c of cells(layout.lines[r])) {
      all.push({ row: r, col: c.x });
      gs.push(c.g);
    }
  }
  const here = all.findIndex((q) => q.row === p.row && q.col === snap(layout, p.row, p.col));
  if (here < 0) return null;
  const forward = kind === "f" || kind === "t";
  let seen = 0;
  // Repeating t / T (;) skips the character right next to the cursor, or it would never move on.
  const skip = repeat && (kind === "t" || kind === "T") ? 1 : 0;
  for (let k = here + (forward ? 1 + skip : -1 - skip); forward ? k < all.length : k >= 0; k += forward ? 1 : -1) {
    if (gs[k] !== ch || ++seen < count) continue;
    const at = kind === "t" ? k - 1 : kind === "T" ? k + 1 : k;
    return all[at] ?? null;
  }
  return null;
}
