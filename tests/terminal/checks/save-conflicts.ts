import { type Check, MEETING } from "../check.ts";
import { append, typedAtEnd, typingAtEnd } from "../support/outside-and-code.ts";

const CONFLICT = "changed on disk, and you have unsaved changes";

export const SAVE_CONFLICTS: Check[] = [
  // --- conflicts: changed outside while yours is unsaved ------------------------------------------
  {
    area: "outside-and-code",
    name: "conflict: l loads theirs, u brings yours back",
    covers: { cases: ["conflict", "watching"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine one");
      append(s, "theirs one");
      await s.see(CONFLICT, 5000);
      await s.keys("l");
      await s.message("loaded theirs — u brings yours back");
      await s.see("theirs one");
      await s.notSee("mine one");
      await s.keys("u");
      await s.see("mine one");
      await s.notSee("theirs one");
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: k keeps yours, marked; :w asks first, d shows the difference, y writes yours over theirs",
    covers: { cases: ["conflict"], commands: ["note.save"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine one");
      append(s, "theirs two");
      await s.see(CONFLICT, 5000);
      await s.keys("k");
      await s.status("⚠ differs from disk");
      await s.ex("w");
      await s.see("changed on disk — write yours over it?");
      await s.keys("d");
      await s.see("Diff — yours → theirs");
      await s.see("theirs two");
      await s.keys("escape");
      await s.see("write yours over it?");
      await s.keys("y");
      await s.file(MEETING, (t) => t.includes("mine one") && !t.includes("theirs two"), "yours written over theirs");
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: m merges — yours at the end, theirs at the top, both kept, unsaved until :w",
    covers: { cases: ["conflict"], commands: ["note.save"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine three");
      s.write(MEETING, `Theirs three, at the top.\n\n${s.read(MEETING)}`);
      await s.see(CONFLICT, 5000);
      await s.keys("d"); // the diff, and back to the prompt
      await s.see("Diff — yours → theirs");
      await s.keys("escape");
      await s.see(CONFLICT);
      await s.keys("m");
      await s.message("merged cleanly");
      await s.see("Theirs three, at the top.");
      await s.see("mine three");
      await s.ex("w");
      await s.file(
        MEETING,
        (t) => t.startsWith("Theirs three, at the top.") && t.includes("mine three"),
        "the merge written",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: while typing, said; the letters typed go into the text, never pick; the prompt after esc",
    covers: { cases: ["conflict"] },
    options: { open: MEETING },
    run: async (s) => {
      await typingAtEnd(s);
      await s.type("typing on ");
      append(s, "theirs four");
      await s.message("esc, then choose what to keep", 5000);
      await s.type("lkdm");
      await s.see("typing on lkdm");
      s.expect(s.rowOf(CONFLICT) < 0, "no prompt while typing");
      await s.keys("escape");
      await s.keys("j");
      await s.see(CONFLICT);
      await s.keys("l");
      await s.see("theirs four");
      await s.notSee("typing on lkdm");
      s.expect(!s.read(MEETING).includes("lkdm"), "the letters typed never written");
    },
  },
];
