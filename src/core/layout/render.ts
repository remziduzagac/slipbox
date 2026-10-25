import { pictureCaption } from "./render-caption.ts";
// mdast → layout IR (plan 2.1, 2.2). Pure: no terminal, no OpenTUI, no I/O.
//
// Containers (quotes, list items, callouts) lay their children out at a reduced width and then
// prefix every row, so nesting composes without any block knowing where it sits.
//
// Here, a note's blocks; inlines are render-inline.ts's, tables render-table.ts's, front matter and
// data files' rows render-data.ts's, and what they all share render-context.ts's.

import type { Heading, Nodes, Parents, PhrasingContent, Root, RootContent } from "mdast";
import type { Glyphs } from "../glyphs.ts";
import type { DataComment, DataField } from "../data.ts";
import { type DrawingColors, drawMermaid, mermaidPending, MERMAID, mermaidSvg } from "../diagrams.ts";
import { RESVG, rasterizer } from "../svg.ts";
import { MATHJAX, typesetter } from "../typeset.ts";
import { mathRows } from "../math.ts";
import { paintRevision } from "../paint-jobs.ts";
import { onlyComments } from "../obsidian.ts";
import { headingLabel, ORIGIN, parseMarkdown, type Frontmatter } from "../parse.ts";
import { expandTabs, sanitize } from "../sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, padEnd, stringWidth, truncate } from "../width.ts";
import type { WikiLink } from "../wikilink.ts";
import { highlight } from "./highlight.ts";
import {
  A_BOLD,
  A_ITALIC,
  type CodeScroll,
  type Layout,
  type LayoutHeading,
  type LayoutLink,
  type Line,
  type LinkStatus,
  type Picture,
  type Span,
} from "./ir.ts";
import { wrapSpans } from "./wrap.ts";
import { type Ctx, type Style, TEXT, srcOf, breakHard, addLink, textOf } from "./render-context.ts";
import { NOTE_URL, IMAGE_FILE, SIZE, inline } from "./render-inline.ts";
import { frontmatterBlock, placeOf, guides, dataField, dataComment } from "./render-data.ts";
import { table } from "./render-table.ts";

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
  /** A picture alone in its paragraph (12.x), drawn above its caption box: its file and the cells it takes, fitted
   *  to `width` columns and its window less its `▣` line's `caption` rows (PIC-D1), or at its own size — or null (not
   *  a local image, no images here): its `▣ alt` alone, the floor. */
  picture?: (from: PictureSource, width: number, caption?: number) => Picture | null;
  /** What `picture` sizes for besides the width (PIC): a window's rows, the pictures it shows at their own size. A
   *  kept block that asked for a picture is laid out again when it changes. */
  pictureKey?: string;
  caption?: "bottom" | "top";
  /** Mermaid and a display's maths drawn as pictures (12.16, 12.17), as chosen where pictures are: in these colours. */
  drawings?: { mermaid: boolean; math: boolean; colors: DrawingColors & { math: string } };
  /** A code block too wide for its room keeps its lines whole, to scroll sideways in the window (`[render] code_wrap
   *  = "scroll"`, the TUI's); without it, each long line wraps, its rows after the first marked `↪` — what's printed
   *  (`slipbox render`), which has no window to scroll. */
  codeScroll?: boolean;
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

/** Embeds inside embeds are drawn this deep, no deeper: past it, a line says to open it. */
const MAX_EMBED_DEPTH = 3;

/** Containers deeper than this render as their plain text: nobody reads 60 levels of quote, and a
 *  hostile note 5,000 deep must not overflow the stack (the note would then show nothing at all). */
const MAX_NESTING = 60;

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
  /** What its pictures were sized for (`pictureKey`), when it asked for one. */
  pictures?: string;
}

export function newRenderCache(): RenderCache {
  return { key: "", blocks: new WeakMap() };
}

