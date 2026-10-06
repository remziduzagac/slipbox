// A link as slipbox writes one (plan 21.5): in the root's convention (core/convention.ts) — its style,
// its path (relative, from the root, by name) and whether a note keeps its extension. Completion, the
// link picker and `slipbox link` write through here; a rename keeps each link's own form instead.
//
// A name is written only when it reaches the note from where the link is (no other note of that name
// nearer, 21.3); else the path from the root, as Obsidian's "shortest" does. A file outside the root
// is reached by a relative path, its extension kept: the convention is the root's.

import { dirname, isAbsolute, posix, relative, sep } from "node:path";
import type { Convention, LinkStyle } from "./convention.ts";
import { linkText, urlPath } from "./convert.ts";
import type { Graph } from "./graph.ts";

const NOTE_EXT = /\.(md|markdown)$/i;

export interface LinkEnds {
  /** The file the link is written in. */
  fromAbs: string;
  /** What it reaches: its path in the root (null outside it), and whether it's a note. */
  to: { abs: string; rel: string | null; note: boolean };
  /** Whether a wikilink by this name, written in `fromAbs`, reaches `to` (21.3's rules). */
  reachesByName: (name: string) => boolean;
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
  // Out of the root: a relative path, as the file is named.
  if (to.rel === null || isAbsolute(to.rel)) return enc(rel(to.abs));
  // Only a note's extension: a picture keeps its own.
  const bare = (p: string) => (c.extension.value === "dropped" ? p.replace(NOTE_EXT, "") : p);
  if (style === "wiki" && c.path.value === "name") {
    const name = bare(posix.basename(to.rel));
    if (ends.reachesByName(name)) return name;
    return bare(to.rel);
  }
  if (c.path.value === "root") return enc(style === "markdown" ? `/${bare(to.rel)}` : bare(to.rel));
  return enc(bare(rel(to.abs)));
}

/**
 * The whole link: `[text](destination)`, or `[[destination]]` — `[[destination|text]]` when the text
 * isn't what the link shows by itself. An embed (`![[…]]`, `![…](…)`) when asked.
 */
export function writeLink(c: Pick<Convention, "path" | "extension">, style: LinkStyle, ends: LinkEnds, text: string, embed = false): string {
  const dest = linkDestination(c, style, ends);
  const bang = embed ? "!" : "";
  if (style === "markdown") return `${bang}[${linkText(text)}](${dest})`;
  const shown = posix.basename(dest).replace(NOTE_EXT, "");
  return `${bang}[[${dest}${text && text !== dest && text !== shown ? `|${text.replace(/[|\]\n]/g, " ")}` : ""}]]`;
}

/** A link's ends in a graph: `to` in its root when the root's walk has it (a nested root's file isn't). */
export function linkEnds(g: Graph, fromAbs: string, toAbs: string): LinkEnds {
  const inRoot = (abs: string) => {
    const r = relative(g.root, abs).split(sep).join("/");
    return r && !r.startsWith("../") && !isAbsolute(r) && g.known(r) ? r : null;
  };
  const fromRel = inRoot(fromAbs) ?? relative(g.root, fromAbs).split(sep).join("/");
  const rel = inRoot(toAbs);
  return {
    fromAbs,
    to: { abs: toAbs, rel, note: NOTE_EXT.test(toAbs) },
    reachesByName: (name) => {
      const r = g.resolveLink({ kind: NOTE_EXT.test(toAbs) ? "wiki" : "embed", target: name }, fromRel);
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path === rel;
    },
  };
}
