import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the index on demand in the TUI (20.8)", () => {
  test(":e of a git-ignored or hidden file opens it and indexes it; one a busy folder or walk.exclude leaves out opens, never indexed", async () => {
    const root = makeVault();
    writeFileSync(join(root, ".gitignore"), "tmp/\n");
    mkdirSync(join(root, "tmp"));
    mkdirSync(join(root, ".private"));
    mkdirSync(join(root, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(root, "tmp", "scratchpad.md"), "# Scratchpad\n\n[back](../index.md)\n");
    writeFileSync(join(root, ".private", "p.md"), "# P\n");
    writeFileSync(join(root, "node_modules", "dep", "dep.md"), "# Dep\n\n[back](../../index.md)\n"); // busy (D237)
    writeFileSync(join(root, "node_modules", "dep", "package.json"), '{ "name": "dep" }\n');
    writeFileSync(join(root, "drafts", "plan.md"), "# Plan\n\n[back](../index.md)\n"); // the harness's walk.exclude
    const h = await harness({ root, open: "index.md" });
    expect(h.app.graph.notes.has("tmp/scratchpad.md")).toBe(false);
    await h.app.run("note.open tmp/scratchpad.md");
    expect(h.app.view!.buf.rel).toBe("tmp/scratchpad.md");
    expect(h.app.graph.notes.has("tmp/scratchpad.md")).toBe(true);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain("tmp/scratchpad.md");
    // The vault's now: Info says nothing of it, its folder folded or not.
    h.app.explorer.expanded.delete(join(root, "tmp"));
    h.app.explorer.invalidateTree();
    expect(h.app.info.rows().find((r) => r.key === "index")).toBeUndefined();
    await h.app.run("note.open .private/p.md");
    expect(h.app.view!.buf.rel).toBe(".private/p.md");
    // Left out and never reached (D249): opened as the explorer opens its ⊘ row, by its path from the vault's top or
    // its whole path, and never indexed. Info says why; its row is revealed in the explorer, the ⊘ its folder's, whose
    // row the status line says it of.
    const notes = [...h.app.graph.notes.keys()].sort();
    const files = [...h.app.graph.filePaths()].sort();
    const backlinks = h.app.graph.backlinks("index.md").map((b) => b.from);
    const left: [string, string][] = [
      ["node_modules/dep/dep.md", "generated (node_modules)"],
      ["node_modules/dep/package.json", "generated (node_modules)"],
      ["drafts/plan.md", "walk.exclude"],
    ];
    for (const [rel, why] of left)
      for (const typed of [rel, join(root, rel)]) {
        await h.app.run("note.open index.md");
        h.app.messages.length = 0;
        await h.app.run(`note.open ${typed}`);
        expect(h.app.view!.buf.abs).toBe(join(root, rel));
        expect(h.app.view!.buf.rel).toBeNull();
        expect(h.app.messages.map((m) => m.text)).toEqual([]);
        expect(h.app.info.rows().find((r) => r.key === "index")?.value).toBe(`not indexed: ${why}`);
        const rows = h.app.explorer.rows();
        expect(rows[h.app.sidebar.selected]?.path).toBe(join(root, rel));
        h.app.region = "sidebar";
        h.app.sidebar.selected = rows.findIndex((r) => r.path === dirname(join(root, rel)));
        expect(h.canvas().rows.at(-1)!.join("")).toContain(`not indexed: ${why}`);
        h.app.region = "content";
      }
    // Under a hidden folder no row lists, never reached: opened all the same, Info saying why.
    await h.app.run("note.open .slipbox/config.toml");
    expect(h.app.view!.buf.abs).toBe(join(root, ".slipbox", "config.toml"));
    expect(h.app.view!.buf.rel).toBeNull();
    expect(h.app.info.rows().find((r) => r.key === "index")?.value).toBe("not indexed: slipbox's own folder");
    expect([...h.app.graph.notes.keys()].sort()).toEqual(notes);
    expect([...h.app.graph.filePaths()].sort()).toEqual(files);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toEqual(backlinks);
    for (const [rel] of left) expect(h.app.graph.reached.has(rel)).toBe(false);
    // Not there: said so, as before.
    for (const typed of ["node_modules/dep/gone.md", join(root, "drafts", "gone.md")]) {
      await h.app.run(`note.open ${typed}`);
      expect(h.app.view!.buf.abs).toBe(join(root, ".slipbox", "config.toml"));
      expect(h.app.messages.at(-1)?.text).toBe(`no note or file "${typed}"`);
    }
  });
  test(":e of a file in a vault nested in this one goes into that vault, as the file's row in the explorer does (D249)", async () => {
    for (const whole of [false, true]) {
      const root = makeVault();
      const h = await harness({ root, open: "index.md" });
      await h.app.run(`note.open ${whole ? join(root, "nested-vault", "inner.md") : "nested-vault/inner.md"}`);
      expect(h.app.loc.root).toBe(join(root, "nested-vault"));
      expect(h.app.view!.buf.rel).toBe("inner.md");
    }
  });
  test(":e in home of what its skip list leaves out opens it, and nothing more (D249)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "Downloads"));
    mkdirSync(join(home, ".config", "tool"), { recursive: true });
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "Downloads", "d.md"), "# D\n\n[a](../a.md)\n");
    writeFileSync(join(home, ".config", "tool", "t.toml"), 'name = "tool"\n');
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      for (const [rel, why] of [
        ["Downloads/d.md", "home's Downloads"],
        [".config/tool/t.toml", "hidden"],
      ] as const)
        for (const typed of [rel, join(home, rel)]) {
          await h.app.run("note.open a.md");
          await h.app.run(`note.open ${typed}`);
          expect(h.app.view!.buf.abs).toBe(join(home, rel));
          expect(h.app.view!.buf.rel).toBeNull();
          expect(h.app.info.rows().find((r) => r.key === "index")?.value).toBe(`not indexed: ${why}`);
          expect(h.app.graph.notes.has(rel) || h.app.graph.reached.has(rel)).toBe(false);
        }
      expect(h.app.graph.backlinks("a.md")).toEqual([]);
    } finally {
      process.env.HOME = before;
    }
  });
  test(":e by a file's whole path inside the vault opens it as by its path from the top: a data file, a git-ignored note", async () => {
    const root = makeVault();
    writeFileSync(join(root, ".gitignore"), "tmp/\n");
    mkdirSync(join(root, "tmp"));
    writeFileSync(join(root, "tmp", "scratchpad.md"), "# Scratchpad\n");
    writeFileSync(join(root, "rides.csv"), "date,km\n2026-10-01,42\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run(`note.open ${join(root, "rides.csv")}`);
    expect(h.app.view!.buf.rel).toBe("rides.csv");
    await h.app.run(`note.open ${join(root, "tmp", "scratchpad.md")}`);
    expect(h.app.view!.buf.rel).toBe("tmp/scratchpad.md");
    expect(h.app.graph.notes.has("tmp/scratchpad.md")).toBe(true);
    // Not there: said so, by the path as typed.
    await h.app.run(`note.open ${join(root, "tmp", "gone.md")}`);
    expect(h.app.messages.at(-1)?.text).toBe(`no note or file "${join(root, "tmp", "gone.md")}"`);
  });
});
