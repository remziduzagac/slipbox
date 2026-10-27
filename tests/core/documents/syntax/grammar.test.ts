import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";

import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("every grammar runs with this runtime (16.7)", () => {
  // What a grammar's external scanner handles — heredocs, docstrings, template and raw strings — is
  // where a grammar built for another ABI fails (bash's heredoc tripped an assertion once).
  const SAMPLES = {
    bash: ["f() {\n  cat <<NOTE > x\nhello $(date)\n# not a comment\nNOTE\n}\n", "f"],
    python: ['class A:\n    """doc\n    string"""\n    def m(self):\n        return f"{1}"\n', "A"],
    typescript: ["export class B {\n  m(): string { return `a\n${1}`; }\n}\n", "B"],
    tsx: ["function C() {\n  return <div>{`x`}</div>;\n}\n", "C"],
    javascript: ["function f() {\n  return /re/g;\n}\n", "f"],
    go: ["package m\n\nfunc F() string {\n\treturn `a\nb`\n}\n", "F"],
    rust: ['fn f() -> &\'static str {\n    r#"a\n"b"#\n}\n', "f"],
    lua: ["local function g()\n  return [[a\nb]]\nend\n", "g"],
    swift: ['struct S {\n  let t = """\n  a\n  """\n  func f() {}\n}\n', "S"],
    html: ['<h1 id="t">Title</h1>\n<script>\nfunction f() {}\n</script>\n', "Title"],
    css: ["/* a\n b */\n.a { color: red; }\n", ".a"],
    scss: ["// c\n@mixin m($x) { color: $x; }\n.a { &:hover { color: red; } }\n", "m"],
    php: ["<?php\nclass P {}\n$s = <<<EOT\nheredoc\nEOT;\n", "P"],
    dockerfile: ["FROM node:22 AS build\nRUN echo a \\\n  && echo b\n", "build (node:22)"],
    vue: ['<template><h1>{{ t }}</h1></template>\n<script setup lang="ts">\nconst t = `a\nb`\n</script>\n', "template"],
    svelte: ['<script>\n  let n = 0;\n</script>\n<h1 id="x">{n}</h1>\n', "script"],
    astro: ['---\nconst t = 1;\n---\n<h1 id="top">{t}</h1>\n', "frontmatter"],
    ruby: ["class R\n  X = <<~T\n    a\n  T\nend\n", "R"],
    c: ["int f(void) {\n  return 0;\n}\n", "f"],
    cpp: ['class K {\n  void m();\n};\nauto s = R"(a\nb)";\n', "K"],
  } as const;
  for (const [g, [src, first]] of Object.entries(SAMPLES)) {
    test(g, async () => {
      const { grammar, parseSyntax } = await import("../../../../src/core/documents/syntax/syntax.ts");
      const loaded = await grammar(g as Parameters<typeof grammar>[0]);
      expect(loaded).not.toBeNull();
      const tree = parseSyntax(loaded!, src)!;
      expect(tree.errors()).toEqual([]);
      expect(tree.outline()[0]?.name).toBe(first);
    });
  }
});

