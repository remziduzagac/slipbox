// mdast → layout IR (plan 2.1, 2.2). Pure: no terminal, no OpenTUI, no I/O.
//
// Containers (quotes, list items, callouts) lay their children out at a reduced width and then
// prefix every row, so nesting composes without any block knowing where it sits.

import type { Nodes, Parents, PhrasingContent, Root, RootContent, Table, TableCell } from "mdast";
import type { Glyphs } from "../glyphs.ts";
import { parseMarkdown, type Frontmatter, slugify } from "../parse.ts";
import { expandTabs, sanitize } from "../sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, padEnd, stringWidth, truncate } from "../width.ts";
import type { WikiLink } from "../wikilink.ts";
import { highlight } from "./highlight.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, type Layout, type LayoutHeading, type LayoutLink, type Line, type LinkStatus, type Span } from "./ir.ts";
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
}

interface Ctx {
  opts: RenderOptions;
  links: LayoutLink[];
  headings: Omit<LayoutHeading, "line">[];
  definitions: Map<string, string>;
  slugCounts: Map<string, number>;
  /** How many containers (quotes, lists, footnotes) deep the block being rendered is. */
  nesting: number;
}

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

export function renderTree(tree: Root, opts: RenderOptions, frontmatter?: Frontmatter | null): Layout {
  const ctx: Ctx = { opts, links: [], headings: [], definitions: new Map(), slugCounts: new Map(), nesting: 0 };
  collectDefinitions(tree, ctx);
  const width = Math.max(8, opts.width);
  const lines = blocks(tree.children, ctx, width, TEXT, frontmatter);
  return finish(lines, ctx, width);
}

function finish(lines: Line[], ctx: Ctx, width: number): Layout {
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
    if (n.type === "definition") ctx.definitions.set(n.identifier.toLowerCase(), n.url);
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
  for (const node of nodes) {
    const rendered = block(node, ctx, width, base, fm);
    if (rendered === null) continue;
    if (out.length && !tight) out.push(gapAfter(out, srcOf(node)));
    out.push(...rendered);
  }
  return out;
}

function block(node: RootContent, ctx: Ctx, width: number, base: Style, fm?: Frontmatter | null): Line[] | null {
  switch (node.type) {
    case "heading":
      return heading(node.depth, node.children, srcOf(node), ctx, width);
    case "paragraph":
      return paragraph(node.children, srcOf(node), ctx, width, base);
    case "thematicBreak":
      return [{ spans: [{ text: ctx.opts.glyphs.rule.repeat(width), role: "rule", attrs: 0 }], src: srcOf(node) }];
    case "code":
      return codeBlock(node.value, node.lang ?? null, srcOf(node), ctx, width);
    case "blockquote":
    case "list": {
      if (ctx.nesting >= MAX_NESTING) return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
      ctx.nesting++;
      try {
        return node.type === "list" ? list(node, ctx, width, base) : blockquote(node.children, srcOf(node), ctx, width);
      } finally {
        ctx.nesting--;
      }
    }
    case "table":
      return table(node, ctx, width);
    case "html":
      return htmlBlock(node.value, srcOf(node), width);
    case "yaml":
      return frontmatterBlock(fm ?? null, node.value, srcOf(node), ctx, width);
    case "definition":
      return null;
    case "footnoteDefinition": {
      const label = `${node.label ?? node.identifier}.`;
      const marker: Span = { text: `${label} `, role: "footnote", attrs: 0 };
      if (width - stringWidth(marker.text) < MIN_NESTED) return [{ spans: [marker], src: srcOf(node) }, ...blocks(node.children, ctx, width, base, null, true)];
      return prefixed(blocks(node.children, ctx, width - stringWidth(marker.text), base, null, true), [marker], srcOf(node));
    }
    default:
      if ((node.type as string) === "toml") return frontmatterBlock(fm ?? null, (node as { value: string }).value, srcOf(node), ctx, width);
      // Unknown block: show its text rather than lose it.
      return paragraph([{ type: "text", value: textOf(node) }], srcOf(node), ctx, width, base);
  }
}

function heading(depth: number, children: PhrasingContent[], src: number, ctx: Ctx, width: number): Line[] {
  const role = `h${Math.min(6, Math.max(1, depth))}` as Role;
  const g = ctx.opts.glyphs;
  const icon = g.mode === "nerd" ? g.heading[depth - 1]! : `${g.heading[depth - 1]} `;
  const spans = inline(children, ctx, { role, attrs: A_BOLD }, src);
  const text = spans.map((s) => s.text).join("");
  const slug = uniqueSlug(slugify(text), ctx);
  const idx = ctx.headings.push({ level: depth, text, slug, src }) - 1;
  const iconW = stringWidth(icon);
  const rows = wrapSpans(spans, width - iconW);
  return rows.map((row, i) => ({
    spans: [{ text: i === 0 ? icon : " ".repeat(iconW), role, attrs: A_BOLD }, ...row],
    src,
    fill: role,
    heading: i === 0 ? idx : undefined,
  }));
}

