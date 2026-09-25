// Fuzzy matching for the switcher, palette and pickers: subsequence match, scored for
// consecutive runs, word starts and path-segment starts; case-insensitive unless the query has
// an uppercase letter (smart case).

export interface FuzzyMatch {
  score: number;
  /** Indices into the candidate string that matched, for highlighting. */
  positions: number[];
}

export function fuzzy(query: string, text: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };
  const smart = /[A-Z]/.test(query);
  const q = smart ? query : query.toLowerCase();
  const t = smart ? text : text.toLowerCase();
  // Greedy from the left, then a backward pass to tighten the match.
  const positions: number[] = [];
  let ti = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    positions.push(found);
    ti = found + 1;
  }
  let score = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    const prev = text[p - 1];
    if (i > 0 && positions[i - 1] === p - 1) score += 8;
    if (p === 0 || prev === "/" || prev === " " || prev === "-" || prev === "_" || prev === ".") score += 10;
    if (prev === "/") score += 4;
    score -= Math.min(p - (positions[i - 1] ?? -1) - 1, 6);
  }
  // Prefer matches in the file name over the directory part.
  const slash = text.lastIndexOf("/");
  if (positions[0]! > slash) score += 12;
  score -= text.length * 0.05;
  if (t.includes(q)) score += 20;
  return { score, positions };
}

export function rank<T>(query: string, items: T[], key: (item: T) => string, limit = 500): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const m = fuzzy(query, key(item));
    if (m) out.push({ item, match: m });
  }
  if (query) out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
