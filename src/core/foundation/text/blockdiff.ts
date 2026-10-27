// A note's diff before and after (GIT-D2): the diff found by lines, as every diff is, then widened to the blocks it
// touches — a paragraph, a heading, a list item, a table's row — so each changed block is shown whole, twice, as it was
// and as it is, the words removed marked in the first and those added in the second; a block too big to diff by words,
// its changed lines marked instead, and their changed words. A block added or removed whole is shown once. The
// unchanged stretches between fold to a row saying how many lines they hold. `layout/blockdiff.ts` draws it.

import type { ListItem, Nodes, Root, RootContent, Table } from "mdast";
import {
  diffLines,
  type Hunk,
  type LinePair,
  pairLines,
  textLines,
  type UnseenRows,
  type WordRange,
} from "../../merge.ts";
import { headingText, parseMarkdown } from "../../documents/markdown/parse.ts";

/** A block of a note: its lines (1-based, inclusive), and the node it lays out; none: lines shown as written. */
export interface NoteBlock {
  from: number;
  to: number;
  node?: Nodes;
  /** A table's row: the header's, its delimiter row with it. */
  header?: boolean;
}

/** One side of a diff: its lines and its blocks, in order. */
export interface BlockSide {
  lines: string[];
  blocks: NoteBlock[];
}

/** What a note's diff shows, in order. Each carries the first of its units (`BlockDiff.units`). */
export type BlockItem =
  /** A group's head: its first line in `to`, and the heading it's under there. */
  | { kind: "@@"; line: number; heading: string | null; unit: number }
  /** Unchanged lines folded: `own`, the first in `from` (what opens it); `line`, the first in `to`. */
  | { kind: "fold"; own: number; line: number; count: number; unit: number }
  /** An unchanged block: a fold opened, or one between changes. */
  | { kind: "same"; block: NoteBlock; unit: number }
  /**
   * A changed block, before and after: the words `before` lost, and those `after` gained (offsets in its text). A block
   * too big to diff by words, by its lines: `delLines` and `addLines` its changed lines (their runs of its text), the
   * words those paired with a line like them changed in `del` and `add`.
   */
  | {
      kind: "change";
      before: NoteBlock;
      after: NoteBlock;
      del: WordRange[];
      add: WordRange[];
      delLines?: WordRange[];
      addLines?: WordRange[];
      unit: number;
    }
  /** A block removed whole (`from`'s), and where it was in `to`. */
  | { kind: "removed"; block: NoteBlock; line: number; unit: number }
  /** A block added whole (`to`'s). */
  | { kind: "added"; block: NoteBlock; unit: number }
  /** What changed that no line shows (`unseenRows`), as said, and the line it's at in `to`. */
  | { kind: "\\"; text: string; line: number; unit: number };

export interface BlockDiff {
  from: BlockSide;
  to: BlockSide;
  items: BlockItem[];
  /**
   * The window's rows of text, each a unit the layout's rows point at (their `src`): a head, a fold, a line of a block
   * shown, what no line shows. `line` is where `enter` goes, in `to`: a removed line's, where it was.
   */
  units: { text: string; line: number }[];
}

const noCR = (line: string) => line.replace(/\r$/, "");

/**
 * A changed block's lines diffed (`before` of `from`, `after` of `to`): where each of `before`'s lines is in `to` — an
 * unchanged one, where it is in `after`; a changed one, where its run of changes is, the line after it (in `after`), as
 * the source diff's removed lines go. A pair too big to diff by words (`byLines`): its changed lines, and the words
 * changed in each changed line paired with one like it, as offsets in each block's text.
 */
function pairDiff(
  fs: BlockSide,
  before: NoteBlock,
  ts: BlockSide,
  after: NoteBlock,
  p: LinePair,
): { at: Int32Array; del: WordRange[]; add: WordRange[]; delLines?: WordRange[]; addLines?: WordRange[] } {
  const ra = fs.lines.slice(before.from - 1, before.to);
  const rb = ts.lines.slice(after.from - 1, after.to);
  const la = ra.map(noCR);
  const lb = rb.map(noCR);
  const hunks = diffLines(la, lb);
  const at = new Int32Array(la.length);
  let k = 0;
  let shift = 0;
  for (const h of [...hunks, { aStart: la.length, aLen: 0, bStart: lb.length, bLen: 0 }]) {
    for (; k < h.aStart; k++) at[k] = after.from + k + shift;
    for (; k < h.aStart + h.aLen; k++) at[k] = after.from + Math.min(h.bStart, lb.length - 1);
    shift = h.bStart + h.bLen - (h.aStart + h.aLen);
  }
  if (!p.byLines) return { at, del: p.delWords, add: p.addWords };
  // Each line's first offset in its block's text; a run of lines up to the next one's, its line break with it.
  const starts = (r: string[]) => {
    const s = [0];
    for (const l of r) s.push(s[s.length - 1]! + l.length + 1);
    return s;
  };
  const sa = starts(ra);
  const sb = starts(rb);
  const out = {
    at,
    del: [] as WordRange[],
    add: [] as WordRange[],
    delLines: [] as WordRange[],
    addLines: [] as WordRange[],
  };
  const moved = (ranges: WordRange[], by: number) => ranges.map(([x, y]): WordRange => [x + by, y + by]);
  for (const h of hunks) {
    if (h.aLen) out.delLines.push([sa[h.aStart]!, sa[h.aStart + h.aLen]!]);
    if (h.bLen) out.addLines.push([sb[h.bStart]!, sb[h.bStart + h.bLen]!]);
    for (const q of pairLines(la.slice(h.aStart, h.aStart + h.aLen), lb.slice(h.bStart, h.bStart + h.bLen))) {
      out.del.push(...moved(q.delWords, sa[h.aStart + q.del]!));
      out.add.push(...moved(q.addWords, sb[h.bStart + q.add]!));
    }
  }
  return out;
}

