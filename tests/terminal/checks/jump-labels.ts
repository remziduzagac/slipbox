// Jump labels: `s` while reading and `g w` in SOURCE view label the words and links of both windows of a split.

import { type Check, open, pos } from "../check.ts";
import type { Session } from "../session.ts";

/** Where `word` first shows on screen: its row, and where it starts among the row's characters as drawn. */
function placeOf(s: Session, word: string, after = ""): { y: number; at: number } {
  const rows = s.runs().map((r) => r.map((x) => x.text).join(""));
  const y = rows.findIndex((r) => r.includes(after + word));
  if (y < 0) throw new Error(`${after + word} isn't on screen`);
  return { y, at: rows[y]!.indexOf(after + word) + after.length };
}

/** The label drawn at a place: the run of one style that starts there, whatever the text around it is drawn in. */
function labelAt(s: Session, p: { y: number; at: number }): string {
  let x = 0;
  for (const r of s.runs()[p.y] ?? []) {
    if (x === p.at) return r.text.trim();
    x += r.text.length;
  }
  return "";
}

/** The labels shown (`JUMP` on the status line), then the one on `p` typed: the cursor goes there. */
async function jumpTo(s: Session, p: { y: number; at: number }, keys = ["s"]): Promise<void> {
  await s.keys(...keys);
  await s.status("JUMP");
  const label = labelAt(s, p);
  s.expect(/^[a-z]{1,2}$/.test(label), `a label of one or two letters there, not "${label}"`);
  await s.keys(...label);
  await s.until(() => !s.statusLine().includes("JUMP"), 3000, "the labels gone");
}

export const JUMP_LABELS: Check[] = [
  {
    area: "navigating",
    name: "jump labels: s labels both windows of a split, a label goes there; enter follows a link; esc leaves it",
    covers: { cases: ["cursor", "windows"], commands: ["cursor.jump", "window.split_side", "link.follow"] },
    // Small enough that every word both windows show has a label: past the alphabet's square, the farthest go without.
    options: { size: { cols: 160, rows: 30 } },
    run: async (s) => {
      // home.md on the left, about-this-vault.md on the right, focused.
      await s.status("home.md");
      await s.keys("ctrl+w", "v");
      await open(s, "about-this-vault");
      const welcome = placeOf(s, "Welcome");
      const invented = placeOf(s, "invented");
      // A label in the other window: the cursor there, its window focused.
      await jumpTo(s, welcome);
      await s.status("home.md");
      s.expect(pos(s).line === 3 && pos(s).col === 1, `the cursor on Welcome (L3:1), not ${s.statusLine()}`);
      // Back in the first, by a label of its own.
      await jumpTo(s, invented);
      await s.status("about-this-vault.md");
      s.expect(pos(s).line === 3, `the cursor on invented (L3), not ${s.statusLine()}`);
      // esc, and a key no label goes on with, leave everything as it was: the window, the cursor.
      const here = pos(s);
      for (const key of ["escape", "1"]) {
        await s.keys("s");
        await s.status("JUMP");
        await s.keys(key);
        await s.until(() => !s.statusLine().includes("JUMP"), 3000, "the labels gone");
        const now = pos(s);
        s.expect(
          s.statusLine().includes("about-this-vault.md") && now.line === here.line && now.col === here.col,
          `nothing moved after ${key}: ${s.statusLine()}`,
        );
      }
      // In SOURCE view g w labels (s substitutes there); esc leaves it.
      await s.keys("ctrl+k");
      await s.status("SOURCE");
      await s.keys("g", "w");
      await s.status("JUMP");
      await s.keys("escape");
      await s.until(() => !s.statusLine().includes("JUMP"), 3000, "the labels gone");
      await s.keys("ctrl+k");
      await s.status("READ");
      // On a link: enter follows it, here.
      await jumpTo(s, placeOf(s, "home", "or start at "));
      await s.keys("enter");
      await s.status("home.md");
      await s.see("Welcome to the observatory's notes");
    },
  },
];
