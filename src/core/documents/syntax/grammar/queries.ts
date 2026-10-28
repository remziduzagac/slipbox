// Grammar-specific structural queries; query text is kept verbatim.
import type { Grammar } from "../contracts.ts";

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
export const QUERIES: Record<Grammar, { defs: string; comments: string; strings: string }> = {
  typescript: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  tsx: { defs: TS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  javascript: { defs: JS_DEFS, comments: "(comment) @c", strings: "[(string) (template_string)] @s" },
  python: {
    defs: "(function_definition name: (identifier) @name) @def (class_definition name: (identifier) @name) @def",
    comments: "(comment) @c",
    strings: "(string) @s",
  },
  bash: {
    defs: "(function_definition name: (word) @name) @def",
    comments: "(comment) @c",
    strings: "[(string) (raw_string) (heredoc_body)] @s",
  },
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
  dockerfile: {
    defs: "(from_instruction (image_spec) @name) @def",
    comments: "(comment) @c",
    strings: "[(double_quoted_string) (single_quoted_string) (heredoc_block)] @s",
  },
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
