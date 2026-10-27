import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("moving a folder (18.3)", () => {
  test("links between notes that move together stay; links out of it and into it are fixed; everything in it moves", async () => {
    const { openGraph: open } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { planFolderMove, applyPlan } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-foldermove-"));
    const files: Record<string, string> = {
      "a/one.md":
        "# One\n\n[two](two.md) [2](two.md#two) [sub](sub/three.md) [out](../b/four.md) [4](../b/four.md#four)\n",
      "a/two.md": "# Two\n\n[one](./one.md)\n",
      "a/sub/three.md": "# Three\n\n[up](../one.md)\n",
      "a/pic.png": "png",
      "a/.hidden": "kept",
      "b/four.md": "# Four\n\n[one](../a/one.md) [1](../a/one.md#one) ![p](../a/pic.png)\n",
    };
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    const g = open(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const plan = planFolderMove(g, "a", "x/y");
    applyPlan(g, plan);
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    // Inside: left alone; out of it: from the new place.
    expect(read("x/y/one.md")).toBe(
      "# One\n\n[two](two.md) [2](two.md#two) [sub](sub/three.md) [out](../../b/four.md) [4](../../b/four.md#four)\n",
    );
    expect(read("x/y/two.md")).toBe("# Two\n\n[one](./one.md)\n");
    expect(read("x/y/sub/three.md")).toBe("# Three\n\n[up](../one.md)\n");
    // Into it, from what stays.
    expect(read("b/four.md")).toBe("# Four\n\n[one](../x/y/one.md) [1](../x/y/one.md#one) ![p](../x/y/pic.png)\n");
    // Everything moved, what the walk doesn't list too.
    expect(read("x/y/.hidden")).toBe("kept");
    expect(existsSync(join(dir, "a"))).toBe(false);
    // The index and the redirects follow.
    expect(g.notes.has("x/y/sub/three.md")).toBe(true);
    expect(g.redirects!.follow("a/one.md")).toBe("x/y/one.md");
    expect(() => planFolderMove(g, "x", "x/y/z")).toThrow(/can't move into itself/);
  });

  test("another root's path from its top into a root nested in it — [[outreach/index]], /outreach/plan.md — a backlink there", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const a = mkdtempSync(join(tmpdir(), "slipbox-nest-top-"));
    const files: Record<string, string> = {
      ".obsidian/app.json": "{}",
      "a.md": "# A\n\n[[outreach/index]] [t](/outreach/plan.md) [r](outreach/plan.md) [[outreach/plan]] [[index]]\n",
      "outreach/.obsidian/app.json": "{}",
      "outreach/index.md": "# Index\n",
      "outreach/plan.md": "# Plan\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(a, rel, ".."), { recursive: true });
      writeFileSync(join(a, rel), text);
    }
    openVault(a).ensureAll(); // A's index, as of its last indexing
    const g = openVault(join(a, "outreach"));
    const back = (rel: string) => g.backlinks(rel).map((b) => [b.from, b.target]);
    // A plain name stays in its root: A's `[[index]]` isn't one.
    expect(back("index.md")).toEqual([[join(a, "a.md"), "outreach/index"]]);
    expect(back("plan.md")).toEqual([
      [join(a, "a.md"), "/outreach/plan.md"],
      [join(a, "a.md"), "outreach/plan.md"],
      [join(a, "a.md"), "outreach/plan"],
    ]);
  });
});

describe("moving a vault's folder (18.7)", () => {
  test("links into it by path are fixed, from its parent and other vaults; its links out too", async () => {
    const { planVaultFolderMove, applyPlan } = await import(
      "../../../../src/core/workspace/mutations/rename/rename.ts"
    );
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-vaultmove-"));
    const parent = join(base, "parent");
    const other = join(base, "other");
    const files: Record<string, string> = {
      "parent/.slipbox/config.toml": '[vault]\nid = "vmparent000001"\nname = "vmparent"\n',
      "parent/home.md": "# Home\n\n[p](box/index.md) [i](box/index.md#box)\n",
      "parent/box/.slipbox/config.toml": '[vault]\nid = "vmbox00000001"\nname = "vmbox"\n',
      "parent/box/index.md": "# Box\n\n[up](../home.md) [in](inner.md) [kid](kid/k.md)\n",
      "parent/box/inner.md": "# Inner\n",
      "parent/box/kid/.slipbox/config.toml": '[vault]\nid = "vmkid00000001"\nname = "vmkid"\n',
      "parent/box/kid/k.md": "# Kid\n\n[up](../../home.md)\n",
      "other/.slipbox/config.toml": '[vault]\nid = "vmother000001"\nname = "vmother"\n',
      "other/o.md": "[o](../parent/box/index.md)\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(base, rel, ".."), { recursive: true });
      writeFileSync(join(base, rel), text);
    }
    // This machine has seen them all, with their indexes.
    for (const root of [other, join(parent, "box", "kid"), join(parent, "box"), parent]) openVault(root).ensureAll();
    const g = openVault(parent);
    const plan = planVaultFolderMove(g, "box", "shelf/box");
    expect(plan.vaults!.map(([, to]) => to)).toEqual([
      join(parent, "shelf", "box"),
      join(parent, "shelf", "box", "kid"),
    ]);
    applyPlan(g, plan);
    const read = (p: string) => readFileSync(join(base, p), "utf8");
    expect(read("parent/home.md")).toBe("# Home\n\n[p](shelf/box/index.md) [i](shelf/box/index.md#box)\n");
    expect(read("other/o.md")).toBe("[o](../parent/shelf/box/index.md)\n");
    // Its own links: out of it, from where it is now; within it, as they were.
    expect(read("parent/shelf/box/index.md")).toBe("# Box\n\n[up](../../home.md) [in](inner.md) [kid](kid/k.md)\n");
    expect(read("parent/shelf/box/kid/k.md")).toBe("# Kid\n\n[up](../../../home.md)\n");
    // The same vault, where it is now: its id, and by name.
    expect(locateVault({ path: join(parent, "shelf", "box") })).toMatchObject({ id: "vmbox00000001", name: "vmbox" });
    // The parent no longer walks around it there, nor keeps its files as its own.
    expect(g.notes.has("shelf/box/index.md")).toBe(false);
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
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("moving a nested root's folder rewrites the links into it from a root nested beside it", async () => {
    const { planVaultFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { dir } = root({
      "home.md": "[b](b/index.md)\n",
      "a/.slipbox/config.toml": "",
      "a/x.md": "[b](../b/index.md)\n",
      "c2/.slipbox/config.toml": "",
      "c2/z.md": "[b](../b/index.md#index)\n",
      "b/.slipbox/config.toml": "",
      "b/index.md": "# Index\n",
    });
    for (const r of ["a", "c2", "b"]) openVault(join(dir, r)).ensureAll();
    const g = openVault(dir);
    applyPlan(g, planVaultFolderMove(g, "b", "c"));
    expect(read(dir, "home.md")).toBe("[b](c/index.md)\n");
    expect(read(dir, "a/x.md")).toBe("[b](../c/index.md)\n");
    expect(read(dir, "c2/z.md")).toBe("[b](../c/index.md#index)\n");
  });

  test("moving a plain folder that holds a nested root rewrites the links into that root, and the machine's list follows it", async () => {
    const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { dir } = root({
      "home.md": "[n](X/N/n.md) [x](X/x.md)\n",
      "X/x.md": "[n](N/n.md) [h](../home.md)\n",
      "X/N/.slipbox/config.toml": "",
      "X/N/n.md": "[h](../../home.md) [x](../x.md)\n",
    });
    openVault(join(dir, "X", "N")).ensureAll();
    const g = openVault(dir);
    const plan = planFolderMove(g, "X", "Y/Z");
    expect(plan.vaults).toEqual([[join(dir, "X", "N"), join(dir, "Y", "Z", "N")]]);
    applyPlan(g, plan);
    expect(read(dir, "home.md")).toBe("[n](Y/Z/N/n.md) [x](Y/Z/x.md)\n");
    expect(read(dir, "Y/Z/x.md")).toBe("[n](N/n.md) [h](../../home.md)\n");
    expect(read(dir, "Y/Z/N/n.md")).toBe("[h](../../../home.md) [x](../x.md)\n");
    // The parent's own index follows its files, never the nested root's.
    expect(g.notes.has("Y/Z/x.md")).toBe(true);
    expect(g.notes.has("Y/Z/N/n.md")).toBe(false);
    expect(g.dirs).toContain("Y/Z");
  });
});
