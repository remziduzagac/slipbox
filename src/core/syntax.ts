// Source files' structure with tree-sitter (plan 16.7–16.10, 16.18–16.23), each language's grammar
// loaded the first time a file of it opens (16.6, `lazy.ts`).
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

import { Language, type Node, Parser, Query, type Tree } from "web-tree-sitter";
import runtime from "web-tree-sitter/tree-sitter.wasm" with { type: "file" };
// Each language's own package, its wasm built for this runtime's ABI (a mismatched build can trip
// an assertion in a grammar's scanner: bash's heredocs did). Install scripts stay off
// (`bunfig.toml`): only the wasm is used, never the native bindings.
import lua from "@tree-sitter-grammars/tree-sitter-lua/tree-sitter-lua.wasm" with { type: "file" };
import svelte from "@tree-sitter-grammars/tree-sitter-svelte/tree-sitter-svelte.wasm" with { type: "file" };
import bash from "tree-sitter-bash/tree-sitter-bash.wasm" with { type: "file" };
import c from "tree-sitter-c/tree-sitter-c.wasm" with { type: "file" };
import cpp from "tree-sitter-cpp/tree-sitter-cpp.wasm" with { type: "file" };
import css from "tree-sitter-css/tree-sitter-css.wasm" with { type: "file" };
import go from "tree-sitter-go/tree-sitter-go.wasm" with { type: "file" };
import html from "tree-sitter-html/tree-sitter-html.wasm" with { type: "file" };
import javascript from "tree-sitter-javascript/tree-sitter-javascript.wasm" with { type: "file" };
import php from "tree-sitter-php/tree-sitter-php.wasm" with { type: "file" };
import python from "tree-sitter-python/tree-sitter-python.wasm" with { type: "file" };
import ruby from "tree-sitter-ruby/tree-sitter-ruby.wasm" with { type: "file" };
import rust from "tree-sitter-rust/tree-sitter-rust.wasm" with { type: "file" };
import tsx from "tree-sitter-typescript/tree-sitter-tsx.wasm" with { type: "file" };
import typescript from "tree-sitter-typescript/tree-sitter-typescript.wasm" with { type: "file" };
// Those npm ships no wasm for: built from their sources (grammars/README.md, scripts/build-grammars.ts).
import astro from "../../grammars/tree-sitter-astro.wasm" with { type: "file" };
import dockerfile from "../../grammars/tree-sitter-dockerfile.wasm" with { type: "file" };
import scss from "../../grammars/tree-sitter-scss.wasm" with { type: "file" };
import swift from "../../grammars/tree-sitter-swift.wasm" with { type: "file" };
import vue from "../../grammars/tree-sitter-vue.wasm" with { type: "file" };
import { lazy, load, loadError } from "./lazy.ts";

export type Grammar =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "bash"
  | "lua"
  | "go"
  | "rust"
  | "swift"
  | "html"
  | "css"
  | "scss"
  | "php"
  | "dockerfile"
  | "vue"
  | "svelte"
  | "astro"
  | "ruby"
  | "c"
  | "cpp";

const WASM: Record<Grammar, string> = { typescript, tsx, javascript, python, bash, lua, go, rust, swift, html, css, scss, php, dockerfile, vue, svelte, astro, ruby, c, cpp };

/** Every grammar slipbox parses code with (16.8): what the reference set must have a file of each for. */
export const GRAMMARS = Object.keys(WASM) as Grammar[];

/** The languages a file of a grammar holds besides its own (16.22): parsed with theirs too. */
const EMBEDS: Partial<Record<Grammar, Grammar[]>> = {
  html: ["javascript", "css"],
  vue: ["typescript", "tsx", "javascript", "css", "scss"],
  svelte: ["typescript", "javascript", "css", "scss"],
  astro: ["typescript", "css", "scss"],
};

/** Grammars whose markup is HTML's: a page's outline is its headings and its ids. */
const MARKUP = new Set<Grammar>(["html", "vue", "svelte", "astro"]);

const TS_DEFS = `
(function_declaration name: (_) @name) @def
(generator_function_declaration name: (_) @name) @def
(class_declaration name: (_) @name) @def
(abstract_class_declaration name: (_) @name) @def
(method_definition name: (_) @name) @def
(interface_declaration name: (_) @name) @def
(type_alias_declaration name: (_) @name) @def
(enum_declaration name: (_) @name) @def
(variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)]) @def`;

