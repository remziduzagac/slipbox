// Where a link lands in the note it reaches (11.3): a heading's line, an anchor's, a block's (`^id`),
// or a line given as `L42` — what a jump goes to. Null when the note has no such place: its top, then.
//
// One matcher for every place that looks a fragment up (the follow, the hover, the link check, the
// CLI): explicit ids first (`## Setup {#setup}`, `<a id="setup">`); then, for a markdown link, a
// heading's slug as GitHub numbers repeats (`#setup-1` is the second "Setup"), else its text; for a
// wikilink, its text first, as Obsidian reads `[[note#Setup]]`, else its slug; and a path of headings
// (`[[note#Install#Linux]]`), each one inside the one before. Case aside, the Turkish i's folded.

import type { Graph } from "./graph.ts";
import { normKey } from "./links.ts";
import { type AnchorInfo, type HeadingInfo, slugify } from "./parse.ts";

/** A fragment naming lines (GitHub's): `L42`, `L42-L50`, `L42C5-L45C10`. Null when it isn't one. */
export function lineFragment(fragment: string): { line: number; col: number | null; endLine: number | null } | null {
  const m = /^L(\d+)(?:C(\d+))?(?:-L(\d+)(?:C\d+)?)?$/.exec(fragment);
  if (!m) return null;
  return {
    line: Math.max(1, Number(m[1])),
    col: m[2] ? Math.max(1, Number(m[2])) : null,
    endLine: m[3] ? Math.max(1, Number(m[3])) : null,
  };
}

/** Each heading's slug as GitHub numbers repeats, in order: `setup`, `setup-1`, `setup-2`. */
export function githubSlugs(headings: Pick<HeadingInfo, "slug">[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((h) => {
    let slug = h.slug;
    if (seen.has(slug)) {
      let n = seen.get(slug)!;
      do slug = `${h.slug}-${++n}`;
      while (seen.has(slug));
      seen.set(h.slug, n);
    }
    seen.set(slug, seen.get(slug) ?? 0);
    return slug;
  });
}

export interface HeadingLanding {
  /** The line it lands on (1-based). */
  line: number;
  /** The heading it names, by index; null for an HTML anchor. */
  heading: number | null;
  /** The HTML anchor's id, when it's one. */
  anchor?: string;
  /** Several headings have the text it names: the first is taken, and the link check says so. */
  ambiguous: boolean;
}

/** Where a fragment lands among a note's headings and anchors (see the top of this file). */
export function findHeading(
  headings: Pick<HeadingInfo, "text" | "slug" | "depth" | "line" | "id">[],
  anchors: AnchorInfo[],
  fragment: string,
  wiki = false,
): HeadingLanding | null {
  const want = normKey(fragment.trim());
  const slug = normKey(slugify(fragment));
  const at = (i: number, ambiguous = false): HeadingLanding => ({ line: headings[i]!.line, heading: i, ambiguous });
  // An explicit id — a heading's or an HTML anchor's — as written, else case aside.
  const ids = [
    ...headings.flatMap((h, i) => (h.id ? [{ id: h.id, i, line: h.line }] : [])),
    ...anchors.map((a) => ({ id: a.id, i: -1, line: a.line })),
  ];
  const byId = ids.find((x) => x.id === fragment) ?? ids.find((x) => normKey(x.id) === want);
  if (byId) return byId.i >= 0 ? at(byId.i) : { line: byId.line, heading: null, ambiguous: false, anchor: byId.id };
  const numbered = githubSlugs(headings);
  const bySlug = () => {
    const i = numbered.findIndex((s) => normKey(s) === slug);
    return i >= 0 ? at(i) : null;
  };
  const byText = () => {
    const hits = headings.flatMap((h, i) => (normKey(h.text.trim()) === want ? [i] : []));
    return hits.length ? at(hits[0]!, hits.length > 1) : null;
  };
  const found = wiki ? (byText() ?? bySlug()) : (bySlug() ?? byText());
  if (found) return found;
  // A hosting's own forms (hosting.ts): Bitbucket's `#markdown-header-x`, GitHub's `#readme` (the top).
  if (fragment.startsWith("markdown-header-"))
    return findHeading(headings, anchors, fragment.slice("markdown-header-".length), wiki);
  if (want === "readme") return { line: 1, heading: null, ambiguous: false };
  // A path of headings (Obsidian's `Install#Linux`): each found inside the one before.
  const parts = fragment.split("#").filter((x) => x.trim());
  if (parts.length < 2) return null;
  let from = 0;
  let end = headings.length;
  let last: HeadingLanding | null = null;
  for (const part of parts) {
    const scope = headings.slice(from, end);
    const hit = findHeading(scope, [], part, true);
    if (!hit || hit.heading === null) return null;
    const i = from + hit.heading;
    const next = headings.findIndex((h, j) => j > i && h.depth <= headings[i]!.depth);
    from = i + 1;
    end = next < 0 ? headings.length : Math.min(end, next);
    last = { line: headings[i]!.line, heading: i, ambiguous: hit.ambiguous };
  }
  return last;
}

/** The fragment a link writes for a heading (GitHub's): its explicit id, else its slug numbered as GitHub numbers repeats. */
export function headingFragment(headings: Pick<HeadingInfo, "slug" | "id">[], i: number): string {
  return headings[i]!.id ?? githubSlugs(headings)[i]!;
}

/** The line (1-based) a link's `#heading` or `#^block` lands on in `path` (vault-relative, or absolute in another root). */
export function landingLine(
  g: Graph,
  path: string,
  heading: string | null,
  block: string | null,
  wiki = false,
): number | null {
  return landing(g, path, heading, block, wiki)?.line ?? null;
}

/** Where a link's fragment lands in `path`, and whether the heading it names is one of several of that text. */
export function landing(
  g: Graph,
  path: string,
  heading: string | null,
  block: string | null,
  wiki = false,
): HeadingLanding | null {
  if (block) {
    const line = blockLine(g, path, block);
    return line === null ? null : { line, heading: null, ambiguous: false };
  }
  if (!heading) return null;
  const lines = lineFragment(heading);
  if (lines) return { line: lines.line, heading: null, ambiguous: false };
  if (heading.startsWith("^")) return landing(g, path, null, heading.slice(1), wiki);
  const note = g.entryAnywhere(path);
  return note ? findHeading(note.headings, note.anchors ?? [], heading, wiki) : null;
}

/**
 * The lines of a note in fenced code (``` or ~~~, up to three spaces in, closed by the same fence or
 * a longer one): a `^id` there is code, not a block's id.
 */
export function codeLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  let fence: string | null = null;
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, "");
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(l);
    if (fence === null) {
      if (m && !(m[1]![0] === "`" && l.slice(m[0].length).includes("`"))) {
        fence = m[1]!;
        out.add(i);
      }
      return;
    }
    out.add(i);
    if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && !l.slice(m[0].length).trim()) fence = null;
  });
  return out;
}

