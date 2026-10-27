import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("big notes (15.1)", () => {
  test("a big note parses on other threads: its first frame says so, a key waits for it, a click is dropped; its place kept", async () => {
    const root = makeVault();
    // 16,000 lines, 700 KB: a heading every 80 lines.
    const text = Array.from({ length: 8000 }, (_, i) =>
      i % 40 === 0
        ? `## Part ${i}\n`
        : `Line ${i} of the big note, with [[alpha]] and enough words to fill a row or so of it.\n`,
    ).join("\n");
    writeFileSync(join(root, "big.md"), text);
    const h = await harness({ root, open: null });
    h.app.open("big.md", { heading: null, headingIndex: 0, offset: 0, line: 6001 });
    expect(h.frame()).toContain("reading big.md — 16,000 lines…");
    const buf = h.app.view!.buf;
    expect(buf.parsing).not.toBeNull();
    // Nothing parses it here meanwhile: the footnotes view waits; a click on the placeholder is dropped.
    expect(h.app.footnotes.list()).toEqual([]);
    expect((buf as unknown as { parsedVersion: number }).parsedVersion).not.toBe(buf.version);
    const y = h
      .frame()
      .split("\n")
      .findIndex((r) => r.includes("reading big.md"));
    h.app.mouse.handle({ type: "down", x: 40, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: 40, y, button: 0 });
    // A key waits for the parse, then acts on the note, where it was opened.
    const pressed = h.keys("j");
    expect(buf.parsing).not.toBeNull();
    const f = await pressed;
    expect(buf.parsing).toBeNull();
    expect(f).toContain("Part 3000");
    expect(f).not.toContain("reading big.md");
    const v = h.app.view!;
    // Where it was opened: line 6001 in view (a few rows above it kept, as scrolloff says).
    expect(h.app.currentLayout(v).lines[v.top]!.src).toBeGreaterThan(5990);
    expect(h.app.currentLayout(v).lines[v.top]!.src).toBeLessThanOrEqual(6001);
    // The key moved the cursor from there: one row down from line 6001's.
    expect(v.cur.row).toBe(h.app.currentLayout(v).lines.findIndex((l) => l.src === 6001) + 1);
    // An edit's parse is small: done here, at once — no placeholder.
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await h.keys("space", "n", "v");
    expect(buf.parsing).toBeNull();
    expect(h.frame()).not.toContain("reading big.md");
  });
});
