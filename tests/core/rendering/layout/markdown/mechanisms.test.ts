import { expect, test } from "bun:test";
import type { PhrasingContent } from "mdast";
import type { Line } from "../../../../../src/core/rendering/layout/ir.ts";
import type { RenderOptions } from "../../../../../src/core/rendering/layout/markdown/contracts.ts";
import {
  collectDefinitions,
  isParagraphSpacing,
} from "../../../../../src/core/rendering/layout/markdown/nodes/structure.ts";
import { picturesAlone } from "../../../../../src/core/rendering/layout/markdown/pictures/layout.ts";
import type { Ctx } from "../../../../../src/core/rendering/layout/markdown/render-context.ts";
import { finish, placed } from "../../../../../src/core/rendering/layout/markdown/rows/finish.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";

function context(opts: Partial<RenderOptions> = {}): Ctx {
  return {
    opts: { width: 16, glyphs: glyphsFor("unicode"), showUrls: false, ...opts },
    links: [],
    headings: [],
    definitions: new Map(),
    nesting: 0,
    embedChain: [],
    embedded: new Set(),
    pending: new Set(),
    asks: { picture: false },
  };
}

test("standalone-node spacing accepts only breaks, comments and blank text; definitions keep the first label", () => {
  const nodes: PhrasingContent[] = [
    { type: "break" },
    { type: "comment", children: [] },
    { type: "text", value: " \n\t" },
    { type: "text", value: "x" },
    { type: "image", url: "a.png", alt: "" },
    { type: "strong", children: [] },
  ];
  expect(nodes.map(isParagraphSpacing)).toEqual([true, true, true, false, false, false]);
  const ctx = context();
  collectDefinitions(
    {
      type: "root",
      children: [
        { type: "definition", identifier: "X", url: "first.md" },
        { type: "blockquote", children: [{ type: "definition", identifier: "x", url: "later.md" }] },
      ],
    },
    ctx,
  );
  expect([...ctx.definitions]).toEqual([["x", "first.md"]]);
});

test("cached row placement copies source, link, heading, task and disclosure coordinates", () => {
  const row: Line = {
    src: 3,
    heading: 1,
    details: { from: 3, to: 9, open: true },
    spans: [{ text: "task", role: "text", attrs: 0, src: 4, link: 2, task: { line: 4, end: 6, checked: false } }],
  };
  const copy = placed(row, 10, 20, 30);
  expect(copy.src).toBe(13);
  expect(copy.heading).toBe(31);
  expect(copy.details).toEqual({ from: 13, to: 19, open: true });
  expect(copy.spans[0]).toMatchObject({ src: 14, link: 22, task: { line: 14, end: 16, checked: false } });
  copy.spans[0]!.task!.checked = true;
  expect(row.spans[0]!.task!.checked).toBe(false);
  expect(row.details).toEqual({ from: 3, to: 9, open: true });
});

test("row finishing clips by grapheme, keeps scrolling code whole and anchors links and picture extent", () => {
  const ctx = context();
  ctx.links.push({
    kind: "markdown",
    target: "note.md",
    heading: null,
    text: "note",
    status: "resolved",
    src: 5,
    line: -1,
    col: -1,
  });
  ctx.headings.push({ level: 1, text: "title", slug: "title", src: 5 });
  const layout = finish(
    [
      { src: 5, heading: 0, spans: [{ text: "😀界\tabc", role: "text", attrs: 0, link: 0 }] },
      { src: 6, spans: [{ text: "wide\tcode", role: "code_block", attrs: 0 }], scroll: { x: 1, w: 3, total: 9 } },
      { src: 7, spans: [{ text: "  ", role: "text", attrs: 0 }], image: { src: "a.png", cols: 24, rows: 1 } },
    ],
    ctx,
    5,
  );
  expect(layout.lines[0]!.spans[0]!.text).toBe("😀界 ");
  expect(layout.clipped).toBe(1);
  expect(layout.lines[1]!.spans[0]!.text).toBe("wide code");
  expect(layout.links[0]).toMatchObject({ line: 0, col: 0 });
  expect(layout.headings[0]!.line).toBe(0);
  expect(layout.extent).toBe(26);
});

test("standalone pictures keep fitting requests, caption placement and scrolling row metadata", () => {
  const asked: { width: number; caption: number | undefined }[] = [];
  const picture = { src: "pixels.png", cols: 30, rows: 2, scrolls: true };
  const ctx = context({
    caption: "top",
    picture: (_from, width, caption) => {
      asked.push({ width, caption });
      return picture;
    },
  });
  const rows = picturesAlone(
    [{ type: "image", url: "a.png", alt: "short", data: { html: { width: { unit: "%", value: 50 } } } }],
    9,
    ctx,
    16,
    { role: "text", attrs: 0 },
  )!;
  expect(asked).toEqual([{ width: 8, caption: 4 }]);
  expect(ctx.asks.picture).toBe(true);
  const first = rows.findIndex((row) => row.image === picture);
  expect(first).toBe(4);
  expect(rows[first]!.pic).toEqual({ p: picture, row: 0 });
  expect(rows[first + 2]!.scroll?.part).toBe("bar");
  expect(rows.every((row) => row.src === 9 && row.pic?.p === picture)).toBe(true);
  expect(
    picturesAlone(
      [
        { type: "text", value: "beside it" },
        { type: "image", url: "a.png", alt: "" },
      ],
      9,
      ctx,
      16,
      { role: "text", attrs: 0 },
    ),
  ).toBeNull();
});
