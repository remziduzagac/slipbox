import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import {
  enclosing,
  insideAsLines,
  lineStarts,
  nextStart,
  noteStructure,
  objectAt,
  type Piece,
  wordAt,
} from "../../../../src/core/documents/editing/structure.ts";

const structure = (source: string) => noteStructure(source, parseMarkdown(source).tree);

/** The object `ch` at the first place `marker` is found (or `at`), as `i` and `a` take it: their text, and how. */
function object(source: string, ch: "h" | "l" | "o" | "k", where: string | number, count = 1) {
  const at = typeof where === "number" ? where : source.indexOf(where);
  const s = structure(source);
  const found = objectAt(
    source,
    s.objects.filter((o) => o.kind === ch),
    at,
    count,
    { ahead: ch === "k" },
  );
  const text = (p: Piece | null | undefined) => (p ? [source.slice(p.from, p.to), p.linewise] : null);
  return { a: text(found?.outer), i: text(found?.inner) };
}

const NOTE = `# Plan

Intro with a [link](a.md) here.

## Steps

- [ ] first step
- second
  - nested one
- third

\`\`\`ts
const a = 1;
const b = 2;
\`\`\`

## Notes

Last words.
`;

describe("a note's text objects (EG-D6)", () => {
  test("h: a section, its heading to the next of its level or higher; i h without the heading", () => {
    expect(object(NOTE, "h", "first step")).toEqual({
      a: [NOTE.slice(NOTE.indexOf("## Steps"), NOTE.indexOf("## Notes")), true],
      i: [NOTE.slice(NOTE.indexOf("## Steps") + "## Steps\n".length, NOTE.indexOf("## Notes")), true],
    });
    // On the heading's own line, the section it heads; the last runs to the end.
    expect(object(NOTE, "h", "## Notes").a).toEqual([NOTE.slice(NOTE.indexOf("## Notes")), true]);
    // A count: the one around it, the level-one section, which holds both.
    expect(object(NOTE, "h", "first step", 2).a).toEqual([NOTE, true]);
  });
  test("h: a section with nothing under its heading has no inside; before the first heading, no section", () => {
    const empty = "# A\n## B\n";
    expect(object(empty, "h", "## B")).toEqual({ a: ["## B\n", true], i: null });
    expect(object("text\n# A\n", "h", "text")).toEqual({ a: null, i: null });
  });
  test("h: a setext heading's two lines are its heading", () => {
    const setext = "Title\n=====\n\nbody\n";
    expect(object(setext, "h", "body")).toEqual({ a: [setext, true], i: ["\nbody\n", true] });
  });
  test("l: a list item, its lines whole; i l its own text, without its marker or its task box, nor what's nested", () => {
    expect(object(NOTE, "l", "first step")).toEqual({ a: ["- [ ] first step\n", true], i: ["first step", false] });
    expect(object(NOTE, "l", "second")).toEqual({ a: ["- second\n  - nested one\n", true], i: ["second", false] });
    expect(object(NOTE, "l", "nested one")).toEqual({ a: ["  - nested one\n", true], i: ["nested one", false] });
    // A count: the item it's nested in.
    expect(object(NOTE, "l", "nested one", 2).i).toEqual(["second", false]);
    // An ordered one, and one in a quote.
    expect(object("1. one\n2. two\n", "l", "two")).toEqual({ a: ["2. two\n", true], i: ["two", false] });
    expect(object("> - quoted\n", "l", "quoted").a).toEqual(["> - quoted\n", true]);
  });
  test("l: an item sharing its line with the one it's nested in is taken by its characters", () => {
    expect(object("- - inner\n", "l", "inner")).toEqual({ a: ["- inner", false], i: ["inner", false] });
  });
  test("o: a fenced block, its fences' lines whole; i o the lines between", () => {
    expect(object(NOTE, "o", "const b")).toEqual({
      a: ["```ts\nconst a = 1;\nconst b = 2;\n```\n", true],
      i: ["const a = 1;\nconst b = 2;\n", true],
    });
    // On a fence's own line too; an unclosed one runs to the end; an empty one has no inside.
    expect(object(NOTE, "o", "```ts").i).toEqual(["const a = 1;\nconst b = 2;\n", true]);
    expect(object("```\nopen\n", "o", "open").i).toEqual(["open\n", true]);
    expect(object("```\n```\n", "o", 0)).toEqual({ a: ["```\n```\n", true], i: null });
  });
  test("o: a fenced block in a list item takes its own lines, with their indent", () => {
    const listed = "- item\n\n  ```py\n  x = 1\n  ```\n";
    expect(object(listed, "o", "x = 1")).toEqual({ a: ["  ```py\n  x = 1\n  ```\n", true], i: ["  x = 1\n", true] });
  });
  test("k: a link, i k its text — a wikilink's alias or target, an image's alt, an autolink's address", () => {
    expect(object(NOTE, "k", "link")).toEqual({ a: ["[link](a.md)", false], i: ["link", false] });
    const links =
      "See [[target|Alias]], [[plain]], ![a cat](c.png), [ref text][r], <https://x.y> and https://z.w\n\n[r]: u.md\n";
    expect(object(links, "k", "Alias").i).toEqual(["Alias", false]);
    expect(object(links, "k", "plain")).toEqual({ a: ["[[plain]]", false], i: ["plain", false] });
    expect(object(links, "k", "a cat")).toEqual({ a: ["![a cat](c.png)", false], i: ["a cat", false] });
    expect(object(links, "k", "ref text").i).toEqual(["ref text", false]);
    expect(object(links, "k", "https://x").a).toEqual(["<https://x.y>", false]);
    expect(object(links, "k", "https://z").i).toEqual(["https://z.w", false]);
    // Off a link: the next on the line, as vim finds quotes; none after it, none at all.
    expect(object(links, "k", 0).a).toEqual(["[[target|Alias]]", false]);
    expect(object("[a](b)\nplain line\n", "k", "plain").a).toBeNull();
    // `[](url)`: nothing inside, just after its bracket.
    const bare = "[](u.md)\n";
    expect(object(bare, "k", 0).i).toEqual(["", false]);
  });
  test("k: a link in a heading is one too", () => {
    expect(object("# See [[here]]\n", "k", "here").i).toEqual(["here", false]);
  });
});

