import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 2", () => {
  test("side panes can't squeeze the note to nothing: no crash with a split and wide panes", async () => {
    const h = await harness({
      open: "samples/about-this-vault.md",
      width: 100,
      height: 30,
      config: (c) => ((c.ui.outline = true), (c.ui.sidebar_width = 60), (c.ui.outline_width = 60)),
    });
    await h.keys("ctrl+w", "v");
    h.frame(); // throws on a drawing failure
    expect(h.app.panels.contentWidth()).toBeGreaterThanOrEqual(24);
  });
});
