// Shared helpers for the link, file and workspace terminal checks.

import { spawnSync } from "node:child_process";
import { EXPLORER, leader, pos } from "../check.ts";
import type { Session } from "../session.ts";

/** git in one of the reference set's repositories, as its owner runs it (HOME the set's); what it said. */
export function git(s: Session, repo: string, ...args: string[]): { code: number; out: string } {
  const r = spawnSync(
    "git",
    ["-c", "user.email=sam@kestrel.dev", "-c", "user.name=Sam Rivera", "-C", s.path(repo), ...args],
    { encoding: "utf8", env: { ...process.env, HOME: s.home } },
  );
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** What the explorer shows: each row left of its border, from under its breadcrumb down (empty when it's closed). */
export function explorer(s: Session): string[] {
  const rows = s.screen();
  const title = rows.findIndex((r) => EXPLORER.test(r));
  if (title < 0) return [];
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return rows.slice(title + 2, -1).map((r) => [...r].slice(0, border).join(""));
}

/** The explorer's breadcrumb (VV-D5): its row under the title, left of its border ("" when it's closed). */
export function crumbs(s: Session): string {
  const rows = s.screen();
  const title = rows.findIndex((r) => EXPLORER.test(r));
  if (title < 0) return "";
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return [...rows[title + 1]!].slice(3, border).join("").trim(); // past the rail
}

/** The explorer has a row that ends with `name` (a folder's or a file's, after its icon and marks). */
export const listed = (s: Session, name: RegExp) => explorer(s).some((r) => names(r, name));

/** Whether an explorer row matches: its whole text, or what comes before a run of spaces — its name, the description
 *  and the marks at its right (VV-D9) left out. */
export function names(row: string, name: RegExp): boolean {
  const t = row.trimEnd();
  if (name.test(t)) return true;
  for (const m of t.matchAll(/ {2,}/g)) if (name.test(t.slice(0, m.index))) return true;
  return false;
}

/** How many messages say `needle`: the Messages window filtered by `words` first (it shows only its newest rows). */
export async function messagesSaying(s: Session, words: string, needle: RegExp): Promise<number> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(words);
  // The list's own rows: each ends with its level and time. (The boxes floating at the top right say the newest
  // messages again, on the same rows, without either.)
  const said = new RegExp(`${needle.source}.*\\b(info|warn|error) \\d\\d:\\d\\d:\\d\\d`);
  const n = s.screen().filter((r) => said.test(r)).length;
  await s.keys("escape");
  return n;
}

/** The newest message holding `needle`, whole (the list cuts it, its box wraps it): the list filtered, enter copies. */
export async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

/** The link under the cursor, as the status line names it (`→ path`). */
export const linkHere = (s: Session) => /→ (\S+)/.exec(s.statusLine())?.[1] ?? "";

/**
 * From the top, tab from link to link until the one under the cursor is `target` (as the status line names it). Each
 * move is seen on the screen before the link is read: a note's place comes back at a start, the cursor maybe on this
 * very link, and a loaded machine's frame reaches the terminal after slipbox has drawn it — read before it lands, the
 * status line still names the link while the cursor is at the top, and `enter` sent then follows nothing.
 */
export async function toLink(s: Session, target: string | RegExp): Promise<void> {
  const is = () => (typeof target === "string" ? linkHere(s) === target : target.test(linkHere(s)));
  const at = () => `${pos(s).line}:${pos(s).col}`;
  const from = at();
  const sent = performance.now();
  await s.keys("g", "g");
  await s.settle(sent); // what slipbox wrote for it, arrived
  // Still on a link where it was: the top's frame not here yet (unless that was the top).
  if (linkHere(s) && from !== "1:1") await s.until(() => at() !== from, 3000, "g g to move the cursor to the top");
  for (let i = 0; i < 60 && !is(); i++) {
    const before = at();
    await s.keys("tab");
    await s.until(() => at() !== before, 3000, "tab to move the cursor to the next link");
  }
  await s.until(is, 1000, `the cursor on the link to ${target}`);
}

/** ~/notes/index.md's link into kestrel, as rendered. */
export const ARCHITECTURE = "architecture. The";

/** A peek's hint, in its bottom border, while one is open. */
export const PEEK_HINT = "o go there · t keep as a tab";
