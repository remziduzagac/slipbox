// Export as Markdown (plan 10.3): one portable file — what others read without slipbox, on GitHub or in any editor.
// Embeds are drawn in, links inside the document go to the heading ids GitHub gives (the rest are their text, as the
// assembler made them), pictures are copied into a folder beside it, and what Markdown renders itself is kept as written:
// a Mermaid diagram as its code, maths as `$…$` and `$$`, callouts as `> [!kind]`, Obsidian's highlights as `==…==`,
// footnotes renumbered `[^1]`.
// Only pictures are copied, and only the root's: anything else a picture link names stays a link, nothing of it copied.
// Its frontmatter carries the mark that lets a later export replace it, though it's a note.

import { readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, sep } from "node:path";
import type { Blockquote, Code, Heading, Image, Link, Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent } from "mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { mathToMarkdown } from "mdast-util-math";
import { toMarkdown as serialise } from "mdast-util-to-markdown";
import { landsInside } from "../fsutil.ts";
import { slugify } from "../parse.ts";
import { looksLikeSvg } from "../svg.ts";
import type { ExportDoc, ExportPicture } from "./assemble.ts";
import { rasterInfo } from "./images.ts";
import type { ExportOutput } from "./index.ts";

/** The file name an address ends in: `photo.jpg` of `https://x.org/a/photo.jpg?s=2`; "" where there's none. */
function urlName(url: string): string {
  try {
    return basename(decodeURIComponent(new URL(url).pathname));
  } catch {
    return "";
  }
}

/** A value in YAML, quoted as JSON is (a JSON string is a YAML one). */
const yaml = (v: string) => JSON.stringify(v);

/** Whether bytes are a picture's, by what they hold: a raster's header, or an SVG's start. */
function isPicture(data: Uint8Array): boolean {
  return rasterInfo(data) !== null || looksLikeSvg(new TextDecoder().decode(data.subarray(0, 2048)));
}

/** Where a picture link of the export goes: a picture copied, `url`; a link to the file left where it is; or null. */
type Placed = { url: string } | { link: string } | null;

/** The document as Markdown for `target`, its pictures in `<name>.assets/` beside it. */
export async function toMarkdown(doc: ExportDoc, target: string): Promise<ExportOutput> {
  const assets = `${basename(target, extname(target))}.assets`;
  const files: ExportOutput["files"] = [];
  const placed = new Map<string, Placed>();
  const names = new Set<string>();
  /** A file left where it is, linked from the export (the web's by its address); null on another drive: its words. */
  const linkTo = (pic: ExportPicture & { file: string }): Placed => {
    if (pic.url) return { link: pic.url };
    const rel = relative(dirname(target), pic.file);
    return isAbsolute(rel) ? null : { link: rel.split(sep).map(encodeURIComponent).join("/") };
  };
  /**
   * A picture's file copied once into the folder, by its own name — one from the web by its address's — with its kind's
   * extension where it has none, a second of a name numbered: its address. Only a picture, by what the file holds, from
   * inside the root (by where it really is) or the web's cached copy: anything else a link to it, nothing of it copied;
   * one that can't be read, null.
   */
  const copy = (pic: ExportPicture & { file: string }): Placed => {
    const file = pic.file;
    if (placed.has(file)) return placed.get(file)!;
    let out: Placed;
    if (!pic.url && !landsInside(doc.root, file)) out = linkTo(pic);
    else {
      let data: Uint8Array | null = null;
      try {
        data = readFileSync(file);
      } catch {}
      if (!data) out = null;
      else if (!isPicture(data)) out = linkTo(pic);
      else {
        let own = (pic.url ? urlName(pic.url) : basename(file)) || "picture";
        if (!extname(own)) own += `.${rasterInfo(data)?.type ?? "svg"}`;
        const ext = extname(own);
        const stem = basename(own, ext);
        let name = own;
        for (let k = 1; names.has(name.toLowerCase()); k++) name = `${stem}-${k}${ext}`;
        names.add(name.toLowerCase());
        files.push({ path: `${assets}/${name}`, data });
        out = { url: `${assets}/${encodeURIComponent(name)}` };
      }
    }
    placed.set(file, out);
    return out;
  };

  const children: RootContent[] = [];
  for (const ch of doc.chapters) {
    const nodes = structuredClone(ch.nodes);
    const first = nodes[0];
    const titled = first?.type === "heading" && first.depth === 1;
    // The chapter's id on its title: the note's own first heading, else one made of its title.
    if (titled) (first.data ??= {}).chapter = ch.anchor;
    else nodes.unshift({ type: "heading", depth: 1, children: [{ type: "text", value: ch.title }], data: { chapter: ch.anchor } } satisfies Heading);
    children.push(...nodes);
  }
  const root: Root = { type: "root", children };
  const ids = headingIds(root);
  renumberFootnotes(root);
  prepare(root.children, { ids, copy });

  const fm = ["---", `title: ${yaml(doc.title)}`, ...(doc.author ? [`author: ${yaml(doc.author)}`] : []), ...(doc.date ? [`date: ${yaml(doc.date)}`] : []), ...(doc.lang ? [`lang: ${yaml(doc.lang)}`] : []), "generator: slipbox", "---", ""].join("\n");
  const body = serialise(root, {
    bullet: "-",
    emphasis: "*",
    strong: "*",
    fences: true,
    rule: "-",
    listItemIndent: "one",
    extensions: [gfmToMarkdown(), mathToMarkdown()],
    // A callout's marker as written: `[!tip]`, never escaped into text; a highlight as Obsidian writes it.
    handlers: { calloutMarker: (node: { value: string }) => node.value, highlight: highlightMarkdown } as never,
  });
  return { data: new TextEncoder().encode(`${fm}\n${body}`), files };
}

