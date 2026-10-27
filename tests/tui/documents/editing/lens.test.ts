import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Config, DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, lineText, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the lens (live preview: space n l, i/a/o with edit_in = live)", () => {
  // Twenty short paragraphs: blocks of two lines (the paragraph and the blank after it).
  const note = `# Title\n\n${Array.from({ length: 20 }, (_, i) => `Para ${i + 1} with **bold**.`).join("\n\n")}\n`;
  const setup = async (config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 30, config });
    const v = h.app.view!;
    const L = () => h.app.currentLayout(v);
    const rows = () => L().lines.map((l) => lineText(l).trimEnd());
    const goto = (text: string) => {
      h.app.moveCursor(v, { row: rows().findIndex((t) => t.includes(text)), col: 0 });
      h.frame();
    };
    const lens = () => {
      const lines = L().lines;
      const top = lines.findIndex((l) => l.lens === "top");
      const bottom = lines.findIndex((l) => l.lens === "bottom");
      return { top, bottom, source: lines.slice(top + 1, bottom).map(lineText) };
    };
    return { h, v, rows, goto, lens, L };
  };
  test("the ⇄ button opens and closes the replace row, while typing or after the search", async () => {
    const root = makeVault();
    writeFileSync(join(root, "b.md"), "cat dog cat\n");
    const h = await harness({ root, open: "b.md", width: 100, height: 30 });
    const click = () => {
      h.frame();
      const b = h.app.geometry!.hot.find((r) => r.id === "findopt:replace:0")!;
      h.app.mouse.handle({ type: "down", x: b.x + 1, y: b.y, button: 0 });
      h.app.mouse.handle({ type: "up", x: b.x + 1, y: b.y, button: 0 });
    };
    const rep = () => (h.app.overlay as { replace?: { focus: boolean } } | null)?.replace;
    await h.keys("/", "c", "a", "t");
    click();
    expect(rep()?.focus).toBe(true);
    expect(h.frame()).toContain("⇄ ");
    click();
    expect(rep()).toBeUndefined();
    expect(h.app.overlay?.kind).toBe("prompt"); // still finding
    await h.keys("enter");
    click(); // the search done, its row still there
    await Bun.sleep(5); // the click runs find.replace, asynchronously
    expect(rep()?.focus).toBe(true);
    expect((h.app.overlay as { text: string }).text).toBe("cat");
    // alt+h does what ⇄ does: closes the row, opens it again.
    await h.keys("alt+h");
    expect(rep()).toBeUndefined();
    await h.keys("alt+h");
    expect(rep()?.focus).toBe(true);
    await h.keys("escape");
  });
  test("a paste goes into the field being typed in: the replace field when it has focus; none while confirming", async () => {
    const root = makeVault();
    writeFileSync(join(root, "b.md"), "cat dog cat\n");
    const h = await harness({ root, open: "b.md", width: 100, height: 30 });
    const o = () => h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
    await h.app.run("find.replace");
    await h.keys(..."cat", "tab");
    expect(o().replace?.focus).toBe(true);
    await h.app.input.paste("NEW");
    expect(o().replace!.text).toBe("NEW");
    expect(o().text).toBe("cat");
    await h.keys("shift+tab");
    await h.app.input.paste("s");
    expect(o().text).toBe("cats");
    expect(o().replace!.text).toBe("NEW");
    await h.keys("escape");
    // Confirming each match (:s///c): a paste is no answer, and changes nothing.
    await h.keys(":", ..."%s/cat/X/gc", "enter");
    expect(o().replace?.confirm).toBeTruthy();
    await h.app.input.paste("y");
    expect(o().text).toBe("cat");
    expect(o().replace!.text).toBe("X");
    expect(h.app.view!.buf.source).toBe("cat dog cat\n");
  });
  test("an operator with a jump in the lens acts from the cursor: dG, yG, >G", async () => {
    const { h, v, goto } = await setup((c) => (c.editor.edit_in = "live"));
    goto("Para 5 with");
    await h.keys("space", "n", "l");
    await h.keys("d", "G");
    expect(v.buf.source).toContain("Para 4 with"); // above the cursor: kept
    expect(v.buf.source).not.toContain("Para 5 with"); // from the cursor down: gone
    expect(v.buf.source).not.toContain("Para 20 with");
    await h.keys("u");
    goto("Para 5 with");
    await h.keys(">", "G");
    expect(v.buf.source).toContain("\nPara 4 with"); // not indented
    expect(v.buf.source).toContain("  Para 5 with");
  });
  test("replace in the lens: enter replaces the match at the cursor and moves one on", async () => {
    const { h, v } = await setup((c) => (c.editor.edit_in = "live"));
    await h.keys("space", "f", "r", ...[..."para"], "tab", ...[..."P"]);
    const o = h.app.overlay as { replace?: { current: number; total: number } };
    expect(v.live).toBe(true);
    expect(o.replace!.total).toBe(20);
    for (let i = 1; i <= 3; i++) {
      await h.keys("enter");
      h.frame();
      expect(v.buf.source.split("P ").length - 1).toBe(i);
      expect(o.replace).toMatchObject({ current: 0, total: 20 - i }); // the next one is the first left
    }
    // A replacement that still matches: the count stays, the cursor moves on past it.
    await h.keys("ctrl+u", ...[..."PARA"]);
    for (let i = 1; i <= 3; i++) {
      await h.keys("enter");
      h.frame();
      expect(v.buf.source.split("PARA ").length - 1).toBe(i);
      expect(o.replace).toMatchObject({ current: i, total: 17 });
    }
    await h.keys("escape");
  });
  test("space n l opens it on the cursor's block, between two rules, grown to at least 6 rows", async () => {
    const { h, v, rows, goto, lens } = await setup((c) => (c.ui.lines = "light"));
    goto("Para 5 with");
    await h.keys("space", "n", "l");
    expect(v.live).toBe(true);
    expect(statusRow(h.frame())).toContain("LENS");
    const l = lens();
    expect(l.top).toBeGreaterThan(0);
    expect(rows()[l.top]).toContain("source · lines");
    expect(rows()[l.top]).toMatch(/^━━ source/); // heavy, even with light frame lines
    expect(rows()[l.bottom]).toMatch(/^━+$/);
    // One blank row of air outside each rule, never two: above, the render's own gap; below, one
    // added (a frame row the cursor never takes).
    const lines = h.app.currentLayout(v).lines;
    expect(rows()[l.top - 1]).toBe("");
    expect(rows()[l.top - 2]).not.toBe("");
    expect(rows()[l.bottom + 1]).toBe("");
    expect(lines[l.bottom + 1]!.lens).toBe("pad");
    expect(rows()[l.bottom + 2]).not.toBe("");
    // Drawn in the lens role: the accent, bold.
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const cell = c.styles[pane.y + l.top - v.top]![pane.textX]!;
    expect(cell.fg).toBe(h.app.theme.roles.lens.fg!);
    expect(cell.bold).toBe(true);
    // Its rows of markdown are tinted (off the cursor's row, which has its own band).
    const tinted = [...Array(l.bottom - l.top - 1).keys()].map((k) => l.top + 1 + k).find((r) => r !== v.cur.row)!;
    expect(c.styles[pane.y + tinted - v.top]![pane.textX]!.bg).toBe(h.app.theme.roles.lens_band.bg!);
    expect(l.source).toContain("Para 5 with **bold**."); // the markdown
    expect(l.source.length).toBeGreaterThanOrEqual(6); // neighbours pulled in
    expect(rows().some((t) => t.includes("Para 15 with bold."))).toBe(true); // rendered further off
    // The cursor is in it, never on a rule.
    expect(v.cur.row).toBeGreaterThan(l.top);
    expect(v.cur.row).toBeLessThan(l.bottom);
    // Walking through, the cursor never lands on a rule or the air around it.
    for (let k = 0; k < 20; k++) {
      await h.keys("j");
      expect(h.app.currentLayout(v).lines[v.cur.row]!.decor).toBeFalsy();
    }
  });
  test("moving past its edge brings the next block in; the lens keeps its place on screen", async () => {
    const { h, v, goto, lens } = await setup();
    goto("Para 3 with");
    await h.keys("space", "n", "l");
    h.frame();
    const screen = lens().top - v.top;
    const before = lens().source.length;
    for (let k = 0; k < 12; k++) await h.keys("j");
    h.frame();
    const l = lens();
    expect(v.cur.row).toBeGreaterThan(l.top);
    expect(v.cur.row).toBeLessThan(l.bottom);
    expect(l.top - v.top).toBe(screen); // the page moved under it
    expect(l.source.length).toBeGreaterThanOrEqual(before);
    expect(l.source.length).toBeLessThanOrEqual(Math.floor(v.height * 0.5) + 2); // the maximum
    // A jump: the lens goes to where the cursor lands.
    await h.keys("shift+g");
    h.frame();
    expect(lens().source.join("\n")).toContain("Para 20 with **bold**.");
  });
  test("i from the render (edit_in = live) opens it, as written; i again types — esc esc leaves as it came: typing, then it", async () => {
    const { h, v, goto, lens, rows } = await setup((c) => (c.editor.edit_in = "live"));
    goto("Para 7 with");
    await h.keys("i");
    expect(v.live).toBe(true);
    expect(v.insert).toBeFalsy();
    expect(h.app.messages.some((m) => m.text.startsWith("the lens:"))).toBe(false);
    expect(rows()[lens().top]).toContain("source · lines");
    await h.keys("i");
    expect(v.insert).toBe(true);
    expect(rows()[lens().top]).toContain("editing · lines");
    await h.keys("escape");
    expect(v.live).toBe(true); // normal mode, still open
    expect(statusRow(h.frame())).toContain("LENS");
    await h.keys("escape");
    expect(v.live).toBe(false);
    expect(lens().top).toBe(-1);
  });
  test("by default i, a and o open it, never source mode; the key again edits, and esc esc leaves the render as it was", async () => {
    for (const key of ["i", "a", "o"]) {
      const { h, v, goto, lens } = await setup((c) => (c.editor.edit_in = DEFAULT_CONFIG.editor.edit_in));
      goto("Para 7 with");
      await h.keys(key);
      expect(v.live).toBe(true);
      expect(v.source).toBeFalsy();
      expect(v.insert).toBeFalsy();
      expect(lens().source.join("\n")).toContain("Para 7 with **bold**.");
      await h.keys(key);
      expect(v.insert).toBe(true);
      expect(v.source).toBeFalsy();
      await h.keys("escape", "escape");
      expect(v.live).toBe(false);
      expect(v.source).toBeFalsy();
    }
  });
  test("its counters: each row's distance from the cursor's (0) in a column of its own, the lens's accent; the gutter its lines' numbers; relative_numbers = off: none", async () => {
    for (const relative of ["lens", "both", "off"] as const) {
      const { h, v, goto, lens } = await setup((c) => ((c.ui.line_numbers = true), (c.ui.relative_numbers = relative)));
      goto("Para 7 with");
      await h.keys("space", "n", "l", "j");
      const c = h.canvas();
      const pane = h.app.geometry!.panes[0]!;
      const screen = (row: number) => c.line(pane.y + row - v.top);
      const gutter = (row: number) => screen(row).slice(pane.x, pane.textX).trim();
      const counter = (row: number) => screen(row).slice(pane.textX, pane.textX + 4);
      const l = lens();
      const inside = [...Array(l.bottom - l.top - 1).keys()].map((k) => l.top + 1 + k);
      const layout = h.app.currentLayout(v);
      const para = inside.find((r) => lineText(layout.lines[r]!).startsWith("Para 7"))!;
      // The gutter: the lines' own numbers, in the lens too.
      expect(gutter(para)).toBe(String(layout.lines[para]!.src));
      if (relative === "lens" || relative === "both") {
        expect(inside.map(counter)).toEqual(inside.map((r) => `${String(Math.abs(r - v.cur.row)).padStart(3)} `));
        expect(screen(para).slice(pane.textX + 4)).toMatch(/^Para 7 with \*\*bold\*\*\./); // its text after them
        const near = inside.find((r) => r !== v.cur.row)!;
        expect(c.styles[pane.y + near - v.top]![pane.textX + 2]!).toMatchObject({
          fg: h.app.theme.roles.lens.fg,
          bold: false,
        });
        expect(c.styles[pane.y + v.cur.row - v.top]![pane.textX + 2]!.fg).toBe(
          h.app.theme.roles.line_number_current.fg!,
        );
        // The cursor never on them: to the row's start, and it lands on its text.
        h.app.moveCursor(v, { row: para, col: 0 });
        expect([v.cur.row, v.cur.col]).toEqual([para, 4]);
        // An empty line's row: one stop, where its text would be.
        const empty = inside.find((r) => !lineText(layout.lines[r]!).trim())!;
        h.app.moveCursor(v, { row: empty, col: 0 });
        expect([v.cur.row, v.cur.col]).toEqual([empty, 4]);
      } else expect(screen(para).slice(pane.textX)).toMatch(/^Para 7 with \*\*bold\*\*\./); // no column for them
    }
    // An indented line keeps its first space a stop of its own (the counters map to no offset); a drag from the counters'
    // column selects from the line's start.
    const root = makeVault();
    writeFileSync(join(root, "i.md"), "# I\n\n- one\n  - nested item\n");
    const h = await harness({ root, open: "i.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("space", "n", "l");
    const layout = h.app.currentLayout(v);
    const nested = layout.lines.findIndex((l) => lineText(l).startsWith("  - nested"));
    h.app.moveCursor(v, { row: nested, col: 0 });
    expect([v.cur.col, h.app.view!.buf.source.slice(offsetOf(h.app, v), offsetOf(h.app, v) + 4)]).toEqual([4, "  - "]);
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const y = pane.y + nested - v.top;
    h.app.mouse.handle({ type: "down", x: pane.textX, y, button: 0 });
    h.app.mouse.handle({ type: "drag", x: pane.textX + 8, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 8, y, button: 0 });
    expect(h.copied.at(-1)).toBe("  - n");
  });
  test("it opens on the cursor's innermost section whole when it fits, and moves to the next whole; one too tall, its blocks", async () => {
    const beta = Array.from({ length: 20 }, (_, i) => `Beta ${i + 1}.`).join("\n\n");
    const text = `# Doc\n\nIntro paragraph.\n\n## Alpha\n\nAlpha one.\n\n### Alpha.1\n\nSub one.\n\nSub two.\n\n### Alpha.2\n\nSub three.\n\n## Beta\n\n${beta}\n`;
    const root = makeVault();
    writeFileSync(join(root, "s.md"), text);
    const h = await harness({ root, open: "s.md", width: 100, height: 40 });
    const v = h.app.view!;
    const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.[1] ?? "none";
    const open = async (line: number) => {
      await h.keys("escape", "escape");
      h.app.placeAtLine(v, line);
      await h.keys("space", "n", "l");
      return lens();
    };
    expect(await open(11)).toBe("9–14"); // in a subsection: it, heading to its end
    expect(await open(7)).toBe("5–18"); // in a section's own text: the section, its subsections with it
    // Past its edge: the next section, whole.
    await open(13);
    await h.keys("j", "j");
    expect(lens()).toBe("15–18");
    // A section too tall for the lens's most (lens_max): its blocks, as before — the cursor's and its neighbours.
    const tall = await open(25);
    const [from, to] = tall.split("–").map(Number);
    expect(from! > 19 && from! <= 25 && to! >= 25 && to! < 60).toBe(true);
    // A size set by hand is the lens's: + takes a block more, whatever the section; past its edge it slides at that size.
    await open(11);
    await h.keys("+");
    expect(lens()).toBe("9–16");
    for (let k = 0; k < 6; k++) await h.keys("j");
    expect(lens()).toBe("11–18");
    // …and opened again by a change from elsewhere: at that size, around the cursor, not its section.
    v.buf.edit(v.buf.source.length - 1, 0, " end");
    expect(lens()).toBe("15–22"); // its eight rows round the cursor's block, not the section's 15–18
  });
  test("an edit that doesn't type (a line moved, x from the palette) opens it first too; its second press edits", async () => {
    const { h, v, goto } = await setup((c) => (c.editor.edit_in = "live"));
    for (const edit of [() => h.keys("alt+shift+down"), () => h.app.run("edit.delete_char")]) {
      goto("Para 7 with");
      const before = v.buf.source;
      await edit();
      expect(v.live).toBe(true);
      expect(v.buf.source).toBe(before); // opened, nothing edited
      await edit();
      expect(v.buf.source).not.toBe(before);
      await h.keys("u", "escape");
      expect(v.live).toBe(false);
    }
    // A yank isn't an edit: it goes on at once, waiting for its motion.
    goto("Para 7 with");
    await h.app.run("edit.op_yank");
    expect([v.live, h.app.vim.op?.op]).toEqual([true, "y"]);
  });
  test("typing in it doesn't re-parse; what's after shifts; closing renders the edit", async () => {
    const { h, v, goto, rows } = await setup();
    goto("Para 2 with");
    await h.keys("space", "n", "l", "shift+a", "enter");
    const rendered = v.liveBase!.renderedVersion;
    for (const ch of "New *line*.") await h.keys(ch === " " ? "space" : ch);
    expect(v.liveBase!.renderedVersion).toBe(rendered); // the render around it reused
    expect(rows()).toContain("New *line*.");
    const last = h.app.currentLayout(v).lines.find((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("Para 20 with"),
    )!;
    expect(last.src).toBe(42); // renumbered: one line further down
    await h.keys("escape", "escape");
    expect(rows().some((t) => t.includes("New line."))).toBe(true);
    expect(v.buf.source).toContain("Para 2 with **bold**.\nNew *line*.\n");
  });
  test("a block taller than half the window scrolls inside the lens; the prose around stays in sight", async () => {
    const code = Array.from({ length: 60 }, (_, i) => `line ${i + 1} of code`).join("\n");
    const root = makeVault();
    writeFileSync(
      join(root, "big.md"),
      `# Big\n\nIntro paragraph before.\n\n\`\`\`\n${code}\n\`\`\`\n\nOutro paragraph after.\n`,
    );
    const h = await harness({ root, open: "big.md", width: 100, height: 40 });
    const v = h.app.view!;
    const text = (r: number) =>
      h.app
        .currentLayout(v)
        .lines[r]!.spans.map((x) => x.text)
        .join("");
    h.app.moveCursor(v, {
      row: h.app.currentLayout(v).lines.findIndex((l) =>
        l.spans
          .map((x) => x.text)
          .join("")
          .includes("line 1 of code"),
      ),
      col: 0,
    });
    await h.keys("space", "n", "l");
    const f = () => h.frame().split("\n");
    let frame = f();
    const max = h.app.lens.rows(v);
    const L = h.app.currentLayout(v);
    const shown = h.app.lens.screenRows(v, L).filter((r) => L.lines[r]!.lens === "source");
    expect(shown.length).toBe(max); // the lens is capped
    expect(frame.join("\n")).toContain("Intro paragraph before."); // the prose above is still there
    expect(frame.join("\n")).toMatch(/↓ \d+ lines/); // what's below the window, counted on the rule
    // Moving down inside: the lens scrolls; the cursor stays in sight; the rule counts both ways.
    for (let k = 0; k < 30; k++) await h.keys("j");
    frame = f();
    expect(text(v.cur.row)).toContain("of code");
    expect(h.app.lens.screenRows(v, h.app.currentLayout(v))).toContain(v.cur.row);
    expect(frame.join("\n")).toMatch(/↑ \d+ lines/);
    expect(frame.join("\n")).toMatch(/↓ \d+ lines/);
    expect(frame.join("\n")).toContain("Intro paragraph before.");
    // A click on a row inside lands on that row.
    const pane = h.app.geometry!.panes[0]!;
    const rows = h.app.lens.screenRows(v, h.app.currentLayout(v));
    const i = rows.findIndex((r) => h.app.currentLayout(v).lines[r]!.lens === "source") + 3;
    h.app.mouse.handle({ type: "down", x: pane.textX + 2, y: pane.y + i, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 2, y: pane.y + i, button: 0 });
    expect(v.cur.row).toBe(rows[i]!);
    // The wheel over it scrolls inside first.
    const before = v.lensInner;
    h.app.mouse.handle({
      type: "scroll",
      x: pane.textX + 2,
      y: pane.y + i,
      button: 0,
      scroll: { direction: "down", delta: 1 },
    });
    expect(v.lensInner ?? 0).toBeGreaterThan(before ?? 0);
    // …and the cursor comes along: never on a row the lens now hides, so dd deletes what's seen.
    for (let k = 0; k < 6; k++)
      h.app.mouse.handle({
        type: "scroll",
        x: pane.textX + 2,
        y: pane.y + i,
        button: 0,
        scroll: { direction: "down", delta: 1 },
      });
    expect(h.app.lens.screenRows(v, h.app.currentLayout(v))).toContain(v.cur.row);
    const seen = text(v.cur.row);
    await h.keys("d", "d");
    expect(v.buf.source).not.toContain(`${seen.trim()}\n`);
  });
  test("growing to its minimum never swallows a neighbour too big for it", async () => {
    const code = Array.from({ length: 80 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n");
    const root = makeVault();
    writeFileSync(
      join(root, "big.md"),
      `# Long snippet\n\nSome prose before.\n\n\`\`\`ts\n${code}\n\`\`\`\n\nProse after.\n`,
    );
    const h = await harness({ root, open: "big.md", width: 150, height: 60 });
    const v = h.app.view!;
    await h.keys("g", "g", "space", "n", "l");
    expect(v.liveBase!.active).toEqual([1, 4]); // the heading and the prose, not the 83-line block
    for (let k = 0; k < 30; k++) await h.keys("j");
    h.frame();
    expect(v.liveBase!.active).toEqual([5, 87]); // into the block: the lens is that block, scrolled
    expect(h.app.lens.hidden(v, h.app.currentLayout(v)).length).toBeGreaterThan(0);
  });
  test("clicking around: each clicked line stays under the pointer as the lens moves to it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 40 });
    const v = h.app.view!;
    await h.keys("space", "n", "l");
    const rows = () => h.app.currentLayout(v).lines.map((l) => lineText(l).trimEnd());
    for (const want of [8, 3, 12, 11, 5, 9]) {
      h.frame();
      const pane = h.app.geometry!.panes[0]!;
      const target = rows().findIndex(
        (t, i) =>
          i >= v.top &&
          i < v.top + v.height &&
          (t === `Para ${want} with bold.` || t === `Para ${want} with **bold**.`),
      );
      expect(target).toBeGreaterThanOrEqual(0); // still on screen: the page didn't jump away
      const screen = target - v.top;
      h.app.mouse.handle({ type: "down", x: pane.textX + 3, y: pane.y + screen, button: 0 });
      h.app.mouse.handle({ type: "up", x: pane.textX + 3, y: pane.y + screen, button: 0 });
      h.frame();
      expect(rows()[v.cur.row]).toBe(`Para ${want} with **bold**.`);
      // Exactly where it was clicked — except inside the scrolloff margin at an edge, where the
      // view scrolls just enough to keep the margin, as a click there does in reading too.
      // (At the note's top or end the page can't scroll further: there it moves only as far as it must.)
      const so = Math.min(3, Math.floor((v.height - 1) / 2));
      const want0 = Math.max(so, Math.min(v.height - 1 - so, screen));
      const maxTop = Math.max(0, h.app.currentLayout(v).lines.length - v.height);
      const top = Math.max(0, Math.min(maxTop, v.cur.row - want0));
      expect(v.top).toBe(top);
    }
  });
  test("a click in the render outside it moves the lens there", async () => {
    const { h, v, goto, lens, rows } = await setup();
    goto("Para 2 with");
    await h.keys("space", "n", "l");
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    // The lowest rendered paragraph on screen.
    let target = -1;
    rows().forEach((t, i) => {
      if (i >= v.top && i < v.top + v.height && i > lens().bottom && /Para \d+ with bold\./.test(t)) target = i;
    });
    const which = /Para (\d+)/.exec(rows()[target]!)![1];
    const y = pane.y + target - v.top;
    h.app.mouse.handle({ type: "down", x: pane.textX + 2, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 2, y, button: 0 });
    h.frame();
    expect(v.live).toBe(true);
    expect(lens().source.join("\n")).toContain(`Para ${which} with **bold**.`);
    expect(h.app.cursorLine(v)).toBe(1 + 2 * Number(which));
  });
  test("a link followed from the lens opens the lens on the new note, and typing lands where it's drawn", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.md"), "# Alpha\n\nSee [b](b.md) here.\n\nAAAA text of alpha.\n");
    writeFileSync(join(root, "b.md"), "# Beta\n\nBBBB beta.\n\nMore beta.\n");
    const h = await harness({ root, open: "a.md", width: 100, height: 30 });
    const v = h.app.view!;
    const rows = () => h.app.currentLayout(v).lines.map((l) => lineText(l).trimEnd());
    await h.keys("space", "n", "l");
    const see = rows().findIndex((t) => t.includes("See [b]"));
    h.app.moveCursor(v, { row: see, col: (h.app.currentLayout(v).lines[see]!.text?.[0] ?? 0) + 6 }); // on the link, past the counters
    h.frame();
    await h.keys("enter");
    expect(v.buf.rel).toBe("b.md");
    expect(v.live).toBe(true);
    expect(rows().join("\n")).not.toContain("AAAA");
    expect(rows().join("\n")).toContain("More beta.");
    // Typing on the row drawn as "More beta." changes that line of b.md.
    h.app.moveCursor(v, { row: rows().findIndex((t) => t.includes("More beta.")), col: 0 });
    h.frame();
    await h.keys("i", "Z", "escape");
    expect(v.buf.source).toBe("# Beta\n\nBBBB beta.\n\nZMore beta.\n");
    // Back to a.md (ctrl+o): its own text, not b's.
    await h.keys("ctrl+o");
    expect(v.buf.rel).toBe("a.md");
    expect(rows().join("\n")).not.toContain("beta");
    expect(rows().join("\n")).toContain("AAAA text of alpha.");
  });
  test("a in the render, edit_in = live from a config file: the lens, a again types after the cursor, esc esc back to the render; space n l; the status line's column the text's, not counting the counters (#26)", async () => {
    const { loadConfig } = await import("../../../../src/core/application/config/config.ts");
    const root = makeVault();
    writeFileSync(join(root, "a.md"), "# Alpha\n\nSee [b](b.md) here.\n\nAAAA text of alpha.\n");
    // The setting as a user's own file says it, read as the app reads it.
    const file = join(root, "user.toml");
    writeFileSync(file, '[editor]\n# i, a, o… from a rendered window: the lens\nedit_in = "live"\n');
    const loaded = loadConfig({ configFile: file });
    expect(loaded.warnings).toEqual([]);
    const open = (config?: (c: Config) => void) => harness({ root, open: "a.md", width: 100, height: 30, config });
    const h = await open((c) => Object.assign(c.editor, loaded.config.editor));
    const v = h.app.view!;
    const rows = () => h.app.currentLayout(v).lines.map((l) => lineText(l).trimEnd());
    const status = () => statusRow(h.frame());
    h.app.moveCursor(v, { row: rows().findIndex((t) => t.startsWith("See b here.")), col: 0 });
    expect(status()).toMatch(/ READ .* L3:1 /);
    // a: the lens on the cursor's block, not source mode; the cursor on the same character, the column the text's.
    await h.keys("a");
    expect([v.live, v.source, !!v.insert]).toEqual([true, false, false]);
    expect(status()).toMatch(/ READ·LENS .* L3:1 /);
    await h.keys("f", "b");
    expect(status()).toMatch(/ L3:6 /); // the b of [b]: its sixth column, the counters' four not counted
    // a again types after the cursor, in the note.
    await h.keys("a", "X");
    expect(v.insert).toBe(true);
    expect(status()).toMatch(/ INSERT .* L3:8 /); // after the X typed after the b
    expect(v.buf.source).toBe("# Alpha\n\nSee [bX](b.md) here.\n\nAAAA text of alpha.\n");
    expect(rows()).toContain("See [bX](b.md) here."); // drawn as typed, in the lens
    // esc leaves typing, the lens still open; esc again: the render.
    await h.keys("escape");
    expect([v.live, !!v.insert]).toEqual([true, false]);
    expect(status()).toMatch(/ READ·LENS .* L3:7 /); // back onto the X
    await h.keys("escape");
    expect([v.live, v.source]).toEqual([false, false]);
    expect(status()).toContain(" READ ");
    expect(rows()).toContain("See bX here.");
    // space n l opens it too, on the same line.
    await h.keys("space", "n", "l");
    expect(v.live).toBe(true);
    expect(status()).toMatch(/ READ·LENS .* L3:\d+ /);
    // Without the setting, the default ("source", as the manual says): a switches to source mode and types at once.
    const d = await open();
    const dv = d.app.view!;
    const see = d.app.currentLayout(dv).lines.findIndex((l) => lineText(l).startsWith("See"));
    d.app.moveCursor(dv, { row: see, col: 0 });
    await d.keys("a");
    expect([dv.source, dv.live, dv.insert]).toEqual([true, false, true]);
  });
});
