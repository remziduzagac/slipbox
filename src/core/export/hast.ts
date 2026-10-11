// A chapter as HTML's tree (hast), for the HTML writer (10.2) and the EPUB's (10.6): headings with their ids, links
// inside the document to them, pictures where the writer keeps them (a data: address, a file of the book), maths as
// MathJax's SVG (its Unicode text where it has none), code coloured, callouts in their kind's colour, tasks' boxes,
// Obsidian's highlights marked (`<mark>`), footnotes at the chapter's end. Text is escaped by the serialiser, never written raw.

import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Heading, Nodes, PhrasingContent, RootContent, Text } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { highlight } from "../layout/highlight.ts";
import { mathRows, mathText } from "../math.ts";
import type { Rasterizer } from "../svg.ts";
import type { ExportChapter, ExportPicture } from "./assemble.ts";
import { mathSize, type PictureData, pictureData } from "./images.ts";
import { calloutColour } from "./style.ts";

export interface HastOptions {
  r: Rasterizer | null;
  /** Where a picture is, as an `src`: a data: address (HTML), a file of the book (EPUB). */
  src(data: Uint8Array, type: PictureData["type"]): string;
  /** A link inside the document: the address of the id it goes to. */
  href(anchor: string): string;
}

/** Pictures are at most this wide, in CSS pixels: the page's text. */
export const PAGE_CSS_PX = 736;

/** A chapter as a `<section>`: its title a heading (the note's own first when it opens with one), its blocks, its notes. */
export function chapterHast(ch: ExportChapter, o: HastOptions): Element {
  const nodes = structuredClone(ch.nodes);
  const first = nodes[0];
  const titled = first?.type === "heading" && first.depth === 1;
  const children: RootContent[] = titled ? nodes : [{ type: "heading", depth: 1, children: [{ type: "text", value: ch.title }] } satisfies Heading, ...nodes];
  prepare(children, o);
  const tree = toHast(
    { type: "root", children },
    // Each chapter's footnotes their own ids, its notes at its end.
    { clobberPrefix: `${ch.anchor}-`, footnoteLabel: "Notes", footnoteLabelTagName: "h2", footnoteLabelProperties: { className: ["footnotes-label"] } },
  ) as HastRoot;
  // The notes' heading's id is the same in every chapter, prefix or not: made the chapter's, and what points to it.
  const label = `${ch.anchor}-footnote-label`;
  const relabel = (n: ElementContent) => {
    if (n.type !== "element") return;
    if (n.properties.id === "footnote-label") n.properties.id = label;
    const by = n.properties.ariaDescribedBy;
    if (Array.isArray(by)) n.properties.ariaDescribedBy = by.map((v) => (v === "footnote-label" ? label : v));
    n.children.forEach(relabel);
  };
  (tree.children as ElementContent[]).forEach(relabel);
  return { type: "element", tagName: "section", properties: { id: ch.anchor, className: ["chapter"] }, children: tree.children as ElementContent[] };
}

const img = (src: string, alt: string, props: Record<string, string | number | string[]>): Element => ({ type: "element", tagName: "img", properties: { src, alt, ...props }, children: [] });
const text = (value: string): Text => ({ type: "text", value });

/** The tree made ready for `toHast`, in place: what each node becomes set on its `data`, or the node replaced. */
function prepare(nodes: Nodes[], o: HastOptions): void {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const data = (n.data ??= {}) as Record<string, unknown>;
    const picture = data.picture as ExportPicture | undefined;
    switch (n.type) {
      case "heading":
        if (data.anchor) data.hProperties = { id: data.anchor };
        break;
      case "highlight":
        data.hName = "mark";
        break;
      case "link":
        if (n.url.startsWith("#")) n.url = o.href(n.url.slice(1));
        break;
      case "image": {
        const p = picture ? pictureData(picture, o.r, PAGE_CSS_PX) : null;
        if (!p) {
          // Not a picture here: its words.
          nodes[i] = { type: "emphasis", children: [text(n.alt || "picture")] };
          continue;
        }
        n.url = "";
        data.hName = "img";
        data.hProperties = { src: o.src(p.data, p.type), alt: n.alt ?? "", width: p.shown.width, height: p.shown.height, className: ["picture"] };
        break;
      }
      case "math":
      case "inlineMath": {
        const inline = n.type === "inlineMath";
        const size = picture?.svg ? mathSize(picture.svg) : null;
        data.hName = inline ? "span" : "div";
        data.hProperties = { className: [inline ? "math-inline" : "math-display"] };
        if (picture?.svg && size) {
          const style = `width:${size.width}ex;height:${size.height}ex${size.valign ? `;vertical-align:${size.valign}ex` : ""}`;
          data.hChildren = [img(o.src(new TextEncoder().encode(picture.svg), "svg"), inline ? `$${n.value}$` : n.value, { style })];
        } else if (inline) data.hChildren = [{ type: "element", tagName: "em", properties: {}, children: [text(mathText(n.value) ?? `$${n.value}$`)] }];
        else data.hChildren = [{ type: "element", tagName: "pre", properties: { className: ["math"] }, children: [text((mathRows(n.value) ?? n.value.split("\n")).join("\n"))] }];
        break;
      }
      case "code": {
        // Its syntax coloured, a span a token.
        const tokens = highlight(n.value, n.lang ?? null);
        if (!tokens) break;
        const out: ElementContent[] = [];
        n.value.split("\n").forEach((line, k) => {
          if (k) out.push(text("\n"));
          for (const t of tokens[k]?.length ? tokens[k]! : [{ text: line, role: undefined }]) out.push(t.role ? { type: "element", tagName: "span", properties: { className: [t.role] }, children: [text(t.text)] } : text(t.text));
        });
        data.hChildren = out;
        break;
      }
      case "blockquote": {
        const kind = data.callout as string | undefined;
        if (kind) data.hProperties = { className: ["callout", `callout-${kind}`], style: `border-left-color:${calloutColour(kind)}` };
        break;
      }
      case "listItem":
        // A task's box as its text: one look everywhere, and nothing an e-book's XML would refuse.
        if (typeof n.checked === "boolean") {
          const box = text(n.checked ? "☑ " : "☐ ");
          const lead = n.children[0];
          if (lead?.type === "paragraph") lead.children.unshift(box);
          else n.children.unshift({ type: "paragraph", children: [box] });
          n.checked = null;
          data.hProperties = { className: ["task"] };
        }
        break;
    }
    if ("children" in n) prepare(n.children as Nodes[], o);
  }
}

/** An inline run's text: what a picture's words or a heading's are. */
export function plain(nodes: readonly PhrasingContent[]): string {
  return nodes.map((n) => (n.type === "text" || n.type === "inlineCode" || n.type === "inlineMath" ? n.value : "children" in n ? plain(n.children as PhrasingContent[]) : "")).join("");
}
