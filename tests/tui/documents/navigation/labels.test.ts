import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Line } from "../../../../src/core/rendering/layout/ir.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { cells, longWordStarts } from "../../../../src/tui/documents/editing/cursor.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/source/position.ts";
import { ALPHABET, labelsFor, nearestFirst, type Target } from "../../../../src/tui/documents/navigation/labels.ts";
import { harness, makeSandbox, makeVault, rowStarting, rowText } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

const row = (text: string): Line => ({ spans: [{ text, role: "text", attrs: 0 }], src: 1 });

describe("jump labels: the labels and the targets", () => {
  test("one letter each while the alphabet is enough; then two, the shortest first, none the start of another", () => {
    expect(labelsFor(0)).toEqual([]);
    expect(labelsFor(4)).toEqual(["a", "s", "d", "f"]);
    expect(labelsFor(26)).toEqual([...ALPHABET]);
    // One more than the letters: every letter but the last alone, the last starting the two-letter ones.
    expect(labelsFor(27)).toEqual([...ALPHABET.slice(0, 25), "ma", "ms"]);
    for (const n of [27, 60, 300, 676]) {
      const ls = labelsFor(n);
      expect(ls.length).toBe(n);
      expect(new Set(ls).size).toBe(n);
      expect(ls.every((l, i) => i === 0 || l.length >= ls[i - 1]!.length)).toBe(true);
      expect(ls.filter((a) => ls.some((b) => b !== a && b.startsWith(a)))).toEqual([]);
    }
    // At most the alphabet's square: what's past it goes without.
    expect(labelsFor(700).length).toBe(26 * 26);
  });

  test("a row's targets: words of two word characters or more, each wide letter; no punctuation, letter alone, icon or emoji", () => {
    // f0 o1 o2 ,3 _4 a5 _6 b7 a8 r9 .10 b11 a12 z13 _14 中15 文17 _19 x20 _21 📝22 _24 a25 b26 _27 c28 _29 󰲡30 _31 é32 é33
    // (each é an e and a combining accent: one cell, a letter and a mark)
    const text = "foo, a bar.baz 中文 x 📝 ab_c 󰲡 éé";
    expect(longWordStarts(row(text))).toEqual([0, 7, 11, 15, 17, 25, 32]);
    expect(longWordStarts(row("   "))).toEqual([]);
    expect(longWordStarts(row("a - b, c."))).toEqual([]);
    expect(longWordStarts(undefined)).toEqual([]);
  });

  test("the nearest the cursor first, by distance on screen with a row as two columns; ties in reading order", () => {
    const at = (x: number, y: number) => ({ x, y }) as Target;
    const [a, b, c, d] = [at(10, 5), at(13, 5), at(10, 6), at(7, 5)];
    // b and d are 3 columns away, c one row (2): c first, then d and b in reading order (d was listed after b).
    expect(nearestFirst([a, b, c, d], { x: 10, y: 5 })).toEqual([a, c, b, d]);
  });
});

/** A vault with two notes, side by side: a's words and its link to b, and b's own words (`bravo`), b's window active. */
async function split(bravo = "Bravo zulu tango.") {
  const root = makeVault();
  writeFileSync(join(root, "jump-a.md"), "# Alpha\n\nAlpha words here, and quartz.\n\nSee [Bravo](jump-b.md) now.\n");
  writeFileSync(join(root, "jump-b.md"), `# Bravo\n\n${bravo}\n`);
  const h = await harness({ root, open: "jump-a.md" });
  await h.keys("ctrl+w", "v");
  h.app.open("jump-b.md");
  await h.keys();
  const [a, b] = h.app.tab!.views as [NonNullable<typeof h.app.view>, NonNullable<typeof h.app.view>];
  expect([h.app.tab!.active, a.buf.rel, b.buf.rel]).toEqual([1, "jump-a.md", "jump-b.md"]);
  return { h, a, b };
}

/** The labelled target at the start of `word` (in `view`'s note, if given), while the labels show. */
function labelTarget(h: Awaited<ReturnType<typeof harness>>, word: string, view?: unknown) {
  const t = h.app.labels.shown?.targets.find((t) => {
    if (view && t.view !== view) return false;
    const line = h.app.currentLayout(t.view).lines[t.pos.row]!;
    return line.spans
      .map((s) => s.text)
      .join("")
      .slice(t.pos.col)
      .startsWith(word);
  });
  if (!t) throw new Error(`no label on ${word}`);
  return t;
}

/** The label of the target at the start of `word` in `view`'s note. */
const labelOf = (h: Awaited<ReturnType<typeof harness>>, view: unknown, word: string) =>
  labelTarget(h, word, view).label;

