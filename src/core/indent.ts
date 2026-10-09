// A file's indentation (plan 25.1): tabs or spaces, how many, how wide a tab shows — as its `.editorconfig` says, else
// as the file itself is indented, else as its language usually is — and what `.editorconfig` asks of a save: trailing
// whitespace trimmed, a final newline. `.editorconfig` files are read from the file's folder up, nearer over farther,
// later sections over earlier, until one says `root = true`; their globs as the EditorConfig spec has them.

import { readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";

export interface Indent {
  /** A tab a level, or spaces. */
  tabs: boolean;
  /** Spaces a level (a tab's width where it's tabs). */
  size: number;
  /** How wide a tab shows. */
  tabWidth: number;
  /** A save trims trailing spaces and tabs from every line. */
  trimTrailing: boolean;
  /** A save ends the file with a newline (true), or leaves its end alone (null, false). */
  finalNewline: boolean | null;
  /** Where it was found: what a reader is told. */
  from: "editorconfig" | "file" | "language";
}

/** One level of indentation as text: a tab, or that many spaces. */
export function indentUnit(i: Indent): string {
  return i.tabs ? "\t" : " ".repeat(i.size);
}

/** How a file is indented, from its lines: tabs where more lines start with one, else the step spaces go in by most;
 *  null where too few lines are indented to tell. */
export function detectIndent(text: string): { tabs: boolean; size: number } | null {
  let tabs = 0;
  let spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)![0];
    if (lead.startsWith("\t")) tabs++;
    else if (lead.length) spaces++;
    if (lead.includes("\t")) {
      prev = 0;
      continue;
    }
    // A step of one space is no indentation: a block comment's ` * `, text aligned.
    const n = lead.length;
    if (n > prev && n - prev > 1) steps.set(n - prev, (steps.get(n - prev) ?? 0) + 1);
    prev = n;
  }
  if (tabs + spaces < 2) return null;
  if (tabs > spaces) return { tabs: true, size: 4 };
  const best = [...steps].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? { tabs: false, size: best[0] > 8 ? 8 : best[0] } : null;
}

