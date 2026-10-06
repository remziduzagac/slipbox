// The fixture vault (0.5) against the walk (0.11), discovery (1.1), the graph and the CLI (9.x).

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { CLI_COMMANDS, runCli } from "../src/cli/cli.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { applyPlan, planHeadingRename, planUndo } from "../src/core/rename.ts";
import { findVaultRoot, gitRootOf, initVault, isListed, isVaultRoot, locateVault, markersAt, recordLocation, setRootMarkers } from "../src/core/vault.ts";
import { implicitName, type KnownVault } from "../src/core/registry.ts";
import { cacheDir, vaultKey } from "../src/core/paths.ts";

const VAULT = join(import.meta.dir, "fixtures", "vault");

// Isolate state and cache so tests never touch the real ~/.local/state.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-test-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard

describe("vault discovery (1.1)", () => {
  test("nearest .slipbox/ wins, walking up from a file", () => {
    expect(findVaultRoot(join(VAULT, "notes", "alpha.md"))).toBe(VAULT);
    expect(findVaultRoot(join(VAULT, "nested-vault", "inner.md"))).toBe(join(VAULT, "nested-vault"));
  });
  test("a git checkout's top is a vault by itself: keyed by its path, named by its folder, nothing written (20.3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "docs", "n.md") });
    expect(loc).toMatchObject({ mode: "vault", root: dir, id: null, name: implicitName(dir) });
    expect(loc.key).not.toBe(""); // its path's
    // The CLI opens it as the vault, says nothing about it, and makes no .slipbox/.
    const out: string[] = [];
    await runCli(["ls", "--json"], { out: (s) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: join(dir, "docs"), env: process.env });
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
  test("neither: a plain folder — the loose file's own, an unnamed instance keyed by its path (20.22)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    writeFileSync(join(dir, "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "n.md") });
    expect(loc).toMatchObject({ mode: "folder", root: dir, id: null, name: null, key: vaultKey(dir) });
    // No home vault: nothing made in the data directory.
    expect(existsSync(join(process.env.XDG_DATA_HOME!, "slipbox", "home"))).toBe(false);
    // Another folder, another instance.
    const other = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    expect(locateVault({ path: other }).key).not.toBe(loc.key);
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
    expect(locateVault({ path: join(dir, "top.md") })).toMatchObject({ mode: "vault", root: dir, id: "both-id", name: "both-named" });
  });
  test("$HOME and / are never a root, whatever they hold (17.1)", () => {
    const home = mkdtempSync(join(tmpdir(), "slipbox-home-"));
    mkdirSync(join(home, ".git"));
    mkdirSync(join(home, ".slipbox"));
    mkdirSync(join(home, "notes"));
    writeFileSync(join(home, "notes", "n.md"), "# n\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(findVaultRoot(join(home, "notes", "n.md"))).toBeNull();
      // Nor a vault seen from above (a dotfiles repository in $HOME): the explorer, a walk (20.3).
      expect(isVaultRoot(home)).toBe(false);
      const loc = locateVault({ path: join(home, "notes", "n.md") });
      expect(loc.mode).toBe("folder");
      expect(loc.root).toBe(join(home, "notes"));
      expect(() => initVault(home)).toThrow(/never indexes/);
    } finally {
      process.env.HOME = before;
    }
  });
  test("--root names a vault: it takes precedence, and must be one — a root marker in it (20.3, 21.1)", () => {
    expect(locateVault({ root: join(VAULT, "nested-vault"), path: join(VAULT, "nested-vault", "inner.md") }).root).toBe(join(VAULT, "nested-vault"));
    expect(() => locateVault({ root: join(VAULT, "notes") })).toThrow(/isn't a root \(none of \.git, \.slipbox, \.obsidian, \.zk in it\): slipbox init/);
    const repo = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(repo, ".git"));
    expect(locateVault({ root: repo })).toMatchObject({ mode: "vault", root: repo });
  });
});

describe("the walk (0.11)", () => {
  const g = openGraph(locateVault({ root: VAULT }), DEFAULT_CONFIG, false);
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.walk.exclude = ["drafts/"];
  const withVaultCfg = openGraph(locateVault({ root: VAULT }), cfg, false);
  const notes = [...withVaultCfg.notes.keys()];
  test("skips node_modules, .gitignore'd paths, dotdirs, nested vaults and walk.exclude", () => {
    expect(notes.some((n) => n.startsWith("node_modules/"))).toBe(false);
    expect(notes).not.toContain("ignored/secret.md");
    expect(notes).not.toContain("notes/temp.skip.md");
    expect(notes.some((n) => n.startsWith(".hidden"))).toBe(false);
    expect(notes.some((n) => n.startsWith("nested-vault"))).toBe(false);
    expect(notes).not.toContain("drafts/wip.md");
    expect([...g.notes.keys()]).toContain("drafts/wip.md");
  });
  test("symlinks: a duplicate of a walked note no, outside no, directories never followed", () => {
    expect(notes).not.toContain("alias-link.md"); // -> notes/alpha.md, already a note
    expect(notes).not.toContain("outside-link.md");
    expect(withVaultCfg.skipped.map((s) => s.rel)).toEqual(expect.arrayContaining(["alias-link.md", "outside-link.md", "symlinked-dir", "nested-vault"]));
  });
  test("a symlink to an otherwise-excluded note inside the vault is kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-link-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, ".private"));
    writeFileSync(join(dir, ".private", "p.md"), "# p\n");
    require("node:fs").symlinkSync(".private/p.md", join(dir, "public.md"));
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect([...g.notes.keys()]).toEqual(["public.md"]);
  });
  test("encodings: CRLF, BOM, invalid UTF-8 and no trailing newline all parse", () => {
    expect(withVaultCfg.notes.get("crlf.md")!.flags).toContain("crlf");
    expect(withVaultCfg.notes.get("bom.md")!.title).toBe("BOM note");
    expect(withVaultCfg.notes.get("latin1.md")!.flags).toContain("invalid-utf8");
    expect(withVaultCfg.notes.get("no-newline.md")!.title).toBe("No trailing newline");
  });
  test("graph: links resolve, attachments by path, backlinks", () => {
    const links = withVaultCfg.linksOf("index.md");
    const byTarget = Object.fromEntries(links.map((l) => [l.target, l]));
    expect(byTarget["notes/beta.md"]!.path).toBe("notes/beta.md");
    expect(byTarget["notes/Readme.md"]!.path).toBe("notes/Readme.md");
    expect(byTarget["missing-note.md"]!.resolvedKind).toBe("unresolved");
    expect(byTarget["attachments/diagram.png"]!.path).toBe("attachments/diagram.png");
    expect(withVaultCfg.backlinks("notes/beta.md").map((b) => b.from)).toContain("index.md");
    expect(withVaultCfg.notes.get("cjk/日本語.md")!.links[0]!.target).toBe("../notes/alpha.md");
  });
});

interface Captured {
  code: number;
  out: string;
  err: string;
}

async function cli(argv: string[], stdin = ""): Promise<Captured> {
  let out = "";
  let err = "";
  const code = await runCli(argv, {
    out: (s) => (out += s),
    err: (s) => (err += s),
    stdin: async () => stdin,
    isTTY: false,
    columns: undefined,
    cwd: VAULT,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code, out, err };
}

describe("CLI (9.x)", () => {
  test("--json is one object with a stable envelope", async () => {
    const r = await cli(["ls", "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(Object.keys(j)).toEqual(["schema", "ok", "command", "data", "warnings", "stale"]);
    expect(j.schema).toBe(1);
    expect(j.data.map((n: { path: string }) => n.path)).toContain("notes/alpha.md");
  });
  test("exit codes: not found 3, ambiguous 4, usage 2", async () => {
    expect((await cli(["resolve", "missing-note"])).code).toBe(3);
    expect((await cli(["render", "no-such-note"])).code).toBe(3);
    expect((await cli(["frobnicate"])).code).toBe(2);
    expect((await cli(["render", "--width"])).code).toBe(2);
    const dir = mkdtempSync(join(tmpdir(), "slipbox-amb-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "dup.md"), "# a\n");
    writeFileSync(join(dir, "b", "dup.md"), "# b\n");
    const amb = await cli(["resolve", "dup", "--root", dir, "--json"]);
    expect(amb.code).toBe(4);
    expect(JSON.parse(amb.out).data.candidates).toEqual(["a/dup.md", "b/dup.md"]);
  });
  test("resolve follows a link from a note, with the heading's line", async () => {
    const r = await cli(["resolve", "notes/alpha.md#Section Two", "--from", "index.md", "--json"]);
    expect(JSON.parse(r.out).data).toMatchObject({ status: "resolved", path: "notes/alpha.md", line: 11 });
    // A path, never a name (20.22): `alpha` from index.md is a file that isn't there.
    expect((await cli(["resolve", "alpha#Section Two", "--from", "index.md", "--json"])).code).toBe(3);
  });
  test("render is plain when piped, and never leaks escapes from the note", async () => {
    const r = await cli(["render", "escapes.md", "--width", "60"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("\x1b");
    expect(r.out).toContain("red");
  });
  test("capture, scratch show/path/clear with --if-unchanged", async () => {
    await cli(["scratch", "clear"]);
    await cli(["capture", "first thought"]);
    await cli(["capture", "--ref", "notes/alpha.md:7-9", "--snippet"]);
    await cli(["capture", "--ref", "index.md:3", "--stdin"], "piped selection");
    const shown = JSON.parse((await cli(["scratch", "show", "--json"])).out).data;
    expect(shown.content).toBe("first thought\n\n`notes/alpha.md:7-9`\n\n```markdown\n## Section One\n\nBack to [index](../index.md) and on to [beta](beta.md).\n```\n\n`index.md:3`\n\n```markdown\npiped selection\n```\n");
    expect((await cli(["scratch", "clear", "--if-unchanged", "0000"])).code).toBe(5);
    expect((await cli(["scratch", "clear", "--if-unchanged", shown.sha])).code).toBe(0);
    expect((await cli(["scratch", "show"])).out).toBe("");
  });
  test("init creates the marker with a version stamp (0.12, 1.10)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-init-"));
    const r = await cli(["init", dir, "--json"]);
    expect(JSON.parse(r.out).data.created).toBe(true);
    expect(require("node:fs").readFileSync(join(dir, ".slipbox", "version"), "utf8")).toBe("1\n");
    expect(JSON.parse((await cli(["init", dir, "--json"])).out).data.created).toBe(false);
  });
});

describe("CLI parity (Principles)", () => {
  test("every command declares its CLI equivalent or is an interaction", () => {
    const ids = new Set<string>();
    for (const c of COMMAND_SPECS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.cli === null || c.cli.startsWith("slipbox") || c.cli.startsWith("$EDITOR")).toBe(true);
      // …and a command the CLI has.
      if (c.cli?.startsWith("slipbox ")) expect(CLI_COMMANDS.has(c.cli.split(" ")[1]!)).toBe(true);
    }
  });
});

describe("review round 2 (CLI)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-r2-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  test("--json prints one envelope even for usage errors, help and version", async () => {
    const bad = await cli(["ls", "--json", "--bogus"]);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.out)).toMatchObject({ ok: false, error: { code: 2 }, warnings: [], stale: [] });
    expect(JSON.parse((await cli(["help", "--json"])).out)).toMatchObject({ ok: true, command: "help" });
    expect(JSON.parse((await cli(["-V", "--json"])).out)).toMatchObject({ ok: true, warnings: [], stale: [] });
  });
  test("shared flags are checked for every command", async () => {
    expect((await cli(["ls", "--color", "bogus"])).code).toBe(2);
    expect((await cli(["render", "notes/alpha.md", "--width", "0x20"])).code).toBe(2);
  });
  test("plain output never carries a note's escapes", async () => {
    const dir = vault({ "o.md": "# Title \u001b]0;HACKED\u0007 \u001b[31mred\n" });
    const r = await cli(["outline", join(dir, "o.md"), "--root", dir]);
    expect(r.out).toContain("Title");
    expect(r.out).not.toContain("\u001b");
  });
  test("a note named with a colon resolves as a note, not a URL", async () => {
    const dir = vault({ "Meeting: Q3.md": "# Q3\n" });
    const r = JSON.parse((await cli(["resolve", "Meeting: Q3", "--root", dir, "--json"])).out);
    expect(r.data).toMatchObject({ status: "resolved", path: "Meeting: Q3.md" });
    expect(JSON.parse((await cli(["resolve", "https://x.y", "--root", dir, "--json"])).out).data.status).toBe("external");
  });
  test("a markdown link in the wrong case resolves to the note's own path, and counts as a backlink", async () => {
    const dir = vault({ "note.md": "# note\n", "linker.md": "[x](Note.md)\n" });
    const links = JSON.parse((await cli(["links", join(dir, "linker.md"), "--root", dir, "--json"])).out);
    expect(links.data[0].path).toBe("note.md");
    const bl = JSON.parse((await cli(["backlinks", join(dir, "note.md"), "--root", dir, "--json"])).out);
    expect(bl.data.backlinks.map((b: { from: string }) => b.from)).toContain("linker.md");
  });
});

describe("review round 3 (CLI)", () => {
  test("a name with a colon and a space is a note (maybe missing), never a URL", async () => {
    const r = await cli(["resolve", "Meeting: Q4", "--json"]);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.out).error.message).toContain("unresolved");
  });
  test("a usage error's envelope names the command, never a flag's value", async () => {
    const r = await cli(["--root", "/tmp", "--bogus", "--json"]);
    expect(JSON.parse(r.out).command).toBe("help");
    expect(JSON.parse((await cli(["--root", "/tmp", "ls", "--bogus", "--json"])).out).command).toBe("ls");
  });
  test("a bad --color is a usage error before anything else can fail", async () => {
    expect((await cli(["ls", "--root", "/nonexistent-dir", "--color", "bad"])).code).toBe(2);
  });
});

describe("review cycle 4 (vault, hostile files)", () => {
  test("a symlinked FIFO is skipped; device symlinks for .gitignore, config and version are refused", async () => {
    const { symlinkSync } = await import("node:fs");
    const { WalkFilter, walkVault } = await import("../src/core/walk.ts");
    const { loadConfig } = await import("../src/core/config.ts");
    const { readVaultVersion } = await import("../src/core/vault.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-hostile-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "# a\n");
    Bun.spawnSync(["mkfifo", join(dir, "pipe")]);
    symlinkSync("pipe", join(dir, "flink.md"));
    symlinkSync("/dev/zero", join(dir, "sub", ".gitignore"));
    symlinkSync("/dev/zero", join(dir, ".slipbox", "config.toml"));
    symlinkSync("/dev/zero", join(dir, ".slipbox", "version"));
    const walk = walkVault(dir, new WalkFilter(dir, DEFAULT_CONFIG.walk));
    expect(walk.files.map((f) => f.rel)).toEqual(["a.md"]);
    expect(walk.skipped.find((s) => s.rel === "flink.md")?.reason).toContain("isn't a file");
    const cfg = loadConfig({ vaultRoot: dir, configFile: join(dir, "none.toml") });
    expect(cfg.warnings.join("\n")).toContain("not a regular file");
    expect(readVaultVersion(dir)).toBeNull();
  });
});

describe("review cycle 5 (the repo carries the demo vault)", () => {
  test("every file of the demo vault is tracked by git: none is ignored", () => {
    const dir = join(import.meta.dir, "..", "examples", "vault");
    const r = Bun.spawnSync(["git", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", dir]);
    if (r.exitCode !== 0) return; // not a git checkout (an archive): nothing to compare
    expect(r.stdout.toString().trim()).toBe("");
  });
});

describe("review cycle 5 (vault, a loose folder)", () => {
  test("a folder with no .slipbox or repository above it is walked as a vault is: an unnamed instance (20.22)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "# A\n\n[b](b.md) [c](sub/c.md)\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "sub", "c.md"), "# C\n");
    const loc = locateVault({ path: dir, cwd: dir });
    expect(loc.mode).toBe("folder");
    const g = openGraph(loc, DEFAULT_CONFIG, true);
    expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md", "sub/c.md"]);
    expect(g.backlinks("sub/c.md").map((b) => b.from)).toEqual(["a.md"]);
    // Its index kept, in its own cache: a second open reads it back.
    expect(openGraph(loc, DEFAULT_CONFIG, true).stats.cached).toBe(3);
  });

  test("a plain folder in the CLI: its search index, its scope reaching the vaults it links to (20.22)", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-plainscope-"));
    const plain = join(base, "plain");
    const v = join(base, "v");
    mkdirSync(plain);
    mkdirSync(join(v, ".slipbox"), { recursive: true });
    writeFileSync(join(v, "w.md"), "# W\n\nA walrus.\n");
    writeFileSync(join(plain, "p.md"), "# P\n\n[w](../v/w.md) and a walrus.\n");
    const out: string[] = [];
    const cli = async (args: string[], cwd: string) => {
      out.length = 0;
      const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
      return { code, json: JSON.parse(out.join("")) };
    };
    await cli(["ls"], v);
    expect((await cli(["index"], plain)).code).toBe(0);
    const r = await cli(["search", "walrus", "--scope", "linked"], plain);
    expect(r.json.data.engine).toBe("index");
    expect(r.json.data.hits.map((h: { abs: string }) => h.abs).sort()).toEqual([join(plain, "p.md"), join(v, "w.md")]);
  });

  test("$HOME or / opened as a plain folder is listed a level at a time, never walked or indexed (20.22)", () => {
    const home = mkdtempSync(join(tmpdir(), "slipbox-home-"));
    mkdirSync(join(home, "sub"));
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "sub", "c.md"), "# C\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = locateVault({ path: home, cwd: home });
      expect(loc.mode).toBe("folder");
      expect(isListed(loc)).toBe(true);
      expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()]).toEqual(["a.md"]);
      expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(false);
    } finally {
      process.env.HOME = before;
    }
  });
});

describe("review cycle 5 (the watcher's polling fallbacks)", () => {
  const until = async (ok: () => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await Bun.sleep(20);
  };
  test("degraded (the watch limit hit): open notes are polled, their changes still reported", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-poll-"));
    writeFileSync(join(dir, "a.md"), "one\n");
    const changed: string[] = [];
    const degraded: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      pollMs: 200, // the sweep of every known note comes each 15th tick: 3 s
      known: new Map([["a.md", 0]]),
      pollTargets: () => ["a.md"],
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: (r) => degraded.push(r),
    });
    try {
      (w as unknown as { degrade(r: string): void }).degrade("ENOSPC: test");
      expect(degraded.join()).toContain("polling open notes");
      expect(w.degraded).toContain("ENOSPC");
      writeFileSync(join(dir, "a.md"), "two, longer\n");
      // Polled as an open note within a few ticks, long before the sweep would find it.
      await until(() => changed.includes("a.md"), 1500);
      expect(changed).toContain("a.md");
    } finally {
      w.close();
    }
  });
  test("a folder that can't be watched is polled: its new and changed notes still come", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-polldir-"));
    mkdirSync(join(dir, "sub"));
    const changed: string[] = [];
    const warned: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [],
      debounceMs: 20,
      pollMs: 50,
      known: new Map(),
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: () => {},
      onWarn: (m) => warned.push(m),
    });
    try {
      (w as unknown as { pollDir(d: string, r: string): void }).pollDir("sub", "EACCES: test");
      expect(warned.join()).toContain("polling it");
      expect(w.polledDirs).toContain("sub");
      writeFileSync(join(dir, "sub", "new.md"), "# New\n");
      await until(() => changed.includes("sub/new.md"));
      expect(changed).toContain("sub/new.md");
    } finally {
      w.close();
    }
  });
});

describe("links out of data files and to files (16.15)", () => {
  test("a data file's links resolve and count as backlinks; a note's link to a file is a backlink", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-datalinks-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "schemas"));
    writeFileSync(join(dir, "schemas", "user.json"), '{"type": "object"}\n');
    writeFileSync(join(dir, "design.md"), "# Design\n\nSee [the config](app.toml).\n");
    writeFileSync(join(dir, "app.toml"), '[api]\nschema = "schemas/user.json"\ndocs = "design.md"\nout = "no/such/dir/"\nhome = "https://example.invalid"\n');
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
    const body = ["[space](my note.md)", "[paren](plan (v2).md)", "[angle](<my note.md>)", "[enc](plan%20(v2).md)", "[brackets](<draft [wip].md>)", '[title](x.md "A title")', "[single](x.md 'single')", "[empty]()", "[hash](#)"];
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
});

describe("the demo vault's code samples", () => {
  test("each language's sample parses cleanly, has an outline, and every path in its comments resolves", async () => {
    const { grammar, grammarFor, parseSyntax } = await import("../src/core/syntax.ts");
    const { classify, extensionOf } = await import("../src/core/filetypes.ts");
    const demo = join(import.meta.dir, "..", "examples", "vault");
    const g = openGraph(locateVault({ root: demo }), DEFAULT_CONFIG, false);
    await g.loadGrammars();
    const code = g.filePaths().filter((p) => { const k = classify(p, ["md"]); return k.group === "text" && grammarFor(k.format, extensionOf(p)); }).sort();
    // A sample for every grammar slipbox bundles (the broken one on purpose aside).
    const langs = new Set(code.map((p) => grammarFor(classify(p, ["md"]).format, extensionOf(p))));
    expect([...langs].sort()).toEqual(["bash", "go", "javascript", "lua", "python", "rust", "typescript"]);
    for (const rel of code) {
      const kind = classify(rel, ["md"]);
      const tree = parseSyntax((await grammar(grammarFor(kind.format, extensionOf(rel))!))!, readFileSync(join(demo, rel), "utf8"))!;
      if (rel === "scratch/half-written.py") continue; // broken on purpose: its error swallows the rest
      expect([rel, tree.errors()]).toEqual([rel, []]);
      expect([rel, tree.outline().length > 0]).toEqual([rel, true]);
      for (const l of g.linksOf(rel)) expect([rel, l.target, l.resolvedKind]).not.toContainEqual("unresolved");
    }
  });
});

