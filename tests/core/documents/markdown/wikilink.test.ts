import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { parseLegacy, parseMarkdown, visit } from "../../../../src/core/documents/markdown/parse.ts";
import type { WikiLink } from "../../../../src/core/documents/markdown/wikilink.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

// The converter (20.1) reads wikilinks by parseLegacy, the same parse as a note's since 21.3.
describe("wikilink syntax, as the converter reads it", () => {
  const links = (src: string) => {
    const out: WikiLink[] = [];
    visit(parseLegacy(src), (n) => {
      if ((n.type as string) === "wikiLink") out.push(n as unknown as WikiLink);
    });
    return out;
  };
  test("a note's parse reads them again (21.3): wikilinks and embeds", () => {
    const types: string[] = [];
    visit(parseMarkdown("[[Foo Bar|x]] ![[img.png]]").tree, (n) => void types.push(n.type));
    expect(types.filter((t) => t === "wikiLink")).toHaveLength(2);
  });
  test("targets, headings, blocks, aliases and embeds", () => {
    const [a, b, c, d] = links("[[Foo Bar|x]] ![[img.png]] [[n#Head]] [[n#^blk]]");
    expect(a).toMatchObject({ target: "Foo Bar", alias: "x", embed: false });
    expect(b).toMatchObject({ target: "img.png", embed: true });
    expect(c).toMatchObject({ target: "n", heading: "Head" });
    expect(d).toMatchObject({ target: "n", block: "blk" });
  });
  test("a block is `#^id`, or a bare `^id` with no heading before it; a caret in a heading is the heading's", async () => {
    const { parseWikiTarget } = await import("../../../../src/core/documents/markdown/wikilink.ts");
    expect(parseWikiTarget("Complexity#O(n^2)")).toMatchObject({
      target: "Complexity",
      heading: "O(n^2)",
      block: null,
    });
    expect(parseWikiTarget("f^(n)|deriv")).toMatchObject({
      target: "f^(n)",
      heading: null,
      block: null,
      alias: "deriv",
    });
    expect(parseWikiTarget("note^abc")).toMatchObject({ target: "note", block: "abc" });
    expect(parseWikiTarget("note#^abc")).toMatchObject({ target: "note", heading: null, block: "abc" });
    // The documented bare form: `x^2` is note x's block 2 (an id may be digits).
    expect(parseWikiTarget("x^2")).toMatchObject({ target: "x", block: "2" });
  });
  test("never inside code, never when escaped", () => {
    expect(links("`[[code]]` \\[[esc]]\n\n```\n[[fenced]]\n```\n")).toHaveLength(0);
  });
  test("escaped pipe in a table cell is an alias divider", () => {
    const [l] = links("| a |\n| - |\n| [[t\\|al]] |\n");
    expect(l).toMatchObject({ target: "t", alias: "al" });
  });
  test("source positions", () => {
    const [l] = links("ab [[x]]");
    expect(l!.position!.start.column).toBe(4);
  });
});
