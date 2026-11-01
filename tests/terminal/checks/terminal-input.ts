import { UNSAFE } from "../../../src/core/foundation/text/sanitize.ts";
import { type Check, HANDBOOK, MEETING, moveTo, open, pos } from "../check.ts";
import { windows, findRow, goto, lineOf, toSource } from "../support/navigation.ts";

export const TERMINAL_INPUT: Check[] = [
  // --- pastes ---------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "paste: a list's filter takes the first line, sanitized; nothing opened by its line break",
    covers: { cases: ["lists-prompts", "keys", "safety"], commands: ["switcher.open"] },
    run: async (s) => {
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.paste("kenji‮\nsecond line");
      await s.see(/› kenji\s/);
      await s.see("people/kenji-mori.md");
      s.expect(
        s.rowOf("second line") < 0 && !UNSAFE.test(s.text().replace(/\n/g, "")),
        "the second line, or the override, on screen",
      );
      s.expect(/Open (note|\()/.test(s.text()), "the switcher still open");
      await s.keys("enter");
      await s.status("kenji-mori.md");
    },
  },
  {
    area: "navigating",
    name: "paste: typing, it goes in as it is; in normal mode it's put after the cursor, one undo",
    covers: { cases: ["keys", "editing"] },
    options: { open: "people/kenji-mori.md" },
    run: async (s) => {
      const NOTE = "people/kenji-mori.md";
      const lines = s.read(NOTE).split("\n");
      // A list item: a typed line break would continue the list ("- y").
      const item = lines.findIndex((l) => l.startsWith("- Office:"));
      s.expect(item > 0, "a list item to paste after");
      await toSource(s);
      await goto(s, item + 1);
      await s.keys("shift+a");
      await s.status("INSERT");
      await s.paste("x\ny");
      await s.keys("escape", "ctrl+s");
      const typed = [...lines.slice(0, item), `${lines[item]}x`, "y", ...lines.slice(item + 1)];
      await s.file(NOTE, (t) => t === typed.join("\n"), "the paste typed as it is");
      // In normal mode it's put, like p: as keys, `a` would have started typing "bc".
      await s.keys("g", "g", "0");
      await s.paste("abc");
      s.expect(!s.statusLine().includes("INSERT"), "still in normal mode after the paste");
      await s.keys("ctrl+s");
      const put = [`${typed[0]!.slice(0, 1)}abc${typed[0]!.slice(1)}`, ...typed.slice(1)];
      await s.file(NOTE, (t) => t === put.join("\n"), "the paste put after the cursor");
      // One undo step takes it back.
      await s.keys("u", "ctrl+s");
      await s.file(NOTE, (t) => t === typed.join("\n"), "u to take the put back");
    },
  },

  // --- keys as terminals send them ------------------------------------------------------------
  {
    area: "navigating",
    name: "keys: ctrl+j moves a list's selection; ctrl+enter follows a link into a new tab",
    covers: { cases: ["keys", "lists-prompts", "links"], commands: ["switcher.open"] },
    run: async (s) => {
      // ctrl+j moves a list's selection down: the switcher's counter says which entry, enter opens the second.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("contacts");
      await s.see(/ 1\/2 /);
      const listed = s.screen().flatMap((r) => /│ ((?:people|equipment)\/contacts\.md)\s/.exec(r)?.[1] ?? []);
      s.expect(listed.length === 2, `two contacts notes listed: ${listed}`);
      await s.keys("ctrl+j");
      await s.see(/ 2\/2 /);
      await s.keys("enter");
      await s.status(listed[1]!);
      // ctrl+enter follows the link under the cursor into a new tab, as a browser's ctrl+click does.
      await open(s, "home");
      await s.keys("tab");
      await s.until(() => /→ about-this-vault\.md/.test(s.statusLine()), 3000, "the cursor on the first link");
      await s.keys("ctrl+enter");
      await s.see(/2 about-this-vault\.md/);
      await s.status("about-this-vault.md");
      s.expect(windows(s) === 1, "a tab, not a split");
    },
  },
  {
    area: "navigating",
    name: "keys: ctrl+shift+f finds in every note, an unsaved one as it is",
    covers: { cases: ["vault-find", "keys"], commands: ["find.vault"] },
    options: { open: MEETING },
    run: async (s) => {
      await toSource(s);
      await s.keys("shift+g", "o");
      await s.type("zebracorn");
      await s.keys("escape");
      await s.status("unsaved");
      await s.keys("ctrl+shift+f");
      await s.type("zebracorn");
      await s.keys("enter");
      await s.see(/match(es)? in 1 file/);
      await s.see("2026-09-14-weekly.md");
    },
  },

  {
    area: "navigating",
    name: "keys: shift and shift+ctrl arrows select from the cursor, shift+end to the row's end; home and end move",
    covers: { cases: ["keys", "selection"], commands: ["copy.selection"] },
    options: { open: "equipment/telescope-comparison.md" },
    run: async (s) => {
      const ROW = "Nothing below is final. Corrections go to Tomasz.";
      await s.keys("/");
      await s.type("Nothing below");
      await s.until(() => /\d+\/\d+/.test(findRow(s)), 3000, "the match counted");
      await s.keys("enter", "escape");
      await s.until(() => findRow(s) === "", 3000, "the find row closed");
      const at = lineOf(s, "equipment/telescope-comparison.md", ROW);
      await s.until(() => pos(s).line === at && pos(s).col === 1, 3000, "the cursor at the row's start");
      // shift+right ×6: seven characters, the cursor's own and six more; ctrl+c copies.
      for (let i = 0; i < 6; i++) await s.keys("shift+right");
      await s.keys("ctrl+c");
      await s.until(() => s.clipboard() === ROW.slice(0, 7), 3000, `shift+right ×6 to select ${ROW.slice(0, 7)}`);
      // shift+ctrl+right: a word at a time, to the next word's start.
      await s.keys("escape", "0", "shift+ctrl+right", "ctrl+c");
      await s.until(() => s.clipboard() === "Nothing b", 3000, "shift+ctrl+right to select by word");
      await s.keys("escape", "0", "shift+end", "ctrl+c");
      await s.until(() => s.clipboard() === ROW, 3000, "shift+end to the row's end");
      // home and end move along the row.
      await s.keys("escape", "0");
      await moveTo(s, ["end"], (_, c) => c === ROW.length, "end to the row's last character");
      await moveTo(s, ["home"], (_, c) => c === 1, "home to the row's start");
    },
  },
  {
    area: "navigating",
    name: "keys: insert mode's backspace joins lines, tab and shift+tab indent, home, end and the arrows move",
    covers: { cases: ["keys", "source-mode"], commands: ["view.source", "edit.insert", "note.save"] },
    options: { open: "equipment/instrument-inventory.md" },
    run: async (s) => {
      const NOTE = "equipment/instrument-inventory.md";
      const lines = s.read(NOTE).split("\n");
      // Three lines of a paragraph in a row, short and plain: the keys' effect on them can be told exactly.
      const at = lines.findIndex((l) => l.startsWith("This inventory started as a sheet of paper"));
      const [a, b, c] = lines.slice(at, at + 3) as [string, string, string];
      s.expect(at > 0 && !!c && [a, b, c].every((l) => /^[A-Za-z]/.test(l)), "three plain lines to type into");
      await toSource(s);
      await goto(s, at + 2);
      await s.keys("i");
      await s.status("INSERT");
      await s.keys("backspace"); // at the line's start: joined to the line above
      await s.type("-");
      await s.keys("tab", "shift+tab", "tab"); // two spaces in, out, in again
      await s.keys("end");
      await s.type("!");
      await s.keys("home");
      await s.type(">");
      await s.keys("down", "home");
      await s.type("+");
      await s.keys("right");
      await s.type("|");
      await s.keys("left", "left", "left");
      await s.type("^");
      await s.keys("escape", "ctrl+s");
      // The exact text those keys leave: a terminal's encodings of them changed nothing on the way.
      const want = [
        ...lines.slice(0, at),
        `>  ${a}-${b}!`,
        `^+${c.slice(0, 1)}|${c.slice(1)}`,
        ...lines.slice(at + 3),
      ].join("\n");
      await s.file(NOTE, (t) => t === want, "the exact result of those keys");
    },
  },
  {
    area: "navigating",
    name: "keys: a legacy terminal's — escape before the next key, alt as escape and a key, ctrl+j a line feed, ctrl+shift+f",
    covers: { cases: ["keys", "find", "vault-find"], commands: ["find.open", "switcher.open", "find.vault"] },
    options: { open: HANDBOOK, keyboard: "legacy" },
    run: async (s) => {
      s.expect(!s.term.kittyKeys, "a terminal without Kitty's keys");
      // alt+r as escape and r: find's regex toggle, not an escape then r.
      await s.keys("/");
      await s.type("Ast.r");
      await s.until(() => findRow(s).includes("no matches"), 3000, "Ast.r, as text, matching nothing");
      await s.keys("alt+r");
      await s.until(() => /\d+\/\d+/.test(findRow(s)), 3000, "alt+r: a regex, matching Aster");
      // A lone escape, typed after the enter: the find row closed, and the next key a key of its own.
      await s.keys("enter");
      await s.keys("escape");
      await s.until(() => findRow(s) === "", 3000, "esc closing the find row");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      // ctrl+j, a line feed: the list's next entry.
      await s.type("contacts");
      await s.see(/ 1\/2 /);
      await s.keys("ctrl+j");
      await s.see(/ 2\/2 /);
      await s.keys("escape");
      await s.notSee(/Open (note|\()/);
      // ctrl+shift+f, which legacy keys can't say: xterm's modifyOtherKeys, which slipbox turns on.
      await s.keys("ctrl+shift+f");
      await s.see("find in every note");
      await s.keys("escape");
    },
  },
];
