import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { assemble } from "../../../../../src/core/rendering/export/assemble.ts";
import { bookmarkName, toDocx } from "../../../../../src/core/rendering/export/formats/docx.ts";
import { rasterInfo } from "../../../../../src/core/rendering/export/assets/images.ts";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { rect, WEBP } from "../../../../support/export-pictures.ts";
import { OBSIDIAN, COMMENTS } from "../../../../support/export-nodes.ts";
import { unzip, xml } from "../../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { root } = makeExportFixture();

describe("export: Word (10.4)", () => {
  test("a .docx: its parts, title and author; headings bookmarked, links inside the document to them, the web's out", async () => {
    const { graph } = root({
      "a.md": "---\nauthor: Ada\n---\n\n# Report\n\nSee [[b#Details]] and [the web](https://example.com/x).\n",
      "b.md": "# B\n\n## Details\n\nBody.\n",
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md", "b.md"])));
    expect([...z.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "word/document.xml",
        "word/styles.xml",
        "word/numbering.xml",
        "word/footnotes.xml",
        "docProps/core.xml",
      ]),
    );
    expect(xml(z, "docProps/core.xml")).toContain("<dc:title>Report</dc:title>");
    expect(xml(z, "docProps/core.xml")).toContain("<dc:creator>Ada</dc:creator>");
    const body = xml(z, "word/document.xml");
    for (const anchor of ["a", "b", "a--report", "b--b", "b--details"])
      expect(body).toContain(`w:name="${bookmarkName(anchor)}"`);
    expect(body).toMatch(new RegExp(`<w:hyperlink [^>]*w:anchor="${bookmarkName("b--details")}"`));
    expect(xml(z, "word/_rels/document.xml.rels")).toContain('Target="https://example.com/x" TargetMode="External"');
    // A chapter a page: b's starts on a new one.
    expect(body.match(/<w:br w:type="page"\/>/g)!.length).toBe(1);
    // Bookmarks Word takes: a letter first, at most 40 characters, unique for anchors alike but for their punctuation.
    for (const anchor of [
      "a",
      "notes-very-long-folder-name-and-a-long-file-name--and-a-heading",
      "1-starts-with-a-digit",
    ])
      expect(bookmarkName(anchor)).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
    expect(bookmarkName("a-b")).not.toBe(bookmarkName("a_b"));
  });

  test("pictures embedded at their size up to the page's width, diagrams and maths rasterised; a WebP made PNG first", async () => {
    const { graph } = root({
      "a.md":
        "# A\n\n![[square.png|20]] ![big](big.svg) ![photo](photo.webp)\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n$$\n\\frac{a}{b}\n$$\n",
      "square.png": png,
      "big.svg": rect(1200, 300),
      "photo.webp": WEBP,
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md"])));
    const media = [...z.keys()].filter((k) => k.startsWith("word/media/") && !k.endsWith("/"));
    expect(media.length).toBe(5);
    // The WebP, 240 by 160, as a PNG: Word holds no WebP.
    expect(media.map((m) => rasterInfo(z.get(m)!)).filter((i) => i?.width === 240)).toEqual([
      { type: "png", width: 240, height: 160 },
    ]);
    const body = xml(z, "word/document.xml");
    // Sizes in EMU (9525 a pixel): the PNG at its |20, the SVG at the page's 600.
    const extents = [...body.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [
      Number(m[1]) / 9525,
      Number(m[2]) / 9525,
    ]);
    expect(extents.slice(0, 2)).toEqual([
      [20, 10],
      [600, 150],
    ]);
    expect(body).toContain("photo");
  });

  test("lists numbered from their own start, nested ones a level in, tasks boxed; a table's header row; code coloured; footnotes; a callout's bar its colour", async () => {
    const { graph } = root({
      "a.md": [
        "# A",
        "",
        "5. five",
        "6. six",
        "   1. inner",
        "",
        "- [ ] open",
        "- [x] done",
        "",
        "| Left | Right |",
        "| :--- | ---: |",
        "| a | 1 |",
        "",
        "```ts",
        "const x = 1; // one",
        "```",
        "",
        "Claim[^n].",
        "",
        "[^n]: The footnote text.",
        "",
        "> [!caution] Hot",
        "> Mind it.",
        "",
      ].join("\n"),
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md"])));
    const numbering = xml(z, "word/numbering.xml");
    expect(numbering).toMatch(/<w:lvl w:ilvl="0"[^>]*><w:start w:val="5"\/>/);
    expect(numbering).toMatch(/<w:lvl w:ilvl="1"[^>]*><w:start w:val="1"\/>/);
    const body = xml(z, "word/document.xml");
    expect(body).toContain("☐ </w:t>");
    expect(body).toContain("☑ </w:t>");
    expect(body).toContain("<w:tblHeader/>");
    expect(body).toMatch(/<w:jc w:val="right"\/>.*?<w:t[^>]*>Right</);
    expect(body).toMatch(/<w:color w:val="CF222E"\/>.*?<w:t[^>]*>const</); // the keyword
    expect(body).toMatch(/<w:i\/>.*?<w:t[^>]*>\/\/ one</); // the comment
    expect(body).toContain('<w:footnoteReference w:id="1"/>');
    expect(xml(z, "word/footnotes.xml")).toContain("The footnote text.");
    expect(body).toMatch(/<w:left w:val="single" w:color="CF222E"/);
  });

  test("Obsidian's highlight in Word's yellow marker; its comments not there", async () => {
    const { graph } = root({ "a.md": OBSIDIAN });
    const body = xml(unzip(await toDocx(await assemble(graph, ["a.md"]))), "word/document.xml");
    expect(body).toMatch(/<w:highlight w:val="yellow"\/>(?:(?!<\/w:r>).)*<w:t[^>]*>splash of </);
    expect(body).toMatch(/<w:highlight w:val="yellow"\/>(?:(?!<\/w:r>).)*<w:t[^>]*>vanilla</);
    expect(body).not.toMatch(/<w:highlight[^>]*>(?:(?!<\/w:r>).)*<w:t[^>]*> here/);
    expect(body).not.toMatch(COMMENTS);
  });
});
