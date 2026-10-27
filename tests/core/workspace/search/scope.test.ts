import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { locateVault, recordLocation } from "../../../../src/core/workspace/vaults/vault.ts";
import { cacheDir } from "../../../../src/core/foundation/platform/paths.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("search by vault (20.16)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: code === 2 ? null : JSON.parse(out.join("")) };
  };
  /** a links to b; c links to a; d stands apart. Each has a note with the word. */
  const four = async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-scope-"));
    const tag = basename(base).replace(/[^a-z0-9]/gi, "");
    const at = (v: string) => join(base, v);
    for (const v of ["a", "b", "c", "d"]) {
      mkdirSync(at(v), { recursive: true });
      await cli(["init", at(v), "--name", `${v}${tag}`], at(v));
      writeFileSync(join(at(v), `${v}-note.md`), `# ${v}\n\nA narwhal in ${v}.\n`);
    }
    writeFileSync(join(at("a"), "out.md"), "[b](../b/b-note.md)\n");
    writeFileSync(join(at("c"), "in.md"), "[a](../a/a-note.md)\n");
    for (const v of ["a", "b", "c", "d"]) await cli(["ls"], at(v)); // each indexed, as when opened
    return { at, tag };
  };

  test("a scope's vaults: linked, those linked to or from this one; all, every other vault this machine knows", async () => {
    const { scopeRoots } = await import("../../../../src/core/workspace/search/scope.ts");
    const { at } = await four();
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const g = openVault(at("a"));
    g.ensureAll();
    expect(scopeRoots(g, "here")).toEqual([]);
    expect(scopeRoots(g, "linked").sort()).toEqual([at("b"), at("c")].sort());
    const all = scopeRoots(g, "all");
    expect(all.slice(0, 2).sort()).toEqual([at("b"), at("c")].sort()); // nearest first
    expect(all).toContain(at("d"));
    expect(all).not.toContain(at("a"));
  });

  test("a scope leaves worktrees out, even one a note links into by @branch or by path: their notes are their main checkout's", async () => {
    const { scopeRoots } = await import("../../../../src/core/workspace/search/scope.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { at, tag } = await four();
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], {
        cwd,
      }).exitCode;
    const repo = at("repo");
    mkdirSync(repo);
    if (git(repo, "init", "-q") !== 0) return; // no git here
    git(repo, "remote", "add", "origin", `git@github.com:me/repo${tag}.git`);
    writeFileSync(join(repo, "x.md"), "# X\n\nA narwhal on main.\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "main");
    git(repo, "branch", "feature");
    const wt = at("repo-feature");
    git(repo, "worktree", "add", "-q", wt, "feature");
    for (const r of [repo, wt]) await cli(["ls"], r);
    writeFileSync(
      join(at("d"), "out.md"),
      `[on the branch](slipbox://repo${tag}@feature/x.md) [by path](../repo-feature/x.md) [main](slipbox://repo${tag}/x.md)\n`,
    );
    const g = openVault(at("d"));
    g.ensureAll();
    expect(g.linksOf("out.md").map((l) => l.path)).toEqual([join(wt, "x.md"), join(wt, "x.md"), join(repo, "x.md")]);
    expect(scopeRoots(g, "linked")).toEqual([repo]);
    expect(scopeRoots(g, "all")).not.toContain(wt);
  });

  test("another root's index still being built is not used: its files scanned; a built one is caught up first", async () => {
    const { searchOthers } = await import("../../../../src/core/workspace/search/scope.ts");
    const { SearchIndex } = await import("../../../../src/core/workspace/search/search-index.ts");
    const { catchUp } = await import("../../../../src/core/workspace/search/search.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { at } = await four();
    const bLoc = locateVault({ root: at("b") });
    rmSync(join(cacheDir(bLoc), "search.db"), { force: true });
    SearchIndex.open(bLoc)!.close(); // made, as the TUI makes it on opening, and left before it was built
    const found = () => {
      const g = openVault(at("a"));
      g.ensureAll();
      return searchOthers(g, "narwhal", "linked").hits.map((h) => h.abs);
    };
    expect(found()).toContain(join(at("b"), "b-note.md"));
    // Scanned, not built here: building it is its own root's (as this root's search leaves its own).
    const half = SearchIndex.open(bLoc)!;
    expect(half.complete).toBe(false);
    half.close();
    // Built, then a note added: found all the same.
    const idx = SearchIndex.open(bLoc)!;
    catchUp(openVault(at("b")), idx);
    idx.close();
    writeFileSync(join(at("b"), "b-late.md"), "# late\n\nAnother narwhal.\n");
    expect(found()).toContain(join(at("b"), "b-late.md"));
  });

  test("a search of every root leaves each as it was: not seen now, one only found still only found (the :folders order kept)", async () => {
    const { searchOthers } = await import("../../../../src/core/workspace/search/scope.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { readRoots, writeRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { at } = await four();
    // d: last seen long ago, and only found by the background index, never opened.
    const old = "2020-01-01T00:00:00.000Z";
    writeRoots(readRoots().map((v) => (v.path === at("d") ? { ...v, seen: old, found: true } : v)));
    const g = openVault(at("a"));
    g.ensureAll();
    expect(searchOthers(g, "narwhal", "all").hits.map((h) => h.abs)).toContain(join(at("d"), "d-note.md"));
    expect(readRoots().find((v) => v.path === at("d"))).toMatchObject({ seen: old, found: true });
  });

  test("a moved folder's relink reads every other root's links, and leaves each as it was: not seen now", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { readRoots, writeRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { planRelink } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { at } = await four();
    const old = "2020-01-01T00:00:00.000Z";
    writeRoots(readRoots().map((v) => (v.path === at("d") ? { ...v, seen: old } : v)));
    // b moved by hand, opened where it went: c's link into it (through a) and a's out to it are fixed.
    const moved = join(at("b"), "..", "b-moved");
    renameSync(at("b"), moved);
    recordLocation(locateVault({ root: moved }));
    const plan = planRelink(openVault(moved));
    expect(plan.files.map((f) => f.abs)).toContain(join(at("a"), "out.md"));
    expect(readRoots().find((v) => v.path === at("d"))!.seen).toBe(old);
  });

  test("slipbox search --scope: here by default; linked and all add others', each by its path (21.9) with its root (21.10), after this one's", async () => {
    const { at, tag } = await four();
    const files = (r: { json: { data: { hits: { shown: string }[] } } }) => r.json.data.hits.map((h) => h.shown);
    const here = await cli(["search", "narwhal"], at("a"));
    expect(files(here)).toEqual(["a-note.md"]);
    expect(here.json.data).toMatchObject({ scope: "here", roots: [] });
    expect(here.json.data.hits[0]).toMatchObject({ root: null, name: null }); // this root's own
    expect(here.json.data.hits[0].vault).toBeUndefined();
    const linked = await cli(["search", "narwhal", "--scope", "linked"], at("a"));
    expect(files(linked)[0]).toBe("a-note.md");
    expect(files(linked).slice(1).sort()).toEqual([join(at("b"), "b-note.md"), join(at("c"), "c-note.md")].sort());
    const hit = linked.json.data.hits.find((h: { name: string | null }) => h.name === `b${tag}`);
    expect(hit).toMatchObject({ abs: join(at("b"), "b-note.md"), path: "b-note.md", line: 3, root: at("b") });
    expect(linked.json.data.roots.sort()).toEqual([at("b"), at("c")].sort());
    // The old word, still understood, said so.
    const old = await cli(["search", "narwhal", "--scope", "vault"], at("a"));
    expect(old.json.data.scope).toBe("here");
    expect(old.json.warnings.join()).toContain("--scope vault is --scope here now");
    // Every root this machine knows: the other tests' too, so past the default limit.
    expect(files(await cli(["search", "narwhal", "--scope", "all", "--limit", "500"], at("a")))).toContain(
      join(at("d"), "d-note.md"),
    );
    expect((await cli(["search", "narwhal", "--scope", "near"], at("a"))).code).toBe(2);
  });
});