function uniqueSlug(slug: string, ctx: Ctx): string {
  const n = ctx.slugCounts.get(slug) ?? 0;
  ctx.slugCounts.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n}`;
}

function paragraph(children: PhrasingContent[], src: number, ctx: Ctx, width: number, base: Style): Line[] {
  const spans = inline(children, ctx, base, src);
  return wrapSpans(spans, width).map((row) => ({ spans: row, src: row[0]?.src ?? src }));
}

function codeBlock(value: string, lang: string | null, src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const code = sanitize(value);
  const sourceLines = code.split("\n").map((l) => expandTabs(l));
  const tokens = highlight(sourceLines.join("\n"), lang);
  const out: Line[] = [];
  const label = lang ? sanitize(lang) : "";
  // Top padding row carries the language label, right-aligned.
  const top: Span[] = [];
  if (label) {
    const lw = stringWidth(label) + 1;
    top.push({ text: " ".repeat(Math.max(0, width - lw)), role: "code_block", attrs: 0 }, { text: `${label} `, role: "code_label", attrs: 0 });
  }
  out.push({ spans: top, src, fill: "code_block" });
  const inner = Math.max(1, width - 2);
  sourceLines.forEach((text, i) => {
    const lineSrc = src + 1 + i;
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

function blockquote(children: RootContent[], src: number, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  // Obsidian / GitHub callout: `> [!note] Optional title`.
  const first = children[0];
  const lead = first?.type === "paragraph" ? first.children[0] : undefined;
  const m = lead?.type === "text" ? CALLOUT.exec(lead.value) : null;
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
    const inner = width - 2;
    const lines: Line[] = wrapSpans(titleSpans, inner).map((row) => ({ spans: row, src }));
    lines.push(...blocks(body, ctx, inner, TEXT));
    return prefixed(lines, [{ text: `${g.quoteBar} `, role, attrs: 0 }], src, true);
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
    if (item.checked === true) return { text: `${g.checkDone} `, role: "check_done" as Role };
    if (item.checked === false) return { text: `${g.checkTodo} `, role: "check_todo" as Role };
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
      if (ci > 0 && (node.spread || child.type !== "list")) lines.push(gapAfter(lines, srcOf(child)));
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
  const v = value.trim();
  if (/^<!--[\s\S]*-->$/.test(v)) return null;
  if (/^<br\s*\/?>$/i.test(v)) return [blank(src)];
  const out: Line[] = [];
  sanitize(value)
    .split("\n")
    .forEach((text, i) => {
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
      const valueRows = wrapSpans([{ text: value, role: "fm_value", attrs: 0 }], Math.max(4, width - keyW - 3));
      const keyLine = findKeyLine(raw, key);
      const ksrc = keyLine >= 0 ? src + 1 + keyLine : line;
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
      out.push(cell ? inline(cell.children, ctx, style, srcOf(row)) : []);
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
  const border = (l: string, m: string, r: string, h: string): Line => ({
    spans: [{ text: l + widths.map((w) => h.repeat(w)).join(m) + r, role: "table_border", attrs: 0 }],
    src,
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
    if (ri === 0) out.push(border(b.hl, b.hx, b.hr, b.hh));
    else if (multiLine && ri < wrapped.length - 1) out.push(border(b.ml, b.mm, b.mr, b.h));
  });
  out.push(border(b.bl, b.bm, b.br, b.h));
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
          push(`${ctx.opts.glyphs.image} ${sanitize(alt)}`, { role: "image", attrs: 0 }, { link: id });
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
    const shown =
      w.alias ??
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
    const id = addLink(ctx, { kind, target: w.target, heading: w.heading, text: shown, status: s, src: line });
    const role: Role = w.embed ? "embed" : s === "unresolved" ? "link_unresolved" : s === "ambiguous" ? "link_ambiguous" : "wikilink";
    const prefix = w.embed ? `${ctx.opts.glyphs.embed} ` : "";
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
  return ctx.links.push({ ...l, line: -1, col: 0 }) - 1;
}

function textOf(n: Nodes): string {
  if ("value" in n && typeof n.value === "string") return n.value;
  if ((n.type as string) === "wikiLink") return (n as unknown as WikiLink).alias ?? (n as unknown as WikiLink).value;
  const ch = (n as Parents).children;
  return ch ? ch.map((c) => textOf(c)).join("") : "";
}
