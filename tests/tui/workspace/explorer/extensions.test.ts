import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the explorer shows extensions", () => {
  test("notes' names keep .md, as other files keep theirs", async () => {
    const root = makeVault();
    writeFileSync(join(root, "app.toml"), "a = 1\n");
    const h = await harness({ root });
    for (let i = 0; i < 3 && h.app.region !== "sidebar"; i++) await h.keys("space", "e");
    const f = h.frame();
    expect(f).toContain(" index.md");
    expect(f).toContain(" app.toml");
    expect(f).not.toMatch(/ index\s*┃/); // never the bare name
  });
});
