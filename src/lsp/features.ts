// What the LSP face answers (plan 11.3–11.6), each a question to the core about a note as the
// editor has it (11.8). Positions are the protocol's: lines and characters from 0, characters in
// UTF-16 units — the graph's are from 1 in the same units, so they convert by one.

import { isAbsolute, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { type CompletionItem, CompletionItemKind, type CompletionList, type Hover, type Location, type Position, type Range } from "vscode-languageserver";
import type { Graph, LinkRef, Pos, ResolvedLink } from "../core/graph.ts";
import { blockIds, landingLine, landingText } from "../core/landing.ts";
import { slugify } from "../core/parse.ts";

/** The protocol's range for a span of the graph's (lines and columns from 1, the end after its last character). */
export function rangeOf(start: Pos, end: Pos): Range {
  return { start: { line: start.line - 1, character: start.column - 1 }, end: { line: end.line - 1, character: end.column - 1 } };
}

/** A line's start, as a range: where a jump to a note or a heading lands. */
function lineRange(line: number): Range {
  return { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 0 } };
}

/** A file's URI: a vault path, or an absolute one in another root. */
export function uriOf(g: Graph, path: string): string {
  return pathToFileURL(isAbsolute(path) ? path : g.abs(path)).href;
}

/** The link under a position: the one whose span holds it (its last character included, not what follows). */
export function linkAt(g: Graph, rel: string, pos: Position): ResolvedLink | null {
  const entry = g.entry(rel);
  if (!entry) return null;
  const at = { line: pos.line + 1, column: pos.character + 1 };
  const before = (a: Pos, b: Pos) => a.line < b.line || (a.line === b.line && a.column < b.column);
  const l = entry.links.find((x) => !before(at, x) && before(at, x.end));
  return l ? { ...l, ...g.resolveLink(l, rel) } : null;
}

/** A link's `#fragment`: a wikilink's heading, or a markdown link's part after `#` (decoded). */
function fragmentOf(l: Pick<LinkRef, "kind" | "target" | "heading">): string | null {
  if (l.kind === "wiki" || l.kind === "embed") return l.heading;
  const i = l.target.indexOf("#");
  if (i < 0) return null;
  try {
    return decodeURIComponent(l.target.slice(i + 1));
  } catch {
    return l.target.slice(i + 1);
  }
}

/** Where a link goes: its note (or file), at its heading or block; each candidate when it's ambiguous. */
export function definition(g: Graph, rel: string, pos: Position): Location[] {
  const l = linkAt(g, rel, pos);
  if (!l) return [];
  const frag = fragmentOf(l);
  const land = (path: string) => ({ uri: uriOf(g, path), range: lineRange(landingLine(g, path, frag, l.block) ?? 1) });
  switch (l.resolvedKind) {
    case "note":
    case "file":
      return l.path ? [land(l.path)] : [];
    case "anchor":
      // `[[#Heading]]`, `[x](#heading)`: this note's heading.
      return [land(rel)];
    case "ambiguous":
      return l.candidates.map(land);
    default:
      // External and unresolved links go nowhere.
      return [];
  }
}

/**
 * What links here. On a link: what links to where it goes (a heading's links, when it names one);
 * on a heading: the links to that heading; anywhere else: the links to this note. The declaration —
 * the note, or the heading — first when it's asked for.
 */
export function references(g: Graph, rel: string, pos: Position, withDeclaration: boolean): Location[] {
  const l = linkAt(g, rel, pos);
  let target = rel;
  let heading: string | null = null;
  if (l) {
    if (l.resolvedKind === "note" && l.path && !isAbsolute(l.path)) target = l.path;
    else if (l.resolvedKind !== "anchor") return [];
    heading = fragmentOf(l);
  } else {
    // A heading's line: its links. The title (the first heading, at the top level) is the note's.
    const headings = g.entry(rel)?.headings ?? [];
    const h = headings.find((x) => x.line === pos.line + 1);
    heading = h && !(h === headings[0] && h.depth === 1) ? h.text : null;
  }
  const slug = heading === null ? null : slugify(heading);
  const out: Location[] = [];
  if (withDeclaration) out.push({ uri: uriOf(g, target), range: lineRange((heading && landingLine(g, target, heading, null)) || 1) });
  for (const b of g.backlinks(target)) {
    const f = fragmentOf(b);
    if (slug !== null && (f === null || slugify(f) !== slug)) continue;
    out.push({ uri: uriOf(g, b.from), range: rangeOf(b, b.end) });
  }
  // This note's own links to itself (`[[#Heading]]`, `[x](#heading)`) aren't backlinks: they count here.
  if (target === rel && slug !== null) {
    for (const own of g.entry(rel)?.links ?? []) {
      const self = g.resolveLink(own, rel).resolvedKind === "anchor";
      if (self && fragmentOf(own) !== null && slugify(fragmentOf(own)!) === slug) out.push({ uri: uriOf(g, rel), range: rangeOf(own, own.end) });
    }
  }
  return out;
}

