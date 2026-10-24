// The screen and navigation: panes, tabs, windows, the palette, which-key, find, replace, search, tags, the
// explorer, settings, and the terminal's own behaviour: keys as sent, pastes, the session, resizes, signals (TT-T5).

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { UNSAFE } from "../../../src/core/sanitize.ts";
import { loadTheme } from "../../../src/core/theme/index.ts";
import {
  type Check,
  downloadsElsewhere,
  explorerClosed,
  explorerOpen,
  HANDBOOK,
  type LeftOut,
  leader,
  MEETING,
  moveTo,
  open,
  outlineOpen,
  pos,
} from "../check.ts";
import { type Session, type StyledRun, sleep } from "../session.ts";

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

/** The find row: the query after ›, then its count, or "no matches" (the breadcrumb has › too, never after a
 *  border). */
const findRow = (s: Session) => s.screen().find((r) => /[│┃] › /.test(r)) ?? "";

/** Wait for slipbox to exit (on its own: a quit, a signal, a start that fails). */
const exits = (s: Session, what: string) => s.until(() => s.exited(), 5000, what);

/** Go to a line with ctrl+g, and wait for the cursor there. */
async function goto(s: Session, line: number): Promise<void> {
  await s.keys("ctrl+g");
  await s.type(String(line));
  await moveTo(s, ["enter"], (l) => l === line, `line ${line}`);
}

/** The line (from 1) of a file's first line starting with `start`: the sample's text a check relies on, said if gone. */
function lineOf(s: Session, rel: string, start: string): number {
  const at = s
    .read(rel)
    .split("\n")
    .findIndex((l) => l.startsWith(start));
  s.expect(at >= 0, `${rel} has a line starting ${JSON.stringify(start)}`);
  return at + 1;
}

/** The window in source mode: view.source toggles, so pressed only when it isn't (a session may bring it back so). */
async function toSource(s: Session): Promise<void> {
  if (!/\bSOURCE\b/.test(s.statusLine())) await leader(s, "n", "v");
  await s.status("SOURCE");
}

/** The user's config file: a check that changes it while slipbox runs, or between starts. */
const configFile = (s: Session) => join(s.dir, "config", "slipbox", "config.toml");

const TOKYO = loadTheme("tokyo-night").theme;
const NORD = loadTheme("nord").theme;

