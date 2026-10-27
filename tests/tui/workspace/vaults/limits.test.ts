import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 3", () => {
  test("a note that shrinks back under the size cap rejoins the index; too big, it's listed all the same (VV-D8)", async () => {
    const root = makeVault();
    const h = await harness({ root, config: (c) => (c.walk.max_file_size = 100) });
    const file = join(root, "notes", "beta.md");
    writeFileSync(file, "x".repeat(200));
    h.app.watch.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("notes/beta.md")).toBe(false);
    h.app.explorer.expanded.add("notes"); // its folder open, so its notes are rows
    h.app.explorer.invalidateTree();
    // Listed from the disk, not read: the walk doesn't have it.
    expect(h.app.explorer.treeRows().find((r) => r.path === "notes/beta.md")).toMatchObject({ unwalked: true });
    writeFileSync(file, "# Beta small\n");
    h.app.watch.applyChanges({ changes: [{ rel: "notes/beta.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("notes/beta.md")).toBe(true);
    // The walk's again: the tree refreshed by the change.
    expect(h.app.explorer.treeRows().find((r) => r.path === "notes/beta.md")?.unwalked).toBeUndefined();
  });
});
