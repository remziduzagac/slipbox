import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test(":e! reverts, :w! writes over a change on disk, :noh clears the highlights", async () => {
    const root = makeVault();
    const file = join(root, "e.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "e.md" });
    const v = h.app.view!;
    const ex = (s: string) => h.keys(":", ...[...s].map((c) => (c === " " ? "space" : c === "!" ? "!" : c)), "enter");
    await h.keys("space", "n", "v", "shift+a", "X", "escape");
    await ex("e!");
    expect(v.buf.source).toBe("one\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("shift+a", "Y", "escape");
    writeFileSync(file, "theirs\n");
    const t = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, t, t);
    await ex("w!");
    expect(readFileSync(file, "utf8")).toBe("oneY\n");
    await h.keys("/", "o", "n", "e", "enter");
    expect(v.find?.matches.length).toBeGreaterThan(0);
    await ex("noh");
    expect(v.find?.matches.length ?? 0).toBe(0);
  });
});