interface Tracker {
  move(value: string): string;
  current(): object;
}

/** Obsidian's `==highlight==`, as written: its text between the marks, read as any text is. */
function highlightMarkdown(node: Parent, _parent: unknown, state: { createTracker(info: unknown): Tracker; containerPhrasing(node: Parent, info: object): string }, info: unknown): string {
  const tracker = state.createTracker(info);
  let value = tracker.move("==");
  value += tracker.move(state.containerPhrasing(node, { ...tracker.current(), before: value, after: "=" }));
  return value + tracker.move("==");
}
// What it starts with, for the text before it.
highlightMarkdown.peek = () => "=";

/**
 * Each heading's id as GitHub gives it, in the order they come — a name used again numbered (`-1`) — by the id the
 * assembler gave it, and each chapter's by the chapter's id.
 */
function headingIds(root: Root): Map<string, string> {
  const ids = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const n of root.children) {
    if (n.type !== "heading") continue;
    const slug = slugify(text(n.children));
    const k = seen.get(slug) ?? 0;
    seen.set(slug, k + 1);
    const id = k ? `${slug}-${k}` : slug;
    const data = n.data as { anchor?: string; chapter?: string } | undefined;
    if (data?.anchor) ids.set(data.anchor, id);
    if (data?.chapter) ids.set(data.chapter, id);
  }
  return ids;
}

const text = (nodes: readonly PhrasingContent[]): string => nodes.map((n) => ("value" in n ? n.value : "children" in n ? text(n.children as PhrasingContent[]) : "")).join("");

/** Footnotes numbered in the order they're first referred to: `[^1]`, not the assembler's long labels. */
function renumberFootnotes(root: Root): void {
  const numbers = new Map<string, string>();
  const visit = (nodes: readonly Nodes[]) => {
    for (const n of nodes) {
      if (n.type === "footnoteReference") {
        if (!numbers.has(n.identifier)) numbers.set(n.identifier, String(numbers.size + 1));
        n.identifier = n.label = numbers.get(n.identifier)!;
      }
      if ("children" in n) visit(n.children as Nodes[]);
    }
  };
  visit(root.children);
  for (const n of root.children) {
    if (n.type !== "footnoteDefinition") continue;
    if (!numbers.has(n.identifier)) numbers.set(n.identifier, String(numbers.size + 1));
    n.identifier = n.label = numbers.get(n.identifier)!;
  }
}

interface Ctx {
  ids: Map<string, string>;
  copy(pic: ExportPicture & { file: string }): Placed;
}

/** The tree made Markdown's, in place. */
function prepare(nodes: Nodes[], c: Ctx): void {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const data = n.data as Record<string, unknown> | undefined;
    if (n.type === "paragraph" && n.children.length === 1 && n.children[0]!.type === "image" && (n.children[0]!.data as { code?: Code } | undefined)?.code) {
      // A diagram: its source, as written.
      nodes[i] = (n.children[0]!.data as { code: Code }).code;
      continue;
    }
    if (n.type === "link") {
      if (n.url.startsWith("#")) n.url = `#${c.ids.get(n.url.slice(1)) ?? n.url.slice(1)}`;
      // A picture on the web this machine has no copy of: a picture again, its viewer fetches it.
      if (data?.remoteImage) {
        nodes[i] = { type: "image", url: n.url, alt: text(n.children) } satisfies Image;
        continue;
      }
    }
    if (n.type === "image") {
      const pic = data?.picture as ExportPicture | undefined;
      const to = pic?.file ? c.copy(pic as ExportPicture & { file: string }) : null;
      if (to && "link" in to) {
        // Not a picture of the root: a link to it, its words or its file's name.
        nodes[i] = { type: "link", url: to.link, children: [{ type: "text", value: n.alt || basename(pic!.file!) }] } satisfies Link;
        continue;
      }
      if (!to) {
        nodes[i] = { type: "emphasis", children: [{ type: "text", value: n.alt || "picture" }] };
        continue;
      }
      n.url = to.url;
      // Obsidian's size kept where Obsidian reads it: `![alt|240](…)`.
      if (pic?.size) n.alt = `${n.alt ?? ""}|${pic.size.width}${pic.size.height ? `x${pic.size.height}` : ""}`;
    }
    if (n.type === "blockquote" && typeof data?.callout === "string") callout(n, data.callout, data.calloutTitled !== false);
    if ("children" in n) prepare(n.children as Nodes[], c);
  }
}

/** A callout as written: `> [!kind] Its title` (none where it was written with none), its text after. */
function callout(n: Blockquote, kind: string, titled: boolean): void {
  const head = n.children[0] as Paragraph | undefined;
  const title = titled && head?.children[0]?.type === "strong" ? head.children[0].children : [];
  const marker = { type: "calloutMarker", value: `[!${kind}]` } as unknown as PhrasingContent;
  n.children[0] = { type: "paragraph", children: [marker, ...(title.length ? [{ type: "text", value: " " } as PhrasingContent, ...title] : [])] };
}
