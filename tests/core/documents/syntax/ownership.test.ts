import { expect, test } from "bun:test";
import { grammar, grammarNow, parseSyntax } from "../../../../src/core/documents/syntax/syntax.ts";

test("grammar requests share the cached parser and wait for embedded languages", async () => {
  const [first, second] = await Promise.all([grammar("html"), grammar("html")]);
  expect(first).toBe(second);
  expect(grammarNow("html")).toBe(first);
  for (const name of ["javascript", "css"] as const) {
    const loaded = await grammar(name);
    expect(grammarNow(name)).toBe(loaded);
    expect(loaded?.parser).toBe((await grammar(name))?.parser);
  }
});

test("a parse frees embedded trees in source order before its own tree", async () => {
  const html = (await grammar("html"))!;
  const embedded = await Promise.all([grammar("javascript"), grammar("css")]);
  const freed: string[] = [];
  const restore: (() => void)[] = [];
  try {
    for (const loaded of embedded) {
      const g = loaded!;
      const original = g.parser.parse;
      g.parser.parse = function (...args) {
        const tree = original.apply(this, args);
        if (tree) {
          const dispose = tree.delete;
          tree.delete = function () {
            freed.push(g.grammar);
            dispose.call(this);
          };
        }
        return tree;
      };
      restore.push(() => {
        g.parser.parse = original;
      });
    }
    const parsed = parseSyntax(html, "<script>function f() {}</script>\n<style>.a {color: red}</style>")!;
    const dispose = parsed.tree.delete;
    parsed.tree.delete = function () {
      freed.push("owner");
      dispose.call(this);
    };
    try {
      expect(parsed.outline().map((entry) => entry.name)).toEqual(["script", "f", "style", ".a"]);
    } finally {
      parsed.delete();
    }
    expect(freed).toEqual(["javascript", "css", "owner"]);
    // Unsupported grammars are rejected before touching a disposed tree.
    expect(parsed.codeModel()).toBeNull();
  } finally {
    for (const undo of restore) undo();
  }
});
