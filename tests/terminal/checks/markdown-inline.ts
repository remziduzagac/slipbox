// Inline highlights and comments.

import { type Check, leader } from "../check.ts";

export const MARKDOWN_INLINE: Check[] = [
  {
    area: "reading",
    name: "obsidian: a ==highlight== drawn in its own colour, %%comments%% hidden while reading; both as typed in source mode",
    covers: { cases: ["inline", "notes"], commands: ["view.source"] },
    options: { home: true, startAt: "home/hobbies/cooking/Pantry.md" },
    run: async (s) => {
      await s.see("the good olive oil.");
      await s.notSee("Cretan tin");
      await s.notSee("==bold yellow==");
      await s.see("1 cup == 2 cups of water"); // a lone == pair with spaces is text
      const [marked, plain] = [s.styleOf("bold yellow"), s.styleOf("Running low")];
      s.expect(
        !!marked && !!plain && (marked.bg !== plain.bg || marked.fg !== plain.fg),
        `the highlight drawn apart: ${JSON.stringify([marked, plain])}`,
      );
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("%%the Cretan tin, not the bottle%%");
      await s.see("==bold yellow==");
      // A comment over blank lines, a list in it: gone while reading, the text around it kept.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Family/Grandma's flan.md" });
      await s.see("never wrote it down");
      await s.notSee("Check the amounts with Mum");
      await s.notSee("and on birthdays");
      await s.notSee("Still to ask Mum");
      await s.notSee("goat's milk");
    },
  },
];
