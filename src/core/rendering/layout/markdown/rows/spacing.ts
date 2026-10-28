// Blank source anchors and adjacency rules for block and data rows.
import type { RootContent } from "mdast";
import { stringWidth } from "../../../../foundation/text/width.ts";
import type { Line, Span } from "../../ir.ts";
import { placeOf } from "../render-data.ts";

// ---------------------------------------------------------------------------------------------
// Blocks
/** Separator rows carry the source line of the row above, so anchoring to a block's first line
 *  lands on the block, never on the gap before it (3.5). */
export function gapAfter(rows: Line[], fallback: number): Line {
  return { ...blank(rows[rows.length - 1]?.src ?? fallback), gap: true };
}

export function blank(src: number): Line {
  return { spans: [], src };
}

/** A data file's keys and comment lines follow each other with no blank row between (16.11). */
export function joined(prev: RootContent | undefined, node: RootContent): boolean {
  const row = (n: RootContent | undefined) => {
    const t = (n as { type?: string } | undefined)?.type;
    // A data file's rows follow each other, a table in its tree too (no gap breaks the guides).
    return t === "dataField" || t === "dataComment" || (t === "table" && !!placeOf(n as RootContent));
  };
  return row(prev) && row(node);
}

/** Prefix every row: `first` on row one, spaces of the same width after (or `first` on all rows). A code block's rows
 *  that scroll sideways keep where their code starts, moved over by the prefix. */
export function prefixed(lines: Line[], first: Span[], src: number, everyRow = false): Line[] {
  const w = first.reduce((a, s) => a + stringWidth(s.text), 0);
  const hang: Span[] = [{ text: " ".repeat(w), role: "text", attrs: 0 }];
  if (lines.length === 0) return [{ spans: first, src }];
  return lines.map((line, i) => ({
    ...line,
    spans: [...(i === 0 || everyRow ? first : hang), ...line.spans],
    ...(line.scroll ? { scroll: { ...line.scroll, x: line.scroll.x + w } } : {}),
  }));
}
