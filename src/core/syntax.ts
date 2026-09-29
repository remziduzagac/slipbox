// Source files' structure with tree-sitter (plan 16.7–16.10), each language's grammar loaded
// the first time a file of it opens (16.6, `lazy.ts`).
//
// highlight.js colours a line well on its own; what a line can't know is that it starts inside a
// string or comment opened lines above. Tree-sitter supplies that (`spans`), and the rest of a
// file's structure: its outline (functions, classes, methods…), its syntax errors, and its
// comments (where links are looked for). Queries run in the parser's own code, so asking costs
// little even for a big file.

import { Language, Parser, Query, type Tree } from "web-tree-sitter";
import runtime from "web-tree-sitter/tree-sitter.wasm" with { type: "file" };
import bash from "tree-sitter-wasms/out/tree-sitter-bash.wasm" with { type: "file" };
import go from "tree-sitter-wasms/out/tree-sitter-go.wasm" with { type: "file" };
import javascript from "tree-sitter-wasms/out/tree-sitter-javascript.wasm" with { type: "file" };
import lua from "tree-sitter-wasms/out/tree-sitter-lua.wasm" with { type: "file" };
import python from "tree-sitter-wasms/out/tree-sitter-python.wasm" with { type: "file" };
import rust from "tree-sitter-wasms/out/tree-sitter-rust.wasm" with { type: "file" };
import tsx from "tree-sitter-wasms/out/tree-sitter-tsx.wasm" with { type: "file" };
import typescript from "tree-sitter-wasms/out/tree-sitter-typescript.wasm" with { type: "file" };
import { lazy, load } from "./lazy.ts";

type Grammar = "typescript" | "tsx" | "javascript" | "python" | "bash" | "lua" | "go" | "rust";

const WASM: Record<Grammar, string> = { typescript, tsx, javascript, python, bash, lua, go, rust };

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

/** Per grammar: definitions (for the outline), comments, and strings (which may span lines). */
const QUERIES: Record<Grammar, { defs: string; comments: string; strings: string }> = {
  typescript: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  tsx: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  javascript: { defs: JS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  python: { defs: "(function_definition name: (identifier) @name) @def (class_definition name: (identifier) @name) @def", comments: "(comment) @c", strings: "(string) @s" },
  bash: { defs: "(function_definition name: (word) @name) @def", comments: "(comment) @c", strings: "[(string) (raw_string) (heredoc_body)] @s" },
  lua: { defs: "(function_definition_statement name: (_) @name) @def (local_function_definition_statement name: (_) @name) @def", comments: "(comment) @c", strings: "(string) @s" },
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
};

/** What an outline entry is, by its definition node's type. */
const KIND: Record<string, string> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  function_definition: "function",
  function_item: "function",
  function_definition_statement: "function",
  local_function_definition_statement: "function",
  variable_declarator: "function",
  class_declaration: "class",
  abstract_class_declaration: "class",
  class_definition: "class",
  method_definition: "method",
  method_declaration: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  type_spec: "type",
  enum_declaration: "enum",
  enum_item: "enum",
  struct_item: "struct",
  trait_item: "trait",
  impl_item: "impl",
  mod_item: "module",
};

/** The grammar for a text file's language (its `classify` format) and extension, if slipbox has one. */
export function grammarFor(format: string, ext: string): Grammar | null {
  if (ext === "tsx") return "tsx";
  if (format === "typescript" || format === "javascript" || format === "python" || format === "go" || format === "rust" || format === "lua") return format;
  if (format === "bash") return "bash";
  return null;
}

interface Loaded {
  parser: Parser;
  language: Language;
  defs: Query;
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
  return { parser, language, defs: new Query(language, q.defs), comments: new Query(language, q.comments), strings: new Query(language, q.strings) };
}

/** A grammar if it's loaded; else its loading starts (once) and this is null until it lands. */
export function grammarNow(g: Grammar): Loaded | null {
  return lazy(`grammar:${g}`, () => loadGrammar(g));
}

/** A grammar, waited for (the CLI). */
export function grammar(g: Grammar): Promise<Loaded | null> {
  return load(`grammar:${g}`, () => loadGrammar(g));
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

/** A parse of one text: asked for what the layout, the outline and the links need. */
export class SyntaxTree {
  constructor(
    private readonly g: Loaded,
    readonly tree: Tree,
    private readonly source: string,
  ) {}

  /** Functions, classes, methods… in source order, each nested under the ones it's inside. */
  outline(): OutlineEntry[] {
    const out: OutlineEntry[] = [];
    const stack: number[] = []; // end rows of the open definitions
    for (const m of this.g.defs.matches(this.tree.rootNode)) {
      const def = m.captures.find((c) => c.name === "def")?.node;
      const name = m.captures.find((c) => c.name === "name")?.node;
      if (!def || !name) continue;
      while (stack.length && stack[stack.length - 1]! < def.startPosition.row) stack.pop();
      let kind = KIND[def.type] ?? def.type;
      // A function defined in a class (Python) reads as a method.
      if (kind === "function" && def.parent?.parent?.type === "class_definition") kind = "method";
      const label = def.type === "impl_item" ? `impl ${def.childForFieldName("trait") ? `${def.childForFieldName("trait")!.text} for ` : ""}${name.text}` : name.text;
      out.push({ name: label.replace(/\s+/g, " "), kind, line: def.startPosition.row + 1, depth: stack.length });
      stack.push(def.endPosition.row);
    }
    return out;
  }

  /** Where the text doesn't parse: ERROR nodes and nodes the parser had to invent (missing). */
  errors(limit = 100): SyntaxError[] {
    const out: SyntaxError[] = [];
    if (!this.tree.rootNode.hasError) return out;
    const lines = this.source.split("\n");
    const visit = (n: ReturnType<Tree["rootNode"]["child"]>) => {
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
    visit(this.tree.rootNode);
    return out;
  }

  /** The parts of lines inside strings and comments that span lines (single-line ones are
   *  highlight.js's to colour, a line at a time). */
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
    return out;
  }

  /** Every comment, for the links in it (16.10). */
  comments(): Comment[] {
    return this.g.comments.captures(this.tree.rootNode).map((c) => ({ line: c.node.startPosition.row + 1, column: c.node.startPosition.column, text: c.node.text }));
  }
}

/** Parse `source` with a loaded grammar. */
export function parseSyntax(g: Loaded, source: string): SyntaxTree | null {
  const tree = g.parser.parse(source);
  return tree ? new SyntaxTree(g, tree, source) : null;
}