describe("vault identity, storage and the machine's vaults (17.3–17.6)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out, err };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli(args, r.io);
    return { code, out: r.out.join(""), err: r.err.join(""), json: args.includes("--json") ? JSON.parse(r.out.join("")) : null };
  };
  const fresh = (prefix: string) => mkdtempSync(join(tmpdir(), `slipbox-${prefix}-`));

  test("init gives a vault an id and a name (the folder's), in [vault]; the config loader skips it", async () => {
    const dir = join(fresh("init"), "Field Notes");
    mkdirSync(dir);
    const r = await cli(["init", dir, "--json"], dir);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ created: true, name: "Field-Notes" });
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    expect(cfg).toContain(`[vault]\nid = "${r.json.data.id}"\nname = "Field-Notes"`);
    const loc = locateVault({ path: dir });
    expect(loc).toMatchObject({ mode: "vault", id: r.json.data.id, name: "Field-Notes" });
    expect(loc.key).toMatch(/^[0-9a-f]{12}$/); // this copy's instance (20.5), not the vault's id
    // [vault] is identity, not a setting: no "unknown key" warning.
    const info = await cli(["info", "--json"], dir);
    expect(info.json.warnings).toEqual([]);
    expect(info.json.data.vault).toMatchObject({ id: r.json.data.id, name: "Field-Notes" });
    // …and in the user's config it's a mistake worth a word.
    const user = join(fresh("user"), "config.toml");
    writeFileSync(user, '[vault]\nname = "x"\n');
    expect(loadConfig({ configFile: user }).warnings.join()).toContain("[vault] belongs in a vault's");
  });

  test("a vault without an id gets one when first opened, its comments kept; its old state moves over (17.18)", async () => {
    const dir = fresh("old");
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), "# mine\n[walk]\nexclude = [\"x/\"]\n");
    // Positions saved under the path's key, before vaults had ids.
    const { PositionStore } = await import("../src/core/position.ts");
    const ps = new PositionStore({ key: vaultKey(dir), mode: "vault", root: dir });
    ps.set("a.md", { heading: null, headingIndex: 0, offset: 0, line: 7 });
    ps.save();
    const loc = locateVault({ path: dir });
    expect(loc.id).toMatch(/^[0-9a-f]{16}$/);
    expect(loc.name).toBe(basename(dir).replace(/[^A-Za-z0-9._-]/g, ""));
    expect(loc.key).toMatch(/^[0-9a-f]{12}$/);
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    expect(cfg.startsWith("# mine\n[walk]\nexclude = [\"x/\"]\n")).toBe(true);
    expect(cfg).toContain(`[vault]\nid = "${loc.id}"`);
    expect(new PositionStore(loc).get("a.md")?.line).toBe(7);
    // Opened again: the same identity, nothing written.
    expect(locateVault({ path: dir }).id).toBe(loc.id);
    expect(readFileSync(join(dir, ".slipbox", "config.toml"), "utf8")).toBe(cfg);
    expect((await cli(["init", "--json"], dir)).json.data).toMatchObject({ created: false, identified: false });
    // init --name on a named vault: that's a rename, not an init.
    expect((await cli(["init", "--name", "other-name", "--json"], dir)).json.error.message).toContain("rename-vault other-name");
    // A config that doesn't parse (a typo mid-edit) is never written to.
    const broken = fresh("broken");
    mkdirSync(join(broken, ".slipbox"));
    writeFileSync(join(broken, ".slipbox", "config.toml"), "[walk\n");
    locateVault({ path: broken });
    expect(readFileSync(join(broken, ".slipbox", "config.toml"), "utf8")).toBe("[walk\n");
  });

  test("init --private keeps .slipbox/ out of git: listed in .git/info/exclude (17.18)", async () => {
    const dir = fresh("private");
    if (Bun.spawnSync(["git", "init", "-q", dir]).exitCode !== 0) return; // no git here
    const r = await cli(["init", dir, "--private", "--json"], dir);
    expect(r.json.data.excluded).toBe(join(dir, ".git", "info", "exclude"));
    expect(readFileSync(join(dir, ".git", "info", "exclude"), "utf8").split("\n")).toContain("/.slipbox/");
    const status = Bun.spawnSync(["git", "-C", dir, "status", "--porcelain"]).stdout.toString();
    expect(status).not.toContain(".slipbox");
  });

  test("names: a vault inside vault x is suggested x-<folder>; a known name is refused with a suggestion (17.5)", async () => {
    const top = join(fresh("names"), "x");
    mkdirSync(join(top, "plan"), { recursive: true });
    expect((await cli(["init", top, "--name", "xnames", "--json"], top)).json.data.name).toBe("xnames");
    const inner = await cli(["init", join(top, "plan"), "--json"], top);
    expect(inner.json.data.name).toBe("xnames-plan");
    const other = join(fresh("names"), "y");
    mkdirSync(other);
    const refused = await cli(["init", other, "--name", "xnames", "--json"], other);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain('a vault named "xnames" is already at');
    expect(refused.json.error.message).toContain('try "y"');
    expect((await cli(["init", other, "--name", "a:b"], other)).code).toBe(5);
    // The folder's name when free; a taken one gets -2.
    const again = join(fresh("names"), "xnames");
    mkdirSync(again);
    expect((await cli(["init", again, "--json"], again)).json.data.name).toBe("xnames-2");
  });

  test("each copy its own state; one gone from where it was is asked about where a vault first appears, never taken on a guess (20.5)", async () => {
    const { PositionStore } = await import("../src/core/position.ts");
    const { readRegistry } = await import("../src/core/registry.ts");
    const a = join(fresh("moves"), "orig");
    mkdirSync(a);
    await cli(["init", a, "--name", "orig-moves"], a);
    const locA = locateVault({ path: a });
    const pa = new PositionStore(locA);
    pa.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 9 });
    pa.save();
    // A copy made while the original is there: its own instance, and nothing asked.
    const b = join(fresh("moves"), "copy");
    cpSync(a, b, { recursive: true });
    const locB = locateVault({ path: b });
    expect(locB.id).toBe(locA.id);
    expect(locB.key).not.toBe(locA.key);
    expect(locB.movedHere).toBeUndefined();
    // The original moved: where it is now, a new instance, and the question — its state not taken yet.
    const c = join(fresh("moves"), "moved");
    renameSync(a, c);
    const locC = locateVault({ path: c });
    expect(locC.key).not.toBe(locA.key);
    expect(locC.movedHere?.map((v) => v.path)).toEqual([a]);
    expect(new PositionStore(locC).get("n.md")).toBeNull();
    // Asked through the CLI: every command says so, until answered.
    const said = await cli(["ls", "--json"], c);
    expect(said.json.warnings.join()).toContain(`was last seen at ${a}`);
    expect(said.json.warnings.join()).toContain(`slipbox vault-moved ${a}`);
    expect((await cli(["vault-moved", "--json"], c)).json.data.map((v: { path: string }) => v.path)).toEqual([a]);
    // Confirmed: its instance, its state, its move kept; the one made meanwhile gone.
    const { cacheDir, stateDir } = await import("../src/core/paths.ts");
    const meanwhile = new PositionStore(locC); // read there while unanswered
    meanwhile.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 1 });
    meanwhile.save();
    expect(existsSync(stateDir(locC))).toBe(true);
    const moved = await cli(["vault-moved", a, "--json"], c);
    expect(moved.json.data).toMatchObject({ from: a, to: c });
    expect(existsSync(cacheDir(locC)) || existsSync(stateDir(locC))).toBe(false); // the one made meanwhile, gone
    const after = locateVault({ path: c });
    expect(after.key).toBe(locA.key);
    expect(after.movedHere).toBeUndefined();
    expect(new PositionStore(after).get("n.md")?.line).toBe(9);
    const entry = readRegistry().find((v) => v.key === locA.key)!;
    expect(entry.path).toBe(c);
    expect(entry.moved?.map((m) => [m.from, m.to])).toEqual([[a, c]]);
    expect(readRegistry().some((v) => v.key === locC.key)).toBe(false);
    // The copy, moved too and said not to be the original's: its own, and not asked again.
    const d = join(fresh("moves"), "copy-moved");
    renameSync(b, d);
    const locD = locateVault({ path: d });
    expect(locD.movedHere?.map((v) => v.path)).toEqual([b]);
    expect((await cli(["vault-moved", b, "--not", "--json"], d)).code).toBe(0);
    expect(locateVault({ path: d }).movedHere).toBeUndefined();
    expect(locateVault({ path: d }).key).toBe(locD.key);
    expect((await cli(["vault-moved", "/nowhere", "--json"], d)).code).toBe(3);
    // Not a move: a copy seen after this one first was (they were both there), and a worktree (git
    // names those) — gone all the same.
    const { recordVault } = await import("../src/core/registry.ts");
    const e = join(fresh("moves"), "late");
    cpSync(c, e, { recursive: true });
    const locE = locateVault({ path: e });
    const orig = readRegistry().find((v) => v.key === locA.key)!;
    recordVault({ ...orig }, new Date(Date.now() + 11 * 60_000)); // seen after e appeared (past the ten-minute throttle)
    recordVault({ key: `${locA.key}-wt`, id: locA.id, kind: "vault", name: "orig-moves", aliases: [], previous_names: [], path: join(c, "..", "gone-worktree"), collection: orig.collection, worktree: { name: "gone", main: c } }, new Date(0));
    rmSync(c, { recursive: true });
    // Of the three gone, only b: the original was seen after e appeared, and the worktree is git's.
    expect(locateVault({ path: e }).movedHere?.map((v) => v.path)).toEqual([b]);
    expect(locE.movedHere?.map((v) => v.path)).toEqual([b]);
  });

  test("today's state moves to its instance once: a list from before instances, and state with no list at all (20.5)", async () => {
    const { PositionStore } = await import("../src/core/position.ts");
    const { readRegistry, recordVault } = await import("../src/core/registry.ts");
    const { cacheDir, stateDir } = await import("../src/core/paths.ts");
    // Listed under its id, as before instances; its state and cache under the id too.
    const dir = fresh("before");
    await cli(["init", dir, "--name", "before-inst"], dir);
    const id = locateVault({ path: dir }).id!;
    const now = locateVault({ path: dir }).key;
    const { writeJson } = await import("../src/core/fsutil.ts");
    const { registryFile } = await import("../src/core/registry.ts");
    writeJson(registryFile(), { version: 1, vaults: readRegistry().filter((v) => v.key !== now) });
    recordVault({ key: id, id, kind: "vault", name: "before-inst", aliases: [], previous_names: [], path: dir }, new Date(0));
    const list = readRegistry();
    const i = list.findIndex((v) => v.key === id);
    delete list[i]!.instance;
    delete list[i]!.since;
    writeJson(registryFile(), { version: 1, vaults: list });
    const old = new PositionStore({ key: id, mode: "vault", root: dir });
    old.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 4 });
    old.save();
    mkdirSync(cacheDir({ key: id }), { recursive: true });
    const loc = locateVault({ path: dir });
    expect(loc.key).toMatch(/^[0-9a-f]{12}$/);
    expect(loc.movedHere).toBeUndefined(); // listed before instances: nothing asked
    expect(new PositionStore(loc).get("n.md")?.line).toBe(4);
    expect(existsSync(stateDir({ key: id }))).toBe(false);
    expect(existsSync(cacheDir(loc))).toBe(true);
    expect(readRegistry().filter((v) => v.path === dir).map((v) => [v.key, v.instance])).toEqual([[loc.key, loc.key]]);
    expect(locateVault({ path: dir }).key).toBe(loc.key); // once
    // No list entry at all, state under the path's key (before ids): taken all the same.
    const lone = fresh("lone");
    mkdirSync(join(lone, ".slipbox"));
    const ps = new PositionStore({ key: vaultKey(lone), mode: "vault", root: lone });
    ps.set("m.md", { heading: null, headingIndex: 0, offset: 0, line: 2 });
    ps.save();
    expect(new PositionStore(locateVault({ path: lone })).get("m.md")?.line).toBe(2);
  });

  test("a list that can't be written: the path's key, the same each time (20.5)", () => {
    const { chmodSync } = require("node:fs") as typeof import("node:fs");
    const { stateHome } = require("../src/core/paths.ts") as typeof import("../src/core/paths.ts");
    const dir = fresh("ro");
    mkdirSync(join(dir, ".git"));
    mkdirSync(stateHome(), { recursive: true });
    chmodSync(stateHome(), 0o555);
    try {
      const a = locateVault({ path: dir });
      expect(a.key).toBe(vaultKey(dir));
      expect(locateVault({ path: dir }).key).toBe(a.key);
    } finally {
      chmodSync(stateHome(), 0o755);
    }
  });

  test("the machine's vaults: each open is recorded once, with its name, kind and path (17.6)", async () => {
    const { readRegistry, registryFile } = await import("../src/core/registry.ts");
    const dir = fresh("reg");
    const r = await cli(["init", dir, "--name", "regvault", "--json"], dir);
    await cli(["ls"], dir);
    const entry = readRegistry().find((v) => v.id === r.json.data.id)!;
    expect(entry).toMatchObject({ kind: "vault", name: "regvault", path: dir });
    // Opened again at once: nothing changed, nothing written.
    const stamp = statSync(registryFile()).mtimeMs;
    await Bun.sleep(20);
    await cli(["ls"], dir);
    expect(statSync(registryFile()).mtimeMs).toBe(stamp);
    // A git checkout is one by itself (20.3): listed by its path, with no id, under its folder's name.
    const repo = fresh("regrepo");
    mkdirSync(join(repo, ".git"));
    await cli(["ls"], repo);
    expect(readRegistry().find((v) => v.path === repo)).toMatchObject({ kind: "vault", id: null, name: implicitName(repo) });
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
  });

  test("a git vault without .slipbox/: named by its folder, so rename-vault is refused; init gives it .slipbox/ (20.3)", async () => {
    const repo = fresh("gitname");
    mkdirSync(join(repo, ".git"));
    const refused = await cli(["rename-vault", "other", "--json"], repo);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain("has no .slipbox/ to hold a name: slipbox init gives it");
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
    const made = (await cli(["init", "--name", "gitnamed", "--json"], repo)).json.data;
    expect(made).toMatchObject({ root: repo, created: true, name: "gitnamed" });
    expect(locateVault({ path: repo })).toMatchObject({ root: repo, name: "gitnamed", id: made.id });
  });

  test("a plain folder keeps its own positions and session, as its own instance (20.22)", async () => {
    const { PositionStore, loadSession, saveSession } = await import("../src/core/position.ts");
    const one = fresh("l1");
    const two = fresh("l2");
    const a = locateVault({ path: one });
    const b = locateVault({ path: two });
    expect(a.key).not.toBe(b.key);
    const pa = new PositionStore(a);
    pa.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 3 });
    pa.save();
    expect(new PositionStore(locateVault({ path: one })).get("n.md")?.line).toBe(3); // kept, by its own path
    expect(new PositionStore(b).get("n.md")).toBeNull(); // another folder's n.md
    saveSession(a, { version: 1, tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true });
    expect(loadSession(a)?.tabs).toHaveLength(1);
    expect(loadSession(b)).toBeNull();
  });
});

describe("links across vaults: paths; names only for the converter (17.7–17.11, 20.22)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out, err };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  const base = mkdtempSync(join(tmpdir(), "slipbox-reach-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const files: Record<string, string> = {
    "notes/index.md": "# Index\n\n[[xapp:design]] [[xapp:design#Goals|the goals]] [[xapp:missing]] [[nope:x]] [[xnotes:todo]]\n\n[[nick]] [[old-name]] [paths](../app/design.md)\n",
    "notes/todo.md": "# Todo\n",
    "notes/person.md": "---\naliases: [nick]\n---\n# Person\n",
    "notes/renamed.md": "---\nprevious_names: [old-name]\n---\n# Renamed\n",
    "notes/a:b.md": "# colon\n",
    "app/design.md": "# Design\n\nIntro.\n\n## Goals\n",
    "app/links.md": "[todo](../notes/todo.md) and [t](../notes/person.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  const ready = (async () => {
    await cli(["init", notes, "--name", "xnotes"], notes);
    await cli(["init", app, "--name", "xapp"], app);
    await cli(["ls"], app); // app's index, as of now: its links into notes
  })();

  /** What the converter would write for index.md (20.1): the legacy reader's answers. */
  const converted = async () => {
    const r = await cli(["convert-links", "index", "--dry-run"], notes);
    return { after: r.json.data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after)).join("\n"), skipped: r.json.data.skipped.map((x: { reason: string }) => x.reason) as string[] };
  };

  test("[[vault:note]] isn't a link (20.22): resolve says so; the converter reads it, into the named vault (17.8)", async () => {
    await ready;
    const r = await cli(["resolve", "[[xapp:design#Goals]]"], notes);
    expect(r.code).toBe(3);
    expect(r.json.error.message).toContain("a wikilink isn't a link");
    // Bare, it's the vault:path form (20.20): a path in that vault, never a name.
    expect((await cli(["resolve", "xapp:design.md#Goals"], notes)).json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md"), vault: "xapp", line: 5 });
    expect((await cli(["resolve", "xapp:design"], notes)).code).toBe(3);
    // A note named with a colon is still a note here, by its name as a command names it.
    expect((await cli(["resolve", "a:b"], notes)).json.data.path).toBe("a:b.md");
    const c = await converted();
    expect(c.after).toContain("[xapp:design](../app/design.md) [the goals](../app/design.md#goals)");
    expect(c.after).toContain("[xnotes:todo](todo.md)"); // this vault, by its own name
  });

  test("a note or vault that isn't there: the converter says which, and leaves it (17.8)", async () => {
    await ready;
    const { skipped } = await converted();
    expect(skipped.some((x) => x.includes("[[xapp:missing]]") && x.includes('no note "missing" in vault "xapp"'))).toBe(true);
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown vault "nope"'))).toBe(true);
  });

  test("aliases and previous names: names, gone from links (20.22) — the converter still reads them (17.7)", async () => {
    await ready;
    expect((await cli(["resolve", "[[nick]]"], notes)).code).toBe(3);
    expect((await converted()).after).toContain("[nick](person.md) [old-name](renamed.md)");
  });

  test("a path out of the root reaches the file in the other vault (17.9)", async () => {
    await ready;
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "../app/design.md")).toMatchObject({ status: "note", path: join(app, "design.md"), vault: "xapp" });
  });

  test("backlinks come from other vaults' indexes too, as of their last indexing (17.11)", async () => {
    await ready;
    const todo = (await cli(["backlinks", "todo"], notes)).json.data.backlinks;
    expect(todo).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), vault: "xapp", kind: "markdown" }));
    const person = (await cli(["backlinks", "person"], notes)).json.data.backlinks;
    expect(person).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), vault: "xapp", kind: "markdown" }));
  });

  test("a renamed vault's old name: the converter reaches it, checked by its id; a moved-away vault says where it was", async () => {
    await ready;
    const cfg = join(app, ".slipbox", "config.toml");
    const before = readFileSync(cfg, "utf8");
    writeFileSync(cfg, before.replace('name = "xapp"', 'name = "xapp2"\nprevious_names = ["xapp"]'));
    await cli(["ls"], app); // the machine sees the new name
    expect((await converted()).after).toContain("[xapp:design](../app/design.md)");
    const moved = join(base, "app-moved");
    const { renameSync } = await import("node:fs");
    renameSync(app, moved);
    writeFileSync(join(notes, "index.md"), readFileSync(join(notes, "index.md"), "utf8").replace("[[xapp:design]]", "[[xapp2:design]]"));
    expect((await converted()).skipped.some((x) => x.includes(`was last seen at ${app}`))).toBe(true);
    writeFileSync(join(notes, "index.md"), files["notes/index.md"]!);
    renameSync(moved, app);
    writeFileSync(cfg, before);
    await cli(["ls"], app);
  });
});

describe("moves: detected by content, kept as redirects (17.12)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-moves-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };

  test("a note moved outside slipbox (mv) is found again: its path links are broken, and the relink knows where it went", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "notes/plan.md": "# The plan\n\nSteps.\n", "index.md": "[p](notes/plan.md) [s](notes/plan.md#the-plan)\n" });
    await cli(["ls"], dir); // indexed: plan.md's text is known
    mkdirSync(join(dir, "archive"));
    renameSync(join(dir, "notes", "plan.md"), join(dir, "archive", "old-plan.md"));
    // A move is evidence for a fix, never a way to resolve (20.2).
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(links.map((l: { status: string; path: string }) => [l.status, l.path])).toEqual([
      ["unresolved", null],
      ["unresolved", null],
    ]);
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).code).toBe(3);
    expect((await cli(["backlinks", "archive/old-plan.md"], dir)).json.data.backlinks).toHaveLength(0);
    const relink = await cli(["relink", "--dry-run"], dir);
    expect(relink.json.data.files[0].edits[0].after).toBe("[p](archive/old-plan.md) [s](archive/old-plan.md#the-plan)");
    // Its problem says where it went, and the fix; a note seen to move is no note still to write.
    const problems = (await cli(["diagnostics", "index.md"], dir)).json.data.problems.map((p: { severity: string; message: string }) => [p.severity, p.message]);
    expect(problems[0]).toEqual(["warning", "broken link: notes/plan.md — moved to archive/old-plan.md (relink fixes it)"]);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.movedTarget({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBe("archive/old-plan.md");
    expect(g.missingNote({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBeNull();
    expect(g.missingNote({ kind: "markdown", target: "notes/never.md" }, "index.md")).toBe("notes/never.md");
    // Moved again: the chain is followed.
    renameSync(join(dir, "archive", "old-plan.md"), join(dir, "plan-final.md"));
    expect((await cli(["relink", "--dry-run"], dir)).json.data.files[0].edits[0].after).toBe("[p](plan-final.md) [s](plan-final.md#the-plan)");
  });

  test("a leading / is the filesystem's root in a note, the vault's in a code file (20.2, 16.10)", () => {
    const dir = vault({ "notes/a.md": "# A\n", "run.py": "# see /notes/a.md\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("/notes/a.md", "index.md").resolvedKind).toBe("unresolved");
    expect(at(join(dir, "notes", "a.md"), "index.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    expect(at("/notes/a.md", "run.py")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
  });

  test("two notes with the same text gone at once: no move is guessed", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "a.md": "# same\n", "b.md": "# same\n", "index.md": "[a](a.md)\n" });
    await cli(["ls"], dir);
    // One moved, one deleted: which went where can't be told.
    renameSync(join(dir, "a.md"), join(dir, "c.md"));
    rmSync(join(dir, "b.md"));
    expect((await cli(["resolve", "[a](a.md)", "--from", "index.md"], dir)).code).toBe(3);
  });

  test("the watcher's removal and arrival pair into a move, in either order", () => {
    const dir = vault({ "a.md": "# A text\n", "b.md": "# B text\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({ rel, abs: join(dir, rel), size: statSync(join(dir, rel)).size, mtimeMs: statSync(join(dir, rel)).mtimeMs });
    writeFileSync(join(dir, "a2.md"), "# A text\n");
    rmSync(join(dir, "a.md"));
    g.removeFile("a.md");
    g.updateFile("a2.md", file("a2.md"));
    expect(g.redirects!.follow("a.md")).toBe("a2.md");
    writeFileSync(join(dir, "b2.md"), "# B text\n");
    g.updateFile("b2.md", file("b2.md")); // arrived first
    rmSync(join(dir, "b.md"));
    g.removeFile("b.md");
    expect(g.redirects!.follow("b.md")).toBe("b2.md");
    // Evidence for a fix, not a way to resolve (20.2).
    expect(g.resolveLink({ kind: "markdown", target: "b.md" }, "a2.md").resolvedKind).toBe("unresolved");
    expect(g.movedTarget({ kind: "markdown", target: "b.md" }, "a2.md")).toBe("b2.md");
  });
});

describe("renames across vaults (17.15, 7.1–7.3)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-rename-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("a note's rename rewrites every link form, keeps how each was written, and keeps its old name", async () => {
    const dir = vault({
      "notes/plan.md": "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../index.md) and [index](../index.md).\n",
      "index.md":
        "# Index\n\n[plan](notes/plan.md) and [the steps](notes/plan.md#steps) and ![plan](notes/plan.md)\n\n" +
        "[p](notes/plan.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](notes/plan.md) | y |\n\n[ref]: notes/plan.md\n",
      "notes/other.md": "---\naliases: [nickname]\n---\nSee [x](plan.md), [plan](plan.md) 🔭 [plan](plan.md).\n",
      "code.md": "`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](notes/plan.md) and [p](notes/plan.md) aren't.\n",
    });
    const dry = await cli(["mv", "plan", "archive/2026/roadmap", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.dryRun).toBe(true);
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true); // nothing written by a preview
    expect(dry.json.data.files.map((f: { path: string }) => f.path).sort()).toEqual(["code.md", "index.md", "notes/other.md", "notes/plan.md"]);
    const done = await cli(["mv", "plan", "archive/2026/roadmap"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "index.md")).toBe(
      "# Index\n\n[plan](archive/2026/roadmap.md) and [the steps](archive/2026/roadmap.md#steps) and ![plan](archive/2026/roadmap.md)\n\n" +
        "[p](archive/2026/roadmap.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](archive/2026/roadmap.md) | y |\n\n[ref]: archive/2026/roadmap.md\n",
    );
    expect(read(dir, "notes/other.md")).toBe("---\naliases: [nickname]\n---\nSee [x](../archive/2026/roadmap.md), [plan](../archive/2026/roadmap.md) 🔭 [plan](../archive/2026/roadmap.md).\n");
    // The link at the index's position, not the same text in code before it.
    expect(read(dir, "code.md")).toBe("`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) aren't.\n");
    // It moved two folders deeper: its own relative links follow; its old name is kept.
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    expect(read(dir, "archive/2026/roadmap.md")).toBe("---\ntitle: Plan\nprevious_names: [plan]\n---\n# Plan\n\n## Steps\n\nUp: [home](../../index.md) and [index](../../index.md).\n");
    // Every link resolves to it now, by its new path.
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(links.filter((l: { target: string }) => l.target.includes("roadmap")).every((l: { path: string }) => l.path === "archive/2026/roadmap.md")).toBe(true);
  });

  test("refused: an existing target, outside the vault, a file changed since the preview", async () => {
    const dir = vault({ "a.md": "# a\n", "b.md": "# b\n", "index.md": "[a](a.md)\n" });
    expect((await cli(["mv", "a", "b"], dir)).code).toBe(5);
    expect((await cli(["mv", "a", "../elsewhere"], dir)).code).toBe(5);
    const { openGraph: open } = await import("../src/core/graph.ts");
    const { planNoteRename, applyPlan } = await import("../src/core/rename.ts");
    const g = open(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const plan = planNoteRename(g, "a.md", "c");
    writeFileSync(join(dir, "index.md"), "[a](a.md) edited meanwhile\n");
    expect(() => applyPlan(g, plan)).toThrow(/changed since the preview/);
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(read(dir, "index.md")).toBe("[a](a.md) edited meanwhile\n");
  });

  test("links from other vaults are rewritten too; a vault's rename keeps its old name (17.15)", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": "[p](../NOTES/plan.md) and [t](../NOTES/plan.md)\n".replaceAll("NOTES", basename(notes)) });
    await cli(["init", notes, "--name", "rnotes"], notes);
    await cli(["init", app, "--name", "rapp"], app);
    await cli(["ls"], app); // its index: the links into rnotes
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`);
    // The vault's rename: the config, the old name kept; a path link has no vault name to fix.
    await cli(["ls"], app);
    const r = await cli(["rename-vault", "rnotes2"], notes);
    expect(r.code).toBe(0);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`);
    const cfg = read(notes, ".slipbox/config.toml");
    expect(cfg).toContain('name = "rnotes2"');
    expect(cfg).toContain('previous_names = ["rnotes"]');
  });

  test("a rename's writes into another vault reach its index at once: a second rename right after fixes them again", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": `[p](../${basename(notes)}/plan.md)\n` });
    await cli(["init", notes, "--name", "rnotes3"], notes);
    await cli(["init", app, "--name", "rapp3"], app);
    await cli(["ls"], app);
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/roadmap.md)\n`);
    // No opening of the other vault in between: its index already has the new link.
    await cli(["mv", "roadmap", "vision"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/vision.md)\n`);
  });

  test("relink: links to a note seen to move are rewritten to where it is now", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "notes/plan.md": "# Plan\n", "index.md": "[p](notes/plan.md) [s](notes/plan.md#plan)\n" });
    await cli(["ls"], dir);
    renameSync(join(dir, "notes", "plan.md"), join(dir, "roadmap.md"));
    const r = await cli(["relink", "index"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "index.md")).toBe("[p](roadmap.md) [s](roadmap.md#plan)\n");
  });

  test("a git tree that already has changes is named in the plan (7.3)", async () => {
    const dir = vault({ "a.md": "# a\n", "index.md": "[[a]]\n" });
    const git = Bun.spawnSync(["git", "init", "-q", dir]);
    if (git.exitCode !== 0) return; // no git here
    const r = await cli(["mv", "a", "b", "--dry-run"], dir);
    expect(r.json.data.warnings.join()).toContain("uncommitted changes");
  });

  test("previous_names is spliced into the frontmatter, never rewritten", async () => {
    const { addPreviousName } = await import("../src/core/rename.ts");
    expect(addPreviousName("# x\n", "old")).toBe("---\nprevious_names: [old]\n---\n# x\n");
    expect(addPreviousName("---\ntitle: T # kept\n---\nx\n", "old")).toBe("---\ntitle: T # kept\nprevious_names: [old]\n---\nx\n");
    expect(addPreviousName("---\nprevious_names: [a, \"b c\"]\n---\n", "old")).toBe("---\nprevious_names: [a, \"b c\", old]\n---\n");
    expect(addPreviousName("---\nprevious_names:\n  - a\ntags: [t]\n---\n", "old")).toBe("---\nprevious_names:\n  - a\n  - old\ntags: [t]\n---\n");
    expect(addPreviousName("---\nprevious_names: a\n---\n", "old")).toBe("---\nprevious_names: [a, old]\n---\n");
    expect(addPreviousName("---\nprevious_names: [old]\n---\n", "old")).toBe("---\nprevious_names: [old]\n---\n");
    expect(addPreviousName("﻿---\r\ntitle: T\r\n---\r\nx\r\n", "o:ld")).toBe('﻿---\r\ntitle: T\r\nprevious_names: ["o:ld"]\r\n---\r\nx\r\n');
  });
});

