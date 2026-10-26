import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../src/core/application/config/config.ts";
import { openGraph } from "../src/core/workspace/graph/graph.ts";
import { locateVault } from "../src/core/workspace/vaults/vault.ts";
import { assemble } from "../src/core/export/assemble.ts";
import { toMarkdown } from "../src/core/export/markdown.ts";
import { toHtml } from "../src/core/export/html.ts";
import { toDocx } from "../src/core/export/docx.ts";
import { toEpub } from "../src/core/export/epub.ts";
import { unzipSync, strFromU8 } from "fflate";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-html-export-"));
for (const kind of ["STATE", "CACHE", "CONFIG", "DATA"]) process.env["XDG_" + kind + "_HOME"] = join(sandbox, kind);
delete process.env.SLIPBOX_CONFIG;
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
async function document(source: string) {
  const root = mkdtempSync(join(sandbox, "root-"));
  mkdirSync(join(root, ".slipbox"));
  writeFileSync(join(root, "note.md"), "# Export\n\n" + source + "\n");
  return assemble(openGraph(locateVault({ root }), DEFAULT_CONFIG, false), ["note.md"]);
}

describe("HTML exports", () => {
  test("Markdown preserves exact block and inline HTML spelling while omitting non-document content", async () => {
    const block =
      "<DIV align = 'center'>\n <IMG src=local.png alt=\"a > b\"> &amp;\n<details open><summary>More</summary><p>Body</p></details><!-- retained -->\n</DIV>";
    const inline = 'Words <b class="original">__bold__ &amp; *italic*</b> after.';
    const doc = await document(
      block + "\n\n<script>evil()</script>\n\nWords <script>alsoEvil()</script> remain.\n\n" + inline,
    );
    const out = new TextDecoder().decode((await toMarkdown(doc, join(sandbox, "out.md"))).data);
    expect(out).toContain(block);
    expect(out).toContain(inline);
    expect(out).not.toContain("evil");
    expect(out).not.toContain("alsoEvil");
    expect(out).toContain("Words  remain.");
    expect(out).not.toContain("<script");
  });

  test("HTML, EPUB and Word retain supported semantics and disclose bodies", async () => {
    const doc = await document(
      '<div><h2 id="specific">HTML heading</h2><p><strong>Bold words</strong> and <em>italic</em>.</p><details><summary>More</summary><p>Body remains readable</p></details><script>evil()</script></div>',
    );
    const html = new TextDecoder().decode(await toHtml(doc));
    expect(html).toContain("HTML heading");
    expect(html).toContain("<strong>Bold words</strong>");
    expect(html).toContain("Body remains readable");
    expect(html).not.toContain("evil");
    const word = unzipSync(await toDocx(doc));
    const xml = strFromU8(word["word/document.xml"]!);
    expect(xml).toContain("Body remains readable");
    expect(xml).toContain("Bold words");
    expect(xml).toContain("<w:b");
    const epub = unzipSync(await toEpub(doc));
    const chapter = strFromU8(epub["OEBPS/chapter-1.xhtml"]!);
    expect(chapter).toContain("Body remains readable");
    expect(chapter).toContain("<strong>Bold words</strong>");
  });
  test("uncached linked HTML images keep their enclosing link in exported text fallbacks", async () => {
    const doc = await document(
      '<p><a href="https://example.com/status"><img src="https://images.example.com/uncached.png" alt="Status badge"></a></p>',
    );
    const html = new TextDecoder().decode(await toHtml(doc));
    expect(html).toContain('href="https://example.com/status"');
    expect(html).not.toContain('href="https://images.example.com/uncached.png"');
    expect(html).toContain("Status badge");
  });
});

test("preformatted HTML containers export intervening Markdown paragraphs", async () => {
  const doc = await document(
    '<div style="white-space: pre">\n\nFirst **bold** paragraph.\n\nSecond paragraph.\n\n</div>',
  );
  const html = new TextDecoder().decode(await toHtml(doc));
  expect(html).toContain("First bold paragraph.");
  expect(html).toContain("Second paragraph.");
});

test("preformatted HTML exports nested hard breaks", async () => {
  const doc = await document("<pre>first<br><b>second<br/>third</b><BR />fourth</pre>");
  const html = new TextDecoder().decode(await toHtml(doc));
  expect(html).toContain("first\nsecond\nthird\nfourth");
});
