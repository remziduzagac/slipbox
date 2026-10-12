// Table allocator (plan 2.3). Starts from render-markdown's parser/table.lua and fixes its known
// flaw, then goes further on how spare width is shared out.
//
//   desired[i] = max over rows of (content width + 2 * padding)
//   minimum[i] = max over rows of (longest soft segment + 2 * padding)
//   budget     = width - (ncols + 1)
//
//   sum(desired) <= budget   -> desired: nothing wraps
//   budget < ncols * 5       -> no grid: one record per row (a column under 3 content columns is
//                               unreadable; 5 = MIN_CONTENT + 2 * padding)
//   sum(minimum) <= budget   -> every column at its own minimum, then the surplus placed by cost
//                               (below)
//   fair share >= MIN_USEFUL -> words must break: columns floored at a fair share, same surplus rule
//   otherwise                -> no grid: one record per row (narrow collapse, 3.14)
//
// render-markdown checks `minimum` only in aggregate, so a column can end up narrower than its
// longest word and overflow. Here no column starts below its own minimum.
//
// **Where the surplus goes.** Handing every column an equal share (water-filling) ignores how
// much text each holds: a sentence column ends up as narrow as a one-word column and wraps into a
// tall ribbon. Instead the allocator minimises a cost: the table's rendered height (the sum over
// rows of the tallest cell) plus SPLIT_COST per word split across lines. Greedy search can stall
// on a plateau, so three candidates are scored and the cheapest wins: greedy (each step widens the
// column that removes the most cost per column spent) then water-filled toward `desired`,
// water-filling alone, and the surplus shared in proportion to each column's unmet width.

export const PADDING = 1;
/** Narrowest content width a column may have, in columns — once every column's longest word
 *  fits: keeping words whole comes first, then this floor, from what room is left. */
const MIN_CONTENT = 3;
/** Below this content width per column, a grid is harder to read than records. */
const MIN_USEFUL = 6;
/** How far ahead to look for a width that removes a row, per column per step. */
const LOOKAHEAD = 48;

export interface Allocation {
  mode: "grid" | "records";
  /** Column widths including padding, excluding borders. */
  widths: number[];
  /** True when columns may be narrower than their longest word (words break mid-grapheme). */
  breaksWords: boolean;
}

/** For column `col` at content width `w`: each row's wrapped line count, and how many words
 *  in the column get split across lines. */
export type LinesAt = (col: number, contentWidth: number) => { lines: number[]; splits: number };

/** A word split across lines costs about as much as an extra row: names and paths stay whole
 *  when that is affordable, and break only when the alternative is worse. */
const SPLIT_COST = 1;

