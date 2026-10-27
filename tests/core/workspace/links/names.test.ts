import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { elsewhereAt, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links by name, read again within their root (21.3)", () => {
  test("a wikilink is read within its root (21.3): a name, a path, an alias, an attachment; ties ambiguous", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes", "deep"), { recursive: true });
    mkdirSync(join(dir, "other"));
    mkdirSync(join(dir, "img"));
    writeFileSync(
      join(dir, "a.md"),
      "# A\n\n[[b]] [[notes/b#B]] [[bee|the bee]] ![[photo.png]] [[two]] [[research:b]] [[nowhere]]\n",
    );
    writeFileSync(join(dir, "notes", "b.md"), "---\naliases: [bee]\nprevious_names: [old-b]\n---\n# B\n");
    writeFileSync(join(dir, "notes", "two.md"), "# Two\n");
    writeFileSync(join(dir, "other", "two.md"), "# Two\n");
    writeFileSync(join(dir, "notes", "deep", "near.md"), "[[two]]\n");
    writeFileSync(join(dir, "img", "photo.png"), "png");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "a.md", kind: "wiki" | "embed" = "wiki") =>
      g.resolveLink({ kind, target }, from);
    expect(at("b")).toMatchObject({ resolvedKind: "note", path: "notes/b.md" });
    expect(at("notes/b")).toMatchObject({ resolvedKind: "note", path: "notes/b.md" });
    expect(at("b.md")).toMatchObject({ resolvedKind: "note", path: "notes/b.md" });
    expect(at("bee")).toMatchObject({ resolvedKind: "note", path: "notes/b.md", via: "alias" });
    expect(at("photo.png", "a.md", "embed")).toMatchObject({ resolvedKind: "file", path: "img/photo.png" }); // by its name, anywhere
    // Two notes of one name: from the root, a tie; from beside one, the nearest.
    expect(at("two")).toMatchObject({ resolvedKind: "ambiguous", candidates: ["notes/two.md", "other/two.md"] });
    expect(at("two", "notes/deep/near.md")).toMatchObject({ resolvedKind: "note", path: "notes/two.md" });
    // Not read: a previous name, `[[vault:note]]`.
    expect(at("old-b").resolvedKind).toBe("unresolved");
    expect(at("research:b").resolvedKind).toBe("unresolved");
    expect(at("nowhere")).toMatchObject({ resolvedKind: "unresolved", path: null });
    // Backlinks by wikilink too: b's, from a, by name, path and alias.
    expect(g.backlinks("notes/b.md").map((b) => b.target)).toEqual(["b", "notes/b", "bee"]);
    // With no root, a name names nothing — said why.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-wiki-loose-"));
    writeFileSync(join(loose, "x.md"), "[[y]]\n");
    writeFileSync(join(loose, "y.md"), "# Y\n");
    const lg = openGraph(elsewhereAt(loose), DEFAULT_CONFIG, true);
    expect(lg.resolveLink({ kind: "wiki", target: "y" }, "x.md")).toMatchObject({
      resolvedKind: "unresolved",
      reason: "names need a vault, and this folder is in none: .git, .slipbox/, .obsidian/ or .zk/ makes one",
    });
  });

  test("two attachments of one name, as two notes: the nearest, then the shortest; a real tie ambiguous (21.3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-att-"));
    mkdirSync(join(dir, ".obsidian"));
    for (const d of ["attachments", "Archive/attachments", "Recipes/img", "x", "y"])
      mkdirSync(join(dir, d), { recursive: true });
    for (const f of [
      "attachments/dal.png",
      "Archive/attachments/dal.png",
      "Recipes/img/dal.png",
      "x/pic.png",
      "y/pic.png",
    ])
      writeFileSync(join(dir, f), "png");
    writeFileSync(join(dir, "Home.md"), "![[dal.png]] ![[pic.png]]\n");
    mkdirSync(join(dir, "Archive", "old"), { recursive: true });
    writeFileSync(join(dir, "Archive", "old", "menu.md"), "![[dal.png]]\n");
    writeFileSync(join(dir, "Recipes", "dal.md"), "![[dal.png]]\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "embed", target }, from);
    expect(at("dal.png", "Home.md")).toMatchObject({ resolvedKind: "file", path: "attachments/dal.png" }); // the shortest
    expect(at("dal.png", "Archive/old/menu.md")).toMatchObject({
      resolvedKind: "file",
      path: "Archive/attachments/dal.png",
    }); // the nearest
    expect(at("dal.png", "Recipes/dal.md")).toMatchObject({ resolvedKind: "file", path: "Recipes/img/dal.png" });
    expect(at("pic.png", "Home.md")).toMatchObject({
      resolvedKind: "ambiguous",
      candidates: ["x/pic.png", "y/pic.png"],
    });
  });

  test("a Markdown export's pictures answer no lookup by name: ![[dal.png]] finds the picture, not its copy; a path through it does", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-export-"));
    mkdirSync(join(dir, ".obsidian"));
    for (const d of [
      "attachments",
      "Recipes/dal.export.assets",
      "Recipes/menu.export.assets",
      "Recipes/old.export.assets",
    ])
      mkdirSync(join(dir, d), { recursive: true });
    for (const f of [
      "attachments/dal.png",
      "Recipes/dal.export.assets/dal.png",
      "Recipes/menu.export.assets/dal.png",
      "Recipes/old.export.assets/only.png",
    ])
      writeFileSync(join(dir, f), "png");
    writeFileSync(join(dir, "Recipes", "dal.md"), "![[dal.png]] ![[only.png]]\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "embed", target }, from);
    // The copies, nearer and two of them, would have won or tied.
    expect(at("dal.png", "Recipes/dal.md")).toMatchObject({ resolvedKind: "file", path: "attachments/dal.png" });
    expect(at("only.png", "Recipes/dal.md")).toMatchObject({ resolvedKind: "unresolved" });
    expect(at("menu.export.assets/dal.png", "x.md")).toMatchObject({
      resolvedKind: "file",
      path: "Recipes/menu.export.assets/dal.png",
    });
    // The converter's old reading of a wikilink, alike.
    expect(g.resolveLegacyWiki({ kind: "embed", target: "dal.png" }, "Recipes/dal.md")).toMatchObject({
      resolvedKind: "file",
      path: "attachments/dal.png",
    });
  });

  test("any Markdown export's pictures, whatever its name: the folder beside a note marked as an export; another .assets folder answers (DF-D25)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-export-any-"));
    mkdirSync(join(dir, ".obsidian"));
    for (const d of ["attachments", "Recipes/book.assets", "Recipes/sub/deep.assets", "Recipes/mine.assets"])
      mkdirSync(join(dir, d), { recursive: true });
    for (const f of [
      "attachments/dal.png",
      "Recipes/book.assets/dal.png",
      "Recipes/sub/deep.assets/dal.png",
      "Recipes/mine.assets/own.png",
    ])
      writeFileSync(join(dir, f), "png");
    const mark = '---\ntitle: "Book"\ngenerator: slipbox\n---\n\n# Book\n';
    writeFileSync(join(dir, "Recipes", "book.md"), mark); // -o book.md: its pictures in book.assets/
    writeFileSync(join(dir, "Recipes", "sub", "deep.markdown"), mark);
    writeFileSync(join(dir, "Recipes", "mine.md"), "# Mine\n"); // a note of the name, not an export: its folder is yours
    writeFileSync(join(dir, "Recipes", "dal.md"), "![[dal.png]] ![[own.png]]\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "Recipes/dal.md") => g.resolveLink({ kind: "embed", target }, from);
    expect(at("dal.png")).toMatchObject({ resolvedKind: "file", path: "attachments/dal.png" });
    expect(at("own.png")).toMatchObject({ resolvedKind: "file", path: "Recipes/mine.assets/own.png" });
    expect(at("book.assets/dal.png", "x.md")).toMatchObject({
      resolvedKind: "file",
      path: "Recipes/book.assets/dal.png",
    });
    expect(g.resolveLegacyWiki({ kind: "embed", target: "dal.png" }, "Recipes/dal.md")).toMatchObject({
      resolvedKind: "file",
      path: "attachments/dal.png",
    });
    // The mark taken out (the file no export any more): its folder answers again, the nearer copy now.
    writeFileSync(join(dir, "Recipes", "book.md"), "# Book\n\nMine now.\n");
    const st = statSync(join(dir, "Recipes", "book.md"));
    g.updateFile("Recipes/book.md", {
      rel: "Recipes/book.md",
      abs: join(dir, "Recipes", "book.md"),
      size: st.size,
      mtimeMs: st.mtimeMs + 1,
    });
    expect(at("dal.png")).toMatchObject({ resolvedKind: "file", path: "Recipes/book.assets/dal.png" });
  });

  test("renamed, a note's wikilinks follow in their form — a name a name, a path a path, an alias kept; resolve reads them (21.3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-mv-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "a.md"), "[[b]] [[notes/b#B]] [[bee|the bee]] ![[b]]\n");
    writeFileSync(join(dir, "notes", "b.md"), "---\naliases: [bee]\n---\n# B\n");
    const r = await cli(["--root", dir, "resolve", "[[b#B]]", "--from", "a.md", "--json"]);
    expect(JSON.parse(r.out).data).toMatchObject({ status: "resolved", path: "notes/b.md" });
    expect(
      JSON.parse((await cli(["--root", dir, "resolve", "[[nowhere]]", "--from", "a.md", "--json"])).out).data.status,
    ).toBe("unresolved");
    expect((await cli(["--root", dir, "mv", "notes/b.md", "notes/c.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[c]] [[notes/c#B]] [[bee|the bee]] ![[c]]\n");
  });

  test("a wikilink's names end at a root nested in its own; a path into it is a path (21.3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-nested-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "inner", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "a.md"), "[[deepnote]] [[inner/deepnote]]\n");
    writeFileSync(join(dir, "inner", "deepnote.md"), "# Deep\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.resolveLink({ kind: "wiki", target: "deepnote" }, "a.md").resolvedKind).toBe("unresolved");
    expect(g.resolveLink({ kind: "wiki", target: "inner/deepnote" }, "a.md")).toMatchObject({
      resolvedKind: "note",
      path: join(dir, "inner", "deepnote.md"),
    });
  });
});

describe("review cycle 3 (core)", () => {
  test("a wikilink path to a dotted name (2024.01.05, v1.2) reaches its note out of the root and into a nested one, a backlink there", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-dotted-"));
    const files: Record<string, string> = {
      "A/.slipbox/config.toml": "",
      "A/n.md": "[[../B/2024.01.05]] [[../B/plan]] [[outreach/v1.2]] ![[../B/pic.v2.png]]\n",
      "A/outreach/.slipbox/config.toml": "",
      "A/outreach/v1.2.md": "# v1.2\n",
      "B/.slipbox/config.toml": "",
      "B/2024.01.05.md": "# day\n",
      "B/plan.md": "# plan\n",
      "B/pic.v2.png": "png",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(top, rel)), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    const a = openVault(join(top, "A"));
    a.ensureAll();
    expect(a.linksOf("n.md").map((l) => [l.target, l.resolvedKind, l.path])).toEqual([
      ["../B/2024.01.05", "note", join(top, "B", "2024.01.05.md")],
      ["../B/plan", "note", join(top, "B", "plan.md")],
      ["outreach/v1.2", "note", join(top, "A", "outreach", "v1.2.md")],
      ["../B/pic.v2.png", "file", join(top, "B", "pic.v2.png")], // a file as written still wins
    ]);
    // The other roots see the backlinks.
    expect(
      openVault(join(top, "B"))
        .backlinks("2024.01.05.md")
        .map((b) => b.from),
    ).toEqual([join(top, "A", "n.md")]);
    expect(
      openVault(join(top, "A", "outreach"))
        .backlinks("v1.2.md")
        .map((b) => [b.from, b.target]),
    ).toEqual([[join(top, "A", "n.md"), "outreach/v1.2"]]);
  });
});
