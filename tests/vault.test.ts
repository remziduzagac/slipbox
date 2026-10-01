// The fixture vault (0.5) against the walk (0.11), discovery (1.1), the graph and the CLI (9.x).

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CLI_COMMANDS, runCli } from "../src/cli/cli.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { applyPlan, planHeadingRename, planUndo } from "../src/core/rename.ts";
import { findVaultRoot, gitRootOf, initVault, locateVault, recordLocation } from "../src/core/vault.ts";
import { vaultKey } from "../src/core/paths.ts";

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
  test("no marker: a file in a git repository is loose until the repository is made a vault (17.18)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "docs", "n.md") });
    expect(loc.mode).toBe("home");
    expect(loc.root).toBe(join(dir, "docs"));
    expect(gitRootOf(loc.root)).toBe(dir);
    // The CLI says what would make it a vault.
    const out: string[] = [];
    await runCli(["ls", "--json"], { out: (s) => out.push(s), err: () => {}, stdin: async () => "", isTTY: false, columns: 80, cwd: join(dir, "docs"), env: process.env });
    expect(JSON.parse(out.join("")).warnings.join()).toContain(`not in a vault: ${dir} is a git repository without .slipbox/ — slipbox init ${dir} makes it one`);
    // A worktree's or submodule's .git is a file: a repository too.
    const wt = mkdtempSync(join(tmpdir(), "slipbox-worktree-"));
    writeFileSync(join(wt, ".git"), "gitdir: /elsewhere\n");
    expect(gitRootOf(wt)).toBe(wt);
  });
  test("neither: the home vault — the loose file's folder, keyed by the home vault's id (17.2)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    writeFileSync(join(dir, "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "n.md") });
    expect(loc.mode).toBe("home");
    expect(loc.root).toBe(dir);
    expect(loc.name).toBe("home");
    // Made on first use, in the data directory: its .slipbox/, with an id that never changes.
    const cfg = readFileSync(join(process.env.XDG_DATA_HOME!, "slipbox", "home", "config.toml"), "utf8");
    expect(cfg).toContain(`id = "${loc.id}"`);
    expect(cfg).toContain('name = "home"');
    expect(loc.key).toBe(loc.id!);
    const other = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    expect(locateVault({ path: other }).key).toBe(loc.key);
  });
  test("a vault walks into a repository inside it: only a .slipbox/ is a boundary (17.18)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nest-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub", ".git"), { recursive: true });
    writeFileSync(join(dir, "top.md"), "# top\n");
    writeFileSync(join(dir, "sub", "inner.md"), "# inner\n");
    const vault = openGraph(locateVault({ path: dir }), DEFAULT_CONFIG, false);
    expect([...vault.notes.keys()].sort()).toEqual(["sub/inner.md", "top.md"]);
    expect(locateVault({ path: join(dir, "sub", "inner.md") }).root).toBe(dir);
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
      const loc = locateVault({ path: join(home, "notes", "n.md") });
      expect(loc.mode).toBe("home");
      expect(loc.root).toBe(join(home, "notes"));
      expect(() => initVault(home)).toThrow(/never indexes/);
    } finally {
      process.env.HOME = before;
    }
  });
  test("--root names a vault: it takes precedence, and must have a .slipbox/ (17.18)", () => {
    expect(locateVault({ root: join(VAULT, "nested-vault"), path: join(VAULT, "nested-vault", "inner.md") }).root).toBe(join(VAULT, "nested-vault"));
    expect(() => locateVault({ root: join(VAULT, "notes") })).toThrow(/isn't a vault \(no \.slipbox\/\): slipbox init/);
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
  test("graph: links resolve, attachments by name, backlinks", () => {
    const links = withVaultCfg.linksOf("index.md");
    const byTarget = Object.fromEntries(links.map((l) => [l.target, l]));
    expect(byTarget["Beta"]!.path).toBe("notes/beta.md");
    expect(byTarget["README"]!.path).toBe("notes/Readme.md");
    expect(byTarget["missing-note"]!.resolvedKind).toBe("unresolved");
    expect(byTarget["diagram.png"]!.path).toBe("attachments/diagram.png");
    expect(withVaultCfg.backlinks("notes/beta.md").map((b) => b.from)).toContain("index.md");
    expect(withVaultCfg.notes.get("cjk/日本語.md")!.links[0]!.target).toBe("alpha");
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
    const r = await cli(["resolve", "[[alpha#Section Two]]", "--from", "index.md", "--json"]);
    expect(JSON.parse(r.out).data).toMatchObject({ status: "resolved", path: "notes/alpha.md", line: 11 });
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
    expect(shown.content).toBe("first thought\n\n`notes/alpha.md:7-9`\n\n```markdown\n## Section One\n\nBack to [[index]] and on to [[beta]].\n```\n\n`index.md:3`\n\n```markdown\npiped selection\n```\n");
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
  test("a folder with no .slipbox or repository above it is listed alone: its notes, no walk", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-loose-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "# A\n\n[[b]]\n");
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "sub", "c.md"), "# C\n");
    const loc = locateVault({ path: dir, cwd: dir });
    expect(loc.mode).toBe("home");
    const g = openGraph(loc, DEFAULT_CONFIG, false);
    expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
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
    expect(loc).toMatchObject({ mode: "vault", id: r.json.data.id, name: "Field-Notes", key: r.json.data.id });
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
    expect(loc.key).toBe(loc.id!);
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
    expect((await cli(["init", other, "--name", "home"], other)).code).toBe(5);
    expect((await cli(["init", other, "--name", "a:b"], other)).code).toBe(5);
    // The folder's name when free; a taken one gets -2.
    const again = join(fresh("names"), "xnames");
    mkdirSync(again);
    expect((await cli(["init", again, "--json"], again)).json.data.name).toBe("xnames-2");
  });

  test("a copy of a vault (same id) keys its state apart while the original is there; a move keeps it (17.3)", async () => {
    const a = fresh("orig");
    const r = await cli(["init", a, "--name", "orig", "--json"], a);
    const id = r.json.data.id;
    expect(locateVault({ path: a }).key).toBe(id);
    const b = fresh("copy");
    cpSync(join(a, ".slipbox"), join(b, ".slipbox"), { recursive: true });
    const copy = locateVault({ path: b });
    expect(copy.id).toBe(id);
    expect(copy.key).not.toBe(id);
    expect(copy.key.startsWith(`${id}-`)).toBe(true);
    // The original moved away (gone from where the list saw it): the copy is the vault now.
    rmSync(a, { recursive: true });
    expect(locateVault({ path: b }).key).toBe(id);
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
    // A git repository without .slipbox/ is no vault: not listed.
    const repo = fresh("regrepo");
    mkdirSync(join(repo, ".git"));
    await cli(["ls"], repo);
    expect(readRegistry().find((v) => v.path === repo)).toBeUndefined();
  });

  test("the home vault keeps every loose folder's positions by absolute path, and a session per folder", async () => {
    const { PositionStore, loadSession, saveSession } = await import("../src/core/position.ts");
    const one = fresh("l1");
    const two = fresh("l2");
    const a = locateVault({ path: one });
    const b = locateVault({ path: two });
    expect(a.key).toBe(b.key);
    const pa = new PositionStore(a);
    pa.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 3 });
    pa.save();
    const pb = new PositionStore(b);
    expect(pb.get("n.md")).toBeNull(); // another folder's n.md
    expect(pb.get(join(one, "n.md"))?.line).toBe(3);
    saveSession(a, { version: 1, tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true });
    expect(loadSession(a)?.tabs).toHaveLength(1);
    expect(loadSession(b)).toBeNull();
  });
});

