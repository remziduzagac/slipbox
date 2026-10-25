// The panels as the checks' shared helpers drive them (#18): the leader's which-key popup names a panel by its
// command's title, and the helpers read the panel's own title and the status line's mode, never the popup's line;
// each press of a panel's key is seen taking effect before the next, and counted here from the trace.

import {
  type Check,
  EXPLORER,
  explorerClosed,
  explorerOpen,
  HANDBOOK,
  leader,
  mode,
  OUTLINE,
  outlineOpen,
} from "../check.ts";
import type { Session } from "../session.ts";
import { toPanel } from "./source-control.ts";

/** How many times the command `id` has run (the trace's commands). */
const ran = (s: Session, id: string) => s.commands().filter((c) => c === id).length;

/** `act`, then how many times it ran `id`: a panel's key pressed, once for each run of its command. */
async function presses(s: Session, id: string, act: () => Promise<void>): Promise<number> {
  const before = ran(s, id);
  await act();
  return ran(s, id) - before;
}

/** A mode on the status line, waited for. */
const inMode = (s: Session, m: string) => s.until(() => mode(s) === m, undefined, `${m} on the status line`);

export const PANELS: Check[] = [
  {
    area: "navigating",
    name: "which-key: the leader's popup names the explorer and the outline, never read as their titles; while keys wait, view and mode remain",
    covers: { cases: ["which-key", "explorer", "outline"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await inMode(s, "READ");
      // A wide terminal starts with the explorer open, the outline closed.
      await s.until(() => s.rowOf(EXPLORER) >= 0, undefined, "the explorer's title");
      const title = s.rowOf(EXPLORER);
      await s.keys("space");
      await s.see("Explorer: open, focus, close");
      await s.see("Outline: open, focus, close");
      // The popup's lines say the panels' names, as a bare /Explorer/ or /Outline/ finds; the titles' patterns find the
      // explorer's own row alone, and no outline.
      const line = s.rowOf("Explorer: open, focus, close");
      s.expect(
        line > title && s.rowOf(EXPLORER) === title,
        `EXPLORER on the title (row ${title}), not the popup's ${line}`,
      );
      s.expect(!EXPLORER.test(s.screen()[line]!), "EXPLORER not on the popup's line");
      s.expect(s.rowOf(/Outline/) >= 0 && s.rowOf(OUTLINE) < 0, "OUTLINE not on the popup's line, the outline closed");
      // The leader pending: its chip, ␣, where the mode was.
      s.expect(/NORMAL  ␣ /.test(s.statusLine()) && mode(s) === null, `the leader pending, no mode: ${s.statusLine()}`);
      await s.keys("escape");
      await inMode(s, "READ");
    },
  },
  {
    area: "navigating",
    name: "explorer: the checks' explorerOpen and explorerClosed press space e once a step, from every start, never again",
    covers: { cases: ["explorer"], commands: ["explorer.cycle"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await inMode(s, "READ");
      await s.until(() => s.rowOf(EXPLORER) >= 0, undefined, "the explorer open at the start");
      const steps: [string, () => Promise<void>, number, string, boolean][] = [
        ["open, unfocused: focused", () => explorerOpen(s), 1, "FILES", true],
        ["focused: as it is", () => explorerOpen(s), 0, "FILES", true],
        ["focused: closed", () => explorerClosed(s), 1, "READ", false],
        ["closed: as it is", () => explorerClosed(s), 0, "READ", false],
        ["closed: opened and focused", () => explorerOpen(s), 1, "FILES", true],
        ["focused: escape back to the note, the explorer still open", () => s.keys("escape"), 0, "READ", true],
        ["open, unfocused: focused, then closed", () => explorerClosed(s), 2, "READ", false],
      ];
      for (const [what, act, n, m, shown] of steps) {
        const pressed = await presses(s, "explorer.cycle", act);
        s.expect(pressed === n, `${what}: ${n} presses of space e, not ${pressed}`);
        await inMode(s, m);
        s.expect(s.rowOf(EXPLORER) >= 0 === shown, `${what}: the explorer ${shown ? "shown" : "hidden"}`);
      }
    },
  },
  {
    area: "navigating",
    name: "explorer: a tab, a heading and a note's line that say Explorer or Outline in passing are never the panels' titles",
    covers: { cases: ["explorer", "outline"], commands: ["explorer.cycle", "outline.cycle"] },
    // Line numbers off: the note's lines start just past the window's border, as the outline's title does.
    options: {
      home: true,
      startAt: "home/notes/reading/Explorer of the North.md",
      config: "[ui]\nline_numbers = false\n",
    },
    run: async (s) => {
      await inMode(s, "READ");
      // The explorer open at the start: the note's line starting "Outline" drawn just past its border, as the outline's
      // title is past the right panel's — never read as that title, the outline closed.
      await s.see(/[│┃] Outline of the book/);
      s.expect(s.rowOf(OUTLINE) < 0, "OUTLINE not on the note's line");
      // Open and unfocused: focused, then closed — the tab, the heading and the text still saying its name.
      const closing = await presses(s, "explorer.cycle", () => explorerClosed(s));
      s.expect(closing === 2, `space e twice, to focus it and close it: ${closing}`);
      s.expect(s.rowOf(/1 Explorer of the North/) >= 0, "the tab says Explorer");
      s.expect(s.rowOf(EXPLORER) < 0, "EXPLORER on no row: not the tab's, the heading's or the text's");
      s.expect((await presses(s, "explorer.cycle", () => explorerClosed(s))) === 0, "closed already, no press");
      // The outline opened: its title found, above the note's line.
      const opening = await presses(s, "outline.cycle", () => outlineOpen(s));
      s.expect(opening === 1, `space o once: ${opening}`);
      s.expect(s.rowOf(OUTLINE) < s.rowOf("Outline of the book"), "OUTLINE on the panel's title, above the text");
    },
  },
  {
    area: "navigating",
    name: "outline: outlineOpen (panelFocused) opens and focuses it with one press, its title at the screen's edge with no right rail",
    covers: { cases: ["outline"], commands: ["outline.cycle"] },
    options: { open: HANDBOOK, config: "[ui]\nright_rail = false\n" },
    run: async (s) => {
      await inMode(s, "READ");
      s.expect(s.rowOf(OUTLINE) < 0, "the outline closed at the start");
      const pressed = await presses(s, "outline.cycle", () => outlineOpen(s));
      s.expect(pressed === 1, `one press of space o, not ${pressed}`);
      // Nothing right of it: the title, then the panel's blank to the screen's edge.
      const row = s.screen()[s.rowOf(OUTLINE)]!;
      s.expect(/[│┃] Outline *$/.test(row), `the outline's title, nothing after it: ${row}`);
      const again = await presses(s, "outline.cycle", () => outlineOpen(s));
      s.expect(again === 0, `focused already, no press: ${again}`);
      await inMode(s, "OUTLINE");
    },
  },
  {
    area: "navigating",
    name: "status line: the mode's chip, and beside it keys waiting — F for its character, d then T — view and mode stay visible",
    covers: { cases: ["status", "source-mode"], commands: ["view.source"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await inMode(s, "READ");
      await s.keys("ctrl+k");
      await inMode(s, "SOURCE");
      for (const [keys, chip] of [
        [["F"], " F "],
        [["d", "T"], " dT "],
      ] as const) {
        await s.keys(...keys);
        await s.until(() => s.statusLine().includes(`NORMAL ${chip}`), undefined, `${chip.trim()} on the status line`);
        s.expect(mode(s) === null, `${chip.trim()} waiting, no mode: ${s.statusLine()}`);
        await s.keys("escape");
        await inMode(s, "SOURCE");
      }
    },
  },
  {
    area: "navigating",
    name: "glyphs: in ASCII the explorer's title and border, and the leader pending as SPC beside view and mode; the helpers as in Unicode",
    covers: { cases: ["glyphs", "explorer", "which-key"], commands: ["explorer.cycle"] },
    options: { open: HANDBOOK, env: { SLIPBOX_GLYPHS: "ascii" } },
    run: async (s) => {
      await inMode(s, "READ");
      await s.until(() => s.rowOf(EXPLORER) >= 0, undefined, "the explorer's title, its border ASCII's");
      s.expect(/Explorer[^|│┃]*\|/.test(s.screen()[s.rowOf(EXPLORER)]!), "the title's border is |");
      await s.keys("space");
      await s.see("Explorer: open, focus, close");
      s.expect(
        /NORMAL  SPC /.test(s.statusLine()) && mode(s) === null,
        `the leader pending as SPC beside view and mode: ${s.statusLine()}`,
      );
      s.expect(
        !EXPLORER.test(s.screen()[s.rowOf("Explorer: open, focus, close")]!),
        "EXPLORER not on the popup's line",
      );
      await s.keys("escape");
      await inMode(s, "READ");
      s.expect((await presses(s, "explorer.cycle", () => explorerOpen(s))) === 1, "space e once to focus it");
      s.expect((await presses(s, "explorer.cycle", () => explorerClosed(s))) === 1, "space e once to close it");
      s.expect(s.rowOf(EXPLORER) < 0, "the explorer closed");
    },
  },
  {
    area: "navigating",
    name: "zen: no status line, the explorer hidden — explorerClosed leaves it as it is, no key pressed",
    covers: { cases: ["ui"], commands: ["ui.zen"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await inMode(s, "READ");
      await leader(s, "u", "z");
      await s.until(() => mode(s) === null && s.rowOf(EXPLORER) < 0, undefined, "zen: no status line, no explorer");
      const pressed = await presses(s, "explorer.cycle", () => explorerClosed(s));
      s.expect(pressed === 0, `a closed explorer left as it is: ${pressed} presses`);
    },
  },
  {
    area: "outside-and-code",
    name: "git panel: toPanel presses space g once to open and focus it, never again once focused",
    covers: { cases: ["git"], commands: ["git.view"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await inMode(s, "READ");
      s.expect((await presses(s, "git.view", () => toPanel(s))) === 1, "space g once");
      await inMode(s, "GIT");
      s.expect((await presses(s, "git.view", () => toPanel(s))) === 0, "focused already, no press");
    },
  },
];
