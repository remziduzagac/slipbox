// Original scan filtering, ranking and relaxed fallback.

import { readText } from "../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../graph/graph.ts";
import { WEIGHTS } from "../indexing/weights.ts";
import type { QueryTerm, Scanned, SearchQuery, SearchResult } from "../model/contracts.ts";
import { searchable } from "../indexing/files.ts";
import { indexDoc } from "../model/document.ts";
import { fold, occurrences } from "../matching/text.ts";
import { locate } from "../matching/location.ts";

export function scanned(g: Graph, texts?: Map<string, string>, only?: string[]): Scanned[] {
  const out: Scanned[] = [];
  const keep = only ? new Set(only) : null;
  for (const [path, s] of searchable(g)) {
    if (keep && !keep.has(path)) continue;
    let text = texts?.get(path);
    if (text === undefined) {
      try {
        text = readText(g.abs(path)).text;
      } catch {
        continue;
      }
    }
    out.push({ path, group: s.group, text, doc: indexDoc(path, text, s.group) });
  }
  return out;
}

/** ASCII letters lowered, as SQLite's LIKE compares them: the index's `path:` and the scan's agree. */
export const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

export function keeps(f: Scanned, q: SearchQuery): boolean {
  if (q.paths.length && !q.paths.some((p) => asciiLower(f.path).startsWith(asciiLower(p)))) return false;
  const tags = f.doc.tags.map((t) => t.toLowerCase());
  return q.tags.every((t) => tags.some((x) => x === t || x.startsWith(`${t}/`)));
}

/** A scanned file's fields, folded: title, aliases, tags, path, headings, text (the index's columns). */
export function foldedFields(f: Scanned): string[] {
  const d = f.doc;
  return [
    d.title,
    d.aliases.join("\n"),
    d.tags.join("\n"),
    f.path,
    d.headings.map((h) => h.text).join("\n"),
    f.text,
  ].map((x) => fold(x).folded);
}

/** How often a term occurs in each field (`title:` in the title and aliases only). */
export function countsIn(fields: string[], t: QueryTerm): number[] {
  return fields.map((x, k) => (t.title && k > 1 ? 0 : occurrences(x, t).length));
}

export function scanFiles(g: Graph, q: SearchQuery, texts?: Map<string, string>, only?: string[]): string[] {
  const neg = q.terms.filter((t) => t.not);
  return scanned(g, texts, only)
    .filter((f) => keeps(f, q))
    .filter((f) => !neg.length || !neg.some((t) => countsIn(foldedFields(f), t).some((n) => n > 0)))
    .map((f) => f.path)
    .sort();
}

/** The scan: each file's fields folded; every positive term in it (or some, relaxed), none of the rest; scored as BM25 roughly is. */
export function scanSearch(
  g: Graph,
  q: SearchQuery,
  limit: number,
  texts?: Map<string, string>,
  only?: string[],
  relax = true,
): SearchResult {
  const pos = q.terms.filter((t) => !t.not);
  const neg = q.terms.filter((t) => t.not);
  const files = scanned(g, texts, only).filter((f) => keeps(f, q));
  const cands: { f: Scanned; counts: number[][] }[] = [];
  for (const f of files) {
    const fields = foldedFields(f);
    const count = (t: QueryTerm) => countsIn(fields, t);
    if (neg.some((t) => count(t).some((n) => n > 0))) continue;
    cands.push({ f, counts: pos.map(count) });
  }
  const has = (c: (typeof cands)[number], i: number) => c.counts[i]!.some((n) => n > 0);
  for (const relaxed of [false, true]) {
    if (relaxed && (pos.length < 2 || !relax)) break;
    const kept = cands.filter((c) => (relaxed ? pos.some((_, i) => has(c, i)) : pos.every((_, i) => has(c, i))));
    if (!kept.length) continue;
    const idf = pos.map((_, i) => {
      const df = cands.filter((c) => has(c, i)).length;
      return Math.log(1 + (files.length - df + 0.5) / (df + 0.5));
    });
    const hits = kept
      .map((c) => ({
        c,
        score: pos.reduce(
          (s, _, i) => s + idf[i]! * c.counts[i]!.reduce((a, n, k) => a + (WEIGHTS[k]! * n) / (n + 1.2), 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || (a.c.f.path < b.c.f.path ? -1 : 1))
      .slice(0, limit)
      .map(({ c, score }) => locate(c.f.path, c.f.group, c.f.text, score, q));
    return { engine: "scan", relaxed, hits };
  }
  return { engine: "scan", relaxed: false, hits: [] };
}
