// Editing: source mode, normal mode, vim's grammar, motions, repeat, visual, typing, the lens, tasks, copy, create,
// save and quit, pinned tabs, conflicts, reload, autosave, the scratch, the hand-off to an editor (TT-T4).

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dictionaryFiles } from "../../../src/core/spell.ts";
import {
  type Check,
  follow,
  HANDBOOK,
  type LeftOut,
  leader,
  MEETING,
  moveTo,
  open,
  opened,
  pos,
  SCRATCH_FLOATING,
} from "../check.ts";
import { REPO, type Session, type SessionOptions, WAIT } from "../session.ts";

/** The reference set, slipbox started on one of its files (`~/notes/…`, as the checks name it). */
export const at = (rel: string): SessionOptions => ({ home: true, startAt: `home/${rel.slice(2)}` });

/**
 * Slipbox taking keys: at start it can still be reading the vault for a moment after its first frame, the keys
 * waiting their turn. An escape (harmless while reading) is seen run before the check's own keys go.
 */
export async function ready(s: Session): Promise<void> {
  await s.keys("escape");
  await s.until(() => s.commands().includes("app.escape"), 15000, "slipbox to take keys");
}

/**
 * Holding slipbox's spell checker's thread before it builds the dictionary whose words are `dic`, until the check lets
 * it go: a script of the tests' preloaded into slipbox (`tests/terminal/spell-hold.ts`), told by its environment.
 */
const holdingSpell = (dic: string): Pick<SessionOptions, "env" | "preload"> => ({
  preload: join(REPO, "tests", "terminal", "spell-hold.ts"),
  env: { SPELL_HOLD_DIC: dic, SPELL_HOLD_GO: "{dir}/hold-go", SPELL_HOLD_STATE: "{dir}/hold-state" },
});
/** Where the hold is (`HOLD_STATES`); empty before the script says. */
const holdState = (s: Session) =>
  existsSync(join(s.dir, "hold-state")) ? readFileSync(join(s.dir, "hold-state"), "utf8") : "";
/** The thread at the hold: waiting there, not still set, nor spent on words built already. */
async function heldSpell(s: Session, what: string): Promise<void> {
  await s.until(() => !["", "set"].includes(holdState(s)), WAIT, what);
  s.expect(holdState(s) === "waiting", `${what}: ${holdState(s)}, not waiting`);
}
/** The hold let go, by the check: not its wait run out, nor dropped with a thread stopped at a request's deadline. */
async function letGoSpell(s: Session): Promise<void> {
  writeFileSync(join(s.dir, "hold-go"), "");
  await s.until(
    () => !["", "waiting"].includes(holdState(s)),
    WAIT,
    "the thread let go (still waiting: was it stopped?)",
  );
  s.expect(holdState(s) === "let go", `the thread ${holdState(s)}, not let go`);
}
/** A bundled dictionary copied under the check's folder (`dict/<lang>.aff`, `.dic`): built when asked, as yours. */
function ownDictionary(s: Session, lang: string): void {
  const files = dictionaryFiles(lang, {})!;
  mkdirSync(join(s.dir, "dict"), { recursive: true });
  cpSync(files.aff, join(s.dir, "dict", `${lang}.aff`));
  cpSync(files.dic, join(s.dir, "dict", `${lang}.dic`));
}
/** The cursor onto the first match of `text` below it: found, the find row closed. */
export async function findText(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape");
}

/** To line `n` by the command line (`:42`). */
async function line(s: Session, n: number): Promise<void> {
  await s.ex(String(n));
  await s.until(() => pos(s).line === n, 3000, `the cursor on line ${n}`);
}

/** Source mode, by its key (`ctrl+k`, which toggles it): a note opened in a window keeps the window's mode. */
async function source(s: Session): Promise<void> {
  if (!s.statusLine().includes("SOURCE")) await s.keys("ctrl+k");
  await s.status("SOURCE");
}

/** The note's text with its 1-based line `n` replaced. */
const withLine = (text: string, n: number, to: string) => {
  const lines = text.split("\n");
  lines[n - 1] = to;
  return lines.join("\n");
};

const ORDER = ["Morning: brainstorm", "Lunch: walk", "Afternoon: write it up", "Evening: put the list", "Tomorrow:"];
/** The "Order of the day" list of 2026-09-01, as the screen shows it: its items' first words, top to bottom. */
const order = (s: Session) =>
  ORDER.filter((t) => s.rowOf(t) >= 0)
    .sort((a, b) => s.rowOf(a) - s.rowOf(b))
    .map((t) => t.split(":")[0]!);

export const SEPT1 = "~/notes/daily/2026-09-01.md";

const OCT5 = "~/notes/daily/2026-10-05.md";

