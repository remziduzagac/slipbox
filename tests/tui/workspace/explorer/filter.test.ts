import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): what a filter or a search marks, drawn where it is", () => {
  test("the explorer's filter marks whole characters: a decomposed accent kept, a wide one whole", async () => {
    const root = makeVault();
    writeFileSync(join(root, "café.md"), "# Café\n");
    writeFileSync(join(root, "日本.md"), "# Japan\n");
    const h = await harness({ root, open: "index.md", width: 140, height: 30 });
    await h.keys("space", "e", "/", "c", "a", "f", "e");
    expect(h.frame()).toContain("café.md");
    expect(h.frame()).not.toContain("cafe.md");
    await h.keys("escape", "/", "日");
    expect(h.frame()).toContain("日本.md");
  });
  test("the explorer's filter marks only what the row shows: never over its menu button", async () => {
    const root = makeVault();
    writeFileSync(join(root, "abcdefghijklmnopqrstuv-qq.md"), "# Q\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 30 });
    await h.keys("space", "e", "/", "q", "q");
    const row = h
      .frame()
      .split("\n")
      .find((r) => r.includes("abcdefghij"))!;
    expect(row).toContain(h.app.glyphs.itemMenu);
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(true);
  });
});
