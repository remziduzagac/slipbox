// A note's entry (1.5, 1.6): one parse of its text, and what the graph keeps of it — its title, headings, anchors,
// links (its front matter's too), tags and names; from the parse cache when any copy on the machine parsed the same
// text before (20.11).

import { basename } from "node:path";
import type { Definition, Nodes } from "mdast";
import { readText } from "./foundation/platform/fsutil.ts";
import { parseWikiTarget, type WikiLink } from "./wikilink.ts";
import {
  type AnchorInfo,
  anchorsOf,
  type HeadingInfo,
  headingsOf,
  noteTitle,
  type ParseCache as ChunkCache,
  visit,
} from "./parse.ts";
import { parseNoteFile } from "./readers.ts";
import { ParseCache, sharedParseCache } from "./parsecache.ts";
import { contentHash } from "./redirects.ts";
import { noteFormat } from "./filetypes.ts";
import type { NoteFile } from "./walk.ts";
import { type Hashtag, tagKey, tagName } from "./tags.ts";
import type { LinkKind, LinkRef, Pos, NoteEntry } from "./graph-types.ts";

/** Bumped when what a note's entry holds changes: 5, content hashes (17.12). */
export const INDEX_VERSION = 13; // 6: inline #tags (1.6); 7: where links end (11.7); 8: no wikilinks (20.22); 9: wikilinks again (21.3); 10: heading ids, anchors; 11: front matter links; 12: worker-parsed heading ids (15.1); 13: document HTML headings and anchors (#90)

/** Parse one note and extract what the graph needs. */
export function extractNote(
  file: NoteFile,
  cache: ParseCache | null = sharedParseCache(),
  chunks?: ChunkCache,
): NoteEntry {
  const flags: string[] = [];
  let text = "";
  try {
    const decoded = readText(file.abs);
    text = decoded.text;
    if (decoded.invalidUtf8) flags.push("invalid-utf8");
    if (decoded.bom) flags.push("bom");
    if (decoded.crlf) flags.push("crlf");
  } catch (err) {
    flags.push(`unreadable: ${(err as NodeJS.ErrnoException).code ?? "error"}`);
    return extractFromSource(file, text, flags);
  }
  return extractText(file, text, flags, cache, chunks);
}

/** A note's text parsed, from the parse cache when any copy parsed it before (20.11): a file's, or git's (20.21). */
export function extractText(
  file: NoteFile,
  text: string,
  flags: string[] = [],
  cache: ParseCache | null = sharedParseCache(),
  chunks?: ChunkCache,
): NoteEntry {
  // Parsed before, by any copy of it on this machine (20.11): its content as it was, its place its own.
  const hash = contentHash(text);
  const key = ParseCache.key(hash, noteFormat(file.rel), INDEX_VERSION);
  const hit = cache?.get(key);
  if (hit) {
    return {
      rel: file.rel,
      title: hit.title ?? fileTitle(file.rel),
      headings: hit.headings as HeadingInfo[],
      anchors: (hit.anchors ?? []) as AnchorInfo[],
      links: hit.links as LinkRef[],
      tags: hit.tags,
      aliases: hit.aliases,
      previous: hit.previous,
      hash,
      mtimeMs: file.mtimeMs,
      size: file.size,
      flags,
    };
  }
  const e = extractFromSource(file, text, flags, chunks);
  cache?.put(key, {
    title: ownTitle.get(e) ? e.title : null,
    headings: e.headings,
    anchors: e.anchors ?? [],
    links: e.links,
    tags: e.tags,
    aliases: e.aliases,
    previous: e.previous,
  });
  return e;
}

/** The wikilinks in a front matter's text (its lines from the note's second), each at its line and column; a YAML comment's aren't. */
export function frontmatterLinks(raw: string): LinkRef[] {
  const out: LinkRef[] = [];
  raw.split("\n").forEach((line, i) => {
    const text = line.slice(0, yamlCommentAt(line));
    for (const m of text.matchAll(/(!?)\[\[([^[\]\n]+)\]\]/g)) {
      const w = parseWikiTarget(m[2]!);
      if (!w.target && !w.heading && !w.block) continue;
      const column = m.index! + 1;
      out.push({
        kind: m[1] ? "embed" : "wiki",
        target: w.target,
        heading: w.heading,
        block: w.block,
        alias: w.alias,
        text: w.alias ?? w.target,
        line: i + 2,
        column,
        end: { line: i + 2, column: column + m[0].length },
      });
    }
  });
  return out;
}

