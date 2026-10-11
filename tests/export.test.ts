// Export (plan 10.x): the assembler against a root of its own, each writer's file opened and read back — a .docx or an
// EPUB unzipped here and its XML read, a PDF's pages read back to their text, the HTML and Markdown as they are — and
// the formats' names. The CLI's `export` is in cli.test.ts, the TUI's in tui.test.ts.

import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { crc32, inflateRawSync, inflateSync } from "node:zlib";
import type { Image, Link, PhrasingContent, RootContent } from "mdast";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { assemble, chapterAnchor, type ExportDoc, type ExportPicture, headingAnchor } from "../src/core/export/assemble.ts";
import { convertPictures, decodeBmp, decodeWebp, encodePng, toPng } from "../src/core/export/convert.ts";
import { bookmarkName, toDocx } from "../src/core/export/docx.ts";
import { findFonts } from "../src/core/export/fonts.ts";
import { rasterInfo, rasterOf } from "../src/core/export/images.ts";
import { defaultTarget, EXPORT_MARK, exportNotes, exportTarget, FORMATS, formatFor, isExport, writeExport } from "../src/core/export/index.ts";
import { pdfDocument, splitByFont, toPdf, words } from "../src/core/export/pdf.ts";
import { TINT } from "../src/core/export/style.ts";
import { slugify } from "../src/core/parse.ts";
import { userFolders } from "../src/core/paths.ts";
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

/** A real WebP from the reference set: a harbour photo, 240 by 160. */
const WEBP = readFileSync(join(import.meta.dir, "..", "examples", "home", "hobbies", "photography", "images", "harbour-01.webp"));
/** A GIF of one red pixel. */
const GIF = Buffer.from("R0lGODdhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs=", "base64");

/** A BMP made byte by byte: `rows` as the file holds them (bottom-up unless `height` is negative), each padded to 4. */
function bmpFile(width: number, height: number, bpp: number, rows: number[][], o: { palette?: number[]; masks?: number[]; compression?: number; core?: boolean } = {}): Uint8Array {
  const header = o.core ? 12 : 40;
  const masks = o.masks ?? [];
  const palette = o.palette ?? [];
  const stride = Math.ceil((bpp * width) / 32) * 4;
  const offset = 14 + header + masks.length * 4 + palette.length;
  const b = new Uint8Array(offset + stride * Math.abs(height));
  const v = new DataView(b.buffer);
  b.set([0x42, 0x4d]);
  v.setUint32(2, b.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, header, true);
  if (o.core) {
    v.setUint16(18, width, true);
    v.setInt16(20, height, true);
    v.setUint16(22, 1, true);
    v.setUint16(24, bpp, true);
  } else {
    v.setInt32(18, width, true);
    v.setInt32(22, height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, bpp, true);
    v.setUint32(30, o.compression ?? 0, true);
    if (palette.length) v.setUint32(46, palette.length / 4, true);
  }
  masks.forEach((m, i) => v.setUint32(14 + header + i * 4, m, true));
  b.set(palette, 14 + header + masks.length * 4);
  rows.forEach((row, i) => b.set(row, offset + i * stride));
  return b;
}

/** A PNG's pixels, as `encodePng` writes them (each row unfiltered). */
function pngPixels(png: Uint8Array): { width: number; height: number; data: number[] } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const [width, height] = [v.getUint32(16), v.getUint32(20)];
  // Eight bits a channel, red, green, blue and alpha.
  expect([png[24], png[25]]).toEqual([8, 6]);
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const len = v.getUint32(at);
    // Each chunk's check: over its type and its data.
    expect(v.getUint32(at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)));
    if (new TextDecoder().decode(png.subarray(at + 4, at + 8)) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    expect(rows[y * (width * 4 + 1)]).toBe(0);
    data.push(...rows.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)));
  }
  return { width, height, data };
}

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

/** A root's notes exported as `format` to `target` (from the root): the document, and what's beside it. */
async function exportOf(r: ReturnType<typeof root>, rels: string[], format: string, target = `out.${formatFor(format)!.ext}`) {
  const abs = join(r.dir, target);
  const out = await exportNotes(r.graph, rels, formatFor(format)!, abs);
  return { ...out, abs, text: new TextDecoder().decode(out.data) };
}

/** Why `doc` isn't well-formed XML — a tag never closed, a `<` or an `&` loose, an attribute with no value — or null. */
function notWellFormed(doc: string): string | null {
  const body = doc.replace(/^<\?xml[^?]*\?>/, "").replace(/<!DOCTYPE[^>]*>/i, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack: string[] = [];
  const token = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g;
  for (const m of body.matchAll(token)) {
    if (m[0] === "<") return `a loose "<" at ${m.index}: ${body.slice(m.index, m.index + 60)}`;
    if (m[0] === "&") return `an entity XML doesn't know at ${m.index}: ${body.slice(m.index, m.index + 20)}`;
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> closes what isn't open`;
    } else if (!m[4]) stack.push(m[2]!);
  }
  return stack.length ? `<${stack.at(-1)}> never closed` : null;
}

/** A colour as a PDF writes it: `#rrggbb`'s three parts, 0 to 1. */
const tint = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).join(" ");

interface PdfRead {
  /** Each page's text, a line a text position. */
  pages: string[];
  /** Each page's content as written: what it draws. */
  content: string[];
  /** The named destinations a link can go to. */
  dests: string[];
  links: { dest?: string; uri?: string }[];
  outline: string[];
  /** The pictures drawn on each page. */
  images: number[];
  fonts: string[];
}

