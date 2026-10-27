import { describe, expect, test } from "bun:test";
import { makeSandbox, harness, statusRow, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("source mode (space n v)", () => {
  test("the window shows the raw markdown, the cursor on the same source line; back again", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 100, height: 30 });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "Back to"), col: 0 });
    const line = h.app.cursorLine(v);
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true);
    const f = h.frame();
    expect(f).toContain("# Alpha"); // the markdown itself
    expect(f).toContain("[beta](beta.md)");
    expect(statusRow(f)).toContain("SOURCE");
    expect(h.app.cursorLine(v)).toBe(line);
    // Everything on the layout works: find lands in the source; the outline has the headings.
    await h.keys("/", "b", "e", "t", "a", "enter");
    expect(v.find!.matches.length).toBeGreaterThan(0);
    expect(h.app.currentLayout(v).headings.map((x) => x.text)).toContain("Section One");
    await h.keys("escape", "g", "g");
    await h.keys(":", "s", "o", "u", "r", "c", "e", "enter"); // the alias
    expect(v.source).toBe(false);
    expect(statusRow(h.frame())).toContain("READ");
  });
});
