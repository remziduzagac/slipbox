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
  await s.see("Open note");
  await s.type(name);
  await s.keys("enter");
  await s.status(name);
}

/** Leader sequences: space, then the keys. */
const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);

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
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await s.keys("ctrl+e");
      await s.see("n-");
      clean();
      await s.keys("escape");
      await s.keys("ctrl+p"); // the switcher lists it by name
      await s.see("Open note");
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
      await s.top(/copied 4 characters/);
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
      await s.keys("ctrl+tab");
      await s.keys("ctrl+tab");
      await s.keys("ctrl+shift+tab");
      await s.keys("enter");
      await s.status("about-this-vault.md");
      await s.keys("H"); // back
      await s.status("home.md");
      await s.keys("L"); // forward
      await s.status("about-this-vault.md");
      await leader(s, "h", "p");
      await s.status("home.md");
      await leader(s, "h", "n");
      await s.status("about-this-vault.md");
      await leader(s, "h", "h");
      await s.see("History");
      await s.keys("escape");
      await s.keys("H");
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
      await s.keys("H");
      await s.keys("ctrl+tab");
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
      const order = () => (s.screen().slice(0, -1).join("\n").match(/\b(home|writing-guide)\.md\b/g) ?? []).join(" ");
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
      await s.keys("ctrl+alt+w");
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
      await s.keys("ctrl+t", "o");
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
      await s.keys("ctrl+t");
      await s.type("L");
      await s.see(/1 operations/); // home moved right, past the handbook
      await s.keys("ctrl+t");
      await s.type("H");
      await s.see(/1 home/);
      await s.keys("ctrl+t", "q");
      await s.notSee(/2 home|2 operations/);
    },
  },

  // --- panes ----------------------------------------------------------------------------------
  {
    name: "panes: the explorer, reveal, the outline, the heading picker, the path dropdown",
    needs: { cols: 100 },
    options: { open: HANDBOOK },
    run: async (s) => {
      // ctrl+e cycles: open, focus, close. It may start open (a wide pane), so press to focus.
      const focus = async (key: string, chip: string) => {
        for (let i = 0; i < 3 && !s.statusLine().includes(chip); i++) await s.keys(key);
        await s.status(chip);
      };
      await focus("ctrl+e", "FILES");
      await s.see("Explorer");
      await s.keys("escape");
      await s.keys("ctrl+shift+e");
      await s.status("FILES");
      // Revealed: the note's own row in the explorer, left of the border.
      await s.until(() => s.screen().some((r) => /operations-handbook\s*[│┃]/.test(r)), 3000, "the note revealed in the explorer");
      await s.keys("escape");
      await focus("ctrl+o", "OUTLINE");
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
      await s.top(/replaced \d+ match/);
      await s.keys("alt+h");
      await s.notSee("⇄ BRILL"); // the replace row gone (⇄ stays, as the find row's button)
      await s.keys("escape", "escape");
      await s.keys("ctrl+s");
      await s.file(HANDBOOK, (t) => t.includes("BRILL") && !t.includes("Brill"), "every Brill replaced and saved");
      await s.ex("%s/Corvid/CORVID/gc");
      await s.see("replace? y n a q");
      await s.keys("y", "n", "q");
      await s.top("1 substitution");
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
    name: "task: x ticks a checkbox in the render and writes it",
    options: { open: MEETING },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      const before = s.read(MEETING);
      await s.keys("/");
      await s.type("book the courier");
      await s.keys("enter", "x");
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
      await s.keys("A");
      await s.type(" (lens)");
      await s.keys("escape", "escape");
      await s.keys("ctrl+s");
      await s.file(HANDBOOK, (t) => t.includes(" (lens)"), "the lens edit saved");
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
      const names: Record<string, string> = { w: "Readable width", z: "Zen mode", l: "Cursor-row highlight", n: "Line numbers", s: "Wrap long lines", r: "Show link URLs", m: "Mouse" };
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
      await s.top("copied");
      // What space s a added: home's third row, with its path and line.
      await s.until(() => /home\.md:\d+/.test(s.clipboard()), 3000, "the scratch holding home.md:line");
      await leader(s, "s", "d");
      await s.status("clear the scratch?");
      await s.type("y");
      await s.keys("enter");
      await leader(s, "s", "y");
      await s.top("the scratch is empty");
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
      await s.top(/reindexed \d+ notes/);
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
];
