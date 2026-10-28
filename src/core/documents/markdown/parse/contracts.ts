// Markdown parse/cache and heading records; one shared origin symbol.

import type { Root } from "mdast";

export interface Frontmatter {
  raw: string;
  format: "yaml" | "toml";
  /** Parsed data, or null when it failed to parse (the raw text is still shown). */
  data: Record<string, unknown> | null;
  error: string | null;
}

export interface ParsedNote {
  tree: Root;
  frontmatter: Frontmatter | null;
  source: string;
  /** A data file that doesn't parse (16.14): why. It then has no render; source mode shows it. */
  error?: string | null;
}

/**
 * Parsed chunks of a note, kept by the caller between parses of the same text as it is edited (a
 * buffer keeps one): only the chunks an edit touched are parsed again (plan 15.1).
 */
export interface ParseCache {
  /** The other threads couldn't parse `source` (15.1): it reads as its source until the text changes or a parse is
   *  tried again. `transient`: why was the worker's (the deadline, a crash), not the note's. */
  backgroundFailure?: { source: string; why: string; transient: boolean };
  chunks: Map<string, { children: Root["children"]; shift: number; stubbed?: boolean }>;
}

export function newParseCache(): ParseCache {
  return { chunks: new Map() };
}

/**
 * On each top-level node: a token for the block as parsed, kept when a reused chunk's nodes are
 * copied to a new position — the renderer caches a block's rows by it (moved, not re-rendered).
 */
export const ORIGIN = Symbol("origin");

export interface HeadingInfo {
  depth: number;
  text: string;
  /** Its slug as GitHub makes it, before repeats are numbered (`landing.ts` numbers them). */
  slug: string;
  /** 1-based source line. */
  line: number;
  /** An explicit id (`## Setup {#setup}`: Pandoc's, MkDocs', Docusaurus'), its text without it. */
  id?: string;
}

/** An HTML anchor in a note (`<a id="x">`, `<a name="x">`, a README's): a fragment lands on its line. */
export interface AnchorInfo {
  id: string;
  line: number;
}
