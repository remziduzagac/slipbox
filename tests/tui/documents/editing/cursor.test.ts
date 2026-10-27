import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { makeSandbox, makeVault, harness, rowText, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("cursor movement", () => {
  test("h j k l and arrows; up and down keep the goal column", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md" });
    await h.keys("j", "j", "$");
    const long = h.app.view!.cur.col;
    expect(long).toBeGreaterThan(20);
    await h.keys("j");
    expect(h.app.view!.cur.col).toBe(0); // a blank row
    await h.keys("k");
    expect(h.app.view!.cur.col).toBe(long); // back to the goal column
    await h.keys("h", "left");
    expect(h.app.view!.cur.col).toBe(long - 2);
    await h.keys("l", "right");
    expect(h.app.view!.cur.col).toBe(long);
  });
  test("row start and end: 0 $ home end", async () => {
    const h = await harness({ open: "samples/scratch/wrap-probe.md" });
    await h.keys("j", "j", "$");
    const end = h.app.view!.cur.col;
    for (const k of ["0", "home"]) {
      await h.keys("$", k);
      expect(h.app.view!.cur.col).toBe(0);
    }
    for (const k of ["$", "end"]) {
      await h.keys("0", k);
      expect(h.app.view!.cur.col).toBe(end);
    }
  });
  test("w b e and ctrl+arrows move by word (the desktop editors' keys)", async () => {
    const h = await harness({ open: "notes/beta.md" });
    const row = rowStarting(h, "Beta links");
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    await h.keys("w");
    expect(h.app.view!.cur.col).toBe(5); // "links"
    await h.keys("e");
    expect(h.app.view!.cur.col).toBe(9); // end of "links"
    await h.keys("ctrl+right");
    expect(h.app.view!.cur.col).toBe(11); // "to"
    await h.keys("b", "ctrl+left");
    expect(h.app.view!.cur.col).toBe(0);
    await h.keys("b");
    expect(h.app.view!.cur.row).toBeLessThan(row);
  });
  test("g g, shift+g, ctrl+home, ctrl+end", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    await h.keys("shift+g");
    const last = h.app.currentLayout(h.app.view!).lines.length - 1;
    expect(h.app.view!.cur.row).toBe(last);
    expect(h.app.view!.top).toBeGreaterThan(0);
    await h.keys("g", "g");
    expect(h.app.view!.cur.row).toBe(0);
    await h.keys("ctrl+end");
    expect(h.app.view!.cur.row).toBe(last);
    await h.keys("ctrl+home");
    expect(h.app.view!.cur.row).toBe(0);
  });
  test("headings with [ [ ] ] alt+up alt+down; paragraphs with { } ctrl+up ctrl+down", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    const heads = () => h.app.currentLayout(h.app.view!).headings.map((x) => x.line);
    await h.keys("]", "]");
    expect(heads()).toContain(h.app.view!.cur.row);
    const first = h.app.view!.cur.row;
    await h.keys("alt+down");
    expect(h.app.view!.cur.row).toBeGreaterThan(first);
    await h.keys("alt+up");
    expect(h.app.view!.cur.row).toBe(first);
    await h.keys("}");
    expect(rowText(h).trim()).toBe("");
    const p = h.app.view!.cur.row;
    await h.keys("ctrl+down");
    expect(h.app.view!.cur.row).toBeGreaterThan(p);
    await h.keys("ctrl+up", "{");
    expect(h.app.view!.cur.row).toBeLessThan(p);
    await h.keys("[", "[");
    expect(heads().includes(h.app.view!.cur.row) || h.app.view!.cur.row === 0).toBe(true);
  });
  test("ctrl+d ctrl+u pagedown pageup move cursor and view together; scrolloff holds", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 30 });
    await h.keys("ctrl+d");
    const v = h.app.view!;
    expect(v.top).toBeGreaterThan(0);
    expect(v.cur.row).toBeGreaterThanOrEqual(v.top + 3);
    await h.keys("pagedown", "pagedown", "pageup", "ctrl+u");
    expect(v.cur.row - v.top).toBeGreaterThanOrEqual(3);
  });
  test("w b e at the note's ends: w on the last word to its end, e there stays, b in the first word to its start", async () => {
    const root = makeVault();
    writeFileSync(join(root, "w.md"), "one two\nthree four\n");
    const h = await harness({ root, open: "w.md" });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const from = async (row: number, col: number, key: string) => {
      h.app.moveCursor(v, { row, col });
      await h.keys(key);
      return [v.cur.row, v.cur.col];
    };
    expect(await from(1, 6, "w")).toEqual([1, 9]); // no next word: the last one's end
    expect(await from(1, 6, "e")).toEqual([1, 9]);
    expect(await from(1, 9, "e")).toEqual([1, 9]); // nothing after: stays
    expect(await from(0, 2, "b")).toEqual([0, 0]);
    expect(await from(0, 0, "b")).toEqual([0, 0]);
  });
  test("wide characters are one stop", async () => {
    const h = await harness({ open: "cjk/日本語.md" });
    const row = rowStarting(h, "alpha");
    h.app.moveCursor(h.app.view!, { row, col: 0 });
    await h.keys("w");
    const col = h.app.view!.cur.col;
    expect(col).toBe(6);
    await h.keys("l");
    expect(h.app.view!.cur.col).toBe(col + 2);
  });
  test("mouse click moves the cursor; the wheel scrolls the view", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md" });
    const pane = h.app.geometry!.panes[0]!;
    h.app.mouse.handle({ type: "down", x: pane.textX + 3, y: pane.y + 5, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 3, y: pane.y + 5, button: 0 });
    expect(h.app.view!.cur.row).toBe(5);
    h.app.mouse.handle({
      type: "scroll",
      x: pane.x + 5,
      y: pane.y + 2,
      button: 0,
      scroll: { direction: "down", delta: 1 },
    });
    expect(h.app.view!.top).toBe(3);
  });
});

test("a relayout while typing at a line's end — a resize, the problems bar appearing — keeps the cursor after it", async () => {
  const root = makeVault();
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  const h = await harness({ root, open: "a.ts" });
  await h.keys("A", "x");
  h.app.draw(new TextCanvas(100, 30)); // the terminal narrowed: laid out again
  await h.keys("y");
  expect(h.app.view!.buf.source).toBe("const a = 1;xy\n"); // not "1;yx"
});
