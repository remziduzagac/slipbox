import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import {
  checkoutAt,
  configFilesFor,
  ELSEWHERE_KEY,
  findVaultRoot,
  gitRootOf,
  initVault,
  isListed,
  isVaultRoot,
  locateVault,
  locationAt,
  recordLocation,
  rootAt,
  vaultOf,
} from "../../../../src/core/workspace/vaults/vault.ts";
import { vaultKey } from "../../../../src/core/foundation/platform/paths.ts";
import { readRoots } from "../../../../src/core/workspace/vaults/registry.ts";
import { VAULT, makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("vault discovery (1.1)", () => {
  test("nearest .slipbox/ wins, walking up from a file", () => {
    expect(findVaultRoot(join(VAULT, "notes", "alpha.md"))).toBe(VAULT);
    expect(findVaultRoot(join(VAULT, "nested-vault", "inner.md"))).toBe(join(VAULT, "nested-vault"));
  });
  test("a git checkout's top is a root by itself: keyed by its path, unnamed without a remote, nothing written (20.3, 21.6)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "docs", "n.md") });
    // Never named by its folder's own name: it doesn't travel (21.6).
    expect(loc).toMatchObject({ mode: "vault", root: dir, id: null, name: null, key: vaultKey(dir) });
    // The CLI opens it as the vault, says nothing about it, and makes no .slipbox/.
    const out: string[] = [];
    await runCli(["ls", "--json"], {
      out: (s) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: join(dir, "docs"),
      env: process.env,
    });
    const r = JSON.parse(out.join(""));
    expect(JSON.stringify(r.data)).toContain("docs/n.md");
    expect(r.warnings.join()).not.toContain(".slipbox");
    expect(existsSync(join(dir, ".slipbox"))).toBe(false);
    // A worktree's or submodule's .git is a file: a checkout too.
    const wt = mkdtempSync(join(tmpdir(), "slipbox-worktree-"));
    writeFileSync(join(wt, ".git"), "gitdir: /elsewhere\n");
    expect(findVaultRoot(join(wt, "x.md"))).toBe(wt);
    expect(gitRootOf(wt)).toBe(wt);
  });
  test("neither: Elsewhere — opened from the file's folder, one key for the machine (VV-D3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    writeFileSync(join(dir, "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "n.md") });
    expect(loc).toMatchObject({ mode: "folder", root: dir, id: null, name: null, key: ELSEWHERE_KEY });
    // No home vault: nothing made in the data directory.
    expect(existsSync(join(process.env.XDG_DATA_HOME!, "slipbox", "home"))).toBe(false);
    // Another folder, the same place.
    const other = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    expect(locateVault({ path: other }).key).toBe(loc.key);
  });
  test("a repository inside a vault is a vault of its own; .slipbox/ and .git in one folder are one vault (20.3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nest-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub", ".git"), { recursive: true });
    writeFileSync(join(dir, "top.md"), "# top\n");
    writeFileSync(join(dir, "sub", "inner.md"), "# inner\n");
    const vault = openGraph(locateVault({ path: dir }), DEFAULT_CONFIG, false);
    expect([...vault.notes.keys()]).toEqual(["top.md"]);
    expect(vault.nestedRoots()).toEqual(["sub"]);
    expect(locateVault({ path: join(dir, "sub", "inner.md") }).root).toBe(join(dir, "sub"));
    // Both in one folder: one vault, its name from .slipbox/ — the repository's own top.
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[vault]\nid = "both-id"\nname = "both-named"\n');
    expect(locateVault({ path: join(dir, "top.md") })).toMatchObject({
      mode: "vault",
      root: dir,
      id: "both-id",
      name: "both-named",
    });
  });
  test("a file's vault (VV-D4): its nearest marker's; else home's, under ~ (VV-D2); else none — a file outside both", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    const home = join(base, "home");
    const files = {
      "notes/.slipbox/config.toml": "",
      "notes/n.md": "# n\n",
      "loose/deep/l.md": "# l\n",
      "top.md": "# top\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    // ~ a repository itself (dotfiles kept with git), and a .slipbox/ of its own: home all the same.
    mkdirSync(join(home, ".git"));
    mkdirSync(join(home, ".slipbox"));
    writeFileSync(join(home, ".slipbox", "config.toml"), '[vault]\nname = "dotfiles"\n');
    mkdirSync(join(base, "elsewhere"));
    writeFileSync(join(base, "elsewhere", "e.md"), "# e\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      // Under a marker: that vault's.
      expect(locateVault({ path: join(home, "notes", "n.md") })).toMatchObject({
        mode: "vault",
        root: join(home, "notes"),
      });
      expect(vaultOf(join(home, "notes", "n.md"))).toBe(join(home, "notes"));
      // Under ~, under no marker: home's — however deep, opened by a file, a folder or ~ itself.
      const l = locateVault({ path: join(home, "loose", "deep", "l.md") });
      expect(l).toMatchObject({ mode: "home", root: home, file: join(home, "loose", "deep", "l.md"), name: null });
      expect(l.key).toBe(vaultKey(home));
      expect(locateVault({ path: join(home, "loose") })).toMatchObject({ mode: "home", root: home, file: null });
      expect(locateVault({ path: home, cwd: base })).toMatchObject({ mode: "home", root: home });
      expect(locateVault({ cwd: join(home, "loose", "deep") })).toMatchObject({ mode: "home", root: home });
      expect(vaultOf(join(home, "top.md"))).toBe(home);
      // Outside both: no vault, the folder opened standing in.
      expect(locateVault({ path: join(base, "elsewhere", "e.md") })).toMatchObject({
        mode: "folder",
        root: join(base, "elsewhere"),
      });
      expect(vaultOf(join(base, "elsewhere", "e.md"))).toBeNull();
      // Never a vault by its markers (seen from above, by a walk: 20.3); its settings yours, no name of its own.
      expect(isVaultRoot(home)).toBe(false);
      expect(findVaultRoot(join(home, "top.md"))).toBeNull();
      expect(configFilesFor(l)).toEqual({ vaultFile: null, outerFiles: [] });
      expect(() => initVault(home)).toThrow(/home is a vault already/);
      // --root at it: home; a file of a vault in it, that vault's.
      expect(locateVault({ root: home, path: join(home, "top.md") })).toMatchObject({ mode: "home", root: home });
      expect(locateVault({ root: home, path: join(home, "notes", "n.md") }).root).toBe(join(home, "notes"));
      expect(() => locateVault({ root: "/" })).toThrow("--root /: / is never a vault; open a folder in it");
      // Its git: ~'s own repository.
      expect(checkoutAt(l)?.root).toBe(home);
      // Reached through a link, it's the same home, by its real path.
      symlinkSync(home, join(base, "link"));
      process.env.HOME = join(base, "link");
      expect(locateVault({ path: join(home, "top.md") })).toMatchObject({ mode: "home", root: home });
      expect(locateVault({ path: join(base, "link", "top.md") })).toMatchObject({
        mode: "home",
        root: join(base, "link"),
      });
    } finally {
      process.env.HOME = before;
    }
  });

  test("HOME=/ (a service's) makes no home of everything: its files stay outside every vault (VV-D2)", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-rootfs-")));
    writeFileSync(join(dir, "a.md"), "# a\n");
    const before = process.env.HOME;
    process.env.HOME = "/";
    try {
      expect(locateVault({ path: join(dir, "a.md") })).toMatchObject({ mode: "folder", root: dir });
      expect(vaultOf(join(dir, "a.md"))).toBeNull();
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's git is only ~'s own: a repository around it isn't home's (VV-D2)", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-homerepo-")));
    mkdirSync(join(repo, ".git"));
    mkdirSync(join(repo, "me"));
    writeFileSync(join(repo, "me", "a.md"), "# a\n");
    const before = process.env.HOME;
    process.env.HOME = join(repo, "me");
    try {
      const loc = locateVault({ path: join(repo, "me", "a.md") });
      expect(loc).toMatchObject({ mode: "home", root: join(repo, "me") });
      expect(checkoutAt(loc)).toBeNull();
      expect(checkoutAt(rootAt(repo))?.root).toBe(repo);
    } finally {
      process.env.HOME = before;
    }
  });
  test("--root names a vault: it takes precedence, and must be one — a root marker in it (20.3, 21.1)", () => {
    expect(locateVault({ root: join(VAULT, "nested-vault"), path: join(VAULT, "nested-vault", "inner.md") }).root).toBe(
      join(VAULT, "nested-vault"),
    );
    expect(() => locateVault({ root: join(VAULT, "notes") })).toThrow(
      /isn't a vault \(none of \.git, \.slipbox, \.obsidian, \.zk in it\): slipbox init/,
    );
    const repo = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(repo, ".git"));
    expect(locateVault({ root: repo })).toMatchObject({ mode: "vault", root: repo });
  });
});

