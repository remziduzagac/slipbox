import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { assemble } from "../../../../../src/core/rendering/export/assemble.ts";
import { findFonts } from "../../../../../src/core/rendering/export/assets/fonts.ts";
import { pdfDocument, splitByFont, toPdf, words } from "../../../../../src/core/rendering/export/formats/pdf.ts";
import { TINT } from "../../../../../src/core/rendering/export/assets/style.ts";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { rect, WEBP, GIF, bmpFile } from "../../../../support/export-pictures.ts";
import { OBSIDIAN, COMMENTS } from "../../../../support/export-nodes.ts";
import { unzip, xml, tint, readPdf } from "../../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { root, exportOf } = makeExportFixture();

describe("export: PDF (10.5)", () => {
  test("document HTML survives PDF assembly with explicit headings, linked images and expanded details", async () => {
    const r = root({
      "a.md":
        '# HTML export\n\n<div><h2 id="inside">HTML heading</h2><p><u>Underlined</u> and <b>bold</b>.</p><a href="https://example.com"><img src="square.png" width=20 alt="Local badge"></a></div>\n\n<details>\n<summary>More</summary>\n\nBody from a disclosure.\n\n</details>\n\n<script>omitted()</script>\n',
      "square.png": png,
    });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.pages.join("\n")).toContain("HTML heading");
    expect(pdf.pages.join("\n")).toContain("Underlined and bold.");
    expect(pdf.pages.join("\n")).toContain("Body from a disclosure.");
    expect(pdf.pages.join("\n")).not.toContain("omitted");
    expect(pdf.dests).toContain("a--inside");
    expect(pdf.images[0]).toBe(1);
    expect(pdf.links).toContainEqual({ uri: "https://example.com" });
    const word = xml(unzip((await exportOf(r, ["a.md"], "docx")).data), "word/document.xml");
    expect(word).toMatch(/<w:hyperlink[^>]*>[\s\S]*?<w:drawing/);
  });

  test("embedded HTML remains document content and lossless Markdown even when the outer note has no HTML", async () => {
    const raw = "<DIV><b>__original__ &amp; HTML</b></DIV>";
    const r = root({
      "a.md": "# Outer\n\n![[inner]]\n",
      "inner.md": "# Inner\n\n" + raw + "\n\nWords <script>omitted()</script> remain.\n",
    });
    const html = (await exportOf(r, ["a.md"], "html")).text;
    expect(html).toContain("<strong>__original__ &#x26; HTML</strong>");
    expect(html).not.toContain("omitted");
    const markdown = (await exportOf(r, ["a.md"], "md")).text;
    expect(markdown).toContain(raw);
    expect(markdown).not.toContain("omitted");
    expect(markdown).toContain("Words  remain.");
  });

  test("a chapter from a new page, its text read back; each heading a destination, the outline the chapters and their sections", async () => {
    const r = root({
      "a.md":
        "---\nauthor: Ada\n---\n\n# Report\n\nSee [[b#Details]] and [the web](https://example.com/x).\n\n## Findings\n\nSome *found* things.\n",
      "b.md": "# B\n\n## Details\n\nBody text.\n",
    });
    const pdf = readPdf((await exportOf(r, ["a.md", "b.md"], "pdf")).data);
    expect(pdf.pages.length).toBe(2);
    expect(pdf.pages[0]).toStartWith("Report\nSee b and the web.\nFindings\nSome found things.");
    expect(pdf.pages[1]).toStartWith("B\nDetails\nBody text.");
    // The page numbers at their feet.
    expect(pdf.pages.map((p) => p.split("\n").at(-1))).toEqual(["1", "2"]);
    expect(pdf.dests).toEqual(expect.arrayContaining(["a", "b", "a--report", "a--findings", "b--b", "b--details"]));
    // Just these: a run after a link never carries it on.
    expect(pdf.links).toEqual([{ dest: "b--details" }, { uri: "https://example.com/x" }]);
    expect(pdf.outline).toEqual(expect.arrayContaining(["Report", "Findings", "B", "Details"]));
    // No font loaded until a run names one: pdfkit's default, Helvetica, isn't in a compiled slipbox.
    expect((pdfDocument(await assemble(r.graph, ["a.md"])) as unknown as { _font: unknown })._font).toBeNull();
  });

  test("pictures drawn (an SVG rasterised; a GIF, a WebP, a BMP made PNG first); code, a table, a quote, lists and notes read back", async () => {
    const r = root({
      "a.md": [
        "# A",
        "",
        "![[square.png]] ![v](v.svg) ![g](g.gif) ![photo](p.webp) ![dot](d.bmp) ![broken](x.webp)",
        "",
        "```ts",
        "const answer = 42;",
        "```",
        "",
        "| Name | Count |",
        "| --- | ---: |",
        "| apples | 3 |",
        "",
        "> Quoted words.",
        "",
        "3. third",
        "4. fourth",
        "",
        "Claim[^n].",
        "",
        "[^n]: The note.",
        "",
      ].join("\n"),
      "square.png": png,
      "v.svg": rect(100, 50),
      "g.gif": GIF,
      "p.webp": WEBP,
      "d.bmp": bmpFile(1, 1, 24, [[0, 0, 255]]),
      // A WebP's header and nothing more: it can't be read, so it's its words.
      "x.webp": new Uint8Array([
        ...new TextEncoder().encode("RIFF"),
        0,
        0,
        0,
        0,
        ...new TextEncoder().encode("WEBPVP8L"),
        0,
        0,
        0,
        0,
        0x2f,
        9,
        0x40,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]),
    });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.images[0]).toBe(5);
    const text = pdf.pages.join("\n");
    expect(text).not.toContain("photo");
    for (const words of [
      "broken",
      "const answer = 42;",
      "NameCount\napples3",
      "Quoted words.",
      "3.third\n4.fourth",
      "Claim¹.",
      "Notes\n1.The note.",
    ])
      expect(text).toContain(words);
    expect(pdf.links).toEqual(expect.arrayContaining([{ dest: "a--note-1" }]));
    expect(pdf.dests).toContain("a--note-1");
  });

  test("set in PDF's own fonts where the machine has none: Latin-1 as it is, the rest a question mark", async () => {
    const r = root({ "a.md": "# Café\n\nNaïve → 日本\n" });
    const doc = await assemble(r.graph, ["a.md"]);
    const pdf = readPdf(await toPdf(doc, findFonts(new Map())));
    expect(pdf.fonts).toEqual(expect.arrayContaining(["Helvetica", "Helvetica-Bold"]));
    expect(pdf.pages[0]).toStartWith("Café\nNaïve ? ??");
  });
});

