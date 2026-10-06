// Parse pipeline (plan 1.3): remark + gfm + frontmatter + wikilinks + tags (1.6). Wikilinks are read
// again (21.3): within their root, by the graph. The converter (20.1) reads them by `parseLegacy`.
// mdast carries source positions, which is why remark was chosen over marked.

import type { Heading, Nodes, Root, Yaml } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { remarkHashtag } from "./tags.ts";
import { remarkWikiLink, type WikiLink } from "./wikilink.ts";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkWikiLink as never)
  .use(remarkHashtag as never);
/** For chunks after the first: frontmatter is only ever at the note's start. */
const bodyProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkWikiLink as never)
  .use(remarkHashtag as never);
/** Wikilinks too, as notes were read before plain paths (20.2): the converter's only (20.1). */
const legacyProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkWikiLink as never)
  .use(remarkHashtag as never);

/** A note's tree with its wikilinks read (`wikiLink` nodes), as before plain paths: for the converter. */
export function parseLegacy(source: string): Root {
  return legacyProcessor.parse(source) as Root;
}

export interface Frontmatter {
  raw: string;
  format: "yaml" | "toml";
  /** Parsed data, or null when it failed to parse (the raw text is still shown). */
  data: Record<string, unknown> | null;
  error: string | null;
}

export interface ParsedNote {
  tree: Root;
  frontmatter: Frontmatter | null;
  source: string;
  /** A data file that doesn't parse (16.14): why. It then has no render; source mode shows it. */
  error?: string | null;
}

/**
 * Inputs the markdown parser takes quadratic time over, made harmless without moving a single
 * offset (positions are what editing uses) and without changing what an ordinary note means:
 *
 * - a run of 64+ `*` `_` `[` `]` on a line that has other text too (`***…x***…`) becomes as many
 *   look-alikes — a line that is only rule characters (a rule, a setext underline) is left alone;
 * - a container prefix of 20+ real quote or list markers (`> - > - …`), or 96+ columns of
 *   indentation before a list marker: one no-break space where the cap falls ends the containers.
 *
 * Code blocks and frontmatter are never touched. Only the rendered view sees a difference, and only
 * in notes built to be pathological; source mode shows the file's own text.
 */
function tame(source: string): string {
  if (!/([*_[\]])\1{63}/.test(source) && !/^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}|^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/m.test(source)) return source;
  const like: Record<string, string> = { "*": "∗", _: "‗", "[": "［", "]": "］" };
  const lines = source.split("\n");
  let fence: string | null = null;
  let front = lines[0] === "---";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (front) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) front = false;
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    let out = line;
    if (/([*_[\]])\1{63}/.test(out) && !/^\s*[-*_=\s]+$/.test(out)) out = out.replace(/([*_[\]])\1{63,}/g, (run) => like[run[0]!]!.repeat(run.length));
    const deep = /^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}/.exec(out) ?? /^[ \t]{96}/.exec(/^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/.test(out) ? out : "");
    // One no-break space where the cap falls ends the containers there: what follows is text (its
    // spaces still wrap), not 5,000 more levels.
    if (deep && deep[0].length < out.length) out = `${out.slice(0, deep[0].length)}\u00a0${out.slice(deep[0].length + 1)}`;
    lines[i] = out;
  }
  return lines.join("\n");
}

/** Frontmatter bigger than this isn't parsed as YAML: it shows as raw text (a size bomb otherwise). */
const MAX_YAML = 64 * 1024;

/**
 * Parsed chunks of a note, kept by the caller between parses of the same text as it is edited (a
 * buffer keeps one): only the chunks an edit touched are parsed again (plan 15.1).
 */
export interface ParseCache {
  chunks: Map<string, { children: Root["children"]; shift: number; stubbed?: boolean }>;
}

export function newParseCache(): ParseCache {
  return { chunks: new Map() };
}

/**
 * On each top-level node: a token for the block as parsed, kept when a reused chunk's nodes are
 * copied to a new position — the renderer caches a block's rows by it (moved, not re-rendered).
 */
export const ORIGIN = Symbol("origin");

