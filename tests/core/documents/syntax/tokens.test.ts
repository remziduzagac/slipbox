import { expect, test } from "bun:test";
import { commentLinks, linkTokens } from "../../../../src/core/documents/syntax/links/tokens.ts";

test("comment links keep UTF-16 offsets and repeat without retaining regex cursor state", () => {
  const text = "😀 see https://example.org/a(b). ../note.md:42:3 and 1.5";
  const expected = [
    { index: 7, length: 24, target: "https://example.org/a(b)", url: true, at: null },
    { index: 33, length: 15, target: "../note.md", url: false, at: 42 },
  ];
  // URL punctuation is excluded from its span; the path's line/column suffix is part of its span.
  expect(linkTokens(text)).toEqual(expected);
  expect(linkTokens(text)).toEqual(expected);
  expect(commentLinks([{ line: 9, column: 4, text: `${text}\nnext.md:2` }])).toEqual([
    ...expected.map(({ index, length, ...link }) => ({ line: 9, from: index + 4, to: index + length + 4, ...link })),
    { line: 10, from: 0, to: 9, target: "next.md", url: false, at: 2 },
  ]);
});
