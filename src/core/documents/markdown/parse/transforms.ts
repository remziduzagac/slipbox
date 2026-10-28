// Post-parse HTML, dollar, quote, heading-ID and position transformations.

import type { Nodes } from "mdast";
import type { Position } from "unist";
import { markCommentEnds } from "../obsidian.ts";

/** What a parsed chunk's nodes get, however it was parsed (here or on another thread, 15.1): quotes, heading ids and
 *  the paragraphs that open or close a comment over blank lines marked from `text`, then the offsets dropped. */
export function finish(nodes: unknown[], text: string): void {
  dollarsAsText(nodes, text);
  markLiteralQuotes(nodes, text);
  markHeadingIds(nodes);
  markCommentEnds(nodes, text);
  dropOffsets(nodes);
}

/** `$…$` read as Obsidian and Pandoc read it (12.11): not maths where the `$`s hold a space just inside them, or a
 * digit follows the closing one — `$5 and $10` is money — so that span is its text again. `$$…$$` in text is maths
 * as written. */
export function dollarsAsText(nodes: unknown[], text: string): void {
  for (const n of nodes) {
    const node = n as { children?: { type: string; position?: Position }[] };
    if (!node.children) continue;
    node.children = node.children.map((c) => {
      const start = c.position?.start.offset;
      const end = c.position?.end.offset;
      if (c.type !== "inlineMath" || start === undefined || end === undefined) return c;
      const raw = text.slice(start, end);
      if (raw.startsWith("$$") || (!/^\$\s|\s\$$/.test(raw) && !/^\d/.test(text.slice(end)))) return c;
      return { type: "text", value: raw, position: c.position };
    });
    dollarsAsText(node.children, text);
  }
}

/** A heading's trailing `{#id …}` (Pandoc's attributes): the id in group 1. */
export const HEADING_ID = /\s*\{#([^\s{}#]+)(?:\s[^{}]*)?\}\s*$/;

/** A heading's trailing `{#id …}` (Pandoc's attributes): its id, kept on the node, the text without it. */
export function markHeadingIds(nodes: unknown[]): void {
  for (const n of nodes) {
    const node = n as Nodes;
    if (node.type === "heading") {
      const last = node.children[node.children.length - 1];
      const m = last?.type === "text" ? HEADING_ID.exec(last.value) : null;
      if (last?.type === "text" && m) {
        last.value = last.value.slice(0, m.index);
        ((node.data ??= {}) as { id?: string }).id = m[1]!;
      }
      continue;
    }
    if ("children" in node) markHeadingIds(node.children);
  }
}

/**
 * A quote whose text starts with an escaped bracket (`> \[!note]`) is marked `literal`: its author
 * wrote the brackets to be read, not a callout. Only the source tells (the escape is gone from the
 * text), so it's marked here, while the offsets are there.
 */
export function markLiteralQuotes(nodes: unknown[], text: string): void {
  for (const n of nodes) {
    const node = n as Nodes;
    if (node.type === "blockquote") {
      const first = node.children[0];
      const lead = first?.type === "paragraph" ? first.children[0] : undefined;
      const at = lead?.position?.start.offset;
      if (lead?.type === "text" && at !== undefined && text[at] === "\\")
        ((node.data ??= {}) as { literal?: boolean }).literal = true;
    }
    if ("children" in node) markLiteralQuotes(node.children, text);
  }
}

/** Positions carry lines and columns only: an offset would go stale when chunks are reused. */
export function dropOffsets(nodes: unknown[]): void {
  for (const n of nodes) {
    const node = n as { position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] };
    if (node.position) {
      delete node.position.start.offset;
      delete node.position.end.offset;
    }
    if (node.children) dropOffsets(node.children);
  }
}
