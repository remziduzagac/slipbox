// slipbox as a process in a terminal: how it starts, quits, restores its session, takes signals and resizes; its
// title; keys and pastes as terminals send them; the colours it draws.

import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { UNSAFE } from "../../src/core/sanitize.ts";
import { loadTheme } from "../../src/core/theme/index.ts";
import { HANDBOOK, leader, MEETING, moveTo, open, type Scenario } from "./helpers.ts";
import { sleep } from "./herdr.ts";
import { type Session, Skipped, type StyledRun } from "./session.ts";

/** Every place `needle` starts on screen, with the style its first character is drawn in. */
function stylesOf(s: Session, needle: string): StyledRun[] {
  const found: StyledRun[] = [];
  for (const row of s.runs()) {
    const plain = row.map((r) => r.text).join("");
    for (let at = plain.indexOf(needle); at >= 0; at = plain.indexOf(needle, at + 1)) {
      let n = 0;
      for (const r of row) {
        if (at < n + r.text.length) {
          found.push(r);
          break;
        }
        n += r.text.length;
      }
    }
  }
  return found;
}

/** Wait until `needle` is drawn somewhere in `fg` (a heading in its role's colour, say). */
async function drawnIn(s: Session, needle: string, fg: string, what: string): Promise<void> {
  await s.until(() => stylesOf(s, needle).some((r) => r.fg === fg), 3000, what);
}

/** A row's width in columns, trailing blanks aside (wide glyphs two). */
const widthOf = (row: string) => Bun.stringWidth(row.trimEnd());

/** One window's breadcrumb each: how many windows the tab shows. */
const windows = (s: Session) => s.text().split("§ ").length - 1;

const TOKYO = loadTheme("tokyo-night").theme;
const NORD = loadTheme("nord").theme;

