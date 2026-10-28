// Outline labels and kinds from a definition node.
import type { Node } from "web-tree-sitter";

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

/** A definition's name, as the outline shows it, from its node and its name's. */
export function label(def: Node, name: Node | undefined): string {
  if (def.type === "impl_item" && name)
    return `impl ${def.childForFieldName("trait") ? `${def.childForFieldName("trait")!.text} for ` : ""}${name.text}`;
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
export function kindOf(def: Node): string {
  if (def.type === "class_declaration" && def.childForFieldName("declaration_kind"))
    return def.childForFieldName("declaration_kind")!.text;
  let kind = KIND[def.type] ?? def.type;
  // A function defined in a class (Python), or declared in one (C++: a constructor), reads as a method.
  if (
    kind === "function" &&
    (def.parent?.parent?.type === "class_definition" || def.parent?.type === "field_declaration_list")
  )
    kind = "method";
  return kind;
}
