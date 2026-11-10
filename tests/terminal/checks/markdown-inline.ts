// Inline highlights and comments; the inline styles in SOURCE view (SIS).

import { type Check, leader } from "../check.ts";
import { TOKYO } from "../support/appearance.ts";

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
  {
    area: "reading",
    name: "SOURCE view: a note's inline styles as it reads, its markers kept — bold drawn bold, its ** in their own colour",
    covers: { cases: ["inline"], commands: ["view.source"] },
    options: { open: "handbook/operations-handbook.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("**Decision:** Every operational decision");
      const [marker, bold, plain] = [
        s.styleOf("**Decision:** Every"),
        s.styleOf("Decision:** Every"),
        s.styleOf(" Every operational decision"),
      ];
      s.expect(
        !!marker && !!bold && !!plain && bold.bold && !plain.bold && !marker.bold,
        `the text between the ** bold, they and the text around them not: ${JSON.stringify([marker, bold, plain])}`,
      );
      s.expect(
        marker?.fg === TOKYO.roles.markup.fg && marker?.fg !== plain?.fg,
        `the ** in the theme's markup colour: ${JSON.stringify([marker, plain])}`,
      );
    },
  },
];
