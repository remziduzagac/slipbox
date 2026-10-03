// The terminal tests' scenarios. Each runs on a fresh copy of the demo vault (examples/vault), in a
// real terminal. Keys go through herdr exactly as a keyboard's would, so these catch what the
// headless tests can't: key encodings, timing, the idle loop, what the screen really shows. Mouse
// clicks can't be sent through herdr; the headless tests cover them.

import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { UNSAFE } from "../../src/core/sanitize.ts";
import type { Session, SessionOptions } from "./session.ts";

export interface Scenario {
  name: string;
  options?: SessionOptions;
  /** The pane size it needs (docked panes need 90 columns); skipped in a smaller pane. */
  needs?: { cols?: number; rows?: number };
  run: (s: Session) => Promise<void>;
}

const HANDBOOK = "handbook/operations-handbook.md";
const MEETING = "meetings/2026-09-14-weekly.md";
const TOML = "software/halley/halley.toml";
/** The repository's own TypeScript 7: a real language server the scenarios can run offline (19.x). */
const TSC = join(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");

/** The cursor's line and column, from the status line (`L12:3`). */
function pos(s: Session): { line: number; col: number } {
  const m = /L(\d+):(\d+)/.exec(s.statusLine());
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: -1, col: -1 };
}

/** Keys, then wait until the cursor's line satisfies `ok`. */
async function moveTo(s: Session, keys: string[], ok: (line: number, col: number) => boolean, what: string): Promise<void> {
  await s.keys(...keys);
  await s.until(() => {
    const p = pos(s);
    return ok(p.line, p.col);
  }, 3000, what);
}

/** Open a note with the quick switcher. */
async function open(s: Session, name: string): Promise<void> {
  await s.keys("ctrl+p");
  await s.see(/Open (note|\()/); // "Open (n notes, m files)" when the vault has files
  await s.type(name);
  await s.keys("enter");
  await s.status(name);
}

/** Leader sequences: space, then the keys. */
const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);

/** Select the explorer's row named `name` (it has focus, the row on screen): from the top, down to it. */
async function explorerRow(s: Session, name: string): Promise<void> {
  await s.keys("g", "g");
  // Its rows: left of its border (in code points: the Nerd glyphs are two units), past the left rail.
  const title = s.rowOf(/Explorer/);
  const border = [...s.screen()[title]!].findIndex((c) => c === "│" || c === "┃");
  const left = (r: string) => [...r].slice(3, border).join("");
  const first = s.screen().findIndex((r, i) => i > title && /\S/.test(left(r)));
  const at = s.screen().findIndex((r, i) => i >= first && new RegExp(`\\b${name}\\b`).test(left(r)));
  s.expect(at >= first, `the explorer shows ${name}`);
  for (let i = first; i < at; i++) await s.keys("j");
}

