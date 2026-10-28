// Recursive block dispatch keeps container nesting and embedded-note contexts in one owner.
import { adaptHtml } from "../../../../documents/markdown/html-adapter.ts";
import { htmlStyle, alignHtml } from "../render-html.ts";
import type { PhrasingContent, RootContent } from "mdast";
import type { DataComment, DataField } from "../../../../documents/model/data.ts";
import { drawMermaid, mermaidPending, MERMAID, mermaidSvg } from "../../../media/diagrams/diagrams.ts";
import { RESVG, rasterizer } from "../../../media/images/svg.ts";
import { MATHJAX, typesetter } from "../../../media/typeset.ts";
import { mathRows } from "../../../media/math.ts";
import { paintRevision } from "../../../media/paint/paint-jobs.ts";
import { onlyComments } from "../../../../documents/markdown/obsidian.ts";
import type { Frontmatter } from "../../../../documents/markdown/parse.ts";
import { sanitize } from "../../../../foundation/text/sanitize.ts";
import type { Role } from "../../../theme/theme.ts";
import { padEnd, stringWidth } from "../../../../foundation/text/width.ts";
import type { WikiLink } from "../../../../documents/markdown/wikilink.ts";
import { A_BOLD, A_ITALIC, type Line, type Span } from "../../ir.ts";
import { wrapSpans } from "../../wrap.ts";
import { type Ctx, type Style, TEXT, srcOf, addLink, textOf } from "../render-context.ts";
import { NOTE_URL, inline } from "../render-inline.ts";
import { frontmatterBlock, placeOf, guides, dataField, dataComment } from "../render-data.ts";
import { table } from "../render-table.ts";
import type { Embedded, EmbedRef } from "../contracts.ts";
import {
  picturesAlone,
  captionRows,
  askPicture,
  pictureRows,
  pictureSource,
  urlParts,
  embeddedPictures,
  drawing,
  scrollingDiagram,
  diagram,
} from "../pictures/layout.ts";
import { heading } from "./headings.ts";
import { codeBlock } from "./code.ts";
import { gapAfter, blank, joined, prefixed } from "../rows/spacing.ts";
import { collectDefinitions, isParagraphSpacing } from "../nodes/structure.ts";

/** Embeds inside embeds are drawn this deep, no deeper: past it, a line says to open it. */
const MAX_EMBED_DEPTH = 3;

/** Containers deeper than this render as their plain text: nobody reads 60 levels of quote, and a
 *  hostile note 5,000 deep must not overflow the stack (the note would then show nothing at all). */
const MAX_NESTING = 60;

export function blocks(
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

export function block(node: RootContent, ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null): Line[] | null {
  const before = paintRevision;
  const styled = htmlStyle(base, node.data?.html);
  const result = blockNow(node, ctx, width, styled, fm);
  if (paintRevision !== before) ctx.pending.add("pictures");
  return result ? alignHtml(result, width, node.data?.html?.align) : result;
}

function blockNow(node: RootContent, ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null): Line[] | null {
  switch (node.type) {
    case "htmlContainer":
      return blocks(node.children, ctx, width, base);
    case "htmlDetails": {
      const src = srcOf(node);
      const open = ctx.opts.htmlDetails ? (ctx.opts.htmlDetails.get(src) ?? node.open) : true;
      const summary = paragraph(node.summary, src, ctx, width - 2, base);
      if (!summary.length) summary.push(blank(src));
      summary[0]!.spans.unshift({
        text: (open ? ctx.opts.glyphs.foldOpen : ctx.opts.glyphs.foldClosed) + " ",
        role: "text",
        attrs: A_BOLD,
      });
      for (const row of summary) row.details = { from: src, to: node.position?.end.line ?? src, open };
      return open ? [...summary, ...blocks(node.children, ctx, width, base)] : summary;
    }
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
      const fenced = !node.data?.html && (!node.position || span > node.value.split("\n").length);
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
      return codeBlock(
        node.value,
        node.lang ?? null,
        srcOf(node),
        ctx,
        width,
        fenced ? 1 : 0,
        undefined,
        node.data?.htmlSourceLines,
      );
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
      return null;
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
    else if (!isParagraphSpacing(c)) return null;
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
    body = blocks(
      adaptHtml({ type: "root", children: e.nodes }, ctx.opts.htmlTheme).children,
      inner,
      narrow ? width : width - 2,
      TEXT,
    );
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
