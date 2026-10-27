import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "../../../../src/core/foundation/platform/lazy.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("lazy loading (16.6)", () => {
  test("a module arriving lays out again the notes laid out while it loaded (a Mermaid diagram as its code, 12.10) — no other", async () => {
    const root = makeVault();
    writeFileSync(join(root, "lazy.md"), "# L\n\nText.\n");
    const h = await harness({ root, open: "lazy.md" });
    const before = h.app.currentLayout(h.app.view!);
    expect(h.app.currentLayout(h.app.view!)).toBe(before); // kept while nothing changes
    // Something else arriving (a grammar): the note didn't wait for it, its layout kept — a big one isn't laid out
    // whole.
    await load(`a-module-${Math.random()}`, async () => 1);
    expect(h.app.currentLayout(h.app.view!)).toBe(before);
    // What it waited for: laid out again.
    const name = `a-module-${Math.random()}`;
    before.pending = [name];
    await load(name, async () => 1);
    expect(h.app.currentLayout(h.app.view!)).not.toBe(before);
  });
});
