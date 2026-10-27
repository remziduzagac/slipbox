import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

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
  test(":s with line anchors and empty matches: ^ and $ on every line, the cursor's line only", async () => {
    const { v, at, ex } = await source("# a\n# b\nc\n");
    await ex("%s/^/> /");
    expect(v.buf.source).toBe("> # a\n> # b\n> c\n");
    await ex("%s/$/!/");
    expect(v.buf.source).toBe("> # a!\n> # b!\n> c!\n");
    at(1, 0);
    await ex("s/^> #/##/");
    expect(v.buf.source).toBe("> # a!\n## b!\n> c!\n");
  });
  test("replace all keeps to the selection as it shrinks or grows", async () => {
    const { h, v } = await source("cat cat\ncat cat\ncat\n");
    await h.keys("shift+v", "j", "space", "f", "r", ...[..."cat"], "tab", "c", "alt+a");
    expect(v.buf.source).toBe("c c\nc c\ncat\n");
    await h.keys("enter"); // nothing left inside: the cat on line 3 stays
    expect(v.buf.source).toBe("c c\nc c\ncat\n");
  });
  test(":s from a rendered paragraph works on the source lines its row shows, not only its first", async () => {
    const root = makeVault();
    writeFileSync(join(root, "j.md"), "# J\n\nalpha one\nbeta two\n\ngamma beta\n");
    const h = await harness({ root, open: "j.md", width: 100, height: 30 });
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("alpha one beta two"),
    );
    h.app.moveCursor(v, { row, col: 10 });
    await h.keys(":", ..."s/beta/BETA/", "enter");
    expect(v.buf.source).toBe("# J\n\nalpha one\nBETA two\n\ngamma beta\n");
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
  test(":s takes an escaped backslash, \\r as a line break; a* isn't matched twice", async () => {
    const { v, ex } = await src("a, b\naaa\n");
    await ex("s/, /\\r/");
    expect(v.buf.source).toBe("a\nb\naaa\n");
    await ex("%s/a*/-/g");
    expect(v.buf.source.split("\n")[2]).toBe("-");
    await ex("%s/$/\\\\/");
    expect(v.buf.source.split("\n")[0]).toBe("-\\");
  });
});

describe("review cycle 4 (TUI)", () => {
  test(":s with \\r in a CRLF note keeps it CRLF; /gc and /g agree on a*", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "a, b\r\naaa\r\n");
    const h = await harness({ root, open: "s.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", ":", ...[..."s/, /\\r/"].map((c) => (c === " " ? "space" : c)), "enter");
    expect(v.buf.source.replace(/\r\n/g, "")).not.toContain("\n");
    await h.keys("G", ":", ...[..."s/a*/X/gc"], "enter", "y");
    expect(h.app.overlay).toBeNull(); // one match asked about, as /g replaces one
    expect(v.buf.source).toBe("a\r\nb\r\nX\r\n");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test(":s///c: l replaces the match asked about and stops", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "cat cat\ncat\n");
    const h = await harness({ root, open: "s.md" });
    await h.keys(":", ..."%s/cat/X/gc", "enter");
    expect(h.frame()).toContain("replace? y n a q");
    await h.keys("n", "l");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.source).toBe("cat X\ncat\n");
    expect(last(h)).toBe("1 substitution");
  });
});