export const TERMINAL_SCENARIOS: Scenario[] = [
  // --- starting -------------------------------------------------------------------------------
  {
    name: "world/terminal: start forms — a folder in a repository opens at its top; `open` spelled out; --root over the folder it starts in; --theme draws its colours",
    options: {
      startAt: "project/docs",
      beside: {
        "project/.git/HEAD": "ref: refs/heads/main\n",
        "project/README.md": "# The project\n\nIts top, where a folder inside it opens.\n",
        "project/docs/guide.md": "# The guide\n",
      },
    },
    run: async (s) => {
      // A folder inside the repository: the repository's top is the root, so its README opens, by
      // the repository's own path (not ../README.md, not docs/'s).
      await s.status(/ README\.md/);
      await s.see("Its top, where a folder inside it opens.");
      // The explorer starts at the folder opened on (`..` climbs to the top): its guide, not the README.
      await s.see(/\bguide\.md\b/);
      // `slipbox open <path>` is the plain form spelled out.
      await s.restart({ args: ["open"], startAt: "vault/meetings/2026-09-14-weekly.md" });
      await s.status("meetings/2026-09-14-weekly.md");
      // --root: started with no path in a folder that is no root (the scenario's own), halden all the same —
      // its session back (the weekly note), where that folder alone would open as a plain folder, the named ones listed.
      await s.restart({ args: ["--root", join(s.dir, "vault")], startAt: null, cwd: "" });
      await s.status(/\bhalden\b.*2026-09-14-weekly\.md/);
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "halden opened, not the named folders' list");
      // --theme: what's drawn is that theme's — the heading in nord's h2 colour, not tokyo-night's.
      await s.restart({ args: ["--theme", "nord"], startAt: "vault/home.md", cwd: undefined });
      await drawnIn(s, "Start here", NORD.roles.h2.fg!, "a heading in nord's h2 colour");
      s.expect(!stylesOf(s, "Start here").some((r) => r.fg === TOKYO.roles.h2.fg), "no heading in tokyo-night's colour under --theme nord");
    },
  },
  {
    name: "world/terminal: a start that can't open — a path that isn't there, a --root that isn't a root: a line and exit 3, never a stack trace",
    options: { startAt: "nope/missing.md", noWait: true },
    run: async (s) => {
      const failed = async (what: string, line: RegExp) => {
        await s.until(() => s.exited(), 10000, `slipbox to give up on ${what}`);
        const out = s.pane.recent(30);
        s.expect(line.test(out), `the reason, in a line, for ${what}\n${out}`);
        s.expect(!/^\s+at /m.test(out), `no stack trace for ${what}\n${out}`);
        s.expect(s.exitCode() === 3, `exit 3 for ${what}, not ${s.exitCode()}`);
      };
      await failed("a missing path", /slipbox: no such file or directory: .*nope\/missing\.md/);
      // The scenario's own folder holds no marker: not a root.
      await s.restart({ args: ["--root", s.dir], startAt: "vault/home.md", noWait: true });
      await failed("a --root that isn't a root", /slipbox: --root .* isn't a root/);
      // A file outside the --root it's given (the scenario's own trace file, beside the vault): refused too.
      await s.restart({ args: ["--root", join(s.dir, "vault")], startAt: "trace", noWait: true });
      await failed("a path outside --root", /slipbox: .*trace is outside --root/);
      // (The runner wants a clean exit at the end: a start that works.)
      await s.restart({ args: [], startAt: "vault/home.md", noWait: false });
    },
  },

  // --- the session ----------------------------------------------------------------------------
  {
    name: "world/terminal: the session — tabs, a split, the explorer hidden and each note's place back after a quit; with restore_session off, the places only",
    needs: { cols: 90 },
    run: async (s) => {
      // home at line 9, then a second tab: the handbook at line 300, split.
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("9");
      await moveTo(s, ["enter"], (l) => l === 9, "home at line 9");
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      await s.keys("ctrl+g");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "the handbook at line 300");
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      // The explorer hidden (space e cycles: shown, focused, hidden).
      for (let i = 0; i < 3 && s.rowOf("Explorer") >= 0; i++) await leader(s, "e");
      await s.notSee("Explorer");
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "ctrl+q to quit");
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
      // restore_session off: started with no path, the default note alone — but a note opened
      // again is still at its place (reading positions are kept either way).
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "ctrl+q to quit");
      appendFileSync(join(s.dir, "config", "slipbox", "config.toml"), "\n[ui]\nrestore_session = false\n");
      await s.restart({ startAt: null, cwd: "vault" });
      await s.status("home.md");
      await s.notSee(/2 \S*\s*operations-handbook\.md/);
      s.expect(windows(s) === 1, "one window: the split not restored");
      await open(s, "operations-handbook");
      await s.status(/L300:/);
    },
  },
  {
    name: "world/terminal: signals — SIGTERM and SIGHUP save the place and quit cleanly; the shell answers after",
    options: { open: HANDBOOK },
    run: async (s) => {
      for (const [sig, line] of [["SIGTERM", 250], ["SIGHUP", 400]] as const) {
        await s.keys("ctrl+g");
        await s.type(String(line));
        await moveTo(s, ["enter"], (l) => l === line, `line ${line}`);
        // At once: the state is also saved a second after a move, so only the signal's own save can
        // have kept this place.
        s.signal(sig);
        await s.until(() => s.exited(), 5000, `${sig} to end slipbox`);
        await s.restart();
        await s.status(new RegExp(`L${line}:`));
      }
      await s.quit();
      // The terminal is the shell's again: its screen, and it runs what it's given.
      const tag = `__alive_${Math.random().toString(36).slice(2, 8)}__`;
      s.pane.run(`echo ${tag}`);
      // Its output on a line of its own (the command line has the tag too, after `echo`). Not s.until: that
      // gives up once slipbox has exited, which is what's wanted here.
      const answered = () => new RegExp(`^${tag}$`, "m").test(s.pane.recent(10));
      for (let end = Date.now() + 5000; !answered() && Date.now() < end; ) await sleep(50);
      s.expect(answered(), `the shell to answer\n${s.pane.recent(10)}`);
      s.expect(!/\bREAD\b.*halden/.test(s.text()), "slipbox's screen gone");
    },
  },
  {
    name: "world/terminal: a resize — zoomed to the whole tab and back, the frame follows the pane's width; the cursor stays on its line",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("ctrl+g");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "line 300");
      // The frame's top rule spans the window: its width is the width slipbox drew for.
      const rule = () => widthOf(s.screen()[1] ?? "");
      const before = rule();
      // Zoomed and back, the pane takes its tab's layout: with no client attached that isn't the
      // size it has (sized by hand), and the next scenarios here would get the layout's.
      const laid = s.layoutSize();
      if (Math.abs(laid.cols - s.pane.cols) > 4) throw new Skipped(`the pane is ${s.pane.cols} wide, its layout ${laid.cols}: is a client attached?`);
      let zoomed = 0;
      try {
        await s.zoom(true);
        await s.until(() => rule() > before + 20, 5000, "the frame redrawn wider");
        zoomed = rule();
        await s.until(() => widthOf(s.statusLine()) > before + 20, 3000, "the status line across the new width");
        s.expect(s.screen().every((r) => widthOf(r) <= zoomed), "no row wider than the window");
        await s.status(/L300:/);
      } finally {
        await s.zoom(false);
      }
      await s.until(() => rule() === before, 5000, "the frame back at its width");
      await s.until(() => widthOf(s.statusLine()) <= before, 3000, "the status line within it again");
      await s.status(/L300:/);
    },
  },
  {
    name: "world/terminal: the terminal's title follows the file on screen, else the vault; a name's control characters never in it",
    options: { files: { "bell\x07ring.md": "# Bell\n" } },
    run: async (s) => {
      await s.until(() => s.title() === "slipbox — home.md", 3000, "the title naming home.md");
      await open(s, "operations-handbook");
      await s.until(() => s.title() === `slipbox — ${HANDBOOK}`, 3000, "the title following the note");
      // A BEL in the name would end the title's escape sequence and spill the rest onto the screen.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("bell"); // what's typed matches the name as it is: the BEL can't be typed
      await s.keys("enter");
      await s.status("bellring.md");
      await s.until(() => s.title() === "slipbox — bellring.md", 3000, "the title without the BEL");
      // Every tab closed: the vault's folder.
      await s.keys("ctrl+t");
      await s.type("Q");
      await s.see("No note open");
      await s.until(() => s.title() === `slipbox — ${s.vault}`, 3000, "the title naming the vault");
    },
  },

  // --- input ----------------------------------------------------------------------------------
  {
    name: "world/terminal: pastes as terminals send them — a list's filter takes the first line, sanitized; typing, it goes in as it is; in normal mode it's put",
    options: { files: { "paste.md": "- item\n" } },
    run: async (s) => {
      // The switcher: the first line only, its bidi override gone; the line break opened nothing.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.paste("kenji‮\nsecond line");
      await s.see(/› kenji\s/);
      await s.see("people/kenji-mori.md");
      s.expect(s.rowOf("second line") < 0 && !UNSAFE.test(s.text().replace(/\n/g, "")), "the second line, or the override, on screen");
      s.expect(/Open (note|\()/.test(s.text()), "the switcher still open");
      await s.keys("enter");
      await s.status("kenji-mori.md");
      // Typing: the text as pasted — a typed line break would have continued the list ("- y").
      await open(s, "paste.md");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("A");
      await s.status("INSERT");
      await s.paste("x\ny");
      await s.keys("escape", "ctrl+s");
      await s.file("paste.md", (t) => t === "- itemx\ny\n", "the paste typed as it is");
      // In normal mode it's put, like p: as keys, `a` would have started typing "bc".
      await s.keys("g", "g", "0");
      await s.paste("abc");
      s.expect(!s.statusLine().includes("INSERT"), "still in normal mode after the paste");
      await s.keys("ctrl+s");
      await s.file("paste.md", (t) => t === "-abc itemx\ny\n", "the paste put after the cursor");
      // One undo step takes it back.
      await s.keys("u", "ctrl+s");
      await s.file("paste.md", (t) => t === "- itemx\ny\n", "u to take the put back");
    },
  },
  {
    name: "world/terminal: keys as terminals send them — ctrl+j in a list, shift and shift+ctrl arrows select, home and end, ctrl+enter into a new tab, ctrl+shift+f",
    options: { files: { "sel.md": "# Sel\n\nBack to index and on to beta.\n" }, open: "sel.md" },
    run: async (s) => {
      // ctrl+j moves a list's selection down (a legacy terminal sends it as a line feed): the
      // switcher's counter says which entry, enter opens the second one listed.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("contacts");
      await s.see(/ 1\/2 /);
      const listed = s.screen().flatMap((r) => /\b((?:people|equipment)\/contacts\.md)/.exec(r)?.[1] ?? []);
      s.expect(listed.length === 2, `two contacts notes listed: ${listed}`);
      await s.keys("ctrl+j");
      await s.see(/ 2\/2 /);
      await s.keys("enter");
      await s.status(listed[1]!);
      await open(s, "sel.md");
      // shift+arrows extend from the cursor, ctrl+c copies; shift+ctrl by word; shift+end to the row's end.
      await s.keys("/");
      await s.type("Back");
      await s.keys("enter", "escape");
      for (let i = 0; i < 6; i++) await s.keys("shift+right");
      await s.keys("ctrl+c");
      await s.until(() => s.clipboard() === "Back to", 3000, "shift+right ×6 to select 'Back to'");
      await s.keys("escape", "0", "shift+ctrl+right", "ctrl+c");
      await s.until(() => s.clipboard() === "Back t", 3000, "shift+ctrl+right to select by word");
      await s.keys("escape", "0", "shift+end", "ctrl+c");
      await s.until(() => s.clipboard() === "Back to index and on to beta.", 3000, "shift+end to the row's end");
      // home and end move along the row.
      await s.keys("escape", "0");
      await moveTo(s, ["end"], (_, c) => c === 29, "end to the row's last character");
      await moveTo(s, ["home"], (_, c) => c === 1, "home to the row's start");
      // ctrl+enter follows the link under the cursor into a new tab, as a browser's ctrl+click does (kitty's keyboard
      // protocol tells it from enter).
      await open(s, "home");
      await s.keys("tab");
      await s.until(() => /→ about-this-vault\.md/.test(s.statusLine()), 3000, "the cursor on the first link");
      await s.keys("ctrl+enter");
      await s.see(/2 about-this-vault\.md/, 3000); // a second tab, its title the note
      await s.status("about-this-vault.md");
      s.expect(windows(s) === 1, "a tab, not a split");
      await s.keys("ctrl+w", "q"); // its only window: the tab closes
      // ctrl+shift+f finds in every note — an unsaved one as it is — where ctrl+f finds in this one.
      await open(s, "sel.md");
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("zebracorn");
      await s.keys("escape");
      await s.status("unsaved");
      await s.keys("ctrl+shift+f");
      await s.type("zebracorn");
      await s.keys("enter");
      await s.see(/match(es)? in 1 file/);
      await s.see("sel.md");
    },
  },
  {
    name: "world/terminal: insert mode's keys — backspace joins lines, tab and shift+tab indent, home, end and the arrows move",
    options: { files: { "keys.md": "alpha\nbeta\ngamma\n" }, open: "keys.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("g", "g", "j", "i");
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
      await s.file("keys.md", (t) => t === ">  alpha-beta!\n^+g|amma\n", "the exact result of those keys");
    },
  },
  {
    name: "world/terminal: find's toggles while typing — alt+r a regex, alt+w whole words",
    options: { open: HANDBOOK },
    run: async (s) => {
      // The find row: the query after ›, then its count — or "no matches".
      const findRow = () => s.screen().find((r) => /[│┃] › /.test(r)) ?? "";
      await s.keys("/");
      await s.type("Ast.r");
      await s.until(() => findRow().includes("no matches"), 3000, "Ast.r, as text, matching nothing");
      await s.keys("alt+r");
      await s.until(() => /\d+\/\d+/.test(findRow()), 3000, "alt+r: Ast.r as a regex, matching Aster");
      await s.keys("alt+r");
      await s.until(() => findRow().includes("no matches"), 3000, "alt+r again: text again");
      await s.keys("ctrl+u");
      await s.type("Aste");
      await s.until(() => /\d+\/\d+/.test(findRow()), 3000, "Aste inside Aster");
      await s.keys("alt+w");
      await s.until(() => findRow().includes("no matches"), 3000, "alt+w: Aste is no whole word");
      await s.keys("alt+w");
      await s.until(() => /\d+\/\d+/.test(findRow()), 3000, "alt+w again: inside words again");
      await s.keys("escape");
    },
  },

  // --- what it draws --------------------------------------------------------------------------
  {
    name: "world/terminal: colours — the theme's roles as the terminal draws them; :theme switches; [colors] overrides, per theme too; NO_COLOR draws none",
    options: { config: '[colors]\nh2 = "#ff00aa"\n\n[colors.nord]\nlink = "#00ff00"\n' },
    run: async (s) => {
      // tokyo-night: the link and inline code in their roles; the h2 in the override's colour.
      await drawnIn(s, "operations-handbook", TOKYO.roles.link.fg!, "a link in tokyo-night's link colour");
      await drawnIn(s, "people/contacts.md", TOKYO.roles.code_inline.fg!, "inline code in its role's colour");
      s.expect(stylesOf(s, "people/contacts.md").some((r) => r.bg === TOKYO.roles.code_inline.bg), "inline code on its role's background");
      await drawnIn(s, "Start here", "#ff00aa", "the h2 in [colors]' colour");
      // :theme nord: nord's colours, its own [colors.nord] link, the global h2 still.
      await s.ex("theme nord");
      await drawnIn(s, "operations-handbook", "#00ff00", "the link in [colors.nord]'s colour");
      await drawnIn(s, "people/contacts.md", NORD.roles.code_inline.fg!, "inline code in nord's colour");
      await drawnIn(s, "Start here", "#ff00aa", "the h2 override under nord too");
      s.expect(!stylesOf(s, "people/contacts.md").some((r) => r.fg === TOKYO.roles.code_inline.fg), "tokyo-night's code colour gone");
      // NO_COLOR: nothing with text on it is coloured at all.
      await s.restart({ env: { NO_COLOR: "1" } });
      await s.see("Start here");
      const coloured = s.runs().flat().filter((r) => r.text.trim() && (r.fg !== null || r.bg !== null));
      s.expect(!coloured.length, `no colour under NO_COLOR: ${JSON.stringify(coloured.slice(0, 3))}`);
    },
  },
  {
    name: "world/terminal: glyphs from the environment — SLIPBOX_GLYPHS=ascii, and a locale that isn't UTF-8, draw the frame in ASCII",
    options: { env: { SLIPBOX_GLYPHS: "unicode" } },
    run: async (s) => {
      // The frame's rule (the row under the top bar) and the explorer's buttons: Unicode, then ASCII.
      const rule = () => s.screen()[1] ?? "";
      await s.until(() => /[━─]/.test(rule()), 3000, "the Unicode frame");
      await s.see("≡");
      const envs: Record<string, string>[] = [{ SLIPBOX_GLYPHS: "ascii" }, { SLIPBOX_GLYPHS: "", LC_ALL: "", LC_CTYPE: "", LANG: "C" }];
      for (const env of envs) {
        await s.restart({ env });
        await s.until(() => /^[\x20-\x7e]+$/.test(rule().trimEnd()) && rule().includes("-"), 3000, `an ASCII frame (${JSON.stringify(env)})`);
        s.expect(s.rowOf("≡") < 0 && s.rowOf("◷") < 0 && s.rowOf("×") < 0, `no Unicode buttons (${JSON.stringify(env)})`);
        await s.see(/1 home\.md x/); // the tab's close button
      }
    },
  },
  {
    name: "world/terminal: which-key — the leader's groups at once, a prefix's entries after its delay; backspace goes up, esc closes",
    options: { config: "[input]\nwhich_key_delay_ms = 1500\n" },
    run: async (s) => {
      // The leader: its groups at once, delay or not.
      await s.pane.keys("space");
      await s.until(() => s.rowOf("+history") >= 0 && s.rowOf("+session") >= 0, 1000, "the leader's groups at once");
      // Into find's group: its entries; backspace back up to the groups; esc closes.
      await s.keys("f");
      await s.see("Find in every note");
      await s.see("Search here");
      await s.keys("backspace");
      await s.until(() => s.rowOf("+history") >= 0 && s.rowOf("Find in every note") < 0, 3000, "backspace up to the groups");
      await s.keys("escape");
      await s.until(() => s.rowOf("+history") < 0, 3000, "esc closing the popup");
      // g, another prefix: nothing until its delay (1.5 s here), then its entries.
      await s.pane.keys("g");
      await sleep(400); // well inside the delay: a popup now would be early
      s.expect(s.rowOf("g › go") < 0, "g's popup before its delay");
      await s.see("g › go", 4000);
      await s.see("Top of note");
      await s.keys("escape");
      await s.notSee("g › go");
    },
  },

  // --- quitting -------------------------------------------------------------------------------
  {
    name: "world/terminal: quitting — with a change unsaved, ctrl+q and :q are refused, naming the note; :x writes and quits; :q! quits without",
    options: { open: MEETING },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("kept by :x");
      await s.keys("escape");
      await s.keys("ctrl+q");
      await s.message("unsaved changes in");
      await s.message("2026-09-14-weekly");
      await s.ex("q");
      await s.message("unsaved changes in");
      s.expect(!s.exited() && /SOURCE|READ/.test(s.statusLine()), "still running after ctrl+q and :q");
      await s.ex("x");
      await s.until(() => s.exited(), 5000, ":x to quit");
      s.expect(s.exitCode() === 0, `a clean exit, not ${s.exitCode()}`);
      s.expect(s.read(MEETING).includes("kept by :x"), ":x wrote the note");
      // :q! quits with the change left unwritten.
      await s.restart();
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("dropped by :q!");
      await s.keys("escape");
      await s.ex("q!");
      await s.until(() => s.exited(), 5000, ":q! to quit");
      s.expect(!s.read(MEETING).includes("dropped by :q!"), ":q! wrote nothing");
      s.expect(existsSync(s.path(MEETING)), "the note still there");
    },
  },
  {
    name: "world/terminal: quitting with the properties editor open — ctrl+q writes its edits first; :x with text that doesn't parse asks, still running",
    options: { open: "props.md", files: { "props.md": "---\ntitle: A\n---\n# A\n" } },
    run: async (s) => {
      const written = "---\ntitle: A\nx: 1\n---\n# A\n";
      await leader(s, "n", "shift+p");
      await s.see("Properties — props.md (YAML)");
      await s.keys("o");
      await s.type("x: 1");
      await s.keys("escape");
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "ctrl+q to quit");
      s.expect(s.exitCode() === 0, `a clean exit, not ${s.exitCode()}`);
      s.expect(s.read("props.md") === written, `the edit written back before quitting:\n${s.read("props.md")}`);
      // Text that doesn't parse: :x asks first, nothing quit, nothing written; declined, the editor kept.
      await s.restart();
      await leader(s, "n", "shift+p");
      await s.see("Properties — props.md (YAML)");
      await s.keys("o");
      await s.type("broken: [");
      await s.keys("escape");
      await s.ex("x");
      await s.see("The properties don't parse");
      s.expect(!s.exited(), "still running while it asks");
      await s.keys("escape");
      await s.notSee("The properties don't parse");
      await s.see("Properties — props.md (YAML)");
      s.expect(s.read("props.md") === written, "nothing written while asking, nor when declined");
      await s.ex("q!");
      await s.until(() => s.exited(), 5000, ":q! to quit");
      s.expect(s.read("props.md") === written, ":q! wrote nothing");
    },
  },
];