/** A PDF read back: its pages' text (through each font's map of codes to Unicode), its destinations, links and outline. */
function readPdf(bytes: Uint8Array): PdfRead {
  const raw = Buffer.from(bytes).toString("latin1");
  const objs = new Map<number, string>();
  for (const m of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]!);
  const stream = (n: number): string => {
    const body = objs.get(n) ?? "";
    const len = Number(/\/Length (\d+)/.exec(body)?.[1] ?? 0);
    const at = body.search(/stream\r?\n/);
    if (at < 0) return "";
    const data = Buffer.from(body.slice(body.indexOf("\n", at) + 1).slice(0, len), "latin1");
    return (body.includes("/FlateDecode") ? inflateSync(data) : data).toString("latin1");
  };
  const ref = (body: string, key: string) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(body)?.[1] ?? 0);
  const utf16 = (hex: string) => String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => Number.parseInt(h, 16)));
  const unicode = new Map<number, Map<number, string> | null>();
  const cmapOf = (font: number) => {
    if (!unicode.has(font)) {
      const to = ref(objs.get(font) ?? "", "ToUnicode");
      const map = to ? new Map<number, string>() : null;
      if (to && map) {
        const s = stream(to);
        for (const m of s.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*\[([^\]]*)\]/gi)) {
          let code = Number.parseInt(m[1]!, 16);
          // A ligature's characters may be written apart: `<0066 0074>`, "ft".
          for (const u of m[3]!.matchAll(/<([\da-f\s]+)>/gi)) map.set(code++, utf16(u[1]!.replace(/\s/g, "")));
        }
        for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of block[1]!.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(Number.parseInt(m[1]!, 16), utf16(m[2]!));
      }
      unicode.set(font, map);
    }
    return unicode.get(font)!;
  };
  const pagesObj = [...objs.values()].find((b) => /\/Type \/Pages\b/.test(b))!;
  const order = [.../\/Kids \[([^\]]*)\]/.exec(pagesObj)![1]!.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const pages: string[] = [];
  const contents: string[] = [];
  const images: number[] = [];
  for (const p of order) {
    const page = objs.get(p)!;
    const res = objs.get(ref(page, "Resources")) ?? "";
    const fonts = new Map([...res.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => [m[1]!, Number(m[2])]));
    const content = stream(ref(page, "Contents"));
    let font = 0;
    let text = "";
    let line = Number.NaN;
    for (const m of content.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ|1 0 0 1 [\d.-]+ ([\d.-]+) Tm\n/g)) {
      if (m[1]) font = fonts.get(m[1]) ?? 0;
      // A run set further on the same line goes on with it; one lower starts a new line.
      else if (m[3] !== undefined) {
        if (Math.abs(Number(m[3]) - line) > 0.5 && text && !text.endsWith("\n")) text += "\n";
        line = Number(m[3]);
      }
      else if (m[2] !== undefined) {
        const map = cmapOf(font);
        for (const h of m[2].matchAll(/<([\da-f]*)>/gi)) {
          const codes = map ? (h[1]!.match(/.{4}/g) ?? []).map((c) => Number.parseInt(c, 16)) : (h[1]!.match(/.{2}/g) ?? []).map((c) => Number.parseInt(c, 16));
          text += codes.map((c) => (map ? (map.get(c) ?? "?") : String.fromCharCode(c))).join("");
        }
      }
    }
    pages.push(text.trim());
    contents.push(content);
    images.push((content.match(/\/I\d+ Do/g) ?? []).length);
  }
  const str = (s: string) => s.replace(/\\([()\\])/g, "$1");
  // A named destination: `(name) [page /XYZ x y zoom]`; a link to one, `/S /GoTo /D (name)`.
  const dests = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\) \[\d+ 0 R \/XYZ/g)].map((m) => str(m[1]!));
  const links = [...objs.values()].filter((b) => /\/Subtype \/Link/.test(b)).map((annot) => {
    // Its action an object of its own.
    const b = objs.get(ref(annot, "A")) ?? annot;
    const dest = /\/D \(((?:[^()\\]|\\.)*)\)/.exec(b)?.[1];
    const uri = /\/URI \(((?:[^()\\]|\\.)*)\)/.exec(b)?.[1];
    return { ...(dest !== undefined ? { dest: str(dest) } : {}), ...(uri !== undefined ? { uri: str(uri) } : {}) };
  });
  const outline = [...raw.matchAll(/\/Title \(((?:[^()\\]|\\.)*)\)/g)].map((m) => str(m[1]!));
  const fontNames = [...new Set([...raw.matchAll(/\/BaseFont \/([\w+-]+)/g)].map((m) => m[1]!.replace(/^[A-Z]{6}\+/, "")))];
  return { pages, content: contents, dests, links, outline, images, fonts: fontNames };
}

/** A note with Obsidian's marks: a highlight, comments in a line, a paragraph of one, one over blank lines. */
const OBSIDIAN = "# Flan\n\n%% Check the amounts with Mum. %%\n\nA ==splash of **vanilla**== %% never more %% here, *always %%said Mum%% fresh* %%twice over%%.\n\n%%\nA block comment:\n\n- over a blank line,\n- closed after a list.\n%%\n\nAfter.\n";
/** What none of the formats may show of `OBSIDIAN`: its comments' words, their marks. */
const COMMENTS = /Mum|never more|twice|block comment|blank line|%%/;

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
      { alt: "cached", picture: { file: join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)), size: null, url: cached } },
    ]);
    // Missing: its words; on the web, not fetched: a link to it.
    expect(textOf(doc.chapters[0]!.nodes)).toContain("missing");
    expect(links(doc).map((l) => [textOf(l.children), l.url, l.data?.remoteImage])).toEqual([["remote", "https://example.com/x.png", true]]);
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

  test("Obsidian's comments left out — in a line, a paragraph of them, one over blank lines — the space where one was made one; a highlight kept", async () => {
    const { graph } = root({ "a.md": OBSIDIAN });
    const nodes = (await assemble(graph, ["a.md"])).chapters[0]!.nodes;
    expect(nodes.map((n) => n.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(textOf([nodes[1]])).toBe("A splash of vanilla here, always fresh.");
    expect(all(nodes).filter((n) => n.type === "comment" || n.type === "commentBlock")).toEqual([]);
    expect(all(nodes).filter((n) => n.type === "highlight").map((n) => textOf([n]))).toEqual(["splash of vanilla"]);
    expect(JSON.stringify(nodes)).not.toMatch(COMMENTS);
  });
});

