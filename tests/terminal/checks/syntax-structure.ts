// The structure of what's edited: text objects by a note's tree and a fenced block's language, the syntax jumps, and
// growing the selection — in a note of the reference set with sections, lists, links and fenced TypeScript and Python.

import { type Check, pos } from "../check.ts";
import type { Session } from "../session.ts";
import { at, findText, ready } from "./editing.ts";

const NOTE = "~/notes/projects/sync-rewrite.md";

/** To line `n` by the command line (`:42`), at its start. */
async function line(s: Session, n: number): Promise<void> {
  await s.ex(String(n));
  await s.until(() => pos(s).line === n, 3000, `the cursor on line ${n}`);
}

/** Keys, then the cursor waited for at a line (a jump into a fenced block asks the syntax thread first). */
async function jump(s: Session, keys: string[], n: number, what: string): Promise<void> {
  await s.keys(...keys);
  await s.until(() => pos(s).line === n, 5000, `${what}: on line ${n}, not ${s.statusLine()}`);
}

/** Copied, as `y` copies: what the clipboard holds after, waited for. */
async function copied(s: Session, ok: (text: string) => boolean, what: string): Promise<void> {
  await s.keys("y");
  await s.until(() => ok(s.clipboard()), 3000, `${what}: copied ${JSON.stringify(s.clipboard().slice(0, 80))}`);
  await s.status("SOURCE");
}

export const SYNTAX_STRUCTURE: Check[] = [
  {
    area: "editing",
    name: "structure: ] o, ] f, ] a and back in a note's fenced blocks; alt+o grows a word to its section, alt+i back; d a h, c i k, y a l, v i o, d a f",
    covers: {
      cases: ["editing", "cursor", "selection"],
      commands: [
        "cursor.block_next",
        "cursor.block_prev",
        "cursor.function_next",
        "cursor.function_prev",
        "cursor.argument_next",
        "cursor.argument_prev",
        "visual.grow",
        "visual.shrink",
        "view.source",
        "note.save",
      ],
    },
    options: at(NOTE),
    run: async (s) => {
      await ready(s);
      await s.keys("ctrl+k");
      await s.status("SOURCE");

      // The fenced blocks, from the top: the file tree's (31), RetryPolicy's TypeScript (50), and back.
      await s.keys("g", "g");
      await jump(s, ["]", "o"], 31, "] o to the first fenced block");
      await jump(s, ["]", "o"], 50, "] o to the TypeScript");
      await jump(s, ["[", "o"], 31, "[ o back");
      // Inside them, by their language: the constructor is the first function, its parameters the arguments.
      await jump(s, ["]", "f"], 52, "] f to the constructor");
      await jump(s, ["]", "a"], 53, "] a to maxAttempts");
      await jump(s, ["]", "a"], 54, "] a to baseMs");
      await jump(s, ["[", "a"], 53, "[ a back to maxAttempts");
      await jump(s, ["[", "f"], 52, "[ f back to the constructor");

      // alt+o from a word: the paragraph, the item, the list, the section; y copies the section.
      await line(s, 176);
      await findText(s, "branch");
      await s.until(() => pos(s).line === 176 && pos(s).col === 15, 3000, "the cursor on branch");
      await s.keys("alt+o");
      await s.status("VISUAL");
      await s.keys("alt+o", "alt+o", "alt+o", "alt+o");
      await copied(
        s,
        (t) => t.startsWith("## Ledger\n") && t.endsWith("on for everyone since 2026-09-30."),
        "alt+o five times from branch: the Ledger section",
      );
      // Grown as far, then alt+i back step by step to the word.
      await line(s, 176);
      await findText(s, "branch");
      await s.keys("alt+o", "alt+o", "alt+o", "alt+o", "alt+o", "alt+i", "alt+i", "alt+i", "alt+i");
      await copied(s, (t) => t === "branch", "alt+o five times, alt+i four: the word again");
      // And from the word, alt+i: the cursor alone, where it was.
      await line(s, 176);
      await findText(s, "branch");
      await s.keys("alt+o");
      await s.status("VISUAL");
      await s.keys("alt+i");
      await s.until(
        () => !s.statusLine().includes("VISUAL") && pos(s).line === 176 && pos(s).col === 15,
        3000,
        `alt+i from the word: no selection, the cursor on branch (${s.statusLine()})`,
      );

      // The edits, from the bottom up so the lines above stay where they were.
      // c i k: the link's text, typed over.
      await line(s, 182);
      await s.keys("c", "i", "k");
      await s.status("INSERT");
      await s.type("Her page");
      await s.keys("escape");
      await s.see("[Her page](../people/aiko-tanaka.md)");
      // y a l: a list item, its whole line; p puts it under.
      await line(s, 177);
      await s.keys("y", "a", "l");
      await s.until(
        () => s.clipboard() === '- Bramble the dashboard: "Bramble queue", owned by Malik.\n',
        3000,
        "y a l to copy the item's line",
      );
      await s.keys("p");
      // d a h: the Queue states section, its heading to the next of its level.
      await line(s, 131);
      await s.keys("d", "a", "h");
      await s.notSee("## Queue states");
      // v i o: the Python's lines, as rows (V-LINE); d deletes them.
      await line(s, 75);
      await s.keys("v", "i", "o");
      await s.status("V-LINE");
      await s.keys("d");
      await s.status("SOURCE");
      // d a f: the TypeScript's delay method, by the fence's language.
      await line(s, 59);
      await s.keys("d", "a", "f");
      await s.notSee("Math.random");

      await s.keys("ctrl+s");
      await s.file(
        NOTE,
        (t) =>
          t.includes("[Her page](../people/aiko-tanaka.md) has her review notes.") &&
          t.split('- Bramble the dashboard: "Bramble queue", owned by Malik.\n').length === 3 &&
          t.includes("The stall was never about timing.\n\n## Release name") &&
          !t.includes("## Queue states") &&
          t.includes("```python\n```\n") &&
          !t.includes("delay(attempt") &&
          t.includes("  shouldPark(attempt: number): boolean {"),
        "the link's text changed, the item doubled, the section gone, the Python emptied, delay gone; written",
      );
    },
  },
];