describe("jump labels: s and g w", () => {
  test("s labels both windows of a split; a label typed moves the cursor there and focuses its window", async () => {
    const { h, a, b } = await split();
    await h.keys("w", "s"); // the cursor from the heading's icon onto its word
    const shown = h.app.labels.shown!;
    expect(shown.targets.some((t) => t.view === a)).toBe(true);
    expect(shown.targets.some((t) => t.view === b)).toBe(true);
    // Never the cursor's own place, a word start though it is.
    expect(longWordStarts(h.app.currentLayout(b).lines[b.cur.row])).toContain(b.cur.col);
    expect(shown.targets.some((t) => t.view === b && t.pos.row === b.cur.row && t.pos.col === b.cur.col)).toBe(false);
    // The link is a target of its own, its index in the layout's links.
    expect(shown.targets.some((t) => t.view === a && t.link !== undefined)).toBe(true);
    // The nearest the cursor (on b's first row) the shortest: b's own words have one letter.
    expect(labelOf(h, b, "zulu").length).toBe(1);
    expect(h.frame().split("\n").at(-1)).toContain("JUMP");
    // In b, its own window: there.
    await h.keys(...labelOf(h, b, "tango"));
    expect(h.app.labels.shown).toBeNull();
    expect(h.app.tab!.active).toBe(1);
    expect(b.cur).toEqual({ row: rowStarting(h, "Bravo zulu"), col: "Bravo zulu ".length });
    // In a, the other window: focused, the cursor there.
    await h.keys("s");
    await h.keys(...labelOf(h, a, "quartz"));
    expect(h.app.tab!.active).toBe(0);
    expect(h.app.view).toBe(a);
    expect(a.cur).toEqual({ row: rowStarting(h, "Alpha words"), col: "Alpha words here, and ".length });
    expect(h.frame().split("\n").at(-1)).not.toContain("JUMP");
  });

  test("the labels are drawn over their targets' first cells; a first letter typed leaves those it starts", async () => {
    // Enough targets for two letters: b's words, many times over.
    const { h } = await split("zulu tango ".repeat(60));
    await h.keys("s");
    const targets = h.app.labels.shown!.targets;
    const two = targets.find((t) => t.label.length === 2)!;
    expect(two).toBeDefined();
    let c = h.canvas();
    const role = h.app.theme.roles.jump_label;
    for (const t of [targets[0]!, two]) {
      expect(c.line(t.y).slice(t.x, t.x + t.label.length)).toBe(t.label);
      expect(c.styles[t.y]![t.x]!.bg).toBe(role.bg!);
    }
    await h.keys(two.label[0]!);
    c = h.canvas();
    // The second letter where the label was; the single letters gone.
    expect(c.line(two.y)[two.x]).toBe(two.label[1]!);
    const one = targets[0]!;
    expect(c.styles[one.y]![one.x]?.bg).not.toBe(role.bg!);
    await h.keys("escape");
  });

  test("a label over a wide character covers it whole", async () => {
    const root = makeVault();
    writeFileSync(join(root, "jump-wide.md"), "Plain 中文 words.\n");
    const h = await harness({ root, open: "jump-wide.md" });
    await h.keys("s");
    const t = labelTarget(h, "中");
    const c = h.canvas();
    expect(t.label.length).toBe(1);
    expect(c.line(t.y).slice(t.x, t.x + 2)).toBe(`${t.label} `);
    expect(c.styles[t.y]![t.x + 1]!.bg).toBe(h.app.theme.roles.jump_label.bg!);
    await h.keys("escape");
  });

  test("horizontally scrolled code labels only visible text, in its drawn cells and layout columns", async () => {
    const root = makeVault();
    const text = `start hidden 中 visible ${"tail ".repeat(30)}`;
    writeFileSync(join(root, "jump-scroll.md"), `# Scroll\n\n\`\`\`text\n${text}\n\`\`\`\n`);
    const h = await harness({
      root,
      open: "jump-scroll.md",
      width: 70,
      config: (c) => (c.ui.sidebar = false),
    });
    const v = h.app.view!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.findIndex((l) => l.scroll && l.spans.some((s) => s.text.includes("hidden")));
    expect(row).toBeGreaterThanOrEqual(0);
    const s = layout.lines[row]!.scroll!;
    expect(s.x).toBeGreaterThan(0);
    const hidden = s.x + stringWidth("start ");
    const visible = s.x + stringWidth("start hidden 中 ");
    const off = hidden - s.x + 1;
    h.app.code.setOffset(v, layout, row, off);
    await h.keys("s");
    const targets = h.app.labels.shown!.targets.filter((t) => t.pos.row === row);
    // The hidden word would otherwise be labelled in the code block's fixed gutter.
    expect(hidden - off).toBe(s.x - 1);
    expect(targets.some((t) => t.pos.col === hidden)).toBe(false);
    expect(targets.every((t) => t.pos.col >= s.x + off && t.pos.col < s.x + off + s.w)).toBe(true);
    const t = targets.find((t) => t.pos.col === visible)!;
    expect(t).toBeDefined();
    const pane = h.app.geometry!.panes[0]!;
    expect(t.x).toBe(pane.textX + visible - off);
    expect(
      h
        .canvas()
        .line(t.y)
        .slice(t.x, t.x + t.label.length),
    ).toBe(t.label);
    await h.keys(...t.label);
    expect(v.cur).toEqual({ row, col: visible });
    expect(h.app.cursorLine(v)).toBe(4);
    expect(cells(h.app.currentLayout(v).lines[row]).find((c) => c.x === v.cur.col)?.g).toBe("v");
  });

  test("horizontally scrolled SOURCE labels subtract the window offset and keep the target column", async () => {
    const root = makeVault();
    const text = `${"before ".repeat(20)}中 visible after`;
    writeFileSync(join(root, "jump-source-scroll.md"), `${text}\n`);
    const h = await harness({
      root,
      open: "jump-source-scroll.md",
      width: 70,
      config: (c) => ((c.ui.sidebar = false), (c.ui.wrap = false)),
    });
    await h.app.run("view.mode_source");
    await h.keys("$");
    const v = h.app.view!;
    expect(v.left).toBeGreaterThan(0);
    const visible = stringWidth(text.slice(0, text.indexOf("visible")));
    await h.keys("g", "w");
    const t = h.app.labels.shown!.targets.find((t) => t.pos.col === visible)!;
    expect(t).toBeDefined();
    const pane = h.app.geometry!.panes[0]!;
    expect(t.x).toBe(pane.textX + visible - v.left);
    expect(
      h
        .canvas()
        .line(t.y)
        .slice(t.x, t.x + t.label.length),
    ).toBe(t.label);
    await h.keys(...t.label);
    expect(v.cur).toEqual({ row: 0, col: visible });
    expect(v.buf.source.slice(offsetOf(h.app, v))).toStartWith("visible");
  });

  test("esc, or a key no label goes on with, leaves everything as it was: the cursor, the window, the text", async () => {
    const { h, a, b } = await split();
    await h.keys("ctrl+k"); // b in SOURCE view: x deletes a character there
    const before = { cur: { ...b.cur }, text: b.buf.source, active: h.app.tab!.active };
    const left = { ...a.cur };
    for (const k of ["escape", "x", "shift+a", "enter"]) {
      await h.keys("g", "w");
      expect(h.app.labels.shown).not.toBeNull();
      // x and the rest are no label's start here: few targets, single letters from the alphabet's start.
      expect(h.app.labels.shown!.targets.some((t) => t.label.startsWith(k))).toBe(false);
      await h.keys(k);
      expect(h.app.labels.shown).toBeNull();
      expect({ cur: b.cur, text: b.buf.source, active: h.app.tab!.active }).toEqual(before);
      expect(b.insert).toBeFalsy();
    }
    expect(a.cur).toEqual(left);
  });

  test("in SOURCE view s stays substitute and g w labels; after an operator g w is no motion", async () => {
    const { h, b } = await split();
    await h.keys("ctrl+k");
    expect(b.source).toBe(true);
    await h.keys("g", "w");
    expect(h.app.labels.shown).not.toBeNull();
    await h.keys("escape");
    const text = b.buf.source;
    await h.keys("d", "g", "w");
    expect(h.app.labels.shown).toBeNull();
    expect(b.buf.source).toBe(text);
    expect(h.app.messages.at(-1)?.text).toBe("d doesn't take g w");
    await h.keys("s");
    expect(h.app.labels.shown).toBeNull();
    expect(b.insert).toBe(true);
  });

  test("in the lens, whose keys are SOURCE view's: g w labels its rows and the rendered ones around it; s substitutes", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "jump-lens.md"),
      "# One\n\nFirst paragraph here.\n\n## Two\n\nSecond paragraph there.\n\n- a list item\n- another one\n\n## Three\n\nThird paragraph, last.\n",
    );
    const h = await harness({ root, open: "jump-lens.md" });
    await h.app.run("view.live");
    await h.keys();
    const v = h.app.view!;
    expect(v.live).toBe(true);
    await h.keys("g", "w");
    const lines = h.app.currentLayout(v).lines;
    const targets = h.app.labels.shown!.targets;
    expect(targets.some((t) => lines[t.pos.row]!.lens === "source")).toBe(true);
    expect(targets.some((t) => lines[t.pos.row]!.lens === undefined)).toBe(true);
    // Never its rules: they're no text of the note.
    expect(targets.filter((t) => lines[t.pos.row]!.decor)).toEqual([]);
    // A rendered row outside the lens: the cursor there, the lens with it.
    await h.keys(...labelOf(h, v, "Third"));
    expect(v.live).toBe(true);
    expect(rowText(h)).toContain("Third paragraph");
    await h.keys("s");
    expect(h.app.labels.shown).toBeNull();
    expect(v.insert).toBe(true);
  });

  test("on a link, enter then follows it", async () => {
    const { h, a } = await split();
    await h.keys("s");
    const link = h.app.labels.shown!.targets.find((t) => t.view === a && t.link !== undefined)!;
    await h.keys(...link.label);
    expect(h.app.view).toBe(a);
    expect(h.app.linking.linkUnderCursor(a)).toBe(link.link!);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("jump-b.md");
  });

  test("in visual mode only the cursor's window is labelled, and a label extends the selection", async () => {
    const { h, b } = await split();
    const start = { ...b.cur };
    await h.keys("v", "s");
    expect(h.app.labels.shown!.targets.every((t) => t.view === b)).toBe(true);
    // The status line says so, beside VISUAL, as it does beside NORMAL.
    const status = h.frame().split("\n").at(-1)!;
    expect(status).toContain("VISUAL");
    expect(status).toContain("JUMP");
    await h.keys(...labelOf(h, b, "tango"));
    expect(b.visual).toBe("char");
    expect(b.sel?.anchor).toEqual(start);
    expect(b.cur).toEqual({ row: rowStarting(h, "Bravo zulu"), col: "Bravo zulu ".length });
    expect(h.frame().split("\n").at(-1)).not.toContain("JUMP");
    await h.keys("escape", "shift+v", "s");
    expect(h.frame().split("\n").at(-1)).toContain("JUMP");
  });

  test("a mouse press puts the labels away: the next key is the note's again", async () => {
    const { h } = await split();
    await h.keys("s");
    const pane = h.app.geometry!.panes[0]!;
    h.app.mouse.handle({ type: "down", x: pane.textX, y: pane.y, button: 0 });
    expect(h.app.labels.shown).toBeNull();
  });

  test("a wheel puts the labels away too: none left on a row scrolled out of sight", async () => {
    const { h } = await split("zulu tango\n\n".repeat(40));
    await h.keys("s");
    expect(h.app.labels.shown).not.toBeNull();
    const pane = h.app.geometry!.panes[1]!;
    const scroll = { direction: "down" as const, delta: 1 };
    h.app.mouse.handle({ type: "scroll", x: pane.x + 2, y: pane.y + 2, button: 0, scroll });
    expect(h.app.labels.shown).toBeNull();
    expect(h.frame().split("\n").at(-1)).not.toContain("JUMP");
  });

  test("only words of two letters or more, each CJK character and every link get a label (EG-D24)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "jump-words.md"), "# Heading here\n\nA b — cd, ef. x_y 中 📝 see [a](jump-words.md).\n");
    const h = await harness({ root, open: "jump-words.md" });
    await h.keys("shift+g"); // the cursor on "A", no target of its own
    await h.keys("s");
    const v = h.app.view!;
    const lines = h.app.currentLayout(v).lines;
    const targets = [...h.app.labels.shown!.targets].sort((p, q) => p.pos.row - q.pos.row || p.pos.col - q.pos.col);
    const at = (t: Target) =>
      cells(lines[t.pos.row])
        .filter((c) => c.x >= t.pos.col)
        .map((c) => c.g)
        .join("")
        .match(/^(?:[\p{L}\p{N}_\p{M}]+|\S)/u)?.[0];
    expect(targets.filter((t) => t.link === undefined).map(at)).toEqual([
      "Heading",
      "here",
      "cd",
      "ef",
      "x_y",
      "中",
      "see",
    ]);
    // The link of one letter has its label all the same.
    expect(targets.filter((t) => t.link !== undefined).map(at)).toEqual(["a"]);
    await h.keys("escape");
  });

  test("nothing on screen to label: said so, no labels", async () => {
    const root = makeVault();
    writeFileSync(join(root, "jump-empty.md"), "\n");
    const h = await harness({ root, open: "jump-empty.md" });
    await h.keys("s");
    expect(h.app.labels.shown).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("nothing on screen to jump to");
  });
});
