// Pure lens row visibility and movement through hidden ranges.

import type { Layout } from "../../../../core/rendering/layout/ir.ts";

/** Whether layout row `r` is left out of the drawing (an oversized lens's hidden rows). */
export function isHidden(hidden: [number, number][], r: number): boolean {
  for (const [a, b] of hidden) if (r >= a && r < b) return true;
  return false;
}

/** From `row`, `n` shown rows on (back when negative), skipping hidden ones; within the layout. */
export function stepVisible(layout: Layout, hidden: [number, number][], row: number, n: number): number {
  let r = row;
  let k = Math.abs(n);
  const dir = n < 0 ? -1 : 1;
  while (k > 0) {
    const next = r + dir;
    if (next < 0 || next > layout.lines.length) break;
    r = next;
    if (r < layout.lines.length && !isHidden(hidden, r)) k--;
  }
  return Math.max(0, Math.min(r, Math.max(0, layout.lines.length - 1)));
}

/** How many shown rows lie between `a` and `b` (negative when `b` is before `a`). */
export function visibleBetween(hidden: [number, number][], a: number, b: number): number {
  let n = 0;
  for (let r = Math.min(a, b); r < Math.max(a, b); r++) if (!isHidden(hidden, r)) n++;
  return b >= a ? n : -n;
}
