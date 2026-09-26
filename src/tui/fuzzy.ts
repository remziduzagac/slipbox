// Fuzzy matching for the switcher, palette and pickers: a contiguous run first, else the tightest
// subsequence, scored for consecutive runs, word starts and path-segment starts; case-insensitive
// unless the query has an uppercase letter (smart case).

export interface FuzzyMatch {
  score: number;
  /** Indices into the candidate string that matched, for highlighting. */
  positions: number[];
}

/** Case-fold one code unit at a time, so indices into the result are indices into `text`. */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

const BOUNDARY = new Set(["/", " ", "-", "_", "."]);

export function fuzzy(query: string, text: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };
  const smart = /[A-Z]/.test(query);
  const q = (smart ? query : query.toLowerCase()).replace(/ /g, "");
  if (!q) return { score: 0, positions: [] };
  const t = smart ? text : fold(text);
  const slash = text.lastIndexOf("/");
  const at = (i: number) => i === 0 || BOUNDARY.has(text[i - 1]!);
  let positions: number[] | null = null;
  // A contiguous match wins: the best of its occurrences (in the file name, at a word start).
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + 1)) {
    const sc = (i > slash ? 10 : 0) + (at(i) ? 5 : 0) - i * 0.01;
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  if (best >= 0) positions = Array.from({ length: q.length }, (_, k) => best + k);
  else {
    // A subsequence: forward to the earliest end, then backward to the latest start, so the
    // letters sit as close together as they can; then forward again from that start.
    let ti = 0;
    for (const ch of q) {
      const f = t.indexOf(ch, ti);
      if (f < 0) return null;
      ti = f + 1;
    }
    let start = ti - 1;
    for (let qi = q.length - 1; qi >= 0; qi--) start = t.lastIndexOf(q[qi]!, qi === q.length - 1 ? start : start - 1);
    positions = [];
    let pi = start;
    for (const ch of q) {
      pi = t.indexOf(ch, pi);
      positions.push(pi);
      pi++;
    }
  }
  let score = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]!;
    if (i > 0 && positions[i - 1] === p - 1) score += 8;
    if (at(p)) score += 10;
    if (text[p - 1] === "/") score += 4;
    score -= Math.min(p - (positions[i - 1] ?? -1) - 1, 6);
  }
  // Prefer matches in the file name over the directory part, and whole runs over scattered letters.
  if (positions[0]! > slash) score += 12;
  if (best >= 0) score += 20 + q.length * 4;
  score -= text.length * 0.05;
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
