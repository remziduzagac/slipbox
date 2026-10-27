import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, rowText, type Harness } from "../../../tui-harness.ts";

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
  test("cw on a word's last letter, or a one-letter word, changes only that", async () => {
    const { h, v, at } = await source("a b\nab cd\n");
    at(0, 0);
    await h.keys("c", "w", "X", "escape");
    expect(v.buf.source.split("\n")[0]).toBe("X b");
    at(1, 1);
    await h.keys("c", "w", "Y", "escape");
    expect(v.buf.source.split("\n")[1]).toBe("aY cd");
  });
  test("a count between the operator and the text object: d2i( and d2aw", async () => {
    const { h, v, at } = await source("x (a (b) c) y\none two three four\n");
    at(0, 6); // on b
    await h.keys("d", "2", "i", "(");
    expect(v.buf.source.split("\n")[0]).toBe("x () y");
    at(1, 0);
    await h.keys("d", "2", "a", "w");
    expect(v.buf.source.split("\n")[1]).toBe("three four");
  });
  test("a counted r counts characters, not code points: an emoji with a modifier is one", async () => {
    const { h, v } = await source("a👍🏽\n");
    await h.keys("0", "l", "2", "r", "x");
    expect(v.buf.source).toBe("a👍🏽\n"); // not enough characters, as in vim
    await h.keys("0", "l", "r", "x");
    expect(v.buf.source).toBe("ax\n");
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
  test("d2ap deletes two paragraphs", async () => {
    const { h, v, at } = await src("one\n\ntwo\n\nthree\n");
    at(0, 0);
    await h.keys("d", "2", "a", "p");
    expect(v.buf.source).toBe("three\n");
  });
});

describe("review cycle 3 (TUI)", () => {
  const src = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return {
      h,
      v,
      root,
      at: (row: number, col: number) => h.app.moveCursor(v, { row, col }),
      ex: (cmd: string) => h.keys(":", ...[...cmd].map((c) => (c === " " ? "space" : c)), "enter"),
    };
  };
  test("operators at the edges: c2w from a word's end, dw on the last word, d3w across lines, x on an empty line", async () => {
    const a = await src("a quick fox\n");
    a.at(0, 0);
    await a.h.keys("c", "2", "w", "X", "escape");
    expect(a.v.buf.source).toBe("X fox\n");
    const b = await src("foo bar\n");
    b.at(0, 4);
    await b.h.keys("d", "w");
    expect(b.v.buf.source).toBe("foo \n");
    const c = await src("a b\nc d\n");
    c.at(0, 0);
    await c.h.keys("d", "3", "w");
    expect(c.v.buf.source).toBe("d\n");
    const d = await src("one\n\ntwo\n");
    d.at(0, 0);
    await d.h.keys("y", "y", "j", "x", "p");
    expect(d.v.buf.source).toBe("one\n\none\ntwo\n"); // x did nothing; the register still had the line
  });
  test("counts: 3gg and 5G go to that line; d} takes a last paragraph whole; J into an empty line", async () => {
    const { h, at } = await src("l1\nl2\nl3\nl4\nl5\nl6\n");
    at(0, 0);
    await h.keys("5", "G");
    expect(rowText(h).trim().endsWith("l5")).toBe(true);
    await h.keys("3", "g", "g");
    expect(rowText(h).trim().endsWith("l3")).toBe(true);
    const p = await src("last para\nline two\n");
    p.at(0, 0);
    await p.h.keys("d", "}");
    expect(p.v.buf.source.trim()).toBe("");
    const j = await src("\nfoo\n");
    j.at(0, 0);
    await j.h.keys("J");
    expect(j.v.buf.source).toBe("foo\n");
  });
});

describe("review cycle 5 (vim edges)", () => {
  test(":2,3s says which ranges :s takes; ctrl+u stops at the insert's start; the lens's G is the last line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "a\nb\nc\n");
    const h = await harness({ root, open: "r.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", ":", ..."2,3s/b/X/", "enter");
    expect(v.buf.source).toBe("a\nb\nc\n");
    expect(h.app.messages.some((m) => m.text.includes("'<,'>"))).toBe(true);
    await h.keys("shift+a", "Y", "Z", "ctrl+u", "escape");
    expect(v.buf.source).toBe("a\nb\nc\n");
    writeFileSync(join(root, "l.md"), "# T\n\n- a\n- b\n\nx\nlast\n");
    const l = await harness({ root, open: "l.md" });
    await l.keys("space", "n", "l", "shift+g", "d", "d");
    expect(l.app.view!.buf.source).toBe("# T\n\n- a\n- b\n\nx\n");
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
  test("cgn after * keeps to whole words, as n does", async () => {
    const { keys, text } = await setup("cat x\ncategory\ncat\n");
    await keys("*", "g", "g", "$", "c", "g", "n", "dog", "escape");
    expect(text()).toBe("cat x\ncategory\ndog\n");
  });
  test("~ over a letter whose other case is longer (ß, İ) toggles the rest and keeps it", async () => {
    const a = await setup("aßb\n");
    await a.keys("3", "~");
    expect(a.text()).toBe("AßB\n");
    const b = await setup("İstanbul\n");
    await b.keys("8", "~");
    expect(b.text()).toBe("İSTANBUL\n");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test('vim: an operator with ; before any f or t says so; di" and di( with nothing to take leave the line alone', async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), 'no quotes "here\ncall(a, b\n');
    const h = await harness({ root, open: "v.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const before = v.buf.source;
    await h.keys("d", ";");
    expect(last(h)).toBe("no f or t to repeat yet");
    expect(v.buf.source).toBe(before);
    await h.keys("d", "i", "shift+'"); // a lone quote: no pair
    expect(v.buf.source).toBe(before);
    await h.keys("j", "$", "d", "i", "shift+9"); // an open bracket never closed
    expect(v.buf.source).toBe(before);
    expect(v.buf.dirty).toBe(false);
  });
});
