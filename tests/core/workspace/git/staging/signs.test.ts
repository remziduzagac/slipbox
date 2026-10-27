import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("changes against what's staged (26.1)", () => {
  test("added, changed and deleted runs; signs by line, a deletion's on the line before it or the first", async () => {
    const { gitChanges, gitSigns, changeAt, changeDiff } = await import(
      "../../../../../src/core/workspace/git/gitsigns.ts"
    );
    const staged = "a\nb\nc\nd\ne\n";
    const changes = gitChanges(staged, "a\nB\nc\nnew\nd\n");
    expect(changes).toEqual([
      { kind: "change", from: 2, to: 2, wasAt: 1, was: ["b"], now: ["B"] },
      { kind: "add", from: 4, to: 4, wasAt: 3, was: [], now: ["new"] },
      { kind: "delete", from: 6, to: 5, wasAt: 4, was: ["e"], now: [] },
    ]);
    expect([...gitSigns(changes)]).toEqual([
      [2, "change"],
      [4, "add"],
      [5, "delete"],
    ]);
    const top = gitChanges("x\na\n", "a\n");
    expect([...gitSigns(top)]).toEqual([[1, "topdelete"]]);
    expect([
      changeAt(changes, 5)?.kind,
      changeAt(changes, 4)?.kind,
      changeAt(changes, 3),
      changeAt(top, 1)?.kind,
    ]).toEqual(["delete", "add", null, "delete"]);
    expect(changeDiff(changes[0]!)).toBe("-b\n+B");
    // Line endings aren't changes; the line after a final newline is no line.
    expect(gitChanges("a\nb\n", "a\r\nb\r\n")).toEqual([]);
    expect(gitChanges("a\n", "a")).toEqual([]);
    // Nor is a byte order mark: git's text has it, a buffer's doesn't (it's kept apart). A change's lines never carry
    // it, so one put back in a buffer doesn't double it.
    expect(gitChanges("\uFEFF# T\nb\n", "# T\nb\n")).toEqual([]);
    expect(gitChanges("\uFEFF# T\nb\n", "# U\nb\n")).toEqual([
      { kind: "change", from: 1, to: 1, wasAt: 0, was: ["# T"], now: ["# U"] },
    ]);
    // A file git doesn't have: every line added; an empty one, nothing.
    expect(gitChanges(null, "x\ny\n")).toEqual([{ kind: "add", from: 1, to: 2, wasAt: 0, was: [], now: ["x", "y"] }]);
    expect(gitChanges(null, "")).toEqual([]);
  });
});
