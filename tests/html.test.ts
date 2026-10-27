import { spanStyle } from "../src/core/rendering/layout/style.ts";
import { loadTheme } from "../src/core/rendering/theme/index.ts";
import { describe, expect, test } from "bun:test";
import { htmlFragment, htmlForMarkdown, htmlTokens } from "../src/core/documents/markdown/html.ts";
import { adaptHtml, htmlLength } from "../src/core/documents/markdown/html-adapter.ts";
import {
  renderMarkdown,
  renderTree,
  newRenderCache,
  type RenderOptions,
  type PictureSource,
} from "../src/core/rendering/layout/markdown/render.ts";
import { A_BOLD, A_ITALIC, A_UNDERLINE, A_STRIKE } from "../src/core/rendering/layout/ir.ts";
import { glyphsFor } from "../src/core/rendering/theme/glyphs.ts";
import { parseMarkdown, headingsOf, anchorsOf } from "../src/core/documents/markdown/parse.ts";

const options: RenderOptions = { width: 50, glyphs: glyphsFor("unicode"), showUrls: false };
const text = (source: string, opts: Partial<RenderOptions> = {}) =>
  renderMarkdown(source, { ...options, ...opts })
    .lines.map((l) => l.spans.map((s) => s.text).join(""))
    .join("\n");
const spans = (source: string) => renderMarkdown(source, options).lines.flatMap((l) => l.spans);

