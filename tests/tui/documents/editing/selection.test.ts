import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, statusRow, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("selection", () => {
  test("shift+arrows extend; ctrl+c copies only a selection; y y copies selection or row", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("ctrl+c");
    expect(h.copied).toHaveLength(0);
    for (let i = 0; i < 6; i++) await h.keys("shift+right");
    await h.keys("ctrl+c");
    expect(h.copied.at(-1)).toBe("Back to");
    await h.keys("right");
    expect(h.app.view!.sel).toBeNull();
    await h.keys("y", "y");
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("shift+ctrl by word, shift+end to the row end", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("shift+ctrl+right", "ctrl+c");
    expect(h.copied.at(-1)).toBe("Back t");
    await h.keys("escape", "0", "shift+end", "ctrl+c");
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
  test("a shift selection in source mode or the lens: backspace and delete delete it, as a desktop editor's", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "alpha beta gamma\n");
    const h = await harness({ root, open: "s.md", config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "w", "shift+right", "shift+right"); // on "beta": b, e and t
    await h.keys("delete");
    expect(v.buf.source).toBe("alpha a gamma\n");
    expect([v.visual, v.sel]).toEqual([null, null]);
    await h.keys("shift+left", "backspace"); // the space and "a"
    expect(v.buf.source).toBe("alpha gamma\n");
    // The lens: its first i opens it, and a shift selection there is a visual one too.
    await h.keys("ctrl+k", "0", "i");
    expect(v.live).toBe(true);
    await h.keys("shift+right", "delete"); // "al"
    expect(v.buf.source).toBe("pha gamma\n");
    await h.keys("shift+right", "backspace"); // "ph"
    expect(v.buf.source).toBe("a gamma\n");
    expect(v.live).toBe(true);
    // Reading, a selection is a plain one: nothing to delete, and the note unchanged.
    await h.keys("escape", "escape", "shift+right", "delete");
    expect(v.buf.source).toBe("a gamma\n");
  });
  test("in source mode a shift selection is a visual one, as a drag's: d, x and c act on it, esc leaves it (DF-D15)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s.md"), "alpha beta gamma delta\n");
    const h = await harness({ root, open: "s.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "w", "shift+right", "shift+right"); // on "beta": b, e and t
    expect(v.visual).toBe("char");
    expect(statusRow(h.frame())).toContain("VISUAL");
    await h.keys("d");
    expect(v.buf.source).toBe("alpha a gamma delta\n");
    await h.keys("shift+ctrl+right", "x"); // "a g", its last character included
    expect(v.buf.source).toBe("alpha amma delta\n");
    await h.keys("shift+right", "c", "Z", "escape");
    expect(v.buf.source).toBe("alpha Zma delta\n");
    await h.keys("shift+left", "escape"); // the cursor on the space before Z
    expect([v.visual, v.sel]).toEqual([null, null]);
    // A shifted motion after an operator moves no selection in: d shift+right deletes, and nothing stays selected.
    await h.keys("d", "shift+right");
    expect(v.buf.source).toBe("alphaZma delta\n");
    expect([v.visual, v.sel]).toEqual([null, null]);
    // Reading, a shift selection stays a plain one: a move without shift clears it.
    await h.keys("ctrl+k", "shift+right");
    expect(v.visual).toBeNull();
  });
  test("v, V, o, y and esc", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("v", "e");
    expect(statusRow(h.frame())).toContain("VISUAL");
    await h.keys("o");
    expect(h.app.view!.cur.col).toBe(0);
    await h.keys("y");
    expect(h.copied.at(-1)).toBe("Back");
    expect(h.app.view!.visual).toBeNull();
    await h.keys("shift+v", "k", "k", "y");
    expect(h.copied.at(-1)).toBe("▌ Section One\n\nBack to index and on to beta.");
    await h.keys("v", "escape");
    expect(h.app.view!.sel).toBeNull();
  });
  test("mouse drag selects and copies on release", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    h.app.mouse.handle({ type: "down", x: pane.textX, y: pane.y + row, button: 0 });
    h.app.mouse.handle({ type: "drag", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 6, y: pane.y + row, button: 0 });
    expect(h.copied.at(-1)).toBe("Back to");
  });
  test("y p, y r (cursor row), y l (link under the cursor)", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("y", "p");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("y", "r");
    expect(h.copied.at(-1)).toBe("notes/alpha.md:9");
    await h.keys("tab", "y", "l");
    expect(h.copied.at(-1)).toEndWith("/index.md");
  });
});

describe("review round 1", () => {
  test("a drag selection survives the re-layout its copy message causes", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 120, height: 30 });
    h.frame();
    const p = h.app.geometry!.panes[0]!;
    h.app.mouse.handle({ type: "down", x: p.textX + 2, y: p.y + 2, button: 0 });
    h.app.mouse.handle({ type: "drag", x: p.textX + 10, y: p.y + 8, button: 0 });
    h.app.mouse.handle({ type: "up", x: p.textX + 10, y: p.y + 8, button: 0 });
    const cur = { ...h.app.view!.cur };
    h.frame(); // the message line changes the pane's height
    expect(h.app.view!.cur).toEqual(cur);
    expect(h.copied.at(-1)!.length).toBeGreaterThan(10);
  }); // 29 harnesses
});

