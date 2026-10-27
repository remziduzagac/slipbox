import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, makeVault, harness, statusRow, rowStarting, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("footnotes in the right panel (3.17)", () => {
  const NOTE =
    "# Notes\n\nFirst claim[^one] and a second[^Two].\n\nAgain the first[^one].\n\n[^one]: The first source.\n[^two]: The second, on\n    two lines.\n[^spare]: Nothing refers to this.\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), NOTE);
    return await harness({ root, open: "fn.md", width: 140 });
  };
  const rows = (h: Harness) => h.app.footnotes.rows().map((r) => r.text);

  test("space n f shows them beside the note: each footnote, its references unfolded under it; the rail's button under the outline's", async () => {
    const h = await setup();
    await h.keys("space", "n", "f");
    expect(h.app.rightView).toBe("footnotes");
    expect(h.app.region).toBe("outline");
    expect(rows(h)).toEqual([
      "[one] The first source.",
      "[two] The second, on two lines.",
      "[spare] Nothing refers to this.",
    ]);
    const f = h.frame();
    expect(f).toContain("Footnotes");
    expect(f).toMatch(/\[one\] The first source\.\s+2×/);
    expect(f).toMatch(/\[spare\] Nothing refe\S*…\s+unused/); // cut to keep its count in sight
    expect(h.app.geometry!.scrollbars.some((b) => b.pane === "outline" && b.horizontal)).toBe(false);
    expect(statusRow(f)).toContain("FOOTNOTES");
    // The right rail: the outline's button, then this one under it, lit.
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    expect(hot("btn:footnotes").y).toBe(hot("btn:outline").y + 1);
    // l unfolds a footnote's references, each with its line; h folds them back.
    await h.keys("l");
    expect(rows(h).slice(0, 3)).toEqual([
      "[one] The first source.",
      "L3  First claim[^one] and a second[^Two].",
      "L5  Again the first[^one].",
    ]);
    await h.keys("h");
    expect(rows(h)).toHaveLength(3);
  });

  test("enter jumps to the definition, or a reference; unfocused, the selection follows the cursor", async () => {
    const h = await setup();
    await h.keys("space", "n", "f", "l", "j", "j", "enter"); // [one]'s second reference
    expect(h.app.region).toBe("content");
    const v = h.app.view!;
    const link = h.app.currentLayout(v).links[h.app.linking.linkUnderCursor(v)]!;
    expect(link).toMatchObject({ kind: "footnote", src: 5 });
    // Following the cursor, unfocused: onto [two]'s definition, its row.
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.footnoteDef === "two"), col: 0 });
    h.frame();
    expect(h.app.footnotes.rows()[h.app.outline.selected]!.text).toBe("[two] The second, on two lines.");
    // A footnote's own row: its definition.
    await h.keys("space", "n", "f", "g", "g", "h", "j", "enter"); // [one] folded again, then [two] (its definition's label)
    expect(h.app.currentLayout(v).lines[v.cur.row]!.footnoteDef).toBe("two");
    // In source mode: the source's place.
    await h.app.run("view.source");
    await h.keys("space", "n", "f", "g", "g", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(7);
  });

  test("the buttons switch the panel's view, each keeping its place; / filters; :footnotes", async () => {
    const h = await setup();
    const click = (id: string) => {
      const r = h.app.geometry!.hot.find((x) => x.id === id)!;
      h.app.mouse.handle({ type: "down", x: r.x + 1, y: r.y, button: 0 });
      h.app.mouse.handle({ type: "up", x: r.x + 1, y: r.y, button: 0 });
      h.frame();
    };
    h.frame();
    click("btn:footnotes");
    expect(h.app.rightView).toBe("footnotes");
    await h.keys("j", "j");
    click("btn:outline");
    expect(h.app.rightView).toBe("outline");
    expect(h.frame()).toContain("Outline");
    click("btn:footnotes");
    expect(h.app.outline.selected).toBe(2); // where it was
    click("btn:footnotes"); // its own button again: hidden
    expect(h.app.panels.outlineShown).toBe(false);
    await h.keys(":");
    for (const ch of "footnotes") await h.keys(ch);
    await h.keys("enter");
    expect(h.app.panels.outlineShown).toBe(true);
    await h.keys("/", "s", "e", "c");
    expect(rows(h)).toEqual(["[two] The second, on two lines."]);
  });
});

