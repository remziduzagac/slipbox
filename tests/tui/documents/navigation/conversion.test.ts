import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 3 (TUI)", () => {
  test(":convert-links <note> from the palette previews that note's links only (20.1)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c1.md"), "[[beta]]\n");
    writeFileSync(join(root, "c2.md"), "[[beta]] too\n");
    const h = await harness({ root, open: "c1.md", width: 160, height: 40 });
    h.app.graph.build(true);
    await h.keys(":", ...[..."convert-links"], "space", ...[..."c1"], "enter");
    expect(h.app.messages.some((m) => m.text.includes("takes no argument"))).toBe(false);
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["c1.md:1"]);
  });
});
