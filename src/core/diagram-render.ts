// Mermaid rendering used only by the diagram worker; the UI reads completed results through diagrams.ts.

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
export function renderSvg(source: string, colors: DrawingColors, family: string | null): string | null {
  const m = mermaid();
  if (!m || !family) return null;
  try {
    return flattenVars(withoutWindow(() => m.renderMermaidSVG(source, { ...colors, font: family, transparent: true })));
  } catch {
    return null;
  }
}

/**
 * `fn` run as the diagram's layout library needs. It sets itself up on its first use, and takes a `window` for a
 * browser's: OpenTUI's renderer makes one (`{}`, for its animation frames), on which it breaks — so none is there while
 * it runs. And setting up, it swaps `setTimeout` for its own until it's done: should it throw, the real one is put back
 * here, or every timer after would wait for ever.
 */
export function withoutWindow<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const timeout = globalThis.setTimeout;
  const had = "window" in g;
  const window = g.window;
  if (had) delete g.window;
  try {
    return fn();
  } finally {
    if (had) g.window = window;
    globalThis.setTimeout = timeout;
  }
}

/** A diagram's rows (`wide`: wider than asked, to scroll sideways), or why it's its code instead. */
export type Drawn = { rows: string[]; wide?: true } | { why: string };

/** Gaps between boxes tried in turn until the diagram fits: the library's own across, then narrower. */
const SPACINGS = [
  { paddingX: 5, paddingY: 3 },
  { paddingX: 3, paddingY: 3 },
  { paddingX: 2, paddingY: 3 },
];

/** Draw a Mermaid diagram at most `width` columns wide — in ASCII where the glyphs are; null while the library loads.
 *  Too wide even drawn close together: drawn so all the same where the window scrolls it sideways (`scroll`), else
 *  why. (A drawn block is kept by the render cache, 15.1: drawn again only when it or the width changes.) */
export function renderText(source: string, width: number, ascii: boolean, scroll = false): Drawn | null {
  const m = mermaid();
  if (!m) return null;
  let closest: string[] = [];
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
    closest = rows;
  }
  return scroll ? { rows: closest, wide: true } : { why: "too wide to draw" };
}
