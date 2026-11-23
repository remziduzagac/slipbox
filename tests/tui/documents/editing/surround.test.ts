import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { offsetOf, placeAt } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

const NOTE = "# Trip\n\nPack the rail pass and (both) vouchers, *gently* please.\n";

describe("surround in the editor (EG-D8)", () => {
  /** `file` opened in SOURCE view (the lens with `lens`), the cursor on the first `at`. */
  const open = async (
    files: Record<string, string>,
    file: string,
    at: string,
    opts: { config?: (c: Config) => void; lens?: boolean } = {},
  ) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({
      root,
      open: file,
      width: 100,
      height: 30,
      config: (c) => {
        c.render.code = false;
        opts.config?.(c);
      },
    });
    if (opts.lens) await h.keys("space", "n", "l");
    else if (!h.app.view!.source) await h.keys("space", "n", "v");
    cursorTo(h, at);
    return h;
  };
  const cursorTo = (h: Harness, needle: string) => {
    const i = h.app.view!.buf.source.indexOf(needle);
    if (i < 0) throw new Error(`${needle} isn't in the text`);
    placeAt(h.app, h.app.view!, i);
  };
  const text = (h: Harness) => h.app.view!.buf.source;
  const said = (h: Harness) => h.app.messages.at(-1)?.text ?? "";
  /** The text from the cursor on. */
  const here = (h: Harness, n = 8) => {
    const at = offsetOf(h.app, h.app.view!);
    return text(h).slice(at, at + n);
  };
  const autoPairs = (c: Config) => {
    c.editor.auto_pairs = true;
  };

  test("y s i w b: the word bold, the cursor on its mark; one undo step; . on the next word", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail");
    await h.keys("y", "s", "i", "w", "b");
    expect(text(h)).toBe(NOTE.replace("rail", "**rail**"));
    expect(here(h, 6)).toBe("**rail");
    await h.keys("u");
    expect(text(h)).toBe(NOTE);
    await h.keys("ctrl+r");
    expect(text(h)).toBe(NOTE.replace("rail", "**rail**"));
    cursorTo(h, "pass");
    await h.keys(".");
    expect(text(h)).toBe(NOTE.replace("rail pass", "**rail** **pass**"));
  });

  test("y s with a motion, a count, a structure's object; y s s the line's text; a closing bracket as its pair", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "Pack");
    await h.keys("y", "s", "2", "w", ")");
    expect(text(h)).toBe(NOTE.replace("Pack the", "(Pack the)"));
    await h.keys("u", "y", "s", "s", "~");
    expect(text(h)).toBe(NOTE.replace(/Pack.*please\./, "~~$&~~"));
    await h.keys("u");
    cursorTo(h, "Trip");
    await h.keys("y", "s", "a", "h", "'");
    expect(text(h)).toBe(`# '${NOTE.slice(2).trimEnd()}'\n`);
  });

  test("y s i w l: a link, typing in its target; the target with it one undo step; . types it again", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail");
    await h.keys("y", "s", "i", "w", "l");
    expect(h.app.view!.insert).toBe(true);
    await h.keys("r", ".", "m", "d", "escape");
    expect(text(h)).toBe(NOTE.replace("rail", "[rail](r.md)"));
    await h.keys("u");
    expect(text(h)).toBe(NOTE);
    cursorTo(h, "pass");
    await h.keys(".");
    expect(text(h)).toBe(NOTE.replace("pass", "[pass](r.md)"));
  });

  test("d s (: the brackets around the cursor out; . again; u back in one step", async () => {
    const h = await open({ "n.md": "f((a), b) and (c)\n" }, "n.md", "a)");
    await h.keys("d", "s", "(");
    expect(text(h)).toBe("f(a, b) and (c)\n");
    expect(here(h, 1)).toBe("a");
    await h.keys(".");
    expect(text(h)).toBe("fa, b and (c)\n");
    await h.keys("u");
    expect(text(h)).toBe("f(a, b) and (c)\n");
    await h.keys("u");
    expect(text(h)).toBe("f((a), b) and (c)\n");
  });

  test("c s * then a backtick: italic to code; c s ( [; . changes the next; d s for each note mark", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "gently");
    await h.keys("c", "s", "*", "`");
    expect(text(h)).toBe(NOTE.replace("*gently*", "`gently`"));
    cursorTo(h, "both");
    await h.keys("c", "s", "(", "[");
    expect(text(h)).toBe(NOTE.replace("*gently*", "`gently`").replace("(both)", "[both]"));
    await h.keys("u", "u");
    expect(text(h)).toBe(NOTE);
    // . changes the next pair of the same mark to the same new one.
    const two = await open({ "t.md": "*one* and *two*\n" }, "t.md", "one");
    await two.keys("c", "s", "*", "b");
    cursorTo(two, "two");
    await two.keys(".");
    expect(text(two)).toBe("**one** and **two**\n");
    const marks = "**b** _i_ `c` ~~s~~ [l](a.md) {r} <a> 'q' \"d\"\n";
    const m = await open({ "m.md": marks }, "m.md", "b");
    for (const [at, mark] of [
      ["b**", "b"],
      ["i_", "*"],
      ["c`", "`"],
      ["s~", "~"],
      ["l]", "l"],
      ["r}", "{"],
      ["a>", ">"],
      ["q'", "'"],
      ['d"', '"'],
    ] as const) {
      cursorTo(m, at);
      await m.keys("d", "s", mark);
    }
    expect(text(m)).toBe("b i c s l r a q d\n");
  });

  test("visual shift+s: the selection wrapped, shown till the mark comes; esc keeps it; V's lines; . the same length", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail");
    await h.keys("v", "e", "shift+s");
    expect(h.app.view!.visual).toBe("char");
    await h.keys("escape");
    expect(h.app.view!.visual).toBe("char");
    await h.keys("shift+s", "b");
    expect(text(h)).toBe(NOTE.replace("rail", "**rail**"));
    expect(h.app.view!.visual).toBeNull();
    cursorTo(h, "pass");
    await h.keys(".");
    expect(text(h)).toBe(NOTE.replace("rail pass", "**rail** **pass**"));
    await h.keys("u", "u", "shift+v", "shift+s", "*");
    expect(text(h)).toBe(NOTE.replace(/Pack.*please\./, "*$&*"));
  });

  test("not a mark, no pair, a note's mark in a code file: said, nothing changed", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail");
    await h.keys("y", "s", "i", "w", "x");
    expect(said(h)).toContain("x isn't a surround mark");
    await h.keys("d", "s", "[");
    expect(said(h)).toBe("no [ ] around the cursor");
    await h.keys("c", "s", "b");
    expect(said(h)).toBe("no bold around the cursor");
    expect(text(h)).toBe(NOTE);
    const ts = await open({ "a.ts": "const s = `hi ${x}`; f(*p);\n" }, "a.ts", "hi");
    await ts.keys("d", "s", "*");
    expect(said(ts)).toContain("is found in Markdown notes");
    await ts.keys("d", "s", "`");
    expect(text(ts)).toBe("const s = hi ${x}; f(*p);\n");
  });

  test("y, d and c still act at once, never waiting for an s; y s and its fellows are keys to rebind", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail");
    await h.keys("d", "w");
    expect(text(h)).toBe(NOTE.replace("rail ", ""));
    expect(h.app.pending).toEqual([]);
    await h.keys("y", "w", "c", "w", "x", "escape");
    expect(text(h)).toBe(NOTE.replace("rail ", "").replace("pass", "x"));
    // `y s` unbound: s after y isn't a motion, so it says so; `g s` bound instead surrounds.
    const r = await open({ "n.md": NOTE }, "n.md", "rail", {
      config: (c) => {
        c.keys.source = { "y s": "", "g s": "edit.surround_add" };
      },
    });
    await r.keys("y", "s");
    expect(said(r)).toBe("y doesn't take s");
    await r.keys("g", "s", "i", "w", "*");
    expect(text(r)).toBe(NOTE.replace("rail", "*rail*"));
  });

  test("in the lens too: y s i w b, d s", async () => {
    const h = await open({ "n.md": NOTE }, "n.md", "rail", { lens: true });
    expect(h.app.view!.live).toBe(true);
    cursorTo(h, "rail");
    await h.keys("y", "s", "i", "w", "b");
    expect(text(h)).toBe(NOTE.replace("rail", "**rail**"));
    await h.keys("d", "s", "b");
    expect(text(h)).toBe(NOTE);
  });

  test("a count before d s or c s goes with it: the keys at rest after, . its keys without the count", async () => {
    const two = "Pack (both) vouchers\nthen [a] and [b]\nlast\n";
    const h = await open({ "n.md": two }, "n.md", "both");
    await h.keys("2", "d", "s", "(");
    expect(text(h)).toBe(two.replace("(both)", "both"));
    expect([h.app.vim.count, h.app.vim.op, h.app.vim.lastChange]).toEqual(["", null, ["d", "s", "("]]);
    await h.keys("j");
    expect(here(h, 4)).toBe("[a] ");
    cursorTo(h, "a]");
    await h.keys("c", "3", "s", "[", "(");
    expect(text(h)).toBe("Pack both vouchers\nthen (a) and [b]\nlast\n");
    expect([h.app.vim.count, h.app.vim.lastChange]).toEqual(["", ["c", "s", "[", "("]]);
    cursorTo(h, "b]");
    await h.keys(".");
    expect(text(h)).toBe("Pack both vouchers\nthen (a) and (b)\nlast\n");
  });

  test("a binding of three keys or more after an operator's key: read to its end; d w still at once", async () => {
    const h = await open({ "n.md": "one two\nthree\n" }, "n.md", "two", {
      config: (c) => {
        c.keys.source = { "d x y": "edit.join", "y x s": "edit.surround_add" };
      },
    });
    await h.keys("d", "x");
    expect(text(h)).toBe("one two\nthree\n");
    await h.keys("y");
    expect(text(h)).toBe("one two three\n");
    cursorTo(h, "two");
    await h.keys("y", "x", "s", "i", "w", "b");
    expect(text(h)).toBe("one **two** three\n");
    cursorTo(h, "one");
    await h.keys("d", "w");
    expect([text(h), h.app.pending]).toEqual(["**two** three\n", []]);
  });

  test("whole lines of a note from their text: a list item's bullet and box, a heading's #s, a quote's > stay out", async () => {
    const note = "# Trip\n\n- milk\n- [ ] eggs\n1. tea\n\n> quoted\n> on\n";
    const h = await open({ "n.md": note }, "n.md", "milk");
    const lines: [string, string][] = [
      ["Trip", "# **Trip**"],
      ["milk", "- **milk**"],
      ["eggs", "- [ ] **eggs**"],
      ["tea", "1. **tea**"],
      ["quoted", "> **quoted**"],
      ["on\n", "> **on**"],
    ];
    for (const [at, want] of lines) {
      cursorTo(h, at);
      await h.keys("y", "s", "s", "b");
      expect(text(h).split("\n")).toContain(want);
      await h.keys("u");
    }
    expect(text(h)).toBe(note);
    cursorTo(h, "milk");
    await h.keys("shift+v", "j", "shift+s", "*");
    expect(text(h)).toBe(note.replace("milk\n- [ ] eggs", "*milk\n- [ ] eggs*"));
    // A code file's lines are its text, whatever they start with.
    const ts = await open({ "a.ts": "  - x;\n" }, "a.ts", "x");
    await ts.keys("y", "s", "s", "(");
    expect(text(ts)).toBe("  (- x;)\n");
  });

  test("visual shift+s refused (only white space, no mark): the selection kept, . what it was", async () => {
    const h = await open({ "n.md": "a   b (c)\n" }, "n.md", "c)");
    await h.keys("d", "s", "(");
    expect(h.app.vim.lastChange).toEqual(["d", "s", "("]);
    cursorTo(h, "  b");
    await h.keys("v", "l", "shift+s", "*");
    expect(said(h)).toBe("nothing to surround: only white space");
    await h.keys("shift+s", "x");
    expect(said(h)).toContain("x isn't a surround mark");
    expect([h.app.view!.visual, !!h.app.view!.sel, h.app.vim.lastChange]).toEqual(["char", true, ["d", "s", "("]]);
    expect(text(h)).toBe("a   b c\n");
  });

  describe("a mark typed over a selection while typing", () => {
    /** Into typing at the start of `word`, and the word selected with shift+right. */
    const select = async (h: Harness, word: string) => {
      if (h.app.view!.insert) await h.keys("escape");
      cursorTo(h, word);
      await h.keys("i");
      for (const _ of word) await h.keys("shift+right");
    };

    test("with auto_pairs on: a quote wraps it, the selection kept inside; * twice makes it bold; one undo", async () => {
      const h = await open({ "n.md": NOTE }, "n.md", "rail", { config: autoPairs });
      await select(h, "rail");
      await h.keys('"');
      expect(text(h)).toBe(NOTE.replace("rail", '"rail"'));
      await h.keys("*", "*");
      expect(text(h)).toBe(NOTE.replace("rail", '"**rail**"'));
      // Still selected: typing replaces the text inside.
      await h.keys("t", "r", "a", "i", "n", "escape");
      expect(text(h)).toBe(NOTE.replace("rail", '"**train**"'));
      await h.keys("u");
      expect(text(h)).toBe(NOTE);
    });

    test("selected backwards: the cursor stays at the start; ~ wraps; ( [ { and a backtick do", async () => {
      const h = await open({ "n.md": NOTE }, "n.md", "rail", { config: autoPairs });
      cursorTo(h, " pass");
      await h.keys("i", "shift+left", "shift+left", "shift+left", "shift+left", "~", "(", "[", "{", "`");
      expect(text(h)).toBe(NOTE.replace("rail", "~([{`rail`}])~"));
      expect(here(h, 4)).toBe("rail");
    });

    test("* and ~ replace it in code, and in a note's fenced block; brackets still wrap there", async () => {
      const ts = await open({ "a.ts": "const total = price;\n" }, "a.ts", "price", { config: autoPairs });
      await select(ts, "price");
      await ts.keys("*");
      expect(text(ts)).toBe("const total = *;\n");
      await select(ts, "total");
      await ts.keys("(");
      expect(text(ts)).toBe("const (total) = *;\n");
      const fenced = "Text\n\n```py\nx = a\n```\n";
      const md = await open({ "f.md": fenced }, "f.md", "a\n", { config: autoPairs });
      await select(md, "a");
      await md.keys("*");
      expect(text(md)).toBe(fenced.replace("x = a", "x = *"));
    });

    test("with auto_pairs off, as it was: what's typed replaces the selection", async () => {
      const h = await open({ "n.md": NOTE }, "n.md", "rail");
      await select(h, "rail");
      await h.keys("(", "escape");
      expect(text(h)).toBe(NOTE.replace("rail", "("));
      await select(h, "pass");
      await h.keys("*", "escape");
      expect(text(h)).toBe(NOTE.replace("rail", "(").replace("pass", "*"));
    });
  });
});