describe("links across vaults: aliases, previous names, [[vault:note]], paths (17.7–17.11)", () => {
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
    "app/links.md": "[[xnotes:todo]] and [t](../notes/person.md)\n",
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

  test("[[vault:note]] reaches the note in the named vault, with its heading's line (17.8)", async () => {
    await ready;
    const r = await cli(["resolve", "[[xapp:design#Goals]]"], notes);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md"), vault: "xapp", line: 5 });
    // Bare, it's the same link — not a URL with a scheme.
    expect((await cli(["resolve", "xapp:design"], notes)).json.data.abs).toBe(join(app, "design.md"));
    // This vault by its own name reaches its own notes.
    expect((await cli(["resolve", "[[xnotes:todo]]"], notes)).json.data.path).toBe("todo.md");
    // A note named with a colon is still a note here.
    expect((await cli(["resolve", "[[a:b]]"], notes)).json.data.path).toBe("a:b.md");
  });

  test("a note or vault that isn't there says which (17.8)", async () => {
    await ready;
    const missing = await cli(["resolve", "[[xapp:missing]]"], notes);
    expect(missing.code).toBe(3);
    expect(missing.json.data.reason).toBe('no note "missing" in vault "xapp"');
    const unknown = await cli(["resolve", "[[nope:x]]"], notes);
    expect(unknown.code).toBe(3);
    expect(unknown.json.error.message).toContain('unknown vault "nope"');
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "nope:x")).toMatchObject({ status: "unresolved", reason: 'unknown vault "nope"' });
    expect(links.find((l: { target: string }) => l.target === "xapp:design")).toMatchObject({ status: "note", path: join(app, "design.md"), vault: "xapp" });
  });

  test("aliases resolve like names; a previous name is a fallback, said so (17.7)", async () => {
    await ready;
    const nick = await cli(["resolve", "[[nick]]"], notes);
    expect(nick.json.data).toMatchObject({ path: "person.md", via: "alias" });
    const old = await cli(["resolve", "[[old-name]]"], notes);
    expect(old.json.data).toMatchObject({ path: "renamed.md", via: "previous-name" });
    expect(old.json.warnings.join()).toContain("by a previous name");
    // A file named like an alias wins over the alias.
    writeFileSync(join(notes, "nick.md"), "# the real nick\n");
    expect((await cli(["resolve", "[[nick]]"], notes)).json.data).toMatchObject({ path: "nick.md", via: null });
    rmSync(join(notes, "nick.md"));
    // Two notes claiming one previous name: ambiguous, never a guess.
    writeFileSync(join(notes, "other.md"), "---\nprevious_names: old-name\n---\n# Other\n");
    expect((await cli(["resolve", "[[old-name]]"], notes)).code).toBe(4);
    rmSync(join(notes, "other.md"));
  });

  test("a path out of the root reaches the file in the other vault (17.9)", async () => {
    await ready;
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "../app/design.md")).toMatchObject({ status: "note", path: join(app, "design.md"), vault: "xapp" });
  });

  test("backlinks come from other vaults' indexes too, as of their last indexing (17.11)", async () => {
    await ready;
    const todo = (await cli(["backlinks", "todo"], notes)).json.data.backlinks;
    expect(todo).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), vault: "xapp", kind: "wiki" }));
    const person = (await cli(["backlinks", "person"], notes)).json.data.backlinks;
    expect(person).toContainEqual(expect.objectContaining({ from: join(app, "links.md"), vault: "xapp", kind: "markdown" }));
  });

  test("a renamed vault's old name still reaches it, checked by its id; a moved-away vault says where it was", async () => {
    await ready;
    const cfg = join(app, ".slipbox", "config.toml");
    const before = readFileSync(cfg, "utf8");
    writeFileSync(cfg, before.replace('name = "xapp"', 'name = "xapp2"\nprevious_names = ["xapp"]'));
    await cli(["ls"], app); // the machine sees the new name
    const r = await cli(["resolve", "[[xapp:design]]"], notes);
    expect(r.json.data).toMatchObject({ abs: join(app, "design.md"), via: "previous-name", vault: "xapp2" });
    const moved = join(base, "app-moved");
    const { renameSync } = await import("node:fs");
    renameSync(app, moved);
    const gone = await cli(["resolve", "[[xapp2:design]]"], notes);
    expect(gone.code).toBe(3);
    expect(gone.json.data.reason).toContain(`was last seen at ${app}`);
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

  test("a note moved outside slipbox (mv) is found again: path links, [[dir/old]] and [[old]] follow it", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "notes/plan.md": "# The plan\n\nSteps.\n", "index.md": "[p](notes/plan.md) [[notes/plan]] [[plan]]\n" });
    await cli(["ls"], dir); // indexed: plan.md's text is known
    mkdirSync(join(dir, "archive"));
    renameSync(join(dir, "notes", "plan.md"), join(dir, "archive", "old-plan.md"));
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(links.map((l: { status: string; path: string; via: string }) => [l.status, l.path, l.via])).toEqual([
      ["note", "archive/old-plan.md", "redirect"],
      ["note", "archive/old-plan.md", "redirect"],
      ["note", "archive/old-plan.md", "redirect"],
    ]);
    const r = await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir);
    expect(r.json.data.path).toBe("archive/old-plan.md");
    expect(r.json.warnings.join()).toContain("by a redirect");
    // It counts as a backlink of where the note is now.
    expect((await cli(["backlinks", "archive/old-plan.md"], dir)).json.data.backlinks).toHaveLength(3);
    // Moved again: the chain is followed.
    renameSync(join(dir, "archive", "old-plan.md"), join(dir, "plan-final.md"));
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).json.data.path).toBe("plan-final.md");
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
    expect(g.resolveLink({ kind: "markdown", target: "b.md" }, "a2.md")).toMatchObject({ resolvedKind: "note", path: "b2.md", via: "redirect" });
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
      "notes/plan.md": "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../index.md) and [[index]].\n",
      "index.md":
        "# Index\n\n[[plan]] and [[notes/plan#Steps|the steps]] and ![[plan]]\n\n" +
        "[p](notes/plan.md#steps) and [r][ref] and [[nickname]]\n\n| a | b |\n| - | - |\n| [[plan\\|x]] | y |\n\n[ref]: notes/plan.md\n",
      "notes/other.md": "---\naliases: [nickname]\n---\nSee [x](plan.md), [[plan]] 🔭 [[plan]].\n",
      "code.md": "`[[plan]]` and `[p](notes/plan.md)` are code; [[plan]] and [p](notes/plan.md) aren't.\n",
    });
    const dry = await cli(["mv", "plan", "archive/2026/roadmap", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.dryRun).toBe(true);
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true); // nothing written by a preview
    expect(dry.json.data.files.map((f: { path: string }) => f.path).sort()).toEqual(["code.md", "index.md", "notes/other.md", "notes/plan.md"]);
    const done = await cli(["mv", "plan", "archive/2026/roadmap"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "index.md")).toBe(
      "# Index\n\n[[roadmap]] and [[archive/2026/roadmap#Steps|the steps]] and ![[roadmap]]\n\n" +
        "[p](archive/2026/roadmap.md#steps) and [r][ref] and [[nickname]]\n\n| a | b |\n| - | - |\n| [[roadmap\\|x]] | y |\n\n[ref]: archive/2026/roadmap.md\n",
    );
    expect(read(dir, "notes/other.md")).toBe("---\naliases: [nickname]\n---\nSee [x](../archive/2026/roadmap.md), [[roadmap]] 🔭 [[roadmap]].\n");
    // The link at the index's position, not the same text in code before it.
    expect(read(dir, "code.md")).toBe("`[[plan]]` and `[p](notes/plan.md)` are code; [[roadmap]] and [p](archive/2026/roadmap.md) aren't.\n");
    // It moved two folders deeper: its own relative link follows; its old name is kept.
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    expect(read(dir, "archive/2026/roadmap.md")).toBe("---\ntitle: Plan\nprevious_names: [plan]\n---\n# Plan\n\n## Steps\n\nUp: [home](../../index.md) and [[index]].\n");
    // Every link resolves to it now, by its new name.
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(links.filter((l: { path: string }) => l.path === "archive/2026/roadmap.md").every((l: { via: string | null }) => l.via === null)).toBe(true);
    // Somewhere slipbox couldn't reach, [[plan]] still finds it: by its previous name.
    writeFileSync(join(dir, "late.md"), "[[plan]]\n");
    expect((await cli(["resolve", "[[plan]]", "--from", "late.md"], dir)).json.data).toMatchObject({ path: "archive/2026/roadmap.md", via: "previous-name" });
  });

  test("a name another note has: links get the path, so they can't reach the wrong one", async () => {
    const dir = vault({ "a/plan.md": "# plan\n", "b/roadmap.md": "# the other roadmap\n", "index.md": "[[plan]]\n" });
    await cli(["mv", "a/plan", "a/roadmap"], dir);
    expect(read(dir, "index.md")).toBe("[[a/roadmap]]\n");
  });

  test("refused: an existing target, outside the vault, a file changed since the preview", async () => {
    const dir = vault({ "a.md": "# a\n", "b.md": "# b\n", "index.md": "[[a]]\n" });
    expect((await cli(["mv", "a", "b"], dir)).code).toBe(5);
    expect((await cli(["mv", "a", "../elsewhere"], dir)).code).toBe(5);
    const { openGraph: open } = await import("../src/core/graph.ts");
    const { planNoteRename, applyPlan } = await import("../src/core/rename.ts");
    const g = open(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const plan = planNoteRename(g, "a.md", "c");
    writeFileSync(join(dir, "index.md"), "[[a]] edited meanwhile\n");
    expect(() => applyPlan(g, plan)).toThrow(/changed since the preview/);
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(read(dir, "index.md")).toBe("[[a]] edited meanwhile\n");
  });

  test("links from other vaults are rewritten too; a vault's rename keeps its old name (17.15)", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": "[[rnotes:plan]] and [t](../NOTES/plan.md)\n".replace("NOTES", basename(notes)), "self.md": "[[rapp:links]]\n" });
    await cli(["init", notes, "--name", "rnotes"], notes);
    await cli(["init", app, "--name", "rapp"], app);
    await cli(["ls"], app); // its index: the links into rnotes
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(`[[rnotes:roadmap]] and [t](../${basename(notes)}/roadmap.md)\n`);
    // The vault's rename: [[rnotes:…]] everywhere reached, the config, the old name kept.
    await cli(["ls"], app);
    const r = await cli(["rename-vault", "rnotes2"], notes);
    expect(r.code).toBe(0);
    expect(read(app, "links.md")).toStartWith("[[rnotes2:roadmap]]");
    const cfg = read(notes, ".slipbox/config.toml");
    expect(cfg).toContain('name = "rnotes2"');
    expect(cfg).toContain('previous_names = ["rnotes"]');
    // A link this machine didn't reach still works, by the old name, checked by the id.
    writeFileSync(join(app, "late.md"), "[[rnotes:roadmap]]\n");
    expect((await cli(["resolve", "[[rnotes:roadmap]]"], app)).json.data).toMatchObject({ abs: join(notes, "roadmap.md"), via: "previous-name" });
    // Its own self-links follow its new name.
    await cli(["rename-vault", "rapp2"], app);
    expect(read(app, "self.md")).toBe("[[rapp2:links]]\n");
  });

  test("a rename's writes into another vault reach its index at once: a second rename right after fixes them again", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": "[[rnotes3:plan]]\n" });
    await cli(["init", notes, "--name", "rnotes3"], notes);
    await cli(["init", app, "--name", "rapp3"], app);
    await cli(["ls"], app);
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe("[[rnotes3:roadmap]]\n");
    // No opening of the other vault in between: its index already has the new link.
    await cli(["mv", "roadmap", "vision"], notes);
    expect(read(app, "links.md")).toBe("[[rnotes3:vision]]\n");
  });

  test("relink: links that reach a note by an old name or a move are rewritten to where it is now", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "notes/plan.md": "# Plan\n", "index.md": "[p](notes/plan.md) [[notes/plan]]\n" });
    await cli(["ls"], dir);
    renameSync(join(dir, "notes", "plan.md"), join(dir, "roadmap.md"));
    const r = await cli(["relink", "index"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "index.md")).toBe("[p](roadmap.md) [[roadmap]]\n");
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
      "notes/plan.md": "---\ntitle: Plan\n---\n# Plan\n\nUp: [home](../index.md) and [[index]].\n",
      "index.md": "# Index\n\n[[plan]] and [p](notes/plan.md) 🔭 [[plan#Plan|the plan]]\n",
      "other.md": "untouched [[index]]\n",
    });
    const before = snapshot(dir);
    expect((await cli(["mv", "plan", "archive/2026/roadmap"], dir)).code).toBe(0);
    expect(existsSync(join(dir, "archive", "2026", "roadmap.md"))).toBe(true);
    // The preview: the rename's lines, the other way; nothing written.
    const dry = await cli(["undo", "--dry-run"], dir);
    expect(dry.json.data).toMatchObject({ kind: "note", from: "archive/2026/roadmap.md", to: "notes/plan.md", dryRun: true, undo: { at: expect.any(String) } });
    expect(dry.json.data.files.find((f: { path: string }) => f.path === "index.md").edits[0]).toMatchObject({ line: 3, before: "[[roadmap]] and [p](archive/2026/roadmap.md) 🔭 [[roadmap#Plan|the plan]]", after: "[[plan]] and [p](notes/plan.md) 🔭 [[plan#Plan|the plan]]" });
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    const done = await cli(["undo"], dir);
    expect(done.code).toBe(0);
    expect(snapshot(dir)).toEqual(before); // its previous name, the moved links, the folders it made: all gone
    // The index follows: it's where it was, and a link to it reaches it again, not by a redirect.
    expect((await cli(["resolve", "[[plan]]", "--from", "index.md"], dir)).json.data).toMatchObject({ path: "notes/plan.md", via: null });
    // Taken back, it's out of the log: nothing more to undo.
    const none = await cli(["undo"], dir);
    expect(none.code).toBe(3);
    expect(none.json.error.message).toContain("nothing to undo");
  });

  test("newest first: a folder's move, then a note's rename, then the move; a file changed since stops it, and it waits", async () => {
    const dir = vault({ "a/one.md": "# One\n\n[[two]]\n", "a/two.md": "# Two\n", "index.md": "[x](a/one.md) [[two]]\n" });
    const before = snapshot(dir);
    await cli(["mv", "a", "b"], dir);
    await cli(["mv", "b/two", "b/deux"], dir);
    const mid = snapshot(dir);
    expect(mid["index.md"]).toBe("[x](b/one.md) [[deux]]\n");
    // Changed since: refused, nothing written, the rename still next.
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [[deux]] edited\n");
    const refused = await cli(["undo"], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toBe("index.md has changed since: the rename of b/two.md can't be undone");
    expect(existsSync(join(dir, "b", "deux.md"))).toBe(true);
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [[deux]]\n");
    await cli(["undo"], dir);
    expect(read(dir, "index.md")).toBe("[x](b/one.md) [[two]]\n");
    expect(read(dir, "b/one.md")).toBe("# One\n\n[[two]]\n");
    const back = await cli(["undo"], dir);
    expect(back.json.data).toMatchObject({ kind: "folder", from: "b", to: "a", dryRun: false });
    expect(snapshot(dir)).toEqual(before);
  });

  test("a vault's rename taken back: its name, and the [[name:…]] links in other vaults; a relink too", async () => {
    const one = vault({ "n.md": "# N\n" });
    const two = vault({ "x.md": "[[undo-one:n]] and [[n]]\n" });
    await cli(["init", one, "--name", "undo-one"], one);
    await cli(["init", two, "--name", "undo-two"], two);
    await cli(["ls"], two); // its index: the links into undo-one
    const cfg = read(one, ".slipbox/config.toml");
    await cli(["rename-vault", "undo-uno"], one);
    expect(read(two, "x.md")).toBe("[[undo-uno:n]] and [[n]]\n");
    const r = await cli(["undo"], one);
    expect(r.json.data).toMatchObject({ kind: "vault", from: "undo-uno", to: "undo-one" });
    expect(read(two, "x.md")).toBe("[[undo-one:n]] and [[n]]\n");
    expect(read(one, ".slipbox/config.toml")).toBe(cfg);
    // The machine's list has its name back at once, as seen from another vault.
    expect((await cli(["vaults"], two)).json.data.find((v: { path: string }) => v.path === one)).toMatchObject({ name: "undo-one" });
    expect((await cli(["resolve", "[[undo-one:n]]", "--from", "x.md"], two)).json.data).toMatchObject({ status: "resolved", via: null });
    // A relink: the old names back as they were written.
    const dir = vault({ "new.md": "---\nprevious_names: [old]\n---\n# New\n", "i.md": "[[old]] and [[old|x]]\n" });
    await cli(["relink"], dir);
    expect(read(dir, "i.md")).toBe("[[new]] and [[new|x]]\n");
    expect((await cli(["undo"], dir)).json.data.kind).toBe("relink");
    expect(read(dir, "i.md")).toBe("[[old]] and [[old|x]]\n");
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
    "[rel](../app/design.md) [[../app/design]] [[../app/design#Goals]] ![[../app/pic.png]]",
    "[home](~/app/design.md) [[~/app/design]]",
    `[abs](${app}/design.md) [[${app}/design]]`,
    `[url](file://${app}/design.md#goals)`,
    `[inside](${notes}/todo.md) [[${notes}/todo]] [iu](file://${notes}/todo.md) [root](/todo.md)`,
    "[spaced](<../app/my design.md>) [encoded](../app/my%20design.md)",
    "",
  ].join("\n\n"));
  write(join(app, "design.md"), "# Design\n\n## Goals\n");
  write(join(app, "my design.md"), "# Spaced\n");
  write(join(app, "pic.png"), "png");
  write(join(app, "links.md"), `[[../notes/todo]] [t](~/notes/todo.md) [u](file://${notes}/todo.md)\n`);
  const ready = withHome(async () => {
    await cli(["init", notes, "--name", "pnotes"], notes);
    await cli(["init", app, "--name", "papp"], app);
    await cli(["ls"], app);
  });

  test("relative out of the root, ~/, absolute and file:// all reach the file; inside the vault, its note", async () => {
    await ready;
    const links = await withHome(async () => (await cli(["links", "index"], notes)).json.data);
    const at = (target: string) => links.find((l: { target: string }) => l.target === target);
    for (const t of ["../app/design.md", "../app/design", "~/app/design.md", "~/app/design", `${app}/design.md`, `${app}/design`, `file://${app}/design.md#goals`]) {
      expect(at(t)).toMatchObject({ status: "note", path: join(app, "design.md"), vault: "papp" });
    }
    expect(at("../app/pic.png")).toMatchObject({ status: "file", path: join(app, "pic.png") });
    for (const t of [`${notes}/todo.md`, `${notes}/todo`, `file://${notes}/todo.md`, "/todo.md"]) expect(at(t)).toMatchObject({ status: "note", path: "todo.md" });
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
    expect(bl.filter((b: { from: string }) => b.from === "index.md")).toHaveLength(4);
    expect(bl.filter((b: { vault: string | null }) => b.vault === "papp").map((b: { target: string }) => b.target).sort()).toEqual(["../notes/todo", `file://${notes}/todo.md`, "~/notes/todo.md"].sort());
  });

  test("a rename keeps each path link in its form: absolute, ~/, file://, relative, encoded", async () => {
    await ready;
    await withHome(() => cli(["ls"], app));
    const r = await withHome(() => cli(["mv", "todo", "tasks"], notes));
    expect(r.code).toBe(0);
    const index = readFileSync(join(notes, "index.md"), "utf8");
    expect(index).toContain(`[inside](${notes}/tasks.md) [[${notes}/tasks]] [iu](file://${notes}/tasks.md) [root](/tasks.md)`);
    expect(readFileSync(join(app, "links.md"), "utf8")).toBe(`[[../notes/tasks]] [t](~/notes/tasks.md) [u](file://${notes}/tasks.md)\n`);
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
    "index.md": "# Index\n\n[[dkid:note]] and [k](kid/note.md) and [[kid/note]]\n",
    "kid/.slipbox/config.toml": '[vault]\nid = "dkid0000000001"\nname = "dkid"\n',
    "kid/note.md": "# Note\n\nUp: [[dparent:index]]\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(parent, rel, ".."), { recursive: true });
    writeFileSync(join(parent, rel), text);
  }

  test("a vault nested in this one: by its name, by a path into it — never opened on this machine", async () => {
    const links = (await cli(["links", "index"], parent)).json.data;
    for (const l of links) expect(l).toMatchObject({ status: "note", path: join(kid, "note.md"), vault: "dkid" });
    // …and its links count as backlinks here: indexed when found.
    const bl = (await cli(["backlinks", "index"], parent)).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(kid, "note.md"), vault: "dkid" }));
  });

  test("from inside, the vault it sits in is known by name too", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-nest-up-"));
    cpSync(parent, fresh, { recursive: true });
    writeFileSync(join(fresh, ".slipbox", "config.toml"), '[vault]\nid = "dparent00000002"\nname = "dparent2"\n');
    writeFileSync(join(fresh, "kid", ".slipbox", "config.toml"), '[vault]\nid = "dkid0000000002"\nname = "dkid2"\n');
    writeFileSync(join(fresh, "kid", "note.md"), "Up: [[dparent2:index]]\n");
    const r = await cli(["resolve", "[[dparent2:index]]"], join(fresh, "kid"));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(fresh, "index.md"), vault: "dparent2" });
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
      for (const l of links) expect(l).toMatchObject({ status: "note", path: join(root, "kid", "note.md"), vault: "dkid" });
      const up = await cli(["resolve", "[[dparent:index]]"], join(root, "kid"));
      expect(up.json.data).toMatchObject({ status: "resolved", abs: join(root, "index.md") });
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
      "a/one.md": "# One\n\n[two](two.md) [[two]] [sub](sub/three.md) [out](../b/four.md) [[../b/four]]\n",
      "a/two.md": "# Two\n\n[one](./one.md)\n",
      "a/sub/three.md": "# Three\n\n[up](../one.md)\n",
      "a/pic.png": "png",
      "a/.hidden": "kept",
      "b/four.md": "# Four\n\n[one](../a/one.md) [[a/one]] ![p](../a/pic.png)\n",
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
    expect(read("x/y/one.md")).toBe("# One\n\n[two](two.md) [[two]] [sub](sub/three.md) [out](../../b/four.md) [[../../b/four]]\n");
    expect(read("x/y/two.md")).toBe("# Two\n\n[one](./one.md)\n");
    expect(read("x/y/sub/three.md")).toBe("# Three\n\n[up](../one.md)\n");
    // Into it, from what stays.
    expect(read("b/four.md")).toBe("# Four\n\n[one](../x/y/one.md) [[x/y/one]] ![p](../x/y/pic.png)\n");
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
  test("links into it by path are fixed, from its parent and other vaults; its links out too; by name, nothing", async () => {
    const { planVaultFolderMove, applyPlan } = await import("../src/core/rename.ts");
    const { openVault } = await import("../src/core/reach.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-vaultmove-"));
    const parent = join(base, "parent");
    const other = join(base, "other");
    const files: Record<string, string> = {
      "parent/.slipbox/config.toml": '[vault]\nid = "vmparent000001"\nname = "vmparent"\n',
      "parent/home.md": "# Home\n\n[p](box/index.md) [[box/index]] [[vmbox:index]]\n",
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
    expect(read("parent/home.md")).toBe("# Home\n\n[p](shelf/box/index.md) [[shelf/box/index]] [[vmbox:index]]\n");
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
    "parent/home.md": "# Home\n\n[[alpha]] [[proj/beta]] [[deep/gamma]] [b](proj/beta.md) [c](/proj/beta.md) [[mkparent:alpha]] ![[pic.png]]\n",
    "parent/proj/alpha.md": "# Alpha\n\n[[home]] [[proj/beta]] [[beta]] [h](/home.md) [h2](../home.md) [[mkparent:home]]\n\n[[/proj/beta]] [[mkparent:beta]] [r](/proj/beta.md) [[deep/gamma]]\n",
    "parent/proj/beta.md": "# Beta\n\n[[alpha]]\n",
    "parent/proj/deep/gamma.md": "# Gamma\n\n[up](../alpha.md)\n",
    "parent/proj/pic.png": "png",
    "other/.slipbox/config.toml": '[vault]\nid = "mkother000001"\nname = "mkother"\n',
    "other/index.md": "# Other\n\n[[mkparent:alpha]] [[mkparent:home]]\n",
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

  test("made a vault: what would stop reaching across is rewritten, the rest left; made a folder again: it all reaches the same", async () => {
    await cli(["backlinks", "index"], other); // indexed and known, as when opened
    await cli(["links", "home"], parent);
    const before = await reached([parent]);
    const dry = (await cli(["init", "proj", "--name", "mkproj", "--dry-run"], parent)).json;
    expect(dry.data).toMatchObject({ kind: "make-vault", from: "proj", to: "mkproj", dryRun: true });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    const made = (await cli(["init", "proj", "--name", "mkproj"], parent)).json;
    expect(made.ok).toBe(true);
    expect(existsSync(join(parent, "proj", ".slipbox", "config.toml"))).toBe(true);
    // Into it: by name and by a partial path, its name; exact paths left.
    expect(read("parent/home.md")).toBe("# Home\n\n[[mkproj:alpha]] [[proj/beta]] [[mkproj:deep/gamma]] [b](proj/beta.md) [c](/proj/beta.md) [[mkproj:alpha]] ![[mkproj:pic.png]]\n");
    // Out of it and within it.
    expect(read("parent/proj/alpha.md")).toBe(
      "# Alpha\n\n[[mkparent:home]] [[beta]] [[beta]] [h](../home.md) [h2](../home.md) [[mkparent:home]]\n\n[[/beta]] [[beta]] [r](/beta.md) [[deep/gamma]]\n",
    );
    expect(read("parent/proj/beta.md")).toBe("# Beta\n\n[[alpha]]\n");
    // Another vault's [[mkparent:…]] into it: the new name.
    expect(read("other/index.md")).toBe("# Other\n\n[[mkproj:alpha]] [[mkparent:home]]\n");
    // Everything that resolved still does, to the same file.
    expect(await reached([parent, join(parent, "proj")])).toEqual(before);

    // Back: a plain folder again, a name now taken in the parent written as a path.
    writeFileSync(join(parent, "beta.md"), "# Another beta\n");
    const back = (await cli(["deinit", "proj"], parent)).json;
    expect(back.data).toMatchObject({ kind: "unmake-vault", from: "proj", to: "mkparent", dryRun: false });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    expect(read("parent/home.md")).toBe("# Home\n\n[[alpha]] [[proj/beta]] [[deep/gamma]] [b](proj/beta.md) [c](/proj/beta.md) [[alpha]] ![[pic.png]]\n");
    expect(read("parent/proj/alpha.md")).toBe(
      "# Alpha\n\n[[mkparent:home]] [[proj/beta]] [[proj/beta]] [h](../home.md) [h2](../home.md) [[mkparent:home]]\n\n[[/proj/beta]] [[proj/beta]] [r](/proj/beta.md) [[deep/gamma]]\n",
    );
    expect(read("other/index.md")).toBe("# Other\n\n[[mkparent:alpha]] [[mkparent:home]]\n");
    const after = await reached([parent]);
    delete after[join(parent, "beta.md")];
    expect(after).toEqual(before);
    // The machine forgot it; its .slipbox/ is in the parent's trash, restorable.
    expect((await cli(["vaults"], parent)).json.data.some((v: { name: string }) => v.name === "mkproj")).toBe(false);
    expect((await cli(["trash"], parent)).json.data[0]).toMatchObject({ shown: "proj/.slipbox", dir: true });
    // Refused: a folder that's already a vault; a vault not nested in another.
    expect((await cli(["deinit", "proj"], parent)).code).toBe(5);
    expect((await cli(["deinit", "."], other)).code).toBe(5);
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
      "a.md": "# A\n\n[[b]], [c](c.md), [code](s.ts), ![p](pic.png), [[missing]], [log](big.log) and [[b]] again.\n",
      "b.md": "# B\n\n```js\nlet x;\n```\n\nOn to [[d]].\n",
      "c.md": "# C\n",
      "d.md": "# D\n\nDeep.\n",
      "e.md": "Back to [[a]].\n",
      "f.md": "[[a]] and [[a#A]]\n",
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
    expect(b.text).toContain("## b.md\n\n`b.md:1-7` — linked from a.md\n\n````markdown\n# B\n\n```js\nlet x;\n```\n\nOn to [[d]].\n````\n");
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
    writeFileSync(join(g.root, "hub.md"), Array.from({ length: 25 }, (_, i) => `[[n${i}]]`).join("\n"));
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
    writeFileSync(join(x, "notes", "a.md"), `# A\n\nSee [y's plan](../../y/plan.md), [the code](../src/x.md) and [[y${n}:plan]].\n`);
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

  test("its own state, by git's name for it; the main checkout keeps the id's — whichever was opened first", async () => {
    const l = await layout(++n);
    if (!l) return;
    const wt = locateVault({ root: l.wt });
    const id = wt.id!;
    expect(wt).toMatchObject({ key: `${id}-wt-feat`, name: `x${n}`, worktree: { name: "feat", checkout: l.wt, main: l.x, mainVault: l.x } });
    recordLocation(wt); // seen first
    expect(locateVault({ root: l.x })).toMatchObject({ key: id, worktree: null });
    // Recorded under the bare id before worktrees were told apart: still no primary for the id.
    const { recordVault } = await import("../src/core/registry.ts");
    recordVault({ key: id, id, kind: "vault", name: `x${n}`, aliases: [], previous_names: [], path: l.wt });
    expect(locateVault({ root: l.x }).key).toBe(id);
    // The machine's list knows which is which.
    expect((await cli(["vaults"], l.x)).json.data.find((v: { path: string }) => v.path === l.wt)).toMatchObject({ key: `${id}-wt-feat`, worktree: { name: "feat", main: l.x } });
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
    expect(bare.key).toMatch(/^feat-[0-9a-f]{12}$/);
    expect(readFileSync(cfg, "utf8")).toBe("# no identity on this branch yet\n");
  });

  test("links: [[x:…]] from elsewhere means the main checkout; out of the repository, a worktree's paths as the main's; its links aren't backlinks twice", async () => {
    const l = await layout(++n);
    if (!l) return;
    await cli(["ls"], l.wt); // the worktree seen, its index written
    await cli(["ls"], l.x);
    // Elsewhere: [[x:a]] reaches the main checkout's note, not ambiguous with the worktree's.
    writeFileSync(join(l.y, "back.md"), `[[x${n}:a]]\n`);
    const r = (await cli(["resolve", `[[x${n}:a]]`, "--from", "back.md"], l.y)).json.data;
    expect(r).toMatchObject({ status: "resolved", abs: join(l.x, "notes", "a.md") });
    // In the worktree: ../../y/plan.md leaves the repository — as from the main checkout; ../src stays in the worktree.
    const links = (await cli(["links", "notes/a.md"], l.wt)).json.data;
    expect(links.map((x: { target: string; status: string; path: string }) => [x.target, x.status, x.path])).toEqual([
      ["../../y/plan.md", "note", join(l.y, "plan.md")],
      ["../src/x.md", "note", "src/x.md"],
      [`y${n}:plan`, "note", join(l.y, "plan.md")],
    ]);
    // y's backlinks: the main checkout's links, not the worktree's copies of them.
    const back = (await cli(["backlinks", "plan.md"], l.y)).json.data.backlinks;
    expect(back.map((b: { from: string }) => b.from)).toEqual([join(l.x, "notes", "a.md"), join(l.x, "notes", "a.md")]);
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
      "host.md": "# Host\n\nBefore.\n\n![[sub/inner]]\n\nAfter.\n",
      "sub/inner.md": "---\ntitle: Inner\n---\n# Inner\n\nSee [the sibling](sibling.md) and [[sibling]].\n",
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
    expect(l.links.find((x) => x.kind === "embed")).toMatchObject({ target: "sub/inner", text: "inner", line: 4 });
  });

  test("a heading's section, a block by its ^id (a paragraph's, a list item's, a table's on the line after); missing ones said", async () => {
    const { g } = vaultOf({
      "host.md": "![[src#Two]]\n\n![[src#^para]]\n\n![[src#^item]]\n\n![[src#^tab]]\n\n![[src#Nope]]\n\n![[src#^nope]]\n",
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
      "⧉ src › Nope",
      '▎ no heading "Nope" in src',
      "",
      "⧉ src ^nope",
      "▎ no block ^nope in src",
    ]);
  });

  test("a loop is drawn once, said so; past three deep, a line says to open it; a picture, text around it, nothing found: references", async () => {
    const { g } = vaultOf({
      "a.md": "A\n\n![[b]]\n",
      "b.md": "B\n\n![[a]]\n",
      "self.md": "S\n\n![[self]]\n",
      "d1.md": "![[d2]]\n",
      "d2.md": "![[d3]]\n",
      "d3.md": "![[d4]]\n",
      "d4.md": "![[d5]]\n",
      "d5.md": "bottom\n",
      "refs.md": "![[pic.png]]\n\nsee ![[b]] here\n\n![[missing]]\n",
      "pic.png": "png",
    });
    expect(text(await draw(g, "a.md"))).toEqual(["A", "", "⧉ b", "▎ B", "▎", "▎ ⧉ a", "▎ ▎ embeds itself: not drawn again"]);
    expect(text(await draw(g, "self.md"))).toEqual(["S", "", "⧉ self", "▎ embeds itself: not drawn again"]);
    const deep = text(await draw(g, "d1.md"));
    expect(deep.at(-1)).toBe("▎ ▎ ▎ ▎ embedded deeper still: enter opens it");
    expect(deep.join("\n")).not.toContain("bottom");
    expect(text(await draw(g, "refs.md"))).toEqual(["⧉ pic.png", "", "see ⧉ b here", "", "⧉ missing"]);
    expect((await draw(g, "d1.md")).embedded!.sort()).toEqual(["d2.md", "d3.md", "d4.md"].map((r) => g.abs(r)));
  });

  test("the embedded note changed: drawn as it is now, through the render cache too", async () => {
    const { newRenderCache } = await import("../src/core/layout/render.ts");
    const { newParseCache } = await import("../src/core/parse.ts");
    const { g } = vaultOf({ "host.md": "# H\n\n![[inner]]\n\nkept\n", "inner.md": "old text\n" });
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
  test("every link that reaches nothing, and every one that reaches several notes — with where, how written, and why", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-problems-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "twin.md"), "# Twin A\n");
    writeFileSync(join(dir, "b", "twin.md"), "# Twin B\n");
    writeFileSync(join(dir, "index.md"), "# Index\n\n[[missing]] and [x](gone.md) and [[nowhere:x]].\n\n[[twin]] and [[alive]] and [ok](https://example.org)\n");
    writeFileSync(join(dir, "alive.md"), "# Alive\n");
    writeFileSync(join(dir, "self.md"), "# Self\n\nSee [[self]], [top](#self).\n");
    const p = (await cli(["problems"], dir)).json.data;
    expect(p.broken.map((x: { line: number; column: number; target: string }) => [x.line, x.column, x.target])).toEqual([
      [3, 1, "missing"],
      [3, 17, "gone.md"],
      [3, 34, "nowhere:x"],
    ]);
    expect(p.broken[2].reason).toContain('unknown vault "nowhere"');
    expect(p.ambiguous).toMatchObject([{ from: "index.md", line: 5, target: "twin", candidates: ["a/twin.md", "b/twin.md"] }]);
    // Orphans (9.5): nothing links to them — an ambiguous link reaches neither twin.
    expect(p.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // its own link isn't one
    // Made: gone from the list.
    writeFileSync(join(dir, "missing.md"), "# Missing\n");
    const after = (await cli(["problems"], dir)).json.data;
    expect(after.broken.map((x: { target: string }) => x.target)).toEqual(["gone.md", "nowhere:x"]);
    expect(after.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // missing.md is linked
  });
});

describe("where links end (11.7)", () => {
  test("a link records its end as well as its start — columns in UTF-16 units — and backlinks and problems carry it", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-ends-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "a.md"), "# A\n\n🌍 [[b|Bee]] then ![[b]]\n[md](b.md) and [ref][r] ![pic](p.png) [[gone]]\n\n[r]: b.md\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const ends = g.notes.get("a.md")!.links.map((l) => [l.kind, l.line, l.column, l.end.line, l.end.column]);
    // 🌍 is two UTF-16 units: [[b|Bee]] starts at column 4, as an editor counts.
    expect(ends).toEqual([
      ["wiki", 3, 4, 3, 13],
      ["embed", 3, 19, 3, 25],
      ["markdown", 4, 1, 4, 11],
      ["markdown", 4, 16, 4, 24],
      ["image", 4, 25, 4, 38],
      ["wiki", 4, 39, 4, 47],
    ]);
    expect(g.backlinks("b.md").map((b) => [b.line, b.column, b.end.column])).toContainEqual([3, 4, 13]);
    expect(g.problems().broken.find((p) => p.target === "gone")).toMatchObject({ line: 4, column: 39, end: { line: 4, column: 47 } });
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
    g.overlay("a.md", "# A, typed\n\n## New\n\n[[b]]\n");
    expect(from()).toEqual(["a.md"]);
    expect(g.notes.get("a.md")!.headings.map((h) => h.text)).toEqual(["A, typed", "New"]);
    // Another note changes: the index is written — with the file's a.md, no link, read afresh.
    writeFileSync(join(dir, "b.md"), "# B, changed\n");
    g.updateFile("b.md", { rel: "b.md", abs: join(dir, "b.md"), size: 13, mtimeMs: Date.now() });
    g.ensureAll();
    expect(openGraph(loc, DEFAULT_CONFIG, true).backlinks("b.md")).toEqual([]);
    // The file changes under it (an agent, a save): the editor's text still stands; let go, the file's.
    writeFileSync(join(dir, "a.md"), "# A, saved\n\n[[b]] [[b]]\n");
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
    writeFileSync(join(dir, "b.md"), "# B\n\n## Old Name ##\n\ntext ^blk\n\nsee [[#Old Name]] and [up](#old-name)\n");
    const a = [
      "[[b#Old Name]] [[b#old name|shown]] ![[b#Old Name]] [[b#^blk]] [[b#Other]]",
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
        "[[b#New Title]] [[b#New Title|shown]] ![[b#New Title]] [[b#^blk]] [[b#Other]]",
        "[s](b.md#new-title) [t](b.md#New%20Title) [u](<b.md#New Title>) [v](b.md)",
        "",
      ].join("\n"),
    );
    expect(readFileSync(join(dir, "b.md"), "utf8")).toBe("# B\n\n## New Title ##\n\ntext ^blk\n\nsee [[#New Title]] and [up](#new-title)\n");
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