export const SCENARIOS: Scenario[] = [
  // --- start and quit -------------------------------------------------------------------------
  {
    name: "start: home renders; ctrl+q quits cleanly",
    run: async (s) => {
      await s.see("Halden Ridge Observatory");
      await s.status("home.md");
      await s.status(/READ/);
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "slipbox to quit");
    },
  },

  // --- rendering, as the terminal draws it -------------------------------------------------------
  {
    name: "render: wide tables fit, code blocks, names in their own scripts",
    run: async (s) => {
      await open(s, "telescope-comparison");
      await s.see("┌");
      await s.see("╞");
      // Every table row closes with its right border: nothing ran past the window and got cut.
      const table = s.screen().filter((r) => r.includes("│ ") && (r.match(/│/g) ?? []).length >= 3);
      s.expect(table.length > 0 && table.every((r) => /│\s*(▐|$)/.test(r.trimEnd())), "a table row without its right border");
      await open(s, "pipeline-cookbook");
      await s.see("properties"); // the frontmatter, rendered
      await s.see(/bash|python/);
      await open(s, "partners-and-names");
      await s.see("following it offers to make it"); // visiting-rota.md exists nowhere: a note not written yet
      // Its table of scripts, below the notes it embeds now (1.11).
      await s.keys(":");
      await s.type("74");
      await s.keys("enter");
      await s.see("木曽原天文同好会");
      await s.see("يوسف حداد");
      await s.see("🔭");
    },
  },

  {
    name: "hostile names: a bidi override, C1 and an OSC in a file name never reach the terminal",
    needs: { cols: 100 },
    options: {
      files: { "n-\u202etxt.cod\u202c-\u009b31m-\x1b]0;PWNED\x07.md": "# Hostile\u202e heading\n\n[[home]]\n" },
    },
    run: async (s) => {
      const clean = () => {
        const t = s.text();
        s.expect(!UNSAFE.test(t.replace(/\n/g, "")) && !t.includes("PWNED"), "a control character or an OSC's text on screen");
      };
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.see("n-");
      clean();
      await s.keys("escape");
      await s.keys("ctrl+p"); // the switcher lists it by name
      await s.see(/Open (note|\()/); // "Open (n notes, m files)" when the vault has files
      await s.type("n-");
      await s.see(/n-.*cod/);
      clean();
      await s.keys("enter");
      await s.see("heading");
      clean();
      await open(s, "home");
      await s.ex("backlinks.open"); // it links to home, so it is in home's list, by name
      await s.see(/n-.*cod/);
      clean();
    },
  },

  {
    name: "render: a big note parses on other threads, then is drawn; its end, its width changed (15.1)",
    options: {
      open: "big.md",
      files: {
        // 16,000 lines, 700 KB: past the 128 KB that sends a parse to the workers.
        "big.md": Array.from({ length: 8000 }, (_, i) => (i % 40 === 0 ? `## Part ${i}\n` : `Line ${i} of the big note, with [[home]] and enough words to fill a row or so.\n`)).join("\n"),
      },
    },
    run: async (s) => {
      await s.see("Part 0", 10_000);
      await s.see("Line 1 of the big note");
      await s.keys("shift+g");
      await s.see("Line 7999 of the big note");
      await s.status("L15999"); // the last line with text
      // The explorer toggled: the whole note re-wrapped at another width, still at its end.
      await leader(s, "e");
      await s.see("Line 7999 of the big note");
    },
  },

  {
    name: "render: embeds drawn in place — a whole note, a heading's section — their links followed from where they are",
    run: async (s) => {
      await open(s, "partners-and-names");
      await s.see("Table A — ordinary prose, no long tokens."); // wrap-probe's text, embedded
      await s.see("Visiting astronomer from the Kiso-Hara"); // kenji-mori's section, embedded
      await s.see(/▎ .*Kenji Mori/);
    },
  },

  {
    name: "convert-links: every note's links made plain paths after a preview, an ambiguous one picked; embeds still drawn, a block followed, undone",
    // A note written before plain paths: wikilinks, which slipbox reads as text now (20.2), and the
    // converter reads as they were — `[[contacts]]` two notes answer to.
    options: {
      files: {
        "old-note.md": "# Old note\n\nSee [[about-this-vault]] and [[contacts]]; the first thread is [[variable-star-survey^thread-one]].\n\n![[wrap-probe]]\n",
      },
    },
    run: async (s) => {
      // Read now, its wikilinks are text.
      await open(s, "old-note");
      await s.see("See [[about-this-vault]] and [[contacts]]");
      await s.ex("convert-links");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/, 10000);
      await s.see("pick old-note.md:3");
      // The ambiguous [[contacts]], first in the list: its notes, one picked; the preview again, with it.
      await s.keys("enter");
      await s.see("[[contacts]] in old-note.md:3 — which note?");
      await s.keys("down", "enter");
      await s.see(/links → plain paths: \d+ changes? in \d+ files?/);
      await s.notSee("pick old-note.md:3");
      await s.keys("enter");
      await s.message(/converted links to plain paths: \d+ changes/); // short: the box wraps the rest
      await s.file("old-note.md", (t) => t.includes("[contacts](people/contacts.md)") && t.includes("[about-this-vault](about-this-vault.md)"), "converted");
      // The embed, a path now, still drawn in place.
      await s.see("Table A — ordinary prose, no long tokens."); // wrap-probe's text, embedded
      // The block link, a path now, followed: at the paragraph its ^id closes.
      await s.keys("ctrl+f");
      await s.type("thread-one");
      await s.keys("enter", "escape", "enter");
      await s.status("variable-star-survey.md");
      await s.status(/L3[123]:/); // in the paragraph its ^id closes (lines 31–33), not the heading after
      // Undone: the note as it was.
      await s.ex("undo-rename");
      await s.see(/undo: links → plain paths/);
      await s.keys("enter");
      await s.message(/undid the conversion to plain paths/);
      await s.file("old-note.md", (t) => t.includes("[[contacts]]") && t.includes("![[wrap-probe]]"), "as it was");
    },
  },

  // --- reading: every motion ------------------------------------------------------------------
  {
    name: "motions: j k h l, words, row ends, top and bottom, headings, paragraphs, pages",
    options: { open: HANDBOOK },
    run: async (s) => {
      await moveTo(s, ["j", "j", "j", "j", "j", "j"], (l) => l > 3, "j to move down");
      const down = pos(s).line;
      await moveTo(s, ["k", "k", "k"], (l) => l < down, "k to move up");
      await s.keys("g", "g", "]", "]", "j", "j"); // a body row, with words on it
      // Each key must move the right way from where the cursor was (strictly: not a check that
      // passes when nothing happened).
      const col = () => pos(s).col;
      await moveTo(s, ["l", "l", "l"], (_, c) => c === 4, "l to move right three");
      await moveTo(s, ["h"], (_, c) => c === 3, "h to move left one");
      await moveTo(s, ["0"], (_, c) => c === 1, "0 to go to the row start");
      await moveTo(s, ["w"], (_, c) => c > 1, "w to the next word");
      const w1 = col();
      await moveTo(s, ["e"], (_, c) => c > w1, "e to that word's end");
      const e1 = col();
      await moveTo(s, ["b"], (_, c) => c < e1, "b back a word");
      await moveTo(s, ["$"], (_, c) => c > 5, "$ to the row end");
      await moveTo(s, ["^"], (_, c) => c === 1, "^ back to the first non-blank");
      await moveTo(s, ["G"], (l) => l > 1100, "G to the bottom");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg to the top");
      await moveTo(s, ["]", "]"], (l) => l >= 6, "]] to the next heading");
      const h = pos(s).line;
      await moveTo(s, ["]", "]"], (l) => l > h, "]] again");
      await moveTo(s, ["[", "["], (l) => l === h, "[[ back a heading");
      await moveTo(s, ["}", "}"], (l) => l > h, "} to the next paragraph");
      const p = pos(s).line;
      await moveTo(s, ["{"], (l) => l < p, "{ back a paragraph");
      await moveTo(s, ["ctrl+d"], (l) => l > p, "ctrl+d half a page down");
      const d = pos(s).line;
      await moveTo(s, ["ctrl+u"], (l) => l < d, "ctrl+u half a page up");
      await moveTo(s, ["pagedown"], (l) => l > d, "pagedown");
      const pd = pos(s).line;
      await moveTo(s, ["pageup"], (l) => l < pd, "pageup");
      await moveTo(s, ["ctrl+end"], (l) => l > 1100, "ctrl+end");
      await moveTo(s, ["ctrl+home"], (l) => l === 1, "ctrl+home");
      await moveTo(s, ["alt+down"], (l) => l > 1, "alt+down: next heading");
    },
  },
  {
    name: "motions: f t ; , on the line",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("]", "]", "j", "j", "0"); // onto the O1 decision line
      await s.until(() => pos(s).line > 6, 3000, "a body line");
      await moveTo(s, ["f", "e"], (_, c) => c > 1, "fe to an e");
      const c1 = pos(s).col;
      await moveTo(s, [";"], (_, c) => c > c1, "; to the next e");
      const c2 = pos(s).col;
      await moveTo(s, [","], (_, c) => c < c2, ", back to the previous e");
      const before = pos(s).col;
      await moveTo(s, ["t", "s"], (_, c) => c > before, "ts to just before the next s");
    },
  },

  // --- visual and copy ------------------------------------------------------------------------
  {
    name: "visual: v and V select, o swaps ends, y copies, esc leaves",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("]", "]", "j", "j");
      await s.keys("v");
      await s.status("VISUAL");
      await s.keys("l", "l", "l", "o");
      await s.keys("y");
      await s.message(/copied 4 characters/);
      await s.until(() => [...s.clipboard()].length === 4, 3000, "v l l l y to copy four characters");
      await s.keys("V");
      await s.status("V-LINE");
      await s.keys("j", "ctrl+c");
      await s.until(() => s.clipboard().split("\n").length === 2, 3000, "V j ctrl+c to copy two whole rows");
      await s.keys("v", "l");
      await s.status("VISUAL");
      await s.keys("escape");
      await s.status("READ");
    },
  },
  {
    name: "copy: yy the row, yp the path, yr a reference, yl a link",
    options: { open: HANDBOOK },
    run: async (s) => {
      // What each copied, read back from the clipboard file (SLIPBOX_CLIPBOARD=file).
      const copied = async (keys: string[], ok: (text: string) => boolean, what: string) => {
        await s.keys(...keys);
        await s.until(() => ok(s.clipboard()), 3000, what);
      };
      await s.keys("]", "]", "j", "j");
      await copied(["y", "p"], (t) => t.endsWith("handbook/operations-handbook.md"), "yp to copy the note's path");
      await copied(["y", "r"], (t) => /^handbook\/operations-handbook\.md:\d+$/.test(t), "yr to copy path:line");
      await copied(["y", "y"], (t) => t.includes("Decision"), "yy to copy the row");
      await s.keys("g", "g");
      await leader(s, "l", "n"); // onto a link (the handbook has one)
      await copied(["y", "l"], (t) => t.includes("example.org"), "yl to copy the link's target");
    },
  },

  // --- links and history ----------------------------------------------------------------------
  {
    name: "links: next / previous, follow, back and forward, the lists, a split",
    run: async (s) => {
      await s.keys("tab");
      await s.keys("tab");
      await s.keys("shift+tab");
      await s.keys("enter");
      await s.status("about-this-vault.md");
      await s.keys("ctrl+o"); // back
      await s.status("home.md");
      await s.keys("alt+right"); // forward
      await s.status("about-this-vault.md");
      await leader(s, "h", "p");
      await s.status("home.md");
      await leader(s, "h", "n");
      await s.status("about-this-vault.md");
      await leader(s, "h", "h");
      await s.see("History");
      await s.keys("escape");
      await s.keys("alt+left"); // back, VS Code's way
      await s.status("home.md");
      await leader(s, "l", "l");
      await s.see("Links from");
      await s.keys("escape");
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.keys("escape");
      // The link under the cursor, as the status line names it.
      const link = () => /→ (\S+)/.exec(s.statusLine())?.[1] ?? "";
      await s.until(() => link() !== "", 3000, "the cursor on a link");
      const first = link();
      await leader(s, "l", "n");
      await s.until(() => link() !== "" && link() !== first, 3000, "space l n onto the next link");
      await leader(s, "l", "p");
      await s.until(() => link() === first, 3000, "space l p back onto the first");
      await leader(s, "l", "f");
      await s.status("about-this-vault.md");
      await s.keys("ctrl+o");
      await s.keys("tab");
      await leader(s, "l", "s"); // follow in a split
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "the link open in a split");
    },
  },

  // --- windows --------------------------------------------------------------------------------
  {
    name: "windows: split, turn, focus, move, swap, resize, resize mode, close, only",
    needs: { cols: 90, rows: 24 },
    run: async (s) => {
      const crumbs = () => s.text().split("§ ").length - 1; // one breadcrumb a window
      // A tab holds one window, or two in a split: side by side, or stacked (ctrl+w s turns it).
      const sameRow = () => s.screen().some((r) => r.split("§ ").length - 1 === 2);
      await s.keys("ctrl+w", "v");
      await s.until(() => crumbs() === 2 && sameRow(), 3000, "two windows side by side");
      await s.keys("ctrl+w", "s");
      await s.until(() => crumbs() === 2 && !sameRow(), 3000, "the split turned stacked");
      for (const k of ["h", "l", "k", "j", "w"]) await s.keys("ctrl+w", k);
      // Moving a window to an edge turns the split: H and L side by side, K and J stacked.
      for (const [k, side] of [["H", true], ["K", false], ["L", true], ["J", false]] as const) {
        await s.keys("ctrl+w");
        await s.type(k);
        await s.until(() => sameRow() === side, 3000, `ctrl+w ${k}: ${side ? "side by side" : "stacked"}`);
      }
      // Swap: the two windows trade notes (one shows another note first).
      await open(s, "writing-guide");
      // The windows' notes in screen order, from their breadcrumbs (not the status line's path).
      // (Below the tab bar and right of the explorer's border: both name files too.)
      // By code point, not string index: Nerd glyphs outside the BMP (the explorer's buttons, its
      // icons) take two UTF-16 units for one column.
      const border = () => Math.max(0, [...(s.screen()[2] ?? "")].findIndex((ch) => ch === "│" || ch === "┃"));
      const order = () => (s.screen().slice(3, -1).map((r) => [...r].slice(border() + 1).join("")).join("\n").match(/\b(home|writing-guide)\.md\b/g) ?? []).join(" ");
      await s.until(() => order().split(" ").length === 2, 3000, "two windows, two notes");
      const before = order();
      await s.keys("ctrl+w", "x");
      await s.until(() => order() === before.split(" ").reverse().join(" "), 3000, "ctrl+w x to swap the windows");
      // Focus: the status line names the focused window's note. Stacked now: k is the top one.
      const focused = () => /\b(home|writing-guide)\.md\b/.exec(s.statusLine())?.[1] ?? "";
      const [topNote, bottomNote] = order().split(" ").map((n) => n.replace(/\.md$/, ""));
      await s.keys("ctrl+w", "k");
      await s.until(() => focused() === topNote, 3000, "ctrl+w k to the top window");
      await s.keys("ctrl+w", "j");
      await s.until(() => focused() === bottomNote, 3000, "ctrl+w j to the bottom window");
      await s.keys("ctrl+w", "w");
      await s.until(() => focused() === topNote, 3000, "ctrl+w w to the other window");
      // Resize, one step at a time: where the lower window's breadcrumb sits moves, = evens it.
      const split = () => s.screen().slice(0, -1).findLastIndex((r) => /\b(home|writing-guide)\.md\b/.test(r));
      const even = split();
      const step = async (k: string) => {
        await s.keys("ctrl+w");
        await s.type(k);
        await s.keys("escape"); // one step, then the mode it leaves on
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
      const bothRow = () => s.screen().find((r) => (r.match(/\b(home|writing-guide)\.md\b/g) ?? []).length === 2);
      await s.keys("ctrl+w");
      await s.type("H");
      await s.until(() => bothRow() !== undefined, 3000, "side by side again");
      const col = () => (bothRow() ?? "").lastIndexOf(".md");
      const mid = col();
      await step(">");
      await s.until(() => col() !== mid, 3000, "ctrl+w > to change the widths");
      await step("=");
      await s.until(() => col() === mid, 3000, "ctrl+w = to even the widths");
      await step("<");
      await s.until(() => col() !== mid, 3000, "ctrl+w < to change the widths");
      await step("=");
      await leader(s, "w", "r");
      await s.status("RESIZE");
      await s.keys("l");
      await s.until(() => col() !== mid, 3000, "l in resize mode to change the widths");
      await s.keys("escape");
      await s.status("READ");
      await s.keys("ctrl+w", "q");
      await s.until(() => crumbs() === 1, 3000, "a window closed");
      await s.keys("ctrl+w", "v", "ctrl+w", "o");
      await s.until(() => crumbs() === 1, 3000, "only one window");
    },
  },

  // --- tabs -----------------------------------------------------------------------------------
  {
    name: "tabs: new, list, next and previous, go to, move, close",
    needs: { cols: 60 },
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
      // The history: this window's timeline, and the handbook read in the other tab, under recent.
      await leader(s, "h", "h");
      await s.see("recent in this vault");
      await s.see("operations-handbook.md");
      await s.keys("escape");
      await s.keys("ctrl+t");
      await s.type("L");
      await s.see(/1 operations/); // home moved right, past the handbook
      await s.keys("ctrl+t");
      await s.type("H");
      await s.see(/1 home/);
      await s.keys("ctrl+t", "q");
      await s.notSee(/2 home|2 operations/);
      // Close the others, then all: the empty page, the explorer ready.
      await leader(s, "t", "c");
      await leader(s, "t", "c");
      await s.see(/3 \S/);
      await s.keys("ctrl+t", "o");
      await s.message(/closed 2 other tabs/);
      await s.notSee(/2 \S+\.md/);
      await s.keys("ctrl+t");
      await s.type("Q");
      await s.see("No note open");
      await s.status("FILES");
    },
  },

  {
    name: "pinned tabs, save all, the change list, moving lines, the word count",
    options: { files: { "m.md": "alpha\nbravo\ncharlie\n" }, open: "m.md" },
    run: async (s) => {
      await s.status(/3 words/);
      // Pinned: a link from it opens a new tab; close all keeps it.
      await s.keys("ctrl+t", "m");
      await s.see(/1 \S+ m\.md/);
      await leader(s, "t", "c");
      await s.see(/2 m\.md/);
      await s.keys("ctrl+t");
      await s.type("Q");
      await s.notSee(/2 m\.md/);
      await s.see(/1 \S+ m\.md/);
      // Move a line down, change it, walk back to it with g;, save all.
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("g", "g", "alt+shift+down");
      await s.until(() => s.rowOf(/│ bravo/) >= 0 && s.rowOf(/│ bravo/) < s.rowOf(/│ alpha/), 3000, "alpha moved below bravo");
      await s.keys("G", "A");
      await s.type("!");
      await s.keys("escape", "g", "g");
      await s.keys("g");
      await s.type(";");
      await moveTo(s, [], (l) => l === 3, "g; to the newest change");
      await s.keys("g");
      await s.type(",");
      await s.message(/newest change/);
      // Up and back down again (the file ends as it was); gi, left without typing.
      await moveTo(s, ["alt+shift+up"], (l) => l === 2, "alt+shift+up");
      await moveTo(s, ["alt+shift+down"], (l) => l === 3, "alt+shift+down");
      await s.keys("g", "g", "g", "i");
      await s.status("INSERT");
      await s.keys("escape");
      await s.ex("wa");
      await s.file("m.md", (t) => t === "bravo\nalpha\ncharlie!\n", "the moved line and the change saved");
    },
  },

  {
    name: "vim's keys and the desktop's: H M L, zz zt zb, ctrl+g and :42, vault search, q and :q, ctrl+z ctrl+y",
    options: { open: HANDBOOK },
    run: async (s) => {
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "ctrl+g 300 to line 300");
      await s.keys(":");
      await s.type("120");
      await moveTo(s, ["enter"], (l) => l === 120, ":120 to line 120");
      await s.keys("shift+h");
      const top = pos(s).line;
      await s.keys("shift+l");
      await s.until(() => pos(s).line > top, 3000, "L below H");
      await s.keys("shift+m");
      await s.until(() => pos(s).line > top, 3000, "M between");
      const here = pos(s).line;
      await s.keys("z", "t");
      await s.until(() => s.screen().slice(2, 8).some((r) => r.includes("│") || r.trim().length > 0), 3000, "zt scrolled");
      await s.keys("z", "b", "z", "z");
      s.expect(pos(s).line === here, "zz, zt, zb move the view, never the cursor");
      // Find, then N from the bottom: backward, always.
      await s.keys("/");
      await s.type("Weather");
      await s.keys("enter", "shift+g", "shift+n");
      await s.until(() => pos(s).line < 1200 && pos(s).line > 1, 3000, "N found a match above");
      // Vault search, then open the match.
      await s.keys("space", "f", "g");
      await s.type("Tomasz: book the courier");
      await s.keys("enter");
      await s.see(/match(es)? in 1 file/);
      await s.keys("enter");
      await s.status("2026-09-14-weekly.md");
      // ctrl+z / ctrl+y in source mode.
      await s.keys("ctrl+e");
      await s.status("SOURCE");
      await s.keys("A");
      await s.type(" (undo me)");
      await s.keys("escape", "ctrl+z");
      await s.notSee("(undo me)");
      await s.keys("ctrl+y");
      await s.see("(undo me)");
      await s.keys("ctrl+z", "ctrl+e");
      // q closes the split, :q the last window quits.
      await s.keys("ctrl+w", "v");
      await s.until(() => s.text().split("§ ").length - 1 === 2, 3000, "two windows");
      await s.keys("q");
      await s.until(() => s.text().split("§ ").length - 1 === 1, 3000, "q closed one");
      await s.keys("q");
      await s.message(/ctrl\+q/);
      await s.ex("q");
      await s.until(() => s.exited(), 5000, ":q on the last window quits");
    },
  },

  {
    name: "create: ctrl+n a note, typed and saved; the explorer's N a folder and n a note in it",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("ctrl+n");
      await s.see("new note in handbook/");
      await s.type("checklist");
      await s.keys("enter");
      await s.status("INSERT");
      await s.type("First item");
      await s.keys("escape", "ctrl+s");
      await s.file("handbook/checklist.md", (t) => t === "# checklist\n\nFirst item\n", "the new note saved");
      // In the explorer: a folder, then a note in it.
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.keys("shift+n");
      await s.see("new folder in");
      await s.type("ideas");
      await s.keys("enter");
      await s.see("ideas");
      await s.keys("n");
      await s.type("spark");
      await s.keys("enter");
      await s.status("ideas/spark.md");
      s.expect(s.exists("handbook/ideas/spark.md") || s.exists("ideas/spark.md"), "the note made in the new folder");
      await s.keys("escape"); // the new note opened typing
      await s.ex("mkdir /archive/2026");
      await s.until(() => s.exists("archive/2026"), 3000, ":mkdir from the vault's root");
    },
  },

  // --- panes ----------------------------------------------------------------------------------
  {
    name: "explorer files: r renames, m moves, d deletes and u restores, y p copies — links fixed",
    options: { open: "people/contacts.md" },
    run: async (s) => {
      // The explorer on contacts.md (space E reveals it).
      await leader(s, "E");
      await s.status("FILES");
      // The row's menu (its … button; . by key): the entries with their keys; r there renames.
      await s.keys(".");
      await s.see(/Move to… +m/);
      await s.see(/Delete +d/);
      await s.keys("r");
      await s.see("rename people/contacts.md to:"); // a question in its own window
      await s.see("OK  enter");
      await s.keys("ctrl+u");
      await s.type("people-contacts");
      await s.keys("enter");
      await s.see(/people\/contacts\.md → people\/people-contacts\.md: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("renamed people/contacts.md");
      s.expect(s.exists("people/people-contacts.md") && !s.exists("people/contacts.md"), "renamed on disk");
      // m: to the handbook folder.
      await s.keys("m");
      await s.see("Move people/people-contacts.md to…");
      await s.type("handbook");
      await s.keys("enter");
      await s.see(/→ handbook\/people-contacts\.md/);
      await s.keys("enter");
      await s.file("handbook/people-contacts.md", (t) => t.length > 0, "moved to the handbook");
      // d, then u.
      await s.keys("d");
      await s.see(/Delete handbook\/people-contacts\.md\?/); // a question in its own window: y answers
      await s.see("Yes  y");
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts.md"), "gone from the vault");
      await s.keys("u");
      await s.message("restored handbook/");
      s.expect(s.exists("handbook/people-contacts.md"), "back");
      // y p: a copy beside it.
      await s.keys("y", "p");
      await s.message("copied handbook/");
      s.expect(s.exists("handbook/people-contacts-copy.md"), "the copy made");
      // The trash is listed, empty now.
      await leader(s, "v", "t");
      await s.message("the trash is empty");
      // The current note: duplicated (the palette), opened; then that copy deleted (space n d).
      await s.keys("escape");
      await s.keys(":");
      await s.type("Duplicate the note");
      await s.keys("enter");
      await s.status("people-contacts-copy-2.md");
      await leader(s, "n", "d");
      await s.see(/Delete handbook\/people-contacts-copy-2\.md\?/);
      await s.type("y");
      await s.message("deleted handbook/");
      s.expect(!s.exists("handbook/people-contacts-copy-2.md"), "the copy deleted");
    },
  },
  {
    name: "footnotes: the right panel's second view — space n f, its superscript button under ▤; unfold, jump to a reference",
    run: async (s) => {
      await open(s, "partners-and-names");
      await leader(s, "n", "f");
      await s.status("FOOTNOTES");
      await s.see("Footnotes");
      await s.see(/\[1\] Counted at the/);
      await s.see(/\[charter\]/);
      await s.until(() => s.screen().some((r) => /▤\s*$/.test(r)) && s.screen().some((r) => /(\u{f0283}|¹|\^)\s*$/u.test(r)), 3000, "the rail's ▤ and † under it");
      await s.keys("l");
      await s.see("L95");
      await s.keys("j", "enter");
      await s.status("→ 1 (resolved)");
      // Adding one (3.18): its text asked; [^2] after the cursor's word, its definition at the end.
      await leader(s, "n", "shift+f");
      await s.see("Add a footnote — its text:");
      await s.type("Checked against the ledger");
      await s.keys("enter");
      await s.message("added footnote [^2]");
      await s.file("people/partners-and-names.md", (t) => t.includes("[^2]: Checked against the ledger\n"), "the definition at the end");
      await s.see(/\[2\] C/); // the row, beside the message floating over the panel
      // Back to the outline with space o: the panel's other view; :footnotes toggles them back.
      await leader(s, "o");
      await s.status("OUTLINE");
      await s.keys(":");
      await s.type("footnotes");
      await s.keys("enter");
      await s.status("FOOTNOTES");
    },
  },
  {
    name: "problems: space v p lists the vault's broken links by note; enter goes onto one",
    run: async (s) => {
      await leader(s, "v", "p");
      await s.status("FILES");
      await s.see(/Broken links \(\d+\)/);
      await s.see(/L16 +visiting-rota\.md/);
      await s.see(/Orphans \(\d+\)/);
      await s.see(/scratch\/broken-front/);
      // Filtered to the rota: partners-and-names's row, over its link to a note not written yet; enter opens it
      // there, on the link.
      await s.keys("/");
      await s.type("visiting-rota");
      await s.keys("enter");
      await s.status("partners-and-names.md");
      await s.status("→ visiting-rota.md (unresolved)");
    },
  },
  {
    name: "lint: a stand-in linter's finding on the status line and in Problems; enter goes to its line",
    // markdownlint-cli2's output, from sh: one finding, on home.md's line 3.
    options: {
      config: `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */home.md) printf '%s:3:6 error MD013/line-length Line length [Expected: 80]\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
    },
    run: async (s) => {
      await s.status("⚠ 1", 6000); // how many of each severity (19.8); the linter runs once the note opens
      // The problems bar (19.9) and the marks (19.10), each toggled off and back.
      await leader(s, "u", "d");
      await s.message("Problems bar: off");
      await leader(s, "u", "d");
      await leader(s, "u", "shift+d");
      await s.message("Problems marked in the text: off");
      await leader(s, "u", "shift+d");
      await leader(s, "v", "p");
      await s.see(/Lint \(1\)/);
      await s.see(/L3 +MD013 line-len/); // cut to the panel
      await s.keys("/");
      await s.type("MD013");
      await s.keys("enter");
      await s.status("L3:1"); // rendered: the line's start
      await s.status("⚠ MD013 line-length: Line length [Expected: 80]");
    },
  },
  {
    name: "language servers: a TypeScript file's errors from TypeScript's own server, in the bar and the status line",
    options: { config: `[lsp]\nenabled = true\n\n[language-server.typescript]\ncommand = ${JSON.stringify(TSC)}\n` },
    run: async (s) => {
      s.write("scratch/tool.ts", 'const n: number = "x";\nexport const m = n;\n');
      await s.ex("e scratch/tool.ts");
      await s.status("tool.ts");
      // The error under the cursor, from the server; the bar beside its line.
      await s.status(/✖ 2322 Type 'string' is not assignable to type 'number'/, 15000);
      await s.see(/│ ?1 +const n: number/);
      // What's under the cursor (19.12, 19.13): n's type, floating; from its use, its declaration; its uses.
      await s.keys("w");
      await s.keys("shift+k");
      await s.see("const n: number", 10000);
      await s.keys("escape");
      await s.keys("j", "$", "h"); // on the n of `= n;`
      await s.keys("g", "d");
      await s.status(/L1:7\b/, 10000);
      await s.keys("g", "r");
      await s.see(/tool\.ts:2 +export const m = n;/, 10000);
      await s.keys("escape");
      // Renamed by the server (19.15): n → count, both lines, after a preview.
      await leader(s, "c", "r");
      await s.see("rename n to:", 10000);
      await s.keys("ctrl+u");
      await s.type("count");
      await s.keys("enter");
      await s.see("rename n → count: 2 changes in 1 file", 10000);
      await s.keys("enter");
      await s.see("export const m = count;");
      // Its code actions for the line, and its formatting: each says what it did.
      await leader(s, "c", "a");
      await s.until(() => /Code actions|no code actions here/.test(s.screen().join("\n")), 10000, "the code actions, or none");
      await s.keys("escape");
      await leader(s, "c", "f");
      await s.until(() => /formatted|doesn't format/.test(s.screen().join("\n")), 10000, "formatted, or said it can't");
      await s.keys("u"); // whatever it formatted, taken back
      await s.keys("g", "g");
      // Fixed and typed in: gone once it's said so again.
      await s.keys("f", "\"", "d", "a", "\"", "i");
      await s.type("1");
      await s.keys("escape");
      await s.until(() => !s.statusLine().includes("✖"), 10000, "the error gone with the fix");
      // Completion as it's typed (19.16): Math's members after `.`, narrowed by what follows, one put in; then
      // the signature being typed, after `(`.
      await s.keys("shift+g", "o");
      await s.type("Math.rou");
      await s.see("round", 10000);
      await s.keys("enter");
      await s.see("Math.round");
      await s.type("(");
      await s.see(/round\(x: number\): number/, 10000);
      await s.keys("escape");
      await s.see("Math.round(");
    },
  },
  {
    name: "tags: space f t lists them with counts, a tag its notes; a #tag in the text followed",
    run: async (s) => {
      await leader(s, "f", "t");
      await s.see(/Tags \(\d+\)/);
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
  {
    name: "panes: the explorer, reveal, the outline, the heading picker, the path dropdown",
    needs: { cols: 100 },
    options: { open: HANDBOOK },
    run: async (s) => {
      // space e cycles: open, focus, close. It may start open (a wide pane), so press to focus.
      const focus = async (key: string, chip: string) => {
        for (let i = 0; i < 3 && !s.statusLine().includes(chip); i++) await leader(s, key);
        await s.status(chip);
      };
      await focus("e", "FILES");
      await s.see("Explorer");
      await s.keys("escape");
      await leader(s, "shift+e");
      await s.status("FILES");
      // Revealed: the note's own row in the explorer, left of the border (its name cut where the
      // selected row's buttons sit).
      await s.until(() => s.screen().some((r) => /operations-han\S*…?.*[│┃]/.test(r) && !/╞|├─/.test(r.slice(r.search(/[│┃]/)))), 3000, "the note revealed in the explorer");
      await s.keys("escape");
      await focus("o", "OUTLINE");
      await s.see("Outline");
      await s.keys("escape");
      await leader(s, "f", "o");
      await s.see("Headings —");
      await s.type("O25");
      await s.keys("enter");
      await s.see("Documentation categories");
      await s.keys("j", "j", "j");
      await leader(s, "f", "b");
      await s.see("Path");
      await s.keys("escape");
      await s.keys(":");
      await s.type("Show or hide the outline");
      await s.keys("enter");
    },
  },

  // --- find and replace -----------------------------------------------------------------------
  {
    name: "find: / n N * #, :noh; the find row",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("/");
      await s.type("Aster");
      await s.see(/› Aster/);
      await s.see(/\d+\/\d+/);
      await s.keys("enter");
      const l1 = pos(s).line;
      await moveTo(s, ["n"], (l) => l !== l1, "n to the next match");
      await moveTo(s, ["N"], (l) => l === l1, "N back");
      // On an "Aster" (the match): * to the next whole-word Aster, # back to this one.
      const start = pos(s);
      await moveTo(s, ["*"], (l, c) => l !== start.line || c !== start.col, "* to the word's next occurrence");
      await s.see(/[│┃] › \S/); // the word is the query now
      await moveTo(s, ["#"], (l, c) => l === start.line && c === start.col, "# back to it");
      await s.ex("noh");
      await s.notSee(/[│┃] › /); // the find row (the breadcrumb has › too, never after a border)
    },
  },
  {
    name: "replace: ctrl+h, tab, enter one, alt+a all, alt+h, :%s with c",
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
      await s.ex("%s/Corvid/CORVID/gc");
      await s.see("replace? y n a q");
      await s.keys("y", "n", "q");
      await s.message("1 substitution");
      await leader(s, "f", "r");
      await s.see("⇄");
      await s.keys("escape");
    },
  },

  {
    name: "search: space f s ranks the vault's notes as you type, the words marked; enter opens at the match",
    run: async (s) => {
      await leader(s, "f", "s");
      await s.see("search the vault — words");
      await s.type("dome shutter");
      await s.see(/"dome shutter" — \d+ files/, 5000);
      await s.see("projects/dome-refit.md:");
      await s.keys("enter");
      await s.status("dome-refit.md");
      // :search takes the words; a phrase, a tag.
      await s.keys(":");
      await s.type('search "variable star" #survey');
      await s.keys("enter");
      await s.see("projects/variable-star-survey.md:");
      await s.keys("escape");
    },
  },

  // --- editing --------------------------------------------------------------------------------
  {
    name: "source mode: i a I A o O type; esc; u, ctrl+r, U; ctrl+s writes",
    options: { open: MEETING },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("i");
      await s.status("INSERT");
      await s.type("[i]");
      await s.keys("escape");
      await s.keys("a");
      await s.type("[a]");
      await s.keys("escape", "I");
      await s.type("[I]");
      await s.keys("escape", "A");
      await s.type("[A]");
      await s.keys("escape", "o");
      await s.type("[o]");
      await s.keys("escape", "O");
      await s.type("[O]");
      await s.keys("escape");
      await s.status("• unsaved");
      await s.keys("ctrl+s");
      await s.file(MEETING, (t) => ["[i]", "[a]", "[I]", "[A]", "[o]", "[O]"].every((x) => t.includes(x)), "all six inserts saved");
      // u takes the last insert away, ctrl+r and U bring it back: each seen on the screen.
      await s.keys("u");
      await s.notSee("[O]");
      await s.keys("ctrl+r");
      await s.see("[O]");
      await s.keys("u");
      await s.notSee("[O]");
      await s.keys("U");
      await s.see("[O]");
      await s.ex("w");
      await s.file(MEETING, (t) => t.includes("[O]"), "the redone insert saved");
    },
  },
  {
    name: "normal mode: x d c y > < D C s S r J p P ~ . and visual d c > <",
    options: { open: MEETING },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("alpha beta gamma delta");
      await s.keys("escape", "0", "x"); // lpha
      await s.keys("d", "w"); // beta…
      await s.keys("c", "w");
      await s.type("BETA");
      await s.keys("escape", "y", "y", "p", "P");
      await s.keys(">", ">", "<", "<");
      await s.keys("w", "D");
      await s.keys("0", "w", "C");
      await s.type("end");
      await s.keys("escape", "0", "s");
      await s.type("S");
      await s.keys("escape", "S");
      await s.type("whole line");
      await s.keys("escape", "0", "r", "W", "~", "J", ".");
      await s.keys("V", "j", ">", "V", "<", "V", "d");
      await s.keys("v", "l", "c");
      await s.type("X");
      await s.keys("escape");
      await s.keys("ctrl+s");
      // The exact text the same keys give headlessly (tests/tui.test.ts's harness): the terminal's
      // key encoding changed nothing on the way.
      await s.file(MEETING, (t) => t.endsWith("for the nights we did get.\nBETA gamma delta\nXTA \n"), "the exact result of those keys");
    },
  },
  {
    name: "vim grammar: counts, F, text objects (iW, vi(), *, cgn and ., insert's ctrl+w and ctrl+u",
    options: { open: "edit-probe.md", files: { "edit-probe.md": "alpha beta gamma\na.b c\nf(ab) x\none two one two\n" } },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("g", "g", "2", "w", "F", "b", "x"); // alpha eta gamma
      await s.keys("j", "0", "d", "i", "W"); // " c"
      await s.keys("j", "f", "a", "v", "i");
      await s.type("(");
      await s.keys("d"); // f() x
      await s.keys("j", "0");
      await s.type("*");
      await s.keys("c", "g", "n");
      await s.type("1");
      await s.keys("escape", "."); // 1 two 1 two
      await s.keys("o");
      await s.type("typo word");
      await s.keys("ctrl+w"); // typo
      await s.type("fixed");
      await s.keys("ctrl+u"); // what was typed on the line
      await s.type("final");
      await s.keys("escape", "0", "3", "x", "ctrl+s"); // al
      // What the same keys give headlessly, and what vim gives.
      await s.file("edit-probe.md", (t) => t === "alpha eta gamma\n c\nf() x\n1 two 1 two\nal\n", "the exact result of those keys");
    },
  },
  {
    name: "task: ctrl+l ticks a checkbox in the render and writes it",
    options: { open: MEETING },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      const before = s.read(MEETING);
      await s.keys("/");
      await s.type("book the courier");
      await s.keys("enter", "ctrl+l");
      await s.file(MEETING, (t) => t !== before && t.includes("- [x] Tomasz: book the courier"), "the task ticked on disk");
    },
  },
  {
    name: "lens: space n l edits in place; esc esc closes it",
    options: { open: HANDBOOK },
    run: async (s) => {
      await s.keys("]", "]", "j", "j");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.see("source · lines");
      // Its size by hand: + a block more, - one less, = its own size.
      const lines = () => /source · lines? (\d+)(?:–(\d+))?/.exec(s.text())?.slice(1).map(Number) ?? [];
      const size = () => { const [a, b] = lines(); return (b ?? a!) - a! + 1; };
      const before = size();
      await s.type("+");
      await s.until(() => size() > before, 3000, "+ to grow the lens");
      const grown = size();
      await s.type("-");
      await s.until(() => size() < grown, 3000, "- to shrink it");
      await s.type("=");
      // Its mode: typing says "editing".
      await s.keys("A");
      await s.see("editing · line");
      await s.type(" (lens)");
      await s.keys("escape");
      await s.see("source · line");
      await s.keys("escape");
      await s.keys("ctrl+s");
      await s.file(HANDBOOK, (t) => t.includes(" (lens)"), "the lens edit saved");
    },
  },

  // --- files beyond notes (16.x) --------------------------------------------------------------
  {
    name: "data files: TOML renders, a value's link followed, the lens edits a key, source mode",
    options: { open: TOML },
    run: async (s) => {
      await s.see(/workers\s+3\s+# halved from 6/); // keys lined up, the comment after the value
      await s.see("QHY600M"); // [[telescope]] records as a table
      await s.status(/READ/);
      // A value that is a path is a link: find it, follow it, come back.
      await s.keys("/");
      await s.type("pipeline-cookbook");
      await s.keys("enter", "escape", "enter");
      await s.status("pipeline-cookbook.md");
      await s.keys("ctrl+o");
      await s.status("halley.toml");
      // The lens edits one key, on its own source line.
      await s.keys("/");
      await s.type("bias_frames");
      await s.keys("enter", "escape");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("A");
      await s.type("0");
      await s.keys("escape", "escape", "ctrl+s");
      await s.file(TOML, (t) => t.includes("bias_frames = 210"), "the lens edit saved");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("bias_frames = 210");
    },
  },
  {
    name: "data files: CSV and YAML as tables; a JSON file that doesn't parse opens in source mode",
    run: async (s) => {
      await open(s, "filters.csv");
      await s.see(/│ filter\s+│ telescope/);
      await s.see('"Aster pointing model"'); // a quoted field with "" in it
      await open(s, "targets.yaml");
      await s.see(/│ SS Cyg\s+│ dwarf nova/);
      // Nested YAML as a tree, guides at every depth, the breadcrumb following it.
      await open(s, "deploy.yaml");
      await s.see(/├─ 1\s*$/m);
      await s.see(/│  ├─ env/);
      await s.see(/│  │  ├─ ARCHIVE_ROOT\s+\/srv\/stacks/);
      await s.keys("/");
      await s.type("*probe"); // the api's health probe, line 22 (22G would count rows, not lines)
      await moveTo(s, ["enter", "escape"], (l) => l === 22, "find onto the api's health probe");
      await s.see(/containers\s*›\s*1\s*›\s*health/);
      // A $ref's JSON pointer, followed to its row.
      await open(s, "openapi.json");
      await s.keys("/");
      await s.type("#/components/schemas/Frame");
      await s.keys("enter", "escape", "enter");
      await s.until(() => /L5\d:/.test(s.statusLine()), 3000, "the cursor on the Frame schema's row (line 5x)");
      // INI, and a big CSV: the first 2,000 rows drawn, the rest counted, all of them in source mode.
      await open(s, "logging.ini");
      await s.see(/level\s+INFO\s+# DEBUG floods the disk/);
      await open(s, "photometry-2026.csv");
      await s.see(/│ date\s+│ utc/);
      await s.keys("G");
      await s.see("… 600 more rows");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await moveTo(s, ["G"], (l) => l === 2601, "G to the CSV's last line in source mode");
      await leader(s, "n", "v");
      await open(s, "broken-config.json");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      await s.see('"telescopes": ["Aster", "Brill"');
    },
  },
  {
    name: "code: tree-sitter's outline and breadcrumb, a comment's path:line followed, syntax errors",
    needs: { cols: 80 },
    options: { open: "software/halley/reduce.py" },
    run: async (s) => {
      await s.status("SOURCE");
      await s.see("class Night:");
      // The outline is the file's definitions, nested (the grammar loads lazily, then redraws).
      await s.ex("outline.pick");
      await s.see("is_calibration");
      await s.see("science");
      await s.keys("escape");
      await moveTo(s, ["4", "1", "G"], (l) => l === 41, "41G into Night.reduce");
      await s.see(/Night\s*›\s*reduce/); // the breadcrumb
      // A comment's `halley.toml:10`: enter opens the file at that line.
      await s.keys("/");
      await s.type("halley.toml:10");
      await s.keys("enter", "escape", "enter");
      await s.status("halley.toml");
      await s.keys("ctrl+o");
      await s.status("reduce.py");
      // TypeScript too: its outline in the breadcrumb, a comment's relative path followed.
      await s.ex("e software/nightjar/src/server.ts");
      await s.status("server.ts");
      await s.ex("40");
      await s.see(/FrameArchive\s*›\s*byNight/);
      await s.keys("/");
      await s.type("../openapi.json");
      await s.keys("enter", "escape", "enter");
      await s.status("openapi.json");
      // A file with a syntax error: counted in the status line, gone while typing, back after.
      await s.ex("e scratch/half-written.py"); // code isn't in ctrl+p by default (files.show)
      await s.status("half-written.py");
      await s.status(/✖/, 5000);
      await s.keys("G", "o");
      await s.status("INSERT");
      await s.until(() => !s.statusLine().includes("✖"), 3000, "no error marks while typing");
      await s.keys("escape");
      await s.status(/✖/, 5000);
    },
  },
  // --- saving and conflicts -------------------------------------------------------------------
  {
    name: "conflict: an agent writes while you have changes; the prompt; :w! and :e!",
    options: { open: MEETING },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("mine");
      await s.keys("escape");
      s.write(MEETING, `${s.read(MEETING)}\ntheirs\n`);
      await s.see("changed on disk", 5000);
      await s.keys("escape");
      await leader(s, "n", "c");
      await s.see("changed on disk");
      await s.keys("escape");
      await s.ex("w!");
      await s.file(MEETING, (t) => t.includes("mine") && !t.includes("theirs"), "yours written over theirs");
      await s.keys("o");
      await s.type("unsaved");
      await s.keys("escape");
      await s.ex("e!");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the changes dropped");
      await s.notSee(/^.*│ *unsaved\s*$/m); // the typed line is gone from the screen, not just the marker
      s.expect(!s.read(MEETING).includes("unsaved"), "e! wrote nothing");
    },
  },
  {
    name: "watching: an agent's edit to a clean note shows at once",
    options: { open: MEETING },
    run: async (s) => {
      s.write(MEETING, `${s.read(MEETING)}\nAdded by an agent while you read.\n`);
      await s.see("Added by an agent while you read.", 5000);
      await leader(s, "n", "r");
    },
  },
  {
    name: "agent: the CLI ticks a task, replaces text and appends while you read",
    options: { open: MEETING },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      const row = () => s.screen()[s.rowOf("Tomasz: book the courier")] ?? "";
      const unticked = row();
      const tasks = JSON.parse(s.cli("task", "2026-09-14-weekly", "--json").out).data.tasks;
      const courier = tasks.find((t: { text: string }) => t.text.includes("courier"));
      s.expect(s.cli("task", "2026-09-14-weekly", String(courier.line), "--check").code === 0, "slipbox task ran");
      await s.until(() => row() !== unticked && row().includes("Tomasz"), 5000, "the task's box ticked on screen"); // the glyph set decides the box
      s.expect(s.read(MEETING).includes("- [x] Tomasz: book the courier"), "ticked on disk");
      s.cli("replace", "2026-09-14-weekly", "Dunmore", "DUNMORE");
      await s.see("DUNMORE's new primary mirror", 5000);
      s.cli("write", "2026-09-14-weekly", "Appended by an agent.", "--append");
      await s.see("Appended by an agent.", 5000);
      // The stale list: with unsaved changes here, the CLI says so.
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("mine");
      await s.keys("escape");
      await s.until(() => JSON.parse(s.cli("info", "--json").out).stale.length === 1, 3000, "the CLI to see the unsaved note");
    },
  },
  {
    name: "save and quit: :wq writes and exits",
    options: { open: MEETING },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("last words");
      await s.keys("escape");
      await s.ex("wq");
      await s.until(() => s.exited(), 5000, "slipbox to exit");
      s.expect(s.read(MEETING).includes("last words"), ":wq wrote the note");
    },
  },

  // --- the palette, settings, themes ----------------------------------------------------------
  {
    name: "palette: : runs commands and aliases; :e opens a note",
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
  {
    name: "settings: space u u, every toggle, themes and glyph sets",
    run: async (s) => {
      await leader(s, "u", "u");
      await s.see("UI settings");
      await s.keys("escape");
      // Each toggle says its own name and the new state, then flips back (the message names it,
      // so a stale message from the one before can't pass).
      const names: Record<string, string> = { "shift+w": "Readable width", d: "Problems bar", z: "Zen mode", l: "Cursor-row highlight", n: "Line numbers", w: "Wrap long lines", r: "Show link URLs", m: "Mouse" };
      for (const [k, name] of Object.entries(names)) {
        await leader(s, "u", k);
        await s.see(new RegExp(`${name}: (on|off)`)); // on the top bar, or the last row in zen
        const first = s.text().includes(`${name}: on`) ? "on" : "off";
        await leader(s, "u", k); // back
        await s.see(`${name}: ${first === "on" ? "off" : "on"}`);
      }
      await s.keys(":");
      await s.type("Breadcrumb");
      await s.keys("enter");
      // The top bar hides and comes back (a setting, from the palette or the settings list).
      s.expect(s.topBar().includes("slipbox"), "the top bar showing to begin with");
      await s.keys(":");
      await s.type("Top bar");
      await s.keys("enter");
      await s.message("Top bar: off");
      await s.until(() => !s.topBar().includes("slipbox"), 3000, "the top bar gone");
      await s.keys(":");
      await s.type("Top bar");
      await s.keys("enter");
      await s.until(() => s.topBar().includes("slipbox"), 3000, "the top bar back");
      await leader(s, "u", "t");
      await s.see("Theme (live preview)");
      await s.keys("j", "escape");
      await s.ex("theme tokyo-night");
      await leader(s, "u", "g");
      await s.see("Glyphs (live preview)");
      await s.keys("escape");
      await s.ex("glyphs ascii");
      await s.until(() => s.commands().includes("glyphs.set") && !s.text().includes("≡"), 3000, "the ASCII glyphs");
    },
  },

  // --- scratch, info, messages, help ----------------------------------------------------------
  {
    name: "scratch: add, open, copy, clear; a note's context copied for an agent",
    run: async (s) => {
      await s.keys("j", "j");
      await leader(s, "s", "a");
      await leader(s, "s", "s");
      await s.status(/scratch/);
      await leader(s, "s", "y");
      await s.message("copied");
      // What space s a added: home's third row, with its path and line.
      await s.until(() => /home\.md:\d+/.test(s.clipboard()), 3000, "the scratch holding home.md:line");
      await leader(s, "s", "d");
      await s.see("Clear the scratch?"); // a question: its own window
      await s.type("y");
      await leader(s, "s", "y");
      await s.message("the scratch is empty");
      // The context bundle (9.7): the note, what it links to and what links to it, copied.
      await open(s, "kenji-mori");
      await leader(s, "s", "c");
      await s.message("copied the context of people/kenji-mori.md");
      await s.until(() => s.clipboard().startsWith("# Context: people/kenji-mori.md\n"), 3000, "the bundle copied");
      s.expect(s.clipboard().includes("`projects/variable-star-survey.md:1-"), "what it links to, with its lines");
      s.expect(/`home\.md:1-\d+` — links to people\/kenji-mori\.md/.test(s.clipboard()), "what links to it");
    },
  },
  {
    name: "info: the Info view (the file's), vault info (its own window), reindex, config reload, messages, help",
    run: async (s) => {
      // The Info view (3.19): the file on screen, in the right panel — its vault, properties, links.
      await open(s, "kenji-mori");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/vault +halden/);
      await s.see("Properties");
      await s.see(/building +Workshop/);
      await s.see(/backlinks +\d+/);
      // Its toggle, from the palette: hidden, then shown again.
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.until(() => !s.statusLine().includes("INFO"), 3000, "the Info hidden");
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.status("INFO");
      // Its properties, edited in a floating editor (3.20): a line added; esc esc writes it back.
      await leader(s, "n", "shift+p");
      await s.see("Properties — people/kenji-mori.md (YAML)");
      await s.keys("shift+g", "o");
      await s.type("status: visiting");
      await s.keys("escape", "escape");
      await s.message("properties written");
      await s.file("people/kenji-mori.md", (t) => t.includes("status: visiting\n---"), "the property in the frontmatter");
      await leader(s, "n", "i");
      await s.see(/status +visiting/);
      // A tag's row: its notes.
      await s.keys("shift+g");
      await s.until(() => /#visiting|#people/.test(s.text()), 3000, "its tags");
      await s.keys("escape");
      await leader(s, "v", "i");
      await s.see(s.vault);
      await s.keys("escape");
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/);
      await leader(s, "v", "c");
      await leader(s, "m");
      await s.see("Messages");
      await s.keys("escape");
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.keys("escape");
    },
  },

  // --- hand-offs ------------------------------------------------------------------------------
  {
    name: "hand-off: space n e runs the editor and comes back; send to a remote editor",
    // Each editor leaves a file behind, so the check is that it really ran, with the note's path.
    options: { config: `[editor]\ncommand = "sh -c 'echo $0 > $1' {file} {vault}/ran-edit"\nremote = ["sh -c 'echo $0 > $1' {file} {vault}/ran-send"]\n` },
    run: async (s) => {
      await leader(s, "n", "e");
      await s.status("home.md", 5000);
      await s.until(() => existsSync(join(s.vault, "ran-edit")), 5000, "the editor to run");
      s.expect(readFileSync(join(s.vault, "ran-edit"), "utf8").trim().endsWith("home.md"), "the editor got the note");
      await leader(s, "n", "s");
      await s.until(() => existsSync(join(s.vault, "ran-send")), 5000, "the remote editor to run");
      s.expect(readFileSync(join(s.vault, "ran-send"), "utf8").trim().endsWith("home.md"), "the remote editor got the note");
      await leader(s, "n", "p");
      await s.keys("escape");
    },
  },

  {
    name: "git: a branch switch while it runs — the vault and its branch in the status line, said once, each branch's tabs back",
    run: async (s) => {
      const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", s.vault, ...args]);
      if (git("init", "-q", "-b", "main").exitCode !== 0) return; // no git here
      git("add", "-A");
      git("commit", "-q", "-m", "the demo");
      await s.status(/ · main/, 5000); // the status line: the vault and its branch (20.14), from the next poll
      git("checkout", "-q", "-b", "feat");
      await s.message("switched to branch feat", 5000);
      await s.status(/ · feat/);
      await open(s, "kenji-mori");
      await s.status("kenji-mori.md");
      git("checkout", "-q", "main");
      await s.message("switched to branch main: its tabs are back", 5000);
      await s.status("home.md");
      git("checkout", "-q", "feat");
      await s.message("switched to branch feat: its tabs are back", 5000);
      await s.status("kenji-mori.md");
    },
  },

  {
    name: "git: the explorer's marks; space g c what changed, a file's diff; space g d this note's",
    run: async (s) => {
      const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", s.vault, ...args]);
      if (git("init", "-q", "-b", "main").exitCode !== 0) return; // no git here
      git("add", "-A");
      git("commit", "-q", "-m", "the demo");
      git("checkout", "-q", "-b", "review");
      s.write("home.md", `${s.read("home.md")}\nA line the agent added.\n`);
      await s.see(/home\.md +M/, 6000); // the explorer's mark, once git has been asked
      await leader(s, "g", "c");
      await s.see("Changed against main (1) — enter: the diff");
      await s.see("M home.md");
      await s.keys("enter");
      await s.see("home.md against main — esc: the changes");
      await s.see("+ A line the agent added.");
      await s.keys("escape");
      await s.see("Changed against main (1)");
      await s.keys("escape");
      await leader(s, "g", "d");
      await s.see("+ A line the agent added.");
      await s.keys("escape");
      await leader(s, "g", "w");
      await s.see("Worktrees (1) — enter: this note there");
      await s.see(/● .+ review/);
      await s.keys("escape");
    },
  },

  {
    name: "git: space g m — a merge's broken links before it, each fix said; after it, git's rename says where a file went (20.21)",
    run: async (s) => {
      const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", s.vault, ...args]);
      if (git("init", "-q", "-b", "main").exitCode !== 0) return; // no git here
      git("add", "-A");
      git("commit", "-q", "-m", "the demo");
      // refactor renames Kenji's note, every link to it fixed — as slipbox's mv does.
      git("checkout", "-q", "-b", "refactor");
      s.expect(s.cli("mv", "people/kenji-mori.md", "people/kenji.md").code === 0, "slipbox mv ran");
      git("add", "-A");
      git("commit", "-q", "-m", "kenji renamed");
      git("checkout", "-q", "main");
      // Meanwhile main gains a note linking to it where it was.
      s.write("late-note.md", "# Late\n\nAsk [Kenji](people/kenji-mori.md) about Aster.\n");
      git("add", "-A");
      git("commit", "-q", "-m", "a late note");
      await s.status(/ · main/, 5000);
      await leader(s, "g", "m");
      await s.see("Review a merge — enter: the links it would break");
      await s.see("refactor → main");
      await s.keys("enter");
      await s.see("Merging refactor into main: 1 link would break");
      await s.see("late-note.md:3  people/kenji-mori.md");
      await s.see("refactor moves people/kenji-mori.md to people/kenji.md"); // the fix after it, cut at the list's width
      await s.keys("enter");
      await s.status("late-note.md");
      // Merged: git's rename is evidence here — the link says where its file went; space l r fixes it.
      git("merge", "-q", "--no-edit", "refactor");
      await s.message("branch main moved on: git moved 1 file", 8000);
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file", 5000);
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [Kenji](people/kenji.md) about Aster."), "the link relinked");
    },
  },

  // --- vaults (17.x) ----------------------------------------------------------------------------
  {
    name: "vaults: a path into another vault switches into it and back; a broken one; the list; a nested vault",
    options: {
      open: "vault-links.md",
      files: {
        "vault-links.md": "# Vault links\n\n- [the app's goals](../app/design.md#goals)\n- [somewhere](../nope/somewhere.md)\n",
        "inner-vault/.slipbox/config.toml": '[vault]\nid = "e2einner0001"\nname = "inner-name"\n',
        "inner-vault/inside.md": "# Inside the inner vault\n",
      },
      beside: {
        "app/.slipbox/version": "1\n",
        "app/design.md": "# App design\n\nIntro.\n\n## Goals\n\nShip the dome software.\n",
        "app/links.md": "# Links\n\nBack to [home](../vault/home.md).\n",
      },
      setup: (s) => {
        // A path link as other tools write it (17.16): the scenario's own folder is known only now.
        s.write("vault-links.md", `${s.read("vault-links.md")}- [by path](file://${s.dir}/app/design.md#goals)\n`);
        s.cli("ls"); // the demo vault, halden, as this machine sees it
        s.cli("init", join(s.dir, "app"), "--name", "e2eapp");
        s.cli("ls", "--root", join(s.dir, "app")); // the app's index: its link back to demo:home
      },
    },
    run: async (s) => {
      await s.see("Vault links");
      await s.keys("tab", "enter");
      await s.message("vault e2eapp");
      await s.status("design.md");
      await s.see("Ship the dome software");
      await s.see(/L5:/); // at ## Goals
      // Back from its first place: the vault before, at the link.
      await s.keys("ctrl+o");
      await s.status("vault-links.md");
      await s.see("Vault links");
      await s.keys("tab", "tab", "enter");
      await s.message("broken link: ../nope/somewhere.md");
      // A file:// link: followed into the vault that holds it, not copied as a URL.
      await s.keys("tab", "enter");
      await s.status("design.md");
      await s.see(/L5:/);
      await s.keys("ctrl+o");
      await s.status("vault-links.md");
      // The machine's vaults.
      await leader(s, "v", "v");
      await s.see(/Vaults \(\d+\)/);
      await s.see("e2eapp");
      await s.keys("escape");
      // A backlink from the other vault: home's list has app's links.md.
      await open(s, "home");
      await leader(s, "l", "b");
      await s.see("e2eapp:links.md");
      await s.keys("escape");
      // The nested vault in the explorer, with its name.
      await leader(s, "e");
      await s.see("inner-vault inner-name");
      await s.keys("escape");
      // Renaming the vault: a name, so the paths into it don't change.
      await leader(s, "v", "n");
      await s.see("rename vault halden to:");
      await s.type("halden2");
      await s.keys("enter");
      await s.see(/vault halden → halden2: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("renamed the vault halden → halden2");
      s.expect(readFileSync(join(s.dir, "app", "links.md"), "utf8").includes("[home](../vault/home.md)"), "the other vault's path as it was");
      s.expect(s.read("outreach/index.md").includes("[the observatory's home](../home.md)"), "the nested vault's path as it was");
    },
  },
  {
    name: "nested vaults: the demo's outreach — in by path, back, backlinks, the explorer, two deep",
    run: async (s) => {
      // home's last link: outreach/index.md, in a vault nested in this one (enter: the row's link).
      await s.keys("shift+g", "enter");
      await s.message("vault outreach");
      await s.status("index.md");
      await s.see("The observatory's public programme");
      // Two deep: the school visits.
      await s.keys("g", "g", "tab", "tab", "enter");
      await s.message("vault outreach-school-visits");
      await s.see("A vault nested two deep");
      // Back, and back again: to the observatory's home.
      await s.keys("ctrl+o");
      await s.status("index.md");
      await s.keys("ctrl+o");
      await s.status("home.md");
      await s.see("Halden Ridge Observatory");
      // home's backlinks: from both nested vaults.
      await leader(s, "l", "b");
      await s.see("outreach:index.md");
      await s.see("outreach-school-visits:index.md");
      await s.keys("escape");
      await leader(s, "e");
      await s.see("outreach");
      // Its row in the explorer (18.7): shift+r renames the vault; m moves its folder, picked from
      // the tree by typing — its links out (two deep too) follow, its name stays.
      await s.status("FILES");
      await explorerRow(s, "outreach");
      await s.keys("shift+r");
      await s.see("rename the vault outreach to:");
      await s.keys("escape");
      await s.keys("m");
      await s.see("Move outreach/ to…");
      await s.see("(the vault's root)");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/outreach\/ → handbook\/outreach\//);
      await s.keys("enter");
      await s.file("handbook/outreach/index.md", (t) => t.includes("[the operations handbook](../operations-handbook.md)"), "outreach's link out fixed");
      s.expect(s.read("handbook/outreach/school-visits/index.md").includes("(../../safety-card.adoc)"), "two deep: fixed too");
      s.expect(s.read("home.md").includes("[outreach](handbook/outreach/index.md)"), "home's path into it follows");
    },
  },
  {
    name: "vaults: v makes a folder a vault after a preview, paths across untouched; V makes it a plain folder again",
    run: async (s) => {
      const home = s.read("home.md");
      await leader(s, "e");
      await s.status("FILES");
      await explorerRow(s, "logs");
      // Its menu has it; v does it: the name asked, a distinct one offered.
      await s.keys(".");
      await s.see(/Make it a vault +v/);
      await s.keys("v");
      await s.see("make logs/ a vault named:");
      await s.see("› halden-logs");
      await s.keys("enter");
      await s.see(/logs\/ → the vault halden-logs: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made logs/ the vault halden-logs");
      s.expect(s.exists("logs/.slipbox/config.toml"), "logs/ has its .slipbox/");
      s.expect(s.read("home.md") === home, "home's path into it, across now, as it was");
      // V: back, the links as they were.
      await s.keys("shift+v");
      await s.see(/the vault logs\/ → a folder of halden/);
      await s.keys("enter");
      await s.message("made logs/ a plain folder of halden");
      s.expect(!s.exists("logs/.slipbox"), "its .slipbox/ gone (to the trash)");
      await s.file("home.md", (t) => t === home, "home as it was");
      // From anywhere too: which-key lists them under space d (folders) and space v (vaults).
      await s.keys("escape");
      await leader(s, "d");
      await s.see("Rename the folder");
      await s.keys("escape");
      await leader(s, "v");
      await s.see("Make a vault");
      await s.see("Make the vault a plain folder");
      await s.keys("escape");
    },
  },
  {
    name: "files: space n the note, space d its folder, space v the vault — move, copy, cut, paste, delete, restore, vaults",
    options: { open: "people/contacts.md" },
    run: async (s) => {
      await leader(s, "n", "shift+m");
      await s.see("Move people/contacts.md to…");
      await s.keys("escape");
      await leader(s, "n", "y");
      await s.message("copied people/contacts.md");
      await leader(s, "d", "p");
      await s.file("people/contacts-copy.md", (t) => t.length > 0, "a copy beside it");
      await leader(s, "n", "x");
      await s.message("cut people/contacts.md");
      await leader(s, "d", "p");
      await s.message("already in people");
      await leader(s, "n", "d");
      await s.see(/Delete people\/contacts\.md\?/);
      await s.type("y");
      await s.message("deleted people/contacts.md");
      s.expect(!s.exists("people/contacts.md"), "gone to the trash");
      await leader(s, "v", "u");
      await s.message("restored people/contacts.md");
      s.expect(s.exists("people/contacts.md"), "back");
      // Its folder.
      await leader(s, "d", "r");
      await s.see("rename people/ to:");
      await s.keys("escape");
      await leader(s, "d", "m");
      await s.see("Move people/ to…");
      await s.keys("escape");
      await leader(s, "d", "d");
      await s.see(/Delete people\/ and everything in it\?/);
      await s.keys("escape");
      await leader(s, "d", "y");
      await s.message("copied people/");
      await leader(s, "d", "x");
      await s.message("cut people/");
      // The vault.
      await leader(s, "v", "m");
      await s.see("make people/ a vault named:");
      await s.keys("escape");
      await leader(s, "v", "shift+m");
      await s.message("isn't inside another vault");
    },
  },
  {
    name: "rename: space n m previews every change, enter renames; each link follows, the old name kept",
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "m");
      await s.see("rename or move people/kenji-mori.md to:");
      await s.keys("ctrl+u");
      await s.type("people/kenji");
      await s.keys("enter");
      await s.see(/people\/kenji-mori\.md → people\/kenji\.md: \d+ changes in \d+ files/);
      await s.see("home.md:28");
      await s.keys("enter");
      await s.message("renamed people/kenji-mori.md → people/kenji.md");
      await s.status("kenji.md");
      s.expect(!s.exists("people/kenji-mori.md"), "the old file is gone");
      await s.file("people/kenji.md", (t) => t.includes("previous_names: [kenji-mori]"), "the old name kept");
      s.expect(s.read("home.md").includes("- [kenji-mori](people/kenji.md) — our visiting astronomer"), "home's link follows");
      s.expect(s.read("people/partners-and-names.md").includes("[kenji-mori.md](kenji.md); the names"), "the note beside it too");
      s.expect(s.read("people/partners-and-names.md").includes("![kenji-mori › Kenji Mori](kenji.md#kenji-mori)"), "the embed follows");
      // A link written later with the old path: broken, its move known — relink rewrites it.
      s.write("late-note.md", "# Late\n\nAsk [Kenji](people/kenji-mori.md) about Aster.\n");
      await s.see("late-note.md"); // the watcher has it: the switcher lists it
      await open(s, "late-note");
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [Kenji](people/kenji.md) about Aster."), "the link relinked");
      // Undo (7.4), newest first, each previewed: the relink, then the rename — every file as it was.
      await leader(s, "v", "shift+u");
      await s.see("undo: relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [Kenji](people/kenji-mori.md) about Aster."), "the relink undone");
      await leader(s, "v", "shift+u");
      await s.see(/undo: people\/kenji\.md → people\/kenji-mori\.md: \d+ changes/);
      await s.keys("enter");
      await s.message("renamed people/kenji.md back to"); // the toast wraps the rest
      await s.file("people/kenji-mori.md", (t) => !t.includes("previous_names"), "the note back, as it was");
      s.expect(!s.exists("people/kenji.md"), "the new name is gone");
      s.expect(s.read("home.md").includes("- [kenji-mori](people/kenji-mori.md) — our visiting astronomer"), "home's link back");
      // A heading renamed (11.9): its line, and the embed of it elsewhere.
      await open(s, "kenji-mori");
      await s.keys(":");
      await s.type("14");
      await s.keys("enter");
      await leader(s, "n", "h");
      await s.see('rename the heading "Kenji Mori" to:');
      await s.keys("ctrl+u");
      await s.type("Kenji Mori, astronomer");
      await s.keys("enter");
      await s.see(/#Kenji Mori → people\/kenji-mori\.md#Kenji Mori, astronomer: \d+ changes/); // the title is cut there
      await s.keys("enter");
      await s.file("people/kenji-mori.md", (t) => t.includes("# Kenji Mori, astronomer\n"), "the heading renamed");
      s.expect(s.read("people/partners-and-names.md").includes("(kenji-mori.md#kenji-mori-astronomer)"), "the embed follows");
      // The explorer's r asks for the selected note's new name; esc cancels.
      await leader(s, "e");
      await s.keys("r");
      await s.see(/rename .* to:/);
      await s.keys("escape");
    },
  },
  {
    name: "vaults: a git repository is a vault by itself — opened from its top, nothing asked or written; its links followed",
    options: {
      startAt: "project/docs/readme.md",
      beside: {
        "project/.git/HEAD": "ref: refs/heads/main\n",
        "project/docs/readme.md": "# Readme\n\nThe [guide](guide/guide.md) is in another folder.\n",
        "project/docs/guide/guide.md": "# The guide\n\nFound across the repository.\n",
      },
    },
    run: async (s) => {
      // The repository's own path for the note: its top is the vault's (20.3).
      await s.status("docs/readme.md");
      await s.see("The guide is in another folder");
      s.expect(!s.text().includes("make it a vault?"), "nothing offered");
      s.expect(!existsSync(join(s.dir, "project", ".slipbox")), "nothing written into the repository");
      await s.keys("tab", "enter");
      await s.status("guide.md");
      await s.see("Found across the repository");
    },
  },
  {
    name: "vaults: a vault moved by hand is asked about — did it move here? yes brings its reading places along (20.5)",
    run: async (s) => {
      // Read to the end of a note, then quit: the place is kept, by this copy's instance.
      await open(s, "kenji-mori");
      await moveTo(s, ["shift+g"], (l) => l > 10, "the end of the note");
      const left = pos(s).line;
      await s.quit();
      // Moved by hand, then opened where it is now.
      const moved = join(s.dir, "moved");
      renameSync(s.vault, moved);
      (s.opts as SessionOptions).startAt = "moved/home.md";
      await s.start();
      await s.see("was elsewhere before — did it move here?");
      await s.see(`Moved here from ${s.vault}`);
      await s.keys("enter");
      await s.message("moved here from");
      await open(s, "kenji-mori");
      await s.until(() => pos(s).line === left, 3000, `kenji-mori at line ${left} again`);
    },
  },
  {
    name: "vaults: opened on a loose folder, the known vaults first; .. and folders in the explorer",
    options: {
      startAt: "loose",
      beside: { "loose/jotting.md": "# A loose jotting\n", "loose/sub/deeper.md": "# Deeper\n" },
      setup: (s) => {
        s.cli("ls"); // halden, the demo vault: known to this machine
      },
    },
    run: async (s) => {
      await s.see(/Vaults \(\d+\)/);
      await s.see("halden");
      await s.keys("escape");
      await s.see("home vault");
      await s.see("jotting.md");
      await s.see(/\.\./);
      await s.see("sub");
      await leader(s, "v", "v");
      await s.see("halden");
      await s.keys("enter");
      await s.message("vault halden");
      await s.status("home.md");
    },
  },
];
