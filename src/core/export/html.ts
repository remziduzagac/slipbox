// Export as a web page (plan 10.2): one HTML file holding everything — its pictures inside it as data: addresses, its
// diagrams and maths as SVG, its stylesheet — so it can be mailed, opened anywhere, and printed (a chapter a page).
// Nothing in it reaches the network: a picture on the web it has no copy of is a link.

import type { Element, Root as HastRoot } from "hast";
import { toHtml as serialise } from "hast-util-to-html";
import { loadRasterizer } from "../svg.ts";
import type { ExportDoc } from "./assemble.ts";
import { chapterHast } from "./hast.ts";
import { mediaType } from "./images.ts";
import { CSS } from "./style.ts";

const el = (tagName: string, properties: Element["properties"], children: Element["children"] = []): Element => ({ type: "element", tagName, properties, children });

/** The document as one HTML file's bytes. */
export async function toHtml(doc: ExportDoc): Promise<Uint8Array> {
  const r = await loadRasterizer();
  const sections = doc.chapters.map((ch) =>
    chapterHast(ch, {
      r,
      src: (data, type) => `data:${mediaType(type)};base64,${Buffer.from(data).toString("base64")}`,
      href: (anchor) => `#${anchor}`,
    }),
  );
  const head = el("head", {}, [
    el("meta", { charSet: "utf-8" }),
    el("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    el("meta", { name: "generator", content: "slipbox" }),
    ...(doc.author ? [el("meta", { name: "author", content: doc.author })] : []),
    ...(doc.date ? [el("meta", { name: "date", content: doc.date })] : []),
    el("title", {}, [{ type: "text", value: doc.title }]),
    el("style", {}, [{ type: "text", value: CSS }]),
  ]);
  const tree: HastRoot = { type: "root", children: [{ type: "doctype" }, el("html", doc.lang ? { lang: doc.lang } : {}, [head, el("body", {}, [el("main", {}, sections)])])] };
  return new TextEncoder().encode(`${serialise(tree)}\n`);
}
