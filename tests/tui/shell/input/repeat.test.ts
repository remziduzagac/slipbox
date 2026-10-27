import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, rowStarting } from "../../../tui-harness.ts";

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
  test(". repeats a visual change and a paste", async () => {
    const { h, v, at } = await source("abcdef\nabcdef\nx\ny\n");
    at(0, 0);
    await h.keys("v", "l", "d");
    expect(v.buf.source.split("\n")[0]).toBe("cdef");
    at(1, 0);
    await h.keys(".");
    expect(v.buf.source.split("\n")[1]).toBe("cdef"); // two characters again, not an older change
    at(2, 0);
    await h.keys("shift+a");
    await h.app.input.paste("XY");
    await h.keys("escape", "j", ".");
    expect(v.buf.source.split("\n").slice(2, 4)).toEqual(["xXY", "yXY"]);
  });
  test("`.` after an insert whose completion popup ctrl+e closed never takes a completion", async () => {
    const { h, v } = await source("hello\n");
    await h.keys("o", "[", "a", "]", "(");
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.keys("ctrl+e", "enter", "x", "escape");
    expect(v.buf.source).toBe("hello\n[a](\nx\n");
    await h.keys(".");
    expect(v.buf.source).toBe("hello\n[a](\nx\n[a](\nx\n");
  });
});

describe("review cycle 2 (TUI editing)", () => {
  const src = async (text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width: 100, height: 30, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return { h, v, root, at: (row: number, col: number) => h.app.moveCursor(v, { row, col }) };
  };
  test("a count before . replaces the recorded one: 2dd then 3. deletes three", async () => {
    const { h, v, at } = await src(Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n") + "\n");
    at(0, 0);
    await h.keys("2", "d", "d", "3", ".");
    expect(v.buf.source.split("\n")[0]).toBe("l5");
  });
});

describe("review (tui): vim and editing edges", () => {
  const setup = async (text: string, name = "v.md", files: Record<string, string> = {}) => {
    const root = makeVault();
    writeFileSync(join(root, name), text);
    for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
    const h = await harness({ root, open: name, width: 100, height: 30 });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        if (k.length > 1 && !k.includes("+") && !["escape", "enter", "backspace", "space", "tab"].includes(k)) {
          for (const ch of k) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
        } else await h.keys(k);
      }
    };
    return { h, v, keys, text: () => v.buf.source };
  };
  test(". after d/foo and c/foo repeats that change, not an older one", async () => {
    const d = await setup("Zab foo cd foo ef\n");
    await d.keys("x", "d", "/", "foo", "enter");
    expect(d.text()).toBe("foo cd foo ef\n");
    await d.keys("w", ".");
    expect(d.text()).toBe("foo foo ef\n");
    const c = await setup("a1 foo b2 foo end\n");
    await c.keys("c", "/", "foo", "enter", "X", "escape");
    expect(c.text()).toBe("Xfoo b2 foo end\n");
    expect(c.h.app.vim.lastChange).toEqual(["c", "/", "f", "o", "o", "enter", "shift+x", "escape"]);
    await c.keys("f", "b", ".");
    expect(c.text()).toBe("Xfoo Xfoo end\n");
  });
  test(". repeats the text an accepted link completion put in", async () => {
    const { keys, text, h } = await setup("# T\n", "v.md", { "zqother.md": "# Other\n" });
    await keys("o", "[", "a", "]", "(", "z", "q", "o");
    expect(h.app.completion?.shown[0]?.label).toBe("zqother.md");
    await keys("tab", ")", "escape");
    expect(text()).toBe("# T\n[a](zqother.md)\n");
    await keys(".");
    expect(text()).toBe("# T\n[a](zqother.md)\n[a](zqother.md)\n");
  });
  test(". after a visual change counts characters, not code points: a skin tone, a combining accent", async () => {
    for (const first of ["👍🏽", "é"]) {
      const { keys, text } = await setup(`${first}a bcd\n`);
      await keys("v", "l", "d");
      expect(text()).toBe(" bcd\n");
      await keys(".");
      expect(text()).toBe("cd\n");
    }
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  test(". repeats an edit started from the render (o): the same lines again, in source", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# J\n\nalpha one\n\nbeta two\n");
    const h = await harness({ root, open: "r.md" });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "alpha one"), col: 0 });
    await h.keys("o", "x", "y", "escape");
    expect(v.buf.source).toBe("# J\n\nalpha one\nxy\n\nbeta two\n");
    await h.keys("j", "j", ".");
    expect(v.buf.source).toBe("# J\n\nalpha one\nxy\n\nbeta two\nxy\n");
  });

  test(". repeats a terminal paste in normal mode (a put, like p), not the change before it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "abcdef\n");
    const h = await harness({ root, open: "p.md" });
    await h.keys("space", "n", "v", "x");
    const v = h.app.view!;
    await h.app.input.paste("ZZ");
    expect(v.buf.source).toBe("bZZcdef\n");
    await h.keys(".");
    expect(v.buf.source).toBe("bZZZZcdef\n");
  });
});
