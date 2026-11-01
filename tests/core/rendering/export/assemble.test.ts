import type { RootContent } from "mdast";
// Export (plan 10.x): the assembler against a vault of its own, each writer's file opened and read back — a .docx or an
// EPUB unzipped here and its XML read, a PDF's pages read back to their text, the HTML and Markdown as they are — and
// the formats' names. The CLI's `export` is under tests/cli/export/, the TUI's under tests/tui/documents/export/.

import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  assemble,
  chapterAnchor,
  type ExportPicture,
  headingAnchor,
} from "../../../../src/core/rendering/export/assemble.ts";
import { convertPictures } from "../../../../src/core/rendering/export/assets/convert.ts";
import { remoteImageName } from "../../../../src/core/rendering/media/images/imagecache.ts";
import { loadRasterizer } from "../../../../src/core/rendering/media/images/svg.ts";
import { makeExportFixture, png } from "../../../support/export-fixture.ts";
import { bmpFile } from "../../../support/export-pictures.ts";
import { all, links, textOf, pictures, OBSIDIAN, COMMENTS } from "../../../support/export-nodes.ts";
import { unzip, xml, readPdf } from "../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, root, exportOf } = makeExportFixture();

describe("export: the assembler (10.1)", () => {
  test("each note a chapter, in the order given, titled; the first note's frontmatter the document's title, author, date", async () => {
    const { graph } = root({
      "a.md": "---\ntitle: The Report\nauthors: [Ada, Grace]\ndate: 2026-10-09\n---\n\n# Report\n\nText.\n",
      "notes/b.md": "Just words, no heading.\n",
    });
    const doc = await assemble(graph, ["notes/b.md", "a.md"]);
    expect(doc.chapters.map((c) => [c.rel, c.title, c.anchor])).toEqual([
      ["notes/b.md", "b", "notes-b"],
      ["a.md", "The Report", "a"],
    ]);
    // The first note's: b has none.
    expect([doc.title, doc.author, doc.date]).toEqual(["b", null, null]);
    const other = await assemble(graph, ["a.md"]);
    expect([other.title, other.author, other.date]).toEqual(["The Report", "Ada, Grace", "2026-10-09"]);
    // Frontmatter isn't a block of the document.
    expect(other.chapters[0]!.nodes.map((n) => n.type)).toEqual(["heading", "paragraph"]);
    expect(chapterAnchor("notes/Field Report.markdown")).toBe("notes-field-report");
    expect(headingAnchor("notes-b", "Next Steps")).toBe("notes-b--next-steps");
  });

  test("links: to a note exported inside the document, to its heading (to its chapter where that's gone); to a note not exported, its text; the web's kept", async () => {
    const { graph } = root({
      "a.md":
        "# A\n\nSee [b](b.md), [[b#Next Steps|its steps]], [gone](b.md#No%20Such), [[c]], [[c|aliased]], [see c](c.md), [web](https://example.com), [[#Later]].\n\n## Later\n\n## Later\n",
      "b.md": "# B\n\n## Next Steps\n",
      "c.md": "# C\n",
    });
    const doc = await assemble(graph, ["a.md", "b.md"]);
    expect(links(doc).map((l) => [textOf(l.children), l.url])).toEqual([
      ["b", "#b"],
      ["its steps", "#b--next-steps"],
      ["gone", "#b"],
      ["web", "https://example.com"],
      ["Later", "#a--later"],
    ]);
    // Not exported: its words, the alias where it has one.
    expect(textOf(doc.chapters[0]!.nodes)).toContain(", c, aliased, see c, ");
    // A name a second time: numbered, as GitHub does.
    const ids = doc.chapters
      .flatMap((ch) => all(ch.nodes))
      .flatMap((n) => (n.type === "heading" ? [(n.data as { anchor: string }).anchor] : []));
    expect(ids).toEqual(["a--a", "a--later", "a--later-1", "b--b", "b--next-steps"]);
  });

  test("embeds drawn in, their links read from where their note is; a note drawn into itself is its words, not a loop", async () => {
    const { graph } = root({
      "a.md": "# A\n\n![[sub/b#Part]]\n\n![[a]]\n",
      "sub/b.md": "# B\n\n## Part\n\nPart of b, linking [[a]] and [c](c.md).\n\n## Other\n\nNot drawn in.\n",
      "sub/c.md": "# C\n",
    });
    const doc = await assemble(graph, ["a.md", "sub/c.md"]);
    const text = textOf(doc.chapters[0]!.nodes);
    expect(text).toContain("Part of b, linking ");
    expect(text).not.toContain("Not drawn in");
    // From b's folder, `c.md` is sub/c.md: exported, a link. a's embed of itself isn't drawn in: a link to its chapter.
    expect(links(doc).map((l) => [textOf(l.children), l.url])).toEqual([
      ["a", "#a"],
      ["c", "#sub-c"],
      ["a", "#a"],
    ]);
    expect(doc.chapters[0]!.nodes.map((n) => n.type)).toEqual(["heading", "heading", "paragraph", "paragraph"]);
  });

  test("pictures: a file found as on screen, Obsidian's size kept; one missing its words; one on the web its cached copy, else its link — nothing fetched", async () => {
    const cached = "https://example.com/cached.png";
    mkdirSync(join(sandbox, "cache", "slipbox", "images"), { recursive: true });
    writeFileSync(join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)), png);
    const { dir, graph } = root({
      "notes/a.md": `# A\n\n![square](../pics/square.png) ![[square.png|30]] ![[square.png|30x10]]\n\n![missing](none.png) ![remote](https://example.com/x.png) ![cached](${cached})\n`,
      "pics/square.png": png,
    });
    const doc = await assemble(graph, ["notes/a.md"]);
    const file = join(dir, "pics", "square.png");
    expect(pictures(doc)).toEqual([
      { alt: "square", picture: { file, size: null } },
      { alt: "square.png", picture: { file, size: { width: 30, height: null } } },
      { alt: "square.png", picture: { file, size: { width: 30, height: 10 } } },
      {
        alt: "cached",
        picture: {
          file: join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)),
          size: null,
          url: cached,
        },
      },
    ]);
    // Missing: its words; on the web, not fetched: a link to it.
    expect(textOf(doc.chapters[0]!.nodes)).toContain("missing");
    expect(links(doc).map((l) => [textOf(l.children), l.url, l.data?.remoteImage])).toEqual([
      ["remote", "https://example.com/x.png", true],
    ]);
  });

  test("export assembles forty distinct diagrams without queue fallbacks", async () => {
    const source = Array.from(
      { length: 40 },
      (_, n) => `\`\`\`mermaid\ngraph TD\n A[Export ${n}] --> B\n\`\`\`\n`,
    ).join("\n");
    const { graph } = root({ "many.md": source });
    const doc = await assemble(graph, ["many.md"]);
    expect(pictures(doc).filter((p) => p.picture?.kind === "diagram")).toHaveLength(40);
  });

  test("a Mermaid diagram and a display's maths drawn as SVG in print's colours; a diagram not drawn stays code", async () => {
    const { graph } = root({
      "a.md":
        "# A\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n$$\nx^2 + y^2\n$$\n\n```mermaid\npie title Not drawn\n```\n\nInline $\\alpha$.\n",
    });
    const doc = await assemble(graph, ["a.md"]);
    const [diagram] = pictures(doc);
    expect(diagram!.picture!.kind).toBe("diagram");
    expect(diagram!.picture!.svg).toContain("#1f2328");
    expect(diagram!.picture!.svg).not.toMatch(/var\(|color-mix/);
    const nodes = doc.chapters[0]!.nodes;
    const math = nodes.find((n) => n.type === "math")!;
    expect((math.data as { picture: ExportPicture }).picture).toMatchObject({ kind: "math" });
    expect((math.data as { picture: ExportPicture }).picture.svg).toContain('fill="#1f2328"');
    expect(nodes.filter((n) => n.type === "code").map((n) => (n as { value: string }).value)).toEqual([
      "pie title Not drawn",
    ]);
    expect(all(nodes).some((n) => n.type === "inlineMath")).toBe(true);
  });

  test("a callout titled, in bold, its kind kept; a quote with its bracket escaped as written", async () => {
    const { graph } = root({
      "a.md": "> [!tip] Try it\n> Its text.\n\n> [!WARNING]\n> Careful.\n\n> \\[!note] read as written\n",
    });
    const [tip, warning, plain] = (await assemble(graph, ["a.md"])).chapters[0]!.nodes as {
      data?: { callout?: string };
      children: RootContent[];
    }[];
    expect(tip!.data?.callout).toBe("tip");
    expect(tip!.children.map((p) => [p.type, textOf([p])])).toEqual([
      ["paragraph", "Try it"],
      ["paragraph", "Its text."],
    ]);
    expect(all(tip!.children)[1]).toMatchObject({ type: "strong" });
    expect(warning!.data?.callout).toBe("warning");
    expect(textOf([warning!.children[0]])).toBe("Warning");
    expect(textOf([warning!.children[1]])).toBe("Careful.");
    expect(plain!.data?.callout).toBeUndefined();
    expect(textOf(plain!.children)).toBe("[!note] read as written");
  });

  test("each note's footnotes its own: two notes' [^1] two footnotes; inline HTML retains hard breaks and keyboard code", async () => {
    const { graph } = root({
      "a.md": "# A\n\nA's claim[^1], and <kbd>Ctrl</kbd> then<br>next.\n\n![[b]]\n\n[^1]: A's note.\n",
      "b.md": "B's claim[^1].\n\n[^1]: B's note.\n",
    });
    const doc = await assemble(graph, ["a.md"]);
    const nodes = doc.chapters[0]!.nodes;
    const refs = all(nodes).flatMap((n) => (n.type === "footnoteReference" ? [n.identifier] : []));
    const defs = nodes.flatMap((n) => (n.type === "footnoteDefinition" ? [[n.identifier, textOf(n.children)]] : []));
    expect(new Set(refs).size).toBe(2);
    expect(defs.map(([id]) => id).sort()).toEqual([...refs].sort());
    expect(defs.find(([id]) => id === refs[0])![1]).toBe("A's note.");
    expect(defs.find(([id]) => id === refs[1])![1]).toBe("B's note.");
    expect(textOf([nodes[1]])).toBe("A's claim, and Ctrl then\nnext.");
    expect(all(nodes).filter((n) => n.type === "inlineCode")).toContainEqual(
      expect.objectContaining({ value: "Ctrl" }),
    );
    expect(all(nodes).filter((n) => n.type === "html")).toEqual([]);
  });

  test("Obsidian's comments left out — in a line, a paragraph of them, one over blank lines — the space where one was made one; a highlight kept", async () => {
    const { graph } = root({ "a.md": OBSIDIAN });
    const nodes = (await assemble(graph, ["a.md"])).chapters[0]!.nodes;
    expect(nodes.map((n) => n.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(textOf([nodes[1]])).toBe("A splash of vanilla here, always fresh.");
    expect(all(nodes).filter((n) => n.type === "comment" || n.type === "commentBlock")).toEqual([]);
    expect(
      all(nodes)
        .filter((n) => n.type === "highlight")
        .map((n) => textOf([n])),
    ).toEqual(["splash of vanilla"]);
    expect(JSON.stringify(nodes)).not.toMatch(COMMENTS);
  });
});

describe("export: what the assembler keeps safe and says (10.1)", () => {
  test("a link with a scheme a document shouldn't carry (javascript:, file:) is its text; a picture's too", async () => {
    const { graph } = root({
      "a.md":
        "# A\n\n[run](javascript:alert(1)) [disk](file:///etc/passwd) [mail](mailto:a@b.c) ![x](javascript:alert(2))\n",
    });
    const doc = await assemble(graph, ["a.md"]);
    expect(links(doc).map((l) => l.url)).toEqual(["mailto:a@b.c"]);
    expect(textOf(doc.chapters[0]!.nodes)).toContain("run disk mail x");
    expect(JSON.stringify(doc)).not.toContain("javascript:");
  });

  test("a picture from outside the root, or a link in it leading out, held by no format: its words (DF-D24)", async () => {
    const outside = mkdtempSync(join(sandbox, "outside-"));
    writeFileSync(join(outside, "photo.png"), png);
    writeFileSync(join(outside, "dot.bmp"), bmpFile(1, 1, 24, [[0, 0, 255]]));
    const away = relative(sandbox, outside);
    const r = root({
      "a.md": `# A\n\n![far](../${away}/photo.png) ![in](linked.png) ![bmp](../${away}/dot.bmp) ![ok](pic.png)\n`,
      "pic.png": png,
    });
    symlinkSync(join(outside, "photo.png"), join(r.dir, "linked.png"));
    const doc = await assemble(r.graph, ["a.md"]);
    expect(pictures(doc).map((p) => p.picture?.outside ?? false)).toEqual([true, true, true, false]);
    // Not read for a format that would make it PNG first.
    await convertPictures(doc, ["png", "jpg"], await loadRasterizer());
    expect(pictures(doc).map((p) => p.picture?.data)).toEqual([undefined, undefined, undefined, undefined]);
    // Each format: the root's picture alone, the others their words.
    const media = [...unzip((await exportOf(r, ["a.md"], "docx")).data)].filter(
      ([k]) => k.startsWith("word/media/") && !k.endsWith("/"),
    );
    expect(media.length).toBe(1);
    const docx = xml(unzip((await exportOf(r, ["a.md"], "docx")).data), "word/document.xml");
    for (const words of ["far", "in", "bmp"]) expect(docx).toContain(`>${words}</w:t>`);
    const html = (await exportOf(r, ["a.md"], "html")).text;
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('alt="ok"');
    expect(html).toContain("<em>far</em> <em>in</em> <em>bmp</em>");
    const epub = unzip((await exportOf(r, ["a.md"], "epub")).data);
    expect([...epub.keys()].filter((k) => k.startsWith("OEBPS/images/") && !k.endsWith("/"))).toHaveLength(1);
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.images[0]).toBe(1);
    expect(pdf.pages.join("\n")).toContain("far\nin\nbmp");
  });

  test("a footnote's id names its note by a hash, never by the path it's at; maths in a line typeset too; the language said", async () => {
    const r = root({ "a.md": "---\nlang: tr\n---\n\n# A\n\nA claim[^1] and $x^2$.\n\n[^1]: Its note.\n" });
    const doc = await assemble(r.graph, ["a.md"]);
    expect(doc.lang).toBe("tr");
    expect(
      JSON.stringify(
        doc.chapters[0]!.nodes.filter((n) => n.type === "footnoteDefinition").map(
          (n) => (n as { identifier: string }).identifier,
        ),
      ),
    ).not.toContain(r.dir);
    const inline = all(doc.chapters[0]!.nodes).find((n) => n.type === "inlineMath")!;
    expect((inline.data as { picture: ExportPicture }).picture).toMatchObject({ kind: "math", inline: true });
    expect((inline.data as { picture: ExportPicture }).picture.svg).toMatch(/<svg[^>]*vertical-align/);
  });

  test("a diagram keeps its source, for a format that writes it as written; a callout says whether it was titled", async () => {
    const { graph } = root({
      "a.md": "```mermaid\ngraph TD\n  A --> B\n```\n\n> [!tip] Titled\n\n> [!note]\n> Not.\n",
    });
    const nodes = (await assemble(graph, ["a.md"])).chapters[0]!.nodes;
    const image = all(nodes).find((n) => n.type === "image")!;
    expect((image.data as { code: { lang: string; value: string } }).code).toMatchObject({
      lang: "mermaid",
      value: "graph TD\n  A --> B",
    });
    expect(
      nodes.filter((n) => n.type === "blockquote").map((n) => (n.data as { calloutTitled: boolean }).calloutTitled),
    ).toEqual([true, false]);
  });
});
