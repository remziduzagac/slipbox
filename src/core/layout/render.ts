// mdast → layout IR (plan 2.1, 2.2). Pure: no terminal, no OpenTUI, no I/O.
//
// Containers (quotes, list items, callouts) lay their children out at a reduced width and then
// prefix every row, so nesting composes without any block knowing where it sits.

import type { Heading, Nodes, Parents, PhrasingContent, Root, RootContent, Table, TableCell } from "mdast";
import type { Glyphs } from "../glyphs.ts";
import { type CellLink, type DataComment, type DataField, fieldLink, type TreePlace } from "../data.ts";
import { type DrawingColors, drawMermaid, MERMAID, mermaidSvg } from "../diagrams.ts";
import { RESVG, rasterizer } from "../svg.ts";
import { MATHJAX, typesetter } from "../typeset.ts";
import { mathRows, mathText } from "../math.ts";
import { headingLabel, ORIGIN, parseMarkdown, type Frontmatter, slugify } from "../parse.ts";
import { expandTabs, sanitize } from "../sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, padEnd, stringWidth, truncate } from "../width.ts";
import type { Hashtag } from "../tags.ts";
import { parseWikiTarget, type WikiLink } from "../wikilink.ts";
import { highlight } from "./highlight.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, type Layout, type LayoutHeading, type LayoutLink, type Line, type LinkStatus, type Picture, type Span } from "./ir.ts";
import { allocate, PADDING } from "./table.ts";
import { fit, longestWord, measure, naturalWidth, wrapSpans } from "./wrap.ts";

export interface RenderOptions {
  /** Layout width in columns — the caller has already subtracted the inset (2.7). */
  width: number;
  glyphs: Glyphs;
  /** Append ` <url>` after external link text (for plain output). */
  showUrls: boolean;
  /** Link status for styling; without it every wikilink renders as resolved. */
  resolveLink?: (kind: "wiki" | "embed" | "markdown" | "image", target: string) => LinkStatus;
  /**
   * What an embed (`![[note]]`, `![[note#Heading]]`, `![[note#^block]]`; or written as a path,
   * `![text](note.md#heading)`, kind `image`, 20.1) shows, to draw it in place (1.11); null where it
   * isn't a note (a picture, a file, nothing): then it's a reference.
   */
  embed?: (target: string, heading: string | null, block: string | null, kind?: "embed" | "image") => Embedded | null;
  /** The note being drawn (absolute): an embed of it, however deep, is a loop. */
  embedFrom?: string;
  /** A picture alone in its paragraph (12.x), drawn under its `▣ alt` line: its file and the cells it takes at most
   *  `width` columns wide — or null (not a local image, no images here): its `▣ alt` alone, the floor. */
  picture?: (from: PictureSource, width: number) => Picture | null;
  /** Mermaid and a display's maths drawn as pictures (12.16, 12.17), as chosen where pictures are: in these colours. */
  drawings?: { mermaid: boolean; math: boolean; colors: DrawingColors & { math: string } };
}

/**
 * Where a picture is, as the note writes it: a markdown image's URL — a path from the note's folder, or on the
 * internet — or a name, `![[dal.png]]` (12.13), found as a link to it is, with the size in pixels Obsidian's `|300`
 * (its width) or `|240x180` (the box it fits in) gives it. Or a file already found: an embedded note's picture, found
 * from where that note is (12.14).
 */
export type PictureSource =
  | { url: string }
  | { name: string; size: PictureSize | null }
  | { file: string; size: PictureSize | null }
  /** An SVG slipbox drew (12.16, 12.17): a diagram's, sized as the terminal's words are, or a display's maths. */
  | { svg: string; kind: "diagram" | "math" };
export type PictureSize = { width: number; height: number | null };
/** A picture found: its file, or its address on the internet. */
export type FoundPicture = Exclude<PictureSource, { name: string }>;

/** A note embedded, as the caller found it: what to draw, and how its own links resolve. */
export interface Embedded {
  /** Absolute: what loops are told by. */
  path: string;
  /** Its name, and the heading or block embedded. */
  title: string;
  /** The blocks to draw; null when the heading or block named isn't there (`missing` says so). */
  nodes: RootContent[] | null;
  missing?: string;
  /** Its links' status, its embeds — from where it is, not from the note embedding it. */
  resolveLink?: RenderOptions["resolveLink"];
  embed?: RenderOptions["embed"];
  /** Its path in this root, for following its links from there; absent in another root. */
  from?: string;
  /** Where its pictures are (12.14): a path from its folder, a name from where it is — files; one on the internet as
   *  it's written. Without it, its pictures stay `▣ alt`. */
  locate?: (from: PictureSource) => FoundPicture | null;
}

interface Ctx {
  opts: RenderOptions;
  links: LayoutLink[];
  headings: Omit<LayoutHeading, "line">[];
  definitions: Map<string, string>;
  /** How many containers (quotes, lists, footnotes) deep the block being rendered is. */
  nesting: number;
  /** The notes being drawn, the outermost first: an embed of one of them is a loop (1.11). */
  embedChain: string[];
  /** Every note embedded so far, nested ones too. */
  embedded: Set<string>;
  /** What its blocks waited for, a module still loading (16.6): a block that did is never kept. */
  pending: Set<string>;
  /** Inside an embed: its links are at the embed's line, and resolved from the embedded note. */
  linkSrc?: number;
  linkFrom?: string;
}

/** Embeds inside embeds are drawn this deep, no deeper: past it, a line says to open it. */
const MAX_EMBED_DEPTH = 3;

/** Containers deeper than this render as their plain text: nobody reads 60 levels of quote, and a
 *  hostile note 5,000 deep must not overflow the stack (the note would then show nothing at all). */
const MAX_NESTING = 60;

interface Style {
  role: Role;
  attrs: number;
}

const TEXT: Style = { role: "text", attrs: 0 };

export function renderMarkdown(source: string, opts: RenderOptions): Layout {
  const parsed = parseMarkdown(source);
  return renderTree(parsed.tree, opts, parsed.frontmatter);
}

/**
 * Top-level blocks' rows, kept between renders of the same note (a buffer keeps one, and drops it
 * when anything a render reads besides the text changes: the graph, the theme): a block the parse
 * reused — the same `ORIGIN` — is copied to where it now is, not rendered again (plan 15.1).
 */
export interface RenderCache {
  /** Width, glyphs, URLs and the note's definitions: a change drops every block. */
  key: string;
  blocks: WeakMap<object, CachedBlock>;
}

interface CachedBlock {
  lines: Line[];
  links: LayoutLink[];
  headings: Omit<LayoutHeading, "line">[];
  /** The block's first source line when it was rendered. */
  src: number;
}

export function newRenderCache(): RenderCache {
  return { key: "", blocks: new WeakMap() };
}

export function renderTree(tree: Root, opts: RenderOptions, frontmatter?: Frontmatter | null, cache?: RenderCache): Layout {
  const ctx: Ctx = { opts, links: [], headings: [], definitions: new Map(), nesting: 0, embedChain: opts.embedFrom ? [opts.embedFrom] : [], embedded: new Set(), pending: new Set() };
  collectDefinitions(tree, ctx);
  const width = Math.max(8, opts.width);
  if (!cache) return finish(blocks(tree.children, ctx, width, TEXT, frontmatter), ctx, width);
  const key = `${width}|${opts.glyphs.mode}|${opts.showUrls ? 1 : 0}|${[...ctx.definitions].join("\u0001")}`;
  if (cache.key !== key) {
    cache.key = key;
    cache.blocks = new WeakMap();
  }
  const out: Line[] = [];
  let prev: RootContent | undefined;
  for (const node of tree.children) {
    const origin = (node as unknown as Record<symbol, object | undefined>)[ORIGIN];
    let hit = origin ? cache.blocks.get(origin) : undefined;
    if (!hit) {
      // Rendered on its own: its links and headings numbered from 0, renumbered when placed.
      const own: Ctx = { ...ctx, links: [], headings: [], embedded: new Set(), pending: new Set() };
      const rows = block(node, own, width, TEXT, frontmatter);
      if (rows === null) continue;
      hit = { lines: rows, links: own.links, headings: own.headings, src: srcOf(node) };
      // A block with an embed draws another note, which changes on its own: never kept (1.11).
      for (const p of own.embedded) ctx.embedded.add(p);
      // One drawn while what it needs loads (a diagram as its code): never kept either.
      for (const p of own.pending) ctx.pending.add(p);
      if (origin && !own.embedded.size && !own.pending.size) cache.blocks.set(origin, hit);
    }
    const delta = srcOf(node) - hit.src;
    const linkBase = ctx.links.length;
    const headBase = ctx.headings.length;
    for (const l of hit.links) ctx.links.push({ ...l, src: l.src + delta });
    for (const h of hit.headings) ctx.headings.push({ ...h, src: h.src + delta });
    if (out.length && !joined(prev, node)) out.push(gapAfter(out, srcOf(node)));
    prev = node;
    // Copies: `finish` edits spans in place, and the cached rows serve the next render too.
    for (const line of hit.lines) out.push(placed(line, delta, linkBase, headBase));
  }
  return finish(out, ctx, width);
}

