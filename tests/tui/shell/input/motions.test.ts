import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, rowText } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  const source = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    const file = join(root, "r.md");
    writeFileSync(file, text);
    const h = await harness({ root, open: "r.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const at = (row: number, col: number) => h.app.moveCursor(v, { row, col });
    const ex = (cmd: string) => h.keys(":", ...[...cmd].map((ch) => (ch === " " ? "space" : ch)), "enter");
    return { h, v, at, ex, file, root };
  };
  test("5G and 5gg land on the line's first non-blank, as G and gg do; past the end, the last line's", async () => {
    const { h, v } = await source("aa\n    bb\ncc\n");
    for (const keys of [
      ["2", "shift+g"],
      ["2", "g", "g"],
    ]) {
      await h.keys("g", "g", ...keys);
      expect(v.cur).toEqual({ row: 1, col: 4 });
    }
    await h.keys("9", "shift+g");
    expect(v.cur).toEqual({ row: 2, col: 0 });
  });
});

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test("counts move by that many (5j, 3w); insert's tab, shift+tab, up and down", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "a b c d e\n1\n2\n3\n4\n5\n6\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "3", "w");
    expect(v.cur.col).toBe(6);
    await h.keys("5", "j");
    expect(rowText(h)).toBe("5");
    await h.keys("i", "tab");
    expect(v.buf.source.split("\n")[5]).toBe("  5");
    await h.keys("shift+tab", "up", "x", "down", "down", "y", "escape");
    expect(v.buf.source).toBe("a b c d e\n1\n2\n3\nx4\n5\n6y\n"); // down keeps the goal column
  });
});

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  const long = () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n") + "\n");
    return root;
  };
  test("H M L: the screen's top, middle and bottom rows; zz zt zb scroll the cursor's line there", async () => {
    const h = await harness({ root: long(), open: "long.md", height: 30 });
    const v = h.app.view!;
    await h.keys("ctrl+d", "ctrl+d", "ctrl+d"); // far enough down for zb to have room above
    const rows = h.app.lens.screenRows(v, h.app.currentLayout(v));
    await h.keys("shift+h");
    expect(v.cur.row).toBeGreaterThanOrEqual(rows[0]!);
    expect(v.cur.row).toBeLessThan(rows[0]! + 5); // scrolloff rows in
    await h.keys("shift+l");
    expect(v.cur.row).toBeLessThanOrEqual(rows.at(-1)!);
    expect(v.cur.row).toBeGreaterThan(rows.at(-1)! - 5);
    await h.keys("shift+m");
    expect(Math.abs(v.cur.row - rows[Math.floor((rows.length - 1) / 2)]!)).toBeLessThanOrEqual(1);
    const row = v.cur.row;
    // zt and zb keep the scrolloff rows (3) to the edge, so H and L stay on the cursor's row.
    const at = () => h.app.lens.screenRows(v, h.app.currentLayout(v)).indexOf(row);
    await h.keys("z", "t");
    expect(at()).toBe(3);
    await h.keys("shift+h");
    expect(v.cur.row).toBe(row);
    await h.keys("z", "b");
    expect(at()).toBe(h.app.lens.screenRows(v, h.app.currentLayout(v)).length - 1 - 3);
    await h.keys("shift+l");
    expect(v.cur.row).toBe(row);
    await h.keys("z", "z");
    const shown = h.app.lens.screenRows(v, h.app.currentLayout(v));
    expect(Math.abs(shown.indexOf(row) - Math.floor((shown.length - 1) / 2))).toBeLessThanOrEqual(1);
  });
});
