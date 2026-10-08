// Live preview (plan 4.14): the rendered layout with one block — the one the cursor is in — shown
// as its markdown, to be edited in place. The rest stays rendered.
//
// A note divides into blocks: its top-level nodes, a list into its top-level items, each block
// taking the blank lines after it, so the blocks cover every line. `composeLive` swaps the active
// block's rendered rows for source rows (which carry `srcMap`, so editing works on them as in
// source mode). While that block is being typed into, the render around it is reused as it was,
// the rows after it renumbered by the lines added or taken away: no re-parse on a keystroke.

import type { Root, RootContent } from "mdast";
import type { Span as SyntaxSpan } from "../syntax.ts";
import type { Role } from "../theme/theme.ts";
import { stringWidth } from "../width.ts";
import type { Layout, LayoutHeading, LayoutLink, Line } from "./ir.ts";
import { layoutSource } from "./source.ts";

/** A block: its first and last source lines (1-based, inclusive). */
export type Block = [number, number];

/** The lens's counters' column (`[ui] relative_numbers`): three digits and a space. */
export const LENS_COUNTERS = 4;

/** The note's blocks, in order, covering lines 1..`lineCount`. */
export function blockRanges(tree: Root, lineCount: number): Block[] {
  const starts: number[] = [];
  const add = (n: RootContent) => {
    const at = n.position?.start.line;
    if (at !== undefined) starts.push(at);
  };
  let prev: TreeRow | null = null;
  for (const node of tree.children) {
    if (node.type === "list") for (const item of node.children) add(item as unknown as RootContent);
    // A data file's table: a block per record (a CSV's thousands of rows are never one block).
    else if (node.type === "table" && (node.data as { rowBlocks?: boolean } | undefined)?.rowBlocks) for (const row of node.children) add(row as unknown as RootContent);
    // A data file's tree (16.12): a key and the plain values listed right under it are one block —
    // a card (`defaults` with its three settings, a run of top-level values) — so the lens holds
    // what belongs together and moves a card at a time, not a line.
    else if (!continuesCard(prev, node)) add(node);
    prev = rowOf(node);
  }
  const sorted = [...new Set(starts)].filter((n) => n >= 1 && n <= lineCount).sort((a, b) => a - b);
  // Blank lines before the first block are a block of their own.
  if (!sorted.length || sorted[0]! > 1) sorted.unshift(1);
  return sorted.map((s, i) => [s, (sorted[i + 1] ?? lineCount + 1) - 1] as Block);
}

/**
 * A note's sections, by its top-level headings: each heading's lines and everything under it up to the next heading of
 * its level or higher (or the note's end) — a section nested in its parent's.
 */
export function sectionRanges(tree: Root, lineCount: number): Block[] {
  const heads = tree.children.flatMap((n) => (n.type === "heading" && n.position ? [{ line: n.position.start.line, depth: n.depth }] : []));
  return heads.map((h, i) => {
    const next = heads.slice(i + 1).find((k) => k.depth <= h.depth);
    return [h.line, Math.min(lineCount, (next?.line ?? lineCount + 1) - 1)] as Block;
  });
}

type TreeRow = { depth: number; branch: boolean };

function rowOf(n: RootContent): TreeRow | null {
  const f = n as unknown as { type: string; tree?: { lasts: boolean[]; branch?: boolean; above?: boolean } };
  return f.type === "dataField" && f.tree ? { depth: f.tree.lasts.length, branch: !!f.tree.branch } : null;
}

/** Whether a tree row joins the card before it: a plain value right under that card's key, or
 *  after a sibling plain value. */
function continuesCard(prev: TreeRow | null, n: RootContent): boolean {
  const row = rowOf(n);
  if (!prev || !row || row.branch) return false;
  return prev.branch ? row.depth === prev.depth + 1 : row.depth === prev.depth;
}

/** A lens rule: the glyph across the width, a label after its first two. */
function lensRule(glyph: string, width: number, src: number, label: string, role: Role = "lens"): Line {
  const head = label ? glyph.repeat(2) : "";
  const rest = Math.max(0, width - head.length - label.length);
  return {
    spans: [
      { text: head, role, attrs: 0 },
      ...(label ? [{ text: label, role, attrs: 0 }] : []),
      { text: glyph.repeat(rest), role, attrs: 0 },
    ],
    src: Math.max(0, src),
    decor: true,
  };
}

/** The block holding source line `line`. */
export function blockAt(blocks: Block[], line: number): Block {
  for (const b of blocks) if (line >= b[0] && line <= b[1]) return b;
  return blocks[blocks.length - 1] ?? [1, 1];
}

export interface LiveOptions {
  width: number;
  wrap: boolean;
  /** The lens: a rule of this glyph above and below the source rows (frame rows, `decor`). */
  rule?: string;
  /** Typed into (insert mode): the rules, label and band say "editing" in their own colour. */
  editing?: boolean;
  /** Code (24.x): its language, and tree-sitter's spans by the file's line numbers — the lens highlighted as code. */
  language?: string | null;
  spans?: (line: number) => SyntaxSpan[] | undefined;
  /** Its counters' column (`[ui] relative_numbers`): this many columns before each source row, kept free — the drawing
   *  writes each row's distance from the cursor's there — never the cursor's (its cells map to no offset, -1). */
  counters?: number;
}