/** A cached row, moved `delta` source lines and renumbered into the layout's links and headings. */
function placed(line: Line, delta: number, linkBase: number, headBase: number): Line {
  const spans = line.spans.map((s) => {
    const c: Span = { ...s };
    if (s.src !== undefined) c.src = s.src + delta;
    if (s.link !== undefined) c.link = s.link + linkBase;
    if (s.task) c.task = { ...s.task, line: s.task.line + delta, end: s.task.end + delta };
    return c;
  });
  const c: Line = { ...line, spans, src: line.src + delta };
  if (line.heading !== undefined) c.heading = line.heading + headBase;
  return c;
}

function finish(lines: Line[], ctx: Ctx, width: number): Layout {
  const out = finishRows(lines, ctx, width);
  return { ...out, ...(ctx.embedded.size ? { embedded: [...ctx.embedded] } : {}), ...(ctx.pending.size ? { pending: [...ctx.pending] } : {}) };
}

function finishRows(lines: Line[], ctx: Ctx, width: number): Layout {
  const headings: LayoutHeading[] = [];
  let clipped = 0;
  lines.forEach((line, i) => {
    // Constraint 2.9, as a last line of defence: no span leaves the layout carrying a terminal
    // escape, whichever path built it (footnote labels, frontmatter keys, …).
    for (const span of line.spans) span.text = sanitize(span.text);
    if (enforceRow(line, width)) clipped++;
    if (line.heading !== undefined) headings[line.heading] = { ...ctx.headings[line.heading]!, line: i };
    let col = 0;
    for (const span of line.spans) {
      if (span.link !== undefined) {
        const l = ctx.links[span.link]!;
        if (l.line < 0) {
          l.line = i;
          l.col = col;
        }
      }
      col += stringWidth(span.text);
    }
  });
  return { lines, links: ctx.links, headings: headings.filter(Boolean), width, clipped };
}

/**
 * The IR's invariants, enforced once at the end so no block can break them: no tab reaches a span
 * (the width function gives it no columns), and no row is wider than the layout. Blocks already
 * fit; this catches pathological nesting at very narrow widths, clipping rather than overflowing.
 * True when it had to clip (counted in `Layout.clipped`, which the tests hold at 0).
 */
function enforceRow(line: Line, width: number): boolean {
  let used = 0;
  const kept: Span[] = [];
  for (const span of line.spans) {
    if (span.text.includes("\t")) span.text = span.text.replace(/\t/g, " ");
    const w = stringWidth(span.text);
    if (used + w <= width) {
      kept.push(span);
      used += w;
      continue;
    }
    let cut = "";
    for (const g of graphemes(span.text)) {
      const gw = graphemeWidth(g);
      if (used + gw > width) break;
      cut += g;
      used += gw;
    }
    if (cut) kept.push({ ...span, text: cut });
    line.spans = kept;
    return true;
  }
  line.spans = kept;
  return false;
}

function collectDefinitions(tree: Root, ctx: Ctx) {
  const walk = (n: Nodes) => {
    // The first definition of a label wins (CommonMark), not the last.
    if (n.type === "definition" && !ctx.definitions.has(n.identifier.toLowerCase())) ctx.definitions.set(n.identifier.toLowerCase(), n.url);
    const ch = (n as Parents).children;
    if (ch) for (const c of ch) walk(c);
  };
  walk(tree);
}

// ---------------------------------------------------------------------------------------------
// Blocks

function srcOf(n: Nodes): number {
  return n.position?.start.line ?? 1;
}

/** Separator rows carry the source line of the row above, so anchoring to a block's first line
 *  lands on the block, never on the gap before it (3.5). */
function gapAfter(rows: Line[], fallback: number): Line {
  return blank(rows[rows.length - 1]?.src ?? fallback);
}

function blank(src: number): Line {
  return { spans: [], src };
}

function blocks(nodes: RootContent[], ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null, tight = false): Line[] {
  const out: Line[] = [];
  let prev: RootContent | undefined;
  for (const node of nodes) {
    const rendered = block(node, ctx, width, base, fm);
    if (rendered === null) continue;
    if (out.length && !tight && !joined(prev, node)) out.push(gapAfter(out, srcOf(node)));
    out.push(...rendered);
    prev = node;
  }
  return out;
}

/** A data file's keys and comment lines follow each other with no blank row between (16.11). */
function joined(prev: RootContent | undefined, node: RootContent): boolean {
  const row = (n: RootContent | undefined) => {
    const t = (n as { type?: string } | undefined)?.type;
    // A data file's rows follow each other, a table in its tree too (no gap breaks the guides).
    return t === "dataField" || t === "dataComment" || (t === "table" && !!placeOf(n as RootContent));
  };
  return row(prev) && row(node);
}

function block(node: RootContent, ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null): Line[] | null {
  switch (node.type) {
    case "heading":
      return heading(node.depth, node.children, srcOf(node), ctx, width, (node.data as { id?: string } | undefined)?.id);
    case "paragraph":
      return paragraph(node.children, srcOf(node), ctx, width, base);
    case "math": {
      // Typeset as a picture, where that's chosen (12.17).
      if (ctx.opts.drawings?.math && ctx.opts.picture) {
        const r = rasterizer();
        const t = typesetter();
        if (!r) ctx.pending.add(RESVG);
        if (!t) ctx.pending.add(MATHJAX);
        const svg = r && t ? t(node.value, ctx.opts.drawings.colors.math) : null;
        const drawn = svg ? drawing(svg, "math", srcOf(node), ctx, width) : null;
        if (drawn) return drawn;
      }
      // A display (12.11): its rows in Unicode, centred together; one that can't be, or wider than the text, as written.
      const rows = mathRows(sanitize(node.value));
      const widest = rows ? Math.max(...rows.map(stringWidth)) : 0;
      if (!rows || widest > width) return codeBlock(node.value, "math", srcOf(node), ctx, width, 1, rows ? "too wide to draw" : "as written");
      const indent = " ".repeat(Math.floor((width - widest) / 2));
      return rows.map((r) => ({ spans: [...(indent ? [{ text: indent, role: "text" as Role, attrs: 0 }] : []), { text: r, role: "math" as Role, attrs: 0 }], src: srcOf(node) }));
    }
    case "thematicBreak":
      return [{ spans: [{ text: ctx.opts.glyphs.rule.repeat(width), role: "rule", attrs: 0 }], src: srcOf(node) }];
    case "code": {
      // A fenced block's code starts a line after its fence; an indented one's on its own line.
      const span = node.position ? node.position.end.line - node.position.start.line + 1 : 0;
      const fenced = !node.position || span > node.value.split("\n").length;
      if (node.lang && /^mermaid$/i.test(node.lang)) {
        // As a picture, where that's chosen (12.16).
        if (ctx.opts.drawings?.mermaid && ctx.opts.picture) {
          const r = rasterizer();
          const svg = r ? mermaidSvg(sanitize(node.value), ctx.opts.drawings.colors, r.family) : null;
          if (!r) ctx.pending.add(RESVG);
          const rows = svg ? drawing(svg, "diagram", srcOf(node), ctx, width) : null;
          if (rows) return rows;
        }
        // Drawn in the terminal's own characters (12.10); its code where it can't be, saying why.
        const d = drawMermaid(sanitize(node.value), width, ctx.opts.glyphs.mode === "ascii");
        if (!d) ctx.pending.add(MERMAID);
        if (d && "rows" in d) return diagram(d.rows, srcOf(node), ctx.opts.glyphs.mode === "ascii");
        return codeBlock(node.value, node.lang, srcOf(node), ctx, width, fenced ? 1 : 0, d?.why);
      }
      return codeBlock(node.value, node.lang ?? null, srcOf(node), ctx, width, fenced ? 1 : 0);
    }
    case "blockquote":
    case "list": {
      if (ctx.nesting >= MAX_NESTING) return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
      ctx.nesting++;
      try {
        return node.type === "list" ? list(node, ctx, width, base) : blockquote(node.children, srcOf(node), ctx, width, (node.data as { literal?: boolean } | undefined)?.literal);
      } finally {
        ctx.nesting--;
      }
    }
    case "table": {
      // A table of records in a data file's tree (16.12): under its key, inside the guides.
      const place = placeOf(node);
      if (!place?.lasts.length) return table(node, ctx, width);
      const guide = guides(place.lasts, "down", ctx, width - 8);
      const w = guide.reduce((a, s) => a + stringWidth(s.text), 0);
      return prefixed(table(node, ctx, width - w), guide, srcOf(node), true);
    }
    case "html":
      return htmlBlock(node.value, srcOf(node), width);
    case "yaml":
      return frontmatterBlock(fm ?? null, node.value, srcOf(node), ctx, width);
    case "definition":
      return null;
    case "footnoteDefinition": {
      const label = `${node.label ?? node.identifier}.`;
      const marker: Span = { text: `${label} `, role: "footnote", attrs: 0 };
      // Its paragraphs keep their gaps; its first row says whose definition it is, so a [^Ref]
      // finds it whatever the label's case, and inside a quote or a list too.
      const rows =
        width - stringWidth(marker.text) < MIN_NESTED
          ? [{ spans: [marker], src: srcOf(node) }, ...blocks(node.children, ctx, width, base)]
          : prefixed(blocks(node.children, ctx, width - stringWidth(marker.text), base), [marker], srcOf(node));
      if (rows[0]) rows[0] = { ...rows[0], footnoteDef: node.identifier };
      return rows;
    }
    default:
      if ((node.type as string) === "toml") return frontmatterBlock(fm ?? null, (node as { value: string }).value, srcOf(node), ctx, width);
      if ((node.type as string) === "dataField") return dataField(node as unknown as DataField, ctx, width);
      if ((node.type as string) === "dataComment") return dataComment(node as unknown as DataComment, width, ctx);
      // Unknown block: show its text rather than lose it.
      return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
  }
}