/** A group's head as it reads: the heading it's under in `to`, and where it starts there. */
export function headText(heading: string | null, line: number): string {
  return heading ? `@@ ${heading}  (line ${line})` : `@@ line ${line}`;
}

/** A block's text: its lines, as written. */
export function blockText(side: BlockSide, b: NoteBlock): string {
  return side.lines.slice(b.from - 1, b.to).join("\n");
}

const blank = (line: string | undefined) => !line?.trim();

/**
 * A note's blocks, in order: each top-level node, a list a block per item (a nested list's items blocks of their own,
 * after the item's own lines), a table a block per row (the header's with its delimiter row). The lines no node covers
 * that aren't blank — a link's definition, what the parser left out — are blocks of their own, shown as written.
 */
export function noteBlocks(tree: Root, lines: string[]): NoteBlock[] {
  const out: NoteBlock[] = [];
  const add = (from: number, to: number, b: Omit<NoteBlock, "from" | "to"> = {}) => {
    let end = Math.min(to, lines.length);
    while (end > from && blank(lines[end - 1])) end--;
    if (from >= 1 && end >= from) out.push({ from, to: end, ...b });
  };
  const start = (n: { position?: { start: { line: number } } }) => n.position?.start.line;
  const end = (n: { position?: { end: { line: number } } }) => n.position?.end.line;
  const item = (it: ListItem) => {
    const s = start(it);
    const e = end(it);
    if (s === undefined || e === undefined) return;
    const nested = it.children.findIndex((c) => c.type === "list");
    const own = nested < 0 ? e : (start(it.children[nested]!) ?? e + 1) - 1;
    add(s, own, { node: it });
    if (nested >= 0) for (const c of it.children.slice(nested)) node(c);
  };
  const table = (t: Table) => {
    t.children.forEach((row, i) => {
      const s = start(row);
      if (s === undefined) return;
      const next = t.children[i + 1];
      add(s, (next ? (start(next) ?? s + 1) : (end(t) ?? s)) - (next ? 1 : 0), {
        node: row,
        ...(i === 0 ? { header: true } : {}),
      });
    });
  };
  const node = (n: RootContent) => {
    if (n.type === "list") for (const it of n.children) item(it);
    else if (n.type === "table") table(n);
    else {
      const s = start(n);
      const e = end(n);
      if (s !== undefined && e !== undefined) add(s, e, { node: n });
    }
  };
  for (const n of tree.children) node(n);
  out.sort((a, b) => a.from - b.from);
  // What no node covers, and isn't blank: as written. Overlaps (a node a parser placed oddly) are cut.
  const covered = new Uint8Array(lines.length + 2);
  const kept: NoteBlock[] = [];
  for (const b of out) {
    if (b.from <= (kept.at(-1)?.to ?? 0)) continue;
    kept.push(b);
    covered.fill(1, b.from, b.to + 1);
  }
  for (let l = 1; l <= lines.length; l++) {
    if (covered[l] || blank(lines[l - 1])) continue;
    let e = l;
    while (e < lines.length && !covered[e + 1] && !blank(lines[e])) e++;
    kept.push({ from: l, to: e });
    l = e;
  }
  return kept.sort((a, b) => a.from - b.from);
}

/** The index of the first of `list` (in order) that `past` holds for — all after it hold too — found by halves; the
 *  list's length when none does. */
