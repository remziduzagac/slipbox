import { expect, test } from "bun:test";
import { docRows, linkPaths } from "../../../../../src/core/rendering/layout/code/documentation/layout.ts";
import { DIRECTIVE, sectionOf, unmark } from "../../../../../src/core/rendering/layout/code/documentation/comments.ts";
import type { LayoutLink, Line } from "../../../../../src/core/rendering/layout/ir.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
const glyphs = glyphsFor("unicode");

test("documentation terms and prose retain source lines and explicit link-array positioning", () => {
  const links: LayoutLink[] = [];
  const rows = docRows(
    ["/**", " * See [guide](guide.md).", " * @param value the input", " */"],
    { start: 1, end: 4, column: 0, style: "jsdoc" },
    60,
    2,
    glyphs,
    links,
    10,
  );
  expect(rows.map((r) => r.spans.map((s) => s.text).join("")).join("\n")).toContain("value");
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ target: "guide.md", src: 2, line: 10 });
  expect(rows.some((row) => row.src === 3 && row.spans.some((span) => span.role === "fm_key"))).toBe(true);
  expect(unmark("//! a note")).toBe("a note");
  expect(DIRECTIVE.test("@ts-ignore")).toBe(true);
  expect(sectionOf("--- Section ---")).toBe("Section");
});

test("comment paths leave source rows and longer words alone and reorder every resulting link reference", () => {
  const lines: Line[] = [
    { src: 1, spans: [{ text: "docs/a.md", role: "text", attrs: 0 }] },
    { src: 2, spans: [{ text: "docs/a.md", role: "text", attrs: 0 }], srcMap: { cells: [], end: 9 } },
    { src: 3, spans: [{ text: "prefixdocs/a.md", role: "text", attrs: 0 }] },
  ];
  const links: LayoutLink[] = [
    { kind: "markdown", target: "later.md", heading: null, text: "later", status: "resolved", line: 9, col: 0, src: 9 },
  ];
  linkPaths(
    lines,
    links,
    [1, 2, 3].map((line) => ({ line, text: "docs/a.md", target: "/docs/a.md" })),
  );
  expect(links.map((l) => l.target)).toEqual(["/docs/a.md", "later.md"]);
  expect(lines[0]!.spans[0]!.link).toBe(0);
  expect(lines[1]!.spans[0]!.link).toBeUndefined();
  expect(lines[2]!.spans[0]!.link).toBeUndefined();
});
