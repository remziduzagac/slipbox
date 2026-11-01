import { type Check, HANDBOOK, leader, moveTo, pos } from "../check.ts";
import { findRow } from "../support/navigation.ts";

export const FINDING: Check[] = [
  // --- find and replace -----------------------------------------------------------------------
  {
    area: "navigating",
    name: "find: / n N * #, :noh and esc clear the highlights; the find row",
    covers: {
      cases: ["find"],
      commands: ["find.open", "find.next", "find.prev", "find.word_next", "find.word_prev", "find.clear", "app.escape"],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("/");
      await s.type("Aster");
      await s.see(/› Aster/);
      await s.see(/\d+\/\d+/);
      await s.keys("enter");
      const l1 = pos(s).line;
      await moveTo(s, ["n"], (l) => l !== l1, "n to the next match");
      await moveTo(s, ["shift+n"], (l) => l === l1, "N back");
      // On an "Aster" (the match): * to the word's next whole-word occurrence, # back to this one.
      const start = pos(s);
      await moveTo(s, ["*"], (l, c) => l !== start.line || c !== start.col, "* to the word's next occurrence");
      await s.see(/[│┃] › \S/); // the word is the query now
      await moveTo(s, ["#"], (l, c) => l === start.line && c === start.col, "# back to it");
      await s.ex("noh");
      await s.notSee(/[│┃] › /);
      // esc in the note does the same.
      await s.keys("/");
      await s.type("Brill");
      await s.keys("enter");
      await s.see(/[│┃] › Brill/);
      await s.keys("escape");
      await s.notSee(/[│┃] › /);
    },
  },
  {
    area: "navigating",
    name: "find: alt+r makes it a regex, alt+w whole words, while typing",
    covers: { cases: ["find", "keys"], commands: ["find.open"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("/");
      await s.type("Ast.r");
      await s.until(() => findRow(s).includes("no matches"), 3000, "Ast.r, as text, matching nothing");
      await s.keys("alt+r");
      await s.until(() => /\d+\/\d+/.test(findRow(s)), 3000, "alt+r: Ast.r as a regex, matching Aster");
      await s.keys("alt+r");
      await s.until(() => findRow(s).includes("no matches"), 3000, "alt+r again: text again");
      await s.keys("ctrl+u");
      await s.type("Aste");
      await s.until(() => /\d+\/\d+/.test(findRow(s)), 3000, "Aste inside Aster");
      await s.keys("alt+w");
      await s.until(() => findRow(s).includes("no matches"), 3000, "alt+w: Aste is no whole word");
      await s.keys("alt+w");
      await s.until(() => /\d+\/\d+/.test(findRow(s)), 3000, "alt+w again: inside words again");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "replace: ctrl+h, tab to the replacement, enter one, alt+a all, alt+h hides the row",
    covers: { cases: ["replace"], commands: ["find.replace"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("ctrl+h");
      await s.see("⇄");
      await s.type("Brill");
      await s.keys("tab");
      await s.type("BRILL");
      // The find row counts what's left to replace: enter replaces one, so the total drops by one.
      const total = () => Number(/\d+\/(\d+)/.exec(s.screen().find((r) => r.includes("› Brill")) ?? "")?.[1] ?? -1);
      await s.until(() => total() > 1, 3000, "the matches counted");
      const was = total();
      await s.keys("enter");
      await s.until(() => total() === was - 1, 3000, "enter to replace exactly one");
      await s.keys("alt+a");
      await s.message(/replaced \d+ match/);
      await s.keys("alt+h");
      await s.notSee("⇄ BRILL"); // the replace row gone (⇄ stays, as the find row's button)
      await s.keys("escape", "escape");
      await s.keys("ctrl+s");
      await s.file(HANDBOOK, (t) => t.includes("BRILL") && !t.includes("Brill"), "every Brill replaced and saved");
      await leader(s, "f", "r");
      await s.see("⇄");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "replace: :%s with c asks at each match — y replaces, n skips, q stops",
    covers: { cases: ["replace"], commands: ["find.substitute"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      const before = s.read(HANDBOOK).split("Corvid").length - 1;
      await s.ex("%s/Corvid/CORVID/gc");
      await s.see("replace? y n a q");
      await s.keys("y", "n", "q");
      await s.message("1 substitution");
      await s.keys("ctrl+s");
      await s.file(
        HANDBOOK,
        (t) => t.split("CORVID").length - 1 === 1 && t.split("Corvid").length - 1 === before - 1,
        "one Corvid replaced, the rest kept",
      );
    },
  },
  {
    area: "navigating",
    name: "search: space f s ranks the vault's notes as you type; enter opens at the match; :search takes words",
    covers: { cases: ["search"], commands: ["search.open"] },
    run: async (s) => {
      await leader(s, "f", "s");
      await s.see("search here — words");
      await s.type("dome shutter");
      await s.see(/"dome shutter" — \d+ files/, 5000);
      await s.see("projects/dome-refit.md:");
      await s.keys("enter");
      await s.status("dome-refit.md");
      // :search takes the words; a phrase, a tag.
      await s.ex('search "variable star" #survey');
      await s.see("projects/variable-star-survey.md:");
      await s.keys("escape");
    },
  },
];
