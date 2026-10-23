// A terminal check: one feature, small related ones grouped (TT-D3), named by it under its area, saying what it
// covers — the reference set's areas (`examples/home/CASES.md`'s `###` headings) and the commands it runs for their
// effect (TT-D4) — and what the checks share: reading the cursor's place, opening a note, leader keys, an explorer row.

import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Session, SessionOptions } from "./session.ts";

/** The areas checks fall under: the runner's filters and its report group by them. */
export type Area = "reading" | "editing" | "navigating" | "links-and-files" | "outside-and-code";

export interface Check {
  area: Area;
  /** The feature, as a person would name it: `links: follow, back and forward`. */
  name: string;
  covers: {
    /** `CASES.md` areas (its `###` headings) this check exercises. */
    cases?: string[];
    /** Commands (core/command-specs.ts) it runs for their effect; the runner fails a check that declares one it
     *  never ran. */
    commands?: string[];
  };
  options?: SessionOptions;
  /** Timed against the clock (an answer within so long): run by itself, after the others, not among them. */
  alone?: boolean;
  run: (s: Session) => Promise<void>;
}

/**
 * What an area's checks leave out, each with its reason (TT-D4): a command with nothing to see, a case area the
 * headless tests cover, one only a real terminal shows (herdr's set).
 */
export interface LeftOut {
  commands?: Record<string, string>;
  cases?: Record<string, string>;
}

/** CASES.md's areas of the command line alone: what an agent or a script runs, no screen in it. */
export const CLI_CASES = [
  "cli",
  "task",
  "read",
  "write",
  "stat",
  "render",
  "backlinks",
  "resolve",
  "diagnostics",
  "doctor",
  "capture",
  "send",
  "stale",
  "mv",
  "cp",
  "rm",
  "undo",
  "relink",
  "apply",
  "init",
  "folders",
  "output",
  "files",
  "skill",
  "names",
  "wikilinks",
  "ls",
  "mixed",
  "cli-parity",
];

export const HANDBOOK = "handbook/operations-handbook.md";
export const MEETING = "meetings/2026-09-14-weekly.md";
export const TOML = "software/halley/halley.toml";
/** The repository's own TypeScript 7: a real language server the checks can run offline (19.x). */
export const TSC = join(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");

/** The cursor's line and column, from the status line (`L12:3`). */
export function pos(s: Session): { line: number; col: number } {
  const m = /L(\d+):(\d+)/.exec(s.statusLine());
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: -1, col: -1 };
}

/** Keys, then wait until the cursor's line satisfies `ok`. */
export async function moveTo(
  s: Session,
  keys: string[],
  ok: (line: number, col: number) => boolean,
  what: string,
): Promise<void> {
  await s.keys(...keys);
  await s.until(
    () => {
      const p = pos(s);
      return ok(p.line, p.col);
    },
    3000,
    what,
  );
}

/** Open a note with the quick switcher. */
export async function open(s: Session, name: string): Promise<void> {
  await s.keys("ctrl+p");
  await s.see(/Open (note|\()/); // "Open (n notes, m files)" when the vault has files
  await s.type(name);
  await s.keys("enter");
  await s.status(name);
}

/**
 * The status line naming `path` as the file open: where it draws it, before the window's forward arrow (`‹ x.md ›`;
 * `< x.md >` in ASCII). Not the link under the cursor (`→ x.md (resolved)`), which names a link by its text while the
 * note it's in is still open: a link out of the vault, followed once its target answers (VV-D6), opens a moment later.
 */
export async function opened(s: Session, path: string | RegExp): Promise<void> {
  const p = typeof path === "string" ? path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : path.source;
  await s.status(new RegExp(`\\s${p} [›>]`));
}

/** Follow the link whose text shows `text`: found, the find row closed, enter. */
export async function follow(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape", "enter");
}

/**
 * A problem's severity sign, as the glyph set in use draws it (19.9) — on the status line, in the bar and the
 * Problems panel: unicode's, or the Nerd Font's.
 */
export const SIGN = { error: "[✖]", warning: "[⚠]", info: "[ℹ]" } as const;
/** A pattern of `source`, `{error}`, `{warning}` and `{info}` standing for their signs. */
export const signed = (source: string): RegExp =>
  new RegExp(source.replace(/\{(error|warning|info)\}/g, (_, k: keyof typeof SIGN) => SIGN[k]));

/**
 * A problem of the file on screen, as the Problems panel's This file lists it (the status line only counts them,
 * 1.7): the panel opened, `needle` waited for there, the panel closed again.
 */
export async function problemListed(s: Session, needle: string | RegExp, timeout = 3000): Promise<void> {
  await s.keys("space", "n", "q");
  await s.status("PROBLEMS");
  await s.see(needle, timeout);
  await s.keys("q");
  await s.until(() => !s.statusLine().includes("PROBLEMS"), 3000, "the Problems panel closed");
}

/**
 * The reference set's Downloads, copied beside home, to `elsewhere/` in the check's folder: a folder outside every vault
 * and outside home. Downloads itself is home's, and its skip list leaves it out of home's index (VV-D2); a check of
 * what a folder outside every vault does starts here instead (`startAt: "elsewhere/stray-note.md"`).
 */
export function downloadsElsewhere(s: Session): void {
  cpSync(s.path("~/Downloads"), join(s.dir, "elsewhere"), { recursive: true, verbatimSymlinks: true });
}

/**
 * The reference set's Downloads, copied beside home and given a `.slipbox/`, to `downloads/` in the check's folder: a
 * vault of its own, walked and indexed — where what Elsewhere has no index for (backlinks, a folder watched whole) is
 * checked on Downloads' files (`startAt: "downloads/stray-note.md"`).
 */
export function downloadsVault(s: Session): void {
  cpSync(s.path("~/Downloads"), join(s.dir, "downloads"), { recursive: true, verbatimSymlinks: true });
  mkdirSync(join(s.dir, "downloads", ".slipbox"), { recursive: true });
}

/** Leader sequences: space, then the keys. */
export const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);