function heading(depth: number, children: PhrasingContent[], src: number, ctx: Ctx, width: number, id?: string): Line[] {
  const role = `h${Math.min(6, Math.max(1, depth))}` as Role;
  const g = ctx.opts.glyphs;
  const icon = g.mode === "nerd" ? g.heading[depth - 1]! : `${g.heading[depth - 1]} `;
  const spans = inline(children, ctx, { role, attrs: A_BOLD }, src);
  // The heading's text and slug as the outline (headingsOf) has them — not the drawn spans, which
  // carry footnote marks and image glyphs. Repeated headings share a slug; their occurrence tells
  // them apart (anchors count it), so [[#A-1]] is the heading "A-1", never the second "A".
  const { text, slug } = headingLabel({ type: "heading", depth: depth as Heading["depth"], children });
  const idx = ctx.headings.push({ level: depth, text, slug, src, ...(id ? { id } : {}) }) - 1;
  const iconW = stringWidth(icon);
  const rows = wrapSpans(spans, width - iconW);
  return rows.map((row, i) => ({
    spans: [{ text: i === 0 ? icon : " ".repeat(iconW), role, attrs: A_BOLD }, ...row],
    src,
    fill: role,
    heading: i === 0 ? idx : undefined,
  }));
}

function paragraph(children: PhrasingContent[], src: number, ctx: Ctx, width: number, base: Style): Line[] {
  // Embeds alone in their paragraph (1.11), each on its line: a note's drawn in place.
  const framed = embedsAlone(children, src, ctx, width, base);
  if (framed) return framed;
  const pictured = picturesAlone(children, src, ctx, width, base);
  if (pictured) return pictured;
  const spans = inline(children, ctx, base, src);
  return wrapSpans(spans, width).map((row) => ({ spans: row, src: row[0]?.src ?? src }));
}

/**
 * A paragraph of nothing but embeds (and the line breaks between them), as Obsidian draws one
 * (1.11): each embedded note framed in place, a picture or anything else a reference as before.
 * Null when there's other text, or no embed of a note: then it's a paragraph like any.
 */
function embedsAlone(children: PhrasingContent[], src: number, ctx: Ctx, width: number, base: Style): Line[] | null {
  if (!ctx.opts.embed) return null;
  const embeds: EmbedRef[] = [];
  for (const c of children) {
    if ((c.type as string) === "wikiLink" && (c as unknown as WikiLink).embed) {
      const w = c as unknown as WikiLink;
      embeds.push({ kind: "embed", target: w.target, heading: w.heading, block: w.block, link: w.target, node: c });
    } else if (c.type === "image" && NOTE_URL.test(c.url.split("#")[0]!)) embeds.push({ kind: "image", ...urlParts(c.url), link: c.url, node: c });
    else if (c.type === "image") embeds.push({ kind: "image", target: "", heading: null, block: null, link: c.url, node: c });
    else if (!(c.type === "break" || (c.type === "text" && !c.value.trim()))) return null;
  }
  const found = embeds.map((r) => ({ r, e: r.target ? ctx.opts.embed!(r.target, r.heading, r.block, r.kind) : null }));
  if (!found.some((f) => f.e)) return null;
  const out: Line[] = [];
  for (const { r, e } of found) {
    const at = (r.node as unknown as { position?: { start: { line: number } } }).position?.start.line ?? src;
    if (e) out.push(...embedFrame(r, e, at, ctx, width));
    else {
      const from = pictureSource(r.node);
      out.push(...pictureRows(r.node, from ? askPicture(from, width, ctx) : null, at, ctx, width, base));
    }
  }
  return out;
}

/**
 * A paragraph of nothing but pictures (and the line breaks between them), 12.x: each its `▣ alt` line, then the rows
 * the image is drawn over — blank frame rows, the first carrying the picture. Null when there's other text, or no
 * picture drawn (no images here, none local): then it's a paragraph like any, `▣ alt` the floor.
 */
function picturesAlone(children: PhrasingContent[], src: number, ctx: Ctx, width: number, base: Style): Line[] | null {
  if (!ctx.opts.picture) return null;
  const images = children.flatMap((c) => {
    const from = pictureSource(c);
    return from ? [{ c, from }] : [];
  });
  if (!images.length || images.length !== children.filter((c) => !(c.type === "break" || (c.type === "text" && !c.value.trim()))).length) return null;
  const drawn = images.map(({ c, from }) => ({ c, p: askPicture(from, width, ctx) }));
  if (!drawn.some((d) => d.p)) return null;
  return drawn.flatMap(({ c, p }) => pictureRows(c, p, c.position?.start.line ?? src, ctx, width, base));
}

