// Where a link lands in the note it reaches (11.3): a heading's line, a block's (`^id`), or a line
// given as `L42` — what a jump goes to. Null when the note has no such place: its top, then.

import type { Graph } from "./graph.ts";
import { slugify } from "./parse.ts";

/** The line (1-based) a link's `#heading` or `#^block` lands on in `path` (vault-relative, or absolute in another root). */
export function landingLine(g: Graph, path: string, heading: string | null, block: string | null): number | null {
  if (block) return blockLine(g, path, block);
  if (!heading) return null;
  const at = /^L(\d+)$/.exec(heading);
  if (at) return Math.max(1, Number(at[1]));
  if (heading.startsWith("^")) return blockLine(g, path, heading.slice(1));
  const note = g.entryAnywhere(path);
  const slug = slugify(heading);
  return note?.headings.find((h) => h.slug === slug || h.text.toLowerCase() === heading.toLowerCase())?.line ?? null;
}

/** The line a block's `^id` marks, as Obsidian writes it: at the end of the block's last line, or alone after it. */
export function blockLine(g: Graph, path: string, id: string): number | null {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
  const text = g.textOf(path);
  if (text === null) return null;
  const mark = new RegExp(`(^|\\s)\\^${id}\\s*$`);
  const i = text.split("\n").findIndex((l) => mark.test(l.replace(/\r$/, "")));
  return i < 0 ? null : i + 1;
}

/** Every block id a note marks (`^id`), with its line: what `[[note#^` completes. */
export function blockIds(text: string): { id: string; line: number }[] {
  const out: { id: string; line: number }[] = [];
  text.split("\n").forEach((l, i) => {
    const m = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/.exec(l.replace(/\r$/, ""));
    if (m) out.push({ id: m[1]!, line: i + 1 });
  });
  return out;
}
