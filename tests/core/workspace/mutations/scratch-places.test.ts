import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { stalePlaces } from "../../../../src/core/workspace/mutations/scratch-places.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const FILE = "a\nb\nc\nd\ne\n";
const read = (abs: string) => (abs === "/v/f.md" ? FILE : abs === "/abs/g.md" ? "x\ny\n" : null);
const entry = (at: string, lines: string, lang = "") =>
  `**When:** 2026-11-08 14:05 UTC+03:00\\\n**At:** \`${at}\`\n\n\`\`\`${lang}\n${lines}\n\`\`\`\n\n**Note:** n\n`;

describe("the scratch's places checked (D268)", () => {
  test("lines still where they were say nothing — a part of a line too, an absolute path's as well", () => {
    expect(stalePlaces(entry("f.md:2-3", "b\nc"), "/v", read)).toEqual([]);
    expect(stalePlaces(entry("f.md:2", "b"), "/v", read)).toEqual([]);
    expect(stalePlaces(entry("/abs/g.md:2", "y"), "/v", read)).toEqual([]);
  });
  test("lines found elsewhere moved: the nearest place, a fix pointing the At: there", () => {
    const [s] = stalePlaces(entry("f.md:1-2", "d\ne"), "/v", read);
    expect(s!.problem).toMatchObject({
      start: { line: 2, column: 9 },
      severity: "warning",
      code: "place-moved",
      message: "lines 1–2 moved: now lines 4–5",
      fix: { title: "Point At: to lines 4–5", text: "`f.md:4-5`" },
      target: "f.md:1-2",
    });
    expect(s!.now).toEqual({ path: "f.md", startLine: 4, endLine: 5 });
    // Of two places holding them, the nearer.
    const twice = (abs: string) => (abs === "/v/t.md" ? "q\nz\nq\nq\nq\nz\n" : null);
    expect(stalePlaces(entry("t.md:5", "z"), "/v", twice)[0]!.now!.startLine).toBe(6);
  });
  test("lines found nowhere changed; a file gone is said", () => {
    expect(stalePlaces(entry("f.md:1", "zz"), "/v", read).map((s) => [s.problem.code, s.problem.message])).toEqual([
      ["place-changed", "line 1 changed since captured"],
    ]);
    expect(stalePlaces(entry("gone.md:1", "a"), "/v", read).map((s) => s.problem.message)).toEqual([
      "gone.md: no such file",
    ]);
  });
  test("nothing to compare: no lines, a review's diff, entries written before (blank lines, no When:) checked alike", () => {
    expect(stalePlaces("**At:** `f.md:1`\\\n**Note:** n\n", "/v", read)).toEqual([]);
    expect(stalePlaces(entry("f.md:1", "-a\n+b", "diff"), "/v", read)).toEqual([]);
    const old = "**At:** `f.md:1-2`\n\n```\nzz\n```\n\n**Note:** n\n";
    expect(stalePlaces(old, "/v", read).map((s) => s.problem.code)).toEqual(["place-changed"]);
  });
});
