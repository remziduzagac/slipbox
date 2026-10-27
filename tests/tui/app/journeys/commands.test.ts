import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test("the replace row steps between matches (ctrl+n, ctrl+p); :glyphs; the scratch asks before it clears; reindex", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "aa\nb\naa\nb\naa\n");
    const h = await harness({ root, open: "r.md" });
    await h.keys("ctrl+h", "a", "a", "tab");
    const o = h.app.overlay as { replace?: { current: number; total: number } };
    expect(o.replace?.total).toBe(3);
    const first = o.replace!.current;
    await h.keys("ctrl+n");
    expect(o.replace!.current).toBe((first + 1) % 3);
    await h.keys("ctrl+p");
    expect(o.replace!.current).toBe(first);
    await h.keys("escape", "escape");
    await h.keys(":", ..."glyphs", "space", ..."ascii", "enter");
    expect(h.app.glyphs.mode).toBe("ascii");
    const scratch = h.app.scratch.location().path;
    mkdirSync(dirname(scratch), { recursive: true });
    writeFileSync(scratch, "keep me\n");
    await h.app.run("scratch.clear");
    await h.keys("n");
    expect(readFileSync(scratch, "utf8")).toBe("keep me\n");
    expect(h.app.overlay).toBeNull();
    await h.app.run("scratch.clear");
    await h.keys("enter"); // not an answer: the question stays
    expect(h.app.overlay?.kind).toBe("prompt");
    expect(readFileSync(scratch, "utf8")).toBe("keep me\n");
    await h.keys("escape");
    await h.app.run("scratch.clear");
    await h.keys("y");
    expect(existsSync(scratch) ? readFileSync(scratch, "utf8") : "").toBe("");
    writeFileSync(join(root, "late.md"), "# Late\n");
    await h.keys("space", "v", "r");
    expect(h.app.graph.notes.has("late.md")).toBe(true);
  });
});
