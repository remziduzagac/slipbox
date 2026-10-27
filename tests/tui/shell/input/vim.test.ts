import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("vim-shaped normal mode in source (step 3c)", () => {
  const setup = async (text: string) => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), text);
    const h = await harness({ root, open: "v.md", width: 100, height: 30 });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        if (k.length > 1 && !k.includes("+") && !["escape", "enter", "backspace", "space"].includes(k)) {
          for (const ch of k) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
        } else await h.keys(k);
      }
    };
    const at = (row: number, col: number) => h.app.moveCursor(v, { row, col });
    return { h, v, keys, at, text: () => v.buf.source };
  };
  test("d with motions, doubled, counts; u undoes each", async () => {
    const { keys, at, text } = await setup("one two three four\nline two\nline three\n");
    at(0, 0);
    await keys("dw");
    expect(text()).toBe("two three four\nline two\nline three\n");
    await keys("d2w");
    expect(text()).toBe("four\nline two\nline three\n");
    await keys("d$");
    expect(text()).toBe("\nline two\nline three\n");
    await keys("u", "u", "u");
    expect(text()).toBe("one two three four\nline two\nline three\n");
    await keys("dd");
    expect(text()).toBe("line two\nline three\n");
    await keys("u", "2dd");
    expect(text()).toBe("line three\n");
    await keys("u", "dj");
    expect(text()).toBe("line three\n");
    await keys("u", "j", "dG");
    expect(text()).toBe("one two three four\n");
  });
  test('text objects: ciw, di", da(, dap; c types in place, one undo step with its typing', async () => {
    const { keys, at, text } = await setup('say "hello there" (a (b) c) now\n\npara one\npara two\n\nend\n');
    at(0, 7); // inside "hello"
    await keys("ciw", "HI", "escape");
    expect(text().split("\n")[0]).toBe('say "HI there" (a (b) c) now');
    await keys("u");
    expect(text().split("\n")[0]).toBe('say "hello there" (a (b) c) now');
    await keys('di"');
    expect(text().split("\n")[0]).toBe('say "" (a (b) c) now');
    await keys("u");
    at(0, 22); // on the b: the inner parentheses
    await keys("da(");
    expect(text().split("\n")[0]).toBe('say "hello there" (a  c) now');
    at(0, 19); // on the a: the outer ones
    await keys("da(");
    expect(text().split("\n")[0]).toBe('say "hello there"  now');
    at(2, 0);
    await keys("dap");
    expect(text()).toBe('say "hello there"  now\n\nend\n');
  });
  test("yank and put: yy p puts a line under; yw P puts before; x and p swap characters", async () => {
    const { keys, at, text } = await setup("alpha beta\ngamma\n");
    at(0, 0);
    await keys("yy", "j", "p");
    expect(text()).toBe("alpha beta\ngamma\nalpha beta\n");
    at(1, 0);
    await keys("yw", "P");
    expect(text()).toBe("alpha beta\ngammagamma\nalpha beta\n");
    at(0, 0);
    await keys("x", "p");
    expect(text().split("\n")[0]).toBe("lapha beta");
  });
  test("find's toggles: plain text by default, alt+r regex, alt+w whole words; clickable, shown", async () => {
    const root = makeVault();
    writeFileSync(join(root, "f.md"), "a.b axb a.b foo_a.b\n");
    const h = await harness({ root, open: "f.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("/", "a", ".", "b");
    expect(v.find!.matches.length).toBe(3); // a literal dot: not axb
    await h.keys("alt+r");
    expect(v.findOpts!.regex).toBe(true);
    for (let i = 0; i < 100 && v.find?.pending; i++) await Bun.sleep(10);
    expect(v.find!.matches.length).toBe(4); // the dot is any character now
    await h.keys("alt+w");
    for (let i = 0; i < 100 && v.find?.pending; i++) await Bun.sleep(10);
    expect(v.find!.matches.length).toBe(3); // not inside foo_a.b
    h.frame();
    const hot = (id: string) => h.app.geometry!.hot.find((r) => r.id === id)!;
    const regexBtn = hot("findopt:regex:0");
    expect(h.canvas().styles[regexBtn.y]![regexBtn.x + 1]!.fg).toBe(h.app.theme.roles.topbar_button_on.fg!);
    h.app.mouse.handle({ type: "down", x: regexBtn.x + 1, y: regexBtn.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: regexBtn.x + 1, y: regexBtn.y, button: 0 });
    expect(v.findOpts!.regex).toBe(false);
    expect(v.find!.matches.length).toBe(2); // plain, whole words: the two standalone a.b
    await h.keys("enter");
    // A broken regex says so, in the row.
    await h.keys("/", "alt+r", "(");
    expect(h.frame()).toContain("not a regex");
    await h.keys("escape");
  });
  test("replace: space f r, tab into the replace row; enter one, alt+a all as one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "r.md"), "# R\n\ncat dog cat\n\n**cat** here\n");
    const h = await harness({ root, open: "r.md", width: 100, height: 30 });
    const v = h.app.view!;
    const type = (t: string) => h.keys(...[...t]);
    await h.keys("space", "f", "r");
    const o = h.app.overlay as { replace?: { focus: boolean; total: number } };
    expect(o.replace!.focus).toBe(false); // nothing to find yet: the find field first
    expect(v.source).toBe(true); // replacing works on the markdown
    await type("cat");
    await h.keys("tab");
    await type("cow");
    expect(o.replace!.total).toBe(3);
    const frame = h.frame();
    expect(frame).toContain("⇄ cow");
    expect(frame).toContain("1/3");
    await h.keys("enter");
    expect(v.buf.source).toBe("# R\n\ncow dog cat\n\n**cat** here\n");
    expect(o.replace!.total).toBe(2);
    await h.keys("alt+a");
    expect(v.buf.source).toBe("# R\n\ncow dog cow\n\n**cow** here\n");
    expect(h.frame()).toContain("replaced 2 matches"); // a floating message; the rows still open
    await h.keys("escape"); // closes the rows, keeps the edits and the search
    expect(h.app.overlay).toBeNull();
    expect(v.find?.query).toBe("cat");
    await h.keys("escape", "u");
    expect(v.buf.source).toBe("# R\n\ncow dog cat\n\n**cat** here\n"); // all of them in one step
    // ctrl+h opens the same rows; the buttons do what the keys do; regex replacements take groups.
    await h.keys("ctrl+h");
    await h.keys("alt+r");
    await type("(c)at");
    await h.keys("ctrl+h");
    await type("$1ub");
    h.frame();
    const all = h.app.geometry!.hot.find((r) => r.id === "findrep:all:0")!;
    h.app.mouse.handle({ type: "down", x: all.x + 1, y: all.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: all.x + 1, y: all.y, button: 0 });
    for (let i = 0; i < 100 && !v.buf.source.includes("cub"); i++) await Bun.sleep(10);
    expect(v.buf.source).toBe("# R\n\ncow dog cub\n\n**cub** here\n");
    await h.keys("escape");
  });
  test(":s, :%s and :'<,'>s from the command line; g, and c asking y n a q; one undo step each", async () => {
    const root = makeVault();
    const note = "one cat cat\n\ntwo cat\n\nthree cat cat\n";
    writeFileSync(join(root, "s.md"), note);
    const h = await harness({ root, open: "s.md", width: 100, height: 30 });
    const v = h.app.view!;
    const ex = (cmd: string) => h.keys(":", ...[...cmd], "enter");
    await ex("s/cat/dog/"); // the cursor's line, its first match
    expect(v.buf.source).toBe("one dog cat\n\ntwo cat\n\nthree cat cat\n");
    expect(v.source).toBe(true); // on the markdown
    await h.keys("u");
    await ex("%s/(c)at/\\1ow/"); // the first on each line; \1 a group
    expect(v.buf.source).toBe("one cow cat\n\ntwo cow\n\nthree cow cat\n");
    expect(h.frame()).toContain("3 substitutions on 3 lines");
    await h.keys("u");
    expect(v.buf.source).toBe(note);
    await ex("%s/CAT/x/gi");
    expect(v.buf.source).toBe("one x x\n\ntwo x\n\nthree x x\n");
    await h.keys("u");
    // c: the find and replace rows ask at each match.
    await ex("%s/cat/X/gc");
    expect(h.frame()).toContain("replace? y n a q");
    await h.keys("y", "n", "y");
    expect(v.buf.source).toBe("one X cat\n\ntwo X\n\nthree cat cat\n");
    await h.keys("a");
    expect(h.app.overlay).toBeNull();
    expect(v.buf.source).toBe("one X cat\n\ntwo X\n\nthree X X\n");
    await h.keys("u");
    expect(v.buf.source).toBe(note); // the whole confirm, one step
    await ex("%s/cat/X/c");
    await h.keys("y", "q");
    expect(v.buf.source).toBe("one X cat\n\ntwo cat\n\nthree cat cat\n");
    await h.keys("u");
    // '<,'>: typed for you when : is pressed on a selection; only those lines.
    h.app.moveCursor(v, { row: rowStarting(h, "two"), col: 0 });
    await h.keys("shift+v", "j", "j", ":");
    expect(h.app.overlay?.kind === "list" && h.app.overlay.input).toBe("'<,'>");
    await h.keys(...[..."s/cat/Z/g"], "enter");
    expect(v.buf.source).toBe("one cat cat\n\ntwo Z\n\nthree Z Z\n");
    await ex("s/nothing/x/");
    expect(h.frame()).toContain("not found: nothing");
  });
  test("cgn changes the search's next match, and . the one after; dgn deletes one", async () => {
    const root = makeVault();
    writeFileSync(join(root, "g.md"), "foo bar foo baz foo end foo\n");
    const h = await harness({ root, open: "g.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "/", "f", "o", "o", "enter");
    await h.keys("c", "g", "n", "shift+x", "escape");
    expect(v.buf.source).toBe("X bar foo baz foo end foo\n");
    await h.keys(".");
    expect(v.buf.source).toBe("X bar X baz foo end foo\n");
    await h.keys("d", "g", "n");
    expect(v.buf.source).toBe("X bar X baz  end foo\n");
    await h.keys("u", "u", "u", "/", "z", "z", "z", "enter", "c", "g", "n");
    expect(h.frame()).toContain("not found: zzz");
  });
  test("keys are handled in order, one at a time: a fast j then . doesn't interleave", async () => {
    const root = makeVault();
    writeFileSync(join(root, "v.md"), "# Vim\n\nthe quick brown fox\njumps over the lazy dog\n");
    const h = await harness({ root, open: "v.md", width: 100, height: 30 });
    await h.keys("space", "n", "v", "j", "j", "w", "2", "d", "w");
    // Both at once, not awaiting the first: as a terminal delivers "j." typed fast.
    await Promise.all([h.app.input.handleKey("j"), h.app.input.handleKey(".")]);
    expect(h.app.view!.buf.source).toBe("# Vim\n\nthe fox\njumpthe lazy dog\n");
  });
  test("f F t T and ; , — as motions, with counts, and after an operator", async () => {
    const { keys, at, text, v, h } = await setup("call(a, b, c) done\n");
    at(0, 0);
    await keys("f", "(");
    expect(v.cur.col).toBe(4);
    await keys("2", "f", ",");
    expect(v.cur.col).toBe(9); // the second comma
    await keys(",");
    expect(v.cur.col).toBe(6); // back to the first
    await keys("t", ")");
    expect(v.cur.col).toBe(11);
    await keys(";"); // t again moves on past the one right next to it: nothing more, stays
    expect(v.cur.col).toBe(11);
    await keys("shift+f", "a");
    expect(v.cur.col).toBe(5);
    at(0, 5);
    await keys("d", "t", ")");
    expect(text()).toBe("call() done\n");
    await keys("u");
    at(0, 0);
    await keys("c", "f", "(", "fn(", "escape");
    expect(text()).toBe("fn(a, b, c) done\n");
    // In the render too.
    await keys("space", "n", "v", "0", "f", "d");
    expect(h.app.view!.source).toBe(false);
    expect(
      h.app
        .currentLayout(v)
        .lines[h.app.view!.cur.row]!.spans.map((x) => x.text)
        .join("")[h.app.view!.cur.col],
    ).toBe("d");
  });
  test("an operator with a search: d/foo covers up to the match; dn to the next", async () => {
    const { keys, at, text } = await setup("keep this part and stop here, then more stop\n");
    at(0, 5);
    await keys("d", "/", "stop", "enter");
    expect(text()).toBe("keep stop here, then more stop\n");
    at(0, 0);
    await keys("d", "n"); // to the next match after the cursor: the first stop
    expect(text()).toBe("stop here, then more stop\n");
  });
  test(". repeats a change that typed: cw, i and o with their text", async () => {
    const { keys, at, text } = await setup("one two three\n");
    at(0, 0);
    await keys("c", "w", "1", "escape", "w", ".");
    expect(text()).toBe("1 1 three\n");
    await keys("i", "<", "escape", "w", ".");
    expect(text()).toBe("1 <<1 three\n"); // w went from < onto the 1
    await keys("o", "x", "escape", ".");
    expect(text()).toBe("1 <<1 three\nx\nx\n");
  });
  test(". repeats a counted change with its count", async () => {
    const { keys, at, text, h } = await setup("a b c d\ne f g h\n");
    at(0, 0);
    await keys("2", "d", "w");
    expect(text().split("\n")[0]).toBe("c d");
    expect(h.app.vim.lastChange).toEqual(["2", "d", "w"]);
    at(1, 0);
    await keys(".");
    expect(text().split("\n")[1]).toBe("g h");
  });
  test("., D, C, s, S, r, J, ~, >>, <<", async () => {
    const { keys, at, text } = await setup("a1 a2 a3\nb\n  c\nd\n");
    at(0, 0);
    await keys("dw", ".");
    expect(text().split("\n")[0]).toBe("a3");
    await keys("u", "u");
    at(0, 3);
    await keys("D");
    expect(text().split("\n")[0]).toBe("a1 ");
    await keys("u");
    at(0, 0);
    await keys("C", "new", "escape");
    expect(text().split("\n")[0]).toBe("new");
    await keys("s", "N", "escape", "r", "W"); // on the w: N, then W
    expect(text().split("\n")[0]).toBe("neW");
    at(1, 0);
    await keys("J"); // the cursor lands on the joining space, as in vim
    expect(text().split("\n")[1]).toBe("b c");
    at(1, 0);
    await keys("~");
    expect(text().split("\n")[1]).toBe("B c");
    await keys(">>");
    expect(text().split("\n")[1]).toBe("  B c");
    await keys("<<", "<<");
    expect(text().split("\n")[1]).toBe("B c");
    at(2, 0);
    await keys("S", "dd", "escape");
    expect(text().split("\n")[2]).toBe("dd");
  });
  test("visual d and >, and cw changing only to the word's end", async () => {
    const { keys, at, text } = await setup("one two three\nfour\nfive\n");
    at(0, 4);
    await keys("v", "e", "d");
    expect(text().split("\n")[0]).toBe("one  three");
    at(1, 0);
    await keys("shift+v", "j", ">");
    expect(text()).toBe("one  three\n  four\n  five\n");
    at(0, 0);
    await keys("cw", "ONE", "escape");
    expect(text().split("\n")[0]).toBe("ONE  three");
  });
});
