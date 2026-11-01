import { join } from "node:path";
import { leader, moveTo } from "../check.ts";
import type { Session } from "../session.ts";

/** One window's breadcrumb each: how many windows the tab shows. */
export const windows = (s: Session) => s.text().split("§ ").length - 1;

/** The find row: the query after ›, then its count, or "no matches" (the breadcrumb has › too, never after a
 *  border). */
export const findRow = (s: Session) => s.screen().find((r) => /[│┃] › /.test(r)) ?? "";

/** Wait for slipbox to exit (on its own: a quit, a signal, a start that fails). */
export const exits = (s: Session, what: string) => s.until(() => s.exited(), 5000, what);

/** Go to a line with ctrl+g, and wait for the cursor there. */
export async function goto(s: Session, line: number): Promise<void> {
  await s.keys("ctrl+g");
  await s.type(String(line));
  await moveTo(s, ["enter"], (l) => l === line, `line ${line}`);
}

/** The line (from 1) of a file's first line starting with `start`: the sample's text a check relies on, said if gone. */
export function lineOf(s: Session, rel: string, start: string): number {
  const at = s
    .read(rel)
    .split("\n")
    .findIndex((l) => l.startsWith(start));
  s.expect(at >= 0, `${rel} has a line starting ${JSON.stringify(start)}`);
  return at + 1;
}

/** The window in source mode: view.source toggles, so pressed only when it isn't (a session may bring it back so). */
export async function toSource(s: Session): Promise<void> {
  if (!/\bSOURCE\b/.test(s.statusLine())) await leader(s, "n", "v");
  await s.status("SOURCE");
}

/** The user's config file: a check that changes it while slipbox runs, or between starts. */
export const configFile = (s: Session) => join(s.dir, "config", "slipbox", "config.toml");