/** A path as a hover names it: the vault's own as is, another root's with its vault. */
function shownPath(g: Graph, l: ResolvedLink): string {
  return l.vault ? `${l.vault}: ${l.path}` : l.path!;
}

/** A fence around text that may hold fences itself: longer than any inside. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/^\s*(`{3,})/gm)].map((m) => m[1]!.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}markdown\n${text}\n${fence}`;
}

const VIA = { alias: "an alias", "previous-name": "a previous name", redirect: "a redirect (it moved)" } as const;

/**
 * What a link reaches, under the pointer: the note's path and where it lands — the heading's section,
 * the block, or its start — as the note has it; an ambiguous link's candidates; why one reaches
 * nothing. Off a link, nothing.
 */
export function hover(g: Graph, rel: string, pos: Position): Hover | null {
  const l = linkAt(g, rel, pos);
  if (!l) return null;
  const frag = fragmentOf(l);
  const range = rangeOf(l, l.end);
  const say = (value: string): Hover => ({ contents: { kind: "markdown", value }, range });
  switch (l.resolvedKind) {
    case "note":
    case "anchor": {
      const path = l.resolvedKind === "anchor" ? rel : l.path!;
      const where = l.resolvedKind === "anchor" ? `this note` : `\`${shownPath(g, l)}\``;
      const text = landingText(g, path, frag, l.block);
      const head = [`${where}${frag ? ` › ${l.block ? `^${l.block}` : frag}` : ""}`];
      if (l.via) head.push(`reached by ${VIA[l.via]}`);
      if (text === null) return say(`${head.join(" — ")}\n\n${frag ? "no such heading or block there" : "can't be read"}`);
      return say(`${head.join(" — ")}\n\n${fenced(text)}`);
    }
    case "file":
      return say(`\`${shownPath(g, l)}\` — a file`);
    case "external":
      return say(l.target);
    case "ambiguous":
      return say(`matches ${l.candidates.length} notes:\n\n${l.candidates.map((c) => `- \`${c}\``).join("\n")}`);
    default:
      return say(l.reason ?? `no note named \`${l.target}\` yet`);
  }
}

/** At most this many notes offered at once: typing more asks again (the list is incomplete). */
const COMPLETION_MAX = 100;

const NOTE_EXT = /\.(md|markdown)$/i;

/** How a link from `rel` names a note: its name when that reaches it from here, else its path. */
export function linkName(g: Graph, rel: string, path: string): string {
  const name = posix.basename(path).replace(NOTE_EXT, "");
  const r = g.resolveLink({ kind: "wiki", target: name }, rel);
  return r.resolvedKind === "note" && r.path === path ? name : path.replace(NOTE_EXT, "");
}

/**
 * What can be typed at a position on `line` (its text): after `[[` (or `![[`), a note by name — and
 * by alias, written `name|alias` — or, with `![[`, a file too; after `[[note#`, the note's headings;
 * after `[[note#^`, its blocks; after a `#` that starts a word, the vault's tags. Null elsewhere.
 */
