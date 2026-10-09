// Export as an e-book (plan 10.6): EPUB 3 over the HTML writer's chapters (10.2) — a chapter a file of XHTML, its
// pictures files of the book, a contents page (chapters and their sections), the stylesheet — zipped by fflate (MIT),
// its `mimetype` first and stored, as readers require. Its id comes from what's in it, so an export again is the same
// book, updated.

import { createHash } from "node:crypto";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml as serialise } from "hast-util-to-html";
import { strToU8, type Zippable, zipSync } from "fflate";
import { loadRasterizer } from "../svg.ts";
import type { ExportDoc } from "./assemble.ts";
import { chapterHast } from "./hast.ts";
import { mediaType } from "./images.ts";
import { CSS } from "./style.ts";

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** Text for XML: `&`, `<`, `>` and quotes as entities. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The document as an EPUB's bytes. */
export async function toEpub(doc: ExportDoc): Promise<Uint8Array> {
  const r = await loadRasterizer();
  const lang = doc.lang ?? "en";
  // Every id the book holds, by the chapter file it's in: where a link to it goes.
  const fileOf = new Map<string, string>();
  doc.chapters.forEach((ch, k) => {
    const file = `chapter-${k + 1}.xhtml`;
    fileOf.set(ch.anchor, file);
    const visit = (nodes: readonly unknown[]) => {
      for (const n of nodes as { type: string; data?: { anchor?: string }; children?: unknown[] }[]) {
        if (n.type === "heading" && n.data?.anchor) fileOf.set(n.data.anchor, file);
        if (n.children) visit(n.children);
      }
    };
    visit(ch.nodes);
  });
  // Pictures, a file each, the same picture once.
  const images = new Map<string, { path: string; type: string; data: Uint8Array }>();
  const src = (data: Uint8Array, type: Parameters<typeof mediaType>[0]) => {
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
    let image = images.get(hash);
    if (!image) images.set(hash, (image = { path: `images/${hash}.${type}`, type: mediaType(type), data }));
    return image.path;
  };
  const chapters = doc.chapters.map((ch) => {
    const section = chapterHast(ch, { r, src, href: (anchor) => `${fileOf.get(anchor) ?? ""}#${anchor}` });
    return { ch, section, file: fileOf.get(ch.anchor)!, title: ch.title, sections: subHeadings(section) };
  });

  const files: Zippable = {
    // First and stored: how a reader knows it's an EPUB.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `${XML}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`,
    ),
  };
  for (const c of chapters) files[`OEBPS/${c.file}`] = strToU8(xhtml(c.title, lang, [c.section]));
  for (const image of images.values()) files[`OEBPS/${image.path}`] = image.data;
  files["OEBPS/style.css"] = strToU8(CSS);
  files["OEBPS/nav.xhtml"] = strToU8(nav(chapters, lang));
  files["OEBPS/content.opf"] = strToU8(opf(doc, lang, chapters, [...images.values()]));
  return zipSync(files, { level: 6 });
}

/** A chapter's sections, for the contents page: its second-level headings, each with its id and words. */
function subHeadings(section: Element): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const k of section.children) if (k.type === "element" && k.tagName === "h2" && typeof k.properties.id === "string") out.push({ id: k.properties.id, text: words(k) });
  return out;
}

const words = (n: ElementContent): string => (n.type === "text" ? n.value : n.type === "element" ? n.children.map(words).join("") : "");

/** A page of the book: XHTML, which is XML — every element closed, no attribute without its value. */
function xhtml(title: string, lang: string, body: Element[]): string {
  for (const b of body) xmlAttributes(b);
  const tree: HastRoot = { type: "root", children: body };
  return `${XML}<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${xmlValues(serialise(tree, { closeSelfClosing: true, closeEmptyElements: true, characterReferences: { useNamedReferences: false } }))}</body>
</html>
`;
}

/**
 * `<` and `>` in attribute values escaped, as XML needs and HTML doesn't (a formula's words in its picture's `alt`).
 * Text has its `<` escaped already, so a raw one in the output is inside a tag; a value is always in double quotes.
 */
function xmlValues(html: string): string {
  return html.replace(/="([^"]*)"/g, (_, v: string) => `="${v.replace(/</g, "&#x3C;").replace(/>/g, "&#x3E;")}"`);
}

/** An attribute HTML writes bare (`data-footnotes`) given its value: XML has no bare ones. */
function xmlAttributes(n: ElementContent): void {
  if (n.type !== "element") return;
  for (const [k, v] of Object.entries(n.properties)) if (v === true) n.properties[k] = "";
  n.children.forEach(xmlAttributes);
}

/** The contents page: each chapter, its sections under it. */
function nav(chapters: { file: string; title: string; sections: { id: string; text: string }[] }[], lang: string): string {
  const items = chapters
    .map((c) => {
      const sub = c.sections.length ? `<ol>${c.sections.map((s) => `<li><a href="${esc(c.file)}#${esc(s.id)}">${esc(s.text)}</a></li>`).join("")}</ol>` : "";
      return `<li><a href="${esc(c.file)}">${esc(c.title)}</a>${sub}</li>`;
    })
    .join("\n");
  return `${XML}<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>Contents</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${items}
</ol></nav></body>
</html>
`;
}

/** The package: what the book is (its title, author, language, id), what's in it, and the order it's read in. */
function opf(doc: ExportDoc, lang: string, chapters: { file: string }[], images: { path: string; type: string }[]): string {
  // An id from what's in it: the same notes exported again are the same book.
  const h = createHash("sha256").update(doc.chapters.map((c) => c.rel).join("\n")).digest("hex");
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map((c, k) => `<item id="c${k + 1}" href="${esc(c.file)}" media-type="application/xhtml+xml"/>`),
    ...images.map((im, k) => `<item id="i${k + 1}" href="${esc(im.path)}" media-type="${esc(im.type)}"/>`),
  ];
  return `${XML}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>
<dc:title>${esc(doc.title)}</dc:title>
<dc:language>${esc(lang)}</dc:language>
${doc.author ? `<dc:creator>${esc(doc.author)}</dc:creator>\n` : ""}${doc.date ? `<dc:date>${esc(doc.date)}</dc:date>\n` : ""}<meta property="dcterms:modified">${modified}</meta>
<meta name="generator" content="slipbox"/>
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine>
${chapters.map((_, k) => `<itemref idref="c${k + 1}"/>`).join("\n")}
</spine>
</package>
`;
}
