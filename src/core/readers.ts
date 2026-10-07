// A reader per note format (plan 16.2, docs/idea.md "Files beyond markdown"): everything slipbox
// asks of a note that depends on how it's written.
//
// Each reader parses into the one tree the rest works from — mdast, with source positions: the
// index takes headings, links, tags and tasks from it, the renderer lays it out, the lens finds
// blocks by its top-level nodes' lines. A format only has to say how its text maps to that tree,
// and a few things source mode reads off the raw text without a parse (a keystroke never
// re-parses a note): its headings, and the link around the cursor.

import { noteFormat } from "./filetypes.ts";
import type { LayoutHeading, LinkKind } from "./layout/ir.ts";
import { scanHeadings } from "./layout/source.ts";
import { type ParseCache, type ParsedNote, parseMarkdown } from "./parse.ts";
import { tagsInLine } from "./tags.ts";
import { parseWikiTarget } from "./wikilink.ts";

/** A link read from a line of source text. */
export interface SourceLink {
  kind: LinkKind;
  target: string;
  heading: string | null;
  text: string;
}

export interface NoteReader {
  format: string;
  /** The text as the shared tree. `cache`: the previous parse's, where the format can reuse it. */
  parse(source: string, cache?: ParseCache): ParsedNote;
  /** The headings, found without parsing (source mode while editing). */
  scanHeadings(source: string): Omit<LayoutHeading, "line">[];
  /** The link around column `col` (UTF-16) of a line, in the format's own syntax. */
  linkAt(text: string, col: number): SourceLink | null;
  /** How source mode colours it: markdown's highlighter (null), or a highlight.js language. */
  language: string | null;
}

const markdown: NoteReader = {
  format: "markdown",
  parse: (source, cache) => parseMarkdown(source, cache),
  scanHeadings,
  linkAt(text, col) {
    // A wikilink or an embed (21.3), `[[target#heading|alias]]`, split as the tokenizer splits it
    // (`\|` in a table cell, `#^block`).
    for (const m of text.matchAll(/(!?)\[\[([^[\]\n]+)\]\]/g)) {
      if (col < m.index || col >= m.index + m[0].length) continue;
      const w = parseWikiTarget(m[2]!);
      return { kind: m[1] ? "embed" : "wiki", target: w.target, heading: w.heading ?? (w.block ? `^${w.block}` : null), text: w.alias ?? w.target };
    }
    for (const m of text.matchAll(/!?\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      if (col < m.index || col >= m.index + m[0].length) continue;
      return { kind: m[0].startsWith("!") ? "image" : "markdown", target: m[2]!, heading: null, text: m[1]! };
    }
    // A tag (1.6).
    const t = tagsInLine(text).find((x) => col >= x.index && col < x.index + x.length);
    if (t) return { kind: "tag", target: t.name, heading: null, text: `#${t.name}` };
    return null;
  },
  language: null,
};


const READERS: Record<string, NoteReader> = { markdown };

/** The reader for a note format; markdown is the only one (Org and AsciiDoc were tried in 16.16 and
 *  16.17, and dropped: docs/idea.md). */
export function readerFor(format: string): NoteReader {
  return READERS[format] ?? markdown;
}

/** Parse a note's text by its name's format. */
export function parseNoteFile(rel: string, source: string, cache?: ParseCache): ParsedNote {
  return readerFor(noteFormat(rel)).parse(source, cache);
}
