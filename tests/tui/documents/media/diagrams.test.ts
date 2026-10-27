import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMermaid, mermaidPending } from "../../../../src/core/rendering/media/diagrams/diagrams.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

// A diagram the library never finishes laying out: drawn on the screen's thread, it froze slipbox (#164). Should a
// newer library draw it, this test says so: find another that it doesn't.
describe("a diagram the library never finishes (#164)", () => {
  test("its source while it's being drawn, the keys answered meanwhile, then its source saying it took too long", async () => {
    const root = makeVault();
    const diagram = readFileSync(join(import.meta.dir, "../../../fixtures", "diagram", "never-finishes.mmd"), "utf8");
    writeFileSync(join(root, "hangs.md"), `# Hangs\n\nBefore.\n\n${"```"}mermaid\n${diagram}${"```"}\n\nAfter.\n`);
    const h = await harness({ root, open: "hangs.md", width: 100, config: (c) => (c.ui.sidebar = false) });
    h.canvas();
    expect(mermaidPending()).toBe(true);
    expect(h.frame()).toContain("Workspace owner");
    const row = h.app.view!.cur.row;
    await h.keys("j");
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(mermaidPending()).toBe(true); // still being drawn, elsewhere
    const started = performance.now();
    await loadMermaid();
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(h.frame()).toContain("took too long to draw");
    expect(h.frame()).toContain("Workspace owner");
  });
});
