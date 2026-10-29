// Link fragment, heading and data-pointer anchors below command composition.

import type { App } from "../../../app/runtime/app.ts";
import { type Anchor, TOP } from "../../../../core/workspace/session/position.ts";
import { isAbsolute } from "node:path";
import { lineFragment, blockLine, findHeading } from "../../../../core/workspace/links/landing.ts";

/** A line fragment (GitHub's `L42`, `L42-L50`, `L42C5-L45C10`; a code comment's `path:42`, 16.10): its first line. */
export function lineAnchor(fragment: string): Anchor | undefined {
  const f = lineFragment(fragment);
  return f ? { heading: null, headingIndex: 0, offset: 0, line: f.line } : undefined;
}

/**
 * Where a link's fragment lands in a note, as an anchor: its lines (`L42`), its block (`^id`, the line it
 * marks, 21.3), else a heading (`headingAnchor`). One that lands nowhere opens the note at its top, and
 * what isn't there is said, a heading or a block alike (design/links.md § Where a link lands).
 */
export function fragmentAnchor(a: App, path: string, fragment: string, wiki = false): Anchor {
  const lines = lineAnchor(fragment);
  if (lines) return lines;
  if (!fragment.startsWith("^")) return headingAnchor(a, path, fragment, wiki);
  const line = blockLine(a.graph, path, fragment.slice(1));
  if (line !== null) return { ...TOP, line };
  a.message("warn", `no block ${fragment} in ${shownAt(a, path)}: opened at its top`);
  return { ...TOP };
}

/** Text as Markdown reads it back, its punctuation escaped: a heading's `*` or a path's `_` never formatting. */
export function markdownText(s: string): string {
  return s.replace(/[!-/:-@[-`{-~]/g, "\\$&");
}

/** A note's path as a message gives it (21.9): from this root, else from home, else absolute. */
export function shownAt(a: App, path: string): string {
  return isAbsolute(path) ? a.graph.shownPath(path) : path;
}

/** Where a heading lands in a note (landing.ts: an id, a heading by slug or text, a path of headings), as an anchor; nowhere, the note's top, said. */
export function headingAnchor(a: App, path: string, heading: string, wiki = false): Anchor {
  // A note of another vault too (17.10): its heading is found in that vault's index.
  const note = a.graph.entryAnywhere(path);
  const hit = note ? findHeading(note.headings, note.anchors ?? [], heading, wiki) : null;
  if (!hit) {
    a.message("warn", `no heading "${heading}" in ${shownAt(a, path)}: opened at its top`);
    return { ...TOP };
  }
  if (hit.ambiguous) a.message("info", `${path} has several headings "${heading}": the first`);
  if (hit.heading === null) return { heading: null, headingIndex: 0, offset: 0, line: hit.line };
  const h = note!.headings[hit.heading]!;
  const idx = note!.headings.filter((x) => x.slug === h.slug && x.line < h.line).length;
  return { heading: h.slug, headingIndex: idx, offset: 0, line: h.line };
}

/**
 * A JSON pointer (`#/components/schemas/Frame`, a `$ref`'s) as a heading: each segment the next
 * level's key under the one before, in a data file's tree (16.12). A list index counts from 0,
 * the tree's item rows from 1.
 */
export function pointerHeading(headings: { level: number; text: string }[], pointer: string): number {
  const segs = pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let at = -1;
  let level = 0;
  for (const seg of segs) {
    const want = [seg, ...(/^\d+$/.test(seg) ? [String(Number(seg) + 1)] : [])];
    let found = -1;
    for (let i = at + 1; i < headings.length; i++) {
      const h = headings[i]!;
      if (h.level <= level) break; // out of the parent's rows
      if (h.level === level + 1 && want.includes(h.text)) {
        found = i;
        break;
      }
    }
    if (found < 0) return -1;
    at = found;
    level++;
  }
  return at;
}
