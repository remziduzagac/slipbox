import { markdownHtml } from "../../documents/markdown/html-markdown.ts";
import { exportHtml } from "../../documents/markdown/html-export.ts";
import { htmlForMarkdown } from "../../documents/markdown/html.ts";
// Export, the assembler (plan 10.1): the notes to export as one document for a writer (10.2–10.6) — each a chapter, in
// the order given (10.9). Its embeds are drawn in; its links to the notes exported stay links, inside the document, and
// the rest are their text (an address on the web stays a link); its pictures are files (one on the internet its cached
// copy — nothing is fetched — else its link), a file outside the root marked so no format holds it (DF-D24); its
// diagrams and display maths are drawn, as SVG in print's colours; its frontmatter's title, author and date are the
// document's. Its words are as written; Obsidian's comments, which a reader of the note never sees, are left out.

import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { basename } from "node:path";
import type { Blockquote, Image, Link, PhrasingContent, RootContent, Text } from "mdast";
import { cachedImage } from "../media/images/imagecache.ts";
import { loadMermaid, mermaidSvg, withMermaidBatch } from "../media/diagrams/diagrams.ts";
import { landsInside } from "../../foundation/platform/fsutil.ts";
import type { Graph } from "../../workspace/graph/graph.ts";
import { embedder, pictureLocator } from "../../documents/model/note.ts";
import { onlyComments, withoutComments } from "../../documents/markdown/obsidian.ts";
import { headingText, noteTitle, slugify } from "../../documents/markdown/parse.ts";
import { loadRasterizer } from "../media/images/svg.ts";
import { loadTypesetter } from "../media/typeset.ts";
import type { WikiLink } from "../../documents/markdown/wikilink.ts";
import { embeddedNote, parseExportNote, withExportReads } from "./reads.ts";
import { PRINT } from "./assets/style.ts";

/** A note exported: a chapter of the document. */
export interface ExportChapter {
  rel: string;
  title: string;
  /** Its id in the document: what a link to it is to. */
  anchor: string;
  nodes: RootContent[];
  /** Original HTML for the lossless Markdown writer, alongside assembled Markdown content. */
  markdownNodes?: RootContent[];
}

export interface ExportDoc {
  title: string;
  author: string | null;
  date: string | null;
  /** Its language, as frontmatter's `lang` (or `language`) says: `en`, `tr`; null where it doesn't. */
  lang: string | null;
  chapters: ExportChapter[];
}

/**
 * What a picture is drawn from, on an image node's `data.picture`: its file, or an SVG slipbox drew (a diagram, a
 * display's maths); the size Obsidian's `|300` or `|240x180` gives it, in pixels.
 */
export interface ExportPicture {
  maxWidth?: number;
  file?: string;
  /** Its bytes in hand, read before its file: a picture made PNG for a format that doesn't hold its kind. */
  data?: Uint8Array;
  /** Where it is on the web, for one drawn from its cached copy. */
  url?: string;
  /**
   * A file outside the root, by where it really is (DF-D24): no document holds it, nor reads it — Word, PDF, the web
   * page and the e-book show its words, Markdown links to it (DF-D2).
   */
  outside?: boolean;
  svg?: string;
  kind?: "diagram" | "math";
  /** Maths in a line, not a display. */
  inline?: boolean;
  size?: { width: number; height: number | null } | null;
}

/** Embeds inside embeds go this deep, as on screen (1.11). */
const MAX_DEPTH = 3;

interface Ctx {
  htmlFound?: { value: boolean };
  preserveHtml?: boolean;
  graph: Graph;
  /** The note being read, in this root (null for another root's: its links are its text) and absolute. */
  rel: string | null;
  abs: string;
  /** The notes exported, and each one's chapter's id. */
  chapters: Map<string, string>;
  /** The notes being drawn into one another: an embed of one of them is a loop. */
  chain: string[];
  /** The ids given this chapter's headings, and how many times each. */
  ids: Map<string, number>;
  /** This chapter's id. */
  anchor: string;
}

/** A chapter's id, from its note's path: `notes/report.md`, `notes-report`. */
export function chapterAnchor(rel: string): string {
  return slugify(rel.replace(/\.(md|markdown)$/i, "").replace(/[/\\]/g, "-")) || "note";
}

/** A heading's id in its chapter: the chapter's, then its slug. */
export function headingAnchor(chapter: string, heading: string): string {
  return `${chapter}--${slugify(heading)}`;
}

