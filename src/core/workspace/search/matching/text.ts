// Tokenizer-equivalent folding and term occurrences with original offsets.

import type { QueryTerm } from "../model/contracts.ts";

/** Lower case, accents off — as the index's tokenizer folds them — with each character's place in the original. */
export function fold(text: string): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
    i += ch.length;
  }
  at.push(i);
  return { folded, at };
}

/**
 * Where a term occurs in folded text as the tokenizer would see it, start and end: its words in order,
 * whatever is between them (a space, a line break, a comma), at a word's start and (unless a prefix)
 * its end — as FTS5 matches a phrase, so the scan finds what the index does.
 */
export function occurrences(folded: string, term: QueryTerm): [number, number][] {
  const words = fold(term.text)
    .folded.split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return [];
  // The bounds in the pattern, not checked after: a match turned down inside a word (`uno` for "no
  // no") would otherwise hide one starting within it.
  const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\\p{L}\\p{N}]+");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${term.prefix ? "" : "(?![\\p{L}\\p{N}])"}`, "gu");
  return [...folded.matchAll(re)].map((m): [number, number] => [m.index, m.index + m[0].length]);
}