/** The floating scratch's bottom border, how it closes (#43): on screen while it's open. */
export const SCRATCH_FLOATING = "esc · q closes, saved";

/**
 * The mode on the status line: its chip, at its start (` FILES `), or null while it shows something else — the keys
 * pending (` ␣ `, as the leader's which-key popup is up), an operator's, a prompt.
 */
export function mode(s: Session): string | null {
  return /^ ([A-Z][A-Z-]*) /.exec(s.statusLine())?.[1] ?? null;
}

/**
 * The explorer's own title, at its top: "Explorer", its buttons (a new note, a new folder), its border. Not the
 * leader's which-key popup, on screen between `space` and `e`, whose line for `space e` says "Explorer: open, focus,
 * close". A pane shorter than eight rows has no title.
 */
export const EXPLORER = /Explorer +(?:\S+ +)*[│┃]/;

/** The outline's own title, after the right panel's border; not the which-key popup's "Outline: open, focus, close". */
export const OUTLINE = /[│┃] Outline +/;

/**
 * A panel open and focused: its leader key pressed once, unless it is already, then its own `title` and the status
 * line's `mode` waited for together. Its key cycles it — opened and focused, focused, closed (panels.ts) — so one press
 * gets there from closed or open, and it's never pressed again on a screen that hasn't caught up: the which-key popup,
 * still showing, names the panel too, and a second press would close it. Called with nothing else taking the keys (a
 * picker, a filter, keys pending).
 */
export async function panelFocused(s: Session, key: string, panelMode: string, title: RegExp): Promise<void> {
  const focused = () => s.rowOf(title) >= 0 && mode(s) === panelMode;
  if (focused()) return;
  await leader(s, key);
  await s.until(focused, undefined, `space ${key} to open the panel and focus it`);
}

/** The explorer open and focused (FILES). */
export const explorerOpen = (s: Session) => panelFocused(s, "e", "FILES", EXPLORER);

/**
 * The explorer closed: focused first (`explorerOpen`), then space e once, its title gone and a mode other than FILES
 * on the status line waited for — each press seen taking effect before the next, never on the which-key popup.
 */
export async function explorerClosed(s: Session): Promise<void> {
  const closed = () => s.rowOf(EXPLORER) < 0 && mode(s) !== null && mode(s) !== "FILES";
  if (closed()) return;
  await explorerOpen(s);
  await leader(s, "e");
  await s.until(closed, undefined, "space e to close the explorer");
}

/** Select the explorer's row named `name` (it has focus, the row on screen): from the top, down to it. */
export async function explorerRow(s: Session, name: string): Promise<void> {
  await s.keys("g", "g");
  // Its rows: left of its border (in code points: the Nerd glyphs are two units), past the left rail. Read once the
  // explorer shows the row: a busy slipbox draws it late.
  const find = () => {
    const screen = s.screen();
    const title = screen.findIndex((r) => EXPLORER.test(r));
    if (title < 0) return null;
    const border = [...screen[title]!].findIndex((c) => c === "│" || c === "┃");
    const left = (r: string) => [...r].slice(3, border).join("");
    // The tree's rows: from under the breadcrumb, the title's next row (VV-D5).
    const first = screen.findIndex((r, i) => i > title + 1 && /\S/.test(left(r)));
    const at = screen.findIndex((r, i) => i >= first && new RegExp(`\\b${name}\\b`).test(left(r)));
    return first >= 0 && at >= first ? { first, at } : null;
  };
  await s.until(() => find() !== null, undefined, `the explorer to show ${name}`);
  const { first, at } = find()!;
  for (let i = first; i < at; i++) await s.keys("j");
}

/** A file an export wrote (in halden's copy, `~/…`, or a whole path), waited for: there, and starting with `magic`. */
export async function exported(s: Session, rel: string, magic: string, timeout = 15000): Promise<void> {
  const starts = () => readFileSync(s.path(rel)).subarray(0, magic.length).toString("latin1") === magic;
  await s.until(() => s.exists(rel) && starts(), timeout, `${rel} written, starting ${JSON.stringify(magic)}`);
}