describe("undoing a rename (7.4)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-undo-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");
  /** Every file under a folder, by path, with its text (.slipbox/ left out). */
  const snapshot = (dir: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (rel: string) => {
      for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (r === ".slipbox") continue;
        if (e.isDirectory()) {
          out[`${r}/`] = "";
          walk(r);
        } else out[r] = readFileSync(join(dir, r), "utf8");
      }
    };
    walk("");
    return out;
  };

  test("a note's rename taken back: every file as it was, byte for byte, the folders it made gone; previewed first", async () => {
    const dir = vault({
      "notes/plan.md": "---\ntitle: Plan\n---\n# Plan\n\nUp: [home](../index.md) and [index](../index.md).\n",
      "index.md": "# Index\n\n[plan](notes/plan.md) and [p](notes/plan.md) 🔭 [the plan](notes/plan.md#plan)\n",
      "other.md": "untouched [index](index.md)\n",
    });
    const before = snapshot(dir);
    expect((await cli(["mv", "plan", "archive/2026/roadmap"], dir)).code).toBe(0);
    expect(existsSync(join(dir, "archive", "2026", "roadmap.md"))).toBe(true);
    // The preview: the rename's lines, the other way; nothing written.
    const dry = await cli(["undo", "--dry-run"], dir);
    expect(dry.json.data).toMatchObject({ kind: "note", from: "archive/2026/roadmap.md", to: "notes/plan.md", dryRun: true, undo: { at: expect.any(String) } });
    expect(dry.json.data.files.find((f: { path: string }) => f.path === "index.md").edits[0]).toMatchObject({ line: 3, before: "[plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) 🔭 [the plan](archive/2026/roadmap.md#plan)", after: "[plan](notes/plan.md) and [p](notes/plan.md) 🔭 [the plan](notes/plan.md#plan)" });
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    const done = await cli(["undo"], dir);
    expect(done.code).toBe(0);
    expect(snapshot(dir)).toEqual(before); // its previous name, the moved links, the folders it made: all gone
    // The index follows: it's where it was, and a link to it reaches it again, not by a redirect.
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).json.data).toMatchObject({ status: "resolved", path: "notes/plan.md" });
    // Taken back, it's out of the log: nothing more to undo.
    const none = await cli(["undo"], dir);
    expect(none.code).toBe(3);
    expect(none.json.error.message).toContain("nothing to undo");
  });

  test("newest first: a folder's move, then a note's rename, then the move; a file changed since stops it, and it waits", async () => {
    const dir = vault({ "a/one.md": "# One\n\n[two](two.md)\n", "a/two.md": "# Two\n", "index.md": "[x](a/one.md) [y](a/two.md)\n" });
    const before = snapshot(dir);
    await cli(["mv", "a", "b"], dir);
    await cli(["mv", "b/two", "b/deux"], dir);
    const mid = snapshot(dir);
    expect(mid["index.md"]).toBe("[x](b/one.md) [y](b/deux.md)\n");
    // Changed since: refused, nothing written, the rename still next.
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [y](b/deux.md) edited\n");
    const refused = await cli(["undo"], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toBe("index.md has changed since: the rename of b/two.md can't be undone");
    expect(existsSync(join(dir, "b", "deux.md"))).toBe(true);
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [y](b/deux.md)\n");
    await cli(["undo"], dir);
    expect(read(dir, "index.md")).toBe("[x](b/one.md) [y](b/two.md)\n");
    expect(read(dir, "b/one.md")).toBe("# One\n\n[two](two.md)\n");
    const back = await cli(["undo"], dir);
    expect(back.json.data).toMatchObject({ kind: "folder", from: "b", to: "a", dryRun: false });
    expect(snapshot(dir)).toEqual(before);
  });

  test("a vault's rename taken back: its name; a relink too", async () => {
    const one = vault({ "n.md": "# N\n" });
    const two = vault({ "x.md": `[n](../${basename(one)}/n.md)\n` });
    await cli(["init", one, "--name", "undo-one"], one);
    await cli(["init", two, "--name", "undo-two"], two);
    await cli(["ls"], two); // its index: the links into undo-one
    const cfg = read(one, ".slipbox/config.toml");
    await cli(["rename-vault", "undo-uno"], one);
    const r = await cli(["undo"], one);
    expect(r.json.data).toMatchObject({ kind: "vault", from: "undo-uno", to: "undo-one" });
    expect(read(two, "x.md")).toBe(`[n](../${basename(one)}/n.md)\n`);
    expect(read(one, ".slipbox/config.toml")).toBe(cfg);
    // The machine's list has its name back at once, as seen from another vault.
    expect((await cli(["vaults"], two)).json.data.find((v: { path: string }) => v.path === one)).toMatchObject({ name: "undo-one" });
    // A relink: the moved note's old paths back as they were written.
    const dir = vault({ "notes/plan.md": "# Plan\n", "i.md": "[p](notes/plan.md) and [x](notes/plan.md#plan)\n" });
    await cli(["ls"], dir);
    renameSync(join(dir, "notes", "plan.md"), join(dir, "plan.md"));
    await cli(["relink"], dir);
    expect(read(dir, "i.md")).toBe("[p](plan.md) and [x](plan.md#plan)\n");
    expect((await cli(["undo"], dir)).json.data.kind).toBe("relink");
    expect(read(dir, "i.md")).toBe("[p](notes/plan.md) and [x](notes/plan.md#plan)\n");
  });
});

describe("path links, as other tools write them (17.16)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  // A home folder of its own, so `~/` means something known.
  const base = mkdtempSync(join(tmpdir(), "slipbox-paths-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const before = process.env.HOME;
  const withHome = async <T>(f: () => Promise<T>): Promise<T> => {
    process.env.HOME = base;
    try {
      return await f();
    } finally {
      process.env.HOME = before;
    }
  };
  const write = (abs: string, text: string) => {
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, text);
  };
  write(join(notes, "todo.md"), "# Todo\n");
  write(join(notes, "index.md"), [
    "[rel](../app/design.md) [goals](../app/design.md#goals) ![pic](../app/pic.png)",
    "[home](~/app/design.md)",
    `[abs](${app}/design.md)`,
    `[url](file://${app}/design.md#goals)`,
    `[inside](${notes}/todo.md) [iu](file://${notes}/todo.md)`,
    "[spaced](<../app/my design.md>) [encoded](../app/my%20design.md)",
    "",
  ].join("\n\n"));
  write(join(app, "design.md"), "# Design\n\n## Goals\n");
  write(join(app, "my design.md"), "# Spaced\n");
  write(join(app, "pic.png"), "png");
  write(join(app, "links.md"), `[r](../notes/todo.md) [t](~/notes/todo.md) [u](file://${notes}/todo.md)\n`);
  const ready = withHome(async () => {
    await cli(["init", notes, "--name", "pnotes"], notes);
    await cli(["init", app, "--name", "papp"], app);
    await cli(["ls"], app);
  });

  test("relative out of the root, ~/, absolute and file:// all reach the file; inside the vault, its note", async () => {
    await ready;
    const links = await withHome(async () => (await cli(["links", "index"], notes)).json.data);
    const at = (target: string) => links.find((l: { target: string }) => l.target === target);
    for (const t of ["../app/design.md", "../app/design.md#goals", "~/app/design.md", `${app}/design.md`, `file://${app}/design.md#goals`]) {
      expect(at(t)).toMatchObject({ status: "note", path: join(app, "design.md"), vault: "papp" });
    }
    expect(at("../app/pic.png")).toMatchObject({ status: "file", path: join(app, "pic.png") });
    for (const t of [`${notes}/todo.md`, `file://${notes}/todo.md`]) expect(at(t)).toMatchObject({ status: "note", path: "todo.md" });
    expect(at("../app/my design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    expect(at("../app/my%20design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    // resolve takes them too: a file:// URL is a file, not a web page.
    const r = await withHome(() => cli(["resolve", `file://${app}/design.md`], notes));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md") });
    expect((await withHome(() => cli(["resolve", `[x](file://${app}/design.md#goals)`], notes))).json.data.abs).toBe(join(app, "design.md"));
  });

  test("backlinks: this vault's absolute links, and another vault's path links in every form", async () => {
    await ready;
    const bl = await withHome(async () => (await cli(["backlinks", "todo"], notes)).json.data.backlinks);
    expect(bl.filter((b: { from: string }) => b.from === "index.md")).toHaveLength(2);
    expect(bl.filter((b: { vault: string | null }) => b.vault === "papp").map((b: { target: string }) => b.target).sort()).toEqual(["../notes/todo.md", `file://${notes}/todo.md`, "~/notes/todo.md"].sort());
  });

  test("a rename keeps each path link in its form: absolute, ~/, file://, relative, encoded", async () => {
    await ready;
    await withHome(() => cli(["ls"], app));
    const r = await withHome(() => cli(["mv", "todo", "tasks"], notes));
    expect(r.code).toBe(0);
    const index = readFileSync(join(notes, "index.md"), "utf8");
    expect(index).toContain(`[inside](${notes}/tasks.md) [iu](file://${notes}/tasks.md)`);
    expect(readFileSync(join(app, "links.md"), "utf8")).toBe(`[r](../notes/tasks.md) [t](~/notes/tasks.md) [u](file://${notes}/tasks.md)\n`);
    // In the other vault: the spaced note renamed, each link keeps its encoding.
    await withHome(() => cli(["ls"], notes));
    await withHome(() => cli(["mv", "my design", "your design"], app));
    expect(readFileSync(join(notes, "index.md"), "utf8")).toContain("[spaced](<../app/your design.md>) [encoded](../app/your%20design.md)");
  });
});

describe("nested vaults, known to each other without being opened (17.17)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return { io: { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env }, out };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  const parent = mkdtempSync(join(tmpdir(), "slipbox-nest-parent-"));
  const kid = join(parent, "kid");
  const files: Record<string, string> = {
    ".slipbox/config.toml": '[vault]\nid = "dparent00000001"\nname = "dparent"\n',
    "index.md": "# Index\n\n[k](kid/note.md) and [n](kid/note.md#note)\n",
    "kid/.slipbox/config.toml": '[vault]\nid = "dkid0000000001"\nname = "dkid"\n',
    "kid/note.md": "# Note\n\nUp: [index](../index.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(parent, rel, ".."), { recursive: true });
    writeFileSync(join(parent, rel), text);
  }

  test("a vault nested in this one: by a path into it — never opened on this machine", async () => {
    const links = (await cli(["links", "index"], parent)).json.data;
    for (const l of links) expect(l).toMatchObject({ status: "note", path: join(kid, "note.md"), vault: "dkid" });
    // …and its links count as backlinks here: indexed when found.
    const bl = (await cli(["backlinks", "index"], parent)).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(kid, "note.md"), vault: "dkid" }));
  });

  test("from inside, the vault it sits in is named by vault:path, once known (20.20); never by [[name:…]] (20.22)", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-nest-up-"));
    cpSync(parent, fresh, { recursive: true });
    writeFileSync(join(fresh, ".slipbox", "config.toml"), '[vault]\nid = "dparent00000002"\nname = "dparent2"\n');
    writeFileSync(join(fresh, "kid", ".slipbox", "config.toml"), '[vault]\nid = "dkid0000000002"\nname = "dkid2"\n');
    await cli(["ls"], fresh); // opened once: known on this machine
    const r = await cli(["resolve", "dparent2:index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(fresh, "index.md"), vault: "dparent2", href: "../index.md" });
    expect((await cli(["resolve", "[[dparent2:index]]"], join(fresh, "kid"))).code).toBe(3);
  });

  test("a second copy (a second clone): each one's names mean its own nested vault, and its links stay its own", async () => {
    const second = mkdtempSync(join(tmpdir(), "slipbox-nest-copy-"));
    cpSync(parent, second, { recursive: true });
    // Its nested vault not yet recorded, the first one's is, by the same name: its own still meant.
    const first = (await cli(["links", "index"], second)).json.data;
    expect(first[0]).toMatchObject({ status: "note", path: join(second, "kid", "note.md") });
    for (const root of [parent, second]) await cli(["backlinks", "index"], root); // each indexed, as when opened
    for (const [root, other] of [[parent, second], [second, parent]] as const) {
      const links = (await cli(["links", "index"], root)).json.data;
      // Two copies of dkid on this machine: each shown with its folder (20.6).
      for (const l of links) expect(l).toMatchObject({ status: "note", path: join(root, "kid", "note.md"), vault: `${basename(root)}.dkid` });
      // Each copy of dparent by the name it's shown with (20.6): the one meant, never a guess between them.
      const up = await cli(["resolve", `${basename(root)}.dparent:index.md`], join(root, "kid"));
      expect(up.json.data).toMatchObject({ status: "resolved", abs: join(root, "index.md") });
      const both = await cli(["resolve", "dparent:index.md"], join(root, "kid"));
      expect(both.code).toBe(4);
      expect(both.json.data.candidates).toEqual([`${basename(parent)}.dparent:index.md`, `${basename(second)}.dparent:index.md`].sort());
      expect((await cli(["read", "dparent:index.md"], join(root, "kid"))).code).toBe(4);
      // The other copy's links to its own nested vault aren't backlinks here.
      const bl = (await cli(["backlinks", "note"], join(root, "kid"))).json.data.backlinks;
      expect(bl.map((b: { from: string }) => b.from)).toContain(join(root, "index.md"));
      expect(bl.map((b: { from: string }) => b.from)).not.toContain(join(other, "index.md"));
    }
  });
});

describe("moving a folder (18.3)", () => {
  test("links between notes that move together stay; links out of it and into it are fixed; everything in it moves", async () => {
    const { openGraph: open } = await import("../src/core/graph.ts");
    const { planFolderMove, applyPlan } = await import("../src/core/rename.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-foldermove-"));
    const files: Record<string, string> = {
      "a/one.md": "# One\n\n[two](two.md) [2](two.md#two) [sub](sub/three.md) [out](../b/four.md) [4](../b/four.md#four)\n",
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
    expect(read("x/y/one.md")).toBe("# One\n\n[two](two.md) [2](two.md#two) [sub](sub/three.md) [out](../../b/four.md) [4](../../b/four.md#four)\n");
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
});

describe("moving a vault's folder (18.7)", () => {
  test("links into it by path are fixed, from its parent and other vaults; its links out too", async () => {
    const { planVaultFolderMove, applyPlan } = await import("../src/core/rename.ts");
    const { openVault } = await import("../src/core/reach.ts");
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
    expect(plan.vaults!.map(([, to]) => to)).toEqual([join(parent, "shelf", "box"), join(parent, "shelf", "box", "kid")]);
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

describe("a folder made a vault, and a vault made a plain folder again (18.11)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const base = mkdtempSync(join(tmpdir(), "slipbox-make-"));
  const parent = join(base, "parent");
  const other = join(base, "other");
  const files: Record<string, string> = {
    "parent/.slipbox/config.toml": '[vault]\nid = "mkparent000001"\nname = "mkparent"\n',
    "parent/home.md": "# Home\n\n[a](proj/alpha.md) [g](proj/deep/gamma.md) [b](proj/beta.md) [b2](proj/beta.md#beta) ![p](proj/pic.png)\n",
    "parent/proj/alpha.md": "# Alpha\n\n[h](../home.md) [b](beta.md) [b2](./beta.md#beta) [g](deep/gamma.md)\n",
    "parent/proj/beta.md": "# Beta\n\n[a](alpha.md)\n",
    "parent/proj/deep/gamma.md": "# Gamma\n\n[up](../alpha.md)\n",
    "parent/proj/pic.png": "png",
    "other/.slipbox/config.toml": '[vault]\nid = "mkother000001"\nname = "mkother"\n',
    "other/index.md": "# Other\n\n[a](../parent/proj/alpha.md) [h](../parent/home.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  const read = (rel: string) => readFileSync(join(base, rel), "utf8");
  /** Every link's file, from each linking file, as absolute paths: what resolves, wherever it's indexed. */
  const reached = async (roots: string[]) => {
    const out: Record<string, string[]> = {};
    for (const root of roots) {
      for (const l of (await cli(["links", "--all"], root)).json.data as { from: string; status: string; path: string | null }[]) {
        const from = join(root, l.from);
        if (l.status !== "note" && l.status !== "file") continue;
        (out[from] ??= []).push(l.path!.startsWith("/") ? l.path! : join(root, l.path!));
      }
    }
    for (const k of Object.keys(out)) out[k]!.sort();
    return out;
  };

  test("made a vault: path links across it are left, and reach the same; made a folder again: it all reaches the same", async () => {
    await cli(["backlinks", "index"], other); // indexed and known, as when opened
    await cli(["links", "home"], parent);
    const texts = Object.fromEntries(Object.keys(files).map((rel) => [rel, read(rel)]));
    const before = await reached([parent]);
    const dry = (await cli(["init", "proj", "--name", "mkproj", "--dry-run"], parent)).json;
    expect(dry.data).toMatchObject({ kind: "make-vault", from: "proj", to: "mkproj", dryRun: true });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    const made = (await cli(["init", "proj", "--name", "mkproj"], parent)).json;
    expect(made.ok).toBe(true);
    expect(existsSync(join(parent, "proj", ".slipbox", "config.toml"))).toBe(true);
    // Into it, out of it, within it, from another vault: relative paths reach across as they are.
    for (const rel of Object.keys(files)) expect([rel, read(rel)]).toEqual([rel, texts[rel]!]);
    // Everything that resolved still does, to the same file.
    expect(await reached([parent, join(parent, "proj")])).toEqual(before);

    // Back: a plain folder again, nothing to rewrite either.
    const back = (await cli(["deinit", "proj"], parent)).json;
    expect(back.data).toMatchObject({ kind: "unmake-vault", from: "proj", to: "mkparent", dryRun: false });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    for (const rel of Object.keys(files)) expect([rel, read(rel)]).toEqual([rel, texts[rel]!]);
    expect(await reached([parent])).toEqual(before);
    // The machine forgot it; its .slipbox/ is in the parent's trash, restorable.
    expect((await cli(["vaults"], parent)).json.data.some((v: { name: string }) => v.name === "mkproj")).toBe(false);
    expect((await cli(["trash"], parent)).json.data[0]).toMatchObject({ shown: "proj/.slipbox", dir: true });
    // Refused: a folder that's already a vault; a vault not nested in another.
    expect((await cli(["deinit", "proj"], parent)).code).toBe(5);
    expect((await cli(["deinit", "."], other)).code).toBe(5);
    // And a git checkout (20.3): a vault by itself, with .slipbox/ or without — nothing changes.
    mkdirSync(join(parent, "proj", ".git"));
    const repo = (await cli(["deinit", "proj"], parent)).json;
    expect(repo.error.message).toContain("has no .slipbox/ to take away (it's a root by its .git)");
    await cli(["init", "proj", "--name", "mkrepo"], parent);
    const both = (await cli(["deinit", "proj"], parent)).json;
    expect(both.error.message).toContain("proj is a root by its .git too: it stays one, with or without .slipbox/");
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(true);
  });
});

describe("tags (1.6)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const dir = mkdtempSync(join(tmpdir(), "slipbox-tags-"));
  mkdirSync(join(dir, ".slipbox"));
  writeFileSync(join(dir, "a.md"), "---\ntags: [Project, x]\n---\n# A\n\n#project/alpha and #idea\n");
  writeFileSync(join(dir, "b.md"), "# B\n\n#Project/Alpha, #idea `#not-in-code`\n");
  writeFileSync(join(dir, "c.md"), "# C\n\n#other\n");

  test("every tag with its count — one tag whatever its case, a nested one counted under its parent too", async () => {
    expect((await cli(["tags"], dir)).json.data).toEqual([
      { tag: "idea", count: 2 },
      { tag: "other", count: 1 },
      { tag: "Project", count: 2 },
      { tag: "project/alpha", count: 2 },
      { tag: "x", count: 1 },
    ]);
    expect((await cli(["tags", "project"], dir)).json.data).toEqual({ tag: "Project", notes: ["a.md", "b.md"] });
    expect((await cli(["tags", "#Project/Alpha"], dir)).json.data.notes).toEqual(["a.md", "b.md"]);
    expect((await cli(["tags", "nope"], dir)).code).toBe(3);
    // A note's own list: the frontmatter's and the text's, each once.
    expect((await cli(["stat", "a"], dir)).json.data.tags).toEqual(["Project", "x", "project/alpha", "idea"]);
    // An edit shows at once.
    await cli(["write", "c", "# C\n\n#other #idea\n"], dir);
    expect((await cli(["tags", "idea"], dir)).json.data.notes).toEqual(["a.md", "b.md", "c.md"]);
  });
});

describe("the context bundle (9.7)", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-context-"));
    mkdirSync(join(dir, ".slipbox"));
    const files: Record<string, string> = {
      "a.md": "# A\n\n[b](b.md), [c](c.md), [code](s.ts), ![p](pic.png), [missing](missing.md), [log](big.log) and [b](b.md) again.\n",
      "b.md": "# B\n\n```js\nlet x;\n```\n\nOn to [d](d.md).\n",
      "c.md": "# C\n",
      "d.md": "# D\n\nDeep.\n",
      "e.md": "Back to [a](a.md).\n",
      "f.md": "[a](a.md) and [a](a.md#a)\n",
      "ab.json": '{"see": "a.md"}\n', // a data file's link: listed after the notes', and sorted in by path
      "s.ts": "export const s = 1;\n",
      "pic.png": "png",
      "big.log": "x".repeat(300 * 1024),
      "unrelated.md": "# U\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
  };
  const paths = (b: { items: { path: string; why: string }[] }) => b.items.map((i) => `${i.why}:${i.path}`);

  test("breadth first: the note, what it links to in the order written, then what links to it; a file's text, never a picture's or a dump's", async () => {
    const { buildContext } = await import("../src/core/context.ts");
    const g = setup();
    const b = buildContext(g, ["a.md"], { depth: 1, backlinks: true, limit: 25 });
    expect(paths(b)).toEqual(["start:a.md", "link:b.md", "link:c.md", "link:s.ts", "backlink:ab.json", "backlink:e.md", "backlink:f.md"]);
    expect(b.left).toEqual([
      { path: "pic.png", why: "link", from: "a.md", reason: "binary" },
      { path: "big.log", why: "link", from: "a.md", reason: "size" },
    ]);
    expect(b.items[1]).toMatchObject({ depth: 1, from: "a.md", lines: 7 });
    // Written as the scratch is: each file's reference and why, its text fenced (longer than a fence inside it).
    expect(b.text).toStartWith("# Context: a.md\n\nThe note, 3 files it links to and 3 files linking to it: each with its path and lines, fenced as it is on disk.\n\n## a.md\n\n`a.md:1-3` — asked for\n\n```markdown\n# A\n");
    expect(b.text).toContain("## b.md\n\n`b.md:1-7` — linked from a.md\n\n````markdown\n# B\n\n```js\nlet x;\n```\n\nOn to [d](d.md).\n````\n");
    expect(b.text).toContain("## s.ts\n\n`s.ts:1` — linked from a.md\n\n```typescript\nexport const s = 1;\n```\n");
    expect(b.text).toContain("## e.md\n\n`e.md:1` — links to a.md\n");
    expect(b.text).toEndWith("## Left out\n\n- `pic.png` — linked from a.md: not text\n- `big.log` — linked from a.md: too large\n");
    expect(b.text).not.toContain("unrelated");
  });

  test("deeper, none, no backlinks, a limit: what's past it named, not included", async () => {
    const { buildContext } = await import("../src/core/context.ts");
    const g = setup();
    expect(paths(buildContext(g, ["a.md"], { depth: 2, backlinks: true, limit: 25 }))).toEqual(["start:a.md", "link:b.md", "link:c.md", "link:s.ts", "backlink:ab.json", "backlink:e.md", "backlink:f.md", "link:d.md"]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: false, limit: 25 }))).toEqual(["start:a.md"]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: true, limit: 25 }))).toEqual(["start:a.md", "backlink:ab.json", "backlink:e.md", "backlink:f.md"]);
    const two = buildContext(g, ["a.md", "d.md"], { depth: 1, backlinks: false, limit: 3 });
    expect(paths(two)).toEqual(["start:a.md", "start:d.md", "link:b.md"]);
    expect(two.left.map((l) => `${l.reason}:${l.path}`)).toEqual(["limit:c.md", "limit:s.ts", "binary:pic.png", "size:big.log"]);
    expect(two.text).toStartWith("# Context: a.md, d.md\n\nThe notes, 1 file they link to:");
    expect(two.text).toContain("- `c.md` — linked from a.md: past the limit of 3\n");
    // A long list of what's left out: the first 20 named, the rest counted.
    writeFileSync(join(g.root, "hub.md"), Array.from({ length: 25 }, (_, i) => `[n${i}](n${i}.md)`).join("\n"));
    for (let i = 0; i < 25; i++) writeFileSync(join(g.root, `n${i}.md`), `# ${i}\n`);
    const hub = buildContext(openGraph(locateVault({ root: g.root }), DEFAULT_CONFIG, true), ["hub.md"], { depth: 1, backlinks: false, limit: 1 });
    expect(hub.left).toHaveLength(25);
    expect(hub.text).toContain("- `n19.md` — linked from hub.md: past the limit of 1\n- and 5 more\n");
    expect(hub.text).not.toContain("`n20.md`");
  });
});