/** A picture asked for: an SVG's (12.15) waits for its rasteriser — the layout says so, and is made again when it's in. */
function askPicture(from: PictureSource, width: number, ctx: Ctx): Picture | null {
  if (!ctx.opts.picture) return null;
  const named = "url" in from ? from.url.split(/[?#]/)[0]! : "name" in from ? from.name : "";
  if (/\.svg$/i.test(named) && !rasterizer()) ctx.pending.add(RESVG);
  return ctx.opts.picture(from, width);
}

/** A picture's `▣ alt` line (anything else's reference), then — where it's drawn — the rows its image is drawn over:
 *  blank frame rows, the first carrying the picture. */
function pictureRows(c: PhrasingContent, p: Picture | null, at: number, ctx: Ctx, width: number, base: Style): Line[] {
  const out: Line[] = wrapSpans(inline([c], ctx, base, at), width).map((row) => ({ spans: row, src: at }));
  if (p) for (let k = 0; k < p.rows; k++) out.push({ spans: [], src: at, decor: true, ...(k === 0 ? { image: p } : {}) });
  return out;
}

/** Where a picture is drawn from: a markdown image's URL, or a picture embedded by name (`![[dal.png|300]]`) and the
 *  size its `|…` gives it. Null for anything else. */
function pictureSource(c: PhrasingContent): PictureSource | null {
  if (c.type === "image") return { url: c.url };
  if ((c.type as string) !== "wikiLink") return null;
  const w = c as unknown as WikiLink;
  if (!w.embed || !IMAGE_FILE.test(w.target)) return null;
  const m = SIZE.exec(w.alias?.trim() ?? "");
  return { name: w.target, size: m ? { width: Number(m[1]), height: m[2] ? Number(m[2]) : null } : null };
}

/** An embed as written: a wikilink's (`![[…]]`), or a path's (`![…](note.md)`, 20.1). */
interface EmbedRef {
  kind: "embed" | "image";
  target: string;
  heading: string | null;
  block: string | null;
  /** What its header links to: a wikilink's target, a path's whole URL (its fragment followed too). */
  link: string;
  node: PhrasingContent;
}

/** A URL that names a note: an image-syntax link to it embeds it. */
const NOTE_URL = /\.(md|markdown)$/i;

/** A picture's file, embedded by name (`![[dal.png]]`), and the size Obsidian lets it carry. */
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?|heic)$/i;
const SIZE = /^(\d+)(?:x(\d+))?$/;

/** An image URL's path and its fragment: `#^id` a block, any other a heading. */
function urlParts(url: string): { target: string; heading: string | null; block: string | null } {
  const hash = url.indexOf("#");
  const target = hash >= 0 ? url.slice(0, hash) : url;
  let frag = hash >= 0 ? url.slice(hash + 1) : "";
  try {
    frag = decodeURIComponent(frag);
  } catch {}
  return { target, heading: frag && !frag.startsWith("^") ? frag : null, block: frag.startsWith("^") ? frag.slice(1) : null };
}

/**
 * An embedded note drawn in place: a header naming it (a link to it), then its blocks behind a bar,
 * read-only. Every row is at the embed's own line — the anchors and the cursor know only the note
 * shown — and its headings stay out of that note's outline. Loops and depth are capped, said so.
 */
function embedFrame(w: EmbedRef, e: Embedded, src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const id = addLink(ctx, { kind: w.kind, target: w.link, heading: w.heading, text: e.title, status: "resolved", src });
  const head = wrapSpans([{ text: `${g.embed} `, role: "embed", attrs: 0, link: id }, { text: sanitize(e.title), role: "embed", attrs: A_BOLD, link: id }], width).map((row) => ({ spans: row, src }));
  const note = (text: string): Line[] => [{ spans: [{ text, role: "dim", attrs: A_ITALIC }], src }];
  const narrow = width - 2 < MIN_NESTED;
  let body: Line[];
  if (ctx.embedChain.includes(e.path)) body = note("embeds itself: not drawn again");
  else if (ctx.embedChain.length > MAX_EMBED_DEPTH) body = note("embedded deeper still: enter opens it");
  else if (!e.nodes) body = note(e.missing ?? "nothing there");
  else {
    ctx.embedded.add(e.path);
    const inner: Ctx = {
      opts: { ...ctx.opts, resolveLink: e.resolveLink ?? ctx.opts.resolveLink, embed: e.embed, picture: embeddedPictures(ctx.opts.picture, e.locate) },
      links: ctx.links,
      headings: [],
      definitions: new Map(),
      nesting: ctx.nesting + 1,
      embedChain: [...ctx.embedChain, e.path],
      embedded: ctx.embedded,
      pending: ctx.pending,
      linkSrc: ctx.linkSrc ?? src,
      linkFrom: e.from,
    };
    collectDefinitions({ type: "root", children: e.nodes }, inner);
    body = blocks(e.nodes, inner, narrow ? width : width - 2, TEXT);
    if (!body.length) body = note("empty");
  }
  // At the embed's line, its own lines and headings forgotten: they're another note's.
  const placed = body.map((l) => ({ ...l, src, heading: undefined, spans: l.spans.map((s) => ({ ...s, src: undefined })) }));
  // Too narrow to indent: no bar, the body keeps the room (the title row still says whose it is).
  return [...head, ...(narrow ? placed : prefixed(placed, [{ text: `${g.quoteBar} `, role: "embed", attrs: 0 }], src, true))];
}

/** An embedded note's pictures (12.14): found from where it is, then drawn as the note showing it draws its own. */
function embeddedPictures(picture: RenderOptions["picture"], locate: Embedded["locate"]): RenderOptions["picture"] {
  if (!picture || !locate) return undefined;
  return (from, width) => {
    const found = locate(from);
    return found ? picture(found, width) : null;
  };
}

/**
 * A drawing slipbox makes as a picture (12.16, 12.17), centred: its first row holds the indent before it — where the
 * cursor stops, the lens opening on the block's source — the rest are the rows it's drawn over. Null where there's no
 * picture of it (pictures aren't drawn, it's wider than the text): then it's drawn in text.
 */
function drawing(svg: string, kind: "diagram" | "math", src: number, ctx: Ctx, width: number): Line[] | null {
  const p = ctx.opts.picture?.({ svg, kind }, width - 1);
  if (!p) return null;
  const indent = Math.max(1, Math.floor((width - p.cols) / 2));
  return Array.from({ length: p.rows }, (_, k): Line => (k === 0 ? { spans: [{ text: " ".repeat(indent), role: "text", attrs: 0 }], src, image: p } : { spans: [], src, decor: true }));
}

/** A diagram drawn in text (12.10), every row at its block's line: its lines in the table's border colour, its words
 *  as text. */
function diagram(rows: string[], src: number, ascii: boolean): Line[] {
  const drawing = ascii ? ASCII_DRAWING : DRAWING;
  return rows.map((row) => {
    const spans: Span[] = [];
    for (const g of graphemes(sanitize(row))) {
      const role: Role = drawing.test(g) ? "table_border" : "text";
      const last = spans[spans.length - 1];
      if (last?.role === role) last.text += g;
      else spans.push({ text: g, role, attrs: 0 });
    }
    return { spans, src };
  });
}

/** A diagram's lines, arrows and node shapes: box drawing, arrows, geometric shapes — in ASCII, `+ - | < > ^`. */
const DRAWING = /^[\u2190-\u21ff\u2500-\u257f\u25a0-\u25ff]$/;
const ASCII_DRAWING = /^[+\-|<>^]$/;

/** `note`: why a block that's drawn elsewhere is its code here (a diagram too wide, a kind not drawn), after its
 *  language in the label. */
function codeBlock(value: string, lang: string | null, src: number, ctx: Ctx, width: number, firstLine = 1, note?: string): Line[] {
  const g = ctx.opts.glyphs;
  const code = sanitize(value);
  const sourceLines = code.split("\n").map((l) => expandTabs(l));
  const tokens = highlight(sourceLines.join("\n"), lang);
  const out: Line[] = [];
  const label = lang ? sanitize(note ? `${lang} — ${note}` : lang) : "";
  // Top padding row carries the language label, right-aligned.
  const top: Span[] = [];
  if (label) {
    // Cut with … when wider than the row, never left to the last defence's clip (lost text).
    const shown = truncate(label, Math.max(1, width - 1));
    const lw = stringWidth(shown) + 1;
    top.push({ text: " ".repeat(Math.max(0, width - lw)), role: "code_block", attrs: 0 }, { text: `${shown} `, role: "code_label", attrs: 0 });
  }
  out.push({ spans: top, src, fill: "code_block" });
  const inner = Math.max(1, width - 2);
  sourceLines.forEach((text, i) => {
    const lineSrc = src + firstLine + i;
    const spans: Span[] = tokens?.[i]?.length
      ? tokens[i]!.map((t) => ({ text: t.text, role: t.role ?? "code_block", attrs: 0, src: lineSrc }))
      : [{ text, role: "code_block", attrs: 0, src: lineSrc }];
    // Hard wrap at the block width; continuation rows carry a marker in the gutter.
    const rows = breakHard(spans, inner);
    rows.forEach((row, r) => {
      const gutter: Span = { text: r === 0 ? " " : g.codeWrap.slice(0, 1), role: "code_gutter", attrs: 0 };
      out.push({ spans: [gutter, ...row], src: lineSrc, fill: "code_block" });
    });
  });
  out.push({ spans: [], src: src + sourceLines.length + 1, fill: "code_block" });
  return out;
}

/** Break spans into rows of at most `width` columns, by grapheme, keeping styles. */
function breakHard(spans: Span[], width: number): Span[][] {
  const rows: Span[][] = [[]];
  let w = 0;
  for (const span of spans) {
    let cur = "";
    for (const g of graphemes(span.text)) {
      const gw = graphemeWidth(g);
      if (w + gw > width && w > 0) {
        if (cur) rows[rows.length - 1]!.push({ ...span, text: cur });
        rows.push([]);
        cur = "";
        w = 0;
      }
      cur += g;
      w += gw;
    }
    if (cur) rows[rows.length - 1]!.push({ ...span, text: cur });
  }
  return rows;
}

const CALLOUT = /^\[!([A-Za-z]+)\]([+-])?[ \t]*/;

function blockquote(children: RootContent[], src: number, ctx: Ctx, width: number, literal = false): Line[] {
  const g = ctx.opts.glyphs;
  // Obsidian / GitHub callout: `> [!note] Optional title` — unless its bracket is escaped (`literal`).
  const first = children[0];
  const lead = first?.type === "paragraph" ? first.children[0] : undefined;
  const m = lead?.type === "text" && !literal ? CALLOUT.exec(lead.value) : null;
  if (m && first?.type === "paragraph" && lead?.type === "text") {
    const kind = m[1]!.toLowerCase();
    const role = calloutRole(kind);
    const rest = lead.value.slice(m[0].length);
    const nl = rest.indexOf("\n");
    const titleText = (nl >= 0 ? rest.slice(0, nl) : rest).trim();
    const bodyFirst: PhrasingContent[] = [];
    if (nl >= 0) bodyFirst.push({ type: "text", value: rest.slice(nl + 1) }, ...first.children.slice(1));
    else if (!titleText) bodyFirst.push(...first.children.slice(1));
    const titleChildren: PhrasingContent[] = titleText ? [{ type: "text", value: titleText }, ...(nl >= 0 ? [] : first.children.slice(1))] : [];
    const icon = g.callout[kind] ?? g.callout.note!;
    const titleSpans: Span[] = [{ text: `${icon} `, role, attrs: 0 }];
    if (titleChildren.length) titleSpans.push(...inline(titleChildren, ctx, { role, attrs: A_BOLD }, src));
    else titleSpans.push({ text: kind[0]!.toUpperCase() + kind.slice(1), role, attrs: A_BOLD });
    const body: RootContent[] = [];
    if (bodyFirst.length && textOf({ type: "paragraph", children: bodyFirst }).trim()) body.push({ ...first, children: bodyFirst });
    body.push(...children.slice(1));
    // Too narrow to indent, as a quote: no bar, the title and the text keep the room.
    const narrow = width - 2 < MIN_NESTED;
    const inner = narrow ? width : width - 2;
    const lines: Line[] = wrapSpans(titleSpans, inner).map((row) => ({ spans: row, src }));
    lines.push(...blocks(body, ctx, inner, TEXT));
    return narrow ? lines : prefixed(lines, [{ text: `${g.quoteBar} `, role, attrs: 0 }], src, true);
  }
  // Too narrow to indent (deep nesting in a narrow window): no bar, the text keeps the room.
  if (width - 2 < MIN_NESTED) return blocks(children, ctx, width, { role: "quote", attrs: 0 });
  const lines = blocks(children, ctx, width - 2, { role: "quote", attrs: 0 });
  return prefixed(lines, [{ text: `${g.quoteBar} `, role: "quote_bar", attrs: 0 }], src, true);
}

/** A wide character of a script written without spaces between words (Han, kana; not Hangul or emoji). */
function joinsWithoutSpace(g: string): boolean {
  return !!g && graphemeWidth(g) === 2 && !/[\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(g);
}

/** Below this many columns for a child, a container stops indenting (a quote's bar, a list's hang). */
const MIN_NESTED = 8;

function calloutRole(kind: string): Role {
  switch (kind) {
    case "tip":
    case "hint":
    case "success":
    case "check":
    case "done":
      return "callout_tip";
    case "important":
    case "abstract":
    case "summary":
    case "tldr":
      return "callout_important";
    case "warning":
    case "attention":
    case "question":
    case "help":
    case "faq":
      return "callout_warning";
    case "caution":
    case "danger":
    case "error":
    case "failure":
    case "fail":
    case "bug":
      return "callout_caution";
    default:
      return "callout_note";
  }
}

/** Prefix every row: `first` on row one, spaces of the same width after (or `first` on all rows). */
function prefixed(lines: Line[], first: Span[], src: number, everyRow = false): Line[] {
  const w = first.reduce((a, s) => a + stringWidth(s.text), 0);
  const hang: Span[] = [{ text: " ".repeat(w), role: "text", attrs: 0 }];
  if (lines.length === 0) return [{ spans: first, src }];
  return lines.map((line, i) => ({ ...line, spans: [...(i === 0 || everyRow ? first : hang), ...line.spans] }));
}

/** A list inside a list item, counted against the nesting cap like any container. */
function nestedList(node: Extract<RootContent, { type: "list" }>, ctx: Ctx, width: number, base: Style, depth: number): Line[] {
  if (ctx.nesting >= MAX_NESTING) return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
  ctx.nesting++;
  try {
    return list(node, ctx, width, base, depth);
  } finally {
    ctx.nesting--;
  }
}

function list(node: Extract<RootContent, { type: "list" }>, ctx: Ctx, width: number, base: Style, depth = 0): Line[] {
  const g = ctx.opts.glyphs;
  const start = node.start ?? 1;
  const markers = node.children.map((item, i) => {
    // A numbered task keeps its number before its box (GitHub's way).
    const num = node.ordered ? `${start + i}. ` : "";
    if (item.checked === true) return { text: `${num}${g.checkDone} `, role: "check_done" as Role };
    if (item.checked === false) return { text: `${num}${g.checkTodo} `, role: "check_todo" as Role };
    if (node.ordered) return { text: `${start + i}. `, role: "list_marker" as Role };
    return { text: `${g.bullets[depth % g.bullets.length]} `, role: "list_marker" as Role };
  });
  const markerW = Math.max(...markers.map((m) => stringWidth(m.text)));
  const out: Line[] = [];
  node.children.forEach((item, i) => {
    const m = markers[i]!;
    const text = node.ordered ? m.text.padStart(markerW - stringWidth(m.text) + m.text.length) : padEnd(m.text, markerW);
    // Too narrow to hang the item beside its marker: the marker on a row of its own, the item
    // below it at the full width (text is never cut to make room for an indent).
    const hang = width - markerW >= MIN_NESTED;
    const inner = hang ? width - markerW : width;
    const lines: Line[] = [];
    item.children.forEach((child, ci) => {
      const rendered =
        child.type === "list" ? nestedList(child, ctx, inner, base, depth + 1) : (block(child, ctx, inner, item.checked === true ? { role: "dim", attrs: 0 } : base) ?? []);
      // Nothing drawn (a definition, a comment): no gap for it either.
      if (!rendered.length) return;
      if (ci > 0 && lines.length && (node.spread || child.type !== "list")) lines.push(gapAfter(lines, srcOf(child)));
      lines.push(...rendered);
    });
    if (i > 0 && node.spread) out.push(gapAfter(out, srcOf(item)));
    const task = typeof item.checked === "boolean" ? { line: srcOf(item), end: item.position?.end.line ?? srcOf(item), checked: item.checked } : undefined;
    const marker: Span = { text, role: m.role, attrs: 0, ...(task ? { task } : {}) };
    if (hang) out.push(...prefixed(lines, [marker], srcOf(item)));
    else out.push({ spans: [{ ...marker, text: text.trimEnd() }], src: srcOf(item) }, ...lines);
  });
  return out;
}

function htmlBlock(value: string, src: number, width: number): Line[] | null {
  // Comments are hidden, one by one (not everything from the first to the last: text between two
  // is kept); a block that was only comments draws nothing. A comment leaves its line breaks, so
  // each row keeps its source line, and a line it emptied draws no row.
  const before = value.split("\n");
  value = value.replace(/<!--[\s\S]*?-->/g, (m) => "\n".repeat(m.split("\n").length - 1));
  const v = value.trim();
  if (!v) return null;
  if (/^<br\s*\/?>$/i.test(v)) return [blank(src)];
  const out: Line[] = [];
  sanitize(value)
    .split("\n")
    .forEach((text, i) => {
      if (!text.trim() && before[i]?.trim()) return;
      for (const row of breakHard([{ text: expandTabs(text), role: "html", attrs: 0 }], width)) out.push({ spans: row, src: src + i });
    });
  return out;
}

function frontmatterBlock(fm: Frontmatter | null, raw: string, src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const title = truncate(` ${g.fmOpen} properties `, Math.max(0, width - 2));
  const top: Span[] = [
    { text: g.rule.repeat(2), role: "fm_border", attrs: 0 },
    { text: title, role: "fm_border", attrs: 0 },
    { text: g.rule.repeat(Math.max(0, width - 2 - stringWidth(title))), role: "fm_border", attrs: 0 },
  ];
  const out: Line[] = [{ spans: top, src }];
  const data = fm?.data;
  if (data && Object.keys(data).length) {
    const keys = Object.keys(data);
    const keyW = Math.min(20, Math.max(...keys.map((k) => stringWidth(sanitize(k)))), Math.floor(width / 3));
    let line = src + 1;
    for (const key of keys) {
      const value = formatValue(data[key]);
      const keyLine = findKeyLine(raw, key);
      const ksrc = keyLine >= 0 ? src + 1 + keyLine : line;
      const valueRows = wrapSpans(propertySpans(value, ksrc, ctx), Math.max(4, width - keyW - 3));
      valueRows.forEach((row, i) => {
        // A key longer than the column is cut with an ellipsis, never silently.
        const k = i === 0 ? padEnd(truncate(sanitize(key), keyW), keyW) : " ".repeat(keyW);
        out.push({ spans: [{ text: ` ${k}`, role: "fm_key", attrs: 0 }, { text: "  ", role: "text", attrs: 0 }, ...row], src: ksrc });
      });
      line++;
    }
  } else {
    raw.split("\n").forEach((text, i) => {
      for (const row of breakHard([{ text: ` ${expandTabs(sanitize(text))}`, role: "fm_value", attrs: 0 }], width)) out.push({ spans: row, src: src + 1 + i });
    });
    if (fm?.error) for (const row of wrapSpans([{ text: sanitize(fm.error), role: "fm_error", attrs: 0 }], Math.max(1, width - 1))) out.push({ spans: [{ text: " ", role: "fm_error", attrs: 0 }, ...row], src });
  }
  out.push({ spans: [{ text: g.rule.repeat(width), role: "fm_border", attrs: 0 }], src: src + raw.split("\n").length + 1 });
  return out;
}

/**
 * A property's value as spans: its text, and each wikilink in it a link (Obsidian's properties:
 * `related: "[[Plan]]"`), drawn and followed as the text's are.
 */
function propertySpans(value: string, src: number, ctx: Ctx): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of value.matchAll(/(!?)\[\[([^[\]\n]+)\]\]/g)) {
    if (m.index! > last) out.push({ text: value.slice(last, m.index), role: "fm_value", attrs: 0 });
    const w = parseWikiTarget(m[2]!);
    const kind = m[1] ? "embed" : "wiki";
    const s = status(ctx, kind, w.target);
    const shown = w.alias ?? (w.heading ? `${w.target} › ${w.heading}` : w.block ? `${w.target} ^${w.block}` : w.target);
    const id = addLink(ctx, { kind, target: w.target, heading: w.heading ?? (w.block ? `^${w.block}` : null), text: shown, status: s, src });
    out.push({ text: sanitize(shown), role: s === "unresolved" ? "link_unresolved" : s === "ambiguous" ? "link_ambiguous" : "wikilink", attrs: 0, link: id });
    last = m.index! + m[0].length;
  }
  if (last < value.length || !out.length) out.push({ text: value.slice(last), role: "fm_value", attrs: 0 });
  return out;
}

