import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  test("the status chip shows the key waiting for its character: f, t, 2f, r, dT — never r for all", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 30 });
    for (const [keys, chip] of [
      [["f"], " f "],
      [["shift+t"], " T "],
    ] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame())).toContain(`NORMAL ${chip}`);
      await h.keys("escape");
    }
    await h.keys("space", "n", "v");
    for (const [keys, chip] of [
      [["r"], " r "],
      [["2", "f"], " 2f "],
      [["d", "shift+t"], " dT "],
    ] as const) {
      await h.keys(...keys);
      expect(statusRow(h.frame())).toContain(`NORMAL ${chip}`);
      await h.keys("escape");
    }
  });
});

describe("review cycle 5 (TUI journeys: the status line when narrow)", () => {
  test("a kept conflict at 40 columns: the marker shrinks, the position and the note's name stay", async () => {
    const root = makeVault();
    mkdirSync(join(root, "deep", "folder"), { recursive: true });
    const file = join(root, "deep", "folder", "logbook.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "deep/folder/logbook.md", width: 40, height: 12 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    writeFileSync(file, "theirs\n");
    const t = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, t, t);
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("k"); // keep mine
    expect(v.buf.conflictKept).toBe(true);
    const status = statusRow(h.frame());
    expect(status).toMatch(/L\d+:\d+/);
    expect(status).toContain("logbook");
    expect(status).toContain("⚠");
  });
});

describe("word count, save all, the change list, moving lines", () => {
  test("words in the status line, the selection's in visual mode; note info; frontmatter not counted", async () => {
    const { countWords } = await import("../../../../src/core/foundation/text/words.ts");
    expect(countWords("# Title\n\n- one two, three's\n| a | b |\n")).toBe(6);
    expect(countWords("---\ntitle: x y\n---\nhello world\n", true)).toBe(2);
    expect(countWords("日本語のノート")).toBe(7);
    expect(countWords("日本語、ノート。")).toBe(6); // punctuation is no word
    const root = makeVault();
    writeFileSync(join(root, "w.md"), "one two three\nfour five\n");
    const h = await harness({ root, open: "w.md", width: 120 });
    expect(statusRow(h.frame())).toContain("5 words");
    await h.keys("space", "n", "v", "v", "e", "e");
    expect(statusRow(h.frame())).toContain("2 words selected");
    await h.keys("escape");
    await h.app.run("note.info");
    expect(h.frame()).toMatch(/words\s+5/);
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("the status line counts the tabs (tab N/M) once there are two", async () => {
    const h = await harness();
    expect(statusRow(h.frame())).not.toMatch(/tab \d+\/\d+/);
    await h.keys("ctrl+t", "c", "ctrl+t", "c");
    expect(statusRow(h.frame())).toContain("tab 3/3");
    await h.keys("ctrl+t", "1");
    expect(statusRow(h.frame())).toContain("tab 1/3");
    await h.keys("ctrl+t", "o");
    expect(statusRow(h.frame())).not.toMatch(/tab \d+\/\d+/);
  });
});
