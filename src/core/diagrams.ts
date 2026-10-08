// Mermaid drawn in the terminal's own characters (plan 12.10): `beautiful-mermaid` lays a diagram out in box drawing —
// no browser, no picture. Loaded the first time a note holds one (16.6's lazy loading): until then, and for a kind it
// doesn't draw, a diagram that doesn't parse, or one wider than the text, the block is its code, saying why.

import { lazy, load } from "./lazy.ts";
import { stringWidth } from "./width.ts";

type Mermaid = typeof import("beautiful-mermaid");

/** The library's name as it loads: what a layout drawn without it waited for. */
export const MERMAID = "mermaid";
const importMermaid = () => import("beautiful-mermaid");

/** The library, or null while it loads (the TUI draws again when it's in). */
export function mermaid(): Mermaid | null {
  return lazy(MERMAID, importMermaid);
}

/** Wait for it (the CLI, which has no frame to draw again). */
export function loadMermaid(): Promise<Mermaid | null> {
  return load(MERMAID, importMermaid);
}

/** A diagram's rows, or why it's its code instead. */
export type Drawn = { rows: string[] } | { why: string };

/** Gaps between boxes tried in turn until the diagram fits: the library's own across, then narrower. */
const SPACINGS = [{ paddingX: 5, paddingY: 3 }, { paddingX: 3, paddingY: 3 }, { paddingX: 2, paddingY: 3 }];

/** Draw a Mermaid diagram at most `width` columns wide — in ASCII where the glyphs are; null while the library loads.
 *  (A drawn block is kept by the render cache, 15.1: drawn again only when it or the width changes.) */
export function drawMermaid(source: string, width: number, ascii: boolean): Drawn | null {
  const m = mermaid();
  if (!m) return null;
  for (const spacing of SPACINGS) {
    let text: string;
    try {
      text = m.renderMermaidASCII(source, { useAscii: ascii, colorMode: "none", ...spacing });
    } catch {
      // A kind it doesn't draw (`pie`, `gantt`…), or a diagram it can't read: named by its first word.
      const kind = source.trim().split(/\s/)[0] || "empty";
      return { why: `not drawn: ${kind}` };
    }
    const rows = text.split("\n").map((r) => r.trimEnd());
    while (rows.length && !rows[rows.length - 1]) rows.pop();
    if (!rows.length) return { why: "nothing to draw" };
    if (Math.max(...rows.map(stringWidth)) <= width) return { rows };
  }
  return { why: "too wide to draw" };
}
