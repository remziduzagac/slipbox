// What only a real terminal shows (TT-D2): the keys a real one sends, the widths a real one draws. The headless
// checks (tests/terminal/checks/) cover every feature through an emulator answering as a modern terminal does; these
// check the emulator's word against herdr's.

import type { Scenario } from "./helpers.ts";
import type { Session } from "./session.ts";

/** The cursor's line and column, from the status line (`L12:3`). */
function pos(s: Session): { line: number; col: number } {
  const m = /L(\d+):(\d+)/.exec(s.statusLine());
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: -1, col: -1 };
}

/** A row's width in the terminal's columns, as slipbox counts them. */
const widthOf = (row: string) => Bun.stringWidth(row);

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The character drawn at a column of a row (its columns counted as the terminal draws them). */
function charAt(row: string, col: number): string {
  let at = 0;
  for (const { segment } of segmenter.segment(row)) {
    if (at === col) return segment;
    at += widthOf(segment);
    if (at > col) return "";
  }
  return "";
}

/** The column where `re` first matches in a row, in the terminal's columns. */
function columnOf(row: string, re: RegExp): number {
  const i = row.search(re);
  return i < 0 ? -1 : widthOf(row.slice(0, i));
}

export const CHECKS: Scenario[] = [
  {
    name: "keys as a real terminal sends them: escape then a key, ctrl, alt, a bracketed paste",
    run: async (s) => {
      await s.status(/READ/);
      // ctrl and a filter typed: the switcher, narrowed; escape closes it.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("telescope");
      await s.see("telescope-comparison");
      // Escape, then keys at once: escape and j, never alt+j (two j: the first lands on the blank row under the
      // heading, still its line).
      await s.keys("escape", "j", "j");
      await s.notSee(/Open (note|\()/);
      await s.until(() => pos(s).line > 1, 3000, "j to move down after the escape");
      // alt and an arrow: a word along (alt+right), as a Mac's option key sends it.
      const col = pos(s).col;
      await s.keys("alt+right");
      await s.until(() => pos(s).col !== col || pos(s).line !== 1, 3000, "alt+right to move by word");
      // A paste, as a terminal brackets it: one event into the switcher's filter, not keys.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.paste("kenji");
      await s.see("kenji-mori");
      await s.keys("escape");
      await s.notSee(/Open (note|\()/);
    },
  },
  {
    name: "widths as a real terminal draws them: names in their own scripts, every row the pane's width, the frame straight",
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      await s.status("partners-and-names.md");
      await s.see("Partners and names");
      // Down the note, a page at a time: on every screen, no row wider than the pane, and the explorer's border in the
      // column its title row puts it, on every row down to the status line — a character drawn wider or narrower than
      // slipbox counted would push it.
      const title = s.rowOf(/Explorer/);
      s.expect(title >= 0, "the explorer shown");
      const border = columnOf(s.screen()[title]!, /[│┃├┤]/);
      for (let page = 0; page < 6; page++) {
        const rows = s.screen();
        for (const [i, r] of rows.entries())
          s.expect(widthOf(r) <= s.pane.cols, `row ${i} is wider than the pane (${widthOf(r)} > ${s.pane.cols})`);
        for (let i = title; i < rows.length - 2; i++)
          s.expect(/[│┃├┤┼┬┴]/.test(charAt(rows[i]!, border)), `row ${i}: the explorer's border at column ${border}`);
        await s.keys("pagedown");
      }
    },
  },
];