describe("document HTML", () => {
  test("tokenizes quoted greater-than, case, entities, multiline and unquoted attributes", () => {
    const root = htmlFragment('<DIV title="a>b"\n align=center><B>A &amp; B &#x1f600;</B><br/>next</DIV>', {
      line: 8,
      column: 3,
    });
    const div = root.children[0]!;
    expect("tag" in div && div.tag).toBe("div");
    expect("tag" in div && div.attrs.title).toBe("a>b");
    expect(text('<DIV title="a>b"\n align=center><B>A &amp; B &#x1f600;</B><br/>next</DIV>')).toContain("A & B 😀");
    expect([...htmlTokens("<img alt='x>y' src=local.png>")][0]!.attrs).toEqual({ alt: "x>y", src: "local.png" });
  });

  test("scopes formatting in mixed Markdown, lists and tables and supports resets", () => {
    const source = 'before <b>bold <i>both</i> <span style="font-weight: normal">normal</span></b> after';
    const all = spans(source);
    expect(all.find((s) => s.text === "both")!.attrs & (A_BOLD | A_ITALIC)).toBe(A_BOLD | A_ITALIC);
    expect(all.find((s) => s.text === "normal")!.attrs & A_BOLD).toBe(0);
    expect(all.find((s) => s.text.includes("after"))!.attrs).toBe(0);
    expect(spans("- <u>under</u> <del>gone</del>").find((s) => s.text === "under")!.attrs & A_UNDERLINE).toBeTruthy();
    expect(spans("| A |\n|---|\n| <s>gone</s> |").find((s) => s.text === "gone")!.attrs & A_STRIKE).toBeTruthy();
    expect(text("<div>**literal** <strong>bold</strong></div>")).toContain("**literal**");
  });

  test("omits executable content, comments and unsafe links while keeping unknown children", () => {
    const source =
      '<div><!-- hidden --><script>evil()</script><style>body{}</style><iframe src="https://bad">frame</iframe><unknown>kept</unknown><a href="javascript:evil()">safe words</a></div>';
    const value = text(source);
    expect(value).toContain("kept");
    expect(value).toContain("safe words");
    for (const bad of ["evil", "body{}", "frame", "hidden", "javascript"]) expect(value).not.toContain(bad);
    expect(renderMarkdown(source, options).links).toEqual([]);
  });

  test("selects one supported matching picture or the img fallback without an explicit theme", () => {
    const source =
      '<p align=center><picture><source media="print" srcset="print.svg"><source media="(prefers-color-scheme: dark)" srcset="one.svg 1x, two.svg 2x"><source media="(prefers-color-scheme: dark)" type="video/mp4" srcset="bad.svg"><source media="(prefers-color-scheme: dark)" srcset="dark.svg"><source media="(prefers-color-scheme: dark)" srcset="later.svg"><source media="(prefers-color-scheme: light)" srcset="light.svg"><img alt="logo" src="fallback.svg" width=176></picture></p>';
    for (const [theme, expected] of [
      ["dark", "dark.svg"],
      ["light", "light.svg"],
      [undefined, "fallback.svg"],
    ] as const) {
      const asked: PictureSource[] = [];
      const result = renderMarkdown(source, {
        ...options,
        htmlTheme: theme,
        picture: (from) => {
          asked.push(from);
          return { src: "pixels.png", cols: 10, rows: 2 };
        },
      });
      expect(asked).toEqual([{ url: expected, size: { width: 176, height: null } }]);
      expect(result.lines.filter((l) => l.image)).toHaveLength(1);
      expect(result.lines.find((l) => l.image)!.spans[0]!.text).toHaveLength(20);
    }
  });

  test("linked HTML images and fallback follow the enclosing href", () => {
    const source = '<p><a href="https://example.com/status"><img src="badge.svg" alt="CI status"></a></p>';
    const result = renderMarkdown(source, { ...options, picture: () => ({ src: "pixels.png", cols: 4, rows: 2 }) });
    expect(result.lines.filter((l) => l.image)).toHaveLength(1);
    expect(result.links.map((l) => l.target)).toEqual(["https://example.com/status"]);
    expect(result.links[0]!.text).toBe("CI status");
    expect(text(source)).toContain("CI status");
    expect(renderMarkdown(source, options).links.map((l) => l.target)).toEqual(["https://example.com/status"]);
  });

  test("dimensions use the accepted grammar and constrain requested room", () => {
    expect(htmlLength("0")).toBeUndefined();
    expect(htmlLength("-1")).toBeUndefined();
    expect(htmlLength("12em")).toBeUndefined();
    expect(htmlLength("101%")).toBeUndefined();
    expect(htmlLength("20%", false)).toBeUndefined();
    expect(htmlLength("176px")).toEqual({ value: 176, unit: "px" });
    const asked: { from: PictureSource; width: number }[] = [];
    renderMarkdown('<p><img src="a.png" width=200 height=80 style="width: 50%; max-width: 40%; height: -5"></p>', {
      ...options,
      picture: (from, width) => {
        asked.push({ from, width });
        return null;
      },
    });
    expect(asked).toEqual([
      { from: { url: "a.png", size: { width: Number.MAX_SAFE_INTEGER, height: 80 } }, width: 20 },
    ]);
  });

  test("details respect initial open in TUI and always disclose noninteractive bodies", () => {
    const source = '<details>\n<summary>More</summary>\n<h2 id="inside">Hidden heading</h2>\n<p>Body</p>\n</details>';
    expect(text(source)).toContain("Body");
    expect(text(source, { htmlDetails: new Map() })).not.toContain("Body");
    expect(text(source, { htmlDetails: new Map([[1, true]]) })).toContain("Body");
    expect(text(source.replace("<details>", "<details open>"), { htmlDetails: new Map() })).toContain("Body");
    const parsed = parseMarkdown(source);
    expect(headingsOf(parsed.tree)).toEqual([
      { depth: 2, text: "Hidden heading", slug: "hidden-heading", id: "inside", line: 3 },
    ]);
    expect(anchorsOf(parsed.tree)).toContainEqual({ id: "inside", line: 3 });
  });

  test("retains original source lines through multiline hidden tags and HTML images", () => {
    const source =
      '<div>\n<!-- hidden\ncomment -->\n<p>\nFirst\n<strong>second</strong>\n</p>\n<img\nsrc="local.png"\nalt="picture">\n</div>';
    const result = renderMarkdown(source, options);
    expect(result.lines.flatMap((l) => l.spans).find((s) => s.text === "second")!.src).toBe(6);
    expect(result.links.find((l) => l.target === "local.png")!.src).toBe(8);
  });

  test("Markdown export filtering preserves original markup except omitted ranges", () => {
    const html =
      "<DIV align = 'center'>\n  <IMG src=a.png alt=\"a > b\"> &amp;\n<script>evil()</script><style>x{}</style><iframe>bad</iframe><!-- keep -->\n</DIV>";
    expect(htmlForMarkdown(html)).toBe(
      "<DIV align = 'center'>\n  <IMG src=a.png alt=\"a > b\"> &amp;\n<!-- keep -->\n</DIV>",
    );
    expect(htmlForMarkdown("<p>kept</p><script>unterminated")).toBe("<p>kept</p>");
  });

  test("malformed and deeply nested fragments recover with bounded traversal", () => {
    expect(text("<div><b>one<i>two</b>three</div>")).toContain("three");
    const source = "<div>".repeat(4000) + "content" + "</div>".repeat(4000);
    expect(text(source)).toContain("content");
    expect(adaptHtml(parseMarkdown(source).tree).children.length).toBeGreaterThan(0);
  });

  test("theme changes with render cache select a fresh source", () => {
    const tree = parseMarkdown(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="dark.png"><img src="fallback.png" alt="image"></picture>',
    ).tree;
    const cache = newRenderCache();
    const dark = renderTree(tree, { ...options, htmlTheme: "dark" }, null, cache);
    const light = renderTree(tree, { ...options, htmlTheme: "light" }, null, cache);
    expect(dark.links[0]!.target).toBe("dark.png");
    expect(light.links[0]!.target).toBe("fallback.png");
  });
  test("preformatted inline and block text retains spaces, breaks and original lines", () => {
    expect(text('<p><span style="white-space: pre">a   b\nc  d</span></p>')).toContain("a   b\nc  d");
    const layout = renderMarkdown("<pre>  first\n   second</pre>", options);
    expect(layout.lines.flatMap((l) => l.spans).some((s) => s.text.includes("   second"))).toBe(true);
    const entities = renderMarkdown("<p>one&#10;two</p>\n<p>third</p>", options);
    expect(entities.lines.flatMap((l) => l.spans).find((s) => s.text === "third")!.src).toBe(2);
  });

  test("explicit inner alignment wins and image fallbacks never overflow narrow containers", () => {
    expect(text('<div align="center"><p align="left">Left</p><p align="right">Right</p></div>')).toContain("\n");
    const value = text('<div align="center"><p align="left">Left</p></div>');
    expect(value.trimEnd()).toBe("Left");
    for (const width of [8, 15, 50]) {
      const layout = renderMarkdown('<p align="center"><img src="missing.png" alt="Long useful fallback words"></p>', {
        ...options,
        width,
      });
      expect(layout.clipped).toBe(0);
      expect(layout.links[0]!.target).toBe("missing.png");
    }
  });

  test("token bounds stop semantic work while Markdown keeps later HTML and filters omitted content", () => {
    const source =
      "<div>" + "<span>x</span>".repeat(17_000) + '<script>hiddenTail()</script><b title="kept">tail</b></div>';
    const root = htmlFragment(source);
    const values = (n: typeof root): string =>
      n.children.map((c) => ("text" in c ? c.text : "tag" in c ? values(c) : "")).join("");
    expect(values(root)).toContain("[HTML content limit reached]");
    const raw = htmlForMarkdown(source);
    expect(raw).toContain('<b title="kept">tail</b>');
    expect(raw).not.toContain("hiddenTail");
  });

  test("pure Markdown is returned unchanged and HTML adaptation never mutates original source", () => {
    const markdown = parseMarkdown("# Title\n\n**bold** and [link](note.md).").tree;
    expect(adaptHtml(markdown)).toBe(markdown);
    const original = parseMarkdown("<p><b>Words</b></p>").tree;
    const before = JSON.stringify(original);
    adaptHtml(original, "dark");
    adaptHtml(original, "light");
    expect(JSON.stringify(original)).toBe(before);
  });
  test("HTML inside embedded notes resolves pictures from the embedded document", () => {
    const asked: PictureSource[] = [];
    const inner = parseMarkdown(
      '<p><a href="https://example.com"><img src="assets/local.svg" alt="Embedded logo" width=100></a></p>',
    );
    const layout = renderMarkdown("![[inner]]", {
      ...options,
      embed: () => ({
        path: "/vault/sub/inner.md",
        title: "Inner",
        nodes: inner.tree.children,
        locate: (from) => ("url" in from ? { file: "/vault/sub/" + from.url, size: from.size ?? null } : null),
      }),
      picture: (from) => {
        asked.push(from);
        return { src: "decoded.png", cols: 10, rows: 2 };
      },
    });
    expect(asked).toEqual([{ file: "/vault/sub/assets/local.svg", size: { width: 100, height: null } }]);
    expect(layout.links.map((l) => l.target)).toContain("https://example.com");
    expect(layout.lines.filter((l) => l.image)).toHaveLength(1);
  });
  test("details span Markdown blocks separated by blank lines without reparsing raw HTML text", () => {
    const source =
      "<details>\n<summary>Mixed body</summary>\n\n## Markdown heading\n\n**Markdown body**\n\n<div>**literal HTML**</div>\n\n</details>\n\nAfter body.\n";
    expect(text(source, { htmlDetails: new Map() })).not.toContain("Markdown body");
    expect(text(source, { htmlDetails: new Map() })).toContain("After body.");
    const expanded = text(source, { htmlDetails: new Map([[1, true]]) });
    expect(expanded).toContain("Markdown body");
    expect(expanded).toContain("**literal HTML**");
    expect(headingsOf(parseMarkdown(source).tree)[0]!.line).toBe(4);
    expect(spans(source).find((s) => s.text === "Markdown body")!.attrs & A_BOLD).toBeTruthy();
  });

  test("omission handles raw script strings, nested omitted elements and following anchors", () => {
    const source =
      '<div><script>const x = "<div title=\\"";</script><object><object>hidden</object>still hidden</object><meta><a name=after>Kept</a></div>';
    expect(text(source)).toContain("Kept");
    expect(text(source)).not.toContain("hidden");
    expect(htmlForMarkdown(source)).toBe("<div><a name=after>Kept</a></div>");
    expect(anchorsOf(parseMarkdown(source).tree)).toEqual([{ id: "after", line: 1 }]);
  });
  test("normal and none reset theme attributes while keeping semantic link colors", () => {
    const theme = structuredClone(loadTheme("tokyo-night").theme);
    theme.roles.link = { ...theme.roles.link, bold: true, italic: true, underline: true };
    const layout = renderMarkdown(
      '<p><a href="https://example.com" style="font-weight: normal; font-style: normal; text-decoration: none">Plain link</a></p>',
      options,
    );
    const span = layout.lines.flatMap((l) => l.spans).find((s) => s.text === "Plain link")!;
    const style = spanStyle(theme, span, layout.lines[0]!);
    expect(style).toMatchObject({ bold: false, italic: false, underline: false, fg: theme.roles.link.fg! });
  });
});

