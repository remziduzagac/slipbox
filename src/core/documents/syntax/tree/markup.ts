// Embedded language sections and markup outline entries, using only the supplied syntax nodes.
import type { Node } from "web-tree-sitter";
import type { Grammar, Part, Entry } from "../contracts.ts";
import { EMBEDS } from "../grammar/descriptors.ts";

/** An HTML-like element's attribute, unquoted; null when it hasn't the attribute. */
function attribute(el: Node, name: string): string | null {
  const tag = el.namedChildren.find((n) => n?.type === "start_tag" || n?.type === "self_closing_tag");
  for (const a of tag?.namedChildren ?? []) {
    if (a?.type !== "attribute") continue;
    if (a.namedChildren.find((n) => n?.type === "attribute_name")?.text.toLowerCase() !== name) continue;
    const v = a.namedChildren.find((n) => n?.type === "quoted_attribute_value" || n?.type === "attribute_value");
    return v ? v.text.replace(/^["']|["']$/g, "") : "";
  }
  return null;
}

/** A `<script>`'s language: `lang` (Vue, Svelte), else its `type` (HTML) — JSON's highlighted, not parsed. */
function scriptPart(el: Node, g: Grammar): Pick<Part, "grammar" | "highlight"> {
  const lang = attribute(el, "lang")?.toLowerCase();
  if (lang === "ts" || lang === "typescript") return { grammar: "typescript", highlight: "typescript" };
  if (lang === "tsx") return { grammar: "tsx", highlight: "typescript" };
  const type = attribute(el, "type")?.toLowerCase() ?? "";
  if (/json|importmap/.test(type)) return { grammar: null, highlight: "json" };
  if (type && !/^(module|(text|application)\/(java|ecma)script)$/.test(type)) return { grammar: null, highlight: null };
  // Astro's scripts are TypeScript.
  return g === "astro"
    ? { grammar: "typescript", highlight: "typescript" }
    : { grammar: "javascript", highlight: "javascript" };
}

/** A `<style>`'s language: SCSS by `lang`, else CSS; one slipbox has no grammar for, by name only. */
function stylePart(el: Node): Pick<Part, "grammar" | "highlight"> {
  const lang = attribute(el, "lang")?.toLowerCase() ?? "css";
  if (lang === "scss") return { grammar: "scss", highlight: "scss" };
  if (lang === "css" || lang === "postcss") return { grammar: "css", highlight: "css" };
  return { grammar: null, highlight: lang };
}

/** The element's start tag as it reads (`script setup lang="ts"`): its outline entry's name. */
function tagName(el: Node): string {
  const tag = el.namedChildren.find((n) => n?.type === "start_tag");
  return (tag?.text ?? el.type).replace(/^<|>$/g, "").replace(/\s+/g, " ").trim();
}

/**
 * The parts of a file in other languages than its own: a page's scripts and styles, a component's,
 * Astro's frontmatter; a PHP file's HTML (highlighted as HTML, parsed as PHP has it).
 */
export function partsOf(g: Grammar, root: Node): Part[] {
  if (g === "php")
    return root
      .descendantsOfType("text")
      .filter((n): n is Node => !!n)
      .map((text) => ({ text, section: null, grammar: null, highlight: "xml" }));
  if (!EMBEDS[g]) return [];
  const out: Part[] = [];
  for (const el of root.descendantsOfType(["script_element", "style_element", "frontmatter"])) {
    if (!el) continue;
    const text = el.namedChildren.find((n) => n?.type === "raw_text" || n?.type === "frontmatter_js_block");
    if (!text?.text.trim()) continue;
    if (el.type === "frontmatter")
      out.push({ text, section: { name: "frontmatter", node: el }, grammar: "typescript", highlight: "typescript" });
    else
      out.push({
        text,
        section: { name: tagName(el), node: el },
        ...(el.type === "script_element" ? scriptPart(el, g) : stylePart(el)),
      });
  }
  return out;
}

/** A component's expression in its markup: Vue's `{{ x }}`, Svelte's and Astro's `{x}`. */
const EXPRESSIONS = new Set(["interpolation", "html_interpolation", "expression"]);

/** The text an element shows, its tags left out (a heading's); an expression as it's written. */
function shownText(n: Node): string {
  if (n.type === "text" || n.type === "raw_text" || EXPRESSIONS.has(n.type)) return n.text;
  if (n.type === "start_tag" || n.type === "end_tag" || n.type === "comment") return "";
  return n.children.map((ch) => (ch ? shownText(ch) : "")).join(" ");
}

/** A page's headings (`h1`–`h6`, by their text) and its elements with an id (`#id`), in order. */
export function markupOutline(root: Node): Entry[] {
  const out: Entry[] = [];
  for (const el of root.descendantsOfType("element")) {
    if (!el) continue;
    const name =
      el.namedChildren
        .find((n) => n?.type === "start_tag")
        ?.namedChildren.find((n) => n?.type === "tag_name")
        ?.text.toLowerCase() ?? "";
    const id = attribute(el, "id");
    const heading = /^h[1-6]$/.test(name) ? shownText(el).replace(/\s+/g, " ").trim() : "";
    if (!heading && !id) continue;
    out.push({ name: heading || `#${id}`, kind: heading ? name : "id", start: el.startPosition, end: el.endPosition });
  }
  return out;
}
