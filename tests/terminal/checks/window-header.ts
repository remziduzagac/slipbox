// The window header (HDR, #24): its Read, Lens and Source buttons driven by the mouse in a terminal, the modes a file
// can't be shown in, a split narrowed, hover and which-key over them; in the editing area, where `view.*` is, in a file
// of its own, editing.ts being near the size limit.

import { type Check, explorerOpen, leader, open, opened } from "../check.ts";
import { type Session, type StyledRun, WAIT } from "../session.ts";
import { at, findText, ready, SEPT1 } from "./editing.ts";

// The window header's mode buttons (HDR-D2): `Read  Lens  Source`, shortened `R  L  S`, on the row atop each window.
const MODE_GROUPS = [
  { re: /Read {2}Lens {2}Source/g, at: { Read: 0, Lens: 6, Source: 12 } },
  { re: /\bR {2}L {2}S\b/g, at: { Read: 0, Lens: 3, Source: 6 } },
] as const;
type ModeLabel = "Read" | "Lens" | "Source";

/** The style of the character at index `at` of screen row `y`, and its column. */
function cellAt(s: Session, y: number, at: number): { x: number; y: number; style: StyledRun } | null {
  const row = s.screen()[y]!;
  let n = 0;
  for (const r of s.runs()[y]!) {
    if (at < n + r.text.length) return { x: Bun.stringWidth(row.slice(0, at)), y, style: r };
    n += r.text.length;
  }
  return null;
}

/**
 * Window `nth`'s mode button `label`, as the screen shows it, counting the headers' button groups from the top left
 * (windows side by side share a row, stacked ones don't): its cell and style, or null when it isn't drawn.
 */
function modeButton(s: Session, label: ModeLabel, nth = 0): { x: number; y: number; style: StyledRun } | null {
  const rows = s.screen();
  const groups = rows
    .slice(0, -1)
    .flatMap((r, y) =>
      MODE_GROUPS.flatMap((g) => [...r.matchAll(g.re)].map((m) => ({ y, at: m.index! + g.at[label] }))),
    )
    .sort((a, b) => a.y - b.y || a.at - b.at);
  const g = groups[nth];
  return g ? cellAt(s, g.y, g.at) : null;
}

/** Whether row `y` shows, between indexes `from` and `to`, a mode button's selected letter drawn alone: bold, no other. */
function selectedLetterAlone(s: Session, y: number, from: number, to: number, letter: "R" | "L" | "S"): boolean {
  const part = s.screen()[y]!.slice(from, to);
  if (/\bR {2}L {2}S\b/.test(part)) return false;
  const at = part.lastIndexOf(` ${letter} `);
  return at >= 0 && !!cellAt(s, y, from + at + 1)?.style.bold;
}

/** A click (SGR's reports, as a terminal sends them) on window `nth`'s mode button. */
async function clickMode(s: Session, label: ModeLabel, nth = 0): Promise<void> {
  const b = modeButton(s, label, nth);
  s.expect(!!b, `window ${nth}'s ${label} button on screen to click`);
  await s.send(`\x1b[<0;${b!.x + 1};${b!.y + 1}M`);
  await s.send(`\x1b[<0;${b!.x + 1};${b!.y + 1}m`);
}

/** Window `nth`'s selected mode: the one button drawn bold. */
const selectedMode = (s: Session, nth = 0) =>
  (["Read", "Lens", "Source"] as const).filter((l) => modeButton(s, l, nth)?.style.bold);

