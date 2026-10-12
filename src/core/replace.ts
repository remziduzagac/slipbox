// Find and replace (the find row's replace field, `:s`, `gn`): one engine. A query is plain text
// unless regex is on; whole-word keeps it off the inside of longer words; smart case, as `/` has
// always done — case-insensitive unless the query has a capital. Matching works on the note's text
// (its markdown), never on what the render shows.

export interface PatternOptions {
  regex: boolean;
  whole: boolean;
  /** Case-insensitive whatever the query (`:s`'s `i` flag); otherwise smart case. */
  ignoreCase?: boolean;
}

/** The query as a global regex, or why it isn't one (an invalid regex). */
export function compilePattern(query: string, opts: PatternOptions): RegExp | string {
  let source = opts.regex ? crlfEnds(query) : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (opts.whole) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    // m: ^ and $ are a line's start and end, as in vim and grep, not the whole note's.
    const capital = /\p{Lu}/u.test(opts.regex ? unescaped(query) : query);
    return new RegExp(source, !opts.ignoreCase && capital ? "gmu" : "gimu");
  } catch (err) {
    return (err as Error).message.replace(/^Invalid regular expression: /, "");
  }
}

/**
 * A regex query without its escapes, for smart case: `\S`, `\W`, `\p{Lu}` or `\x4A` is no
 * capital the user typed (vim's smartcase skips the character after a backslash too).
 */
function unescaped(query: string): string {
  return query.replace(/\\(?:[pP]\{[^}]*\}|k<[^>]*>|c[A-Za-z]|u\{[^}]*\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|.)/gsu, "");
}

/**
 * A pattern's line anchors, made to mean lines of the note: `^` after a `\n` (or at the start) and
 * `$` before a `\n` — or a `\r\n`, so a CRLF line ends before its `\r` — or at the end. (A
 * multiline RegExp alone also breaks lines at a lone `\r`.) Escaped characters and character
 * classes are left alone.
 */
function crlfEnds(source: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === "\\") {
      out += c + (source[i + 1] ?? "");
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      out += c;
      continue;
    }
    if (c === "[") {
      inClass = true;
      out += c;
      if (source[i + 1] === "^") out += source[++i]; // a negated class, not an anchor
      continue;
    }
    // $ before a CRLF's \r (never between the \r and the \n), before an LF, or at the end.
    out += c === "^" ? "(?<![^\\n])" : c === "$" ? "(?<!\\r)(?=\\r?\\n|(?![\\s\\S]))" : c;
  }
  return out;
}

export interface TextMatch {
  from: number;
  to: number;
  /** The groups, for `$1` / `\1` in the replacement. */
  groups: string[];
}

/**
 * Every match in `text` (within [from, to) when given). Empty matches (`^`, `$`, a lookahead) are
 * kept only when `empty` is set — a replacement inserts there (`:s/^/> /`); a search skips them.
 * The empty "line" after a final newline is never one.
 */
export function findAll(text: string, re: RegExp, from = 0, to = text.length, empty = false): TextMatch[] {
  const out: TextMatch[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  g.lastIndex = from;
  let lastEnd = -1;
  for (let m = g.exec(text); m; m = g.exec(text)) {
    const at = m.index;
    if (!m[0]) {
      // Past this position by a whole character: one UTF-16 unit could land inside an emoji's
      // surrogate pair, and a replacement there would split it.
      g.lastIndex = at + ((text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1);
      if (at === lastEnd) continue; // right after a real match (a* on aaa): not a second one
      if (text[at - 1] === "\r" && text[at] === "\n") continue; // inside a CRLF: the line ended before \r
      // An empty match at `to` is the next line's start, unless the note ends there unterminated.
      const inside = at < to || (at === text.length && to === text.length && !text.endsWith("\n"));
      if (empty && inside) out.push({ from: at, to: at, groups: [m[0], ...m.slice(1).map((x) => x ?? "")] });
      if (at >= to) break;
      continue;
    }
    if (at >= to || at + m[0].length > to) break;
    out.push({ from: at, to: at + m[0].length, groups: [m[0], ...m.slice(1).map((x) => x ?? "")] });
    lastEnd = at + m[0].length;
  }
  return out;
}

/**
 * The replacement for one match. Plain text is taken as it is; with regex, `$&` is the match,
 * `$1`–`$9` its groups and `$$` a dollar (JavaScript's syntax).
 */
export function expandReplacement(replacement: string, m: TextMatch, regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$(\$|&|[1-9])/g, (_, k: string) =>
    k === "$" ? "$" : k === "&" ? m.groups[0]! : (m.groups[Number(k)] ?? ""),
  );
}

/** The offset just past the line holding `at` (the end of the text on the last line). */
export function nextLine(text: string, at: number): number {
  const nl = text.indexOf("\n", at);
  return nl < 0 ? text.length : nl + 1;
}

/** Only the first match on each line (vim's `:s` without `g`). */
export function firstPerLine(text: string, ms: TextMatch[]): TextMatch[] {
  const out: TextMatch[] = [];
  let past = -1;
  for (const m of ms) {
    if (m.from < past) continue;
    out.push(m);
    past = nextLine(text, m.to > m.from ? m.to - 1 : m.from);
  }
  return out;
}

/** Replace `matches` in `text` (in order, not overlapping): the new text and how many were replaced. */
export function replaceMatches(
  text: string,
  matches: TextMatch[],
  replacement: string,
  regex: boolean,
): { text: string; count: number } {
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
    } else if (ch === "\\" && i + 1 < input.length) {
      // Any other escape is a pair, kept whole: \\ is a backslash, so the delimiter after it ends
      // the part (:%s/$/\\/ appends a backslash — markdown's hard break).
      parts[parts.length - 1] += ch + input[i + 1]!;
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
  // \r (vim's) and \n are a line break, \t a tab.
  const escapes: Record<string, string> = { "&": "&", "\\": "\\", r: "\n", n: "\n", t: "\t" };
  const replacement = rawReplacement
    .replace(/\$/g, "$$$$")
    .replace(/\\([1-9&\\rnt])|&/g, (_all: string, k?: string) => (k === undefined ? "$&" : (escapes[k] ?? `$${k}`)));
  return {
    range: m[1] === "%" ? "all" : m[1] ? "selection" : "line",
    pattern,
    replacement,
    global: flags.includes("g"),
    ignoreCase: flags.includes("i"),
    confirm: flags.includes("c"),
  };
}
