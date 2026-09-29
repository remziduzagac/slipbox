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

/**
 * Inputs the markdown parser takes quadratic time over, made harmless without moving a single
 * offset (positions are what editing uses) and without changing what an ordinary note means:
 *
 * - a run of 64+ `*` `_` `[` `]` on a line that has other text too (`***…x***…`) becomes as many
 *   look-alikes — a line that is only rule characters (a rule, a setext underline) is left alone;
 * - a container prefix of 20+ real quote or list markers (`> - > - …`), or 96+ columns of
 *   indentation before a list marker: one no-break space where the cap falls ends the containers.
 *
 * Code blocks and frontmatter are never touched. Only the rendered view sees a difference, and only
 * in notes built to be pathological; source mode shows the file's own text.
 */
function tame(source: string): string {
  if (!/([*_[\]])\1{63}/.test(source) && !/^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}|^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/m.test(source)) return source;
  const like: Record<string, string> = { "*": "∗", _: "‗", "[": "［", "]": "］" };
  const lines = source.split("\n");
  let fence: string | null = null;
  let front = lines[0] === "---";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (front) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) front = false;
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    let out = line;
    if (/([*_[\]])\1{63}/.test(out) && !/^\s*[-*_=\s]+$/.test(out)) out = out.replace(/([*_[\]])\1{63,}/g, (run) => like[run[0]!]!.repeat(run.length));
    const deep = /^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}/.exec(out) ?? /^[ \t]{96}/.exec(/^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/.test(out) ? out : "");
    // One no-break space where the cap falls ends the containers there: what follows is text (its
    // spaces still wrap), not 5,000 more levels.
    if (deep && deep[0].length < out.length) out = `${out.slice(0, deep[0].length)}\u00a0${out.slice(deep[0].length + 1)}`;
    lines[i] = out;
  }
  return lines.join("\n");
}

/** Frontmatter bigger than this isn't parsed as YAML: it shows as raw text (a size bomb otherwise). */
const MAX_YAML = 64 * 1024;

export function parseMarkdown(source: string): ParsedNote {
  const tree = processor.parse(tame(source)) as Root;
  let frontmatter: Frontmatter | null = null;
  const first = tree.children[0];
  if (first && (first.type === "yaml" || (first.type as string) === "toml")) {
    const raw = (first as Yaml).value;
    const format = first.type === "yaml" ? "yaml" : "toml";
    let data: Record<string, unknown> | null = null;
    let error: string | null = null;
    if (format === "yaml" && raw.length > MAX_YAML) error = `frontmatter over ${MAX_YAML / 1024} KB: shown as text, not parsed`;
    else if (format === "yaml") {
      try {
        // Warnings stay off stderr (an error still fails); no duplicate-key check, which is
        // quadratic in the number of keys.
        const v = parseYaml(raw, { logLevel: "error", uniqueKeys: false });
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
