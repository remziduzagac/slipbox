// Section selection and sanitized snippet/mark positions.

import { sanitize } from "../../../foundation/text/sanitize.ts";
import type { QueryTerm, SearchHit, SearchQuery } from "../model/contracts.ts";
import { indexDoc } from "../model/document.ts";
import { fold, occurrences } from "./text.ts";

/** How much of a line the snippet shows around the first match. */
const SNIPPET = 120;

/**
 * Where a matched file opens: the section with most of the query's words (the first such), at its
 * first line with one; that line as the snippet, the words marked. Matched by its title, aliases,
 * tags or path alone, its top.
 */
export function locate(path: string, group: "note" | "data", text: string, score: number, q: SearchQuery): SearchHit {
  const pos = q.terms.filter((t) => !t.not && !t.title);
  const doc = indexDoc(path, text, group);
  let best: { found: number; line: number; column: number; raw: string } | null = null;
  let withWords = 0;
  // The unit with most of the words (a heading's own text), at its first line with one.
  for (const u of doc.units) {
    // Its lines joined, folded, as the index reads them: a phrase wrapped across a line break placed
    // too. Each folded offset kept with its line and its offset in that line.
    let folded = "";
    const where: [number, number][] = [];
    u.forEach((l, i) => {
      const f = fold(l.text);
      folded += `${f.folded}\n`;
      for (let k = 0; k <= f.folded.length; k++) where.push([i, f.at[k]!]);
    });
    const seen = new Set<QueryTerm>();
    let col = -1;
    for (const t of pos) {
      const o = occurrences(folded, t)[0]?.[0];
      if (o === undefined) continue;
      seen.add(t);
      if (col < 0 || o < col) col = o;
    }
    if (col < 0) continue;
    const [i, off] = where[col]!;
    const l = u[i]!;
    const first = { line: l.line, column: [...l.text.slice(0, off)].length + 1, raw: l.text };
    withWords++;
    if (!best || seen.size > best.found) best = { found: seen.size, ...first };
  }
  // Cited by the band's section holding that line (scout's, for a search adding its results to dedupe).
  const at = best?.line ?? 1;
  const s = doc.sections.find((x) => x.lines.some((l) => l.line === at)) ?? doc.sections[0]!;
  const section = { name: s.name, line: s.line, end: s.end };
  if (!best) return { path, line: 1, column: 1, heading: "", section, score, snippet: "", marks: [], more: 0 };
  const heading = doc.headings.filter((h) => h.line <= best!.line).at(-1)?.text ?? "";
  return {
    path,
    line: best.line,
    column: best.column,
    heading,
    section,
    score,
    ...snippetOf(best.raw, pos),
    more: withWords - 1,
  };
}

/** A line as a snippet: white space run together, cut to about 120 characters around its first match, the words marked. */
function snippetOf(raw: string, pos: QueryTerm[]): { snippet: string; marks: [number, number][] } {
  // Sanitized first, so the marks are where the words are in what's shown.
  let line = sanitize(raw).replace(/\s+/g, " ").trim();
  const find = () => {
    const { folded, at } = fold(line);
    const marks: [number, number][] = [];
    for (const t of pos) for (const [s, e] of occurrences(folded, t)) marks.push([at[s]!, at[e] ?? line.length]);
    // One mark where two meet or overlap (`new "new york"`): shown once.
    const merged: [number, number][] = [];
    for (const m of marks.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      const last = merged.at(-1);
      if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
      else merged.push([m[0], m[1]]);
    }
    return merged;
  };
  let marks = find();
  if (line.length > SNIPPET && marks.length) {
    const from = Math.max(0, Math.min(marks[0]![0] - 30, line.length - SNIPPET));
    line = `${from > 0 ? "…" : ""}${line.slice(from, from + SNIPPET)}${from + SNIPPET < line.length ? "…" : ""}`;
    marks = find();
  }
  return { snippet: line, marks };
}
