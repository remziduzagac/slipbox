import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import {
  EXPORT_MARK,
  exportNotes,
  exportTarget,
  formatFor,
  isExport,
  NotAnExport,
  writeExport,
} from "../../../../../src/core/rendering/export/index.ts";
import { slugify } from "../../../../../src/core/documents/markdown/parse.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { remoteImageName } from "../../../../../src/core/rendering/media/images/imagecache.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { rect } from "../../../../support/export-pictures.ts";
import { OBSIDIAN, COMMENTS } from "../../../../support/export-nodes.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, root, exportOf } = makeExportFixture();

describe("export: Markdown (10.3)", () => {
  test("frontmatter with the mark; links inside it to GitHub's heading ids, a name again numbered across chapters", async () => {
    const r = root({
      "a.md": "---\nauthor: Ada\n---\n\n# Report\n\n## Intro\n\nSee [[b#Intro]], [[b]] and [[#Intro]].\n",
      "sub/b.md": "## Intro\n\nB's.\n",
    });
    // b's chapter is sub-b; its title's id, b.
    const { text: md } = await exportOf(r, ["a.md", "sub/b.md"], "md", "out.md");
    expect(md).toStartWith(`---\ntitle: "Report"\nauthor: "Ada"\n${EXPORT_MARK}\n---\n\n# Report\n`);
    // b gets a title; its Intro, the second of the name, is intro-1.
    expect(md).toContain("# b\n\n## Intro\n");
    expect(md).toContain("See [b](#intro-1), [b](#b) and [Intro](#intro).");
    const slugs = [...md.matchAll(/^#+ (.+)$/gm)].map((m) => slugify(m[1]!));
    expect(slugs).toEqual(["report", "intro", "b", "intro"]);
  });

  test("pictures copied beside it, a name again numbered; one on the web: its copy by its address's name, or its address; Obsidian's size kept", async () => {
    const cached = "https://example.com/photos/sky%20line.png?w=2";
    mkdirSync(join(sandbox, "cache", "slipbox", "images"), { recursive: true });
    writeFileSync(join(sandbox, "cache", "slipbox", "images", remoteImageName(cached)), png);
    // An address naming no kind of file: its copy gets its kind's extension.
    const avatar = "https://example.com/avatar?id=7";
    writeFileSync(join(sandbox, "cache", "slipbox", "images", remoteImageName(avatar)), png);
    const r = root({
      "a.md": `# A\n\n![one](x/pic.png) ![two](y/pic.png) ![[square.png|30]]\n\n![sky](${cached}) ![far](https://example.com/far.png) ![me](${avatar})\n`,
      "x/pic.png": png,
      "y/pic.png": rect(10, 10),
      "square.png": png,
    });
    const out = await exportOf(r, ["a.md"], "md", "book.md");
    expect(out.files.map((f) => f.path)).toEqual([
      "book.assets/pic.png",
      "book.assets/pic-1.png",
      "book.assets/square.png",
      "book.assets/sky line.png",
      "book.assets/avatar.png",
    ]);
    expect(out.text).toContain(
      "![one](book.assets/pic.png) ![two](book.assets/pic-1.png) ![square.png|30](book.assets/square.png)",
    );
    expect(out.text).toContain(
      "![sky](book.assets/sky%20line.png) ![far](https://example.com/far.png) ![me](book.assets/avatar.png)",
    );
    // pic-1 is the SVG, as it was.
    expect(new TextDecoder().decode(out.files[1]!.data)).toStartWith("<svg");
  });

  test("only pictures of the root copied: a file that isn't one by what it holds, or one outside (a link out too), linked where it is", async () => {
    const outside = mkdtempSync(join(sandbox, "outside-"));
    writeFileSync(join(outside, "secret.txt"), "private");
    writeFileSync(join(outside, "photo.png"), png);
    const away = relative(sandbox, outside);
    const r = root({
      "a.md": `# A\n\n![](notes.txt) ![fake](fake.png) ![[fake.png]] ![ok](pic.png)\n\n![](../${away}/secret.txt) ![far](../${away}/photo.png) ![in](linked.png)\n`,
      "notes.txt": "plain text",
      "fake.png": "not a picture",
      "pic.png": png,
    });
    symlinkSync(join(outside, "photo.png"), join(r.dir, "linked.png"));
    // Exported into a folder: each link from there.
    const out = await exportOf(r, ["a.md"], "md", "exports/out.md");
    expect(out.files.map((f) => f.path)).toEqual(["out.assets/pic.png"]);
    expect(out.text).toContain(
      "[notes.txt](../notes.txt) [fake](../fake.png) [fake.png](../fake.png) ![ok](out.assets/pic.png)",
    );
    expect(out.text).toContain(
      `[secret.txt](../../${away}/secret.txt) [far](../../${away}/photo.png) [in](../linked.png)`,
    );
    expect(out.text).not.toContain("private");
  });

  test("what Markdown writes itself kept as written: a diagram's source, maths, a callout's marker; footnotes renumbered; tasks", async () => {
    const r = root({
      "a.md":
        "```mermaid\ngraph TD\n  A --> B\n```\n\n$$\nx^2\n$$\n\nInline $y$.\n\n> [!tip] Try it\n> Body.\n\n> [!warning]\n> Careful.\n\nOne[^z] two[^a].\n\n[^a]: Second.\n[^z]: First.\n\n- [ ] open\n- [x] done\n",
    });
    const { text: md } = await exportOf(r, ["a.md"], "md", "out.md");
    expect(md).toContain("```mermaid\ngraph TD\n  A --> B\n```");
    expect(md).toContain("$$\nx^2\n$$");
    expect(md).toContain("Inline $y$.");
    expect(md).toContain("> [!tip] Try it\n>\n> Body.");
    expect(md).toContain("> [!warning]\n>\n> Careful.");
    expect(md).toContain("One[^1] two[^2].");
    expect(md).toContain("[^2]: Second.");
    expect(md).toContain("[^1]: First.");
    expect(md).toContain("- [ ] open\n- [x] done");
  });

  test("Obsidian's highlight as written; its comments not there", async () => {
    const { text: md } = await exportOf(root({ "a.md": OBSIDIAN }), ["a.md"], "md", "out.md");
    expect(md).toContain("A ==splash of **vanilla**== here, *always fresh*.");
    expect(md).toContain("After.");
    expect(md).not.toMatch(COMMENTS);
  });

  test("an earlier Markdown export is replaced, though it's a note; any other note never", async () => {
    const r = root({ "a.md": "# A\n", "notes.md": "# Mine\n" });
    const format = formatFor("md")!;
    const target = exportTarget(r.graph, "a.md", format, null, r.dir);
    expect(target).toBe(join(r.dir, "a.export.md"));
    writeExport(target, await exportNotes(r.graph, ["a.md"], format, target));
    expect(isExport(target)).toBe(true);
    const again = openGraph(locateVault({ root: r.dir }), DEFAULT_CONFIG, false);
    expect(again.notes.has("a.export.md")).toBe(true);
    expect(exportTarget(again, "a.md", format, null, r.dir)).toBe(target);
    expect(() => exportTarget(again, "a.md", format, "notes.md", r.dir)).toThrow(
      "notes.md is a note — an export doesn't write over it",
    );
    expect(isExport(join(r.dir, "notes.md"))).toBe(false);
  });

  test("never over a note of any root: another's, a nested one's, one reached through a link; their other files only with force", async () => {
    const r = root({ "a.md": "# A\n", "inner/.slipbox/version": "1\n", "inner/n.md": "# N\n" });
    const other = root({ "theirs.md": "# Theirs\n", "sub/deep.md": "# Deep\n", "data.txt": "x" });
    const plain = mkdtempSync(join(sandbox, "plain-"));
    symlinkSync(join(other.dir, "sub"), join(plain, "into"));
    writeFileSync(join(plain, "loose.md"), "# Loose\n");
    const format = formatFor("md")!;
    const at = (typed: string, force = false) => exportTarget(r.graph, "a.md", format, typed, r.dir, force);
    // Not even with force.
    for (const force of [false, true]) {
      expect(() => at(join(other.dir, "theirs.md"), force)).toThrow(
        `${join(other.dir, "theirs.md")} is a note — an export doesn't write over it`,
      );
      expect(() => at("inner/n.md", force)).toThrow("inner/n.md is a note — an export doesn't write over it");
      expect(() => at(join(plain, "into", "deep.md"), force)).toThrow(
        "deep.md is a note — an export doesn't write over it",
      );
    }
    // Another root's file that isn't a note, and a note of no root: neither an export, so only with force.
    expect(() => at(join(other.dir, "data.txt"))).toThrow(NotAnExport);
    expect(() => at(join(plain, "loose.md"))).toThrow(NotAnExport);
    expect(at(join(other.dir, "data.txt"), true)).toBe(join(other.dir, "data.txt"));
    expect(at(join(plain, "loose.md"), true)).toBe(join(plain, "loose.md"));
    // Another root's earlier Markdown export: replaced too.
    writeExport(join(other.dir, "old.md"), await exportNotes(r.graph, ["a.md"], format, join(other.dir, "old.md")));
    expect(at(join(other.dir, "old.md"))).toBe(join(other.dir, "old.md"));
  });

  test("a path ending in / names a folder: the note's name in it, the folder made when it's written", async () => {
    const r = root({ "a.md": "# A\n" });
    const docx = formatFor("docx")!;
    const target = exportTarget(r.graph, "a.md", docx, "out/v1.2/", r.dir);
    expect(target).toBe(join(r.dir, "out", "v1.2", "a.docx"));
    writeExport(target, await exportNotes(r.graph, ["a.md"], docx, target));
    expect(existsSync(target)).toBe(true);
    // Without its `/`, a name that isn't there is the file's.
    expect(exportTarget(r.graph, "a.md", docx, "out/v2", r.dir)).toBe(join(r.dir, "out", "v2"));
  });
});