describe("export: what the assembler keeps safe and says (10.1)", () => {
  test("a link with a scheme a document shouldn't carry (javascript:, file:) is its text; a picture's too", async () => {
    const { graph } = root({ "a.md": "# A\n\n[run](javascript:alert(1)) [disk](file:///etc/passwd) [mail](mailto:a@b.c) ![x](javascript:alert(2))\n" });
    const doc = await assemble(graph, ["a.md"]);
    expect(links(doc).map((l) => l.url)).toEqual(["mailto:a@b.c"]);
    expect(textOf(doc.chapters[0]!.nodes)).toContain("run disk mail x");
    expect(JSON.stringify(doc)).not.toContain("javascript:");
  });

  test("a footnote's id names its note by a hash, never by the path it's at; maths in a line typeset too; the language said", async () => {
    const r = root({ "a.md": "---\nlang: tr\n---\n\n# A\n\nA claim[^1] and $x^2$.\n\n[^1]: Its note.\n" });
    const doc = await assemble(r.graph, ["a.md"]);
    expect(doc.lang).toBe("tr");
    expect(JSON.stringify(doc.chapters[0]!.nodes.filter((n) => n.type === "footnoteDefinition").map((n) => (n as { identifier: string }).identifier))).not.toContain(r.dir);
    const inline = all(doc.chapters[0]!.nodes).find((n) => n.type === "inlineMath")!;
    expect((inline.data as { picture: ExportPicture }).picture).toMatchObject({ kind: "math", inline: true });
    expect((inline.data as { picture: ExportPicture }).picture.svg).toMatch(/<svg[^>]*vertical-align/);
  });

  test("a diagram keeps its source, for a format that writes it as written; a callout says whether it was titled", async () => {
    const { graph } = root({ "a.md": "```mermaid\ngraph TD\n  A --> B\n```\n\n> [!tip] Titled\n\n> [!note]\n> Not.\n" });
    const nodes = (await assemble(graph, ["a.md"])).chapters[0]!.nodes;
    const image = all(nodes).find((n) => n.type === "image")!;
    expect((image.data as { code: { lang: string; value: string } }).code).toMatchObject({ lang: "mermaid", value: "graph TD\n  A --> B" });
    expect(nodes.filter((n) => n.type === "blockquote").map((n) => (n.data as { calloutTitled: boolean }).calloutTitled)).toEqual([true, false]);
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

  test("pictures embedded at their size up to the page's width, diagrams and maths rasterised; a WebP made PNG first", async () => {
    const { graph } = root({
      "a.md": "# A\n\n![[square.png|20]] ![big](big.svg) ![photo](photo.webp)\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n$$\n\\frac{a}{b}\n$$\n",
      "square.png": png,
      "big.svg": rect(1200, 300),
      "photo.webp": WEBP,
    });
    const z = unzip(await toDocx(await assemble(graph, ["a.md"])));
    const media = [...z.keys()].filter((k) => k.startsWith("word/media/") && !k.endsWith("/"));
    expect(media.length).toBe(5);
    // The WebP, 240 by 160, as a PNG: Word holds no WebP.
    expect(media.map((m) => rasterInfo(z.get(m)!)).filter((i) => i?.width === 240)).toEqual([{ type: "png", width: 240, height: 160 }]);
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

  test("Obsidian's highlight in Word's yellow marker; its comments not there", async () => {
    const { graph } = root({ "a.md": OBSIDIAN });
    const body = xml(unzip(await toDocx(await assemble(graph, ["a.md"]))), "word/document.xml");
    expect(body).toMatch(/<w:highlight w:val="yellow"\/>(?:(?!<\/w:r>).)*<w:t[^>]*>splash of </);
    expect(body).toMatch(/<w:highlight w:val="yellow"\/>(?:(?!<\/w:r>).)*<w:t[^>]*>vanilla</);
    expect(body).not.toMatch(/<w:highlight[^>]*>(?:(?!<\/w:r>).)*<w:t[^>]*> here/);
    expect(body).not.toMatch(COMMENTS);
  });
});

describe("export: a web page (10.2)", () => {
  test("one file: its title, author, language, style; a section a chapter; headings with ids, every link inside it landing", async () => {
    const r = root({
      "a.md": "---\nauthor: Ada\nlang: en\n---\n\n# Report\n\nSee [[b#Details]], [b](b.md), [[#Later]] and [web](https://example.com/?a=1&b=2).\n\n## Later\n",
      "b.md": "Opens with no heading.\n\n## Details\n",
    });
    const { text: html } = await exportOf(r, ["a.md", "b.md"], "html");
    expect(html).toStartWith("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
    expect(html).toContain("<title>Report</title>");
    expect(html).toContain('<meta name="author" content="Ada">');
    expect(html).toContain("<style>");
    expect(html).toContain('<section id="a" class="chapter"><h1 id="a--report">Report</h1>');
    // b opens with no heading: its title is one.
    expect(html).toContain('<section id="b" class="chapter"><h1>b</h1>');
    expect(html).toContain('<a href="https://example.com/?a=1&#x26;b=2">web</a>');
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(expect.arrayContaining(["b--details", "b", "a--later"]));
    expect(hrefs.filter((h) => !ids.has(h))).toEqual([]);
    // Nothing of where the notes are on this machine.
    expect(html).not.toContain(r.dir);
  });

  test("pictures inside it as data: addresses at their size; diagrams and maths as SVG (a line's at its baseline); code coloured", async () => {
    const r = root({
      "a.md": "# A\n\n![[square.png|20]]\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n$$\n\\frac{a}{b}\n$$\n\nInline $x^2$ here.\n\n```ts\nconst x = 1; // one\n```\n",
      "square.png": png,
    });
    const { text: html } = await exportOf(r, ["a.md"], "html");
    expect(html).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="square.png" width="20" height="10" class="picture">/);
    expect(html).toMatch(/<img src="data:image\/svg\+xml;base64,[^"]+" alt="diagram" width="\d+" height="\d+" class="picture">/);
    expect(html).toMatch(/<div class="math-display"><img src="data:image\/svg\+xml;base64,[^"]+" alt="\\frac\{a\}\{b\}" style="width:[\d.]+ex;height:[\d.]+ex;vertical-align:-[\d.]+ex"><\/div>/);
    expect(html).toMatch(/<span class="math-inline"><img src="data:image\/svg\+xml;base64,[^"]+" alt="\$x\^2\$" style="[^"]*"><\/span>/);
    expect(html).toContain('<code class="language-ts"><span class="syn_keyword">const</span>');
    expect(html).toContain('<span class="syn_comment">// one</span>');
    expect(html).not.toMatch(/src="(?!data:)/);
  });

  test("tasks boxed, no checkbox; a callout in its kind's colour; each chapter's footnotes its own, at its end", async () => {
    const r = root({ "a.md": "- [ ] open\n- [x] done\n\n> [!caution] Hot\n> Mind it.\n\nClaim[^1].\n\n[^1]: A's.\n", "b.md": "Other[^1].\n\n[^1]: B's.\n" });
    const { text: html } = await exportOf(r, ["a.md", "b.md"], "html");
    expect(html).toContain('<li class="task">☐ open</li>');
    expect(html).toContain("☑ done");
    expect(html).not.toContain("<input");
    expect(html).toContain('<blockquote class="callout callout-caution" style="border-left-color:#cf222e">');
    expect(html).toContain("<strong>Hot</strong>");
    const notes = [...html.matchAll(/<section data-footnotes class="footnotes"><h2 class="footnotes-label" id="([^"]+)">Notes<\/h2>/g)].map((m) => m[1]);
    expect(notes).toEqual(["a-footnote-label", "b-footnote-label"]);
    // Each note's mark points to its own chapter's notes.
    expect([...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1])).toEqual(["a-footnote-label", "b-footnote-label"]);
    expect(html.indexOf("A's.")).toBeLessThan(html.indexOf('<section id="b"'));
  });

  test("Obsidian's highlight marked, on paper's yellow; its comments not there", async () => {
    const { text: html } = await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "html");
    expect(html).toContain("<p>A <mark>splash of <strong>vanilla</strong></mark> here, <em>always fresh</em>.</p>");
    expect(html).toContain(`mark { background: ${TINT.mark};`);
    expect(html).not.toMatch(COMMENTS);
  });

  test("nothing in a note runs in the page: HTML in it is gone, its text escaped, a javascript: link its words", async () => {
    const r = root({ "a.md": '# A\n\n<script>alert(1)</script>\n\nText <b onclick="steal()">bold</b> and [x](javascript:alert(2)).\n\n```html\n</code></pre><img src=x onerror=alert(3)>\n```\n' });
    const { text: html } = await exportOf(r, ["a.md"], "html");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b onclick");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    // The code's words, escaped, between the spans that colour them.
    expect(html.replace(/<[^>]+>/g, "")).toContain("&#x3C;/code>&#x3C;/pre>&#x3C;img src=x onerror=alert(3)>");
  });
});

describe("export: Markdown (10.3)", () => {
  test("frontmatter with the mark; links inside it to GitHub's heading ids, a name again numbered across chapters", async () => {
    const r = root({
      "a.md": "---\nauthor: Ada\n---\n\n# Report\n\n## Intro\n\nSee [[b#Intro]], [[b]] and [[#Intro]].\n",
      "sub/b.md": "## Intro\n\nB's.\n",
    });
    // b's chapter is sub-b; its title's id, b.
    const { text: md } = await exportOf(r, ["a.md", "sub/b.md"], "md", "out.md");
    expect(md).toStartWith(`---\ntitle: "Report"\nauthor: "Ada"\n${EXPORT_MARK}\n---\n\n# Report\n`);
    // b gets a title; its Intro, the second of the name, is intro-1.
    expect(md).toContain("# b\n\n## Intro\n");
    expect(md).toContain("See [b](#intro-1), [b](#b) and [Intro](#intro).");
    const slugs = [...md.matchAll(/^#+ (.+)$/gm)].map((m) => slugify(m[1]!));
    expect(slugs).toEqual(["report", "intro", "b", "intro"]);
  });

  test("pictures copied beside it, a name again numbered; one on the web: its copy by its address's name, or its address; Obsidian's size kept", async () => {
    const cached = "https://example.com/photos/sky%20line.png?w=2";
    mkdirSync(join(sandbox, "cache", "slipbox", "images"), { recursive: true });
    writeFileSync(join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)), png);
    // An address naming no kind of file: its copy gets its kind's extension.
    const avatar = "https://example.com/avatar?id=7";
    writeFileSync(join(sandbox, "cache", "slipbox", "images", remoteImageName(avatar)), png);
    const r = root({
      "a.md": `# A\n\n![one](x/pic.png) ![two](y/pic.png) ![[square.png|30]]\n\n![sky](${cached}) ![far](https://example.com/far.png) ![me](${avatar})\n`,
      "x/pic.png": png,
      "y/pic.png": rect(10, 10),
      "square.png": png,
    });
    const out = await exportOf(r, ["a.md"], "md", "book.md");
    expect(out.files.map((f) => f.path)).toEqual(["book.assets/pic.png", "book.assets/pic-1.png", "book.assets/square.png", "book.assets/sky line.png", "book.assets/avatar.png"]);
    expect(out.text).toContain("![one](book.assets/pic.png) ![two](book.assets/pic-1.png) ![square.png|30](book.assets/square.png)");
    expect(out.text).toContain("![sky](book.assets/sky%20line.png) ![far](https://example.com/far.png) ![me](book.assets/avatar.png)");
    // pic-1 is the SVG, as it was.
    expect(new TextDecoder().decode(out.files[1]!.data)).toStartWith("<svg");
  });

  test("only pictures of the root copied: a file that isn't one by what it holds, or one outside (a link out too), linked where it is", async () => {
    const outside = mkdtempSync(join(sandbox, "outside-"));
    writeFileSync(join(outside, "secret.txt"), "private");
    writeFileSync(join(outside, "photo.png"), png);
    const away = relative(sandbox, outside);
    const r = root({
      "a.md": `# A\n\n![](notes.txt) ![fake](fake.png) ![[fake.png]] ![ok](pic.png)\n\n![](../${away}/secret.txt) ![far](../${away}/photo.png) ![in](linked.png)\n`,
      "notes.txt": "plain text",
      "fake.png": "not a picture",
      "pic.png": png,
    });
    symlinkSync(join(outside, "photo.png"), join(r.dir, "linked.png"));
    // Exported into a folder: each link from there.
    const out = await exportOf(r, ["a.md"], "md", "exports/out.md");
    expect(out.files.map((f) => f.path)).toEqual(["out.assets/pic.png"]);
    expect(out.text).toContain("[notes.txt](../notes.txt) [fake](../fake.png) [fake.png](../fake.png) ![ok](out.assets/pic.png)");
    expect(out.text).toContain(`[secret.txt](../../${away}/secret.txt) [far](../../${away}/photo.png) [in](../linked.png)`);
    expect(out.text).not.toContain("private");
  });

  test("what Markdown writes itself kept as written: a diagram's source, maths, a callout's marker; footnotes renumbered; tasks", async () => {
    const r = root({
      "a.md": "```mermaid\ngraph TD\n  A --> B\n```\n\n$$\nx^2\n$$\n\nInline $y$.\n\n> [!tip] Try it\n> Body.\n\n> [!warning]\n> Careful.\n\nOne[^z] two[^a].\n\n[^a]: Second.\n[^z]: First.\n\n- [ ] open\n- [x] done\n",
    });
    const { text: md } = await exportOf(r, ["a.md"], "md", "out.md");
    expect(md).toContain("```mermaid\ngraph TD\n  A --> B\n```");
    expect(md).toContain("$$\nx^2\n$$");
    expect(md).toContain("Inline $y$.");
    expect(md).toContain("> [!tip] Try it\n>\n> Body.");
    expect(md).toContain("> [!warning]\n>\n> Careful.");
    expect(md).toContain("One[^1] two[^2].");
    expect(md).toContain("[^2]: Second.");
    expect(md).toContain("[^1]: First.");
    expect(md).toContain("- [ ] open\n- [x] done");
  });

  test("Obsidian's highlight as written; its comments not there", async () => {
    const { text: md } = await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "md", "out.md");
    expect(md).toContain("A ==splash of **vanilla**== here, *always fresh*.");
    expect(md).toContain("After.");
    expect(md).not.toMatch(COMMENTS);
  });

  test("an earlier Markdown export is replaced, though it's a note; any other note never", async () => {
    const r = root({ "a.md": "# A\n", "notes.md": "# Mine\n" });
    const format = formatFor("md")!;
    const target = exportTarget(r.graph, "a.md", format, null, r.dir);
    expect(target).toBe(join(r.dir, "a.export.md"));
    writeExport(target, await exportNotes(r.graph, ["a.md"], format, target));
    expect(isExport(target)).toBe(true);
    const again = openGraph(locateVault({ root: r.dir }), DEFAULT_CONFIG, false);
    expect(again.notes.has("a.export.md")).toBe(true);
    expect(exportTarget(again, "a.md", format, null, r.dir)).toBe(target);
    expect(() => exportTarget(again, "a.md", format, "notes.md", r.dir)).toThrow("notes.md is a note — an export doesn't write over it");
    expect(isExport(join(r.dir, "notes.md"))).toBe(false);
  });

  test("never over a note of any root: another's, a nested one's, one reached through a link; their other files replaced", async () => {
    const r = root({ "a.md": "# A\n", "inner/.slipbox/version": "1\n", "inner/n.md": "# N\n" });
    const other = root({ "theirs.md": "# Theirs\n", "sub/deep.md": "# Deep\n", "data.txt": "x" });
    const plain = mkdtempSync(join(sandbox, "plain-"));
    symlinkSync(join(other.dir, "sub"), join(plain, "into"));
    writeFileSync(join(plain, "loose.md"), "# Loose\n");
    const format = formatFor("md")!;
    const at = (typed: string) => exportTarget(r.graph, "a.md", format, typed, r.dir);
    expect(() => at(join(other.dir, "theirs.md"))).toThrow(`${join(other.dir, "theirs.md")} is a note — an export doesn't write over it`);
    expect(() => at("inner/n.md")).toThrow("inner/n.md is a note — an export doesn't write over it");
    expect(() => at(join(plain, "into", "deep.md"))).toThrow("deep.md is a note — an export doesn't write over it");
    // Another root's file that isn't a note, and a note of no root: replaced, as -o does.
    expect(at(join(other.dir, "data.txt"))).toBe(join(other.dir, "data.txt"));
    expect(at(join(plain, "loose.md"))).toBe(join(plain, "loose.md"));
    // Another root's earlier Markdown export: replaced too.
    writeExport(join(other.dir, "old.md"), await exportNotes(r.graph, ["a.md"], format, join(other.dir, "old.md")));
    expect(at(join(other.dir, "old.md"))).toBe(join(other.dir, "old.md"));
  });

  test("a path ending in / names a folder: the note's name in it, the folder made when it's written", async () => {
    const r = root({ "a.md": "# A\n" });
    const docx = formatFor("docx")!;
    const target = exportTarget(r.graph, "a.md", docx, "out/v1.2/", r.dir);
    expect(target).toBe(join(r.dir, "out", "v1.2", "a.docx"));
    writeExport(target, await exportNotes(r.graph, ["a.md"], docx, target));
    expect(existsSync(target)).toBe(true);
    // Without its `/`, a name that isn't there is the file's.
    expect(exportTarget(r.graph, "a.md", docx, "out/v2", r.dir)).toBe(join(r.dir, "out", "v2"));
  });
});

describe("export: an e-book (10.6)", () => {
  test("EPUB 3: mimetype first and stored; every page well-formed XHTML; what's in it all listed; the contents; links across chapters", async () => {
    const r = root({
      "a.md": "---\nauthor: Ada\nlang: tr\n---\n\n# Report\n\nSee [[b#Details]]. $$x < y$$ and ![[square.png]]\n\n- [ ] a task\n\nNote[^1].\n\n[^1]: Its text & more.\n",
      "b.md": "# B\n\n## Details\n\nText with <br> a break.\n",
      "square.png": png,
    });
    const { data } = await exportOf(r, ["a.md", "b.md"], "epub");
    // The first entry, stored: its local header names it and says method 0.
    const v = new DataView(data.buffer, data.byteOffset);
    expect(v.getUint16(8, true)).toBe(0);
    expect(new TextDecoder().decode(data.subarray(30, 38))).toBe("mimetype");
    const z = unzip(data);
    expect([...z.keys()][0]).toBe("mimetype");
    expect(xml(z, "mimetype")).toBe("application/epub+zip");
    expect(xml(z, "META-INF/container.xml")).toContain('full-path="OEBPS/content.opf"');
    for (const name of z.keys()) if (/\.(xhtml|opf|xml)$/.test(name)) expect([name, notWellFormed(xml(z, name))]).toEqual([name, null]);
    const opf = xml(z, "OEBPS/content.opf");
    expect(opf).toContain("<dc:title>Report</dc:title>");
    expect(opf).toContain("<dc:creator>Ada</dc:creator>");
    expect(opf).toContain("<dc:language>tr</dc:language>");
    expect(opf).toMatch(/<dc:identifier id="book-id">urn:uuid:[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}<\/dc:identifier>/);
    // Every file listed is there, and every file there is listed.
    const listed = [...opf.matchAll(/href="([^"]+)"/g)].map((m) => `OEBPS/${m[1]}`);
    expect(listed.filter((f) => !z.has(f))).toEqual([]);
    expect([...z.keys()].filter((f) => f.startsWith("OEBPS/") && f !== "OEBPS/content.opf" && !listed.includes(f))).toEqual([]);
    expect([...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1])).toEqual(["c1", "c2"]);
    const nav = xml(z, "OEBPS/nav.xhtml");
    expect(nav).toContain('<a href="chapter-1.xhtml">Report</a>');
    expect(nav).toContain('<a href="chapter-2.xhtml#b--details">Details</a>');
    const one = xml(z, "OEBPS/chapter-1.xhtml");
    expect(one).toContain('href="chapter-2.xhtml#b--details"');
    expect(xml(z, "OEBPS/chapter-2.xhtml")).toContain('id="b--details"');
    expect(one).toMatch(/<img src="images\/[\da-f]{16}\.png" alt="square.png"/);
    expect(one).toContain("☐ a task");
    expect(one).toContain("Its text &#x26; more.");
  });

  test("the same notes exported again are the same book: its id from what's in it", async () => {
    const r = root({ "a.md": "# A\n", "b.md": "# B\n" });
    const id = async (rels: string[]) => /urn:uuid:([^<]+)/.exec(xml(unzip((await exportOf(r, rels, "epub")).data), "OEBPS/content.opf"))![1];
    expect(await id(["a.md", "b.md"])).toBe(await id(["a.md", "b.md"]));
    expect(await id(["b.md", "a.md"])).not.toBe(await id(["a.md", "b.md"]));
  });

  test("Obsidian's highlight marked, the page well-formed; its comments not there", async () => {
    const page = xml(unzip((await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "epub")).data), "OEBPS/chapter-1.xhtml");
    expect(notWellFormed(page)).toBeNull();
    expect(page).toContain("<mark>splash of <strong>vanilla</strong></mark>");
    expect(page).not.toMatch(COMMENTS);
  });
});

