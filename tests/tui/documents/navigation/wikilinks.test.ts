import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("wikilinks followed within their root: a name, an alias, a block, a tie picked; in source mode too (21.3)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));
    writeFileSync(join(root, "a", "dup.md"), "# Dup A\n");
    writeFileSync(join(root, "b", "dup.md"), "# Dup B\n");
    writeFileSync(
      join(root, "target.md"),
      "---\naliases: [goal]\n---\n# Target\n\nfirst\n\nthe marked paragraph ^mark\n",
    );
    writeFileSync(join(root, "a", "pic.png"), "png");
    writeFileSync(join(root, "b", "pic.png"), "png");
    writeFileSync(join(root, "wiki.md"), "# Wiki\n\n[[target]] [[goal]] [[target#^mark]] [[dup]] ![[pic.png]]\n");
    const h = await harness({ root, open: "wiki.md" });
    const links = h.app.currentLayout(h.app.view!).links;
    expect(links.map((l) => [l.text, l.status])).toEqual([
      ["target", "resolved"],
      ["goal", "resolved"],
      ["target ^mark", "resolved"],
      ["dup", "ambiguous"],
      ["pic.png", "ambiguous"],
    ]);
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    // Back, the cursor on the link followed: tab goes on to the next.
    await h.keys("ctrl+o", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    expect(h.app.messages.at(-1)!.text).toBe("[[goal]] reached target.md by an alias");
    await h.keys("ctrl+o", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(8); // the paragraph its ^mark closes
    await h.keys("ctrl+o", "tab", "enter");
    expect((h.app.overlay as ListOverlay).title).toBe("[[dup]] matches 2 notes");
    await h.keys("escape");
    // Two attachments of a name: files, and the one picked is opened as a file link is (a picture's path copied).
    await h.keys("tab", "enter");
    expect((h.app.overlay as ListOverlay).title).toBe("[[pic.png]] matches 2 files");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("wiki.md");
    expect(h.app.messages.at(-1)!.text).toMatch(/^attachment [ab]\/pic\.png — path copied$/); // nothing after (it said "images render in a later phase")
    // Source mode reads the wikilink around the cursor from the text.
    await h.keys("space", "n", "v", "g", "g", "j", "j", "l", "l", "l", "enter");
    expect(h.app.view!.buf.rel).toBe("target.md");
  });
});
