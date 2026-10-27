import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("UI keys: alt+z wraps, space u m gives the mouse back, space n r reloads from disk", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# R\n\nbefore\n");
    const h = await harness({ root, open: "r.md" });
    await h.keys("alt+z");
    expect(h.app.ui.wrap).toBe(false);
    await h.keys("alt+z");
    expect(h.app.ui.wrap).toBe(true);
    const mouse = h.app.ui.mouse;
    await h.keys("space", "u", "m");
    expect(h.app.ui.mouse).toBe(!mouse);
    writeFileSync(join(root, "r.md"), "# R\n\nafter\n");
    await h.keys("space", "n", "r");
    expect(h.app.view!.buf.source).toBe("# R\n\nafter\n");
  });
});
