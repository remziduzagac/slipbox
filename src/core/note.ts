// Rendering a vault note: parse, resolve its links against the graph, lay it out.
// Shared by `slipbox render` and the TUI so both show exactly the same thing.

import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative } from "node:path";
import type { Heading, ListItem, Paragraph, Root, RootContent } from "mdast";
import { readText } from "./fsutil.ts";
import type { Glyphs } from "./glyphs.ts";
import type { Graph } from "./graph.ts";
import type { Layout, LinkStatus } from "./layout/ir.ts";
import { type RenderCache, type RenderOptions, renderTree } from "./layout/render.ts";
import { headingLabel, headingText, type ParsedNote, parseMarkdown } from "./parse.ts";
import { findHeading } from "./landing.ts";
import { findVaultRoot } from "./vault.ts";

/** Effective inset: the configured value, but never more than ~5% of a narrow pane, and ≥ 1 (2.7). */
export function effectiveInset(paneWidth: number, inset: number): number {
  return Math.max(1, Math.min(inset, Math.floor(paneWidth * 0.05)));
}

export function layoutWidth(paneWidth: number, inset: number, maxWidth = 0): number {
  const w = paneWidth - effectiveInset(paneWidth, inset);
  return Math.max(10, maxWidth > 0 ? Math.min(w, maxWidth) : w);
}

export interface NoteRenderOptions {
  width: number;
  glyphs: Glyphs;
  showUrls: boolean;
}

export function linkResolver(graph: Graph | null, rel: string | null) {
  if (!graph || rel === null) return undefined;
  return (kind: "wiki" | "embed" | "markdown" | "image", target: string): LinkStatus => {
    const r = graph.resolveLink({ kind: kind === "image" ? "image" : kind, target }, rel);
    switch (r.resolvedKind) {
      case "note":
      case "file":
      case "folder":
      case "anchor":
        return "resolved";
      case "external":
        return "external";
      case "ambiguous":
        return "ambiguous";
      default:
        return "unresolved";
    }
  };
}

/** `cache`: the note's blocks from its last render (the TUI's buffers keep one; see renderTree). */
export function layoutNote(parsed: ParsedNote, graph: Graph | null, rel: string | null, opts: NoteRenderOptions, cache?: RenderCache): Layout {
  const embeds = graph && rel !== null ? { embed: embedder(graph, rel), embedFrom: graph.abs(rel) } : {};
  return renderTree(parsed.tree, { ...opts, resolveLink: linkResolver(graph, rel), ...embeds }, parsed.frontmatter, cache);
}

// -------------------------------------------------------------------------------------------
// Embeds (1.11): `![[note]]`, `![[note#Heading]]`, `![[note#^block]]` drawn in place.

const parsedNotes = new Map<string, { mtimeMs: number; size: number; parsed: ParsedNote }>();

/** A note's parse, for embedding it: read again only when the file changed (by mtime and size). */
function parsedAt(abs: string): ParsedNote | null {
  let st: { mtimeMs: number; size: number };
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  const hit = parsedNotes.get(abs);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.parsed;
  let parsed: ParsedNote;
  try {
    parsed = parseMarkdown(readText(abs).text);
  } catch {
    return null;
  }
  if (parsedNotes.size >= 200) parsedNotes.delete(parsedNotes.keys().next().value!);
  parsedNotes.set(abs, { ...st, parsed });
  return parsed;
}

/** A heading's section: it and what follows, up to the next heading as high or higher. */
function sectionOf(tree: Root, heading: string): RootContent[] | null {
  const kids = tree.children;
  // The headings, as a link finds one (landing.ts): by text, slug, id, or a path of them.
  const heads = kids.flatMap((n, i) => (n.type === "heading" ? [{ i, depth: n.depth, ...headingLabel(n), line: i, id: (n.data as { id?: string } | undefined)?.id }] : []));
  const hit = findHeading(heads, [], heading, true);
  if (!hit || hit.heading === null) return null;
  const at = heads[hit.heading]!.i;
  const depth = (kids[at] as Heading).depth;
  const end = kids.findIndex((n, i) => i > at && n.type === "heading" && n.depth <= depth);
  return kids.slice(at, end < 0 ? undefined : end);
}

