import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("how every link landed, and fragile links (trailscout's review)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-how-"));
    mkdirSync(join(dir, ".obsidian"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false) };
  };
  const files = {
    "Home.md": "[[Notes]] [[Recipes/Notes]] [[Dal]] [[Weeknight/Dal]] [[Pie]] [[Starter]] [p](Recipes/Notes.md)\n",
    "Notes.md": "# N\n",
    "Recipes/Notes.md": "# RN\n",
    "Recipes/Weeknight/Dal.md": "# D\n",
    "Recipes/Baking/Pie.md": "# P\n",
    "Archive/Old/Older/Pie.md": "# P2\n",
    "Recipes/Baking/Starter.md": "# S\n",
    "Archive/Starter.md": "# S2\n",
    "Recipes/Baking/x.md": "[[Starter]]\n",
  };

  test("each says how: its path, its end, its name alone, a tie broken — and how sure: exact or inferred", async () => {
    const { certainty, describeLanding } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { g } = vault(files);
    const how = (target: string, from = "Home.md", kind: "wiki" | "markdown" = "wiki") => {
      const r = g.resolveLink({ kind, target }, from);
      return [r.path, r.how ?? null, certainty(r), describeLanding(r)];
    };
    expect(how("Notes")).toEqual(["Notes.md", "same-folder", "inferred", "in the same folder, of 2"]);
    expect(how("Recipes/Notes")).toEqual(["Recipes/Notes.md", "path", "exact", null]);
    expect(how("Dal")).toEqual(["Recipes/Weeknight/Dal.md", "name", "exact", null]);
    expect(how("Weeknight/Dal")).toEqual(["Recipes/Weeknight/Dal.md", "suffix", "inferred", "by the end of its path"]);
    expect(how("Pie")).toEqual(["Recipes/Baking/Pie.md", "shortest", "inferred", "the shortest path of 2 named so"]);
    expect(how("Starter", "Recipes/Baking/x.md")).toEqual([
      "Recipes/Baking/Starter.md",
      "same-folder",
      "inferred",
      "in the same folder, of 2",
    ]);
    expect(how("Starter")).toEqual(["Archive/Starter.md", "shortest", "inferred", "the shortest path of 2 named so"]);
    expect(how("Recipes/Notes.md", "Home.md", "markdown")).toEqual(["Recipes/Notes.md", "path", "exact", null]);
    expect(certainty({ resolvedKind: "ambiguous" })).toBe("ambiguous");
    expect(certainty({ resolvedKind: "unresolved" })).toBe("broken");
  });

  test("every link says how it landed, not wikilinks only: a markdown link by its path, a pointer by its folder's name, a hosting URL by the remote (D86)", async () => {
    const { certainty, describeLanding } = await import("../../../../src/core/workspace/graph/graph.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-how-kinds-"));
    const name = `h${basename(dir)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, ".git", "config"), `[remote "origin"]\n\turl = git@github.com:me/${name}.git\n`);
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "plan.md"), "# Plan\n");
    const pointer = `slipbox://${name}/docs/plan.md`;
    const hosted = `https://github.com/me/${name}/blob/main/docs/plan.md`;
    writeFileSync(
      join(dir, "README.md"),
      `[p](docs/plan.md) [d](docs/) [ptr](${pointer}) [h](${hosted}) [out](../elsewhere.md)\n`,
    );
    const resolved = async (link: string) => {
      const r = JSON.parse((await cli(["--root", dir, "resolve", link, "--from", "README.md", "--json"])).out).data;
      return [r.status, r.path, r.how, r.certainty];
    };
    expect(await resolved("docs/plan.md")).toEqual(["resolved", "docs/plan.md", "path", "exact"]);
    expect(await resolved(pointer)).toEqual(["resolved", "docs/plan.md", "pointer", "exact"]);
    expect(await resolved(hosted)).toEqual(["resolved", "docs/plan.md", "hosting", "exact"]);
    // The resolver's own: every link reaching a file or folder; nothing to say in the hover or the link check for an exact one.
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("README.md").map((l) => [l.target, l.how ?? null, certainty(l), describeLanding(l)])).toEqual([
      ["docs/plan.md", "path", "exact", null],
      ["docs/", "path", "exact", null],
      [pointer, "pointer", "exact", null],
      [hosted, "hosting", "exact", null],
      ["../elsewhere.md", null, "broken", null],
    ]);
  });

  test("a link won by where it's written is fragile: said, with the path that names it for sure, a fix; problems and the CLI list them", async () => {
    const { dir, g } = vault(files);
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    const fragile = noteProblems(g, "Home.md").filter((p) => p.code === "fragile");
    expect(fragile.map((p) => [p.target, p.fix])).toEqual([
      ["Pie", { title: "Name it for sure: [[Recipes/Baking/Pie]]", text: "[[Recipes/Baking/Pie]]" }],
      ["Starter", { title: "Name it for sure: [[Archive/Starter]]", text: "[[Archive/Starter]]" }],
    ]);
    expect(fragile[0]!.message).toBe(
      "[[Pie]] reaches Recipes/Baking/Pie.md as the shortest path of 2 named so — a note of that name nearer would take it; [[Recipes/Baking/Pie]] names it for sure",
    );
    expect(g.problems().fragile.map((p) => [p.from, p.target, p.fix])).toEqual([
      ["Home.md", "Pie", "Recipes/Baking/Pie"],
      ["Home.md", "Starter", "Archive/Starter"],
    ]);
    const human = (await cli(["--root", dir, "problems"])).out;
    expect(human).toContain("fragile links (2)");
    expect(human).toContain(
      "Home.md:1:55  [[Pie]]  — the shortest path of 2 named so; [[Recipes/Baking/Pie]] names it for sure",
    );
    const links = JSON.parse((await cli(["--root", dir, "links", "Home.md", "--json"])).out).data;
    expect(
      links.map((l: { target: string; how: string; certainty: string }) => [l.target, l.how, l.certainty]),
    ).toEqual([
      ["Notes", "same-folder", "inferred"],
      ["Recipes/Notes", "path", "exact"],
      ["Dal", "name", "exact"],
      ["Weeknight/Dal", "suffix", "inferred"],
      ["Pie", "shortest", "inferred"],
      ["Starter", "shortest", "inferred"],
      ["Recipes/Notes.md", "path", "exact"],
    ]);
    expect((await cli(["--root", dir, "links", "Home.md"])).out).toContain(
      "[[Pie]] -> Recipes/Baking/Pie.md (the shortest path of 2 named so)",
    );
  });

  test("a note coming or going that sends links by name elsewhere is said — not a link that breaks or heals", async () => {
    const { g } = vault(files);
    const told: string[] = [];
    g.onRetarget((rs) => told.push(...rs.map((r) => `${r.from}:${r.line} [[${r.target}]] ${r.was} → ${r.now}`)));
    // A Pie nearer Home than both: [[Pie]] goes there.
    const near = join(g.root, "Pie.md");
    writeFileSync(near, "# P3\n");
    g.updateFile("Pie.md", { rel: "Pie.md", abs: near, size: 5, mtimeMs: Date.now() });
    expect(told).toEqual(["Home.md:1 [[Pie]] Recipes/Baking/Pie.md → Pie.md"]);
    // A name of its own: nothing to say, and no link looked at to know it.
    told.length = 0;
    let looked = 0;
    const resolve = g.resolveLink.bind(g);
    g.resolveLink = (l, from) => (looked++, resolve(l, from));
    writeFileSync(join(g.root, "Lone.md"), "# L\n");
    g.updateFile("Lone.md", { rel: "Lone.md", abs: join(g.root, "Lone.md"), size: 4, mtimeMs: Date.now() });
    expect([told, looked]).toEqual([[], 0]);
    g.resolveLink = resolve;
    // A link that reached a note by an alias, and a note of that name comes: it takes the link — said.
    writeFileSync(join(g.root, "Recipes/Baking/Pie.md"), "---\naliases: [Crust]\n---\n# P\n");
    g.updateFile("Recipes/Baking/Pie.md", {
      rel: "Recipes/Baking/Pie.md",
      abs: join(g.root, "Recipes/Baking/Pie.md"),
      size: 30,
      mtimeMs: Date.now(),
    });
    writeFileSync(join(g.root, "Home.md"), "[[Pie]] [[Crust]]\n");
    g.updateFile("Home.md", { rel: "Home.md", abs: join(g.root, "Home.md"), size: 18, mtimeMs: Date.now() });
    writeFileSync(join(g.root, "Crust.md"), "# C\n");
    g.updateFile("Crust.md", { rel: "Crust.md", abs: join(g.root, "Crust.md"), size: 4, mtimeMs: Date.now() });
    expect(told).toEqual(["Home.md:1 [[Crust]] Recipes/Baking/Pie.md → Crust.md"]);
    g.removeFile("Crust.md");
    told.length = 0;
    // Gone again: back to where it was.
    g.removeFile("Pie.md");
    expect(told).toEqual(["Home.md:1 [[Pie]] Pie.md → Recipes/Baking/Pie.md"]);
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

  test("a fragile link to a top-level note is fixed by a relative path: [[plan]] → [[../plan]], never [[plan]] again", async () => {
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    const { g } = root({
      "plan.md": "# P\n",
      "a/b/plan.md": "# P2\n",
      "dal.png": "png",
      "a/b/dal.png": "png",
      "x/note.md": "See [[plan]]. ![[dal.png]]\n",
      "top.md": "[[plan]]\n",
    });
    expect(g.resolveLink({ kind: "wiki", target: "plan" }, "x/note.md")).toMatchObject({
      path: "plan.md",
      how: "shortest",
    });
    // A top-level attachment, its extension written, is its path from the root already: not fragile.
    expect(g.resolveLink({ kind: "embed", target: "dal.png" }, "x/note.md")).toMatchObject({
      path: "dal.png",
      how: "path",
    });
    expect(
      g
        .problems()
        .fragile.filter((p) => p.from !== "top.md")
        .map((p) => [p.from, p.target, p.fix]),
    ).toEqual([["x/note.md", "plan", "../plan"]]);
    const fixes = noteProblems(g, "x/note.md").filter((p) => p.code === "fragile");
    expect(fixes.map((p) => p.fix)).toEqual([{ title: "Name it for sure: [[../plan]]", text: "[[../plan]]" }]);
    expect(fixes[0]!.message).toContain("[[../plan]] names it for sure");
    // The fix names it by its path: a note of that name nearer can't take it.
    writeFileSync(join(g.root, "x", "plan.md"), "# near\n");
    g.updateFile("x/plan.md", { rel: "x/plan.md", abs: join(g.root, "x", "plan.md"), size: 7, mtimeMs: Date.now() });
    expect(g.resolveLink({ kind: "wiki", target: "../plan" }, "x/note.md")).toMatchObject({
      resolvedKind: "note",
      path: "plan.md",
      how: "path",
    });
    expect(g.resolveLink({ kind: "embed", target: "../dal.png" }, "x/note.md")).toMatchObject({
      resolvedKind: "file",
      path: "dal.png",
    });
  });
});
