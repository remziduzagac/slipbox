// What the herdr checks and the screenshots share: a check's shape, opening a note, leader keys.

import type { Session, SessionOptions } from "./session.ts";

/** A check that needs a real terminal (a herdr pane): what it covers, said in its name. */
export interface Scenario {
  name: string;
  options?: SessionOptions;
  /** The pane size it needs; skipped in a smaller pane. */
  needs?: { cols?: number; rows?: number };
  run: (s: Session) => Promise<void>;
}

/** Open a note with the quick switcher. */
export async function open(s: Session, name: string): Promise<void> {
  await s.keys("ctrl+p");
  await s.see(/Open (note|\()/); // "Open (n notes, m files)" when the vault has files
  await s.type(name);
  await s.keys("enter");
  await s.status(name);
}

/** Leader sequences: space, then the keys. */
export const leader = (s: Session, ...keys: string[]) => s.keys("space", ...keys);
