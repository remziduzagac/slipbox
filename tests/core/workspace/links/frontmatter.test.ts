import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links in front matter (Obsidian's properties)", () => {
  test("a property's wikilinks are links: read where written, backlinked, renamed in place, drawn and checked; a comment's aren't", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-fmlinks-"));
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "Dal.md"), "# Dal\n");
    writeFileSync(join(dir, "Home.md"), "# Home\n");
    writeFileSync(join(dir, "pic.png"), "png");
    writeFileSync(
      join(dir, "x.md"),
      '---\nrelated: "[[Dal]]"\nup: ["[[Home|home]]", "![[pic.png]]"]\n# not this: [[Nope]]\nmissing: "[[Gone]]"\n---\n# X\n',
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("x.md").map((l) => [l.kind, l.target, l.line, l.column, l.resolvedKind])).toEqual([
      ["wiki", "Dal", 2, 11, "note"],
      ["wiki", "Home", 3, 7, "note"],
      ["embed", "pic.png", 3, 24, "file"],
      ["wiki", "Gone", 5, 11, "unresolved"],
    ]);
    expect(g.backlinks("Dal.md").map((b) => b.from)).toEqual(["x.md"]);
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    expect(noteProblems(g, "x.md").map((p) => [p.code, p.target, p.start.line])).toEqual([["unresolved", "Gone", 5]]);
    // Drawn as links in the properties.
    const parsed = (await import("../../../../src/core/documents/model/readers.ts")).parseNoteFile(
      "x.md",
      readFileSync(join(dir, "x.md"), "utf8"),
    );
    const { renderTree } = await import("../../../../src/core/rendering/layout/markdown/render.ts");
    const r = renderTree(
      parsed.tree,
      {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
        resolveLink: (_k, t) => (t === "Gone" ? "unresolved" : "resolved"),
      },
      parsed.frontmatter,
    );
    expect(r.links.map((l) => [l.kind, l.target, l.text])).toEqual([
      ["wiki", "Dal", "Dal"],
      ["wiki", "Home", "home"],
      ["embed", "pic.png", "pic.png"],
      ["wiki", "Gone", "Gone"],
    ]);
    // Renamed: the property rewritten where it is.
    expect((await cli(["--root", dir, "mv", "Dal.md", "Lentils.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "x.md"), "utf8")).toStartWith('---\nrelated: "[[Lentils]]"\n');
  });
});

describe("review cycle 3 (core)", () => {
  /** A root (`.slipbox/` unless said) holding `files`, indexed. */
  const root = (files: Record<string, string>, marker = ".slipbox") => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-"));
    mkdirSync(join(dir, marker));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };

  test("a front matter line's trailing YAML comment holds no links: `# was [[Draft]]` is neither a link nor broken", async () => {
    const { frontmatterLinks } = await import("../../../../src/core/workspace/graph/graph.ts");
    const targets = (raw: string) => frontmatterLinks(raw).map((l) => l.target);
    expect(targets('related: "[[Plan]]"  # was [[Draft]]\n# all [[Gone]]\n')).toEqual(["Plan"]);
    // A `#` in a link, or in quotes, is no comment; a plain scalar's apostrophe opens no quote.
    expect(
      targets("up: \"[[Plan#Goals]]\" # [[No]]\nt: \"a # b [[In]]\"\nu: 'it''s # [[In2]]'\nby: Bob's # [[No2]]\n"),
    ).toEqual(["Plan", "In", "In2"]);
    const { g } = root(
      { "Plan.md": "# P\n", "x.md": '---\nrelated: "[[Plan]]"  # was [[Draft]]\n---\n# X\n' },
      ".obsidian",
    );
    expect(g.linksOf("x.md").map((l) => l.target)).toEqual(["Plan"]);
    expect(g.problems().broken.map((p) => p.target)).not.toContain("Draft");
  });
});