/** A chunk ends before an ATX heading only after at least this many lines: fewer, larger parses. */
const CHUNK_LINES = 40;

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const BLOCK_TAGS = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
/** CommonMark's HTML block kind 6: a block-level tag, which may even interrupt a paragraph. */
const HTML_BLOCK = new RegExp(`^ {0,3}</?(?:${BLOCK_TAGS})(?:[\\s/>]|$)`, "i");
/** Kind 7: a line that is one whole tag, starting a block (it can't interrupt a paragraph). */
const HTML_TAG_LINE = /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/;
/** HTML block kinds 1–5, which blank lines don't end, at a line's start. */
const HTML_OPEN = /^ {0,3}(<!--|<\?|<!\[CDATA\[|<![A-Za-z]|<(?:script|pre|style|textarea)(?=[\s>]|$))/i;
/** A list item at the first column with something in it (an empty one can't interrupt a paragraph). */
const FULL_ITEM = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\S/;

/**
 * Where the note can be parsed in pieces with the same result as whole, outside frontmatter,
 * fenced code and the HTML blocks that run across blank lines (comments, `<script>`, `<pre>`,
 * `<style>`, `<textarea>`, `<?`, `<!X`, CDATA):
 *
 * - before a line that starts at its first column, after a blank line: whatever came before has
 *   ended (a list item's content would be indented, a lazy line needs no blank before it);
 * - before a list item at the first column, right after a line of the list, when the block these
 *   lines belong to began as such a list (after a blank line, a fence or a heading) — not text, not
 *   an HTML block that happens to hold a `- ` line: the list goes on in the next chunk, and
 *   `mergeLists` joins the two halves again.
 *
 * Returns the first line (0-based) of each chunk.
 */
function chunkStarts(lines: string[], min = CHUNK_LINES): number[] {
  const starts = [0];
  let fence: string | null = null;
  let front = lines[0]?.replace(/\r$/, "") === "---" || lines[0]?.replace(/\r$/, "") === "+++";
  const frontEnd = lines[0]?.replace(/\r$/, "") === "+++" ? /^\+\+\+\s*$/ : /^(---|\.\.\.)\s*$/;
  /** An open HTML block of kinds 1–5 (comments, <script>…): what ends it. */
  let html: RegExp | null = null;
  /** An open HTML block of kinds 6–7: a blank line ends it. */
  let htmlToBlank = false;
  /** A lone tag where a paragraph might go on: HTML or text, either way ended by a blank line. */
  let unsure = false;
  /** The line after a blank line, a heading, a closed fence or HTML block: a block starts here. */
  let fresh = true;
  /** The current block began, at such a start, as a list at the first column, and nothing in it
   *  since has been anything but its items and their indented lines. */
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (front) {
      if (i > 0 && frontEnd.test(line)) {
        front = false;
        fresh = true;
      }
      continue;
    }
    if (html) {
      if (html.test(line)) {
        html = null;
        fresh = true;
      }
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) {
        fence = null;
        fresh = true;
      }
      continue;
    }
    if (!line.trim()) {
      fresh = true;
      htmlToBlank = false;
      unsure = false;
      continue;
    }
    if (htmlToBlank) continue;
    const open = HTML_OPEN.exec(line);
    const opensHtml = open && !htmlEnd(open[1]!).test(line.slice(open.index + open[0].length));
    if (unsure) {
      // HTML or a paragraph's text: a fence or an unclosed comment here is one or the other, and
      // which decides where every later line belongs. Past that, the note stays whole.
      if (f || opensHtml) return starts;
      continue;
    }
    const startsBlock = fresh;
    fresh = false;
    // (A list that starts at a number other than 1 is text after indented code: not certain.)
    if (startsBlock) inList = FULL_ITEM.test(line) && !/^\d/.test(line.replace(/^0*1(?=[.)])/, ""));
    // Never before an empty item ("1." alone) or, after a blank line, an ordered one not starting
    // at 1: what those are depends on what came before (after indented code, a paragraph).
    const risky = (LIST_ITEM.test(line) && !FULL_ITEM.test(line)) || (startsBlock && /^\d{1,9}[.)]/.test(line) && !/^0*1[.)]/.test(line));
    if (i - starts[starts.length - 1]! >= min && /^\S/.test(line) && !risky) {
      const prev = lines[i - 1] ?? "";
      // After a blank line, anything; after text, only the next item of a list at the first column.
      if (!prev.trim() || (inList && !startsBlock && FULL_ITEM.test(line) && (FULL_ITEM.test(prev) || /^\s/.test(prev)))) starts.push(i);
    }
    if (f) {
      fence = f[1]!;
      inList = false;
      continue;
    }
    // HTML kinds 1–5 run to their end marker, across blank lines.
    if (opensHtml) {
      html = htmlEnd(open[1]!);
      inList = false;
      continue;
    }
    // Kind 6 (a block-level tag, which may interrupt a paragraph) runs to the next blank line; so
    // does kind 7 (a lone tag) where a block starts — elsewhere it may be a paragraph's text.
    if (HTML_BLOCK.test(line) || (startsBlock && HTML_TAG_LINE.test(line))) {
      htmlToBlank = true;
      inList = false;
      continue;
    }
    if (HTML_TAG_LINE.test(line)) {
      unsure = true;
      inList = false;
      continue;
    }
    // A heading starts a block after it; anything else at the first column that isn't an item, or
    // anything the list's items don't usually hold, ends the certainty that this is one list.
    if (/^ {0,3}#{1,6}(\s|$)/.test(line)) {
      fresh = true;
      inList = false;
    } else if ((/^\S/.test(line) && !FULL_ITEM.test(line)) || /^\s*(?:[<|=]|[-*_](?:\s*[-*_]){2,}\s*$)/.test(line)) inList = false;
  }
  return starts;
}

