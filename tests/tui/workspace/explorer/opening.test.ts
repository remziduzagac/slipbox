import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  test("explorer s opens in the other window when a split is there already", async () => {
    const h = await harness({ open: "index.md", width: 160, height: 40 });
    await h.keys("ctrl+w", "v", "ctrl+w", "h");
    const reading = h.app.tab!.views[0]!.buf.rel;
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.path === "crlf.md");
    await h.keys("s");
    expect(h.app.tab!.views[0]!.buf.rel).toBe(reading);
    expect(h.app.tab!.views[1]!.buf.rel).toBe("crlf.md");
  });
});
