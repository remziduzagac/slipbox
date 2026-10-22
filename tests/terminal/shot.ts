// A docs' screenshot (docs/images/<name>.png): what it starts on, the keys that bring its screen about, and the
// pictures on it. Each doc's shots are a file of their own in tests/terminal/shots/, named after the doc and exporting
// `SHOTS`; `bun run shots` takes every file's (tests/terminal/shots.ts). What they share is here.
//
// To add one: put it in its doc's file (a new doc: a new file, as the others are), named after the doc
// (`vaults-home`); take it, `bun run shots vaults-home`, and look at the PNG; then show it in the doc,
// `![what it shows](../images/vaults-home.png)`. tests/docs.test.ts fails while a picture has no shot, or a shot's
// picture is in no doc.

import { cpSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO, type Session, type SessionOptions } from "./session.ts";

export { leader, open } from "./check.ts";

/** The terminal's size in every screenshot. */
export const SHOT_SIZE = { cols: 120, rows: 34 };

export interface Shot {
  /** The file, `docs/images/<name>.png`: the doc's name first (`getting-started-switcher`). */
  name: string;
  /** Where it starts: the sample folders only (`GUIDE`, `HOME(…)`). */
  options: SessionOptions;
  /** Brings the screen to what the picture shows: it waits for what it shows, never for a time. */
  take: (s: Session) => Promise<void>;
  /**
   * The pictures on that screen, PNG files, from the session's folder (`home/…`), in the order their first cells
   * come: the screen has only their placeholder cells, which the screenshot draws them over.
   */
  pictures?: string[];
}

/** The tour's own vault: `~/slipbox-tour`, two notes and `.slipbox/`, as getting started makes it (examples/guide). */
export const GUIDE: SessionOptions = {
  setup: (s) => cpSync(join(REPO, "examples", "guide"), s.home, { recursive: true }),
  startAt: "home/slipbox-tour",
};

/** The quick start's `~/notes`: the tour's two notes in an ordinary folder of home, no vault of their own. */
export const NOTES: SessionOptions = {
  setup: (s) =>
    cpSync(join(REPO, "examples", "guide", "slipbox-tour"), join(s.home, "notes"), {
      recursive: true,
      filter: (from) => !from.includes(".slipbox"),
    }),
  startAt: "home/notes/inbox.md",
};

/** The reference set (examples/home), started on one of its files: `HOME("notes/index.md")`. */
export const HOME = (at: string): SessionOptions => ({ home: true, startAt: `home/${at}` });

/** Kestrel's own config has mistakes on purpose (the reference set's cases): their warnings, gone. */
export const quiet = (s: Session) => s.notSee("config.toml", 15000);

/** Every doc's shots, from tests/terminal/shots/: a file each, so shots for two docs are added apart. */
export async function allShots(): Promise<Shot[]> {
  const dir = join(import.meta.dir, "shots");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const shots: Shot[] = [];
  for (const f of files) shots.push(...(((await import(join(dir, f))) as { SHOTS?: Shot[] }).SHOTS ?? []));
  const names = shots.map((s) => s.name);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`two shots named ${twice.join(", ")}`);
  return shots;
}
