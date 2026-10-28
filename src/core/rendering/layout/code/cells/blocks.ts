// Lens block membership and whole-cell grouping; callers supply fit/continuation decisions.
import type { CodeModel } from "../../../../documents/syntax/syntax.ts";

export const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);

/**
 * The code's blocks for the lens (24.8), covering lines 1..`lineCount`: a doc comment, a run of imports, or a line —
 * each with the blank lines after it; a string or comment that spans lines stays with the line it starts on.
 */
export function codeBlocks(
  texts: string[],
  model: CodeModel | null,
  lineCount: number,
  continues: (line: number) => boolean,
): [number, number][] {
  const starts: number[] = [];
  const whole = [...(model?.docs ?? []), ...(model?.imports ?? [])].sort((a, b) => a.start - b.start);
  let w = 0;
  for (let ln = 1; ln <= lineCount; ln++) {
    while (w < whole.length && whole[w]!.end < ln) w++;
    const run = whole[w];
    if (run && ln >= run.start && ln <= run.end) {
      if (ln === run.start) starts.push(ln);
      continue;
    }
    if (texts[ln - 1]?.trim() && !continues(ln)) starts.push(ln);
  }
  if (!starts.length || starts[0]! > 1) starts.unshift(1);
  return starts.map((s, i) => [s, (starts[i + 1] ?? lineCount + 1) - 1]);
}

/**
 * The lens's blocks with each cell whole (24.16) — its documentation with its code; a class's head, its doc, its
 * fields — when it fits (`fits`: its rows within the lens's maximum), and which blocks those are, by their first line.
 * A cell too tall stays its lines' blocks.
 */
export function cellBlocks(
  blocks: [number, number][],
  cells: readonly { from: number; to: number }[],
  fits: (from: number, to: number) => boolean,
): { blocks: [number, number][]; whole: Set<number> } {
  const ends = new Map(cells.map((c) => [c.from, c.to]));
  const out: [number, number][] = [];
  const whole = new Set<number>();
  for (let i = 0; i < blocks.length; ) {
    const to = ends.get(blocks[i]![0]);
    let j = i;
    while (to !== undefined && j + 1 < blocks.length && blocks[j + 1]![0] <= to) j++;
    const cell: [number, number] = [blocks[i]![0], blocks[j]![1]];
    if (to !== undefined && fits(cell[0], cell[1])) {
      out.push(cell);
      whole.add(cell[0]);
      i = j + 1;
    } else out.push(blocks[i++]!);
  }
  return { blocks: out, whole };
}
