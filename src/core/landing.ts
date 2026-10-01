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

/** At most this many lines of a note shown where a link lands (a hover's preview). */
export const LANDING_LINES = 20;

/**
 * What a link lands on, as text: a heading's section (up to the next heading as high), a block (its
 * paragraph or item, up to the `^id`), or the note's start without its frontmatter — at most
 * `max` lines, and `…` when there's more. Null when the note can't be read or has no such place.
 */
export function landingText(g: Graph, path: string, heading: string | null, block: string | null, max = LANDING_LINES): string | null {
  const text = g.textOf(path);
  if (text === null) return null;
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let from = 0;
  let to = lines.length;
  const id = block ?? (heading?.startsWith("^") ? heading.slice(1) : null);
  if (id) {
    const at = blockLine(g, path, id);
    if (at === null) return null;
    to = at;
    from = at - 1;
    // A `^id` alone on its line marks the block above it.
    if (lines[at - 1]!.trim() === `^${id}`) from = to = at - 1;
    while (from > 0 && lines[from - 1]!.trim() !== "") from--;
    if (lines[at - 1]!.trim() !== `^${id}`) lines[at - 1] = lines[at - 1]!.replace(/\s*\^[A-Za-z0-9-]+\s*$/, "");
  } else if (heading && !/^L\d+$/.test(heading)) {
    const headings = g.entryAnywhere(path)?.headings ?? [];
    const slug = slugify(heading);
    const i = headings.findIndex((h) => h.slug === slug || h.text.toLowerCase() === heading.toLowerCase());
    if (i < 0) return null;
    from = headings[i]!.line - 1;
    const next = headings.slice(i + 1).find((h) => h.depth <= headings[i]!.depth);
    if (next) to = next.line - 1;
  } else if (lines[0] === "---") {
    const close = lines.findIndex((l, i) => i > 0 && (l === "---" || l === "..."));
    if (close > 0) from = close + 1;
  }
  const shown = lines.slice(from, to);
  while (shown.length && shown[0]!.trim() === "") shown.shift();
  while (shown.length && shown[shown.length - 1]!.trim() === "") shown.pop();
  if (shown.length > max) return `${shown.slice(0, max).join("\n")}\n…`;
  return shown.join("\n");
}