describe("search: the index and the scan (6.x)", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-"));
    mkdirSync(join(dir, ".slipbox"));
    const files: Record<string, string> = {
      "dome.md": "---\ntitle: Dome refit\naliases: [Shutter work]\ntags: [dome/shutter, budget]\n---\n# Dome refit\n\nThe summer shutdown.\n\n## Parts\n\nNew rollers for the shutter belt.\n\n```\n# not a heading\nshutter in code\n```\n",
      "log.md": "# Night log\n\nOpened the dome at 21:10.\nThe shutter stuck once.\n\nCalibration\n===========\n\nFlats at dusk. #calibration\n",
      "notes/café.md": "# Café\n\nThe naïve résumé was at the café.\n",
      "notes/plan.md": "+++\ntitle = \"Plan\"\ntags = [\"planning\"]\n+++\n\nPhotometry pipeline plans; calibrating everything.\n",
      "data.toml": "name = \"observatory\"\nshutter_speed = 3\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };

  test("what a note gives the index: sections at headings (not in code), its frontmatter's title, aliases and tags, inline tags", async () => {
    const { indexDoc } = await import("../src/core/search.ts");
    const d = indexDoc("dome.md", readFileSync(join(setup().dir, "dome.md"), "utf8"), "note");
    expect(d).toMatchObject({ title: "Dome refit", aliases: ["Shutter work"], tags: ["dome/shutter", "budget"] });
    expect(d.headings).toEqual([
      { line: 6, text: "Dome refit" },
      { line: 10, text: "Parts" },
    ]); // `# not a heading` is in a fence
    // A short note: every section under the band, merged up into the root (19.x, scout's Stage 4).
    expect(d.sections.map((x) => [x.name, x.line, x.end])).toEqual([["§:file", 1, 17]]);
    expect(d.sections[0]!.lines.map((l) => l.text)).toContain("shutter in code");
    const log = indexDoc("log.md", "# Night log\n\ntext\n\nCalibration\n===========\n\nFlats. #calibration #dome/flat\n", "note");
    expect(log.headings).toEqual([
      { line: 1, text: "Night log" },
      { line: 5, text: "Calibration" },
    ]);
    expect(log.tags).toEqual(["calibration", "dome/flat"]);
    expect(indexDoc("x/untitled.md", "just text\n", "note").title).toBe("untitled");
    expect(indexDoc("plan.md", '+++\ntitle = "Plan"\n+++\n', "note").title).toBe("Plan");
    // A data file with no blank lines: one unit, one section (under the band's top).
    expect(indexDoc("big.csv", Array.from({ length: 200 }, (_, i) => `row ${i}`).join("\n"), "data").sections.map((x) => [x.name, x.line, x.end])).toEqual([["§:file", 1, 200]]);
  });

  test("the query: words, phrases, prefix*, -not, title:, #tag, tag:, path: — nothing passed on as FTS5 syntax", async () => {
    const { ftsMatch, parseQuery } = await import("../src/core/search.ts");
    const q = parseQuery('dome "shutter belt" roll* -summer title:refit #budget tag:dome path:notes/ " AND ( NEAR');
    expect(q.tags).toEqual(["budget", "dome"]);
    expect(q.paths).toEqual(["notes/"]);
    expect(q.terms.map((t) => [t.text, t.phrase, t.prefix, t.not, t.title])).toEqual([
      ["dome", false, false, false, false],
      ["shutter belt", true, false, false, false],
      ["roll", false, true, false, false],
      ["summer", false, false, true, false],
      ["refit", false, false, false, true],
      [" AND ( NEAR", true, false, false, false],
    ]);
    expect(ftsMatch(q)).toBe('("dome" AND "shutter belt" AND "roll"* AND {title aliases} : "refit" AND " AND ( NEAR") NOT "summer"');
    expect(ftsMatch(parseQuery("a b"), true)).toBe('("a" OR "b")');
    expect(ftsMatch(parseQuery("-only")), "nothing to look for").toBeNull();
    expect(parseQuery('say "hi" again').terms.map((t) => t.text)).toEqual(["say", "hi", "again"]);
  });

  test("ranked by the index: the title first; every word, else some of them; -not, #tag, path:, prefix, accents folded", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const { g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    expect(idx.complete).toBe(false);
    expect(catchUp(g, idx)).toEqual({ indexed: 5, removed: 0 });
    expect(idx.complete).toBe(true);
    const paths = (q: string) => search(g, idx, q).hits.map((h) => h.path);
    expect(paths("shutter")[0]).toBe("dome.md"); // its aliases and tags say it, and its text
    expect(paths("shutter").sort()).toEqual(["data.toml", "dome.md", "log.md"]);
    const hit = search(g, idx, "shutter stuck").hits[0]!;
    expect(hit).toMatchObject({ path: "log.md", line: 4, column: 5, heading: "Night log" });
    expect(hit.snippet.slice(hit.marks[0]![0], hit.marks[0]![1])).toBe("shutter");
    // Every word in the note, wherever: log.md has them in two sections. It opens at the first.
    expect(search(g, idx, "shutter dusk")).toMatchObject({ relaxed: false, hits: [{ path: "log.md", line: 4, more: 1 }] });
    expect(search(g, idx, "belt stuck")).toMatchObject({ relaxed: true });
    expect(paths("shutter -stuck")).toEqual(["dome.md", "data.toml"]);
    expect(paths("shutter #budget")).toEqual(["dome.md"]);
    expect(paths("#dome")).toEqual(["dome.md"]); // a nested tag counts for its parent
    expect(paths("path:notes/")).toEqual(["notes/café.md", "notes/plan.md"]);
    expect(paths("calibrat*")).toEqual(expect.arrayContaining(["log.md", "notes/plan.md"]));
    expect(paths("naive resume")).toEqual(["notes/café.md"]);
    expect(search(g, idx, "naive resume").hits[0]).toMatchObject({ line: 3, column: 5 });
    expect(paths("title:refit")).toEqual(["dome.md"]);
    expect(paths("zzz")).toEqual([]);
    idx.close();
  });

  test("the scan answers the same query the same way, before there's an index", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const { g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const q of ["shutter", "shutter stuck", "belt stuck", "shutter -stuck", "shutter #budget", "#dome", "path:notes/", "calibrat*", "naive resume", "title:refit", "zzz"]) {
      const a = search(g, idx, q);
      const b = search(g, null, q);
      expect(b.engine).toBe("scan");
      expect([...b.hits.map((h) => h.path)].sort()).toEqual([...a.hits.map((h) => h.path)].sort());
      expect(b.relaxed).toBe(a.relaxed);
    }
    // Where one section alone has the words, both land on its line.
    expect(search(g, null, "shutter stuck").hits[0]).toMatchObject({ path: "log.md", line: 4, column: 5 });
    expect(search(g, null, "naive resume").hits[0]).toMatchObject({ path: "notes/café.md", line: 3, column: 5 });
    // Unsaved text (the TUI's) is what the scan reads, when given.
    expect(search(g, null, "zebra", { texts: new Map([["log.md", "# Night log\n\na zebra\n"]]) }).hits.map((h) => h.path)).toEqual(["log.md"]);
    idx.close();
  });

  test("kept up to date: a change, a new file, one gone, a move — at the next catch-up, or as the vault's feed says", async () => {
    const { catchUp, indexFile, search, SearchIndex } = await import("../src/core/search.ts");
    const { dir, g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    const paths = (q: string) => search(g, idx, q).hits.map((h) => h.path);
    // Changed on disk while nothing listened (an agent, git): the next catch-up, by size and mtime.
    writeFileSync(join(dir, "log.md"), "# Night log\n\nA zebra crossed.\n");
    writeFileSync(join(dir, "new.md"), "# New\n\nanother zebra\n");
    rmSync(join(dir, "notes", "plan.md"));
    const again = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(catchUp(again, idx)).toEqual({ indexed: 2, removed: 1 });
    expect(search(again, idx, "zebra").hits.map((h) => h.path).sort()).toEqual(["log.md", "new.md"]);
    expect(search(again, idx, "photometry").hits).toEqual([]);
    // The feed: every change the graph hears of, said once — here, a rename's.
    const heard: unknown[] = [];
    const stop = again.onChange((c) => {
      heard.push(c);
      if (c.kind !== "moved") indexFile(again, idx, c.path);
    });
    const { applyPlan, planNoteRename } = await import("../src/core/rename.ts");
    applyPlan(again, planNoteRename(again, "new.md", "fresh"));
    stop();
    expect(heard).toEqual(expect.arrayContaining([{ kind: "moved", from: "new.md", to: "fresh.md" }, { kind: "removed", path: "new.md" }, { kind: "changed", path: "fresh.md" }]));
    expect(search(again, idx, "another zebra").hits.map((h) => h.path)).toEqual(["fresh.md"]);
    expect(paths("zebra").sort()).toEqual(["fresh.md", "log.md"]);
    idx.close();
  });

  test("words are whole words (a prefix* aside), both engines; a hit opens at the section with most of them", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const { dir, g: first } = setup();
    writeFileSync(join(dir, "words.md"), "# Words\n\nThe catalogue, and blogging.\n");
    writeFileSync(join(dir, "two.md"), "# Two\n\nalpha only\n\n## Both\n\nalpha and beta here\n");
    const g = openGraph(first.loc, DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const engine of [idx, null]) {
      const paths = (q: string) => search(g, engine, q).hits.map((h) => h.path);
      expect(paths("cat")).toEqual([]); // not inside "catalogue"
      expect(paths("logging")).toEqual([]); // nor "blogging"
      expect(paths("cat*")).toEqual(["words.md"]);
      expect(search(g, engine, "alpha beta").hits[0]).toMatchObject({ path: "two.md", line: 7, heading: "Both", more: 1 });
    }
    idx.close();
  });

  test("an index of another version, or one SQLite can't read, is made again; a new one is built before it's used", async () => {
    const { SearchIndex } = await import("../src/core/search.ts");
    const { cacheDir } = await import("../src/core/paths.ts");
    const { g } = setup();
    mkdirSync(cacheDir(g.loc), { recursive: true });
    writeFileSync(join(cacheDir(g.loc), "search.db"), "not a database, just bytes ".repeat(100));
    const idx = SearchIndex.open(g.loc)!;
    expect(idx).not.toBeNull();
    expect(idx.stats()).toEqual({ files: 0 });
    expect(idx.complete).toBe(false);
    idx.db.pragma("user_version = 99");
    idx.close();
    const fresh = SearchIndex.open(g.loc)!;
    expect(fresh.db.pragma("user_version", { simple: true })).toBe(3);
    // better-sqlite3's own SQLite, bundled, whatever the host has (FTS5 in it).
    expect(fresh.db.prepare("select sqlite_version() as v").get()).toEqual({ v: "3.53.4" });
    fresh.close();
  });

  test("the CLI: a scan until `slipbox index`, then the index, kept current; [search] engine = \"scan\" never uses one", async () => {
    const { dir } = setup();
    const out = async (args: string[]) => {
      const o: string[] = [];
      const code = await runCli([...args, "--json"], { out: (x: string) => o.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
      return { code, json: JSON.parse(o.join("")) };
    };
    const first = await out(["search", "shutter", "stuck"]);
    expect(first.json.data).toMatchObject({ engine: "scan", relaxed: false, hits: [{ path: "log.md", line: 4 }] });
    expect(first.json.warnings.join()).toContain("no search index yet");
    expect((await out(["index"])).json.data).toMatchObject({ indexed: 5, removed: 0, files: 5, rebuilt: false });
    expect((await out(["search", "shutter", "stuck"])).json.data).toMatchObject({ engine: "index", hits: [{ path: "log.md", line: 4 }] });
    writeFileSync(join(dir, "log.md"), "# Night log\n\nno more\n");
    expect((await out(["search", "stuck"])).json.data.hits).toEqual([]); // caught up first
    expect((await out(["index", "--rebuild"])).json.data).toMatchObject({ indexed: 5, rebuilt: true });
    expect((await out(["info"])).json.data.search).toEqual({ engine: "auto", index: { files: 5, complete: true } });
    expect((await out(["search"])).code).toBe(2);
    expect((await out(["search", "x", "--limit", "0"])).code).toBe(2);
    const cfg = join(dir, "..", `${basename(dir)}-scan.toml`);
    writeFileSync(cfg, '[search]\nengine = "scan"\n');
    expect((await out(["search", "shutter", "--config", cfg])).json.data.engine).toBe("scan");
  });
});

describe("git worktrees: separate vaults of one repository (17.19)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  /** project/x (a vault, its repository), project/y beside it, and x's worktree at project/worktrees/x/feat. */
  const layout = async (n: number) => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-wt-"));
    const x = join(base, "project", "x");
    const y = join(base, "project", "y");
    mkdirSync(join(x, "notes"), { recursive: true });
    mkdirSync(join(x, "src"), { recursive: true });
    mkdirSync(y, { recursive: true });
    writeFileSync(join(y, "plan.md"), "# Y's plan\n");
    writeFileSync(join(x, "notes", "a.md"), `# A\n\nSee [y's plan](../../y/plan.md) and [the code](../src/x.md).\n`);
    writeFileSync(join(x, "src", "x.md"), "# Code notes\n");
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return null; // no git here
    await cli(["init", x, "--name", `x${n}`], x);
    await cli(["init", y, "--name", `y${n}`], y);
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    const wt = join(base, "project", "worktrees", "x", "feat");
    if (git(x, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) return null;
    return { base, x, y, wt };
  };
  let n = 0;

  test("a worktree without .slipbox/ — the main checkout's kept private — reads the main's id and name, writing nothing (20.3)", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-wtpriv-"));
    const x = join(base, "x");
    mkdirSync(x);
    writeFileSync(join(x, "a.md"), `# A\n\n${base}\n`); // its own first commit
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    await cli(["init", x, "--name", `xpriv${++n}`, "--private"], x);
    const wt = join(base, "wt");
    if (git(x, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) return;
    expect(existsSync(join(wt, ".slipbox"))).toBe(false);
    const main = locateVault({ path: x });
    expect(locateVault({ path: join(wt, "a.md") })).toMatchObject({ mode: "vault", root: wt, id: main.id, name: main.name, worktree: { name: "wt" } });
    expect(existsSync(join(wt, ".slipbox"))).toBe(false);
  });

  test("read from .git: the main checkout, a worktree, its name and branch; a vault below the top folder too", async () => {
    const { checkoutOf, headOf, inMain } = await import("../src/core/git.ts");
    const l = await layout(++n);
    if (!l) return;
    expect(checkoutOf(l.x)).toEqual({ root: l.x, gitDir: join(l.x, ".git"), common: join(l.x, ".git"), main: l.x, worktree: null });
    const c = checkoutOf(join(l.wt, "notes"))!;
    expect(c).toMatchObject({ root: l.wt, main: l.x, worktree: "feat", common: join(l.x, ".git") });
    expect(headOf(c)).toMatchObject({ branch: "feat", commit: null });
    expect(headOf(checkoutOf(l.x)!).branch).toBe("main");
    expect(inMain(c, join(l.wt, "notes"))).toBe(join(l.x, "notes"));
    git(l.wt, "checkout", "-q", "--detach");
    expect(headOf(c)).toMatchObject({ branch: null, commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(checkoutOf(l.y)).toBeNull();
  });

  test("its own instance; moved by git (git worktree move), found again by git's name for it, nothing asked (20.5)", async () => {
    const l = await layout(++n);
    if (!l) return;
    const wt = locateVault({ root: l.wt });
    const main = locateVault({ root: l.x });
    expect(wt).toMatchObject({ name: `x${n}`, worktree: { name: "feat", checkout: l.wt, main: l.x, mainVault: l.x } });
    expect(wt.key).not.toBe(main.key);
    expect(wt.id).toBe(main.id);
    // The machine's list knows which is which.
    expect((await cli(["vaults"], l.x)).json.data.find((v: { path: string }) => v.path === l.wt)).toMatchObject({ key: wt.key, worktree: { name: "feat", main: l.x } });
    const elsewhere = join(l.base, "elsewhere", "feat");
    mkdirSync(dirname(elsewhere), { recursive: true });
    if (git(l.x, "worktree", "move", l.wt, elsewhere).exitCode !== 0) return;
    const there = locateVault({ root: elsewhere });
    expect(there.key).toBe(wt.key);
    expect(there.movedHere).toBeUndefined();
  });

  test("a worktree never writes the vault's identity: it takes the main checkout's (else its path keys it)", async () => {
    const l = await layout(++n);
    if (!l) return;
    // The branch was made before the vault had an id: the worktree's config has none.
    const cfg = join(l.wt, ".slipbox", "config.toml");
    writeFileSync(cfg, "# no identity on this branch yet\n");
    const loc = locateVault({ root: l.wt });
    expect(loc.id).toBe(locateVault({ root: l.x }).id);
    expect(loc.name).toBe(`x${n}`);
    expect(readFileSync(cfg, "utf8")).toBe("# no identity on this branch yet\n"); // untouched: nothing to merge
    // Neither has one: keyed by its path, still nothing written.
    writeFileSync(join(l.x, ".slipbox", "config.toml"), "# none here either\n");
    const bare = locateVault({ root: l.wt });
    expect(bare.id).toBeNull();
    expect(bare.key).toBe(loc.key); // its instance, by its path
    expect(readFileSync(cfg, "utf8")).toBe("# no identity on this branch yet\n");
  });

  test("links: x:path from elsewhere means the main checkout; out of the repository, a worktree's paths as the main's; its links aren't backlinks twice", async () => {
    const l = await layout(++n);
    if (!l) return;
    await cli(["ls"], l.wt); // the worktree seen, its index written
    await cli(["ls"], l.x);
    // Elsewhere: x:notes/a.md is the main checkout's note (20.20), not the worktree's — that's x@branch.
    writeFileSync(join(l.y, "back.md"), "# Back\n");
    const r = (await cli(["resolve", `x${n}:notes/a.md`, "--from", "back.md"], l.y)).json.data;
    expect(r).toMatchObject({ status: "resolved", abs: join(l.x, "notes", "a.md") });
    // In the worktree: ../../y/plan.md leaves the repository — as from the main checkout; ../src stays in the worktree.
    const links = (await cli(["links", "notes/a.md"], l.wt)).json.data;
    expect(links.map((x: { target: string; status: string; path: string }) => [x.target, x.status, x.path])).toEqual([
      ["../../y/plan.md", "note", join(l.y, "plan.md")],
      ["../src/x.md", "note", "src/x.md"],
    ]);
    // y's backlinks: the main checkout's links, not the worktree's copies of them.
    const back = (await cli(["backlinks", "plan.md"], l.y)).json.data.backlinks;
    expect(back.map((b: { from: string }) => b.from)).toEqual([join(l.x, "notes", "a.md")]);
  });

  test("a worktree gone: its cache removed at once, its state and entry a month after it was last seen", async () => {
    const { pruneWorktrees, readRegistry } = await import("../src/core/registry.ts");
    const { cacheDir, stateDir } = await import("../src/core/paths.ts");
    const l = await layout(++n);
    if (!l) return;
    await cli(["ls"], l.wt);
    const wt = locateVault({ root: l.wt });
    mkdirSync(stateDir(wt), { recursive: true });
    writeFileSync(join(stateDir(wt), "scratch.md"), "an agent's notes\n");
    expect(existsSync(cacheDir(wt))).toBe(true);
    git(l.x, "worktree", "remove", "--force", l.wt);
    recordLocation(locateVault({ root: l.x })); // any open prunes
    expect(existsSync(cacheDir(wt))).toBe(false);
    expect(readFileSync(join(stateDir(wt), "scratch.md"), "utf8")).toBe("an agent's notes\n");
    expect(readRegistry().some((v) => v.key === wt.key)).toBe(true);
    pruneWorktrees(Date.now() + 31 * 86_400_000);
    expect(existsSync(stateDir(wt))).toBe(false);
    expect(readRegistry().some((v) => v.key === wt.key)).toBe(false);
  });
});

describe("a branch switch (5.9)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const repo = async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-branch-"));
    writeFileSync(join(root, "a.md"), "# A\n\nA note long enough to be known again by its text alone.\n");
    writeFileSync(join(root, "index.md"), "[[a]]\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    await cli(["init", root], root);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };

  test("the index written on another branch: what one branch has and the other hasn't wasn't moved", async () => {
    const root = await repo();
    if (!root) return;
    git(root, "checkout", "-q", "-b", "feat");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "rename");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root); // the index, written on main
    git(root, "checkout", "-q", "feat"); // nothing ran meanwhile
    const g = openGraph(locateVault({ root }), DEFAULT_CONFIG, true);
    expect(g.notes.has("c.md")).toBe(true);
    expect(g.redirects!.follow("a.md")).toBeNull();
    // On one branch, the same thing is a move (17.12).
    await cli(["ls"], root); // the index, written on feat
    renameSync(join(root, "c.md"), join(root, "d.md"));
    expect(openGraph(locateVault({ root }), DEFAULT_CONFIG, true).redirects!.follow("c.md")).toBe("d.md");
  });

  test("undo is the branch's: a rename made on another is undone there, not here", async () => {
    const root = await repo();
    if (!root) return;
    git(root, "checkout", "-q", "-b", "feat");
    expect((await cli(["mv", "a", "b"], root)).code).toBe(0);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "renamed on feat");
    git(root, "checkout", "-q", "main");
    const here = await cli(["undo"], root);
    expect(here.code).toBe(3);
    expect(here.json.error.message).toBe("nothing to undo on branch main: the last rename was made on branch feat");
    git(root, "checkout", "-q", "feat");
    expect((await cli(["undo"], root)).json.data).toMatchObject({ kind: "note", from: "b.md", to: "a.md" });
    expect(readFileSync(join(root, "index.md"), "utf8")).toBe("[[a]]\n");
  });
});