/**
 * Where a YAML line's comment starts (its length when it has none): the first `#` outside a quoted
 * scalar, at the line's start or after whitespace — so `[[Plan#Goals]]`'s `#` is no comment.
 */
function yamlCommentAt(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote === '"') {
      if (c === "\\") i++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'" && line[i + 1] === "'") i++;
      else if (c === "'") quote = null;
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,]/.test(line[i - 1]!)))
      quote = c; // a quoted scalar's start, not `Bob's`
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return i;
  }
  return line.length;
}

/** A note's title from its file's name: what stands in when it has none of its own. */
function fileTitle(rel: string): string {
  return basename(rel).replace(/\.(md|markdown)$/i, "");
}

/** Whether an entry's title is its own (frontmatter, a `#` heading), not its file's name. */
const ownTitle = new WeakMap<NoteEntry, boolean>();

export function extractFromSource(file: NoteFile, text: string, flags: string[] = [], chunks?: ChunkCache): NoteEntry {
  const parsed = parseNoteFile(file.rel, text, chunks);
  const links: LinkRef[] = [];
  const inline: string[] = [];
  const definitions = new Map<string, string>();
  visit(parsed.tree, (n) => {
    if (n.type === "definition") definitions.set((n as Definition).identifier.toLowerCase(), (n as Definition).url);
    else if ((n.type as string) === "hashtag") inline.push((n as unknown as Hashtag).value);
  });
  visit(parsed.tree, (n: Nodes) => {
    const pos = n.position?.start;
    const line = pos?.line ?? 1;
    const column = pos?.column ?? 1;
    const end = n.position?.end ?? { line, column };
    switch (n.type) {
      case "link":
        links.push(mdLink("markdown", n.url, plain(n), line, column, end));
        return;
      case "linkReference": {
        const url = definitions.get(n.identifier.toLowerCase());
        if (url) links.push(mdLink("markdown", url, plain(n), line, column, end));
        return;
      }
      case "image":
        links.push(mdLink("image", n.url, n.alt ?? "", line, column, end));
        return;
    }
    // A wikilink or an embed (21.3): read within the note's root.
    if ((n.type as string) === "wikiLink") {
      const w = n as unknown as WikiLink;
      links.push({
        kind: w.embed ? "embed" : "wiki",
        target: w.target,
        heading: w.heading,
        block: w.block,
        alias: w.alias,
        text: w.alias ?? w.value,
        line,
        column,
        end: { line: end.line, column: end.column },
      });
    }
  });
  // Wikilinks in the front matter's values (Obsidian's properties: `related: "[[Plan]]"`), each where
  // it's written — read, backlinked and renamed as the text's are; not in a comment. First: they come first.
  const fmRaw = parsed.frontmatter?.raw;
  if (fmRaw) links.unshift(...frontmatterLinks(fmRaw));
  const fm = parsed.frontmatter?.data;
  // The frontmatter's first, then the text's, each once (as first written).
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const t of [...normaliseTags(fm?.tags ?? fm?.tag), ...inline]) {
    const name = tagName(t);
    if (name && !seen.has(tagKey(name))) {
      seen.add(tagKey(name));
      tags.push(name);
    }
  }
  const own = noteTitle(parsed, "");
  const entry: NoteEntry = {
    rel: file.rel,
    title: own || fileTitle(file.rel),
    headings: headingsOf(parsed.tree),
    anchors: anchorsOf(parsed.tree),
    links,
    tags,
    aliases: names(fm?.aliases ?? fm?.alias),
    previous: names(fm?.previous_names),
    hash: contentHash(text),
    mtimeMs: file.mtimeMs,
    size: file.size,
    flags,
  };
  ownTitle.set(entry, !!own);
  return entry;
}

function mdLink(kind: LinkKind, url: string, text: string, line: number, column: number, end: Pos): LinkRef {
  return {
    kind,
    target: url,
    heading: null,
    block: null,
    alias: null,
    text,
    line,
    column,
    end: { line: end.line, column: end.column },
  };
}

function plain(n: Nodes): string {
  const parts: string[] = [];
  visit(n, (c) => {
    if (c.type === "text" || c.type === "inlineCode") parts.push(c.value);
    else if (c.type === "inlineMath") parts.push(`$${c.value}$`); // as written (12.11)
  });
  return parts.join("");
}

/** A frontmatter list of names (or one name); anything else is none. */
function names(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return list
    .filter((n): n is string | number => typeof n === "string" || typeof n === "number")
    .map((n) => String(n).trim())
    .filter(Boolean);
}

function normaliseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, ""))
      .filter(Boolean);
  return [];
}
