// Brackets (plan 25.3): the one matching a bracket — `%` goes there, and the view marks both — counted through the
// pairs nested between, of its kind only; and, typed with `[editor] auto_pairs` on, a pair closed as it opens: the
// closing bracket or quote put after the cursor, stepped over when typed, both taken out by a backspace between them.

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const QUOTES = new Set(['"', "'", "`"]);

/** The bracket matching the one at `at` — forward from an opening one, back from a closing one, past the pairs of its
 *  kind nested between — or -1: not a bracket, or unmatched. */
export function matchBracket(text: string, at: number): number {
  const ch = text[at] ?? "";
  const close = OPEN[ch];
  const open = CLOSE[ch];
  if (!close && !open) return -1;
  let depth = 0;
  if (close) {
    for (let i = at; i < text.length; i++) {
      if (text[i] === ch) depth++;
      else if (text[i] === close && --depth === 0) return i;
    }
  } else {
    for (let i = at; i >= 0; i--) {
      if (text[i] === ch) depth++;
      else if (text[i] === open && --depth === 0) return i;
    }
  }
  return -1;
}

/** Where `%` starts, as vim's does: the bracket at `at`, else the first after it on its line; -1 where there's none. */
export function bracketFrom(text: string, at: number): number {
  const nl = text.indexOf("\n", at);
  const stop = nl < 0 ? text.length : nl;
  for (let i = at; i < stop; i++) if (OPEN[text[i]!] || CLOSE[text[i]!]) return i;
  return -1;
}

/**
 * What typing `ch` at `at` inserts with pairs closed as typed, the cursor then after its first character: nothing for
 * a closing bracket or quote already after the cursor, stepped over; both halves for an opening bracket before a
 * space, the line's end or a closing one, and for a quote where it starts no word and ends none (an apostrophe in
 * "don't" stays one). Null: typed as it is.
 */
export function autoPair(text: string, at: number, ch: string): string | null {
  const next = text[at] ?? "\n";
  const prev = text[at - 1] ?? "\n";
  if ((CLOSE[ch] || QUOTES.has(ch)) && next === ch) return "";
  const open = /[\s)\]},;:]/.test(next);
  if (OPEN[ch]) return open ? ch + OPEN[ch] : null;
  if (QUOTES.has(ch) && open && !/[\p{L}\p{N}_]/u.test(prev)) return ch + ch;
  return null;
}

/** Whether a backspace at `at` takes out an empty pair — its opening half before the cursor, its closing one after. */
export function emptyPair(text: string, at: number): boolean {
  const prev = text[at - 1] ?? "";
  const next = text[at] ?? "";
  return (OPEN[prev] !== undefined && OPEN[prev] === next) || (QUOTES.has(prev) && prev === next);
}
