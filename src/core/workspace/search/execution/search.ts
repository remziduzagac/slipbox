// Indexed/scan dispatch with the original filters and result shape.

import type { Graph } from "../../graph/graph.ts";
import type { SearchIndex } from "../search-index.ts";
import type { SearchResult } from "../model/contracts.ts";
import { ftsMatch, ftsTerm, parseQuery } from "../query/parsing.ts";
import { scanFiles, scanSearch } from "./scan.ts";
import { locate } from "../matching/location.ts";

/**
 * Search the vault: with the index when it's given (complete and caught up), else by scanning the
 * files. For a scan: `texts`, files' text to use instead of the disk's (the TUI's unsaved notes);
 * `only`, just these files; `relax` false, never some of the words for want of all of them.
 */
export function search(
  g: Graph,
  idx: SearchIndex | null,
  input: string,
  opts: { limit?: number; texts?: Map<string, string>; only?: string[]; relax?: boolean } = {},
): SearchResult {
  const limit = opts.limit ?? 50;
  const q = parseQuery(input);
  const engine = idx ? "index" : "scan";
  if (!q.terms.some((t) => !t.not)) {
    // Filters alone: the files they keep, by path.
    if (!q.tags.length && !q.paths.length) return { engine, relaxed: false, hits: [] };
    // Less the files with a word they mustn't have (`#project -draft`).
    const not = q.terms.length ? q.terms.map(ftsTerm).join(" OR ") : undefined;
    const files = idx
      ? idx.filesWhere({ tags: q.tags, pathPrefix: q.paths, not, limit })
      : scanFiles(g, q, opts.texts, opts.only).slice(0, limit);
    // Nothing read: the file's top stands for where it's hit.
    return {
      engine,
      relaxed: false,
      hits: files.map((path) => ({
        path,
        line: 1,
        column: 1,
        heading: "",
        section: { name: "§:file", line: 1, end: 1 },
        score: 0,
        snippet: "",
        marks: [],
        more: 0,
      })),
    };
  }
  if (!idx) return scanSearch(g, q, limit, opts.texts, opts.only, opts.relax ?? true);
  for (const relaxed of [false, true]) {
    if (relaxed && q.terms.filter((t) => !t.not).length < 2) break;
    const rows = idx.query(ftsMatch(q, relaxed)!, { tags: q.tags, pathPrefix: q.paths, limit }) ?? [];
    if (rows.length) return { engine, relaxed, hits: rows.map((r) => locate(r.path, r.group, r.body, -r.score, q)) };
  }
  return { engine, relaxed: false, hits: [] };
}
