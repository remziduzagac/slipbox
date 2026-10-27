import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
  };
  test("a click on blank space never follows a link: past a row's end, below the note", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "See also [alpha](notes/alpha.md)\n");
    const h = await harness({
      root,
      open: "c.md",
      width: 100,
      height: 30,
      config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)),
    });
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    click(h, pane.x + pane.w - 5, pane.y + 20); // below the text
    expect(h.app.view!.buf.rel).toBe("c.md");
    const row = h
      .frame()
      .split("\n")
      .findIndex((r) => r.includes("See also"));
    click(h, pane.x + pane.w - 5, row); // past the row's end
    expect(h.app.view!.buf.rel).toBe("c.md");
  });
});