const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;

/**
 * The block a `^id` marks, as Obsidian writes it: at the end of a paragraph or a list item's text,
 * or alone on the line after a table, a quote or a list (then that block). Its id taken off.
 */
function blockOf(tree: Root, id: string): RootContent[] | null {
  const lastText = (p: Paragraph) => {
    const t = p.children[p.children.length - 1];
    return t?.type === "text" ? t : null;
  };
  const strip = (p: Paragraph): Paragraph => {
    const t = lastText(p)!;
    return { ...p, children: [...p.children.slice(0, -1), { ...t, value: t.value.replace(BLOCK_ID, "") }] };
  };
  const marks = (p: Paragraph) => BLOCK_ID.exec(` ${lastText(p)?.value ?? ""}`)?.[1] === id;
  let found: RootContent[] | null = null;
  const walk = (nodes: RootContent[], inItem: ListItem | null): void => {
    nodes.forEach((n, i) => {
      if (found) return;
      if (n.type === "paragraph" && marks(n)) {
        const only = n.children.length === 1 && lastText(n)!.value.trim() === `^${id}`;
        if (only && i > 0) found = [nodes[i - 1]!];
        else if (inItem) found = [{ type: "list", ordered: false, spread: false, children: [{ ...inItem, children: inItem.children.map((c) => (c === n ? strip(n) : c)) }] }];
        else found = [strip(n)];
        return;
      }
      if (n.type === "list") for (const item of n.children) walk(item.children, item);
      else if (n.type === "blockquote") walk(n.children, null);
    });
  };
  walk(tree.children, null);
  return found;
}

/**
 * What an embed shows, for drawing it in place: the note it reaches (in this vault or another),
 * all of it (no frontmatter), a heading's section or a block — its own links and embeds resolved
 * from where it is. Null for a picture or any file that isn't a note: those stay references.
 */
export function embedder(g: Graph, fromRel: string): RenderOptions["embed"] {
  return (target, heading, block, kind = "embed") => {
    if (!target) return null;
    // A path's (`![…](note.md)`, 20.1) from the note's folder; a wikilink's by its name.
    const r = g.resolveLink({ kind, target }, fromRel);
    if (r.resolvedKind !== "note" || !r.path) return null;
    const abs = isAbsolute(r.path) ? r.path : g.abs(r.path);
    if (!/\.(md|markdown)$/i.test(abs)) return null;
    const parsed = parsedAt(abs);
    if (!parsed) return null;
    const name = basename(abs).replace(/\.(md|markdown)$/i, "");
    // Another vault's: its own graph, from its own root.
    const there = isAbsolute(r.path) ? (g.reach?.graphAt(findVaultRoot(abs) ?? dirname(abs)) ?? null) : g;
    const rel = there ? relative(there.root, abs) : null;
    const nodes = heading ? sectionOf(parsed.tree, heading) : block ? blockOf(parsed.tree, block) : parsed.tree.children.filter((n) => n.type !== "yaml" && (n.type as string) !== "toml");
    // A heading named by its slug (a path's fragment) is titled as it's written.
    const shown = heading && nodes?.[0]?.type === "heading" ? headingText(nodes[0]) : heading;
    return {
      path: abs,
      title: heading ? `${name} › ${shown}` : block ? `${name} ^${block}` : name,
      nodes,
      ...(nodes ? {} : { missing: heading ? `no heading "${heading}" in ${name}` : `no block ^${block} in ${name}` }),
      resolveLink: there && rel ? linkResolver(there, rel) : undefined,
      embed: there && rel ? embedder(there, rel) : undefined,
      ...(isAbsolute(r.path) ? {} : { from: r.path }),
    };
  };
}