describe("git: status, what changed, diffs, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  /** A repository whose vault is its docs/ folder, on main: a.md and gone.md; a branch feat checked out. */
  const repo = async () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-gitops-"));
    const root = join(top, "docs");
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n\none\ntwo\nthree\n");
    writeFileSync(join(root, "gone.md"), "# Gone\n");
    writeFileSync(join(root, "notes", "old.md"), "# Old name\n\nlong enough to be found again by git as a rename.\n");
    writeFileSync(join(top, "README.md"), "outside the vault\n");
    if (git(top, "init", "-q", "-b", "main").exitCode !== 0) return null;
    await cli(["init", root], root);
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "start");
    git(top, "checkout", "-q", "-b", "feat");
    return { top, root };
  };

  test("git's status read: new, modified, renamed (its old path skipped), deleted, a merge's conflicts", async () => {
    const { parseStatus } = await import("../src/core/gitops.ts");
    const z = ["?? new.md", " M a.md", "R  to.md", "from.md", " D gone.md", "UU both.md", "AA added-twice.md", "M  staged.md", ""].join("\0");
    expect([...parseStatus(z)]).toEqual([
      ["new.md", "new"],
      ["a.md", "modified"],
      ["to.md", "renamed"],
      ["gone.md", "deleted"],
      ["both.md", "conflict"],
      ["added-twice.md", "conflict"],
      ["staged.md", "modified"],
    ]);
  });

  test("a diff as rows, each at its line in the new text", async () => {
    const { diffRows } = await import("../src/core/merge.ts");
    expect(diffRows("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n", 1)).toEqual([
      { kind: "@@", text: "line 2", line: 2 },
      { kind: " ", text: "a", line: 1 },
      { kind: "-", text: "b", line: 2 },
      { kind: "+", text: "B", line: 2 },
      { kind: " ", text: "c", line: 3 },
      { kind: " ", text: "d", line: 4 }, // the next change touches this one's context: one group
      { kind: "+", text: "e", line: 5 },
    ]);
    expect(diffRows("same\n", "same\n")).toEqual([]);
    // Far apart: a group each, each with its head.
    const far = diffRows(["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"), ["X", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"), 1);
    expect(far.filter((r) => r.kind === "@@")).toEqual([
      { kind: "@@", text: "line 1", line: 1 },
      { kind: "@@", text: "line 9", line: 9 },
    ]);
    // A line added above moves what follows: the second group's context is a line further down.
    const moved = diffRows(["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"), ["x", "new", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"), 1);
    expect(moved.filter((r) => r.text === "7")).toEqual([{ kind: " ", text: "7", line: 9 }]);
  });

  test("changed, diff, worktrees: this branch against main, committed or not, the vault's files only", async () => {
    const r = await repo();
    if (!r) return;
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nTWO\nthree\n");
    git(r.top, "mv", "docs/notes/old.md", "docs/notes/new.md");
    rmSync(join(r.root, "gone.md"));
    git(r.top, "add", "-A");
    git(r.top, "commit", "-q", "-m", "on feat");
    writeFileSync(join(r.root, "b.md"), "# B, not committed\n");
    writeFileSync(join(r.top, "README.md"), "changed, but not the vault's\n");
    const c = (await cli(["changed"], r.root)).json.data;
    expect(c.base).toBe("main");
    expect(c.files).toEqual([
      { path: "a.md", state: "modified" },
      { path: "b.md", state: "new" },
      { path: "gone.md", state: "deleted" },
      { path: "notes/new.md", state: "renamed", from: "notes/old.md" },
    ]);
    const d = (await cli(["diff", "a.md"], r.root)).json.data;
    expect(d).toMatchObject({ path: "a.md", base: "main", new: false });
    expect(d.rows.filter((x: { kind: string }) => x.kind !== " ")).toEqual([
      { kind: "@@", text: "line 4", line: 4 },
      { kind: "-", text: "two", line: 4 },
      { kind: "+", text: "TWO", line: 4 },
    ]);
    expect((await cli(["diff", "b.md"], r.root)).json.data).toMatchObject({ new: true, rows: [{ kind: "@@" }, { kind: "+", text: "# B, not committed", line: 1 }] });
    expect((await cli(["changed", "--base", "nope"], r.root)).code).toBe(3);
    // The worktrees: the main checkout first; this one marked.
    const wt = join(r.top, "..", `${basename(r.top)}-wt`);
    git(r.top, "worktree", "add", "-q", "-b", "other", wt);
    const list = (await cli(["worktrees"], r.root)).json.data;
    expect(list.map((w: { path: string; branch: string; main: boolean; current: boolean; vault: string }) => [w.branch, w.main, w.current, w.vault])).toEqual([
      ["feat", true, true, r.root],
      ["other", false, false, join(wt, "docs")],
    ]);
    // Outside git: said so, exit 3.
    const plain = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    mkdirSync(join(plain, ".slipbox"));
    expect((await cli(["changed"], plain)).code).toBe(3);
  });

  test("a merge's conflicts are problems: each file, at its first marker", async () => {
    const r = await repo();
    if (!r) return;
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nfeat's two\nthree\n");
    git(r.top, "commit", "-q", "-am", "feat");
    git(r.top, "checkout", "-q", "main");
    writeFileSync(join(r.root, "a.md"), "# A\n\none\nmain's two\nthree\n");
    git(r.top, "commit", "-q", "-am", "main");
    expect(git(r.top, "merge", "-q", "feat").exitCode).not.toBe(0); // a conflict
    const p = (await cli(["problems"], r.root)).json.data;
    expect(p.conflicts).toEqual([{ path: "a.md", line: 4 }]);
    expect((await cli(["problems"], r.root)).json.data.conflicts).toHaveLength(1);
  });
});

describe("embeds drawn in place (1.11)", () => {
  const vaultOf = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-embed-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  /** `caches`: the parse's and the render's, as a buffer keeps them (blocks reused between renders). */
  const draw = async (g: ReturnType<typeof openGraph>, rel: string, caches?: { parse: import("../src/core/parse.ts").ParseCache; render: import("../src/core/layout/render.ts").RenderCache }) => {
    const { layoutNote } = await import("../src/core/note.ts");
    const { parseMarkdown } = await import("../src/core/parse.ts");
    const { glyphsFor } = await import("../src/core/glyphs.ts");
    return layoutNote(parseMarkdown(readFileSync(g.abs(rel), "utf8"), caches?.parse), g, rel, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }, caches?.render);
  };
  const text = (l: { lines: { spans: { text: string }[] }[] }) => l.lines.map((r) => r.spans.map((x) => x.text).join("").trimEnd());

  test("a note in a frame where it's embedded: its name, then its text behind a bar — no frontmatter; its headings not this note's", async () => {
    const { g } = vaultOf({
      "host.md": "# Host\n\nBefore.\n\n![inner](sub/inner.md)\n\nAfter.\n",
      "sub/inner.md": "---\ntitle: Inner\n---\n# Inner\n\nSee [the sibling](sibling.md) and [sibling](./sibling.md).\n",
      "sub/sibling.md": "# Sibling\n",
    });
    const l = await draw(g, "host.md");
    expect(text(l)).toEqual(["▌ Host", "", "Before.", "", "⧉ inner", "▎ ▌ Inner", "▎", "▎ See the sibling and sibling.", "", "After."]);
    expect(l.headings.map((h) => h.text)).toEqual(["Host"]); // not the embedded note's
    expect(l.lines.slice(4, 8).every((r) => r.src === 5)).toBe(true); // at the embed's line
    expect(l.embedded).toEqual([g.abs("sub/inner.md")]);
    // Its links: from where it is (sibling.md is beside it), and followed from there.
    const inner = l.links.filter((x) => x.target.includes("sibling"));
    expect(inner.map((x) => [x.status, x.from, x.src])).toEqual([
      ["resolved", "sub/inner.md", 5],
      ["resolved", "sub/inner.md", 5],
    ]);
    // The header, its name, is a link to it.
    expect(l.links.find((x) => x.line === 4)).toMatchObject({ kind: "image", target: "sub/inner.md", text: "inner", line: 4 });
  });

  test("a heading's section, a block by its ^id (a paragraph's, a list item's, a table's on the line after); missing ones said", async () => {
    const { g } = vaultOf({
      "host.md": "![src › Two](src.md#two)\n\n![src › ^para](src.md#^para)\n\n![src › ^item](src.md#^item)\n\n![src › ^tab](src.md#^tab)\n\n![src › Nope](src.md#nope)\n\n![src › ^nope](src.md#^nope)\n",
      "src.md": "# One\n\nfirst\n\n## Two\n\nsecond ^para\n\n### Two-a\n\ndeeper\n\n## Three\n\n- a\n- b ^item\n\n| x |\n| - |\n| 1 |\n\n^tab\n",
    });
    expect(text(await draw(g, "host.md"))).toEqual([
      "⧉ src › Two",
      "▎ ▌ Two",
      "▎",
      "▎ second ^para",
      "▎",
      "▎ ▌ Two-a",
      "▎",
      "▎ deeper",
      "",
      "⧉ src ^para",
      "▎ second",
      "",
      "⧉ src ^item",
      "▎ • b",
      "",
      "⧉ src ^tab",
      "▎ ┌───┐",
      "▎ │ x │",
      "▎ ╞═══╡",
      "▎ │ 1 │",
      "▎ └───┘",
      "",
      "⧉ src › nope",
      '▎ no heading "nope" in src',
      "",
      "⧉ src ^nope",
      "▎ no block ^nope in src",
    ]);
  });

  test("a loop is drawn once, said so; past three deep, a line says to open it; a picture, text around it, nothing found: references", async () => {
    const { g } = vaultOf({
      "a.md": "A\n\n![b](b.md)\n",
      "b.md": "B\n\n![a](a.md)\n",
      "self.md": "S\n\n![self](self.md)\n",
      "d1.md": "![d2](d2.md)\n",
      "d2.md": "![d3](d3.md)\n",
      "d3.md": "![d4](d4.md)\n",
      "d4.md": "![d5](d5.md)\n",
      "d5.md": "bottom\n",
      "refs.md": "![pic.png](pic.png)\n\nsee ![b](b.md) here\n\n![missing](missing.md)\n",
      "pic.png": "png",
    });
    expect(text(await draw(g, "a.md"))).toEqual(["A", "", "⧉ b", "▎ B", "▎", "▎ ⧉ a", "▎ ▎ embeds itself: not drawn again"]);
    expect(text(await draw(g, "self.md"))).toEqual(["S", "", "⧉ self", "▎ embeds itself: not drawn again"]);
    const deep = text(await draw(g, "d1.md"));
    expect(deep.at(-1)).toBe("▎ ▎ ▎ ▎ embedded deeper still: enter opens it");
    expect(deep.join("\n")).not.toContain("bottom");
    expect(text(await draw(g, "refs.md"))).toEqual(["▣ pic.png", "", "see ⧉ b here", "", "⧉ missing"]);
    expect((await draw(g, "d1.md")).embedded!.sort()).toEqual(["d2.md", "d3.md", "d4.md"].map((r) => g.abs(r)));
  });

  test("the embedded note changed: drawn as it is now, through the render cache too", async () => {
    const { newRenderCache } = await import("../src/core/layout/render.ts");
    const { newParseCache } = await import("../src/core/parse.ts");
    const { g } = vaultOf({ "host.md": "# H\n\n![inner](inner.md)\n\nkept\n", "inner.md": "old text\n" });
    const cache = { parse: newParseCache(), render: newRenderCache() };
    expect(text(await draw(g, "host.md", cache))).toContain("▎ old text");
    writeFileSync(g.abs("inner.md"), "new text, longer\n");
    expect(text(await draw(g, "host.md", cache))).toContain("▎ new text, longer");
  });
});

describe("the vault's problems (1.7)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  test("every link that reaches nothing — with where and how written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-problems-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "twin.md"), "# Twin A\n");
    writeFileSync(join(dir, "b", "twin.md"), "# Twin B\n");
    writeFileSync(join(dir, "index.md"), "# Index\n\n[missing](missing.md) and [x](gone.md).\n\n[alive](alive.md) and [ok](https://example.org)\n");
    writeFileSync(join(dir, "alive.md"), "# Alive\n");
    writeFileSync(join(dir, "self.md"), "# Self\n\nSee [self](self.md), [top](#self).\n");
    const p = (await cli(["problems"], dir)).json.data;
    expect(p.broken.map((x: { line: number; column: number; target: string }) => [x.line, x.column, x.target])).toEqual([
      [3, 1, "missing.md"],
      [3, 27, "gone.md"],
    ]);
    // Orphans (9.5): nothing links to them.
    expect(p.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // its own link isn't one
    // Made: gone from the list.
    writeFileSync(join(dir, "missing.md"), "# Missing\n");
    const after = (await cli(["problems"], dir)).json.data;
    expect(after.broken.map((x: { target: string }) => x.target)).toEqual(["gone.md"]);
    expect(after.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // missing.md is linked
  });
});

describe("where links end (11.7)", () => {
  test("a link records its end as well as its start — columns in UTF-16 units — and backlinks and problems carry it", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-ends-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "a.md"), "# A\n\n🌍 [Bee](b.md) then ![b](b.md)\n[md](b.md) and [ref][r] ![pic](p.png) [gone](gone.md)\n\n[r]: b.md\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const ends = g.notes.get("a.md")!.links.map((l) => [l.kind, l.line, l.column, l.end.line, l.end.column]);
    // 🌍 is two UTF-16 units: [Bee](b.md) starts at column 4, as an editor counts.
    expect(ends).toEqual([
      ["markdown", 3, 4, 3, 15],
      ["image", 3, 21, 3, 31],
      ["markdown", 4, 1, 4, 11],
      ["markdown", 4, 16, 4, 24],
      ["image", 4, 25, 4, 38],
      ["markdown", 4, 39, 4, 54],
    ]);
    expect(g.backlinks("b.md").map((b) => [b.line, b.column, b.end.column])).toContainEqual([3, 4, 15]);
    expect(g.problems().broken.find((p) => p.target === "gone.md")).toMatchObject({ line: 4, column: 39, end: { line: 4, column: 54 } });
  });
});

describe("an editor's unsaved text (11.8)", () => {
  test("stands for the note until let go: its links and headings count; the persisted index keeps the file's", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-overlay-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, true);
    const from = () => g.backlinks("b.md").map((b) => b.from);
    g.overlay("a.md", "# A, typed\n\n## New\n\n[b](b.md)\n");
    expect(from()).toEqual(["a.md"]);
    expect(g.notes.get("a.md")!.headings.map((h) => h.text)).toEqual(["A, typed", "New"]);
    // Another note changes: the index is written — with the file's a.md, no link, read afresh.
    writeFileSync(join(dir, "b.md"), "# B, changed\n");
    g.updateFile("b.md", { rel: "b.md", abs: join(dir, "b.md"), size: 13, mtimeMs: Date.now() });
    g.ensureAll();
    expect(openGraph(loc, DEFAULT_CONFIG, true).backlinks("b.md")).toEqual([]);
    // The file changes under it (an agent, a save): the editor's text still stands; let go, the file's.
    writeFileSync(join(dir, "a.md"), "# A, saved\n\n[b](b.md) [b](b.md)\n");
    g.updateFile("a.md", { rel: "a.md", abs: join(dir, "a.md"), size: 22, mtimeMs: Date.now() });
    expect(g.notes.get("a.md")!.title).toBe("A, typed");
    g.overlay("a.md", null);
    expect(g.notes.get("a.md")!.title).toBe("A, saved");
    expect(from()).toEqual(["a.md", "a.md"]);
    // A rescan keeps it; a note that isn't the graph's gets none.
    g.overlay("a.md", "# Typed again\n");
    g.build(true, "lazy");
    expect(g.entry("a.md")!.title).toBe("Typed again");
    g.overlay("nowhere.md", "# N\n");
    expect(g.notes.has("nowhere.md")).toBe(false);
  });
});

describe("renaming a heading (11.9)", () => {
  test("its line and every link to it, in each link's form; undone like any rename", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heading-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n\n## Old Name ##\n\ntext ^blk\n\nsee [Old Name](#old-name) and [up](#old-name)\n");
    const a = [
      "[x](b.md#old-name) [shown](./b.md#old-name) ![e](b.md#old-name) [k](b.md#^blk) [o](b.md#other)",
      "[s](b.md#old-name) [t](b.md#Old%20Name) [u](<b.md#Old Name>) [v](b.md)",
      "",
    ].join("\n");
    writeFileSync(join(dir, "a.md"), a);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const plan = planHeadingRename(g, "b.md", "Old Name", "New Title");
    expect(plan).toMatchObject({ kind: "heading", from: "b.md#Old Name", to: "b.md#New Title", move: null });
    applyPlan(g, plan);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(
      [
        "[x](b.md#new-title) [shown](./b.md#new-title) ![e](b.md#new-title) [k](b.md#^blk) [o](b.md#other)",
        "[s](b.md#new-title) [t](b.md#New%20Title) [u](<b.md#New Title>) [v](b.md)",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(dir, "b.md"), "utf8")).toBe("# B\n\n## New Title ##\n\ntext ^blk\n\nsee [Old Name](#new-title) and [up](#new-title)\n");
    // Undone like any rename (7.4).
    applyPlan(g, planUndo(g));
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(a);
  });

  test("refused: no such heading, two of its name, a name another heading has, the same name", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heading-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n\n## Twice\n\n## Twice\n\n## One\n\n## Two\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const why = (heading: string, to: string) => {
      try {
        planHeadingRename(g, "b.md", heading, to);
        return "planned";
      } catch (err) {
        return (err as Error).message;
      }
    };
    expect(why("Nope", "X")).toBe('no heading "Nope" in b.md');
    expect(why("Twice", "X")).toBe('b.md has two headings "Twice": links can\'t tell them apart');
    expect(why("One", "two")).toBe('b.md has a heading "two" already');
    expect(why("One", "One")).toBe('the heading is "One" already');
    expect(why("one", "Uno")).toBe("planned"); // found by its name in any case, or its slug
  });
});