/** A table's place in a data file's tree, if it has one. */
function placeOf(n: RootContent): TreePlace | undefined {
  return (n.data as { tree?: TreePlace } | undefined)?.tree;
}

/**
 * The guides before a row of a data file's tree (16.12), from its place: `row`, its own first row
 * (├─ or └─ at its level); `down`, a row below it that is still its (a wrapped value, a table);
 * `above`, comment lines above it (its parent's line running down to it). The top level has none.
 */
function guides(lasts: boolean[], at: "row" | "down" | "above", ctx: Ctx, room = Infinity): Span[] {
  const g = ctx.opts.glyphs;
  // A narrow pane keeps the innermost levels that fit in `room` (3 columns each), so the row's
  // text keeps its floor and nothing is cut; the outer ones go.
  const keep = Math.min(lasts.length, Math.max(0, Math.floor(room / 3)));
  if (keep < lasts.length) lasts = lasts.slice(lasts.length - keep);
  const n = lasts.length;
  if (!n) return [];
  let text = "";
  for (let i = 0; i < n - 1; i++) text += lasts[i] ? "   " : `${g.guide}  `;
  if (at === "row") text += `${lasts[n - 1] ? g.guideLast : g.guideBranch}${g.guideDash} `;
  else if (at === "above") text += `${g.guide}  `;
  else text += lasts[n - 1] ? "   " : `${g.guide}  `;
  return [{ text, role: "table_border", attrs: 0 }];
}

