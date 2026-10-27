import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Line } from "../../../../src/core/rendering/layout/ir.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the diff window (GIT-D2)", () => {
  const code = `${Array.from({ length: 20 }, (_, i) => `const line${i + 1} = ${i + 1}; // line ${i + 1}`).join("\n")}\n`;
  /** The screen's rows. */
  const screen = (h: Harness) => h.frame().split("\n");
  /** The style of the first cell of `piece` on the screen row holding `holding` (ASCII rows). */
  const styleAt = (h: Harness, holding: string, piece: string) => {
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes(holding));
    const at = c.rows[y]!.join("").indexOf(holding);
    return c.styles[y]![c.rows[y]!.join("").indexOf(piece, at)]!;
  };
  const opened = async (now: string, width = 100) => {
    const root = makeVault();
    writeFileSync(join(root, "x.ts"), now);
    const h = await harness({ root, open: "index.md", width, height: 40 });
    h.app.git.showLineDiff(code, now, "x.ts", "x.ts: its change");
    return h;
  };

  test("in the floating window: highlighted, a changed line tinted and its changed words more; a fold opened by enter, a line gone to", async () => {
    const now = code.replace("const line2 = 2;", "const line2 = 22;");
    const h = await opened(now);
    expect(h.app.floating).toMatchObject({ kind: "diff", title: "x.ts: its change" });
    const roles = h.app.theme.roles;
    // The words that changed, on the stronger tint; the rest of the line on its own; both highlighted.
    expect(styleAt(h, "+ const line2 = 22", "22")).toMatchObject({
      bg: roles.diff_add_word.bg,
      fg: roles.syn_number.fg,
    });
    expect(styleAt(h, "+ const line2 = 22", "line2")).toMatchObject({ bg: roles.diff_add.bg });
    expect(styleAt(h, "+ const line2 = 22", "const")).toMatchObject({
      bg: roles.diff_add.bg,
      fg: roles.syn_keyword.fg,
    });
    expect(styleAt(h, "- const line2 = 2;", "2;")).toMatchObject({ bg: roles.diff_del_word.bg });
    expect(styleAt(h, "- const line2 = 2;", "-")).toMatchObject({ fg: roles.diff_del.fg, bg: roles.diff_del.bg });
    // A line both have: highlighted, never tinted.
    const same = styleAt(h, "  const line1 = 1", "const");
    expect(same.fg).toBe(roles.syn_keyword.fg!);
    expect([roles.diff_add.bg, roles.diff_del.bg]).not.toContain(same.bg ?? undefined);
    // No gutter of its own, line numbers on or not: its rows aren't a file's lines.
    h.app.ui.line_numbers = true;
    expect(screen(h).find((r) => r.includes("const line1 = 1"))).toMatch(/│ {3}const line1 = 1;/);
    // The unchanged lines after: a row saying how many. enter opens it, the cursor staying on its row.
    expect(screen(h).some((r) => r.includes("▸ 15 unchanged lines"))).toBe(true);
    await h.keys("j", "j", "j", "j", "j", "j", "j", "enter");
    expect(screen(h).some((r) => r.includes("unchanged lines"))).toBe(false);
    expect(screen(h).some((r) => r.includes("  const line20 = 20;"))).toBe(true);
    expect(statusRow(h.frame())).toMatch(/ L8:1 /);
    // enter on a line: the window closes, and the file opens at it.
    await h.keys("k", "k", "k", "k", "enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.rel).toBe("x.ts");
    expect(statusRow(h.frame())).toMatch(/ L2:\d+ /);
  });

  test("a line too long scrolls sideways, never cut with …: the cursor, a sideways wheel, shift with the wheel", async () => {
    const tail = ", then a tail long enough to go well past the right edge of the window, to its end";
    const h = await opened(code.replace("// line 18\n", `// line 18${tail}\n`), 80);
    const y = screen(h).findIndex((r) => r.includes("+ const line18 = 18;"));
    expect(screen(h)[y]).not.toContain("…");
    expect(screen(h)[y]).not.toContain("to its end");
    expect(screen(h)[y]).toMatch(/›\s*│/); // more to the right
    // The cursor on it, to its end: the rows scroll to it; to its start, back.
    await h.keys("j", "j", "j", "j", "j", "j", "$");
    expect(screen(h)[y]).toMatch(/to its end\s*│/);
    expect(screen(h)[y]).toMatch(/│ \+‹/);
    expect(screen(h).find((r) => r.includes("@@ line 18"))).toBeDefined(); // the head stays
    await h.keys("0");
    expect(screen(h)[y]).toContain("+ const line18 = 18;");
    // The wheel: sideways, or shift with it, over the rows.
    const pane = h.app.geometry!.panes.find((p) => p.view === h.app.floating!.view)!;
    const wheel = (direction: string, shift = false) =>
      h.app.mouse.handle({ type: "scroll", x: pane.textX + 10, y, button: 0, scroll: { direction, delta: 3 }, shift });
    wheel("right");
    expect(screen(h)[y]).not.toContain("+ const line18");
    expect(screen(h)[y]).toContain("‹");
    wheel("up", true);
    expect(screen(h)[y]).toContain("+ const line18 = 18;");
    wheel("down", true);
    expect(screen(h)[y]).not.toContain("+ const line18");
  });

  test("the wheel over the floating window scrolls it, not the explorer or the window under it (regression)", async () => {
    // Found building the diff window: the wheel went to the explorer under the pointer, or to the note's pane, which
    // came first among the panes under it.
    const many = code.replace(/= (\d+);/g, "= $1$1;");
    const h = await opened(many, 100);
    const under = h.app.tabView!;
    const f = h.app.floating!.view;
    h.frame();
    const pane = h.app.geometry!.panes.find((p) => p.view === f)!;
    const wheel = (x: number) =>
      h.app.mouse.handle({ type: "scroll", x, y: pane.y + 2, button: 0, scroll: { direction: "down", delta: 1 } });
    // Where the explorer is under it.
    const explorer = h.app.geometry!.sidebarPane!;
    expect(pane.textX + 4 < explorer.x + explorer.w && pane.y + 2 < explorer.y + explorer.h).toBe(true);
    wheel(pane.textX + 4);
    h.frame();
    const once = f.top;
    expect(once).toBeGreaterThan(0);
    // Where the note's window is under it.
    wheel(pane.x + pane.w - 10);
    h.frame();
    expect(f.top).toBeGreaterThan(once);
    expect([under.top, h.app.sidebar.scroll]).toEqual([0, 0]);
  });

  test("the terminal's theme: a changed word bold and underlined, a theme without tints to give", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 100, height: 40, themeName: "terminal" });
    h.app.git.showLineDiff(code, code.replace("const line2 = 2;", "const line2 = 22;"), "x.ts", "x.ts: its change");
    expect(styleAt(h, "+ const line2 = 22", "22")).toMatchObject({ bold: true, underline: true });
    expect(styleAt(h, "+ const line2 = 22", "line2")).toMatchObject({ bold: false, underline: false });
  });

  test("no line number drawn in it, line numbers on: its rows aren't a file's lines", async () => {
    // A row past the hundredth whose text is shorter than its number: the number would show past the text.
    const before = `${Array.from({ length: 105 }, (_, i) => `a${i}`).join("\n")}\n\nb\n`;
    const root = makeVault();
    const h = await harness({
      root,
      open: "index.md",
      width: 100,
      height: 40,
      config: (c) => (c.ui.line_numbers = true),
    });
    h.app.git.showLineDiff(before, before.replace(/^a/gm, "A"), "x.txt", "x.txt: every line");
    await h.keys("shift+g");
    const rows = screen(h);
    const y = rows.findIndex((r) => r.includes("+ A104"));
    // Between the window's borders, less the scrollbar's column.
    const inside = (r: string) => r.slice(r.indexOf("│") + 1, r.lastIndexOf("│") - 1);
    expect([inside(rows[y + 1]!).trim(), inside(rows[y + 2]!).trim()]).toEqual(["", "b"]);
  });

  test("two texts the same: said, and back where it came from; no window", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    let back = 0;
    h.app.git.showLineDiff(code, code, "x.ts", "x.ts: none", "no differences from main", () => void back++);
    expect([h.app.floating, h.app.messages.at(-1)?.text, back]).toEqual([null, "no differences from main", 1]);
  });

  test("line endings, a byte order mark, a final line break: not drawn as every line changed, nor as nothing — a dim row", async () => {
    const root = makeVault();
    writeFileSync(join(root, "x.ts"), code);
    writeFileSync(join(root, "n.md"), "# N\n\nOne.\n\nTwo.");
    const h = await harness({ root, open: "index.md", width: 100, height: 40 });
    const crlf = code.replace(/\n/g, "\r\n");
    /** The window's text opened on the two, a line a row; null: no window. */
    const said = async (before: string, now: string, path = "x.ts") => {
      if (h.app.floating) await h.keys("escape");
      h.app.git.showLineDiff(before, now, path, `${path}: its change`, `${path}: nothing to show`);
      return h.app.floating?.kind === "diff" ? h.app.floating.view.buf.source.split("\n") : null;
    };
    expect(await said(crlf, code)).toEqual(["\\ line endings: CRLF → LF"]);
    expect(await said(code, code.replace(/\n$/, ""))).toEqual(["\\ no newline at end of file"]);
    expect(await said(`\uFEFF${code}`, code)).toEqual(["\\ byte order mark removed"]);
    // Drawn dim, as it reads.
    expect(screen(h).some((r) => r.includes("\\ byte order mark removed"))).toBe(true);
    expect(styleAt(h, "\\ byte order mark", "byte")).toMatchObject({ fg: h.app.theme.roles.dim.fg });
    // A line changed as well: that line, and no other, the line endings said before it.
    const both = await said(crlf, code.replace("const line2 = 2;", "const line2 = 22;"));
    expect(both?.filter((r) => /^[-+\\] /.test(r))).toEqual([
      "\\ line endings: CRLF → LF",
      "- const line2 = 2; // line 2",
      "+ const line2 = 22; // line 2",
    ]);
    // Nothing different: said, no window.
    expect([await said(code, code), h.app.messages.at(-1)?.text]).toEqual([null, "x.ts: nothing to show"]);
    // A note's, as its blocks: the row too; enter on it goes to the line it's at, the last.
    expect(await said("# N\n\nOne.\n\nTwo.\n", "# N\n\nOne.\n\nTwo.", "n.md")).toEqual([
      "\\ no newline at end of file",
    ]);
    expect(h.app.floating?.kind === "diff" && h.app.floating.diff.blocks?.on).toBe(true);
    await h.keys("enter");
    expect([h.app.floating, h.app.view!.buf.rel]).toEqual([null, "n.md"]);
    expect(statusRow(h.frame())).toMatch(/ L5:\d+ /);
  });

  test("the window is read-only, drawn one way: typing refused, no source mode; as wide as the screen less its margins", async () => {
    const h = await opened(code.replace("const line2 = 2;", "const line2 = 22;"), 140);
    const top = screen(h).find((r) => r.includes("x.ts: its change"))!;
    expect(top.lastIndexOf("┐") - top.indexOf("┌") + 1).toBe(132);
    const f = h.app.floating!.view;
    const text = f.buf.source;
    await h.keys("i");
    expect(h.app.messages.at(-1)?.text).toStartWith("the floating window is read-only");
    await h.keys("ctrl+k");
    expect([f.source ?? false, f.buf.source, h.app.messages.at(-1)?.text]).toEqual([
      false,
      text,
      "a diff is drawn one way",
    ]);
    // esc closes it: opened from nowhere, it has nowhere to go back to.
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
  });

  test("a note's diff: its changed block before and after, only its changed words marked; tab its lines and back; enter goes to the line", async () => {
    const before =
      "# N\n\nThe 409 case is the one that bit us: a conflict is not transient. Since 2.3 a 409 parks\nthe op, and the loop goes on.\n\nThe end.\n\nMore one.\n\nMore two.\n\nMore three.\n";
    const now = before.replace("Since 2.3 a 409 parks\nthe op", "Since the incident a 409\nparks the op");
    const root = makeVault();
    writeFileSync(join(root, "n.md"), now);
    const h = await harness({ root, open: "index.md", width: 100, height: 40 });
    h.app.git.showLineDiff(before, now, "n.md", "n.md: its change");
    const roles = h.app.theme.roles;
    const has = (text: string) => screen(h).some((r) => r.includes(text));
    expect([has("┌ before"), has("┌ after"), has("@@ line 1")]).toEqual([true, true, true]);
    expect(has("tab: its lines · enter goes to the line")).toBe(true); // its footer says so
    // The words that changed, on the stronger tints; the rest of the paragraph plain, its moved line break no change.
    expect(styleAt(h, "Since 2.3 a 409", "2.3")).toMatchObject({ bg: roles.diff_del_word.bg });
    expect(styleAt(h, "Since the incident", "the incident")).toMatchObject({ bg: roles.diff_add_word.bg });
    const plain = styleAt(h, "a 409 parks the op", "parks");
    expect([roles.diff_add_word.bg, roles.diff_add.bg]).not.toContain(plain.bg ?? undefined);
    // tab: its lines, as source; the cursor on the row of the line it was on.
    await h.keys("j", "j", "j", "j"); // the after frame's first row: line 3
    await h.keys("tab");
    expect([has("┌ before"), has("+ parks the op, and the loop goes on.")]).toEqual([false, true]);
    expect(h.app.messages.at(-1)?.text).toBe("the diff's lines — tab: its blocks, before and after");
    const row = h.app.currentLayout(h.app.floating!.view).lines[h.app.floating!.view.cur.row]!;
    expect(row.spans.map((s) => s.text).join("")).toStartWith("- The 409 case");
    await h.keys("tab");
    expect(has("┌ before")).toBe(true);
    // enter on the fold after it: its blocks, unframed.
    const text = (r: Line) => r.spans.map((s) => s.text).join("");
    const fold = h.app.currentLayout(h.app.floating!.view).lines.findIndex((r) => text(r).includes("unchanged lines"));
    h.app.moveCursor(h.app.floating!.view, { row: fold, col: 0 });
    await h.keys("enter");
    expect([has("unchanged lines"), has("  More three."), h.app.floating?.kind]).toEqual([false, true, "diff"]);
    // enter on a word of the after frame's second row: the line that word is on, in the file — "parks", line 4, though
    // the row starts on line 3 ("a 409").
    const rows = h.app.currentLayout(h.app.floating!.view).lines.map((r) => r.spans.map((s) => s.text).join(""));
    const at = rows.findIndex((r) => r.includes("a 409 parks the op"));
    h.app.moveCursor(h.app.floating!.view, { row: at, col: rows[at]!.indexOf("parks") });
    await h.keys("enter");
    expect([h.app.floating, h.app.view!.buf.rel]).toEqual([null, "n.md"]);
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /);
  });

  test("[git] diff = \"source\": a note's diff opens as its lines, tab its blocks; a code file's has only its lines", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 100, height: 40, config: (c) => (c.git.diff = "source") });
    h.app.git.showLineDiff("one two three four\n", "one two THREE four\n", "n.md", "n.md: its change");
    expect(screen(h).some((r) => r.includes("+ one two THREE four"))).toBe(true);
    // Its blocks not found until they're drawn.
    const blocks = () => (h.app.floating?.kind === "diff" ? h.app.floating.diff.blocks : undefined);
    expect(blocks()).toMatchObject({ on: false, diff: null });
    await h.keys("tab");
    expect(screen(h).some((r) => r.includes("┌ after"))).toBe(true);
    expect(blocks()?.diff?.items.some((i) => i.kind === "change")).toBe(true);
    await h.keys("escape");
    h.app.git.showLineDiff(code, code.replace("= 2;", "= 22;"), "x.ts", "x.ts: its change");
    await h.keys("tab");
    expect(h.app.messages.at(-1)?.text).toBe("a code file's diff is drawn as its lines: only a note's has blocks");
    expect(screen(h).some((r) => r.includes("+ const line2 = 22;"))).toBe(true);
  });

  test("a code file's diff side by side where two columns of 80 fit, both sides scrolled sideways together; unified narrower", async () => {
    const tail = ", and a tail long enough to go well past the edge of a column ninety wide, to its very end";
    const from = code.replace("// line 17\n", `// line 17${tail}\n`);
    const now = from.replace("const line18 = 18;", "const line18 = 180;");
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 200, height: 40 });
    h.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    const row = (text: string) => screen(h).find((r) => r.includes(text)) ?? "";
    // Side by side: the line removed beside the line it became.
    expect(row("- const line18 = 18;")).toMatch(/- const line18 = 18; \/\/ line 18 +│ \+ const line18 = 180;/);
    // The long line, on both sides: its end out of sight on each; `$` on it scrolls both, one offset.
    expect(row("const line17")).not.toContain("its very end");
    expect(row("const line17").match(/const line17/g)?.length).toBe(2);
    await h.keys("j", "j", "j", "j"); // on line 17
    await h.keys("$");
    const scrolled = row("its very end");
    expect(scrolled.match(/its very end/g)?.length).toBe(2);
    expect(scrolled.match(/‹/g)?.length).toBe(2);
    await h.keys("0");
    expect(row("const line17").match(/const line17/g)?.length).toBe(2);
    await h.keys("escape");
    // [git] diff_layout: unified however wide; side by side however narrow.
    h.app.config.git.diff_layout = "unified";
    h.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    expect([row("- const line18 = 18;").includes("│ +"), row("+ const line18 = 180;") !== ""]).toEqual([false, true]);
    await h.keys("escape");
    const narrow = await harness({ root, open: "index.md", width: 120, height: 40 });
    narrow.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    const narrowRow = (text: string) =>
      narrow
        .frame()
        .split("\n")
        .find((r) => r.includes(text)) ?? "";
    expect(narrowRow("- const line18 = 18;")).not.toContain("+ const line18");
    narrow.app.config.git.diff_layout = "split";
    narrow.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    expect(narrowRow("- const line18")).toContain("│ + const line18");
  });
});
