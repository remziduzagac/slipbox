// What the LSP face answers (plan 11.3–11.6), each a question to the core about a note as the
// editor has it (11.8). Positions are the protocol's: lines and characters from 0, characters in
// UTF-16 units — the graph's are from 1 in the same units, so they convert by one.

import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { Location, Position, Range } from "vscode-languageserver";
import type { Graph, LinkRef, Pos, ResolvedLink } from "../core/graph.ts";
import { landingLine } from "../core/landing.ts";
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
