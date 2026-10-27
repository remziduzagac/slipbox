import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("where a link lands (trailscout's suggestions, 2026-10-06)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-land-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false) };
  };

  test("Turkish dotted and dotless i: [[izmir]] finds İzmir.md, [[ILIK]] ılık.md; the exact spelling still breaks a tie", async () => {
    const { normKey } = await import("../../../../src/core/workspace/links/links.ts");
    expect(normKey("İzmir")).toBe(normKey("izmir"));
    expect(normKey("ILIK")).toBe(normKey("ılık"));
    const { g } = vault({ "İzmir.md": "# İzmir\n\n## İklim\n", "ılık.md": "# Ilık\n", "a.md": "x\n" });
    const at = (target: string, from = "a.md") => g.resolveLink({ kind: "wiki", target }, from);
    expect(at("izmir")).toMatchObject({ resolvedKind: "note", path: "İzmir.md" });
    expect(at("ILIK")).toMatchObject({ resolvedKind: "note", path: "ılık.md" });
    expect(at("İZMİR")).toMatchObject({ resolvedKind: "note", path: "İzmir.md" });
    // Both spellings: the one written exactly, wherever it is.
    const both = vault({ "İzmir.md": "# İzmir\n", "sub/izmir.md": "# x\n", "sub/b.md": "x\n", "a.md": "x\n" }).g;
    expect(both.resolveLink({ kind: "wiki", target: "izmir" }, "a.md")).toMatchObject({ path: "sub/izmir.md" });
    expect(both.resolveLink({ kind: "wiki", target: "İzmir" }, "sub/b.md")).toMatchObject({ path: "İzmir.md" });
    // A heading starting with İ, by a link typed plainly.
    const { landingLine } = await import("../../../../src/core/workspace/links/landing.ts");
    expect(landingLine(g, "İzmir.md", "iklim", null)).toBe(3);
    expect(landingLine(g, "İzmir.md", "İklim", null, true)).toBe(3);
  });

  test("repeated headings: a markdown link's #setup-1 is the second (GitHub's numbering); a wikilink's text, the first — said so by the link check", async () => {
    const { githubSlugs, landingLine } = await import("../../../../src/core/workspace/links/landing.ts");
    expect(githubSlugs(["a", "a", "a-1", "b", "a"].map((slug) => ({ slug })))).toEqual([
      "a",
      "a-1",
      "a-1-1",
      "b",
      "a-2",
    ]);
    const { dir, g } = vault({
      "n.md": "# N\n\n## Setup\n\none\n\n## Setup\n\ntwo\n",
      "a.md": "[1](n.md#setup) [2](n.md#setup-1) [[n#Setup]]\n",
    });
    expect(landingLine(g, "n.md", "setup", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup-1", null)).toBe(7);
    expect(landingLine(g, "n.md", "Setup", null, true)).toBe(3);
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    const probs = noteProblems(g, "a.md").map((p) => [p.code, p.target, p.message]);
    expect(probs).toEqual([
      ["ambiguous-heading", "n", 'several headings "Setup" in n.md: this link reaches the first'],
    ]);
    // resolve gives the line and the fragment to write: the second, numbered.
    const r = JSON.parse((await cli(["--root", dir, "resolve", "n.md#setup-1", "--from", "a.md", "--json"])).out).data;
    expect(r).toMatchObject({ line: 7, href: "n.md#setup-1" });
  });

  test("a path of headings (Obsidian's [[note#Install#Linux]]): each inside the one before", async () => {
    const { landingLine } = await import("../../../../src/core/workspace/links/landing.ts");
    const { g } = vault({ "n.md": "# N\n\n## Install\n\n### Linux\n\ni\n\n## Remove\n\n### Linux\n\nr\n" });
    expect(landingLine(g, "n.md", "Install#Linux", null, true)).toBe(5);
    expect(landingLine(g, "n.md", "Remove#Linux", null, true)).toBe(11);
    expect(landingLine(g, "n.md", "Remove#Install", null, true)).toBeNull(); // not inside it
    const later = vault({ "m.md": "# M\n\n## Install\n\ni\n\n## Remove\n\n### Usage\n" }).g;
    expect(landingLine(later, "m.md", "Install#Usage", null, true)).toBeNull(); // a later section's
  });

  test("explicit ids: `## Setup {#install-guide}` (shown without it), <a id>, <a name>; GitHub's slugs keep marks", async () => {
    const { landingLine } = await import("../../../../src/core/workspace/links/landing.ts");
    const { slugify } = await import("../../../../src/core/documents/markdown/parse.ts");
    expect(slugify("हिन्दी नोट्स")).toBe("हिन्दी-नोट्स"); // the vowel signs kept, as GitHub keeps them
    expect(slugify("snake_case & Co.")).toBe("snake_case--co");
    const { g } = vault({
      "n.md":
        '# N\n\n## Setup {#install-guide .wide}\n\nx\n\n<a id="faq"></a>\n\nQ?\n\nThe <a name="old">old</a> place.\n',
    });
    expect(g.entry("n.md")!.headings.find((h) => h.depth === 2)).toMatchObject({ text: "Setup", id: "install-guide" });
    expect(landingLine(g, "n.md", "install-guide", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup", null)).toBe(3); // its own slug too
    expect(landingLine(g, "n.md", "faq", null)).toBe(7);
    expect(landingLine(g, "n.md", "old", null)).toBe(11);
    const r = renderMarkdown("## Setup {#install-guide}\n", {
      width: 40,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    expect(r.lines.map((l) => l.spans.map((s) => s.text).join("")).join("\n")).not.toContain("{#");
    expect(r.headings[0]).toMatchObject({ text: "Setup", id: "install-guide" });
  });

  test("line links: L42, L42-L50, L42C5-L45C10; a ^id inside a code fence is code, not a block", async () => {
    const { blockIds, landingLine, landingText, lineFragment } = await import(
      "../../../../src/core/workspace/links/landing.ts"
    );
    expect(lineFragment("L42-L50")).toEqual({ line: 42, col: null, endLine: 50 });
    expect(lineFragment("L42C5-L45C10")).toEqual({ line: 42, col: 5, endLine: 45 });
    expect(lineFragment("L0")).toEqual({ line: 1, col: null, endLine: null });
    expect(lineFragment("Lx")).toBeNull();
    const text =
      "# N\n\n```js\nconst a = 1; ^fake\n```\n\nreal paragraph ^real\n\n~~~~\n``` not a close\n~~~\nb ^fake2\n~~~~\n\n```not `a` fence\nstill text ^inline\n";
    expect(blockIds(text)).toEqual([
      { id: "real", line: 7 },
      { id: "inline", line: 16 },
    ]);
    const { g } = vault({ "n.md": text });
    expect(landingLine(g, "n.md", null, "fake")).toBeNull();
    expect(landingLine(g, "n.md", null, "real")).toBe(7);
    expect(landingLine(g, "n.md", "L3C2-L5C1", null)).toBe(3);
    expect(landingText(g, "n.md", "L3-L5", null)).toBe("```js\nconst a = 1; ^fake\n```");
  });

  test("a link to a note itself lands on its start, its front matter left out; one never closed is text; a note that isn't, nothing", async () => {
    const { landingText } = await import("../../../../src/core/workspace/links/landing.ts");
    const { g } = vault({
      "plan.md": "---\ntitle: Plan\ntags: [a]\n---\n\n# Plan\n\nThe body.\n",
      "yaml.md": "---\ntitle: Dots\n...\nAfter the dots.\n",
      "open.md": "---\ntitle: Open\nno close\n",
    });
    expect(landingText(g, "plan.md", null, null)).toBe("# Plan\n\nThe body.");
    expect(landingText(g, "yaml.md", null, null)).toBe("After the dots.");
    expect(landingText(g, "open.md", null, null)).toBe("---\ntitle: Open\nno close");
    expect(landingText(g, "nope.md", null, null)).toBeNull();
  });
});
