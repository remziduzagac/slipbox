import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, statusRow, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("editing: insert mode, undo, save (step 3b)", () => {
  const setup = async (text: string, name = "ed.md") => {
    const root = makeVault();
    const file = join(root, name);
    writeFileSync(file, text);
    const h = await harness({ root, open: name, width: 100, height: 30 });
    const type = async (s: string) => {
      for (const ch of s) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
    };
    return { h, file, type, v: h.app.view! };
  };
  test("typing, by words: ctrl+arrows, alt+arrows, alt+b / alt+f — to a word's start back, its end forward, across lines", async () => {
    const { h, v } = await setup("one two.three\nfour five\n");
    await h.keys("space", "n", "v", "g", "g", "shift+a"); // source mode, typing at the line's end
    const at = () => offsetOf(h.app, v);
    const seen: number[] = [];
    for (const key of ["alt+left", "ctrl+left", "alt+b", "alt+right", "ctrl+right", "alt+f", "alt+f"]) {
      await h.keys(key);
      seen.push(at());
    }
    // back: "three", ".", "two"; forward: "two" — the end — then "." and "three"; then over the line's end to "four"'s.
    expect(seen).toEqual([8, 7, 4, 7, 8, 13, 18]);
    expect(v.insert).toBe(true);
    await h.keys("x");
    expect(v.buf.source).toBe("one two.three\nfourx five\n");
    await h.keys("ctrl+w"); // the insert started again where the cursor landed: only what was typed since goes
    expect(v.buf.source).toBe("one two.three\nfour five\n");
  });
  test("macOS's cmd keys, as other Mac apps: cmd+← / cmd+→ (ctrl+a / ctrl+e, what its terminals send) to a line's start and end, cmd+↑ / cmd+↓ to the top and bottom — reading and typing", async () => {
    const { h, v } = await setup("one two\nthree four\n");
    await h.keys("space", "n", "v", "j", "w"); // source mode, on "four"
    const at = () => offsetOf(h.app, v);
    const seen: number[] = [];
    for (const key of ["ctrl+a", "ctrl+e", "cmd+left", "cmd+right", "cmd+up", "cmd+down"]) {
      await h.keys(key);
      seen.push(at());
    }
    expect(seen).toEqual([8, 17, 8, 17, 0, 8]); // reading: the end is on the last character; the bottom, the last line
    expect(v.source).toBe(true); // ctrl+e moves: it never switches the view any more
    // Extending: shift with them.
    await h.keys("ctrl+a", "shift+ctrl+e");
    expect(h.app.views.selectionText(v)).toBe("three four");
    await h.keys("escape", "shift+a"); // typing at the line's end
    seen.length = 0;
    for (const key of ["ctrl+a", "ctrl+e", "cmd+left", "cmd+right", "cmd+up", "cmd+down"]) {
      await h.keys(key);
      seen.push(at());
    }
    expect(seen).toEqual([8, 18, 8, 18, 0, 18]); // typing: past the last character; the bottom, the last line's end
    await h.keys("cmd+up", "x");
    expect(v.buf.source).toBe("xone two\nthree four\n");
    await h.keys("ctrl+w"); // the insert started again where the cursor landed
    expect(v.buf.source).toBe("one two\nthree four\n");
    await h.keys("escape", "j", "shift+i", "a", "b", "ctrl+e", "x", "ctrl+w"); // on its line too: only the x goes
    expect(v.buf.source).toBe("one two\nabthree four\n");
  });
  test("a desktop editor's selection while typing (DF-D15): shift with a move selects; typed text, enter or a paste replaces it, backspace and delete delete it; ctrl+c, ctrl+x; left and right to its ends", async () => {
    const { h, type, v } = await setup("one two three\nfour five\n");
    await h.keys("space", "n", "v", "g", "g", "i"); // typing at the note's start
    await h.keys("shift+right", "shift+right", "shift+right");
    expect(v.insert).toBe(true);
    expect(h.app.views.selectionText(v)).toBe("one"); // the cursor sits between characters: the one after it isn't taken
    expect(h.frame()).toContain("one two three"); // drawn so: the selection role on "one" only
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("one two three"));
    const x = c.rows[y]!.join("").indexOf("one two three");
    expect(c.styles[y]![x + 2]!.bg).toBe(h.app.theme.roles.selection.bg!);
    expect(c.styles[y]![x + 3]!.bg).not.toBe(h.app.theme.roles.selection.bg!);
    await type("ONE");
    expect(v.buf.source).toBe("ONE two three\nfour five\n");
    expect(v.sel).toBeNull();
    await h.keys("ctrl+shift+right"); // by word: " two"
    expect(h.app.views.selectionText(v)).toBe(" two");
    await h.keys("backspace");
    expect(v.buf.source).toBe("ONE three\nfour five\n");
    await h.keys("shift+end", "delete"); // to the line's end
    expect(v.buf.source).toBe("ONE\nfour five\n");
    await h.keys("shift+down", "ctrl+c"); // across the line break, kept selected
    expect(h.copied.at(-1)).toBe("\nfou");
    expect(v.sel).not.toBeNull();
    await h.keys("ctrl+x");
    expect(v.buf.source).toBe("ONEr five\n");
    expect(h.copied.at(-1)).toBe("\nfou");
    await h.keys("shift+right", "shift+right", "left", "-"); // left: to the selection's start, not a character back
    expect(v.buf.source).toBe("ONE-r five\n");
    await h.keys("shift+left", "shift+left", "right", "+"); // right: to its end
    expect(v.buf.source).toBe("ONE-+r five\n");
    await h.keys("shift+right", "enter");
    expect(v.buf.source).toBe("ONE-+\n five\n");
    await h.keys("shift+end", "ctrl+v"); // the paste puts what was cut, not the selection it replaces
    expect(v.buf.source).toBe("ONE-+\n\nfou\n");
    await h.keys("shift+home"); // from past the line's last character, where the cursor was…
    v.layoutKey = ""; // …which a re-layout (a resize, a message line) keeps
    h.frame();
    expect(h.app.views.selectionText(v)).toBe("fou");
    await h.app.input.paste("NEW"); // the terminal's own paste replaces it too
    expect(v.buf.source).toBe("ONE-+\n\nNEW\n");
    await h.keys("shift+left", "escape"); // esc stops typing; the selection goes with it
    expect(v.insert).toBe(false);
    expect(v.sel).toBeNull();
    expect(v.buf.source).toBe("ONE-+\n\nNEW\n");
  });
  test("ctrl+z and ctrl+y while typing undo and redo, and typing goes on; what's typed after an undo is a step of its own (DF-D15)", async () => {
    const { h, type, v } = await setup("alpha\n");
    await h.keys("space", "n", "v", "shift+a");
    await type(" beta");
    await h.keys("ctrl+z");
    expect(v.buf.source).toBe("alpha\n");
    expect(v.insert).toBe(true);
    await h.keys("ctrl+y");
    expect(v.buf.source).toBe("alpha beta\n");
    expect(v.insert).toBe(true);
    await type("!"); // at the redone text's end
    expect(v.buf.source).toBe("alpha beta!\n");
    await h.keys("ctrl+z"); // the ! alone: a step of its own
    expect(v.buf.source).toBe("alpha beta\n");
    await type("?");
    await h.keys("ctrl+y"); // typed after an undo: nothing to redo, as in a desktop editor
    expect(v.buf.source).toBe("alpha beta?\n");
    expect(h.app.transient!.text).toBe("nothing to redo");
    await h.keys("escape", "u");
    expect(v.buf.source).toBe("alpha beta\n");
    await h.keys("."); // what was typed since the undo, again, as typed from the cursor (on the last a): i ?
    expect(v.buf.source).toBe("alpha bet?a\n");
  });
  test("the page keys while typing move a page, the view with it; with shift they select (DF-D15)", async () => {
    const { h, v } = await setup(`${Array.from({ length: 90 }, (_, i) => `line ${i + 1}`).join("\n")}\n`);
    await h.keys("space", "n", "v", "g", "g", "i");
    for (let k = 0; k < 10; k++) await h.keys("down");
    const n = v.height - 2;
    expect(v.cur.row - v.top).toBe(10);
    await h.keys("pagedown");
    expect(v.insert).toBe(true);
    expect(h.app.cursorLine(v)).toBe(11 + n);
    expect(v.cur.row - v.top).toBe(10); // the page scrolled under the cursor, which kept its place on the screen
    await h.keys("pagedown", "x", "pageup");
    expect(h.app.cursorLine(v)).toBe(11 + n);
    expect(v.cur.row - v.top).toBe(10);
    expect(v.buf.source.split("\n")[10 + 2 * n]).toBe(`xline ${11 + 2 * n}`);
    await h.keys("home", "shift+pagedown", "backspace"); // a page of lines selected, then gone
    expect(v.buf.source.split("\n")[10 + n]).toBe(`xline ${11 + 2 * n}`);
    expect(v.insert).toBe(true);
    // In the lens they stop at its rules, as the arrows do.
    const lens = await setup(`# A\n\n${Array.from({ length: 40 }, (_, i) => `para ${i + 1}`).join("\n\n")}\n`);
    await lens.h.keys("space", "n", "l", "j", "j", "i", "pagedown");
    const layout = lens.h.app.currentLayout(lens.v);
    expect(lens.v.insert).toBe(true);
    expect(layout.lines[lens.v.cur.row]!.srcMap).toBeDefined();
    expect(layout.lines[lens.v.cur.row + 1]?.srcMap).toBeUndefined(); // on the lens's last row of text
  });
  test("i from the render switches to source and types; esc ends; u undoes the session; U redoes", async () => {
    const { h, type, v, file } = await setup("# T\n\nhello world\n");
    h.app.moveCursor(v, { row: rowStarting(h, "hello"), col: 6 }); // on "w"
    await h.keys("i");
    expect(v.source).toBe(true);
    expect(v.insert).toBe(true);
    expect(statusRow(h.frame())).toContain("INSERT");
    await type("big ");
    expect(v.buf.source).toBe("# T\n\nhello big world\n");
    await h.keys("escape");
    expect(v.insert).toBe(false);
    expect(v.buf.dirty).toBe(true);
    const f = h.frame();
    expect(statusRow(f)).toContain("• unsaved");
    expect(f).toContain("ed.md •"); // the tab, its name with its extension
    expect(readFileSync(file, "utf8")).toBe("# T\n\nhello world\n"); // not saved yet
    await h.keys("u");
    expect(v.buf.source).toBe("# T\n\nhello world\n"); // the whole session at once
    expect(v.buf.dirty).toBe(false);
    await h.keys("shift+u");
    expect(v.buf.source).toBe("# T\n\nhello big world\n");
    // :w writes it; the marker goes.
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toBe("# T\n\nhello big world\n");
    expect(v.buf.dirty).toBe(false);
  });
  test("a, A, I, o and O; enter carries indentation and continues a list; an empty item ends it", async () => {
    const { h, type, v } = await setup("- one\n  - two\n");
    await h.keys("space", "n", "v");
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("shift+a");
    await type("!");
    await h.keys("enter");
    await type("next");
    await h.keys("escape");
    expect(v.buf.source).toBe("- one!\n- next\n  - two\n");
    await h.keys("j", "o"); // under "  - two": a nested item
    await type("three");
    await h.keys("enter", "enter"); // an empty item: the list ends there
    await h.keys("escape");
    expect(v.buf.source).toBe("- one!\n- next\n  - two\n  - three\n  \n");
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("shift+o");
    await type("top");
    await h.keys("escape", "shift+i");
    await type("> ");
    await h.keys("escape");
    expect(v.buf.source.split("\n")[0]).toBe("> top");
    await h.keys("a");
    expect(h.app.cursorLine(v)).toBe(1);
  });
  test("backspace joins lines, x deletes a character (in source), numbered lists count on", async () => {
    const { h, type, v } = await setup("ab\ncd\n1. first\n");
    await h.keys("space", "n", "v");
    h.app.moveCursor(v, { row: 1, col: 0 });
    await h.keys("i", "backspace", "escape");
    expect(v.buf.source).toBe("abcd\n1. first\n");
    await h.keys("x");
    expect(v.buf.source).toBe("acd\n1. first\n"); // the b, the cursor having stepped back onto it
    await h.keys("j", "shift+a", "enter");
    await type("second");
    await h.keys("escape");
    expect(v.buf.source).toBe("acd\n1. first\n2. second\n");
  });
  test("ctrl+l ticks a task in the render; with unsaved changes it edits the buffer, not the file", async () => {
    const { h, v, file } = await setup("- [ ] a task\n");
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe("- [x] a task\n"); // clean: straight to disk
    await h.keys("shift+a");
    await h.keys("!", "escape", "space", "n", "v"); // back to the render, unsaved
    await h.keys("ctrl+l");
    expect(v.buf.source).toBe("- [ ] a task!\n");
    expect(readFileSync(file, "utf8")).toBe("- [x] a task\n");
  });
  test("quitting with unsaved changes is refused; :q! quits; :wq saves and quits", async () => {
    const { h, v, file } = await setup("x\n");
    await h.keys("shift+a", "y", "escape", "ctrl+q");
    expect(h.quit.called).toBe(false);
    expect(h.app.transient!.text).toContain("unsaved changes");
    await h.keys(":", "w", "q", "enter");
    expect(readFileSync(file, "utf8")).toBe("xy\n");
    expect(h.quit.called).toBe(true);
    const b = await setup("z\n");
    await b.h.keys("shift+a", "z", "escape", ":", "q", "!", "enter");
    expect(b.h.quit.called).toBe(true);
    expect(readFileSync(b.file, "utf8")).toBe("z\n");
    void v;
  });
  test("a BOM and CRLF endings survive; new lines are CRLF too", async () => {
    const { h, type, file } = await setup("\uFEFFone\r\ntwo\r\n");
    await h.keys("shift+a", "enter");
    await type("mid");
    await h.keys("escape", "ctrl+s");
    expect(readFileSync(file)).toEqual(Buffer.from("\uFEFFone\r\nmid\r\ntwo\r\n", "utf8"));
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
  test("insert ctrl+w keeps the space before the word; enter doesn't continue lists in code or on rules", async () => {
    const { h, v, at } = await src("a foo\n```\n- code\n```\n* * *\n");
    at(0, 5);
    await h.keys("a", "ctrl+w", "escape");
    expect(v.buf.source.split("\n")[0]).toBe("a ");
    at(2, 5);
    await h.keys("shift+a", "enter", "x", "escape");
    expect(v.buf.source.split("\n")[3]).toBe("x");
    const rule = v.buf.source.split("\n").indexOf("* * *");
    at(rule, 0);
    await h.keys("shift+a", "enter", "y", "escape");
    expect(v.buf.source.split("\n")[rule + 1]).toBe("y");
  });
});

describe("word count, save all, the change list, moving lines", () => {
  test("esc read while a new layout is pending: gi still comes back past the line's end, the cursor on its last character", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "line one\nline two\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "j", "A", "!");
    // The index's last notes parsed, a grammar loaded, the watcher's news: every window laid out again, and esc read
    // before the frame that would have done it.
    h.app.relayoutAll();
    await h.app.input.handleKey("escape");
    expect(statusRow(h.frame())).toContain("L2:9"); // on the `!`
    await h.keys("g", "g", "g", "i", "?", "escape");
    expect(v.buf.source).toBe("line one\nline two!?\n");
  });
});
