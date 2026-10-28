import { expect, test } from "bun:test";
import type { Root } from "mdast";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { parseLegacy } from "../../../../src/core/documents/markdown/parse/engine.ts";
import { finish } from "../../../../src/core/documents/markdown/parse/transforms.ts";
import { tame } from "../../../../src/core/documents/markdown/parse/normalization.ts";
import { htmlEnd, shifted } from "../../../../src/core/documents/markdown/parse/chunks.ts";
import { ORIGIN, newParseCache } from "../../../../src/core/documents/markdown/parse/contracts.ts";
import { headingText, headingsOf } from "../../../../src/core/documents/markdown/parse/headings.ts";
import { visit } from "../../../../src/core/documents/markdown/parse/visit.ts";

test("post-parse transforms retain heading IDs and discard offsets after parsing", () => {
  const text = "# Hello {#explicit}\n";
  const tree = parseLegacy(text);
  finish(tree.children, text);
  const heading = tree.children[0];
  expect(heading?.type).toBe("heading");
  if (heading?.type !== "heading") throw new Error("missing heading");
  expect(headingText(heading)).toBe("Hello");
  expect(heading.data).toMatchObject({ id: "explicit" });
  expect(heading.position?.start.offset).toBeUndefined();
  expect(headingsOf(tree)[0]).toMatchObject({ text: "Hello", line: 1 });
});

test("normalization preserves frontmatter and fences while bounding pathological prose", () => {
  const run = "*".repeat(80);
  const protectedText = `---\ntitle: "${run}"\n---\n\n\`\`\`\n${run}\n\`\`\`\n`;
  const result = tame(`${protectedText}\nprefix ${run}\n`);
  expect(result.startsWith(protectedText)).toBe(true);
  expect(result.endsWith(`prefix ${"∗".repeat(80)}\n`)).toBe(true);
});

test("position shifting leaves original nodes untouched and caches keep independent maps", () => {
  const tree = parseLegacy("# A\n");
  const before = structuredClone(tree.children);
  const moved = shifted(tree.children, 4);
  expect(tree.children).toEqual(before);
  expect(moved[0]?.position?.start.line).toBe(5);
  expect(typeof ORIGIN).toBe("symbol");
  expect(newParseCache().chunks).not.toBe(newParseCache().chunks);
});

test("visitor pruning skips children while retaining later siblings and their parents", () => {
  const tree: Root = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: "hidden" }] },
      { type: "heading", depth: 1, children: [{ type: "text", value: "shown" }] },
    ],
  };
  const seen: string[] = [];
  visit(tree, (node, parent) => {
    seen.push(`${parent?.type ?? "none"}/${node.type}`);
    if (node.type === "paragraph") return false;
  });
  expect(seen).toEqual(["none/root", "root/paragraph", "root/heading", "heading/text"]);
});

test("literal block closers retain exact Markdown boundary semantics", () => {
  for (const [tag, close, other] of [
    ["<!--", "-->", "--!>"],
    ["<?", "?>", "? >"],
    ["<![CDATA[", "]]>", "] ]>"],
    ["<!DOCTYPE", ">", "x"],
  ] as const) {
    expect(htmlEnd(tag).test(`before ${close} after`)).toBe(true);
    expect(htmlEnd(tag).test(other)).toBe(false);
  }
  expect(htmlEnd("<script").test("</SCRIPT>")).toBe(true);
});

test("chunking keeps a comment block intact through a near closer until its actual ending", () => {
  const text = [
    "# Start",
    "",
    "<!--",
    ...Array.from({ length: 45 }, (_, i) => `line ${i}`),
    "--!>",
    "",
    "# Hidden",
    "",
    "-->",
    "",
    "# After",
    "",
  ].join("\n");
  const whole = parseMarkdown(text, undefined, { whole: true });
  const sliced = parseMarkdown(text, undefined, { chunkLines: 3 });
  expect(JSON.parse(JSON.stringify(sliced.tree))).toEqual(JSON.parse(JSON.stringify(whole.tree)));
  expect(whole.tree.children.filter((node) => node.type === "heading")).toHaveLength(2);
});
