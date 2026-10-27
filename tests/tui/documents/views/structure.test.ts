import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("source files through tree-sitter (16.6–16.9)", () => {
  const TS =
    "export class Box {\n  open(): void {}\n}\n\nfunction wrap(x: number) {\n  const s = `one\ntwo ${x}\nthree`;\n  return s;\n}\n";
  // The grammar loads lazily, then the pass runs from a timer: wait for both.
  const settle = async (h: Harness) => {
    for (let i = 0; i < 100 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    h.frame();
  };
  test("the outline and breadcrumb come from the grammar; a template string's middle lines are string", async () => {
    const root = makeVault();
    writeFileSync(join(root, "box.ts"), TS);
    // Source mode, as [render] code = "source" opens code (the code view, 24.x, has tests of its own).
    const h = await harness({ root, open: "box.ts", width: 100, config: (c) => (c.render.code = false) });
    const v = h.app.view!;
    expect(v.source).toBe(true);
    await settle(h);
    const layout = h.app.currentLayout(v);
    expect(layout.headings.map((x) => [x.level, x.text])).toEqual([
      [1, "Box"],
      [2, "open"],
      [1, "wrap"],
    ]);
    const two = layout.lines.find((l) => l.src === 7)!; // `two ${x}`: highlight.js alone can't tell
    expect(two.spans.find((s) => s.text.includes("two"))!.role).toBe("syn_string");
    h.app.moveCursor(v, { row: layout.lines.findIndex((l) => l.src === 3), col: 0 });
    h.app.moveCursor(v, { row: 1, col: 2 });
    expect(h.frame()).toMatch(/Box\s*›\s*open/);
  });
  test("a syntax error is marked out of insert, the status line counting it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bad.py"), "def f(:\n    pass\n\nx = 1\n");
    const h = await harness({ root, open: "bad.py", width: 100, config: (c) => (c.render.code = false) });
    await settle(h);
    const errs = h.app.view!.buf.syntax!.errors;
    expect(errs.length).toBeGreaterThan(0);
    const marked = (c: TextCanvas) => c.styles.some((r) => r.some((st) => st?.underline && st.fg !== "default"));
    expect(marked(h.canvas())).toBe(true);
    expect(statusRow(h.frame())).toMatch(/✖ \d+ /); // how many: what it says is the Problems panel's
    // Typing: no marks (a half-typed line is broken anyway); the fix clears them once it settles.
    await h.keys("A");
    expect(marked(h.canvas())).toBe(false);
    await h.keys("escape", "g", "g", "0", "f", "(", "a", "x", ")", "escape");
    await settle(h);
    expect(h.app.view!.buf.source.startsWith("def f(x):")).toBe(true);
    expect(h.app.view!.buf.syntax!.errors).toEqual([]);
    expect(statusRow(h.frame())).not.toContain("✖");
  });
});