const JS_DEFS = `
(function_declaration name: (_) @name) @def
(generator_function_declaration name: (_) @name) @def
(class_declaration name: (_) @name) @def
(method_definition name: (_) @name) @def
(variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)]) @def`;

const CSS_DEFS = `
(rule_set (selectors) @name) @def
(media_statement) @def
(supports_statement) @def
(keyframes_statement (keyframes_name) @name) @def`;

/** C's definitions; C++ has them too. A function's name sits under its declarator, maybe a pointer's. */
const C_DEFS = `
(function_definition declarator: (function_declarator declarator: (_) @name)) @def
(function_definition declarator: (pointer_declarator declarator: (function_declarator declarator: (_) @name))) @def
(struct_specifier name: (_) @name body: (_)) @def
(union_specifier name: (_) @name body: (_)) @def
(enum_specifier name: (_) @name body: (_)) @def
(type_definition declarator: (type_identifier) @name) @def
(declaration declarator: (function_declarator declarator: (_) @name)) @def
(declaration declarator: (pointer_declarator declarator: (function_declarator declarator: (_) @name))) @def`;

/** What a page's markup has that's said apart: its comments, and attribute values (which may span lines). */
const MARKUP_QUERIES = { defs: "", comments: "(comment) @c", strings: "(quoted_attribute_value) @s" };

/** Per grammar: definitions (for the outline), comments, and strings (which may span lines). */
const QUERIES: Record<Grammar, { defs: string; comments: string; strings: string }> = {
  typescript: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  tsx: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  javascript: { defs: JS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  python: { defs: "(function_definition name: (identifier) @name) @def (class_definition name: (identifier) @name) @def", comments: "(comment) @c", strings: "(string) @s" },
  bash: { defs: "(function_definition name: (word) @name) @def", comments: "(comment) @c", strings: "[(string) (raw_string) (heredoc_body)] @s" },
  lua: { defs: "(function_declaration name: (_) @name) @def", comments: "(comment) @c", strings: "(string) @s" },
  go: {
    defs: "(function_declaration name: (identifier) @name) @def (method_declaration name: (field_identifier) @name) @def (type_spec name: (type_identifier) @name) @def",
    comments: "(comment) @c",
    strings: "[(raw_string_literal) (interpreted_string_literal)] @s",
  },
  rust: {
    defs: "(function_item name: (identifier) @name) @def (struct_item name: (type_identifier) @name) @def (enum_item name: (type_identifier) @name) @def (trait_item name: (type_identifier) @name) @def (impl_item type: (_) @name) @def (mod_item name: (identifier) @name) @def",
    comments: "[(line_comment) (block_comment)] @c",
    strings: "[(string_literal) (raw_string_literal)] @s",
  },
  swift: {
    defs: `
(class_declaration name: [(type_identifier) (user_type)] @name) @def
(protocol_declaration name: (type_identifier) @name) @def
(function_declaration name: (simple_identifier) @name) @def
(protocol_function_declaration name: (simple_identifier) @name) @def
(init_declaration) @def
(typealias_declaration name: (type_identifier) @name) @def`,
    comments: "[(comment) (multiline_comment)] @c",
    strings: "[(line_string_literal) (multi_line_string_literal) (raw_string_literal)] @s",
  },
  html: MARKUP_QUERIES,
  vue: MARKUP_QUERIES,
  svelte: MARKUP_QUERIES,
  astro: MARKUP_QUERIES,
  css: { defs: CSS_DEFS, comments: "[(comment) (js_comment)] @c", strings: "(string_value) @s" },
  scss: {
    defs: `${CSS_DEFS}
(mixin_statement (name) @name) @def
(function_statement (name) @name) @def`,
    comments: "[(comment) (single_line_comment)] @c",
    strings: "(string_value) @s",
  },
  php: {
    defs: `
(function_definition name: (name) @name) @def
(class_declaration name: (name) @name) @def
(method_declaration name: (name) @name) @def
(interface_declaration name: (name) @name) @def
(trait_declaration name: (name) @name) @def
(enum_declaration name: (name) @name) @def`,
    comments: "(comment) @c",
    strings: "[(string) (encapsed_string) (heredoc) (nowdoc)] @s",
  },
  // A Dockerfile's outline is its stages: each FROM, by its name when it has one.
  dockerfile: { defs: "(from_instruction (image_spec) @name) @def", comments: "(comment) @c", strings: "[(double_quoted_string) (single_quoted_string) (heredoc_block)] @s" },
  ruby: {
    defs: "(class name: (_) @name) @def (module name: (_) @name) @def (method name: (_) @name) @def (singleton_method name: (_) @name) @def",
    comments: "(comment) @c",
    strings: "[(string) (heredoc_body)] @s",
  },
  c: { defs: C_DEFS, comments: "(comment) @c", strings: "[(string_literal) (char_literal)] @s" },
  cpp: {
    defs: `${C_DEFS}
(function_definition declarator: (reference_declarator (function_declarator declarator: (_) @name))) @def
(class_specifier name: (_) @name body: (_)) @def
(namespace_definition name: (_) @name) @def
(field_declaration declarator: (function_declarator declarator: (_) @name)) @def`,
    comments: "(comment) @c",
    strings: "[(string_literal) (char_literal) (raw_string_literal)] @s",
  },
};

/** What an outline entry is, by its definition node's type. */
const KIND: Record<string, string> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  function_definition: "function",
  function_item: "function",
  variable_declarator: "function",
  protocol_function_declaration: "function",
  init_declaration: "init",
  class_declaration: "class",
  abstract_class_declaration: "class",
  class_definition: "class",
  class_specifier: "class",
  class: "class",
  method_definition: "method",
  method_declaration: "method",
  method: "method",
  singleton_method: "method",
  field_declaration: "method",
  declaration: "function",
  interface_declaration: "interface",
  protocol_declaration: "protocol",
  trait_declaration: "trait",
  type_alias_declaration: "type",
  typealias_declaration: "type",
  type_spec: "type",
  type_definition: "type",
  enum_declaration: "enum",
  enum_item: "enum",
  enum_specifier: "enum",
  struct_item: "struct",
  struct_specifier: "struct",
  union_specifier: "union",
  trait_item: "trait",
  impl_item: "impl",
  mod_item: "module",
  module: "module",
  namespace_definition: "namespace",
  rule_set: "rule",
  media_statement: "media",
  supports_statement: "supports",
  keyframes_statement: "keyframes",
  mixin_statement: "mixin",
  function_statement: "function",
  from_instruction: "stage",
};

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
const HIGHLIGHT: Partial<Record<Grammar, string>> = { tsx: "typescript", html: "xml", vue: "xml", svelte: "xml", astro: "xml" };

