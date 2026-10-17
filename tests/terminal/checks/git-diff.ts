// The diff window's edges (GIT-D2, D245): a note's block too big to diff by its words, diffed by its lines; `enter` on a
// line of a block's before frame, to that line where it is now; what no line shows (a byte order mark, the final
// newline) said in a dim row at its place. Its first checks — changed words, a note's blocks, a code file's two sides,
// line endings alone — are source-control.ts's, whose repository these make the same way: with git, in the check's home.

import type { Check } from "../check.ts";
import type { Session } from "../session.ts";
import { bgIn, bgOf, NUMBERS, on, put, ROLES, repoAt, TRAIL, toPanel, trail } from "./source-control.ts";

/** A row's diff tint, if it has one: a line's or a word's, removed or added. */
const TINTS = (["diff_del", "diff_del_word", "diff_add", "diff_add_word"] as const).map(bgOf);

/** The dim role's colour: what no line shows is said in it. */
const DIM = ROLES.dim.fg!.toLowerCase();

/** The waypoints of a route: 300 lines, too many tokens to diff by word (`MAX_TOKENS`), so a block's are diffed by line. */
const WAYPOINTS = Array.from({ length: 300 }, (_, i) => `const wp${i} = ${i * 5}; // waypoint ${i}`);
const ROUTE = (lines: string[]) =>
  `# The route\n\nThe ridge's waypoints, as the GPS logged them.\n\n\`\`\`js\n${lines.join("\n")}\n\`\`\`\n`;

/** A packing list in a code block, a line a thing. */
const PACK = (items: string[]) => `# Packing\n\n\`\`\`text\n${items.join("\n")}\n\`\`\`\n`;

/** `/` to `text` in the diff window, the find closed: the cursor on its first place after the cursor. */
async function findIn(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  // esc: the find's highlights gone (a second would close the window).
  await s.keys("enter", "escape");
}

export const GIT_DIFF: Check[] = [
  {
    area: "outside-and-code",
    name: "git diff: a code block past the word diff's budget, by its lines — its changed lines tinted, their changed words marked, the rest plain",
    covers: { cases: ["git", "code", "big"], commands: ["git.view"] },
    options: repoAt((s) => {
      trail(s, { "route.md": ROUTE(WAYPOINTS) });
      // A word changed in one line, a line removed near the top; a line added near the end.
      const now = WAYPOINTS.filter((l) => !l.startsWith("const wp9 ")).map((l) =>
        l.startsWith("const wp5 ") ? l.replace("wp5", "wp5x") : l,
      );
      now.splice(now.indexOf("const wp295 = 1475; // waypoint 295") + 1, 0, "const summit = 1500; // the top");
      put(s, TRAIL, { "route.md": ROUTE(now) });
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M route.md");
      await s.see("route.md against what's staged");
      // Paired, before and after — not removed whole, then added whole.
      await s.see("┌ before");
      s.expect(!s.text().includes("┌ removed"), "the block not shown removed whole");
      await s.see("const wp5 = 25; // waypoint 5");
      // The line changed: on the removed tint, its changed word more strongly; the line removed, on the tint whole.
      s.expect(bgIn(s, "const wp5 = 25;", "wp5") === bgOf("diff_del_word"), "the changed word marked");
      s.expect(bgIn(s, "const wp5 = 25;", "const") === bgOf("diff_del"), "the rest of its line on the line's tint");
      s.expect(bgIn(s, "const wp9 = 45;", "wp9") === bgOf("diff_del"), "the line removed on the tint");
      s.expect(bgIn(s, "const wp9 = 45;", "waypoint") === bgOf("diff_del"), "the whole of it");
      // A line unchanged: plain.
      const plain = bgIn(s, "const wp4 = 20;", "wp4");
      s.expect(!TINTS.includes(plain ?? ""), `an unchanged line plain: ${plain}`);
      // At the end, the after frame: the line added on its tint, the lines around it plain.
      await s.keys("G");
      await s.see("const summit = 1500; // the top");
      s.expect(bgIn(s, "const summit = 1500;", "summit") === bgOf("diff_add"), "the line added on the tint");
      const after = bgIn(s, "const wp296 = 1480;", "wp296");
      s.expect(!TINTS.includes(after ?? ""), `an unchanged line after it plain: ${after}`);
    },
  },
  {
    area: "outside-and-code",
    name: "git diff: enter on a line of a block's before frame goes to that line where it is now; on a line removed, to where its change is",
    covers: { cases: ["git", "code"], commands: ["git.view"] },
    options: repoAt((s) => {
      // rope was line 6 and is line 8 now: two things packed before it; water, after it, taken out.
      trail(s, { "pack.md": PACK(["boots", "map", "rope", "water", "stove"]) });
      put(s, TRAIL, { "pack.md": PACK(["tent", "stakes", "boots", "map", "rope", "stove"]) });
    }),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M pack.md");
      await s.see("pack.md against what's staged");
      await s.see("┌ before");
      // rope in the before frame (the first on the screen): enter, the file at its line now — not the block's first.
      await findIn(s, "rope");
      await s.keys("enter");
      await s.notSee("pack.md against what's staged");
      await s.status(/pack\.md.*L8:/);
      // water, removed: where its change is, the line after it inside the block — stove's now.
      await toPanel(s);
      await on(s, "M pack.md");
      await s.see("pack.md against what's staged");
      await findIn(s, "water");
      await s.keys("enter");
      await s.notSee("pack.md against what's staged");
      await s.status(/pack\.md.*L9:/);
    },
  },
  {
    area: "outside-and-code",
    name: "git diff: what no line shows, in a dim row at its place — a byte order mark removed at the top; the final newline, after a line changed",
    covers: { cases: ["git", "encoding", "code"], commands: ["git.view"] },
    // A code file's diff as its lines, unified: narrower than two columns of 80.
    options: repoAt(
      (s) => {
        trail(s, { "src/numbers.ts": `﻿${NUMBERS}` });
        // Written again by another editor: no mark, no final newline — and a number changed.
        put(s, TRAIL, { "src/numbers.ts": NUMBERS.replace("= 450;", "= 600;").replace(/\n$/, "") });
      },
      { size: { cols: 120, rows: 40 } },
    ),
    run: async (s) => {
      await toPanel(s);
      await on(s, "M numbers.ts");
      await s.see("src/numbers.ts against what's staged");
      await s.see("\\ byte order mark removed");
      await s.see("+ export const maxClimb = 600;");
      await s.see("\\ no newline at end of file");
      // Each at its place: the mark before the first row, the final newline after the last; the line between.
      const rows = [
        "\\ byte order mark removed",
        "- export const maxClimb = 450;",
        "+ export const maxClimb = 600;",
        "\\ no newline at end of file",
      ].map((r) => s.rowOf(r));
      s.expect(rows[0]! >= 0 && rows.every((r, i) => i === 0 || r > rows[i - 1]!), `in order: ${rows}`);
      for (const said of ["\\ byte order mark removed", "\\ no newline at end of file"]) {
        const fg = s.styleOf(said)?.fg?.toLowerCase();
        s.expect(fg === DIM, `${said}: dim (${fg}, not ${DIM})`);
      }
      // No row for what's the same: the line endings.
      s.expect(!s.text().includes("\\ line endings"), "no line endings row");
    },
  },
];