function firstAt<T>(list: readonly T[], past: (x: T) => boolean): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (past(list[mid]!)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The blocks (in order, apart) wholly inside lines [s, e), 0-based. */
function inside(blocks: NoteBlock[], s: number, e: number): NoteBlock[] {
  const out: NoteBlock[] = [];
  for (let k = firstAt(blocks, (bl) => bl.from - 1 >= s); k < blocks.length && blocks[k]!.to <= e; k++)
    out.push(blocks[k]!);
  return out;
}

/** For each line (0-based), the index of the block holding it, or -1. */
function blockAt(blocks: NoteBlock[], count: number): Int32Array {
  const at = new Int32Array(count).fill(-1);
  blocks.forEach((b, i) => at.fill(i, b.from - 1, b.to));
  return at;
}

/** Whether a cut before line `i` (0-based) splits no block. */
function cuts(at: Int32Array, i: number): boolean {
  return i <= 0 || i >= at.length || at[i - 1] === -1 || at[i - 1] !== at[i];
}

/**
 * A note's diff, `from` to `to`, as blocks before and after: each group of changes widened to the blocks it touches on
 * both sides, its blocks paired by how alike they are (`pairLines`, white space all one), each pair a change, the
 * others removed or added whole. The unchanged lines between, before the first and after the last fold to a row —
 * unless they're blank, or the stretch's first line (`from`'s, 1-based) is in `open`: then its blocks are shown.
 * `heads` and `folds` off (a review's hunk, a merge's card: GIT-D3, GIT-D5): the changes alone, no head over a group
 * and nothing of the stretches between. `unseen`: what changed that no line shows, said before the first group and
 * after the last, as the source diff says it (`diffView`).
 */
export function blockDiff(
  from: string,
  to: string,
  open: ReadonlySet<number> = new Set(),
  opts: { heads?: boolean; folds?: boolean; unseen?: UnseenRows } = {},
): BlockDiff {
  const a = textLines(from);
  const b = textLines(to);
  const fs: BlockSide = { lines: a, blocks: noteBlocks(parseMarkdown(from).tree, a) };
  const tree = parseMarkdown(to).tree;
  const ts: BlockSide = { lines: b, blocks: noteBlocks(tree, b) };
  const d: BlockDiff = { from: fs, to: ts, items: [], units: [] };
  const unit = (text: string, line: number) => d.units.push({ text, line }) - 1;
  const said = (texts: string[] | undefined, line: number) => {
    for (const text of texts ?? []) d.items.push({ kind: "\\", text, line, unit: unit(`\\ ${text}`, line) });
  };
  said(opts.unseen?.start, 1);
  const done = () => {
    said(opts.unseen?.end, Math.max(1, b.length));
    return d;
  };
  const hunks = diffLines(a, b);
  if (!hunks.length) return done();
  const fat = blockAt(fs.blocks, a.length);
  const tat = blockAt(ts.blocks, b.length);
  // The unchanged runs around the hunks: run k before hunk k (the last after the last hunk), the same length on both
  // sides, line for line alike.
  const runs = hunks.map((h, k) => {
    const p = hunks[k - 1];
    return { a: p ? p.aStart + p.aLen : 0, b: p ? p.bStart + p.bLen : 0, len: h.aStart - (p ? p.aStart + p.aLen : 0) };
  });
  const last = hunks[hunks.length - 1]!;
  runs.push({ a: last.aStart + last.aLen, b: last.bStart + last.bLen, len: a.length - (last.aStart + last.aLen) });
  const valid = (r: { a: number; b: number }, k: number) => cuts(fat, r.a + k) && cuts(tat, r.b + k);
  /** Whether `from`'s lines [s, e) hold no more than a line of text. */
  const few = (s: number, e: number) => a.slice(s, e).filter((l) => !blank(l)).length <= 1;
  // Each group: from a cut in the run before its first hunk to one in the run after its last, as near the hunks as
  // splits no block on either side. A run with no such cut before the next hunk joins the two.
  const groups: { a0: number; b0: number; a1: number; b1: number }[] = [];
  for (let i = 0; i < hunks.length; ) {
    const before = runs[i]!;
    let k = before.len;
    while (k > 0 && !valid(before, k)) k--;
    let j = i;
    let e = 0;
    for (;;) {
      const after = runs[j + 1]!;
      const end = j + 1 < hunks.length ? after.len - 1 : after.len;
      while (e <= end && !valid(after, e)) e++;
      if (e <= end) break;
      j++;
      e = 0;
    }
    const after = runs[j + 1]!;
    const g = { a0: before.a + k, b0: before.b + k, a1: after.a + e, b1: after.b + e };
    // Groups with no more than a line of text between them are one: that line shown, not folded.
    const prev = groups[groups.length - 1];
    if (prev && few(prev.a1, g.a0)) Object.assign(prev, { a1: g.a1, b1: g.b1 });
    else groups.push(g);
    i = j + 1;
  }
  // So are a line of text before the first and one after the last.
  const first = groups[0]!;
  if (few(0, first.a0)) Object.assign(first, { a0: 0, b0: 0 });
  const end = groups[groups.length - 1]!;
  if (few(end.a1, a.length)) Object.assign(end, { a1: a.length, b1: b.length });
  // The headings of `to`, by line: a group's head names the one it's under.
  const headings = tree.children.flatMap((n) =>
    n.type === "heading" && n.position
      ? [{ line: n.position.start.line, text: `${"#".repeat(n.depth)} ${headingText(n)}` }]
      : [],
  );
  // A block's lines, a unit each, as the source diff's rows read: `-` before a line of `from`'s, `+` before one of
  // `to`'s that changed, two spaces before one that didn't (a CRLF line's CR not part of it). A line of `from`'s goes
  // where `line` says.
  const linesOf = (sign: "-" | "+" | " ", bl: NoteBlock, line?: (l: number) => number) => {
    const s = sign === "-" ? fs : ts;
    let first = -1;
    for (let l = bl.from; l <= bl.to; l++) {
      const u = unit(`${sign} ${noCR(s.lines[l - 1] ?? "")}`, line ? line(l) : l);
      if (first < 0) first = u;
    }
    return first;
  };
  const same = (bl: NoteBlock) => d.items.push({ kind: "same", block: bl, unit: linesOf(" ", bl) });
  // `from`'s lines [s, e) unchanged — `to`'s from `bs` on: folded, or shown when opened. (Never blank alone: the groups
  // around took it in.)
  const stretch = (s: number, e: number, bs: number) => {
    if (e <= s || opts.folds === false) return;
    if (open.has(s + 1)) {
      for (const bl of inside(ts.blocks, bs, bs + (e - s))) same(bl);
      return;
    }
    d.items.push({
      kind: "fold",
      own: s + 1,
      line: bs + 1,
      count: e - s,
      unit: unit(`${e - s} unchanged lines`, bs + 1),
    });
  };
  let shownA = 0;
  let shownB = 0;
  for (const g of groups) {
    stretch(shownA, g.a0, shownB);
    const fb = inside(fs.blocks, g.a0, g.a1);
    const tb = inside(ts.blocks, g.b0, g.b1);
    const line = Math.max(1, Math.min(tb[0]?.from ?? g.b0 + 1, b.length));
    const heading = headings[firstAt(headings, (h) => h.line >= line) - 1]?.text ?? null;
    if (opts.heads !== false) d.items.push({ kind: "@@", line, heading, unit: unit(headText(heading, line), line) });
    // Blocks the same on both sides, by their text; between them, each removed one paired with the added one most
    // like it, as a changed line is with a line (white space all one: a paragraph wrapped again is the same).
    const ft = fb.map((bl) => blockText(fs, bl));
    const tt = tb.map((bl) => blockText(ts, bl));
    // Where a removed block was, in `to`: before the next block there, else at the group's end.
    const where = (k: number) => tb[k]?.from ?? Math.max(1, Math.min(g.b1 + 1, b.length));
    let fi = 0;
    let ti = 0;
    const blockHunks: Hunk[] = diffLines(ft, tt);
    for (const h of [...blockHunks, { aStart: ft.length, aLen: 0, bStart: tt.length, bLen: 0 }]) {
      for (; fi < h.aStart && ti < h.bStart; fi++, ti++) same(tb[ti]!);
      const rem = ft.slice(h.aStart, h.aStart + h.aLen);
      const add = tt.slice(h.bStart, h.bStart + h.bLen);
      let r = 0;
      let n = 0;
      const removed = (upTo: number) => {
        for (; r < upTo; r++) {
          const bl = fb[h.aStart + r]!;
          const line = where(h.bStart + n);
          d.items.push({ kind: "removed", block: bl, line, unit: linesOf("-", bl, () => line) });
        }
      };
      const added = (upTo: number) => {
        for (; n < upTo; n++) {
          const bl = tb[h.bStart + n]!;
          d.items.push({ kind: "added", block: bl, unit: linesOf("+", bl) });
        }
      };
      for (const p of pairLines(rem, add, true)) {
        removed(p.del);
        added(p.add);
        const before = fb[h.aStart + r]!;
        const after = tb[h.bStart + n]!;
        const { at, ...marks } = pairDiff(fs, before, ts, after, p);
        const u = linesOf("-", before, (l) => at[l - before.from]!);
        linesOf("+", after);
        d.items.push({ kind: "change", before, after, ...marks, unit: u });
        r++;
        n++;
      }
      removed(rem.length);
      added(add.length);
      fi = h.aStart + h.aLen;
      ti = h.bStart + h.bLen;
    }
    shownA = g.a1;
    shownB = g.b1;
  }
  stretch(shownA, a.length, shownB);
  return done();
}
