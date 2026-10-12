// Mermaid drawn in the terminal's own characters (plan 12.10): `beautiful-mermaid` lays a diagram out in box drawing —
// no browser, no picture. Loaded the first time a note holds one (16.6's lazy loading): until then, and for a kind it
// doesn't draw, a diagram that doesn't parse, or one wider than the text, the block is its code, saying why.

import { lazy, load } from "./lazy.ts";
import { flattenVars } from "./svg.ts";
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

/** The theme's colours a diagram is drawn in as a picture (12.16), as `#rrggbb`. */
export interface DrawingColors {
  bg: string;
  fg: string;
  line: string;
  accent: string;
  muted: string;
}

/**
 * A Mermaid diagram as an SVG for a picture (12.16): in the theme's colours, its background the terminal's, its words in
 * `family`; its CSS variables put in place (resvg reads none). Null while the library loads, where it doesn't draw it,
 * or where there's no font for its words.
 */
export function mermaidSvg(source: string, colors: DrawingColors, family: string | null): string | null {
  const m = mermaid();
  if (!m || !family) return null;
  try {
    return flattenVars(m.renderMermaidSVG(source, { ...colors, font: family, transparent: true }));
  } catch {
    return null;
  }
}

/** A diagram's rows, or why it's its code instead. */
export type Drawn = { rows: string[] } | { why: string };

/** Gaps between boxes tried in turn until the diagram fits: the library's own across, then narrower. */
const SPACINGS = [
  { paddingX: 5, paddingY: 3 },
  { paddingX: 3, paddingY: 3 },
  { paddingX: 2, paddingY: 3 },
];

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
