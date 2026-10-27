import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

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
  test("a charwise put of lines into a CRLF note keeps it CRLF", async () => {
    const { h, v, at } = await source("ab\r\ncd\r\nxy\r\n");
    at(0, 1);
    await h.keys("v", "j", "y");
    at(2, 0);
    await h.keys("p");
    expect(v.buf.source.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("vim: a line put after the last line of a note without a final line break, one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), "first\nlast");
    const h = await harness({ root, open: "v.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    await h.keys("y", "y", "j", "p");
    expect(v.buf.source).toBe("first\nlast\nfirst");
    expect(h.app.cursorLine(v)).toBe(3);
    await h.keys("u");
    expect(v.buf.source).toBe("first\nlast");
  });
});
