// Cached-row placement and final IR sanitization, clipping and link/heading anchoring.
import { sanitize } from "../../../../foundation/text/sanitize.ts";
import { graphemes, graphemeWidth, stringWidth } from "../../../../foundation/text/width.ts";
import type { Layout, LayoutHeading, Line, Span } from "../../ir.ts";
import type { Ctx } from "../render-context.ts";

/** A cached row, moved `delta` source lines and renumbered into the layout's links and headings. */
export function placed(line: Line, delta: number, linkBase: number, headBase: number): Line {
  const spans = line.spans.map((s) => {
    const c: Span = { ...s };
    if (s.src !== undefined) c.src = s.src + delta;
    if (s.link !== undefined) c.link = s.link + linkBase;
    if (s.task) c.task = { ...s.task, line: s.task.line + delta, end: s.task.end + delta };
    return c;
  });
  const c: Line = { ...line, spans, src: line.src + delta };
  if (line.heading !== undefined) c.heading = line.heading + headBase;
  if (line.details) c.details = { ...line.details, from: line.details.from + delta, to: line.details.to + delta };
  return c;
}

export function finish(lines: Line[], ctx: Ctx, width: number): Layout {
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