describe("search's sections, cut to scout's size band (scout's Stage 4)", () => {
  /** A paragraph of `bytes` bytes (ASCII), a word given to find it by. */
  const para = (bytes: number, word = "filler") => `${word} ${"lorem ".repeat(Math.ceil(bytes / 6))}`.slice(0, bytes);
  test("each node on its own tokens: kept in the band, merged up when under — the root always kept — split when over", async () => {
    const { indexDoc, BAND_MAX } = await import("../src/core/search.ts");
    const text = [
      "---",
      "title: T",
      "---",
      "lead text",
      "",
      "# Auth",
      "",
      "short",
      "",
      "## How auth works",
      "",
      "short too",
      "",
      "### Cookies",
      "",
      "cookies here",
      "",
      "## Redirects",
      "",
      para(2000, "redirects"),
      "",
      "## Big",
      "",
      ...Array.from({ length: 7 }, (_, i) => [para(1000, `big${i}`), ""]).flat(),
      "## Data",
      "",
      para(2000, "first"),
      "",
      "## data",
      "",
      para(2000, "second"),
      "",
      "## a/b#c%d~e",
      "",
      para(2000, "odd"),
      "",
      "## Fenced",
      "",
      "```",
      para(1500, "code1"),
      "",
      para(1500, "code2"),
      "",
      para(1500, "code3"),
      "",
      para(1500, "code4"),
      "```",
    ].join("\n");
    const d = indexDoc("auth.md", text, "note");
    const names = d.sections.map((x) => x.name);
    expect(names).toEqual(["§:file", "Auth/Redirects", "Auth/Big/§:part", "Auth/Big/§:part~2", "Auth/Data", "Auth/data~2", "Auth/a%2Fb%23c%25d%7Ee", "Auth/Fenced/§:part", "Auth/Fenced/§:part~2"]);
    // Auth, How auth works and Cookies are each under the band: Cookies into How auth works, that into
    // Auth, Auth into the root — which is kept though it's still under.
    const root = d.sections[0]!;
    expect(root.lines.map((l) => l.text)).toEqual(expect.arrayContaining(["lead text", "# Auth", "### Cookies", "cookies here"]));
    expect(root.tokens).toBeLessThan(400);
    // A section's range is its first and last line, merged text and all.
    expect([root.line, root.end]).toEqual([1, 17]); // Cookies' blank line after its text, its own
    // Big is over the band: cut at paragraphs, each piece in it.
    for (const piece of d.sections.filter((x) => x.name.startsWith("Auth/Big/"))) expect(piece.tokens).toBeLessThanOrEqual(BAND_MAX);
    // A fenced block is one unit, never cut: over the band, it's a piece of its own, kept whole and said
    // so — its heading, packed first, a piece before it (scout's rule, as written).
    const fenced = d.sections.find((x) => x.name === "Auth/Fenced/§:part~2")!;
    expect(fenced.oversized).toBe(true);
    expect(fenced.lines.map((l) => l.text).filter((t) => t.startsWith("code")).length).toBe(4);
    expect(d.sections.find((x) => x.name === "Auth/Fenced/§:part")!.lines.map((l) => l.text)).toEqual(["## Fenced"]);
  });

  test("a split's last piece under the band's bottom goes onto the one before", async () => {
    const { indexDoc } = await import("../src/core/search.ts");
    const text = ["# Tail", "", ...Array.from({ length: 6 }, (_, i) => [para(1000, `p${i}`), ""]).flat(), para(200, "last")].join("\n");
    const d = indexDoc("tail.md", text, "note");
    expect(d.sections.map((x) => x.name).sort()).toEqual(["Tail/§:part", "§:file"]);
    expect(d.sections.find((x) => x.name === "Tail/§:part")!.lines.at(-1)!.text).toStartWith("last");
  });

  test("a data file with no headings: one section, or band-sized chunks at blank lines", async () => {
    const { indexDoc } = await import("../src/core/search.ts");
    expect(indexDoc("a.yaml", "a: 1\nb: 2\n", "data").sections.map((x) => x.name)).toEqual(["§:file"]);
    const big = Array.from({ length: 8 }, (_, i) => para(1000, `k${i}:`)).join("\n\n");
    expect(indexDoc("big.yaml", big, "data").sections.map((x) => x.name)).toEqual(["§:chunk", "§:chunk~2"]);
  });

  test("a hit names its section and range, as scout would, for a search that adds scout's results to dedupe on", async () => {
    const { search } = await import("../src/core/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-band-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "n.md"), `# N\n\nintro\n\n## Deep\n\n${para(2000, "needle")}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const hit = search(g, null, "needle").hits[0]!;
    expect(hit).toMatchObject({ path: "n.md", line: 7, heading: "Deep", section: { name: "N/Deep", line: 5, end: 7 } });
  });
});

describe("the converter: links made plain paths (20.1)", () => {
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-convert-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  const B = "# B\n\n## Second Part\n\nA paragraph ^blk\n";

  test("each form: relative to the note, text kept, headings as checked slugs, blocks, anchors, sizes; what can't be, left and said", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { g } = vault({
      "notes/a.md": [
        "---",
        'related: "[[b]]"',
        "---",
        "# A",
        "",
        "Plain [[b]], aliased [[b|the B]], heading [[b#Second Part]], block [[b#^blk]] and [[b^blk]].",
        "Here: [[#Local]]. Spaces: [[with space]]. Root: [r](/c/c.md#top), [web](/missing.md).",
        "![[img/pic.png|300]]",
        "",
        "![[b#Second Part]]",
        "",
        "Code `[[b]]` stays; [[nope]], ![[gone.png]], [[b#No Such]] and [[b#^none]] stay.",
        "",
        "| a | b |",
        "| --- | --- |",
        "| [[b\\|in a table]] | x |",
        "",
        "## Local",
        "",
      ].join("\n"),
      "b.md": B,
      "img/pic.png": "png",
      "c/c.md": "# C\n",
      "c/with space.md": "# W\n",
    });
    // A `/…` link naming the filesystem's own path already means what it will: left.
    writeFileSync(join(g.root, "notes", "abs.md"), `[abs](${join(g.root, "c", "c.md")})\n`);
    g.build(true);
    expect(planConvert(g, ["notes/abs.md"]).files).toEqual([]);
    const plan = planConvert(g);
    expect(plan.kind).toBe("convert");
    expect(plan.files.map((f) => f.shown)).toEqual(["notes/a.md"]);
    expect(plan.files[0]!.next.split("\n")).toEqual([
      "---",
      'related: "[[b]]"', // frontmatter: no link to the index, left
      "---",
      "# A",
      "",
      "Plain [b](../b.md), aliased [the B](../b.md), heading [b › Second Part](../b.md#second-part), block [b › ^blk](../b.md#^blk) and [b › ^blk](../b.md#^blk).",
      "Here: [Local](#local). Spaces: [with space](../c/with%20space.md). Root: [r](../c/c.md#top), [web](/missing.md).",
      "![pic.png|300](../img/pic.png)",
      "",
      "![b › Second Part](../b.md#second-part)",
      "",
      "Code `[[b]]` stays; [[nope]], ![[gone.png]], [[b#No Such]] and [[b#^none]] stay.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| [in a table](../b.md) | x |",
      "",
      "## Local",
      "",
    ]);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual([
      '![[gone.png]]: no file "gone.png" — left as it is',
      "/missing.md: nothing there — left as it is",
      '[[b#No Such]]: no heading "No Such" there — left as it is',
      "[[b#^none]]: no block ^none there — left as it is",
      '[[nope]]: no note named "nope" — left as it is',
    ]);
    expect(plan.ambiguous).toEqual([]);
  });

  test("a link several notes answer to: listed with its candidates, left; picked, converted", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { g } = vault({ "r.md": "See [[dup]].\n", "x/dup.md": "# X\n", "y/dup.md": "# Y\n" });
    const plan = planConvert(g);
    expect(plan.files).toEqual([]);
    expect(plan.ambiguous).toEqual([{ key: "r.md:1:5", shown: "r.md", line: 1, written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] }]);
    const picked = planConvert(g, undefined, new Map([["r.md:1:5", "y/dup.md"]]));
    expect(picked.ambiguous).toEqual([]);
    expect(picked.files[0]!.next).toBe("See [dup](y/dup.md).\n");
    // A pick that isn't one of its candidates is no pick.
    expect(planConvert(g, undefined, new Map([["r.md:1:5", "elsewhere.md"]])).ambiguous).toHaveLength(1);
  });

  test("written only as planned (a file changed since is refused, nothing written); undone byte for byte; one note alone", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { dir, g } = vault({ "a.md": "[[b]] and [[b]]\n", "c.md": "[[b]]\n", "b.md": B });
    const stale = planConvert(g);
    writeFileSync(join(dir, "c.md"), "[[b]] edited\n");
    expect(() => applyPlan(g, stale)).toThrow("c.md changed since the preview; nothing changed");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]] and [[b]]\n");
    g.build(true);
    // Wikilinks are read from the file as it is: an index older than it changes nothing.
    writeFileSync(join(dir, "a.md"), "[[b]] gone\n");
    expect(planConvert(g, ["a.md"]).files[0]!.next).toBe("[b](b.md) gone\n");
    // A link from the root is the index's: two it knows, one left on the line — the one there
    // converted, the other said, never written twice.
    writeFileSync(join(dir, "r.md"), "[x](/b.md) and [x](/b.md)\n");
    g.build(true);
    writeFileSync(join(dir, "r.md"), "[x](/b.md) gone\n");
    const older = planConvert(g, ["r.md"]);
    expect(older.files[0]!.next).toBe("[x](b.md) gone\n");
    expect(older.skipped.map((s) => s.reason)).toEqual(["/b.md: not where the index has it (the file changed since)"]);
    writeFileSync(join(dir, "r.md"), "nothing here\n");
    writeFileSync(join(dir, "a.md"), "[[b]] and [[b]]\n");
    // One note's links only.
    expect(planConvert(g, ["a.md"]).files.map((f) => [f.shown, f.next])).toEqual([["a.md", "[b](b.md) and [b](b.md)\n"]]);
    applyPlan(g, planConvert(g));
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[b](b.md) and [b](b.md)\n");
    expect(readFileSync(join(dir, "c.md"), "utf8")).toBe("[b](b.md) edited\n");
    g.build(true);
    const undo = planUndo(g);
    expect(undo.kind).toBe("convert");
    applyPlan(g, undo);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]] and [[b]]\n");
    expect(readFileSync(join(dir, "c.md"), "utf8")).toBe("[[b]] edited\n");
  });

  test("links from the root found in their own span (a shorter one first on the line; an image inside a link); reference links by their definition, once", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { g } = vault({
      "n/a.md": [
        "[a](/c/c.md)[a much longer text than the first link has](/c/c.md)",
        "[![i](/c/c.md)](/c/c.md)",
        "",
        "[x][r] and [y][r]; [z][s].",
        "",
        "[r]: /c/c.md",
        "[s]: </c/c.md#top>",
        "",
      ].join("\n"),
      "c/c.md": "# C\n",
    });
    const plan = planConvert(g);
    expect(plan.skipped).toEqual([]);
    expect(plan.files[0]!.next.split("\n")).toEqual([
      "[a](../c/c.md)[a much longer text than the first link has](../c/c.md)",
      "[![i](../c/c.md)](../c/c.md)",
      "",
      "[x][r] and [y][r]; [z][s].",
      "",
      "[r]: ../c/c.md",
      "[s]: <../c/c.md#top>",
      "",
    ]);
  });

  test("a link's text stays literal: what markdown would act on in a label is escaped; a table's | too; a heading with no slug is left", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { parseMarkdown } = await import("../src/core/parse.ts");
    const { g } = vault({
      "a.md": "[[b|a\\]] [[b|2*3*4]] [[b|x<y>]] [[b|`c`]] [[b|snake_case and _x_]] [[b|a & b ~ c]]\n\n| p |\n| --- |\n| ![[pic.png\\|300]] |\n\n[[e#🎉]]\n",
      "b.md": B,
      "e.md": "# E\n\n## 🎉\n",
      "pic.png": "png",
    });
    const plan = planConvert(g);
    const out = plan.files[0]!.next;
    expect(out.split("\n")[0]).toBe("[a\\\\](b.md) [2\\*3\\*4](b.md) [x\\<y>](b.md) [\\`c\\`](b.md) [snake_case and \\_x\\_](b.md) [a \\& b \\~ c](b.md)");
    // Read back: one link each, its text exactly the alias.
    const para = (parseMarkdown(out).tree.children[0] as { children: { type: string; children?: { value?: string }[] }[] }).children.filter((c) => c.type === "link");
    expect(para.map((l) => (l.children ?? []).map((t) => t.value).join(""))).toEqual(["a\\", "2*3*4", "x<y>", "`c`", "snake_case and _x_", "a & b ~ c"]);
    expect(out).toContain("| ![pic.png\\|300](pic.png) |"); // the table's divider kept escaped
    expect(out).toContain("[[e#🎉]]");
    expect(plan.skipped.map((s) => s.reason)).toEqual(['[[e#🎉]]: the heading "🎉" has no slug to link to — left as it is']);
  });

  test("a conversion with nothing to change isn't logged: undo still takes back the last real one", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { dir, g } = vault({ "a.md": "[[b]]\n", "b.md": B });
    applyPlan(g, planConvert(g));
    g.build(true);
    const nothing = planConvert(g);
    expect(nothing.files).toEqual([]);
    applyPlan(g, nothing);
    g.build(true);
    const undo = planUndo(g);
    expect(undo.files.map((f) => f.shown)).toEqual(["a.md"]);
    applyPlan(g, undo);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]]\n");
  });

  test("the CLI: --dry-run shows it, ambiguous and skipped ones said; without, it's written; slipbox undo takes it back", async () => {
    const { dir } = vault({ "a.md": "[[b]], [[dup]], [[nope]]\n", "b.md": B, "x/dup.md": "", "y/dup.md": "" });
    const run = async (args: string[]) => {
      const out: string[] = [];
      const code = await runCli([...args, "--json"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
      return { code, json: JSON.parse(out.join("")) };
    };
    // A note named: its links only.
    writeFileSync(join(dir, "other.md"), "[[b]]\n");
    expect((await run(["convert-links", "a.md", "--dry-run"])).json.data.files.map((f: { path: string }) => f.path)).toEqual(["a.md"]);
    const dry = await run(["convert-links", "--dry-run"]);
    expect(dry.code).toBe(0);
    expect(dry.json.data).toMatchObject({ kind: "convert", dryRun: true, files: [{ path: "a.md", edits: [{ line: 1, before: "[[b]], [[dup]], [[nope]]", after: "[b](b.md), [[dup]], [[nope]]" }] }, { path: "other.md" }] });
    expect(dry.json.data.ambiguous).toMatchObject([{ written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] }]);
    expect(dry.json.warnings).toContain('a.md:1: [[nope]]: no note named "nope" — left as it is');
    expect(dry.json.warnings.some((w: string) => w.startsWith("a.md:1: [[dup]] matches 2 notes (x/dup.md, y/dup.md)"))).toBe(true);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]], [[dup]], [[nope]]\n");
    expect((await run(["convert-links"])).code).toBe(0);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[b](b.md), [[dup]], [[nope]]\n");
    expect((await run(["undo"])).json.data.kind).toBe("convert");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]], [[dup]], [[nope]]\n");
  });

  test("a note embedded by its path (`![…](note.md)`) is drawn in place as `![[note]]` is; its heading by the fragment's slug", async () => {
    const { g } = vault({
      "host.md": "# Host\n\n![inner](sub/inner.md)\n\n![part](sub/inner.md#second-part)\n\n![a picture](pic.png)\n",
      // A path from its own folder, not a name looked up: `inner.md` beside notes/far.md isn't there.
      "notes/far.md": "![not here](inner.md)\n",
      "sub/inner.md": "# Inner\n\nFirst.\n\n## Second Part\n\nSecond.\n",
      "pic.png": "png",
    });
    const { layoutNote } = await import("../src/core/note.ts");
    const { parseMarkdown } = await import("../src/core/parse.ts");
    const { glyphsFor } = await import("../src/core/glyphs.ts");
    const l = layoutNote(parseMarkdown(readFileSync(g.abs("host.md"), "utf8")), g, "host.md", { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
    const rows = l.lines.map((r) => r.spans.map((x) => x.text).join("").trimEnd());
    expect(rows.slice(0, 13)).toEqual(["▌ Host", "", "⧉ inner", "▎ ▌ Inner", "▎", "▎ First.", "▎", "▎ ▌ Second Part", "▎", "▎ Second.", "", "⧉ inner › Second Part", "▎ ▌ Second Part"]);
    expect(rows.some((r) => r.includes("⧉ pic"))).toBe(false); // a picture stays a picture
    const far = layoutNote(parseMarkdown(readFileSync(g.abs("notes/far.md"), "utf8")), g, "notes/far.md", { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
    expect(far.embedded ?? []).toEqual([]);
    // The header links to the note by its path, the fragment kept, and follows as a path does.
    expect(l.links.filter((x) => x.text.startsWith("inner")).map((x) => [x.kind, x.target])).toEqual([
      ["image", "sub/inner.md"],
      ["image", "sub/inner.md#second-part"],
    ]);
  });
});

describe("collections apart from instances (20.4)", () => {
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const fresh = (prefix: string) => mkdtempSync(join(tmpdir(), `slipbox-${prefix}-`));

  test("a remote as evidence: host and path, never a user or a password; ssh and https alike; local ones by path", async () => {
    const { normalizeRemote, remotesIn } = await import("../src/core/collection.ts");
    expect(normalizeRemote("git@github.com:Owner/Repo.git", "/r")).toBe("github.com/Owner/Repo");
    expect(normalizeRemote("git@GitHub.COM:Owner/Repo.git", "/r")).toBe("github.com/Owner/Repo"); // a host in any case
    expect(normalizeRemote("https://user:secret@GitHub.com/Owner/Repo.git/", "/r")).toBe("github.com/Owner/Repo");
    expect(normalizeRemote("ssh://git@github.com:22/Owner/Repo", "/r")).toBe("github.com/Owner/Repo");
    expect(normalizeRemote("/srv/git/repo.git", "/r")).toBe("file:/srv/git/repo");
    expect(normalizeRemote("file:///srv/x/.git", "/r")).toBe("file:/srv/x");
    expect(normalizeRemote("../other", "/a/b")).toBe("file:/a/other");
    expect(normalizeRemote("  ", "/r")).toBeNull();
    const config = ['[core]', "\tbare = false", '[remote "origin"]', "\turl = git@github.com:o/r.git", "\tfetch = +refs/heads/*:refs/remotes/origin/*", "# a comment", '[branch "main"]', "\turl = not-a-remote", '[remote "up"]', '\turl = "https://github.com/o/r"', '\turl = https://gitlab.com/o/r'].join("\n");
    expect(remotesIn(config, "/r")).toEqual(["github.com/o/r", "gitlab.com/o/r"]);
  });

  test("the same collection: a .slipbox/ id, a remote or a first commit shared; plain folders never", async () => {
    const { NO_COLLECTION, sameCollection } = await import("../src/core/collection.ts");
    const c = (slipbox: string | null, remotes: string[] = [], roots: string[] = []) => ({ slipbox, remotes, roots });
    expect(sameCollection(c("a"), c("a"))).toBe(true);
    expect(sameCollection(c("a"), c("b"))).toBe(false);
    expect(sameCollection(c(null, ["github.com/o/r", "x"]), c(null, ["github.com/o/r"]))).toBe(true);
    expect(sameCollection(c(null, [], ["1a"]), c(null, ["y"], ["1a", "2b"]))).toBe(true);
    expect(sameCollection(c(null, ["x"], ["1a"]), c(null, ["y"], ["2b"]))).toBe(false);
    expect(sameCollection(NO_COLLECTION, NO_COLLECTION)).toBe(false);
    expect(sameCollection(undefined, c("a"))).toBe(false);
  });

  test("a clone and a worktree: instances of their own, one collection — info lists the others as copies", async () => {
    const base = fresh("coll");
    const x = join(base, "x");
    mkdirSync(x);
    // Its own text: two repositories committed alike in the same second share their first commit.
    writeFileSync(join(x, "a.md"), `# A\n\n${base}\n`);
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    const clone = join(base, "clone");
    if (git(base, "clone", "-q", x, clone).exitCode !== 0) return;
    const wt = join(base, "wt");
    if (git(x, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) return;
    const root = git(x, "rev-list", "--max-parents=0", "HEAD").stdout.toString().trim();
    const info = async (dir: string) => (await cli(["info"], dir)).json.data;
    const ix = await info(x);
    const ic = await info(clone);
    const iw = await info(wt);
    // Each its own local id; the evidence what git says: no remote for x, x itself for the clone.
    expect(new Set([ix.instance, ic.instance, iw.instance]).size).toBe(3);
    expect(ix.collection).toEqual({ slipbox: null, remotes: [], roots: [root] });
    expect(ic.collection).toEqual({ slipbox: null, remotes: [`file:${x}`], roots: [root] });
    // The others, once seen, from each: the same first commit. The id is given once: opened again, the same.
    const again = await info(x);
    expect(again.instance).toBe(ix.instance);
    expect(again.copies.map((c: { path: string }) => c.path).sort()).toEqual([clone, wt].sort());
    expect(iw.copies.map((c: { path: string }) => c.path).sort()).toEqual([clone, x].sort());
    // Nothing of it written into the folders.
    for (const d of [x, clone, wt]) expect(existsSync(join(d, ".slipbox"))).toBe(false);
    // Human: the instance, what it holds, the copies.
    const out: string[] = [];
    await runCli(["info"], { out: (s: string) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: x, env: process.env });
    expect(out.join("")).toContain(`instance  ${ix.instance} — holds first commit ${root.slice(0, 7)}`);
    expect(out.join("")).toContain(`copy      ${wt} (worktree wt)`);
  });

  test("a plain folder opened is an instance, by its path; made a vault, it's the vault's instance; gone a month, forgotten", async () => {
    const { pruneWorktrees, readRegistry, registryFile } = await import("../src/core/registry.ts");
    const dir = fresh("plainf");
    writeFileSync(join(dir, "n.md"), "# N\n");
    await cli(["ls"], dir);
    const folder = readRegistry().filter((v) => v.path === dir);
    expect(folder).toHaveLength(1);
    expect(folder[0]).toMatchObject({ kind: "folder", id: null, name: null, key: vaultKey(dir) });
    expect(folder[0]!.instance).toMatch(/^[0-9a-f]{12}$/);
    // Not a vault: the TUI's list and `vaults` say what it is.
    expect((await cli(["vaults"], dir)).json.data.find((v: { path: string }) => v.path === dir)).toMatchObject({ kind: "folder", exists: true });
    await cli(["init", dir, "--name", "plainmade"], dir);
    expect(readRegistry().filter((v) => v.path === dir).map((v) => v.kind)).toEqual(["vault"]);
    // A folder gone a month is dropped; one gone a day is kept.
    const gone = fresh("plaingone");
    await cli(["ls"], gone);
    rmSync(gone, { recursive: true });
    pruneWorktrees(Date.now() + 86_400_000);
    expect(readRegistry().some((v) => v.path === gone)).toBe(true);
    pruneWorktrees(Date.now() + 31 * 86_400_000);
    expect(readRegistry().some((v) => v.path === gone)).toBe(false);
    expect(existsSync(registryFile())).toBe(true);
  });

  test("info lists the five copies seen last, then how many more", async () => {
    const { copiesShown } = await import("../src/core/collection.ts");
    const copies = Array.from({ length: 7 }, (_, i) => ({ path: `/c${i}`, seen: `2026-10-0${i + 1}T00:00:00Z`, ...(i === 6 ? { worktree: { name: "w" } } : {}) }));
    expect(copiesShown(copies)).toEqual(["/c6 (worktree w)", "/c5", "/c4", "/c3", "/c2", "and 2 more: slipbox vaults lists them"]);
    expect(copiesShown(copies.slice(0, 2))).toEqual(["/c1", "/c0"]);
  });

  test("a plain folder's entry at a vault's path (a list edited by hand, an old one): the vault's name is shown", async () => {
    const { readRegistry, registryFile } = await import("../src/core/registry.ts");
    const { writeJson } = await import("../src/core/fsutil.ts");
    const base = fresh("vaultof");
    const notes = join(base, "notes");
    const app = join(base, "app");
    mkdirSync(notes);
    mkdirSync(app);
    writeFileSync(join(app, "design.md"), "# Design\n");
    writeFileSync(join(notes, "index.md"), "[d](../app/design.md)\n");
    await cli(["init", notes, "--name", "vonotes"], notes);
    await cli(["init", app, "--name", "voapp"], app);
    // The folder's entry first in the list, as a hand edit or an older slipbox could leave it.
    const folder = { key: `${vaultKey(app)}-folder`, instance: "f0f0f0f0f0f0", id: null, kind: "folder", name: null, aliases: [], previous_names: [], path: app, seen: new Date().toISOString() };
    writeJson(registryFile(), { version: 1, vaults: [folder, ...readRegistry()] });
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links[0]).toMatchObject({ status: "note", vault: "voapp" });
  });

  test("slipbox vaults: a git vault without .slipbox/ is there, not gone (20.3)", async () => {
    const repo = fresh("vlgit");
    mkdirSync(join(repo, ".git"));
    await cli(["ls"], repo);
    expect((await cli(["vaults"], repo)).json.data.find((v: { path: string }) => v.path === repo)).toMatchObject({ kind: "vault", exists: true });
  });
});

describe("names for display (20.6)", () => {
  const v = (key: string, name: string | null, path: string, extra: Partial<KnownVault> = {}): KnownVault => ({ key, id: null, kind: "vault", name, aliases: [], previous_names: [], path, seen: "", ...extra });

  test("short and unique: a shared name takes as few folders as tell them apart, joined with .; case counts as the same", async () => {
    const { displayNames } = await import("../src/core/names.ts");
    // Its own folder first when its name isn't the folder's; a level every one of them shares is left out.
    const copies = displayNames([v("p", "halden", "/home/me/src/slipbox/examples/vault"), v("q", "halden", "/tmp/run/vault"), v("r", "fixture", "/t/vault-ab12"), v("s", "fixture", "/t/vault-cd34")]);
    expect(Object.fromEntries(copies)).toEqual({ p: "examples.halden", q: "run.halden", r: "vault-ab12.fixture", s: "vault-cd34.fixture" });
    const names = displayNames([
      v("a", "docs", "/home/me/work/docs"),
      v("b", "Docs", "/home/me/home/docs"),
      v("c", "notes", "/home/me/notes"),
      v("d", "plan", "/x/a/same/plan"),
      v("e", "plan", "/x/b/same/plan"),
      v("f", null, "/srv/My Folder"),
      v("g", "plain", "/p", { kind: "folder" }),
    ]);
    expect(Object.fromEntries(names)).toEqual({ a: "work.docs", b: "home.Docs", c: "notes", d: "a.plan", e: "b.plan", f: "My-Folder" });
  });

  test("a worktree: its main checkout's name and the branch now; two entries at one place keep a piece of their key", async () => {
    const { displayNames } = await import("../src/core/names.ts");
    const branch = (p: string) => (p.endsWith("feat") ? "refactor" : null);
    const names = displayNames(
      [
        v("m", "pathfinder", "/src/pathfinder"),
        v("w", "pathfinder", "/src/wt/feat", { worktree: { name: "feat", main: "/src/pathfinder" } }),
        v("w2", "pathfinder", "/src/wt/fix", { worktree: { name: "fix", main: "/gone" } }),
        v("s1", "same", "/one/same", { instance: "aaaa1111" }),
        v("s2", "same", "/one/same", { instance: "bbbb2222" }),
      ],
      branch,
    );
    expect(names.get("m")).toBe("pathfinder");
    expect(names.get("w")).toBe("pathfinder@refactor");
    expect(names.get("w2")).toBe("pathfinder@fix"); // no main known, no branch: git's name for it
    expect([names.get("s1"), names.get("s2")]).toEqual(["same.aaaa", "same.bbbb"]);
  });

  test("a git vault without .slipbox/ is named after its repository (origin's, else the first remote's), else its folder", async () => {
    const { repositoryName } = await import("../src/core/collection.ts");
    const dir = join(mkdtempSync(join(tmpdir(), "slipbox-repname-")), "pf");
    mkdirSync(dir);
    if (Bun.spawnSync(["git", "init", "-q", dir]).exitCode !== 0) return; // no git here
    expect(repositoryName(dir)).toBeNull();
    expect(locateVault({ path: dir }).name).toBe("pf");
    Bun.spawnSync(["git", "-C", dir, "remote", "add", "upstream", "https://example.invalid/them/other.git"]);
    expect(repositoryName(dir)).toBe("other");
    Bun.spawnSync(["git", "-C", dir, "remote", "add", "origin", "git@example.invalid:me/pathfinder.git"]);
    expect(repositoryName(dir)).toBe("pathfinder");
    expect(locateVault({ path: dir }).name).toBe("pathfinder");
    // .slipbox/ declares its own, which wins.
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[vault]\nid = "pfid"\nname = "pf-notes"\n');
    expect(locateVault({ path: dir }).name).toBe("pf-notes");
  });

  test("slipbox vaults and info show each by its name here; the name in .slipbox/ is unchanged", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-shown-"));
    const one = join(base, "work", "docs");
    const two = join(base, "home", "docs");
    for (const d of [one, two]) {
      mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "${basename(dirname(d))}${basename(base)}"\nname = "docs-${basename(base)}"\n`);
    }
    const out: string[] = [];
    const run = async (args: string[], cwd: string) => {
      out.length = 0;
      await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
      return JSON.parse(out.join("")).data;
    };
    await run(["ls"], one);
    const info = await run(["info"], two);
    const name = `docs-${basename(base)}`;
    expect(info.vault).toMatchObject({ name, shown: `home.${name}` });
    const listed = (await run(["vaults"], one)).filter((x: { path: string }) => x.path === one || x.path === two);
    expect(listed.map((x: { shown: string }) => x.shown).sort()).toEqual([`home.${name}`, `work.${name}`]);
    expect(readFileSync(join(one, ".slipbox", "config.toml"), "utf8")).toContain(`name = "${name}"`);
  });
});

describe("settings, deeper over broader (20.7)", () => {
  test("a vault inside another: its own settings, then the outer one's, then yours; a program named in a vault's never runs", async () => {
    const { configFilesFor } = await import("../src/core/vault.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-deeper-"));
    const outer = join(base, "outer");
    const inner = join(outer, "inner");
    mkdirSync(join(inner, ".slipbox"), { recursive: true });
    mkdirSync(join(outer, ".slipbox"));
    const outerCfg = join(outer, ".slipbox", "config.toml");
    const innerCfg = join(inner, ".slipbox", "config.toml");
    writeFileSync(outerCfg, '[ui]\nsidebar_width = 31\nreadable_max = 90\n\n[editor]\ncommand = "rm -rf"\n');
    writeFileSync(innerCfg, "[ui]\nreadable_max = 70\n");
    const user = join(base, "user.toml");
    writeFileSync(user, "[ui]\nsidebar_width = 25\noutline_width = 33\n");
    const files = configFilesFor(locateVault({ path: inner }));
    expect(files).toEqual({ vaultFile: innerCfg, outerFiles: [outerCfg] });
    const loaded = loadConfig({ ...files, configFile: user });
    expect(loaded.config.ui.readable_max).toBe(70); // its own
    expect(loaded.config.ui.sidebar_width).toBe(31); // the outer vault's, over yours
    expect(loaded.config.ui.outline_width).toBe(33); // yours, where no vault says
    expect(loaded.config.editor.command).toBe(DEFAULT_CONFIG.editor.command);
    expect(loaded.warnings.join()).toContain("editor.command");
    expect(loaded.sources).toEqual([user, outerCfg, innerCfg]);
    // Three deep: broadest first. A git vault inside has no file of its own, and takes theirs.
    const repo = join(inner, "code");
    mkdirSync(join(repo, ".git"), { recursive: true });
    expect(configFilesFor(locateVault({ path: repo }))).toEqual({ vaultFile: join(repo, ".slipbox", "config.toml"), outerFiles: [outerCfg, innerCfg] });
    expect(loadConfig({ ...configFilesFor(locateVault({ path: repo })), configFile: user }).config.ui.readable_max).toBe(70);
    // The outer vault itself: its own, nothing above. A loose file: the home vault's.
    expect(configFilesFor(locateVault({ path: outer })).outerFiles).toEqual([]);
    // slipbox info says which files, in that order.
    const out: string[] = [];
    await runCli(["info", "--json", "--config", user], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: inner, env: process.env });
    expect(JSON.parse(out.join("")).data.config.sources).toEqual([user, outerCfg, innerCfg]);
  });
});

describe("the index on demand: what the walk leaves out, indexed when reached (20.8)", () => {
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-reach-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".gitignore"), "tmp/\n");
    for (const d of ["tmp", ".notes", "node_modules", "drafts"]) mkdirSync(join(dir, d));
    writeFileSync(join(dir, "index.md"), "[l](tmp/local.md) [h](.notes/hidden.md) [n](node_modules/dep.md) [d](drafts/wip.md) [p](tmp/pic.png)\n");
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
    expect(g.resolveLink({ kind: "markdown", target: "tmp/local.md" }, "index.md")).toMatchObject({ resolvedKind: "note", path: "tmp/local.md" });
    expect(g.backlinks("tmp/local.md").map((b) => b.from)).toEqual(["index.md"]);
    expect(g.backlinks("tmp/deeper.md").map((b) => b.from)).toEqual(["tmp/local.md"]);
    // The filter: only a hidden folder or .gitignore keeps a path from being reached.
    expect(["tmp/x.md", ".notes/x.md", "a/.b/c.md"].map((p) => g.filter.reachable(p))).toEqual([true, true, true]);
    expect(["node_modules/x.md", "drafts/x.md", ".git/x.md", ".slipbox/x.md", "../x.md", "a//b.md"].map((p) => g.filter.reachable(p))).toEqual([false, false, false, false, false, false]);
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
    writeFileSync(join(dir, ".gitignore"), "");
    expect(openGraph(locateVault({ root: dir }), cfg(), true).reached.has("tmp/deeper.md")).toBe(false);
  });

  test("the CLI reaches what it's told to read; a plain folder too, but $HOME, only listed (20.22)", async () => {
    const dir = make();
    writeFileSync(join(dir, ".slipbox", "config.toml"), 'walk.exclude = ["drafts/"]\n');
    const out: string[] = [];
    const cli = async (args: string[], cwd = dir) => {
      out.length = 0;
      const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
      return { code, json: JSON.parse(out.join("")) };
    };
    expect((await cli(["read", "tmp/other.md"])).json.data.content).toBe("# Other\n");
    expect((await cli(["ls"])).json.data.map((n: { path: string }) => n.path)).toContain("tmp/other.md");
    // Never: under node_modules, read all the same, but not the vault's.
    expect((await cli(["read", "node_modules/dep.md"])).code).toBe(0);
    expect((await cli(["ls"])).json.data.map((n: { path: string }) => n.path)).not.toContain("node_modules/dep.md");
    // A plain folder reaches as a vault does (20.22); `$HOME`, only listed, reaches nothing.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-reach-loose-"));
    mkdirSync(join(loose, ".hid"));
    writeFileSync(join(loose, "a.md"), "[h](.hid/h.md)\n");
    writeFileSync(join(loose, ".hid", "h.md"), "# H\n");
    expect(openGraph(locateVault({ path: join(loose, "a.md") }), DEFAULT_CONFIG, false).reachFile(".hid/h.md")).toBe(true);
    const home = process.env.HOME;
    process.env.HOME = loose;
    try {
      expect(openGraph(locateVault({ path: join(loose, "a.md") }), DEFAULT_CONFIG, false).reachFile(".hid/h.md")).toBe(false);
    } finally {
      process.env.HOME = home;
    }
  });
});

test("writers change a reached note in a hidden folder; never one the vault hasn't reached, nor .slipbox/ (20.8)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-reachw-"));
  mkdirSync(join(dir, ".slipbox"));
  mkdirSync(join(dir, ".notes"));
  writeFileSync(join(dir, "index.md"), "[h](.notes/h.md)\n");
  writeFileSync(join(dir, ".notes", "h.md"), "# H\n");
  writeFileSync(join(dir, ".notes", "u.md"), "# U\n");
  const out: string[] = [];
  const cli = async (args: string[]) => {
    out.length = 0;
    return runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
  };
  expect(await cli(["write", ".notes/h.md", "# H\n\nmore"])).toBe(0);
  expect(readFileSync(join(dir, ".notes", "h.md"), "utf8")).toBe("# H\n\nmore\n");
  expect(await cli(["write", ".slipbox/x.md", "no", "--create"])).toBe(5);
  expect(await cli(["write", ".notes/new.md", "no", "--create"])).toBe(5);
  expect(existsSync(join(dir, ".notes", "new.md"))).toBe(false);
});

describe("the background auto-index of the home folder (20.9)", () => {
  const makeHome = () => {
    const home = mkdtempSync(join(tmpdir(), "slipbox-ahome-"));
    const tree: Record<string, string> = {
      "proj/.git/HEAD": "ref: refs/heads/main\n",
      "proj/a.md": "[target](../notes/target.md)\n",
      "notes/.slipbox/config.toml": `[vault]\nid = "n${basename(home)}"\nname = "anotes-${basename(home)}"\n`,
      "notes/target.md": "# Target\n",
      "notes/inner/.slipbox/config.toml": "",
      "notes/inner/i.md": "# I\n",
      ".hidden/h/.git/HEAD": "x\n",
      "node_modules/m/.git/HEAD": "x\n",
      "deep/x/y/.git/HEAD": "x\n",
      "deep/x/y/y.md": "# Y\n",
      "loose/l.md": "# L\n",
    };
    for (const [rel, text] of Object.entries(tree)) {
      mkdirSync(join(home, rel, ".."), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    return home;
  };

  test("finds the vaults in it, nested ones too, never in hidden folders or node_modules; indexes each; listed as found", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { readRegistry } = await import("../src/core/registry.ts");
    const { cacheDir } = await import("../src/core/paths.ts");
    const home = makeHome();
    const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
    let slices = 0;
    while (ai.step(50)) slices++;
    expect(ai.status).toMatchObject({ found: 4, indexed: 4, queue: [], current: null });
    expect(ai.status.passFinished).not.toBeNull();
    const mine = readRegistry().filter((v) => v.path.startsWith(`${home}/`));
    expect(mine.map((v) => v.path.slice(home.length + 1)).sort()).toEqual(["deep/x/y", "notes", "notes/inner", "proj"]);
    for (const v of mine) {
      expect(v.found).toBe(true);
      expect(v.indexed).toBeDefined();
      expect(existsSync(join(cacheDir(v), "index.json"))).toBe(true);
    }
    // A pass done: nothing more for a day.
    expect(ai.idle).toBe(true);
    expect(ai.step(50)).toBe(false);
    expect(slices).toBeGreaterThanOrEqual(0);
  });

  test("a link from a vault never opened, found by it, is a backlink of the vault you open", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const home = makeHome();
    const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
    while (ai.step(50)) {}
    const out: string[] = [];
    await runCli(["backlinks", "target.md", "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: join(home, "notes"), env: process.env });
    expect(JSON.parse(out.join("")).data.backlinks.map((b: { from: string }) => b.from)).toContain(join(home, "proj", "a.md"));
  });

  test("its place is kept: a new run resumes the pass; a day after one is done, the next starts; opened, a vault is no longer only found", async () => {
    const { AutoIndex, REPASS_MS } = await import("../src/core/autoindex.ts");
    const { readRegistry } = await import("../src/core/registry.ts");
    const home = makeHome();
    const file = join(home, "..", `${basename(home)}-progress.json`);
    const first = new AutoIndex(home, file);
    first.step(0);
    const left = [...first.status.queue];
    expect(left.length).toBeGreaterThan(0);
    const again = new AutoIndex(home, file);
    expect(again.status.queue).toEqual(left);
    while (again.step(50)) {}
    expect(again.status.found).toBe(4);
    const later = new AutoIndex(home, file, () => Date.now() + REPASS_MS + 1000);
    expect(later.idle).toBe(false);
    expect(later.step(0)).toBe(true);
    expect(later.status.passFinished).toBeNull();
    // Opened by hand: the mark goes.
    recordLocation(locateVault({ path: join(home, "deep", "x", "y") }));
    expect(readRegistry().find((v) => v.path === join(home, "deep", "x", "y"))?.found).toBeUndefined();
  });

  test("slipbox index --home runs it in the foreground: a pass, or as much as --budget allows", async () => {
    const home = makeHome();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const out: string[] = [];
      const run = async (args: string[]) => {
        out.length = 0;
        await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: join(home, "loose"), env: process.env });
        return JSON.parse(out.join("")).data;
      };
      const r = await run(["index", "--home"]);
      expect(r).toMatchObject({ root: home, found: 4, indexed: 4, left: 0 });
      // Every command leaves its mark: the TUI's auto-index waits while an agent works.
      const { activityFile } = await import("../src/core/autoindex.ts");
      expect(Date.now() - statSync(activityFile()).mtimeMs).toBeLessThan(5000);
      expect(r.finished).not.toBeNull();
      // Done: nothing more until --rebuild.
      expect((await run(["index", "--home"])).finished).toBe(r.finished);
      expect((await run(["index", "--home", "--rebuild", "--budget", "1"])).finished).toBeNull();
    } finally {
      process.env.HOME = before;
    }
  });
});

describe("freshness and coverage (20.10)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const vaultAt = (dir: string, files: Record<string, string>) => {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("slipbox index --refresh <path>: any vault's index brought up to date, opened or not — read again, gone, how fresh", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-fresh-"));
    const here = vaultAt(join(base, "here"), { "h.md": "# H\n" });
    const there = vaultAt(join(base, "there"), { "a.md": "# A\n", "b.md": "# B\n" });
    const first = await cli(["index", "--refresh", there], here);
    expect(first.json.data).toMatchObject({ root: there, notes: 2, changed: 2, gone: 0 });
    expect(first.json.data.indexed).not.toBeNull();
    const { readRegistry } = await import("../src/core/registry.ts");
    expect(readRegistry().find((v) => v.path === there)?.indexed).toBeDefined();
    writeFileSync(join(there, "a.md"), "# A, longer now\n");
    rmSync(join(there, "b.md"));
    expect((await cli(["index", "--refresh", join(there, "a.md")], here)).json.data).toMatchObject({ root: there, notes: 1, changed: 1, unchanged: 0, gone: 1 });
    expect((await cli(["index", "--refresh"], here)).json.data.root).toBe(here); // this one, unnamed
    // A plain folder has an index of its own (20.22); $HOME, only listed, has none.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-fresh-loose-"));
    writeFileSync(join(loose, "l.md"), "# L\n");
    expect((await cli(["index", "--refresh", loose], here)).json.data).toMatchObject({ root: loose, notes: 1 });
    const home = process.env.HOME;
    process.env.HOME = loose;
    try {
      expect((await cli(["index", "--refresh", loose], here)).code).toBe(5);
    } finally {
      process.env.HOME = home;
    }
    expect((await cli(["index", "--refresh", join(base, "nope")], here)).code).toBe(3);
  });

  test("info says how fresh this vault's index is, and where the background index of the home folder has got to", async () => {
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-info-")), { "n.md": "# N\n" });
    await cli(["ls"], dir);
    const info = (await cli(["info"], dir)).json.data;
    expect(info.index.written).not.toBeNull();
    expect(info.index).toMatchObject({ reached: 0, gone: 0 });
    expect(info.background).toMatchObject({ on: true });
    const lines: string[] = [];
    await runCli(["info"], { out: (x: string) => lines.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
    expect(lines.join("")).toMatch(/\nindex {5}written \d{4}-\d\d-\d\d \d\d:\d\d\n/);
    expect(lines.join("")).toMatch(/\nhome {6}background index\b/);
    const { describeBackground } = await import("../src/core/autoindex.ts");
    expect(describeBackground({ on: false, found: 0, indexed: 0, left: 0, finished: null, started: null })).toBe("background index off ([index] background)");
    expect(describeBackground({ on: true, found: 2, indexed: 1, left: 7, finished: null, started: "x" })).toBe("background index: 2 vaults found so far, 7 folders left");
  });

  test("a drive unplugged: its vaults unavailable, not gone — kept, never pruned, and a link into one says why it's broken", async () => {
    const { pruneWorktrees, readRegistry, recordVault, unavailable } = await import("../src/core/registry.ts");
    const drive = `/media/slipbox-test-nodrive-${basename(mkdtempSync(join(tmpdir(), "slipbox-nd-")))}`;
    expect(unavailable(`${drive}/notes`)).toBe(true);
    expect(unavailable("/tmp/certainly/not/here")).toBe(false);
    expect(unavailable(tmpdir())).toBe(false);
    const long = new Date(Date.now() - 60 * 86_400_000);
    recordVault({ key: `${basename(drive)}-v`, id: null, kind: "vault", name: "ondrive", aliases: [], previous_names: [], path: `${drive}/notes` }, long);
    recordVault({ key: `${basename(drive)}-w`, id: null, kind: "vault", name: "ondrive", aliases: [], previous_names: [], path: `${drive}/wt`, worktree: { name: "wt", main: `${drive}/notes` } }, long);
    recordVault({ key: `${basename(drive)}-f`, id: null, kind: "folder", name: null, aliases: [], previous_names: [], path: `${drive}/loose` }, long);
    pruneWorktrees();
    expect(readRegistry().filter((v) => v.path.startsWith(`${drive}/`)).map((v) => v.kind).sort()).toEqual(["folder", "vault", "vault"]);
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-drive-")), { "n.md": `[far](${drive}/notes/a.md) [near](gone.md)\n` });
    const listed = (await cli(["vaults"], dir)).json.data.find((v: { path: string }) => v.path === `${drive}/notes`);
    expect(listed).toMatchObject({ exists: false, unavailable: true });
    const human: string[] = [];
    await runCli(["vaults"], { out: (x: string) => human.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
    expect(human.join("")).toContain(`${drive}/notes`);
    expect(human.join("")).toContain("(unavailable: its drive isn't there)");
    const problems = (await cli(["diagnostics", "n.md", "--severity", "info"], dir)).json.data.problems.map((p: { message: string }) => p.message);
    expect(problems).toContain(`broken link: ${drive}/notes/a.md — its drive isn't there`);
    expect(problems).toContain("no note at gone.md yet");
  });
});

describe("the parse cache by content (20.11)", () => {
  test("a second copy is read from what the first parsed; titles, flags and links are each copy's own", async () => {
    const { sharedParseCache } = await import("../src/core/parsecache.ts");
    const cache = sharedParseCache()!;
    const base = mkdtempSync(join(tmpdir(), "slipbox-pc-"));
    const a = join(base, "a");
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    const tag = basename(base);
    writeFileSync(join(a, "x.md"), `[y](y.md) ${tag}\n`);
    writeFileSync(join(a, "y.md"), `# Why ${tag}\n`);
    writeFileSync(join(a, "plain.md"), `no title here ${tag}\n`);
    const hits = cache.hits;
    const misses = cache.misses;
    const ga = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, true);
    expect([cache.hits - hits, cache.misses - misses]).toEqual([0, 3]);
    // A second copy elsewhere, one note renamed, one written with a BOM (the same text): parsed by none.
    const b = join(base, "b");
    cpSync(a, b, { recursive: true });
    renameSync(join(b, "plain.md"), join(b, "other-name.md"));
    writeFileSync(join(b, "y.md"), `\ufeff# Why ${tag}\n`);
    const h2 = cache.hits;
    const gb = openGraph(locateVault({ root: b }), DEFAULT_CONFIG, true);
    expect(cache.hits - h2).toBe(3); // all three: plain.md under its new name, y.md with its BOM
    expect(gb.entry("other-name.md")!.title).toBe("other-name"); // its own name, the content shared
    expect(ga.entry("plain.md")!.title).toBe("plain");
    expect(gb.entry("y.md")!.title).toBe(`Why ${tag}`);
    expect(gb.entry("y.md")!.flags).toEqual(["bom"]); // the file's, not the content's
    expect(ga.entry("y.md")!.flags).toEqual([]);
    // Links resolved per copy: b's x.md reaches b's y.md.
    expect(gb.backlinks("y.md").map((l) => l.from)).toEqual(["x.md"]);
    expect(gb.resolveLink({ kind: "markdown", target: "y.md" }, "x.md")).toMatchObject({ resolvedKind: "note", path: "y.md" });
    // Changed: parsed again.
    writeFileSync(join(b, "x.md"), `[y](y.md) changed ${tag}\n`);
    const m3 = cache.misses;
    openGraph(locateVault({ root: b }), DEFAULT_CONFIG, true);
    expect(cache.misses - m3).toBe(1);
  });

  test("the key is the text's hash, its format and the parser's version; without a cache, notes are parsed as ever", async () => {
    const { ParseCache } = await import("../src/core/parsecache.ts");
    const { extractNote } = await import("../src/core/graph.ts");
    expect(ParseCache.key("abc", "markdown", 7)).toBe("7:markdown:abc");
    expect(ParseCache.key("abc", "markdown", 8)).not.toBe(ParseCache.key("abc", "markdown", 7));
    const dir = mkdtempSync(join(tmpdir(), "slipbox-pc2-"));
    writeFileSync(join(dir, "n.md"), "# N\n\n[a](a.md)\n");
    const e = extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, null);
    expect(e).toMatchObject({ title: "N", links: [{ target: "a.md" }] });
    // A cache that can't be made: none, and nothing breaks.
    const blocked = join(dir, "file");
    writeFileSync(blocked, "");
    expect(ParseCache.open(join(blocked, "parsed.db"))).toBeNull();
    // Its own file, used and read back.
    const own = ParseCache.open(join(dir, "own.db"))!;
    extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own);
    const again = extractNote({ rel: "m.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own);
    expect([own.hits, own.misses]).toEqual([1, 1]);
    expect(again).toMatchObject({ rel: "m.md", title: "N" });
    // What the cache holds is what's used: nothing parsed on a hit.
    const { INDEX_VERSION } = await import("../src/core/graph.ts");
    const { contentHash } = await import("../src/core/redirects.ts");
    own.put(ParseCache.key(contentHash("# N\n\n[a](a.md)\n"), "markdown", INDEX_VERSION), { title: "From the cache", headings: [], links: [], tags: ["cached"], aliases: [], previous: [] });
    expect(extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own)).toMatchObject({ title: "From the cache", links: [], tags: ["cached"] });
    own.close();
    // SLIPBOX_PARSE_CACHE=off: none (what the bench compares with).
    const { sharedParseCache } = await import("../src/core/parsecache.ts");
    process.env.SLIPBOX_PARSE_CACHE = "off";
    try {
      expect(sharedParseCache()).toBeNull();
    } finally {
      delete process.env.SLIPBOX_PARSE_CACHE;
    }
    expect(sharedParseCache()).not.toBeNull();
  });
});

