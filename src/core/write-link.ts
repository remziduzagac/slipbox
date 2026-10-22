// A link as slipbox writes one (plan 21.5): in the root's convention (core/convention.ts) — its style,
// its path (relative, from the root, by name) and whether a note keeps its extension. Completion, the
// link picker and `slipbox link` write through here; a rename keeps each link's own form instead.
//
// A name is written only when it reaches the note from where the link is (no other note of that name
// nearer, 21.3); else the path from the root, as Obsidian's "shortest" does — a top-level note's
// being its name, a relative path (`../plan`) then. A file outside the root is reached by a relative
// path, its extension kept: the convention is the root's.

import { dirname, isAbsolute, posix, relative, sep } from "node:path";
import type { Convention, LinkStyle } from "./convention.ts";
import { linkText, urlPath } from "./convert.ts";
import type { Graph } from "./graph.ts";
import { folderIdentity, pointerNaming, type PointerNaming, pointerWarnings, travelTogether } from "./folders.ts";
import { formatPointer } from "./pointer.ts";
import { findVaultRoot } from "./vault.ts";

const NOTE_EXT = /\.(md|markdown)$/i;

export interface LinkEnds {
  /** The file the link is written in. */
  fromAbs: string;
  /** What it reaches: its path in the root (null outside it), and whether it's a note. */
  to: { abs: string; rel: string | null; note: boolean };
  /** Whether a wikilink by this name, written in `fromAbs`, reaches `to` (21.3's rules). */
  reachesByName: (name: string) => boolean;
  /** Out of the root, in a named folder that doesn't travel with it: the pointer to it (21.7), unencoded. */
  pointer?: string | null;
  /** The pointer's name, and what writing it means: a private name, a name different folders share (D74). */
  naming?: PointerNaming | null;
}

/** What writing these ends' link says (D74, D83): its pointer's private name, or a name different folders share. */
export function linkWarnings(ends: LinkEnds): string[] {
  return ends.pointer && ends.naming ? pointerWarnings(ends.naming) : [];
}

/** The link's target as written — `../plan.md`, `/docs/plan`, `Dal`, `Recipes/Weeknight/Dal` — in `style`. */
export function linkDestination(c: Pick<Convention, "path" | "extension">, style: LinkStyle, ends: LinkEnds): string {
  const { to } = ends;
  const posixPath = (p: string) => p.split(sep).join("/");
  const rel = (p: string) => {
    const r = posixPath(relative(dirname(ends.fromAbs), p));
    return style === "wiki" && !r.startsWith("../") ? `./${r}` : r;
  };
  const enc = (p: string) => (style === "markdown" ? urlPath(p) : p);
  // Out of the root: into a named folder that doesn't travel with this one, its pointer (21.7); else
  // a relative path, as the file is named.
  if (to.rel === null || isAbsolute(to.rel))
    return ends.pointer ? (style === "markdown" ? formatPointerEncoded(ends.pointer) : ends.pointer) : enc(rel(to.abs));
  // Only a note's extension: a picture keeps its own.
  const bare = (p: string) => (c.extension.value === "dropped" ? p.replace(NOTE_EXT, "") : p);
  // A wikilink's path from the root: a top-level note's is its name, read as one (21.3) — where that
  // lands elsewhere, the path from the linking note (`../plan`).
  const fromRoot = () => {
    const dest = bare(to.rel!);
    return dest.includes("/") || ends.reachesByName(dest) ? dest : bare(rel(to.abs));
  };
  if (style === "wiki" && c.path.value === "name") {
    const name = bare(posix.basename(to.rel));
    if (ends.reachesByName(name)) return name;
    return fromRoot();
  }
  if (c.path.value === "root") return style === "markdown" ? enc(`/${bare(to.rel)}`) : fromRoot();
  return enc(bare(rel(to.abs)));
}

/**
 * The whole link: `[text](destination)`, or `[[destination]]` — `[[destination|text]]` when the text
 * isn't what the link shows by itself. An embed (`![[…]]`, `![…](…)`) when asked.
 */
export function writeLink(
  c: Pick<Convention, "path" | "extension">,
  style: LinkStyle,
  ends: LinkEnds,
  text: string,
  embed = false,
): string {
  // A pointer is a URL: a markdown link's, in a wikilink root too (a wikilink reads none, 21.3).
  if (ends.pointer && (ends.to.rel === null || isAbsolute(ends.to.rel))) style = "markdown";
  const dest = linkDestination(c, style, ends);
  const bang = embed ? "!" : "";
  if (style === "markdown")
    return `${bang}[${linkText(text || posix.basename(ends.to.abs).replace(NOTE_EXT, ""))}](${dest})`;
  const shown = posix.basename(dest).replace(NOTE_EXT, "");
  return `${bang}[[${dest}${text && text !== dest && text !== shown ? `|${text.replace(/[|\]\n]/g, " ")}` : ""}]]`;
}

/** A pointer's path encoded as a markdown link's URL is: what would break the link, `%`-encoded. */
function formatPointerEncoded(pointer: string): string {
  const at = pointer.indexOf("/", "slipbox://".length);
  return at < 0 ? pointer : pointer.slice(0, at + 1) + urlPath(pointer.slice(at + 1));
}

/**
 * The pointer to `abs` (21.7) when it's in a named folder (21.6) that doesn't travel with `root`:
 * `slipbox://<name>/<path from its root>` — the name as written for it (qualified on a clash), and what it means.
 */
export function pointerAt(root: string, abs: string): { pointer: string; naming: PointerNaming } | null {
  const there = findVaultRoot(abs);
  if (!there || travelTogether(root, there)) return null;
  const ident = folderIdentity(there);
  if (!ident) return null;
  const naming = pointerNaming(ident);
  return {
    pointer: formatPointer({
      name: naming.name,
      branch: null,
      path: relative(there, abs).split(sep).join("/"),
      fragment: null,
    }),
    naming,
  };
}

/** The pointer to `abs`, as `pointerAt` writes it; null when none is. */
export function pointerTo(root: string, abs: string): string | null {
  return pointerAt(root, abs)?.pointer ?? null;
}

/** A link's ends in a graph: `to` in its root when the root's walk has it (a nested root's file isn't). */
export function linkEnds(g: Graph, fromAbs: string, toAbs: string): LinkEnds {
  const inRoot = (abs: string) => {
    const r = relative(g.root, abs).split(sep).join("/");
    return r && !r.startsWith("../") && !isAbsolute(r) && g.known(r) ? r : null;
  };
  const fromRel = inRoot(fromAbs) ?? relative(g.root, fromAbs).split(sep).join("/");
  const rel = inRoot(toAbs);
  const at = rel === null ? pointerAt(g.root, toAbs) : null;
  return {
    fromAbs,
    pointer: at?.pointer ?? null,
    naming: at?.naming ?? null,
    to: { abs: toAbs, rel, note: NOTE_EXT.test(toAbs) },
    reachesByName: (name) => {
      const r = g.resolveLink({ kind: NOTE_EXT.test(toAbs) ? "wiki" : "embed", target: name }, fromRel);
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path === rel;
    },
  };
}