interface Loaded {
  grammar: Grammar;
  parser: Parser;
  language: Language;
  defs: Query | null;
  comments: Query;
  strings: Query;
}

let runtimeReady: Promise<void> | null = null;

async function loadGrammar(g: Grammar): Promise<Loaded> {
  runtimeReady ??= Parser.init({ locateFile: () => runtime });
  await runtimeReady;
  const language = await Language.load(WASM[g]);
  const parser = new Parser();
  parser.setLanguage(language);
  const q = QUERIES[g];
  return { grammar: g, parser, language, defs: q.defs.trim() ? new Query(language, q.defs) : null, comments: new Query(language, q.comments), strings: new Query(language, q.strings) };
}

const key = (g: Grammar) => `grammar:${g}`;

/**
 * A grammar if it's loaded, with those of the languages its files embed (16.22); else their loading
 * starts (once) and this is null until they land. An embedded one that fails to load is left out.
 */
export function grammarNow(g: Grammar): Loaded | null {
  const own = lazy(key(g), () => loadGrammar(g));
  let ready = own !== null;
  for (const e of EMBEDS[g] ?? []) if (!lazy(key(e), () => loadGrammar(e)) && !loadError(key(e))) ready = false;
  return ready ? own : null;
}

/** A grammar, and those its files embed, waited for (the CLI). */
export async function grammar(g: Grammar): Promise<Loaded | null> {
  const [own] = await Promise.all([load(key(g), () => loadGrammar(g)), ...(EMBEDS[g] ?? []).map((e) => load(key(e), () => loadGrammar(e)))]);
  return own;
}

export interface OutlineEntry {
  name: string;
  kind: string;
  /** 1-based source line. */
  line: number;
  depth: number;
}

export interface SyntaxError {
  /** 1-based line; 0-based UTF-16 columns within it (end on the same line). */
  line: number;
  from: number;
  to: number;
  message: string;
}

export interface Span {
  /** 1-based line; UTF-16 columns in that line, `to` exclusive (past the end: to the line's end). */
  line: number;
  from: number;
  to: number;
  kind: "string" | "comment";
}

export interface Comment {
  line: number;
  column: number;
  text: string;
}

/** A position: 0-based row, UTF-16 column. */
interface Pos {
  row: number;
  column: number;
}