describe("the inside of code's objects, as i takes it", () => {
  const inside = (source: string, from: string, to: string) => {
    const a = source.indexOf(from) + from.length;
    const p = insideAsLines(source, lineStarts(source), { from: a, to: source.indexOf(to, a) });
    return [source.slice(p.from, p.to), p.linewise];
  };
  test("braces on lines of their own: the lines between, whole", () => {
    expect(inside("f() {\n  a();\n  b();\n}\n", "{", "}")).toEqual(["  a();\n  b();\n", true]);
    // In a quote's fenced block, its `>` before them.
    expect(inside("> f() {\n>   a();\n> }\n", "{", "}")).toEqual([">   a();\n", true]);
  });
  test("braces on one line, or around nothing: the characters between", () => {
    expect(inside("f() { a(); }\n", "{", "}")).toEqual([" a(); ", false]);
    expect(inside("f() {}\n", "{", "}")).toEqual(["", false]);
  });
  test("an inside that starts its line and ends at its end (Python's block): its lines", () => {
    const py = "def f():\n    a()\n    b()\n";
    const p = insideAsLines(py, lineStarts(py), { from: py.indexOf("a()"), to: py.indexOf("b()") + 3 });
    expect([py.slice(p.from, p.to), p.linewise]).toEqual(["    a()\n    b()\n", true]);
    const quoted = "> def f():\n>     a()\n";
    const at = quoted.indexOf("a()");
    const q = insideAsLines(quoted, lineStarts(quoted), { from: at, to: at + 3 });
    expect([quoted.slice(q.from, q.to), q.linewise]).toEqual([">     a()\n", true]);
  });
});

describe("jumps and growing (EG-D6, EG-D7)", () => {
  test("the next start after the cursor, the one before it, a count, none past the ends", () => {
    expect(nextStart([30, 10, 20], 10, 1)).toBe(20);
    expect(nextStart([30, 10, 20], 25, -1)).toBe(20);
    expect(nextStart([30, 10, 20], 0, 1, 2)).toBe(20);
    expect(nextStart([30, 10, 20], 0, 1, 9)).toBe(30);
    expect(nextStart([30, 10, 20], 30, 1)).toBeNull();
    expect(nextStart([30, 10, 20], 10, -1)).toBeNull();
  });
  test("the smallest node around a selection and larger than it; none past the top", () => {
    const nodes = [
      { from: 0, to: 100 },
      { from: 10, to: 20 },
      { from: 10, to: 50 },
    ];
    expect(enclosing(nodes, { from: 12, to: 15 })).toEqual({ from: 10, to: 20 });
    expect(enclosing(nodes, { from: 10, to: 20 })).toEqual({ from: 10, to: 50 });
    expect(enclosing(nodes, { from: 0, to: 100 })).toBeNull();
  });
  test("a note grows from a word through its link, paragraph and section to the note", () => {
    const s = structure(NOTE);
    const word = wordAt(NOTE, NOTE.indexOf("ink"))!;
    const steps = [NOTE.slice(word.from, word.to)];
    for (let sel = word, next = enclosing(s.nodes, sel); next; sel = next, next = enclosing(s.nodes, sel))
      steps.push(NOTE.slice(next.from, next.to));
    expect(steps).toEqual([
      "link",
      "[link](a.md)",
      "Intro with a [link](a.md) here.",
      // The level-one section, which is the whole note here.
      NOTE.trim(),
    ]);
  });
  test("a list item grows to its list, then its section; a fence's code to the fence", () => {
    const s = structure(NOTE);
    const grow = (from: string) => {
      const a = NOTE.indexOf(from);
      const next = enclosing(s.nodes, { from: a, to: a + from.length })!;
      return NOTE.slice(next.from, next.to);
    };
    expect(grow("nested one")).toBe("- nested one");
    expect(grow("- nested one")).toBe("- second\n  - nested one");
    expect(grow("const a = 1;\nconst b = 2;")).toBe("```ts\nconst a = 1;\nconst b = 2;\n```");
  });
  test("a word is letters, digits, underscores and marks; off one, none", () => {
    expect(wordAt("an é_x2 word", 4)).toEqual({ from: 3, to: 7 });
    expect(wordAt("a, b", 1)).toBeNull();
  });
});
