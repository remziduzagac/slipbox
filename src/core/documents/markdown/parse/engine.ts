// Original unified processors and plugin order; legacy whole-note parsing.

import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { remarkObsidian } from "../obsidian.ts";
import { remarkHashtag } from "../tags.ts";
import { remarkWikiLink } from "../wikilink.ts";

// Maths (12.11): `$…$` in text, `$$` blocks — `$` read as Obsidian reads it after the parse (`dollarsAsText`).
export const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkWikiLink as never)
  .use(remarkHashtag as never)
  .use(remarkObsidian as never);

/** For chunks after the first: frontmatter is only ever at the note's start. */
export const bodyProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkWikiLink as never)
  .use(remarkHashtag as never)
  .use(remarkObsidian as never);

/** A note's tree with its wikilinks read (`wikiLink` nodes), in one parse: for the converter (20.1). */
export function parseLegacy(source: string): Root {
  return processor.parse(source) as Root;
}
