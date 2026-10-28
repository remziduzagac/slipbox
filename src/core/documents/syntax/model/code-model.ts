// Code-view structure from a supplied parse, without owning or loading trees.
import type { Node, Tree } from "web-tree-sitter";
import type { Grammar, Loaded, Pos, CodeDef, CodeDoc, CodeComment, CodeImports, CodeModel } from "../contracts.ts";
import { before, endOf } from "../tree/positions.ts";

/** The grammars the code view (24.x) maps: their definitions, doc comments, comments and imports. */
export const DOCUMENT_GRAMMARS: ReadonlySet<Grammar> = new Set<Grammar>([
  "typescript",
  "tsx",
  "javascript",
  "python",
  "go",
  "rust",
  "swift",
  "php",
  "ruby",
  "c",
  "cpp",
  "lua",
  "bash",
]);

/** A node written above a definition, for it: an attribute, a decorator, an annotation. */
const ATTRIBUTE = /attribute|decorator|annotation/;

/** A top-level node that imports: `import`, `use`, `#include`, `using`, `extern crate` — as each grammar names it. */
const IMPORT = /import|^use_|_use_|^using_|include|extern_crate/;

/** What a node imports, for its folded row: its strings (`"fmt"`, `<stdio.h>`), else its words after the keyword. */
function importedBy(n: Node): string[] {
  const named = (n.childForFieldName("source")?.text ?? "").replace(/^["'`]|["'`]$/g, "");
  if (named) return [named];
  const out: string[] = [];
  const visit = (x: Node | null) => {
    if (!x) return;
    if (/string|system_lib/.test(x.type)) {
      out.push(x.text.replace(/^["'`<]|["'`>]$/g, ""));
      return;
    }
    for (const c of x.namedChildren) visit(c);
  };
  visit(n);
  if (out.length) return out;
  const words = n.text
    .replace(/^\s*(?:#\s*include|import|use|using|extern\s+crate|from)\b\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
  return words ? [words] : [];
}

/**
 * A licence or a "generated" banner heading a file (24.22): the comment lines it starts with — past a shebang or an
 * encoding line — when they're two lines or more, before any code, and read so. Its name where it says one.
 */
function headerOf(
  comments: Node[],
  root: Node,
  lines: string[],
): { start: number; end: number; kind: "license" | "generated"; name: string | null } | null {
  const sorted = [...comments].sort((a, b) => a.startPosition.row - b.startPosition.row);
  let k = 0;
  // Past a shebang, an encoding line, PHP's opening tag.
  const preamble = /^(#!|.*-\*-|<\?php\b)/;
  while (k < sorted.length && preamble.test(sorted[k]!.text)) k++;
  const first = sorted[k];
  if (!first || lines.slice(0, first.startPosition.row).some((l) => l.trim() && !preamble.test(l.trim()))) return null;
  let end = k;
  while (end + 1 < sorted.length && sorted[end + 1]!.startPosition.row === endOf(sorted[end]!, lines).row + 1) end++;
  const start = first.startPosition.row + 1;
  const last = endOf(sorted[end]!, lines).row + 1;
  const code = root.namedChildren.find((n) => n && !/comment|php_tag/.test(n.type));
  if (last - start < 1 || (code && code.startPosition.row + 1 <= last)) return null;
  const text = sorted
    .slice(k, end + 1)
    .map((n) => n.text)
    .join("\n");
  const spdx = /SPDX-License-Identifier:\s*([^\s*]+)/.exec(text);
  if (spdx) return { start, end: last, kind: "license", name: spdx[1]! };
  if (
    /\b(Code generated\b.*\bDO NOT EDIT|auto-?generated|automatically generated|@generated|this file (?:is|was) generated|DO NOT EDIT)\b/i.test(
      text,
    )
  ) {
    const by = /generated (?:by|with|from) ([\w.@/-]+)/i.exec(text);
    return { start, end: last, kind: "generated", name: by ? by[1]!.replace(/[.,:]+$/, "") : null };
  }
  if (
    !/copyright|\(c\)|©/i.test(text) ||
    !/licen[cs]e|permission is hereby granted|all rights reserved|warrant|redistribution/i.test(text)
  )
    return null;
  const name =
    /Permission is hereby granted, free of charge/i.test(text) || /\bMIT License\b/i.test(text)
      ? "MIT"
      : /Apache License,?\s+Version 2\.0/i.test(text)
        ? "Apache-2.0"
        : /GNU (?:Affero|Lesser)? ?General Public License/i.test(text)
          ? `${/Affero/i.test(text) ? "AGPL" : /Lesser/i.test(text) ? "LGPL" : "GPL"}${/version 3/i.test(text) ? "-3.0" : /version 2/i.test(text) ? "-2.0" : ""}`
          : /Mozilla Public License/i.test(text)
            ? "MPL-2.0"
            : /Redistribution and use in source and binary forms/i.test(text)
              ? "BSD"
              : /BSD-style license/i.test(text)
                ? "BSD"
                : null;
  return { start, end: last, kind: "license", name };
}

/** What a language calls a definition, by its node's type, where the type's own name, less its suffix, isn't it. */
const TERMS: Record<string, string> = {
  generator_function_declaration: "function",
  variable_declarator: "function",
  declaration: "function",
  protocol_function_declaration: "method",
  singleton_method: "method",
  field_declaration: "method",
  abstract_class_declaration: "class",
  mod_item: "module",
  type_alias_declaration: "type",
  typealias_declaration: "type",
};

/**
 * A definition's word (24.9): what its language calls it — its node's type, less what every grammar adds
 * (`struct_item` a struct, `interface_declaration` an interface), Swift's from what it declares, Go's `type T struct` a
 * struct; a function in a class (an impl, a trait, a struct — not a module or a namespace) a method.
 */
function termOf(n: Node, inClass: boolean): string {
  let t =
    TERMS[n.type] ?? n.type.replace(/_(item|declaration|definition|specifier|statement|spec)$/, "").replace(/_/g, " ");
  const declares = n.childForFieldName("declaration_kind")?.text;
  if (declares) t = declares;
  if (n.type === "type_spec") {
    const of = n.childForFieldName("type")?.type;
    if (of === "struct_type") t = "struct";
    else if (of === "interface_type") t = "interface";
  }
  return inClass && t === "function" ? "method" : t;
}

/**
 * A definition's kind in the code view, by its node's type in any grammar: a function, a class (what holds other
 * definitions: a class, an impl, a trait, a module, a namespace, a protocol), a type (an interface, a struct, an enum,
 * a type alias); else not a definition the view draws.
 */
export function codeKind(type: string): CodeDef["kind"] | undefined {
  if (CODE_KIND[type]) return CODE_KIND[type];
  if (/function|method|^init_declaration$/.test(type)) return "function";
  if (/class|impl|trait|module|namespace|protocol|^mod_item$/.test(type)) return "class";
  if (/interface|struct|union|enum|type/.test(type)) return "type";
  return undefined;
}

/** A definition's node type, as the code view's kind. */
const CODE_KIND: Record<string, CodeDef["kind"]> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  method_definition: "function",
  variable_declarator: "function",
  class_declaration: "class",
  abstract_class_declaration: "class",
  function_definition: "function",
  class_definition: "class",
  interface_declaration: "type",
  type_alias_declaration: "type",
  enum_declaration: "type",
  // C's: a declaration with a function's declarator, a prototype; C++'s field declaration likewise, a method's.
  declaration: "function",
  field_declaration: "function",
  type_definition: "type",
  // Ruby's: what `def` and `def self.` make.
  method: "function",
  singleton_method: "function",
};

/** Extract the admitted grammar's model; the tree owner keeps the admission gate. */
export function buildCodeModel(
  g: Pick<Loaded, "grammar" | "defs" | "comments">,
  tree: Pick<Tree, "rootNode">,
  source: string,
): CodeModel {
  const python = g.grammar === "python";
  const root = tree.rootNode;
  const lines = source.split("\n");
  const found: { kind: CodeDef["kind"]; start: Pos; end: Pos; name: Node; node: Node }[] = [];
  for (const m of g.defs?.matches(root) ?? []) {
    const def = m.captures.find((c) => c.name === "def")?.node;
    const name = m.captures.find((c) => c.name === "name")?.node;
    const kind = def ? codeKind(def.type) : undefined;
    if (def && name && kind) found.push({ kind, start: def.startPosition, end: def.endPosition, name, node: def });
  }
  // A file's top-level values that aren't functions: `const`, `let`, `var` (exported or not); Python's assignments.
  // (Another language's are in the runs of statements between its definitions, each run a cell.)
  for (const top of root.namedChildren) {
    if (!top) continue;
    if (python) {
      const a = top.type === "expression_statement" ? top.namedChildren[0] : null;
      const name = a?.type === "assignment" ? a.childForFieldName("left") : null;
      if (name?.type === "identifier")
        found.push({ kind: "value", start: top.startPosition, end: top.endPosition, name, node: top });
      continue;
    }
    const decl = top.type === "export_statement" ? top.childForFieldName("declaration") : top;
    if (!decl || (decl.type !== "lexical_declaration" && decl.type !== "variable_declaration")) continue;
    const first = decl.namedChildren.find((n) => n?.type === "variable_declarator");
    const name = first?.childForFieldName("name");
    const value = first?.childForFieldName("value");
    if (!first || !name || (value && (value.type === "arrow_function" || value.type === "function_expression")))
      continue;
    found.push({ kind: "value", start: top.startPosition, end: top.endPosition, name, node: top });
  }
  found.sort((a, b) => (before(a.start, b.start) ? -1 : before(b.start, a.start) ? 1 : 0));
  const defs: CodeDef[] = [];
  const docs: CodeDoc[] = [];
  const open: Pos[] = [];
  /** The words of the definitions `open`'s ends are of: a function in a class (not a module) is a method. */
  const holders: string[] = [];
  // A docstring: a body's first statement, when it's a string alone.
  const docstring = (body: Node | null | undefined): Node | null => {
    const first = body?.namedChildren[0];
    const str =
      first?.type === "expression_statement" && first.namedChildren.length === 1 ? first.namedChildren[0] : null;
    return str?.type === "string" ? str : null;
  };
  for (const f of found) {
    while (open.length && !before(f.start, open[open.length - 1]!)) {
      open.pop();
      holders.pop();
    }
    const n = f.name;
    const to = n.endPosition.row === n.startPosition.row ? n.endPosition.column : n.startPosition.column + 1;
    const decorated = f.node.parent?.type === "decorated_definition" ? f.node.parent : null;
    // What's written above it for it — Rust's `#[derive(…)]`, an annotation — is its cell's too.
    let first: Node = decorated ?? f.node;
    for (
      let p = first.previousNamedSibling;
      p && ATTRIBUTE.test(p.type) && p.endPosition.row >= first.startPosition.row - 1;
      p = p.previousNamedSibling
    )
      first = p;
    const top = first.startPosition.row + 1;
    const at = first.startPosition;
    const holder = holders[holders.length - 1];
    const term = termOf(f.node, !!holder && !/module|namespace/.test(holder));
    defs.push({
      kind: f.kind,
      line: f.start.row + 1,
      name: { line: n.startPosition.row + 1, from: n.startPosition.column, to },
      depth: open.length,
      top,
      end: f.end.row + 1,
      column: (lines[at.row] ?? "").length - (lines[at.row] ?? "").trimStart().length,
      term,
    });
    open.push(f.end);
    holders.push(term);
    if (python && f.kind !== "value") {
      const d = docstring(f.node.childForFieldName("body"));
      if (d)
        docs.push({
          start: d.startPosition.row + 1,
          end: d.endPosition.row + 1,
          column: first.startPosition.column,
          style: "docstring",
          before: top,
        });
    }
  }
  // A module's docstring: where it is, at the top.
  const moduleDoc = python ? docstring(root) : null;
  if (moduleDoc)
    docs.push({
      start: moduleDoc.startPosition.row + 1,
      end: moduleDoc.endPosition.row + 1,
      column: moduleDoc.startPosition.column,
      style: "docstring",
    });
  // A licence or a "generated" banner heading the file (24.22): folded, not prose.
  const header = headerOf(
    g.comments.captures(root).map((c) => c.node),
    root,
    lines,
  );
  // The comments: a `/** */` is documentation, and so is a block comment over several lines; the rest are comments.
  const comments: CodeComment[] = [];
  for (const c of g.comments.captures(root)) {
    const s = c.node.startPosition;
    const e = endOf(c.node, lines);
    const text = c.node.text;
    const trailing = !!(lines[s.row] ?? "").slice(0, s.column).trim();
    if (text.startsWith("/**") && !text.startsWith("/**/") && !trailing)
      docs.push({ start: s.row + 1, end: e.row + 1, column: s.column, style: "jsdoc" });
    else if (text.startsWith("/*") && e.row > s.row && !trailing)
      docs.push({ start: s.row + 1, end: e.row + 1, column: s.column, style: "block" });
    else comments.push({ line: s.row + 1, column: s.column, end: e.column, trailing });
  }
  docs.sort((a, b) => a.start - b.start);
  // Runs of imports: those with only blank lines between them — a node named so, in any grammar (`import`, `use`,
  // `#include`, `using`); what each imports read from its strings, else its words after the keyword.
  const imports: CodeImports[] = [];
  if (header)
    imports.push({
      start: header.start,
      end: header.end,
      modules: header.name ? [header.name] : [],
      kind: header.kind,
    });
  for (const n of root.namedChildren) {
    if (!n || !IMPORT.test(n.type)) continue;
    const start = n.startPosition.row + 1;
    const end = n.endPosition.row + 1;
    const modules = python
      ? n.type === "import_statement"
        ? n.namedChildren.map((x) => (x?.type === "aliased_import" ? x.childForFieldName("name") : x)?.text ?? "")
        : [n.childForFieldName("module_name")?.text ?? "__future__"]
      : importedBy(n);
    const last = imports[imports.length - 1];
    if (last && !last.kind && lines.slice(last.end, start - 1).every((l) => !l.trim())) {
      last.end = end;
      last.modules.push(...modules);
    } else imports.push({ start, end, modules });
  }
  return { defs, docs, comments, imports };
}