export function completion(g: Graph, rel: string, line: string, pos: Position): CompletionList | null {
  const before = line.slice(0, pos.character);
  const after = line.slice(pos.character);
  const replace = (typed: string): Range => ({ start: { line: pos.line, character: pos.character - typed.length }, end: pos });
  const wiki = /(!?)\[\[([^[\]]*)$/.exec(before);
  if (wiki) {
    const embed = wiki[1] === "!";
    const query = wiki[2]!;
    if (query.includes("|")) return null;
    const close = after.startsWith("]]") || after.startsWith("|") || after.startsWith("#") ? "" : "]]";
    const hash = query.indexOf("#");
    if (hash >= 0) return { isIncomplete: false, items: within(g, rel, query.slice(0, hash), query.slice(hash + 1), replace, close) };
    return notes(g, rel, query, replace(query), close, embed);
  }
  const tag = /(^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(before);
  // `#` alone at a line's start begins a heading, not a tag.
  if (tag && !(tag[1] === "" && tag[2] === "" && before.trim() === "#")) {
    // The tags notes carry, as first written — not the one being typed here, nor a parent no note has.
    g.ensureAll();
    const tags = new Map<string, { tag: string; notes: string[] }>();
    for (const [path, e] of g.notes) {
      for (const t of e.tags) {
        const key = t.toLowerCase();
        const seen = tags.get(key) ?? { tag: t, notes: [] };
        seen.notes.push(path);
        tags.set(key, seen);
      }
    }
    const typing = tags.get(tag[2]!.toLowerCase());
    if (typing?.notes.length === 1 && typing.notes[0] === rel) tags.delete(tag[2]!.toLowerCase());
    const items: CompletionItem[] = [...tags.values()].map((t) => ({
      label: `#${t.tag}`,
      kind: CompletionItemKind.Keyword,
      detail: `${t.notes.length} note${t.notes.length === 1 ? "" : "s"}`,
      filterText: `#${t.tag}`,
      textEdit: { range: replace(`#${tag[2]}`), newText: `#${t.tag}` },
    }));
    return { isIncomplete: false, items };
  }
  return null;
}

/** The notes (with `![[`, the files too) a query's words are all in — by name, title, alias or path. */
function notes(g: Graph, rel: string, query: string, range: Range, close: string, embed: boolean): CompletionList {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (...fields: string[]) => words.every((w) => fields.some((f) => f.toLowerCase().includes(w)));
  // Every note read, so its title and aliases count (the persisted index makes this cheap).
  g.ensureAll();
  const items: CompletionItem[] = [];
  let more = false;
  const add = (item: CompletionItem) => {
    if (items.length >= COMPLETION_MAX) more = true;
    else items.push(item);
  };
  for (const [path, e] of g.notes) {
    const name = linkName(g, rel, path);
    if (has(name, e.title, path)) {
      add({ label: name, kind: CompletionItemKind.File, detail: path, documentation: e.title, filterText: `${name} ${e.title}`, textEdit: { range, newText: `${name}${close}` } });
    }
    for (const alias of e.aliases) {
      if (!has(alias, name, path)) continue;
      add({ label: alias, kind: CompletionItemKind.File, detail: `${path} (alias)`, filterText: alias, textEdit: { range, newText: `${name}|${alias}${close}` } });
    }
  }
  if (embed) {
    for (const path of g.filePaths().sort()) {
      if (has(path)) add({ label: posix.basename(path), kind: CompletionItemKind.File, detail: path, filterText: path, textEdit: { range, newText: `${path}${close}` } });
    }
  }
  return { isIncomplete: more || words.length > 0, items };
}

/** Inside `[[target#…`: the target's headings, or after `#^`, its blocks. */
function within(g: Graph, rel: string, target: string, typed: string, replace: (t: string) => Range, close: string): CompletionItem[] {
  const r = target ? g.resolveLink({ kind: "wiki", target }, rel) : { resolvedKind: "note", path: rel };
  if (r.resolvedKind !== "note" || !r.path) return [];
  const path = r.path;
  if (typed.startsWith("^")) {
    return blockIds(g.textOf(path) ?? "").map((b) => ({
      label: `^${b.id}`,
      kind: CompletionItemKind.Reference,
      detail: `line ${b.line}`,
      documentation: { kind: "markdown", value: fenced(landingText(g, path, null, b.id) ?? "") },
      filterText: `^${b.id}`,
      textEdit: { range: replace(typed), newText: `^${b.id}${close}` },
    }));
  }
  return (g.entryAnywhere(path)?.headings ?? []).filter((h) => h.text.trim()).map((h) => ({
    label: h.text,
    kind: CompletionItemKind.Reference,
    detail: `${"#".repeat(h.depth)} line ${h.line}`,
    filterText: h.text,
    textEdit: { range: replace(typed), newText: `${h.text}${close}` },
  }));
}
