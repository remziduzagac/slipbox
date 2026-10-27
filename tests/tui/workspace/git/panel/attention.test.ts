import { describe, expect, test } from "bun:test";
import { attention } from "../../../../../src/core/workspace/git/gitrepos.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
makeGitPanelFixture();

describe("the repositories by what needs attention (VV-D10)", () => {
  const state = (entries: number, ahead = 0) => ({
    branch: "main",
    entries: Array.from({ length: entries }, (_, i) => ({ path: `f${i}`, x: " ", y: "M" })),
    track: { branch: "main", upstream: "origin/main", ahead, behind: 0, gone: false },
  });
  test("a worktree's work to review, then changes, then ahead or behind, then clean; not asked, last", () => {
    expect(attention([state(0), state(2)])).toBe(4);
    expect(attention([state(3), state(0)])).toBe(3);
    expect(attention([state(0, 1)])).toBe(2);
    expect(attention([state(0)])).toBe(1);
    expect(attention([null, undefined])).toBe(0);
  });
});
