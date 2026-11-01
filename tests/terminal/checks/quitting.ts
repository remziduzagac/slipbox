import { type Check, leader, MEETING } from "../check.ts";
import { exits, toSource } from "../support/navigation.ts";

export const QUITTING: Check[] = [
  // --- quitting -------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "quit: a change unsaved refuses ctrl+q and :q, naming the note; :x writes and quits; :q! quits without",
    covers: { cases: ["safety", "questions"], commands: ["app.save_quit", "app.quit_force", "window.close_or_quit"] },
    options: { open: MEETING },
    run: async (s) => {
      await toSource(s);
      await s.keys("shift+g", "o");
      await s.type("kept by :x");
      await s.keys("escape");
      await s.keys("ctrl+q");
      await s.message("unsaved changes in");
      await s.message("2026-09-14-weekly");
      await s.ex("q");
      await s.message("unsaved changes in");
      s.expect(!s.exited() && /SOURCE|READ/.test(s.statusLine()), "still running after ctrl+q and :q");
      await s.ex("x");
      await exits(s, ":x to quit");
      s.expect(s.exitCode() === 0, `a clean exit, not ${s.exitCode()}`);
      s.expect(s.read(MEETING).includes("kept by :x"), ":x wrote the note");
      // :q! quits with the change left unwritten.
      await s.restart();
      await toSource(s);
      await s.keys("shift+g", "o");
      await s.type("dropped by :q!");
      await s.keys("escape");
      await s.ex("q!");
      await exits(s, ":q! to quit");
      s.expect(!s.read(MEETING).includes("dropped by :q!"), ":q! wrote nothing");
      s.expect(s.exists(MEETING), "the note still there");
      await s.restart();
    },
  },
  {
    area: "navigating",
    name: "quit: the properties editor open — ctrl+q writes its edits first; :x with text that doesn't parse asks",
    covers: { cases: ["properties", "questions"], commands: ["note.properties", "app.quit", "app.save_quit"] },
    options: { open: "outreach/public-nights.md" },
    run: async (s) => {
      const NOTE = "outreach/public-nights.md";
      const lines = s.read(NOTE).split("\n");
      s.expect(lines[0] === "---", "the note starts with its properties");
      // `o` on the properties' first line: a line after it.
      const written = [lines[0], lines[1], "x: 1", ...lines.slice(2)].join("\n");
      await leader(s, "n", "shift+p");
      await s.see("Properties — public-nights.md (YAML)");
      await s.keys("o");
      await s.type("x: 1");
      await s.keys("escape");
      await s.keys("ctrl+q");
      await exits(s, "ctrl+q to quit");
      s.expect(s.exitCode() === 0, `a clean exit, not ${s.exitCode()}`);
      s.expect(s.read(NOTE) === written, `the edit written back before quitting:\n${s.read(NOTE)}`);
      // Text that doesn't parse: :x asks first, nothing quit, nothing written; declined, the editor kept.
      await s.restart();
      await leader(s, "n", "shift+p");
      await s.see("Properties — public-nights.md (YAML)");
      await s.keys("o");
      await s.type("broken: [");
      await s.keys("escape");
      await s.ex("x");
      await s.see("The properties don't parse");
      s.expect(!s.exited(), "still running while it asks");
      await s.keys("escape");
      await s.notSee("The properties don't parse");
      await s.see("Properties — public-nights.md (YAML)");
      s.expect(s.read(NOTE) === written, "nothing written while asking, nor when declined");
      await s.ex("q!");
      await exits(s, ":q! to quit");
      s.expect(s.read(NOTE) === written, ":q! wrote nothing");
      await s.restart();
    },
  },
];
