import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("links out of data files in the TUI (16.15)", () => {
  test("a value that is a path is a link: coloured, followed with enter", async () => {
    const root = makeVault();
    writeFileSync(join(root, "app.toml"), '[api]\ndocs = "notes/alpha.md"\nname = "plain"\n');
    const h = await harness({ root, open: "app.toml", width: 100 });
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    expect(layout.links.map((l) => [l.target, l.status])).toEqual([["notes/alpha.md", "resolved"]]);
    const l = layout.links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("notes/alpha.md");
  });
});