export const NAVIGATING: Check[] = [
  // --- windows --------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "windows: split side by side and stacked, focus, move to each edge, swap, close, only",
    covers: {
      cases: ["windows"],
      commands: [
        "window.split_side",
        "window.split_stacked",
        "window.focus_left",
        "window.focus_right",
        "window.focus_up",
        "window.focus_down",
        "window.other",
        "window.move_left",
        "window.move_up",
        "window.move_right",
        "window.move_down",
        "window.swap",
        "window.close",
        "window.only",
      ],
    },
    // The explorer closed, so only the windows name notes below the tab bar; wide enough for their whole paths.
    options: { size: { cols: 140, rows: 30 }, config: "[ui]\nsidebar = false\n" },
    run: async (s) => {
      // The windows' notes in screen order, from their breadcrumbs (not the tab bar's, nor the status line's): below
      // the tab bar, right of the rail.
      const NAME = /\b(home|writing-guide)\b(?=\.md\b)/g;
      const rows = () =>
        s
          .screen()
          .slice(3, -1)
          .map((r) => [...r].slice(3).join(""));
      const notes = () => rows().join("\n").match(NAME) ?? [];
      const order = () =>
        notes()
          .map((n) => `${n}.md`)
          .join(" ");
      // Side by side, both names are on one row; stacked, they aren't.
      const sameRow = () => rows().some((r) => (r.match(NAME) ?? []).length === 2);
      const count = () => Math.max(notes().length, windows(s));
      await s.keys("ctrl+w", "v");
      await s.until(() => notes().length === 2 && sameRow(), 3000, "two windows side by side");
      await s.keys("ctrl+w", "s");
      await s.until(() => notes().length === 2 && !sameRow(), 3000, "the split turned stacked");
      // One window shows another note, so where each window is can be told.
      await open(s, "writing-guide");
      await s.until(() => notes().sort().join(" ") === "home writing-guide", 3000, "two windows, two notes");
      // The status line names the focused window's note.
      const focused = () => /\b(home|writing-guide)\.md\b/.exec(s.statusLine())?.[1] ?? "";
      // Moving a window to an edge turns the split and puts it there, focused: H left, K top, L right, J bottom.
      for (const [k, side, first] of [
        ["H", true, true],
        ["K", false, true],
        ["L", true, false],
        ["J", false, false],
      ] as const) {
        await s.keys("ctrl+w", `shift+${k.toLowerCase()}`);
        await s.until(
          () => sameRow() === side && notes()[first ? 0 : 1] === focused(),
          3000,
          `ctrl+w ${k}: ${side ? "side by side" : "stacked"}, ${first ? (side ? "left" : "top") : side ? "right" : "bottom"}`,
        );
        if (k === "H") {
          await s.keys("ctrl+w", "l");
          await s.until(() => focused() === notes()[1], 3000, "ctrl+w l to the right window");
          await s.keys("ctrl+w", "h");
          await s.until(() => focused() === notes()[0], 3000, "ctrl+w h back to the left one");
        }
      }
      // Swap: the two windows trade notes.
      const before = order();
      await s.keys("ctrl+w", "x");
      await s.until(() => order() === before.split(" ").reverse().join(" "), 3000, "ctrl+w x to swap the windows");
      // Focus. Stacked now: k is the top one.
      const [topNote, bottomNote] = order()
        .split(" ")
        .map((n) => n.replace(/\.md$/, ""));
      await s.keys("ctrl+w", "k");
      await s.until(() => focused() === topNote, 3000, "ctrl+w k to the top window");
      await s.keys("ctrl+w", "j");
      await s.until(() => focused() === bottomNote, 3000, "ctrl+w j to the bottom window");
      await s.keys("ctrl+w", "w");
      await s.until(() => focused() === topNote, 3000, "ctrl+w w to the other window");
      await s.keys("ctrl+w", "q");
      await s.until(() => count() === 1, 3000, "a window closed");
      await s.keys("ctrl+w", "v", "ctrl+w", "o");
      await s.until(() => count() === 1, 3000, "only one window");
    },
  },
  {
    area: "navigating",
    name: "windows: resize — ctrl+w + - > < a step each, = evens them; resize mode's keys until esc",
    covers: {
      cases: ["windows"],
      commands: [
        "window.taller",
        "window.shorter",
        "window.wider",
        "window.narrower",
        "window.equalize",
        "window.resize_mode",
      ],
    },
    options: { size: { cols: 140, rows: 30 }, config: "[ui]\nsidebar = false\n" },
    run: async (s) => {
      const NAMES = /\b(home|writing-guide)\.md\b/g;
      await s.keys("ctrl+w", "s");
      await open(s, "writing-guide");
      // Stacked: the row the lower window's breadcrumb sits on moves; = evens it.
      const split = () =>
        s
          .screen()
          .slice(0, -1)
          .findLastIndex((r) => /\b(home|writing-guide)\.md\b/.test(r));
      await s.until(() => (s.text().match(NAMES) ?? []).length >= 2, 3000, "two windows, stacked");
      const even = split();
      // One step, then the resize mode it leaves on, left with esc (= evens them, and stays reading).
      const step = async (k: string) => {
        await s.keys("ctrl+w", k);
        if (k === "=") return;
        await s.status("RESIZE");
        await s.keys("escape");
        await s.status("READ");
      };
      await step("+");
      await s.until(() => split() !== even, 3000, "ctrl+w + to change the heights");
      await step("=");
      await s.until(() => split() === even, 3000, "ctrl+w = to even them");
      await step("-");
      await s.until(() => split() !== even, 3000, "ctrl+w - to change the heights");
      await step("=");
      await s.until(() => split() === even, 3000, "ctrl+w = to even them again");
      // Side by side: where the second breadcrumb starts on the shared row moves with > and <.
      const bothRow = () => s.screen().find((r) => (r.match(NAMES) ?? []).length === 2);
      await s.keys("ctrl+w", "shift+h");
      await s.until(() => bothRow() !== undefined, 3000, "side by side");
      const col = () => (bothRow() ?? "").lastIndexOf(".md");
      const mid = col();
      await step(">");
      await s.until(() => col() !== mid, 3000, "ctrl+w > to change the widths");
      await step("=");
      await s.until(() => col() === mid, 3000, "ctrl+w = to even the widths");
      await step("<");
      await s.until(() => col() !== mid, 3000, "ctrl+w < to change the widths");
      await step("=");
      await s.until(() => col() === mid, 3000, "even again");
      // Resize mode: h j k l until esc.
      await leader(s, "w", "r");
      await s.status("RESIZE");
      await s.keys("l");
      await s.until(() => col() !== mid, 3000, "l in resize mode to change the widths");
      const moved = col();
      await s.keys("l");
      await s.until(() => col() !== moved, 3000, "l again, still in resize mode");
      await s.keys("escape");
      await s.status("READ");
    },
  },
  {
    area: "navigating",
    name: "windows: :q closes a window, then the tab, and on the very last one quits",
    covers: { cases: ["windows"], commands: ["window.close_or_quit"] },
    run: async (s) => {
      // A second tab, split: :q closes its windows one by one, then the tab, then quits.
      await s.keys("ctrl+t", "c");
      await s.see(/2 home\.md/);
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      await s.ex("q");
      await s.until(() => windows(s) === 1, 3000, "one window left");
      await s.see(/2 home\.md/);
      await s.ex("q");
      await s.notSee(/2 home\.md/);
      s.expect(!s.exited(), "still running with a tab left");
      await s.ex("q");
      await exits(s, ":q on the last window to quit");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
      await s.restart();
    },
  },

  // --- tabs -----------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "tabs: new, the list, next and previous, go to, move, close",
    covers: {
      cases: ["tabs"],
      commands: [
        "tab.new",
        "tab.list",
        "tab.next",
        "tab.prev",
        "tab.goto",
        "tab.move_left",
        "tab.move_right",
        "tab.close",
      ],
    },
    options: { size: { cols: 100, rows: 30 } },
    run: async (s) => {
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "t");
      await s.see("Tabs (2)");
      await s.keys("escape");
      await s.keys("ctrl+t", "p");
      await s.status("home.md");
      await s.keys("ctrl+t", "n");
      await s.status("operations-handbook.md");
      await s.keys("ctrl+t", "1");
      await s.status("home.md");
      await s.keys("ctrl+t", "shift+l");
      await s.see(/1 operations/); // home moved right, past the handbook
      await s.keys("ctrl+t", "shift+h");
      await s.see(/1 home/);
      await s.keys("ctrl+t", "q");
      await s.notSee(/2 home|2 operations/);
    },
  },
  {
    area: "navigating",
    name: "tabs: close the others and close all, a pinned tab kept; a new tab from a split takes its window",
    covers: { cases: ["tabs"], commands: ["tab.new", "tab.close_others", "tab.close_all", "tab.pin"] },
    options: { size: { cols: 100, rows: 30 } },
    run: async (s) => {
      await leader(s, "t", "c");
      await leader(s, "t", "c");
      await s.see(/3 \S/);
      await s.keys("ctrl+t", "o");
      await s.message(/closed 2 other tabs/);
      await s.notSee(/2 \S+\.md/);
      // In a split, a new tab takes this window out of it: two tabs of one window each.
      await s.keys("ctrl+w", "v");
      await s.until(() => windows(s) === 2, 3000, "the split");
      await s.keys("ctrl+t", "c");
      await s.see(/2 \S+\.md/);
      s.expect(windows(s) === 1, "the new tab holds one window");
      await s.keys("ctrl+t", "1");
      await s.until(() => windows(s) === 1, 3000, "the first tab left with one window");
      // Pinned: kept by close others and close all.
      await s.keys("ctrl+t", "m");
      await s.keys("ctrl+t", "c");
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "o");
      await s.see(/2 operations-handbook/);
      await s.see(/1 \S*\s*home\.md/);
      await s.keys("ctrl+t", "shift+q");
      await s.notSee(/2 operations-handbook/);
      await s.see(/1 \S*\s*home\.md/);
      // Unpinned, close all leaves nothing open.
      await s.keys("ctrl+t", "m");
      await s.keys("ctrl+t", "shift+q");
      await s.see("No note open");
      await s.status("FILES");
    },
  },

  // --- history --------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "history: back and forward; the list — this window's places, and recent here from another tab",
    covers: { cases: ["history"], commands: ["history.back", "history.forward", "history.list"] },
    run: async (s) => {
      await open(s, "writing-guide");
      await s.keys("ctrl+o");
      await s.status("home.md");
      await leader(s, "h", "n");
      await s.status("writing-guide.md");
      await leader(s, "h", "p");
      await s.status("home.md");
      // The handbook read in another tab: under recent here in this window's list.
      await s.keys("ctrl+t", "c");
      await open(s, "operations-handbook");
      await s.keys("ctrl+t", "1");
      await s.status("home.md");
      await leader(s, "h", "h");
      await s.see("recent here");
      await s.see("operations-handbook.md");
      await s.see("writing-guide.md");
      await s.keys("escape");
    },
  },

  // --- tags -----------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "tags: space f t lists them with counts, a tag its notes; a #tag in the text followed",
    covers: { cases: ["tags"], commands: ["tag.list"] },
    run: async (s) => {
      await leader(s, "f", "t");
      await s.see(/Tags \(\d+\)/, 10000); // after the index is read
      await s.see(/#dome\/shutter +2 notes/);
      await s.type("shutter");
      await s.keys("enter");
      await s.see("#dome/shutter — 2 notes");
      await s.see("projects/variable-star-survey.md");
      await s.keys("enter");
      await s.status("dome-refit.md");
      // The tags on its last line, one link after the other; the second followed, its notes.
      await s.keys("shift+g", "]", "l");
      await s.status("→ #dome/shutter");
      await s.keys("]", "l");
      await s.status("→ #budget/2026");
      await s.keys("enter");
      await s.see("#budget/2026 — 1 note");
      await s.keys("escape");
    },
  },

  // --- the explorer, the outline, the breadcrumb ----------------------------------------------
  {
    area: "navigating",
    name: "explorer: space e opens, focuses and hides it; space shift+e reveals the note",
    covers: { cases: ["explorer"], commands: ["explorer.cycle", "explorer.reveal"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      // space e cycles: open, focus, close. It may start open (a wide terminal), so press to focus.
      await explorerOpen(s);
      await s.see("Explorer");
      await leader(s, "e");
      await s.notSee("Explorer");
      await leader(s, "shift+e");
      await s.status("FILES");
      // Revealed: the note's own row in the explorer, left of the border (its name cut where the selected row's
      // buttons sit).
      await s.until(
        () => s.screen().some((r) => /operations-han\S*…?.*[│┃]/.test(r) && !/╞|├─/.test(r.slice(r.search(/[│┃]/)))),
        3000,
        "the note revealed in the explorer",
      );
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "outline: space o opens and focuses it; the heading picker jumps; shown and hidden from the palette",
    covers: { cases: ["outline"], commands: ["outline.cycle", "outline.pick", "outline.toggle"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      await outlineOpen(s);
      await s.see("Outline");
      await s.keys("escape");
      await leader(s, "f", "o");
      await s.see("Headings —");
      await s.type("O25");
      await s.keys("enter");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O25:"), 3000, "the cursor on O25's heading");
      // The outline, open since space o: hidden from the palette, then shown again.
      await s.keys(":");
      await s.type("Show or hide the outline");
      await s.keys("enter");
      await s.notSee("Outline");
      await s.keys(":");
      await s.type("Show or hide the outline");
      await s.keys("enter");
      await s.see("Outline");
    },
  },
  {
    area: "navigating",
    name: "breadcrumb: space f b opens the heading path as a list; typing filters it, enter jumps to one",
    covers: { cases: ["breadcrumb", "outline"], commands: ["breadcrumb.path", "outline.pick"] },
    options: { open: HANDBOOK, size: { cols: 100, rows: 34 } },
    run: async (s) => {
      // Under O22's first subheading: the path is the title, O22, the subheading (here).
      const sub = lineOf(s, HANDBOOK, "### The gateway client block");
      await leader(s, "f", "o");
      await s.see("Headings —");
      await s.type("gateway client block");
      await s.keys("enter");
      await s.until(() => pos(s).line === sub, 3000, "the cursor on the subheading");
      await s.keys("j", "j");
      await leader(s, "f", "b");
      await s.see("Path");
      await s.see(/└─ O22: Remote access through one gateway/);
      await s.see(/└─ The gateway client block\s+here/);
      await s.type("O22");
      await s.notSee(/└─ The gateway client block/);
      await s.keys("enter");
      await s.notSee("Path");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O22:"), 3000, "enter to O22's heading");
    },
  },

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

  // --- the palette ----------------------------------------------------------------------------
  {
    area: "navigating",
    name: "palette: : and space f p list the commands; :e opens a note",
    covers: { cases: ["palette"], commands: ["palette.open"] },
    run: async (s) => {
      await s.keys(":");
      await s.see("Commands");
      await s.keys("escape");
      await leader(s, "f", "p");
      await s.see("Commands");
      await s.keys("escape");
      await s.ex("e partners-and-names");
      await s.status("partners-and-names.md");
    },
  },

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
    name: "settings: the top bar, the breadcrumb and the window header hidden and shown again; zen has no header",
    covers: {
      cases: ["ui", "breadcrumb", "window-header"],
      commands: ["ui.top_bar", "ui.breadcrumb", "ui.window_header", "ui.zen", "palette.open"],
    },
    run: async (s) => {
      s.expect(s.topBar().includes("slipbox"), "the top bar showing to begin with");
      await leader(s, "u", "b");
      await s.message("Top bar: off");
      await s.until(() => !s.topBar().includes("slipbox"), 3000, "the top bar gone");
      await leader(s, "u", "b");
      await s.until(() => s.topBar().includes("slipbox"), 3000, "the top bar back");
      // The breadcrumb has no key: the palette (or the list) toggles it. Hidden, the header stays, with its buttons.
      const HEADER = /Read {2}Lens {2}Source/;
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
      await s.where(/^halden(?: ·|$)/, /2026-09-14-weekly\.md/);
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "halden opened, not the named folders' list");
    },
  },
  {
    area: "navigating",
    name: "start: a path that isn't there, a --root that isn't a root, a path outside it — a line and exit 3",
    covers: { cases: ["opening"] },
    options: { startAt: "nope/missing.md", noWait: true },
    run: async (s) => {
      const failed = async (what: string, line: RegExp) => {
        await s.until(() => s.exited(), 10000, `slipbox to give up on ${what}`).catch(() => undefined);
        s.expect(s.exited(), `slipbox gave up on ${what}`);
        const out = s.after(30);
        s.expect(line.test(out), `the reason, in a line, for ${what}\n${out}`);
        s.expect(!/^\s+at /m.test(out), `no stack trace for ${what}\n${out}`);
        s.expect(s.exitCode() === 3, `exit 3 for ${what}, not ${s.exitCode()}`);
      };
      await failed("a missing path", /slipbox: no such file or directory: .*nope\/missing\.md/);
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

  // --- colours and glyphs ---------------------------------------------------------------------
  {
    area: "navigating",
    name: "colours: the theme's roles as drawn; :theme switches; [colors] overrides, per theme too",
    covers: { cases: ["theme", "colors"], commands: ["theme.set"] },
    options: { config: '[colors]\nh2 = "#ff00aa"\n\n[colors.nord]\nlink = "#00ff00"\n' },
    run: async (s) => {
      // tokyo-night: the link and inline code in their roles; the h2 in the override's colour.
      await drawnIn(s, "operations-handbook", TOKYO.roles.link.fg!, "a link in tokyo-night's link colour");
      await drawnIn(s, "people/contacts.md", TOKYO.roles.code_inline.fg!, "inline code in its role's colour");
      s.expect(
        stylesOf(s, "people/contacts.md").some((r) => r.bg === TOKYO.roles.code_inline.bg),
        "inline code on its role's background",
      );
      await drawnIn(s, "Start here", "#ff00aa", "the h2 in [colors]' colour");
      // :theme nord: nord's colours, its own [colors.nord] link, the global h2 still.
      await s.ex("theme nord");
      await drawnIn(s, "operations-handbook", "#00ff00", "the link in [colors.nord]'s colour");
      await drawnIn(s, "people/contacts.md", NORD.roles.code_inline.fg!, "inline code in nord's colour");
      await drawnIn(s, "Start here", "#ff00aa", "the h2 override under nord too");
      s.expect(
        !stylesOf(s, "people/contacts.md").some((r) => r.fg === TOKYO.roles.code_inline.fg),
        "tokyo-night's code colour gone",
      );
    },
  },
  {
    area: "navigating",
    name: "colours: --theme draws its colours from the start; NO_COLOR draws none",
    covers: { cases: ["theme", "colors"] },
    options: { args: ["--theme", "nord"] },
    run: async (s) => {
      // What's drawn is that theme's: the heading in nord's h2 colour, not tokyo-night's.
      await drawnIn(s, "Start here", NORD.roles.h2.fg!, "a heading in nord's h2 colour");
      s.expect(
        !stylesOf(s, "Start here").some((r) => r.fg === TOKYO.roles.h2.fg),
        "no heading in tokyo-night's colour under --theme nord",
      );
      // NO_COLOR: nothing with text on it is coloured at all.
      await s.restart({ args: [], env: { NO_COLOR: "1" } });
      await s.see("Start here");
      const coloured = s
        .runs()
        .flat()
        .filter((r) => r.text.trim() && (r.fg !== null || r.bg !== null));
      s.expect(!coloured.length, `no colour under NO_COLOR: ${JSON.stringify(coloured.slice(0, 3))}`);
    },
  },
  {
    area: "navigating",
    name: "glyphs: SLIPBOX_GLYPHS=ascii, and a locale that isn't UTF-8, draw the frame in ASCII",
    covers: { cases: ["glyphs"] },
    options: { env: { SLIPBOX_GLYPHS: "unicode" } },
    run: async (s) => {
      // The frame's rule (the row under the top bar) and the explorer's buttons: Unicode, then ASCII.
      const rule = () => s.screen()[1] ?? "";
      await s.until(() => /[━─]/.test(rule()), 3000, "the Unicode frame");
      await s.see("≡");
      const envs: Record<string, string>[] = [
        { SLIPBOX_GLYPHS: "ascii" },
        { SLIPBOX_GLYPHS: "", LC_ALL: "", LC_CTYPE: "", LANG: "C" },
      ];
      for (const env of envs) {
        await s.restart({ env });
        await s.until(
          () => /^[\x20-\x7e]+$/.test(rule().trimEnd()) && rule().includes("-"),
          3000,
          `an ASCII frame (${JSON.stringify(env)})`,
        );
        s.expect(
          s.rowOf("≡") < 0 && s.rowOf("◷") < 0 && s.rowOf("×") < 0,
          `no Unicode buttons (${JSON.stringify(env)})`,
        );
        await s.see(/1 home\.md x/); // the tab's close button
      }
    },
  },

  // --- lists, questions, the mouse ----------------------------------------------------------
  {
    area: "navigating",
    name: "lists: moves wrap around the ends, pagedown and ctrl+d by ten; ctrl+w and backspace edit the filter",
    covers: { cases: ["lists-prompts", "switcher"], commands: ["switcher.open"] },
    options: { size: { cols: 120, rows: 40 } },
    run: async (s) => {
      const counter = () => /\s(\d+)\/(\d+) ┘/.exec(s.screen().find((r) => / \d+\/\d+ ┘/.test(r)) ?? "");
      const at = () => Number(counter()?.[1] ?? -1);
      const total = () => Number(counter()?.[2] ?? -1);
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.until(() => at() === 1 && total() > 12, 3000, "the switcher at its first entry");
      const n = total();
      await s.keys("up");
      await s.until(() => at() === n, 3000, "up from the first: the last");
      await s.keys("down");
      await s.until(() => at() === 1, 3000, "down from the last: the first");
      await s.keys("pagedown");
      await s.until(() => at() === 11, 3000, "pagedown: ten down");
      await s.keys("pageup");
      await s.until(() => at() === 1, 3000, "pageup: ten up");
      await s.keys("ctrl+d");
      await s.until(() => at() === 11, 3000, "ctrl+d: ten down");
      await s.keys("ctrl+u");
      await s.until(() => at() === 1, 3000, "ctrl+u: ten up");
      // The other moves a list has: tab and shift+tab, ctrl+n and ctrl+p, ctrl+j and ctrl+k.
      for (const [down, up] of [
        ["tab", "shift+tab"],
        ["ctrl+n", "ctrl+p"],
        ["ctrl+j", "ctrl+k"],
      ] as const) {
        await s.keys(down);
        await s.until(() => at() === 2, 3000, `${down}: the next entry`);
        await s.keys(up);
        await s.until(() => at() === 1, 3000, `${up}: the one before`);
      }
      // Typed, the filter narrows; ctrl+w takes its last word off, backspace a letter.
      await s.type("hand guide");
      await s.until(() => total() === 1, 3000, "the writing guide alone with hand and guide");
      await s.keys("ctrl+w");
      await s.until(() => s.rowOf(/› hand\s*│/) >= 0 && total() === 2, 3000, "ctrl+w: guide gone, both handbook notes");
      await s.keys("backspace", "backspace", "backspace", "backspace", "backspace");
      await s.until(() => total() === n, 3000, "backspace to an empty filter: every entry again");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "switcher: words in any order; # lists the note's headings to jump to",
    covers: { cases: ["switcher"], commands: ["switcher.open"] },
    options: { open: HANDBOOK, size: { cols: 120, rows: 40 } },
    run: async (s) => {
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("guide writing");
      await s.see(/│ handbook\/writing-guide\.md/);
      await s.keys("escape");
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("#O22");
      await s.see(/│ O22: Remote access through one gateway .* handbook\/operations-handbook\.md:\d+/);
      await s.keys("enter");
      await s.until(() => pos(s).line === lineOf(s, HANDBOOK, "## O22:"), 3000, "the cursor on O22's heading");
    },
  },
  {
    area: "navigating",
    name: "questions: enter answers nothing, n says no, esc cancels, y says yes",
    covers: { cases: ["questions", "trash"], commands: ["note.delete"] },
    options: { open: "scratch/wrap-probe.md", size: { cols: 120, rows: 34 } },
    run: async (s) => {
      const NOTE = "scratch/wrap-probe.md";
      const ASKED = "Delete scratch/wrap-probe.md?";
      const ask = async () => {
        await leader(s, "n", "d");
        await s.see(ASKED);
      };
      await ask();
      await s.keys("enter");
      await s.see(ASKED); // still asking
      await s.keys("n");
      await s.notSee(ASKED);
      s.expect(s.exists(NOTE), "n: the note kept");
      await ask();
      await s.keys("escape");
      await s.notSee(ASKED);
      s.expect(s.exists(NOTE), "esc: the note kept");
      await ask();
      await s.keys("y");
      await s.notSee(ASKED);
      await s.until(() => !s.exists(NOTE), 3000, "y: the note gone to the trash");
    },
  },
  {
    area: "navigating",
    name: "mouse: a click follows a link, ‹ goes back, a tab clicked, the wheel scrolls; ≡ hides the explorer",
    covers: { cases: ["mouse", "history", "tabs"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      /** A click (SGR's reports, as a terminal sends them) on the first place `needle` shows. */
      const click = async (needle: string, row = s.rowOf(needle)) => {
        s.expect(row >= 0, `${needle} on screen to click`);
        const col = [...s.screen()[row]!].join("").indexOf(needle);
        const x = Bun.stringWidth(s.screen()[row]!.slice(0, col)) + 1;
        await s.send(`\x1b[<0;${x};${row + 1}M`);
        await s.send(`\x1b[<0;${x};${row + 1}m`);
      };
      await click("operations-handbook — how");
      await s.status("operations-handbook.md");
      // The status line's ‹: back.
      await click("‹", s.rows - 1);
      await s.status("home.md");
      // A second tab; the first one's clicked.
      await s.keys("ctrl+t", "c");
      await open(s, "writing-guide");
      await click("1 home.md");
      await s.status("home.md");
      // The wheel scrolls the note: its first row leaves the top.
      const TOP = "▌ Halden Ridge Observatory";
      await s.see(TOP);
      const row = s.rowOf("Welcome to the observatory");
      const x = Bun.stringWidth(s.screen()[row]!.slice(0, s.screen()[row]!.indexOf("Welcome"))) + 1;
      await s.send(`\x1b[<65;${x};${row + 1}M`);
      await s.notSee(TOP);
      await s.send(`\x1b[<64;${x};${row + 1}M`);
      await s.see(TOP);
      // The rail's ≡: the explorer hidden, then shown.
      await s.see("Explorer");
      await click("≡");
      await s.notSee("Explorer");
      await click("≡");
      await s.see("Explorer");
    },
  },

  // --- help, messages, the config, the index ---------------------------------------------------
  {
    area: "navigating",
    name: "help: ? lists every key by group; typing filters, the groups kept; enter runs the command",
    covers: { cases: ["help"], commands: ["help.open", "window.split_side"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.see("CURSOR");
      await s.see(/Cursor left\s+h\s+left/);
      await s.type("split side");
      await s.see("WINDOWS");
      await s.see(/Split side by side\s+ctrl\+w v/);
      await s.notSee("CURSOR");
      await s.keys("enter");
      await s.notSee("Keys — type to filter");
      await s.until(() => windows(s) === 2, 3000, "the split it ran");
    },
  },
  {
    area: "navigating",
    name: "config: mistakes are warnings in the messages, the rest applies; space v c reloads; a typo keeps the last good",
    covers: { cases: ["config", "ui"], commands: ["messages.open", "config.reload"] },
    options: {
      size: { cols: 140, rows: 34 },
      config: '[ui]\nline_numbers = false\nlines = "thick"\nsidebar_width = 7\nnosuch = 1\n',
    },
    run: async (s) => {
      /** One message in the list says all these words (the rows are cut, the file's path first: the count tells). */
      const said = async (words: string, count = / 1\/1 ┘/) => {
        await leader(s, "m");
        await s.see("Messages");
        await s.type(words);
        await s.see(count);
        await s.keys("escape");
        await s.notSee("Messages");
      };
      // Each mistake said; line numbers off all the same, as the rest of the file says.
      await said("unknown key ui.nosuch");
      await said("ui.sidebar_width must be between 8 and 200");
      await said("ui.lines must be one of light heavy");
      const numbered = () => /[│┃]\s+1\s+▌ Halden Ridge Observatory/.test(s.text());
      await s.see("▌ Halden Ridge Observatory");
      s.expect(!numbered(), "line numbers off, as the file says");
      // Fixed, and line numbers on: space v c reloads at once.
      const fixed = s
        .read(configFile(s))
        .replace(/^(lines|sidebar_width|nosuch) = .*\n/gm, "")
        .replace("line_numbers = false", "line_numbers = true");
      s.write(configFile(s), fixed);
      await leader(s, "v", "c");
      await s.until(numbered, 3000, "line numbers on after the reload");
      // A typo saved mid-edit (line numbers off in it too): said, and the last good settings kept.
      s.write(configFile(s), `${fixed.replace("line_numbers = true", "line_numbers = false")}\n[ui\n`);
      await leader(s, "v", "c");
      // Saved, the file is read again on its own too (polled): before space v c did, on a slow machine, and said by
      // each (#40).
      await said("Invalid TOML keeping what it said before", / 1\/[12] ┘/);
      s.expect(numbered(), "line numbers still on: the last good settings");
    },
  },
  {
    area: "navigating",
    name: "index: a note saved here is indexed again — its new link in the target's backlinks, its new word found",
    covers: { cases: ["index", "search"], commands: ["backlinks.open", "search.open", "note.save"] },
    options: { open: "people/kenji-mori.md", size: { cols: 140, rows: 34 } },
    run: async (s) => {
      await toSource(s);
      await s.keys("shift+g", "o");
      await s.type("See [the dome refit](../projects/dome-refit.md) and the quokkaline.");
      await s.keys("escape", "ctrl+s");
      await s.file("people/kenji-mori.md", (t) => t.includes("quokkaline"), "the note saved");
      await s.ex("e dome-refit");
      await s.status("dome-refit.md");
      await leader(s, "l", "b");
      await s.see(/Linking to dome-refit\.md/, 5000);
      await s.see(/people\/kenji-mori\.md\s+the dome refit/, 5000);
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("quokkaline");
      await s.see(/"quokkaline" — 1 file/, 5000);
      await s.see("people/kenji-mori.md:");
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "find: replace in every note — ctrl+shift+h previews each change, enter makes them; space v shift+u undoes",
    covers: { cases: ["vault-find", "replace"], commands: ["find.replace_vault", "rename.undo"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      const count = (w: string) => s.read(HANDBOOK).split(w).length - 1;
      const corvids = count("Corvid");
      await s.keys("ctrl+shift+h");
      await s.see("replace in every note — find");
      await s.type("Corvid");
      await s.keys("enter");
      await s.see('replace "Corvid" in every note with');
      await s.type("Raven");
      await s.keys("enter");
      await s.see(/"Corvid" → "Raven": \d+ changes in \d+ files — enter: do it/, 5000);
      await s.see("handbook/operations-handbook.md:");
      s.expect(count("Raven") === 0, "nothing written while previewing");
      await s.keys("enter");
      await s.message(/replaced "Corvid" with "Raven"/);
      await s.until(() => count("Raven") === corvids && count("Corvid") === 0, 3000, "every Corvid replaced");
      await leader(s, "v", "shift+u");
      await s.see(/undo: "Raven" → "Corvid"/);
      await s.keys("enter");
      await s.until(() => count("Corvid") === corvids && count("Raven") === 0, 3000, "the replace undone");
    },
  },

  // --- which-key ------------------------------------------------------------------------------
  {
    area: "navigating",
    name: "which-key: the leader's groups at once, a prefix's entries after its delay; backspace goes up, esc closes",
    covers: { cases: ["which-key"] },
    options: { config: "[input]\nwhich_key_delay_ms = 1500\n" },
    run: async (s) => {
      // The leader: its groups at once, delay or not.
      s.term.key("space");
      await s.until(() => s.rowOf("+history") >= 0 && s.rowOf("+session") >= 0, 1000, "the leader's groups at once");
      // Into find's group: its entries; backspace back up to the groups; esc closes.
      await s.keys("f");
      await s.see("Find in every note");
      await s.see("Search here");
      await s.keys("backspace");
      await s.until(
        () => s.rowOf("+history") >= 0 && s.rowOf("Find in every note") < 0,
        3000,
        "backspace up to the groups",
      );
      await s.keys("escape");
      await s.until(() => s.rowOf("+history") < 0, 3000, "esc closing the popup");
      // g, another prefix: nothing until its delay (1.5 s here), then its entries.
      s.term.key("g");
      await sleep(400); // well inside the delay: a popup now would be early
      s.expect(s.rowOf("g › go") < 0, "g's popup before its delay");
      await s.see("g › go", 4000);
      await s.see("Top of note");
      await s.keys("escape");
      await s.notSee("g › go");
    },
  },
  {
    area: "navigating",
    name: "which-key: z, [ and ] list every key under them, each titled with what it holds",
    covers: { cases: ["which-key"] },
    options: { config: "[input]\nwhich_key_delay_ms = 100\n" },
    run: async (s) => {
      /** The popup's entry for `key`: a row with the key, then its name. */
      const entry = (key: string, name: string) =>
        new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(→\\s+)?${name}`);
      const popup = async (prefix: string, title: string, entries: [string, string][]) => {
        s.term.key(prefix);
        await s.see(title);
        for (const [key, name] of entries) await s.see(entry(key, name));
        await s.keys("escape");
        await s.notSee(title);
      };
      // The title: the keys, the group's name and its explanation, whose start fits any terminal.
      await popup("z", "z › scroll: the cursor's line to the middle (z), top (t)", [
        ["z", "Cursor's line to the middle"],
        ["t", "Cursor's line to the top"],
        ["b", "Cursor's line to the bottom"],
        ["=", "Spelling suggestions"],
        ["g", "Add the word to your words"],
        ["a", "Fold or unfold the cell"],
      ]);
      await popup("[", "[ › previous: heading ([), link (l), misspelt word (s)", [
        ["[", "Previous heading"],
        ["l", "Previous link"],
        ["s", "Previous misspelt word"],
        ["c", "Previous change"],
        ["t", "Previous of this type"],
      ]);
      await popup("]", "] › next: heading (]), link (l), misspelt word (s)", [
        ["]", "Next heading"],
        ["l", "Next link"],
        ["s", "Next misspelt word"],
        ["c", "Next change"],
        ["t", "Next of this type"],
      ]);
    },
  },

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

export const LEFT_OUT_NAVIGATING: LeftOut = {};