/** A data file's key and value (16.11): drawn like frontmatter's properties, the value coloured
 *  by its kind, a comment dimmed after it; the key column shared by the section's keys. In a tree
 *  (YAML, JSON), inside its guides; a branch (an object's key) is a row of the outline. */
function dataField(f: DataField, ctx: Ctx, width: number): Line[] {
  const src = srcOf(f as unknown as Nodes);
  const place = f.tree;
  // The guides' room: a branch's key keeps 4 columns after its space; a key and value 8.
  const room = width - (place?.branch ? 5 : 8);
  const lead = place ? guides(place.lasts, "row", ctx, room) : [];
  const leadW = lead.reduce((a, s) => a + stringWidth(s.text), 0);
  if (place?.branch) {
    // The key alone, its comment after it; a heading of the outline (and the breadcrumb, and a
    // `#key` link's target), drawn as a row like any other.
    const level = Math.min(6, place.lasts.length + 1);
    const text = sanitize(f.key);
    const idx = ctx.headings.push({ level, text, slug: slugify(text), src }) - 1;
    const spans: Span[] = [{ text: f.key ? text : "·", role: "fm_key", attrs: A_BOLD }];
    if (f.comment) spans.push({ text: `  # ${expandTabs(sanitize(f.comment).replace(/\s*\n\s*/g, " "))}`, role: "syn_comment", attrs: 0 });
    const down = guides(place.lasts, "down", ctx, room);
    const rows = wrapSpans(spans, Math.max(4, width - 1 - leadW));
    return rows.map((row, i) => ({ spans: [{ text: " ", role: "text", attrs: 0 }, ...(i === 0 ? lead : down), ...row], src, heading: i === 0 ? idx : undefined }));
  }
  width -= leadW;
  // The key column leaves the value 4 columns (with the space before the key and the two after it).
  const kw = Math.max(1, Math.min(f.keyWidth || stringWidth(sanitize(f.key)), Math.floor(width / 3), width - 7));
  let role: Role = f.kind === "number" || f.kind === "date" ? "syn_number" : f.kind === "boolean" || f.kind === "null" ? "syn_constant" : "fm_value";
  const value = expandTabs(sanitize(f.value)) || (f.kind === "string" ? '""' : "");
  // A value that is a link (16.15): a URL, a reference key's value, or a path that resolves.
  const l = fieldLink(f);
  const dl = l ? dataValueLink(ctx, l, f.value, f.keyLine) : null;
  if (dl) role = dl.role;
  const spans: Span[] = [{ text: value, role, attrs: 0, ...(dl ? { link: dl.link } : {}) }];
  if (f.comment) spans.push({ text: `${value ? "  " : ""}# ${expandTabs(sanitize(f.comment).replace(/\s*\n\s*/g, " "))}`, role: "syn_comment", attrs: 0 });
  const rows = wrapSpans(spans, Math.max(4, width - kw - 3));
  const down = place ? guides(place.lasts, "down", ctx, room) : [];
  return rows.map((row, i) => ({
    spans: [
      { text: " ", role: "text", attrs: 0 },
      ...(i === 0 ? lead : down),
      { text: i === 0 ? padEnd(truncate(sanitize(f.key), kw), kw) : " ".repeat(kw), role: "fm_key", attrs: 0 },
      { text: "  ", role: "text", attrs: 0 },
      ...row,
    ],
    src,
  }));
}

/** A data value's link (16.15), when it is one: explicit (a URL, a reference key's), or a path that
 *  resolves. A field's value, or a records table's cell. */