/** Languages indented with tabs, by extension or file name; with four spaces; the rest with two. */
const TABS = new Set([".go", ".mk", "makefile", "gnumakefile", ".tsv"]);
const FOUR = new Set([".py", ".pyi", ".rs", ".java", ".kt", ".kts", ".swift", ".php", ".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".cs", ".scala", ".dart"]);

/** A language's usual indentation, by the file's extension or name. */
export function languageIndent(abs: string): { tabs: boolean; size: number } {
  const key = extname(abs).toLowerCase() || basename(abs).toLowerCase();
  if (TABS.has(key) || TABS.has(basename(abs).toLowerCase())) return { tabs: true, size: 4 };
  return { tabs: false, size: FOUR.has(key) ? 4 : 2 };
}

/** A glob of `.editorconfig` as a regular expression over a path from its folder (`/` between parts). */
export function globRegex(glob: string): RegExp {
  // No `/` in it: it matches a file's name anywhere below.
  const g = glob.includes("/") ? glob.replace(/^\//, "") : `**/${glob}`;
  let out = "";
  let i = 0;
  let braces = 0;
  while (i < g.length) {
    const c = g[i]!;
    if (c === "\\" && i + 1 < g.length) {
      out += escape(g[i + 1]!);
      i += 2;
      continue;
    }
    if (c === "*") {
      if (g[i + 1] === "*") {
        // `**/` also matches nothing at all; `**` anything, `/`s too.
        if (g[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i++;
      }
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i++;
      continue;
    }
    if (c === "[") {
      const end = g.indexOf("]", i + 1);
      if (end > i) {
        const body = g.slice(i + 1, end);
        out += body.startsWith("!") ? `[^/${body.slice(1).replace(/\\/g, "\\\\")}]` : `[${body.replace(/\\/g, "\\\\")}]`;
        i = end + 1;
        continue;
      }
    }
    if (c === "{") {
      const end = g.indexOf("}", i + 1);
      const body = end > i ? g.slice(i + 1, end) : "";
      const range = /^(-?\d+)\.\.(-?\d+)$/.exec(body);
      if (range) {
        // `{1..9}`: a whole number in that range.
        const [lo, hi] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
        out += `(?:${Array.from({ length: Math.min(hi! - lo! + 1, 10000) }, (_, k) => lo! + k).join("|")})`;
        i = end + 1;
        continue;
      }
      if (end > i && body.includes(",")) {
        out += "(?:";
        braces++;
        i++;
        continue;
      }
      out += escape(c);
      i++;
      continue;
    }
    if (c === "," && braces) {
      out += "|";
      i++;
      continue;
    }
    if (c === "}" && braces) {
      out += ")";
      braces--;
      i++;
      continue;
    }
    out += escape(c);
    i++;
  }
  return new RegExp(`^${out}$`);
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One `.editorconfig`: whether it's the root, and its sections — each a glob and its properties, lower-cased. */
export function parseEditorConfig(text: string): { root: boolean; sections: { glob: string; props: Map<string, string> }[] } {
  let root = false;
  const sections: { glob: string; props: Map<string, string> }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const head = /^\[(.*)\]$/.exec(line);
    if (head) {
      sections.push({ glob: head[1]!, props: new Map() });
      continue;
    }
    const kv = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const value = kv[2]!.replace(/\s+[#;].*$/, "").trim();
    if (!sections.length) {
      if (key === "root") root = value.toLowerCase() === "true";
      continue;
    }
    sections.at(-1)!.props.set(key, value.toLowerCase());
  }
  return { root, sections };
}

/** What `.editorconfig` files say of the file at `abs`: their properties, nearer files and later sections winning. */
export function editorConfigFor(abs: string, read: (path: string) => string | null = readOrNull): Map<string, string> {
  const files: { dir: string; parsed: ReturnType<typeof parseEditorConfig> }[] = [];
  for (let dir = dirname(abs); ; dir = dirname(dir)) {
    const text = read(join(dir, ".editorconfig"));
    if (text !== null) {
      const parsed = parseEditorConfig(text);
      files.push({ dir, parsed });
      if (parsed.root) break;
    }
    if (dirname(dir) === dir) break;
  }
  const props = new Map<string, string>();
  // Farthest first, so nearer ones write over it.
  for (const { dir, parsed } of files.reverse()) {
    const path = relative(dir, abs).split(sep).join("/");
    for (const s of parsed.sections) {
      let re: RegExp;
      try {
        re = globRegex(s.glob);
      } catch {
        continue;
      }
      if (re.test(path)) for (const [k, v] of s.props) props.set(k, v);
    }
  }
  return props;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The file at `abs`, holding `text`: how it's indented — `.editorconfig`'s `indent_style` and `indent_size`, else what
 * its lines show, else its language's — and what a save does to it.
 */
export function indentFor(abs: string, text: string, read?: (path: string) => string | null): Indent {
  const ec = editorConfigFor(abs, read);
  const style = ec.get("indent_style");
  const sizeSaid = Number(ec.get("indent_size")) > 0 ? Number(ec.get("indent_size")) : null;
  const tabWidthSaid = Number(ec.get("tab_width")) > 0 ? Number(ec.get("tab_width")) : null;
  const guess = detectIndent(text);
  const lang = languageIndent(abs);
  const tabs = style === "tab" ? true : style === "space" ? false : (guess?.tabs ?? lang.tabs);
  // A tab's width: its own, else the indent's size, else four.
  const tabWidth = tabWidthSaid ?? sizeSaid ?? 4;
  // Spaces a level: as said, else as the file has them, else as its language does.
  const spaces = sizeSaid ?? (guess && !guess.tabs ? guess.size : lang.tabs ? 4 : lang.size);
  const n = tabs ? tabWidth : spaces;
  const final = ec.get("insert_final_newline");
  return {
    tabs,
    size: n,
    tabWidth,
    trimTrailing: ec.get("trim_trailing_whitespace") === "true",
    finalNewline: final === "true" ? true : final === "false" ? false : null,
    from: style || sizeSaid ? "editorconfig" : guess ? "file" : "language",
  };
}

/** A file's text as a save leaves it: trailing whitespace trimmed and a final newline added, where its indent says. */
export function saveRules(text: string, i: Indent): string {
  let out = text;
  if (i.trimTrailing) out = out.replace(/[ \t]+(?=\r?\n|$)/g, "");
  if (i.finalNewline && out.length && !out.endsWith("\n")) out += out.includes("\r\n") ? "\r\n" : "\n";
  return out;
}