describe("adding and changing footnotes (3.18)", () => {
  const NOTE =
    "# Notes\n\nThe dome logged nights and more nights, see [alpha](notes/alpha.md) here.\n\n[^old]: An old one.\n";
  const setup = async (source = NOTE) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };
  const prompt = (h: Harness) => h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  /** Put the cursor on the `nth` occurrence of `word` as drawn (rendered, or source). */
  const onWord = (h: Harness, word: string, nth = 0, offset = 0) => {
    const v = h.app.view!;
    const lines = h.app.currentLayout(v).lines;
    let seen = 0;
    for (let row = 0; row < lines.length; row++) {
      const t = lines[row]!.spans.map((s) => s.text).join("");
      for (let i = t.indexOf(word); i >= 0; i = t.indexOf(word, i + 1)) {
        if (seen++ === nth) return h.app.moveCursor(v, { row, col: stringWidth(t.slice(0, i)) + offset });
      }
    }
    throw new Error(`no ${word}`);
  };

  test("space n shift+f in the render: its text asked; [^N] after the word the cursor is on, [^N]: text at the end; one undo step", async () => {
    const { h, read } = await setup();
    onWord(h, "nights", 1, 2); // the second "nights", inside it
    await h.keys("space", "n", "shift+f");
    expect(prompt(h).label).toBe("Add a footnote — its text:");
    await type(h, "Counted by hand");
    await h.keys("enter");
    expect(read()).toBe(
      "# Notes\n\nThe dome logged nights and more nights[^1], see [alpha](notes/alpha.md) here.\n\n[^old]: An old one.\n[^1]: Counted by hand\n",
    );
    expect(h.app.messages.at(-1)!.text).toBe("added footnote [^1]");
    expect(h.app.view!.buf.dirty).toBe(false); // saved
    await h.keys("ctrl+z");
    expect(h.app.view!.buf.source).toBe(NOTE); // both edits, one step
    // On a link's word: after the link, never inside its brackets.
    onWord(h, "alpha");
    await h.keys("space", "n", "shift+f");
    await type(h, "Linked");
    await h.keys("enter");
    expect(read()).toContain("see [alpha](notes/alpha.md)[^1] here.");
  });

  test("in source mode: after the word under the cursor; a note without footnotes gets them after a blank line", async () => {
    const { h, read } = await setup("# Plain\n\nJust a claim here.\n");
    await h.app.run("view.source");
    onWord(h, "claim", 0, 1);
    await h.app.run("footnote.add");
    await type(h, "Source");
    await h.keys("enter");
    expect(read()).toBe("# Plain\n\nJust a claim[^1] here.\n\n[^1]: Source\n");
  });

  test("the footnotes view: a adds, e edits its text, r renames it everywhere, d deletes it; its + button adds", async () => {
    const { h, read } = await setup("# N\n\nOne[^a] and two[^a].\n\n[^a]: Alpha,\n    continued.\n");
    await h.keys("space", "n", "f");
    await h.keys("e");
    expect(prompt(h)).toMatchObject({ label: "Footnote [^a] — its text:", text: "Alpha, continued." });
    await h.keys("ctrl+u");
    await type(h, "Rewritten");
    await h.keys("enter");
    expect(read()).toBe("# N\n\nOne[^a] and two[^a].\n\n[^a]: Rewritten\n");
    await h.keys("r", "ctrl+u");
    await type(h, "src");
    await h.keys("enter");
    expect(read()).toBe("# N\n\nOne[^src] and two[^src].\n\n[^src]: Rewritten\n");
    // The + on its title: a new one, at the note's cursor.
    const plus = h.app.geometry!.hot.find((x) => x.id === "fn:add")!;
    h.app.mouse.handle({ type: "down", x: plus.x + 1, y: plus.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: plus.x + 1, y: plus.y, button: 0 });
    expect(prompt(h).label).toBe("Add a footnote — its text:");
    await type(h, "Second");
    await h.keys("enter");
    expect(read()).toMatch(/\[\^src\]: Rewritten\n\[\^1\]: Second\n$/);
    // d: after asking.
    h.app.region = "outline";
    h.app.outline.selected = h.app.footnotes.rows().findIndex((r) => r.fn.label === "src");
    await h.keys("d");
    expect(prompt(h)).toMatchObject({
      confirm: true,
      label: "Delete footnote [^src]: its definition and 2 references?",
    });
    await h.keys("y");
    expect(read()).not.toContain("[^src]");
    expect(h.app.footnotes.rows().map((r) => r.fn.label)).toEqual(["1"]);
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };

  const fnSetup = async (source: string | Buffer) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };
  const onlyCrlf = (text: string) => expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

  test("footnotes and the link picker on a CRLF note: never between a CR and its LF, and new lines CRLF", async () => {
    const NOTE = "# Index\r\n\r\nSome words here.\r\n\r\nMore.\r\n";
    // Source mode, on the blank line after the heading.
    const a = await fnSetup(NOTE);
    await a.h.app.run("view.source");
    a.h.app.moveCursor(a.h.app.view!, { row: 1, col: 0 });
    await a.h.app.run("footnote.add");
    await type(a.h, "hi");
    await a.h.keys("enter");
    expect(a.read()).toBe("# Index\r\n[^1]\r\nSome words here.\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // Rendered, on a word.
    const b = await fnSetup(NOTE);
    const row = rowStarting(b.h, "Some words");
    b.h.app.moveCursor(b.h.app.view!, { row, col: 6 });
    await b.h.app.run("footnote.add");
    await type(b.h, "hi");
    await b.h.keys("enter");
    expect(b.read()).toBe("# Index\r\n\r\nSome words[^1] here.\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // Rendered, on a paragraph without a word: at its end, which is its blank line's CRLF.
    const e = await fnSetup("# Index\r\n\r\n(!)\r\n\r\nMore.\r\n");
    e.h.app.moveCursor(e.h.app.view!, { row: rowStarting(e.h, "(!)"), col: 1 });
    await e.h.app.run("footnote.add");
    await type(e.h, "hi");
    await e.h.keys("enter");
    expect(e.read()).toBe("# Index\r\n\r\n(!)[^1]\r\n\r\nMore.\r\n\r\n[^1]: hi\r\n");
    // The link picker, in normal mode on a blank line.
    const c = await fnSetup(NOTE);
    await c.h.app.run("view.source");
    c.h.app.moveCursor(c.h.app.view!, { row: 1, col: 0 });
    c.h.app.linking.insertLink(c.h.app.view!);
    await type(c.h, "alpha");
    await c.h.keys("enter");
    expect(c.read()).not.toBe(NOTE);
    onlyCrlf(c.read());
  });
});