function dataValueLink(ctx: Ctx, l: CellLink, text: string, src: number): { link: number; role: Role } | null {
  const s = status(ctx, "markdown", l.target);
  if (!l.explicit && s !== "resolved") return null;
  return { link: addLink(ctx, { kind: "markdown", target: l.target, heading: null, text, status: s, src }), role: s === "unresolved" ? "link_unresolved" : "link" };
}

/** Comment lines of a data file on their own: dimmed, wrapped. */
function dataComment(c: DataComment, width: number, ctx: Ctx): Line[] {
  const src = srcOf(c as unknown as Nodes);
  // In a tree, inside the guides of the key it's above.
  const lead = c.tree ? guides(c.tree.lasts, c.tree.above ? "above" : "down", ctx, width - 5) : [];
  const w = lead.reduce((a, s) => a + stringWidth(s.text), 0);
  return c.text.split("\n").flatMap((text, i) =>
    wrapSpans([{ text: expandTabs(sanitize(text)), role: "syn_comment", attrs: 0 }], Math.max(4, width - 1 - w)).map((row) => ({ spans: [{ text: " ", role: "text", attrs: 0 }, ...lead, ...row], src: src + i })),
  );
}

function findKeyLine(raw: string, key: string): number {
  const lines = raw.split("\n");
  return lines.findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`"${key}":`) || l.startsWith(`'${key}':`));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${formatValue(x)}`)
      .join("; ");
  }
  return sanitize(String(v)).replace(/\s*\n\s*/g, " ").replace(/\t/g, " ");
}

// ---------------------------------------------------------------------------------------------
// Tables

function table(node: Table, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const b = g.box;
  const src = srcOf(node);
  const ncols = Math.max(...node.children.map((r) => r.children.length));
  const align = node.align ?? [];
  const cells: Span[][][] = node.children.map((row, ri) => {
    const style: Style = ri === 0 ? { role: "table_header", attrs: A_BOLD } : TEXT;
    const out: Span[][] = [];
    for (let c = 0; c < ncols; c++) {
      const cell = row.children[c] as TableCell | undefined;
      // A records table's cell whose value is a link (a data file's, 16.15), drawn as a field's is.
      const l = ri > 0 ? (cell?.data as { link?: CellLink } | undefined)?.link : undefined;
      const value = l ? textOf(cell as unknown as Nodes) : "";
      const dl = l ? dataValueLink(ctx, l, value, srcOf(row)) : null;
      out.push(dl ? [{ text: expandTabs(sanitize(value)), role: dl.role, attrs: 0, src: srcOf(row), link: dl.link }] : cell ? inline(cell.children, ctx, style, srcOf(row)) : []);
    }
    return out;
  });
  const desired: number[] = [];
  const minimum: number[] = [];
  for (let c = 0; c < ncols; c++) {
    let d = 1;
    let m = 1;
    for (const row of cells) {
      d = Math.max(d, naturalWidth(row[c]!));
      m = Math.max(m, longestWord(row[c]!));
    }
    desired.push(d + 2 * PADDING);
    minimum.push(m + 2 * PADDING);
  }
  // Measure every cell once; the allocator asks for line counts at many widths.
  const measured = cells.map((row) => row.map((spans) => measure(spans)));
  const alloc = allocate(desired, minimum, width, (col, w) => {
    let splits = 0;
    const lines = measured.map((row) => {
      const f = fit(row[col]!, w);
      splits += f.splits;
      return f.lines;
    });
    return { lines, splits };
  });
  if (alloc.mode === "records") return tableRecords(node, cells, ctx, width);

  const widths = alloc.widths;
  // Each rule belongs to a source line: the top to the table's first, the header rule to the
  // delimiter line, a rule between rows and the bottom to the row above them — so a cursor or a
  // window top on a rule comes back to that rule after a re-layout, not to the table's top.
  const border = (l: string, m: string, r: string, h: string, at = src): Line => ({
    spans: [{ text: l + widths.map((w) => h.repeat(w)).join(m) + r, role: "table_border", attrs: 0 }],
    src: at,
  });
  const wrapped = cells.map((row) => row.map((spans, c) => wrapSpans(spans, widths[c]! - 2 * PADDING)));
  const multiLine = wrapped.slice(1).some((row) => row.some((rows) => rows.length > 1));
  const out: Line[] = [border(b.tl, b.tm, b.tr, b.h)];
  wrapped.forEach((row, ri) => {
    const height = Math.max(...row.map((r) => r.length));
    const rowSrc = srcOf(node.children[ri]!);
    for (let k = 0; k < height; k++) {
      const spans: Span[] = [{ text: b.v, role: "table_border", attrs: 0 }];
      row.forEach((cellRows, c) => {
        const content = cellRows[k] ?? [];
        const cw = content.reduce((a, s) => a + stringWidth(s.text), 0);
        const room = widths[c]! - 2 * PADDING - cw;
        const a = align[c];
        const left = a === "right" ? room : a === "center" ? Math.floor(room / 2) : 0;
        spans.push({ text: " ".repeat(PADDING + left), role: "text", attrs: 0 });
        spans.push(...content);
        spans.push({ text: " ".repeat(room - left + PADDING), role: "text", attrs: 0 });
        spans.push({ text: b.v, role: "table_border", attrs: 0 });
      });
      out.push({ spans, src: rowSrc });
    }
    if (ri === 0) out.push(border(b.hl, b.hx, b.hr, b.hh, rowSrc + 1));
    else if (multiLine && ri < wrapped.length - 1) out.push(border(b.ml, b.mm, b.mr, b.h, rowSrc));
  });
  out.push(border(b.bl, b.bm, b.br, b.h, srcOf(node.children[node.children.length - 1]!)));
  return out;
}

/** Narrow collapse: one record per row, `header: value`, when no grid can fit. */
function tableRecords(node: Table, cells: Span[][][], ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const header = cells[0] ?? [];
  const labels = header.map((h, c) => h.map((s) => s.text).join("").trim() || `#${c + 1}`);
  // Labels in an aligned column (at most a third of the width), values hanging beside them.
  const labelW = Math.max(1, Math.min(Math.max(...labels.map((l) => stringWidth(l))), Math.floor(width / 3)));
  const valueW = Math.max(1, width - labelW - 2);
  const out: Line[] = [];
  const rule = (src: number): Line => ({ spans: [{ text: g.rule.repeat(width), role: "table_border", attrs: 0 }], src });
  cells.slice(1).forEach((row, ri) => {
    const src = srcOf(node.children[ri + 1]!);
    out.push(rule(src));
    row.forEach((spans, c) => {
      // The header's own spans, so a link in it stays a link (placed at its first record).
      const head = header[c]?.some((sp) => sp.text.trim()) ? header[c]!.map((sp) => ({ ...sp, role: sp.link !== undefined ? sp.role : ("table_header" as Role), attrs: sp.attrs | A_BOLD })) : [{ text: labels[c] ?? `#${c + 1}`, role: "table_header" as Role, attrs: A_BOLD }];
      const labelRows = wrapSpans(head, labelW);
      const valueRows = wrapSpans(spans, valueW);
      const n = Math.max(labelRows.length, valueRows.length);
      for (let k = 0; k < n; k++) {
        const label = labelRows[k] ?? [];
        const lw = label.reduce((a, sp) => a + stringWidth(sp.text), 0);
        out.push({ spans: [...label, { text: " ".repeat(labelW - lw + 2), role: "text", attrs: 0 }, ...(valueRows[k] ?? [])], src });
      }
    });
  });
  // A table with a header only: its column names, one per row, so it doesn't vanish.
  if (!out.length && labels.length) {
    const src = srcOf(node);
    out.push(rule(src));
    for (const l of labels) for (const row of wrapSpans([{ text: l, role: "table_header", attrs: A_BOLD }], width)) out.push({ spans: row, src });
  }
  if (out.length) out.push(rule(srcOf(node)));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Inlines

const DROP_TAGS = /^<\/?(?:kbd|sup|sub|b|i|u|em|strong|mark|span|small|abbr|ins|del|s|q|cite|code|samp|var|a)\b[^>]*>$/i;

