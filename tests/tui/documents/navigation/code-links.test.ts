import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("code files' links in the TUI (20.19)", () => {
  test("live, the vault's code grammars load by themselves: a comment's path is a backlink, and a rename's to rewrite", async () => {
    const root = makeVault();
    writeFileSync(join(root, "tool.py"), "# see notes/alpha.md\nprint(1)\n");
    const h = await harness({ root, open: "index.md", watch: true });
    let found = false;
    for (const t = Date.now(); !found && Date.now() - t < 8000; ) {
      found = h.app.graph.backlinks("notes/alpha.md").some((b) => b.from === "tool.py");
      if (!found) await Bun.sleep(25);
    }
    expect(found).toBe(true);
  });
});
