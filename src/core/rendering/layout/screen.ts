// A screen made of diffs (the review's, the merge screen's: GIT-D3, GIT-D5): rows of text, and diffs drawn as every
// diff is (GIT-D2) — a note's as its blocks before and after, a code file's side by side where there's room — one after
// another, each row a line of the screen's text, so the cursor's line says what it's on.

import type { BlockDiff } from "../../foundation/text/blockdiff.ts";
import type { DiffViewRow } from "../../workspace/git/merge/merge.ts";
import type { Role } from "../theme/theme.ts";
import { layoutBlockDiff } from "./diff/blockdiff.ts";
import { type DiffLayoutOptions, diffText, layoutDiff } from "./diff/diff.ts";
import type { Layout, Line, Span } from "./ir.ts";
import { layoutSplitDiff } from "./diff/splitdiff.ts";

/**
 * A part of a screen: a row of text; a diff's rows, laid out as `layoutDiff` lays them out (or side by side); or a
 * note's diff as its blocks (`layoutBlockDiff`).
 */
export type ScreenPart =
  | { spans: Span[]; fill?: Role }
  | { rows: DiffViewRow[]; from: string; to: string }
  | { blocks: BlockDiff };

/** A screen's text: a line for each of its rows — a text row's own, a diff's (`diffText`), a block diff's units. */
export function screenText(parts: ScreenPart[]): string {
  return parts
    .flatMap((p) =>
      "spans" in p
        ? [p.spans.map((s) => s.text).join("")]
        : "blocks" in p
          ? p.blocks.units.map((u) => u.text)
          : diffText(p.rows),
    )
    .join("\n");
}

/**
 * Parts laid out one after another, each row a line of the screen's text (`screenText`): a text row as it is, a diff as
 * `layoutDiff` lays it out — side by side (`split`) when it changes anything — a note's blocks as `layoutBlockDiff`
 * does, its lines counted on from the parts before it. Each diff too wide scrolls sideways on its own.
 */
export function layoutScreen(parts: ScreenPart[], opts: DiffLayoutOptions & { split?: boolean }): Layout {
  const lines: Line[] = [];
  let width = opts.width;
  let at = 0;
  const shifted = (l: Layout) => {
    for (const line of l.lines)
      lines.push({
        ...line,
        src: line.src + at,
        spans: line.spans.map((s) => (s.src === undefined ? s : { ...s, src: s.src + at })),
      });
    width = Math.max(width, l.width);
  };
  for (const p of parts) {
    if ("spans" in p) {
      lines.push({ spans: p.spans, src: ++at, ...(p.fill ? { fill: p.fill } : {}) });
      continue;
    }
    if ("blocks" in p) {
      if (!p.blocks.units.length) continue;
      shifted(layoutBlockDiff(p.blocks, { width: opts.width, glyphs: opts.glyphs, tabWidth: opts.tabWidth }));
      at += p.blocks.units.length;
      continue;
    }
    if (!p.rows.length) continue;
    const changes = p.rows.some((r) => r.kind === "-" || r.kind === "+");
    shifted(
      opts.split && changes ? layoutSplitDiff(p.rows, p.from, p.to, opts) : layoutDiff(p.rows, p.from, p.to, opts),
    );
    at += p.rows.length;
  }
  if (!lines.length) lines.push({ spans: [], src: 1 });
  return { lines, links: [], headings: [], width };
}