test("preformatted containers retain Markdown blocks between HTML fragments", () => {
  const source = '<div style="white-space: pre">\n\nFirst **bold** paragraph.\n\nSecond paragraph.\n\n</div>';
  const value = text(source);
  expect(value).toContain("First bold paragraph.");
  expect(value).toContain("Second paragraph.");
});

test("preformatted HTML retains nested hard breaks", () => {
  const value = text("<pre>first<br><b>second<br/>third</b><BR />fourth</pre>");
  for (const word of ["first", "second", "third", "fourth"]) expect(value).toContain(word);
  const rows = value.split("\n").filter((line) => line.trim());
  expect(rows).toHaveLength(4);
  const layout = renderMarkdown("<pre>first<br><b>second<br/>third</b><BR />fourth</pre>", options);
  expect(
    layout.lines
      .filter((line) => line.spans.some((span) => /first|second|third|fourth/.test(span.text)))
      .map((line) => line.src),
  ).toEqual([1, 1, 1, 1]);
  const mapped = renderMarkdown("<pre>first&#10;second\n<!-- hidden\ncomment --><b>third<br>fourth</b></pre>", options);
  expect(
    mapped.lines
      .filter((line) => line.spans.some((span) => /first|second|third|fourth/.test(span.text)))
      .map((line) => line.src),
  ).toEqual([1, 1, 3, 3]);
});
