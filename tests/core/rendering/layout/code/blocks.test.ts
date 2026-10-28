import { expect, test } from "bun:test";
import { codeBlocks, cellBlocks } from "../../../../../src/core/rendering/layout/code/cells/blocks.ts";

test("lens blocks preserve import/doc groups, continuation lines and leading blanks", () => {
  expect(
    codeBlocks(
      ["", "import a", "import b", "long", "continuation", "next"],
      { defs: [], docs: [], comments: [], imports: [{ start: 2, end: 3, modules: ["a", "b"] }] },
      6,
      (line) => line === 5,
    ),
  ).toEqual([
    [1, 1],
    [2, 3],
    [4, 5],
    [6, 6],
  ]);
});

test("whole-cell grouping uses the supplied fit decision and retains original line blocks when too tall", () => {
  const blocks: [number, number][] = [
    [1, 2],
    [3, 3],
    [4, 5],
  ];
  const cells = [{ from: 1, to: 3 }];
  expect(cellBlocks(blocks, cells, () => true)).toEqual({
    blocks: [
      [1, 3],
      [4, 5],
    ],
    whole: new Set([1]),
  });
  expect(cellBlocks(blocks, cells, () => false)).toEqual({ blocks, whole: new Set() });
  expect(blocks).toEqual([
    [1, 2],
    [3, 3],
    [4, 5],
  ]);
});
