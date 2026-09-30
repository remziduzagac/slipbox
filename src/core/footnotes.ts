// A note's footnotes (3.17): each one's label, its definition's text and line, and every reference
// to it — for the footnotes view in the right panel and `slipbox footnotes`. Numbered as GFM numbers
// them: in the order they're first referred to, the ones nothing refers to after.

import type { FootnoteDefinition, FootnoteReference, Nodes } from "mdast";
import { type ParsedNote, visit } from "./parse.ts";

export interface Footnote {
  /** As written (`[^Label]`); `id` is its identifier, lower-cased: how references find it. */
  label: string;
  id: string;
  /** The definition's text on one line, or null when there's no definition. */
  text: string | null;
  /** The definition's source line (1-based), or null when there's none. */
  line: number | null;
  /** Each reference, in order: its source line and column (1-based). */
  references: { line: number; column: number }[];
}

/** A definition's text as one line: its words, a wikilink's shown text, a tag with its `#`. */
function plain(node: Nodes): string {
  const parts: string[] = [];
  visit(node, (n) => {
    if ((n.type as string) === "wikiLink") {
      const w = n as unknown as { alias: string | null; value: string };
      parts.push(w.alias ?? w.value);
      return false;
    }
    if ((n.type as string) === "hashtag") {
      parts.push(`#${(n as unknown as { value: string }).value}`);
      return false;
    }
    if (n.type === "text" || n.type === "inlineCode") parts.push(n.value);
    else if (n.type === "break" || n.type === "paragraph") parts.push(" ");
  });
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function footnotesOf(parsed: ParsedNote): Footnote[] {
  const byId = new Map<string, Footnote>();
  const get = (identifier: string, label: string | null | undefined) => {
    const id = identifier.toLowerCase();
    let f = byId.get(id);
    if (!f) {
      f = { label: label ?? identifier, id, text: null, line: null, references: [] };
      byId.set(id, f);
    }
    return f;
  };
  visit(parsed.tree, (n) => {
    const at = n.position?.start;
    if (n.type === "footnoteReference") {
      const r = n as FootnoteReference;
      get(r.identifier, r.label).references.push({ line: at?.line ?? 1, column: at?.column ?? 1 });
    } else if (n.type === "footnoteDefinition") {
      const d = n as FootnoteDefinition;
      const f = get(d.identifier, d.label);
      // The first definition of a label wins (CommonMark), as the renderer's does.
      if (f.line === null) {
        f.line = at?.line ?? 1;
        f.text = plain(d);
        f.label = d.label ?? f.label;
      }
    }
  });
  const first = (f: Footnote) => f.references[0] ?? { line: Number.POSITIVE_INFINITY, column: 0 };
  return [...byId.values()].sort((a, b) => first(a).line - first(b).line || first(a).column - first(b).column || (a.line ?? 0) - (b.line ?? 0));
}