/** What ends an HTML block of kinds 1–5, from its opening. Kind 1 (<script>, <pre>, <style>,
 *  <textarea>) ends at the end tag of any of the four. */
function htmlEnd(tag: string): RegExp {
  const t = tag.toLowerCase();
  return t === "<!--" ? /-->/ : t === "<?" ? /\?>/ : t.startsWith("<![cdata[") ? /\]\]>/ : t.startsWith("<!") ? />/ : /<\/(?:script|pre|style|textarea)>/i;
}

/**
 * A list the chunking cut in two, joined again: at each seam, a list ending one chunk and a list
 * starting the next are one list when the whole note would make them one — both ordered or both
 * not, with the same marker (`-` `*` `+`, or `.` `)`). A blank line between them makes it loose.
 * The halves are copied, never changed: cached chunks share them.
 */
function mergeLists(children: Root["children"], seams: number[], lines: string[]): void {
  for (let k = seams.length - 1; k >= 0; k--) {
    const at = seams[k]!;
    const a = children[at - 1];
    const b = children[at];
    if (a?.type !== "list" || b?.type !== "list" || a.ordered !== b.ordered) continue;
    const marker = (l: { position?: { start: { line: number } } }) => {
      const m = /^\s*(?:\d{1,9}([.)])|([-*+]))/.exec(lines[(l.position?.start.line ?? 1) - 1] ?? "");
      return m?.[1] ?? m?.[2] ?? "";
    };
    if (marker(a) !== marker(b)) continue;
    const endA = a.position?.end.line ?? 0;
    const startB = b.position?.start.line ?? 0;
    const gap = lines.slice(endA, startB - 1).some((l) => !l.trim());
    const merged = {
      ...a,
      [ORIGIN]: undefined, // a new block: nothing cached is it
      spread: !!(a.spread || b.spread || gap),
      children: [...a.children, ...b.children],
      position: a.position && b.position ? { start: a.position.start, end: b.position.end } : a.position,
    };
    children.splice(at - 1, 2, merged);
  }
}

