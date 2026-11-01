import { type Check, HANDBOOK, leader, pos } from "../check.ts";
import { goto, lineOf } from "../support/navigation.ts";
import { drawnIn, TOKYO, NORD } from "../support/appearance.ts";

export const UI_SETTINGS: Check[] = [
  // --- settings -------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "settings: space u u lists every setting with its value; enter changes the one picked",
    covers: { cases: ["ui"], commands: ["ui.list", "ui.wrap"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      const value = (name: string) =>
        new RegExp(`│ ${name}\\s+(\\S+) │`).exec(s.screen().find((r) => r.includes(`│ ${name} `)) ?? "")?.[1];
      await leader(s, "u", "u");
      await s.see("UI settings");
      for (const name of ["Theme", "Glyphs", "Readable width", "Zen mode", "Line numbers", "Mouse", "Code cells"])
        await s.see(`│ ${name} `);
      s.expect(value("Wrap long lines") === "on", `wrapping on to begin with: ${value("Wrap long lines")}`);
      await s.type("wrap long");
      await s.keys("enter");
      await s.message("Wrap long lines: off");
      await leader(s, "u", "u");
      await s.see("UI settings");
      await s.until(() => value("Wrap long lines") === "off", 3000, "the list saying wrapping is off");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "settings: readable width, wrapping, line numbers, link URLs and zen — each changes the note, and back",
    covers: { cases: ["ui", "wrapping"], commands: ["ui.readable", "ui.wrap", "ui.line_numbers", "ui.urls", "ui.zen"] },
    // A narrow readable width, so it shows beside the explorer.
    options: { open: HANDBOOK, size: { cols: 120, rows: 40 }, config: "[ui]\nreadable_max = 60\n" },
    run: async (s) => {
      // O27's summary: a paragraph of two source lines with a web link, at the bottom (the messages are at the top).
      const at = lineOf(s, HANDBOOK, "[the campaign page](https://example.org/dark-sky/marrowby)");
      await goto(s, at);
      await s.keys("z", "b");
      const FIRST = "The summary follows";
      const LAST = "published months.";
      await s.see(FIRST);
      /** The paragraph's rows: from its first words' to its last words' (or -1, its end not on screen). */
      const rows = () => (s.rowOf(LAST) < 0 ? -1 : s.rowOf(LAST) - s.rowOf(FIRST) + 1);
      const toggle = async (k: string, name: string, state: "on" | "off") => {
        await leader(s, "u", k);
        await s.message(`${name}: ${state}`);
      };
      const before = rows();
      s.expect(before >= 1, "the paragraph whole on screen to begin with");
      await toggle("shift+w", "Readable width", "on");
      await s.until(() => rows() > before, 3000, "readable width: the paragraph on more rows");
      await toggle("shift+w", "Readable width", "off");
      await s.until(() => rows() === before, 3000, "readable width off: its rows as before");
      // Wrapping off: the paragraph one row, its end past the window's edge.
      await toggle("w", "Wrap long lines", "off");
      await s.until(() => s.rowOf(LAST) < 0 && s.rowOf(FIRST) >= 0, 3000, "wrapping off: the paragraph's end cut");
      await toggle("w", "Wrap long lines", "on");
      await s.until(() => rows() === before, 3000, "wrapping on: its rows as before");
      // Line numbers: the source line's number before the paragraph's first row.
      const first = lineOf(s, HANDBOOK, FIRST);
      const numbered = () => new RegExp(`\\b${first}\\s+${FIRST}`).test(s.text());
      s.expect(numbered(), "line numbers on to begin with");
      await toggle("n", "Line numbers", "off");
      await s.until(() => !numbered() && s.rowOf(FIRST) >= 0, 3000, "line numbers gone");
      await toggle("n", "Line numbers", "on");
      await s.until(numbered, 3000, "line numbers back");
      // Link URLs: the address printed after the link's text (the status line names it too: the rows above it).
      const url = () =>
        s
          .screen()
          .slice(0, -1)
          .some((r) => r.includes("example.org/dark-sky/marrowby"));
      s.expect(!url(), "no URL in the text to begin with");
      await toggle("r", "Show link URLs", "on");
      await s.until(url, 3000, "the link's URL printed");
      await toggle("r", "Show link URLs", "off");
      await s.until(() => !url(), 3000, "the URL gone again");
      // Zen: the explorer, the tabs and the status line gone; back as they were.
      await toggle("z", "Zen mode", "on");
      await s.until(
        () => s.rowOf("Explorer") < 0 && s.rowOf(/\bREAD\b/) < 0 && s.rowOf(FIRST) >= 0,
        3000,
        "zen: the note alone",
      );
      await toggle("z", "Zen mode", "off");
      await s.see("Explorer");
      await s.status("READ");
    },
  },
  {
    area: "navigating",
    name: "settings: breadcrumb and window header hidden and shown again; zen keeps the permanent bar",
    covers: {
      cases: ["ui", "breadcrumb", "window-header"],
      commands: ["ui.breadcrumb", "ui.window_header", "ui.zen", "palette.open"],
    },
    run: async (s) => {
      s.expect(s.topBar().includes("slipbox"), "the top bar showing to begin with");
      // The breadcrumb has no key: the palette (or the list) toggles it. Hidden, the header stays, with its buttons.
      const HEADER = /R {2}L {2}S/;
      await s.see("§ Halden Ridge Observatory");
      await s.see(HEADER);
      const palette = async (title: string, shown: boolean) => {
        await s.keys(":");
        await s.type(title);
        await s.keys("enter");
        await s.message(`${title}: ${shown ? "on" : "off"}`);
      };
      for (const shown of [false, true]) {
        await palette("Breadcrumb", shown);
        await s.until(() => s.text().includes("§ ") === shown, 3000, `the breadcrumb ${shown ? "back" : "hidden"}`);
        await s.see(HEADER);
      }
      // The window header: the whole row, the breadcrumb on it included; remembered across a restart.
      for (const shown of [false, true]) {
        await palette("Window header", shown);
        await s.until(() => HEADER.test(s.text()) === shown, 3000, `the header ${shown ? "back" : "gone"}`);
        await s.until(() => s.text().includes("§ ") === shown, 3000, `the breadcrumb ${shown ? "back" : "gone"}`);
        if (shown) continue;
        await s.restart();
        await s.see("Halden Ridge Observatory");
        s.expect(!HEADER.test(s.text()), "the header still gone after a restart: remembered in the session");
      }
      // Zen mode has no header.
      await leader(s, "u", "z");
      await s.notSee(HEADER);
      await leader(s, "u", "z");
      await s.see(HEADER);
    },
  },
  {
    area: "navigating",
    name: "settings: the cursor row's band and the mouse; the problems bar and marks said and listed",
    covers: {
      cases: ["ui", "mouse", "problems"],
      commands: ["ui.cursorline", "ui.mouse", "ui.problems_bar", "ui.problem_marks", "ui.list"],
    },
    options: { open: HANDBOOK, size: { cols: 120, rows: 34 } },
    run: async (s) => {
      // The cursor's row on a band of its own: a background other rows haven't.
      await goto(s, lineOf(s, HANDBOOK, "The summary follows a fixed template"));
      // (Past the cursor's own cell, which is drawn in the cursor's colours either way.)
      const cursorBg = () => s.styleOf("month-to-month")?.bg;
      const otherBg = () => s.styleOf("Sky brightness readings")?.bg;
      await s.until(() => !!cursorBg() && cursorBg() !== otherBg(), 3000, "the cursor's row on its band");
      await leader(s, "u", "l");
      await s.message("Cursor-row highlight: off");
      await s.until(() => cursorBg() === otherBg(), 3000, "no band with the highlight off");
      await leader(s, "u", "l");
      await s.until(() => cursorBg() !== otherBg(), 3000, "the band back");
      // The mouse off: the terminal's own again (no reports asked for), then slipbox's.
      s.expect(s.term.xterm.modes.mouseTrackingMode !== "none", "slipbox has the mouse to begin with");
      await leader(s, "u", "m");
      await s.message("Mouse: off");
      await s.until(() => s.term.xterm.modes.mouseTrackingMode === "none", 3000, "the mouse handed back");
      await leader(s, "u", "m");
      await s.until(() => s.term.xterm.modes.mouseTrackingMode !== "none", 3000, "the mouse taken again");
      // The problems bar and what's marked in the text change nothing a note without problems shows: said, and
      // listed with their new values.
      await leader(s, "u", "d");
      await s.message("Problems bar: off");
      await leader(s, "u", "shift+d");
      await s.message("Problems marked in the text: warnings and up");
      await leader(s, "u", "u");
      await s.see("UI settings");
      await s.see(/│ Problems bar\s+off │/);
      await s.see(/│ Problems marked in the text\s+warn/);
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "settings: code cells in boxes, or on bands",
    covers: { cases: ["ui", "code-files"], commands: ["ui.code_cells"] },
    options: { open: "software/halley/reduce.py", size: { cols: 120, rows: 34 } },
    run: async (s) => {
      // A cell's box: its corner and title (code, ¶, a definition's name) right of the explorer's border.
      const BOX = /[│┃]\s+┌─ \S/;
      await s.see(BOX);
      await leader(s, "u", "c");
      await s.message("Code cells: bands");
      await s.notSee(BOX);
      await s.see("CALIBRATION = (");
      await leader(s, "u", "c");
      await s.message("Code cells: boxes");
      await s.see(BOX);
    },
  },
  {
    area: "navigating",
    name: "settings: spelling on marks the misspelt — ] s goes to one; off, nothing to go to",
    covers: { cases: ["ui"], commands: ["ui.spell", "spell.next"] },
    options: { home: true, startAt: "home/notes/reading/okuma-notlari.md", size: { cols: 120, rows: 30 } },
    run: async (s) => {
      // The note's deliberate typo: "kitpa" (kitap), at column 14 — not its code span's.
      const typo = { line: lineOf(s, "~/notes/reading/okuma-notlari.md", "Bu hafta iki kitpa"), col: 14 };
      await s.keys("]", "s");
      s.expect(pos(s).line === 1, `off: ] s goes nowhere, not to L${pos(s).line}`);
      await leader(s, "u", "s");
      await s.message("Spelling: on");
      // The dictionaries load in the background: ] s from the top, until it lands.
      const there = () => pos(s).line === typo.line && pos(s).col === typo.col;
      await s.retry(() => s.keys("g", "g", "]", "s"), there, "] s on the misspelt word", 1000, 20000);
      await leader(s, "u", "s");
      await s.message("Spelling: off");
    },
  },
  {
    area: "navigating",
    name: "settings: themes and glyph sets — picked with a live preview, set from the palette",
    covers: { cases: ["ui", "themes", "glyphs"], commands: ["theme.pick", "glyphs.pick", "theme.set", "glyphs.set"] },
    options: { env: { SLIPBOX_GLYPHS: "unicode" } },
    run: async (s) => {
      // The theme picker previews as you move; esc puts the old one back.
      await leader(s, "u", "t");
      await s.see("Theme (live preview)");
      await s.keys("j", "escape");
      await s.notSee("Theme (live preview)");
      await drawnIn(s, "Start here", TOKYO.roles.h2.fg!, "tokyo-night's h2 back after esc");
      await s.ex("theme nord");
      await drawnIn(s, "Start here", NORD.roles.h2.fg!, "nord's h2 after :theme nord");
      await leader(s, "u", "g");
      await s.see("Glyphs (live preview)");
      await s.keys("escape");
      await s.see("≡");
      await s.ex("glyphs ascii");
      await s.until(() => !s.text().includes("≡"), 3000, "the ASCII glyphs");
    },
  },
];
