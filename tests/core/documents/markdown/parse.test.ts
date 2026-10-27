import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newParseCache, noteChunks, parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { listTasks } from "../../../../src/core/documents/editing/tasks.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("the chunked parse (15.1)", () => {
  const strip = (t: unknown) => JSON.stringify(t, (k, v) => (k === "offset" ? undefined : v));
  // Chunks as small as they can be (a split at every place one is allowed), and the usual size.
  const same = (text: string) => {
    const whole = parseMarkdown(text, undefined, { whole: true });
    for (const chunkLines of [1, 3, undefined]) {
      const chunked = parseMarkdown(text, undefined, { chunkLines });
      expect(strip(chunked.tree.children)).toBe(strip(whole.tree.children));
      expect(strip(chunked.frontmatter)).toBe(strip(whole.frontmatter));
    }
  };
  test("every demo and fixture note parses in chunks exactly as whole", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".md") ? [join(d, f)] : [],
      );
    const files = [
      ...walk(join(import.meta.dir, "../../../..", "examples", "vault")),
      ...walk(join(import.meta.dir, "../../../fixtures", "vault")),
    ];
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) same(readFileSync(f, "utf8"));
  });
  test("what crosses a chunk: references, footnotes, HTML comments, fences, frontmatter, lists", () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n\n");
    same(
      `---\ntitle: T\n---\n\n# A\n\nSee [the ref][r] and [Other] and a note[^n] and [^Two].\n\n${filler(30)}\n\n# B\n\n[r]: https://example.invalid\n[other]: /x\n\n[^n]: The footnote.\n[^two]: Two.\n`,
    );
    same(
      `# A\n\n${filler(30)}\n\n<!-- a comment\n\n# not a heading\n\n-->\n\n# C\n\n${filler(30)}\n\n\`\`\`\n${filler(30)}\n\n# in code\n\`\`\`\n\n# D\n\nend\n`,
    );
    same(`# A\n\n- one\n\n- two\n${filler(30)}\n\n# B\n\n1. x\n\n2. y\n\n> quote\n\n# C\n\n| a |\n| - |\n| 1 |\n`);
    same(`+++\ntitle = "T"\n+++\n\n# A\n\n${filler(40)}\n\n# B\n\ntext\n`);
    same(`# A\n\n${filler(40)}\n# B right after text\n\n${filler(40)}\n\n    # indented: code\n\n# C\n`);
    // Lists cut anywhere: tight, loose, nested, lazy lines, other markers, ordered, tasks.
    same(
      "- a\n- b\n  - nested\n- c\nlazy line\n- d\n\n- loose e\n\n\n- f\n* star list\n* g\n+ plus\n\n1. one\n2. two\n3) paren\n\n- [ ] task\n- [x] done\n\ntext after\n- list interrupting text\n",
    );
    same(
      "1. a\n\n   para in item\n2. b\n\n10. c\n- x\n\n> - quoted list\n> - more\n\n- item\n\n      indented code in item\n- after\n",
    );
    // Maths (12.11): a `$$` block across blank lines and what looks like a heading; `$$x$$` on a line is text.
    same(
      `# A\n\n${filler(30)}\n\n$$\na = b\n\n# not a heading\n\nc = d\n$$\n\n# B\n\n$$x$$ then\n\n${filler(30)}\n\n# C\n\n$$$ meta\n\n$$\n\n# still maths\n$$$\n\nend\n`,
    );
    // `$$x$$` on its line opens nothing: the note still parses in pieces after it.
    expect(noteChunks(`$$x$$\n\n${filler(60)}\n\n# B\n\n${filler(60)}\n`).length).toBeGreaterThan(1);
    // Obsidian's comment over blank lines (DF-D17), across chunks' edges: one block, as in the whole note.
    const comment = `# A\n\n${filler(30)}\n\n%%\nA comment\n\n${filler(30)}\n\n# B in it\n\n- a list, closing it\n%%\n\n# C\n\nend %%inline%% ==mark==\n`;
    same(comment);
    expect(noteChunks(comment).length).toBeGreaterThan(1);
    expect(parseMarkdown(comment).tree.children.map((n) => n.type)).toEqual([
      "heading",
      ...Array(30).fill("paragraph"),
      "commentBlock",
      "heading",
      "paragraph",
    ]);
  });
  test("random documents parse in chunks exactly as whole", () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = [
      "",
      "",
      "",
      "text",
      "more text",
      "# Head",
      "## Sub",
      "- item",
      "- [ ] task",
      "* star",
      "+ plus",
      "1. one",
      "2) two",
      "  - nested",
      "  continued",
      "    indented",
      "> quote",
      "> - quoted item",
      "```",
      "~~~",
      "<!-- c",
      "-->",
      "<div>",
      "</div>",
      "| a | b |",
      "| - | - |",
      "---",
      "===",
      "[ref]: /x",
      "[^n]: note",
      "see [ref] and [^n]",
      "\ttab",
      "- ",
      "<script>",
      "</script>",
      "lazy",
      "1.",
      "10. ten",
      "Title",
      "-----",
      "=====",
      "> > deep",
      ">",
      "<p>para</p>",
      "<span>",
      "<?php",
      "?>",
      "<![CDATA[",
      "]]>",
      "    [^n]: indented",
      "[^m]: m",
      "  more of note",
      "***",
      "- a\r",
      "text\r",
      "  | x |",
      "1) a",
      "3. c",
      "- - double",
      "#",
      "#notheading",
      "<!-- one line -->",
      "<style>",
      "</style>",
      "~~~~",
      "````",
      '[x]: <y> "t"',
      "[X]",
      "[^M]",
      "$$",
      "$$x$$",
      "$$$",
      "$a$ and $5",
      "  $$",
    ];
    // (40,000 of these, four seeds, ran clean when this was written; a thousand stay in the suite.)
    for (let doc = 0; doc < 1000; doc++) {
      const text = `${Array.from({ length: 5 + rand(60) }, () => pieces[rand(pieces.length)]!).join("\n")}\n`;
      const whole = strip(parseMarkdown(text, undefined, { whole: true }).tree.children);
      for (const chunkLines of [1, 4]) {
        const got = strip(parseMarkdown(text, undefined, { chunkLines }).tree.children);
        if (got !== whole) throw new Error(`differs at chunkLines ${chunkLines}:\n${text}`);
      }
    }
  });
  test("a cache gives the same tree as a fresh parse, edit after edit", () => {
    const cache = newParseCache();
    let text =
      Array.from(
        { length: 12 },
        (_, i) =>
          `# Section ${i}\n\n${Array.from({ length: 45 }, (_, k) => `para ${i}.${k} with [[link]] and [ref]`).join("\n\n")}\n`,
      ).join("\n") + "\n[ref]: x\n";
    for (let step = 0; step < 40; step++) {
      const at = (step * 7919) % text.length;
      text =
        step % 3 === 0
          ? `${text.slice(0, at)}\n\nnew para ${step}\n\n${text.slice(at)}`
          : step % 3 === 1
            ? `${text.slice(0, at)}x${text.slice(at)}`
            : text.slice(0, at) + text.slice(at + 5);
      expect(strip(parseMarkdown(text, cache).tree.children)).toBe(
        strip(parseMarkdown(text, undefined, { whole: true }).tree.children),
      );
    }
  });
});

describe("parseAround (15.1)", () => {
  test("the tasks of one line's chunk are the whole parse's there", async () => {
    const { parseAround } = await import("../../../../src/core/documents/markdown/parse.ts");
    const text = [
      "# Tasks",
      "",
      ...Array.from({ length: 300 }, (_, i) =>
        i % 50 === 7 ? "```\n- [ ] not a task, in code\n```" : `- [${i % 3 ? " " : "x"}] task ${i}`,
      ),
      "",
      "<!--",
      "- [ ] in a comment",
      "-->",
      "",
      ...Array.from({ length: 100 }, (_, i) => `${i + 1}. [ ] numbered ${i}`),
    ].join("\n");
    const whole = listTasks(parseMarkdown(text, undefined, { whole: true }).tree);
    const byLine = new Map(whole.map((t) => [t.line, t]));
    const lines = text.split("\n").length;
    for (let line = 1; line <= lines; line++) {
      const near = listTasks(parseAround(text, line)).find((t) => t.line === line);
      expect(near).toEqual(byLine.get(line));
    }
  });
});
