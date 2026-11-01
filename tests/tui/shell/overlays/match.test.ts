import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { match, rank } from "../../../../src/tui/shell/overlays/match.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review cycle 5 (core, from mutation testing)", () => {
  test("the switcher's match is smart-case too", async () => {
    const { match } = await import("../../../../src/tui/shell/overlays/match.ts");
    expect(match("Tel", "telescope.md")).toBeNull();
    expect(match("tel", "Telescope.md")).not.toBeNull();
  });
});

describe("review round 3", () => {
  test("matching: each word as typed, its letters together, the words in any order; smart case; highlights (3.16)", () => {
    expect(match("ab", "cab.md")).not.toBeNull();
    expect(match("ab", "a-b.md")).toBeNull(); // not letter by letter
    expect(
      rank("readme", ["r/e/a/d/m/e.md", "notes/rename-adme.md", "areas/readme.md"], (x) => x).map((r) => r.item),
    ).toEqual(["areas/readme.md"]);
    const path = "handbook/operations-handbook.md";
    expect(match("oper hand", path)).not.toBeNull();
    expect(match("hand oper", path)).not.toBeNull(); // any order
    expect(match("oper xyz", path)).toBeNull(); // every word
    expect(match("oper hand", path)!.positions).toEqual([9, 10, 11, 12, 20, 21, 22, 23]); // in the file name, each word's best place
    // Smart case, word by word.
    expect(match("Tel", "telescope.md")).toBeNull();
    expect(match("tel Scope", "tel-Scope.md")).not.toBeNull();
    // Highlights follow the text even where lowercasing changes its length.
    expect(match("read", "areas/readme.md")!.positions).toEqual([6, 7, 8, 9]);
    expect(match("stan", "İİstanbul.md")!.positions).toEqual([2, 3, 4, 5]);
    // As drawn: a name's control characters never are, so the name shown is found, positions its own.
    expect(match("bellring", "bell\x07ring.md")!.positions).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(match("ring", "a\u202e/ring.md", 2)!.positions).toEqual([3, 4, 5, 6]);
    expect(match("c", "ab\u202ec", 3)!.score).toBe(match("c", "abc", 2)!.score); // the label ends where it did: c is after it
    // Ranked: the file name over a folder, a word start, the shorter.
    expect(
      rank("readme", ["readme-old/notes.md", "areas/the-readme-of-it.md", "areas/readme.md"], (x) => x).map(
        (r) => r.item,
      ),
    ).toEqual(["areas/readme.md", "areas/the-readme-of-it.md", "readme-old/notes.md"]);
    // A label over its description — even mid-word over a word start — which still counts.
    const items = [
      { label: "Delete the note", detail: "moves it to the trash" },
      { label: "Remove the tag", detail: "from every note" },
    ];
    expect(rank("move", items, (i) => [i.label, i.detail]).map((r) => r.item.label)).toEqual([
      "Remove the tag",
      "Delete the note",
    ]);
    expect(rank("move trash", items, (i) => [i.label, i.detail]).map((r) => r.item.label)).toEqual(["Delete the note"]);
  });

  test("matching: a query typed on from one that matched nothing matches nothing either — capitals, words, as drawn", () => {
    // What a link's completion counts on to rank nothing past a non-match (20.13).
    const texts = [
      "handbook/operations-handbook.md",
      "tel-Scope.md",
      "Telescope.md",
      "İİstanbul.md",
      "Café notes.md",
      "ǅ notes.md",
      "bell\x07ring.md",
      "a\u202e/ring.md",
    ];
    const starts = ["x", "q", "hanx", "tels", "TelX", "cafx", "i̇x", "ǆx", "bellx", "ring z", "oper xyz"];
    const more = ["", "a", "S", "x", "e", " hand", " Scope", "İ", "é", "ǅ", "\x07ring"];
    for (const text of texts)
      for (const q of starts) {
        if (match(q, text)) continue;
        for (const m of more) expect([text, q + m, match(q + m, text)]).toEqual([text, q + m, null]);
      }
  });
});