/** The notes at `rels` (in this root), assembled for a writer. */
export function assemble(graph: Graph, rels: string[]): Promise<ExportDoc> {
  return withExportReads(() => withMermaidBatch(() => assembleDocument(graph, rels)));
}

async function assembleDocument(graph: Graph, rels: string[]): Promise<ExportDoc> {
  const chapters = new Map(rels.map((r) => [r, chapterAnchor(r)]));
  const doc: ExportDoc = { title: "", author: null, date: null, lang: null, chapters: [] };
  for (const rel of rels) {
    const abs = graph.abs(rel);
    const original = parseExportNote(abs);
    const parsed = structuredClone(original);
    const anchor = chapters.get(rel)!;
    const ctx: Ctx = { graph, rel, abs, chapters, chain: [abs], ids: new Map(), anchor };
    const title = noteTitle(parsed, basename(rel).replace(/\.(md|markdown)$/i, ""));
    const hasHtml = [...walk(parsed.tree.children)].some((n) => n.type === "html");
    ctx.htmlFound = { value: hasHtml };
    const semantic = hasHtml ? exportHtml(parsed.tree) : parsed.tree;
    const nodes = await blocks(semantic.children, ctx);
    const markdownNodes = ctx.htmlFound.value
      ? await blocks(markdownHtml(structuredClone(original.tree), original.source).children, {
          ...ctx,
          ids: new Map(),
          preserveHtml: true,
        })
      : undefined;
    doc.chapters.push({ rel, title, anchor, nodes, ...(markdownNodes ? { markdownNodes } : {}) });
    // The first note's frontmatter says the document's title, author and date.
    if (doc.chapters.length === 1) {
      const fm = parsed.frontmatter?.data ?? {};
      doc.title = title;
      doc.author = words(fm.author ?? fm.authors);
      doc.date = words(fm.date);
      doc.lang = words(fm.lang ?? fm.language);
    }
  }
  landLinks(doc);
  return doc;
}

/** Every node under `nodes`, depth first. */
function* walk(nodes: readonly unknown[]): Generator<RootContent | PhrasingContent> {
  for (const n of nodes as (RootContent | PhrasingContent)[]) {
    yield n;
    if ("children" in n) yield* walk(n.children);
  }
}

/**
 * A link to a heading the document doesn't hold (renamed since, or in a part not drawn in) to its note's chapter
 * instead: no link inside the document goes nowhere.
 */
function landLinks(doc: ExportDoc): void {
  const ids = new Set(doc.chapters.map((ch) => ch.anchor));
  for (const ch of doc.chapters)
    for (const n of walk(ch.nodes))
      if (n.type === "heading" && (n.data as { anchor?: string } | undefined)?.anchor)
        ids.add((n.data as { anchor: string }).anchor);
  for (const ch of doc.chapters)
    for (const n of walk(ch.nodes))
      if (n.type === "link" && n.url.startsWith("#") && !ids.has(n.url.slice(1)))
        n.url = `#${n.url.slice(1).split("--")[0]}`;
}

/** A frontmatter value as words: a list joined, a date as written. */
function words(v: unknown): string | null {
  if (Array.isArray(v)) return v.map(String).join(", ") || null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v === undefined || v === null || v === "" ? null : String(v);
}

