import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("a link to a folder is resolved, and followed reveals the folder in the explorer, unfolded and focused (21.2)", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "folders.md"),
      "# Folders\n\n[the notes](notes/) and [the projects](/projects) and [nowhere](nowhere/)\n",
    );
    const h = await harness({ root, open: "folders.md" });
    const links = h.app.currentLayout(h.app.view!).links;
    expect(links.map((l) => [l.target, l.status])).toEqual([
      ["notes/", "resolved"],
      ["/projects", "resolved"],
      ["nowhere/", "unresolved"],
    ]);
    await h.keys("tab", "enter");
    expect(h.app.leftView).toBe("explorer");
    expect(h.app.region).toBe("sidebar");
    expect(h.app.explorer.expanded.has("notes")).toBe(true);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]?.path).toBe("notes");
    expect(h.app.view?.buf.rel).toBe("folders.md"); // nothing opened in its place
  });
});
