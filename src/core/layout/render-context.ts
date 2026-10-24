// What a render carries as it goes (2.1): its options, the links and headings found so far, how deep the block is,
// the notes it embedded; and the small parts every kind of block uses — a node's source line, a link added and its
// status, a node's plain text, spans broken at a width.

import type { Nodes, Parents } from "mdast";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth } from "../width.ts";
import type { Hashtag } from "../tags.ts";
import type { WikiLink } from "../wikilink.ts";
import type { LayoutHeading, LayoutLink, LinkStatus, Span } from "./ir.ts";
import type { RenderOptions } from "./render.ts";

export interface Ctx {
  opts: RenderOptions;
  links: LayoutLink[];
  headings: Omit<LayoutHeading, "line">[];
  definitions: Map<string, string>;
  /** How many containers (quotes, lists, footnotes) deep the block being rendered is. */
  nesting: number;
  /** The notes being drawn, the outermost first: an embed of one of them is a loop (1.11). */
  embedChain: string[];
  /** Every note embedded so far, nested ones too. */
  embedded: Set<string>;
  /** What its blocks waited for, a module still loading (16.6): a block that did is never kept. */
  pending: Set<string>;
  /** Whether its blocks asked for a picture (PIC): such a block is kept with what its pictures were sized for. */
  asks: { picture: boolean };
  /** Inside an embed: its links are at the embed's line, and resolved from the embedded note. */
  linkSrc?: number;
  linkFrom?: string;
}

export interface Style {
  role: Role;
  attrs: number;
}

export const TEXT: Style = { role: "text", attrs: 0 };

export function srcOf(n: Nodes): number {
  return n.position?.start.line ?? 1;
}

/** Break spans into rows of at most `width` columns, by grapheme, keeping styles. */
export function breakHard(spans: Span[], width: number): Span[][] {
  const rows: Span[][] = [[]];
  let w = 0;
  for (const span of spans) {
    let cur = "";
    for (const g of graphemes(span.text)) {
      const gw = graphemeWidth(g);
      if (w + gw > width && w > 0) {
        if (cur) rows[rows.length - 1]!.push({ ...span, text: cur });
        rows.push([]);
        cur = "";
        w = 0;
      }
      cur += g;
      w += gw;
    }
    if (cur) rows[rows.length - 1]!.push({ ...span, text: cur });
  }
  return rows;
}

export function status(ctx: Ctx, kind: "wiki" | "embed" | "markdown" | "image", target: string): LinkStatus {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && kind !== "wiki" && kind !== "embed") return "external";
  return ctx.opts.resolveLink ? ctx.opts.resolveLink(kind, target) : "unknown";
}

export function addLink(ctx: Ctx, l: Omit<LayoutLink, "line" | "col">): number {
  // Inside an embed: at the embed's line in the note shown, followed from the embedded note.
  const inEmbed =
    ctx.linkSrc !== undefined ? { src: ctx.linkSrc, ...(ctx.linkFrom ? { from: ctx.linkFrom } : {}) } : {};
  return ctx.links.push({ ...l, ...inEmbed, line: -1, col: 0 }) - 1;
}

export function textOf(n: Nodes): string {
  if ((n.type as string) === "hashtag") return `#${(n as unknown as Hashtag).value}`;
  if ("value" in n && typeof n.value === "string") return n.value;
  if ((n.type as string) === "wikiLink") return (n as unknown as WikiLink).alias ?? (n as unknown as WikiLink).value;
  const ch = (n as Parents).children;
  return ch ? ch.map((c) => textOf(c)).join("") : "";
}
