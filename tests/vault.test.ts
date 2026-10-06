// The fixture vault (0.5) against the walk (0.11), discovery (1.1), the graph and the CLI (9.x).

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { CLI_COMMANDS, runCli } from "../src/cli/cli.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { applyPlan, planHeadingRename, planRelink, planUndo } from "../src/core/rename.ts";
import { findVaultRoot, folderAt, gitRootOf, initVault, isListed, isVaultRoot, locateVault, markersAt, recordLocation, setRootMarkers } from "../src/core/vault.ts";
import { implicitName, type KnownRoot } from "../src/core/registry.ts";
import { cacheDir, vaultKey } from "../src/core/paths.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { glyphsFor } from "../src/core/glyphs.ts";

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
  test("a folder moved in brings its attachments with its notes: `![[dal.png]]` finds the picture in it (21.3)", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-adopt-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-adopt-out-"));
    mkdirSync(join(outside, "photos", "old"), { recursive: true });
    writeFileSync(join(outside, "photos", "dal.png"), "png");
    writeFileSync(join(outside, "photos", "old", "flip.jpg"), "jpg");
    writeFileSync(join(outside, "photos", "captions.md"), "# Captions\n");
    const changed: { rel: string; isNote: boolean }[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      known: new Map(),
      onBatch: (b) => changed.push(...b.changes.map((c) => ({ rel: c.rel, isNote: c.isNote }))),
      onDegraded: () => {},
    });
    try {
      renameSync(join(outside, "photos"), join(dir, "photos"));
      await until(() => changed.length >= 3);
      expect(changed.sort((a, b) => a.rel.localeCompare(b.rel))).toEqual([
        { rel: "photos/captions.md", isNote: true },
        { rel: "photos/dal.png", isNote: false },
        { rel: "photos/old/flip.jpg", isNote: false },
      ]);
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

describe("links in a component's comments (16.10, 16.22)", () => {
  test("a path in a Vue component's script comment, or its template's: a link and a backlink, at its place in the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-complinks-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "design.md"), "# Design\n");
    writeFileSync(join(dir, "Card.vue"), '<template>\n  <!-- the layout: design.md -->\n  <p>x</p>\n</template>\n<script setup lang="ts">\n  // why: design.md\n  const s = "design.md";\n</script>\n');
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await g.loadGrammars(); // Vue's, and TypeScript's for its script
    expect(g.linksOf("Card.vue").map((l) => [l.target, l.resolvedKind, l.line, l.column])).toEqual([
      ["/design.md", "note", 2, 20],
      ["/design.md", "note", 6, 11], // in the script, where it is in the file
    ]);
    expect(g.backlinks("design.md").map((b) => [b.from, b.line])).toEqual([["Card.vue", 2], ["Card.vue", 6]]);
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

describe("a root's identity, its state by path, the machine's roots (17.3–17.6, 21.8)", () => {
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

  test("init: settings, and a name and an id only when one is given (21.10); the config loader skips [vault]", async () => {
    const dir = join(fresh("init"), "Field Notes");
    mkdirSync(dir);
    const r = await cli(["init", dir, "--json"], dir);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ created: true, name: null, id: null });
    const cfg = join(dir, ".slipbox", "config.toml");
    expect(readFileSync(cfg, "utf8")).not.toContain("[vault]");
    // Never named by its folder's own name (21.6): unnamed until one is given.
    expect(locateVault({ path: dir })).toMatchObject({ mode: "vault", id: null, name: null, key: vaultKey(dir) });
    const tag = `fn${basename(dirname(dir)).slice(-6).toLowerCase()}`;
    const named = await cli(["init", dir, "--name", tag, "--json"], dir);
    const id = named.json.data.id;
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(named.json.data).toMatchObject({ created: false, identified: true, name: tag });
    expect(readFileSync(cfg, "utf8")).toContain(`[vault]\nid = "${id}"\nname = "${tag}"`);
    // [vault] is identity, not a setting: no "unknown key" warning.
    const info = await cli(["info", "--json"], dir);
    expect(info.json.warnings).toEqual([]);
    expect(info.json.data).toMatchObject({ name: tag, folder: { name: tag, id } });
    // …and in the user's config it's a mistake worth a word.
    const user = join(fresh("user"), "config.toml");
    writeFileSync(user, '[vault]\nname = "x"\n');
    expect(loadConfig({ configFile: user }).warnings.join()).toContain("[vault] belongs in a vault's");
  });

  test("a .slipbox/ is never written to on its own (21.8): opened, read as it is; named only when asked", async () => {
    const dir = fresh("old");
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), "# mine\n[walk]\nexclude = [\"x/\"]\n");
    const loc = locateVault({ path: dir });
    expect(loc).toMatchObject({ id: null, name: null, key: vaultKey(dir) });
    await cli(["ls"], dir);
    expect(readFileSync(join(dir, ".slipbox", "config.toml"), "utf8")).toBe("# mine\n[walk]\nexclude = [\"x/\"]\n");
    expect((await cli(["init", "--json"], dir)).json.data).toMatchObject({ created: false, identified: false, name: null });
    // Named when asked: its comments kept.
    const tag = `old${basename(dir).slice(-6).toLowerCase()}`;
    const r = await cli(["init", "--name", tag, "--json"], dir);
    expect(r.json.data).toMatchObject({ identified: true, name: tag });
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    expect(cfg.startsWith("# mine\n[walk]\nexclude = [\"x/\"]\n")).toBe(true);
    expect(locateVault({ path: dir })).toMatchObject({ id: r.json.data.id, name: tag });
    // init --name on a named one: that's slipbox name's.
    expect((await cli(["init", "--name", "other-name", "--json"], dir)).json.error.message).toContain("slipbox name other-name");
    // A config that doesn't parse (a typo mid-edit) is read as having no name, and never written to.
    const broken = fresh("broken");
    mkdirSync(join(broken, ".slipbox"));
    writeFileSync(join(broken, ".slipbox", "config.toml"), "[walk\n");
    expect(locateVault({ path: broken }).name).toBeNull();
    await cli(["ls"], broken);
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

  test("names: one a different folder has is refused, with one that isn't — x-<folder> inside x, -2 when taken (17.5, 21.6)", async () => {
    const { suggestFolderName } = await import("../src/core/folders.ts");
    const base = fresh("names");
    const tag = `xn${basename(base).slice(-6).toLowerCase()}`;
    const top = join(base, "x");
    mkdirSync(join(top, "plan"), { recursive: true });
    expect((await cli(["init", top, "--name", tag, "--json"], top)).json.data.name).toBe(tag);
    // A root inside it: one of its own, unnamed unless named.
    expect((await cli(["init", join(top, "plan"), "--json"], top)).json.data).toMatchObject({ root: join(top, "plan"), name: null });
    const other = join(base, "y");
    mkdirSync(other);
    const refused = await cli(["init", other, "--name", tag, "--json"], other);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain(`a different folder is called "${tag}", at ${top}`);
    expect(refused.json.error.message).toContain('try "y"');
    expect((await cli(["init", other, "--name", "a:b"], other)).code).toBe(5);
    // The suggestion: prefixed with the root it sits in; a name taken gets -2.
    expect(suggestFolderName(join(top, "notes"), tag)).toBe(`${tag}-notes`);
    const again = join(base, tag);
    mkdirSync(again);
    expect(suggestFolderName(again, null)).toBe(`${tag}-2`);
  });

  test("state by path (21.8): each copy its own; a named folder moved by hand takes its state along — sure, never a guess", async () => {
    const { PositionStore, loadSession, saveSession } = await import("../src/core/position.ts");
    const { readRoots } = await import("../src/core/registry.ts");
    const { lookupFolder } = await import("../src/core/folders.ts");
    const { stateDir } = await import("../src/core/paths.ts");
    const base = fresh("moves");
    const tag = `mv${basename(base).slice(-6).toLowerCase()}`;
    const a = join(base, "orig");
    mkdirSync(a);
    await cli(["init", a, "--name", tag], a);
    const locA = locateVault({ path: a });
    expect(locA.key).toBe(vaultKey(a));
    const pa = new PositionStore(locA);
    pa.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 9 });
    pa.save();
    saveSession(locA, { version: 1, tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true });
    // A copy made while the original is there: its own state, by its path.
    const b = join(base, "copy");
    cpSync(a, b, { recursive: true });
    await cli(["ls"], b);
    expect(new PositionStore(locateVault({ path: b })).get("n.md")).toBeNull();
    expect(loadSession(locateVault({ path: b }))).toBeNull();
    // The original moved by hand: its id at a new path, nothing at the old one, the only copy gone — its
    // state comes along, and it's said once.
    const c = join(base, "moved");
    renameSync(a, c);
    const said = await cli(["ls", "--json"], c);
    expect(said.json.warnings.join()).toContain(`moved here from ${a}`);
    const locC = locateVault({ path: c });
    expect(new PositionStore(locC).get("n.md")?.line).toBe(9);
    expect(loadSession(locC)?.tabs).toHaveLength(1);
    expect(existsSync(stateDir(locA))).toBe(false);
    // Its move kept (for the relink, 20.17); the old place forgotten; links to the name open it now.
    expect(readRoots().find((v) => v.path === c)?.moved?.map((m) => [m.from, m.to])).toEqual([[a, c]]);
    expect(readRoots().some((v) => v.path === a)).toBe(false);
    expect(lookupFolder(tag)).toMatchObject({ status: "found", path: c });
    expect((await cli(["ls", "--json"], c)).json.warnings.join()).not.toContain("moved here"); // once
    // Found where it went by the background index before it's opened there: still its move, when opened.
    const c3 = join(base, "found-first");
    const { recordFolder } = await import("../src/core/folders.ts");
    const { recordRoot } = await import("../src/core/registry.ts");
    renameSync(c, c3);
    recordRoot({ kind: "vault", path: c3, found: true });
    recordFolder(c3, { found: true });
    expect((await cli(["ls", "--json"], c3)).json.warnings.join()).toContain(`moved here from ${c}`);
    expect(new PositionStore(locateVault({ path: c3 })).get("n.md")?.line).toBe(9);
    renameSync(c3, c);
    await cli(["ls"], c);
    // Two copies gone at once: which one moved isn't sure — a fresh start, nothing said.
    const c2 = join(base, "moved-again");
    const b2 = join(base, "copy-moved");
    renameSync(c, c2);
    renameSync(b, b2);
    const unsure = await cli(["ls", "--json"], c2);
    expect(unsure.json.warnings.join()).not.toContain("moved here");
    expect(new PositionStore(locateVault({ path: c2 })).get("n.md")).toBeNull();
    // A root with no name has nothing to be known again by: moved, it starts fresh.
    const plain = join(base, "plain");
    mkdirSync(join(plain, ".slipbox"), { recursive: true });
    const pp = new PositionStore(locateVault({ path: plain }));
    pp.set("p.md", { heading: null, headingIndex: 0, offset: 0, line: 5 });
    pp.save();
    await cli(["ls"], plain);
    renameSync(plain, join(base, "plain-moved"));
    expect(new PositionStore(locateVault({ path: join(base, "plain-moved") })).get("p.md")).toBeNull();
  });

  test("today's state moved once (21.8): the instances' list read into the roots', each one's state from its key to its path's", async () => {
    const { readRoots, rootsFile } = await import("../src/core/registry.ts");
    const { PositionStore, loadSession, positionsFile } = await import("../src/core/position.ts");
    const { cacheDir, stateDir, stateHome, cacheHome } = await import("../src/core/paths.ts");
    const { writeJson } = await import("../src/core/fsutil.ts");
    // A machine of its own: the state and cache folders, for this test.
    const before = { state: process.env.XDG_STATE_HOME, cache: process.env.XDG_CACHE_HOME };
    const home = fresh("migrate");
    process.env.XDG_STATE_HOME = join(home, "state");
    process.env.XDG_CACHE_HOME = join(home, "cache");
    try {
      const dir = fresh("before");
      mkdirSync(join(dir, ".git"));
      const instance = "0123456789ab";
      mkdirSync(join(stateHome(), instance), { recursive: true });
      mkdirSync(join(cacheHome(), instance), { recursive: true });
      writeJson(join(stateHome(), "vaults.json"), { version: 1, vaults: [{ key: instance, instance, id: null, kind: "vault", name: null, aliases: [], previous_names: [], path: dir, seen: new Date(0).toISOString() }] });
      writeJson(join(stateHome(), instance, "positions.json"), { "n.md": { heading: null, headingIndex: 0, offset: 0, line: 4, at: new Date(0).toISOString() } });
      writeJson(join(stateHome(), instance, "session.json"), { version: 1, tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true });
      writeFileSync(join(cacheHome(), instance, "index.json"), "{}");
      expect(readRoots()).toEqual([expect.objectContaining({ key: vaultKey(dir), kind: "vault", path: dir })]);
      expect(existsSync(join(stateHome(), "vaults.json"))).toBe(false);
      expect(existsSync(rootsFile())).toBe(true);
      const loc = locateVault({ path: dir });
      expect(existsSync(stateDir({ key: instance }))).toBe(false);
      expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(true);
      expect(loadSession(loc)?.tabs).toHaveLength(1);
      // Its positions: by file now, for the machine; the root's own file taken in once.
      expect(new PositionStore(loc).get("n.md")?.line).toBe(4);
      expect(existsSync(join(stateDir(loc), "positions.json"))).toBe(false);
      expect(Object.keys(JSON.parse(readFileSync(positionsFile(), "utf8")))).toEqual([join(dir, "n.md")]);
    } finally {
      process.env.XDG_STATE_HOME = before.state;
      process.env.XDG_CACHE_HOME = before.cache;
    }
  });

  test("positions by file (21.8): a note opened from the root, or from a folder inside it, is where it was left", async () => {
    const { PositionStore } = await import("../src/core/position.ts");
    const dir = fresh("byfile");
    mkdirSync(join(dir, "docs"), { recursive: true });
    mkdirSync(join(dir, ".git"));
    const fromRoot = new PositionStore(locateVault({ path: dir }));
    fromRoot.set("docs/a.md", { heading: null, headingIndex: 0, offset: 0, line: 12 });
    fromRoot.save();
    // The same file, asked by its absolute path (another root opened it, or the folder alone).
    const loose = folderAt(join(dir, "docs"));
    expect(new PositionStore(loose).get("a.md")?.line).toBe(12);
    expect(new PositionStore(loose).get(join(dir, "docs", "a.md"))?.line).toBe(12);
    // A root's list of what was read: its own files, by their paths in it; a file outside it read from it, by its own.
    const outside = join(fresh("byfile-out"), "o.md");
    const root = new PositionStore(locateVault({ path: dir }));
    root.set(outside, { heading: null, headingIndex: 0, offset: 0, line: 2 });
    root.save();
    const listed = new PositionStore(locateVault({ path: dir })).entries().map((e) => [e.key, e.line]);
    expect(listed).toContainEqual(["docs/a.md", 12]);
    expect(listed).toContainEqual([outside, 2]);
    expect(new PositionStore(loose).entries().map((e) => e.key)).not.toContain(outside); // not read from there
  });

  test("a root reached by a link is recorded: known on this machine from then on, its index found by its path (17.11, 21.8)", async () => {
    const { readRoots } = await import("../src/core/registry.ts");
    const base = fresh("reached");
    const [a, b] = [join(base, "a"), join(base, "b")];
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    mkdirSync(join(b, ".git"), { recursive: true });
    writeFileSync(join(a, "a.md"), "# A\n\n[b](../b/b.md#top)\n");
    writeFileSync(join(b, "b.md"), "# Top\n\n[back](../a/a.md)\n");
    expect(readRoots().some((v) => v.path === b)).toBe(false);
    // Its heading read there: the root is opened, and known from now on.
    expect((await cli(["resolve", "../b/b.md#Top", "--from", "a.md", "--json"], a)).json.data).toMatchObject({ status: "resolved", abs: join(b, "b.md"), line: 1 });
    expect(readRoots().find((v) => v.path === b)).toMatchObject({ kind: "vault", key: vaultKey(b) });
  });

  test("a list that can't be written: the path's key, the same each time", () => {
    const { chmodSync } = require("node:fs") as typeof import("node:fs");
    const { stateHome } = require("../src/core/paths.ts") as typeof import("../src/core/paths.ts");
    const dir = fresh("ro");
    mkdirSync(join(dir, ".git"));
    mkdirSync(stateHome(), { recursive: true });
    chmodSync(stateHome(), 0o555);
    try {
      const a = locateVault({ path: dir });
      expect(a.key).toBe(vaultKey(dir));
      expect(() => recordLocation(a)).not.toThrow();
      expect(locateVault({ path: dir }).key).toBe(a.key);
    } finally {
      chmodSync(stateHome(), 0o755);
    }
  });

  test("the machine's roots: each open recorded once, by its path and kind (17.6, 21.8)", async () => {
    const { readRoots, rootsFile } = await import("../src/core/registry.ts");
    const dir = fresh("reg");
    await cli(["init", dir, "--name", `reg${basename(dir).slice(-6).toLowerCase()}`, "--json"], dir);
    await cli(["ls"], dir);
    expect(readRoots().find((v) => v.path === dir)).toMatchObject({ kind: "vault", key: vaultKey(dir) });
    // Opened again at once: nothing changed, nothing written.
    const stamp = statSync(rootsFile()).mtimeMs;
    await Bun.sleep(20);
    await cli(["ls"], dir);
    expect(statSync(rootsFile()).mtimeMs).toBe(stamp);
    // A git checkout is one by itself (20.3): listed by its path; nothing written into it.
    const repo = fresh("regrepo");
    mkdirSync(join(repo, ".git"));
    await cli(["ls"], repo);
    expect(readRoots().find((v) => v.path === repo)).toMatchObject({ kind: "vault", key: vaultKey(repo) });
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
  });

  test("a repository without .slipbox/ or a remote: unnamed; slipbox name gives it .slipbox/ to hold one (21.10)", async () => {
    const repo = fresh("gitname");
    mkdirSync(join(repo, ".git"));
    expect(locateVault({ path: repo }).name).toBeNull();
    const tag = `gn${basename(repo).slice(-6).toLowerCase()}`;
    const made = (await cli(["name", tag, "--json"], repo)).json.data;
    expect(made).toMatchObject({ root: repo, created: true, name: tag });
    expect(locateVault({ path: repo })).toMatchObject({ root: repo, name: tag, id: made.id });
  });

  test("a plain folder keeps its own session, by its path; positions by file (20.22, 21.8)", async () => {
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

  test("[[vault:note]] and vault:path aren't read (20.22, 21.12): the old form, its pointer said; the converter reads it, into the named vault (17.8)", async () => {
    await ready;
    const r = await cli(["resolve", "[[xapp:design#Goals]]"], notes);
    expect(r.code).toBe(3);
    expect(r.json.data.reason).toContain("names a folder the old way");
    // Bare, it was a path in that vault (20.20): gone with vaults (21.12), the pointer said instead.
    const bare = await cli(["resolve", "xapp:design.md#Goals"], notes);
    expect(bare.code).toBe(3);
    expect(bare.json.data).toMatchObject({ status: "unresolved", abs: null, suggest: "slipbox://xapp/design.md" });
    expect((await cli(["resolve", "[g](xapp:design.md#Goals)"], notes)).json.data.suggest).toBe("slipbox://xapp/design.md");
    expect((await cli(["resolve", "slipbox://xapp/design.md#Goals"], notes)).json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md"), root: app, name: "xapp", line: 5 });
    expect((await cli(["resolve", "xapp:design"], notes)).code).toBe(3);
    // A note named with a colon is still a note here, by its name as a command names it.
    expect((await cli(["resolve", "a:b"], notes)).json.data.path).toBe("a:b.md");
    const c = await converted();
    expect(c.after).toContain("[xapp:design](../app/design.md) [the goals](../app/design.md#goals)");
    expect(c.after).toContain("[xnotes:todo](todo.md)"); // this vault, by its own name
  });

  test("a note or folder that isn't there: the converter says which, and leaves it (17.8, 21.6)", async () => {
    await ready;
    const { skipped } = await converted();
    expect(skipped.some((x) => x.includes("[[xapp:missing]]") && x.includes('no note "missing" in folder "xapp"'))).toBe(true);
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown folder "nope"'))).toBe(true);
  });

  test("an alias is a name again (21.3), a previous name isn't — the converter reads both (17.7)", async () => {
    await ready;
    expect((await cli(["resolve", "[[nick]]"], notes)).json.data).toMatchObject({ status: "resolved", path: "person.md" });
    expect((await cli(["resolve", "[[old-name]]"], notes)).code).toBe(3);
    expect((await converted()).after).toContain("[nick](person.md) [old-name](renamed.md)");
  });

  test("a path out of the root reaches the file in the other vault (17.9)", async () => {
    await ready;
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "../app/design.md")).toMatchObject({ status: "note", path: join(app, "design.md"), root: app, name: "xapp" });
  });

  test("backlinks come from other vaults' indexes too, as of their last indexing (17.11)", async () => {
    await ready;
    const todo = (await cli(["backlinks", "todo"], notes)).json.data.backlinks;
    expect(todo).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }));
    const person = (await cli(["backlinks", "person"], notes)).json.data.backlinks;
    expect(person).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }));
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

  test("a leading / is the nearest root's, then the filesystem's, in every file; with no root, the filesystem's (21.2)", () => {
    const dir = vault({ "notes/a.md": "# A\n", "run.py": "# see /notes/a.md\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("/notes/a.md", "index.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    expect(at("/notes/a.md#Top", "notes/a.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    expect(at("/notes/a.md", "run.py")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    // Nothing there in the root: the filesystem's path, inside the root or out of it.
    expect(at(join(dir, "notes", "a.md"), "index.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    const outside = join(mkdtempSync(join(tmpdir(), "slipbox-slash-")), "far.md");
    writeFileSync(outside, "# Far\n");
    expect(at(outside, "index.md")).toMatchObject({ resolvedKind: "note", path: outside });
    expect(at(outside.replace(/\.md$/, ""), "index.md")).toMatchObject({ resolvedKind: "note", path: outside }); // without its extension too
    expect(at("/nowhere/x.md", "index.md").resolvedKind).toBe("unresolved");
    // A plain folder has no root: `/` is the filesystem's alone.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-loose-slash-"));
    mkdirSync(join(loose, "notes"));
    writeFileSync(join(loose, "notes", "a.md"), "# A\n");
    const lg = openGraph(folderAt(loose), DEFAULT_CONFIG, true);
    expect(lg.resolveLink({ kind: "markdown", target: "/notes/a.md" }, "x.md").resolvedKind).toBe("unresolved");
    expect(lg.resolveLink({ kind: "markdown", target: join(loose, "notes", "a.md") }, "x.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
  });

  test("a path without an extension is the file as written, else its note, else a folder; a trailing / a folder (21.2)", () => {
    const dir = vault({ "notes/plan.md": "# Plan\n", "notes/Makefile": "all:\n", "notes/v1.2.md": "# v\n", "docs/guide.md": "# G\n", "docs.md": "# Docs\n", "zk/202608151900-index.md": "# I\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "index.md") => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("plan#Plan", "notes/x.md")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("/notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("202608151900-index", "zk/a.md")).toMatchObject({ resolvedKind: "note", path: "zk/202608151900-index.md" }); // zk's
    expect(at("notes/Makefile")).toMatchObject({ resolvedKind: "file", path: "notes/Makefile" }); // the file as written first
    expect(at("notes/v1.2")).toMatchObject({ resolvedKind: "note", path: "notes/v1.2.md" });
    // A folder: `docs` is the note docs.md (a note before a folder), `docs/` the folder; the root itself.
    expect(at("docs")).toMatchObject({ resolvedKind: "note", path: "docs.md" });
    expect(at("docs/")).toMatchObject({ resolvedKind: "folder", path: "docs" });
    expect(at("notes")).toMatchObject({ resolvedKind: "folder", path: "notes" });
    expect(at("/")).toMatchObject({ resolvedKind: "folder", path: "." });
    expect(at("missing/")).toMatchObject({ resolvedKind: "unresolved" });
    // Broken, written without an extension: the note it reads as is what following offers to make;
    // a `/…` from the root too — but not one naming no folder of the root (a filesystem path).
    expect(g.missingNote({ kind: "markdown", target: "notes/idea" }, "index.md")).toBe("notes/idea.md");
    expect(g.missingNote({ kind: "markdown", target: "/notes/idea.md" }, "docs/guide.md")).toBe("notes/idea.md");
    expect(g.missingNote({ kind: "markdown", target: "/media/drive/idea.md" }, "index.md")).toBeNull();
    // A folder is no broken link: no problem for it.
    writeFileSync(join(dir, "index.md"), "[the docs](docs/) [notes](notes)\n");
    const g2 = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g2.linksOf("index.md").map((l) => [l.target, l.resolvedKind])).toEqual([["docs/", "folder"], ["notes", "folder"]]);
    expect(g2.backlinks("docs").map((b) => b.target)).toEqual(["docs/"]);
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

  test("a rename keeps each link's form: from the root, without the extension; a folder's links follow it, its / kept (21.2)", async () => {
    const dir = vault({ "notes/plan.md": "# Plan\n", "notes/deep/x.md": "# X\n", "index.md": "[root](/notes/plan.md#Plan) [bare](notes/plan) [rootbare](/notes/plan) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n" });
    expect((await cli(["mv", "notes/plan.md", "notes/roadmap.md"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[root](/notes/roadmap.md#Plan) [bare](notes/roadmap) [rootbare](/notes/roadmap) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n");
    // The folder moved: links to it and to the folder in it, each its own way; links into it too.
    expect((await cli(["mv", "notes", "archive"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[root](/archive/roadmap.md#Plan) [bare](archive/roadmap) [rootbare](/archive/roadmap) [folder](archive/) [folder2](archive) [deep](archive/deep/)\n");
  });

  test("relinked, a link written without its extension stays so (21.2)", () => {
    const dir = vault({ "docs/guide.md": "# The guide, long enough to be known again when it moves.\n", "index.md": "[g](docs/guide)\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({ rel, abs: join(dir, rel), size: statSync(join(dir, rel)).size, mtimeMs: statSync(join(dir, rel)).mtimeMs });
    writeFileSync(join(dir, "docs", "manual.md"), readFileSync(join(dir, "docs", "guide.md")));
    rmSync(join(dir, "docs", "guide.md"));
    g.removeFile("docs/guide.md");
    g.updateFile("docs/manual.md", file("docs/manual.md"));
    expect(g.movedTarget({ kind: "markdown", target: "docs/guide" }, "index.md")).toBe("docs/manual.md");
    const plan = planRelink(g);
    expect(plan.files.flatMap((f) => f.edits.map((e) => e.after.trim()))).toEqual(["[g](docs/manual)"]);
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

  test("a note's rename rewrites every link form, keeps how each was written, and writes nothing into it but its links (21.12)", async () => {
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
    // It moved two folders deeper: its own relative links follow; no old name written in (21.12).
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    expect(read(dir, "archive/2026/roadmap.md")).toBe("---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../../index.md) and [index](../../index.md).\n");
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

  test("links from other roots are rewritten too; a folder's naming keeps its old name (17.15, 21.10)", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": "[p](../NOTES/plan.md) and [t](../NOTES/plan.md)\n".replaceAll("NOTES", basename(notes)) });
    await cli(["init", notes, "--name", "rnotes"], notes);
    await cli(["init", app, "--name", "rapp"], app);
    await cli(["ls"], app); // its index: the links into rnotes
    // The preview: another root's file by its root and name (21.10); this one's by neither.
    const preview = (await cli(["mv", "plan", "roadmap", "--dry-run"], notes)).json.data.files;
    expect(preview.find((f: { abs: string }) => f.abs === join(app, "links.md"))).toMatchObject({ root: app, name: "rapp" });
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`);
    // The folder's name changed: the config, the old name kept; a path link has no name to fix.
    await cli(["ls"], app);
    const r = await cli(["name", "rnotes2"], notes);
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

  test("a folder's naming taken back: its name; a relink too", async () => {
    const one = vault({ "n.md": "# N\n" });
    const two = vault({ "x.md": `[n](../${basename(one)}/n.md)\n` });
    await cli(["init", one, "--name", "undo-one"], one);
    await cli(["init", two, "--name", "undo-two"], two);
    await cli(["ls"], two); // its index: the links into undo-one
    const cfg = read(one, ".slipbox/config.toml");
    await cli(["name", "undo-uno"], one);
    const r = await cli(["undo"], one);
    expect(r.json.data).toMatchObject({ kind: "vault", from: "undo-uno", to: "undo-one" });
    expect(read(two, "x.md")).toBe(`[n](../${basename(one)}/n.md)\n`);
    expect(read(one, ".slipbox/config.toml")).toBe(cfg);
    // The lookup has its name back at once, as seen from another root (21.6).
    expect((await cli(["folders"], two)).json.data.find((f: { default: string }) => f.default === one)).toMatchObject({ name: "undo-one" });
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
      expect(at(t)).toMatchObject({ status: "note", path: join(app, "design.md"), root: app, name: "papp" });
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
    expect(bl.filter((b: { name: string | null }) => b.name === "papp").map((b: { target: string }) => b.target).sort()).toEqual(["../notes/todo.md", `file://${notes}/todo.md`, "~/notes/todo.md"].sort());
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
    for (const l of links) expect(l).toMatchObject({ status: "note", path: join(kid, "note.md"), root: kid, name: "dkid" });
    // …and its links count as backlinks here: indexed when found.
    const bl = (await cli(["backlinks", "index"], parent)).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(kid, "note.md"), root: kid, name: "dkid" }));
  });

  test("from inside, the folder it sits in is named by its pointer, once known (21.7); never by name:path (21.12) or [[name:…]] (20.22)", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-nest-up-"));
    cpSync(parent, fresh, { recursive: true });
    writeFileSync(join(fresh, ".slipbox", "config.toml"), '[vault]\nid = "dparent00000002"\nname = "dparent2"\n');
    writeFileSync(join(fresh, "kid", ".slipbox", "config.toml"), '[vault]\nid = "dkid0000000002"\nname = "dkid2"\n');
    await cli(["ls"], fresh); // opened once: known on this machine
    const r = await cli(["resolve", "slipbox://dparent2/index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(fresh, "index.md"), root: fresh, name: "dparent2", href: "../index.md" });
    const old = await cli(["resolve", "dparent2:index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({ status: "unresolved", suggest: "slipbox://dparent2/index.md" });
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
      // Two copies of dkid on this machine: each its own, by its path; the name is the folder's (21.6).
      for (const l of links) expect(l).toMatchObject({ status: "note", path: join(root, "kid", "note.md"), root: join(root, "kid"), name: "dkid" });
      // dparent by its old form: not a link, nor an argument (21.12); by its pointer, its default copy (21.6).
      expect((await cli(["resolve", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["read", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["resolve", "slipbox://dparent/index.md"], join(root, "kid"))).json.data).toMatchObject({ status: "resolved", abs: join(parent, "index.md") });
      // The other copy's links to its own nested vault aren't backlinks here.
      const bl = (await cli(["backlinks", "note"], join(root, "kid"))).json.data.backlinks;
      expect(bl.map((b: { from: string }) => b.from)).toContain(join(root, "index.md"));
      expect(bl.map((b: { from: string }) => b.from)).not.toContain(join(other, "index.md"));
    }
    // The second made the default: the pointer means it, from anywhere.
    expect((await cli(["folders", "default", "dparent", second], parent)).code).toBe(0);
    expect((await cli(["resolve", "slipbox://dparent/index.md"], join(parent, "kid"))).json.data).toMatchObject({ status: "resolved", abs: join(second, "index.md") });
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
    // The machine forgot it — a root no more, its name gone with its .slipbox/ — which is in the parent's trash, restorable.
    const { readRoots } = await import("../src/core/registry.ts");
    expect(readRoots().some((v) => v.path === join(parent, "proj"))).toBe(false);
    expect((await cli(["folders"], parent)).json.data.some((f: { name: string }) => f.name === "mkproj")).toBe(false);
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

  test("its own state, by its path; moved by git (git worktree move), found again by git's name for it, its state along (17.19, 21.8)", async () => {
    const { readRoots } = await import("../src/core/registry.ts");
    const { PositionStore } = await import("../src/core/position.ts");
    const l = await layout(++n);
    if (!l) return;
    const wt = locateVault({ root: l.wt });
    const main = locateVault({ root: l.x });
    expect(wt).toMatchObject({ name: `x${n}`, key: vaultKey(l.wt), worktree: { name: "feat", checkout: l.wt, main: l.x, mainVault: l.x } });
    expect(wt.key).not.toBe(main.key);
    expect(wt.id).toBe(main.id);
    // The machine's list knows which is which.
    await cli(["ls"], l.wt);
    expect(readRoots().find((v) => v.path === l.wt)).toMatchObject({ key: wt.key, worktree: { name: "feat", main: l.x } });
    const ps = new PositionStore(wt);
    ps.set("notes/a.md", { heading: null, headingIndex: 0, offset: 0, line: 3 });
    ps.save();
    const elsewhere = join(l.base, "elsewhere", "feat");
    mkdirSync(dirname(elsewhere), { recursive: true });
    if (git(l.x, "worktree", "move", l.wt, elsewhere).exitCode !== 0) return;
    expect((await cli(["ls"], elsewhere)).json.warnings.join()).toContain(`moved here from ${l.wt}`);
    const there = locateVault({ root: elsewhere });
    expect(there.key).toBe(vaultKey(elsewhere));
    expect(new PositionStore(there).get("notes/a.md")?.line).toBe(3);
    expect(readRoots().some((v) => v.path === l.wt)).toBe(false);
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
    expect(bare.key).toBe(loc.key); // by its path
    expect(readFileSync(cfg, "utf8")).toBe("# no identity on this branch yet\n");
  });

  test("links: slipbox://x/path from elsewhere means the main checkout; out of the repository, a worktree's paths as the main's; its links aren't backlinks twice", async () => {
    const l = await layout(++n);
    if (!l) return;
    await cli(["ls"], l.wt); // the worktree seen, its index written
    await cli(["ls"], l.x);
    // Elsewhere: slipbox://x/notes/a.md is the main checkout's note (21.7), not the worktree's — that's x@branch.
    writeFileSync(join(l.y, "back.md"), "# Back\n");
    const r = (await cli(["resolve", `slipbox://x${n}/notes/a.md`, "--from", "back.md"], l.y)).json.data;
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
    const { pruneWorktrees, readRoots } = await import("../src/core/registry.ts");
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
    expect(readRoots().some((v) => v.key === wt.key)).toBe(true);
    pruneWorktrees(Date.now() + 31 * 86_400_000);
    expect(existsSync(stateDir(wt))).toBe(false);
    expect(readRoots().some((v) => v.key === wt.key)).toBe(false);
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
    expect(list.map((w: { path: string; branch: string; main: boolean; current: boolean; root: string }) => [w.branch, w.main, w.current, w.root])).toEqual([
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

describe("a root's name and entry: by its remote, its .slipbox/, its path (20.22, 21.6, 21.9)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], { out: (x: string) => out.push(x), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd, env: process.env });
    return { code, json: JSON.parse(out.join("")) };
  };
  const fresh = (prefix: string) => mkdtempSync(join(tmpdir(), `slipbox-${prefix}-`));

  test("a remote as it names a repository: host and path, never a user or a password; ssh and https alike; local ones by path", async () => {
    const { normalizeRemote, remotesIn } = await import("../src/core/remotes.ts");
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

  test("a repository is named after its remote (origin's, else the first one's), else unnamed; .slipbox/'s name wins", async () => {
    const dir = join(fresh("repname"), "pf");
    mkdirSync(dir);
    if (Bun.spawnSync(["git", "init", "-q", dir]).exitCode !== 0) return; // no git here
    expect(locateVault({ path: dir }).name).toBeNull(); // never its folder's own name
    Bun.spawnSync(["git", "-C", dir, "remote", "add", "upstream", "https://example.invalid/them/other.git"]);
    expect(locateVault({ path: dir }).name).toBe("other");
    Bun.spawnSync(["git", "-C", dir, "remote", "add", "origin", "git@example.invalid:me/pathfinder.git"]);
    expect(locateVault({ path: dir }).name).toBe("pathfinder");
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[vault]\nid = "pfid"\nname = "pf-notes"\n');
    expect(locateVault({ path: dir }).name).toBe("pf-notes");
  });

  test("a root as the user is told of it (21.9): its name, else its path from home, else its whole path", async () => {
    const { rootLabel } = await import("../src/core/names.ts");
    const { homeFolder } = await import("../src/core/vault.ts");
    expect(rootLabel({ mode: "vault", name: "research", root: "/x/research", worktree: null })).toBe("research");
    expect(rootLabel({ mode: "vault", name: null, root: join(homeFolder(), "src", "experiment"), worktree: null })).toBe("~/src/experiment");
    expect(rootLabel({ mode: "folder", name: null, root: "/srv/scratch", worktree: null })).toBe("/srv/scratch");
    expect(rootLabel({ mode: "folder", name: null, root: homeFolder(), worktree: null })).toBe("~");
  });

  test("a plain folder opened is listed by its path; given .slipbox/, the root's entry; gone a month, forgotten", async () => {
    const { pruneWorktrees, readRoots, rootsFile } = await import("../src/core/registry.ts");
    const dir = fresh("plainf");
    writeFileSync(join(dir, "n.md"), "# N\n");
    await cli(["ls"], dir);
    const folder = readRoots().filter((v) => v.path === dir);
    expect(folder).toEqual([expect.objectContaining({ kind: "folder", key: vaultKey(dir) })]);
    await cli(["init", dir], dir);
    expect(readRoots().filter((v) => v.path === dir).map((v) => v.kind)).toEqual(["vault"]);
    // A folder gone a month is dropped; one gone a day is kept.
    const gone = fresh("plaingone");
    await cli(["ls"], gone);
    rmSync(gone, { recursive: true });
    pruneWorktrees(Date.now() + 86_400_000);
    expect(readRoots().some((v) => v.path === gone)).toBe(true);
    pruneWorktrees(Date.now() + 31 * 86_400_000);
    expect(readRoots().some((v) => v.path === gone)).toBe(false);
    expect(existsSync(rootsFile())).toBe(true);
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

  test("finds the roots in it, nested ones too, never in hidden folders or node_modules; indexes each; listed as found", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { readRoots } = await import("../src/core/registry.ts");
    const { cacheDir } = await import("../src/core/paths.ts");
    const home = makeHome();
    const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
    let slices = 0;
    while (ai.step(50)) slices++;
    expect(ai.status).toMatchObject({ found: 4, indexed: 4, queue: [], current: null });
    expect(ai.status.passFinished).not.toBeNull();
    const mine = readRoots().filter((v) => v.path.startsWith(`${home}/`));
    expect(mine.map((v) => v.path.slice(home.length + 1)).sort()).toEqual(["deep/x/y", "notes", "notes/inner", "proj"]);
    for (const v of mine) {
      expect(v.found).toBe(true);
      expect(v.indexed).toBeDefined();
      expect(existsSync(join(cacheDir(v), "index.json"))).toBe(true);
    }
    // In the lookup pointers use (21.6): the named one, as found; the unnamed ones not.
    const { readFolders } = await import("../src/core/folders.ts");
    const named = readFolders().filter((f) => f.copies.some((c) => c.path.startsWith(`${home}/`)));
    // (notes/inner's .slipbox/ has no name, and none is written into it: unnamed, 21.8.)
    expect(named.map((f) => [f.name, f.copies.map((c) => [c.path.slice(home.length + 1), c.found])]).sort()).toEqual([[`anotes-${basename(home)}`, [["notes", true]]]]);
    expect(readFileSync(join(home, "notes", "inner", ".slipbox", "config.toml"), "utf8")).toBe("");
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
    const { readRoots } = await import("../src/core/registry.ts");
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
    expect(readRoots().find((v) => v.path === join(home, "deep", "x", "y"))?.found).toBeUndefined();
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
    const { readRoots } = await import("../src/core/registry.ts");
    expect(readRoots().find((v) => v.path === there)?.indexed).toBeDefined();
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
    expect(describeBackground({ on: true, found: 2, indexed: 1, left: 7, finished: null, started: "x" })).toBe("background index: 2 roots found so far, 7 folders left");
  });

  test("a drive unplugged: its roots unavailable, not gone — kept, never pruned, and a link into one says why it's broken", async () => {
    const { pruneWorktrees, readRoots, recordRoot, unavailable } = await import("../src/core/registry.ts");
    const drive = `/media/slipbox-test-nodrive-${basename(mkdtempSync(join(tmpdir(), "slipbox-nd-")))}`;
    expect(unavailable(`${drive}/notes`)).toBe(true);
    expect(unavailable("/tmp/certainly/not/here")).toBe(false);
    expect(unavailable(tmpdir())).toBe(false);
    const long = new Date(Date.now() - 60 * 86_400_000);
    recordRoot({ kind: "vault", path: `${drive}/notes` }, long);
    recordRoot({ kind: "vault", path: `${drive}/wt`, worktree: { name: "wt", main: `${drive}/notes` } }, long);
    recordRoot({ kind: "folder", path: `${drive}/loose` }, long);
    pruneWorktrees();
    expect(readRoots().filter((v) => v.path.startsWith(`${drive}/`)).map((v) => v.kind).sort()).toEqual(["folder", "vault", "vault"]);
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-drive-")), { "n.md": `[far](${drive}/notes/a.md) [near](gone.md)\n` });
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
    expect(scopeRoots(g, "here")).toEqual([]);
    expect(scopeRoots(g, "linked").sort()).toEqual([at("b"), at("c")].sort());
    const all = scopeRoots(g, "all");
    expect(all.slice(0, 2).sort()).toEqual([at("b"), at("c")].sort()); // nearest first
    expect(all).toContain(at("d"));
    expect(all).not.toContain(at("a"));
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
    expect(files(await cli(["search", "narwhal", "--scope", "all"], at("a")))).toContain(join(at("d"), "d-note.md"));
    expect((await cli(["search", "narwhal", "--scope", "near"], at("a"))).code).toBe(2);
  });
});

describe("repairs from what the state knows (20.17)", () => {
  test("a named folder moved by hand: relink fixes its links out by a path, and the other roots' links into it, each in its form", async () => {
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
    // Moved by hand, deeper; opened there, its state came along (21.8): its move broke links on two lines (three links).
    const moved = join(base, "y", "deeper", "a");
    mkdirSync(dirname(moved), { recursive: true });
    // A link out that reaches something where it's gone too: not broken, so not touched.
    writeFileSync(join(base, "y", "deeper", "near.md"), "# Near, by the new place\n");
    renameSync(a, moved);
    const said = (await cli(["ls"], moved)).json.warnings.join();
    expect(said).toContain(`moved here from ${a}`);
    expect(said).toContain("its move broke links on 2 lines: slipbox relink fixes them");
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
    // Fixed. b is a named folder that doesn't travel with a: the relink offers its pointer now (21.7).
    const offer = (await cli(["relink", "--dry-run"], moved)).json.data.files;
    expect(offer.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after))).toEqual([`[n](slipbox://b${tag}/n.md#top) and [in](t.md)`]);
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toEqual([]);
    // Moved again: the last move is the one to read from — and the pointer needs nothing.
    const again = join(base, "z", "a");
    mkdirSync(dirname(again), { recursive: true });
    renameSync(moved, again);
    await cli(["ls"], again);
    expect((await cli(["relink"], again)).code).toBe(0);
    expect(readFileSync(join(again, "out.md"), "utf8").split("\n")[0]).toBe(`[n](slipbox://b${tag}/n.md#top) and [in](t.md)`);
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
    expect((await cli(["apply"], dir)).json.data.find((p: { id: string }) => p.id === id)).toMatchObject({ command: "mv", kind: "note", from: "a.md", to: "b.md", root: dir, files: 1 }); // index.md: nothing written into the note itself (21.12)
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

describe("links by name, read again within their root (21.3)", () => {
  test("a wikilink is read within its root (21.3): a name, a path, an alias, an attachment; ties ambiguous", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes", "deep"), { recursive: true });
    mkdirSync(join(dir, "other"));
    mkdirSync(join(dir, "img"));
    writeFileSync(join(dir, "a.md"), "# A\n\n[[b]] [[notes/b#B]] [[bee|the bee]] ![[photo.png]] [[two]] [[research:b]] [[nowhere]]\n");
    writeFileSync(join(dir, "notes", "b.md"), "---\naliases: [bee]\nprevious_names: [old-b]\n---\n# B\n");
    writeFileSync(join(dir, "notes", "two.md"), "# Two\n");
    writeFileSync(join(dir, "other", "two.md"), "# Two\n");
    writeFileSync(join(dir, "notes", "deep", "near.md"), "[[two]]\n");
    writeFileSync(join(dir, "img", "photo.png"), "png");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "a.md", kind: "wiki" | "embed" = "wiki") => g.resolveLink({ kind, target }, from);
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
    const lg = openGraph(folderAt(loose), DEFAULT_CONFIG, true);
    expect(lg.resolveLink({ kind: "wiki", target: "y" }, "x.md")).toMatchObject({ resolvedKind: "unresolved", reason: "names need a root, and this folder has none: .git, .slipbox/, .obsidian/ or .zk/ makes one" });
  });

  test("two attachments of one name, as two notes: the nearest, then the shortest; a real tie ambiguous (21.3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-att-"));
    mkdirSync(join(dir, ".obsidian"));
    for (const d of ["attachments", "Archive/attachments", "Recipes/img", "x", "y"]) mkdirSync(join(dir, d), { recursive: true });
    for (const f of ["attachments/dal.png", "Archive/attachments/dal.png", "Recipes/img/dal.png", "x/pic.png", "y/pic.png"]) writeFileSync(join(dir, f), "png");
    writeFileSync(join(dir, "Home.md"), "![[dal.png]] ![[pic.png]]\n");
    mkdirSync(join(dir, "Archive", "old"), { recursive: true });
    writeFileSync(join(dir, "Archive", "old", "menu.md"), "![[dal.png]]\n");
    writeFileSync(join(dir, "Recipes", "dal.md"), "![[dal.png]]\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "embed", target }, from);
    expect(at("dal.png", "Home.md")).toMatchObject({ resolvedKind: "file", path: "attachments/dal.png" }); // the shortest
    expect(at("dal.png", "Archive/old/menu.md")).toMatchObject({ resolvedKind: "file", path: "Archive/attachments/dal.png" }); // the nearest
    expect(at("dal.png", "Recipes/dal.md")).toMatchObject({ resolvedKind: "file", path: "Recipes/img/dal.png" });
    expect(at("pic.png", "Home.md")).toMatchObject({ resolvedKind: "ambiguous", candidates: ["x/pic.png", "y/pic.png"] });
  });

  test("renamed, a note's wikilinks follow in their form — a name a name, a path a path, an alias kept; resolve reads them (21.3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-wiki-mv-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "a.md"), "[[b]] [[notes/b#B]] [[bee|the bee]] ![[b]]\n");
    writeFileSync(join(dir, "notes", "b.md"), "---\naliases: [bee]\n---\n# B\n");
    const r = await cli(["--root", dir, "resolve", "[[b#B]]", "--from", "a.md", "--json"]);
    expect(JSON.parse(r.out).data).toMatchObject({ status: "resolved", path: "notes/b.md" });
    expect(JSON.parse((await cli(["--root", dir, "resolve", "[[nowhere]]", "--from", "a.md", "--json"])).out).data.status).toBe("unresolved");
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
    expect(g.resolveLink({ kind: "wiki", target: "inner/deepnote" }, "a.md")).toMatchObject({ resolvedKind: "note", path: join(dir, "inner", "deepnote.md") });
  });
});

describe("another folder's file as an argument: its pointer (21.10); vault:path gone (21.12)", () => {
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

  test("in: a pointer names a file of that folder, and the command works there; name:path is the old form, refused", async () => {
    const { at, a, b } = await two();
    const ptr = (x: string, path: string) => `slipbox://${x}/${path}`;
    const read = await cli(["read", ptr(b, "algorithms/dijkstra.md")], at("a"));
    expect(read.code).toBe(0);
    expect(read.json.data).toMatchObject({ path: "algorithms/dijkstra.md" });
    expect(read.json.data.content).toContain("## Relaxation");
    expect((await cli(["outline", ptr(b, "algorithms/dijkstra.md")], at("a"))).json.data.headings[1]).toMatchObject({ text: "Relaxation" });
    // Backlinks of b's note, asked from a: a's link among them, by its path (21.9).
    const bl = (await cli(["backlinks", ptr(b, "algorithms/dijkstra")], at("a"))).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(at("a"), "notes", "plan.md"), shown: join(at("a"), "notes", "plan.md") }));
    // find's note is its second argument; context takes several.
    expect((await cli(["find", "Edges", ptr(b, "algorithms/dijkstra.md")], at("a"))).code).toBe(0);
    expect((await cli(["context", ptr(a, "notes/other.md"), ptr(a, "notes/plan.md")], at("b"))).json.data.start).toEqual(["notes/other.md", "notes/plan.md"]);
    // Each argument itself: the first saying which folder never stands for the rest.
    expect((await cli(["context", "notes/other.md", "notes/plan.md"], at("a"))).json.data.start).toEqual(["notes/other.md", "notes/plan.md"]);
    // --from too.
    expect((await cli(["resolve", "other.md", "--from", ptr(a, "notes/plan.md")], at("b"))).json.data).toMatchObject({ status: "resolved", path: "notes/other.md" });
    // name:path (20.20) is gone: not found, the pointer said.
    const old = await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"));
    expect(old.code).toBe(3);
    expect(old.json.error.message).toContain(`${ptr(b, "algorithms/dijkstra.md")} names it`);
    // No folder by that name: a name, as before — not found, nothing said of pointers.
    const nope = await cli(["read", "nope:x.md"], at("a"));
    expect(nope.code).toBe(3);
    expect(nope.json.error.message).not.toContain("slipbox://");
    // A file by that very name is itself: a path wins.
    mkdirSync(join(at("a"), `${b}:algorithms`));
    writeFileSync(join(at("a"), `${b}:algorithms`, "dijkstra.md"), "# Local\n");
    expect((await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"))).json.data.content).toBe("# Local\n");
  });

  test("resolve: a pointer, and with --from the relative path a link there would carry; name:path its pointer said", async () => {
    const { at, a, b } = await two();
    const r = await cli(["resolve", `slipbox://${b}/algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"], at("a"));
    expect(r.json.data).toMatchObject({ status: "resolved", path: join(at("b"), "algorithms", "dijkstra.md"), abs: join(at("b"), "algorithms", "dijkstra.md"), shown: join(at("b"), "algorithms", "dijkstra.md"), href: "../../b/algorithms/dijkstra.md#relaxation", heading: "Relaxation", line: 3, root: at("b"), name: b });
    // This folder's own: its path here.
    const own = await cli(["resolve", `slipbox://${a}/notes/other.md`, "--from", "notes/plan.md"], at("a"));
    expect(own.json.data).toMatchObject({ status: "resolved", path: "notes/other.md", shown: "notes/other.md", href: "other.md", root: null, name: null });
    // A folder too; a file that isn't there, not.
    expect((await cli(["resolve", `slipbox://${b}/algorithms`, "--from", "notes/plan.md"], at("a"))).json.data).toMatchObject({ status: "resolved", abs: join(at("b"), "algorithms"), href: "../../b/algorithms" });
    expect((await cli(["resolve", `slipbox://${b}/algorithms/nope.md`, "--from", "notes/plan.md"], at("a"))).code).toBe(3);
    // Without --from: no link to write.
    expect((await cli(["resolve", `slipbox://${b}/algorithms/dijkstra.md`], at("a"))).json.data).toMatchObject({ status: "resolved", href: null });
    // The old form: unresolved, and the pointer that is one.
    const old = await cli(["resolve", `${b}:algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"], at("a"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({ status: "unresolved", href: null, suggest: `slipbox://${b}/algorithms/dijkstra.md` });
    // A path's href too, with the spaces a link encodes.
    writeFileSync(join(at("a"), "notes", "a note.md"), "# A note\n");
    expect((await cli(["resolve", "a note.md", "--from", "notes/plan.md"], at("a"))).json.data.href).toBe("a%20note.md");
  });

  test("out: links and backlinks show another vault's file by its path (21.9), its vault's name beside it", async () => {
    const { at, a, b } = await two();
    const links = (await cli(["links", "notes/plan.md"], at("a"))).json.data;
    expect(links[0]).toMatchObject({ path: join(at("b"), "algorithms", "dijkstra.md"), shown: join(at("b"), "algorithms", "dijkstra.md"), root: at("b"), name: b });
    expect(await human(["links", "notes/plan.md"], at("a"))).toContain(`-> ${join(at("b"), "algorithms", "dijkstra.md")}\n`);
    const bl = (await cli(["backlinks", "algorithms/dijkstra.md"], at("b"))).json.data.backlinks;
    expect(bl[0]).toMatchObject({ shown: join(at("a"), "notes", "plan.md"), root: at("a"), name: a });
    expect(await human(["backlinks", "algorithms/dijkstra.md"], at("b"))).toContain(`${join(at("a"), "notes", "plan.md")}:3  shortest`);
  });

  test("mv and cp: a source by its pointer, the command in its folder; a destination a path there, never a pointer", async () => {
    const { at, b } = await two();
    const moved = await cli(["mv", `slipbox://${b}/algorithms/dijkstra.md`, "graphs/dijkstra.md", "--dry-run"], at("a"));
    expect(moved.code).toBe(0);
    expect(moved.json.data).toMatchObject({ from: "algorithms/dijkstra.md", to: "graphs/dijkstra.md", dryRun: true });
    const pointed = await cli(["mv", `slipbox://${b}/algorithms/dijkstra.md`, `slipbox://${b}/graphs/dijkstra.md`, "--dry-run"], at("a"));
    expect(pointed.code).toBe(5);
    expect(pointed.json.error.message).toContain("not a pointer");
    expect((await cli(["mv", `${b}:algorithms/dijkstra.md`, "graphs/dijkstra.md", "--dry-run"], at("a"))).code).toBe(3); // the old form
    expect((await cli(["cp", `slipbox://${b}/algorithms/dijkstra.md`, "algorithms/copy.md"], at("a"))).code).toBe(0);
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

  test("the merge review reads `/` from the root and paths without an extension; each fix in its link's form (21.2)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-forms-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "docs/plan.md", "# Plan\n\n## Aims\n\nThe plan, long enough to be known by its text when it moves.\n");
    put(root, "index.md", "# Index\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/plan.md", "docs/new/plan.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    put(root, "docs/c.md", "# C\n\n[root](/docs/plan.md#Aims) [bare](plan) [fine](/index)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      ["docs/c.md", "/docs/plan.md#Aims", "moved", "refactor", "docs/new/plan.md", "/docs/new/plan.md#Aims"],
      ["docs/c.md", "plan", "moved", "refactor", "docs/new/plan.md", "new/plan"],
    ]);
  });

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
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", `${root}/docs/new/plan.md`], // its form kept (21.2)
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
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", `${root}/docs/new/plan.md`], // its form kept (21.2)
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

  test("a rebase is one change: HEAD isn't seen moving mid-rebase; at its end the branch moved on, never switched", async () => {
    const { VaultFeed } = await import("../src/core/vault-feed.ts");
    const { checkoutOf } = await import("../src/core/git.ts");
    const { openVault } = await import("../src/core/reach.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-rebase-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "topic");
    put(root, "b.md", "# B\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "b");
    git(root, "checkout", "-q", "main");
    put(root, "c.md", "# C\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    git(root, "checkout", "-q", "topic");
    const g = openVault(root);
    const heard: [string | null, string | null][] = [];
    const feed = new VaultFeed({ checkout: () => checkoutOf(root), graph: () => g, now: () => Date.now(), apply: () => {}, headMoved: (was, now) => heard.push([was.branch, now.branch]) });
    feed.checkHead();
    // Stopped after its first step (an --exec that fails): HEAD detached, the rebase not done.
    git(root, "rebase", "-q", "--exec", "false", "main");
    expect(existsSync(join(root, ".git", "rebase-merge"))).toBe(true);
    expect(feed.checkHead()).toBe(false);
    git(root, "rebase", "--continue");
    expect(feed.checkHead()).toBe(true);
    expect(heard).toEqual([["topic", "topic"]]);
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
  test("a file's root is its nearest, however it's opened: --root says where to start, a nested root stays its own", async () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-nearest-"));
    mkdirSync(join(top, ".slipbox"));
    mkdirSync(join(top, "inner", ".slipbox"), { recursive: true });
    writeFileSync(join(top, "a.md"), "# A\n");
    writeFileSync(join(top, "inner", "b.md"), "# B\n");
    expect(locateVault({ root: top, path: join(top, "inner", "b.md") }).root).toBe(join(top, "inner"));
    expect(locateVault({ root: top, path: join(top, "a.md") }).root).toBe(top);
    // The CLI alike: the note named from here, or from --root, in the root that holds it.
    const elsewhere = mkdtempSync(join(tmpdir(), "slipbox-nearest-cwd-"));
    for (const arg of [join(top, "inner", "b.md"), "inner/b.md"]) {
      const r = await cli(["--root", top, "stat", arg], elsewhere);
      expect(r.code).toBe(0);
      expect(r.json.data.path).toBe("b.md");
    }
  });
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

describe("the links' convention, found (21.4)", () => {
  const notes = (links: [string, string][]) => links.map(([kind, target]) => ({ kind, target, resolvedKind: "note", path: "x.md" }));
  test("the notes' links counted by style, path and extension: only those reaching a note in the root", async () => {
    const { countForms } = await import("../src/core/convention.ts");
    const c = countForms([
      ...notes([["wiki", "Dal"], ["embed", "Recipes/Dal"], ["wiki", "../up/Dal.md"], ["wiki", "/Recipes/Dal"]]),
      ...notes([["markdown", "a.md#top"], ["markdown", "../b"], ["markdown", "/docs/c.md"], ["image", "sub/d e.md?x"], ["markdown", "~/x.md"], ["markdown", "file:///x.md"]]),
      { kind: "markdown", target: "gone.md", resolvedKind: "unresolved", path: null },
      { kind: "markdown", target: "pic.png", resolvedKind: "file", path: "pic.png" },
      { kind: "markdown", target: "../other/x.md", resolvedKind: "note", path: "/elsewhere/x.md" },
    ]);
    expect(c.style).toEqual({ markdown: 4, wiki: 4 });
    expect(c.path.wiki).toEqual({ relative: 1, root: 2, name: 1 });
    expect(c.path.markdown).toEqual({ relative: 3, root: 1, name: 0 });
    expect(c.extension.wiki).toEqual({ kept: 1, dropped: 3 });
    expect(c.extension.markdown).toEqual({ kept: 3, dropped: 1 });
  });

  test("Obsidian's and zk's settings read, their defaults where a key is unset; a template says nothing", async () => {
    const { toolSays } = await import("../src/core/convention.ts");
    const at = (files: Record<string, string | null>) => {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-tool-"));
      for (const [f, text] of Object.entries(files)) {
        mkdirSync(join(dir, dirname(f)), { recursive: true });
        if (text !== null) writeFileSync(join(dir, f), text);
      }
      const t = toolSays(dir);
      return t && { tool: t.tool, file: t.file, style: t.style, wiki: [t.path("wiki"), t.extension("wiki")], markdown: [t.path("markdown"), t.extension("markdown")] };
    };
    expect(at({ ".obsidian/x": null })).toEqual({ tool: "obsidian", file: ".obsidian/", style: "wiki", wiki: ["name", "dropped"], markdown: [undefined, "kept"] });
    expect(at({ ".obsidian/app.json": '{"useMarkdownLinks": true, "newLinkFormat": "relative",}' })).toMatchObject({ file: ".obsidian/app.json", style: "markdown", markdown: ["relative", "kept"] });
    expect(at({ ".obsidian/app.json": '{"newLinkFormat": "absolute"}' })).toMatchObject({ style: "wiki", wiki: ["root", "dropped"] });
    expect(at({ ".obsidian/app.json": "not json" })).toMatchObject({ file: ".obsidian/", style: "wiki" }); // unreadable: Obsidian's defaults
    expect(at({ ".zk/x": null })).toEqual({ tool: "zk", file: ".zk/", style: "markdown", wiki: ["root", "dropped"], markdown: ["relative", "dropped"] });
    expect(at({ ".zk/config.toml": '[format.markdown]\nlink-format = "wiki"\nlink-drop-extension = false\n' })).toMatchObject({ file: ".zk/config.toml", style: "wiki", wiki: ["root", "kept"] });
    expect(at({ ".zk/config.toml": '[format.markdown]\nlink-format = "[[{{filename}}]]"\n' })).toMatchObject({ style: undefined, wiki: [undefined, "dropped"] });
    expect(at({ ".git/HEAD": "ref" })).toBeNull();
  });

  test("each part the first that says: your setting, the root's tool, its notes at two-thirds, ours", async () => {
    const { emptyCounts, findConvention } = await import("../src/core/convention.ts");
    const auto = { style: "auto", path: "auto", extension: "auto" } as const;
    const counts = (style: [number, number], wikiPath: [number, number, number], wikiExt: [number, number], mdPath: [number, number, number] = [0, 0, 0], mdExt: [number, number] = [0, 0]) => {
      const c = emptyCounts();
      [c.style.markdown, c.style.wiki] = style;
      [c.path.wiki.relative, c.path.wiki.root, c.path.wiki.name] = wikiPath;
      [c.extension.wiki.kept, c.extension.wiki.dropped] = wikiExt;
      [c.path.markdown.relative, c.path.markdown.root, c.path.markdown.name] = mdPath;
      [c.extension.markdown.kept, c.extension.markdown.dropped] = mdExt;
      return c;
    };
    const parts = (c: ReturnType<typeof findConvention>) => [c.style, c.path, c.extension].map((p) => `${p.value}:${p.source}`);
    const obsidian = { tool: "obsidian" as const, file: ".obsidian/app.json", style: "wiki" as const, path: (s: string) => (s === "wiki" ? ("name" as const) : undefined), extension: (s: string) => (s === "wiki" ? ("dropped" as const) : ("kept" as const)) };
    // Nothing says: ours.
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: null, counts: null }))).toEqual(["markdown:default", "relative:default", "kept:default"]);
    // The notes, each part within the style they chose: two-thirds is enough.
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: null, counts: counts([1, 2], [0, 2, 1], [1, 2]) }))).toEqual(["wiki:notes", "root:notes", "dropped:notes"]);
    // Under two-thirds: ours for that part (a root mixing forms).
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: null, counts: counts([4, 6], [3, 3, 4], [5, 5]) }))).toEqual(["markdown:default", "relative:default", "kept:default"]);
    // The tool before the notes.
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: obsidian, counts: counts([10, 0], [0, 0, 0], [0, 0], [0, 10, 0], [0, 10]) }))).toEqual(["wiki:tool", "name:tool", "dropped:tool"]);
    // Your setting before the tool; the tool's "shortest" isn't a path for a markdown link: the notes', else ours.
    const md = findConvention({ links: { ...auto, style: "markdown" }, origins: { "links.style": ".slipbox/config.toml" }, hasRoot: true, tool: obsidian, counts: counts([3, 0], [0, 0, 0], [0, 0], [0, 3, 0], [3, 0]) });
    expect(parts(md)).toEqual(["markdown:setting", "root:notes", "kept:tool"]);
    expect(md.style.why).toBe("[links] in .slipbox/config.toml");
    expect(parts(findConvention({ links: { ...auto, style: "markdown" }, origins: {}, hasRoot: true, tool: obsidian, counts: null }))).toEqual(["markdown:setting", "relative:default", "kept:tool"]);
    // A path by name, set, fits only a wikilink.
    expect(parts(findConvention({ links: { style: "markdown", path: "name", extension: "drop" }, origins: {}, hasRoot: true, tool: null, counts: null }))).toEqual(["markdown:setting", "relative:default", "dropped:setting"]);
    expect(parts(findConvention({ links: { style: "wiki", path: "name", extension: "keep" }, origins: {}, hasRoot: true, tool: null, counts: null }))).toEqual(["wiki:setting", "name:setting", "kept:setting"]);
    // No root: your setting, else ours — no tool, no notes.
    expect(parts(findConvention({ links: { ...auto, extension: "drop" }, origins: {}, hasRoot: false, tool: obsidian, counts: counts([0, 9], [0, 0, 9], [0, 9]) }))).toEqual(["markdown:default", "relative:default", "dropped:setting"]);
  });

  test("[links] in a config: checked, and which file set each part kept; info says the convention and why", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-conv-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[links]\nstyle = "wiki"\npath = "sideways"\n');
    const user = join(dir, "..", `${basename(dir)}-user.toml`);
    writeFileSync(user, '[links]\nextension = "drop"\nstyle = "markdown"\n');
    const loaded = loadConfig({ vaultRoot: dir, configFile: user });
    expect(loaded.config.links).toEqual({ style: "wiki", path: "auto", extension: "drop" });
    expect(loaded.origins["links.style"]).toBe(join(dir, ".slipbox", "config.toml")); // the root's, over yours
    expect(loaded.origins["links.extension"]).toBe(user);
    expect(loaded.origins["links.path"]).toBeUndefined(); // a bad value isn't taken
    expect(loaded.warnings.join("\n")).toContain('"links.path" must be one of auto, relative, root, name (got "sideways")');
    // The notes say the path: by name, all of them.
    writeFileSync(join(dir, "a.md"), "[[b]] [[c]] and [b](notes/b.md)\n");
    writeFileSync(join(dir, "notes", "b.md"), "# B\n");
    writeFileSync(join(dir, "c.md"), "# C\n");
    const r = await cli(["--root", dir, "--config", user, "info", "--json"]);
    const links = JSON.parse(r.out).data.links;
    expect([links.style, links.path, links.extension].map((p: { value: string; source: string }) => `${p.value}:${p.source}`)).toEqual(["wiki:setting", "name:notes", "dropped:setting"]);
    expect(links.path.why).toBe("the notes, 100% of 2 links");
    const human = (await cli(["--root", dir, "--config", user, "info"])).out;
    expect(human).toContain(`links     wikilinks, by name, without .md — style: [links] in .slipbox/config.toml; path: the notes, 100% of 2 links; extension: [links] in ${user}`);
  });
});

describe("the reference set's conventions (21.4)", () => {
  // Copied first: opened in place, a root would be written to (its id, its state).
  const at = async (rel: string) => {
    const { conventionOf, describeConvention } = await import("../src/core/convention.ts");
    const dir = join(mkdtempSync(join(tmpdir(), "slipbox-home-conv-")), basename(rel));
    cpSync(join(import.meta.dir, "..", "examples", "home", rel), dir, { recursive: true });
    const loaded = loadConfig({ vaultRoot: dir });
    return describeConvention(conventionOf(openGraph(locateVault({ root: dir }), loaded.config, false), loaded.config, loaded.origins));
  };
  test("each root's, as CASES.md says (links/conventions)", async () => {
    expect(await at("hobbies/cooking")).toBe("wikilinks, by name, without .md — Obsidian's .obsidian/app.json");
    expect(await at("hobbies/cycling")).toBe("markdown links, relative, without .md — zk's .zk/config.toml");
    // Its own setting says markdown, over Obsidian's wikilinks; a markdown link is a path, not a name.
    expect(await at("work/product/design")).toMatch(/^markdown links, relative, with \.md — style: \[links\] in \.slipbox\/config\.toml; path: the notes, \d+% of \d+ links?; extension: Obsidian's \.obsidian\/app\.json$/);
    expect(await at("work/kestrel")).toMatch(/^markdown links, relative, with \.md — style: the notes, 100% of \d+ links; path: the notes, \d+% of \d+ links; extension: the notes, \d+% of \d+ links$/);
  });
});

describe("links written in the convention (21.5)", () => {
  const vault = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-write-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const d of ["sub", "other", "img", "my notes"]) mkdirSync(join(dir, d));
    for (const f of ["a.md", "sub/b.md", "sub/x.md", "other/b.md", "my notes/c d.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    writeFileSync(join(dir, "img", "p.png"), "png");
    return dir;
  };
  test("each path and extension, in each style; a name only where it reaches the note, else the path from the root", async () => {
    const { linkDestination, linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const dir = vault();
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const conv = (path: string, extension: string) => ({ path: { value: path, source: "setting", why: "" }, extension: { value: extension, source: "setting", why: "" } }) as never;
    const dest = (from: string, to: string, style: "markdown" | "wiki", path: string, ext: string) => linkDestination(conv(path, ext), style, linkEnds(g, join(dir, from), join(dir, to)));
    // Markdown: relative or from the root; the extension kept or dropped — a note's only; encoded.
    expect(dest("sub/x.md", "other/b.md", "markdown", "relative", "kept")).toBe("../other/b.md");
    expect(dest("sub/x.md", "other/b.md", "markdown", "relative", "dropped")).toBe("../other/b");
    expect(dest("sub/x.md", "other/b.md", "markdown", "root", "dropped")).toBe("/other/b");
    expect(dest("a.md", "my notes/c d.md", "markdown", "relative", "kept")).toBe("my%20notes/c%20d.md");
    expect(dest("a.md", "img/p.png", "markdown", "relative", "dropped")).toBe("img/p.png");
    // Wiki: a name where it reaches the note — beside it, yes; from the top, two b's tie: the path.
    expect(dest("sub/x.md", "sub/b.md", "wiki", "name", "dropped")).toBe("b");
    expect(dest("a.md", "sub/b.md", "wiki", "name", "dropped")).toBe("sub/b");
    expect(dest("a.md", "sub/b.md", "wiki", "name", "kept")).toBe("sub/b.md");
    expect(dest("a.md", "img/p.png", "wiki", "name", "dropped")).toBe("p.png");
    expect(dest("sub/x.md", "other/b.md", "wiki", "root", "dropped")).toBe("other/b");
    expect(dest("sub/x.md", "other/b.md", "wiki", "relative", "dropped")).toBe("../other/b");
    expect(dest("sub/x.md", "sub/b.md", "wiki", "relative", "dropped")).toBe("./b");
    // Out of the root: a relative path, the file as named, whatever the convention.
    const outside = mkdtempSync(join(tmpdir(), "slipbox-write-out-"));
    writeFileSync(join(outside, "far.md"), "# Far\n");
    expect(dest("a.md", relative(dir, join(outside, "far.md")), "wiki", "name", "dropped")).toBe(`../${basename(outside)}/far.md`);
    // The whole link: text escaped, an alias only when it says more, an embed.
    const ends = linkEnds(g, join(dir, "sub/x.md"), join(dir, "sub/b.md"));
    expect(writeLink(conv("relative", "kept"), "markdown", ends, "the [b] note")).toBe("[the \\[b\\] note](b.md)");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "b")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "the b note")).toBe("[[b|the b note]]");
    expect(writeLink(conv("name", "dropped"), "wiki", linkEnds(g, join(dir, "a.md"), join(dir, "img/p.png")), "", true)).toBe("![[p.png]]");
  });

  test("slipbox link: as the root's convention writes it from --from — the note's title its text; --style, --text, --embed", async () => {
    const dir = vault();
    rmSync(join(dir, ".slipbox"), { recursive: true });
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "sub", "b.md"), "---\ntitle: The B note\n---\n# B\n");
    const link = async (...args: string[]) => JSON.parse((await cli(["--root", dir, "link", ...args, "--json"])).out).data;
    expect(await link("sub/b.md", "--from", "sub/x.md")).toMatchObject({ link: "[[b]]", path: "sub/b.md", from: "sub/x.md", style: "wiki", pathForm: "name", extension: "dropped" });
    expect((await link("sub/b.md", "--from", "a.md")).link).toBe("[[sub/b]]");
    expect((await link("sub/b.md")).link).toBe("[[sub/b]]"); // no --from: as from the root
    // Markdown asked for: Obsidian's "shortest" is no path for one — ours, relative; with .md, as Obsidian writes one.
    expect((await link("sub/b.md", "--from", "a.md", "--style", "markdown")).link).toBe("[The B note](sub/b.md)");
    expect((await link("sub/b.md", "--from", "sub/x.md", "--text", "bee")).link).toBe("[[b|bee]]");
    expect((await link(join(dir, "img", "p.png"), "--from", "a.md", "--embed")).link).toBe("![[p.png]]");
    const bad = await cli(["--root", dir, "link", "sub/b.md", "--style", "fancy"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--style is markdown or wiki (got fancy)");
  });
});

describe("named folders (21.6)", () => {
  const uniq = () => basename(mkdtempSync(join(tmpdir(), "n"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
  /** A folder: a `.slipbox/` with this name and id, and/or a repository with this origin. */
  const folder = (opts: { name?: string; id?: string; old?: string[]; remote?: string; obsidian?: boolean } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-named-"));
    if (opts.name || opts.id) {
      mkdirSync(join(dir, ".slipbox"));
      const fields = [opts.id ? `id = "${opts.id}"` : "", opts.name ? `name = "${opts.name}"` : "", opts.old ? `previous_names = ${JSON.stringify(opts.old)}` : ""].filter(Boolean);
      writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\n${fields.join("\n")}\n`);
    }
    if (opts.remote !== undefined) {
      mkdirSync(join(dir, ".git", "info"), { recursive: true });
      writeFileSync(join(dir, ".git", "config"), `[core]\n\tbare = false\n${opts.remote ? `[remote "origin"]\n\turl = ${opts.remote}\n` : ""}`);
    }
    if (opts.obsidian) mkdirSync(join(dir, ".obsidian"));
    return dir;
  };

  test("a name travels with what it names: .slipbox/'s, else the remote's; never a folder's own", async () => {
    const { folderIdentity } = await import("../src/core/folders.ts");
    const id = uniq();
    expect(folderIdentity(folder({ name: "notes", id, old: ["kb"] }))).toMatchObject({ key: `slipbox:${id}`, name: "notes", remote: null, id, old: ["kb"], private: false });
    expect(folderIdentity(folder({ remote: "git@github.com:me/Research.git" }))).toMatchObject({ key: "remote:github.com/me/Research", name: "Research", remote: "github.com/me/Research" });
    // Two remotes: origin's names it, wherever it's listed.
    const two = folder({ remote: "" });
    writeFileSync(join(two, ".git", "config"), '[remote "mirror"]\n\turl = https://github.com/them/mirror-name\n[remote "origin"]\n\turl = git@github.com:me/fork-name.git\n[remote "upstream"]\n\turl = https://github.com/them/upstream-name\n');
    expect(folderIdentity(two)).toMatchObject({ name: "fork-name", remote: "github.com/me/fork-name" });
    // Both: the name someone chose; the remote kept, its qualified name.
    expect(folderIdentity(folder({ name: "papers", id, remote: "https://gitlab.com/lab/research.git" }))).toMatchObject({ key: `slipbox:${id}`, name: "papers", remote: "gitlab.com/lab/research" });
    // Unnamed: a tool's marker alone, a repository with no remote, a .slipbox/ without a name.
    expect(folderIdentity(folder({ obsidian: true }))).toBeNull();
    expect(folderIdentity(folder({ remote: "" }))).toBeNull();
    expect(folderIdentity(folder({ id: uniq() }))).toBeNull();
    // Private (`init --private`): git's exclude keeps its .slipbox/ out.
    const priv = folder({ name: "review", id: uniq(), remote: "git@github.com:me/review.git" });
    writeFileSync(join(priv, ".git", "info", "exclude"), "/.slipbox/\n");
    expect(folderIdentity(priv)?.private).toBe(true);
    // A worktree: its main checkout is the copy.
    const main = folder({ remote: "git@github.com:me/wt.git" });
    mkdirSync(join(main, ".git", "worktrees", "feature"), { recursive: true });
    writeFileSync(join(main, ".git", "worktrees", "feature", "commondir"), "../..\n");
    const wt = mkdtempSync(join(tmpdir(), "slipbox-named-wt-"));
    writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "feature")}\n`);
    expect(folderIdentity(wt)).toMatchObject({ key: "remote:github.com/me/wt", name: "wt", copy: main });
  });

  test("the lookup: the first copy found is the default; a second asks once; gone copies stay listed", async () => {
    const { lookupFolder, readFolders, recordFolder, setDefaultCopy } = await import("../src/core/folders.ts");
    const name = `n${uniq()}`;
    const id = uniq();
    const a = folder({ name, id });
    const b = folder({ name, id });
    expect(recordFolder(a)).toMatchObject({ name, copies: [{ path: a }], default: a });
    expect(recordFolder(a)?.ask).toBeUndefined(); // seen again: not a second copy
    expect(recordFolder(b, { found: true })).toMatchObject({ default: a, ask: true, copies: [{ path: a }, { path: b, found: true }] });
    expect(lookupFolder(name)).toMatchObject({ status: "found", path: a });
    // Found by the index, then opened: no longer only found.
    expect(recordFolder(b)?.copies[1]).toEqual({ path: b, seen: expect.any(String) });
    setDefaultCopy(`slipbox:${id}`, "/not/a/copy");
    expect(readFolders().find((f) => f.name === name)?.default).toBe(a); // not a copy: not the default
    setDefaultCopy(`slipbox:${id}`, b);
    expect(readFolders().find((f) => f.name === name)).toMatchObject({ default: b, asked: true });
    expect(readFolders().find((f) => f.name === name)?.ask).toBeUndefined();
    // A copy gone (moved, unplugged) and another come: nothing to choose between — not asked.
    const lone = `l${uniq()}`;
    const lid = uniq();
    const gone = folder({ name: lone, id: lid });
    recordFolder(gone);
    rmSync(gone, { recursive: true });
    expect(recordFolder(folder({ name: lone, id: lid }))?.ask).toBeUndefined();
    // A third copy: asked already, never again.
    const c = folder({ name, id });
    expect(recordFolder(c)?.ask).toBeUndefined();
    expect(lookupFolder(name.toUpperCase())).toMatchObject({ status: "found", path: b });
    // The default gone: another copy, said so; all gone: unavailable, still listed.
    rmSync(b, { recursive: true });
    expect(lookupFolder(name)).toMatchObject({ status: "found", path: a, via: "another-copy" });
    rmSync(a, { recursive: true });
    rmSync(c, { recursive: true });
    expect(lookupFolder(name)).toMatchObject({ status: "unavailable", path: b });
    expect(lookupFolder(`gone${uniq()}`)).toMatchObject({ status: "unknown", reason: expect.stringContaining("isn't on this machine yet: open it, or let the index find it") });
  });

  test("different folders of one name: repositories by their qualified names, .slipbox/ folders until one is renamed; old names still find", async () => {
    const { lookupFolder, pointerName, readFolders, recordFolder } = await import("../src/core/folders.ts");
    const short = `r${uniq()}`;
    const mine = folder({ remote: `git@github.com:me/${short}.git` });
    const theirs = folder({ remote: `https://gitlab.com/lab/${short}` });
    recordFolder(mine);
    recordFolder(theirs);
    expect(lookupFolder(short)).toMatchObject({ status: "ambiguous", candidates: [`github.com/me/${short}`, `gitlab.com/lab/${short}`] });
    expect(lookupFolder(`gitlab.com/lab/${short}`)).toMatchObject({ status: "found", path: theirs });
    const entry = readFolders().find((f) => f.remote === `github.com/me/${short}`)!;
    expect(pointerName(entry)).toBe(`github.com/me/${short}`);
    // Two .slipbox/ folders, one name, different ids.
    const same = `s${uniq()}`;
    const x = folder({ name: same, id: uniq() });
    recordFolder(x);
    expect(pointerName(readFolders().find((f) => f.name === same)!)).toBe(same); // alone: its short name
    recordFolder(folder({ name: same, id: uniq() }));
    const amb = lookupFolder(same);
    expect(amb).toMatchObject({ status: "ambiguous", reason: `2 different folders are called ${same}: rename one (slipbox name <new>, in it)` });
    // Renamed in its config, its old name kept: the old name still finds it, said so.
    const was = `w${uniq()}`;
    const now = `v${uniq()}`;
    const id = uniq();
    const p = folder({ name: was, id });
    recordFolder(p);
    writeFileSync(join(p, ".slipbox", "config.toml"), `[vault]\nid = "${id}"\nname = "${now}"\nprevious_names = ["${was}"]\n`);
    recordFolder(p);
    expect(lookupFolder(now)).toMatchObject({ status: "found", path: p });
    expect(lookupFolder(was)).toMatchObject({ status: "found", path: p, via: "old-name" });
    // No longer named (its .slipbox/ gone, no remote): out of the lookup.
    rmSync(join(p, ".slipbox"), { recursive: true });
    expect(recordFolder(p)).toBeNull();
    expect(lookupFolder(now)).toMatchObject({ status: "unknown" });
  });

  test("opened, a folder is in the lookup; info says its name, copies and the one links open", async () => {
    const name = `i${uniq()}`;
    const id = uniq();
    const a = folder({ name, id });
    const b = folder({ name, id });
    writeFileSync(join(a, "x.md"), "# X\n");
    writeFileSync(join(b, "x.md"), "# X\n");
    await cli(["--root", a, "ls"]);
    const r = JSON.parse((await cli(["--root", b, "info", "--json"])).out).data.folder;
    expect(r).toMatchObject({ name, pointer: name, remote: null, id, private: false, default: a });
    expect(r.copies).toEqual([expect.objectContaining({ path: a, here: false, available: true }), expect.objectContaining({ path: b, here: true, available: true })]);
    expect((await cli(["--root", b, "info"])).out).toContain(`name      ${name} — 2 copies, links open ${a}`);
    const unnamed = folder({ obsidian: true });
    writeFileSync(join(unnamed, "y.md"), "# Y\n");
    expect((await cli(["--root", unnamed, "info"])).out).toContain("name      none — no remote and no .slipbox/ name: linked to by relative path");
  });
});

describe("slipbox:// pointers (21.7)", () => {
  const uniq = () => basename(mkdtempSync(join(tmpdir(), "p"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
  const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], { cwd }).exitCode;
  /** A named folder (`.slipbox/` with this name), its files, opened once so the lookup has it. */
  const named = async (name: string, files: Record<string, string>, parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-"))) => {
    const dir = join(parent, name);
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${uniq()}"\nname = "${name}"\n`);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    await cli(["--root", dir, "problems"]); // in the lookup, and indexed: its links read from elsewhere
    return dir;
  };

  test("parsed: a name, @branch, the path and fragment; a qualified name as the longest known remote", async () => {
    const { formatPointer, parsePointer } = await import("../src/core/pointer.ts");
    const known = [{ key: "remote:github.com/me/research", name: "research", remote: "github.com/me/research", id: null, old: [], private: false, copies: [], default: null }];
    expect(parsePointer("slipbox://notes/inbox.md", known)).toEqual({ name: "notes", branch: null, path: "inbox.md", fragment: null });
    expect(parsePointer("slipbox://research@refactor/a%20b/x.md#Proof%20one", known)).toEqual({ name: "research", branch: "refactor", path: "a b/x.md", fragment: "Proof one" });
    expect(parsePointer("slipbox://github.com/me/research@feat%2Fx/algo/d.md", known)).toEqual({ name: "github.com/me/research", branch: "feat/x", path: "algo/d.md", fragment: null });
    expect(parsePointer("slipbox://gitlab.com/them/other/x.md", known)).toMatchObject({ name: "gitlab.com/them/other", path: "x.md" }); // unknown, by its look
    // A remote of four parts: only the lookup knows where its name ends.
    const deep = [...known, { ...known[0]!, key: "remote:gitlab.com/group/sub/proj", name: "proj", remote: "gitlab.com/group/sub/proj" }];
    expect(parsePointer("slipbox://gitlab.com/group/sub/proj/notes/x.md", deep)).toMatchObject({ name: "gitlab.com/group/sub/proj", path: "notes/x.md" });
    expect(parsePointer("slipbox://notes", known)).toMatchObject({ name: "notes", path: "" });
    expect(parsePointer("https://notes/x.md", known)).toBeNull();
    expect(formatPointer({ name: "research", branch: "feat/x", path: "a b.md", fragment: "Top" }, encodeURI)).toBe("slipbox://research@feat/x/a%20b.md#Top"); // as a branch is written
  });

  test("followed into another folder: its note, file or folder, extensionless; in its own root, a link like any; or why not", async () => {
    const tag = uniq();
    const b = await named(`beta${tag}`, { "sub/x.md": "# X\n\n## Top\n", "img/p.png": "png" });
    const a = await named(`alpha${tag}`, { "a.md": "# A\n", "own.md": `[me](slipbox://alpha${tag}/a.md)\n` });
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const at = (target: string) => g.resolveLink({ kind: "markdown", target }, "own.md");
    expect(at(`slipbox://beta${tag}/sub/x.md#Top`)).toMatchObject({ resolvedKind: "note", path: join(b, "sub", "x.md"), vault: `beta${tag}` });
    expect(at(`slipbox://beta${tag}/sub/x`)).toMatchObject({ resolvedKind: "note", path: join(b, "sub", "x.md") });
    expect(at(`slipbox://beta${tag}/img/p.png`)).toMatchObject({ resolvedKind: "file", path: join(b, "img", "p.png") });
    expect(at(`slipbox://beta${tag}/sub/`)).toMatchObject({ resolvedKind: "folder", path: join(b, "sub") });
    // Its own root: the note by its path here, a backlink like any.
    expect(at(`slipbox://alpha${tag}/a.md`)).toMatchObject({ resolvedKind: "note", path: "a.md" });
    expect(g.backlinks("a.md").map((x) => x.from)).toEqual(["own.md"]);
    expect(at(`slipbox://beta${tag}/nope.md`)).toMatchObject({ resolvedKind: "unresolved", reason: `no nope.md in beta${tag}` });
    expect(at(`slipbox://beta${tag}/../escape.md`)).toMatchObject({ resolvedKind: "unresolved", reason: "../escape.md: a pointer's path stays in its folder" });
    expect(at(`slipbox://gone${tag}/x.md`)).toMatchObject({ resolvedKind: "unresolved", reason: `gone${tag} isn't on this machine yet: open it, or let the index find it` });
    // Two folders of one name: ambiguous, each by where it is.
    await named(`twin${tag}`, { "t.md": "# T\n" });
    await named(`twin${tag}`, { "t.md": "# T\n" });
    expect(at(`slipbox://twin${tag}/t.md`)).toMatchObject({ resolvedKind: "ambiguous", reason: expect.stringContaining(`2 different folders are called twin${tag}`) });
  });

  test("@branch: the checkout with it, a worktree's; else the file as git has it there, read-only; else why not", async () => {
    const tag = uniq();
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-git-"));
    if (git(repo, "init", "-q") !== 0) return; // no git here
    git(repo, "remote", "add", "origin", `git@github.com:me/repo${tag}.git`);
    writeFileSync(join(repo, "x.md"), "# X on main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "main");
    git(repo, "branch", "draft");
    git(repo, "branch", "agent/sync-retry");
    git(repo, "checkout", "-qb", "feature");
    writeFileSync(join(repo, "x.md"), "# X on feature\n");
    git(repo, "commit", "-qam", "feature");
    git(repo, "checkout", "-q", "main");
    const wt = join(mkdtempSync(join(tmpdir(), "slipbox-ptr-wt-")), "wt");
    git(repo, "worktree", "add", "-q", wt, "feature");
    await cli(["--root", repo, "ls"]);
    const { parsePointer, resolvePointer } = await import("../src/core/pointer.ts");
    const r = (u: string) => resolvePointer(parsePointer(u)!);
    expect(r(`slipbox://repo${tag}/x.md`)).toMatchObject({ status: "found", abs: join(repo, "x.md") });
    expect(r(`slipbox://repo${tag}@main/x.md`)).toMatchObject({ status: "found", abs: join(repo, "x.md") });
    expect(r(`slipbox://repo${tag}@feature/x.md`)).toMatchObject({ status: "found", root: wt, abs: join(wt, "x.md") });
    expect(r(`slipbox://github.com/me/repo${tag}@draft/x.md`)).toMatchObject({ status: "branch", root: repo, rel: "x.md", branch: "draft" });
    expect(r(`slipbox://repo${tag}@nowhere/x.md`)).toMatchObject({ status: "unresolved", reason: `repo${tag} has no branch nowhere` });
    // A branch with a `/`: the longest the repository has, the rest the path.
    expect(r(`slipbox://repo${tag}@agent/sync-retry/x.md`)).toMatchObject({ status: "branch", rel: "x.md", branch: "agent/sync-retry" });
    expect(r(`slipbox://repo${tag}@agent%2Fsync-retry/x.md`)).toMatchObject({ status: "branch", rel: "x.md", branch: "agent/sync-retry" });
    // The CLI: the branch read from git.
    const j = JSON.parse((await cli(["--root", repo, "resolve", `slipbox://repo${tag}@draft/x.md`, "--json"])).out).data;
    expect(j).toMatchObject({ status: "resolved", git: { root: repo, rel: "x.md", branch: "draft" } });
  });

  test("the CLI resolves one; another folder's pointer is a backlink; a rename keeps it a pointer, in its form", async () => {
    const tag = uniq();
    const parent = await named(`p${tag}`, { "p.md": "# P\n" });
    const b = await named(`b${tag}`, { "sub/x.md": "# X\n\n## Top\n" }, parent);
    const a = await named(`a${tag}`, { "a.md": `[x](slipbox://b${tag}/sub/x.md#Top) [bare](slipbox://b${tag}/sub/x)\n` });
    const r = JSON.parse((await cli(["--root", a, "resolve", `slipbox://b${tag}/sub/x.md#Top`, "--from", "a.md", "--json"])).out).data;
    expect(r).toMatchObject({ status: "resolved", path: join(b, "sub", "x.md"), line: 3 });
    const unknown = await cli(["--root", a, "resolve", `slipbox://zz${tag}/x.md`]);
    expect(unknown.code).toBe(3);
    expect(unknown.err).toContain(`zz${tag} isn't on this machine yet`);
    const back = JSON.parse((await cli(["--root", b, "backlinks", "sub/x.md", "--json"])).out).data.backlinks;
    expect(back.map((x: { from: string; target: string }) => x.target)).toEqual([`slipbox://b${tag}/sub/x.md#Top`, `slipbox://b${tag}/sub/x`]);
    expect((await cli(["--root", b, "mv", "sub/x.md", "moved/y.md"])).code).toBe(0);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(`[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`);
    // The folder itself moved by slipbox: a pointer names it, wherever it is — nothing rewritten.
    expect((await cli(["--root", parent, "mv", `b${tag}`, `deeper/b${tag}`])).code).toBe(0);
    expect(existsSync(join(parent, "deeper", `b${tag}`, "moved", "y.md"))).toBe(true);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(`[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`);
  });

  test("written across folders that don't travel together: a pointer; together (one repository, nested outside git), a relative path", async () => {
    const { linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const { travelTogether } = await import("../src/core/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-w-"));
    const b = await named(`wb${tag}`, { "far note.md": "---\ntitle: Far\n---\n# Far\n" }, parent);
    const a = await named(`wa${tag}`, { "a.md": "# A\n" }, parent);
    const inner = await named(`wi${tag}`, { "i.md": "# I\n" }, a);
    expect([travelTogether(a, b), travelTogether(a, inner), travelTogether(inner, a)]).toEqual([false, true, true]);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const conv = { path: { value: "name", source: "tool", why: "" }, extension: { value: "dropped", source: "tool", why: "" } } as never;
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "Far")).toBe(`[Far](slipbox://wb${tag}/far%20note.md)`);
    // A wikilink root: a pointer is a URL, so a markdown link.
    expect(writeLink(conv, "wiki", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "")).toBe(`[far note](slipbox://wb${tag}/far%20note.md)`);
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(inner, "i.md")), "I")).toBe(`[I](wi${tag}/i.md)`);
    // One repository: its named folders travel together, wherever each is in it.
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-repo-"));
    mkdirSync(join(repo, ".git"));
    const r1 = await named(`r1${tag}`, { "one.md": "# One\n" }, join(repo, "docs"));
    const r2 = await named(`r2${tag}`, { "two.md": "# Two\n" }, join(repo, "notes"));
    expect(travelTogether(r1, r2)).toBe(true);
    const gr = openGraph(locateVault({ root: r1 }), DEFAULT_CONFIG, false);
    expect(writeLink(conv, "markdown", linkEnds(gr, join(r1, "one.md"), join(r2, "two.md")), "Two")).toBe(`[Two](../../notes/r2${tag}/two.md)`);
    const j = JSON.parse((await cli(["--root", a, "link", join(b, "far note.md"), "--from", "a.md", "--json"])).out).data;
    expect(j.link).toBe(`[Far](slipbox://wb${tag}/far%20note.md)`);
  });

  test("the relink offers a pointer for a relative link into a named folder — reached, or broken where that folder was", async () => {
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-r-"));
    const b = await named(`rb${tag}`, { "n.md": "# N\n" }, parent);
    const a = await named(`ra${tag}`, { "a.md": `[n](../rb${tag}/n.md#top) [n2](../rb${tag}/n.md)\n` }, parent);
    const files = (r: Captured) => JSON.parse(r.out).data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after));
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([`[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`]);
    // Moved by hand, opened where it went: the links broke; the relink offers the pointer to where it is.
    const moved = join(mkdtempSync(join(tmpdir(), "slipbox-ptr-r2-")), `rb${tag}`);
    renameSync(b, moved);
    await cli(["--root", moved, "ls"]);
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([`[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`]);
  });
});

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
    const { normKey } = await import("../src/core/links.ts");
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
    const { landingLine } = await import("../src/core/landing.ts");
    expect(landingLine(g, "İzmir.md", "iklim", null)).toBe(3);
    expect(landingLine(g, "İzmir.md", "İklim", null, true)).toBe(3);
  });

  test("repeated headings: a markdown link's #setup-1 is the second (GitHub's numbering); a wikilink's text, the first — said so by the link check", async () => {
    const { githubSlugs, landingLine } = await import("../src/core/landing.ts");
    expect(githubSlugs(["a", "a", "a-1", "b", "a"].map((slug) => ({ slug })))).toEqual(["a", "a-1", "a-1-1", "b", "a-2"]);
    const { dir, g } = vault({ "n.md": "# N\n\n## Setup\n\none\n\n## Setup\n\ntwo\n", "a.md": "[1](n.md#setup) [2](n.md#setup-1) [[n#Setup]]\n" });
    expect(landingLine(g, "n.md", "setup", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup-1", null)).toBe(7);
    expect(landingLine(g, "n.md", "Setup", null, true)).toBe(3);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const probs = noteProblems(g, "a.md").map((p) => [p.code, p.target, p.message]);
    expect(probs).toEqual([["ambiguous-heading", "n", 'several headings "Setup" in n.md: this link reaches the first']]);
    // resolve gives the line and the fragment to write: the second, numbered.
    const r = JSON.parse((await cli(["--root", dir, "resolve", "n.md#setup-1", "--from", "a.md", "--json"])).out).data;
    expect(r).toMatchObject({ line: 7, href: "n.md#setup-1" });
  });

  test("a path of headings (Obsidian's [[note#Install#Linux]]): each inside the one before", async () => {
    const { landingLine } = await import("../src/core/landing.ts");
    const { g } = vault({ "n.md": "# N\n\n## Install\n\n### Linux\n\ni\n\n## Remove\n\n### Linux\n\nr\n" });
    expect(landingLine(g, "n.md", "Install#Linux", null, true)).toBe(5);
    expect(landingLine(g, "n.md", "Remove#Linux", null, true)).toBe(11);
    expect(landingLine(g, "n.md", "Remove#Install", null, true)).toBeNull(); // not inside it
    const later = vault({ "m.md": "# M\n\n## Install\n\ni\n\n## Remove\n\n### Usage\n" }).g;
    expect(landingLine(later, "m.md", "Install#Usage", null, true)).toBeNull(); // a later section's
  });

  test("explicit ids: `## Setup {#install-guide}` (shown without it), <a id>, <a name>; GitHub's slugs keep marks", async () => {
    const { landingLine } = await import("../src/core/landing.ts");
    const { slugify } = await import("../src/core/parse.ts");
    expect(slugify("हिन्दी नोट्स")).toBe("हिन्दी-नोट्स"); // the vowel signs kept, as GitHub keeps them
    expect(slugify("snake_case & Co.")).toBe("snake_case--co");
    const { g } = vault({ "n.md": "# N\n\n## Setup {#install-guide .wide}\n\nx\n\n<a id=\"faq\"></a>\n\nQ?\n\nThe <a name=\"old\">old</a> place.\n" });
    expect(g.entry("n.md")!.headings.find((h) => h.depth === 2)).toMatchObject({ text: "Setup", id: "install-guide" });
    expect(landingLine(g, "n.md", "install-guide", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup", null)).toBe(3); // its own slug too
    expect(landingLine(g, "n.md", "faq", null)).toBe(7);
    expect(landingLine(g, "n.md", "old", null)).toBe(11);
    const r = renderMarkdown("## Setup {#install-guide}\n", { width: 40, glyphs: glyphsFor("unicode"), showUrls: false });
    expect(r.lines.map((l) => l.spans.map((s) => s.text).join("")).join("\n")).not.toContain("{#");
    expect(r.headings[0]).toMatchObject({ text: "Setup", id: "install-guide" });
  });

  test("line links: L42, L42-L50, L42C5-L45C10; a ^id inside a code fence is code, not a block", async () => {
    const { blockIds, landingLine, landingText, lineFragment } = await import("../src/core/landing.ts");
    expect(lineFragment("L42-L50")).toEqual({ line: 42, col: null, endLine: 50 });
    expect(lineFragment("L42C5-L45C10")).toEqual({ line: 42, col: 5, endLine: 45 });
    expect(lineFragment("L0")).toEqual({ line: 1, col: null, endLine: null });
    expect(lineFragment("Lx")).toBeNull();
    const text = "# N\n\n```js\nconst a = 1; ^fake\n```\n\nreal paragraph ^real\n\n~~~~\n``` not a close\n~~~\nb ^fake2\n~~~~\n\n```not `a` fence\nstill text ^inline\n";
    expect(blockIds(text)).toEqual([{ id: "real", line: 7 }, { id: "inline", line: 16 }]);
    const { g } = vault({ "n.md": text });
    expect(landingLine(g, "n.md", null, "fake")).toBeNull();
    expect(landingLine(g, "n.md", null, "real")).toBe(7);
    expect(landingLine(g, "n.md", "L3C2-L5C1", null)).toBe(3);
    expect(landingText(g, "n.md", "L3-L5", null)).toBe("```js\nconst a = 1; ^fake\n```");
  });
});

describe("links in front matter (Obsidian's properties)", () => {
  test("a property's wikilinks are links: read where written, backlinked, renamed in place, drawn and checked; a comment's aren't", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-fmlinks-"));
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "Dal.md"), "# Dal\n");
    writeFileSync(join(dir, "Home.md"), "# Home\n");
    writeFileSync(join(dir, "pic.png"), "png");
    writeFileSync(join(dir, "x.md"), '---\nrelated: "[[Dal]]"\nup: ["[[Home|home]]", "![[pic.png]]"]\n# not this: [[Nope]]\nmissing: "[[Gone]]"\n---\n# X\n');
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("x.md").map((l) => [l.kind, l.target, l.line, l.column, l.resolvedKind])).toEqual([
      ["wiki", "Dal", 2, 11, "note"],
      ["wiki", "Home", 3, 7, "note"],
      ["embed", "pic.png", 3, 24, "file"],
      ["wiki", "Gone", 5, 11, "unresolved"],
    ]);
    expect(g.backlinks("Dal.md").map((b) => b.from)).toEqual(["x.md"]);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    expect(noteProblems(g, "x.md").map((p) => [p.code, p.target, p.start.line])).toEqual([["unresolved", "Gone", 5]]);
    // Drawn as links in the properties.
    const parsed = (await import("../src/core/readers.ts")).parseNoteFile("x.md", readFileSync(join(dir, "x.md"), "utf8"));
    const { renderTree } = await import("../src/core/layout/render.ts");
    const r = renderTree(parsed.tree, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false, resolveLink: (_k, t) => (t === "Gone" ? "unresolved" : "resolved") }, parsed.frontmatter);
    expect(r.links.map((l) => [l.kind, l.target, l.text])).toEqual([["wiki", "Dal", "Dal"], ["wiki", "Home", "home"], ["embed", "pic.png", "pic.png"], ["wiki", "Gone", "Gone"]]);
    // Renamed: the property rewritten where it is.
    expect((await cli(["--root", dir, "mv", "Dal.md", "Lentils.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "x.md"), "utf8")).toStartWith('---\nrelated: "[[Lentils]]"\n');
  });
});

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
    const { certainty, describeLanding } = await import("../src/core/graph.ts");
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
    expect(how("Starter", "Recipes/Baking/x.md")).toEqual(["Recipes/Baking/Starter.md", "same-folder", "inferred", "in the same folder, of 2"]);
    expect(how("Starter")).toEqual(["Archive/Starter.md", "shortest", "inferred", "the shortest path of 2 named so"]);
    expect(how("Recipes/Notes.md", "Home.md", "markdown")[2]).toBe("exact");
    expect(certainty({ resolvedKind: "ambiguous" })).toBe("ambiguous");
    expect(certainty({ resolvedKind: "unresolved" })).toBe("broken");
  });

  test("a link won by where it's written is fragile: said, with the path that names it for sure, a fix; problems and the CLI list them", async () => {
    const { dir, g } = vault(files);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const fragile = noteProblems(g, "Home.md").filter((p) => p.code === "fragile");
    expect(fragile.map((p) => [p.target, p.fix])).toEqual([
      ["Pie", { title: "Name it for sure: [[Recipes/Baking/Pie]]", text: "[[Recipes/Baking/Pie]]" }],
      ["Starter", { title: "Name it for sure: [[Archive/Starter]]", text: "[[Archive/Starter]]" }],
    ]);
    expect(fragile[0]!.message).toBe("[[Pie]] reaches Recipes/Baking/Pie.md as the shortest path of 2 named so — a note of that name nearer would take it; [[Recipes/Baking/Pie]] names it for sure");
    expect(g.problems().fragile.map((p) => [p.from, p.target, p.fix])).toEqual([["Home.md", "Pie", "Recipes/Baking/Pie"], ["Home.md", "Starter", "Archive/Starter"]]);
    const human = (await cli(["--root", dir, "problems"])).out;
    expect(human).toContain("fragile links (2)");
    expect(human).toContain("Home.md:1:55  [[Pie]]  — the shortest path of 2 named so; [[Recipes/Baking/Pie]] names it for sure");
    const links = JSON.parse((await cli(["--root", dir, "links", "Home.md", "--json"])).out).data;
    expect(links.map((l: { target: string; how: string; certainty: string }) => [l.target, l.how, l.certainty])).toEqual([
      ["Notes", "same-folder", "inferred"],
      ["Recipes/Notes", "path", "exact"],
      ["Dal", "name", "exact"],
      ["Weeknight/Dal", "suffix", "inferred"],
      ["Pie", "shortest", "inferred"],
      ["Starter", "shortest", "inferred"],
      ["Recipes/Notes.md", null, "exact"],
    ]);
    expect((await cli(["--root", dir, "links", "Home.md"])).out).toContain("[[Pie]] -> Recipes/Baking/Pie.md (the shortest path of 2 named so)");
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
    g.updateFile("Recipes/Baking/Pie.md", { rel: "Recipes/Baking/Pie.md", abs: join(g.root, "Recipes/Baking/Pie.md"), size: 30, mtimeMs: Date.now() });
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

describe("links to the repository's own hosting (trailscout's review)", () => {
  test("parsed: GitHub's blob, tree and raw; GitLab's /-/blob with groups; Bitbucket's src and #markdown-header-; a repository's page", async () => {
    const { parseHosted } = await import("../src/core/hosting.ts");
    expect(parseHosted("https://github.com/me/repo/blob/main/docs/my%20plan.md#goals")).toEqual({ remote: "github.com/me/repo", ref: "main", path: "docs/my plan.md", fragment: "goals", folder: false });
    expect(parseHosted("https://github.com/me/repo/tree/v2/docs")).toMatchObject({ ref: "v2", path: "docs", folder: true });
    expect(parseHosted("https://GitLab.com/group/sub/proj/-/blob/main/x.md")).toMatchObject({ remote: "gitlab.com/group/sub/proj", ref: "main", path: "x.md" });
    expect(parseHosted("https://bitbucket.org/team/repo/src/main/docs/x.md#markdown-header-goals")).toMatchObject({ remote: "bitbucket.org/team/repo", path: "docs/x.md", fragment: "goals" });
    expect(parseHosted("https://github.com/me/repo.git#readme")).toEqual({ remote: "github.com/me/repo", ref: null, path: "", fragment: null, folder: false });
    expect(parseHosted("https://github.com/me/repo/issues/12")).toBeNull();
    expect(parseHosted("mailto:me@example.com")).toBeNull();
  });

  test("in a README: the file in this copy, a backlink; another ref said; another repository's a URL; renamed, the URL follows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-host-"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:Me/Repo.git\n');
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "plan.md"), "# Plan\n\n## Goals\n");
    const base = "https://github.com/me/repo";
    writeFileSync(join(dir, "README.md"), `# Repo\n\n[plan](${base}/blob/main/docs/plan.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/plan.md) [home](https://github.com/ME/Repo#readme) [else](https://github.com/them/other/blob/main/x.md) [gone](${base}/blob/main/gone.md)\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const { certainty } = await import("../src/core/graph.ts");
    expect(g.linksOf("README.md").map((l) => [l.resolvedKind, l.path, l.via ?? null, certainty(l)])).toEqual([
      ["note", "docs/plan.md", "hosting", "exact"],
      ["folder", "docs", "hosting", "exact"],
      ["note", "docs/plan.md", "hosting", "inferred"],
      ["note", "README.md", "hosting", "exact"],
      ["external", "https://github.com/them/other/blob/main/x.md", null, "exact"],
      ["unresolved", null, "hosting", "broken"],
    ]);
    expect(g.backlinks("docs/plan.md").map((b) => b.from)).toEqual(["README.md", "README.md"]);
    const { landingLine } = await import("../src/core/landing.ts");
    expect(landingLine(g, "docs/plan.md", "goals", null)).toBe(3);
    expect(landingLine(g, "docs/plan.md", "markdown-header-goals", null)).toBe(3);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    expect(noteProblems(g, "README.md").map((p) => [p.code, p.message])).toEqual([
      ["other-ref", `${base}/blob/dev/docs/plan.md names dev; this copy is on main`],
      ["unresolved", "no gone.md in this copy of github.com/me/repo"],
    ]);
    const r = JSON.parse((await cli(["--root", dir, "resolve", `${base}/blob/main/docs/plan.md#goals`, "--json"])).out).data;
    expect(r).toMatchObject({ status: "resolved", path: "docs/plan.md", line: 3 });
    expect((await cli(["--root", dir, "mv", "docs/plan.md", "docs/road map.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain(`[plan](${base}/blob/main/docs/road%20map.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/road%20map.md)`);
  });

  test("another repository this machine knows by its remote (21.6): its file there", async () => {
    const { recordFolder } = await import("../src/core/folders.ts");
    const tag = basename(mkdtempSync(join(tmpdir(), "h"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
    const other = mkdtempSync(join(tmpdir(), "slipbox-host-b-"));
    mkdirSync(join(other, ".git"));
    writeFileSync(join(other, ".git", "config"), `[remote "origin"]\n\turl = https://github.com/me/b${tag}\n`);
    writeFileSync(join(other, "n.md"), "# N\n");
    recordFolder(other);
    const dir = mkdtempSync(join(tmpdir(), "slipbox-host-a-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), `[n](https://github.com/me/b${tag}/blob/main/n.md)\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("a.md")[0]).toMatchObject({ resolvedKind: "note", path: join(other, "n.md"), via: "hosting" });
  });
});

describe("named folders' words (21.10)", () => {
  const uniq = () => basename(mkdtempSync(join(tmpdir(), "w"))).replace(/[^a-z0-9]/gi, "").toLowerCase();
  test("a pointer as a command's note; slipbox name — a .slipbox/ folder's renamed, the old one kept and its pointers relinked; a repository's given one", async () => {
    const tag = uniq();
    const b = join(mkdtempSync(join(tmpdir(), "slipbox-words-")), "b");
    mkdirSync(join(b, ".slipbox"), { recursive: true });
    writeFileSync(join(b, ".slipbox", "config.toml"), `[vault]\nid = "b${tag}"\nname = "beta${tag}"\n`);
    writeFileSync(join(b, "x.md"), "# X\n\nbody\n");
    const a = mkdtempSync(join(tmpdir(), "slipbox-words-a-"));
    mkdirSync(join(a, ".slipbox"));
    writeFileSync(join(a, "a.md"), `[x](slipbox://beta${tag}/x.md)\n`);
    await cli(["--root", b, "ls"]);
    // A pointer names the note a command works on.
    const read = JSON.parse((await cli(["read", `slipbox://beta${tag}/x`, "--json"])).out).data;
    expect(read.content).toBe("# X\n\nbody\n");
    expect((await cli(["read", `slipbox://nope${tag}/x.md`])).code).toBe(3);
    // Renamed: the old name kept; a pointer by it still finds it, and the relink writes the new one.
    expect((await cli(["--root", b, "name", `gamma${tag}`])).code).toBe(0);
    expect(readFileSync(join(b, ".slipbox", "config.toml"), "utf8")).toContain(`previous_names = ["beta${tag}"]`);
    const ga = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    expect(ga.linksOf("a.md")[0]).toMatchObject({ resolvedKind: "note", via: "old-name" });
    expect((await cli(["--root", a, "relink"])).code).toBe(0);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(`[x](slipbox://gamma${tag}/x.md)\n`);
    // A different folder's name: refused.
    const c = join(mkdtempSync(join(tmpdir(), "slipbox-words-c-")), "c");
    mkdirSync(join(c, ".slipbox"), { recursive: true });
    writeFileSync(join(c, ".slipbox", "config.toml"), `[vault]\nid = "c${tag}"\nname = "c${tag}"\n`);
    writeFileSync(join(c, "c.md"), "# C\n");
    const clash = await cli(["--root", c, "name", `gamma${tag}`]);
    expect(clash.code).toBe(5);
    expect(clash.err).toContain(`a different folder is called gamma${tag}`);
    // A repository without .slipbox/: one made to hold the name.
    const repo = mkdtempSync(join(tmpdir(), "slipbox-words-r-"));
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "r.md"), "# R\n");
    expect((await cli(["--root", repo, "name", `repo${tag}`])).code).toBe(0);
    expect(readFileSync(join(repo, ".slipbox", "config.toml"), "utf8")).toContain(`name = "repo${tag}"`);
  });

  test("slipbox folders: each name, its copies, the one links open; default <name> <path> makes another the one", async () => {
    const tag = uniq();
    const mk = () => {
      const d = join(mkdtempSync(join(tmpdir(), "slipbox-words-f-")), `f${tag}`);
      mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "f${tag}"\nname = "f${tag}"\n`);
      writeFileSync(join(d, "n.md"), "# N\n");
      return d;
    };
    const one = mk();
    const two = mk();
    await cli(["--root", one, "ls"]);
    await cli(["--root", two, "ls"]);
    const f = JSON.parse((await cli(["folders", "--json"])).out).data.find((x: { name: string }) => x.name === `f${tag}`);
    expect(f).toMatchObject({ pointer: `f${tag}`, default: one, copies: [{ path: one, available: true }, { path: two, available: true }] });
    expect((await cli(["folders"])).out).toContain(`f${tag}\n  * ${one}\n    ${two}`);
    expect((await cli(["folders", "default", `f${tag}`, two])).code).toBe(0);
    expect(JSON.parse((await cli(["folders", "--json"])).out).data.find((x: { name: string }) => x.name === `f${tag}`).default).toBe(two);
    expect((await cli(["folders", "default", `f${tag}`, "/not/a/copy"])).code).toBe(5);
    expect((await cli(["folders", "default", `nope${tag}`, two])).code).toBe(3);
  });
});