describe("review round 2", () => {
  test("a selection stays on the same source lines when the width changes", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.sidebar = false),
    });
    for (let i = 0; i < 12; i++) await h.keys("j");
    await h.keys("shift+v", "j", "j");
    const lines = () => {
      const v = h.app.view!;
      const l = h.app.currentLayout(v);
      return [l.lines[v.sel!.anchor.row]!.src, l.lines[v.cur.row]!.src];
    };
    const before = lines();
    await h.keys("space", "e", "escape"); // the explorer takes width: the note re-wraps
    h.frame();
    // The same place (a blank line between paragraphs has no row, so the next one stands in),
    // never another paragraph as before.
    const after = lines();
    expect(Math.abs(after[0]! - before[0]!)).toBeLessThanOrEqual(1);
    expect(after[1]).toBe(before[1]);
  });
});

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
  test("'<,'> is the last selection's lines after it ends", async () => {
    const { h, v, at, ex } = await source("a\nb\nc\nd\n");
    at(1, 0);
    await h.keys("shift+v", "j", "escape");
    await ex("'<,'>s/$/!/");
    expect(v.buf.source).toBe("a\nb!\nc!\nd\n");
  });
  test("'<,'> whose lines were deleted since is the line after them, as vim's marks: never the note's first", async () => {
    const { h, v, ex } = await source("x1\nx2\nx3\nx4\nx5\nx6\n");
    await h.keys("3", "j", "shift+v", "j", ":", "escape", "escape");
    expect(v.buf.visualMarks).toEqual([9, 12]);
    await h.keys("g", "g", "j", "d", "3", "j");
    expect(v.buf.source).toBe("x1\nx6\n");
    await ex("'<,'>s/x/y/");
    expect(v.buf.source).toBe("x1\ny6\n");
  });
  test("'<,'> moves with the text: lines added above the last selection, it still works on its lines", async () => {
    const { h, v, ex } = await source("one\ntwo\nfoo a\nfoo b\nfoo c\n");
    await h.keys("j", "j", "shift+v", "j", "escape");
    await h.keys("g", "g", "shift+o", "n", "e", "w", "escape");
    await ex("'<,'>s/foo/BAR/");
    expect(v.buf.source).toBe("new\none\ntwo\nBAR a\nBAR b\nfoo c\n");
    await h.keys("g", "g", "d", "d", "u");
    await ex("'<,'>s/BAR/X/");
    expect(v.buf.source).toBe("new\none\ntwo\nX a\nX b\nfoo c\n");
    await h.keys("g", "g", "3", "j", "shift+o", "X", "escape"); // a line opened above the first marked
    await ex("'<,'>s/X/Y/");
    expect(v.buf.source).toBe("new\none\ntwo\nX\nY a\nY b\nfoo c\n");
  });
});

describe("review cycle 5 (TUI journeys: a drag in source)", () => {
  test("a drag in source mode is a visual selection: x deletes it, esc leaves it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "d.md"), "alpha beta gamma\n");
    const h = await harness({ root, open: "d.md" });
    await h.keys("space", "n", "v");
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + h.app.view!.cur.row - h.app.view!.top;
    h.app.mouse.handle({ type: "down", x: pane.textX + 6, y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: pane.textX + 9, y, button: 0 }); // "beta", its last letter included
    h.app.mouse.handle({ type: "up", x: pane.textX + 9, y, button: 0 });
    expect(h.app.view!.visual).toBe("char");
    await h.keys("x");
    expect(h.app.view!.buf.source).toBe("alpha  gamma\n");
    expect(h.app.view!.sel).toBeNull();
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
  test("f and t in visual mode take their character; esc cancels it, and a later key isn't taken", async () => {
    const a = await setup("abc.def x\n");
    await a.keys("v", "f", ".", "d");
    expect(a.text()).toBe("def x\n");
    const b = await setup("abc.def x\n");
    await b.keys("v", "f", "escape", "x");
    expect(b.text()).toBe("bc.def x\n"); // one character, never a find of x
  });
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("selection keys: shift+ctrl+end / home to the note's ends, shift+ctrl+down by paragraph, shift+pagedown by page", async () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), Array.from({ length: 60 }, (_, i) => `Line ${i + 1}.`).join("\n\n") + "\n");
    const h = await harness({ root, open: "long.md", height: 30 });
    const v = h.app.view!;
    const last = h.app.currentLayout(v).lines.length - 1;
    await h.keys("j", "j", "shift+ctrl+end");
    expect(v.sel?.anchor.row).toBe(2);
    expect(v.cur.row).toBe(last);
    await h.keys("escape", "shift+ctrl+home");
    expect(v.sel?.anchor.row).toBe(last);
    expect(v.cur.row).toBe(0);
    await h.keys("escape", "shift+ctrl+down");
    expect(v.sel?.anchor.row).toBe(0);
    expect(v.cur.row).toBe(1); // the blank row after the first paragraph
    await h.keys("escape", "g", "g", "shift+pagedown");
    expect(v.sel?.anchor.row).toBe(0);
    expect(v.cur.row).toBeGreaterThan(15);
    await h.keys("ctrl+c");
    expect(h.copied.at(-1)).toMatch(/^Line 1\.\n\nLine 2\.\n\nLine 3\./); // the rows between, copied
  });
});