export function allocate(desired: number[], minimum: number[], width: number, linesAt?: LinesAt): Allocation {
  const n = desired.length;
  const budget = width - (n + 1);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (n === 0) return { mode: "grid", widths: [], breaksWords: false };
  if (sum(desired) <= budget) return { mode: "grid", widths: [...desired], breaksWords: false };
  if (budget < n * (MIN_CONTENT + 2 * PADDING)) return { mode: "records", widths: [], breaksWords: true };

  let base: number[];
  let breaksWords = false;
  if (sum(minimum) <= budget) {
    base = [...minimum];
    // The room left raises columns narrower than the floor first (a one-letter column is still
    // three wide when it can be), before any column grows past it.
    let spare = budget - sum(base);
    for (let i = 0; i < n && spare > 0; i++) {
      const give = Math.min(spare, Math.max(0, Math.min(desired[i]!, MIN_CONTENT + 2 * PADDING) - base[i]!));
      base[i]! += give;
      spare -= give;
    }
  } else {
    // Words have to break. Floor each column at min(desired, its minimum, a fair share).
    const fair = Math.floor(budget / n);
    if (fair - 2 * PADDING < MIN_USEFUL) return { mode: "records", widths: [], breaksWords: true };
    breaksWords = true;
    base = desired.map((d, i) => Math.max(Math.min(d, minimum[i]!, fair), Math.min(d, MIN_CONTENT + 2 * PADDING)));
    let over = sum(base) - budget;
    while (over > 0) {
      // Fair shares overshot: trim the widest back down.
      let wi = 0;
      for (let i = 1; i < n; i++) if (base[i]! > base[wi]!) wi = i;
      if (base[wi]! <= MIN_CONTENT + 2 * PADDING) break;
      base[wi]!--;
      over--;
    }
  }
  const plain = waterFill(base, desired, budget - sum(base));
  if (!linesAt) return { mode: "grid", widths: plain, breaksWords };
  // Greedy can stall on a plateau (a row tall in two columns shrinks only when both widen), so
  // score a few candidates and keep the cheapest. Water-filling is always one of them.
  const greedy = minimiseHeight(base, desired, budget - sum(base), linesAt);
  const candidates = [
    waterFill(greedy, desired, budget - sum(greedy)),
    plain,
    proportional(base, desired, budget - sum(base)),
  ];
  const score = scorer(linesAt);
  let best = candidates[0]!;
  let bestCost = score(best);
  for (const c of candidates.slice(1)) {
    const cost = score(c);
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return { mode: "grid", widths: best, breaksWords };
}

/** Table cost of an allocation: rendered height plus SPLIT_COST per word split across lines. */
function scorer(linesAt: LinesAt): (widths: number[]) => number {
  return (widths) => {
    const per = widths.map((w, c) => linesAt(c, Math.max(1, w - 2 * PADDING)));
    const rows = per[0]?.lines.length ?? 0;
    let cost = 0;
    for (let r = 0; r < rows; r++) {
      let h = 1;
      for (const p of per) if (p.lines[r]! > h) h = p.lines[r]!;
      cost += h;
    }
    for (const p of per) cost += SPLIT_COST * p.splits;
    return cost;
  };
}

/** Surplus shared in proportion to how much each column still wants. */
function proportional(start: number[], desired: number[], surplus: number): number[] {
  const want = desired.map((d, i) => Math.max(0, d - start[i]!));
  const total = want.reduce((a, b) => a + b, 0);
  if (!total) return [...start];
  const widths = start.map((w, i) => w + Math.floor((surplus * want[i]!) / total));
  const used = widths.reduce((a, b) => a + b, 0) - start.reduce((a, b) => a + b, 0);
  return waterFill(widths, desired, surplus - used);
}

/**
 * Greedy minimisation of height + SPLIT_COST × split words: repeatedly spend surplus on the
 * column whose widening removes the most cost per column spent.
 */
function minimiseHeight(start: number[], desired: number[], surplus: number, linesAt: LinesAt): number[] {
  const n = start.length;
  const widths = [...start];
  const cache = new Map<number, { lines: number[]; splits: number }>();
  const at = (c: number, w: number) => {
    const key = c * 100_000 + w;
    let v = cache.get(key);
    if (!v) cache.set(key, (v = linesAt(c, Math.max(1, w - 2 * PADDING))));
    return v;
  };
  const rows = at(0, widths[0]!).lines.length;
  let rest = surplus;
  while (rest > 0) {
    const perCol = widths.map((w, c) => at(c, w));
    let best: { col: number; k: number; ratio: number } | null = null;
    for (let c = 0; c < n; c++) {
      const room = Math.min(rest, desired[c]! - widths[c]!, LOOKAHEAD);
      if (room <= 0) continue;
      // Each row's height ignoring column c: the tallest of the other columns' cells.
      const others = new Array<number>(rows).fill(1);
      for (let r = 0; r < rows; r++) {
        for (let o = 0; o < n; o++) if (o !== c && perCol[o]!.lines[r]! > others[r]!) others[r] = perCol[o]!.lines[r]!;
      }
      const cost = (v: { lines: number[]; splits: number }) => {
        let h = 0;
        for (let r = 0; r < rows; r++) h += Math.max(v.lines[r]!, others[r]!);
        return h + SPLIT_COST * v.splits;
      };
      const current = cost(perCol[c]!);
      for (let k = 1; k <= room; k++) {
        const next = cost(at(c, widths[c]! + k));
        if (next < current) {
          const ratio = (current - next) / k;
          if (!best || ratio > best.ratio) best = { col: c, k, ratio };
          break;
        }
      }
    }
    if (!best) break;
    widths[best.col]! += best.k;
    rest -= best.k;
  }
  return widths;
}

/** Raise columns toward `desired` by equal shares until `surplus` is spent. */
function waterFill(start: number[], desired: number[], surplus: number): number[] {
  const widths = [...start];
  let rest = surplus;
  let active = widths.map((_, i) => i).filter((i) => widths[i]! < desired[i]!);
  while (rest > 0 && active.length) {
    const share = Math.floor(rest / active.length);
    if (share === 0) {
      // Hand out the last few columns to the largest deficits.
      active.sort((a, b) => desired[b]! - widths[b]! - (desired[a]! - widths[a]!));
      for (let k = 0; k < rest && k < active.length; k++) widths[active[k]!]!++;
      break;
    }
    for (const i of active) {
      const add = Math.min(share, desired[i]! - widths[i]!);
      widths[i]! += add;
      rest -= add;
    }
    active = active.filter((i) => widths[i]! < desired[i]!);
  }
  return widths;
}
