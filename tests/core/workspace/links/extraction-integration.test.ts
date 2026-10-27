import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links out of data files and to files (16.15)", () => {
  test("a data file's links resolve and count as backlinks; a note's link to a file is a backlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-datalinks-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "schemas"));
    writeFileSync(join(dir, "schemas", "user.json"), '{"type": "object"}\n');
    writeFileSync(join(dir, "design.md"), "# Design\n\nSee [the config](app.toml).\n");
    writeFileSync(
      join(dir, "app.toml"),
      '[api]\nschema = "schemas/user.json"\ndocs = "design.md"\nout = "no/such/dir/"\nhome = "https://example.invalid"\n',
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const links = g.linksOf("app.toml");
    expect(links.map((l) => [l.target, l.resolvedKind])).toEqual([
      ["schemas/user.json", "file"],
      ["design.md", "note"],
      ["https://example.invalid", "external"],
    ]); // "no/such/dir/" isn't a link: a path-like value counts only when it resolves
    expect(g.backlinks("schemas/user.json").map((b) => [b.from, b.line])).toEqual([["app.toml", 2]]);
    expect(g.backlinks("design.md").map((b) => b.from)).toEqual(["app.toml"]);
    expect(g.backlinks("app.toml").map((b) => b.from)).toEqual(["design.md"]);
  });
});

describe("link destinations at their edges (CommonMark)", () => {
  test("a bare space or an unbalanced paren ends it; <…>, %20 and titles are read; brackets in a name; empty is the note", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-dest-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const f of ["my note.md", "plan (v2).md", "draft [wip].md", "x.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    const body = [
      "[space](my note.md)",
      "[paren](plan (v2).md)",
      "[angle](<my note.md>)",
      "[enc](plan%20(v2).md)",
      "[brackets](<draft [wip].md>)",
      '[title](x.md "A title")',
      "[single](x.md 'single')",
      "[empty]()",
      "[hash](#)",
    ];
    writeFileSync(join(dir, "probe.md"), `${body.join("\n\n")}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("probe.md").map((l) => [l.text, l.resolvedKind, l.path])).toEqual([
      ["angle", "note", "my note.md"],
      ["enc", "note", "plan (v2).md"],
      ["brackets", "note", "draft [wip].md"],
      ["title", "note", "x.md"],
      ["single", "note", "x.md"],
      ["empty", "anchor", "probe.md"],
      ["hash", "anchor", "probe.md"],
    ]);
  });
});

describe("links in code comments (16.10)", () => {
  test("a comment's paths that name vault files, `path:line` and URLs are links and backlinks; a string's aren't", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-codelinks-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "design.md"), "# Design\n");
    writeFileSync(join(dir, "src", "util.ts"), "export const x = 1;\n");
    writeFileSync(
      join(dir, "src", "main.ts"),
      '// The design: design.md, and util.ts:1 (next to this file).\n/* See https://example.invalid/x. */\nconst s = "design.md";\n// console.log and no-such.md aren\'t links\n',
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    // Until its grammar has loaded, a code file has no links yet (the TUI hears when it lands).
    await g.loadGrammars();
    expect(g.linksOf("src/main.ts").map((l) => [l.target, l.resolvedKind, l.line, l.column, l.text])).toEqual([
      ["/design.md", "note", 1, 16, "design.md"], // from the vault's root
      ["/src/util.ts#L1", "file", 1, 31, "util.ts:1"], // relative to the file first
      ["https://example.invalid/x", "external", 2, 8, "https://example.invalid/x"],
    ]);
    expect(g.backlinks("design.md").map((b) => [b.from, b.line])).toEqual([["src/main.ts", 1]]);
    expect(g.backlinks("src/util.ts").map((b) => b.from)).toEqual(["src/main.ts"]);
  });

  test("a code or data file moved: its own relative paths follow it, each in its form; one the root still reaches stays (D63)", async () => {
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-ownpaths-"));
    const files: Record<string, string> = {
      ".slipbox/config.toml": "",
      "docs/x.md": "# X\n",
      "schemas/user.yaml": "type: object\n",
      "src/util.ts": "export const u = 1;\n",
      "src/a.ts":
        "// see ../docs/x.md and util.ts:1:2; from the root docs/x.md; https://example.invalid/x\nexport const a = 1;\n",
      "api/spec.yaml": "user:\n  $ref: ../schemas/user.yaml#/definitions/User\nguide: ../docs/x.md\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await g.loadGrammars();
    const reached = (gr: typeof g, rel: string) => gr.linksOf(rel).map((l) => [l.resolvedKind, l.path]);
    const code = reached(g, "src/a.ts");
    const data = reached(g, "api/spec.yaml");
    applyPlan(g, planNoteRename(g, "src/a.ts", "src/sub/a.ts"));
    expect(read("src/sub/a.ts")).toBe(
      "// see ../../docs/x.md and ../util.ts:1:2; from the root docs/x.md; https://example.invalid/x\nexport const a = 1;\n",
    );
    applyPlan(g, planNoteRename(g, "api/spec.yaml", "api/v2/spec.yaml"));
    expect(read("api/v2/spec.yaml")).toBe(
      "user:\n  $ref: ../../schemas/user.yaml#/definitions/User\nguide: ../../docs/x.md\n",
    );
    // Each reaches what it did.
    const after = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await after.loadGrammars();
    expect(reached(after, "src/sub/a.ts")).toEqual(code);
    expect(reached(after, "api/v2/spec.yaml")).toEqual(data);
    expect(code.map(([, p]) => p)).toEqual(["docs/x.md", "src/util.ts", "docs/x.md", "https://example.invalid/x"]);
    expect(data.map(([, p]) => p)).toEqual(["schemas/user.yaml", "docs/x.md"]);
  });
});

describe("links in a component's comments (16.10, 16.22)", () => {
  test("a path in a Vue component's script comment, or its template's: a link and a backlink, at its place in the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-complinks-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "design.md"), "# Design\n");
    writeFileSync(
      join(dir, "Card.vue"),
      '<template>\n  <!-- the layout: design.md -->\n  <p>x</p>\n</template>\n<script setup lang="ts">\n  // why: design.md\n  const s = "design.md";\n</script>\n',
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await g.loadGrammars(); // Vue's, and TypeScript's for its script
    expect(g.linksOf("Card.vue").map((l) => [l.target, l.resolvedKind, l.line, l.column])).toEqual([
      ["/design.md", "note", 2, 20],
      ["/design.md", "note", 6, 11], // in the script, where it is in the file
    ]);
    expect(g.backlinks("design.md").map((b) => [b.from, b.line])).toEqual([
      ["Card.vue", 2],
      ["Card.vue", 6],
    ]);
  });
});
