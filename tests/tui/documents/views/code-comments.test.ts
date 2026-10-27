import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("code as a document: comments, Python beside TypeScript (24.4, 24.9)", () => {
  const TS = [
    'import { join } from "node:path";',
    "",
    "// ---- Resolving links ----",
    "",
    "/**",
    " * Resolves a link written in a note: the note it reaches, or `null` when nothing matches.",
    " * @param from - the note it's written in",
    " * @param target the link as written",
    " * @returns the link, or null",
    " */",
    "export function resolve(from: string, target: string): Link | null {",
    "  if (!target) return null; // nothing written: nothing to find",
    "  // By name first, then by path: a path is never ambiguous.",
    "  return byName.get(normKey(target)) ?? byPath.get(join(from, target)) ?? byAlias.get(target.toLowerCase()) ?? null;",
    "}",
    "",
    "// ---- The graph ----",
    "",
    "/** The notes of a folder, read once. */",
    "export class Graph {",
    "  /**",
    "   * A note's text, as read.",
    "   *",
    "   * From the cache when it has it.",
    "   */",
    "  textOf(rel: string): string | undefined {",
    "    return this.notes.get(rel);",
    "  }",
    "}",
    "",
  ].join("\n");
  const PY = [
    "from os.path import join",
    "",
    "# ---- Resolving links ----",
    "",
    "",
    "def resolve(from_: str, target: str) -> Link | None:",
    '    """Resolves a link written in a note: the note it reaches,',
    "    or ``None`` when nothing matches.",
    "",
    "    Args:",
    "        from_: the note it's written in",
    "        target: the link as written",
    "",
    "    Returns:",
    "        the link, or None",
    '    """',
    "    if not target:",
    "        return None  # nothing written: nothing to find",
    "    # By name first, then by path: a path is never ambiguous.",
    "    return by_name.get(norm_key(target)) or by_path.get(join(from_, target)) or by_alias.get(target.lower())",
    "",
    "",
    "# ---- The graph ----",
    "",
    "",
    "class Graph:",
    '    """The notes of a folder, read once."""',
    "",
    "    def text_of(self, rel: str) -> str | None:",
    '        """A note\'s text, as read.',
    "",
    "        From the cache when it has it.",
    '        """',
    "        return self.notes.get(rel)",
    "",
  ].join("\n");
  const open = async (file: string, text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, file), text);
    const h = await harness({
      root,
      open: file,
      width: 100,
      height: 60,
      config: (c) => ((c.ui.sidebar = false), config?.(c)),
    });
    for (let i = 0; i < 200 && h.app.view!.buf.syntax?.version !== h.app.view!.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    return h;
  };
  const rows = (h: Harness) => {
    const frame = h.frame();
    const pane = h.app.geometry!.panes[0]!;
    return frame
      .split("\n")
      .slice(pane.y, pane.y + pane.h)
      .map((r) =>
        [...r]
          .slice(pane.textX, pane.x + pane.w - 1)
          .join("")
          .trimEnd(),
      );
  };

  test("the same function and class in TypeScript and Python read alike: sections, docs above their cells, notes, prose comments", async () => {
    const ts = rows(await open("links.ts", TS));
    const py = rows(await open("links.py", PY));
    const at = (r: string[], text: string) => r.findIndex((x) => x.includes(text));
    // A separator comment: a section's rule with its title, in both.
    for (const r of [ts, py])
      expect(r.slice(at(r, "Resolving links") - 1, at(r, "Resolving links") + 3)).toEqual([
        "",
        expect.stringMatching(/^── Resolving links ─+$/),
        "",
        expect.stringMatching(/^┌─ function: resolve /),
      ]); // a blank row each side
    // In the cell, its documentation — Python's docstring too, above the code — as prose, then the same terms; a
    // divider; its code.
    const inBox = (x: string) =>
      x
        .replace(/^[ │├└┤─]*/, "")
        .replace(/ *│$/, "")
        .trim()
        .replace(/\s+/g, " ");
    const doc = (r: string[]) => {
      const head = at(r, "function: resolve");
      const code = r.findIndex((x, i) => i > head && /^│ (export function|def) resolve/.test(x));
      return {
        prose: r
          .slice(head + 1, code)
          .map(inBox)
          .filter((x) => x),
        head,
        code,
      };
    };
    expect(doc(ts).prose).toEqual([
      "Resolves a link written in a note: the note it reaches, or null when nothing matches.",
      "from the note it's written in",
      "target the link as written",
      "returns the link, or null",
    ]);
    // Its lines as its author wrapped them: the docstring's first paragraph on two.
    expect(doc(py).prose).toEqual([
      "Resolves a link written in a note: the note it reaches,",
      "or None when nothing matches.",
      "from_ the note it's written in",
      "target the link as written",
      "returns the link, or None",
    ]);
    expect(ts[doc(ts).head]).toMatch(/^┌─ function: resolve ─+ 5–15 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    expect(py[doc(py).head]).toMatch(/^┌─ function: resolve ─+ 6–20 ⇢ ⧉ ✎ ◎ ▾ ──$/);
    for (const r of [ts, py]) expect(r[doc(r).code - 1]).toBe("│"); // a blank row between its documentation and its code
    expect(ts[doc(ts).code]).toMatch(/^│ export function resolve\(from: string, target: string\): Link \| null \{$/);
    expect(py[doc(py).code]).toMatch(/^│ def resolve\(from_: str, target: str\) -> Link \| None:$/);
    // In the cell: a comment after code a note, its marker gone; a comment line prose, its marker gone.
    expect(ts[at(ts, "nothing written")]).toMatch(
      /^│ {3}if \(!target\) return null; +nothing written: nothing to find$/,
    );
    expect(py[at(py, "nothing written")]).toMatch(/^│ {5}│ {3}return None +nothing written: nothing to find$/);
    expect(ts[at(ts, "By name first")]).toMatch(/^│ {3}By name first, then by path: a path is never ambiguous\.$/);
    expect(py[at(py, "By name first")]).toMatch(/^│ {5}By name first, then by path: a path is never ambiguous\.$/);
    for (const r of [ts, py]) expect(r.some((x) => /\/\/|#|"""|\/\*\*/.test(x))).toBe(false); // no marker anywhere
    // A long line breaks before its operator, in both: `??`, `or`.
    expect(ts[at(ts, "byAlias")]).toMatch(/^│ {7}\?\? byAlias\.get/);
    expect(py[at(py, "by_alias")]).toMatch(/^│ {9}or by_alias\.get/);
    // The class: its doc in its cell; its method's in the method's, both paragraphs prose (a docstring's indentation
    // isn't markdown's code).
    for (const r of [ts, py]) {
      expect(inBox(r[at(r, "class: Graph") + 2]!)).toBe("The notes of a folder, read once."); // under the blank row
      const m = at(r, "method: text");
      // The class's one member, the line to its top — on past it to the class's closing brace in TypeScript; Python's
      // class has none.
      expect(r[m]).toMatch(/^│ ┌─ method: text_?[oO]f ─/);
      expect(r[m + 1]).toBe(r === ts ? "├─┤" : "└─┤");
      expect(r.slice(m + 2, m + 5).map(inBox)).toEqual([
        "A note's text, as read.",
        "",
        "From the cache when it has it.",
      ]);
      expect(r[m + 5]).toBe(r === ts ? "│ │" : "  │"); // a blank row before its code, no divider
    }
  });

  test("the sections head the outline's definitions; a docstring's rows keep their lines", async () => {
    const h = await open("links.py", PY);
    const layout = h.app.currentLayout(h.app.view!);
    expect(layout.headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 Resolving links",
      "2 resolve",
      "1 The graph",
      "2 Graph",
      "3 text_of",
    ]);
    // The docstring drawn above `def`, each row on its own line: its first, its terms'.
    const doc = layout.lines.filter((l) => l.src >= 7 && l.src <= 16);
    expect(doc[0]!.src).toBe(7);
    expect(layout.lines.findIndex((l) => l.src === 7)).toBeLessThan(
      layout.lines.findIndex((l) => l.src === 6 && l.srcMap),
    );
    expect(layout.lines.find((l) => l.spans.some((s) => s.text.startsWith("from_")))!.src).toBe(11);
  });

  test("the headings are the outline's, as source mode's: a function inside a function, an impl by its name — the breadcrumb the same in both", async () => {
    const RS = [
      "pub struct Point {",
      "    pub lat: f64,",
      "}",
      "",
      "impl Point {",
      "    pub fn new(lat: f64) -> Point {",
      "        fn clamp(x: f64) -> f64 {",
      "            x.max(-90.0).min(90.0)",
      "        }",
      "        Point { lat: clamp(lat) }",
      "    }",
      "}",
      "",
    ].join("\n");
    const h = await open("point.rs", RS);
    const v = h.app.view!;
    expect(v.source).toBeFalsy(); // the code view
    const crumbAt = (line: number) => {
      const layout = h.app.currentLayout(v);
      h.app.moveCursor(v, { row: layout.lines.findIndex((l) => l.src === line && l.srcMap), col: 0 });
      return h.app.outlineView.breadcrumb(v).map((c) => c.text);
    };
    const inView = crumbAt(8);
    expect(h.app.currentLayout(v).headings.map((x) => `${x.level} ${x.text}`)).toEqual([
      "1 Point",
      "1 impl Point",
      "2 new",
      "3 clamp",
    ]);
    expect(inView).toEqual(["impl Point", "new", "clamp"]);
    await h.app.run("view.source");
    expect(v.source).toBe(true);
    expect(crumbAt(8)).toEqual(inView);
  });

  test("a comment for tools, and code put aside, stay as written; a note's run lines up; a block of comment lines keeps its lines", async () => {
    const ts = rows(
      await open(
        "c.ts",
        [
          "// eslint-disable-next-line no-console",
          'console.log("x");',
          "// const old = compute(1);",
          "// A plain note",
          "// over two lines.",
          "const a = 1; // first",
          "const bb = 22; // second",
          "// ==== Tail ====",
          "const y = 1;",
          "",
          "// Adds one, as Go documents a function.",
          "function inc(x: number) { return x + 1; }",
          "",
        ].join("\n"),
      ),
    );
    expect(ts).toContain("// eslint-disable-next-line no-console");
    expect(ts).toContain("// const old = compute(1);");
    expect(ts[ts.indexOf("// const old = compute(1);") - 1]).toBe(""); // after a box, a blank row: no box follows it
    // Once, however many rows follow that aren't boxes; imports too.
    const kept = rows(
      await open(
        "k.ts",
        [
          "const a = 1;",
          "// eslint-disable-next-line no-console",
          "// @ts-expect-error",
          'import { x } from "y";',
          "",
        ].join("\n"),
      ),
    );
    const at = kept.indexOf("// eslint-disable-next-line no-console");
    expect(kept.slice(at - 2, at + 4)).toEqual([
      "│ const a = 1;",
      "",
      "// eslint-disable-next-line no-console",
      "// @ts-expect-error",
      "▸ imports  y (1)",
      "",
    ]);
    const imp = rows(await open("i.ts", ["const a = 1;", 'import { x } from "y";', ""].join("\n")));
    expect(imp.slice(imp.indexOf("│ const a = 1;"), imp.indexOf("│ const a = 1;") + 3)).toEqual([
      "│ const a = 1;",
      "",
      "▸ imports  y (1)",
    ]);
    const plain = ts.indexOf("│ A plain note");
    expect(ts.slice(plain, plain + 2)).toEqual(["│ A plain note", "│ over two lines."]); // its own box, its lines as written
    const a = ts.find((x) => x.includes("first"))!;
    const b = ts.find((x) => x.includes("second"))!;
    expect(a.indexOf("first")).toBe(b.indexOf("second")); // one column for the run's notes
    expect(a).toMatch(/^│ const a = 1; +first$/);
    expect(ts[ts.indexOf(a) - 2]).toMatch(/^┌─ • a · bb ─/); // the values together, one cell
    // Comment lines right above a definition document it: in its cell, a blank row between them and its code.
    const inc = ts.findIndex((x) => x.includes("function: inc"));
    expect(ts.slice(inc, inc + 5)).toEqual([
      expect.stringMatching(/^┌─ function: inc ─+ 11–12 /),
      "│",
      "│ Adds one, as Go documents a function.",
      "│",
      expect.stringMatching(/^│ function inc/),
    ]);
    // A section right after code: a blank row before its rule all the same.
    expect(ts[ts.findIndex((x) => x.includes("── Tail"))! - 1]).toBe("");
    const py = rows(
      await open(
        "t.py",
        ["#!/usr/bin/env python3", "# -*- coding: utf-8 -*-", "x = os.environ  # type: ignore", ""].join("\n"),
      ),
    );
    expect(py.slice(0, 2)).toEqual(["#!/usr/bin/env python3", "# -*- coding: utf-8 -*-"]);
    expect(py.some((x) => /^│ x = os\.environ {2}# type: ignore$/.test(x))).toBe(true); // a directive after code: as written, no note
  });
});
