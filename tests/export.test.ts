// Export (plan 10.x): the assembler against a root of its own, each writer's file opened and read back — a .docx
// unzipped here, its XML read — and the formats' names. The CLI's `export` is in cli.test.ts, the TUI's in tui.test.ts.

import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Image, Link, PhrasingContent, RootContent } from "mdast";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { assemble, chapterAnchor, type ExportDoc, type ExportPicture, headingAnchor } from "../src/core/export/assemble.ts";
import { bookmarkName, toDocx } from "../src/core/export/docx.ts";
import { rasterInfo, rasterOf } from "../src/core/export/images.ts";
import { defaultTarget, FORMATS, formatFor } from "../src/core/export/index.ts";
import { openGraph } from "../src/core/graph.ts";
import { remoteImageName } from "../src/core/imagecache.ts";
import { loadRasterizer } from "../src/core/svg.ts";
import { locateVault } from "../src/core/vault.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(30_000);
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-export-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data");
delete process.env.SLIPBOX_CONFIG;

/** A plain blue rectangle, `w` by `h`: a picture with nothing in it. */
const rect = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#0969da"/></svg>`;
let png: Uint8Array;

beforeAll(async () => {
  png = (await loadRasterizer())!.png(rect(40, 20), 40)!;
});

/** A root of its own, holding `files`. */
function root(files: Record<string, string | Uint8Array>) {
  const dir = mkdtempSync(join(sandbox, "root-"));
  mkdirSync(join(dir, ".slipbox"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return { dir, graph: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false) };
}

/** Every node under `nodes`. */
function all(nodes: readonly unknown[]): (RootContent | PhrasingContent)[] {
  return (nodes as (RootContent | PhrasingContent)[]).flatMap((n) => [n, ...("children" in n ? all(n.children) : [])]);
}
const links = (doc: ExportDoc) => doc.chapters.flatMap((ch) => all(ch.nodes)).filter((n): n is Link => n.type === "link");
const textOf = (nodes: readonly unknown[]): string =>
  all(nodes)
    .map((n) => (n.type === "text" ? n.value : n.type === "break" ? "\n" : ""))
    .join("");
const pictures = (doc: ExportDoc) =>
  doc.chapters
    .flatMap((ch) => all(ch.nodes))
    .filter((n): n is Image => n.type === "image")
    .map((n) => ({ alt: n.alt, picture: (n.data as { picture?: ExportPicture } | undefined)?.picture }));

/** A zip's files, by name: what a .docx is. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const out = new Map<string, Uint8Array>();
  let p = v.getUint32(end + 16, true);
  for (let i = v.getUint16(end + 10, true); i > 0; i--) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const [method, size, nameLen, extra, comment, local] = [v.getUint16(p + 10, true), v.getUint32(p + 20, true), v.getUint16(p + 28, true), v.getUint16(p + 30, true), v.getUint16(p + 32, true), v.getUint32(p + 42, true)];
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    out.set(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)), method === 8 ? new Uint8Array(inflateRawSync(data)) : data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
const xml = (z: Map<string, Uint8Array>, name: string) => new TextDecoder().decode(z.get(name));

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
      "a.md": "# A\n\nSee [b](b.md), [[b#Next Steps|its steps]], [gone](b.md#No%20Such), [[c]], [[c|aliased]], [see c](c.md), [web](https://example.com), [[#Later]].\n\n## Later\n\n## Later\n",
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
    const ids = doc.chapters.flatMap((ch) => all(ch.nodes)).flatMap((n) => (n.type === "heading" ? [(n.data as { anchor: string }).anchor] : []));
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
      { alt: "cached", picture: { file: join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)), size: null } },
    ]);
    // Missing: its words; on the web, not fetched: a link to it.
    expect(textOf(doc.chapters[0]!.nodes)).toContain("missing");
    expect(links(doc).map((l) => [textOf(l.children), l.url])).toEqual([["remote", "https://example.com/x.png"]]);
  });

  test("a Mermaid diagram and a display's maths drawn as SVG in print's colours; a diagram not drawn stays code", async () => {
    const { graph } = root({ "a.md": "# A\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n$$\nx^2 + y^2\n$$\n\n```mermaid\npie title Not drawn\n```\n\nInline $\\alpha$.\n" });
    const doc = await assemble(graph, ["a.md"]);
    const [diagram] = pictures(doc);
    expect(diagram!.picture!.kind).toBe("diagram");
    expect(diagram!.picture!.svg).toContain("#1f2328");
    expect(diagram!.picture!.svg).not.toMatch(/var\(|color-mix/);
    const nodes = doc.chapters[0]!.nodes;
    const math = nodes.find((n) => n.type === "math")!;
    expect((math.data as { picture: ExportPicture }).picture).toMatchObject({ kind: "math" });
    expect((math.data as { picture: ExportPicture }).picture.svg).toContain('fill="#1f2328"');
    expect(nodes.filter((n) => n.type === "code").map((n) => (n as { value: string }).value)).toEqual(["pie title Not drawn"]);
    expect(all(nodes).some((n) => n.type === "inlineMath")).toBe(true);
  });

  test("a callout titled, in bold, its kind kept; a quote with its bracket escaped as written", async () => {
    const { graph } = root({ "a.md": "> [!tip] Try it\n> Its text.\n\n> [!WARNING]\n> Careful.\n\n> \\[!note] read as written\n" });
    const [tip, warning, plain] = (await assemble(graph, ["a.md"])).chapters[0]!.nodes as { data?: { callout?: string }; children: RootContent[] }[];
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

  test("each note's footnotes its own: two notes' [^1] two footnotes; HTML in a line: <br> a break, other tags gone, their words kept", async () => {
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
    expect(all(nodes).filter((n) => n.type === "html")).toEqual([]);
  });
});

describe("export: Word (10.4)", () => {
  test("a .docx: its parts, title and author; headings bookmarked, links inside the document to them, the web's out", async () => {
    const { graph } = root({
      "a.md": "---\nauthor: Ada\n---\n\n# Report\n\nSee [[b#Details]] and [the web](https://example.com/x).\n",
      "b.md": "# B\n\n## Details\n\nBody.\n",
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md", "b.md"])));
    expect([...z.keys()]).toEqual(expect.arrayContaining(["[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/footnotes.xml", "docProps/core.xml"]));
    expect(xml(z, "docProps/core.xml")).toContain("<dc:title>Report</dc:title>");
    expect(xml(z, "docProps/core.xml")).toContain("<dc:creator>Ada</dc:creator>");
    const body = xml(z, "word/document.xml");
    for (const anchor of ["a", "b", "a--report", "b--b", "b--details"]) expect(body).toContain(`w:name="${bookmarkName(anchor)}"`);
    expect(body).toMatch(new RegExp(`<w:hyperlink [^>]*w:anchor="${bookmarkName("b--details")}"`));
    expect(xml(z, "word/_rels/document.xml.rels")).toContain('Target="https://example.com/x" TargetMode="External"');
    // A chapter a page: b's starts on a new one.
    expect(body.match(/<w:br w:type="page"\/>/g)!.length).toBe(1);
    // Bookmarks Word takes: a letter first, at most 40 characters, unique for anchors alike but for their punctuation.
    for (const anchor of ["a", "notes-very-long-folder-name-and-a-long-file-name--and-a-heading", "1-starts-with-a-digit"]) expect(bookmarkName(anchor)).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
    expect(bookmarkName("a-b")).not.toBe(bookmarkName("a_b"));
  });

  test("pictures embedded at their size up to the page's width, diagrams and maths rasterised; a WebP its words", async () => {
    const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8L"), 0, 0, 0, 0, 0x2f, 9, 0x40, 2, 0, 0, 0, 0, 0, 0, 0]);
    const { graph } = root({
      "a.md": "# A\n\n![[square.png|20]] ![big](big.svg) ![photo](photo.webp)\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n$$\n\\frac{a}{b}\n$$\n",
      "square.png": png,
      "big.svg": rect(1200, 300),
      "photo.webp": webp,
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md"])));
    const media = [...z.keys()].filter((k) => k.startsWith("word/media/") && !k.endsWith("/"));
    expect(media.length).toBe(4);
    const body = xml(z, "word/document.xml");
    // Sizes in EMU (9525 a pixel): the PNG at its |20, the SVG at the page's 600.
    const extents = [...body.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]) / 9525, Number(m[2]) / 9525]);
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
    expect(body).toContain('<w:tblHeader/>');
    expect(body).toMatch(/<w:jc w:val="right"\/>.*?<w:t[^>]*>Right</);
    expect(body).toMatch(/<w:color w:val="CF222E"\/>.*?<w:t[^>]*>const</); // the keyword
    expect(body).toMatch(/<w:i\/>.*?<w:t[^>]*>\/\/ one</); // the comment
    expect(body).toContain("<w:footnoteReference w:id=\"1\"/>");
    expect(xml(z, "word/footnotes.xml")).toContain("The footnote text.");
    expect(body).toMatch(/<w:left w:val="single" w:color="CF222E"/);
  });
});

describe("export: pictures' sizes, read from their headers", () => {
  test("PNG, GIF, BMP, WebP (lossy, lossless, extended) and JPEG; anything else null", () => {
    const b = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...new TextEncoder().encode(x)] : [x])));
    const zeros = (n: number) => Array<number>(n).fill(0);
    expect(rasterInfo(png)).toEqual({ type: "png", width: 40, height: 20 });
    expect(rasterInfo(b("GIF89a", 0x2c, 1, 0x58, 2, ...zeros(4)))).toEqual({ type: "gif", width: 300, height: 600 });
    expect(rasterInfo(b("BM", ...zeros(16), 0x10, 0, 0, 0, 0xf0, 0xff, 0xff, 0xff, ...zeros(4)))).toEqual({ type: "bmp", width: 16, height: 16 });
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8 ", ...zeros(10), 0x40, 1, 0xf0, 0, ...zeros(2)))).toEqual({ type: "webp", width: 320, height: 240 });
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8L", ...zeros(4), 0x2f, 0x3f, 0x40, 0x3b, 0, ...zeros(8)))).toEqual({ type: "webp", width: 64, height: 238 });
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8X", ...zeros(8), 0x1f, 3, 0, 0xdf, 1, 0))).toEqual({ type: "webp", width: 800, height: 480 });
    // JPEG: past an APP0 segment to the start of frame.
    expect(rasterInfo(b(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 3, ...zeros(6)))).toEqual({ type: "jpg", width: 640, height: 480 });
    expect(rasterInfo(b("not a picture at all, just words"))).toBeNull();
  });

  test("a picture's size shown: its own, Obsidian's width or box, never past the page; an SVG rasterised at twice that", async () => {
    const r = await loadRasterizer();
    const { dir } = root({ "p.png": png, "wide.svg": rect(1000, 500) });
    const shown = (pic: ExportPicture, max = 600) => rasterOf(pic, r, max, ["png"])?.shown;
    expect(shown({ file: join(dir, "p.png") })).toEqual({ width: 40, height: 20 });
    expect(shown({ file: join(dir, "p.png"), size: { width: 30, height: null } })).toEqual({ width: 30, height: 15 });
    expect(shown({ file: join(dir, "p.png"), size: { width: 300, height: 10 } })).toEqual({ width: 20, height: 10 });
    expect(shown({ file: join(dir, "p.png") }, 16)).toEqual({ width: 16, height: 8 });
    const svg = rasterOf({ file: join(dir, "wide.svg") }, r, 600, ["png"])!;
    expect([svg.type, svg.shown, svg.width]).toEqual(["png", { width: 600, height: 300 }, 1200]);
    // A kind the format doesn't hold, or nothing there: null.
    expect(rasterOf({ file: join(dir, "p.png") }, r, 600, ["jpg"])).toBeNull();
    expect(rasterOf({ file: join(dir, "none.png") }, r, 600, ["png"])).toBeNull();
  });
});

describe("export: the formats", () => {
  test("a format by its name, another name for it, or an extension; beside the note, its name, by default", () => {
    expect(FORMATS.map((f) => f.name)).toEqual(["docx"]);
    for (const name of ["docx", "DOCX", ".docx", "word", "doc"]) expect(formatFor(name)?.name).toBe("docx");
    expect(formatFor("odt")).toBeNull();
    expect(defaultTarget("/v/notes/Field Report.md", formatFor("word")!)).toBe("/v/notes/Field Report.docx");
  });
});