describe("export: a PDF's fonts", () => {
  const files = (...names: string[]) => new Map(names.map((n) => [n.toLowerCase(), `/f/${n}`]));
  test("the first sans family with all four faces, before one with fewer; else the first there, a missing face its nearest", () => {
    const lato = ["Lato-Regular.ttf", "Lato-Bold.ttf", "Lato-Italic.ttf", "Lato-BoldItalic.ttf"];
    const f = findFonts(
      files("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", ...lato, "DejaVuSansMono.ttf", "NotoSansCJK-Regular.ttc"),
    );
    expect([f.regular, f.bold, f.italic, f.boldItalic].map((x) => x.path)).toEqual(lato.map((n) => `/f/${n}`));
    expect([f.mono.path, f.monoBold.path]).toEqual(["/f/DejaVuSansMono.ttf", "/f/DejaVuSansMono.ttf"]);
    expect(f.fallbacks.map((x) => x.path)).toEqual(["/f/DejaVuSans.ttf", "/f/NotoSansCJK-Regular.ttc"]);
    const partial = findFonts(files("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"));
    expect(
      [partial.regular, partial.bold, partial.italic, partial.boldItalic, partial.mono].map((x) => x.path),
    ).toEqual([
      "/f/DejaVuSans.ttf",
      "/f/DejaVuSans-Bold.ttf",
      "/f/DejaVuSans.ttf",
      "/f/DejaVuSans-Bold.ttf",
      "/f/DejaVuSans.ttf",
    ]);
    expect(partial.fallbacks).toEqual([]);
    // A face in a collection by its PostScript name.
    expect(findFonts(files("Helvetica.ttc")).bold).toEqual({ path: "/f/Helvetica.ttc", ps: "Helvetica-Bold" });
    expect(findFonts(new Map()).builtin).toBe(true);
    // Emoji in black and white, before CJK (10.12); a colour emoji font isn't one: it has no outlines.
    const emoji = findFonts(
      files(...lato, "DejaVuSans.ttf", "NotoColorEmoji.ttf", "NotoSansCJK-Regular.ttc", "NotoEmoji-Regular.ttf"),
    );
    expect(emoji.fallbacks.map((x) => x.path)).toEqual([
      "/f/DejaVuSans.ttf",
      "/f/NotoEmoji-Regular.ttf",
      "/f/NotoSansCJK-Regular.ttc",
    ]);
  });

  test("a character the font hasn't got taken from the first fallback that has it; a mark stays with its letter", () => {
    const has = (font: string, cp: number) =>
      font === "body" ? cp < 0x2000 : font === "symbols" ? cp >= 0x2190 && cp < 0x2800 : cp >= 0x4e00;
    expect(splitByFont("a → 日本 b", "body", has, ["symbols", "cjk"])).toEqual([
      { text: "a ", key: "body" },
      { text: "→", key: "symbols" },
      { text: " ", key: "body" },
      { text: "日本", key: "cjk" },
      { text: " b", key: "body" },
    ]);
    // None has it: the font's own box.
    expect(splitByFont("x\u{1f600}", "body", has, ["symbols"])).toEqual([{ text: "x\u{1f600}", key: "body" }]);
    expect(splitByFont("→\u0301", "body", has, ["symbols"])).toEqual([{ text: "→\u0301", key: "symbols" }]);
  });
});

