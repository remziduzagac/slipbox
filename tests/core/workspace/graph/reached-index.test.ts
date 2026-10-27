import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the index on demand: what the walk leaves out, indexed when reached (20.8)", () => {
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-reach-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".gitignore"), "tmp/\nnode_modules/\n"); // a note at its top: busy, being ignored (D237)
    for (const d of ["tmp", ".notes", "node_modules", "drafts"]) mkdirSync(join(dir, d));
    writeFileSync(
      join(dir, "index.md"),
      "[l](tmp/local.md) [h](.notes/hidden.md) [n](node_modules/dep.md) [d](drafts/wip.md) [p](tmp/pic.png)\n",
    );
    writeFileSync(join(dir, "tmp", "local.md"), "# Local\n\n[deeper](deeper.md)\n");
    writeFileSync(join(dir, "tmp", "deeper.md"), "# Deeper\n");
    writeFileSync(join(dir, "tmp", "pic.png"), "png");
    writeFileSync(join(dir, "tmp", "other.md"), "# Other\n");
    writeFileSync(join(dir, ".notes", "hidden.md"), "# Hidden\n");
    writeFileSync(join(dir, "node_modules", "dep.md"), "# Dep\n");
    writeFileSync(join(dir, "drafts", "wip.md"), "# WIP\n");
    // A link into an ignored folder that leads out of the vault: never the vault's.
    const outside = mkdtempSync(join(tmpdir(), "slipbox-reach-out-"));
    writeFileSync(join(outside, "secret.md"), "# Secret\n");
    symlinkSync(join(outside, "secret.md"), join(dir, "tmp", "out.md"));
    writeFileSync(join(dir, "index.md"), `${readFileSync(join(dir, "index.md"), "utf8")}[o](tmp/out.md)\n`);
    return dir;
  };
  const cfg = () => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.walk.exclude = ["drafts/"];
    return c;
  };

  test("git-ignored and hidden files a link points at are indexed — and what they link to; node_modules and walk.exclude never", () => {
    const dir = make();
    const g = openGraph(locateVault({ root: dir }), cfg(), true);
    expect([...g.notes.keys()].sort()).toEqual([".notes/hidden.md", "index.md", "tmp/deeper.md", "tmp/local.md"]);
    expect(g.filePaths()).toContain("tmp/pic.png");
    expect([...g.reached].sort()).toEqual([".notes/hidden.md", "tmp/deeper.md", "tmp/local.md", "tmp/pic.png"]);
    expect(g.resolveLink({ kind: "markdown", target: "tmp/local.md" }, "index.md")).toMatchObject({
      resolvedKind: "note",
      path: "tmp/local.md",
    });
    expect(g.backlinks("tmp/local.md").map((b) => b.from)).toEqual(["index.md"]);
    expect(g.backlinks("tmp/deeper.md").map((b) => b.from)).toEqual(["tmp/local.md"]);
    // The filter: only a hidden folder or .gitignore keeps a path from being reached.
    expect(["tmp/x.md", ".notes/x.md", "a/.b/c.md"].map((p) => g.filter.reachable(p))).toEqual([true, true, true]);
    expect(
      ["node_modules/x.md", "drafts/x.md", ".git/x.md", ".slipbox/x.md", "../x.md", "a//b.md"].map((p) =>
        g.filter.reachable(p),
      ),
    ).toEqual([false, false, false, false, false, false]);
  });

  test("a `/…` link from the root reaches its file as a relative one does (21.2)", () => {
    const dir = make();
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "s.md"), "[x](/.notes/hidden.md) [y](/tmp/pic.png)\n");
    writeFileSync(join(dir, "index.md"), "# no links here\n");
    const g = openGraph(locateVault({ root: dir }), cfg(), false);
    g.ensureAll();
    expect([...g.reached].sort()).toEqual([".notes/hidden.md", "tmp/pic.png"]);
    expect(g.resolveLink({ kind: "markdown", target: "/.notes/hidden.md" }, "sub/s.md")).toMatchObject({
      resolvedKind: "note",
      path: ".notes/hidden.md",
    });
  });

  test("a `/…` link by the file's absolute path reaches it too: the root's reading first, then the filesystem's (21.2)", () => {
    const dir = make();
    writeFileSync(
      join(dir, "index.md"),
      `[abs](${join(dir, ".notes", "hidden.md")}) [pic](${join(dir, "tmp", "pic.png")})\n`,
    );
    const g = openGraph(locateVault({ root: dir }), cfg(), false);
    g.ensureAll();
    expect([...g.reached].sort()).toEqual([".notes/hidden.md", "tmp/pic.png"]);
    expect(g.notes.has(".notes/hidden.md")).toBe(true);
    expect(g.backlinks(".notes/hidden.md").map((b) => b.from)).toEqual(["index.md"]);
  });

  test("a root of its own is never reached, though git-ignored or hidden (0.11)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-reach-nested-"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".gitignore"), "external/\n");
    for (const d of ["external/lib/.git", ".hid/.git", "vis/.git", "external/plain"])
      mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, "external", "lib", "README.md"), "# Lib\n");
    writeFileSync(join(dir, ".hid", "x.md"), "# Hid\n");
    writeFileSync(join(dir, "external", "plain", "p.md"), "# Plain\n");
    writeFileSync(join(dir, "index.md"), "[lib](external/lib/README.md) [h](.hid/x.md) [p](external/plain/p.md)\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(["external/lib/README.md", ".hid/x.md", "vis/x.md"].map((p) => g.filter.reachable(p))).toEqual([
      false,
      false,
      false,
    ]);
    expect(g.filter.reachable("external/plain/p.md")).toBe(true);
    g.ensureAll();
    expect([...g.notes.keys()].sort()).toEqual(["external/plain/p.md", "index.md"]);
  });

  test("once reached, it stays: the link gone, opened again from the cache; deleted, it goes", () => {
    const dir = make();
    openGraph(locateVault({ root: dir }), cfg(), true);
    writeFileSync(join(dir, "index.md"), "# no links now\n");
    const again = openGraph(locateVault({ root: dir }), cfg(), true);
    expect(again.notes.has("tmp/local.md")).toBe(true);
    expect(again.notes.has(".notes/hidden.md")).toBe(true);
    // The watcher saying it's gone: it is.
    again.removeFile("tmp/local.md");
    expect(again.reached.has("tmp/local.md")).toBe(false);
    rmSync(join(dir, "tmp", "local.md"));
    const after = openGraph(locateVault({ root: dir }), cfg(), true);
    expect(after.notes.has("tmp/local.md")).toBe(false);
    expect(after.reached.has("tmp/local.md")).toBe(false);
    expect(after.notes.has("tmp/deeper.md")).toBe(true);
    // No longer left out (the .gitignore line gone): walked like any other, not "reached".
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    expect(openGraph(locateVault({ root: dir }), cfg(), true).reached.has("tmp/deeper.md")).toBe(false);
  });

  test("a note the walk excludes, named by the CLI: read as a note, its links followed — and still not the vault's", async () => {
    const dir = make();
    writeFileSync(join(dir, ".slipbox", "config.toml"), 'walk.exclude = ["drafts/"]\n');
    writeFileSync(join(dir, "node_modules", "dep.md"), "# Dep\n\n[[index]] [up](../index.md)\n");
    const out: string[] = [];
    const cli = async (args: string[]) => {
      out.length = 0;
      const code = await runCli([...args, "--json"], {
        out: (x: string) => out.push(x),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: process.env,
      });
      return { code, json: JSON.parse(out.join("")) };
    };
    const links = await cli(["links", "node_modules/dep.md"]);
    expect(links.code).toBe(0);
    expect(
      links.json.data.map((l: { target: string; status: string; path: string | null }) => [l.target, l.status, l.path]),
    ).toEqual([
      ["index", "note", "index.md"],
      ["../index.md", "note", "index.md"],
    ]);
    expect((await cli(["ls"])).json.data.map((n: { path: string }) => n.path)).not.toContain("node_modules/dep.md");
    // The graph's own: read once, kept aside; a file that isn't there, nothing.
    const g = openGraph(locateVault({ root: dir }), cfg(), false);
    expect(g.adopt("node_modules/dep.md")?.title).toBe("Dep");
    expect(g.notes.has("node_modules/dep.md")).toBe(false);
    expect(g.entry("node_modules/dep.md")?.links.map((l) => l.target)).toEqual(["index", "../index.md"]);
    expect(g.adopt("node_modules/nope.md")).toBeUndefined();
  });

  test("the CLI reaches what it's told to read; Elsewhere, listed, reaches nothing; nor home what its skip list leaves out", async () => {
    const dir = make();
    writeFileSync(join(dir, ".slipbox", "config.toml"), 'walk.exclude = ["drafts/"]\n');
    const out: string[] = [];
    const cli = async (args: string[], cwd = dir) => {
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
      return { code, json: JSON.parse(out.join("")) };
    };
    expect((await cli(["read", "tmp/other.md"])).json.data.content).toBe("# Other\n");
    expect((await cli(["ls"])).json.data.map((n: { path: string }) => n.path)).toContain("tmp/other.md");
    // Never: under node_modules, read all the same, but not the vault's.
    expect((await cli(["read", "node_modules/dep.md"])).code).toBe(0);
    expect((await cli(["ls"])).json.data.map((n: { path: string }) => n.path)).not.toContain("node_modules/dep.md");
    // Elsewhere, listed a folder at a time, has no index to reach into (VV-D3); home leaves its hidden folders out.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-reach-loose-"));
    mkdirSync(join(loose, ".hid"));
    writeFileSync(join(loose, "a.md"), "[h](.hid/h.md)\n");
    writeFileSync(join(loose, ".hid", "h.md"), "# H\n");
    expect(openGraph(locateVault({ path: join(loose, "a.md") }), DEFAULT_CONFIG, false).reachFile(".hid/h.md")).toBe(
      false,
    );
    const home = process.env.HOME;
    process.env.HOME = loose;
    try {
      expect(openGraph(locateVault({ path: join(loose, "a.md") }), DEFAULT_CONFIG, false).reachFile(".hid/h.md")).toBe(
        false,
      );
    } finally {
      process.env.HOME = home;
    }
  });
});
