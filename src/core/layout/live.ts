// Live preview (plan 4.14): the rendered layout with one block — the one the cursor is in — shown
// as its markdown, to be edited in place. The rest stays rendered.
//
// A note divides into blocks: its top-level nodes, a list into its top-level items, each block
// taking the blank lines after it, so the blocks cover every line. `composeLive` swaps the active
// block's rendered rows for source rows (which carry `srcMap`, so editing works on them as in
// source mode). While that block is being typed into, the render around it is reused as it was,
// the rows after it renumbered by the lines added or taken away: no re-parse on a keystroke.

import type { Root, RootContent } from "mdast";
import type { Layout, LayoutHeading, LayoutLink, Line } from "./ir.ts";
import { layoutSource } from "./source.ts";

/** A block: its first and last source lines (1-based, inclusive). */
export type Block = [number, number];

/** The note's blocks, in order, covering lines 1..`lineCount`. */
export function blockRanges(tree: Root, lineCount: number): Block[] {
  const starts: number[] = [];
  const add = (n: RootContent) => {
    const at = n.position?.start.line;
    if (at !== undefined) starts.push(at);
  };
  for (const node of tree.children) {
    if (node.type === "list") for (const item of node.children) add(item as unknown as RootContent);
    else add(node);
  }
  const sorted = [...new Set(starts)].filter((n) => n >= 1 && n <= lineCount).sort((a, b) => a - b);
  // Blank lines before the first block are a block of their own.
  if (!sorted.length || sorted[0]! > 1) sorted.unshift(1);
  return sorted.map((s, i) => [s, (sorted[i + 1] ?? lineCount + 1) - 1] as Block);
}

/** A lens rule: the glyph across the width, a label after its first two. */
function lensRule(glyph: string, width: number, src: number, label: string): Line {
  const head = label ? glyph.repeat(2) : "";
  const rest = Math.max(0, width - head.length - label.length);
  return {
    spans: [
      { text: head, role: "lens", attrs: 0 },
      ...(label ? [{ text: label, role: "lens" as const, attrs: 0 }] : []),
      { text: glyph.repeat(rest), role: "lens", attrs: 0 },
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
  const source = layoutSource(lines.slice(active[0] - 1, active[1]).join("\n"), { width: opts.width, wrap: opts.wrap, headings: [], slice: true });
  let placed = false;
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
      out.push({ ...lensRule(opts.rule, opts.width, active[0] - 1, ` source · ${active[0] === active[1] ? `line ${active[0]}` : `lines ${active[0]}–${active[1]}`} `), lens: "top" });
    }
    for (const l of source.lines) out.push({ ...l, src: l.src + active[0] - 1, spans: l.spans.map((s) => ({ ...s, src: (s.src ?? 1) + active[0] - 1 })), ...(opts.rule ? { lens: "source" as const } : {}) });
    if (opts.rule) {
      out.push({ ...lensRule(opts.rule, opts.width, active[1], ""), lens: "bottom" });
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
  for (const k of rendered.links) {
    if (k.src >= old[0] && k.src <= old[1]) continue;
    const row = newRow.get(k.line);
    if (row !== undefined) links.push({ ...k, line: row, src: k.src > old[1] ? k.src + delta : k.src });
  }
  // Link indices on spans point into the old list: renumber the ones kept.
  const index = new Map<number, number>();
  rendered.links.forEach((k, i) => {
    const j = links.findIndex((x) => x.target === k.target && x.col === k.col && x.line === newRow.get(k.line));
    if (j >= 0) index.set(i, j);
  });
  for (let r = 0; r < out.length; r++) {
    const l = out[r]!;
    if (l.srcMap || !l.spans.some((s) => s.link !== undefined)) continue;
    out[r] = { ...l, spans: l.spans.map((s) => (s.link === undefined ? s : { ...s, link: index.get(s.link) })) };
  }
  return { lines: out, links, headings, width: Math.max(rendered.width, source.width) };
}
