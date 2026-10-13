// A terminal check: one feature, small related ones grouped (TT-D3), named by it under its area, saying what it
// covers — the reference set's areas (`examples/home/CASES.md`'s `###` headings) and the commands it runs for their
// effect (TT-D4) — and what the checks share: reading the cursor's place, opening a note, leader keys, an explorer row.

import { readFileSync } from "node:fs";
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

/** The status line naming `path` as the file open — not the link under the cursor (`→ /x.md`). */
export async function opened(s: Session, path: string | RegExp): Promise<void> {
  const p = typeof path === "string" ? path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : path.source;
  await s.status(new RegExp(`\\s${p}(\\s|$)`));
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

/** Leader sequences: space, then the keys. */
export const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);

/**
 * A panel open and focused: its leader key cycles it (open, focus, close), each press seen taking effect before the
 * next is decided, since pressed blind, a late first one would make the third close it.
 */
export async function panelFocused(s: Session, key: string, mode: string, title: RegExp): Promise<void> {
  for (let i = 0; i < 2 && !s.statusLine().includes(mode); i++) {
    const open = s.rowOf(title) >= 0;
    await leader(s, key);
    await s.until(
      () => s.statusLine().includes(mode) || (!open && s.rowOf(title) >= 0),
      undefined,
      `space ${key} to open or focus it`,
    );
  }
  await s.status(mode);
}

/** The explorer open and focused (FILES). */
export const explorerOpen = (s: Session) => panelFocused(s, "e", "FILES", /Explorer/);

/** The explorer closed: space e until it's gone, each press seen taking effect first. */
export async function explorerClosed(s: Session): Promise<void> {
  for (let i = 0; i < 3 && s.rowOf(/Explorer/) >= 0; i++) {
    const was = s.statusLine().includes("FILES");
    await leader(s, "e");
    await s.until(
      () => s.rowOf(/Explorer/) < 0 || s.statusLine().includes("FILES") !== was,
      undefined,
      "space e to focus or close the explorer",
    );
  }
  await s.notSee(/Explorer/);
}

/** Select the explorer's row named `name` (it has focus, the row on screen): from the top, down to it. */
export async function explorerRow(s: Session, name: string): Promise<void> {
  await s.keys("g", "g");
  // Its rows: left of its border (in code points: the Nerd glyphs are two units), past the left rail. Read once the
  // explorer shows the row: a busy slipbox draws it late.
  const find = () => {
    const screen = s.screen();
    const title = screen.findIndex((r) => /Explorer/.test(r));
    if (title < 0) return null;
    const border = [...screen[title]!].findIndex((c) => c === "│" || c === "┃");
    const left = (r: string) => [...r].slice(3, border).join("");
    const first = screen.findIndex((r, i) => i > title && /\S/.test(left(r)));
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
