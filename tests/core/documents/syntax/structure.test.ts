import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import {
  type CodeObject,
  GRAMMARS,
  type Grammar,
  grammar,
  parseSyntax,
} from "../../../../src/core/documents/syntax/syntax.ts";
import { TEXTOBJECTS } from "../../../../src/core/documents/syntax/grammar/textobjects.ts";
import { stopSyntaxThread, structureOnThread } from "../../../../src/core/documents/syntax/syntax-thread.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

/** A source's text objects as the worker answers them, each as its text: its whole, then its inside. */
async function objects(g: Grammar, source: string, kind?: CodeObject["kind"]): Promise<[string, string][]> {
  const tree = parseSyntax((await grammar(g))!, source)!;
  try {
    return tree
      .structure()
      .objects.filter((o) => !kind || o.kind === kind)
      .map((o) => [source.slice(o.from, o.to), source.slice(o.inner[0], o.inner[1])]);
  } finally {
    tree.delete();
  }
}

describe("code's text objects, by a query per grammar (EG-D6)", () => {
  test("TypeScript: a function with its export, an arrow function with its declaration, a method with its decorator", async () => {
    const ts =
      "export function one(a: number, b = 2) {\n  return a;\n}\nconst two = (x) => x + 1;\nclass K {\n  @d m(y) {}\n}\n";
    expect(await objects("typescript", ts, "function")).toEqual([
      ["export function one(a: number, b = 2) {\n  return a;\n}", "\n  return a;\n"],
      ["const two = (x) => x + 1;", "x + 1"],
      ["@d m(y) {}", ""],
    ]);
  });
  test("TypeScript: a class, an interface, an enum and a type are classes and types; inside, between their braces", async () => {
    const ts =
      "class K<T> { a = 1; }\ninterface I { b: string }\nenum E { A }\ntype T = { c: 1 };\ntype U = string | number;\n";
    expect(await objects("typescript", ts, "class")).toEqual([
      ["class K<T> { a = 1; }", " a = 1; "],
      ["interface I { b: string }", " b: string "],
      ["enum E { A }", " A "],
      ["type T = { c: 1 };", " c: 1 "],
      ["type U = string | number;", "string | number"],
    ]);
  });
  test("an argument's whole takes the comma and the space before the next; the last's, the comma before it", async () => {
    const ts = "f(a, b, c);\ng(\n  x,\n  y,\n);\n";
    expect(await objects("typescript", ts, "argument")).toEqual([
      ["a, ", "a"],
      ["b, ", "b"],
      [", c", "c"],
      ["x,\n  ", "x"],
      ["\n  y,", "y"],
    ]);
  });
  test("a block is a statement block, its inside between its braces", async () => {
    expect(await objects("typescript", "if (a) {\n  b();\n}\n", "block")).toEqual([["{\n  b();\n}", "\n  b();\n"]]);
  });
  test("Python: a function with its decorators, its body inside; a class; a lambda; arguments", async () => {
    const py = "@dec\ndef f(a, b=2, *c):\n    return g(a)\n\nclass K(B):\n    x = 1\n\nh = lambda x, y: x\n";
    expect(await objects("python", py, "function")).toEqual([
      ["@dec\ndef f(a, b=2, *c):\n    return g(a)", "return g(a)"],
      ["lambda x, y: x", "x"],
    ]);
    expect(await objects("python", py, "class")).toEqual([["class K(B):\n    x = 1", "x = 1"]]);
    expect((await objects("python", py, "argument")).map(([whole]) => whole)).toEqual([
      "a, ",
      "b=2, ",
      ", *c",
      "a",
      "B",
      "x, ",
      ", y",
    ]);
  });
  test("Python: a block's whole is the statement it's the block of, its header line with it", async () => {
    const py = "def f(x):\n    if x:\n        return 1\n    for y in x:\n        pass\n";
    expect(await objects("python", py, "block")).toEqual([
      [
        "if x:\n        return 1\n    for y in x:\n        pass",
        "if x:\n        return 1\n    for y in x:\n        pass",
      ],
      ["if x:\n        return 1", "return 1"],
      ["for y in x:\n        pass", "pass"],
    ]);
  });
  test("Rust: a function with its attributes; structs, enums, traits and impls; a closure; arguments", async () => {
    const rs =
      "#[test]\n#[ignore]\nfn f(a: i32, b: u8) -> i32 { g(a, b) }\nstruct S { a: i32 }\nstruct U;\nimpl S {\n    fn m(&self) {}\n}\nfn main() { let c = |x| x; }\n";
    expect((await objects("rust", rs, "function")).map(([whole]) => whole)).toEqual([
      "#[test]\n#[ignore]\nfn f(a: i32, b: u8) -> i32 { g(a, b) }",
      "fn m(&self) {}",
      "fn main() { let c = |x| x; }",
      "|x| x",
    ]);
    expect(await objects("rust", rs, "class")).toEqual([
      ["struct S { a: i32 }", " a: i32 "],
      ["struct U;", "struct U;"],
      ["impl S {\n    fn m(&self) {}\n}", "\n    fn m(&self) {}\n"],
    ]);
    expect((await objects("rust", rs, "argument")).slice(0, 4)).toEqual([
      ["a: i32, ", "a: i32"],
      [", b: u8", "b: u8"],
      ["a, ", "a"],
      [", b", "b"],
    ]);
  });
  test("every grammar's query is one its grammar takes, and finds what its sample holds", async () => {
    const SAMPLES: Partial<Record<Grammar, string>> = {
      javascript: "function f(a) { return a; }\n",
      typescript: "function f(a: number) { return a; }\n",
      tsx: "const C = (p) => <div>{p.x}</div>;\n",
      python: "def f(a):\n    return a\n",
      rust: "fn f(a: i32) {}\n",
      go: "package p\nfunc f(a int) {}\n",
      c: "int f(int a) { return a; }\n",
      cpp: "int f(int a) { return a; }\n",
      lua: "local function f(a) return a end\n",
      ruby: "def f(a)\n  a\nend\n",
      bash: "f() { echo a; }\n",
      php: "<?php\nfunction f($a) { return $a; }\n",
      swift: "func f(a: Int) {}\n",
    };
    for (const g of GRAMMARS) {
      const loaded = (await grammar(g))!;
      expect(!!loaded.objects).toBe(!!TEXTOBJECTS[g]);
      const sample = SAMPLES[g];
      if (!sample) continue;
      const kinds = new Set(await kindsOf(g, sample));
      expect([g, kinds.has("function"), kinds.has("argument")]).toEqual([g, true, true]);
    }
  });
  test("a page's script and a component's are their language's, placed in the file", async () => {
    const vue = "<template><p>x</p></template>\n<script>\nexport default { m(a) { return a; } }\n</script>\n";
    expect(await objects("vue", vue, "function")).toEqual([["m(a) { return a; }", " return a; "]]);
  });
});

