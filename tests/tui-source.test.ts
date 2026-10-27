import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { layoutSource, newSourceCache } from "../src/core/layout/source.ts";
import { loadConfig } from "../src/core/application/config/config.ts";
import { harness, makeSandbox } from "./tui-harness.ts";

makeSandbox();

test("source editor: relative gutter options and an INSERT bar, NORMAL block", async () => {
  for (const relative of ["lens", "source", "both", "off"] as const) {
    const h = await harness({
      config: (c) => {
        c.ui.line_numbers = true;
        c.ui.relative_numbers = relative;
      },
    });
    await h.keys("ctrl+k", "j", "j");
    const v = h.app.view!;
    let c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const layout = h.app.currentLayout(v);
    const row = v.cur.row - 1;
    const absolute = layout.lines[row]!.src;
    const expected = relative === "source" || relative === "both" ? 1 : absolute;
    expect(
      c
        .line(pane.y + row - v.top)
        .slice(pane.x, pane.textX)
        .trim(),
    ).toBe(String(expected));
    expect(c.nativeCursor).toBeNull();
    await h.keys("i");
    c = h.canvas();
    expect(c.nativeCursor).toEqual(h.app.geometry!.cursor!);
    await h.keys("escape");
    expect(h.app.view!.insert).toBe(false);
    expect(h.canvas().nativeCursor).toBeNull();
    await h.keys("v");
    expect(h.app.view!.visual).toBe("char");
    await h.keys("escape");
    expect(h.app.view!.visual).toBeNull();
  }
});

test("view and vim mode stay visible together through Escape and selection", async () => {
  for (const glyphs of ["nerd", "unicode", "ascii"] as const) {
    const h = await harness({ config: (c) => (c.render.glyphs = glyphs) });
    const divider = glyphs === "ascii" ? "|" : "│";
    const chip = () => h.canvas().line(h.app.height - 1);
    expect(chip()).toContain(`READ ${divider} NORMAL`);
    await h.keys("ctrl+k", "i");
    expect(chip()).toContain(`SOURCE ${divider} INSERT`);
    await h.keys("escape");
    expect(chip()).toContain(`SOURCE ${divider} NORMAL`);
    await h.keys("v");
    expect(chip()).toContain(`SOURCE ${divider} VISUAL`);
    await h.keys("shift+v");
    expect(chip()).toContain(`SOURCE ${divider} V-LINE`);
    await h.keys("escape", "space", "n", "l");
    expect(chip()).toContain(`READ${glyphs === "ascii" ? "-" : "·"}LENS ${divider} NORMAL`);
    await h.keys("i");
    expect(chip()).toContain(`READ${glyphs === "ascii" ? "-" : "·"}LENS ${divider} INSERT`);
  }
});

test("rendering defaults open each kind in SOURCE without disabling READ or the lens", async () => {
  for (const open of ["index.md", "samples/software/halley/reduce.py", "samples/software/halley/targets.yaml"]) {
    const h = await harness({
      open,
      config: (c) => {
        c.render.notes = false;
        c.render.code = false;
        c.render.data = false;
      },
    });
    expect(h.app.view!.source).toBe(true);
    expect(h.app.canRender(h.app.view!.buf)).toBe(true);
    const before = h.app.messages.length;
    await h.app.run("view.mode_read");
    expect(h.app.view!.source).toBe(false);
    h.app.lens.fitMode(h.app.view!, h.app.view!.buf);
    expect(h.app.view!.source).toBe(false);
    await h.app.run("view.mode_lens");
    expect(h.app.view!.live).toBe(true);
    await h.app.run("view.mode_lens");
    expect(h.app.view!.live).toBe(false);
    expect(h.app.messages.length).toBe(before);
    const c = h.canvas();
    const buttons = h.app.geometry!.hot.filter((b) => b.id.startsWith("mode:0:"));
    expect(buttons.map((b) => c.line(b.y).slice(b.x, b.x + b.w))).toEqual([" R ", " L ", " S "]);
  }
});

test("rendering config accepts booleans and reads the legacy code and editing values", async () => {
  const h = await harness();
  const configFile = join(h.root, "opening.toml");
  for (const [value, expected] of [
    ["true", true],
    ["false", false],
    ['"document"', true],
    ['"source"', false],
  ] as const) {
    writeFileSync(configFile, `[render]\nnotes = false\ndata = false\ncode = ${value}\n[editor]\nedit_in = "live"\n`);
    const loaded = loadConfig({ configFile });
    expect(loaded.config.render).toMatchObject({ notes: false, data: false, code: expected });
    expect(loaded.config.editor.edit_in).toBe("lens");
    expect(loaded.warnings).toEqual([]);
  }
});

test("source fences retain shading and multiline syntax after edits", () => {
  const cache = newSourceCache();
  const text = "```js\n/* first\ncontinued */\nconst x = 1;\n```\n\n```mermaid\ngraph LR\n```";
  const layout = (source: string) => layoutSource(source, { width: 80, wrap: true, headings: "scan" }, cache);
  let rows = layout(text).lines;
  expect(rows[2]!.fill).toBe("code_block");
  expect(rows[2]!.spans.every((span) => span.role === "syn_comment")).toBe(true);
  expect(rows[3]!.spans.some((span) => span.role === "code_block")).toBe(true);
  expect(rows[7]!.spans.every((span) => span.role === "code_block")).toBe(true);
  rows = layout(text.replace("/* first", "// first")).lines;
  expect(rows[2]!.spans.some((span) => span.role !== "syn_comment")).toBe(true);
});
