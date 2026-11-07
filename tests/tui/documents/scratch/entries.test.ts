import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lineOf, offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { pageBg, roleStyle } from "../../../../src/tui/shell/screen/style.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";
import { untimed, WHEN } from "../../../support/scratch-entries.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** A scratch written as given, then opened floating, its cursor on the row whose line is `src`. */
async function scratchWith(h: Harness, text: string, src = 1): Promise<void> {
  const path = h.app.scratch.location().path;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  await h.keys("space", "s", "s");
  const v = h.app.view!;
  h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === src), col: 0 });
}

const ENTRIES =
  "**At:** `notes/alpha.md:9`\\\n**Note:** one\n\n---\n\n**At:** `notes/alpha.md:13`\\\n**Note:** two\n\n---\n\nthree\n";

describe("the scratch's entries (D268)", () => {
  test("a selection in the rendered note goes in as written, not as drawn; when it was added first", async () => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), "Intro.\n\n- one\n- two\n");
    const h = await harness({ root, open: "l.md" });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 3), col: 0 });
    await h.keys("shift+v", "j", "space", "s", "a");
    const text = readFileSync(h.app.scratch.location().path, "utf8");
    expect(text.search(WHEN)).toBe(0);
    expect(untimed(text)).toBe("**At:** `l.md:3-4`\n\n```\n- one\n- two\n```\n\n**Note:** \n");
  });

  test("a code file's lines in its language", async () => {
    const root = makeVault();
    writeFileSync(join(root, "x.py"), "def f():\n    return 1\n");
    const h = await harness({ root, open: "x.py" });
    await h.keys("shift+v", "j", "space", "s", "a");
    expect(untimed(readFileSync(h.app.scratch.location().path, "utf8"))).toContain("```python\ndef f():");
  });

  test("a line's capture: when, where and the note on consecutive lines", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "s", "a", "o", "k", "escape", "q");
    const text = readFileSync(h.app.scratch.location().path, "utf8");
    expect(text.search(WHEN)).toBe(0);
    expect(untimed(text)).toBe("**At:** `notes/alpha.md:1`\\\n**Note:** ok\n");
  });

  test("esc never closes the floating scratch: q does", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, height: 40 });
    await h.keys("space", "s", "s", "escape", "escape", "escape");
    expect(h.app.floating?.kind).toBe("scratch");
    expect(h.frame()).toContain("─ q closes, saved ");
    await h.keys("q");
    expect(h.app.floating).toBeNull();
  });

  test("space s e copies the entry under the cursor; space s x deletes it with its rule, u brings it back", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, height: 40 });
    const path = h.app.scratch.location().path;
    await scratchWith(h, ENTRIES, 6);
    await h.keys("space", "s", "e");
    expect(h.copied.at(-1)).toBe("**At:** `notes/alpha.md:13`\\\n**Note:** two\n");
    await h.keys("space", "s", "x");
    expect(readFileSync(path, "utf8")).toBe("**At:** `notes/alpha.md:9`\\\n**Note:** one\n\n---\n\nthree\n");
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe(ENTRIES);
    // The first: it and the rule after it.
    h.app.moveCursor(h.app.view!, { row: 0, col: 0 });
    await h.keys("space", "s", "x");
    expect(readFileSync(path, "utf8")).toBe("**At:** `notes/alpha.md:13`\\\n**Note:** two\n\n---\n\nthree\n");
    // Not in the scratch: said, nothing done.
    await h.keys("q", "space", "s", "e");
    expect(h.app.messages.at(-1)!.text).toContain("in the scratch");
  });

  test("an entry's At: is a link: followed, its file at its line", async () => {
    const h = await harness({ open: "index.md", width: 120, height: 40 });
    await scratchWith(h, ENTRIES, 1);
    const link = h.app.currentLayout(h.app.view!).links.find((l) => l.kind === "ref");
    expect(link?.target).toBe("notes/alpha.md:9");
    await h.keys("enter");
    const v = h.app.view!;
    expect([h.app.floating, v.buf.key, lineOf(v, offsetOf(h.app, v))]).toEqual([null, "notes/alpha.md", 9]);
  });

  test("a place whose lines moved: a warning on its At:, followed to them, space c a points it there", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), "- new first\n- one\n- two\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 40 });
    await scratchWith(h, "**At:** `m.md:1-2`\n\n```\n- one\n- two\n```\n\n**Note:** n\n", 1);
    const problems = h.app.problems.ofView(h.app.view!);
    expect(problems.map((p) => [p.start.line, p.code, p.message])).toEqual([
      [1, "place-moved", "lines 1–2 moved: now lines 2–3"],
    ]);
    await h.keys("space", "c", "a");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("enter");
    expect(h.app.view!.buf.source).toStartWith("**At:** `m.md:2-3`\n");
    expect(h.app.problems.ofView(h.app.view!)).toEqual([]);
    // Moved again, unpointed: following it lands where they are.
    writeFileSync(h.app.scratch.location().path, "**At:** `m.md:1-2`\n\n```\n- one\n- two\n```\n");
    h.app.view!.buf.load();
    h.app.problems.ofView(h.app.view!);
    await h.keys("g", "g", "enter");
    const v = h.app.view!;
    expect([v.buf.key, lineOf(v, offsetOf(h.app, v))]).toEqual(["m.md", 2]);
  });

  test("a code block shows in the floating scratch: inside its frame the page's background, the block's own darker", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, height: 40 });
    await scratchWith(h, "**At:** `notes/alpha.md:9`\n\n```\ncode here\n```\n\n**Note:** n\n");
    const c = h.canvas();
    const box = h.app.geometry!.floating!;
    const page = pageBg(h.app.theme);
    const block = roleStyle(h.app.theme, "code_block", null).bg;
    expect(block).not.toBe(page);
    // A blank cell inside the frame, near its bottom, past the line numbers; a cell of the code's row past its text.
    expect(c.styles[box.y + box.h - 4]![box.x + Math.floor(box.w / 2)]!.bg).toBe(page);
    const y = c.rows.findIndex((r) => r.join("").includes("code here"));
    expect(c.styles[y]![c.line(y).indexOf("code here") + 12]!.bg).toBe(block);
  });
});
