// What the scenarios share: the demo vault's notes they use, reading the cursor's place, opening
// a note, leader keys, picking an explorer row.

import { join } from "node:path";
import type { Session, SessionOptions } from "./session.ts";

export interface Scenario {
  name: string;
  options?: SessionOptions;
  /** The pane size it needs (docked panes need 90 columns); skipped in a smaller pane. */
  needs?: { cols?: number; rows?: number };
  run: (s: Session) => Promise<void>;
}

export const HANDBOOK = "handbook/operations-handbook.md";
export const MEETING = "meetings/2026-09-14-weekly.md";
export const TOML = "software/halley/halley.toml";
/** The repository's own TypeScript 7: a real language server the scenarios can run offline (19.x). */
export const TSC = join(import.meta.dir, "..", "..", "node_modules", ".bin", "tsc");

/** The cursor's line and column, from the status line (`L12:3`). */
export function pos(s: Session): { line: number; col: number } {
  const m = /L(\d+):(\d+)/.exec(s.statusLine());
  return m ? { line: Number(m[1]), col: Number(m[2]) } : { line: -1, col: -1 };
}

/** Keys, then wait until the cursor's line satisfies `ok`. */
export async function moveTo(s: Session, keys: string[], ok: (line: number, col: number) => boolean, what: string): Promise<void> {
  await s.keys(...keys);
  await s.until(() => {
    const p = pos(s);
    return ok(p.line, p.col);
  }, 3000, what);
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
 * A problem's severity sign, as the glyph set in use draws it (19.9) — on the status line, in the bar and the
 * Problems panel: unicode's, or the Nerd Font's (a kitty, Ghostty or WezTerm terminal gets those).
 */
export const SIGN = { error: "[✖\uea87]", warning: "[⚠\uea6c]", info: "[ℹ\uea74]" } as const;
/** A pattern of `source`, `{error}`, `{warning}` and `{info}` standing for their signs. */
export const signed = (source: string): RegExp => new RegExp(source.replace(/\{(error|warning|info)\}/g, (_, k: keyof typeof SIGN) => SIGN[k]));

/** Leader sequences: space, then the keys. */
export const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);

/** Select the explorer's row named `name` (it has focus, the row on screen): from the top, down to it. */
export async function explorerRow(s: Session, name: string): Promise<void> {
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
