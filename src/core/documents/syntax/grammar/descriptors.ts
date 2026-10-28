// Language selection and embedded-language metadata, independent of parser loading.
import type { Grammar } from "../contracts.ts";

/** The languages a file of a grammar holds besides its own (16.22): parsed with theirs too. */
export const EMBEDS: Partial<Record<Grammar, Grammar[]>> = {
  html: ["javascript", "css"],
  vue: ["typescript", "tsx", "javascript", "css", "scss"],
  svelte: ["typescript", "javascript", "css", "scss"],
  astro: ["typescript", "css", "scss"],
};

/** Grammars whose markup is HTML's: a page's outline is its headings and its ids. */
export const MARKUP = new Set<Grammar>(["html", "vue", "svelte", "astro"]);

/** The format names (`classify`'s) that have a grammar of the same name. */
const BY_FORMAT: Record<string, Grammar> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  bash: "bash",
  lua: "lua",
  go: "go",
  rust: "rust",
  swift: "swift",
  css: "css",
  scss: "scss",
  php: "php",
  dockerfile: "dockerfile",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  ruby: "ruby",
  c: "c",
  cpp: "cpp",
};

/** The grammar for a text file's language (its `classify` format) and extension, if slipbox has one. */
export function grammarFor(format: string, ext: string): Grammar | null {
  if (ext === "tsx") return "tsx";
  // HTML is highlighted as XML is (highlight.js), and parsed as HTML; XML and SVG have no grammar here.
  if (format === "xml") return ext === "html" || ext === "htm" || ext === "xhtml" ? "html" : null;
  return BY_FORMAT[format] ?? null;
}

/** A grammar's highlight.js name, for the lines of a part in its language. */
export const HIGHLIGHT: Partial<Record<Grammar, string>> = {
  tsx: "typescript",
  html: "xml",
  vue: "xml",
  svelte: "xml",
  astro: "xml",
};