/** The line a block's `^id` marks, as Obsidian writes it: at the end of the block's last line, or alone after it — never in code. */
export function blockLine(g: Graph, path: string, id: string): number | null {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null;
  const text = g.textOf(path);
  if (text === null) return null;
  return blockIds(text).find((b) => b.id === id)?.line ?? null;
}

/** Every block id a note marks (`^id`), with its line: what `[[note#^` completes. Not in fenced code. */
export function blockIds(text: string): { id: string; line: number }[] {
  const out: { id: string; line: number }[] = [];
  const lines = text.split("\n");
  const code = codeLines(lines);
  lines.forEach((l, i) => {
    if (code.has(i)) return;
    const m = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/.exec(l.replace(/\r$/, ""));
    if (m) out.push({ id: m[1]!, line: i + 1 });
  });
  return out;
}

/** At most this many lines of a note shown where a link lands (a hover's preview). */
export const LANDING_LINES = 20;

/**
 * What a link lands on, as text: a heading's section (up to the next heading as high), a block (its
 * paragraph or item, up to the `^id`), or the note's start without its frontmatter — at most
 * `max` lines, and `…` when there's more. Null when the note can't be read or has no such place.
 */
export function landingText(
  g: Graph,
  path: string,
  heading: string | null,
  block: string | null,
  max = LANDING_LINES,
  wiki = false,
): string | null {
  const text = g.textOf(path);
  if (text === null) return null;
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let from = 0;
  let to = lines.length;
  const id = block ?? (heading?.startsWith("^") ? heading.slice(1) : null);
  if (id) {
    const at = blockLine(g, path, id);
    if (at === null) return null;
    to = at;
    from = at - 1;
    // A `^id` alone on its line marks the block above it.
    if (lines[at - 1]!.trim() === `^${id}`) from = to = at - 1;
    while (from > 0 && lines[from - 1]!.trim() !== "") from--;
    if (lines[at - 1]!.trim() !== `^${id}`) lines[at - 1] = lines[at - 1]!.replace(/\s*\^[A-Za-z0-9-]+\s*$/, "");
  } else if (heading && lineFragment(heading)) {
    // Lines (`L42-L50`): those, from the first.
    const f = lineFragment(heading)!;
    from = f.line - 1;
    to = Math.max(f.line, f.endLine ?? f.line + max - 1);
  } else if (heading) {
    const note = g.entryAnywhere(path);
    const headings = note?.headings ?? [];
    const hit = findHeading(headings, note?.anchors ?? [], heading, wiki);
    if (!hit) return null;
    from = hit.line - 1;
    const next =
      hit.heading === null
        ? headings.find((h) => h.line > hit.line)
        : headings.slice(hit.heading + 1).find((h) => h.depth <= headings[hit.heading!]!.depth);
    if (next) to = next.line - 1;
  } else if (lines[0] === "---") {
    const close = lines.findIndex((l, i) => i > 0 && (l === "---" || l === "..."));
    if (close > 0) from = close + 1;
  }
  const shown = lines.slice(from, to);
  while (shown.length && shown[0]!.trim() === "") shown.shift();
  while (shown.length && shown[shown.length - 1]!.trim() === "") shown.pop();
  if (shown.length > max) return `${shown.slice(0, max).join("\n")}\n…`;
  return shown.join("\n");
}
