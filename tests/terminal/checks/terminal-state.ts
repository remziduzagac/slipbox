import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { UNSAFE } from "../../../src/core/foundation/text/sanitize.ts";
import { type Check, downloadsElsewhere, explorerClosed, HANDBOOK, MEETING, open } from "../check.ts";
import { windows, exits, goto, configFile } from "../support/navigation.ts";

/** A row's width in columns, trailing blanks aside (wide glyphs two). */
const widthOf = (row: string) => Bun.stringWidth(row.trimEnd());

export const TERMINAL_STATE: Check[] = [
  // --- starting -------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "start: a folder in a repository opens the repository's top; the explorer's view at the folder, the vault named",
    covers: { cases: ["opening", "explorer"] },
    options: { home: true, startAt: "home/work/kestrel/docs" },
    run: async (s) => {
      // The repository's top is the vault, so its README opens, by the repository's own path.
      await s.status(/ README\.md/);
      await s.see("Kestrel");
      // The explorer's view starts at the folder opened on (VV-D5): its notes, not the README's folder; above the
      // tree, the breadcrumb names the vault it's in, kestrel, by its icon.
      await s.see(/\barchitecture\.md\b/);
      await s.see(/\bglossary\.md\b/);
      await s.see(/~ › work › \S+ kestrel › docs ›/);
    },
  },
  {
    area: "navigating",
    name: "start: `open` spelled out; --root over the folder it starts in",
    covers: { cases: ["opening"] },
    options: { args: ["open"], open: MEETING },
    run: async (s) => {
      await s.status("meetings/2026-09-14-weekly.md");
      // --root: started with no path in a folder that is no root (the check's own), halden all the same — its
      // workspace back (the weekly note), where that folder alone would open as a plain folder.
      await s.restart({ args: ["--root", s.vault], startAt: null, cwd: "" });
      await s.where(/^halden(?: │|$)/, /2026-09-14-weekly\.md/);
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "halden opened, not the named folders' list");
    },
  },
  {
    area: "navigating",
    name: "start: a folder that isn't there, a --root that isn't a root, a path outside it — a line and exit 3",
    covers: { cases: ["opening"] },
    options: { startAt: "nope/", noWait: true },
    run: async (s) => {
      const failed = async (what: string, line: RegExp) => {
        await s.until(() => s.exited(), 10000, `slipbox to give up on ${what}`).catch(() => undefined);
        s.expect(s.exited(), `slipbox gave up on ${what}`);
        const out = s.after(30);
        s.expect(line.test(out), `the reason, in a line, for ${what}\n${out}`);
        s.expect(!/^\s+at /m.test(out), `no stack trace for ${what}\n${out}`);
        s.expect(s.exitCode() === 3, `exit 3 for ${what}, not ${s.exitCode()}`);
      };
      await failed("a missing folder", /slipbox: no such directory: .*nope\//);
      // The check's own folder holds no marker: not a root.
      await s.restart({ args: ["--root", s.dir], startAt: "vault/home.md", noWait: true });
      await failed("a --root that isn't a root", /slipbox: --root .* isn't a vault/);
      // A file outside the --root it's given (the check's trace file, beside the vault): refused too.
      await s.restart({ args: ["--root", s.vault], startAt: "trace", noWait: true });
      await failed("a path outside --root", /slipbox: .*trace is outside --root/);
      // (The runner wants a clean exit at the end: a start that works.)
      await s.restart({ args: [], startAt: "vault/home.md", noWait: false });
    },
  },

  // --- the session ----------------------------------------------------------------------------
  {
    area: "navigating",
    name: "session: tabs, a split, the explorer hidden and each note's place back after a quit",
    covers: { cases: ["ui", "tabs"], commands: ["app.quit"] },
    options: { size: { cols: 90, rows: 34 } },
    run: async (s) => {
      // home at line 9, then a second tab: the handbook at line 300, split.
      await goto(s, 9);
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      await goto(s, 300);
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      // The explorer hidden (space e cycles: shown, focused, hidden).
      await explorerClosed(s);
      await s.keys("ctrl+q");
      await exits(s, "ctrl+q to quit");
      // Started again with no path, in the vault: all of it back.
      await s.restart({ startAt: null, cwd: "vault" });
      await s.see(/1 \S*\s*home\.md/);
      await s.see(/2 \S*\s*operations-handbook\.md/);
      await s.status("operations-handbook.md");
      await s.status(/L300:/);
      await s.until(() => windows(s) === 2, 3000, "the split back");
      await s.notSee("Explorer");
      await s.keys("ctrl+t", "1");
      await s.status("home.md");
      await s.status(/L9:/);
    },
  },
  {
    area: "navigating",
    name: "session: with restore_session off, the default note alone — each note's place still kept",
    covers: { cases: ["ui"] },
    options: { size: { cols: 90, rows: 34 } },
    run: async (s) => {
      await s.keys("ctrl+t", "c");
      await open(s, "operations-handbook");
      await goto(s, 300);
      await s.keys("ctrl+q");
      await exits(s, "ctrl+q to quit");
      appendFileSync(configFile(s), "\n[ui]\nrestore_session = false\n");
      await s.restart({ startAt: null, cwd: "vault" });
      await s.status("home.md");
      await s.notSee(/2 \S*\s*operations-handbook\.md/);
      // A note opened again is still at its place: reading positions are kept either way.
      await open(s, "operations-handbook");
      await s.status(/L300:/);
    },
  },

  // --- signals and resizes --------------------------------------------------------------------
  {
    area: "navigating",
    name: "signals: SIGTERM and SIGHUP save the place and quit cleanly, the terminal as it was",
    covers: { cases: ["ui"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      for (const [sig, line] of [
        ["SIGTERM", 250],
        ["SIGHUP", 400],
      ] as const) {
        await goto(s, line);
        // At once: the state is also saved a second after a move, so only the signal's own save can have kept this
        // place.
        s.signal(sig);
        await exits(s, `${sig} to end slipbox`);
        s.expect(s.exitCode() === 0, `${sig}: exit 0, not ${s.exitCode()}`);
        // The terminal handed back: the main screen, the cursor shown, no mouse reports, the keyboard as it was.
        const t = s.term.xterm;
        s.expect(t.buffer.active.type === "normal", `${sig}: back on the main screen`);
        s.expect(t.modes.mouseTrackingMode === "none", `${sig}: mouse reports off`);
        s.expect(!s.term.kittyKeys, `${sig}: the keyboard's flags popped`);
        s.expect(!/\bREAD\b.*halden/.test(s.text()), `${sig}: slipbox's screen gone`);
        await s.restart();
        await s.status(new RegExp(`L${line}:`));
      }
    },
  },
  {
    area: "navigating",
    name: "resize: the frame follows the terminal's width, wider and back; the cursor stays on its line",
    covers: { cases: ["ui", "width"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      await goto(s, 300);
      // The frame's top rule spans the window: its width is the width slipbox drew for.
      const rule = () => widthOf(s.screen()[1] ?? "");
      await s.until(() => rule() === 100, 3000, "the frame across 100 columns");
      await s.resize(180, 40);
      await s.until(() => rule() === 180, 5000, "the frame redrawn wider");
      await s.until(() => widthOf(s.statusLine()) > 120, 3000, "the status line across the new width");
      s.expect(
        s.screen().every((r) => widthOf(r) <= 180),
        "no row wider than the terminal",
      );
      await s.status(/L300:/);
      await s.resize(100, 34);
      await s.until(() => rule() === 100, 5000, "the frame back at its width");
      await s.until(() => widthOf(s.statusLine()) <= 100, 3000, "the status line within it again");
      await s.status(/L300:/);
      // Narrower still: nothing past the edge.
      await s.resize(60, 20);
      await s.until(() => rule() === 60, 5000, "the frame at 60 columns");
      s.expect(
        s.screen().every((r) => widthOf(r) <= 60),
        "no row wider than 60 columns",
      );
      await s.status(/L300:/);
    },
  },

  // --- the title ------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "title: the file on screen, else the folder; a name's escape sequence never in it",
    covers: { cases: ["safety", "hostile"] },
    // Downloads beside home, in Elsewhere: its notes listed together, each by its whole path (home's index leaves it out).
    options: { home: true, startAt: "elsewhere/stray-note.md", setup: downloadsElsewhere },
    run: async (s) => {
      const at = (name: string) => `slipbox — ${join(s.dir, "elsewhere", name)}`;
      await s.until(() => s.title() === at("stray-note.md"), 3000, "the title naming the note");
      // An escape in the name would end the title's own sequence and spill the rest onto the screen.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("esc"); // the name as it is: the escape between "esc" and "red" can't be typed
      await s.see(/│ escred\.md\s/);
      await s.keys("enter");
      await s.status("escred.md");
      await s.until(() => s.title() === at("escred.md"), 3000, "the title without the escape");
      s.expect(!UNSAFE.test(s.title()), "nothing unsafe in the title");
      // Every tab closed: the folder.
      await s.keys("ctrl+t", "shift+q");
      await s.see("No note open");
      await s.until(() => s.title() === `slipbox — ${join(s.dir, "elsewhere")}`, 3000, "the title naming the folder");
    },
  },
];
