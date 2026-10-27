import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("lists and commands no test had run (the TUI model)", () => {
  test("the outline of a note without headings says so; Info's filter matching nothing says so", async () => {
    const root = makeVault();
    writeFileSync(join(root, "plain.md"), "just text\n");
    const h = await harness({ root, open: "plain.md" });
    await h.keys("space", "o");
    expect(h.app.rightView).toBe("outline");
    expect(h.frame()).toContain("no headings");
    await h.app.run("info.toggle");
    expect(h.app.rightView).toBe("info");
    expect(h.frame()).not.toContain("no matches");
    h.app.region = "outline";
    await h.keys("/", "z", "q", "x", "j");
    expect(h.frame()).toContain("no matches");
  });
});
