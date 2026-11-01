import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { leader } from "../check.ts";
import type { Session } from "../session.ts";

/** The format list for the note on screen, then a format typed into its filter and taken. */
export async function format(s: Session, note: string, name: string): Promise<void> {
  await leader(s, "n", "o");
  await s.see(`Export ${note} as`);
  await s.type(name);
  await s.keys("enter");
}

/** Where `tests/terminal/export-hold.ts`, preloaded, holds the first export: "waiting", then "let go". */
export const hold = (s: Session) =>
  existsSync(join(s.dir, "hold-state")) ? readFileSync(join(s.dir, "hold-state"), "utf8") : "";

/** The preload that holds the first export's cleanup (with `EXPORT_HOLD_AT: "publication"`, its publication) till the
 *  check lets it go (`hold-go`), and its files. */
export const HOLD = {
  preload: "tests/terminal/export-hold.ts",
  env: { EXPORT_HOLD_GO: "{dir}/hold-go", EXPORT_HOLD_STATE: "{dir}/hold-state" },
};

/** Cancel export, from the palette. */
export async function cancelExport(s: Session): Promise<void> {
  await s.keys(":");
  await s.type("Cancel export");
  await s.keys("enter");
}