export function renderTree(
  tree: Root,
  opts: RenderOptions,
  frontmatter?: Frontmatter | null,
  cache?: RenderCache,
): Layout {
  const ctx: Ctx = {
    opts,
    links: [],
    headings: [],
    definitions: new Map(),
    nesting: 0,
    embedChain: opts.embedFrom ? [opts.embedFrom] : [],
    embedded: new Set(),
    pending: new Set(),
    asks: { picture: false },
  };
  collectDefinitions(tree, ctx);
  const width = Math.max(8, opts.width);
  if (!cache) return finish(blocks(tree.children, ctx, width, TEXT, frontmatter), ctx, width);
  const key = `${width}|${opts.glyphs.mode}|${opts.showUrls ? 1 : 0}|${opts.codeScroll ? 1 : 0}|${opts.caption ?? "bottom"}|${[...ctx.definitions].join("\u0001")}`;
  if (cache.key !== key) {
    cache.key = key;
    cache.blocks = new WeakMap();
  }
  const out: Line[] = [];
  let prev: RootContent | undefined;
  for (const node of tree.children) {
    const origin = (node as unknown as Record<symbol, object | undefined>)[ORIGIN];
    let hit = origin ? cache.blocks.get(origin) : undefined;
    // One whose pictures were sized for another window, or other pictures at their own size (PIC): laid out again.
    if (hit?.pictures !== undefined && hit.pictures !== (opts.pictureKey ?? "")) hit = undefined;
    if (hit?.pictures !== undefined) ctx.asks.picture = true;
    if (!hit) {
      // Rendered on its own: its links and headings numbered from 0, renumbered when placed.
      const own: Ctx = {
        ...ctx,
        links: [],
        headings: [],
        embedded: new Set(),
        pending: new Set(),
        asks: { picture: false },
      };
      const rows = block(node, own, width, TEXT, frontmatter);
      if (rows === null) continue;
      hit = { lines: rows, links: own.links, headings: own.headings, src: srcOf(node) };
      if (own.asks.picture) {
        hit.pictures = opts.pictureKey ?? "";
        ctx.asks.picture = true;
      }
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
  // A picture at its own size that doesn't scroll on its own (wrapping off, PIC-D6): as far as its right edge.
  let extent = width;
  for (const line of lines)
    if (line.image && !line.scroll)
      extent = Math.max(extent, line.spans.reduce((w, s) => w + stringWidth(s.text), 0) + line.image.cols);
  return {
    ...out,
    ...(ctx.embedded.size ? { embedded: [...ctx.embedded] } : {}),
    ...(ctx.pending.size ? { pending: [...ctx.pending] } : {}),
    ...(ctx.asks.picture ? { pictures: true } : {}),
    ...(extent > width ? { extent } : {}),
  };
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
  // A code block's row that scrolls sideways (`codeScroll`) is wider by design: its code is whole, the TUI shows the
  // block's width of it at a time. What's before its code (an indent, the gutter) fits, as any block's does.
  if (line.scroll && !line.scroll.part) {
    for (const span of line.spans) if (span.text.includes("\t")) span.text = span.text.replace(/\t/g, " ");
    return false;
  }
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
    if (n.type === "definition" && !ctx.definitions.has(n.identifier.toLowerCase()))
      ctx.definitions.set(n.identifier.toLowerCase(), n.url);
    const ch = (n as Parents).children;
    if (ch) for (const c of ch) walk(c);
  };
  walk(tree);
}

// ---------------------------------------------------------------------------------------------
// Blocks

/** Separator rows carry the source line of the row above, so anchoring to a block's first line
 *  lands on the block, never on the gap before it (3.5). */
function gapAfter(rows: Line[], fallback: number): Line {
  return { ...blank(rows[rows.length - 1]?.src ?? fallback), gap: true };
}

function blank(src: number): Line {
  return { spans: [], src };
}

function blocks(
  nodes: RootContent[],
  ctx: Ctx,
  width: number,
  base: Style,
  fm?: Frontmatter | null,
  tight = false,
): Line[] {
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
  const before = paintRevision;
  const result = blockNow(node, ctx, width, base, fm);
  if (paintRevision !== before) ctx.pending.add("pictures");
  return result;
}

function blockNow(node: RootContent, ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null): Line[] | null {
  switch (node.type) {
    case "heading":
      return heading(
        node.depth,
        node.children,
        srcOf(node),
        ctx,
        width,
        (node.data as { id?: string } | undefined)?.id,
      );
    case "paragraph":
      // Obsidian's comments alone (DF-D17): nothing to read, no paragraph.
      if (onlyComments(node.children)) return null;
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
      if (!rows || widest > width)
        return codeBlock(node.value, "math", srcOf(node), ctx, width, 1, rows ? "too wide to draw" : "as written");
      const indent = " ".repeat(Math.floor((width - widest) / 2));
      return rows.map((r) => ({
        spans: [
          ...(indent ? [{ text: indent, role: "text" as Role, attrs: 0 }] : []),
          { text: r, role: "math" as Role, attrs: 0 },
        ],
        src: srcOf(node),
      }));
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
          if (r && !svg && mermaidPending()) ctx.pending.add(MERMAID);
          const rows = svg ? drawing(svg, "diagram", srcOf(node), ctx, width) : null;
          if (rows) return rows;
        }
        // Drawn in the terminal's own characters (12.10); its code where it can't be, saying why.
        const ascii = ctx.opts.glyphs.mode === "ascii";
        const d = drawMermaid(sanitize(node.value), width, ascii, !!ctx.opts.codeScroll);
        if (!d) ctx.pending.add(MERMAID);
        if (d && "rows" in d) {
          const rows = diagram(d.rows, srcOf(node), ascii);
          return d.wide ? scrollingDiagram(rows, srcOf(node), width) : rows;
        }
        return codeBlock(node.value, node.lang, srcOf(node), ctx, width, fenced ? 1 : 0, d?.why ?? "drawing…");
      }
      return codeBlock(node.value, node.lang ?? null, srcOf(node), ctx, width, fenced ? 1 : 0);
    }
    case "blockquote":
    case "list": {
      if (ctx.nesting >= MAX_NESTING)
        return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
      ctx.nesting++;
      try {
        return node.type === "list"
          ? list(node, ctx, width, base)
          : blockquote(
              node.children,
              srcOf(node),
              ctx,
              width,
              (node.data as { literal?: boolean } | undefined)?.literal,
            );
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
      if ((node.type as string) === "toml")
        return frontmatterBlock(fm ?? null, (node as { value: string }).value, srcOf(node), ctx, width);
      if ((node.type as string) === "dataField") return dataField(node as unknown as DataField, ctx, width);
      if ((node.type as string) === "dataComment") return dataComment(node as unknown as DataComment, width, ctx);
      // An Obsidian comment over blank lines (DF-D17): hidden while reading.
      if (node.type === "commentBlock") return null;
      // Unknown block: show its text rather than lose it.
      return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
  }
}