describe("more languages: Swift, the web's, PHP, Dockerfile, Ruby, C and C++ (16.18–16.23)", () => {
  const parsed = async (name: string, src: string) => {
    const { grammar, grammarFor, parseSyntax } = await import("../../../../src/core/documents/syntax/syntax.ts");
    const { classify, extensionOf } = await import("../../../../src/core/documents/model/filetypes.ts");
    const g = grammarFor(classify(name, ["md"]).format, extensionOf(name))!;
    return parseSyntax((await grammar(g))!, src)!;
  };
  const outline = (t: { outline(): { name: string; kind: string; line: number; depth: number }[] }) =>
    t.outline().map((o) => `${"  ".repeat(o.depth)}${o.kind} ${o.name} @${o.line}`);

  test("each language by its extension or its file's name; HTML parsed as HTML, XML and SVG not", async () => {
    const { grammarFor } = await import("../../../../src/core/documents/syntax/syntax.ts");
    const { classify, extensionOf } = await import("../../../../src/core/documents/model/filetypes.ts");
    const of = (name: string) => grammarFor(classify(name, ["md"]).format, extensionOf(name));
    expect(
      [
        "a.swift",
        "a.php",
        "a.scss",
        "a.css",
        "a.vue",
        "a.svelte",
        "a.astro",
        "a.rb",
        "Gemfile",
        "a.c",
        "a.h",
        "a.cpp",
        "a.hpp",
        "a.cc",
      ].map(of),
    ).toEqual(["swift", "php", "scss", "css", "vue", "svelte", "astro", "ruby", "ruby", "c", "c", "cpp", "cpp", "cpp"]);
    expect(["Dockerfile", "dockerfile", "Dockerfile.dev"].map(of)).toEqual(["dockerfile", "dockerfile", "dockerfile"]);
    expect(["a.html", "a.htm", "a.xml", "a.svg"].map(of)).toEqual(["html", "html", null, null]);
    expect(classify("a.html", ["md"]).format).toBe("xml"); // highlighted as highlight.js has it
  });

  test("outlines: Swift's kinds by their keyword, C's prototypes, C++'s methods, Ruby's self., PHP's traits, a Dockerfile's stages, CSS's rules", async () => {
    expect(
      outline(
        await parsed(
          "a.swift",
          "struct P {}\nclass A: B {\n  init() {}\n  func go(n: Int) -> Int { n }\n}\nextension A { func more() {} }\nprotocol Q { func q() }\nenum E { case a }\nactor C {}\n",
        ),
      ),
    ).toEqual([
      "struct P @1",
      "class A @2",
      "  init init @3",
      "  function go @4",
      "extension A @6",
      "  function more @6",
      "protocol Q @7",
      "  function q @7",
      "enum E @8",
      "actor C @9",
    ]);
    expect(
      outline(
        await parsed(
          "k.h",
          "struct route { int n; };\nint route_len(const struct route *r);\ndouble *coords(void);\ntypedef struct route R;\n",
        ),
      ),
    ).toEqual(["struct route @1", "function route_len @2", "function coords @3", "type R @4"]);
    expect(
      outline(
        await parsed(
          "a.cpp",
          "namespace ns {\nclass A : public B {\n public:\n  void go();\n  ~A();\n};\nvoid A::go() {}\n}\n",
        ),
      ),
    ).toEqual(["namespace ns @1", "  class A @2", "    method go @4", "    method ~A @5", "  function A::go @7"]);
    expect(
      outline(await parsed("a.rb", "module M\n  class A < B\n    def go; end\n    def self.make; end\n  end\nend\n")),
    ).toEqual(["module M @1", "  class A @2", "    method go @3", "    method self.make @4"]);
    expect(
      outline(
        await parsed(
          "a.php",
          "<?php\ninterface I {}\ntrait T { function t() {} }\nenum E { case A; }\nfunction f() {}\n",
        ),
      ),
    ).toEqual(["interface I @2", "trait T @3", "  method t @3", "enum E @4", "function f @5"]);
    expect(
      outline(await parsed("Dockerfile", "FROM node:22 AS build\nRUN x\nFROM nginx:1.27\nCOPY --from=build /a /b\n")),
    ).toEqual(["stage build (node:22) @1", "stage nginx:1.27 @3"]);
    expect(
      outline(
        await parsed(
          "a.scss",
          "@mixin m($x) { color: $x; }\n.card {\n  .title, .sub { margin: 0; }\n}\n@media (max-width: 600px) { .card { padding: 0; } }\n",
        ),
      ),
    ).toEqual([
      "mixin m @1",
      "rule .card @2",
      "  rule .title, .sub @3",
      "media @media (max-width: 600px) @5",
      "  rule .card @5",
    ]);
  });

  test("a page (16.19, 16.22): its headings and ids; its script and style parsed as theirs — their definitions under them, their lines highlighted so", async () => {
    const src =
      '<html>\n<style>\n  h1 { color: red }\n</style>\n<h1 id="top">Title</h1>\n<section id="about"><h2>About</h2></section>\n<script type="module">\n  // see notes.md\n  function go() {}\n</script>\n<script type="application/json">\n  {"a": 1}\n</script>\n</html>\n';
    const t = await parsed("a.html", src);
    expect(outline(t)).toEqual([
      "section style @2",
      "  rule h1 @3",
      "h1 Title @5",
      "id #about @6",
      "  h2 About @6",
      'section script type="module" @7',
      "  function go @9",
      'section script type="application/json" @11',
    ]);
    // Each part's lines in its language; JSON's highlighted, not parsed; the tags' own lines the page's.
    expect([...t.languages()]).toEqual([
      [3, "css"],
      [8, "javascript"],
      [9, "javascript"],
      [12, "json"],
    ]);
    // A part's comment, where it is in the file.
    expect(t.comments().map((c) => [c.line, c.column, c.text])).toEqual([[8, 2, "// see notes.md"]]);
    // A part on its tag's own line: its columns from where it starts there.
    const one = await parsed("b.html", "<p>x</p>\n<script>/* see a.md */ function h() {}</script>\n");
    expect(one.comments().map((c) => [c.line, c.column])).toEqual([[2, 8]]);
    expect(outline(one)).toEqual(["section script @2", "  function h @2"]);
    const bad = await parsed("c.html", "<p>x</p>\n<script>let x = ;</script>\n");
    expect(bad.errors().map((e) => [e.line, e.from])).toEqual([[2, 14]]); // the assignment with nothing after it, past the tag
  });

  test("a component's grammar is ready only with its parts' (a fresh process: nothing loaded before)", () => {
    // TypeScript's grammar made slow to load: the component's own is ready long before it.
    const script = `
      const wts = await import("web-tree-sitter");
      const load = wts.Language.load.bind(wts.Language);
      wts.Language.load = async (p) => (String(p).includes("typescript") ? await new Promise((r) => setTimeout(r, 300)) : null, load(p));
      const { grammarNow } = await import(${JSON.stringify(join(import.meta.dir, "../../../..", "src", "core", "documents", "syntax", "syntax.ts"))});
      for (let i = 0; i < 2000 && !grammarNow("vue"); i++) await new Promise((r) => setTimeout(r, 1));
      console.log(JSON.stringify([!!grammarNow("vue"), !!grammarNow("typescript"), !!grammarNow("scss")]));`;
    const r = Bun.spawnSync([process.execPath, "-e", script], { cwd: join(import.meta.dir, "../../../..") });
    expect(JSON.parse(r.stdout.toString().trim())).toEqual([true, true, true]);
  });

  test("components (16.22): Vue's template, script and style; Svelte's; Astro's frontmatter — each part in its language, placed in the file", async () => {
    const vue = await parsed(
      "C.vue",
      '<template>\n  <h2 id="card">{{ title }}</h2>\n</template>\n<script setup lang="ts">\nconst s = `a\nb`;\nfunction go(): void {}\n</script>\n<style lang="scss">\n.a { .b { color: red; } }\n</style>\n',
    );
    expect(outline(vue)).toEqual([
      "section template @1",
      "  h2 {{ title }} @2",
      'section script setup lang="ts" @4',
      "  function go @7",
      'section style lang="scss" @9',
      "  rule .a @10",
      "    rule .b @10",
    ]);
    expect([...vue.languages()]).toEqual([
      [5, "typescript"],
      [6, "typescript"],
      [7, "typescript"],
      [10, "scss"],
    ]);
    // A template string spanning lines, inside the script: a string, at its place in the file.
    expect(vue.spans()).toEqual([
      { line: 5, from: 10, to: Number.POSITIVE_INFINITY, kind: "string" },
      { line: 6, from: 0, to: 2, kind: "string" },
    ]);
    const svelte = await parsed(
      "C.svelte",
      '<script>\n  export let n = 0;\n  function inc() { n++ }\n</script>\n<h1 id="x">{n}</h1>\n<style>\n  h1 { color: red }\n</style>\n',
    );
    expect(outline(svelte)).toEqual([
      "section script @1",
      "  function inc @3",
      "h1 {n} @5",
      "section style @6",
      "  rule h1 @7",
    ]);
    expect([...svelte.languages()]).toEqual([
      [2, "javascript"],
      [3, "javascript"],
      [7, "css"],
    ]);
    const astro = await parsed(
      "P.astro",
      '---\ninterface Props { title: string }\nconst { title } = Astro.props;\n---\n<h1 id="top">{title}</h1>\n<script>\n  const n: number = 1;\n</script>\n',
    );
    expect(outline(astro)).toEqual([
      "section frontmatter @1",
      "  interface Props @2",
      "h1 {title} @5",
      "section script @6",
    ]);
    expect([...astro.languages()]).toEqual([
      [2, "typescript"],
      [3, "typescript"],
      [7, "typescript"],
    ]); // Astro's scripts are TypeScript
  });

  test("a part's syntax error is said where it is in the file; PHP's HTML highlighted as HTML", async () => {
    const vue = await parsed("C.vue", "<template><p>x</p></template>\n<script>\nconst a = ;\n</script>\n");
    expect(vue.errors().map((e) => [e.line, e.message])).toEqual([[3, "syntax error"]]);
    const php = await parsed(
      "a.php",
      "<!doctype html>\n<title>T</title>\n<?php echo 1; ?>\n<ul>\n<?php foreach ($a as $x): ?>\n  <li><?= $x ?></li>\n<?php endforeach; ?>\n</ul>\n",
    );
    expect([...php.languages()]).toEqual([
      [1, "xml"],
      [2, "xml"],
      [4, "xml"],
      [8, "xml"],
    ]);
  });

  test("the source view colours a part's lines in its language: a component's script as TypeScript, its template as markup", async () => {
    const { layoutSource } = await import("../../../../src/core/rendering/layout/code/source.ts");
    const src = '<template>\n  <p>const</p>\n</template>\n<script setup lang="ts">\nconst a = 1;\n</script>\n';
    const roles = (languageAt?: (line: number) => string | undefined) => {
      const l = layoutSource(src, {
        width: 80,
        wrap: false,
        headings: [],
        language: "vue",
        ...(languageAt ? { languageAt } : {}),
      });
      const word = (row: number) => l.lines[row]!.spans.find((sp) => sp.text.includes("const"))?.role ?? null;
      return [word(1), word(4)];
    };
    expect(roles((line) => (line === 5 ? "typescript" : undefined))).toEqual(["text", "syn_keyword"]); // a word in the template is text
    expect(roles()[1]).toBe("text"); // without the parts known: markup throughout
    // The same text laid out again once the parts are known (a buffer keeps its layout): the line is coloured anew.
    const { newSourceCache } = await import("../../../../src/core/rendering/layout/code/source.ts");
    const cache = newSourceCache();
    const opts = { width: 80, wrap: false, headings: [], language: "vue" };
    layoutSource(src, opts, cache);
    const again = layoutSource(
      src,
      { ...opts, languageAt: (line: number) => (line === 5 ? "typescript" : undefined) },
      cache,
    );
    expect(again.lines[4]!.spans.find((sp) => sp.text.includes("const"))?.role).toBe("syn_keyword");
  });
});
