// What comes from outside (agents' edits, the watcher, the CLI beside the TUI), language servers, linters, the
// problems panel, your shell, and export (TT-T7).

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { newParseCache } from "../../../src/core/parse.ts";
import { parseNoteFile } from "../../../src/core/readers.ts";
import { loadTheme } from "../../../src/core/theme/index.ts";
import {
  explorerOpen,
  type Check,
  explorerRow,
  exported,
  HANDBOOK,
  inSwitcher,
  type LeftOut,
  leader,
  MEETING,
  moveTo,
  open,
  opened,
  pos,
  problemListed,
  SCRATCH_FLOATING,
  signed,
  TSC,
} from "../check.ts";
import { type Session, sleep } from "../session.ts";
import { messagesSaying } from "./links-and-files.ts";

const KENJI = "people/kenji-mori.md";
/** The reference set's share links (kestrel's web app): a type error on purpose, a function used from another file. */
const SHARE = "home/work/kestrel/src/routes/share.ts";

/**
 * TypeScript's own server, the repository's (19.x): nothing installed or fetched, the only server of its files. Code
 * in source mode, a line to a row, each numbered; kestrel trusted, so nothing asks first (23.x).
 */
const TS_CONFIG = `[render]
code = "source"

[lsp]
enabled = true
auto_install = false

[trust]
roots = ["{home}/work/kestrel"]

[language-server.typescript]
command = ${JSON.stringify(TSC)}

[[language]]
name = "typescript"
language-servers = ["typescript"]
`;

/** Put the cursor on the first match of `text` (find, then back to reading). */
async function onto(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape");
}

/** The style of the cell at `col` of `row` (a column of the screen's text). */
function styleAt(s: Session, row: number, col: number) {
  let n = 0;
  for (const r of s.runs()[row] ?? []) {
    if (col < n + r.text.length) return r;
    n += r.text.length;
  }
  return null;
}

