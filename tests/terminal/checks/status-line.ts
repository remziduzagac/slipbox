// Status line modes, words and cursor position.

import type { Check } from "../check.ts";

export const STATUS_LINE: Check[] = [
  {
    area: "reading",
    name: "status line: the mode, the file, its problems, words, the cursor's line and column and how far down; unsaved said; a selection's words; the vault on the top bar, not here",
    covers: { cases: ["status", "words"] },
    options: { home: true, startAt: "home/notes/projects/kestrel-v2-3.md" },
    run: async (s) => {
      // Counted as the status line says it counts: runs of letters and digits, each Han or kana character one, the
      // frontmatter left out.
      const count = (rel: string) => {
        const body = s.read(rel).replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n/, "");
        const re =
          /(?=[\p{L}ー])[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]|[\p{L}\p{N}](?:[\p{L}\p{N}_]|['’-](?=[\p{L}\p{N}]))*/gu;
        return [...body.matchAll(re)].length.toLocaleString("en");
      };
      // Where you are on the top bar, so not here (WSP-D5): the mode, then the file.
      await s.where(/^notes(?: │|$)/, /^ READ │ NORMAL +‹ projects\/kestrel-v2-3\.md › +[✖⚠] \d+ +● watching /);
      await s.status(new RegExp(` ${count("~/notes/projects/kestrel-v2-3.md")} words +L1:1 0% *$`));
      await s.keys("G");
      await s.status(/ 100% *$/);
      await s.keys("g", "g");
      // The lens, typing, unsaved.
      await s.keys("i");
      await s.status(/^ READ·LENS │ NORMAL /);
      await s.keys("j", "i");
      await s.status(/^ READ·LENS │ INSERT /);
      await s.type("x");
      await s.status(/› • unsaved /);
      await s.keys("escape", "escape");
      await s.status(/^ READ │ NORMAL .*› • unsaved /);
      // A selection: its words.
      await s.keys("v", "e");
      await s.status(/^ READ │ VISUAL .* \d+ words? selected /);
      await s.keys("escape");
      // Han and kana: a word each.
      await s.ex("e daily/2026-08-24.md");
      await s.status(new RegExp(` ${count("~/notes/daily/2026-08-24.md")} words +L1:1 `));
    },
  },
];