/** A lens row with its counters' column before it: spaces mapped to no offset, its text after them. */
function countered(l: Line, n: number): Line {
  const w = l.spans.reduce((k, s) => k + stringWidth(s.text), 0);
  return {
    ...l,
    spans: [{ text: " ".repeat(n), role: "text", attrs: 0 }, ...l.spans],
    text: [n, n + w],
    ...(l.srcMap ? { srcMap: { cells: [...Array(n).fill(-1), ...l.srcMap.cells], end: l.srcMap.end } } : {}),
  };
}

/**
 * The live layout: `rendered` (laid out from a parse where the block was `old`), with the active
 * block — now lines `active` of `lines`, the current text — as source rows. Rows after the block
 * move by the difference in its length.
 */
export function composeLive(rendered: Layout, old: Block, active: Block, lines: string[], opts: LiveOptions): Layout {
  const delta = active[1] - active[0] - (old[1] - old[0]);
  const out: Line[] = [];
  const newRow = new Map<number, number>();
  const spans = opts.spans;
  const counters = opts.rule ? (opts.counters ?? 0) : 0;
  const source = layoutSource(lines.slice(active[0] - 1, active[1]).join("\n"), {
    width: Math.max(10, opts.width - counters),
    wrap: opts.wrap,
    headings: [],
    slice: true,
    ...(opts.language ? { language: opts.language } : {}),
    ...(spans ? { spans: (l: number) => spans(l + active[0] - 1) } : {}),
  });
  let placed = false;
  const rule: Role = opts.editing ? "lens_edit" : "lens";
  const blank = (l: Line | undefined) => !!l && !l.fill && l.spans.every((s) => !s.text.trim());
  // `next`: the rendered row that will follow the lens (none at the note's end).
  const place = (next?: Line) => {
    if (placed) return;
    placed = true;
    // The lens's rules carry the line before it and its last line, so an anchor on any line of
    // the block lands on a source row, never on a rule. One blank row of air outside each rule,
    // added only where the rendered row beside it isn't blank already.
    if (opts.rule) {
      const prev = out[out.length - 1];
      if (prev && !blank(prev)) out.push({ spans: [], src: Math.max(0, active[0] - 1), decor: true, lens: "pad" });
      // Its label says the mode — viewing the source, or editing it — in the mode's colour.
      const lines = active[0] === active[1] ? `line ${active[0]}` : `lines ${active[0]}–${active[1]}`;
      out.push({ ...lensRule(opts.rule, opts.width, active[0] - 1, ` ${opts.editing ? "editing" : "source"} · ${lines} `, rule), lens: "top" });
    }
    const band = opts.editing ? ("lens_band_edit" as const) : ("lens_band" as const);
    for (const l of source.lines) {
      const row: Line = { ...l, src: l.src + active[0] - 1, spans: l.spans.map((s) => ({ ...s, src: (s.src ?? 1) + active[0] - 1 })), ...(opts.rule ? { lens: "source" as const, fill: band } : {}) };
      out.push(counters ? countered(row, counters) : row);
    }
    if (opts.rule) {
      out.push({ ...lensRule(opts.rule, opts.width, active[1], "", rule), lens: "bottom" });
      if (next && !blank(next)) out.push({ spans: [], src: active[1], decor: true, lens: "pad" });
    }
  };
  rendered.lines.forEach((l, i) => {
    if (l.src < old[0]) {
      newRow.set(i, out.length);
      out.push(l);
    } else if (l.src > old[1]) {
      place(l);
      newRow.set(i, out.length);
      out.push(delta ? { ...l, src: l.src + delta } : l);
    }
  });
  place();
  const headings: LayoutHeading[] = [];
  for (const h of rendered.headings) {
    if (h.src >= old[0] && h.src <= old[1]) {
      // A heading in the block: on its source row, while it's still there.
      const src = h.src - old[0] + active[0];
      const row = out.findIndex((l) => l.src === src && l.srcMap);
      if (row >= 0 && src <= active[1]) headings.push({ ...h, src, line: row });
    } else {
      const row = newRow.get(h.line);
      if (row !== undefined) headings.push({ ...h, src: h.src > old[1] ? h.src + delta : h.src, line: row });
    }
  }
  headings.forEach((h, k) => {
    out[h.line] = { ...out[h.line]!, heading: k };
  });
  const links: LayoutLink[] = [];
  // Link indices on spans point into the old list: renumbered as the kept ones are pushed (a
  // search per link would be quadratic in a note's links, on every keystroke in the lens).
  const index = new Map<number, number>();
  rendered.links.forEach((k, i) => {
    if (k.src >= old[0] && k.src <= old[1]) return;
    const row = newRow.get(k.line);
    if (row === undefined) return;
    index.set(i, links.length);
    links.push({ ...k, line: row, src: k.src > old[1] ? k.src + delta : k.src });
  });
  for (let r = 0; r < out.length; r++) {
    const l = out[r]!;
    if (l.srcMap || !l.spans.some((s) => s.link !== undefined)) continue;
    out[r] = { ...l, spans: l.spans.map((s) => (s.link === undefined ? s : { ...s, link: index.get(s.link) })) };
  }
  return { lines: out, links, headings, width: Math.max(rendered.width, source.width) };
}
