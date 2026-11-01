import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { TINT } from "../../../../../src/core/rendering/export/assets/style.ts";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { OBSIDIAN, COMMENTS } from "../../../../support/export-nodes.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { root, exportOf } = makeExportFixture();

describe("export: a web page (10.2)", () => {
  test("one file: its title, author, language, style; a section a chapter; headings with ids, every link inside it landing", async () => {
    const r = root({
      "a.md":
        "---\nauthor: Ada\nlang: en\n---\n\n# Report\n\nSee [[b#Details]], [b](b.md), [[#Later]] and [web](https://example.com/?a=1&b=2).\n\n## Later\n",
      "b.md": "Opens with no heading.\n\n## Details\n",
    });
    const { text: html } = await exportOf(r, ["a.md", "b.md"], "html");
    expect(html).toStartWith('<!doctype html><html lang="en"><head><meta charset="utf-8">');
    expect(html).toContain("<title>Report</title>");
    expect(html).toContain('<meta name="author" content="Ada">');
    expect(html).toContain("<style>");
    expect(html).toContain('<section id="a" class="chapter"><h1 id="a--report">Report</h1>');
    // b opens with no heading: its title is one.
    expect(html).toContain('<section id="b" class="chapter"><h1>b</h1>');
    expect(html).toContain('<a href="https://example.com/?a=1&#x26;b=2">web</a>');
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(expect.arrayContaining(["b--details", "b", "a--later"]));
    expect(hrefs.filter((h) => !ids.has(h))).toEqual([]);
    // Nothing of where the notes are on this machine.
    expect(html).not.toContain(r.dir);
  });

  test("pictures inside it as data: addresses at their size; diagrams and maths as SVG (a line's at its baseline); code coloured", async () => {
    const r = root({
      "a.md":
        "# A\n\n![[square.png|20]]\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n$$\n\\frac{a}{b}\n$$\n\nInline $x^2$ here.\n\n```ts\nconst x = 1; // one\n```\n",
      "square.png": png,
    });
    const { text: html } = await exportOf(r, ["a.md"], "html");
    expect(html).toMatch(
      /<img src="data:image\/png;base64,[^"]+" alt="square.png" width="20" height="10" class="picture">/,
    );
    expect(html).toMatch(
      /<img src="data:image\/svg\+xml;base64,[^"]+" alt="diagram" width="\d+" height="\d+" class="picture">/,
    );
    expect(html).toMatch(
      /<div class="math-display"><img src="data:image\/svg\+xml;base64,[^"]+" alt="\\frac\{a\}\{b\}" style="width:[\d.]+ex;height:[\d.]+ex;vertical-align:-[\d.]+ex"><\/div>/,
    );
    expect(html).toMatch(
      /<span class="math-inline"><img src="data:image\/svg\+xml;base64,[^"]+" alt="\$x\^2\$" style="[^"]*"><\/span>/,
    );
    expect(html).toContain('<code class="language-ts"><span class="syn_keyword">const</span>');
    expect(html).toContain('<span class="syn_comment">// one</span>');
    expect(html).not.toMatch(/src="(?!data:)/);
  });

  test("tasks boxed, no checkbox; a callout in its kind's colour; each chapter's footnotes its own, at its end", async () => {
    const r = root({
      "a.md": "- [ ] open\n- [x] done\n\n> [!caution] Hot\n> Mind it.\n\nClaim[^1].\n\n[^1]: A's.\n",
      "b.md": "Other[^1].\n\n[^1]: B's.\n",
    });
    const { text: html } = await exportOf(r, ["a.md", "b.md"], "html");
    expect(html).toContain('<li class="task">☐ open</li>');
    expect(html).toContain("☑ done");
    expect(html).not.toContain("<input");
    expect(html).toContain('<blockquote class="callout callout-caution" style="border-left-color:#cf222e">');
    expect(html).toContain("<strong>Hot</strong>");
    const notes = [
      ...html.matchAll(
        /<section data-footnotes class="footnotes"><h2 class="footnotes-label" id="([^"]+)">Notes<\/h2>/g,
      ),
    ].map((m) => m[1]);
    expect(notes).toEqual(["a-footnote-label", "b-footnote-label"]);
    // Each note's mark points to its own chapter's notes.
    expect([...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "a-footnote-label",
      "b-footnote-label",
    ]);
    expect(html.indexOf("A's.")).toBeLessThan(html.indexOf('<section id="b"'));
  });

  test("Obsidian's highlight marked, on paper's yellow; its comments not there", async () => {
    const { text: html } = await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "html");
    expect(html).toContain("<p>A <mark>splash of <strong>vanilla</strong></mark> here, <em>always fresh</em>.</p>");
    expect(html).toContain(`mark { background: ${TINT.mark};`);
    expect(html).not.toMatch(COMMENTS);
  });

  test("nothing in a note runs in the page: HTML in it is gone, its text escaped, a javascript: link its words", async () => {
    const r = root({
      "a.md":
        '# A\n\n<script>alert(1)</script>\n\nText <b onclick="steal()">bold</b> and [x](javascript:alert(2)).\n\n```html\n</code></pre><img src=x onerror=alert(3)>\n```\n',
    });
    const { text: html } = await exportOf(r, ["a.md"], "html");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b onclick");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    // The code's words, escaped, between the spans that colour them.
    expect(html.replace(/<[^>]+>/g, "")).toContain("&#x3C;/code>&#x3C;/pre>&#x3C;img src=x onerror=alert(3)>");
  });
});
