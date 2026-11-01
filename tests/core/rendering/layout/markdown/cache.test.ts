import { describe, expect, test } from "bun:test";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
import { makeRenderSandbox } from "../../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("highlighting: languages and the cache's bounds (15.1)", () => {
  test("a language known or not; a block highlighted again once thousands of others have pushed it out", async () => {
    const { hasLanguage, highlight } = await import("../../../../../src/core/rendering/layout/markdown/highlight.ts");
    expect(hasLanguage("ts")).toBe(true);
    expect(hasLanguage("python")).toBe(true);
    expect(hasLanguage("no-such-language")).toBe(false);
    const first = highlight("let first = 0;", "ts")!;
    expect(highlight("let first = 0;", "ts")).toBe(first); // cached
    let last: ReturnType<typeof highlight> = null;
    for (let i = 0; i < 8000; i++) last = highlight(`let v${i} = ${i};`, "ts");
    const again = highlight("let first = 0;", "ts")!;
    expect(again).not.toBe(first); // the oldest went first
    expect(again).toEqual(first); // the same colours, worked out again
    expect(highlight("let v7999 = 7999;", "ts")).toBe(last); // the newest stayed
  });
});

describe("the render cache (15.1)", () => {
  test("rendering with the last render's blocks gives exactly a fresh render, edit after edit", async () => {
    const { newParseCache, parseMarkdown } = await import("../../../../../src/core/documents/markdown/parse.ts");
    const { newRenderCache, renderTree } = await import("../../../../../src/core/rendering/layout/markdown/render.ts");
    let seed = 3;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const blocksPool = [
      "# Heading",
      "## Sub [[link]]",
      "Some text with [ref] and [^fn] and **bold**.",
      "- [ ] task\n- [x] done\n  - nested",
      "```ts\nconst x = 1;\n```",
      `\`\`\`sh\necho ${"a long argument ".repeat(6)}\n\`\`\``,
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "> quote with [[other]]",
      "[ref]: https://example.invalid",
      "[^fn]: A footnote.",
      "1. one\n2. two",
      "<!-- comment -->",
      "---",
    ];
    const pcache = newParseCache();
    const rcache = newRenderCache();
    const blocks = Array.from({ length: 60 }, () => blocksPool[rand(blocksPool.length)]!);
    for (let step = 0; step < 120; step++) {
      const at = rand(blocks.length);
      const r = rand(3);
      if (r === 0) blocks.splice(at, 0, blocksPool[rand(blocksPool.length)]!);
      else if (r === 1 && blocks.length > 2) blocks.splice(at, 1);
      else blocks[at] = `${blocks[at]} more`;
      const text = `${blocks.join("\n\n")}\n`;
      // Options change now and then (each change drops the cache), not at every step (then nothing is reused).
      const opts = {
        width: [40, 80][Math.floor(step / 20) % 2]!,
        glyphs: glyphsFor("unicode"),
        showUrls: Math.floor(step / 30) % 2 === 1,
        codeScroll: Math.floor(step / 10) % 2 === 1,
      };
      const p = parseMarkdown(text, pcache);
      const cached = renderTree(p.tree, opts, p.frontmatter, rcache);
      const fresh = renderTree(parseMarkdown(text, undefined, { whole: true }).tree, opts, p.frontmatter);
      expect(JSON.stringify(cached)).toBe(JSON.stringify(fresh));
    }
  });
  test("a code block too wide, cached wrapped, is laid out again to scroll sideways, and back", async () => {
    const { newParseCache, parseMarkdown } = await import("../../../../../src/core/documents/markdown/parse.ts");
    const { newRenderCache, renderTree } = await import("../../../../../src/core/rendering/layout/markdown/render.ts");
    const text = `# Code\n\n\`\`\`sh\necho ${"a long argument ".repeat(6)}\n\`\`\`\n`;
    const pcache = newParseCache();
    const rcache = newRenderCache();
    for (const codeScroll of [false, true, false]) {
      const opts = { width: 40, glyphs: glyphsFor("unicode"), showUrls: false, codeScroll };
      const cached = renderTree(parseMarkdown(text, pcache).tree, opts, null, rcache);
      expect(JSON.stringify(cached)).toBe(JSON.stringify(renderTree(parseMarkdown(text).tree, opts, null)));
      expect(cached.lines.some((l) => l.scroll)).toBe(codeScroll);
    }
  });
});
