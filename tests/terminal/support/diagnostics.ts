import type { Session } from "../session.ts";

/** The style of the cell at `col` of `row` (a column of the screen's text). */
function styleAt(s: Session, row: number, col: number) {
  let n = 0;
  for (const r of s.runs()[row] ?? []) {
    if (col < n + r.text.length) return r;
    n += r.text.length;
  }
  return null;
}

/** The style of line `n`'s number in the gutter, on the row that shows `text` after it. */
export function numberStyle(s: Session, n: number, text: string) {
  const re = new RegExp(`\\b${n}\\s+${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const row = s.rowOf(re);
  if (row < 0) return null;
  return styleAt(s, row, re.exec(s.screen()[row]!)!.index);
}
