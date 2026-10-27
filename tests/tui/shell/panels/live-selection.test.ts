import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("the explorer and outline keep their selection when an agent adds a note or a heading", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 160, height: 40 });
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    h.app.explorer.expanded.add("notes");
    h.app.explorer.invalidateTree();
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.path === "notes/beta.md");
    writeFileSync(join(root, "notes", "aaa.md"), "# new\n");
    h.app.watch.applyChanges({ changes: [{ rel: "notes/aaa.md", kind: "created", isNote: true }], rescan: false });
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe("notes/beta.md");
  });
});
