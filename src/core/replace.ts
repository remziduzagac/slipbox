// Find and replace (the find row's replace field, `:s`, `gn`): one engine. A query is plain text
// unless regex is on; whole-word keeps it off the inside of longer words; smart case, as `/` has
// always done — case-insensitive unless the query has a capital. Matching works on the note's text
// (its markdown), never on what the render shows.

export interface PatternOptions {
  regex: boolean;
  whole: boolean;
}

/** The query as a global regex, or why it isn't one (an invalid regex). */
export function compilePattern(query: string, opts: PatternOptions): RegExp | string {
  let source = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (opts.whole) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(source, /\p{Lu}/u.test(query) ? "gu" : "giu");
  } catch (err) {
    return (err as Error).message.replace(/^Invalid regular expression: /, "");
  }
}

export interface TextMatch {
  from: number;
  to: number;
  /** The groups, for `$1` / `\1` in the replacement. */
  groups: string[];
}

/** Every non-empty match in `text` (within [from, to) when given). */
export function findAll(text: string, re: RegExp, from = 0, to = text.length): TextMatch[] {
  const out: TextMatch[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  g.lastIndex = from;
  for (let m = g.exec(text); m; m = g.exec(text)) {
    if (m.index >= to) break;
    if (!m[0]) {
      g.lastIndex++; // an empty match never replaces anything
      continue;
    }
    if (m.index + m[0].length > to) break;
    out.push({ from: m.index, to: m.index + m[0].length, groups: [m[0], ...m.slice(1).map((x) => x ?? "")] });
  }
  return out;
}

/**
 * The replacement for one match. Plain text is taken as it is; with regex, `$&` is the match,
 * `$1`–`$9` its groups and `$$` a dollar (JavaScript's syntax).
 */
export function expandReplacement(replacement: string, m: TextMatch, regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$(\$|&|[1-9])/g, (_, k: string) => (k === "$" ? "$" : k === "&" ? m.groups[0]! : (m.groups[Number(k)] ?? "")));
}

/** Replace `matches` in `text` (in order, not overlapping): the new text and how many were replaced. */
export function replaceMatches(text: string, matches: TextMatch[], replacement: string, regex: boolean): { text: string; count: number } {
  let out = "";
  let at = 0;
  for (const m of matches) {
    out += text.slice(at, m.from) + expandReplacement(replacement, m, regex);
    at = m.to;
  }
  return { text: out + text.slice(at), count: matches.length };
}

export interface Substitute {
  /** Which lines: the cursor's, the whole note, or the visual selection's. */
  range: "line" | "all" | "selection";
  pattern: string;
  /** In `$` syntax: vim's `\1`–`\9` and `&` translated. */
  replacement: string;
  /** g: every match on a line (else the first); i: ignore case; c: confirm each. */
  global: boolean;
  ignoreCase: boolean;
  confirm: boolean;
}

/**
 * Parse vim's substitute: `s/old/new/`, `%s/old/new/g`, `'<,'>s/old/new/gc`. Any punctuation can
 * delimit (`s#a/b#c#`), and `\` escapes it. Patterns are JavaScript regular expressions (vim's
 * "very magic" `\v`, near enough); in the replacement `\1`–`\9` are groups, `&` the match, `\&` a
 * `&`. Null when it isn't a substitute.
 */
export function parseSubstitute(input: string): Substitute | null {
  const m = /^\s*(%|'<,'>)?s([^\w\s\\])/.exec(input);
  if (!m) return null;
  const delim = m[2]!;
  const parts: string[] = [""];
  let i = m[0].length;
  while (i < input.length && parts.length <= 3) {
    const ch = input[i]!;
    if (ch === "\\" && input[i + 1] === delim) {
      parts[parts.length - 1] += delim;
      i += 2;
    } else if (ch === delim && parts.length < 3) {
      parts.push("");
      i++;
    } else {
      parts[parts.length - 1] += ch;
      i++;
    }
  }
  const [pattern = "", rawReplacement = "", flags = ""] = parts;
  if (!pattern || !/^[gic]*$/.test(flags.trim())) return null;
  const replacement = rawReplacement.replace(/\$/g, "$$$$").replace(/\\([1-9&\\])|&/g, (all: string, k?: string) => (k === undefined ? "$&" : k === "&" ? "&" : k === "\\" ? "\\" : `$${k}`));
  return {
    range: m[1] === "%" ? "all" : m[1] ? "selection" : "line",
    pattern,
    replacement,
    global: flags.includes("g"),
    ignoreCase: flags.includes("i"),
    confirm: flags.includes("c"),
  };
}
