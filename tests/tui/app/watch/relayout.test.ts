import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 3", () => {
  test("a change to one note re-lays out only the open notes that link to it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.openInNewTab("samples/equipment/telescope-comparison.md");
    h.frame();
    const wide = h.app.view!;
    const before = h.app.currentLayout(wide);
    const alpha = h.app.tabs[0]!.views[0]!;
    const alphaBefore = h.app.currentLayout(alpha);
    h.app.watch.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.currentLayout(wide)).toBe(before); // no link to beta: the same layout object
    expect(h.app.currentLayout(alpha)).not.toBe(alphaBefore); // links to beta: re-laid out
  });
});
