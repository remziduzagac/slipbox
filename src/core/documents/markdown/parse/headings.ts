// Anchor, heading, slug and plain-text queries on parsed trees.

import { adaptHtml } from "../html-adapter.ts";
import type { Heading, Nodes, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import type { WikiLink } from "../wikilink.ts";
import type { AnchorInfo, HeadingInfo, ParsedNote } from "./contracts.ts";
import { visit } from "./visit.ts";

/** Every HTML anchor (`<a id="x">`, `<a name="x">`) in a note's text, with its line. */
export function anchorsOf(tree: Root): AnchorInfo[] {
  const out: AnchorInfo[] = [];
  visit(adaptHtml(tree), (node) => {
    if (node.type === "code") return false;
    if (node.data?.html && node.data.id) out.push({ id: node.data.id, line: node.position?.start.line ?? 1 });
  });
  return out;
}

/** GitHub-style slug; also what `[[note#heading]]` compares against. */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFC")
      .toLowerCase()
      .trim()
      // GitHub's: letters, marks (a Devanagari vowel sign, the dot `İ` lowers to), numbers, `_`, `-`.
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
      .replace(/\s/g, "-")
  );
}

export function headingsOf(tree: Root): HeadingInfo[] {
  tree = adaptHtml(tree);
  const out: HeadingInfo[] = [];
  visit(tree, (node) => {
    if (node.type === "heading") {
      const id = (node.data as { id?: string } | undefined)?.id;
      out.push({
        depth: node.depth,
        ...headingLabel(node),
        line: node.position?.start.line ?? 1,
        ...(id ? { id } : {}),
      });
      return false;
    }
    if (node.type === "code" || node.type === "html") return false;
  });
  return out;
}

/**
 * A heading's text and slug, the one derivation the outline, the graph, the render and a link's
 * landing all use: its visible text, trimmed at the ends only (a trailing footnote mark or image
 * leaves a space). White space inside is kept — a footnote mark between two words leaves two
 * spaces, and GitHub's slug keeps their `--` — so whatever draws it folds it, never the stored text.
 */
export function headingLabel(node: Heading): { text: string; slug: string } {
  const text = headingText(node).trim();
  return { text, slug: slugify(text) };
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
    // A tag keeps its `#` (the node holds its name).
    if ((n.type as string) === "hashtag") {
      parts.push(`#${(n as { value: string }).value}`);
      return false;
    }
    if (n.type === "text" || n.type === "inlineCode") parts.push(n.value);
    // Maths as written (12.11): a heading's text — its slug, links to it — is what it was before maths was read.
    else if (n.type === "inlineMath") parts.push(`$${n.value}$`);
  });
  return parts.join("") || toString(node);
}

/** A node's text, as `mdast-util-to-string` gives it — but maths as written, `$…$` (12.11). */
export function plainText(node: Nodes): string {
  if (node.type === "inlineMath") return `$${node.value}$`;
  if ("children" in node) return node.children.map((c) => plainText(c as Nodes)).join("");
  return toString(node);
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
