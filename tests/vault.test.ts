// The fixture vault (0.5) against the walk (0.11), discovery (1.1), the graph and the CLI (9.x).

import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CLI_COMMANDS, runCli } from "../src/cli/cli.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { findVaultRoot, initVault, locateVault } from "../src/core/vault.ts";

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
  test("no marker: the git repository is the root (17.1)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-repo-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "n.md"), "# n\n");
    const loc = locateVault({ path: join(dir, "docs", "n.md") });
    expect(loc.mode).toBe("repo");
    expect(loc.root).toBe(dir);
    expect(loc.id).toBeNull();
    expect(loc.name).toBeNull();
    // A worktree's or submodule's .git is a file: a root too.
    const wt = mkdtempSync(join(tmpdir(), "slipbox-worktree-"));
    writeFileSync(join(wt, ".git"), "gitdir: /elsewhere\n");
    writeFileSync(join(wt, "n.md"), "# n\n");
    expect(locateVault({ path: join(wt, "n.md") }).root).toBe(wt);
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
  test("a repository's walk stops at a nested repository; a vault's walks into one (17.1)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nest-"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "sub", ".git"), { recursive: true });
    writeFileSync(join(dir, "top.md"), "# top\n");
    writeFileSync(join(dir, "sub", "inner.md"), "# inner\n");
    const repo = openGraph(locateVault({ path: dir }), DEFAULT_CONFIG, false);
    expect([...repo.notes.keys()]).toEqual(["top.md"]);
    expect(repo.skipped).toContainEqual({ rel: "sub", reason: "nested repository" });
    expect(locateVault({ path: join(dir, "sub", "inner.md") }).root).toBe(join(dir, "sub"));
    mkdirSync(join(dir, ".slipbox"));
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
  test("--root takes precedence", () => {
    expect(locateVault({ root: join(VAULT, "notes"), path: join(VAULT, "notes", "alpha.md") }).root).toBe(join(VAULT, "notes"));
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

  test("init on a vault without an id adds one, keeping its comments; its old state moves over", async () => {
    const dir = fresh("old");
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), "# mine\n[walk]\nexclude = [\"x/\"]\n");
    const before = locateVault({ path: dir });
    expect(before.id).toBeNull();
    expect(before.name).toBe(basename(dir)); // the folder's, until one is declared
    // Positions saved under the path's key before the vault had an id.
    const { PositionStore } = await import("../src/core/position.ts");
    const ps = new PositionStore(before);
    ps.set("a.md", { heading: null, headingIndex: 0, offset: 0, line: 7 });
    ps.save();
    const r = await cli(["init", "--json"], dir);
    expect(r.json.data).toMatchObject({ created: false, identified: true });
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    expect(cfg.startsWith("# mine\n[walk]\nexclude = [\"x/\"]\n")).toBe(true);
    const after = locateVault({ path: dir });
    expect(after.key).toBe(r.json.data.id);
    expect(new PositionStore(after).get("a.md")?.line).toBe(7);
    // Again: nothing to do.
    expect((await cli(["init", "--json"], dir)).json.data).toMatchObject({ created: false, identified: false });
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
    const repo = fresh("regrepo");
    mkdirSync(join(repo, ".git"));
    await cli(["ls"], repo);
    expect(readRegistry().find((v) => v.path === repo)).toMatchObject({ kind: "repo", id: null, name: null });
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
