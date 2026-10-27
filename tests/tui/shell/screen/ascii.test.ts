import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): what a filter or a search marks, drawn where it is", () => {
  test("ASCII glyphs reach every cell: a find match's row, the cursor on a dash", async () => {
    const root = makeVault();
    writeFileSync(join(root, "d.md"), "# D\n\nfoo — bar “q”\n");
    const h = await harness({ root, open: "d.md", width: 80, height: 20, config: (c) => (c.render.glyphs = "ascii") });
    const noUnicode = () => expect([...h.frame()].filter((ch) => ch.codePointAt(0)! > 0x7e && ch !== "\n")).toEqual([]);
    await h.keys("/", "b", "a", "r", "enter"); // the row has a match: drawn a cell at a time
    expect(h.frame()).toContain('foo - bar "q"');
    noUnicode();
    await h.keys("escape", "space", "n", "v");
    const v = h.app.view!;
    h.app.moveCursor(v, { row: 2, col: 4 }); // on the dash
    noUnicode();
  });
});
