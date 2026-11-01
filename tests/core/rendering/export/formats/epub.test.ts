import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { OBSIDIAN, COMMENTS } from "../../../../support/export-nodes.ts";
import { unzip, xml, notWellFormed } from "../../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { root, exportOf } = makeExportFixture();

describe("export: an e-book (10.6)", () => {
  test("EPUB 3: mimetype first and stored; every page well-formed XHTML; what's in it all listed; the contents; links across chapters", async () => {
    const r = root({
      "a.md":
        "---\nauthor: Ada\nlang: tr\n---\n\n# Report\n\nSee [[b#Details]]. $$x < y$$ and ![[square.png]]\n\n- [ ] a task\n\nNote[^1].\n\n[^1]: Its text & more.\n",
      "b.md": "# B\n\n## Details\n\nText with <br> a break.\n",
      "square.png": png,
    });
    const { data } = await exportOf(r, ["a.md", "b.md"], "epub");
    // The first entry, stored: its local header names it and says method 0.
    const v = new DataView(data.buffer, data.byteOffset);
    expect(v.getUint16(8, true)).toBe(0);
    expect(new TextDecoder().decode(data.subarray(30, 38))).toBe("mimetype");
    const z = unzip(data);
    expect([...z.keys()][0]).toBe("mimetype");
    expect(xml(z, "mimetype")).toBe("application/epub+zip");
    // Read as a stream, header after header from the start, as a reader without the central directory does: each
    // entry's sizes are in its own header, no data descriptor after it (a stored one with one is refused by some).
    const streamed: string[] = [];
    let at = 0;
    while (v.getUint32(at, true) === 0x04034b50) {
      expect(v.getUint16(at + 6, true) & 8).toBe(0);
      const [size, name, extra] = [v.getUint32(at + 18, true), v.getUint16(at + 26, true), v.getUint16(at + 28, true)];
      streamed.push(new TextDecoder().decode(data.subarray(at + 30, at + 30 + name)));
      at += 30 + name + extra + size;
    }
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    expect(streamed).toEqual([...z.keys()]);
    expect(v.getUint32(18, true)).toBe("application/epub+zip".length);
    expect(xml(z, "META-INF/container.xml")).toContain('full-path="OEBPS/content.opf"');
    for (const name of z.keys())
      if (/\.(xhtml|opf|xml)$/.test(name)) expect([name, notWellFormed(xml(z, name))]).toEqual([name, null]);
    const opf = xml(z, "OEBPS/content.opf");
    expect(opf).toContain("<dc:title>Report</dc:title>");
    expect(opf).toContain("<dc:creator>Ada</dc:creator>");
    expect(opf).toContain("<dc:language>tr</dc:language>");
    expect(opf).toMatch(
      /<dc:identifier id="book-id">urn:uuid:[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}<\/dc:identifier>/,
    );
    // Every file listed is there, and every file there is listed.
    const listed = [...opf.matchAll(/href="([^"]+)"/g)].map((m) => `OEBPS/${m[1]}`);
    expect(listed.filter((f) => !z.has(f))).toEqual([]);
    expect(
      [...z.keys()].filter((f) => f.startsWith("OEBPS/") && f !== "OEBPS/content.opf" && !listed.includes(f)),
    ).toEqual([]);
    expect([...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1])).toEqual(["c1", "c2"]);
    const nav = xml(z, "OEBPS/nav.xhtml");
    expect(nav).toContain('<a href="chapter-1.xhtml">Report</a>');
    expect(nav).toContain('<a href="chapter-2.xhtml#b--details">Details</a>');
    const one = xml(z, "OEBPS/chapter-1.xhtml");
    expect(one).toContain('href="chapter-2.xhtml#b--details"');
    expect(xml(z, "OEBPS/chapter-2.xhtml")).toContain('id="b--details"');
    expect(one).toMatch(/<img src="images\/[\da-f]{16}\.png" alt="square.png"/);
    expect(one).toContain("☐ a task");
    expect(one).toContain("Its text &#x26; more.");
  });

  test("the same notes exported again are the same book: its id from what's in it", async () => {
    const r = root({ "a.md": "# A\n", "b.md": "# B\n" });
    const id = async (rels: string[]) =>
      /urn:uuid:([^<]+)/.exec(xml(unzip((await exportOf(r, rels, "epub")).data), "OEBPS/content.opf"))![1];
    expect(await id(["a.md", "b.md"])).toBe(await id(["a.md", "b.md"]));
    expect(await id(["b.md", "a.md"])).not.toBe(await id(["a.md", "b.md"]));
  });

  test("a note's own `=\"` is its text: the tags after it kept, a formula's words escaped in its `alt`, `]]>` escaped", async () => {
    const r = root({
      "a.md": '# A\n\nSet a="b *c* d" here, and x=" before $1 < 2$ and **bold**.\n\nA ]]> in text.\n',
    });
    const page = xml(unzip((await exportOf(r, ["a.md"], "epub")).data), "OEBPS/chapter-1.xhtml");
    expect(notWellFormed(page)).toBeNull();
    expect(page).toContain('Set a="b <em>c</em> d" here, and x=" before <span class="math-inline"><img ');
    expect(page).toContain('alt="$1 &#x3C; 2$"');
    expect(page).toContain("<strong>bold</strong>");
    expect(page).toContain("A ]]&#x3E; in text.");
  });

  test("Obsidian's highlight marked, the page well-formed; its comments not there", async () => {
    const page = xml(
      unzip((await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "epub")).data),
      "OEBPS/chapter-1.xhtml",
    );
    expect(notWellFormed(page)).toBeNull();
    expect(page).toContain("<mark>splash of <strong>vanilla</strong></mark>");
    expect(page).not.toMatch(COMMENTS);
  });
});
