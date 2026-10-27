import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("word count, save all, the change list, moving lines", () => {
  test(":wa saves every changed note; g; g, walk the changes; gi types where the last insert ended", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "line one\nline two\nline three\nline four\n");
    const h = await harness({ root, open: "c.md" });
    await h.keys("space", "n", "v", "g", "g", "A", "!", "escape", "G", "A", "?", "escape");
    await h.app.run("note.open notes/alpha.md");
    await h.keys("space", "n", "v", "A", "#", "escape");
    await h.app.run("note.save_all");
    expect(readFileSync(join(root, "c.md"), "utf8")).toBe("line one!\nline two\nline three\nline four?\n");
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain("#");
    await h.app.run("history.back");
    const v = h.app.view!;
    const line = () => h.app.currentLayout(v).lines[v.cur.row]!.src;
    await h.keys("g", "g");
    await h.keys("g", ";");
    expect(line()).toBe(4); // the newest change
    await h.keys("g", ";");
    expect(line()).toBe(1);
    await h.keys("g", ",");
    expect(line()).toBe(4);
    await h.keys("g", "g", "g", "i", "x", "escape");
    expect(v.buf.source).toContain("line four?x");
  });
});
