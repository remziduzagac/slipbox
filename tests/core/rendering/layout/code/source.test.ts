import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { layoutSource, newSourceCache } from "../../../../../src/core/rendering/layout/code/source.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("source layout (4.13)", () => {
  const text = (l: { spans: { text: string }[] }) => l.spans.map((s) => s.text).join("");
  test("a row per source line; tabs, wide characters and controls map back to exact offsets", () => {
    const L = layoutSource("a\tb\n漢x\n\x1b[31mred\r\nend\n", { width: 80, wrap: true, headings: [] });
    expect(L.lines.map((l) => l.src)).toEqual([1, 2, 3, 4]);
    expect(text(L.lines[0]!)).toBe("a   b"); // the tab to the next stop
    expect(L.lines[0]!.srcMap!.cells).toEqual([0, 1, 1, 1, 2]); // every tab cell maps to the tab
    expect(L.lines[1]!.srcMap).toEqual({ cells: [0, 1], end: 2 }); // one cell, two columns wide
    expect(text(L.lines[2]!)).toBe("�[31mred"); // never a raw escape; no CR shown
    expect(L.lines[2]!.srcMap!.end).toBe(8);
  });
  test("source fences use their language, keep their text, and recolour cached lines after a language edit", async () => {
    const { newSourceCache } = await import("../../../../../src/core/rendering/layout/code/source.ts");
    const cache = newSourceCache();
    const opts = { width: 80, wrap: true, headings: "scan" as const };
    const source = "~~~ts\nconst answer = 42;\n~~~\n# After\n";
    const first = layoutSource(source, opts, cache);
    expect(first.lines[1]!.spans).toContainEqual(expect.objectContaining({ text: "const", role: "syn_keyword" }));
    expect(first.lines.map(text)).toEqual(["~~~ts", "const answer = 42;", "~~~", "# After"]);
    const changed = layoutSource(source.replace("~~~ts", "~~~unknown-language"), opts, cache);
    expect(changed.lines[1]!.spans.every((span) => span.role === "code_block")).toBe(true);
    expect(changed).toEqual(layoutSource(source.replace("~~~ts", "~~~unknown-language"), opts));
    expect(changed.headings.map((h) => h.text)).toEqual(["After"]);
  });
  test("wrapping at the last space; each row knows where the next begins", () => {
    const L = layoutSource("one two three four\n", { width: 9, wrap: true, headings: [] });
    expect(L.lines.map(text)).toEqual(["one two ", "three ", "four"]);
    expect(L.lines.map((l) => l.srcMap!.end)).toEqual([8, 14, 18]);
    expect(L.lines.every((l) => l.src === 1)).toBe(true);
    const nowrap = layoutSource("one two three four\n", { width: 9, wrap: false, headings: [] });
    expect(nowrap.lines.length).toBe(1);
    expect(nowrap.width).toBe(19);
  });
  test("light highlighting, and headings placed on their rows", () => {
    const src = "---\ntitle: x\n---\n# Head\n\n- [ ] task `code` [link](l.md)\n```ts\nconst a = 1;\n```\n";
    const L = layoutSource(src, {
      width: 80,
      wrap: true,
      headings: [{ level: 1, text: "Head", slug: "head", src: 4 }],
    });
    const roleAt = (row: number, col: number) => {
      let x = 0;
      for (const s of L.lines[row]!.spans) {
        if (col < x + s.text.length) return s.role;
        x += s.text.length;
      }
      return null;
    };
    expect(roleAt(1, 0)).toBe("fm_key");
    expect(roleAt(3, 0)).toBe("h1");
    expect(roleAt(5, 0)).toBe("list_marker");
    expect(roleAt(5, 2)).toBe("check_todo");
    expect(roleAt(5, 13)).toBe("code_inline");
    expect(roleAt(5, 20)).toBe("link");
    expect(roleAt(6, 0)).toBe("code_label");
    expect(roleAt(7, 0)).toBe("syn_keyword");
    expect(L.headings).toEqual([{ level: 1, text: "Head", slug: "head", src: 4, line: 3 }]);
    expect(L.lines[3]!.heading).toBe(0);
  });
});

describe("the incremental source layout (15.1)", () => {
  test("after any edit, reusing the last layout's lines gives exactly a fresh layout", async () => {
    const { layoutSource, newSourceCache, scanHeadings } = await import(
      "../../../../../src/core/rendering/layout/code/source.ts"
    );
    let seed = 5;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = [
      "",
      "text",
      "# Heading",
      "- [ ] task",
      "```",
      "~~~",
      "---",
      "> quote `code`",
      "[[link]] and [md](x.md)",
      "\t tab\there",
      "漢字の行",
      "a long line that will wrap at the narrow width we use for this test",
    ];
    for (const width of [12, 40]) {
      for (const wrap of [true, false]) {
        const cache = newSourceCache();
        let lines = Array.from({ length: 30 }, () => pieces[rand(pieces.length)]!);
        for (let step = 0; step < 300; step++) {
          const at = rand(lines.length + 1);
          const r = rand(4);
          if (r === 0)
            lines.splice(at, 0, pieces[rand(pieces.length)]!); // a line added
          else if (r === 1 && lines.length > 1)
            lines.splice(Math.min(at, lines.length - 1), 1); // taken away
          else if (at < lines.length)
            lines[at] = `${lines[at]}${pieces[rand(pieces.length)]!.slice(0, 3)}`; // typed into
          else lines = [pieces[rand(pieces.length)]!, ...lines];
          const text = `${lines.join("\n")}\n`;
          const opts = { width, wrap, headings: scanHeadings(text) };
          const inc = layoutSource(text, { ...opts, headings: "scan" as const }, cache);
          const fresh = layoutSource(text, opts);
          // Headings found line by line as the layout goes are the scan's of the whole text.
          expect(JSON.stringify(inc)).toBe(JSON.stringify(fresh));
        }
      }
    }
  });
});

test("source fences retain shading and multiline syntax after edits", () => {
  const cache = newSourceCache();
  const text = "```js\n/* first\ncontinued */\nconst x = 1;\n```\n\n```mermaid\ngraph LR\n```";
  const layout = (source: string) => layoutSource(source, { width: 80, wrap: true, headings: "scan" }, cache);
  let rows = layout(text).lines;
  expect(rows[2]!.fill).toBe("code_block");
  expect(rows[2]!.spans.every((span) => span.role === "syn_comment")).toBe(true);
  expect(rows[3]!.spans.some((span) => span.role === "code_block")).toBe(true);
  expect(rows[7]!.spans.every((span) => span.role === "code_block")).toBe(true);
  rows = layout(text.replace("/* first", "// first")).lines;
  expect(rows[2]!.spans.some((span) => span.role !== "syn_comment")).toBe(true);
});