export function heading(
  depth: number,
  children: PhrasingContent[],
  src: number,
  ctx: Ctx,
  width: number,
  id?: string,
): Line[] {
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
    } else if (c.type === "image" && NOTE_URL.test(c.url.split("#")[0]!))
      embeds.push({ kind: "image", ...urlParts(c.url), link: c.url, node: c });
    else if (c.type === "image")
      embeds.push({ kind: "image", target: "", heading: null, block: null, link: c.url, node: c });
    else if (!(c.type === "break" || c.type === "comment" || (c.type === "text" && !c.value.trim()))) return null;
  }
  const found = embeds.map((r) => ({ r, e: r.target ? ctx.opts.embed!(r.target, r.heading, r.block, r.kind) : null }));
  if (!found.some((f) => f.e)) return null;
  const out: Line[] = [];
  for (const { r, e } of found) {
    const at = (r.node as unknown as { position?: { start: { line: number } } }).position?.start.line ?? src;
    if (e) out.push(...embedFrame(r, e, at, ctx, width));
    else {
      const from = pictureSource(r.node, ctx);
      const p =
        from && ctx.opts.picture ? askPicture(from, width, ctx, captionRows(r.node, at, ctx, width, base)) : null;
      out.push(...pictureRows(r.node, p, at, ctx, width, base));
    }
  }
  return out;
}

/**
 * A paragraph of nothing but pictures (and the line breaks between them), 12.x: each the rows its image is drawn over, then its caption box — blank frame rows, the first carrying the picture. Null when there's other text, or no
 * picture source: then it's a paragraph like any. A caption stands alone when no image can be drawn.
 */
function picturesAlone(children: PhrasingContent[], src: number, ctx: Ctx, width: number, base: Style): Line[] | null {
  if (children.some((c) => c.type === "image" && NOTE_URL.test(c.url.split("#")[0]!))) return null;
  const images = children.flatMap((c) => {
    const from = pictureSource(c, ctx);
    return from ? [{ c, from }] : [];
  });
  if (
    !images.length ||
    images.length !==
      children.filter((c) => !(c.type === "break" || c.type === "comment" || (c.type === "text" && !c.value.trim())))
        .length
  )
    return null;
  const drawn = images.map(({ c, from }) => {
    const at = c.position?.start.line ?? src;
    return { c, at, p: askPicture(from, width, ctx, captionRows(c, at, ctx, width, base)) };
  });
  return drawn.flatMap(({ c, at, p }) => pictureRows(c, p, at, ctx, width, base));
}