describe("the vault:path form (20.12)", () => {
  test("a file as it's shown: its path in this vault; name:path in another, a nested one too; ~/ or its path in none", async () => {
    const { vaultForm } = await import("../src/core/names.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-form-"));
    const here = join(base, "here");
    const other = join(base, "other");
    for (const d of [here, other, join(here, "kid")]) mkdirSync(join(d, ".slipbox"), { recursive: true });
    mkdirSync(join(here, "docs"), { recursive: true });
    mkdirSync(join(base, "loose"), { recursive: true });
    const names: Record<string, string> = { [here]: "here", [other]: "research", [join(here, "kid")]: "kid" };
    const nameOf = (root: string) => names[root] ?? null;
    expect(vaultForm(join(here, "docs", "plan.md"), here, nameOf)).toBe("docs/plan.md");
    expect(vaultForm(join(other, "algorithms", "dijkstra.md"), here, nameOf)).toBe("research:algorithms/dijkstra.md");
    expect(vaultForm(join(here, "kid", "k.md"), here, nameOf)).toBe("kid:k.md"); // a vault of its own, inside
    expect(vaultForm(join(here, "docs", "plan.md"), null, nameOf)).toBe("here:docs/plan.md");
    expect(vaultForm(join(base, "loose", "l.md"), here, nameOf)).toBe(join(base, "loose", "l.md"));
    const before = process.env.HOME;
    process.env.HOME = base;
    try {
      expect(vaultForm(join(base, "loose", "l.md"), here, nameOf)).toBe("~/loose/l.md");
    } finally {
      process.env.HOME = before;
    }
  });
});

describe("search by vault (20.16)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
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
    const { scopeRoots } = await import("../src/core/scope.ts");
    const { at } = await four();
    const { openVault } = await import("../src/core/reach.ts");
    const g = openVault(at("a"));
    g.ensureAll();
    expect(scopeRoots(g, "vault")).toEqual([]);
    expect(scopeRoots(g, "linked").sort()).toEqual([at("b"), at("c")].sort());
    const all = scopeRoots(g, "all");
    expect(all.slice(0, 2).sort()).toEqual([at("b"), at("c")].sort()); // nearest first
    expect(all).toContain(at("d"));
    expect(all).not.toContain(at("a"));
  });

  test("slipbox search --scope: this vault by default; linked and all add others', each by name:path, after this one's", async () => {
    const { at, tag } = await four();
    const files = (r: { json: { data: { hits: { shown: string }[] } } }) => r.json.data.hits.map((h) => h.shown);
    const here = await cli(["search", "narwhal"], at("a"));
    expect(files(here)).toEqual(["a-note.md"]);
    expect(here.json.data.scope).toBe("vault");
    const linked = await cli(["search", "narwhal", "--scope", "linked"], at("a"));
    expect(files(linked)[0]).toBe("a-note.md");
    expect(files(linked).slice(1).sort()).toEqual([`b${tag}:b-note.md`, `c${tag}:c-note.md`].sort());
    const hit = linked.json.data.hits.find((h: { vault: string | null }) => h.vault === `b${tag}`);
    expect(hit).toMatchObject({ abs: join(at("b"), "b-note.md"), path: "b-note.md", line: 3 });
    expect(files(await cli(["search", "narwhal", "--scope", "all"], at("a")))).toContain(`d${tag}:d-note.md`);
    expect((await cli(["search", "narwhal", "--scope", "near"], at("a"))).code).toBe(2);
  });
});

