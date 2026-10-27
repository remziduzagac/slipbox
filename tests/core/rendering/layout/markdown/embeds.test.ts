import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("embeds drawn in place (1.11)", () => {
  const vaultOf = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-embed-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  /** `caches`: the parse's and the render's, as a buffer keeps them (blocks reused between renders). */
  const draw = async (
    g: ReturnType<typeof openGraph>,
    rel: string,
    caches?: {
      parse: import("../../../../../src/core/documents/markdown/parse.ts").ParseCache;
      render: import("../../../../../src/core/rendering/layout/markdown/render.ts").RenderCache;
    },
  ) => {
    const { layoutNote } = await import("../../../../../src/core/documents/model/note.ts");
    const { parseMarkdown } = await import("../../../../../src/core/documents/markdown/parse.ts");
    const { glyphsFor } = await import("../../../../../src/core/rendering/theme/glyphs.ts");
    return layoutNote(
      parseMarkdown(readFileSync(g.abs(rel), "utf8"), caches?.parse),
      g,
      rel,
      { width: 60, glyphs: glyphsFor("unicode"), showUrls: false },
      caches?.render,
    );
  };
  const text = (l: { lines: { spans: { text: string }[] }[] }) =>
    l.lines.map((r) =>
      r.spans
        .map((x) => x.text)
        .join("")
        .trimEnd(),
    );

  test("a note in a frame where it's embedded: its name, then its text behind a bar — no frontmatter; its headings not this note's", async () => {
    const { g } = vaultOf({
      "host.md": "# Host\n\nBefore.\n\n![inner](sub/inner.md)\n\nAfter.\n",
      "sub/inner.md": "---\ntitle: Inner\n---\n# Inner\n\nSee [the sibling](sibling.md) and [sibling](./sibling.md).\n",
      "sub/sibling.md": "# Sibling\n",
    });
    const l = await draw(g, "host.md");
    expect(text(l)).toEqual([
      "▌ Host",
      "",
      "Before.",
      "",
      "⧉ inner",
      "▎ ▌ Inner",
      "▎",
      "▎ See the sibling and sibling.",
      "",
      "After.",
    ]);
    expect(l.headings.map((h) => h.text)).toEqual(["Host"]); // not the embedded note's
    expect(l.lines.slice(4, 8).every((r) => r.src === 5)).toBe(true); // at the embed's line
    expect(l.embedded).toEqual([g.abs("sub/inner.md")]);
    // Its links: from where it is (sibling.md is beside it), and followed from there.
    const inner = l.links.filter((x) => x.target.includes("sibling"));
    expect(inner.map((x) => [x.status, x.from, x.src])).toEqual([
      ["resolved", "sub/inner.md", 5],
      ["resolved", "sub/inner.md", 5],
    ]);
    // The header, its name, is a link to it.
    expect(l.links.find((x) => x.line === 4)).toMatchObject({
      kind: "image",
      target: "sub/inner.md",
      text: "inner",
      line: 4,
    });
  });

  test("an embedded note deleted, or one that can't be read: a reference, never its old text; changed, drawn as it is now", async () => {
    const { chmodSync } = await import("node:fs");
    const { dir, g } = vaultOf({
      "host.md": "![[gone]]\n\n![[locked]]\n",
      "gone.md": "# Gone\n\nIts text.\n",
      "locked.md": "# Locked\n\nSecret text.\n",
    });
    expect(text(await draw(g, "host.md"))).toContain("▎ Its text.");
    rmSync(join(dir, "gone.md"));
    writeFileSync(join(dir, "locked.md"), "# Locked\n\nNew text, longer.\n");
    chmodSync(join(dir, "locked.md"), 0o000);
    try {
      const l = await draw(g, "host.md");
      expect(l.embedded ?? []).toEqual([]);
      expect(text(l)).toEqual(["⧉ gone", "", "⧉ locked"]);
    } finally {
      chmodSync(join(dir, "locked.md"), 0o644);
    }
    const again = await draw(g, "host.md");
    expect(again.embedded).toEqual([join(dir, "locked.md")]);
    expect(text(again)).toContain("▎ New text, longer.");
  });

  test("a heading's section, a block by its ^id (a paragraph's, a list item's, a table's on the line after); missing ones said", async () => {
    const { g } = vaultOf({
      "host.md":
        "![src › Two](src.md#two)\n\n![src › ^para](src.md#^para)\n\n![src › ^item](src.md#^item)\n\n![src › ^tab](src.md#^tab)\n\n![src › Nope](src.md#nope)\n\n![src › ^nope](src.md#^nope)\n",
      "src.md":
        "# One\n\nfirst\n\n## Two\n\nsecond ^para\n\n### Two-a\n\ndeeper\n\n## Three\n\n- a\n- b ^item\n\n| x |\n| - |\n| 1 |\n\n^tab\n",
    });
    expect(text(await draw(g, "host.md"))).toEqual([
      "⧉ src › Two",
      "▎ ▌ Two",
      "▎",
      "▎ second ^para",
      "▎",
      "▎ ▌ Two-a",
      "▎",
      "▎ deeper",
      "",
      "⧉ src ^para",
      "▎ second",
      "",
      "⧉ src ^item",
      "▎ • b",
      "",
      "⧉ src ^tab",
      "▎ ┌───┐",
      "▎ │ x │",
      "▎ ╞═══╡",
      "▎ │ 1 │",
      "▎ └───┘",
      "",
      "⧉ src › nope",
      '▎ no heading "nope" in src',
      "",
      "⧉ src ^nope",
      "▎ no block ^nope in src",
    ]);
  });

  test("a loop is drawn once, said so; past three deep, a line says to open it; a picture, text around it, nothing found: references", async () => {
    const { g } = vaultOf({
      "a.md": "A\n\n![b](b.md)\n",
      "b.md": "B\n\n![a](a.md)\n",
      "self.md": "S\n\n![self](self.md)\n",
      "d1.md": "![d2](d2.md)\n",
      "d2.md": "![d3](d3.md)\n",
      "d3.md": "![d4](d4.md)\n",
      "d4.md": "![d5](d5.md)\n",
      "d5.md": "bottom\n",
      "refs.md": "![pic.png](pic.png)\n\nsee ![b](b.md) here\n\n![missing](missing.md)\n",
      "pic.png": "png",
    });
    expect(text(await draw(g, "a.md"))).toEqual([
      "A",
      "",
      "⧉ b",
      "▎ B",
      "▎",
      "▎ ⧉ a",
      "▎ ▎ embeds itself: not drawn again",
    ]);
    expect(text(await draw(g, "self.md"))).toEqual(["S", "", "⧉ self", "▎ embeds itself: not drawn again"]);
    const deep = text(await draw(g, "d1.md"));
    expect(deep.at(-1)).toBe("▎ ▎ ▎ ▎ embedded deeper still: enter opens it");
    expect(deep.join("\n")).not.toContain("bottom");
    const refs = await draw(g, "refs.md");
    expect(refs.lines.filter((line) => line.caption)).toHaveLength(3);
    expect(refs.lines.find((line) => line.caption)?.caption?.text).toBe("pic.png");
    expect(text(refs).slice(3)).toEqual(["", "see ⧉ b here", "", "⧉ missing"]);
    expect((await draw(g, "d1.md")).embedded!.sort()).toEqual(["d2.md", "d3.md", "d4.md"].map((r) => g.abs(r)));
  });

  test("the embedded note changed: drawn as it is now, through the render cache too", async () => {
    const { newRenderCache } = await import("../../../../../src/core/rendering/layout/markdown/render.ts");
    const { newParseCache } = await import("../../../../../src/core/documents/markdown/parse.ts");
    const { g } = vaultOf({ "host.md": "# H\n\n![inner](inner.md)\n\nkept\n", "inner.md": "old text\n" });
    const cache = { parse: newParseCache(), render: newRenderCache() };
    expect(text(await draw(g, "host.md", cache))).toContain("▎ old text");
    writeFileSync(g.abs("inner.md"), "new text, longer\n");
    expect(text(await draw(g, "host.md", cache))).toContain("▎ new text, longer");
  });
});