export const WINDOW_HEADER: Check[] = [
  {
    area: "editing",
    name: "window header: Read · Lens · Source follow the mode; a click switches straight there, the chip agreeing",
    covers: {
      cases: ["window-header", "mouse", "status"],
      commands: ["view.mode_read", "view.mode_lens", "view.mode_source", "view.source", "view.live"],
    },
    options: at("~/notes/meetings/all-hands-archive.md"),
    run: async (s) => {
      await ready(s);
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected on opening");
      // The keys move the selection.
      await s.keys("ctrl+k");
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected after ctrl+k");
      // Source to Lens in one click, never through Read; the chip agrees.
      await clickMode(s, "Lens");
      await s.status("LENS");
      await s.message("the lens: the markdown around the cursor");
      await s.until(() => selectedMode(s).join() === "Lens", WAIT, "Lens selected after its click");
      await s.keys("escape"); // esc closes the lens
      await s.status("READ");
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected after esc");
      await clickMode(s, "Source");
      await s.status("SOURCE");
      await s.message("source — the note's markdown");
      await clickMode(s, "Read");
      await s.status("READ");
      // The selected one: nothing changes.
      await clickMode(s, "Read");
      await s.status("READ");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.until(() => selectedMode(s).join() === "Lens", WAIT, "Lens selected after space n l");
    },
  },
  {
    area: "editing",
    name: "window header: a click while typing ends it, the unsaved text kept; the selected one only ends typing",
    covers: { cases: ["window-header", "mouse"], commands: ["view.mode_source", "view.live", "edit.insert"] },
    options: at(SEPT1),
    run: async (s) => {
      await ready(s);
      await findText(s, "Lunch: walk");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("i");
      await s.status("INSERT");
      await s.type("Zq");
      // Typing isn't a mode: Lens stays selected.
      s.expect(selectedMode(s).join() === "Lens", `Lens selected while typing: ${selectedMode(s)}`);
      // The selected Lens: typing ends, the lens stays.
      await clickMode(s, "Lens");
      await s.status("LENS");
      await s.keys("i");
      await s.status("INSERT");
      await s.type("Wx");
      // Another mode: typing ends, the window switches, the text is the buffer's still (unsaved).
      await clickMode(s, "Source");
      await s.status("SOURCE");
      await s.see("ZWxq"); // typing ended steps the cursor back onto the q, as vim's esc does
      await s.see(/\d+ 2026-09-01\.md •/); // the tab: unsaved
      s.expect(!s.read(SEPT1).includes("Zq"), "nothing written to the file");
    },
  },
  {
    area: "editing",
    name: "window header: a text file and broken data have Source alone, the others disabled and saying why",
    covers: { cases: ["window-header", "text-files", "data"], commands: ["view.mode_read", "view.mode_lens"] },
    options: at("~/work/kestrel/tools/greeter/greeter.py"),
    run: async (s) => {
      await ready(s);
      // Code as a document: all three, Read selected; an enabled button's colour, to tell a disabled one by.
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected in a code document");
      const enabled = modeButton(s, "Lens")!.style.fg;
      await clickMode(s, "Lens");
      await s.status("LENS");
      await s.message("the lens: the code around the cursor");
      await clickMode(s, "Read");
      await s.message("the code as a document");
      // A text file: Source alone.
      await s.restart({ startAt: "home/work/kestrel/api/requirements.txt" });
      await ready(s);
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected in a text file");
      for (const l of ["Read", "Lens"] as const)
        s.expect(modeButton(s, l)!.style.fg !== enabled, `${l} disabled in a text file: drawn as an enabled one`);
      await clickMode(s, "Read");
      await s.message("requirements.txt has no rendered view: source mode");
      await s.status("SOURCE");
      // Data that doesn't parse: Source alone, a click warning why.
      await s.restart({ startAt: "home/work/infra/k8s/broken-ingress.yaml" });
      await ready(s);
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected in broken data");
      s.expect(modeButton(s, "Lens")!.style.fg !== enabled, "Lens disabled in broken data");
      await clickMode(s, "Lens");
      await s.message("broken-ingress.yaml doesn't parse"); // the parser's words after it wrap in the box
      await s.status("SOURCE");
    },
  },
  {
    area: "editing",
    name: "window header: a split narrowed, its buttons shorten to R L S, then the selected letter; each its own",
    covers: { cases: ["window-header", "windows"], commands: ["window.split_side", "view.mode_source"] },
    options: { ...at("~/notes/meetings/all-hands-archive.md"), size: { cols: 160, rows: 34 } },
    run: async (s) => {
      await ready(s);
      await s.keys("ctrl+w", "v");
      await s.until(() => modeButton(s, "Read", 1) !== null, WAIT, "two headers, side by side");
      // The right window, Source; the left still Read: each window its own.
      await clickMode(s, "Source", 1);
      await s.status("SOURCE");
      s.expect(selectedMode(s, 0).join() === "Read", `the left window still Read: ${selectedMode(s, 0)}`);
      // Narrowed by resize mode: the right window's buttons shorten, then only its selected letter is left.
      await leader(s, "w", "r");
      await s.status("RESIZE");
      const shown = () => s.screen().join("\n");
      await s.retry(
        () => s.keys("l"),
        () => /\bR {2}L {2}S\b/.test(shown()),
        "the letters, as the window narrows",
        50,
      );
      // Narrower still: the narrow window's selected letter alone, bold, in its own columns — the left's Read before
      // the wide one's buttons, or the right's Source after them, whichever the resize narrowed.
      const lone = () => {
        const y = s.screen().findIndex((r) => /Read {2}Lens {2}Source/.test(r));
        if (y < 0) return false;
        const row = s.screen()[y]!;
        const at = row.search(/Read {2}Lens {2}Source/);
        return selectedLetterAlone(s, y, 0, at, "R") || selectedLetterAlone(s, y, at + 18, row.length, "S");
      };
      await s.retry(() => s.keys("l"), lone, "the selected letter alone, bold, narrower still", 50);
      // Both windows still name their file first on the header.
      const row = s.screen().find((r) => /Read {2}Lens {2}Source/.test(r))!;
      s.expect((row.match(/meetings/g) ?? []).length === 2, `both windows' names on the header row: ${row}`);
      await s.keys("escape");
    },
  },
  {
    area: "editing",
    name: "window header: data broken while typed in the lens, Read clicked — source mode, said once; broken on disk, Source at once",
    covers: {
      cases: ["window-header", "data", "watching"],
      commands: ["view.live", "view.mode_read", "messages.open"],
    },
    options: at("~/work/kestrel/config/regions.yaml"),
    run: async (s) => {
      const FILE = "~/work/kestrel/config/regions.yaml";
      const BROKEN = "regions.yaml doesn't parse";
      await ready(s);
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected on a YAML file that parses");
      const enabled = modeButton(s, "Lens")!.style.fg;
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("i");
      await s.status("INSERT");
      await s.type(": [x");
      // Read clicked: typing ends, the window goes to source mode, and that it doesn't parse is said once.
      await clickMode(s, "Read");
      await s.status("SOURCE");
      await s.message(BROKEN);
      await s.ex("messages");
      await s.see("Messages");
      // The list's entries (each with its level and time), not the floating box that says it too.
      const said = () => s.screen().filter((r) => r.includes(BROKEN) && /warn \d\d:\d\d:\d\d/.test(r)).length;
      s.expect(said() === 1, `said once in the messages list, not ${said()} times:\n${s.text()}`);
      await s.keys("escape");
      // Undone, it parses again; Read. Then broken on disk, with the breadcrumb hidden: Source, the others disabled.
      await s.keys("u");
      await clickMode(s, "Read");
      await s.status("READ");
      await s.keys(":");
      await s.type("Breadcrumb");
      await s.keys("enter");
      await s.message("Breadcrumb: off");
      s.write(FILE, "regions: [eu, us\n");
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected once the file stopped parsing");
      for (const label of ["Read", "Lens"] as const)
        s.expect(modeButton(s, label)!.style.fg !== enabled, `${label} disabled: drawn as an enabled one`);
    },
  },
  {
    area: "editing",
    name: "window header: code as source by [render] code, Source alone; a window given a note has Read again, and back",
    covers: { cases: ["window-header", "code-files", "history"], commands: ["view.mode_read", "history.back"] },
    options: { ...at("~/work/kestrel/tools/greeter/greeter.py"), config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await ready(s);
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected: code shown as source");
      await clickMode(s, "Read");
      await s.message("greeter.py has no rendered view: source mode");
      // A note in the same window: Read again; the enabled buttons' colour, to tell the disabled ones by.
      await open(s, "README.md");
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected on a note");
      const enabled = modeButton(s, "Lens")!.style.fg;
      await s.keys("ctrl+o");
      await opened(s, "tools/greeter/greeter.py");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected on the code again");
      for (const label of ["Read", "Lens"] as const)
        s.expect(modeButton(s, label)!.style.fg !== enabled, `${label} disabled on the code: drawn as an enabled one`);
    },
  },
  {
    area: "editing",
    name: "window header: the scratch on the right and a stacked split's lower window, each with buttons of its own",
    covers: {
      cases: ["window-header", "scratch", "windows"],
      commands: ["scratch.open", "window.split_stacked", "view.mode_source", "view.mode_lens", "window.close"],
    },
    options: { ...at("~/notes/meetings/all-hands-archive.md"), config: '[capture]\nopen_in = "right"\n' },
    run: async (s) => {
      await ready(s);
      await leader(s, "s", "s");
      await s.until(() => modeButton(s, "Read", 1) !== null, WAIT, "the scratch on the right, its header's buttons");
      await clickMode(s, "Source", 1);
      await s.status("SOURCE");
      s.expect(selectedMode(s, 0).join() === "Read", `the note still Read: ${selectedMode(s, 0)}`);
      s.expect(selectedMode(s, 1).join() === "Source", `the scratch in Source: ${selectedMode(s, 1)}`);
      await s.keys("q"); // the scratch's window closed
      await s.until(() => modeButton(s, "Read", 1) === null, WAIT, "one window again");
      // Stacked: the lower window's header has its own.
      await s.keys("ctrl+w", "s");
      await s.until(() => modeButton(s, "Read", 1) !== null, WAIT, "two headers, stacked");
      const [upper, lower] = [modeButton(s, "Read", 0)!, modeButton(s, "Read", 1)!];
      s.expect(lower.y > upper.y, `the second header below the first (rows ${upper.y}, ${lower.y})`);
      await clickMode(s, "Lens", 1);
      await s.status("LENS");
      s.expect(selectedMode(s, 0).join() === "Read", `the upper window still Read: ${selectedMode(s, 0)}`);
      s.expect(selectedMode(s, 1).join() === "Lens", `the lower window in the lens: ${selectedMode(s, 1)}`);
    },
  },
  {
    area: "editing",
    name: "window header: hover lights a button a click switches to, never the selected or a disabled one; under which-key, nothing",
    covers: { cases: ["window-header", "mouse", "which-key"] },
    options: { ...at("~/notes/meetings/all-hands-archive.md"), size: { cols: 120, rows: 14 } },
    run: async (s) => {
      await ready(s);
      await s.until(() => selectedMode(s).join() === "Read", WAIT, "Read selected");
      /** The pointer moved over window 0's `label` (SGR's motion report), and that button's background then. */
      const hoverOver = async (label: ModeLabel) => {
        const b = modeButton(s, label)!;
        await s.send(`\x1b[<35;${b.x + 1};${b.y + 1}M`);
        return () => modeButton(s, label)!.style.bg;
      };
      const band = modeButton(s, "Lens")!.style.bg;
      const lens = await hoverOver("Lens");
      await s.until(() => lens() !== band, WAIT, "Lens lit under the pointer");
      const read = await hoverOver("Read");
      await s.until(() => lens() === band, WAIT, "Lens unlit once the pointer left it");
      s.expect(read() === band, "the selected Read never lit");
      // Which-key over the header: a click where Lens is goes nowhere.
      const at = modeButton(s, "Lens")!;
      await s.keys("space");
      await s.until(
        () => !s.statusLine().includes("READ"),
        WAIT,
        "the leader pending, its popup up (no mode on the chip)",
      );
      await s.send(`\x1b[<0;${at.x + 1};${at.y + 1}M`);
      await s.send(`\x1b[<0;${at.x + 1};${at.y + 1}m`);
      await s.keys("escape");
      await s.status("READ");
      // A text file: its disabled Read never lit.
      await s.restart({ startAt: "home/work/kestrel/api/requirements.txt" });
      await ready(s);
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected in a text file");
      const textBand = modeButton(s, "Source")!.style.bg;
      const disabled = await hoverOver("Read");
      await s.settle();
      s.expect(disabled() === textBand, "the disabled Read never lit");
    },
  },
  {
    area: "editing",
    name: "window header: a split on one data file, typing in one — neither header dims mid-typing; Read clicked in the other, said once",
    covers: {
      cases: ["window-header", "data", "windows"],
      commands: ["window.split_side", "view.mode_source", "view.mode_lens"],
    },
    options: at("~/work/kestrel/config/regions.yaml"),
    run: async (s) => {
      const BROKEN = "regions.yaml doesn't parse";
      await ready(s);
      await s.keys("ctrl+w", "v");
      await s.until(() => modeButton(s, "Read", 1) !== null, WAIT, "two headers, side by side");
      const enabled = modeButton(s, "Lens", 0)!.style.fg;
      // The left in source mode; the right types in the lens until the data no longer parses.
      await clickMode(s, "Source", 0);
      await s.status("SOURCE");
      await clickMode(s, "Lens", 1);
      await s.status("LENS");
      await s.keys("i");
      await s.status("INSERT");
      await s.type(":[x");
      await s.settle();
      // Mid-typing, neither header judges it: Read lit in both.
      for (const w of [0, 1])
        s.expect(modeButton(s, "Read", w)!.style.fg === enabled, `window ${w}'s Read dimmed mid-typing`);
      // The left's Read: ending the right's typing says the file doesn't parse; the click says it no more.
      await clickMode(s, "Read", 0);
      await s.message(BROKEN);
      await s.ex("messages");
      await s.see("Messages");
      const said = () => s.screen().filter((r) => r.includes(BROKEN) && /warn \d\d:\d\d:\d\d/.test(r)).length;
      s.expect(said() === 1, `said once in the messages list, not ${said()} times`);
      await s.keys("escape");
    },
  },
  {
    area: "editing",
    name: "window header: a button clicked while the explorer has the keys — the window and its note take them",
    covers: { cases: ["window-header", "explorer"], commands: ["view.mode_source"] },
    options: at("~/notes/meetings/all-hands-archive.md"),
    run: async (s) => {
      await ready(s);
      await explorerOpen(s);
      await clickMode(s, "Source");
      await s.status("SOURCE");
      await explorerOpen(s);
      await clickMode(s, "Source"); // the selected one: the keys back all the same
      await s.status("SOURCE");
    },
  },
  {
    area: "editing",
    name: "window header: [colors] breadcrumb_band still colours the row",
    covers: { cases: ["window-header", "colors"] },
    options: {
      ...at("~/notes/meetings/all-hands-archive.md"),
      config: '[colors]\nbreadcrumb_band = { bg = "#123456" }\n',
    },
    run: async (s) => {
      await ready(s);
      await s.until(() => modeButton(s, "Lens")?.style.bg === "#123456", WAIT, "the header on #123456");
    },
  },
  {
    area: "editing",
    name: "window header: a big data file opened broken, fixed in source mode — Read and Lens lit again; Read renders it",
    covers: { cases: ["window-header", "data", "large"], commands: ["view.mode_read"] },
    options: at("~/notes/meetings/all-hands-archive.md"),
    run: async (s) => {
      const body = Array.from({ length: 9000 }, (_, i) => `key${i}: "value number ${i} of a big file"`).join("\n");
      s.write("~/notes/big.yaml", `a: : [x\n${body}\n`);
      await s.restart({ startAt: "home/notes/big.yaml" });
      await ready(s);
      await s.status("SOURCE");
      await s.until(() => selectedMode(s).join() === "Source", WAIT, "Source selected: the file doesn't parse");
      const dimmed = modeButton(s, "Read")!.style.fg;
      await s.keys("g", "g", "d", "d");
      await s.until(() => modeButton(s, "Read")!.style.fg !== dimmed, WAIT, "Read lit once the broken line went");
      await clickMode(s, "Read");
      await s.status("READ");
    },
  },
];