function inline(nodes: PhrasingContent[], ctx: Ctx, style: Style, src: number): Span[] {
  const out: Span[] = [];
  let line = src;
  const push = (text: string, st: Style, extra: Partial<Span> = {}) => {
    if (!text) return;
    out.push({ text, role: st.role, attrs: st.attrs, src: line, ...extra });
  };
  const text = (value: string, st: Style, extra: Partial<Span> = {}) => {
    // Soft line breaks become spaces; each one advances the source line.
    // A tab in prose or a table cell is whitespace; the width function gives it no columns.
    const parts = sanitize(value).replace(/\t/g, " ").split("\n");
    parts.forEach((p, i) => {
      if (i > 0) {
        line++;
        // Between two Chinese or Japanese characters a soft break is no space at all, as those
        // scripts write; Korean spaces its words, and emoji are words of their own.
        const before = graphemes(parts[i - 1]!).at(-1) ?? "";
        const after = graphemes(p)[0] ?? "";
        if (!(joinsWithoutSpace(before) && joinsWithoutSpace(after))) push(" ", st, extra);
      }
      push(p, st, extra);
    });
  };
  const walk = (ns: PhrasingContent[], st: Style, extra: Partial<Span> = {}) => {
    for (const n of ns) {
      if (n.position) line = n.position.start.line;
      switch (n.type) {
        case "text":
          text(n.value, st, extra);
          break;
        case "strong":
          walk(n.children, { role: st.role === "text" || st.role === "quote" ? "strong" : st.role, attrs: st.attrs | A_BOLD }, extra);
          break;
        case "emphasis":
          walk(n.children, { role: st.role === "text" ? "emphasis" : st.role, attrs: st.attrs | A_ITALIC }, extra);
          break;
        case "delete":
          walk(n.children, { role: st.role === "text" ? "strike" : st.role, attrs: st.attrs | A_STRIKE }, extra);
          break;
        case "inlineCode":
          push(expandTabs(sanitize(n.value).replace(/\n/g, " "), 2), { role: "code_inline", attrs: 0 }, extra);
          break;
        case "inlineMath":
          // Maths as Unicode text (12.11); one that can't be, as written.
          push(sanitize(mathText(n.value) ?? `$${n.value}$`).replace(/\n/g, " "), { role: "math", attrs: st.attrs }, extra);
          break;
        case "break":
          push("\n", st);
          break;
        case "link":
          linkNode(n.url, n.children, st, n.position?.start.line ?? line);
          break;
        case "linkReference": {
          const url = ctx.definitions.get(n.identifier.toLowerCase());
          if (url !== undefined) linkNode(url, n.children, st, line);
          else walk(n.children, st, extra);
          break;
        }
        case "image":
        case "imageReference": {
          const url = n.type === "image" ? n.url : (ctx.definitions.get(n.identifier.toLowerCase()) ?? "");
          const alt = n.alt || url.split("/").pop() || "image";
          // Inside a link (a badge: [![alt](img)](url)) the image is that link's text: it follows
          // the link, not the image.
          const id = extra.link ?? addLink(ctx, { kind: "image", target: url, heading: null, text: alt, status: status(ctx, "image", url), src: line });
          // A note's (`![x](note.md)`, 20.1) where it isn't drawn in place — beside other text, or not
          // there — is a reference to an embed, as `![[note]]`'s was; a picture's is a picture's.
          const note = NOTE_URL.test(url.split("#")[0]!);
          push(`${note ? ctx.opts.glyphs.embed : ctx.opts.glyphs.image} ${sanitize(alt)}`, { role: note ? "embed" : "image", attrs: 0 }, { link: id });
          if (ctx.opts.showUrls && url) push(` <${sanitize(url)}>`, { role: "url", attrs: 0 });
          break;
        }
        case "footnoteReference": {
          const id = addLink(ctx, { kind: "footnote", target: n.identifier, heading: null, text: n.identifier, status: "resolved", src: line });
          push(`[${sanitize(n.label ?? n.identifier)}]`, { role: "footnote", attrs: 0 }, { link: id });
          break;
        }
        case "html": {
          const v = n.value.trim();
          if (/^<br\s*\/?>$/i.test(v)) push("\n", st);
          else if (/^<!--[\s\S]*-->$/.test(v) || DROP_TAGS.test(v)) break;
          else push(sanitize(n.value), { role: "html", attrs: 0 }, extra);
          break;
        }
        default:
          if ((n.type as string) === "wikiLink") wiki(n as unknown as WikiLink, st);
          else if ((n.type as string) === "hashtag") {
            // A tag (1.6): followed, the notes that carry it.
            const name = (n as unknown as Hashtag).value;
            const id = addLink(ctx, { kind: "tag", target: name, heading: null, text: `#${name}`, status: "resolved", src: line });
            push(`#${sanitize(name)}`, { role: "tag", attrs: st.attrs }, { link: id });
          }
          else if ("children" in n) walk((n as unknown as Parents).children as PhrasingContent[], st, extra);
          else if ("value" in n) text(String((n as { value: unknown }).value), st, extra);
      }
    }
  };
  const linkNode = (url: string, children: PhrasingContent[], st: Style, at: number) => {
    const visible = textOf({ type: "paragraph", children });
    const s = status(ctx, "markdown", url);
    const id = addLink(ctx, { kind: "markdown", target: url, heading: null, text: visible || url, status: s, src: at });
    const role: Role = s === "unresolved" ? "link_unresolved" : "link";
    // What the file says (21.9): its text, or, a link without text of its own, its target as written —
    // no form made up for the screen.
    if (children.length) walk(children, { role, attrs: st.attrs }, { link: id });
    else push(sanitize(url), { role, attrs: st.attrs }, { link: id });
    const external = /^[a-z][a-z0-9+.-]*:/i.test(url);
    // The URL after the text, unless the text already is it (www. autolinks, empty link text).
    const same = url === visible || ["mailto:", "http://", "https://"].some((scheme) => url === `${scheme}${visible}`);
    if (ctx.opts.showUrls && external && children.length && !same) {
      push(` <${sanitize(url)}>`, { role: "url", attrs: 0 });
    }
  };
  const wiki = (w: WikiLink, st: Style) => {
    const kind = w.embed ? "embed" : "wiki";
    const s = status(ctx, kind, w.target);
    // A picture embedded by name, as Obsidian writes one: `|300` and `|240x180` its size, not words.
    const picture = w.embed && IMAGE_FILE.test(w.target);
    const alias = picture && w.alias && SIZE.test(w.alias.trim()) ? null : w.alias;
    const shown =
      alias ??
      (picture ? w.target.split("/").pop()! : null) ??
      (!w.target
        ? w.heading
          ? `#${w.heading}`
          : w.block
            ? `^${w.block}`
            : w.value
        : w.heading
          ? `${w.target} › ${w.heading}`
          : w.block
            ? `${w.target} ^${w.block}`
            : w.target);
    // A block's `^id` rides as the heading does (`#^id`): followed, it lands on its block.
    const id = addLink(ctx, { kind, target: w.target, heading: w.heading ?? (w.block ? `^${w.block}` : null), text: shown, status: s, src: line });
    const role: Role = picture ? "image" : w.embed ? "embed" : s === "unresolved" ? "link_unresolved" : s === "ambiguous" ? "link_ambiguous" : "wikilink";
    const prefix = picture ? `${ctx.opts.glyphs.image} ` : w.embed ? `${ctx.opts.glyphs.embed} ` : "";
    push(prefix + sanitize(shown), { role, attrs: st.attrs }, { link: id });
  };
  walk(nodes, style);
  return out;
}

function status(ctx: Ctx, kind: "wiki" | "embed" | "markdown" | "image", target: string): LinkStatus {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && kind !== "wiki" && kind !== "embed") return "external";
  return ctx.opts.resolveLink ? ctx.opts.resolveLink(kind, target) : "unknown";
}

function addLink(ctx: Ctx, l: Omit<LayoutLink, "line" | "col">): number {
  // Inside an embed: at the embed's line in the note shown, followed from the embedded note.
  const inEmbed = ctx.linkSrc !== undefined ? { src: ctx.linkSrc, ...(ctx.linkFrom ? { from: ctx.linkFrom } : {}) } : {};
  return ctx.links.push({ ...l, ...inEmbed, line: -1, col: 0 }) - 1;
}

function textOf(n: Nodes): string {
  if ((n.type as string) === "hashtag") return `#${(n as unknown as Hashtag).value}`;
  if ("value" in n && typeof n.value === "string") return n.value;
  if ((n.type as string) === "wikiLink") return (n as unknown as WikiLink).alias ?? (n as unknown as WikiLink).value;
  const ch = (n as Parents).children;
  return ch ? ch.map((c) => textOf(c)).join("") : "";
}
