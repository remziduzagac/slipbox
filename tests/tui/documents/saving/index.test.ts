import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("saving keeps the index true (found by the creation scenario)", () => {
  test("a note saved in slipbox is re-indexed: the link added shows in the target's backlinks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    expect(h.app.graph.backlinks("crlf.md").some((b) => b.from === "notes/alpha.md")).toBe(false);
    await h.keys("space", "n", "v", "shift+g", "o");
    for (const c of "[crlf](../crlf.md)") await h.keys(c);
    await h.keys("escape", "ctrl+s");
    expect(h.app.graph.backlinks("crlf.md").some((b) => b.from === "notes/alpha.md")).toBe(true);
    expect(h.app.graph.entry("notes/alpha.md")!.mtimeMs).toBe(statSync(join(root, "notes", "alpha.md")).mtimeMs);
  });
  test("a watcher resync after our own save (a new folder) doesn't take the save for a change on disk", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md", watch: true });
    await h.keys("space", "n", "v", "shift+a", "!", "escape", "ctrl+s");
    await Bun.sleep(300); // the save's own events, seen and passed over
    // A folder made beside it: the watcher resyncs from the index, then hears of the folder and
    // checks the notes around it — the saved one among them.
    await h.app.run("folder.create /notes/fresh");
    await Bun.sleep(600);
    h.frame();
    expect(h.app.messages.some((m) => m.text.includes("changed on disk"))).toBe(false);
  });
  test(":new and :mkdir take a name (free text, nothing to complete)", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.keys(":");
    for (const c of "mkdir box") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect(existsSync(join(root, "box"))).toBe(true);
    await h.keys("escape", ":");
    for (const c of "new box/one") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect(existsSync(join(root, "box", "one.md"))).toBe(true);
  });
});