/** The style of line `n`'s number in the gutter, on the row that shows `text` after it. */
function numberStyle(s: Session, n: number, text: string) {
  const re = new RegExp(`\\b${n}\\s+${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const row = s.rowOf(re);
  if (row < 0) return null;
  return styleAt(s, row, re.exec(s.screen()[row]!)!.index);
}

/** The vault's index written to the cache: every note parsed (the graph writes it when none is left). */
function indexCached(s: Session): boolean {
  const dir = join(s.dir, "cache", "slipbox");
  return existsSync(dir) && readdirSync(dir).some((k) => existsSync(join(dir, k, "index.json")));
}

/** A built-in theme's colour for a role's foreground (the user's theme folder never asked). */
const themeFg = (name: string, role: "h2") => loadTheme(name, "/nonexistent").theme.roles[role].fg!.toLowerCase();

/** The check's own config file (SLIPBOX_CONFIG), as Session wrote it. */
const configFile = (s: Session) => join(s.dir, "config", "slipbox", "config.toml");

/**
 * How long this runner takes to parse a note on one thread (ms): a sixteenth of it parsed here, times sixteen. Less
 * than the whole takes (a long note's parse grows faster than its length), so a bound it sets is no looser than the
 * work it stands for.
 */
function parseEstimate(file: string): number {
  const text = readFileSync(file, "utf8");
  const part = text.slice(0, text.lastIndexOf("\n", text.length / 16) + 1);
  const t0 = performance.now();
  parseNoteFile(file, part, newParseCache());
  return (performance.now() - t0) * 16;
}

/** The kitchen-sink check's measure of its 6 MB note's parse on this runner (ms), taken before slipbox starts. */
let bigParse = 0;

/** A child of `pid` whose command line matches: a server slipbox started (ps's columns as Linux and macOS have them). */
function childOf(pid: number, match: RegExp): number | null {
  const out = spawnSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf8" }).stdout;
  for (const line of out.split("\n")) {
    const [child, parent, ...args] = line.trim().split(/\s+/);
    if (Number(parent) === pid && match.test(args.join(" "))) return Number(child);
  }
  return null;
}

/** The status line's `L12:3`'s line, waited for until `ok`. */
async function lineIs(s: Session, ok: (line: number) => boolean, what: string): Promise<void> {
  await s.until(() => ok(pos(s).line), 5000, what);
}

/**
 * A line typed at the end of the note on screen, as the editing keys do by default (`edit_in = "live"`): `o` opens
 * the lens on the last block, `o` again types a line under it; esc, and the lens is in normal mode — unsaved.
 */
async function typedAtEnd(s: Session, text: string): Promise<void> {
  await typingAtEnd(s);
  await s.type(text);
  await s.keys("escape");
  await s.until(() => !s.statusLine().includes("INSERT"), 3000, "normal mode in the lens");
}

/** Typing on a new line at the end of the note on screen, in the lens. */
async function typingAtEnd(s: Session): Promise<void> {
  await s.keys("G", "o");
  await s.status("LENS");
  await s.keys("o");
  await s.status("INSERT");
}

/** The format list for the note on screen, then a format typed into its filter and taken. */
async function format(s: Session, note: string, name: string): Promise<void> {
  await leader(s, "n", "o");
  await s.see(`Export ${note} as`);
  await s.type(name);
  await s.keys("enter");
}

/** Where `tests/terminal/export-hold.ts`, preloaded, holds the first export: "waiting", then "let go". */
const hold = (s: Session) =>
  existsSync(join(s.dir, "hold-state")) ? readFileSync(join(s.dir, "hold-state"), "utf8") : "";
/** The preload that holds the first export's cleanup (with `EXPORT_HOLD_AT: "publication"`, its publication) till the
 *  check lets it go (`hold-go`), and its files. */
const HOLD = {
  preload: "tests/terminal/export-hold.ts",
  env: { EXPORT_HOLD_GO: "{dir}/hold-go", EXPORT_HOLD_STATE: "{dir}/hold-state" },
};

/** Cancel export, from the palette. */
async function cancelExport(s: Session): Promise<void> {
  await s.keys(":");
  await s.type("Cancel export");
  await s.keys("enter");
}

const CONFLICT = "changed on disk, and you have unsaved changes";
/** An agent's line appended to the meeting note. */
const append = (s: Session, line: string) => s.write(MEETING, `${s.read(MEETING)}\n${line}\n`);

export const OUTSIDE_AND_CODE: Check[] = [
  {
    area: "outside-and-code",
    name: "background work: a real export cancelled through its list releases its task",
    covers: { cases: ["ui"], commands: ["background.open", "background.cancel", "note.export"] },
    options: { ...HOLD, env: { ...HOLD.env, EXPORT_HOLD_AT: "before-publication" } },
    run: async (s) => {
      await format(s, "home.md", "html");
      await s.keys("enter");
      await s.until(() => hold(s) === "waiting", 15000, "export held before publication");
      await s.ex("Background work");
      await s.see("Background work — enter: cancel");
      await s.keys("enter");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.message("export cancelled", 15000);
      await s.until(() => !/[◴◷◶◵]/.test(s.topBar()), 5000, "the finished task removed");
    },
  },
  {
    area: "outside-and-code",
    name: "Info export: x and the Export row run the existing note export",
    covers: { cases: ["info"], commands: ["note.info", "note.export"] },
    run: async (s) => {
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.keys("x");
      await s.see("Export home.md as");
      await s.see("Word (.docx)");
      await s.keys("escape");
      await leader(s, "n", "i");
      await s.keys("shift+g", "enter");
      await s.see("Export home.md as");
    },
  },
  // --- the Problems panel -----------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "problems: space v p — the All tab lists the vault's broken links and orphans by note; enter goes onto one",
    covers: { cases: ["problems"], commands: ["problems.open"] },
    run: async (s) => {
      await leader(s, "v", "p");
      await s.status("PROBLEMS");
      await s.see(/This file \(\d+\) +All \(\d+\)/); // its tabs, across the bottom
      await s.see(/Broken links \(\d+\)/);
      // A note nothing links to, under Orphans (filtered: the panel is a third of the screen).
      await s.keys("/");
      await s.type("broken-front");
      await s.see(/Orphans \(\d+\)/);
      await s.see(/scratch\/broken-front/);
      await s.keys("escape");
      // Filtered to the rota: partners-and-names's row, over its link to a note not written yet; enter opens it
      // there, on the link.
      await s.keys("/");
      await s.type("visiting-rota");
      await s.see(/L16 +visiting-rota\.md/);
      await s.keys("enter");
      await s.status("partners-and-names.md");
      await s.status("→ visiting-rota.md (unresolved)");
    },
  },
  {
    area: "outside-and-code",
    name: "problems: space n q — this file's problems with their lines, spaced; j shows the next, enter goes there; / filters; ctrl+w + resizes; tab to All, q closes; ⚠ 0 with none",
    covers: { cases: ["problems"], commands: ["problems.file"] },
    // Three pictures not taken yet, a paragraph apart.
    options: { open: "equipment/instrument-inventory.md" },
    run: async (s) => {
      await s.status(signed("{warning} 3"), 5000);
      await leader(s, "n", "q");
      await s.status("PROBLEMS");
      await s.see(/This file \(3\) +All \(\d+\)/);
      // Each problem: its sign, line:col, the message, who found it; under it, its line.
      await s.see(signed("{warning} 139:1 +broken link: images/lyra-slit\\.png +slipbox unresolved"));
      await s.see("![Lyra slit assembly](images/lyra-slit.png)");
      await s.see(signed("{warning} 143:1 +broken link: images/tern-frame\\.jpg"));
      // j: the note on the next one, the panel keeping the keys.
      await s.keys("j");
      await s.status(/L143:/);
      await s.status("PROBLEMS");
      // enter: there, the note has the keys; the panel stays.
      await s.keys("enter");
      await s.until(() => !s.statusLine().includes("PROBLEMS"), 3000, "the note's keys again");
      await s.status(/L143:/);
      await s.see("This file (3)");
      // A blank row under the tabs, and between the problems.
      await leader(s, "n", "q");
      await s.status("PROBLEMS");
      // Read once the panel is drawn with the keys: what's wrong, or null.
      const spacing = (): string | null => {
        const rows = s.screen();
        const tabs = rows.findIndex((r) => r.includes("This file (3)"));
        if (tabs < 0 || rows[tabs + 1]?.trim() !== "") return "a blank row under the tabs";
        const second = rows.findIndex((r) => signed("{warning} 143:1").test(r));
        if (!(second > 0 && rows[second - 1]!.trim() === "")) return "a blank row between the problems";
        return null;
      };
      await s
        .until(() => spacing() === null, undefined, "the panel spaced")
        .catch(() => s.expect(false, spacing() ?? "the panel spaced"));
      // / filters it: by the line's text.
      await s.keys("/");
      await s.type("flat field");
      await s.see("› flat field");
      await s.until(() => !signed("{warning} 139:1").test(s.text()), 3000, "the other problems filtered out");
      await s.see(signed("{warning} 147:1"));
      await s.keys("escape");
      // Resized as a window: ctrl+w + a row taller, then resize mode's j another; esc leaves it.
      const tabs = () => s.screen().findIndex((r) => r.includes("This file (3)"));
      const was = tabs();
      await s.keys("ctrl+w", "+");
      await s.status("RESIZE");
      await s.keys("j");
      await s.until(() => tabs() === was - 2, 3000, "the panel two rows taller");
      await s.keys("escape");
      await s.status("PROBLEMS");
      // tab: All; q closes it.
      await s.keys("tab");
      await s.see(/Broken links \(\d+\)/);
      await s.keys("q");
      await s.until(() => !s.text().includes("This file ("), 3000, "the panel closed");
      // The status line's path between back and forward.
      await s.status(/‹ equipment\/instrument-inventory\.md ›/);
      // A note with no problems: the panel's button on the status line instead, `⚠ 0` (a Nerd icon or `!`).
      await s.ex("e home.md");
      await s.status(/‹ home\.md › +\S+ 0 /);
    },
  },

  // --- linters ------------------------------------------------------------------------------------

  ...[
    { wrap: true, code: "scroll", follow: true, ignore: false, count: 2, hidden: 2 },
    { wrap: false, code: "scroll", follow: true, ignore: false, count: 3, hidden: 1 },
    { wrap: true, code: "wrap", follow: true, ignore: false, count: 1, hidden: 3 },
    { wrap: false, code: "wrap", follow: true, ignore: false, count: 3, hidden: 1 },
    { wrap: true, code: "wrap", follow: false, ignore: false, count: 4, hidden: 0 },
    { wrap: true, code: "scroll", follow: true, ignore: true, count: 1, hidden: 3 },
  ].map(
    (settings): Check => ({
      area: "editing",
      name: `lint visibility: wrap=${settings.wrap}, code=${settings.code}, follow=${settings.follow}, ignore=${settings.ignore}`,
      covers: { cases: ["lint", "problems"], commands: ["problems.show_all"] },
      options: {
        home: true,
        startAt: "home/notes/lint-visibility.md",
        config: `[ui]\nwrap = ${settings.wrap}\n[render]\ncode_wrap = "${settings.code}"\n[lint]\nenabled = "on"\nfollow_view = ${settings.follow}\nignore = ${settings.ignore ? '["MD033"]' : "[]"}\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */lint-visibility.md) for line in 3 7 10; do printf '%s:%s:1 error MD013/line-length Long line\\n' "$f" "$line"; done; printf '%s:3:1 error MD033/no-inline-html Inline HTML\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
        setup: (s) =>
          s.write(
            "~/notes/lint-visibility.md",
            "# Visibility\n\nParagraph\n\n| A |\n| - |\n| B |\n\n```ts\nlong code\n```\n",
          ),
      },
      run: async (s) => {
        await s.status(signed(`{warning} ${settings.count}`), 10000);
        await leader(s, "n", "q");
        await s.see(`This file (${settings.count})`);
        if (settings.hidden) {
          await s.see("hidden:");
          await s.see("a: show all");
          await s.keys("a");
          await s.see("This file (4)");
          await s.see("revealed:");
          await s.keys("a");
          await s.see(`This file (${settings.count})`);
        } else {
          await s.notSee("hidden:");
          await s.keys("a");
          await s.see("This file (4)");
        }
      },
    }),
  ),

  {
    area: "outside-and-code",
    name: "lint: a stand-in linter's finding — on the status line, beside its line (its number, or the bar's sign), marked at a level; in Problems, enter goes to its line",
    covers: {
      cases: ["lint", "problems"],
      commands: ["ui.line_numbers", "ui.problems_bar", "ui.problem_marks", "problems.open", "problems.file"],
    },
    // markdownlint-cli2's output, from sh: one finding, on home.md's line 3.
    options: {
      config: `[lint]\nfollow_view = false\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */home.md) printf '%s:3:6 error MD013/line-length Line length [Expected: 80]\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
    },
    run: async (s) => {
      await s.status(signed("{warning} 1"), 6000); // how many of each severity (19.8); the linter runs once the note opens
      // Line numbers on, the default: no bar, line 3's number stands for the sign — in the warning's colour, bold.
      await s.until(
        () => {
          const [bad, good] = [numberStyle(s, 3, "Welcome to the"), numberStyle(s, 5, "there to exercise")];
          return !!bad && !!good && bad.fg !== good.fg && bad.bold && !good.bold;
        },
        3000,
        "line 3's number in the warning's colour, bold",
      );
      // Line numbers off: the problems bar (19.9), the warning's sign beside its line; off and back.
      await leader(s, "u", "n");
      await s.message("Line numbers: off");
      await s.see(signed("[│┃] +{warning} +Welcome to the observatory"));
      await leader(s, "u", "d");
      await s.message("Problems bar: off");
      await s.notSee(signed("{warning} +Welcome to the observatory"));
      await leader(s, "u", "d");
      await s.see(signed("[│┃] +{warning} +Welcome to the observatory"));
      // The marks (19.10): a level, cycled from errors through warnings and all to off, and back.
      for (const level of ["warnings and up", "all", "off", "errors"]) {
        await leader(s, "u", "shift+d");
        await s.message(`Problems marked in the text: ${level}`);
      }
      await leader(s, "v", "p");
      await s.see(/Lint \(1\)/);
      await s.see(/L3 +MD013 line-len/); // cut to the panel
      await s.keys("/");
      await s.type("MD013");
      await s.keys("enter");
      await s.status("L3:1"); // rendered: the line's start
      // What it says, in the panel's This file (the status line counts it).
      await problemListed(s, signed("{warning} 3:6 +line-length: Line length \\[Expected: 80\\] +markdownlint MD013"));
    },
  },
  {
    area: "outside-and-code",
    name: "linters: a quick one's finding shows while a slow one beside it still runs (19.19)",
    covers: { cases: ["lint", "problems"] },
    // Two linters of the user's own for Dockerfiles: one finding `apt-get install` without `-y` at once, one asleep.
    options: {
      open: "Dockerfile",
      setup: (s) => s.write("Dockerfile", "FROM x\nRUN apt-get install gcc\n"),
      config: [
        "[lint]",
        'enabled = "auto"', // the default, which the checks turn off unless a check says
        "[linter.quick]",
        `lint-command = ${JSON.stringify("grep -n 'apt-get install' | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] install without -y/'; exit 1")}`,
        'lint-formats = ["%f:%l:%c: [%trror] %m"]',
        "[linter.slow]",
        'lint-command = "sleep 25"',
        "[[language]]",
        'name = "dockerfile"',
        'linters = ["quick", "slow"]',
        "",
      ].join("\n"),
    },
    run: async (s) => {
      // No key pressed: the quick one's finding is on the status line while the slow one still sleeps, long before its
      // 25 s are up (CI's waits are 30 s at least). Opening the file, other work draws the screen within a second too:
      // the unit test ("a file's linters: …") is the one that fails if a linter's answer isn't drawn as it comes.
      const t0 = Date.now();
      await s.status(signed("{error} 1"), 10_000);
      s.expect(Date.now() - t0 < 15_000, `the quick one's finding shown while the slow one ran: ${Date.now() - t0} ms`);
    },
  },
  {
    area: "outside-and-code",
    name: "lint: as it flows — a finding after a save, hidden while unsaved, gone once fixed and saved",
    covers: { cases: ["lint"], commands: ["note.save"] },
    // A stand-in linter in markdownlint-cli2's format: a line with TODO is a finding.
    options: {
      open: MEETING,
      config: `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify('rc=0; for f; do for l in $(grep -n TODO "$f" | cut -d: -f1); do printf \'%s:%s:1 error MD099/todo-left A TODO is left\\n\' "$f" "$l"; rc=1; done; done; exit $rc')}, "lint"]\n`,
    },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      await typedAtEnd(s, "TODO: check the dome heater");
      // Unsaved: the linter reads the file, so nothing yet — a while later, still nothing.
      await sleep(1000);
      const counted = () => signed("{warning} [1-9]").test(s.statusLine());
      s.expect(!counted(), "no finding for unsaved text");
      await s.keys("ctrl+s");
      await s.until(counted, 5000, "the finding counted once saved");
      await problemListed(s, signed("{warning} \\d+:1 +todo-left: A TODO is left"));
      // Typed again: hidden until the next save's run.
      await s.keys("A");
      await s.type(" soon");
      await s.keys("escape");
      await s.until(() => !counted(), 3000, "the finding hidden while unsaved");
      await s.keys("ctrl+s");
      await s.until(counted, 5000, "the finding back once saved");
      // Fixed and saved: gone.
      await s.keys("d", "d", "ctrl+s");
      await s.until(
        () => !signed("{warning} (MD|[1-9])").test(s.statusLine()),
        5000,
        "no finding once fixed and saved",
      );
    },
  },

  // --- language servers ---------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "language servers: a TypeScript file's error from TypeScript's own server — counted, listed, its line's number in the error's colour; fixed, gone",
    covers: { cases: ["lsp", "problems"], commands: ["problems.file"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      // `ttlSeconds: "3600"`, line 35: counted on the status line, said in the Problems panel.
      await s.status(signed("{error} 1"), 15000);
      await problemListed(s, signed("{error} 35:\\d+ +Type 'string' is not assignable to type 'number'"));
      // The gutter: the error's line number in the error's colour, its neighbour's not.
      await s.until(
        () => {
          const [bad, good] = [numberStyle(s, 35, "return links.create"), numberStyle(s, 34, "const links = new")];
          return !!bad && !!good && bad.fg !== good.fg && bad.bold;
        },
        5000,
        "line 35's number in the error's colour",
      );
      // Fixed and typed in: gone once the server says so again.
      await s.ex("35");
      await s.keys("f", '"', "d", "a", '"', "i");
      await s.type("3600 ");
      await s.keys("escape");
      await s.see("ttlSeconds: 3600 }");
      await s.until(() => !signed("{error}").test(s.statusLine()), 10000, "the error gone with the fix");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: what's under the cursor — shift+k its type, g d its definition in another file, g r its uses (19.12, 19.13)",
    covers: { cases: ["lsp"], commands: ["lsp.hover", "lsp.definition", "lsp.references", "history.back"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000); // the server has read the file
      // On sign, as share.ts calls it: its type, floating; its definition, in sign.ts.
      await onto(s, "sign(opts");
      await s.status(/L16:/);
      await s.keys("shift+k");
      await s.see("function sign(token: string, expires: number): string", 10000);
      await s.keys("escape");
      await s.keys("g", "d");
      await opened(s, "src/routes/sign.ts");
      await s.status(/L6:17\b/, 10000);
      await s.keys("ctrl+o");
      await opened(s, "src/routes/share.ts");
      // formatKm's uses, to pick from: here, and in format.mts beside its definition.
      await onto(s, "formatKm(km");
      await s.keys("g", "r");
      await s.see(/2 references/, 10000);
      await s.see(/share\.ts:23 +return `Route/);
      await s.see(/format\.mts:14 +return r\?\.km !== undefined \? formatKm/);
      await s.keys("down", "enter");
      await opened(s, "src/util/format.mts");
      await s.status(/L14:/);
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: g y goes to the type's definition, g shift+i lists the implementations to pick from (19.13)",
    covers: { cases: ["lsp"], commands: ["lsp.type_definition", "lsp.implementation"] },
    // A share link's lifetime: an interface two classes implement, a default of its type.
    options: { home: true, startAt: "home/work/kestrel/src/routes/expiry.ts", config: TS_CONFIG },
    run: async (s) => {
      // On e of `e.seconds(now)`: its type is Expiry, line 3 — where g d would go is its parameter, line 27.
      await onto(s, "e.seconds(now)");
      await s.status(/L27:/);
      await s.keys("g", "y");
      await s.status(/L3:18\b/, 15000);
      // On Expiry: the two classes that implement it, a list; the second picked.
      await s.keys("g", "shift+i");
      await s.see("2 implementations", 10000);
      await s.see(/expiry\.ts:8 +export class FixedExpiry implements Expiry/);
      await s.see(/expiry\.ts:17 +export class RideExpiry implements Expiry/);
      await s.keys("down", "enter");
      await s.status(/L17:14\b/);
      await s.notSee("2 implementations");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: the server's changes — a rename after a preview, code actions, formatting; each said (19.15)",
    covers: { cases: ["lsp"], commands: ["lsp.rename", "lsp.code_action", "lsp.format"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      // expires, the local of create(): renamed by the server, its three uses, after a preview.
      await onto(s, "expires = Math");
      await leader(s, "c", "r");
      await s.see("rename expires to:", 10000);
      await s.keys("ctrl+u");
      await s.type("expiry");
      await s.keys("enter");
      await s.see("rename expires → expiry: 3 changes in 1 file", 10000);
      await s.keys("enter");
      await s.see("const expiry = Math.floor");
      await s.see("const sig = sign(opts.routeId, expiry);");
      // Its code actions for the line, and its formatting: each says what it did.
      await leader(s, "c", "a");
      await s.until(() => /Code actions|no code actions here/.test(s.text()), 10000, "the code actions, or none");
      await s.keys("escape");
      await leader(s, "c", "f");
      await s.until(() => /formatted|doesn't format/.test(s.text()), 10000, "formatted, or said it can't");
    },
  },
  {
    area: "outside-and-code",
    name: "language servers: completion as it's typed, then the signature being typed (19.16)",
    covers: { cases: ["lsp"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      // Math's members after `.`, narrowed by what follows, one put in; then the signature, after `(`.
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
    area: "outside-and-code",
    name: "language servers: TypeScript's server killed — said, started again, a new problem found by it",
    covers: { cases: ["lsp"] },
    options: { home: true, startAt: SHARE, config: TS_CONFIG },
    run: async (s) => {
      await s.status(signed("{error} 1"), 15000);
      const server = childOf(s.pid()!, /tsc|typescript/);
      s.expect(server !== null, "TypeScript's server among slipbox's children");
      process.kill(server!, "SIGKILL");
      await s.message("crashed", 5000);
      // Only a server running again finds this one.
      await s.keys("shift+g", "o");
      await s.type("const t: string = 1;");
      await s.keys("escape");
      await problemListed(s, "Type 'number' is not assignable to type 'string'", 15000);
    },
  },

  // --- the watcher --------------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "watching: a clean note changed outside reloads at once, marked ↻; u brings its text back, ctrl+r theirs again",
    covers: { cases: ["watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("second desk by the window");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      await s.see("third desk, by the door", 5000);
      await s.status("↻ reloaded");
      s.expect(!s.text().includes("second desk by the window"), "the old text gone from the screen");
      // The reload is an undo step of its own: u brings back what was there, unsaved now (the file is theirs).
      await s.keys("u");
      await s.see("second desk by the window");
      await s.notSee("third desk, by the door");
      await s.status("• unsaved");
      await s.keys("ctrl+r");
      await s.see("third desk, by the door");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "back at the file's text: nothing unsaved");
      s.expect(s.read(KENJI).includes("third desk, by the door"), "nothing written: the file is still theirs");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, changed by an agent, reloads once — looked at where no watcher is (20.8)",
    covers: { cases: ["watching"], commands: ["note.open", "backlinks.open"] },
    options: {
      // The watcher's sweep each 3 s (15 ticks of 200 ms): soon enough to see it doesn't say the change again.
      config: "[watch]\npoll_ms = 200\n",
      setup: (s) => {
        if (!s.exists(".stash/kept.md")) s.write(".stash/kept.md", "# Kept aside\n\nNothing here yet.\n");
        if (!s.exists(".aside.md")) s.write(".aside.md", "# Aside\n\nA hidden note at the top.\n");
      },
    },
    run: async (s) => {
      // :e reaches it: the vault's note from now on, its folder still hidden from the watcher. Started again, the
      // index brings it back, and the watcher knows it too (its sweep stats every note it knows).
      await s.ex("e .stash/kept.md");
      await opened(s, ".stash/kept.md");
      await s.restart();
      await s.ex("e .stash/kept.md");
      await opened(s, ".stash/kept.md");
      await s.see("Nothing here yet.");
      s.write(".stash/kept.md", "# Kept aside\n\nAn agent wrote here, to [home](../home.md).\n");
      await s.see("An agent wrote here", 5000);
      await s.status("↻ reloaded");
      // Said once: the watcher's sweep, which knows the note too, doesn't say it again.
      await sleep(4000);
      const said = await messagesSaying(s, "kept.md changed", /kept\.md changed on disk — reloaded/);
      s.expect(said === 1, `the reload said once, not ${said} times`);
      // The index told too: the new link's in it, and home.md's backlinks list the note.
      await s.ex("e home.md");
      await opened(s, "home.md");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see(/\.stash\/kept\.md\s+home\b/);
      await s.keys("escape");
      // A hidden note in a folder the watcher watches (the top): its name the watch doesn't take, the poll does.
      await s.ex("e .aside.md");
      await opened(s, ".aside.md");
      s.write(".aside.md", "# Aside\n\nRewritten by an agent.\n");
      await s.see("Rewritten by an agent.", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, deleted and made again by an agent — read again and indexed again, its backlink there",
    covers: { cases: ["watching"], commands: ["note.open", "backlinks.open"] },
    options: {
      setup: (s) => {
        if (!s.exists(".stash/back.md")) s.write(".stash/back.md", "# Back\n\nTo [home](../home.md).\n");
      },
    },
    run: async (s) => {
      await s.ex("e .stash/back.md");
      await opened(s, ".stash/back.md");
      // Gone, then made again while it's open: no watcher sees its folder, the poll does.
      rmSync(s.path(".stash/back.md"));
      await s.message(/back\.md was deleted on disk/, 5000);
      s.write(".stash/back.md", "# Back again\n\nTo [home](../home.md), once more.\n");
      await s.see("once more", 5000);
      // Reached again, as opening it reaches it: in the index, home.md's backlinks list it — its row, its link's text
      // beside it (the messages name its path too).
      await s.ex("e home.md");
      await opened(s, "home.md");
      await leader(s, "l", "b");
      await s.see(/Linking to home\.md/, 5000);
      await s.see(/\.stash\/back\.md\s+home\b/, 3000);
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note reached in a hidden folder, the folder made a file by an agent — said deleted, slipbox goes on",
    covers: { cases: ["watching"], commands: ["note.open"] },
    options: {
      setup: (s) => {
        if (!s.exists(".junk/gone.md")) s.write(".junk/gone.md", "# Gone soon\n");
      },
    },
    run: async (s) => {
      await s.ex("e .junk/gone.md");
      await opened(s, ".junk/gone.md");
      // The folder made a file: looking at the note through it fails (ENOTDIR), and is taken as the note gone.
      rmSync(s.path(".junk"), { recursive: true });
      s.write(".junk", "A file now.\n");
      await s.message(/gone\.md was deleted on disk/, 5000);
      // Still here, answering.
      await s.keys("ctrl+p");
      await s.see(/Open \(\d+ notes/, 5000);
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: links turn live and broken as notes come and go",
    covers: { cases: ["watching"] },
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      // The link to a note not written yet, under the cursor: its status in the status line.
      await onto(s, "visiting rota, which");
      await s.status("→ visiting-rota.md (unresolved)");
      s.write("people/visiting-rota.md", "# Visiting rota\n");
      await s.status("→ visiting-rota.md (resolved)", 5000);
      rmSync(s.path("people/visiting-rota.md"));
      await s.status("→ visiting-rota.md (unresolved)", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: the open note deleted is marked, its last text kept; back, reloaded; a new deep folder is watched",
    covers: { cases: ["watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("Visiting astronomer from the Kiso-Hara");
      const kenji = s.read(KENJI);
      rmSync(s.path(KENJI));
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara");
      s.write(KENJI, kenji.replace("Visiting astronomer", "Visiting astronomer (back)"));
      await s.see("Visiting astronomer (back)", 5000);
      await s.until(() => !s.statusLine().includes("✖"), 3000, "the deleted mark gone once it's back");
      // A folder made three deep at once: its note found, and its later changes seen (watched through its depth).
      s.write("field-notes/2026/october/aurora.md", "# Aurora over the ridge\n\nFirst seen at 01:40.\n");
      await inSwitcher(s, "aurora", "field-notes/2026/october/aurora.md");
      await s.keys("enter");
      await s.status("aurora.md");
      s.write(
        "field-notes/2026/october/aurora.md",
        "# Aurora over the ridge\n\nFirst seen at 01:40.\n\nSeen again at 02:10.\n",
      );
      await s.see("Seen again at 02:10.", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note an agent writes at the vault's top — in the explorer from the disk at once, in the switcher once the watcher tells, opened from it (#69)",
    covers: { cases: ["watching", "explorer"], commands: ["switcher.open", "explorer.toggle_hidden"] },
    // The watcher slow to tell, as a loaded runner's is.
    options: { config: "[watch]\ndebounce_ms = 3000\n" },
    run: async (s) => {
      s.write("arrival.md", "# Arrival\n\nWritten by an agent.\n");
      // The explorer's tree made again before the watcher has told (hidden files shown, then not): its row is the
      // disk's, while the switcher doesn't list the note yet.
      await s.ex("hidden");
      await s.ex("hidden");
      await s.see("arrival.md");
      await inSwitcher(s, "arrival", "arrival.md");
      await s.keys("enter");
      await opened(s, "arrival.md");
      await s.see("Written by an agent.");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an agent's prepend keeps the cursor on its line",
    covers: { cases: ["watching"], commands: ["cursor.goto_line"] },
    options: { open: HANDBOOK },
    run: async (s) => {
      // The cursor on line 300; four lines prepended: still on the same text, now line 304.
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "ctrl+g 300 to line 300");
      s.write(HANDBOOK, `<!-- prepended -->\nAn agent's line.\n\n<!-- end -->\n${s.read(HANDBOOK)}`);
      await lineIs(s, (l) => l === 304, "the cursor to follow its line to 304");
      await s.status("↻ reloaded");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an agent's append keeps the lens on its lines",
    covers: { cases: ["watching", "lens"], commands: ["view.live"] },
    options: { open: MEETING },
    run: async (s) => {
      // The lens on a block: an append at the end of the note leaves its lines and size as they were.
      await s.keys("]", "]", "j", "j");
      await leader(s, "n", "l");
      await s.status("LENS");
      const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(s.text())?.[1] ?? "";
      await s.until(() => lens() !== "", 3000, "the lens's lines");
      const lines = lens();
      append(s, "Appended by an agent.");
      await s.status("↻ reloaded", 5000);
      await s.status("LENS");
      s.expect(lens() === lines, `the lens still on lines ${lines} (now ${lens()})`);
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note an agent adds keeps the explorer on the row it was on",
    covers: { cases: ["watching", "explorer"] },
    run: async (s) => {
      // The explorer on home.md; a note an agent adds sorts above it: the selection stays on home.md.
      await explorerOpen(s);
      await explorerRow(s, "home");
      s.write("aaa-agent-note.md", "# An agent's note\n");
      await s.see("aaa-agent-note", 5000);
      await s.keys("enter");
      await s.status("home.md");
      s.expect(
        !s.statusLine().includes("aaa-agent-note"),
        "enter opened the row selected before the note came, not the row now in its place",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "watching: a note moved by hand — mv, then cp and rm the other way round — the relink offered at once; declined, its links say where, space l r relinks",
    covers: { cases: ["watching"], commands: ["link.relink"] },
    // `[kenji-mori](../people/kenji-mori.md)` on line 10.
    options: { open: MEETING },
    run: async (s) => {
      await s.see("gets Aster on Tuesday and Thursday nights.");
      // Every note's text known first: the index is cached once all are parsed. (A note moved in the
      // moment after a first, cold open, before its parse, has no text to be known by.)
      await s.until(() => indexCached(s), 5000, "the vault's notes all parsed (its index cached)");
      // mv: gone from one path, the same text at another — a move (17.12), never a quiet resolve: the
      // links it broke, their fix offered at once (21.11); enter takes it.
      renameSync(s.path(KENJI), s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000); // every note's links to it, home's too
      await s.message("moved to people/kenji.md");
      await s.keys("enter");
      await s.file(MEETING, (t) => t.includes("[kenji-mori](../people/kenji.md)"), "relinked to where it went");
      // The other way round: the copy arrives first, then the original goes. The offer declined, the
      // link says where it went, and space l r relinks it.
      cpSync(s.path("people/kenji.md"), s.path("people/k-mori.md"));
      await sleep(300); // two events, not one batch: the arrival seen before the removal
      rmSync(s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000);
      await s.keys("escape");
      await s.notSee(/relink: \d+ changes? in \d+ files?/);
      await onto(s, "kenji-mori");
      await s.status(/→ \S*people\/kenji\.md \(unresolved\)/, 5000);
      await s.keys("enter");
      await s.message("people/k-mori.md: space l r relinks it", 5000); // "… moved to" ends the row above
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file", 5000); // this note's
      await s.keys("enter");
      await s.file(MEETING, (t) => t.includes("[kenji-mori](../people/k-mori.md)"), "relinked again");
    },
  },
  {
    area: "outside-and-code",
    name: "watching: an embedded note changed on disk — the note embedding it draws the new text",
    covers: { cases: ["watching", "embeds"] },
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      await s.see("Table A — ordinary prose, no long tokens.");
      s.write(
        "scratch/wrap-probe.md",
        s.read("scratch/wrap-probe.md").replace("Table A — ordinary prose", "Table A — rewritten prose"),
      );
      await s.see("Table A — rewritten prose, no long tokens.", 5000);
      await s.notSee("Table A — ordinary prose");
    },
  },
  {
    area: "outside-and-code",
    name: "reload: not watching — an outside write waits for space n r, or :reload, which reloads it",
    covers: { cases: ["watching", "reload"], commands: ["note.reload"] },
    options: { open: KENJI, config: "[watch]\nenabled = false\n" },
    run: async (s) => {
      await s.see("second desk by the window");
      await s.status("not watching");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      // Nothing reloads it by itself with the watcher off: a while later, the old text still shows.
      await sleep(2000);
      s.expect(
        s.text().includes("second desk by the window") && !s.text().includes("third desk"),
        "the outside write not shown before space n r",
      );
      await leader(s, "n", "r");
      await s.see("third desk, by the door");
      await s.status("↻ reloaded");
      // :reload likewise.
      s.write(KENJI, s.read(KENJI).replace("third desk, by the door", "fourth desk, upstairs"));
      await s.ex("reload");
      await s.see("fourth desk, upstairs");
    },
  },

  // --- agents and the CLI beside it ---------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "agent: the CLI ticks a task, replaces text and appends while you read; with your change unsaved, it says so",
    covers: { cases: ["agent", "watching"] },
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
      await typedAtEnd(s, "mine");
      await s.until(
        () => JSON.parse(s.cli("info", "--json").out).stale.length === 1,
        3000,
        "the CLI to see the unsaved note",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's history lists the tabs open here, the current one",
    covers: { cases: ["agent"], commands: ["tab.new"] },
    run: async (s) => {
      // Two tabs, the handbook in the second: what the CLI's history says the TUI has open, a moment later.
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      const history = () => {
        try {
          return JSON.parse(s.cli("history", "--json").out).data;
        } catch {
          return null;
        }
      };
      await s.until(
        () => {
          const h = history();
          return (
            !!h &&
            JSON.stringify(h.open) === JSON.stringify([["home.md"], ["handbook/operations-handbook.md"]]) &&
            h.activeTab === 1 &&
            h.current === "handbook/operations-handbook.md"
          );
        },
        5000,
        "history --json to list the two tabs, the handbook current",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's capture shows in the open scratch at once",
    covers: { cases: ["agent", "watching", "scratch"], commands: ["scratch.open"] },
    run: async (s) => {
      // The scratch (an agent's first capture made it) open; the next capture lands in it without a key
      // pressed: it's outside the vault, polled.
      s.expect(s.cli("capture", "Check the dome heater").code === 0, "slipbox capture ran");
      await leader(s, "s", "s");
      await s.see(SCRATCH_FLOATING);
      await s.see("Check the dome heater");
      s.expect(s.cli("capture", "Ask Lena about the outreach rota").code === 0, "slipbox capture ran again");
      await s.see("Ask Lena about the outreach rota", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's rm of the note on screen — to the trash, marked here, its last text kept",
    covers: { cases: ["agent", "watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("Visiting astronomer from the Kiso-Hara");
      const rm = s.cli("rm", KENJI);
      s.expect(rm.code === 0, `slipbox rm ran (${rm.out})`);
      s.expect(!s.exists(KENJI), "the note gone from the vault");
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara"); // its last text still shown
    },
  },
  {
    area: "outside-and-code",
    name: "agent: a replay against the open note — append, prepend, rename, delete, recreate, an atomic rewrite, a burst",
    covers: { cases: ["agent", "watching"] },
    // The note the script makes in ~/Downloads, open from the start: home's, though its index leaves Downloads out
    // (VV-D2) — no watcher sees it, so it's read again as it changes.
    options: {
      home: true,
      startAt: "home/Downloads/agent-scratch.md",
      setup: (s) => s.write("~/Downloads/agent-scratch.md", "# agent scratch\n"),
    },
    run: async (s) => {
      await opened(s, "Downloads/agent-scratch.md");
      // The set's own script (~/work/kestrel/scripts/dev/agent-replay.sh), a pause between its steps.
      const replay = Bun.spawn(["bash", s.path("~/work/kestrel/scripts/dev/agent-replay.sh"), s.path("~/Downloads")], {
        env: { ...process.env, PAUSE: "2.5" },
        stdout: "ignore",
        stderr: "ignore",
      });
      try {
        await s.see("agent scratch", 5000);
        await s.see("first pass", 5000); // appended
        await s.see(/title\s+Agent scratch/, 5000); // frontmatter prepended: its properties
        await s.status("✖ deleted on disk", 5000); // renamed away, then deleted
        await s.see("agent scratch again", 8000); // recreated: reloaded
        await s.until(() => !s.statusLine().includes("✖"), 3000, "not marked deleted once it's back");
        await s.see("rewritten atomically", 5000); // a temp file renamed over it
        await s.see("line 10", 5000); // the last of a burst of ten writes
        await s.status("✖ deleted on disk", 5000); // and gone at the end
      } finally {
        replay.kill();
      }
    },
  },

  // --- conflicts: changed outside while yours is unsaved ------------------------------------------
  {
    area: "outside-and-code",
    name: "conflict: l loads theirs, u brings yours back",
    covers: { cases: ["conflict", "watching"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine one");
      append(s, "theirs one");
      await s.see(CONFLICT, 5000);
      await s.keys("l");
      await s.message("loaded theirs — u brings yours back");
      await s.see("theirs one");
      await s.notSee("mine one");
      await s.keys("u");
      await s.see("mine one");
      await s.notSee("theirs one");
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: k keeps yours, marked; :w asks first, d shows the difference, y writes yours over theirs",
    covers: { cases: ["conflict"], commands: ["note.save"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine one");
      append(s, "theirs two");
      await s.see(CONFLICT, 5000);
      await s.keys("k");
      await s.status("⚠ differs from disk");
      await s.ex("w");
      await s.see("changed on disk — write yours over it?");
      await s.keys("d");
      await s.see("Diff — yours → theirs");
      await s.see("theirs two");
      await s.keys("escape");
      await s.see("write yours over it?");
      await s.keys("y");
      await s.file(MEETING, (t) => t.includes("mine one") && !t.includes("theirs two"), "yours written over theirs");
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: m merges — yours at the end, theirs at the top, both kept, unsaved until :w",
    covers: { cases: ["conflict"], commands: ["note.save"] },
    options: { open: MEETING },
    run: async (s) => {
      await typedAtEnd(s, "mine three");
      s.write(MEETING, `Theirs three, at the top.\n\n${s.read(MEETING)}`);
      await s.see(CONFLICT, 5000);
      await s.keys("d"); // the diff, and back to the prompt
      await s.see("Diff — yours → theirs");
      await s.keys("escape");
      await s.see(CONFLICT);
      await s.keys("m");
      await s.message("merged cleanly");
      await s.see("Theirs three, at the top.");
      await s.see("mine three");
      await s.ex("w");
      await s.file(
        MEETING,
        (t) => t.startsWith("Theirs three, at the top.") && t.includes("mine three"),
        "the merge written",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "conflict: while typing, said; the letters typed go into the text, never pick; the prompt after esc",
    covers: { cases: ["conflict"] },
    options: { open: MEETING },
    run: async (s) => {
      await typingAtEnd(s);
      await s.type("typing on ");
      append(s, "theirs four");
      await s.message("esc, then choose what to keep", 5000);
      await s.type("lkdm");
      await s.see("typing on lkdm");
      s.expect(s.rowOf(CONFLICT) < 0, "no prompt while typing");
      await s.keys("escape");
      await s.keys("j");
      await s.see(CONFLICT);
      await s.keys("l");
      await s.see("theirs four");
      await s.notSee("typing on lkdm");
      s.expect(!s.read(MEETING).includes("lkdm"), "the letters typed never written");
    },
  },

  // --- your config, your editor, autosave ---------------------------------------------------------
  {
    area: "outside-and-code",
    name: "config: yours rewritten while it runs — a theme, an alias, a key at once; a typo keeps the last good; space v c reloads what the poll can't see",
    covers: { cases: ["config", "watching"], commands: ["config.reload", "tab.new"] },
    run: async (s) => {
      const file = configFile(s);
      const base = readFileSync(file, "utf8");
      // A heading the breadcrumb doesn't repeat (it names the first): drawn in the theme's h2.
      const h2 = () => s.styleOf("Start here")?.fg?.toLowerCase() ?? "";
      await s.see("Start here");
      await s.until(() => h2() === themeFg("tokyo-night", "h2"), 3000, "the default theme's heading colour");
      const good = (theme: string) =>
        `theme = "${theme}"\n${base}\n[aliases]\nhop = "tab.new"\n\n[keys]\n"leader y" = "tab.new"\n`;
      writeFileSync(file, good("dracula"));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(() => h2() === themeFg("dracula", "h2"), 3000, "the heading in dracula's colour");
      await s.ex("hop");
      await s.see(/2 home/);
      await leader(s, "y");
      await s.see(/3 home/);
      // Saved mid-edit: a warning, and what it said before stays — the theme, the alias.
      writeFileSync(file, `theme = "nord\n${base}`);
      await s.message("Invalid TOML document", 5000); // "— keeping what it said before" is cut where the box ends
      await s.ex("hop");
      await s.see(/4 home/);
      s.expect(h2() === themeFg("dracula", "h2"), "still dracula's heading");
      // A file the poll can't tell from the last: put in place whole (renamed over it), with the mtime the
      // last one had. First a good one again, with an alias of its own so its reload is told apart.
      const t = Math.floor(Date.now() / 1000) - 100;
      const place = (text: string) => {
        writeFileSync(`${file}.new`, text);
        utimesSync(`${file}.new`, t, t);
        renameSync(`${file}.new`, file);
      };
      place(good("dracula").replace("hop =", "hip ="));
      await s.message("changed: aliases", 5000);
      place(good("monokai").replace("hop =", "hip =")); // as long as dracula's, the same mtime: only reading it tells
      // A while later, nothing reloaded by itself.
      await sleep(1500);
      s.expect(h2() === themeFg("dracula", "h2"), "nothing reloaded by itself");
      await leader(s, "v", "c");
      await s.message("config reloaded (manual) — changed: theme");
      await s.until(() => h2() === themeFg("monokai", "h2"), 3000, "the heading in monokai's colour");
    },
  },
  {
    area: "outside-and-code",
    name: "config: a folder's config can't name your editor — warned, never run; yours runs",
    covers: { cases: ["config"], commands: ["messages.open", "note.edit"] },
    // Kestrel's .slipbox/config.toml names VS Code for everyone: ignored, warned. Yours writes where it ran.
    options: {
      home: true,
      startAt: "home/work/kestrel/README.md",
      config: "[editor]\ncommand = \"sh -c 'echo $0 > $1' {file} {dir}/ran-yours\"\n",
    },
    run: async (s) => {
      // Among the messages, the warning: its row cut where the window ends, enter copies it whole.
      await leader(s, "m");
      await s.see("Messages");
      await s.type("sets editor.command");
      await s.see(/kestrel\/\.slipbox\/config\.toml sets/);
      await s.keys("enter");
      await s.until(() => s.clipboard().includes("sets editor.command"), 3000, "the warning copied");
      s.expect(
        /kestrel\/\.slipbox\/config\.toml sets editor\.command, which only your own/.test(s.clipboard()),
        s.clipboard(),
      );
      await leader(s, "n", "e");
      const ran = join(s.dir, "ran-yours");
      await s.until(() => existsSync(ran), 5000, "your editor to run");
      s.expect(readFileSync(ran, "utf8").trim().endsWith("work/kestrel/README.md"), "yours ran, on the note");
    },
  },
  {
    area: "outside-and-code",
    name: "config: the set's kitchen-sink config — every key once: no warnings, its leader, its layout",
    alone: true,
    covers: { cases: ["config"], commands: ["palette.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      noWait: true, // zen: no status line to wait for
      setup: (s) => {
        // The team's config as README.md says to install it: the file and its themes. Its linter
        // (markdownlint-cli2, with your own markdownlint config) stood in for by `true`: a check runs
        // nothing of yours (and the notes' own config says `auto`, which runs a named command).
        const dot = s.path("~/work/infra/dotfiles/slipbox");
        writeFileSync(
          configFile(s),
          readFileSync(join(dot, "config.toml"), "utf8").replace(
            /^command = \["markdownlint-cli2".*$/m,
            'command = ["true"]',
          ),
        );
        mkdirSync(join(s.dir, "config", "slipbox", "themes"), { recursive: true });
        cpSync(join(dot, "themes"), join(s.dir, "config", "slipbox", "themes"), { recursive: true });
        // What a key would wait for if that note were parsed where keys are read: measured here, before slipbox
        // starts, on this runner as it is now.
        bigParse = parseEstimate(s.path("~/notes/research/gps-traces.md"));
      },
    },
    run: async (s) => {
      await s.see("Sam's notes", 10000);
      // Keys answered at once while the notes are indexed in the background — its walk.max_file_size (8 MiB)
      // lets the set's 6 MB gps-traces.md in. Measured once it answers, so a slow answer fails here, last.
      // The key alone, timed to the screen showing its answer: `keys` would add its own settling, which waits for a
      // quiet the indexing's progress keeps from coming.
      const asked = Date.now();
      s.term.key(":");
      await s.see("Commands", 30000);
      const answered = Date.now() - asked;
      await s.keys("escape");
      await s.notSee("Commands");
      // Zen keeps the permanent bar, hides the explorer; the note's first rows below it are numbered 1, 2, 3.
      s.expect(
        !s.text().includes("Explorer") && s.topBar().includes("slipbox"),
        "zen hides the explorer and retains the permanent bar",
      );
      const numbers = s
        .screen()
        .slice(1, 4)
        .map((r) => /^\s*(\d+)\s/.exec(r)?.[1]);
      s.expect(numbers.join(",") === "1,2,3", `line numbers in the gutter (${numbers.join(",")})`);
      // Its leader is backslash: \\ m, the messages — none a warning or an error (each row ends with its level and
      // time), or none at all.
      await s.keys("\\", "m");
      await s.until(() => s.rowOf("Messages") >= 0 || s.rowOf("no messages") >= 0, 5000, "the messages, or none");
      const bad = s.screen().filter((r) => /\b(warn|error) \d\d:\d\d:\d\d\b/.test(r));
      s.expect(!bad.length, `no warning among the messages:\n${bad.join("\n")}`);
      await s.keys("escape");
      // Sooner than the 6 MB note's parse: it's parsed on other threads, and a key waiting for it on the main thread
      // would wait as long as this runner takes to parse it on one. Measured on this runner, not a fixed bound: a
      // shared one's speed comes and goes (a CI runner has answered in two seconds, and in five).
      s.expect(
        answered < bigParse,
        `keys answered while it indexes, before its big note's parse (${answered} ms; ${Math.round(bigParse)} ms)`,
      );
    },
  },
  {
    area: "outside-and-code",
    name: "autosave: an idle note written — never mid-insert, never while git holds its index lock",
    covers: { cases: ["autosave"] },
    // A note of the product team's repository.
    options: { home: true, startAt: "home/work/product/roadmap/q4.md", config: "[editor]\nautosave_ms = 400\n" },
    run: async (s) => {
      const NOTE = "~/work/product/roadmap/q4.md";
      await typedAtEnd(s, "Autosaved line.");
      await s.file(NOTE, (t) => t.includes("Autosaved line."), "the idle note autosaved");
      // Mid-insert: a while with no key, still nothing written; esc, and it is.
      await s.keys("o");
      await s.type("Still typing.");
      await sleep(1500);
      s.expect(!s.read(NOTE).includes("Still typing."), "nothing autosaved mid-insert");
      await s.keys("escape");
      await s.file(NOTE, (t) => t.includes("Still typing."), "autosaved after esc");
      // git mid-commit: it waits for the lock to go.
      const lock = s.path("~/work/product/.git/index.lock");
      writeFileSync(lock, "");
      await s.keys("o");
      await s.type("Under the lock.");
      await s.keys("escape");
      await sleep(1500);
      s.expect(!s.read(NOTE).includes("Under the lock."), "nothing autosaved while git holds index.lock");
      await s.status("• unsaved");
      rmSync(lock);
      await s.file(NOTE, (t) => t.includes("Under the lock."), "autosaved once git let go");
    },
  },
  {
    area: "outside-and-code",
    name: "index: space v r while git holds its index lock — an open note git changed is read again once git lets go, once",
    covers: { cases: ["index", "reload"], commands: ["vault.reindex"] },
    // Not watching: only the reindex reads the note again.
    options: { home: true, startAt: "home/work/product/roadmap/q4.md", config: "[watch]\nenabled = false\n" },
    run: async (s) => {
      const NOTE = "~/work/product/roadmap/q4.md";
      await s.status("q4.md");
      // git mid-checkout: the note rewritten under its lock, then a reindex.
      const lock = s.path("~/work/product/.git/index.lock");
      writeFileSync(lock, "");
      writeFileSync(s.path(NOTE), `${s.read(NOTE)}\nA line git wrote.\n`);
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/, 5000);
      await s.keys("shift+g");
      await sleep(1500);
      s.expect(!s.screen().some((r) => r.includes("A line git wrote.")), "not read again while git holds index.lock");
      rmSync(lock);
      await s.message(/q4\.md changed on disk — reloaded/, 5000);
      await s.keys("shift+g");
      await s.see("A line git wrote.", 5000);
      const said = await messagesSaying(s, "q4.md changed", /q4\.md changed on disk — reloaded/);
      s.expect(said === 1, `read again once (${said} times)`);
    },
  },
  {
    area: "outside-and-code",
    name: "hand-off: an editor that changes the note — your unsaved edit saved first, its change shown after, nothing unsaved",
    covers: { cases: ["reload"], commands: ["note.edit"] },
    // Not watching: what shows after is the hand-off's own reload, not the watcher's.
    options: {
      open: KENJI,
      config: `[watch]\nenabled = false\n\n[editor]\ncommand = ${JSON.stringify("sh -c 'echo Added in the editor. >> \"$0\"' {file}")}\n`,
    },
    run: async (s) => {
      await s.see("second desk by the window");
      await typedAtEnd(s, "- Typed before the hand-off.");
      await s.status("• unsaved");
      await leader(s, "n", "e");
      await s.see("Added in the editor.", 5000);
      s.expect(
        s.read(KENJI).includes("- Typed before the hand-off.\nAdded in the editor."),
        "the edit saved before the editor appended to it",
      );
      await s.see("Typed before the hand-off.");
      await s.until(
        () => !s.statusLine().includes("unsaved"),
        3000,
        "nothing unsaved: the file's text is the buffer's",
      );
    },
  },

  // --- your shell and an agent's context ----------------------------------------------------------
  {
    area: "outside-and-code",
    name: "shell: :!cmd runs in the root's folder, % the file's path; its output in a window, enter on a path:line opens it there",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // % is the note on screen, from the root.
      await s.ex("!wc -l %");
      await s.see(/\$ wc -l % — exit 0/, 5000);
      await s.see(/\d+ meetings\/2026-09-14-weekly\.md/);
      await s.keys("escape");
      // grep's places, a line each: one picked by its path, enter opens it there.
      await s.ex("!grep -rn Kiso-Hara people");
      await s.see(/\$ grep -rn Kiso-Hara people — exit 0/, 5000);
      await s.see("people/kenji-mori.md:16:Visiting astronomer from the Kiso-Hara");
      await s.type("kenji-mori.md:16");
      await s.keys("enter");
      await opened(s, KENJI);
      await s.status(/L16:/);
    },
  },
  {
    area: "outside-and-code",
    name: "shell: :!cmd's window lists what a command writes to its errors among its output, where it wrote it (D264)",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // By turns to its output and its errors, with no pause between: through one pipe, in the order written.
      await s.ex("!for i in 1 2 3 4; do echo out$i; echo err$i >&2; done");
      await s.see(/\$ for i in 1 2 3 4; .* — exit 0/, 5000);
      await s.see("err4");
      const rows = ["out1", "err1", "out2", "err2", "out3", "err3", "out4", "err4"].map((l) =>
        s.rowOf(new RegExp(`\\b${l}\\b`)),
      );
      s.expect(
        rows.every((r, i) => r >= 0 && (i === 0 || r > rows[i - 1]!)),
        `its lines in the order written, rows ${rows.join(", ")}`,
      );
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: :!cmd's window keeps a character the command printed in two halves whole",
    covers: { commands: ["shell.run"] },
    options: { open: MEETING },
    run: async (s) => {
      // An em dash's first two bytes, then, a moment later, its last: one character, never two replacement ones.
      await s.ex("!printf '\\342\\200'; sleep 0.3; printf '\\224 dash\\n'");
      await s.see(/\$ printf .* — exit 0/, 5000);
      await s.see("— dash");
      s.expect(!s.text().includes("\uFFFD"), "no replacement character on the screen");
      await s.keys("escape");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: lines filtered through a command — :17,20!sort -r, one undo step; ! on a visual selection",
    covers: { commands: ["shell.filter", "edit.undo", "visual.line"] },
    options: { open: MEETING },
    run: async (s) => {
      const above = (a: string, b: string) => s.rowOf(a) >= 0 && s.rowOf(a) < s.rowOf(b);
      await s.see("Tomasz: book the courier");
      s.expect(above("Tomasz: book", "Lena: update"), "the actions in their order");
      // The four actions, sorted backwards by sort: the ticked one first.
      await s.ex("17,20!sort -r");
      await s.message("4 lines through sort -r", 5000);
      await s.until(() => above("Lena: update", "Tomasz: book"), 3000, "the lines sorted");
      s.expect(!s.read(MEETING).includes("- [x] Lena: update the visitor leaflet\n- [ ] Tomasz"), "nothing written");
      // One undo step brings them back.
      await s.keys("u");
      await s.until(() => above("Tomasz: book", "Lena: update"), 3000, "the order back with one u");
      // Two lines picked in visual mode, ! asks the command for them.
      await s.ex("17");
      await s.keys("shift+v", "j", "!");
      await s.see("'<,'>!");
      await s.type("tr a-z A-Z");
      await s.keys("enter");
      await s.see("TOMASZ: BOOK THE COURIER", 5000);
      await s.see("PRIYA: HALLEY 2.4");
      await s.see("Lena: update the visitor leaflet");
    },
  },
  {
    area: "outside-and-code",
    name: "shell: a filter puts in more than a window shows — 2.2 MB of lines in a line's place, not refused",
    covers: { commands: ["shell.filter"] },
    options: { open: MEETING },
    run: async (s) => {
      // Past the 2 MB a window keeps, short of the 32 MB a filter takes.
      await s.ex("1!head -c 2200000 /dev/zero | tr '\\0' x | fold -w 100");
      await s.message("1 line through head -c 2200000", 10_000);
      await s.see("x".repeat(100)); // its lines in the note
    },
  },
  {
    area: "outside-and-code",
    name: "shell: a command still running is stopped by its command, said",
    covers: { commands: ["shell.run", "shell.stop", "palette.open"] },
    run: async (s) => {
      await s.ex("!sleep 30");
      await s.message("running: sleep 30");
      // One at a time: another said to wait.
      await s.ex("!true");
      await s.message("still running: sleep 30");
      await s.keys(":");
      await s.type("Stop the running command");
      await s.see("Stop the running command");
      await s.keys("enter");
      await s.message(/sleep 30: stopped/, 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "context: space s c copies the note, its links and its backlinks for an agent; an unsaved change saved first",
    covers: { cases: ["context"], commands: ["context.copy"] },
    options: { open: KENJI },
    run: async (s) => {
      await typedAtEnd(s, "- Back in November.");
      await s.status("• unsaved");
      await leader(s, "s", "c");
      await s.message("copied the context of people/kenji-mori.md"); // the box wraps the counts
      await s.file(KENJI, (t) => t.includes("- Back in November."), "the note saved first");
      await s.until(() => s.clipboard().startsWith("# Context: people/kenji-mori.md"), 3000, "the bundle copied");
      const c = s.clipboard();
      s.expect(
        /The note, \d+ files? it links to and \d+ files? linking to it/.test(c),
        `what the bundle holds:\n${c.slice(0, 300)}`,
      );
      for (const part of [
        "## people/kenji-mori.md",
        "Back in November.",
        "## home.md",
        "## people/partners-and-names.md",
      ])
        s.expect(c.includes(part), `the bundle has ${part}`);
    },
  },

  // --- export -------------------------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "export: space n o, Word, enter — the Save As window beside the note, its name filled in; written",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await leader(s, "n", "o");
      await s.see("Export home.md as");
      await s.see("Word (.docx)");
      await s.see("Markdown (.md)");
      // Word first: enter takes it.
      await s.keys("enter");
      await s.see("Export home.md as Word (.docx)");
      await s.see("Beside the note");
      await s.see("Name: home.docx");
      await s.see("ctrl+n: new folder");
      // The name has the focus: enter exports there.
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.message("exported home.md");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: PDF, a web page, an e-book, Markdown through the window; Markdown's picture copied beside it",
    covers: { commands: ["note.export"] },
    options: { open: "projects/dome-refit.md" },
    run: async (s) => {
      const note = s.read("projects/dome-refit.md");
      const formats: [string, string, string][] = [
        ["pdf", "projects/dome-refit.pdf", "%PDF-"],
        ["html", "projects/dome-refit.html", "<!doctype html>"],
        ["epub", "projects/dome-refit.epub", "PK\x03\x04"],
      ];
      for (const [name, file, magic] of formats) {
        await format(s, "projects/dome-refit.md", name);
        await s.see(`Name: dome-refit.${name}`);
        await s.keys("enter");
        await exported(s, file, magic);
      }
      // Markdown: apart from the note, marked an export, its picture in a folder beside it.
      await format(s, "projects/dome-refit.md", "markdown");
      await s.see("Name: dome-refit.export.md");
      await s.keys("enter");
      await exported(s, "projects/dome-refit.export.md", "---\n");
      s.expect(
        s.read("projects/dome-refit.export.md").includes("\ngenerator: slipbox\n"),
        "the Markdown export carries its mark",
      );
      s.expect(
        s.read("projects/dome-refit.export.md").includes("](dome-refit.export.assets/dome-shutter.png)"),
        "the picture's link into the folder beside it",
      );
      await s.until(
        () => s.exists("projects/dome-refit.export.assets/dome-shutter.png"),
        5000,
        "the picture copied beside the export",
      );
      // The note itself as it was.
      s.expect(s.read("projects/dome-refit.md") === note, "the note untouched");
    },
  },
  {
    area: "outside-and-code",
    name: "export: the window's keys — a place, into a folder and up, typing jumps, ~ home, ctrl+n a folder exported into",
    covers: { commands: ["note.export"] },
    // The reference set's home: its Downloads among the places, its folders to go through.
    options: { home: true },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      // Your folders among the places: the ones there are.
      await s.see("Downloads");
      await s.notSee("Documents", 500);
      // tab: from the name round to the places; down to Downloads, enter goes there.
      await s.keys("tab", "down", "enter");
      await s.see("~/Downloads/");
      // ~ home (the folder has the focus now); typing jumps — "wo" to work — and enter goes in.
      await s.type("~");
      await s.see("~/");
      await s.see("hobbies/");
      await s.type("wo");
      await s.keys("enter");
      await s.see("~/work/");
      await s.see("kestrel/");
      // → into product, ← back up, the folder left still the one picked (marked once the name has the focus).
      await s.type("pr");
      await s.keys("right");
      await s.see("~/work/product/");
      await s.keys("left");
      await s.see("~/work/");
      await s.keys("tab");
      await s.see(/›.{0,4}product\//);
      await s.keys("shift+tab");
      // ctrl+n: a folder made there, gone into; then the export lands in it.
      await s.keys("ctrl+n");
      await s.see("New folder:");
      await s.type("q3");
      await s.keys("enter");
      await s.see("~/work/q3/");
      s.expect(s.exists("~/work/q3"), "the new folder made");
      await s.keys("tab", "enter");
      await exported(s, "~/work/q3/home.docx", "PK\x03\x04");
      // The export ended, not only its file there: the file is there a moment before its folder is remembered.
      await s.message("exported home.md");
      // Next time the window opens where this one went (its folder at its top, not the message's path).
      await format(s, "home.md", "word");
      await s.see(/[│┃] ~\/work\/q3\/ +[│┃]/);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: where you exported last — kept once the file is written, so the window opened while its staging is cleared opens there; one that can't be written leaves it as it was",
    covers: { commands: ["note.export"] },
    options: {
      // The export's staging cleared only when the check says.
      ...HOLD,
      // A folder to export into, one that can't be written.
      setup: (s) => {
        for (const dir of ["out", "ro"]) mkdirSync(s.path(dir));
      },
    },
    run: async (s) => {
      const window = /[│┃] out\/ +[│┃]/; // the window's folder: out/
      // Into out/: the file written, its staging held.
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("out/home.docx");
      await s.keys("enter");
      await exported(s, "out/home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
      // The window opened meanwhile: at out/, Last export among the places.
      await format(s, "home.md", "word");
      await s.see(window);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.until(() => hold(s) === "let go", 15000, "the export's staging let go");
      // Into a folder that can't be written: said, and not where you exported last.
      chmodSync(s.path("ro"), 0o555);
      try {
        await format(s, "home.md", "word");
        await s.see(window);
        await s.keys("ctrl+u");
        await s.type("../ro/home.docx");
        await s.keys("enter");
        await s.message(/ro\/home\.docx not written/);
      } finally {
        chmodSync(s.path("ro"), 0o755);
      }
      await format(s, "home.md", "word");
      await s.see(window);
      await s.see("Last export");
      await s.keys("escape");
      await s.notSee("Name: home.docx");
    },
  },
  {
    area: "outside-and-code",
    name: "export: over once its file is written — said while its staging is cleared, Cancel export then finding none running; a cleanup that fails said after it, the newest",
    covers: { commands: ["note.export", "note.export_cancel"] },
    // The export's staging cleared only when the check says.
    options: HOLD,
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
      // Said while its staging is still being cleared; over, so Cancel export finds none running.
      await s.message("exported home.md to home.docx (Word (.docx))");
      await cancelExport(s);
      await s.message("no export is running");
      // The cleanup fails: its folder can't be removed from the cache's `exports/`. Said last, the box at the top.
      const exports = join(s.dir, "cache", "slipbox", "exports");
      chmodSync(exports, 0o555);
      try {
        writeFileSync(join(s.dir, "hold-go"), "");
        await s.message("export cleanup:");
        // The newest box: above every other still showing (each shows for 4 s), the export's own above all.
        const others = ["exported home.md", "no export is running"].map((m) => s.rowOf(m)).filter((row) => row >= 0);
        s.expect(
          others.every((row) => s.rowOf("export cleanup:") < row),
          "the cleanup's warning the newest box",
        );
      } finally {
        // As slipbox makes it, owner-only.
        chmodSync(exports, 0o700);
      }
    },
  },
  {
    area: "outside-and-code",
    name: "export: over once a cancel can't stop it — Cancel export as its publication returns finds none running",
    covers: { commands: ["note.export", "note.export_cancel"] },
    // The first publication held once it has put its document in place, before the export goes on.
    options: { ...HOLD, env: { ...HOLD.env, EXPORT_HOLD_AT: "publication" } },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      await s.until(() => hold(s) === "waiting", 15000, "the publication held");
      await cancelExport(s);
      await s.message("no export is running");
      writeFileSync(join(s.dir, "hold-go"), "");
      await s.message("exported home.md to home.docx (Word (.docx))");
    },
  },
  {
    area: "outside-and-code",
    name: "export: one that can't be written is over once it says so — Cancel export while its staging is cleared finds none running",
    covers: { commands: ["note.export", "note.export_cancel"] },
    options: {
      // The export's staging cleared only when the check says.
      ...HOLD,
      // A folder that can't be written.
      setup: (s) => mkdirSync(s.path("ro")),
    },
    run: async (s) => {
      chmodSync(s.path("ro"), 0o555);
      try {
        await format(s, "home.md", "word");
        await s.see("Name: home.docx");
        await s.keys("ctrl+u");
        await s.type("ro/home.docx");
        await s.keys("enter");
        await s.until(() => hold(s) === "waiting", 15000, "the export's staging held");
        await s.message(/ro\/home\.docx not written/);
        await cancelExport(s);
        await s.message("no export is running");
      } finally {
        writeFileSync(join(s.dir, "hold-go"), "");
        chmodSync(s.path("ro"), 0o755);
      }
    },
  },
  {
    area: "outside-and-code",
    name: "export: an earlier export replaced at once; a file that isn't one only on y — n brings the window back, the file as it was",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      // Exported once: home.docx there.
      await format(s, "home.md", "word");
      await s.keys("enter");
      await exported(s, "home.docx", "PK\x03\x04");
      const first = statSync(s.path("home.docx")).mtimeMs;
      // Again: an earlier export, written over without a question.
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await s.until(() => statSync(s.path("home.docx")).mtimeMs !== first, 15000, "home.docx written again");
      await exported(s, "home.docx", "PK\x03\x04");
      // A file there that isn't an export: asked; n, the window back and the file as it was; y, written.
      s.write("home.docx", "mine\n");
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("enter");
      await s.see("Replace home.docx? It isn't an export.");
      await s.keys("n");
      await s.see("Name: home.docx");
      s.expect(s.read("home.docx") === "mine\n", "the file untouched after n");
      await s.keys("enter");
      await s.see("Replace home.docx? It isn't an export.");
      await s.keys("y");
      await exported(s, "home.docx", "PK\x03\x04");
    },
  },
  {
    area: "outside-and-code",
    name: "export: an earlier PDF, web page or e-book export replaced at once, known by its mark; another tool's web page only on y",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      const formats: [string, string, string][] = [
        ["pdf", "home.pdf", "%PDF-"],
        ["html", "home.html", "<!doctype html>"],
        ["epub", "home.epub", "PK\x03\x04"],
      ];
      for (const [name, file, magic] of formats) {
        // Exported once; again, over the first: an export of slipbox's, by the mark in it — written, nothing asked.
        await format(s, "home.md", name);
        await s.see(`Name: ${file}`);
        await s.keys("enter");
        await exported(s, file, magic);
        const first = statSync(s.path(file)).mtimeMs;
        await format(s, "home.md", name);
        await s.see(`Name: ${file}`);
        await s.keys("enter");
        await s.until(() => statSync(s.path(file)).mtimeMs !== first, 15000, `${file} written again`);
        await exported(s, file, magic);
        s.expect(!s.text().includes("It isn't an export."), `${file}: replaced without a question`);
      }
      // A web page another tool made, there: not slipbox's mark, so asked; n, the window back and the page as it was.
      const theirs =
        '<!doctype html>\n<html><head><meta name="generator" content="pandoc"><title>Home</title></head><body><p>Home.</p></body></html>\n';
      s.write("home.html", theirs);
      await format(s, "home.md", "html");
      await s.see("Name: home.html");
      await s.keys("enter");
      await s.see("Replace home.html? It isn't an export.");
      await s.keys("n");
      await s.see("Name: home.html");
      s.expect(s.read("home.html") === theirs, "their page untouched after n");
      // y: written, slipbox's mark in it now.
      await s.keys("enter");
      await s.see("Replace home.html? It isn't an export.");
      await s.keys("y");
      await s.file("home.html", (t) => /<meta\s+name="generator"\s+content="slipbox"/.test(t), "home.html exported");
    },
  },
  {
    area: "outside-and-code",
    name: "export: a note named as the file — refused, said, the window kept; the note untouched",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      const note = s.read("about-this-vault.md");
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("about-this-vault.md");
      await s.see("Name: about-this-vault.md");
      await s.keys("enter");
      await s.message("is a note");
      await s.see("Name: about-this-vault.md");
      s.expect(s.read("about-this-vault.md") === note, "the note untouched");
      await s.keys("escape");
      await s.notSee("Name: about-this-vault.md");
    },
  },
  {
    area: "outside-and-code",
    name: "export: the Save As window — a name ending in / that isn't there makes that folder and goes into it, the note's name given back; enter exports there (DF-D5)",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await format(s, "home.md", "word");
      await s.see("Name: home.docx");
      await s.keys("ctrl+u");
      await s.type("made/v1/");
      await s.see("Name: made/v1/");
      await s.keys("enter");
      await s.see("Name: home.docx");
      await s.see(/[│┃] made\/v1\/ +[│┃]/); // the window's folder, from the note's
      await s.see("an empty folder");
      s.expect(s.exists("made/v1"), "made/v1/ made");
      s.expect(!s.exists("made/v1/home.docx") && !s.exists("made/v1.docx"), "nothing exported yet");
      await s.keys("enter");
      await exported(s, "made/v1/home.docx", "PK\x03\x04");
      await s.message("exported home.md");
    },
  },
  {
    area: "outside-and-code",
    name: "export: space n shift+o — two notes picked in order, this one first; Markdown, both chapters in that order",
    covers: { commands: ["note.export_many"] },
    run: async (s) => {
      await leader(s, "n", "shift+o");
      await s.see("Notes to export, in order — 1 picked");
      await s.see("Export home.md…");
      // Typed: the notes filtered, "Export…" still first; the note picked second.
      await s.type("about-this");
      await s.see("about-this-vault.md");
      await s.keys("down", "enter");
      await s.see("Notes to export, in order — 2 picked");
      await s.see("Export these 2 notes…");
      await s.keys("up", "enter");
      await s.see("Export 2 notes as");
      await s.type("markdown");
      await s.keys("enter");
      await s.see("Export 2 notes as Markdown (.md)");
      await s.see("Name: home.export.md");
      await s.keys("enter");
      await exported(s, "home.export.md", "---\n");
      const md = s.read("home.export.md");
      const [home, about] = [md.indexOf("# Halden Ridge Observatory"), md.indexOf("# About this vault")];
      s.expect(home > 0 && about > home, "both chapters, home's first");
    },
  },
  {
    area: "outside-and-code",
    name: "export: :export pdf at the command line — the window at once, no format list",
    covers: { commands: ["note.export"] },
    run: async (s) => {
      await s.ex("export pdf");
      await s.see("Export home.md as PDF (.pdf)");
      await s.see("Name: home.pdf");
      // No format list on the way: none of its entries shown.
      await s.notSee("Word (.docx)", 500);
      await s.keys("enter");
      await exported(s, "home.pdf", "%PDF-");
    },
  },
];

export const LEFT_OUT_OUTSIDE_AND_CODE: LeftOut = {};
