// Parse pipeline (plan 1.3): remark + gfm + frontmatter + wikilinks.
// mdast carries source positions, which is why remark was chosen over marked.

import type { Heading, Nodes, Root, Yaml } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";
import { remarkWikiLink, type WikiLink } from "./wikilink.ts";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkWikiLink as never);

export interface Frontmatter {
  raw: string;
  format: "yaml" | "toml";
  /** Parsed data, or null when it failed to parse (the raw text is still shown). */
  data: Record<string, unknown> | null;
  error: string | null;
}

export interface ParsedNote {
  tree: Root;
  frontmatter: Frontmatter | null;
  source: string;
}

export function parseMarkdown(source: string): ParsedNote {
  const tree = processor.parse(source) as Root;
  let frontmatter: Frontmatter | null = null;
  const first = tree.children[0];
  if (first && (first.type === "yaml" || (first.type as string) === "toml")) {
    const raw = (first as Yaml).value;
    const format = first.type === "yaml" ? "yaml" : "toml";
    let data: Record<string, unknown> | null = null;
    let error: string | null = null;
    if (format === "yaml") {
      try {
        const v = parseYaml(raw);
        data = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
      } catch (err) {
        error = (err as Error).message.split("\n")[0] ?? "invalid YAML";
      }
    }
    frontmatter = { raw, format, data, error };
  }
  return { tree, frontmatter, source };
}

/** Depth-first visit of every node; return false from `fn` to skip a node's children. */
export function visit(node: Nodes, fn: (node: Nodes, parent: Nodes | null) => boolean | void, parent: Nodes | null = null): void {
  if (fn(node, parent) === false) return;
  const children = (node as { children?: Nodes[] }).children;
  if (children) for (const child of children) visit(child, fn, node);
}

export interface HeadingInfo {
  depth: number;
  text: string;
  slug: string;
  /** 1-based source line. */
  line: number;
}

/** GitHub-style slug; also what `[[note#heading]]` compares against. */
export function slugify(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function headingsOf(tree: Root): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  visit(tree, (node) => {
    if (node.type === "heading") {
      const text = headingText(node);
      out.push({ depth: node.depth, text, slug: slugify(text), line: node.position?.start.line ?? 1 });
      return false;
    }
    if (node.type === "code" || node.type === "html") return false;
  });
  return out;
}

export function headingText(node: Heading): string {
  // Wikilinks contribute their visible text.
  const parts: string[] = [];
  visit(node, (n) => {
    if (n.type === "wikiLink") {
      const w = n as WikiLink;
      parts.push(w.alias ?? w.value);
      return false;
    }
    if (n.type === "text" || n.type === "inlineCode") parts.push(n.value);
  });
  return parts.join("") || toString(node);
}

/** Title of a note: frontmatter `title`, else the first H1, else the file name. */
export function noteTitle(parsed: ParsedNote, fileName: string): string {
  const t = parsed.frontmatter?.data?.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  for (const child of parsed.tree.children) {
    if (child.type === "heading" && child.depth === 1) return headingText(child);
  }
  return fileName.replace(/\.(md|markdown)$/i, "");
}