/** Blocks, made ready: embeds drawn in, diagrams and maths drawn, headings given ids, what's in them made ready. */
async function blocks(nodes: RootContent[], c: Ctx): Promise<RootContent[]> {
  const out: RootContent[] = [];
  for (const n of nodes) {
    if (n.type === "html") {
      if (c.htmlFound) c.htmlFound.value = true;
      if (c.preserveHtml) out.push({ ...n, value: htmlForMarkdown(n.value) });
      else out.push(...(await blocks(exportHtml({ type: "root", children: [n] }).children, c)));
      continue;
    }
    if (n.type === "yaml" || (n.type as string) === "toml" || n.type === "definition") continue;
    // Obsidian's comments (DF-D17): hidden while reading, so not in what's sent either.
    if (n.type === "commentBlock" || (n.type === "paragraph" && onlyComments(n.children))) continue;
    if (n.type === "paragraph") {
      n.children = withoutComments(n.children);
      const drawnIn = await embeds(n.children, c);
      if (drawnIn) {
        out.push(...drawnIn);
        continue;
      }
      n.children = await inline(n.children, c);
    } else if (n.type === "heading") {
      // Its id, as a link to it says it — the second of a name numbered, as GitHub does.
      const slug = headingAnchor(c.anchor, (n.data?.html ? n.data.id : undefined) ?? headingText(n));
      const seen = c.ids.get(slug) ?? 0;
      c.ids.set(slug, seen + 1);
      n.data = { ...(n.data ?? {}), anchor: seen ? `${slug}-${seen}` : slug } as typeof n.data;
      n.children = await inline(n.children, c);
    } else if (n.type === "code" && /^mermaid$/i.test(n.lang ?? "")) {
      const svg = await diagram(n.value);
      if (svg) {
        // Drawn; its source kept, for a format that keeps it as written (Markdown).
        out.push({
          type: "paragraph",
          children: [
            { type: "image", url: "", alt: "diagram", data: { picture: { svg, kind: "diagram" }, code: n } } as Image,
          ],
        });
        continue;
      }
    } else if (n.type === "math") {
      const svg = await maths(n.value);
      if (svg) ((n.data ??= {}) as Record<string, unknown>).picture = { svg, kind: "math" } satisfies ExportPicture;
    } else if (n.type === "blockquote") {
      callout(n);
      n.children = (await blocks(n.children, c)) as typeof n.children;
    } else if (n.type === "footnoteDefinition") {
      n.identifier = footnoteId(n.identifier, c);
      n.children = (await blocks(n.children, c)) as typeof n.children;
    } else if (n.type === "list")
      for (const item of n.children) item.children = (await blocks(item.children, c)) as typeof item.children;
    else if (n.type === "table")
      for (const row of n.children) for (const cell of row.children) cell.children = await inline(cell.children, c);
    out.push(n);
  }
  return out;
}

/**
 * A paragraph of nothing but embeds (and the breaks between them), at least one a note's: each note's blocks drawn in
 * (made ready from where that note is), anything else its text. Null for any other paragraph.
 */
