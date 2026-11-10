// Reference definitions and footnotes are the note's, not a chunk's: a chunk using a label another chunk defines is
// parsed again with a stand-in definition for it, so `[text][ref]` and `[^1]` parse as in the whole note. Here, which
// stand-ins each chunk takes and its text with them. `parseMarkdown` parses them on this thread; for a big note the
// parse workers do, once its chunks are in, and their nodes are taken in here (15.1, SIS-D7).

import type { Root } from "mdast";
import { chunkStarts, shifted } from "./chunks.ts";
import { ORIGIN, type ParseCache } from "./contracts.ts";
import { tame } from "./normalization.ts";
import { visit } from "./visit.ts";

type Nodes = Root["children"];

/** A label a chunk uses and another defines: a definition standing in for it is parsed with the chunk. */
export interface StandIn {
  label: string;
  footnote: boolean;
}

/**
 * The stand-ins each chunk (`ranges` of `lines`) is parsed with, from the chunks' own parse (`parts`): each label it
 * uses that another chunk defines, the first definition's, once. The labels come from the parse (a line that looks like
 * one may be a paragraph's lazy text). Null: a link definition's label starts with `^`, which can't be stood in for
 * (`[^x]:` is a footnote's), and the note is parsed whole.
 */
export function standInsOf(
  lines: string[],
  ranges: readonly (readonly [number, number])[],
  parts: readonly { children: Nodes }[],
): StandIn[][] | null {
  const none = ranges.map((): StandIn[] => []);
  if (parts.length < 2 || !lines.some((l) => l.includes("]:"))) return none;
  const defs: { label: string; id: string; footnote: boolean; part: number }[] = [];
  parts.forEach((p, k) => {
    for (const n of p.children)
      visit(n, (x) => {
        if (x.type === "definition" || x.type === "footnoteDefinition")
          defs.push({
            label: x.label ?? x.identifier,
            id: x.identifier.toLowerCase(),
            footnote: x.type === "footnoteDefinition",
            part: k,
          });
        if (
          x.type === "code" ||
          x.type === "html" ||
          x.type === "paragraph" ||
          x.type === "heading" ||
          x.type === "table"
        )
          return false;
      });
  });
  if (defs.some((d) => !d.footnote && d.label.startsWith("^"))) return null;
  if (!defs.length) return none;
  return ranges.map(([from, to], k) => {
    const lower = lines.slice(from, to).join("\n").toLowerCase();
    const own = new Set(defs.filter((d) => d.part === k).map((d) => `${d.footnote}:${d.id}`));
    const seen = new Set<string>();
    return defs
      .filter((d) => {
        const key = `${d.footnote}:${d.id}`;
        if (d.part === k || own.has(key) || seen.has(key) || !lower.includes(`[${d.footnote ? "^" : ""}${d.id}]`))
          return false;
        seen.add(key);
        return true;
      })
      .map(({ label, footnote }) => ({ label, footnote }));
  });
}

/**
 * A chunk's text with its stand-ins, and the lines they add before it. They go before the chunk (definitions count
 * wherever they are, and a chunk ending in an unclosed fence would swallow them after it), but after the first, whose
 * front matter must stay first.
 */
export function standInText(body: string, from: number, stubs: readonly StandIn[]): { text: string; pre: number } {
  if (!stubs.length) return { text: body, pre: 0 };
  const defs = stubs.map((d) => `[${d.footnote ? "^" : ""}${d.label}]: #`).join("\n\n");
  return from > 0
    ? { text: `${defs}\n\n${body}`, pre: defs.split("\n").length + 1 }
    : { text: `${body}\n\n${defs}\n`, pre: 0 };
}

/** Whether a node of a chunk parsed with stand-ins is one: a definition in the `pre` lines before its `own` lines, or
 *  after them. */
export function isStandIn(n: Nodes[number], pre: number, own: number): boolean {
  if (n.type !== "definition" && n.type !== "footnoteDefinition") return false;
  const line = n.position?.start.line ?? 0;
  return pre ? line <= pre : line > own;
}

/**
 * The stand-ins of each of a note's chunks (`lines`, tamed, cut as `parseMarkdown` cuts them), from their parse in
 * `cache`: null when a chunk isn't there, or the note is parsed whole.
 */
export function chunkStandIns(
  lines: string[],
  cache: ParseCache,
): { ranges: [number, number][]; stubs: StandIn[][] } | null {
  const starts = chunkStarts(lines);
  const ranges = starts.map((from, c): [number, number] => [from, starts[c + 1] ?? lines.length]);
  const parts: { children: Nodes }[] = [];
  for (const [from, to] of ranges) {
    const p = cache.chunks.get(lines.slice(from, to).join("\n"));
    if (!p) return null;
    parts.push(p);
  }
  const stubs = standInsOf(lines, ranges, parts);
  return stubs ? { ranges, stubs } : null;
}

/** A chunk to parse with its stand-ins: its text with them, and what tells them from its own nodes after. */
export interface StandInChunk {
  text: string;
  first: boolean;
  pre: number;
  own: number;
  count: number;
}

/**
 * The chunks `parseMarkdown` parses again with stand-ins, those `cache` hasn't got: what's left of a big note's parse
 * once its chunks are in. None while a chunk isn't (its labels aren't known yet), or when the note is parsed whole.
 */
export function standInChunks(source: string, cache: ParseCache): StandInChunk[] {
  const lines = tame(source).split("\n");
  const s = chunkStandIns(lines, cache);
  const out: StandInChunk[] = [];
  s?.ranges.forEach(([from, to], k) => {
    const stubs = s.stubs[k]!;
    if (!stubs.length) return;
    const { text, pre } = standInText(lines.slice(from, to).join("\n"), from, stubs);
    if (!cache.chunks.has(text)) out.push({ text, first: from === 0, pre, own: to - from, count: stubs.length });
  });
  return out;
}

/**
 * Chunks parsed with their stand-ins elsewhere, taken into a buffer's cache as `parseMarkdown` keeps them: the
 * stand-ins taken out, the positions from the chunk's first line, and whether they all came back as definitions
 * (`stubbed`; one swallowed changed the chunk, and its own parse stands).
 */
export function adoptStandIns(cache: ParseCache, parsed: (StandInChunk & { children: Nodes })[]): void {
  for (const p of parsed) {
    if (cache.chunks.has(p.text)) continue;
    const kids = p.children.filter((n) => !isStandIn(n, p.pre, p.own));
    for (const k of kids) (k as unknown as Record<symbol, object>)[ORIGIN] = {};
    const stubbed = p.children.length - kids.length === p.count;
    cache.chunks.set(p.text, { children: p.pre ? shifted(kids, -p.pre) : kids, shift: 0, stubbed });
  }
}
