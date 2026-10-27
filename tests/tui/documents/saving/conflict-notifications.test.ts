import { describe, expect, test } from "bun:test";

import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("vaults in the TUI (17.x)", () => {
  test("a dirty note changed on disk while another list is open is said once, not per write", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.keys("shift+a", "!", "escape");
    const buf = h.app.view!.buf;
    expect(buf.dirty).toBe(true);
    h.app.overlays.openList({ title: "Something else", items: [{ label: "x", data: null }], accept: () => {} });
    const before = h.app.messages.length;
    for (let k = 0; k < 3; k++) h.app.saving.conflictPrompt(buf);
    expect(
      h.app.messages.slice(before).filter((m) => m.text.includes("changed on disk while you have unsaved changes")),
    ).toHaveLength(1);
  });
});