/** How many rows a picture's `▣ alt` line wraps to (PIC-D1): what its window has less for the picture. */
function captionRows(c: PhrasingContent, at: number, ctx: Ctx, width: number, base: Style): number {
  return pictureCaption(c, at, { ...ctx, links: [] }, width, base).length + 1;
}

/** A picture asked for: an SVG's (12.15) waits for its rasteriser — the layout says so, and is made again when it's in. */
function askPicture(from: PictureSource, width: number, ctx: Ctx, caption = 1): Picture | null {
  if (!ctx.opts.picture) return null;
  ctx.asks.picture = true;
  const named = "url" in from ? from.url.split(/[?#]/)[0]! : "name" in from ? from.name : "";
  if (/\.svg$/i.test(named) && !rasterizer()) ctx.pending.add(RESVG);
  return ctx.opts.picture(from, width, caption);
}

/**
 * The rows a picture is drawn over, where available, then its wrapped caption box:
 * blank frame rows, the first carrying the picture; each of them naming it (PIC). At its own size and wider than its
 * room, its frame rows scroll sideways as a code block's do, and one more frame row under them holds its bar.
 */
function pictureRows(c: PhrasingContent, p: Picture | null, at: number, ctx: Ctx, width: number, base: Style): Line[] {
  const caption = pictureCaption(c, at, ctx, width, base);
  if (!p) return caption;
  const out: Line[] = [];
  const scroll: CodeScroll | undefined = p.scrolls ? { x: 0, w: width, total: p.cols } : undefined;
  for (let k = 0; k < p.rows; k++)
    out.push({
      spans: [],
      src: at,
      decor: k !== 0,
      pic: { p, row: k },
      ...(k === 0 ? { image: p } : {}),
      ...(scroll ? { scroll } : {}),
    });
  if (scroll)
    out.push({ spans: [], src: at, decor: true, pic: { p, row: p.rows }, scroll: { ...scroll, part: "bar" } });
  const gap: Line = { spans: [], src: at, decor: true };
  const rows = ctx.opts.caption === "top" ? [...caption, gap, ...out] : [...out, gap, ...caption];
  const first = ctx.opts.caption === "top" ? caption.length + 1 : 0;
  return rows.map((line, i) => ({ ...line, pic: { p, row: i - first } }));
}

/** Where a picture is drawn from: a markdown image's URL, or a picture embedded by name (`![[dal.png|300]]`) and the
 *  size its `|…` gives it. Null for anything else. */
function pictureSource(c: PhrasingContent, ctx: Ctx): PictureSource | null {
  if (c.type === "imageReference") {
    const url = ctx.definitions.get(c.identifier.toLowerCase());
    return url ? { url } : null;
  }
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

/** An image URL's path and its fragment: `#^id` a block, any other a heading. */
function urlParts(url: string): { target: string; heading: string | null; block: string | null } {
  const hash = url.indexOf("#");
  const target = hash >= 0 ? url.slice(0, hash) : url;
  let frag = hash >= 0 ? url.slice(hash + 1) : "";
  try {
    frag = decodeURIComponent(frag);
  } catch {}
  return {
    target,
    heading: frag && !frag.startsWith("^") ? frag : null,
    block: frag.startsWith("^") ? frag.slice(1) : null,
  };
}

/**
 * An embedded note drawn in place: a header naming it (a link to it), then its blocks behind a bar,
 * read-only. Every row is at the embed's own line — the anchors and the cursor know only the note
 * shown — and its headings stay out of that note's outline. Loops and depth are capped, said so.
 */
function embedFrame(w: EmbedRef, e: Embedded, src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const id = addLink(ctx, { kind: w.kind, target: w.link, heading: w.heading, text: e.title, status: "resolved", src });
  const head = wrapSpans(
    [
      { text: `${g.embed} `, role: "embed", attrs: 0, link: id },
      { text: sanitize(e.title), role: "embed", attrs: A_BOLD, link: id },
    ],
    width,
  ).map((row) => ({ spans: row, src }));
  const note = (text: string): Line[] => [{ spans: [{ text, role: "dim", attrs: A_ITALIC }], src }];
  const narrow = width - 2 < MIN_NESTED;
  let body: Line[];
  if (ctx.embedChain.includes(e.path)) body = note("embeds itself: not drawn again");
  else if (ctx.embedChain.length > MAX_EMBED_DEPTH) body = note("embedded deeper still: enter opens it");
  else if (!e.nodes) body = note(e.missing ?? "nothing there");
  else {
    ctx.embedded.add(e.path);
    const inner: Ctx = {
      opts: {
        ...ctx.opts,
        resolveLink: e.resolveLink ?? ctx.opts.resolveLink,
        embed: e.embed,
        picture: embeddedPictures(ctx.opts.picture, e.locate),
      },
      links: ctx.links,
      headings: [],
      definitions: new Map(),
      nesting: ctx.nesting + 1,
      embedChain: [...ctx.embedChain, e.path],
      embedded: ctx.embedded,
      pending: ctx.pending,
      asks: ctx.asks,
      linkSrc: ctx.linkSrc ?? src,
      linkFrom: e.from,
    };
    collectDefinitions({ type: "root", children: e.nodes }, inner);
    body = blocks(e.nodes, inner, narrow ? width : width - 2, TEXT);
    if (!body.length) body = note("empty");
  }
  // At the embed's line, its own lines and headings forgotten: they're another note's.
  const placed = body.map((l) => ({
    ...l,
    src,
    heading: undefined,
    spans: l.spans.map((s) => ({ ...s, src: undefined })),
  }));
  // Too narrow to indent: no bar, the body keeps the room (the title row still says whose it is).
  return [
    ...head,
    ...(narrow ? placed : prefixed(placed, [{ text: `${g.quoteBar} `, role: "embed", attrs: 0 }], src, true)),
  ];
}

/** An embedded note's pictures (12.14): found from where it is, then drawn as the note showing it draws its own. */
function embeddedPictures(picture: RenderOptions["picture"], locate: Embedded["locate"]): RenderOptions["picture"] {
  if (!picture || !locate) return undefined;
  return (from, width, caption) => {
    const found = locate(from);
    return found ? picture(found, width, caption) : null;
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
  return Array.from(
    { length: p.rows },
    (_, k): Line =>
      k === 0
        ? { spans: [{ text: " ".repeat(indent), role: "text", attrs: 0 }], src, image: p, pic: { p, row: 0 } }
        : { spans: [], src, decor: true, pic: { p, row: k } },
  );
}

/**
 * A diagram too wide for its room even drawn close together (12.10), drawn anyway to scroll sideways in the window
 * (`codeScroll`), as a code block too wide does: a column either side of it for the marks saying it goes on, and a row
 * under it for its scrollbar.
 */
function scrollingDiagram(lines: Line[], src: number, width: number): Line[] {
  const total = Math.max(0, ...lines.map((l) => l.spans.reduce((w, s) => w + stringWidth(s.text), 0)));
  const scroll: CodeScroll = { x: 1, w: Math.max(1, width - 2), total };
  return [
    ...lines.map((l): Line => ({ ...l, spans: [{ text: " ", role: "text", attrs: 0 }, ...l.spans], scroll })),
    { spans: [], src, scroll: { ...scroll, part: "bar" } },
  ];
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
function codeBlock(
  value: string,
  lang: string | null,
  src: number,
  ctx: Ctx,
  width: number,
  firstLine = 1,
  note?: string,
): Line[] {
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
    top.push(
      { text: " ".repeat(Math.max(0, width - lw)), role: "code_block", attrs: 0 },
      { text: `${shown} `, role: "code_label", attrs: 0 },
    );
  }
  const inner = Math.max(1, width - 2);
  // A line too long for the block: with `codeScroll`, every line kept whole, the block scrolling sideways in the
  // window — its label row and its last, where its scrollbar goes, staying put; else each long line wrapped.
  const widest = Math.max(0, ...sourceLines.map((l) => stringWidth(l)));
  const scroll: CodeScroll | undefined =
    ctx.opts.codeScroll && widest > inner ? { x: 1, w: inner, total: widest } : undefined;
  out.push({ spans: top, src, fill: "code_block", ...(scroll ? { scroll: { ...scroll, part: "top" } } : {}) });
  sourceLines.forEach((text, i) => {
    const lineSrc = src + firstLine + i;
    const spans: Span[] = tokens?.[i]?.length
      ? tokens[i]!.map((t) => ({ text: t.text, role: t.role ?? "code_block", attrs: 0, src: lineSrc }))
      : [{ text, role: "code_block", attrs: 0, src: lineSrc }];
    const gutter: Span = { text: " ", role: "code_gutter", attrs: 0 };
    if (scroll) {
      out.push({ spans: [gutter, ...spans], src: lineSrc, fill: "code_block", scroll });
      return;
    }
    // Hard wrap at the block width; continuation rows carry a marker in the gutter.
    breakHard(spans, inner).forEach((row, r) => {
      out.push({
        spans: [r === 0 ? gutter : { ...gutter, text: g.codeWrap.slice(0, 1) }, ...row],
        src: lineSrc,
        fill: "code_block",
      });
    });
  });
  out.push({
    spans: [],
    src: src + sourceLines.length + 1,
    fill: "code_block",
    ...(scroll ? { scroll: { ...scroll, part: "bar" } } : {}),
  });
  return out;
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
    const titleChildren: PhrasingContent[] = titleText
      ? [{ type: "text", value: titleText }, ...(nl >= 0 ? [] : first.children.slice(1))]
      : [];
    const icon = g.callout[kind] ?? g.callout.note!;
    const titleSpans: Span[] = [{ text: `${icon} `, role, attrs: 0 }];
    if (titleChildren.length) titleSpans.push(...inline(titleChildren, ctx, { role, attrs: A_BOLD }, src));
    else titleSpans.push({ text: kind[0]!.toUpperCase() + kind.slice(1), role, attrs: A_BOLD });
    const body: RootContent[] = [];
    if (bodyFirst.length && textOf({ type: "paragraph", children: bodyFirst }).trim())
      body.push({ ...first, children: bodyFirst });
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

/** Prefix every row: `first` on row one, spaces of the same width after (or `first` on all rows). A code block's rows
 *  that scroll sideways keep where their code starts, moved over by the prefix. */
function prefixed(lines: Line[], first: Span[], src: number, everyRow = false): Line[] {
  const w = first.reduce((a, s) => a + stringWidth(s.text), 0);
  const hang: Span[] = [{ text: " ".repeat(w), role: "text", attrs: 0 }];
  if (lines.length === 0) return [{ spans: first, src }];
  return lines.map((line, i) => ({
    ...line,
    spans: [...(i === 0 || everyRow ? first : hang), ...line.spans],
    ...(line.scroll ? { scroll: { ...line.scroll, x: line.scroll.x + w } } : {}),
  }));
}

/** A list inside a list item, counted against the nesting cap like any container. */
function nestedList(
  node: Extract<RootContent, { type: "list" }>,
  ctx: Ctx,
  width: number,
  base: Style,
  depth: number,
): Line[] {
  if (ctx.nesting >= MAX_NESTING)
    return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
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
    const text = node.ordered
      ? m.text.padStart(markerW - stringWidth(m.text) + m.text.length)
      : padEnd(m.text, markerW);
    // Too narrow to hang the item beside its marker: the marker on a row of its own, the item
    // below it at the full width (text is never cut to make room for an indent).
    const hang = width - markerW >= MIN_NESTED;
    const inner = hang ? width - markerW : width;
    const lines: Line[] = [];
    item.children.forEach((child, ci) => {
      const rendered =
        child.type === "list"
          ? nestedList(child, ctx, inner, base, depth + 1)
          : (block(child, ctx, inner, item.checked === true ? { role: "dim", attrs: 0 } : base) ?? []);
      // Nothing drawn (a definition, a comment): no gap for it either.
      if (!rendered.length) return;
      if (ci > 0 && lines.length && (node.spread || child.type !== "list")) lines.push(gapAfter(lines, srcOf(child)));
      lines.push(...rendered);
    });
    if (i > 0 && node.spread) out.push(gapAfter(out, srcOf(item)));
    const task =
      typeof item.checked === "boolean"
        ? { line: srcOf(item), end: item.position?.end.line ?? srcOf(item), checked: item.checked }
        : undefined;
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
      for (const row of breakHard([{ text: expandTabs(text), role: "html", attrs: 0 }], width))
        out.push({ spans: row, src: src + i });
    });
  return out;
}