export const EDITING: Check[] = [
  ...(["kitty", "legacy"] as const).map(
    (keyboard): Check => ({
      area: "editing",
      name: `source Escape: INSERT, VISUAL and NORMAL act without another key (${keyboard})`,
      covers: {
        cases: ["source-mode", "editing", "selection"],
        commands: ["view.source", "edit.insert", "visual.char", "visual.exit"],
      },
      options: { open: MEETING, keyboard },
      run: async (s) => {
        await ready(s);
        await source(s);
        await s.keys("i");
        await s.status("SOURCE │ INSERT");
        await s.type("escape probe");
        await s.send("\x1b");
        await s.until(() => !s.statusLine().includes("INSERT"), 1500, "raw Escape leaves INSERT before another key");
        await s.status("SOURCE │ NORMAL");
        await s.keys("v");
        await s.status("SOURCE │ VISUAL");
        await s.keys("escape");
        s.expect(!s.statusLine().includes("VISUAL"), "Escape leaves VISUAL before another key");
        await s.keys("escape");
        await s.status("SOURCE");
        s.expect(!/INSERT|VISUAL/.test(s.statusLine()), "Escape in NORMAL keeps SOURCE in normal mode");
      },
    }),
  ),
  {
    area: "editing",
    name: "source editor: relative gutter and terminal bar while typing",
    covers: { cases: ["source-mode", "editing"], commands: ["view.source", "edit.insert", "note.edit"] },
    options: {
      open: MEETING,
      config: '[ui]\nrelative_numbers = "both"\n[editor]\ncommand = "sh -c \'echo CURSOR-EDITOR-PROBE\'"\n',
    },
    run: async (s) => {
      await ready(s);
      await source(s);
      await s.keys("j", "j", "i");
      await s.status("INSERT");
      s.expect(s.term.output.includes("\x1b[6 q"), "typing uses a steady terminal bar");
      await s.keys("escape");
      s.expect(!s.statusLine().includes("INSERT"), "Escape restores normal mode");
      const start = s.term.output.length;
      await leader(s, "n", "e");
      await s.until(
        () => s.term.output.slice(start).includes("CURSOR-EDITOR-PROBE"),
        3000,
        "editor ran while renderer suspended",
      );
      const beforeEditor = s.term.output.slice(start).split("CURSOR-EDITOR-PROBE")[0]!;
      s.expect(/\x1b\[(?:0)? q/.test(beforeEditor), "suspend restores cursor before the outside editor");
      await s.status("NORMAL");
      await s.quit();
      s.expect(/\x1b\[(?:0)? q/.test(s.term.output), "quit restores the terminal cursor style");
    },
  },
  // --- motions --------------------------------------------------------------------------------
  {
    area: "editing",
    name: "motions: j k h l, words, row ends, top and bottom, headings, paragraphs, pages",
    covers: {
      cases: ["cursor"],
      commands: [
        "cursor.down",
        "cursor.up",
        "cursor.right",
        "cursor.left",
        "cursor.line_start",
        "cursor.word_next",
        "cursor.word_end",
        "cursor.word_prev",
        "cursor.line_end",
        "cursor.first_nonblank",
        "cursor.bottom",
        "cursor.top",
        "cursor.heading_next",
        "cursor.heading_prev",
        "cursor.paragraph_next",
        "cursor.paragraph_prev",
        "cursor.half_down",
        "cursor.half_up",
        "cursor.page_down",
        "cursor.page_up",
      ],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await moveTo(s, ["j", "j", "j", "j", "j", "j"], (l) => l > 3, "j to move down");
      const down = pos(s).line;
      await moveTo(s, ["k", "k", "k"], (l) => l < down, "k to move up");
      await s.keys("g", "g", "]", "]", "j", "j"); // a body row, with words on it
      // Each key must move the right way from where the cursor was (strictly: not a check that passes when nothing
      // happened).
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
      await moveTo(s, ["shift+g"], (l) => l > 1100, "G to the bottom");
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
    area: "editing",
    name: "motions: f F t T ; , on the line; % to the matching bracket, in source mode",
    covers: {
      cases: ["cursor"],
      commands: ["cursor.find_char", "cursor.find_repeat", "cursor.line_end", "view.source", "cursor.match_bracket"],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await s.keys("]", "]", "j", "j", "0"); // onto the O1 decision line
      await s.until(() => pos(s).line > 6, 3000, "a body line");
      await moveTo(s, ["f", "e"], (_, c) => c > 1, "fe to an e");
      const c1 = pos(s).col;
      await moveTo(s, [";"], (_, c) => c > c1, "; to the next e");
      const c2 = pos(s).col;
      await moveTo(s, [","], (_, c) => c < c2, ", back to the previous e");
      const before = pos(s).col;
      await moveTo(s, ["t", "s"], (_, c) => c > before, "ts to just before the next s");
      // From the row's end, backwards: F onto an e, T to just after the D of "Decision", the row's first word.
      await moveTo(s, ["$"], (_, c) => c > 20, "$ to the row's end");
      const end = pos(s).col;
      await moveTo(s, ["shift+f", "e"], (_, c) => c < end && c > 2, "Fe back to an e");
      await moveTo(s, ["shift+t", "D"], (_, c) => c === 2, "TD back to just after the D");
      // The O1 heading's date, in brackets: % goes by the text, so not in the render; in source mode, to the other
      // one, and back.
      await moveTo(s, ["g", "g", "]", "]", "0"], (l) => l === 6, "]] onto O1's heading");
      await s.keys("%");
      await s.message("% goes by the text");
      await source(s);
      await moveTo(s, ["0", "f", "("], (_, c) => c > 1, "f( onto the bracket");
      const open = pos(s).col;
      await moveTo(s, ["%"], (_, c) => c === open + "(2025-02".length, "% to the closing bracket");
      await moveTo(s, ["%"], (_, c) => c === open, "% back to the opening one");
    },
  },
  {
    area: "editing",
    name: "screen and lines: ctrl+g and :120 go to a line; H M L; zz zt zb move the view, never the cursor",
    covers: {
      cases: ["cursor"],
      commands: [
        "cursor.goto_line",
        "cursor.screen_top",
        "cursor.screen_bottom",
        "cursor.screen_middle",
        "scroll.top",
        "scroll.bottom",
        "scroll.center",
      ],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "ctrl+g 300 to line 300");
      await s.keys(":");
      await s.type("120");
      await moveTo(s, ["enter"], (l) => l === 120, ":120 to line 120");
      await s.keys("shift+h");
      const top = pos(s).line;
      await s.keys("shift+l");
      await s.until(() => pos(s).line > top + 20, 3000, "L a screen below H");
      const bottom = pos(s).line;
      await s.keys("shift+m");
      await s.until(() => pos(s).line > top && pos(s).line < bottom, 3000, "M between H and L");
      // zt, zb and zz put the cursor's line where H, L and M land: each pair agrees, so a scroll that went nowhere
      // (or anywhere else) moves the cursor on the second key.
      const here = pos(s).line;
      for (const [z, key, what] of [
        ["t", "shift+h", "zt then H"],
        ["b", "shift+l", "zb then L"],
        ["z", "shift+m", "zz then M"],
      ] as const) {
        await s.keys("z", z);
        s.expect(pos(s).line === here, `z${z} moves the view, never the cursor`);
        await s.keys(key);
        s.expect(pos(s).line === here, `${what}: the same line`);
      }
    },
  },

  // --- selection and copy ---------------------------------------------------------------------
  {
    area: "editing",
    name: "visual: v and V select, o swaps ends, y copies, esc leaves",
    covers: {
      cases: ["selection"],
      commands: ["visual.char", "visual.swap", "visual.yank", "visual.line", "copy.selection", "visual.exit"],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await s.keys("]", "]", "j", "j");
      await s.until(() => pos(s).line > 6, 3000, "a body line");
      const c0 = pos(s).col;
      await s.keys("v");
      await s.status("VISUAL");
      await moveTo(s, ["l", "l", "l"], (_, c) => c === c0 + 3, "v l l l: three columns on");
      await moveTo(s, ["o"], (_, c) => c === c0, "o to the selection's other end");
      await s.keys("y");
      await s.message(/copied 4 characters/);
      await s.until(() => [...s.clipboard()].length === 4, 3000, "v l l l y to copy four characters");
      await s.keys("shift+v");
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
    area: "editing",
    name: "copy: yy the row, yp the path, yr a reference, yl a link",
    covers: { cases: ["copy"], commands: ["copy.path", "copy.ref", "copy.smart", "copy.link"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
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
      await copied(["y", "l"], (t) => /^https:\/\/example\.org\//.test(t), "yl to copy the link's target");
    },
  },
  {
    area: "editing",
    name: "typing: as in a desktop editor — shift+arrows select, typing replaces, ctrl+z and ctrl+y while typing, pagedown; shift+right then d in normal mode (DF-D15)",
    covers: {
      cases: ["selection", "editing"],
      commands: ["view.source", "edit.insert", "cursor.right", "visual.delete", "note.save"],
    },
    options: at("~/notes/projects/kestrel-v2-3.md"),
    run: async (s) => {
      const NOTE = "~/notes/projects/kestrel-v2-3.md";
      await ready(s);
      await source(s);
      await line(s, 19); // "Two things carried the release, …"
      await s.keys("0", "i");
      await s.status("INSERT");
      // shift+right three times, as a terminal sends it: "Two" selected; typing replaces it.
      for (let i = 0; i < 3; i++) await s.keys("shift+right");
      await s.type("TWO");
      await s.see("TWO things carried");
      await s.notSee("TWOTwo");
      // ctrl+z undoes while typing, and typing goes on; ctrl+y redoes.
      await s.keys("ctrl+z");
      await s.see("Two things carried");
      await s.notSee("TWO things carried");
      await s.status("INSERT");
      await s.keys("ctrl+y");
      await s.see("TWO things carried");
      await s.status("INSERT");
      // pagedown moves a page while typing, still typing: what's typed lands there.
      await moveTo(s, ["pagedown"], (l) => l > 39, "pagedown a page down while typing");
      await s.status("INSERT");
      const paged = pos(s).line;
      await s.keys("home");
      await s.type("PAGED ");
      await s.keys("escape");
      await s.status("SOURCE");
      // Not typing: shift+right selects (a visual selection), d deletes it.
      await line(s, 19);
      await s.keys("0", "w");
      await moveTo(
        s,
        ["shift+right", "shift+right", "shift+right", "shift+right", "shift+right"],
        (l, c) => l === 19 && c === 10,
        "shift+right over things",
      );
      await s.status("VISUAL");
      await s.keys("d");
      await s.see("TWO  carried the release");
      await s.keys("ctrl+s");
      await s.file(
        NOTE,
        (t) => t.split("\n")[18] === "TWO  carried the release, and everything else was small enough to ignore.",
        "TWO typed over Two, things deleted, written",
      );
      const lines = s.read(NOTE).split("\n");
      s.expect(
        lines[paged - 1]?.startsWith("PAGED ") === true,
        `PAGED typed on line ${paged}, where pagedown went:\n${lines.slice(paged - 3, paged + 2).join("\n")}`,
      );
      s.expect(lines.filter((l) => l.includes("PAGED")).length === 1, "PAGED typed once");
    },
  },

  // --- source mode, normal mode, vim's grammar -------------------------------------------------
  {
    area: "editing",
    name: "source mode: i a I A o O type; esc; u, ctrl+r, U; ctrl+z, ctrl+y; ctrl+s writes",
    covers: {
      cases: ["source-mode", "editing", "save"],
      commands: [
        "view.source",
        "edit.insert",
        "edit.append",
        "edit.insert_line_start",
        "edit.append_line_end",
        "edit.open_below",
        "edit.open_above",
        "note.save",
        "edit.undo",
        "edit.redo",
      ],
    },
    options: { open: MEETING },
    run: async (s) => {
      await ready(s);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("i");
      await s.status("INSERT");
      await s.type("[i]");
      await s.keys("escape");
      await s.keys("a");
      await s.type("[a]");
      await s.keys("escape", "shift+i");
      await s.type("[I]");
      await s.keys("escape", "shift+a");
      await s.type("[A]");
      await s.keys("escape", "o");
      await s.type("[o]");
      await s.keys("escape", "shift+o");
      await s.type("[O]");
      await s.keys("escape");
      await s.status("• unsaved");
      await s.keys("ctrl+s");
      await s.file(
        MEETING,
        (t) => ["[i]", "[a]", "[I]", "[A]", "[o]", "[O]"].every((x) => t.includes(x)),
        "all six inserts saved",
      );
      // u takes the last insert away, ctrl+r and U bring it back: each seen on the screen.
      await s.keys("u");
      await s.notSee("[O]");
      await s.keys("ctrl+r");
      await s.see("[O]");
      await s.keys("u");
      await s.notSee("[O]");
      await s.keys("shift+u");
      await s.see("[O]");
      await s.ex("w");
      await s.file(MEETING, (t) => t.includes("[O]"), "the redone insert saved");
      // The desktop's undo and redo, ctrl+z and ctrl+y, not typing.
      await s.keys("shift+a");
      await s.type(" (undo me)");
      await s.keys("escape", "ctrl+z");
      await s.notSee("(undo me)");
      await s.keys("ctrl+y");
      await s.see("(undo me)");
    },
  },
  {
    area: "editing",
    name: "normal mode: x d c y > < D C s S r ~ J p P, as vim leaves the text",
    covers: {
      cases: ["editing", "source-mode"],
      commands: [
        "cursor.bottom",
        "edit.open_below",
        "edit.delete_char",
        "edit.op_delete",
        "edit.op_change",
        "edit.op_yank",
        "edit.paste_after",
        "edit.paste_before",
        "edit.op_indent",
        "edit.op_outdent",
        "edit.delete_to_end",
        "edit.change_to_end",
        "edit.substitute",
        "edit.substitute_line",
        "edit.replace_char",
        "edit.toggle_case",
        "edit.join",
      ],
    },
    options: { open: MEETING },
    run: async (s) => {
      await ready(s);
      const before = s.read(MEETING);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("shift+g", "o");
      await s.type("alpha beta gamma delta");
      await s.keys("escape", "0", "x"); // lpha beta gamma delta
      await s.keys("d", "w"); // beta gamma delta
      await s.keys("c", "w");
      await s.type("BETA"); // BETA gamma delta
      await s.keys("escape", "y", "y", "p", "shift+p"); // three of it, the cursor on the middle one
      await s.keys(">", ">", "<", "<");
      await s.keys("w", "shift+d"); // "BETA ", its space kept
      await s.keys("0", "w", "shift+c"); // w onto the next line's first word
      await s.type("end");
      await s.keys("escape", "0", "s");
      await s.type("S"); // Snd
      await s.keys("escape", "shift+s");
      await s.type("whole line");
      await s.keys("escape", "0", "r", "W", "~"); // whole line
      await s.keys("k", "shift+j"); // joined to "BETA ": after its own space, no other
      await s.keys("ctrl+s");
      // The exact text vim leaves after the same keys.
      await s.file(
        MEETING,
        (t) => t === `${before}BETA gamma delta\nBETA whole line\n`,
        "the exact result of those keys",
      );
    },
  },
  {
    area: "editing",
    name: "visual mode in source: V > and V < indent and outdent, V d deletes, v c changes",
    covers: {
      cases: ["selection", "source-mode"],
      commands: ["visual.line", "visual.indent", "visual.outdent", "visual.delete", "visual.char", "visual.change"],
    },
    options: { open: MEETING },
    run: async (s) => {
      await ready(s);
      const before = s.read(MEETING);
      const lines = before.split("\n"); // its last element is the empty string after the last line break
      const last = lines.length - 2; // the last line's index
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("shift+g", "shift+v", "k", ">", "ctrl+s");
      await s.file(
        MEETING,
        (t) => {
          const l = t.split("\n");
          return [last - 1, last].every((i) => l[i] !== lines[i] && /^\s/.test(l[i]!) && l[i]!.trim() === lines[i]);
        },
        "V k > indenting the last two lines",
      );
      await s.keys("shift+g", "shift+v", "k", "<", "ctrl+s");
      await s.file(MEETING, (t) => t === before, "V k < outdenting them again");
      await s.keys("shift+g", "shift+v", "d");
      await s.keys("shift+g", "0", "v", "l", "c");
      await s.type("X");
      await s.keys("escape", "ctrl+s");
      const expected = [...lines.slice(0, last - 1), `X${lines[last - 1]!.slice(2)}`, ""].join("\n");
      await s.file(MEETING, (t) => t === expected, "V d deleting the last line, v l c X changing two characters");
    },
  },
  {
    area: "editing",
    name: "vim grammar: counts, F, text objects (iW, vi(), *, cgn and ., insert's ctrl+w and ctrl+u",
    covers: {
      cases: ["editing"],
      commands: [
        "view.source",
        "cursor.word_next",
        "cursor.find_char",
        "edit.delete_char",
        "visual.char",
        "visual.delete",
        "edit.op_delete",
        "find.word_next",
        "edit.op_change",
        "edit.repeat",
        "edit.open_below",
        "note.save",
      ],
    },
    options: at(OCT5),
    run: async (s) => {
      await ready(s);
      const before = s.read(OCT5);
      await source(s);
      // "Mon, Tue, Wed, …": 2w onto Tue, F, back to the comma, x.
      await line(s, 16);
      await s.keys("0", "2", "w", "shift+f", ",", "x");
      // "`queue.drain(batch)`": vi( d empties the brackets, diW takes the whole of it.
      await line(s, 37);
      await s.keys("0", "f", "(", "v", "i", "(", "d", "d", "i", "shift+w");
      // "The retry change is in. The retry ceiling …": * to the second, cgn changes it, . the third. (What's typed
      // isn't a match itself: a search is case-blind, and gn takes a match under the cursor.)
      await line(s, 48);
      await s.keys("0", "w", "*", "c", "g", "n");
      await s.type("attempt");
      await s.keys("escape", ".");
      // A line typed, its last word taken by ctrl+w, the rest by ctrl+u; then 3x.
      await s.keys("o");
      await s.type("typo word");
      await s.keys("ctrl+w"); // typo
      await s.type("fixed");
      await s.keys("ctrl+u"); // what was typed on the line
      await s.type("final");
      await s.keys("escape", "0", "3", "x", "ctrl+s"); // al
      // What vim gives for the same keys.
      let expected = withLine(
        before,
        16,
        "Mon Tue, Wed, Thu, Fri: one big thing a day, and the big thing for Monday is this note.",
      );
      expected = withLine(
        expected,
        37,
        "The queue's drain call is  and the thing it returns is the batch minus whatever was skipped.",
      );
      expected = withLine(
        expected,
        48,
        "The retry change is in. The attempt ceiling is in. The attempt alert is not, and I keep forgetting that.\nal",
      );
      await s.file(OCT5, (t) => t === expected, "the exact result of those keys");
    },
  },
  {
    area: "editing",
    name: "repeat: . after an o begun in the render opens the same line again; . after a terminal's paste in normal mode puts it again, not the x before",
    covers: {
      cases: ["editing", "lens"],
      commands: ["edit.open_below", "edit.repeat", "view.source", "edit.delete_char", "note.save"],
    },
    options: at(OCT5),
    run: async (s) => {
      await ready(s);
      const before = s.read(OCT5);
      await s.status("READ");
      await findText(s, "Ask Aiko to look");
      // The first o opens the lens (editor.edit_in's default), the second a line under the cursor's.
      await s.keys("o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("xy");
      await s.keys("escape");
      await s.keys("j", "j", ".", "ctrl+s");
      const repeated = before
        .replace("Ask Aiko to look at the preview image.\n", "Ask Aiko to look at the preview image.\nxy\n")
        .replace("not Friday evening.\n", "not Friday evening.\nxy\n");
      await s.file(OCT5, (t) => t === repeated, "the o repeated below the week's review");
      // A paste as the terminal sends it (bracketed), in normal mode: put after the cursor, like p; . puts it again.
      await s.keys("escape");
      await s.notSee("source · line");
      await source(s);
      await moveTo(s, ["shift+g"], (l) => l > 70, "the last line");
      await s.keys("0", "x"); // hat is the day.
      await s.paste("ZZ"); // hZZat is the day.
      s.expect(!s.statusLine().includes("INSERT"), "still in normal mode after the paste");
      await s.keys(".", "ctrl+s");
      await s.file(
        OCT5,
        (t) => t === repeated.replace("That is the day.", "hZZZZat is the day."),
        "the paste put again, the x not repeated",
      );
    },
  },

  // --- lines, changes, cut, comments, spelling --------------------------------------------------
  {
    area: "editing",
    name: "moving lines: alt+shift+down and up, from the render; V's lines together, one undo step",
    covers: {
      cases: ["editing"],
      commands: ["edit.move_line_down", "edit.move_line_up", "visual.line", "edit.undo", "note.save"],
    },
    options: at(SEPT1),
    run: async (s) => {
      await ready(s);
      const before = s.read(SEPT1);
      await findText(s, "Lunch: walk");
      // From the render, the key opens the lens first (editor.edit_in); again, it moves the line.
      await s.keys("alt+shift+down");
      await s.status("LENS");
      await s.keys("alt+shift+down");
      const is =
        (...want: string[]) =>
        () =>
          order(s).join(" ") === want.join(" ");
      await s.until(is("Morning", "Afternoon", "Lunch", "Evening", "Tomorrow"), 3000, "Lunch moved below Afternoon");
      await s.keys("shift+v", "j", "alt+shift+up");
      await s.until(is("Morning", "Lunch", "Evening", "Afternoon", "Tomorrow"), 3000, "V j: two lines moved up");
      await s.keys("escape", "u");
      await s.until(is("Morning", "Afternoon", "Lunch", "Evening", "Tomorrow"), 3000, "u: the two lines' move undone");
      await s.keys("ctrl+s");
      await s.file(
        SEPT1,
        (t) =>
          t ===
          before.replace("- Lunch: walk\n- Afternoon: write it up\n", "- Afternoon: write it up\n- Lunch: walk\n"),
        "the moved line saved",
      );
    },
  },
  {
    area: "editing",
    name: "the change list: g ; and g , walk the places changed; g i types where it last stopped",
    covers: {
      cases: ["changes"],
      commands: ["view.source", "edit.append_line_end", "change.prev", "change.next", "edit.insert_last", "note.save"],
    },
    options: at("~/notes/daily/2026-08-17.md"),
    run: async (s) => {
      const NOTE = "~/notes/daily/2026-08-17.md";
      await ready(s);
      await source(s);
      await line(s, 31); // "Wrong for a road bike."
      await s.keys("shift+a");
      await s.type(" Very.");
      await s.keys("escape");
      await line(s, 73); // "Ride tomorrow if the rain holds."
      await s.keys("shift+a");
      await s.type(" Or not.");
      await s.keys("escape");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg to the top");
      await moveTo(s, ["g", ";"], (l) => l === 73, "g; to the newest change");
      await moveTo(s, ["g", ";"], (l) => l === 31, "g; to the one before");
      await moveTo(s, ["g", ","], (l) => l === 73, "g, to the newer one again");
      await s.keys("g", ",");
      await s.message(/newest change/);
      // gi: typing again where it last stopped — the end of line 73, wherever the cursor is now.
      const end = "Ride tomorrow if the rain holds. Or not.".length + 1;
      await s.keys("g", "g", "g", "i");
      await s.status("INSERT");
      await moveTo(s, [], (l, c) => l === 73 && c === end, "gi at the end of the last change");
      await s.type("!");
      await s.keys("escape", "ctrl+s");
      await s.file(
        NOTE,
        (t) =>
          t.split("\n")[30] === "Wrong for a road bike. Very." &&
          t.split("\n")[72] === "Ride tomorrow if the rain holds. Or not.!",
        "both changes and gi's saved",
      );
    },
  },
  {
    area: "editing",
    name: "cut and paste: ctrl+x cuts the cursor's line, ctrl+v puts it under the line the cursor is on",
    covers: { cases: ["copy", "editing"], commands: ["edit.cut", "edit.paste", "note.save"] },
    options: at(SEPT1),
    run: async (s) => {
      await ready(s);
      const before = s.read(SEPT1);
      await findText(s, "Lunch: walk");
      // On the render, with nothing selected, the first opens the lens; the second cuts.
      await s.keys("ctrl+x");
      await s.status("LENS");
      await s.keys("ctrl+x");
      await s.notSee("Lunch: walk");
      await s.until(() => s.clipboard().includes("- Lunch: walk"), 3000, "the cut line on the clipboard");
      await s.keys("ctrl+v");
      await s.until(
        () => order(s).join(" ") === "Morning Afternoon Lunch Evening Tomorrow",
        3000,
        "the line put under Afternoon",
      );
      await s.keys("ctrl+s");
      await s.file(
        SEPT1,
        (t) =>
          t ===
          before.replace("- Lunch: walk\n- Afternoon: write it up\n", "- Afternoon: write it up\n- Lunch: walk\n"),
        "the line moved by cut and paste, saved",
      );
    },
  },
  {
    area: "editing",
    name: "comments: ctrl+/ comments a line out and back in; g c with a motion; V's lines with g c",
    covers: {
      cases: ["editing"],
      commands: ["view.live", "edit.comment_line", "edit.op_comment", "visual.line", "visual.comment", "note.save"],
    },
    options: at(SEPT1),
    run: async (s) => {
      await ready(s);
      const before = s.read(SEPT1);
      await findText(s, "Lunch: walk");
      await leader(s, "n", "l");
      await s.status("LENS");
      // A note's comments are HTML's.
      await s.keys("ctrl+/");
      await s.see("<!-- - Lunch: walk -->");
      await s.keys("ctrl+/");
      await s.notSee("<!-- - Lunch: walk -->");
      await s.see("- Lunch: walk");
      await s.keys("g", "c", "j");
      await s.see("<!-- - Lunch: walk -->");
      await s.see("<!-- - Afternoon: write it up -->");
      await s.keys("shift+v", "j", "g", "c");
      await s.notSee("<!-- - Afternoon: write it up -->");
      await s.notSee("<!-- - Lunch: walk -->");
      await s.keys("ctrl+/", "ctrl+s"); // gc left visual mode, on the first of its lines
      await s.file(
        SEPT1,
        (t) => t === before.replace("- Lunch: walk\n", "<!-- - Lunch: walk -->\n"),
        "one line commented",
      );
      // Rendered again, the comment isn't drawn.
      await s.keys("escape");
      await s.notSee("source · line");
      await s.notSee("Lunch: walk");
      await s.see("Afternoon: write it up");
    },
  },
  {
    area: "editing",
    name: "spelling: ] s and [ s go to a misspelt word, z = puts a suggestion in, z g adds it to your words",
    covers: {
      cases: ["editing", "ui"],
      commands: ["ui.spell", "spell.next", "spell.prev", "spell.suggest", "spell.add", "edit.undo"],
    },
    options: at("~/notes/reading/okuma-notlari.md"),
    run: async (s) => {
      const misspelt = () => s.cliIn("~/notes", "spell", "reading/okuma-notlari.md").out;
      s.expect(misspelt().includes("kitpa"), `the CLI finds kitpa misspelt:\n${misspelt()}`);
      await ready(s);
      await leader(s, "u", "s");
      await s.message("Spelling: on");
      // "Bu hafta iki kitpa okudum": the note's one misspelt word (its code span's isn't).
      // The dictionaries load in the background: [ s from the end, until it lands.
      await s.retry(
        () => s.keys("shift+g", "[", "s"),
        () => pos(s).line === 8,
        "[ s back to kitpa",
        1000,
        20000,
      );
      await moveTo(s, ["g", "g", "]", "s"], (l, c) => l === 8 && c === 14, "] s onto kitpa");
      await s.keys("z", "=");
      await s.see("kitap");
      await s.keys("enter");
      await s.see("iki kitap okudum");
      await s.status("unsaved");
      await s.keys("u");
      await s.see("iki kitpa okudum");
      await s.keys("z", "g");
      await s.message('"kitpa" added to your words');
      // Your words are the CLI's too.
      await s.until(() => !misspelt().includes("kitpa"), 3000, "kitpa no longer misspelt for the CLI");
    },
  },
  {
    area: "editing",
    name: "spelling: while a dictionary loads, keys are answered and ] s says so; let go, ] s goes to the misspelt",
    covers: { cases: ["ui"], commands: ["ui.spell", "spell.next"] },
    options: {
      ...at("~/notes/reading/okuma-notlari.md"),
      // Turkish as your own dictionary, its words at a path of the check's, held before they're built.
      config: '[spell]\ndictionaries = { tr = "{dir}/dict/tr.dic" }\n',
      ...holdingSpell("{dir}/dict/tr.dic"),
      setup: (s) => ownDictionary(s, "tr"),
    },
    run: async (s) => {
      await ready(s);
      await leader(s, "u", "s");
      await s.message("Spelling: on");
      await heldSpell(s, "the spell checker's thread waiting before it builds Turkish");
      // Held: keys answered, and ] s says the dictionaries are loading.
      await moveTo(s, ["g", "g", "j", "j", "j"], (l) => l > 1, "j answered while the dictionary loads");
      await s.keys("]", "s");
      await s.message("spelling: its dictionaries are loading");
      s.expect(holdState(s) === "waiting", `the thread still held, not ${holdState(s)}`);
      // Let go: built, and ] s goes to the note's one misspelt word, "kitpa" (column 14), not its code span's.
      await letGoSpell(s);
      const there = () => pos(s).line === 8 && pos(s).col === 14;
      await s.retry(() => s.keys("g", "g", "]", "s"), there, "] s onto kitpa", 1000, 20000);
    },
  },
  // typos: off
  {
    area: "editing",
    name: "spelling: a dictionary that won't load is said once; the note's other languages still check it",
    covers: { cases: ["ui"], commands: ["ui.spell", "spell.next"] },
    options: {
      ...at("~/notes/reading/two-languages.md"),
      // zz's words a folder: there, but nothing to read. English as your own, held before it's built: frames drawn
      // after zz failed, while English still loads, each ask about zz again.
      config: '[spell]\ndictionaries = { zz = "{dir}/dict/zz.dic", en = "{dir}/dict/en.dic" }\n',
      ...holdingSpell("{dir}/dict/en.dic"),
      setup: (s) => {
        mkdirSync(join(s.dir, "dict", "zz.dic"), { recursive: true });
        writeFileSync(join(s.dir, "dict", "zz.aff"), "SET UTF-8\n");
        ownDictionary(s, "en");
        s.write("~/notes/reading/two-languages.md", "---\nlang: [zz, en]\n---\nThis has a recieve.\n");
      },
    },
    run: async (s) => {
      const said = /spelling: zz's dictionary didn't load \(/;
      await ready(s);
      await leader(s, "u", "s");
      await s.message("Spelling: on");
      await s.message(said);
      await heldSpell(s, "English held before it's built");
      // Frames drawn while English waits, each asking about zz again; then English let go, held no longer than that.
      await s.keys("j", "k", "j", "k");
      await letGoSpell(s);
      // English checks the note: ] s onto its typo.
      const there = () => pos(s).line === 4 && pos(s).col === 12;
      await s.retry(() => s.keys("g", "g", "]", "s"), there, "] s onto recieve", 1000, 20000);
      // zz said once, all those frames since, as the messages list has it (its floating box gone first).
      await s.notSee(said);
      await s.ex("messages");
      await s.see("Spelling: on");
      const lines = s.screen().filter((row) => said.test(row));
      s.expect(lines.length === 1, `said once, not ${lines.length} times:\n${lines.join("\n")}`);
    },
  },
  // typos: on

  // --- tabs, saving, quitting -----------------------------------------------------------------
  {
    area: "editing",
    name: "pinned tabs: a link from a pinned tab opens in a new one; close all keeps the pinned",
    covers: { cases: ["tabs"], commands: ["tab.pin", "link.follow", "tab.close_all"] },
    options: at(SEPT1),
    run: async (s) => {
      await ready(s);
      await s.keys("ctrl+t", "m");
      await s.see(/1 \S+ 2026-09-01\.md/);
      await follow(s, "Q4 OKRs");
      await opened(s, "projects/q4-okrs.md");
      await s.see(/2 q4-okrs\.md/);
      await s.see(/1 \S+ 2026-09-01\.md/);
      await s.keys("ctrl+t", "shift+q");
      await s.notSee(/2 q4-okrs\.md/);
      await s.see(/1 \S+ 2026-09-01\.md/);
      await opened(s, "daily/2026-09-01.md");
    },
  },
  {
    area: "editing",
    name: "save all: :wa writes every changed note, on screen or not; the word count follows the typing",
    covers: {
      cases: ["save", "words"],
      commands: ["view.source", "edit.open_below", "switcher.open", "note.save_all"],
    },
    options: at(SEPT1),
    run: async (s) => {
      const AUG17 = "~/notes/daily/2026-08-17.md";
      await ready(s);
      const words = () => Number(/([\d,]+) words/.exec(s.statusLine())?.[1]?.replaceAll(",", "") ?? Number.NaN);
      await s.until(() => words() > 100, 3000, "the note's word count");
      const w0 = words();
      await source(s);
      await s.keys("shift+g", "o");
      await s.type("Three more words");
      await s.keys("escape");
      await s.until(() => words() === w0 + 3, 3000, `the word count from ${w0} to ${w0 + 3}`);
      await s.status("unsaved");
      // Another note in its place, changed too: both unsaved, one of them off the screen.
      await open(s, "2026-08-17");
      await source(s);
      await s.keys("shift+g", "o");
      await s.type("Another line");
      await s.keys("escape");
      await s.status("unsaved");
      await s.ex("wa");
      await s.file(
        SEPT1,
        (t) => t.endsWith("Tomorrow: the all-hands\n- Three more words\n"), // o goes on with the list
        "the note off the screen saved",
      );
      await s.file(AUG17, (t) => t.endsWith("rain holds.\nAnother line\n"), "the note on the screen saved");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "nothing unsaved");
    },
  },
  {
    area: "editing",
    name: "save and quit: :wq writes and exits",
    covers: { cases: ["save"], commands: ["view.source", "app.save_quit"] },
    options: { open: MEETING },
    run: async (s) => {
      await ready(s);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("shift+g", "o");
      await s.type("last words");
      await s.keys("escape");
      await s.ex("wq");
      await s.until(() => s.exited(), 5000, "slipbox to exit");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
      s.expect(s.read(MEETING).includes("last words"), ":wq wrote the note");
    },
  },
  {
    area: "editing",
    name: "quitting: q closes a split; on the last window it says ctrl+q, and :q quits",
    covers: { cases: ["save", "windows"], commands: ["window.split_side", "window.close", "window.close_or_quit"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      const windows = () => s.text().split("§ ").length - 1;
      await s.until(() => windows() === 1, 3000, "one window");
      await s.keys("ctrl+w", "v");
      await s.until(() => windows() === 2, 3000, "two windows");
      await s.keys("q");
      await s.until(() => windows() === 1, 3000, "q closed one");
      await s.keys("q");
      await s.message(/ctrl\+q/);
      await s.ex("q");
      await s.until(() => s.exited(), 5000, ":q on the last window quits");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
    },
  },
  {
    area: "editing",
    name: "find: N from the bottom finds the match above; space f g opens a note at a match in the vault",
    covers: { cases: ["find", "vault-find"], commands: ["find.open", "cursor.bottom", "find.prev", "find.vault"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await s.keys("/");
      await s.type("Weather");
      await s.keys("enter", "shift+g", "shift+n");
      await s.until(() => pos(s).line < 1200 && pos(s).line > 1, 3000, "N found a match above");
      await leader(s, "f", "g");
      await s.type("Tomasz: book the courier");
      await s.keys("enter");
      await s.see(/match(es)? in 1 file/);
      await s.keys("enter");
      await opened(s, MEETING);
      await s.until(() => pos(s).line === 17, 3000, "the cursor on the match's line");
    },
  },

  // --- outside changes, reload, autosave -------------------------------------------------------
  {
    area: "editing",
    name: "conflict: an agent writes while you have changes; the prompt; :w! and :e!",
    covers: {
      cases: ["conflict"],
      commands: ["view.source", "note.resolve", "note.save_force", "note.revert"],
    },
    options: { open: MEETING },
    run: async (s) => {
      await ready(s);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("shift+g", "o");
      await s.type("mine");
      await s.keys("escape");
      await s.status("unsaved");
      s.write(MEETING, `${s.read(MEETING)}\ntheirs\n`);
      await s.see("(l) Load theirs", 5000);
      await s.keys("escape");
      await s.notSee("(l) Load theirs");
      // space n c brings the prompt back: its choices again (the toast alone would say "changed on disk").
      await leader(s, "n", "c");
      await s.see("(l) Load theirs");
      await s.keys("escape");
      await s.ex("w!");
      await s.file(MEETING, (t) => t.includes("mine") && !t.includes("theirs"), "yours written over theirs");
      await s.keys("o");
      await s.type("unsaved");
      await s.keys("escape");
      await s.status("• unsaved");
      const typed = () => s.screen().some((r) => /\s\d+\s+unsaved(\s|$)/.test(r));
      s.expect(typed(), "the typed line on screen");
      await s.ex("e!");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the changes dropped");
      await s.until(() => !typed(), 3000, "the typed line gone from the screen, not just the marker");
      s.expect(!s.read(MEETING).includes("unsaved"), "e! wrote nothing");
    },
  },
  {
    area: "editing",
    name: "reload: space n r on a note with unsaved changes, the file as it was — asks to discard; n keeps them, autosave still on; y reloads, u brings them back (DF-D6)",
    covers: {
      cases: ["autosave", "reload"],
      commands: ["view.source", "note.reload", "edit.undo"],
    },
    options: { open: MEETING, config: "[editor]\nautosave_ms = 6000\n" },
    run: async (s) => {
      await ready(s);
      const before = s.read(MEETING);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("shift+g", "o");
      await s.type("kept after n");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "n", "r");
      await s.see("Discard your changes to meetings/2026-09-14-weekly.md?");
      s.expect(s.rowOf("(l) Load theirs") < 0, "not the conflict prompt: the file hasn't changed");
      await s.keys("n");
      await s.notSee("Discard your changes");
      await s.see("kept after n");
      await s.status("unsaved");
      s.expect(
        !s.statusLine().includes("differs from disk"),
        `kept as an edit, not a conflict kept (autosave off):\n${s.statusLine()}`,
      );
      // Autosave was left on: with no key pressed, it writes the text kept.
      await s.file(MEETING, (t) => t.includes("kept after n"), "autosave to write the text kept", 15000);
      await s.message("autosaved");
      // Again, and y: the file as it is on disk; u brings the changes back.
      await s.keys("o");
      await s.type("dropped by y");
      await s.keys("escape");
      await s.status("unsaved");
      await leader(s, "n", "r");
      await s.see("Discard your changes to meetings/2026-09-14-weekly.md?");
      await s.keys("y");
      await s.notSee("dropped by y");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "the note as saved");
      await s.see("kept after n");
      s.expect(!s.read(MEETING).includes("dropped by y") && s.read(MEETING) !== before, "the file as autosave left it");
      await s.keys("u");
      await s.see("dropped by y");
    },
  },

  // --- the lens -------------------------------------------------------------------------------
  {
    area: "editing",
    name: "lens: space n l edits in place; + - = its size; esc esc closes it",
    covers: {
      cases: ["lens"],
      commands: ["view.live", "lens.grow", "lens.shrink", "lens.reset", "edit.append_line_end", "note.save"],
    },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await s.keys("]", "]", "j", "j");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.see("source · line");
      // Its size by hand: + a block more, - one less, = its own size.
      const lines = () => /source · lines? (\d+)(?:–(\d+))?/.exec(s.text())?.slice(1).map(Number) ?? [];
      const size = () => {
        const [a, b] = lines();
        return (b ?? a!) - a! + 1;
      };
      const before = size();
      await s.type("+");
      await s.until(() => size() > before, 3000, "+ to grow the lens");
      const grown = size();
      await s.type("-");
      await s.until(() => size() < grown, 3000, "- to shrink it");
      await s.type("-");
      await s.until(() => size() < before, 3000, "- again, smaller than it opened");
      await s.type("=");
      await s.until(() => size() === before, 3000, "= its own size again");
      // Its mode: typing says "editing".
      await s.keys("shift+a");
      await s.see("editing · line");
      await s.type(" (lens)");
      await s.keys("escape");
      await s.see("source · line");
      await s.keys("ctrl+s");
      await s.file(HANDBOOK, (t) => t.includes(" (lens)"), "the lens edit saved");
      await s.keys("escape");
      await s.notSee("source · line");
      await s.status("READ");
    },
  },
  {
    area: "editing",
    name: "lens: a link followed from it opens the lens on the new note — its text drawn, typing lands there; ctrl+o back to the first",
    covers: {
      cases: ["lens"],
      commands: ["view.live", "link.follow", "edit.insert", "note.save", "history.back"],
    },
    options: at(OCT5),
    run: async (s) => {
      const W41 = "~/notes/weekly/2026-W41.md";
      await ready(s);
      const before = { oct5: s.read(OCT5), w41: s.read(W41) };
      await findText(s, "is due by Friday noon");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.see("The [week's review](../weekly/2026-W41.md) is due by Friday noon");
      // Onto the link (its text: the status line names a link only in the rendered view).
      await s.keys("0", "f", "w");
      await s.until(() => pos(s).line === 73 && pos(s).col === 6, 3000, "the cursor on the link's text");
      await s.keys("enter");
      // The weekly note's own text, in the lens still — none of the daily's left on screen.
      await s.see("Week 41, 5 October onwards");
      await s.notSee("Wrote  it  down  twice");
      await s.status("LENS");
      await opened(s, "weekly/2026-W41.md");
      // Typing on its line 9 changes that line. Down to it by j, one line at a time (:9 would be a jump, which ctrl+o
      // goes back from first).
      for (let n = pos(s).line; n < 9; n++) await moveTo(s, ["j"], (l) => l === n + 1, `j to line ${n + 1}`);
      await s.keys("0", "i", "Z", "escape", "ctrl+s");
      await s.file(
        W41,
        (t) => t === withLine(before.w41, 9, `Z${before.w41.split("\n")[8]}`),
        "Z typed at its line 9's start",
      );
      s.expect(s.read(OCT5) === before.oct5, "the daily note untouched");
      // Back: the daily note's own text again.
      await s.keys("ctrl+o");
      await opened(s, "daily/2026-10-05.md");
      await s.see("The [week's review](../weekly/2026-W41.md)");
      await s.notSee("Week 41, 5 October onwards");
    },
  },

  // --- tasks ----------------------------------------------------------------------------------
  {
    area: "editing",
    name: "tasks: ctrl+l ticks a checkbox in the render and writes it — the innermost of nested ones; in source mode with unsaved changes, in the text",
    covers: { cases: ["tasks"], commands: ["task.toggle", "view.source", "edit.open_below"] },
    options: at("~/notes/daily/2026-08-21.md"),
    run: async (s) => {
      const NOTE = "~/notes/daily/2026-08-21.md";
      await ready(s);
      const before = s.read(NOTE);
      await findText(s, "Look in the other bag");
      await s.keys("ctrl+l");
      await s.message("done ✓");
      // Only that one character, of the innermost task: its parents keep theirs.
      const ticked = before.replace("    - [ ] Look in the other bag", "    - [x] Look in the other bag");
      await s.file(NOTE, (t) => t === ticked, "the innermost task ticked on disk, nothing else");
      // With unsaved changes, the tick is in the text, as an edit: the file waits for a save.
      await source(s);
      await s.keys("shift+g", "o");
      await s.type("one more");
      await s.keys("escape");
      await findText(s, "Charger and the adapter");
      await s.keys("ctrl+l");
      await s.message("done ✓ (unsaved)");
      await s.see("- [x] Charger and the adapter");
      s.expect(s.read(NOTE) === ticked, "the file untouched while unsaved");
    },
  },
  {
    area: "editing",
    name: "tasks: none in a data file — ctrl+l on a `- [ ]` in a YAML string changes nothing",
    covers: { cases: ["tasks-tags"], commands: ["task.toggle"] },
    options: at("~/work/kestrel/config/base.yaml"),
    run: async (s) => {
      const FILE = "~/work/kestrel/config/base.yaml";
      await ready(s);
      const before = s.read(FILE);
      await findText(s, "bump tiles");
      await s.keys("ctrl+l");
      await s.message("no task here");
      s.expect(s.read(FILE) === before, "the file untouched");
      s.expect(!s.statusLine().includes("unsaved"), "nothing changed in the text either");
    },
  },

  // --- new notes ------------------------------------------------------------------------------
  {
    area: "editing",
    name: "create: ctrl+n a note, typed and saved; the explorer's N a folder and n a note in it; :mkdir",
    covers: { cases: ["new-note"], commands: ["note.create", "note.save", "explorer.cycle", "folder.create"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      await ready(s);
      await s.keys("ctrl+n");
      await s.see("new note in handbook/");
      await s.type("checklist");
      await s.keys("enter");
      await s.status("INSERT");
      await s.type("First item");
      await s.keys("escape", "ctrl+s");
      await s.file("handbook/checklist.md", (t) => t === "# checklist\n\nFirst item\n", "the new note saved");
      // In the explorer: a folder, then a note in it.
      // space e goes around the explorer: open, focused, closed.
      for (let i = 0; i < 3; i++) {
        await leader(s, "e");
        if (
          await s.status("FILES", 1000).then(
            () => true,
            () => false,
          )
        )
          break;
      }
      await s.status("FILES");
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

  // --- the scratch, the context, the hand-off ---------------------------------------------------
  {
    area: "editing",
    name: "scratch: add, shown floating at once, typing a note; esc then q closes it; open, copy, clear",
    covers: { cases: ["scratch"], commands: ["scratch.add", "scratch.open", "scratch.copy", "scratch.clear"] },
    run: async (s) => {
      await ready(s);
      await s.keys("j", "j");
      // What's added shows at once, the scratch floating over the note, typing a note after it (D229); esc then q,
      // back in the note.
      await leader(s, "s", "a");
      await s.see(SCRATCH_FLOATING);
      await s.status(/INSERT .*scratch/);
      await s.type("check the date");
      await s.keys("escape", "q");
      await s.notSee(SCRATCH_FLOATING);
      await s.status(/home\.md/);
      await leader(s, "s", "s");
      await s.see(SCRATCH_FLOATING);
      await leader(s, "s", "y");
      await s.message("copied");
      // What space s a added: home's third row, with its path and line, and the note on it.
      await s.until(
        () => /\*\*At:\*\* `home\.md:\d+`\n\n\*\*Note:\*\* check the date\n/.test(s.clipboard()),
        3000,
        "the scratch holding home.md:line and its note",
      );
      await s.keys("q");
      await s.notSee(SCRATCH_FLOATING);
      await leader(s, "s", "d");
      await s.see("Clear the scratch?"); // a question: its own window
      await s.type("y");
      await leader(s, "s", "y");
      await s.message("the scratch is empty");
    },
  },
  {
    area: "editing",
    name: "scratch: on the right — space s r; the UI settings make it where it opens; a capture goes there, typing a note",
    covers: { cases: ["scratch"], commands: ["scratch.open_right", "ui.scratch_in"] },
    run: async (s) => {
      await ready(s);
      await leader(s, "s", "r");
      await s.status(/scratch/);
      await s.see(/[┃│] scratch\s/); // the window on the right, its title
      await s.keys("q");
      await s.notSee(/[┃│] scratch\s/);
      await s.status(/home\.md/);
      // On the right from now on: picked in the UI settings.
      await leader(s, "u", "u");
      await s.see("UI settings");
      await s.type("Scratch opens");
      await s.keys("enter");
      await s.message("Scratch opens: on the right");
      await leader(s, "s", "s");
      await s.see(/[┃│] scratch\s/);
      s.expect(s.rowOf(SCRATCH_FLOATING) < 0, "not floating");
      // Back in the note, a capture: the cursor in the scratch beside it, typing its note.
      await s.keys("ctrl+w", "w");
      await s.status(/home\.md/);
      await s.keys("j", "j");
      await leader(s, "s", "a");
      await s.message("added to the scratch");
      await s.see(/home\.md:\d+/);
      await s.status(/INSERT .*scratch/);
      await s.type("ask why");
      await s.keys("escape");
      await s.see("ask why");
      s.expect(s.rowOf(SCRATCH_FLOATING) < 0, "on the right, not floating");
    },
  },
  {
    area: "editing",
    name: "context: a note's context copied for an agent — what it links to, what links to it",
    covers: { cases: ["scratch"], commands: ["switcher.open", "context.copy"] },
    run: async (s) => {
      await ready(s);
      await open(s, "kenji-mori");
      await leader(s, "s", "c");
      await s.message("copied the context of people/kenji-mori.md");
      await s.until(() => s.clipboard().startsWith("# Context: people/kenji-mori.md\n"), 3000, "the bundle copied");
      s.expect(s.clipboard().includes("`projects/variable-star-survey.md:1-"), "what it links to, with its lines");
      s.expect(/`home\.md:1-\d+` — links to people\/kenji-mori\.md/.test(s.clipboard()), "what links to it");
    },
  },
  {
    area: "editing",
    name: "hand-off: space n e runs the editor and comes back; send to a remote editor",
    covers: { cases: ["editing"], commands: ["note.edit", "note.send", "note.send_pick"] },
    // Each editor leaves a file behind, so the check is that it really ran, with the note's path.
    options: {
      config: `[editor]\ncommand = "sh -c 'echo $0 > $1' {file} {dir}/ran-edit"\nremote = ["sh -c 'echo $0 > $1' {file} {dir}/ran-send"]\n`,
    },
    run: async (s) => {
      const ran = (what: string) => join(s.dir, what);
      await ready(s);
      await leader(s, "n", "e");
      await s.until(() => existsSync(ran("ran-edit")), 5000, "the editor to run");
      await s.status("home.md", 5000);
      s.expect(readFileSync(ran("ran-edit"), "utf8").trim().endsWith("home.md"), "the editor got the note");
      await leader(s, "n", "s");
      await s.until(() => existsSync(ran("ran-send")), 5000, "the remote editor to run");
      s.expect(readFileSync(ran("ran-send"), "utf8").trim().endsWith("home.md"), "the remote editor got the note");
      await leader(s, "n", "p");
      await s.keys("escape");
    },
  },

  // --- safety ---------------------------------------------------------------------------------
  {
    area: "editing",
    name: "safety: a note's control sequences, read, in source mode and edited in the lens, never reach the terminal",
    covers: { cases: ["safety"], commands: ["view.source", "view.live", "edit.append_line_end"] },
    options: at("~/notes/research/terminal-escapes-in-logs.md"),
    run: async (s) => {
      await ready(s);
      const title = s.title();
      /** What the note holds, as a terminal would act on it: never sent. */
      const leaked = () =>
        ["\x1b]0;you have been pwned", "\x1b]52;c;SGVsbG8=", "\x1b[2J\x1b[Hcleared", "\x1b]8;;https://evil"].filter(
          (x) => s.term.output.includes(x),
        );
      await s.see("Terminal escapes in logs");
      await source(s);
      await s.see("sets the window title");
      await findText(s, "sets the window title");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("shift+a");
      await s.type(" (seen)");
      await s.keys("escape");
      await s.see("(seen)");
      s.expect(leaked().length === 0, `sent to the terminal: ${JSON.stringify(leaked())}`);
      s.expect(s.osc52().length === 0, `a copy made: ${JSON.stringify(s.osc52())}`);
      s.expect(!/pwned/.test(s.title()) && s.title() === title, `the title changed: ${JSON.stringify(s.title())}`);
      s.expect(s.topBar().includes("slipbox"), "the top bar still drawn: the screen never cleared");
    },
  },
];

export const LEFT_OUT_EDITING: LeftOut = {};
