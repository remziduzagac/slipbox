import { type Check, HANDBOOK, leader, open, pos } from "../check.ts";
import { lineOf } from "../support/navigation.ts";

export const LIST_INTERACTIONS: Check[] = [
  // --- lists, questions, the mouse ----------------------------------------------------------
  {
    area: "navigating",
    name: "lists: moves wrap around the ends, pagedown and ctrl+d by ten; ctrl+w and backspace edit the filter",
    covers: { cases: ["lists-prompts", "switcher"], commands: ["switcher.open"] },
    options: { size: { cols: 120, rows: 40 } },
    run: async (s) => {
      const counter = () => /\s(\d+)\/(\d+) ┘/.exec(s.screen().find((r) => / \d+\/\d+ ┘/.test(r)) ?? "");
      const at = () => Number(counter()?.[1] ?? -1);
      const total = () => Number(counter()?.[2] ?? -1);
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.until(() => at() === 1 && total() > 12, 3000, "the switcher at its first entry");
      const n = total();
      await s.keys("up");
      await s.until(() => at() === n, 3000, "up from the first: the last");
      await s.keys("down");
      await s.until(() => at() === 1, 3000, "down from the last: the first");
      await s.keys("pagedown");
      await s.until(() => at() === 11, 3000, "pagedown: ten down");
      await s.keys("pageup");
      await s.until(() => at() === 1, 3000, "pageup: ten up");
      await s.keys("ctrl+d");
      await s.until(() => at() === 11, 3000, "ctrl+d: ten down");
      await s.keys("ctrl+u");
      await s.until(() => at() === 1, 3000, "ctrl+u: ten up");
      // The other moves a list has: tab and shift+tab, ctrl+n and ctrl+p, ctrl+j and ctrl+k.
      for (const [down, up] of [
        ["tab", "shift+tab"],
        ["ctrl+n", "ctrl+p"],
        ["ctrl+j", "ctrl+k"],
      ] as const) {
        await s.keys(down);
        await s.until(() => at() === 2, 3000, `${down}: the next entry`);
        await s.keys(up);
        await s.until(() => at() === 1, 3000, `${up}: the one before`);
      }
      // Typed, the filter narrows; ctrl+w takes its last word off, backspace a letter.
      await s.type("hand guide");
      await s.until(() => total() === 1, 3000, "the writing guide alone with hand and guide");
      await s.keys("ctrl+w");
      await s.until(() => s.rowOf(/› hand\s*│/) >= 0 && total() === 2, 3000, "ctrl+w: guide gone, both handbook notes");
      await s.keys("backspace", "backspace", "backspace", "backspace", "backspace");
      await s.until(() => total() === n, 3000, "backspace to an empty filter: every entry again");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "switcher: words in any order; # lists the note's headings to jump to",
    covers: { cases: ["switcher"], commands: ["switcher.open"] },
    options: { open: HANDBOOK, size: { cols: 120, rows: 40 } },
    run: async (s) => {
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("guide writing");
      await s.see(/│ handbook\/writing-guide\.md/);
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("#O22");
      await s.see(/│ O22: Remote access through one gateway .* handbook\/operations-handbook\.md:\d+/);
      await s.keys("enter");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O22:"), 3000, "the cursor on O22's heading");
    },
  },
  {
    area: "navigating",
    name: "questions: enter answers nothing, n says no, esc cancels, y says yes",
    covers: { cases: ["questions", "trash"], commands: ["note.delete"] },
    options: { open: "scratch/wrap-probe.md", size: { cols: 120, rows: 34 } },
    run: async (s) => {
      const NOTE = "scratch/wrap-probe.md";
      const ASKED = "Delete scratch/wrap-probe.md?";
      const ask = async () => {
        await leader(s, "n", "d");
        await s.see(ASKED);
      };
      await ask();
      await s.keys("enter");
      await s.see(ASKED); // still asking
      await s.keys("n");
      await s.notSee(ASKED);
      s.expect(s.exists(NOTE), "n: the note kept");
      await ask();
      await s.keys("escape");
      await s.notSee(ASKED);
      s.expect(s.exists(NOTE), "esc: the note kept");
      await ask();
      await s.keys("y");
      await s.notSee(ASKED);
      await s.until(() => !s.exists(NOTE), 3000, "y: the note gone to the trash");
    },
  },
  {
    area: "navigating",
    name: "mouse: a click follows a link, ‹ goes back, a tab clicked, the wheel scrolls; ≡ hides the explorer",
    covers: { cases: ["mouse", "history", "tabs"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      /** A click (SGR's reports, as a terminal sends them) on the first place `needle` shows. */
      const click = async (needle: string, row = s.rowOf(needle)) => {
        s.expect(row >= 0, `${needle} on screen to click`);
        const col = [...s.screen()[row]!].join("").indexOf(needle);
        const x = Bun.stringWidth(s.screen()[row]!.slice(0, col)) + 1;
        await s.send(`\x1b[<0;${x};${row + 1}M`);
        await s.send(`\x1b[<0;${x};${row + 1}m`);
      };
      await click("operations-handbook — how");
      await s.status("operations-handbook.md");
      // The status line's ‹: back.
      await click("‹", s.rows - 1);
      await s.status("home.md");
      // A second tab; the first one's clicked.
      await s.keys("ctrl+t", "c");
      await open(s, "writing-guide");
      await click("1 home.md");
      await s.status("home.md");
      // The wheel scrolls the note: its first row leaves the top.
      const TOP = "▌ Halden Ridge Observatory";
      await s.see(TOP);
      const row = s.rowOf("Welcome to the observatory");
      const x = Bun.stringWidth(s.screen()[row]!.slice(0, s.screen()[row]!.indexOf("Welcome"))) + 1;
      await s.send(`\x1b[<65;${x};${row + 1}M`);
      await s.notSee(TOP);
      await s.send(`\x1b[<64;${x};${row + 1}M`);
      await s.see(TOP);
      // The rail's ≡: the explorer hidden, then shown.
      await s.see("Explorer");
      const railRow = () => s.screen().findIndex((line, i) => i > 0 && /^ ≡/.test(line));
      await click("≡", railRow());
      await s.notSee("Explorer");
      await click("≡", railRow());
      await s.see("Explorer");
    },
  },
];