describe("repairs from what the state knows (20.17)", () => {
  test("a vault moved: relink fixes its links out by a path, and the other vaults' links into it, each in its form", async () => {
    const out: string[] = [];
    const cli = async (args: string[], cwd: string) => {
      out.length = 0;
      const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
      return { code, json: JSON.parse(out.join("")) };
    };
    const base = mkdtempSync(join(tmpdir(), "slipbox-repair-"));
    const tag = basename(base).replace(/[^a-z0-9]/gi, "");
    const [a, b, c] = ["a", "b", "c"].map((v) => join(base, "x", v)) as [string, string, string];
    for (const [v, dir] of [["a", a], ["b", b], ["c", c]] as const) {
      mkdirSync(dir, { recursive: true });
      await cli(["init", dir, "--name", `${v}${tag}`], dir);
    }
    writeFileSync(join(a, "t.md"), "# T\n");
    writeFileSync(join(a, "out.md"), "[n](../b/n.md#top) and [in](t.md)\n\n[near](../near.md)\n");
    writeFileSync(join(base, "x", "near.md"), "# Near, by the old place\n");
    writeFileSync(join(b, "n.md"), "# Top\n");
    writeFileSync(join(c, "in.md"), `[t](../a/t.md) [abs](${a}/t.md)\n`);
    for (const dir of [a, b, c]) await cli(["ls"], dir);
    // Moved by hand, deeper; opened there and confirmed: its move broke links on two lines (three links).
    const moved = join(base, "y", "deeper", "a");
    mkdirSync(dirname(moved), { recursive: true });
    // A link out that reaches something where it's gone too: not broken, so not touched.
    writeFileSync(join(base, "y", "deeper", "near.md"), "# Near, by the new place\n");
    renameSync(a, moved);
    await cli(["ls"], moved);
    const confirmed = await cli(["vault-moved", a], moved);
    expect(confirmed.json.data.broken).toBe(2);
    const dry = await cli(["relink", "--dry-run"], moved);
    const edits = dry.json.data.files.flatMap((f: { abs: string; edits: { before: string; after: string }[] }) => f.edits.map((e) => [relative(base, f.abs), e.before, e.after]));
    expect(edits.sort()).toEqual(
      [
        ["x/c/in.md", `[t](../a/t.md) [abs](${a}/t.md)`, `[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)`],
        ["y/deeper/a/out.md", "[n](../b/n.md#top) and [in](t.md)", "[n](../../../x/b/n.md#top) and [in](t.md)"],
      ].sort(),
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../a/t.md) [abs](${a}/t.md)\n`); // only shown so far
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect(readFileSync(join(moved, "out.md"), "utf8")).toBe("[n](../../../x/b/n.md#top) and [in](t.md)\n\n[near](../near.md)\n");
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)\n`);
    // Fixed: nothing more to do.
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toEqual([]);
    // Moved again: the last move is the one to read from.
    const again = join(base, "z", "a");
    mkdirSync(dirname(again), { recursive: true });
    renameSync(moved, again);
    await cli(["ls"], again);
    await cli(["vault-moved", moved], again);
    expect((await cli(["relink"], again)).code).toBe(0);
    expect(readFileSync(join(again, "out.md"), "utf8").split("\n")[0]).toBe("[n](../../x/b/n.md#top) and [in](t.md)");
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../z/a/t.md) [abs](${again}/t.md)\n`);
  });
});

describe("generated edits as plans, in two steps (20.18)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const vaultWith = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-plan-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("--plan saves what it would do, writing nothing; slipbox apply writes it once, and it's gone", async () => {
    const dir = vaultWith({ "a.md": "# A\n", "index.md": "[a](a.md)\n" });
    const planned = await cli(["mv", "a", "b", "--plan"], dir);
    expect(planned.code).toBe(0);
    const id = planned.json.data.plan.id;
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md)\n");
    expect((await cli(["apply"], dir)).json.data.find((p: { id: string }) => p.id === id)).toMatchObject({ command: "mv", kind: "note", from: "a.md", to: "b.md", root: dir, files: 2 }); // the note, and index.md
    const dry = await cli(["apply", id, "--dry-run"], dir);
    expect(dry.json.data.files[0].edits[0].after).toBe("[a](b.md)");
    expect(dry.json.warnings.join()).not.toContain("stale");
    const applied = await cli(["apply", id], dir);
    expect(applied.json.data.dryRun).toBe(false);
    expect(existsSync(join(dir, "b.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](b.md)\n");
    expect((await cli(["apply", id], dir)).code).toBe(3); // applied once: gone
    expect((await cli(["apply", "nope"], dir)).code).toBe(3);
    // A plan file that isn't one (cut short, edited by hand): no plan, not a crash.
    const { plansDir } = await import("../src/core/plans.ts");
    writeFileSync(join(plansDir(), "deadbeef.json"), '{"version": 1, "root": 7}');
    expect((await cli(["apply", "deadbeef"], dir)).code).toBe(3);
  });

  test("a stale plan is never applied: a file it changes changed since, nothing is written", async () => {
    const dir = vaultWith({ "a.md": "# A\n", "index.md": "[a](a.md)\n" });
    const id = (await cli(["mv", "a", "c", "--plan"], dir)).json.data.plan.id;
    writeFileSync(join(dir, "index.md"), "[a](a.md) edited meanwhile\n");
    expect((await cli(["apply", id, "--dry-run"], dir)).json.warnings.join()).toContain("stale: index.md changed since it was planned");
    const refused = await cli(["apply", id], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain("changed since the preview");
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md) edited meanwhile\n");
  });
});

describe("renames and moves on paths (20.19)", () => {
  test("a note moved: every file linking in — a note, a reached one, a data file's value, a code comment — and its own links out", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-mv19-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub"));
    mkdirSync(join(dir, "tmp"));
    const files: Record<string, string> = {
      "a.md": "# A\n\n[up](sub/x.md) [self](#a)\n",
      "index.md": "[a](a.md) [h](a.md#a) [l](tmp/local.md)\n",
      "sub/x.md": "[a](../a.md)\n",
      "sub/tool.py": "# see ../a.md for why\nprint(1)\n",
      "run.py": "# see a.md\nprint(1)\n",
      "cfg.toml": 'doc = "a.md"\n',
      ".gitignore": "tmp/\n",
      "tmp/local.md": "[a](../a.md)\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    const out: string[] = [];
    const code = await runCli(["mv", "a", "docs/a", "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: dir, env: process.env });
    expect(code).toBe(0);
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    expect(read("index.md")).toBe("[a](docs/a.md) [h](docs/a.md#a) [l](tmp/local.md)\n");
    expect(read("sub/x.md")).toBe("[a](../docs/a.md)\n");
    expect(read("tmp/local.md")).toBe("[a](../docs/a.md)\n");
    expect(read("cfg.toml")).toBe('doc = "docs/a.md"\n');
    expect(read("run.py")).toBe("# see docs/a.md\nprint(1)\n");
    expect(read("sub/tool.py")).toBe("# see ../docs/a.md for why\nprint(1)\n");
    expect(read("docs/a.md")).toBe("# A\n\n[up](../sub/x.md) [self](#a)\n");
  });
});

describe("links by name, gone from reading (20.22)", () => {
  test("a wikilink resolves to nothing, said why; the converter's legacy reader still finds its note", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-noname-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "a.md"), "# A\n\n[[b]]\n");
    writeFileSync(join(dir, "notes", "b.md"), "---\naliases: [bee]\n---\n# B\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    for (const target of ["b", "bee", "notes/b"]) {
      expect(g.resolveLink({ kind: "wiki", target }, "a.md")).toMatchObject({ resolvedKind: "unresolved", reason: "a wikilink isn't a link: slipbox convert-links rewrites it as a path" });
      expect(g.resolveLegacyWiki({ kind: "wiki", target }, "a.md")).toMatchObject({ resolvedKind: "note", path: "notes/b.md" });
    }
    // Nothing links to b: [[b]] is text.
    expect(g.backlinks("notes/b.md")).toEqual([]);
  });
});

describe("the CLI's vault:path (20.20)", () => {
  const v = (key: string, name: string | null, path: string, extra: Partial<KnownVault> = {}): KnownVault => ({ key, id: null, kind: "vault", name, aliases: [], previous_names: [], path, seen: "", ...extra });

  test("a vault by the name it's shown with, or its own when no other has it; the path from its root, never out of it", async () => {
    const { fromVaultForm } = await import("../src/core/names.ts");
    const known = [v("a", "docs", "/home/me/work/docs"), v("b", "docs", "/home/me/home/docs"), v("c", "research", "/r/research", { aliases: ["old-research"] }), v("w", "research", "/r/wt", { aliases: ["old-research"], worktree: { name: "wt", main: "/r/research" } }), v("f", "loose", "/f", { kind: "folder" })];
    const branch = () => "refactor";
    expect(fromVaultForm("work.docs:a/b.md", known, branch)).toEqual({ root: "/home/me/work/docs", rel: "a/b.md", abs: "/home/me/work/docs/a/b.md" });
    expect(fromVaultForm("Research:algorithms/dijkstra.md", known, branch)?.abs).toBe("/r/research/algorithms/dijkstra.md");
    expect(fromVaultForm("WORK.docs:a.md", known, branch)?.abs).toBe("/home/me/work/docs/a.md"); // case doesn't count
    expect(fromVaultForm("research@refactor:x.md", known, branch)?.abs).toBe("/r/wt/x.md");
    expect(fromVaultForm("old-research:x.md", known, branch)?.abs).toBe("/r/research/x.md"); // its old name, no other's
    expect(fromVaultForm("research:", known, branch)).toEqual({ root: "/r/research", rel: "", abs: "/r/research" });
    expect(fromVaultForm("docs:a.md", known, branch)).toBeNull(); // two vaults' own name: neither
    expect(fromVaultForm("research:../other/x.md", known, branch)).toBeNull();
    expect(fromVaultForm("loose:x.md", known, branch)).toBeNull(); // a folder isn't a vault
    expect(fromVaultForm("Meeting: Q3", known, branch)).toBeNull();
    expect(fromVaultForm(":x.md", known, branch)).toBeNull();
  });

  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: code === 2 ? null : JSON.parse(out.join("")) };
  };
  const human = async (args: string[], cwd: string) => {
    const lines: string[] = [];
    await runCli(args, { out: (x: string) => lines.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return lines.join("");
  };
  /** a's notes/plan.md links to b's algorithms/dijkstra.md. */
  const two = async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-vform-"));
    const tag = basename(base).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const at = (x: string) => join(base, x);
    for (const x of ["a", "b"]) {
      mkdirSync(at(x), { recursive: true });
      await cli(["init", at(x), "--name", `${x}${tag}`], at(x));
    }
    mkdirSync(join(at("a"), "notes"));
    mkdirSync(join(at("b"), "algorithms"));
    writeFileSync(join(at("a"), "notes", "plan.md"), "# Plan\n\n[shortest](../../b/algorithms/dijkstra.md)\n");
    writeFileSync(join(at("a"), "notes", "other.md"), "# Other\n");
    writeFileSync(join(at("b"), "algorithms", "dijkstra.md"), "# Dijkstra\n\n## Relaxation\n\nEdges.\n");
    for (const x of ["a", "b"]) await cli(["ls"], at(x)); // each indexed and known, as when opened
    return { at, a: `a${tag}`, b: `b${tag}` };
  };

  test("in: a note argument names a file of that vault, and the command works there", async () => {
    const { at, a, b } = await two();
    const read = await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"));
    expect(read.code).toBe(0);
    expect(read.json.data).toMatchObject({ path: "algorithms/dijkstra.md" });
    expect(read.json.data.content).toContain("## Relaxation");
    expect((await cli(["outline", `${b}:algorithms/dijkstra.md`], at("a"))).json.data.headings[1]).toMatchObject({ text: "Relaxation" });
    // Backlinks of b's note, asked from a: a's link among them, a's own path shown as a's.
    const bl = (await cli(["backlinks", `${b}:algorithms/dijkstra.md`], at("a"))).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(at("a"), "notes", "plan.md"), shown: `${a}:notes/plan.md` }));
    // find's note is its second argument; context takes several.
    expect((await cli(["find", "Edges", `${b}:algorithms/dijkstra.md`], at("a"))).code).toBe(0);
    expect((await cli(["context", `${a}:notes/other.md`, `${a}:notes/plan.md`], at("b"))).json.data.start).toEqual(["notes/other.md", "notes/plan.md"]);
    // Each argument itself: the first saying which vault never stands for the rest.
    expect((await cli(["context", "notes/other.md", "notes/plan.md"], at("a"))).json.data.start).toEqual(["notes/other.md", "notes/plan.md"]);
    // --from too.
    expect((await cli(["resolve", "other.md", "--from", `${a}:notes/plan.md`], at("b"))).json.data).toMatchObject({ status: "resolved", path: "notes/other.md" });
    // No vault by that name: a name, as before — not found.
    expect((await cli(["read", "nope:x.md"], at("a"))).code).toBe(3);
    // A file by that very name is itself: a path wins.
    mkdirSync(join(at("a"), `${b}:algorithms`));
    writeFileSync(join(at("a"), `${b}:algorithms`, "dijkstra.md"), "# Local\n");
    expect((await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"))).json.data.content).toBe("# Local\n");
  });

  test("resolve: a vault:path, and with --from the relative path a link there would carry", async () => {
    const { at, a, b } = await two();
    const r = await cli(["resolve", `${b}:algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"], at("a"));
    expect(r.json.data).toMatchObject({ status: "resolved", path: join(at("b"), "algorithms", "dijkstra.md"), abs: join(at("b"), "algorithms", "dijkstra.md"), shown: `${b}:algorithms/dijkstra.md`, href: "../../b/algorithms/dijkstra.md#relaxation", heading: "Relaxation", line: 3, vault: b });
    // This vault's own: its path here.
    const own = await cli(["resolve", `${a}:notes/other.md`, "--from", "notes/plan.md"], at("a"));
    expect(own.json.data).toMatchObject({ status: "resolved", path: "notes/other.md", shown: "notes/other.md", href: "other.md", vault: null });
    // A folder too; a file that isn't there, not.
    expect((await cli(["resolve", `${b}:algorithms`, "--from", "notes/plan.md"], at("a"))).json.data).toMatchObject({ status: "resolved", abs: join(at("b"), "algorithms"), href: "../../b/algorithms" });
    expect((await cli(["resolve", `${b}:algorithms/nope.md`, "--from", "notes/plan.md"], at("a"))).code).toBe(3);
    // Without --from: no link to write.
    expect((await cli(["resolve", `${b}:algorithms/dijkstra.md`], at("a"))).json.data).toMatchObject({ status: "resolved", href: null });
    // A path's href too, with the spaces a link encodes.
    writeFileSync(join(at("a"), "notes", "a note.md"), "# A note\n");
    expect((await cli(["resolve", "a note.md", "--from", "notes/plan.md"], at("a"))).json.data.href).toBe("a%20note.md");
  });

  test("out: links and backlinks show another vault's file as vault:path", async () => {
    const { at, a, b } = await two();
    const links = (await cli(["links", "notes/plan.md"], at("a"))).json.data;
    expect(links[0]).toMatchObject({ path: join(at("b"), "algorithms", "dijkstra.md"), shown: `${b}:algorithms/dijkstra.md`, vault: b });
    expect(await human(["links", "notes/plan.md"], at("a"))).toContain(`-> ${b}:algorithms/dijkstra.md\n`);
    const bl = (await cli(["backlinks", "algorithms/dijkstra.md"], at("b"))).json.data.backlinks;
    expect(bl[0]).toMatchObject({ shown: `${a}:notes/plan.md` });
    expect(await human(["backlinks", "algorithms/dijkstra.md"], at("b"))).toContain(`${a}:notes/plan.md:3  shortest`);
  });

  test("mv and cp: a destination in this vault by vault:path; another vault's is refused", async () => {
    const { at, a, b } = await two();
    const moved = await cli(["mv", `${b}:algorithms/dijkstra.md`, `${b}:graphs/dijkstra.md`, "--dry-run"], at("a"));
    expect(moved.code).toBe(0);
    expect(moved.json.data).toMatchObject({ from: "algorithms/dijkstra.md", to: "graphs/dijkstra.md", dryRun: true });
    const across = await cli(["mv", `${b}:algorithms/dijkstra.md`, `${a}:dijkstra.md`, "--dry-run"], at("a"));
    expect(across.code).toBe(5);
    expect(across.json.error.message).toContain("in another vault");
    expect((await cli(["cp", `${b}:algorithms/dijkstra.md`, `${b}:algorithms/copy.md`], at("a"))).code).toBe(0);
    expect(existsSync(join(at("b"), "algorithms", "copy.md"))).toBe(true);
  });
});

describe("the merge review (20.21)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: code === 2 ? null : JSON.parse(out.join("")) };
  };
  const human = async (args: string[], cwd: string) => {
    const lines: string[] = [];
    await runCli(args, { out: (x: string) => lines.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return lines.join("");
  };
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const put = (root: string, rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  /**
   * main and refactor parted at a base. refactor moves docs/plan.md, deletes docs/old.md, moves
   * docs/e.md without its link, adds docs/d.md linking nowhere; main adds docs/b.md linking to both.
   * Both change shared.md: a conflict.
   */
  const branches = () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    put(root, "docs/plan.md", "# Plan\n\n## Goals\n\nThe plan, long enough to be known by its text when it moves.\n");
    put(root, "docs/old.md", "# Old\n");
    put(root, "docs/plan2.md", "# Plan two\n");
    put(root, "docs/my plan.md", "# Mine\n\nA plan of my own, long enough to be known by its text when it moves.\n");
    put(root, "docs/e.md", "# E\n\n[two](plan2.md)\n");
    put(root, "docs/f.md", "# F\n\n[gone](gone.md)\n");
    put(root, "docs/g.md", "# G\n\n[old](old.md)\n");
    put(root, "docs/h.md", "# H\n\n[two](plan2.md) [up](../shared.md) [case](Plan2.md)\n");
    put(root, "shared.md", "one\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    git(root, "mv", "docs/plan.md", "docs/new-plan.md");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/new-plan.md", "docs/new/plan.md");
    git(root, "rm", "-q", "docs/old.md");
    git(root, "mv", "docs/my plan.md", "docs/new/my plan.md");
    mkdirSync(join(root, "notes"));
    git(root, "mv", "docs/e.md", "notes/e.md");
    put(root, "docs/d.md", "# D\n\n[nowhere](nowhere.md) [two](Plan2.md)\n"); // a note's path in any case reaches it
    put(root, ".hidden/x.md", "[nowhere](nowhere.md)\n"); // not the vault's: the walk leaves it out
    put(root, "shared.md", "theirs\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "refactor");
    git(root, "checkout", "-q", "main");
    put(root, "docs/b.md", `# B\n\n[the plan](plan.md#goals) and [old](old.md)\n\n[by its path](${root}/docs/plan.md) [mine](my%20plan.md)\n`);
    put(root, "shared.md", "ours\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "main");
    return root;
  };
  const brief = (r: { json: { data: { breaks: { path: string; target: string; cause: string; by: string; to: string | null; fix: string | null }[] } } }) =>
    r.json.data.breaks.map((b) => [b.path, b.target, b.cause, b.by, b.to, b.fix]);

  test("merging a branch here: each link its result breaks, with the cause and the fix; nothing written", async () => {
    const root = branches();
    if (!root) return;
    const head = git(root, "rev-parse", "HEAD").stdout.toString().trim();
    const r = await cli(["merge-review", "refactor"], root);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ into: "main", from: "refactor", conflicts: ["shared.md"] });
    expect(brief(r)).toEqual([
      ["docs/b.md", "plan.md#goals", "moved", "refactor", "docs/new/plan.md", "new/plan.md#goals"],
      ["docs/b.md", "old.md", "deleted", "refactor", null, null],
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", "new/plan.md"],
      ["docs/b.md", "my%20plan.md", "moved", "refactor", "docs/new/my plan.md", "new/my%20plan.md"],
      ["docs/d.md", "nowhere.md", "missing", "refactor", null, null],
      ["docs/g.md", "old.md", "deleted", "refactor", null, null], // unchanged here: what it names went
      ["notes/e.md", "plan2.md", "note-moved", "refactor", "docs/plan2.md", "../docs/plan2.md"],
    ]);
    expect(r.json.data.breaks[0]).toMatchObject({ line: 3, column: 1, names: "docs/plan.md" });
    // Broken already here (f.md), or reaching (h.md): not the merge's.
    // The working tree and HEAD as they were.
    expect(git(root, "rev-parse", "HEAD").stdout.toString().trim()).toBe(head);
    expect(git(root, "status", "--porcelain").stdout.toString()).toBe("");
    const text = await human(["merge-review", "refactor"], root);
    expect(text).toStartWith("merging refactor into main: 7 links would break; git can't merge 1 file (shared.md)\n");
    expect(text).toContain("  docs/b.md:3:1  plan.md#goals — refactor moves docs/plan.md to docs/new/plan.md — the fix: new/plan.md#goals\n");
    expect(text).toContain("  notes/e.md:3:1  plan2.md — refactor moves this note; the link named docs/plan2.md — the fix: ../docs/plan2.md\n");
  });

  test("--into: this branch into another, the same result; the other way round, only what breaks there", async () => {
    const root = branches();
    if (!root) return;
    const here = brief(await cli(["merge-review", "refactor"], root));
    git(root, "checkout", "-q", "refactor");
    expect(brief(await cli(["merge-review", "refactor", "--into", "main"], root))).toEqual(here);
    // main into refactor: refactor's own broken links aren't the merge's; main's new note's are.
    const back = await cli(["merge-review", "main"], root);
    expect(back.json.data).toMatchObject({ into: "refactor", from: "main" });
    expect(brief(back)).toEqual([
      ["docs/b.md", "plan.md#goals", "moved", "refactor", "docs/new/plan.md", "new/plan.md#goals"],
      ["docs/b.md", "old.md", "deleted", "refactor", null, null],
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", "new/plan.md"],
      ["docs/b.md", "my%20plan.md", "moved", "refactor", "docs/new/my plan.md", "new/my%20plan.md"],
    ]);
    // A link refactor wrote to nothing, merged back into main: refactor's own (main's view: `missing`, by refactor).
    git(root, "checkout", "-q", "main");
    expect(brief(await cli(["merge-review", "refactor"], root)).find((b) => b[0] === "docs/d.md")).toEqual(["docs/d.md", "nowhere.md", "missing", "refactor", null, null]);
    git(root, "checkout", "-q", "refactor");
    expect((await cli(["merge-review", "nope"], root)).code).toBe(3);
    // Nothing to break: said so.
    git(root, "checkout", "-q", "-b", "same", "main");
    expect(await human(["merge-review", "main"], root)).toBe("merging main into same: no link would break\n");
  });

  test("a vault in a folder of its repository: its own paths; a file moved out of it is gone from it", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-mergesub-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const vault = join(root, "notes");
    put(root, "notes/.slipbox/config.toml", `[vault]\nid = "sub${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "sub"\n`);
    put(root, "notes/a.md", "# A\n\nLong enough to be the same file once it moves out.\n");
    put(root, "notes/b.md", "# B\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "out");
    git(root, "mv", "notes/a.md", "a.md");
    git(root, "commit", "-q", "-m", "a leaves the vault");
    git(root, "checkout", "-q", "main");
    put(root, "notes/b.md", "# B\n\n[a](a.md)\n");
    git(root, "commit", "-q", "-am", "b links a");
    const r = await cli(["merge-review", "out"], vault);
    expect(brief(r)).toEqual([["b.md", "a.md", "deleted", "out", null, null]]);
  });

  test("outside git: exit 3", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    mkdirSync(join(dir, ".slipbox"));
    expect((await cli(["merge-review", "main"], dir)).code).toBe(3);
  });

  test("after a merge or a pull: git's renames are evidence — a broken link says where its file went; relink fixes it", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merged-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\nA second line.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "elsewhere");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    writeFileSync(join(root, "docs", "a.md"), `${readFileSync(join(root, "docs", "a.md"), "utf8")}Changed as it moved: no longer the same text.\n`);
    git(root, "commit", "-q", "-am", "moved");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root); // seen on main, as it was
    git(root, "checkout", "-q", "elsewhere");
    await cli(["ls"], root); // and on elsewhere: each branch's place kept apart
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--ff-only", "elsewhere"); // a pull, as far as this copy can tell
    git(root, "pack-refs", "--all"); // the branch's commit in packed-refs only
    const p = (await cli(["problems"], root)).json.data;
    expect(p.broken).toContainEqual(expect.objectContaining({ from: "b.md", target: "a.md", moved: "docs/a.md", reason: "moved to docs/a.md — relink fixes it" }));
    const { openVault } = await import("../src/core/reach.ts");
    expect(openVault(root).redirects?.all()["a.md"]).toMatchObject({ to: "docs/a.md", by: expect.stringMatching(/^[0-9a-f]{7}\.\.[0-9a-f]{7}$/) });
    await cli(["relink"], root);
    expect(readFileSync(join(root, "b.md"), "utf8")).toBe("# B\n\n[a](docs/a.md)\n");
  });

  test("a repository appearing while it's watched: where its branch is, seen at once — its next merge has a before", async () => {
    const { VaultFeed } = await import("../src/core/vault-feed.ts");
    const { checkoutOf } = await import("../src/core/git.ts");
    const { openVault } = await import("../src/core/reach.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-appear-"));
    put(root, ".slipbox/config.toml", `[vault]\nid = "ap${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "appear"\n`);
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    const g = openVault(root);
    let c: ReturnType<typeof checkoutOf> = null;
    const heard: [string, string][][] = [];
    const feed = new VaultFeed({ checkout: () => c, graph: () => g, now: () => Date.now(), apply: () => {}, headMoved: (_was, _now, moves) => heard.push(moves) });
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    c = checkoutOf(root);
    expect(feed.checkHead()).toBe(true); // it appeared: nothing moved, but where main is, kept
    expect(heard).toEqual([]);
    git(root, "checkout", "-q", "-b", "elsewhere");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--ff-only", "elsewhere");
    expect(feed.checkHead()).toBe(true);
    expect(heard).toEqual([[["a.md", "docs/a.md"]]]);
  });

  test("a branch switch isn't a merge: what only the other branch moved is no move here", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-switched-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "elsewhere");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root);
    git(root, "checkout", "-q", "elsewhere");
    const p = (await cli(["problems"], root)).json.data;
    expect(p.broken).toContainEqual(expect.objectContaining({ from: "b.md", target: "a.md", moved: null, reason: null }));
    const { openVault } = await import("../src/core/reach.ts");
    expect(openVault(root).redirects?.all()["a.md"]).toBeUndefined();
  });
});

describe("roots from markers (21.1)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const tree = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-markers-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      if (rel.endsWith("/")) mkdirSync(join(dir, rel), { recursive: true });
      else writeFileSync(join(dir, rel), text);
    }
    return dir;
  };

  test("an Obsidian vault and a zk notebook are roots: found from inside, skipped by the root around them", async () => {
    const dir = tree({ "top.md": "# Top\n", ".slipbox/": "", "obs/.obsidian/": "", "obs/deep/n.md": "# N\n", "zk/.zk/": "", "zk/z.md": "# Z\n" });
    expect(findVaultRoot(join(dir, "obs", "deep", "n.md"))).toBe(join(dir, "obs"));
    expect(findVaultRoot(join(dir, "zk", "z.md"))).toBe(join(dir, "zk"));
    expect(locateVault({ path: join(dir, "obs", "deep", "n.md") })).toMatchObject({ mode: "vault", root: join(dir, "obs") });
    // The root around them leaves them to themselves, as it does a nested repository.
    expect((await cli(["ls"], dir)).json.data.map((n: { path: string }) => n.path)).toEqual(["top.md"]);
    expect((await cli(["ls"], join(dir, "obs", "deep"))).json.data.map((n: { path: string }) => n.path)).toEqual(["deep/n.md"]);
  });

  test("several markers in one folder make one root; $HOME is never one, whatever it holds", () => {
    const dir = tree({ ".git/": "", ".obsidian/": "", ".zk/": "", "a.md": "# A\n" });
    expect(markersAt(dir)).toEqual([".git", ".obsidian", ".zk"]);
    expect(findVaultRoot(join(dir, "a.md"))).toBe(dir);
    const before = process.env.HOME;
    process.env.HOME = dir;
    try {
      expect(isVaultRoot(dir)).toBe(false);
    } finally {
      process.env.HOME = before;
    }
  });

  test("root_markers in your config decide what a root is; --config's too", async () => {
    const dir = tree({ "top.md": "# Top\n", ".slipbox/": "", "obs/.obsidian/": "", "obs/n.md": "# N\n", "foam/.foam/": "", "foam/f.md": "# F\n" });
    const cfg = join(dir, "..", `${basename(dir)}-config.toml`);
    writeFileSync(cfg, '[walk]\nroot_markers = [".slipbox", ".foam"]\n');
    try {
      // .obsidian/ no longer marks a root: its notes are the outer root's; .foam/ does.
      const notes = (await cli(["ls", "--config", cfg], dir)).json.data.map((n: { path: string }) => n.path).sort();
      expect(notes).toEqual(["obs/n.md", "top.md"]);
      expect(findVaultRoot(join(dir, "foam", "f.md"))).toBe(join(dir, "foam"));
    } finally {
      setRootMarkers(null);
    }
    expect(findVaultRoot(join(dir, "obs", "n.md"))).toBe(join(dir, "obs")); // the default again
  });

  test("a folder's own config can't say where roots are; names only, never paths", () => {
    const dir = tree({ ".slipbox/config.toml": '[walk]\nroot_markers = [".nothing"]\n' });
    const vaultSays = loadConfig({ vaultFile: join(dir, ".slipbox", "config.toml") });
    expect(vaultSays.config.walk.root_markers).toEqual(DEFAULT_CONFIG.walk.root_markers);
    expect(vaultSays.warnings.join()).toContain("sets walk.root_markers, which only your own config may set (it decides where roots are)");
    const user = join(dir, "user.toml");
    writeFileSync(user, '[walk]\nroot_markers = [".git", "a/b", "..", ""]\n');
    const userSays = loadConfig({ configFile: user });
    expect(userSays.config.walk.root_markers).toEqual([".git"]);
    expect(userSays.warnings.join()).toContain('walk.root_markers takes names (".git", ".obsidian"), not paths; ignored ["a/b","..",""]');
  });

  test("deinit takes .slipbox/ away only where it's the only marker: an Obsidian vault stays a root", async () => {
    const dir = tree({ ".slipbox/": "", "top.md": "# Top\n", "obs/.obsidian/": "", "obs/.slipbox/config.toml": '[vault]\nid = "obsdeinit000001"\nname = "obsd"\n', "obs/n.md": "# N\n" });
    const r = await cli(["deinit", join(dir, "obs"), "--dry-run"], dir);
    expect(r.code).toBe(5);
    expect(r.json.error.message).toContain("obs is a root by its .obsidian too: it stays one, with or without .slipbox/");
    const plain = await cli(["deinit", join(dir, "nope")], dir);
    expect(plain.code).toBe(5);
  });
});
