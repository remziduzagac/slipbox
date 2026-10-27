import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("brackets in the editor (25.3)", () => {
  const open = async (files: Record<string, string>, file: string, line = 1, config?: (c: Config) => void) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    const h = await harness({ root, open: file, ...(config ? { config } : {}) });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.app.run(`cursor.goto_line ${line}`);
    return h;
  };

  test("% to the matching bracket and back; from before one on the line, to that one's match; d% takes both", async () => {
    const h = await open({ "a.ts": "if (a(b)) {\n  c();\n}\n" }, "a.ts", 1);
    const char = () => {
      const v = h.app.view!;
      const row = h.app.currentLayout(v).lines[v.cur.row]!;
      return row.spans.map((s) => s.text).join("")[v.cur.col];
    };
    // From the line's start: its first bracket is (, matched by the ) before {.
    await h.keys("%");
    expect([h.app.view!.cur.col, char()]).toEqual([8, ")"]);
    await h.keys("%");
    expect([h.app.view!.cur.col, char()]).toEqual([3, "("]);
    // { on line 1 to } on line 3.
    await h.keys("$", "%");
    expect([h.app.view!.cur.row, char()]).toEqual([2, "}"]);
    await h.app.run("cursor.goto_line 1");
    await h.keys("f", "(", "d", "%");
    expect(h.app.view!.buf.source).toBe("if  {\n  c();\n}\n");
  });

  test("the bracket at the cursor and its match marked, typing too the one before it; none elsewhere, none in the render", async () => {
    const h = await open({ "a.ts": "f(x, [y]);\n" }, "a.ts", 1);
    await h.keys("f", "[");
    expect([...h.app.views.bracketMarks(h.app.view!)!.entries()]).toEqual([
      [
        1,
        [
          { from: 5, to: 6 },
          { from: 7, to: 8 },
        ],
      ],
    ]);
    // The frame draws the match in its role (the one at the cursor shows the cursor).
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("f(x, [y]);"));
    const x = c.rows[y]!.join("").indexOf("]");
    expect(c.styles[y]![x]!.bg).toBe(h.app.theme.roles.bracket_match.bg!);
    await h.keys("0");
    expect(h.app.views.bracketMarks(h.app.view!)).toBeNull();
    // Typing just after one: it and its match.
    await h.keys("f", ")", "a");
    expect([...h.app.views.bracketMarks(h.app.view!)!.entries()]).toEqual([
      [
        1,
        [
          { from: 8, to: 9 },
          { from: 1, to: 2 },
        ],
      ],
    ]);
    await h.keys("escape", "ctrl+k");
    expect(h.app.views.bracketMarks(h.app.view!)).toBeNull();
  });

  test("auto_pairs on: an opening bracket or a quote closes its pair, a closing one typed steps over, backspace takes both; off, as typed", async () => {
    const on = await open({ "a.ts": "\n" }, "a.ts", 1, (c) => (c.editor.auto_pairs = true));
    await on.keys("i", "f", "(", "x", ")", ";", "escape");
    expect(on.app.view!.buf.source).toBe("f(x);\n");
    await on.keys("o", "s", "space", "=", "space", '"', "h", "i", '"', "escape");
    expect(on.app.view!.buf.source).toBe('f(x);\ns = "hi"\n');
    await on.keys("o", "[", "backspace", "d", "o", "n", "'", "t", "escape");
    expect(on.app.view!.buf.source).toBe('f(x);\ns = "hi"\ndon\'t\n');
    const off = await open({ "a.ts": "\n" }, "a.ts", 1);
    await off.keys("i", "f", "(", "escape");
    expect(off.app.view!.buf.source).toBe("f(\n");
  });
});
