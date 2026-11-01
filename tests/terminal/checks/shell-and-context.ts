import { type Check, leader, MEETING, opened } from "../check.ts";
import { KENJI, typedAtEnd } from "../support/outside-and-code.ts";

export const SHELL_AND_CONTEXT: Check[] = [
  // --- your shell and an agent's context ----------------------------------------------------------
  {
    area: "outside-and-code",
    name: "shell: :!cmd runs in the root's folder, % the file's path; its output in a window, enter on a path:line opens it there",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // % is the note on screen, from the root.
      await s.ex("!wc -l %");
      await s.see(/\$ wc -l % — exit 0/, 5000);
      await s.see(/\d+ meetings\/2026-09-14-weekly\.md/);
      await s.keys("escape");
      // grep's places, a line each: one picked by its path, enter opens it there.
      await s.ex("!grep -rn Kiso-Hara people");
      await s.see(/\$ grep -rn Kiso-Hara people — exit 0/, 5000);
      await s.see("people/kenji-mori.md:16:Visiting astronomer from the Kiso-Hara");
      await s.type("kenji-mori.md:16");
      await s.keys("enter");
      await opened(s, KENJI);
      await s.status(/L16:/);
    },
  },
  {
    area: "outside-and-code",
    name: "shell: :!cmd's window lists what a command writes to its errors among its output, where it wrote it (D264)",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // By turns to its output and its errors, with no pause between: through one pipe, in the order written.
      await s.ex("!for i in 1 2 3 4; do echo out$i; echo err$i >&2; done");
      await s.see(/\$ for i in 1 2 3 4; .* — exit 0/, 5000);
      await s.see("err4");
      const rows = ["out1", "err1", "out2", "err2", "out3", "err3", "out4", "err4"].map((l) =>
        s.rowOf(new RegExp(`\\b${l}\\b`)),
      );
      s.expect(
        rows.every((r, i) => r >= 0 && (i === 0 || r > rows[i - 1]!)),
        `its lines in the order written, rows ${rows.join(", ")}`,
      );
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: :!cmd's window keeps a character the command printed in two halves whole",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // An em dash's first two bytes, then, a moment later, its last: one character, never two replacement ones.
      await s.ex("!printf '\\342\\200'; sleep 0.3; printf '\\224 dash\\n'");
      await s.see(/\$ printf .* — exit 0/, 5000);
      await s.see("— dash");
      s.expect(!s.text().includes("\uFFFD"), "no replacement character on the screen");
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: lines filtered through a command — :17,20!sort -r, one undo step; ! on a visual selection",
    covers: { commands: ["shell.filter", "edit.undo", "visual.line"] },
    options: { open: MEETING },
    run: async (s) => {
      const above = (a: string, b: string) => s.rowOf(a) >= 0 && s.rowOf(a) < s.rowOf(b);
      await s.see("Tomasz: book the courier");
      s.expect(above("Tomasz: book", "Lena: update"), "the actions in their order");
      // The four actions, sorted backwards by sort: the ticked one first.
      await s.ex("17,20!sort -r");
      await s.message("4 lines through sort -r", 5000);
      await s.until(() => above("Lena: update", "Tomasz: book"), 3000, "the lines sorted");
      s.expect(!s.read(MEETING).includes("- [x] Lena: update the visitor leaflet\n- [ ] Tomasz"), "nothing written");
      // One undo step brings them back.
      await s.keys("u");
      await s.until(() => above("Tomasz: book", "Lena: update"), 3000, "the order back with one u");
      // Two lines picked in visual mode, ! asks the command for them.
      await s.ex("17");
      await s.keys("shift+v", "j", "!");
      await s.see("'<,'>!");
      await s.type("tr a-z A-Z");
      await s.keys("enter");
      await s.see("TOMASZ: BOOK THE COURIER", 5000);
      await s.see("PRIYA: HALLEY 2.4");
      await s.see("Lena: update the visitor leaflet");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: a filter puts in more than a window shows — 2.2 MB of lines in a line's place, not refused",
    covers: { commands: ["shell.filter"] },
    options: { open: MEETING },
    run: async (s) => {
      // Past the 2 MB a window keeps, short of the 32 MB a filter takes.
      await s.ex("1!head -c 2200000 /dev/zero | tr '\\0' x | fold -w 100");
      await s.message("1 line through head -c 2200000", 10_000);
      await s.see("x".repeat(100)); // its lines in the note
    },
  },
  {
    area: "outside-and-code",
    name: "shell: a command still running is stopped by its command, said",
    covers: { commands: ["shell.run", "shell.stop", "palette.open"] },
    run: async (s) => {
      await s.ex("!sleep 30");
      await s.message("running: sleep 30");
      // One at a time: another said to wait.
      await s.ex("!true");
      await s.message("still running: sleep 30");
      await s.keys(":");
      await s.type("Stop the running command");
      await s.see("Stop the running command");
      await s.keys("enter");
      await s.message(/sleep 30: stopped/, 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "context: space s c copies the note, its links and its backlinks for an agent; an unsaved change saved first",
    covers: { cases: ["context"], commands: ["context.copy"] },
    options: { open: KENJI },
    run: async (s) => {
      await typedAtEnd(s, "- Back in November.");
      await s.status("• unsaved");
      await leader(s, "s", "c");
      await s.message("copied the context of people/kenji-mori.md"); // the box wraps the counts
      await s.file(KENJI, (t) => t.includes("- Back in November."), "the note saved first");
      await s.until(() => s.clipboard().startsWith("# Context: people/kenji-mori.md"), 3000, "the bundle copied");
      const c = s.clipboard();
      s.expect(
        /The note, \d+ files? it links to and \d+ files? linking to it/.test(c),
        `what the bundle holds:\n${c.slice(0, 300)}`,
      );
      for (const part of [
        "## people/kenji-mori.md",
        "Back in November.",
        "## home.md",
        "## people/partners-and-names.md",
      ])
        s.expect(c.includes(part), `the bundle has ${part}`);
    },
  },
];
