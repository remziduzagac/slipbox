// Search query grammar and FTS expression construction.

import { tagName } from "../../../documents/markdown/tags.ts";
import type { QueryTerm, SearchQuery } from "../model/contracts.ts";

export const WORDY = /[\p{L}\p{N}]/u;

/**
 * Words (all of them, by default), "phrases", prefix*, -not, title:word, and the filters #tag,
 * tag:x and path:folder/. Nothing in it is FTS5 syntax: every term is quoted when it's passed on.
 */
export function parseQuery(input: string): SearchQuery {
  const q: SearchQuery = { terms: [], tags: [], paths: [] };
  for (const m of input.matchAll(/(-?)(?:(tag|path|title):)?(?:"([^"]*)"?|(\S+))/g)) {
    const not = m[1] === "-";
    const field = m[2];
    const quoted = m[3] !== undefined;
    let text = (quoted ? m[3] : m[4]) ?? "";
    if (field === "tag" || (!field && !quoted && !not && text.startsWith("#"))) {
      const t = tagName(text);
      if (t) q.tags.push(t.toLowerCase());
      continue;
    }
    if (field === "path") {
      const p = text.replace(/^\.?\//, "");
      if (p) q.paths.push(p);
      continue;
    }
    const prefix = !quoted && text.length > 1 && text.endsWith("*");
    if (prefix) text = text.slice(0, -1);
    if (!WORDY.test(text)) continue;
    q.terms.push({ text, phrase: quoted, prefix, not, title: field === "title" });
  }
  return q;
}

/** A term for FTS5: quoted (never its syntax), `*` for a prefix, in the title's columns for `title:`. */
export function ftsTerm(t: QueryTerm): string {
  const s = `"${t.text.replace(/"/g, '""')}"${t.prefix ? "*" : ""}`;
  return t.title ? `{title aliases} : ${s}` : s;
}

/** The query for FTS5: each term quoted; all the positive ones (or any, `relaxed`), none of the rest. */
export function ftsMatch(q: SearchQuery, relaxed = false): string | null {
  const one = ftsTerm;
  const pos = q.terms.filter((t) => !t.not).map(one);
  if (!pos.length) return null;
  const neg = q.terms.filter((t) => t.not).map(one);
  const base = pos.length === 1 ? pos[0]! : `(${pos.join(relaxed ? " OR " : " AND ")})`;
  return neg.length ? `${base} NOT ${neg.join(" NOT ")}` : base;
}
