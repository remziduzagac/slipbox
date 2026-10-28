import { expect, test } from "bun:test";
import { breakLine, cellsOf, signatureRows } from "../../../../../src/core/rendering/layout/code/wrapping/rows.ts";
import { layoutSource } from "../../../../../src/core/rendering/layout/code/source.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
const glyphs = glyphsFor("unicode");

test("structural wrapping preserves wide-grapheme offsets and maps continuation padding to its first source cell", () => {
  const source = "  call(漢字, alpha, beta, gamma)";
  const cells = cellsOf(layoutSource(source, { width: 80, wrap: false, headings: [] }).lines[0]);
  const rows = breakLine(cells, 16, 2, glyphs);
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows) {
    expect(row.cells.reduce((n, c) => n + c.w, 0)).toBeLessThanOrEqual(16);
    for (const cell of row.cells.filter((c) => c.g.trim() && c.role !== "tree_guide"))
      expect(source.slice(cell.at)).toStartWith(cell.g);
  }
  expect(
    rows
      .flatMap((r) => r.cells)
      .filter((c) => c.g === "漢" || c.g === "字")
      .map((c) => c.at),
  ).toEqual([7, 8]);
  expect(rows[1]!.cells.slice(0, 6).every((c) => c.at === rows[1]!.cells[6]!.at)).toBe(true);
});

test("signature rows split only complete parameter lists and keep the closing row anchored to its original offset", () => {
  const source = "function f(first: string, second: number) {}";
  const cells = cellsOf(layoutSource(source, { width: 80, wrap: false, headings: [] }).lines[0]);
  const rows = signatureRows(cells, 10, 24, 2, glyphs, 0)!;
  expect(rows.map((r) => r.cells.map((c) => c.g).join(""))).toEqual([
    "function f(",
    "    first: string,",
    "    second: number",
    ") {}",
  ]);
  expect(rows.at(-1)!.cells[0]!.at).toBe(source.indexOf(")"));
  expect(signatureRows(cells, 10, 80, 2, glyphs, 0)).toBeNull();
  expect(signatureRows(cells.slice(0, 20), 10, 15, 2, glyphs, 0)).toBeNull();
});