describe("export: PDF (10.5)", () => {
  test("a chapter from a new page, its text read back; each heading a destination, the outline the chapters and their sections", async () => {
    const r = root({
      "a.md": "---\nauthor: Ada\n---\n\n# Report\n\nSee [[b#Details]] and [the web](https://example.com/x).\n\n## Findings\n\nSome *found* things.\n",
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
      "x.webp": new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8L"), 0, 0, 0, 0, 0x2f, 9, 0x40, 2, 0, 0, 0, 0, 0, 0, 0]),
    });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.images[0]).toBe(5);
    const text = pdf.pages.join("\n");
    expect(text).not.toContain("photo");
    for (const words of ["broken", "const answer = 42;", "NameCount\napples3", "Quoted words.", "3.third\n4.fourth", "Claim¹.", "Notes\n1.The note."]) expect(text).toContain(words);
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
    const f = findFonts(files("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", ...lato, "DejaVuSansMono.ttf", "NotoSansCJK-Regular.ttc"));
    expect([f.regular, f.bold, f.italic, f.boldItalic].map((x) => x.path)).toEqual(lato.map((n) => `/f/${n}`));
    expect([f.mono.path, f.monoBold.path]).toEqual(["/f/DejaVuSansMono.ttf", "/f/DejaVuSansMono.ttf"]);
    expect(f.fallbacks.map((x) => x.path)).toEqual(["/f/DejaVuSans.ttf", "/f/NotoSansCJK-Regular.ttc"]);
    const partial = findFonts(files("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"));
    expect([partial.regular, partial.bold, partial.italic, partial.boldItalic, partial.mono].map((x) => x.path)).toEqual(["/f/DejaVuSans.ttf", "/f/DejaVuSans-Bold.ttf", "/f/DejaVuSans.ttf", "/f/DejaVuSans-Bold.ttf", "/f/DejaVuSans.ttf"]);
    expect(partial.fallbacks).toEqual([]);
    // A face in a collection by its PostScript name.
    expect(findFonts(files("Helvetica.ttc")).bold).toEqual({ path: "/f/Helvetica.ttc", ps: "Helvetica-Bold" });
    expect(findFonts(new Map()).builtin).toBe(true);
    // Emoji in black and white, before CJK (10.12); a colour emoji font isn't one: it has no outlines.
    const emoji = findFonts(files(...lato, "DejaVuSans.ttf", "NotoColorEmoji.ttf", "NotoSansCJK-Regular.ttc", "NotoEmoji-Regular.ttf"));
    expect(emoji.fallbacks.map((x) => x.path)).toEqual(["/f/DejaVuSans.ttf", "/f/NotoEmoji-Regular.ttf", "/f/NotoSansCJK-Regular.ttc"]);
  });

  test("a character the font hasn't got taken from the first fallback that has it; a mark stays with its letter", () => {
    const has = (font: string, cp: number) => (font === "body" ? cp < 0x2000 : font === "symbols" ? cp >= 0x2190 && cp < 0x2800 : cp >= 0x4e00);
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

describe("export: pictures made PNG before an export (10.10)", () => {
  test("a PNG written: its size, its pixels as given, row by row", () => {
    const pixels = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 1, 2, 3, 4, 9, 9, 9, 9, 200, 100, 50, 25];
    const out = encodePng({ width: 3, height: 2, data: new Uint8Array(pixels) });
    expect(rasterInfo(out)).toEqual({ type: "png", width: 3, height: 2 });
    expect(pngPixels(out)).toEqual({ width: 3, height: 2, data: pixels });
  });

  test("a BMP read: 24 bits bottom-up, a palette top-down, 1 bit across a byte, 5-5-5, masks with alpha, the old header", () => {
    const px = (img: ReturnType<typeof decodeBmp>) => (img ? [img.width, img.height, ...img.data] : null);
    // Stored bottom row first: blue, white; then red, green.
    expect(px(decodeBmp(bmpFile(2, 2, 24, [[255, 0, 0, 255, 255, 255], [0, 0, 255, 0, 255, 0]])))).toEqual([2, 2, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const palette = [0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0];
    expect(px(decodeBmp(bmpFile(3, -1, 8, [[0, 1, 2]], { palette })))).toEqual([3, 1, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const bw = [0, 0, 0, 0, 255, 255, 255, 0];
    const nine = decodeBmp(bmpFile(9, 1, 1, [[0b10101010, 0b10000000]], { palette: bw }))!;
    expect([...nine.data].filter((_, i) => i % 4 === 0)).toEqual([255, 0, 255, 0, 255, 0, 255, 0, 255]);
    const rgb555 = decodeBmp(bmpFile(3, 1, 16, [[0x00, 0x7c, 0xe0, 0x03, 0x1f, 0x00]]))!;
    expect([...rgb555.data]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const alpha = decodeBmp(bmpFile(1, 1, 32, [[0, 0, 255, 0x80]], { compression: 6, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }))!;
    expect([...alpha.data]).toEqual([255, 0, 0, 128]);
    // 32 bits with no masks: the fourth byte is no alpha.
    expect([...decodeBmp(bmpFile(1, 1, 32, [[0, 255, 0, 0]]))!.data]).toEqual([0, 255, 0, 255]);
    expect(px(decodeBmp(bmpFile(1, 1, 24, [[10, 20, 30]], { core: true })))).toEqual([1, 1, 30, 20, 10, 255]);
  });

  test("what isn't a BMP it reads, null: run-length encoded, cut short, another kind", () => {
    expect(decodeBmp(bmpFile(2, 1, 8, [[0, 0]], { compression: 1 }))).toBeNull();
    expect(decodeBmp(bmpFile(2, 2, 24, [[1, 2, 3, 4, 5, 6]]).subarray(0, 60))).toBeNull();
    expect(decodeBmp(png)).toBeNull();
  });

  test("a WebP read by libwebp; one it can't, null", async () => {
    const img = (await decodeWebp(WEBP))!;
    expect([img.width, img.height, img.data.length]).toEqual([240, 160, 240 * 160 * 4]);
    expect([...img.data.subarray(0, 4)]).toEqual([45, 79, 118, 255]);
    expect(await decodeWebp(new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]))).toBeNull();
  });

  test("a raster as a PNG: a PNG as it is, a BMP, a GIF, a WebP made one; a JPEG not", async () => {
    const r = await loadRasterizer();
    expect(await toPng(png, r)).toBe(png);
    for (const [bytes, size] of [[bmpFile(1, 1, 24, [[0, 0, 255]]), [1, 1]], [GIF, [1, 1]], [WEBP, [240, 160]]] as const) expect(rasterInfo((await toPng(bytes, r))!)).toEqual({ type: "png", width: size[0], height: size[1] });
    expect(await toPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 3, 0, 0, 0, 0, 0, 0]), r)).toBeNull();
  });

  test("a document's pictures of a kind the format doesn't hold made PNG, each file once; the rest as they are", async () => {
    const r = root({ "a.md": "# A\n\n![w](w.webp) ![b](b.bmp) ![p](p.png) ![again](w.webp)\n", "w.webp": WEBP, "b.bmp": bmpFile(1, 1, 24, [[0, 0, 255]]), "p.png": png });
    const doc = await assemble(r.graph, ["a.md"]);
    await convertPictures(doc, ["png", "jpg"], await loadRasterizer());
    const pics = pictures(doc).map((p) => p.picture!);
    expect(pics.map((p) => (p.data ? rasterInfo(p.data)?.type : null))).toEqual(["png", "png", null, "png"]);
    expect(pics[0]!.data).toBe(pics[3]!.data!);
    // A format that holds WebP: left as it is.
    const kept = await assemble(r.graph, ["a.md"]);
    await convertPictures(kept, ["png", "jpg", "webp"], await loadRasterizer());
    expect(pictures(kept)[0]!.picture!.data).toBeUndefined();
  });

  test("an e-book's BMP made PNG: an EPUB holds none", async () => {
    const r = root({ "a.md": "# A\n\n![dot](d.bmp) ![w](w.webp)\n", "d.bmp": bmpFile(1, 1, 24, [[0, 0, 255]]), "w.webp": WEBP });
    const z = unzip((await exportOf(r, ["a.md"], "epub")).data);
    expect([...z.keys()].filter((k) => k.startsWith("OEBPS/images/")).map((k) => k.split(".").pop()).sort()).toEqual(["png", "webp"]);
  });
});

describe("export: a PDF's lines laid out (10.11)", () => {
  test("where a line may break: between words, after a newline (it must), either side of a picture, between CJK", () => {
    expect(words("a b")).toEqual([{ end: 2, required: false }, { end: 3, required: false }]);
    expect(words("a\nb")).toEqual([{ end: 2, required: true }, { end: 3, required: false }]);
    expect(words("x\ufffcy")).toEqual([{ end: 1, required: false }, { end: 2, required: false }, { end: 3, required: false }]);
    expect(words("日本語").map((w) => w.end)).toEqual([1, 2, 3]);
    expect(words("e.g. this")).toEqual([{ end: 5, required: false }, { end: 9, required: false }]);
  });

  test("a picture in a sentence drawn in its line, maths on the baseline typeset, inline code on a tint", async () => {
    const r = root({ "a.md": "# A\n\nBefore ![[square.png|20]] after, and $x^2$ too, with `code` here.\n", "square.png": png });
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
    const r = root({ "a.md": `| Term | Meaning |\n| --- | --- |\n| photosynthesis | ${"the way a plant makes its food from light ".repeat(8).trim()} |\n` });
    const pdf = readPdf((await exportOf(r, ["a.md"], "pdf")).data);
    expect(pdf.pages[0]).toContain("photosynthesis");
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

describe("export: your folders (10.14)", () => {
  test("Downloads, Desktop, Documents where the desktop says (in its own words), else in English; those there are; then home", () => {
    const home = mkdtempSync(join(sandbox, "home-"));
    const config = mkdtempSync(join(sandbox, "config-"));
    for (const d of ["İndirilenler", "Documents"]) mkdirSync(join(home, d));
    expect(userFolders(home, config)).toEqual([
      { name: "Documents", path: join(home, "Documents") },
      { name: "Home", path: home },
    ]);
    writeFileSync(join(config, "user-dirs.dirs"), '# made by xdg-user-dirs\nXDG_DOWNLOAD_DIR="$HOME/İndirilenler"\nXDG_DESKTOP_DIR="$HOME/"\n');
    expect(userFolders(home, config).map((f) => [f.name, f.path])).toEqual([
      ["Downloads", join(home, "İndirilenler")],
      ["Documents", join(home, "Documents")],
      ["Home", home],
    ]);
    expect(userFolders(join(home, "none"), config)).toEqual([]);
  });
});

describe("export: the formats", () => {
  test("a format by its name, another name for it, or an extension; beside the note, its name, by default", () => {
    expect(FORMATS.map((f) => f.name)).toEqual(["docx", "pdf", "html", "epub", "md"]);
    for (const name of ["docx", "DOCX", ".docx", "word", "doc"]) expect(formatFor(name)?.name).toBe("docx");
    for (const [name, format] of [["htm", "html"], ["web", "html"], ["markdown", "md"], [".MD", "md"], ["ebook", "epub"], ["PDF", "pdf"]]) expect(formatFor(name!)?.name).toBe(format!);
    expect(formatFor("odt")).toBeNull();
    expect(defaultTarget("/v/notes/Field Report.md", formatFor("word")!)).toBe("/v/notes/Field Report.docx");
    // Markdown's apart from the note it's of.
    expect(defaultTarget("/v/notes/Field Report.md", formatFor("md")!)).toBe("/v/notes/Field Report.export.md");
  });
});
