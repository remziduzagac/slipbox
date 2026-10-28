// Parse pipeline (plan 1.3): remark + gfm + frontmatter + wikilinks + tags (1.6) + Obsidian's highlights and comments
// (DF-D17). Wikilinks are read
// again (21.3): within their root, by the graph. The converter (20.1) parses the same way
// (`parseLegacy`); it differs only in resolving them by `Graph.resolveLegacyWiki`.
// mdast carries source positions, which is why remark was chosen over marked.

import type { Root, Yaml } from "mdast";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { blockComments } from "./obsidian.ts";
import { tame } from "./parse/normalization.ts";
import { chunkStarts, mergeLists, shifted } from "./parse/chunks.ts";
import { bodyProcessor, processor } from "./parse/engine.ts";
import { dropOffsets, finish } from "./parse/transforms.ts";
import { type Frontmatter, ORIGIN, type ParseCache, type ParsedNote } from "./parse/contracts.ts";
import { visit } from "./parse/visit.ts";

/** Frontmatter bigger than this isn't parsed as YAML: it shows as raw text (a size bomb otherwise). */
const MAX_YAML = 64 * 1024;

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
  return starts.map((from, c) => ({
    text: lines.slice(from, starts[c + 1] ?? lines.length).join("\n"),
    first: from === 0,
  }));
}

/** A chunk's top-level nodes, as `parseMarkdown` parses it: positions from line 1, no offsets. */
export function parseChunk(text: string, first: boolean): Root["children"] {
  const root = (first ? processor : bodyProcessor).parse(text) as Root;
  finish(root.children, text);
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

export function parseMarkdown(
  source: string,
  cache?: ParseCache,
  opts: { whole?: boolean; chunkLines?: number } = {},
): ParsedNote {
  if (cache?.backgroundFailure?.source === source) {
    const lines = source.split("\n");
    const end = { line: lines.length, column: lines[lines.length - 1]!.length + 1, offset: source.length };
    const position = { start: { line: 1, column: 1, offset: 0 }, end };
    return {
      source,
      frontmatter: null,
      error: cache.backgroundFailure.why,
      tree: { type: "root", children: [{ type: "code", lang: "text", value: source, position }] },
    };
  }
  if (cache) cache.backgroundFailure = undefined;
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
    if (entry && entry.shift !== from)
      entry = { ...entry, children: shifted(entry.children, from - entry.shift), shift: from };
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
      finish(kids, text);
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
          if (x.type === "definition" || x.type === "footnoteDefinition")
            defs.push({
              label: x.label ?? x.identifier,
              id: x.identifier.toLowerCase(),
              footnote: x.type === "footnoteDefinition",
              part: k,
            });
          if (
            x.type === "code" ||
            x.type === "html" ||
            x.type === "paragraph" ||
            x.type === "heading" ||
            x.type === "table"
          )
            return false;
        });
    });
    // A link definition whose label starts with ^ can't be stood in for ([^x]: is a footnote's):
    // such a note is parsed whole.
    if (defs.some((d) => !d.footnote && d.label.startsWith("^")))
      return parseMarkdown(source, cache, { ...opts, whole: true });
    if (defs.length) {
      ranges.forEach(([from, to], k) => {
        const lower = lines.slice(from, to).join("\n").toLowerCase();
        const own = new Set(defs.filter((d) => d.part === k).map((d) => `${d.footnote}:${d.id}`));
        const seen = new Set<string>();
        const stubs = defs.filter((d) => {
          const key = `${d.footnote}:${d.id}`;
          if (d.part === k || own.has(key) || seen.has(key) || !lower.includes(`[${d.footnote ? "^" : ""}${d.id}]`))
            return false;
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
  // Obsidian's comments over blank lines (DF-D17), once the chunks are one: a comment's blocks may be several chunks'.
  const tree: Root = {
    type: "root",
    children: blockComments(children),
    position: {
      start: { line: 1, column: 1 },
      end: { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 },
    },
  };
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

export {
  type Frontmatter,
  type ParsedNote,
  type ParseCache,
  newParseCache,
  ORIGIN,
  type HeadingInfo,
  type AnchorInfo,
} from "./parse/contracts.ts";
export { parseLegacy } from "./parse/engine.ts";
export { HEADING_ID } from "./parse/transforms.ts";
export { visit } from "./parse/visit.ts";
export { anchorsOf, slugify, headingsOf, headingLabel, headingText, plainText, noteTitle } from "./parse/headings.ts";