describe("review cycle 5 (vault, a loose folder)", () => {
  test("a folder with no .slipbox or repository above it is Elsewhere: listed, never walked, no index kept (VV-D3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "# A\n\n[b](b.md) [c](sub/c.md)\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "sub", "c.md"), "# C\n");
    const loc = locateVault({ path: dir, cwd: dir });
    expect(loc.mode).toBe("folder");
    const g = openGraph(loc, DEFAULT_CONFIG, true);
    expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
    // Nothing kept: a second open reads nothing back.
    expect(openGraph(loc, DEFAULT_CONFIG, true).stats.cached).toBe(0);
  });
});

describe("Elsewhere: no-vault (VV-D3)", () => {
  test("a file outside home and every vault is Elsewhere's: one key for the machine, from wherever it's opened", () => {
    const one = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-elsewhere-")));
    const two = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-elsewhere-")));
    writeFileSync(join(one, "n.md"), "# n\n");
    const loc = locateVault({ path: join(one, "n.md") });
    expect(loc).toMatchObject({ mode: "folder", root: one, file: join(one, "n.md"), key: ELSEWHERE_KEY, name: null });
    // Another folder, the same place: one set of tabs, one scratch, one trash.
    expect(locateVault({ path: two }).key).toBe(loc.key);
    expect(locationAt(two)).toMatchObject({ mode: "folder", root: two, key: ELSEWHERE_KEY });
    expect(isListed(loc)).toBe(true);
    // Nothing of it in the machine's list of vaults: it has no index to find again.
    recordLocation(loc);
    expect(readRoots().some((r) => r.path === one)).toBe(false);
  });
  test("its notes are never walked or indexed: a folder of it listed, its notes' links nobody's backlinks", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-elsewhere-")));
    mkdirSync(join(dir, "deep"));
    writeFileSync(join(dir, "a.md"), "[b](b.md)\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "deep", "c.md"), "[b](../b.md)\n");
    const g = openGraph(locateVault({ path: dir }), DEFAULT_CONFIG, true);
    expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
    expect(g.dirs).toEqual([""]);
    expect(existsSync(join(process.env.XDG_CACHE_HOME!, "slipbox", ELSEWHERE_KEY, "index.json"))).toBe(false);
  });
  test("the command line says what needs an index isn't there: backlinks, search, the index, problems, tags", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-elsewhere-")));
    writeFileSync(join(dir, "a.md"), "[b](b.md) #tag\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    const at = async (argv: string[]) => {
      let out = "";
      let err = "";
      const code = await runCli(argv, {
        out: (s) => (out += s),
        err: (s) => (err += s),
        stdin: async () => "",
        isTTY: false,
        columns: undefined,
        cwd: dir,
        env: { ...process.env, NO_COLOR: "1" },
      });
      return { code, out, err };
    };
    for (const argv of [["backlinks", "b.md"], ["search", "B"], ["index"], ["problems"], ["tags"]]) {
      const r = await at(argv);
      expect(r.code).toBe(5);
      expect(r.err).toContain("Elsewhere has no index");
    }
    // A note of it is read, its links followed from its folder.
    expect((await at(["read", "b.md"])).out).toBe("# B\n");
    expect((await at(["links", "a.md"])).code).toBe(0);
    // info and stat say where it is.
    expect((await at(["info"])).out).toMatch(/^vault +Elsewhere /m);
    expect((await at(["stat", "a.md"])).out).toMatch(/vault +Elsewhere/);
  });
});
