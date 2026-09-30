// Matching for every filter — the switcher, the palette, the pickers, and the explorer's, the
// history's and the outline's filters (3.16): each space-separated word as typed, its letters
// together, the words in any order; case-insensitive unless a word has a capital (smart case).
// Scored by where each word lands: in the label over its description, the file name over its
// folders, at a word start, earlier; shorter texts first.

export interface Match {
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

/**
 * Whether `text` holds every word of `query`, each as typed; its score and the positions the words
 * matched. `labelEnd`: where the text's label ends and a description begins — a word found in the
 * label ranks above one found only after it.
 */
export function match(query: string, text: string, labelEnd = text.length): Match | null {
  const words = query.split(/\s+/).filter(Boolean);
  if (!words.length) return { score: 0, positions: [] };
  const folded = fold(text);
  const slash = text.lastIndexOf("/", labelEnd - 1);
  const at = (i: number) => i === 0 || BOUNDARY.has(text[i - 1]!);
  const positions = new Set<number>();
  let score = 0;
  for (const word of words) {
    const smart = /\p{Lu}/u.test(word);
    const w = smart ? word : word.toLowerCase();
    const t = smart ? text : folded;
    // Its best occurrence: in the label, in the file name, at a word start, the earliest.
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) {
      const label = i < labelEnd;
      const sc = (label ? 100 : 0) + (label && i > slash ? 12 : 0) + (at(i) ? 10 : 0) + (text[i - 1] === "/" ? 4 : 0) - i * 0.01;
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    if (best < 0) return null;
    score += bestScore + w.length * 4;
    for (let k = 0; k < w.length; k++) positions.add(best + k);
  }
  score -= labelEnd * 0.05;
  return { score, positions: [...positions].sort((a, b) => a - b) };
}

/** The items whose text matches, best first. `key` gives the text, or a label and its description. */
export function rank<T>(query: string, items: T[], key: (item: T) => string | [string, string], limit = 500): { item: T; match: Match }[] {
  const out: { item: T; match: Match }[] = [];
  for (const item of items) {
    const k = key(item);
    const m = Array.isArray(k) ? match(query, k[1] ? `${k[0]} ${k[1]}` : k[0], k[0].length) : match(query, k);
    if (m) out.push({ item, match: m });
  }
  if (query.trim()) out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