describe("export: a PDF's lines laid out (10.11)", () => {
  test("where a line may break: between words, after a newline (it must), either side of a picture, between CJK", () => {
    expect(words("a b")).toEqual([
      { end: 2, required: false },
      { end: 3, required: false },
    ]);
    expect(words("a\nb")).toEqual([
      { end: 2, required: true },
      { end: 3, required: false },
    ]);
    expect(words("x\ufffcy")).toEqual([
      { end: 1, required: false },
      { end: 2, required: false },
      { end: 3, required: false },
    ]);
    expect(words("日本語").map((w) => w.end)).toEqual([1, 2, 3]);
    expect(words("e.g. this")).toEqual([
      { end: 5, required: false },
      { end: 9, required: false },
    ]);
  });

  test("a picture in a sentence drawn in its line, maths on the baseline typeset, inline code on a tint", async () => {
    const r = root({
      "a.md": "# A\n\nBefore ![[square.png|20]] after, and $x^2$ too, with `code` here.\n",
      "square.png": png,
    });
    const bytes = (await exportOf(r, ["a.md"], "pdf")).data;
    const pdf = readPdf(bytes);
    // One line: the words either side of the picture and the maths, and both drawn on it.
    expect(pdf.pages[0]!.split("\n")[1]).toBe("Before  after, and  too, with code here.");
    expect(pdf.images[0]).toBe(2);
    expect(pdf.content[0]).toContain(`${tint(TINT.inline)} scn`);
  });

  test("Obsidian's highlight on a marker's yellow; its comments not there", async () => {
    const pdf = readPdf((await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "pdf")).data);
    expect(pdf.pages[0]).toContain("A splash of vanilla here, always fresh.");
    expect(pdf.content[0]).toContain(`${tint(TINT.mark)} scn`);
    expect(pdf.pages.join("\n")).not.toMatch(COMMENTS);
  });

  test("a word longer than a line cut where it fits; a long line wrapped; a newline kept", async () => {
    const long = "x".repeat(400);
    const r = root({ "a.md": `# A\n\n${long}\n\n${"word ".repeat(120).trim()}\n\nOne\\\ntwo\n` });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    const lines = pdf.pages[0]!.split("\n");
    const cut = lines.filter((l) => /^x+$/.test(l));
    expect(cut.length).toBeGreaterThan(1);
    expect(cut.join("")).toBe(long);
    const wrapped = lines.filter((l) => l.startsWith("word"));
    expect(wrapped.length).toBeGreaterThan(2);
    expect(wrapped.join(" ").split(/\s+/).length).toBe(120);
    expect(lines).toEqual(expect.arrayContaining(["One", "two"]));
  });

  test("a table's column never narrower than its longest word; its cells' words whole", async () => {
    const r = root({
      "a.md": `| Term | Meaning |\n| --- | --- |\n| photosynthesis | ${"the way a plant makes its food from light ".repeat(8).trim()} |\n`,
    });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.pages[0]).toContain("photosynthesis");
  });
});
