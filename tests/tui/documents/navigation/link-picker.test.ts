import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("vaults in the TUI (17.x)", () => {
  test("the link picker (21.5): space l i, a note picked, its link written as the convention writes it — reading, after the word; typing, at the cursor; saved", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-picker-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "b.md"), "---\ntitle: The B note\n---\n# B\n");
    writeFileSync(join(root, "a.md"), "# A\n\nSee here for more.\n");
    const h = await harness({ root, open: "a.md" });
    // Reading: on "here", the link goes after the word — markdown, relative, the note's title its text.
    await h.keys("j", "j", "w");
    await h.keys("space", "l", "i");
    expect((h.app.overlay as ListOverlay).title).toBe("Link to…");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["sub/b.md"]); // never the note itself
    await h.keys("enter");
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("# A\n\nSee here [The B note](sub/b.md) for more.\n");
    expect(h.app.messages.at(-1)!.text).toBe("linked sub/b.md: [The B note](sub/b.md)");
    // Typing, in a wikilink root: at the cursor, by name.
    mkdirSync(join(root, "wiki", ".obsidian"), { recursive: true });
    writeFileSync(join(root, "wiki", "c.md"), "# C\n");
    writeFileSync(join(root, "wiki", "d.md"), "# D\n\n");
    const w = await harness({ root: join(root, "wiki"), open: "d.md" });
    await w.app.run("view.source");
    await w.keys("shift+g", "i");
    for (const k of ["A", "l", "s", "o", "space"]) await w.keys(k);
    await w.app.run("link.insert");
    await w.keys("enter");
    expect(w.app.view!.buf.source).toContain("Also [[c]]");
    expect(w.app.view!.insert).toBe(true); // still typing, after it
    await w.keys("escape");
    // Not a note of a root's: said so.
    writeFileSync(join(root, "data.json"), "{}\n");
    await h.app.run("tab.close");
    h.app.open("data.json");
    await h.app.run("link.insert");
    expect(h.app.messages.at(-1)!.text).toBe("links are written in this folder's notes");
  });
});
