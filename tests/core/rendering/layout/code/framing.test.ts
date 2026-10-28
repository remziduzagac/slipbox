import { expect, test } from "bun:test";
import { cellHeader, framedRow, plainRow } from "../../../../../src/core/rendering/layout/code/cells/framing.ts";
import { cellsOf } from "../../../../../src/core/rendering/layout/code/wrapping/rows.ts";
import { layoutSource } from "../../../../../src/core/rendering/layout/code/source.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";

const glyphs = glyphsFor("unicode");

test("cell borders pad source maps with source endpoints while bands retain their fill", () => {
  const base = layoutSource("漢x", { width: 80, wrap: false, headings: [] });
  const row = plainRow(cellsOf(base.lines[0]), 3, 2);
  for (const style of ["box", "band"] as const) {
    const framed = framedRow(row, 2, 8, style);
    const side = style === "box" ? 2 : 1;
    expect(framed.src).toBe(3);
    expect(framed.srcMap!.cells.slice(0, 2 + side)).toEqual(Array(2 + side).fill(0));
    expect(framed.srcMap!.cells.slice(2 + side, 4 + side)).toEqual([0, 1]);
    expect(framed.srcMap!.cells.at(-1)).toBe(2);
    expect(framed.srcMap!.end).toBe(2);
    expect(framed.text).toEqual([2 + side, 2 + side + 3]);
    expect(style === "box" ? framed.frame : framed.fill).toEqual(style === "box" ? [2] : "code_block");
  }
});

test("headers keep action identity and source range when folded or switched between boxes and bands", () => {
  const cell = {
    from: 3,
    to: 8,
    column: 0,
    mark: glyphs.codeFunction,
    markRole: "syn_function" as const,
    title: "function",
  };
  for (const style of ["box", "band"] as const)
    for (const shut of [false, true]) {
      const header = cellHeader(cell, 0, 60, style, [{ line: 4, severity: "error" }], shut, glyphs);
      expect(header.src).toBe(3);
      expect(header.decor).toBe(shut ? undefined : true);
      expect(header.spans.filter((s) => s.button).map((s) => s.button)).toEqual([
        "problems:3",
        "copy:3",
        "edit:3",
        "scratch:3",
        "fold:3",
      ]);
      expect(header.spans.map((s) => s.text).join("")).toContain("3–8");
      expect(header.spans.reduce((n, s) => n + stringWidth(s.text), 0)).toBe(60 + (style === "box" ? 4 : 2));
    }
});
