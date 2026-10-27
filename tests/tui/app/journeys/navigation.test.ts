import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("window and link keys: ctrl+\\ splits side by side; g x follows; space h p / space h n go back and forward", async () => {
    const h = await harness({ open: "index.md", width: 160 });
    await h.keys("ctrl+\\");
    const t = h.app.tab!;
    expect([t.views.length, t.orientation]).toEqual([2, "side"]);
    await h.keys("ctrl+w", "o");
    const from = h.app.view!.buf.rel;
    await h.keys("tab", "g", "x"); // the first link, followed
    const to = h.app.view!.buf.rel;
    expect(to).not.toBe(from);
    await h.keys("space", "h", "p");
    expect(h.app.view!.buf.rel).toBe(from);
    await h.keys("space", "h", "n");
    expect(h.app.view!.buf.rel).toBe(to);
  });
});