/** A label as CommonMark matches it: case and runs of white space don't count. */
function normalLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A copy of `nodes` with every position moved down `delta` lines (offsets aren't kept). */
function shifted<T>(nodes: T[], delta: number): T[] {
  const copy = (n: unknown): unknown => {
    const node = n as { position?: { start: { line: number; column: number }; end: { line: number; column: number } }; children?: unknown[] };
    const out: Record<string, unknown> = { ...(node as object) };
    if (node.position) out.position = { start: { line: node.position.start.line + delta, column: node.position.start.column }, end: { line: node.position.end.line + delta, column: node.position.end.column } };
    if (node.children) out.children = node.children.map(copy);
    return out;
  };
  return nodes.map(copy) as T[];
}

/** Positions carry lines and columns only: an offset would go stale when chunks are reused. */
/**
 * A quote whose text starts with an escaped bracket (`> \[!note]`) is marked `literal`: its author
 * wrote the brackets to be read, not a callout. Only the source tells (the escape is gone from the
 * text), so it's marked here, while the offsets are there.
 */
/** A heading's trailing `{#id …}` (Pandoc's attributes): its id, kept on the node, the text without it. */
function markHeadingIds(nodes: unknown[]): void {
  for (const n of nodes) {
    const node = n as Nodes;
    if (node.type === "heading") {
      const last = node.children[node.children.length - 1];
      const m = last?.type === "text" ? /\s*\{#([^\s{}#]+)(?:\s[^{}]*)?\}\s*$/.exec(last.value) : null;
      if (last?.type === "text" && m) {
        last.value = last.value.slice(0, m.index);
        ((node.data ??= {}) as { id?: string }).id = m[1]!;
      }
      continue;
    }
    if ("children" in node) markHeadingIds(node.children);
  }
}

function markLiteralQuotes(nodes: unknown[], text: string): void {
  for (const n of nodes) {
    const node = n as Nodes;
    if (node.type === "blockquote") {
      const first = node.children[0];
      const lead = first?.type === "paragraph" ? first.children[0] : undefined;
      const at = lead?.position?.start.offset;
      if (lead?.type === "text" && at !== undefined && text[at] === "\\") ((node.data ??= {}) as { literal?: boolean }).literal = true;
    }
    if ("children" in node) markLiteralQuotes(node.children, text);
  }
}

function dropOffsets(nodes: unknown[]): void {
  for (const n of nodes) {
    const node = n as { position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] };
    if (node.position) {
      delete node.position.start.offset;
      delete node.position.end.offset;
    }
    if (node.children) dropOffsets(node.children);
  }
}

/**
 * The blocks of the chunk holding source line `line` (1-based), and nothing else: what a question
 * about one line needs (is this line a task?) without parsing the whole note. The chunk's blocks
 * are what a whole parse gives there, but references to definitions elsewhere don't resolve.
 */
export function parseAround(source: string, line: number): Root {
  const lines = tame(source).split("\n");
  const starts = chunkStarts(lines);
  let k = starts.length - 1;
  while (k > 0 && starts[k]! > line - 1) k--;
  const from = starts[k]!;
  const to = starts[k + 1] ?? lines.length;
  const root = (from === 0 ? processor : bodyProcessor).parse(lines.slice(from, to).join("\n")) as Root;
  dropOffsets(root.children);
  return { type: "root", children: from ? shifted(root.children, from) : root.children };
}

/** The chunks `parseMarkdown` cuts a note into, each a text parsed on its own (`first`: the note's
 *  start, where frontmatter is) — for parsing them elsewhere, on other threads (plan 15.1). */
export function noteChunks(source: string): { text: string; first: boolean }[] {
  const lines = tame(source).split("\n");
  const starts = chunkStarts(lines);
  return starts.map((from, c) => ({ text: lines.slice(from, starts[c + 1] ?? lines.length).join("\n"), first: from === 0 }));
}

/** A chunk's top-level nodes, as `parseMarkdown` parses it: positions from line 1, no offsets. */
export function parseChunk(text: string, first: boolean): Root["children"] {
  const root = (first ? processor : bodyProcessor).parse(text) as Root;
  dropOffsets(root.children);
  return root.children;
}

/** Chunks parsed elsewhere, taken into a buffer's cache: the next `parseMarkdown` of the note
 *  parses none of them again. A chunk the cache has already is left as it is. */
export function adoptChunks(cache: ParseCache, parsed: { text: string; children: Root["children"] }[]): void {
  for (const p of parsed) {
    if (cache.chunks.has(p.text)) continue;
    for (const k of p.children) (k as unknown as Record<symbol, object>)[ORIGIN] = {};
    cache.chunks.set(p.text, { children: p.children, shift: 0, stubbed: true });
  }
}

export function parseMarkdown(source: string, cache?: ParseCache, opts: { whole?: boolean; chunkLines?: number } = {}): ParsedNote {
  const tamed = tame(source);
  const lines = tamed.split("\n");
  // `whole`: one parse of the whole note; `chunkLines`: smaller chunks (tests compare both).
  const starts = opts.whole ? [0] : chunkStarts(lines, opts.chunkLines);
  const used = new Map<string, { children: Root["children"]; shift: number; stubbed?: boolean }>();
  /** A chunk's nodes (cached by its text), with stand-in definitions for `stubs` at its end. */
  const chunk = (from: number, to: number, stubs: { label: string; footnote: boolean }[]) => {
    // Stand-ins go before the chunk (definitions count wherever they are, and a chunk ending in an
    // unclosed fence would swallow them after) — but after, in the first, whose frontmatter must
    // stay first. `pre`: the lines they add before.
    const body = lines.slice(from, to).join("\n");
    const defsText = stubs.map((d) => `[${d.footnote ? "^" : ""}${d.label}]: #`).join("\n\n");
    const before = stubs.length > 0 && from > 0;
    const text = !stubs.length ? body : before ? `${defsText}\n\n${body}` : `${body}\n\n${defsText}\n`;
    const pre = before ? defsText.split("\n").length + 1 : 0;
    let entry = used.get(text) ?? cache?.chunks.get(text);
    if (entry && entry.shift !== from) entry = { ...entry, children: shifted(entry.children, from - entry.shift), shift: from };
    if (!entry) {
      const root = (from === 0 ? processor : bodyProcessor).parse(text) as Root;
      const own = to - from;
      // The stand-ins go: they were only there for the parser. All of them must come back as
      // definitions, or they were swallowed (by an unclosed comment…) and changed the chunk.
      const isStub = (n: Root["children"][number]) => {
        if (n.type !== "definition" && n.type !== "footnoteDefinition") return false;
        const line = n.position?.start.line ?? 0;
        return before ? line <= pre : line > own;
      };
      const kids = stubs.length ? root.children.filter((n) => !isStub(n)) : root.children;
      const stubbed = !stubs.length || root.children.length - kids.length === stubs.length;
      markLiteralQuotes(kids, text);
      markHeadingIds(kids);
      dropOffsets(kids);
      for (const k of kids) (k as unknown as Record<symbol, object>)[ORIGIN] = {};
      entry = { children: from - pre ? shifted(kids, from - pre) : kids, shift: from, stubbed };
    }
    used.set(text, entry);
    return entry;
  };
  const ranges = starts.map((from, c) => [from, starts[c + 1] ?? lines.length] as const);
  const parts = ranges.map(([from, to]) => chunk(from, to, []));
  // Reference definitions and footnotes are the note's, not a chunk's: a chunk that uses a label
  // defined in another is parsed again with a stand-in definition at its end — so [text][ref] and
  // [^1] parse as in the whole note. The labels come from the parse (a line that looks like one
  // may be a paragraph's lazy text).
  if (parts.length > 1 && tamed.includes("]:")) {
    const defs: { label: string; id: string; footnote: boolean; part: number }[] = [];
    parts.forEach((p, k) => {
      for (const n of p.children)
        visit(n, (x) => {
          if (x.type === "definition" || x.type === "footnoteDefinition") defs.push({ label: x.label ?? x.identifier, id: x.identifier.toLowerCase(), footnote: x.type === "footnoteDefinition", part: k });
          if (x.type === "code" || x.type === "html" || x.type === "paragraph" || x.type === "heading" || x.type === "table") return false;
        });
    });
    // A link definition whose label starts with ^ can't be stood in for ([^x]: is a footnote's):
    // such a note is parsed whole.
    if (defs.some((d) => !d.footnote && d.label.startsWith("^"))) return parseMarkdown(source, cache, { ...opts, whole: true });
    if (defs.length) {
      ranges.forEach(([from, to], k) => {
        const lower = lines.slice(from, to).join("\n").toLowerCase();
        const own = new Set(defs.filter((d) => d.part === k).map((d) => `${d.footnote}:${d.id}`));
        const seen = new Set<string>();
        const stubs = defs.filter((d) => {
          const key = `${d.footnote}:${d.id}`;
          if (d.part === k || own.has(key) || seen.has(key) || !lower.includes(`[${d.footnote ? "^" : ""}${d.id}]`)) return false;
          seen.add(key);
          return true;
        });
        if (!stubs.length) return;
        const withStubs = chunk(from, to, stubs);
        if (withStubs.stubbed) parts[k] = withStubs;
      });
    }
  }
  const children: Root["children"] = [];
  /** Where each chunk after the first begins among `children`. */
  const seams: number[] = [];
  parts.forEach((p, k) => {
    if (k > 0) seams.push(children.length);
    for (const n of p.children) children.push(n);
  });
  if (cache) cache.chunks = used;
  mergeLists(children, seams, lines);
  const tree: Root = { type: "root", children, position: { start: { line: 1, column: 1 }, end: { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 } } };
  let frontmatter: Frontmatter | null = null;
  const first = tree.children[0];
  if (first && (first.type === "yaml" || (first.type as string) === "toml")) {
    const raw = (first as Yaml).value;
    const format = first.type === "yaml" ? "yaml" : "toml";
    let data: Record<string, unknown> | null = null;
    let error: string | null = null;
    if (raw.length > MAX_YAML) error = `frontmatter over ${MAX_YAML / 1024} KB: shown as text, not parsed`;
    else if (format === "toml") {
      // +++ frontmatter (Hugo, Zola): the same properties block as YAML's.
      try {
        data = parseToml(raw) as Record<string, unknown>;
      } catch (err) {
        error = (err as Error).message.split("\n")[0] ?? "invalid TOML";
      }
    } else {
      try {
        // Warnings stay off stderr (an error still fails); no duplicate-key check, which is
        // quadratic in the number of keys.
        const v = parseYaml(raw, { logLevel: "error", uniqueKeys: false });
        data = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
      } catch (err) {
        error = (err as Error).message.split("\n")[0] ?? "invalid YAML";
      }
    }
    frontmatter = { raw, format, data, error };
  }
  return { tree, frontmatter, source };
}

/** Depth-first visit of every node; return false from `fn` to skip a node's children. */
export function visit(node: Nodes, fn: (node: Nodes, parent: Nodes | null) => boolean | void, parent: Nodes | null = null): void {
  if (fn(node, parent) === false) return;
  const children = (node as { children?: Nodes[] }).children;
  if (children) for (const child of children) visit(child, fn, node);
}

export interface HeadingInfo {
  depth: number;
  text: string;
  /** Its slug as GitHub makes it, before repeats are numbered (`landing.ts` numbers them). */
  slug: string;
  /** 1-based source line. */
  line: number;
  /** An explicit id (`## Setup {#setup}`: Pandoc's, MkDocs', Docusaurus'), its text without it. */
  id?: string;
}

/** An HTML anchor in a note (`<a id="x">`, `<a name="x">`, a README's): a fragment lands on its line. */
export interface AnchorInfo {
  id: string;
  line: number;
}

/** Every HTML anchor (`<a id="x">`, `<a name="x">`) in a note's text, with its line. */
export function anchorsOf(tree: Root): AnchorInfo[] {
  const out: AnchorInfo[] = [];
  visit(tree, (node) => {
    if (node.type === "code") return false;
    if (node.type !== "html") return;
    for (const m of node.value.matchAll(/<a\s[^>]*?\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) out.push({ id: m[1]!, line: node.position?.start.line ?? 1 });
  });
  return out;
}

/** GitHub-style slug; also what `[[note#heading]]` compares against. */
export function slugify(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    // GitHub's: letters, marks (a Devanagari vowel sign, the dot `İ` lowers to), numbers, `_`, `-`.
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
    .replace(/\s/g, "-");
}

export function headingsOf(tree: Root): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  visit(tree, (node) => {
    if (node.type === "heading") {
      const text = headingText(node);
      const id = (node.data as { id?: string } | undefined)?.id;
      out.push({ depth: node.depth, text, slug: slugify(text), line: node.position?.start.line ?? 1, ...(id ? { id } : {}) });
      return false;
    }
    if (node.type === "code" || node.type === "html") return false;
  });
  return out;
}

export function headingText(node: Heading): string {
  // Wikilinks contribute their visible text.
  const parts: string[] = [];
  visit(node, (n) => {
    if (n.type === "wikiLink") {
      const w = n as WikiLink;
      parts.push(w.alias ?? w.value);
      return false;
    }
    // A tag keeps its `#` (the node holds its name).
    if ((n.type as string) === "hashtag") {
      parts.push(`#${(n as { value: string }).value}`);
      return false;
    }
    if (n.type === "text" || n.type === "inlineCode") parts.push(n.value);
  });
  return parts.join("") || toString(node);
}

/** Title of a note: frontmatter `title`, else the first H1, else the file name. */
export function noteTitle(parsed: ParsedNote, fileName: string): string {
  const t = parsed.frontmatter?.data?.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  for (const child of parsed.tree.children) {
    if (child.type === "heading" && child.depth === 1) return headingText(child);
  }
  return fileName.replace(/\.(md|markdown)$/i, "");
}
