// The terminal tests' scenarios. Each runs on a fresh copy of the demo vault (examples/vault), in a
// real terminal. Keys go through herdr exactly as a keyboard's would, so these catch what the
// headless tests can't: key encodings, timing, the idle loop, what the screen really shows. Mouse
// clicks can't be sent through herdr; the headless tests cover them.

import { existsSync, readFileSync } from "node:fs";
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
      await s.see("木曽原天文同好会");
      await s.see("يوسف حداد");
      await s.see("🔭");
      await s.see("unresolved"); // [[visiting-rota]] exists nowhere; the text says so, drawn as such
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
      // The current note: a copy of it (the palette), opened; then that copy deleted (space n d).
      await s.keys("escape");
      await s.keys(":");
      await s.type("Copy the note");
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
      const names: Record<string, string> = { d: "Readable width", z: "Zen mode", l: "Cursor-row highlight", n: "Line numbers", w: "Wrap long lines", r: "Show link URLs", m: "Mouse" };
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
    name: "scratch: add, open, copy, clear",
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
    },
  },
  {
    name: "info: note and vault info, reindex, config reload, messages, help",
    run: async (s) => {
      await leader(s, "n", "i");
      await s.see("Note — home");
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

  // --- vaults (17.x) ----------------------------------------------------------------------------
  {
    name: "vaults: [[vault:note]] switches into another vault and back; unknown vault; the list; a nested vault",
    options: {
      open: "vault-links.md",
      files: {
        "vault-links.md": "# Vault links\n\n- [[e2eapp:design#Goals|the app's goals]]\n- [[nope:somewhere]]\n",
        "inner-vault/.slipbox/config.toml": '[vault]\nid = "e2einner0001"\nname = "inner-name"\n',
        "inner-vault/inside.md": "# Inside the inner vault\n",
      },
      beside: {
        "app/.slipbox/version": "1\n",
        "app/design.md": "# App design\n\nIntro.\n\n## Goals\n\nShip the dome software.\n",
        "app/links.md": "# Links\n\nBack to [[halden:home]].\n",
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
      await s.message('unknown vault "nope"');
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
      await s.see("e2eapp: links.md");
      await s.keys("escape");
      // The nested vault in the explorer, with its name.
      await leader(s, "e");
      await s.see("inner-vault inner-name");
      await s.keys("escape");
      // Renaming the vault: e2eapp's link to halden:home follows (and outreach's, nested in it).
      await leader(s, "v", "n");
      await s.see("rename vault halden to:");
      await s.type("halden2");
      await s.keys("enter");
      await s.see(/vault halden → halden2: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("renamed the vault halden → halden2");
      s.expect(readFileSync(join(s.dir, "app", "links.md"), "utf8").includes("[[halden2:home]]"), "the other vault's link follows");
      s.expect(s.read("outreach/index.md").includes("[[halden2:home]]"), "the nested vault's link follows");
    },
  },
  {
    name: "nested vaults: the demo's outreach — in by name, back, backlinks, the explorer, two deep",
    run: async (s) => {
      // home's last link: [[outreach:index]], a vault nested in this one (enter: the row's link).
      await s.keys("shift+g", "enter");
      await s.message("vault outreach");
      await s.status("index.md");
      await s.see("The observatory's public programme");
      // Two deep, by name: the school visits.
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
      await s.see("outreach: index.md");
      await s.see("outreach-school-visits: index.md");
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
      s.expect(s.read("home.md").includes("[[outreach:index]]"), "the link by its name as it was");
    },
  },
  {
    name: "vaults: v makes a folder a vault, links across fixed after a preview; V makes it a plain folder again",
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
      await s.file("home.md", (t) => t.includes("[[halden-logs:observing-log-2026]]"), "home's link by name, across now");
      // V: back, the links as they were.
      await s.keys("shift+v");
      await s.see(/the vault logs\/ → a folder of halden/);
      await s.keys("enter");
      await s.message("made logs/ a plain folder of halden");
      s.expect(!s.exists("logs/.slipbox"), "its .slipbox/ gone (to the trash)");
      await s.file("home.md", (t) => t === home, "home as it was");
      // All of it after space x too, from anywhere: which-key lists the explorer's keys.
      await s.keys("escape");
      await leader(s, "x");
      await s.see("Rename in place");
      await s.see("Make the folder a vault");
      await s.see("Make the vault a plain folder");
      await s.keys("escape");
    },
  },
  {
    name: "files: space x — the explorer's keys from a note: rename, move, copy, cut, paste, delete, restore, menu, vaults",
    options: { open: "people/contacts.md" },
    run: async (s) => {
      await leader(s, "x", "r");
      await s.see("rename people/contacts.md to:");
      await s.keys("escape");
      await leader(s, "x", "m");
      await s.see("Move people/contacts.md to…");
      await s.keys("escape");
      await leader(s, "x", "y");
      await s.message("copied people/contacts.md");
      await leader(s, "x", "p");
      await s.file("people/contacts-copy.md", (t) => t.length > 0, "a copy beside it");
      await leader(s, "x", "x");
      await s.message("cut people/contacts.md");
      await leader(s, "x", "p");
      await s.message("already in people");
      await leader(s, "x", "d");
      await s.see(/Delete people\/contacts\.md\?/);
      await s.type("y");
      await s.message("deleted people/contacts.md");
      s.expect(!s.exists("people/contacts.md"), "gone to the trash");
      await leader(s, "x", "u");
      await s.message("restored people/contacts.md");
      s.expect(s.exists("people/contacts.md"), "back");
      await leader(s, "x", ".");
      await s.see(/Rename +r/);
      await s.keys("escape");
      await leader(s, "x", "v");
      await s.see("make people/ a vault named:");
      await s.keys("escape");
      await leader(s, "x", "shift+r");
      await s.see("rename vault halden to:");
      await s.keys("escape");
      await leader(s, "x", "shift+v");
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
      s.expect(s.read("home.md").includes("- [[kenji]] — our visiting astronomer"), "home's link follows");
      s.expect(s.read("people/partners-and-names.md").includes("[[kenji.md]] with its extension, [[people/kenji]] by folder path"), "each form kept");
      s.expect(s.read("people/partners-and-names.md").includes("![[kenji#Kenji Mori]]"), "the embed follows");
      // A link written later with the old name: relink rewrites it to the new one.
      s.write("late-note.md", "# Late\n\nAsk [[kenji-mori]] about Aster.\n");
      await s.see("late-note.md"); // the watcher has it: the switcher lists it
      await open(s, "late-note");
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("Ask [[kenji]] about Aster."), "the link relinked");
      // The explorer's r asks for the selected note's new name; esc cancels.
      await leader(s, "e");
      await s.keys("r");
      await s.see(/rename .* to:/);
      await s.keys("escape");
    },
  },
  {
    name: "vaults: a git repository without .slipbox/ is offered; made a vault, its links reach across it",
    options: {
      startAt: "project/docs/readme.md",
      beside: {
        "project/.git/HEAD": "ref: refs/heads/main\n",
        "project/docs/readme.md": "# Readme\n\nThe [[guide]] is in another folder.\n",
        "project/docs/guide/guide.md": "# The guide\n\nFound across the repository.\n",
      },
    },
    run: async (s) => {
      await s.see("is a git repository without .slipbox/ — make it a vault?");
      await s.see("Make it a private vault");
      // Not now: the file stays loose, and space v m (:init) asks again.
      await s.keys("escape");
      await s.message("not a vault:");
      s.expect(!existsSync(join(s.dir, "project", ".slipbox")), "nothing made");
      await leader(s, "v", "m");
      await s.see("is a git repository without .slipbox/ — make it a vault?");
      await s.keys("enter");
      await s.message("a vault:");
      await s.status("docs/readme.md");
      s.expect(existsSync(join(s.dir, "project", ".slipbox", "config.toml")), "the .slipbox/ made");
      await s.keys("tab", "enter");
      await s.status("guide.md");
      await s.see("Found across the repository");
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
