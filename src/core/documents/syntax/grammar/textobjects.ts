// The code's text objects (EG-D6): per grammar, a query capturing its functions, classes and types, arguments and
// blocks, after the textobject queries Helix and nvim-treesitter-textobjects ship — their capture names, our patterns
// (checked against the grammars slipbox bundles). `@function.around` is the whole and `@function.inside` its body;
// `@class.*` the same; `@parameter.inside` an argument or a parameter, its comma added in `tree/structure.ts`; `@block`
// a block of statements. A grammar not here has none (a page's markup, a Dockerfile): its embedded parts have theirs.
import type { Grammar } from "../contracts.ts";

/** JavaScript's, TypeScript's and TSX's. */
const ECMA = `
(function_declaration body: (_) @function.inside) @function.around
(generator_function_declaration body: (_) @function.inside) @function.around
(function_expression body: (_) @function.inside) @function.around
(generator_function body: (_) @function.inside) @function.around
(arrow_function body: (_) @function.inside) @function.around
(method_definition body: (_) @function.inside) @function.around
(class_declaration body: (_) @class.inside) @class.around
(class body: (_) @class.inside) @class.around
(formal_parameters (_) @parameter.inside)
(arguments (_) @parameter.inside)
(statement_block) @block`;

const TS = `${ECMA}
(function_signature) @function.around
(abstract_class_declaration body: (_) @class.inside) @class.around
(interface_declaration body: (_) @class.inside) @class.around
(enum_declaration body: (_) @class.inside) @class.around
(type_alias_declaration value: (_) @class.inside) @class.around
(type_parameters (_) @parameter.inside)
(type_arguments (_) @parameter.inside)`;

const C = `
(function_definition body: (_) @function.inside) @function.around
(struct_specifier body: (_) @class.inside) @class.around
(union_specifier body: (_) @class.inside) @class.around
(enum_specifier body: (_) @class.inside) @class.around
(parameter_list (_) @parameter.inside)
(argument_list (_) @parameter.inside)
(compound_statement) @block`;

/** CSS's and SCSS's: a rule's block. */
const CSS = "(block) @block";

export const TEXTOBJECTS: Partial<Record<Grammar, string>> = {
  javascript: ECMA,
  typescript: TS,
  tsx: TS,
  python: `
(function_definition body: (_) @function.inside) @function.around
(lambda body: (_) @function.inside) @function.around
(class_definition body: (_) @class.inside) @class.around
(parameters (_) @parameter.inside)
(lambda_parameters (_) @parameter.inside)
(argument_list (_) @parameter.inside)
(block) @block`,
  rust: `
(function_item body: (_) @function.inside) @function.around
(function_signature_item) @function.around
(closure_expression body: (_) @function.inside) @function.around
(struct_item body: (_) @class.inside) @class.around
(struct_item) @class.around
(enum_item body: (_) @class.inside) @class.around
(union_item body: (_) @class.inside) @class.around
(trait_item body: (_) @class.inside) @class.around
(impl_item body: (_) @class.inside) @class.around
(type_item) @class.around
(parameters (_) @parameter.inside)
(closure_parameters (_) @parameter.inside)
(type_parameters (_) @parameter.inside)
(type_arguments (_) @parameter.inside)
(arguments (_) @parameter.inside)
(block) @block`,
  go: `
(function_declaration body: (_) @function.inside) @function.around
(method_declaration body: (_) @function.inside) @function.around
(func_literal body: (_) @function.inside) @function.around
(type_declaration (type_spec type: (_) @class.inside)) @class.around
(parameter_list (_) @parameter.inside)
(argument_list (_) @parameter.inside)
(block) @block`,
  c: C,
  cpp: `${C}
(class_specifier body: (_) @class.inside) @class.around
(lambda_expression body: (_) @function.inside) @function.around
(template_parameter_list (_) @parameter.inside)
(template_argument_list (_) @parameter.inside)`,
  lua: `
(function_declaration body: (_) @function.inside) @function.around
(function_declaration) @function.around
(function_definition body: (_) @function.inside) @function.around
(function_definition) @function.around
(parameters (_) @parameter.inside)
(arguments (_) @parameter.inside)
(block) @block`,
  ruby: `
(method body: (_) @function.inside) @function.around
(method) @function.around
(singleton_method body: (_) @function.inside) @function.around
(singleton_method) @function.around
(class body: (_) @class.inside) @class.around
(class) @class.around
(module body: (_) @class.inside) @class.around
(module) @class.around
(method_parameters (_) @parameter.inside)
(block_parameters (_) @parameter.inside)
(argument_list (_) @parameter.inside)
[(do_block) (block)] @block`,
  bash: `
(function_definition body: (_) @function.inside) @function.around
(command argument: (_) @parameter.inside)
[(compound_statement) (do_group)] @block`,
  php: `
(function_definition body: (_) @function.inside) @function.around
(method_declaration body: (_) @function.inside) @function.around
(method_declaration) @function.around
(anonymous_function body: (_) @function.inside) @function.around
(arrow_function body: (_) @function.inside) @function.around
(class_declaration body: (_) @class.inside) @class.around
(interface_declaration body: (_) @class.inside) @class.around
(trait_declaration body: (_) @class.inside) @class.around
(enum_declaration body: (_) @class.inside) @class.around
(formal_parameters (_) @parameter.inside)
(arguments (_) @parameter.inside)
(compound_statement) @block`,
  swift: `
(function_declaration body: (_) @function.inside) @function.around
(init_declaration body: (_) @function.inside) @function.around
(lambda_literal) @function.around
(class_declaration body: (_) @class.inside) @class.around
(protocol_declaration body: (_) @class.inside) @class.around
(function_declaration (parameter) @parameter.inside)
(value_arguments (_) @parameter.inside)
(function_body) @block`,
  css: CSS,
  scss: CSS,
};
