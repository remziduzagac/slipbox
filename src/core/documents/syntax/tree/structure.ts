// The code's structure (EG-D6, EG-D7), extracted where the tree is parsed (the syntax worker): its text objects, by its
// grammar's query (`grammar/textobjects.ts`), and its named nodes' ranges, for growing a selection. Offsets are UTF-16
// code units into the text parsed, plus `base` for a part of a file in another language.
import type { Node } from "web-tree-sitter";
import type { CodeObject, Loaded } from "../contracts.ts";

/** The most node ranges kept for a source (pairs): past it, a minified bundle's, growing the selection reads none. */
const NODE_LIMIT = 2_000_000;

/** What a definition is inside of and wholly part of: `export …`, Python's decorators. */
const WRAPPERS = new Set(["export_statement", "decorated_definition"]);
/** What comes before a definition as part of it, among its siblings: a method's decorators, Rust's attributes. */
const LEADING = new Set(["decorator", "attribute_item"]);
/** A declaration whose one value is a function or a class (`const f = () => …`): that definition's whole. */
const DECLARATIONS = new Set(["lexical_declaration", "variable_declaration"]);
/** Python's statements and clauses whose block is theirs: the block's whole is the statement, its header with it. */
const CLAUSES = new Set([
  "if_statement",
  "elif_clause",
  "else_clause",
  "for_statement",
  "while_statement",
  "with_statement",
  "try_statement",
  "except_clause",
  "finally_clause",
  "case_clause",
]);

const isComment = (n: Node | null): boolean => !!n && /comment/.test(n.type);
const isComma = (n: Node | null): boolean => n?.type === ",";

/** A body's inside: between its braces where it ends in one (`{ … }`, Go's `struct { … }`), else the body. */
function inside(source: string, body: Node): [number, number] {
  const from = body.startIndex;
  const to = body.endIndex;
  if (source[to - 1] !== "}") return [from, to];
  const open = source.indexOf("{", from);
  return open >= 0 && open < to - 1 ? [open + 1, to - 1] : [from, to];
}

/** A definition's whole: with what wraps it (`export`, decorators, the declaration it's the one value of) and the
 *  decorators or attributes before it. */
function whole(node: Node): [number, number] {
  let n = node;
  for (let p = n.parent; p; p = n.parent) {
    if (WRAPPERS.has(p.type)) n = p;
    else if (
      p.type === "variable_declarator" &&
      p.childForFieldName("value")?.id === n.id &&
      p.parent &&
      DECLARATIONS.has(p.parent.type) &&
      p.parent.namedChildren.filter((c) => c?.type === "variable_declarator").length === 1
    )
      n = p.parent;
    else break;
  }
  let from = n.startIndex;
  for (let s = n.previousNamedSibling; s && LEADING.has(s.type); s = s.previousNamedSibling) from = s.startIndex;
  return [from, n.endIndex];
}

/** An argument's whole: with the comma between it and the next (or, the last, the one before it); among words a
 *  command takes (a shell's), with the space between it and its neighbour. */
function argumentWhole(n: Node): [number, number] {
  const next = n.nextSibling;
  const prev = n.previousSibling;
  if (isComma(next)) {
    const after = next!.nextSibling;
    if (after?.isNamed && !isComment(after)) return [n.startIndex, after.startIndex];
    // The last, with a comma after it (`f(\n  a,\n  b,\n)`): from the comma before it, the next line's bracket kept.
    return [isComma(prev) ? prev!.endIndex : n.startIndex, next!.endIndex];
  }
  if (isComma(prev)) return [prev!.previousSibling?.endIndex ?? prev!.startIndex, n.endIndex];
  if (next?.isNamed && !isComment(next)) return [n.startIndex, next.startIndex];
  if (prev?.isNamed && !isComment(prev) && !next) return [prev.endIndex, n.endIndex];
  return [n.startIndex, n.endIndex];
}

/** The text objects of a tree, by its grammar's query; offsets plus `base`. One a range, the one with a body kept. */
export function codeObjects(g: Loaded, root: Node, source: string, base = 0): CodeObject[] {
  if (!g.objects) return [];
  const out = new Map<string, CodeObject & { body: boolean }>();
  const add = (kind: CodeObject["kind"], [from, to]: [number, number], inner: [number, number], body: boolean) => {
    const key = `${kind}:${from}:${to}`;
    const had = out.get(key);
    if (had && (had.body || !body)) return;
    out.set(key, { kind, from: base + from, to: base + to, inner: [base + inner[0], base + inner[1]], body });
  };
  for (const m of g.objects.matches(root)) {
    const cap = (name: string) => m.captures.find((c) => c.name === name)?.node ?? null;
    const def = cap("function.around") ?? cap("class.around");
    if (def) {
      const kind = cap("function.around") ? "function" : "class";
      const body = cap(kind === "function" ? "function.inside" : "class.inside");
      const span = whole(def);
      add(kind, span, body ? inside(source, body) : span, !!body);
      continue;
    }
    const arg = cap("parameter.inside");
    if (arg) {
      if (!isComment(arg)) add("argument", argumentWhole(arg), [arg.startIndex, arg.endIndex], true);
      continue;
    }
    const block = cap("block");
    if (!block) continue;
    const owner = block.parent;
    // Python's block has no braces: its whole is the statement it's the block of, from its header line.
    if (g.grammar === "python" && owner && CLAUSES.has(owner.type))
      add("block", [owner.startIndex, owner.endIndex], [block.startIndex, block.endIndex], true);
    else add("block", [block.startIndex, block.endIndex], inside(source, block), true);
  }
  return [...out.values()].map(({ body: _, ...o }) => o).sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Every named node's range, in the order a walk meets them, one that covers just what its parent does left out; plus
 *  `base`. Walked with a cursor, never recursively: a deep tree can't overflow the stack. */
export function nodeRanges(root: Node, base = 0, out: number[] = []): number[] {
  const c = root.walk();
  const named: { depth: number; from: number; to: number }[] = [];
  let depth = 0;
  try {
    for (;;) {
      while (named.length && named[named.length - 1]!.depth >= depth) named.pop();
      if (c.nodeIsNamed) {
        const from = c.startIndex;
        const to = c.endIndex;
        const p = named[named.length - 1];
        if (to > from && (!p || p.from !== from || p.to !== to) && out.length < NODE_LIMIT * 2)
          out.push(base + from, base + to);
        named.push({ depth, from, to });
      }
      if (c.gotoFirstChild()) {
        depth++;
        continue;
      }
      while (!c.gotoNextSibling()) {
        if (!c.gotoParent()) return out;
        depth--;
      }
    }
  } finally {
    c.delete();
  }
}
