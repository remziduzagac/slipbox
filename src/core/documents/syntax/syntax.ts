// Source files' structure with tree-sitter (plan 16.7–16.10, 16.18–16.23), each language's grammar
// loaded the first time a file of it opens (16.6, `foundation/platform/lazy.ts`).
//
// highlight.js colours a line well on its own; what a line can't know is that it starts inside a
// string or comment opened lines above. Tree-sitter supplies that (`spans`), and the rest of a
// file's structure: its outline (functions, classes, methods…; a page's headings and ids), its
// syntax errors, and its comments (where links are looked for). Queries run in the parser's own
// code, so asking costs little even for a big file.
//
// A file in several languages (16.22) — a page's `<script>` and `<style>`, a Vue, Svelte or Astro
// component's template, script and style, Astro's frontmatter — has each part parsed with its own
// grammar: its definitions in the outline under the part, its strings, comments, errors and links
// placed where they are in the file, and its lines highlighted in its language (`languages`).

export type {
  Grammar,
  OutlineEntry,
  SyntaxError,
  Span,
  Comment,
  CodeDef,
  CodeDoc,
  CodeComment,
  CodeImports,
  CodeModel,
  CommentLink,
} from "./contracts.ts";
export { GRAMMARS } from "./grammar/assets.ts";
export { grammarFor } from "./grammar/descriptors.ts";
export { grammarNow, grammar } from "./grammar/loader.ts";
export { SyntaxTree, parseSyntax } from "./tree/tree.ts";
export { DOCUMENT_GRAMMARS, codeKind } from "./model/code-model.ts";
export { linkTokens, commentLinks } from "./links/tokens.ts";
