import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIFF_MAX, readForDiff } from "../../../../../src/tui/workspace/git/views/panel/gitview.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { sandbox } = makeGitPanelFixture();

describe("a diff's file read from disk", () => {
  test("a link read as git keeps it, where it leads, never followed; a file past the cap not read; one not there, empty", () => {
    const dir = mkdtempSync(join(sandbox, "read-"));
    writeFileSync(join(dir, "elsewhere.md"), "not the vault's\n");
    symlinkSync(join(dir, "elsewhere.md"), join(dir, "link.md"));
    expect(readForDiff(join(dir, "link.md"))).toBe(join(dir, "elsewhere.md"));
    expect(readForDiff(join(dir, "elsewhere.md"))).toBe("not the vault's\n");
    writeFileSync(join(dir, "big.md"), Buffer.alloc(DIFF_MAX + 1, 97));
    expect(readForDiff(join(dir, "big.md"))).toEqual({ why: "larger than 8 MB: no diff shown" });
    expect(readForDiff(join(dir, "none.md"))).toBe("");
  });
});