async function embeds(children: PhrasingContent[], c: Ctx): Promise<RootContent[] | null> {
  const refs: {
    target: string;
    heading: string | null;
    block: string | null;
    kind: "embed" | "image";
    node: PhrasingContent;
  }[] = [];
  for (const k of children) {
    if ((k.type as string) === "wikiLink" && (k as unknown as WikiLink).embed) {
      const w = k as unknown as WikiLink;
      refs.push({ target: w.target, heading: w.heading, block: w.block, kind: "embed", node: k });
    } else if (k.type === "image" && /\.(md|markdown)(#|$)/i.test(k.url)) {
      const [target, frag = ""] = k.url.split("#");
      refs.push({
        target: target!,
        heading: frag && !frag.startsWith("^") ? decodeURIComponent(frag) : null,
        block: frag.startsWith("^") ? frag.slice(1) : null,
        kind: "image",
        node: k,
      });
    } else if (!(k.type === "break" || (k.type === "text" && !k.value.trim()))) return null;
  }
  if (!refs.length || !c.rel) return null;
  const embed = embedder(c.graph, c.rel, embeddedNote);
  const found = refs.map((r) => ({ r, e: embed?.(r.target, r.heading, r.block, r.kind) ?? null }));
  if (!found.some((f) => f.e?.nodes)) return null;
  const out: RootContent[] = [];
  for (const { r, e } of found) {
    if (!e?.nodes || c.chain.includes(e.path) || c.chain.length > MAX_DEPTH) {
      out.push({ type: "paragraph", children: await inline([r.node], c) });
      continue;
    }
    const inner: Ctx = { ...c, rel: e.from ?? null, abs: e.path, chain: [...c.chain, e.path] };
    const tree = { type: "root" as const, children: structuredClone(e.nodes) };
    out.push(
      ...(await blocks(
        (c.preserveHtml ? markdownHtml(tree, parseExportNote(e.path).source) : exportHtml(tree)).children,
        inner,
      )),
    );
    if (c.htmlFound && [...walk(e.nodes)].some((n) => n.type === "html")) c.htmlFound.value = true;
  }
  return out;
}

/** Inline content made ready: links resolved against the export, pictures given their files, tags as their text,
 *  Obsidian's comments left out. */
async function inline(nodes: PhrasingContent[], c: Ctx, linked = false): Promise<PhrasingContent[]> {
  const out: PhrasingContent[] = [];
  for (const n of withoutComments(nodes)) {
    const t = n.type as string;
    if (t === "wikiLink") {
      out.push(...wiki(n as unknown as WikiLink, c));
      continue;
    }
    if (t === "hashtag") {
      out.push({ type: "text", value: `#${(n as unknown as { value: string }).value}` });
      continue;
    }
    // HTML in a line: a `<br>` breaks it; any other tag goes, the words between kept.
    if (n.type === "html") {
      if (c.preserveHtml) out.push({ ...n, value: htmlForMarkdown(n.value) });
      else if (/^<br\s*\/?>$/i.test(n.value.trim())) out.push({ type: "break" });
      continue;
    }
    if (n.type === "footnoteReference") {
      out.push({ ...n, identifier: footnoteId(n.identifier, c) });
      continue;
    }
    // Maths in a line: typeset too, for a format that shows pictures in a line (HTML, EPUB); the rest write its text.
    if (n.type === "inlineMath") {
      const svg = await maths(n.value, true);
      if (svg)
        ((n.data ??= {}) as Record<string, unknown>).picture = {
          svg,
          kind: "math",
          inline: true,
        } satisfies ExportPicture;
      out.push(n);
      continue;
    }
    if (n.type === "image") {
      const p = picture(n, { url: n.url }, c);
      const h = n.data?.html;
      if (h?.width?.unit === "px" || h?.height) {
        const data = p.data as { picture?: ExportPicture } | undefined;
        if (data?.picture)
          data.picture.size = {
            width: h?.width?.unit === "px" ? h.width.value : Number.MAX_SAFE_INTEGER,
            height: h?.height?.value ?? null,
          };
      }
      if (h?.maxWidth?.unit === "px") {
        const data = p.data as { picture?: ExportPicture } | undefined;
        if (data?.picture) data.picture.maxWidth = h.maxWidth.value;
      }
      if (linked && p.type === "link" && (p.data as { remoteImage?: boolean } | undefined)?.remoteImage)
        out.push(...p.children);
      else out.push(p);
      continue;
    }
    if (n.type === "link") {
      const children = await inline(n.children, c, true);
      const to = linkTo(n.url, "markdown", c);
      // A link to what isn't exported: its text.
      if (to === null) out.push(...children);
      else out.push({ ...n, url: to || n.url, children } satisfies Link);
      continue;
    }
    if ("children" in n)
      (n as { children: PhrasingContent[] }).children = await inline(
        (n as { children: PhrasingContent[] }).children,
        c,
        linked,
      );
    out.push(n);
  }
  return out;
}

/** A footnote's label made the note's own: two notes' `[^1]` are two footnotes. The note by a hash of its path, which
 *  an id in a document would otherwise show. */
function footnoteId(id: string, c: Ctx): string {
  return `${c.anchor}-${createHash("sha256").update(c.abs).digest("hex").slice(0, 8)}-${id}`;
}

/** A link's scheme a document keeps: the web's, mail, a phone. Any other (`javascript:`, `file:`) is its text. */
const SAFE_SCHEME = /^(https?|mailto|tel|ftp):/i;

const CALLOUT = /^\[!([A-Za-z]+)\]([+-])?[ \t]*/;

/**
 * A callout (`> [!note] Its title`, as on screen) made a quote with its title in bold on a line of its own — its kind's
 * name where it has none — and its kind on `data.callout`; an escaped bracket (`> \[!note]`) is a quote as written.
 */
function callout(n: Blockquote): void {
  const first = n.children[0];
  const lead = first?.type === "paragraph" ? first.children[0] : undefined;
  const m =
    lead?.type === "text" && !(n.data as { literal?: boolean } | undefined)?.literal ? CALLOUT.exec(lead.value) : null;
  if (!m || first?.type !== "paragraph" || lead?.type !== "text") return;
  const kind = m[1]!.toLowerCase();
  const rest = lead.value.slice(m[0].length);
  const nl = rest.indexOf("\n");
  const titleText = (nl >= 0 ? rest.slice(0, nl) : rest).trim();
  const title: PhrasingContent[] = titleText
    ? [{ type: "text", value: titleText }, ...(nl >= 0 ? [] : first.children.slice(1))]
    : [{ type: "text", value: kind[0]!.toUpperCase() + kind.slice(1) }];
  const body: PhrasingContent[] =
    nl >= 0
      ? [{ type: "text", value: rest.slice(nl + 1) }, ...first.children.slice(1)]
      : titleText
        ? []
        : first.children.slice(1);
  const bodyText = body.some((k) => k.type !== "text" || k.value.trim());
  n.children = [
    { type: "paragraph", children: [{ type: "strong", children: title }] },
    ...(bodyText ? [{ ...first, children: body }] : []),
    ...n.children.slice(1),
  ];
  n.data = { ...(n.data ?? {}), callout: kind, calloutTitled: !!titleText } as typeof n.data;
}

/**
 * Where a link goes in the document: `#id` to a note exported (or a heading in one); `""` where it's kept as written
 * (an address on the web, `mailto:`); null where it's its text (a note not exported, a file, nothing).
 */
function linkTo(url: string, kind: "markdown" | "wiki", c: Ctx, heading: string | null = null): string | null {
  if (kind === "markdown" && /^[a-z][a-z0-9+.-]*:/i.test(url)) return SAFE_SCHEME.test(url) ? "" : null;
  if (!c.rel) return null;
  const [path, frag = heading ?? ""] = kind === "markdown" ? url.split("#") : [url, heading ?? ""];
  const r = c.graph.resolveLink({ kind, target: kind === "markdown" ? (path ?? "") : url }, c.rel);
  const rel = r.resolvedKind === "anchor" ? c.rel : r.resolvedKind === "note" ? r.path : null;
  const chapter = rel !== null ? c.chapters.get(rel) : undefined;
  if (!chapter) return null;
  let target = frag;
  try {
    target = decodeURIComponent(frag);
  } catch {}
  return target && !target.startsWith("^") ? `#${headingAnchor(chapter, target)}` : `#${chapter}`;
}

/** A wikilink: a picture embedded by name a picture; a link to a note exported a link; anything else its text. */
function wiki(w: WikiLink, c: Ctx): PhrasingContent[] {
  const shown = w.alias && !/^\d+(x\d+)?$/.test(w.alias.trim()) ? w.alias : w.target || (w.heading ?? w.value);
  if (w.embed && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(w.target)) {
    const m = /^(\d+)(?:x(\d+))?$/.exec(w.alias?.trim() ?? "");
    const size = m ? { width: Number(m[1]), height: m[2] ? Number(m[2]) : null } : null;
    return [
      picture({ type: "image", url: w.target, alt: shown.split("/").pop() ?? shown }, { name: w.target, size }, c),
    ];
  }
  const to = w.target ? linkTo(w.target, "wiki", c, w.heading) : `#${headingAnchor(c.anchor, w.heading ?? "")}`;
  const text: Text = { type: "text", value: shown };
  return to ? [{ type: "link", url: to, children: [text] }] : [text];
}

/** A picture given its file: as the note's pictures are found (12.13); one on the internet, its cached copy, else its
 *  link — an export fetches nothing. A file outside the root is marked so (DF-D24). */
function picture(
  n: Image,
  from: { url: string } | { name: string; size: ExportPicture["size"] },
  c: Ctx,
): PhrasingContent {
  const found = pictureLocator(
    c.rel !== null ? c.graph : null,
    c.rel,
    c.abs,
  )("url" in from ? { url: from.url } : { name: from.name, size: from.size ?? null });
  const file = !found || "svg" in found ? null : "file" in found ? found.file : cachedImage(found.url);
  if (!file || !isFile(file)) {
    // Not here: its words, linked where it's on the web (marked a picture's, for a format that keeps it one).
    const text: Text = { type: "text", value: n.alt || n.url };
    return found && "url" in found && SAFE_SCHEME.test(found.url)
      ? { type: "link", url: found.url, children: [text], data: { remoteImage: true } }
      : text;
  }
  const size = "size" in from ? from.size : null;
  const picture: ExportPicture =
    found && "url" in found
      ? { file, size, url: found.url }
      : landsInside(c.graph.root, file)
        ? { file, size }
        : { file, size, outside: true };
  return { ...n, data: { ...(n.data ?? {}), picture } } as Image;
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** A Mermaid diagram as an SVG, print's colours — null where it isn't drawn (a kind it doesn't draw, no font). */
async function diagram(source: string): Promise<string | null> {
  const [m, r] = await Promise.all([loadMermaid(), loadRasterizer()]);
  if (!m || !r) return null;
  mermaidSvg(source, PRINT, r.family);
  await loadMermaid();
  return mermaidSvg(source, PRINT, r.family);
}

/** Maths as an SVG, print's colour — a display's, or `inline` a line's; null where MathJax can't read it. */
async function maths(tex: string, inline = false): Promise<string | null> {
  const t = await loadTypesetter();
  return t ? t(tex, PRINT.math, inline) : null;
}
