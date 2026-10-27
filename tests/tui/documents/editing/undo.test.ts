import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI editing)", () => {
  const src = async (text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width: 100, height: 30, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return { h, v, root, at: (row: number, col: number) => h.app.moveCursor(v, { row, col }) };
  };
  test("a reload during typing keeps the rest of the session one undo step", async () => {
    const { h, v, root } = await src("start\n");
    await h.keys("shift+a"); // typing, nothing typed yet: the note is still clean
    writeFileSync(join(root, "e.md"), "agent\n");
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(join(root, "e.md"), future, future);
    h.app.watch.reloadBuffer(v.buf);
    expect(v.buf.source).toBe("agent\n");
    await h.keys("x", "y", "z", "escape");
    expect(v.buf.source).toContain("xyz");
    await h.keys("u");
    expect(v.buf.source).toBe("agent\n"); // one u: the whole session, not just the z
  });
});

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  const long = () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n") + "\n");
    return root;
  };
  test("go to line: ctrl+g asks, :42 goes; ctrl+z undoes, ctrl+y redoes; space n v toggles source", async () => {
    const h = await harness({ root: long(), open: "long.md" });
    const v = h.app.view!;
    const line = () => h.app.currentLayout(v).lines[v.cur.row]!.src;
    await h.keys("ctrl+g", "2", "1", "enter");
    expect(line()).toBe(21);
    await h.keys(":", "4", "1", "enter");
    expect(line()).toBe(41);
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true);
    await h.keys("A", "!", "escape", "ctrl+z");
    expect(v.buf.source).not.toContain("!");
    await h.keys("ctrl+y");
    expect(v.buf.source).toContain("Line 21.!");
    await h.keys("space", "n", "v");
    expect(v.source).toBe(false);
  });
});