/** An outline entry before its depth is known: where it starts and ends. */
interface Entry {
  name: string;
  kind: string;
  start: Pos;
  end: Pos;
}

const before = (a: Pos, b: Pos) => a.row < b.row || (a.row === b.row && a.column < b.column);

/** A part of a file in another language (16.22): its text's node, its grammar, its highlighting. */
interface Part {
  /** The node holding its text (a `<script>`'s raw text, Astro's frontmatter). */
  text: Node;
  /** The element it's in, an outline entry of its own; null: none (a PHP file's HTML). */
  section: { name: string; node: Node } | null;
  grammar: Grammar | null;
  /** highlight.js's name for its lines; null: the file's own. */
  highlight: string | null;
}

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
  return g === "astro" ? { grammar: "typescript", highlight: "typescript" } : { grammar: "javascript", highlight: "javascript" };
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
function partsOf(g: Grammar, root: Node): Part[] {
  if (g === "php") return root.descendantsOfType("text").filter((n): n is Node => !!n).map((text) => ({ text, section: null, grammar: null, highlight: "xml" }));
  if (!EMBEDS[g]) return [];
  const out: Part[] = [];
  for (const el of root.descendantsOfType(["script_element", "style_element", "frontmatter"])) {
    if (!el) continue;
    const text = el.namedChildren.find((n) => n?.type === "raw_text" || n?.type === "frontmatter_js_block");
    if (!text || !text.text.trim()) continue;
    if (el.type === "frontmatter") out.push({ text, section: { name: "frontmatter", node: el }, grammar: "typescript", highlight: "typescript" });
    else out.push({ text, section: { name: tagName(el), node: el }, ...(el.type === "script_element" ? scriptPart(el, g) : stylePart(el)) });
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
function markupOutline(root: Node): Entry[] {
  const out: Entry[] = [];
  for (const el of root.descendantsOfType("element")) {
    if (!el) continue;
    const name = el.namedChildren.find((n) => n?.type === "start_tag")?.namedChildren.find((n) => n?.type === "tag_name")?.text.toLowerCase() ?? "";
    const id = attribute(el, "id");
    const heading = /^h[1-6]$/.test(name) ? shownText(el).replace(/\s+/g, " ").trim() : "";
    if (!heading && !id) continue;
    out.push({ name: heading || `#${id}`, kind: heading ? name : "id", start: el.startPosition, end: el.endPosition });
  }
  return out;
}

/** A definition's name, as the outline shows it, from its node and its name's. */
function label(def: Node, name: Node | undefined): string {
  if (def.type === "impl_item" && name) return `impl ${def.childForFieldName("trait") ? `${def.childForFieldName("trait")!.text} for ` : ""}${name.text}`;
  if (def.type === "init_declaration") return "init";
  if (def.type === "singleton_method" && name) return `${def.childForFieldName("object")?.text ?? "self"}.${name.text}`;
  // A Dockerfile's stage: its name, then the image it starts from.
  if (def.type === "from_instruction" && name) {
    const as = def.childForFieldName("as");
    return as ? `${as.text} (${name.text})` : name.text;
  }
  if (name) return name.text;
  // At-rules: the rule as written, up to its block.
  return def.text.split("{")[0]!.split("\n")[0]!.trim();
}

/** A definition's kind: Swift's class, struct, enum, extension and actor are one node, told by a keyword. */
function kindOf(def: Node): string {
  if (def.type === "class_declaration" && def.childForFieldName("declaration_kind")) return def.childForFieldName("declaration_kind")!.text;
  let kind = KIND[def.type] ?? def.type;
  // A function defined in a class (Python), or declared in one (C++: a constructor), reads as a method.
  if (kind === "function" && (def.parent?.parent?.type === "class_definition" || def.parent?.type === "field_declaration_list")) kind = "method";
  return kind;
}

/** A parse of one text: asked for what the layout, the outline and the links need. */
export class SyntaxTree {
  /** The parts in other languages, each parsed with its own grammar, and where it starts here. */
  private readonly embedded: { part: Part; tree: SyntaxTree | null; at: Pos }[];

  constructor(
    private readonly g: Loaded,
    readonly tree: Tree,
    private readonly source: string,
  ) {
    this.embedded = partsOf(g.grammar, tree.rootNode).map((part) => {
      const sub = part.grammar ? grammarNow(part.grammar) : null;
      return { part, tree: sub ? parseSyntax(sub, part.text.text) : null, at: part.text.startPosition };
    });
  }

  /** The trees this parse holds, freed: its own and its parts'. */
  delete(): void {
    for (const e of this.embedded) e.tree?.delete();
    this.tree.delete();
  }

  /** A position in a part, placed in this file: its first row starts at the part's column. */
  private place(at: Pos, p: Pos): Pos {
    return { row: at.row + p.row, column: p.row === 0 ? at.column + p.column : p.column };
  }

  /** This text's own definitions, a page's headings and ids, its parts, and their definitions: unnested. */
  private entries(): Entry[] {
    const out: Entry[] = [];
    for (const m of this.g.defs?.matches(this.tree.rootNode) ?? []) {
      const def = m.captures.find((c) => c.name === "def")?.node;
      if (!def) continue;
      const name = m.captures.find((c) => c.name === "name")?.node;
      out.push({ name: label(def, name).replace(/\s+/g, " "), kind: kindOf(def), start: def.startPosition, end: def.endPosition });
    }
    if (MARKUP.has(this.g.grammar)) out.push(...markupOutline(this.tree.rootNode));
    for (const e of this.embedded) {
      const s = e.part.section;
      if (s) out.push({ name: s.name, kind: "section", start: s.node.startPosition, end: s.node.endPosition });
      for (const x of e.tree?.entries() ?? []) out.push({ ...x, start: this.place(e.at, x.start), end: this.place(e.at, x.end) });
    }
    // A Vue component's template: its own entry, its headings and ids under it.
    for (const t of this.tree.rootNode.descendantsOfType("template_element")) if (t) out.push({ name: "template", kind: "section", start: t.startPosition, end: t.endPosition });
    return out;
  }

  /** Functions, classes, methods… (a page's headings and ids, a component's parts) in source order,
   *  each nested under the ones it's inside. */
  outline(): OutlineEntry[] {
    const all = this.entries().sort((a, b) => (before(a.start, b.start) ? -1 : before(b.start, a.start) ? 1 : before(a.end, b.end) ? 1 : -1));
    const out: OutlineEntry[] = [];
    const open: Pos[] = []; // the ends of the entries the next may be inside
    for (const e of all) {
      while (open.length && !before(e.start, open[open.length - 1]!)) open.pop();
      out.push({ name: e.name, kind: e.kind, line: e.start.row + 1, depth: open.length });
      open.push(e.end);
    }
    return out;
  }

  /** Where the text doesn't parse: ERROR nodes and nodes the parser had to invent (missing); its parts' too. */
  errors(limit = 100): SyntaxError[] {
    const out: SyntaxError[] = [];
    const lines = this.source.split("\n");
    const visit = (n: Node | null) => {
      if (!n || out.length >= limit || !n.hasError) return;
      if (n.isMissing || n.type === "ERROR") {
        const line = n.startPosition.row + 1;
        const text = lines[n.startPosition.row] ?? "";
        const to = n.endPosition.row === n.startPosition.row ? Math.max(n.endPosition.column, n.startPosition.column + 1) : text.length;
        out.push({ line, from: n.startPosition.column, to: Math.min(Math.max(to, n.startPosition.column + 1), Math.max(text.length, n.startPosition.column + 1)), message: n.isMissing ? `missing ${n.type}` : "syntax error" });
        if (n.type === "ERROR") return; // the first place is enough; its insides are noise
      }
      for (let i = 0; i < n.childCount; i++) visit(n.child(i));
    };
    if (this.tree.rootNode.hasError) visit(this.tree.rootNode);
    for (const e of this.embedded) {
      for (const x of e.tree?.errors(limit) ?? []) {
        const p = this.place(e.at, { row: x.line - 1, column: x.from });
        out.push({ ...x, line: p.row + 1, from: p.column, to: p.column + (x.to - x.from) });
      }
    }
    return out.slice(0, limit);
  }

  /** The parts of lines inside strings and comments that span lines (single-line ones are
   *  highlight.js's to colour, a line at a time); its parts' too. */
  spans(): Span[] {
    const out: Span[] = [];
    const add = (query: Query, kind: Span["kind"]) => {
      for (const c of query.captures(this.tree.rootNode)) {
        const s = c.node.startPosition;
        const e = c.node.endPosition;
        if (e.row === s.row) continue;
        for (let r = s.row; r <= e.row; r++) out.push({ line: r + 1, from: r === s.row ? s.column : 0, to: r === e.row ? e.column : Number.POSITIVE_INFINITY, kind });
      }
    };
    add(this.g.strings, "string");
    add(this.g.comments, "comment");
    for (const e of this.embedded) {
      for (const x of e.tree?.spans() ?? []) {
        const row0 = x.line - 1 === 0;
        out.push({ ...x, line: x.line + e.at.row, from: row0 ? x.from + e.at.column : x.from, to: row0 && x.to !== Number.POSITIVE_INFINITY ? x.to + e.at.column : x.to });
      }
    }
    return out;
  }

  /** Every comment, for the links in it (16.10); its parts' too. */
  comments(): Comment[] {
    const own = this.g.comments.captures(this.tree.rootNode).map((c) => ({ line: c.node.startPosition.row + 1, column: c.node.startPosition.column, text: c.node.text }));
    const parts = this.embedded.flatMap((e) => (e.tree?.comments() ?? []).map((x) => ({ ...x, line: x.line + e.at.row, column: x.line === 1 ? x.column + e.at.column : x.column })));
    return [...own, ...parts].sort((a, b) => a.line - b.line || a.column - b.column);
  }

  /**
   * The lines in another language than the file's (16.22), by highlight.js's name: a part's lines
   * between the one its tag opens on and the one its closing tag is on — those hold the tags too.
   */
  languages(): Map<number, string> {
    const out = new Map<number, string>();
    const lines = this.source.split("\n");
    for (const e of this.embedded) {
      const hl = e.part.highlight ?? (e.part.grammar ? (HIGHLIGHT[e.part.grammar] ?? e.part.grammar) : null);
      if (!hl) continue;
      const s = e.part.text.startPosition;
      const end = e.part.text.endPosition;
      // Its last line is its own when it holds some of its text (Astro's frontmatter ends so).
      const last = (lines[end.row] ?? "").slice(0, end.column).trim() ? end.row : end.row - 1;
      for (let r = s.column === 0 ? s.row : s.row + 1; r <= last; r++) out.set(r + 1, hl);
    }
    return out;
  }
}

export interface CommentLink {
  /** 1-based line; 0-based UTF-16 columns of the token in it. */
  line: number;
  from: number;
  to: number;
  /** A URL, or a path as written (no `:line`). */
  target: string;
  url: boolean;
  /** `path:42`: the line it points at. */
  at: number | null;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;
/** A path with an extension (a letter first: `1.5` isn't one), maybe `:line` or `:line:col` after. */
const PATH_RE = /(?<![\w./@~-])(?:\.{1,2}\/|\/)?[\w@~-][\w.@~-]*(?:\/[\w.@~-]+)*\.[A-Za-z][A-Za-z0-9]{0,9}(?::(\d+)(?::\d+)?)?(?![\w/])/g;

/**
 * Link-like tokens in a text (16.10): URLs, and paths with an extension, `path:42` included. Which
 * paths are links is the caller's to say — the ones that name a file of the vault.
 */
export function linkTokens(text: string): { index: number; length: number; target: string; url: boolean; at: number | null }[] {
  const out: { index: number; length: number; target: string; url: boolean; at: number | null }[] = [];
  let masked = text;
  for (const m of text.matchAll(URL_RE)) {
    // Trailing punctuation is the sentence's; a `)` is the URL's only when it opened one.
    let u = m[0].replace(/[.,;:!?'"]+$/, "");
    while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1).replace(/[.,;:!?]+$/, "");
    out.push({ index: m.index, length: u.length, target: u, url: true, at: null });
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of masked.matchAll(PATH_RE)) {
    const tok = m[0].replace(/\.+$/, "");
    const target = m[1] ? tok.slice(0, tok.indexOf(":")) : tok;
    out.push({ index: m.index, length: tok.length, target, url: false, at: m[1] ? Number(m[1]) : null });
  }
  return out.sort((x, y) => x.index - y.index);
}

/** The link-like tokens in a file's comments, placed by line and column. */
export function commentLinks(comments: Comment[]): CommentLink[] {
  const out: CommentLink[] = [];
  for (const c of comments) {
    c.text.split("\n").forEach((text, i) => {
      const base = i === 0 ? c.column : 0;
      for (const t of linkTokens(text)) out.push({ line: c.line + i, from: base + t.index, to: base + t.index + t.length, target: t.target, url: t.url, at: t.at });
    });
  }
  return out;
}

/** Parse `source` with a loaded grammar. */
export function parseSyntax(g: Loaded, source: string): SyntaxTree | null {
  const tree = g.parser.parse(source);
  return tree ? new SyntaxTree(g, tree, source) : null;
}
