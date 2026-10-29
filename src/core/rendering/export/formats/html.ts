// Export as a web page (plan 10.2): one HTML file holding everything — its pictures inside it as data: addresses, its
// diagrams and maths as SVG, its stylesheet — so it can be mailed, opened anywhere, and printed (a chapter a page).
// Nothing in it reaches the network: a picture on the web it has no copy of is a link.

import type { ExportSink } from "../spool.ts";
import { utf8 } from "../encoding.ts";
import type { Element, Root as HastRoot } from "hast";
import { toHtml as serialise } from "hast-util-to-html";
import { loadRasterizer } from "../../media/images/svg.ts";
import type { ExportDoc } from "../assemble.ts";
import { chapterHast } from "./hast.ts";
import { mediaType } from "../assets/images.ts";
import { CSS } from "../assets/style.ts";

const el = (tagName: string, properties: Element["properties"], children: Element["children"] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

/** The document as one HTML file's bytes. */
export async function toHtml(doc: ExportDoc, sink?: ExportSink): Promise<Uint8Array> {
  const r = await loadRasterizer();
  const head = el("head", {}, [
    el("meta", { charSet: "utf-8" }),
    el("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    el("meta", { name: "generator", content: "slipbox" }),
    ...(doc.author ? [el("meta", { name: "author", content: doc.author })] : []),
    ...(doc.date ? [el("meta", { name: "date", content: doc.date })] : []),
    el("title", {}, [{ type: "text", value: doc.title }]),
    el("style", {}, [{ type: "text", value: CSS }]),
  ]);
  const chunks: Uint8Array[] = [];
  const write = sink ?? ((chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
  // Serialize a skeleton to preserve the normal serializer's escaping, then chapters one at a time.
  const shell: HastRoot = {
    type: "root",
    children: [
      { type: "doctype" },
      el("html", doc.lang ? { lang: doc.lang } : {}, [head, el("body", {}, [el("main", {}, [])])]),
    ],
  };
  const marker = "</main></body></html>";
  const start = serialise(shell);
  // The chapters go where the empty main closes: a serializer that ends it otherwise would misplace them.
  if (!start.endsWith(marker)) throw Error("HTML export: unexpected document shell");
  utf8(start.slice(0, -marker.length), write);
  for (const ch of doc.chapters) {
    const section = chapterHast(ch, {
      r,
      src: (data, type) =>
        `data:${mediaType(type)};base64,${Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64")}`,
      href: (anchor) => `#${anchor}`,
    });
    utf8(serialise(section), write);
  }
  utf8(`${marker}\n`, write);
  return sink ? new Uint8Array() : Buffer.concat(chunks);
}