async function kindsOf(g: Grammar, source: string): Promise<string[]> {
  const tree = parseSyntax((await grammar(g))!, source)!;
  try {
    return tree.structure().objects.map((o) => o.kind);
  } finally {
    tree.delete();
  }
}

describe("code's nodes, for growing a selection (EG-D7)", () => {
  test("each named node's range once: one covering just what its parent does is left out", async () => {
    const src = "f(a);\n";
    const tree = parseSyntax((await grammar("typescript"))!, src)!;
    const nodes = [...tree.structure().nodes];
    tree.delete();
    const texts: string[] = [];
    for (let i = 0; i < nodes.length; i += 2) texts.push(src.slice(nodes[i], nodes[i + 1]));
    // program, the statement, the call, its name, its arguments, the argument: no range twice.
    expect(texts).toEqual(["f(a);\n", "f(a);", "f(a)", "f", "(a)", "a"]);
  });
  test("a fenced block's structure comes from the syntax thread alone, offsets in its own text", async () => {
    try {
      const s = await structureOnThread("python", "def f(a):\n    pass\n");
      expect(s.objects.map((o) => o.kind)).toEqual(["function", "argument", "block"]);
      expect(s.nodes).toBeInstanceOf(Int32Array);
    } finally {
      stopSyntaxThread();
    }
  });
});
