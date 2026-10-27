import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("brackets (25.3)", () => {
  test("the matching one: forward from an opening bracket, back from a closing one, past the nested pairs of its kind", async () => {
    const { matchBracket, bracketFrom } = await import("../../../../src/core/documents/editing/brackets.ts");
    const t = "f(a, [b(c)], {d})";
    expect([
      matchBracket(t, 1),
      matchBracket(t, 16),
      matchBracket(t, 5),
      matchBracket(t, 7),
      matchBracket(t, 13),
    ]).toEqual([16, 1, 10, 9, 15]);
    // Another kind between counts for nothing; unmatched, none; not a bracket, none.
    expect([matchBracket("( ] )", 0), matchBracket("((x)", 0), matchBracket("abc", 1)]).toEqual([4, -1, -1]);
    expect(matchBracket("{\n  x\n}", 0)).toBe(6);
    // Where % starts: at the cursor's bracket, else the line's next; none further than the line.
    expect([bracketFrom("ab(c)", 0), bracketFrom("ab(c)", 3), bracketFrom("ab\n(c)", 0)]).toEqual([2, 4, -1]);
  });

  test("pairs closed as typed: an opening bracket before a space, the end or a closing one; quotes not in a word; skips, backspace", async () => {
    const { autoPair, emptyPair } = await import("../../../../src/core/documents/editing/brackets.ts");
    expect([autoPair("", 0, "("), autoPair("x y", 1, "["), autoPair("f)", 1, "{")]).toEqual(["()", "[]", "{}"]);
    // Before a word: as typed.
    expect(autoPair("word", 0, "(")).toBeNull();
    // A closing one already there: stepped over, nothing inserted; a quote too.
    expect([autoPair("()", 1, ")"), autoPair('""', 1, '"')]).toEqual(["", ""]);
    // An apostrophe in a word, a quote before one: as typed.
    expect([autoPair("don", 3, "'"), autoPair("x", 0, '"'), autoPair("say ", 4, "`")]).toEqual([null, null, "``"]);
    expect([emptyPair("()", 1), emptyPair("''", 1), emptyPair("(x)", 1), emptyPair("(]", 1)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
