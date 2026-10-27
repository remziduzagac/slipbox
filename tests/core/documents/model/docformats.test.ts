import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { headingsOf, parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { layoutSource } from "../../../../src/core/rendering/layout/code/source.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("a reader per note format (16.2)", () => {
  test("markdown's reader parses, scans headings and finds links in a line; it's every note's", async () => {
    const { readerFor, parseNoteFile } = await import("../../../../src/core/documents/model/readers.ts");
    const { noteFormat } = await import("../../../../src/core/documents/model/filetypes.ts");
    // Org and AsciiDoc were readers once (16.16, 16.17, dropped): every note is markdown.
    expect([noteFormat("a.md"), noteFormat("b.markdown"), noteFormat("c.org"), noteFormat("d.txt")]).toEqual([
      "markdown",
      "markdown",
      "markdown",
      "markdown",
    ]);
    const md = readerFor("markdown");
    expect(md.scanHeadings("# One\n\n```\n# not\n```\n## Two\n").map((h) => h.text)).toEqual(["One", "Two"]);
    // The scan (an unsaved note's outline) reads a heading as the render does: `{#id}` the id, not
    // text; footnote marks and HTML tags left out.
    const hs = "# Setup {#install}\n\n## Notes[^1]\n\n## Use `x` <kbd>K</kbd>\n\n[^1]: n\n";
    const drawn = renderMarkdown(hs, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }).headings.map(
      ({ text, slug, id }) => ({ text, slug, id }),
    );
    expect(drawn).toEqual([
      { text: "Setup", slug: "setup", id: "install" },
      { text: "Notes", slug: "notes", id: undefined },
      { text: "Use x K", slug: "use-x-k", id: undefined },
    ]);
    expect(md.scanHeadings(hs).map(({ text, slug, id }) => ({ text, slug, id }))).toEqual(drawn);
    expect(layoutSource(hs, { width: 60, wrap: true, headings: "scan" }).headings[0]).toMatchObject({
      text: "Setup",
      id: "install",
    });
    // `_` inside a word, a code span's markup and an image (left out, its alt too) as the render reads them.
    const marked =
      "# The config_file option\n\n## Use `a_b * c` here\n\n## Logo ![logo](logo.png) Title\n\n## *Bold* ~~gone~~ [[a|b]] &amp; \\*\n";
    const rendered = renderMarkdown(marked, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }).headings.map(
      ({ text, slug }) => ({ text, slug }),
    );
    expect(rendered.map((h) => h.text)).toEqual([
      "The config_file option",
      "Use a_b * c here",
      "Logo  Title",
      "Bold gone b & *",
    ]);
    expect(md.scanHeadings(marked).map(({ text, slug }) => ({ text, slug }))).toEqual(rendered);
    expect(
      layoutSource(marked, { width: 60, wrap: true, headings: "scan" }).headings.map(({ text, slug }) => ({
        text,
        slug,
      })),
    ).toEqual(rendered);
    // Reference links and images, their definitions elsewhere in the note: a README's badge heading.
    const refs =
      "# Foo [![Build][ci-badge]][ci-url]\n\n## See [the docs][d]\n\n## Logo ![alt][img] here\n\n## Also [d][] and [d]\n\n" +
      "[ci-badge]: https://ci/b.svg\n[ci-url]: https://ci\n[d]: docs.md\n[img]: logo.png\n";
    const refsDrawn = headingsOf(parseMarkdown(refs).tree).map(({ text, slug }) => ({ text, slug }));
    expect(refsDrawn.map((h) => h.slug)).toEqual(["foo", "see-the-docs", "logo--here", "also-d-and-d"]);
    expect(md.scanHeadings(refs).map(({ text, slug }) => ({ text, slug }))).toEqual(refsDrawn);
    expect(md.linkAt("see [the intro](alpha.md#intro) and [x](b.md)", 6)).toEqual({
      kind: "markdown",
      target: "alpha.md#intro",
      heading: null,
      text: "the intro",
    });
    expect(md.linkAt("see [[alpha#Top|the alpha]] and [x](b.md)", 6)).toMatchObject({
      kind: "wiki",
      target: "alpha",
      heading: "Top",
      text: "the alpha",
    }); // read again (21.3)
    expect(md.linkAt("see [[alpha#Top|the alpha]] and [x](b.md)", 34)).toMatchObject({
      kind: "markdown",
      target: "b.md",
    });
    // Split as the tokenizer splits it: `\|` is a table cell's alias divider, `#^b1` a block.
    expect(md.linkAt("| [[alpha\\|the alpha]] | x |", 5)).toEqual({
      kind: "wiki",
      target: "alpha",
      heading: null,
      text: "the alpha",
    });
    expect(md.linkAt("see ![[alpha#^b1]]", 6)).toEqual({
      kind: "embed",
      target: "alpha",
      heading: "^b1",
      text: "alpha",
    });
    expect(parseNoteFile("x.md", "# T\n").tree.children[0]!.type).toBe("heading");
    expect(readerFor("no-such-format")).toBe(md);
  });
});
