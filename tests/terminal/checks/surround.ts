// Surround: pairs of marks added, taken out and changed by keys (`y s`, `d s`, `c s`, a visual selection's `shift+s`),
// and a mark typed over a selection while typing, closing pairs on — on the reference set's incident week, whose
// numbers have italic in bold and whose decisions have brackets around quotes.

import type { Check } from "../check.ts";
import type { Session } from "../session.ts";
import { at, findText, ready } from "./editing.ts";

const WEEK = "~/notes/weekly/2026-W39.md";

/** Saved, then the note on disk as `want`. */
async function saved(s: Session, want: string, what: string): Promise<void> {
  await s.keys("ctrl+s");
  await s.file(WEEK, (t) => t === want, what);
}

/** Into typing at `word`, and the word selected with shift+right, as a terminal sends it. */
async function selectTyping(s: Session, word: string): Promise<void> {
  await findText(s, word);
  await s.keys("i");
  await s.status("INSERT");
  for (const _ of word) await s.keys("shift+right");
}

export const SURROUND: Check[] = [
  {
    area: "editing",
    name: "surround: y s i w b and ., c s * then a backtick, d s (, v … shift+s; a quote and * twice typed over a selection",
    covers: {
      cases: ["editing"],
      commands: [
        "edit.surround_add",
        "edit.surround_change",
        "edit.surround_delete",
        "edit.repeat",
        "visual.char",
        "visual.surround",
        "file.save",
      ],
    },
    options: { ...at(WEEK), config: "[editor]\nauto_pairs = true\n" },
    run: async (s) => {
      const before = s.read(WEEK);
      const steps: [string, string][] = [
        ["- Stall:", "- **Stall**:"],
        ["- Messages stuck", "- **Messages** stuck"],
        ["**a *really* poisonous", "**a `really` poisonous"],
        ['(Malik, correctly: "a coin flip on a schedule")', 'Malik, correctly: "a coin flip on a schedule"'],
        ["at sixty seconds", 'at "sixty" seconds'],
        ["the oldest message", "the **oldest** message"],
        ["- Q4 OKR comments", "- ~~Q4 OKR comments~~"],
      ];
      for (const [was] of steps) s.expect(before.includes(was), `the week has "${was}"`);
      /** The note with the first `n` steps made. */
      const after = (n: number) => steps.slice(0, n).reduce((t, [was, now]) => t.replace(was, now), before);
      await ready(s);
      await s.keys("ctrl+k");
      await s.status("SOURCE");

      // y s i w b: the word bold; . does the same to the next word it's on.
      await findText(s, "Stall");
      await s.keys("y", "s", "i", "w", "b");
      await findText(s, "Messages");
      await s.keys(".");
      await saved(s, after(2), "y s i w b, then . on the next line's first word");
      // c s * then a backtick: the italic in the bold turned into code, the bold kept.
      await findText(s, "really");
      await s.keys("c", "s", "*", "`");
      await saved(s, after(3), "c s * ` inside the bold");
      // d s (: the brackets around the quote taken out, the quote kept.
      await findText(s, "correctly");
      await s.keys("d", "s", "(");
      await saved(s, after(4), "d s ( around the quote");
      // While typing, closing pairs on: a quote typed over a selection wraps it; so does * twice, making it bold.
      await selectTyping(s, "sixty");
      await s.keys('"', "escape");
      await selectTyping(s, "oldest");
      await s.keys("*", "*", "escape");
      await s.status("SOURCE");
      await saved(s, after(6), "a quote, then * twice, typed over a selection");
      // A visual selection's shift+s, then the mark.
      await findText(s, "Q4 OKR comments");
      await s.keys("v", "e", "e", "e", "shift+s");
      await s.status(/VISUAL/);
      await s.keys("~");
      await saved(s, after(7), "v e e e shift+s ~ around three words");
    },
  },
];
