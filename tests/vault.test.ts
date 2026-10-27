import { UNIT_TIMEOUT_MS } from "./support/timeouts.ts";
// The fixture vault (0.5) against the walk (0.11), discovery (1.1), the graph and the CLI (9.x).

import { describe, expect, setDefaultTimeout, setSystemTime, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { CLI_COMMANDS, FLAGS, GLOBAL_FLAGS, runCli } from "../src/cli/cli.ts";
import { COMMAND_SPECS } from "../src/core/application/commands/catalog.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/application/config/config.ts";
import { type Graph, openGraph } from "../src/core/graph.ts";
import { applyPlan, outside, planHeadingRename, planRelink, planUndo } from "../src/core/rename.ts";
import {
  checkoutAt,
  configFilesFor,
  ELSEWHERE_KEY,
  findVaultRoot,
  elsewhereAt,
  gitRootOf,
  homeAt,
  initVault,
  isListed,
  isVaultRoot,
  locateVault,
  locationAt,
  markersAt,
  recordLocation,
  rootAt,
  setRootMarkers,
  vaultOf,
} from "../src/core/workspace/vaults/vault.ts";
import { cacheDir, stateDir, vaultKey } from "../src/core/foundation/platform/paths.ts";
import { readRoots } from "../src/core/workspace/vaults/registry.ts";
import {
  agentsWarning,
  answered,
  blockingLink,
  forgetProbes,
  linkAnswer,
  linkScope,
  linksFile,
  linkState,
  moveLink,
  probe,
  setLinkAnswer,
  writesThrough,
} from "../src/core/workspace/vaults/symlinks.ts";
import { LINK_REASON, WalkFilter, walkVault } from "../src/core/workspace/walk/walk.ts";
import { homeWalkFile, walkHomeNow } from "../src/core/workspace/vaults/home.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { glyphsFor } from "../src/core/glyphs.ts";

// Parses, walks and processes started: slow on a loaded or small machine (CI's macOS runner), not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);

const VAULT = join(import.meta.dir, "fixtures", "vault");

// Isolate state and cache so tests never touch the real ~/.local/state.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-test-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");

/** Home's walk kept, as walk.json has it: each folder's stamp, its mtime part (-1: to list again), by its path (#12). */
const keptStamps = (file: string) => {
  const kept = JSON.parse(readFileSync(file, "utf8")) as { dirs: string[]; times?: unknown[] };
  return Object.fromEntries(kept.dirs.map((d, i) => [d, ((t) => (Array.isArray(t) ? t[0] : t))(kept.times?.[i])]));
};

/** Home's walk kept, marked so that its being written again shows however soon it comes: `keepHomeWalk` writes its
 *  own fields alone (#12). */
const markKept = (file: string) =>
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), unwritten: true }));

/** Whether home's walk kept is as `markKept` left it: not written again since. */
const unwritten = (file: string) => JSON.parse(readFileSync(file, "utf8")).unwritten === true;

/** Home's walk kept as if it had seen `dirs` (of `root`) as they are now: each one's stamp its mtime and ctime (#12). */
const restamp = (file: string, root: string, ...dirs: string[]) => {
  const kept = JSON.parse(readFileSync(file, "utf8")) as { dirs: string[]; times: unknown[] };
  for (const d of dirs) {
    const st = statSync(join(root, d));
    const i = kept.dirs.indexOf(d);
    if (i < 0) throw new Error(`${d || "home's top"} isn't in the walk kept`);
    kept.times[i] = [st.mtimeMs, st.ctimeMs];
  }
  writeFileSync(file, JSON.stringify(kept));
};
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
    expect(withVaultCfg.skipped.map((s) => s.rel)).toEqual(
      expect.arrayContaining(["alias-link.md", "outside-link.md", "symlinked-dir", "nested-vault"]),
    );
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
  test("a symlinked picture or data file: inside the root, listed and found by name; outside it, skipped and said (0.11)", async () => {
    const { WalkFilter, walkVault } = await import("../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-link-asset-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-link-asset-out-"));
    for (const d of [".slipbox", "shared", "img"]) mkdirSync(join(dir, d));
    writeFileSync(join(dir, "shared", "logo.png"), "png");
    writeFileSync(join(outside, "far.png"), "png");
    symlinkSync("../shared/logo.png", join(dir, "img", "brand.png"));
    symlinkSync(join(outside, "far.png"), join(dir, "out.png"));
    writeFileSync(join(dir, "a.md"), "![[brand.png]]\n");
    const walk = walkVault(dir, new WalkFilter(dir, DEFAULT_CONFIG.walk));
    expect(walk.assets.sort()).toEqual(["img/brand.png", "shared/logo.png"]);
    expect(walk.skipped).toContainEqual({
      rel: "out.png",
      reason: LINK_REASON.out,
      link: { target: realpathSync(join(outside, "far.png")), dir: false },
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.resolveLink({ kind: "embed", target: "brand.png" }, "a.md")).toMatchObject({
      resolvedKind: "file",
      path: "img/brand.png",
    });
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
  test("resolve lands a block and lines as a heading; a heading or block that isn't there: the note, at its top, said", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-frag-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "n.md"), "# N\n\n## Setup\n\nthe marked paragraph ^mark\n");
    writeFileSync(join(dir, "a.md"), "# A\n");
    const r = async (link: string) =>
      JSON.parse((await cli(["--root", dir, "resolve", link, "--from", "a.md", "--json"])).out);
    expect((await r("n.md#^mark")).data).toMatchObject({
      status: "resolved",
      path: "n.md",
      line: 5,
      href: "n.md#^mark",
    });
    expect((await r("[[n#^mark]]")).data).toMatchObject({ status: "resolved", path: "n.md", line: 5 });
    expect((await r("n.md#L3")).data).toMatchObject({ line: 3, href: "n.md#L3" });
    expect((await r("n.md#Setup")).warnings).toEqual([]);
    const heading = await r("n.md#Nowhere");
    expect(heading.data).toMatchObject({ status: "resolved", path: "n.md", line: null });
    expect(heading.warnings).toEqual(['no heading "Nowhere" in n.md: the link lands at its top']);
    const block = await r("n.md#^none");
    expect(block.data).toMatchObject({ status: "resolved", path: "n.md", line: null, href: "n.md#^none" });
    expect(block.warnings).toEqual(["no block ^none in n.md: the link lands at its top"]);
    expect((await r("[[n#^none]]")).warnings).toEqual(["no block ^none in n.md: the link lands at its top"]);
    // Read by a person: the note's path alone, the warning beside it.
    const human = await cli(["--root", dir, "resolve", "n.md#Nowhere", "--from", "a.md"]);
    expect(human.out).toBe(`${join(dir, "n.md")}\n`);
    expect(human.err).toBe('slipbox: warning: no heading "Nowhere" in n.md: the link lands at its top\n');
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
    await cli(["capture", "--ref", "index.md:1", "say", "more"]); // with a reference, the text is its note (D229)
    const shown = JSON.parse((await cli(["scratch", "show", "--json"])).out).data;
    expect(shown.content).toBe(
      [
        "first thought",
        "---",
        "**At:** `notes/alpha.md:7-9`",
        "```markdown\n## Section One\n\nBack to [index](../index.md) and on to [beta](beta.md).\n```",
        "---",
        "**At:** `index.md:3`",
        "```markdown\npiped selection\n```",
        "---",
        "**At:** `index.md:1`",
        "**Note:** say more\n",
      ].join("\n\n"),
    );
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

test("vaults lists known vaults as text and JSON and refuses extra arguments", async () => {
  await cli(["ls"]);
  const json = await cli(["vaults", "--json"]);
  expect(json.code).toBe(0);
  const entries = JSON.parse(json.out).data as { label: string; data: { root: string } | null }[];
  expect(entries.some((entry) => entry.data?.root === VAULT)).toBe(true);
  const text = await cli(["vaults"]);
  expect(text.code).toBe(0);
  expect(text.out).toContain(entries.find((entry) => entry.data?.root === VAULT)!.label);
  expect((await cli(["vaults", "extra"])).code).not.toBe(0);
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
      // …with flags it takes (`read --line` was refused).
      const sub = c.cli?.startsWith("slipbox ") ? c.cli.split(" ")[1]! : null;
      for (const [, flag] of sub ? c.cli!.matchAll(/--([a-z-]+)/g) : [])
        expect([c.id, flag, GLOBAL_FLAGS.has(flag!) || (FLAGS[sub!] ?? []).includes(flag!)]).toEqual([
          c.id,
          flag,
          true,
        ]);
    }
  });
});

describe("what cli.md and the skill promise a caller (9.2)", () => {
  /** A copy of the demo vault, unnamed (its name would be one more copy of halden on this machine). */
  const demo = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-promise-"));
    cpSync(join(import.meta.dir, "..", "examples", "vault"), dir, { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[walk]\nexclude = ["scratch/trash/"]\n');
    return dir;
  };
  const run = async (
    args: string[],
    cwd: string,
    o: { isTTY?: boolean; env?: Record<string, string | undefined> } = {},
  ) => {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: o.isTTY ?? false,
      columns: 80,
      cwd,
      env: { ...process.env, NO_COLOR: "1", ...o.env },
    });
    return { code, out, err, json: args.includes("--json") ? JSON.parse(out) : null };
  };

  test("each command's --json data has the fields cli.md's tables name", async () => {
    const dir = demo();
    const data = async (...args: string[]) => {
      const r = await run([...args, "--json"], dir);
      expect([args.join(" "), r.code]).toEqual([args.join(" "), 0]);
      return r.json.data;
    };
    // [what, the object, the fields cli.md names for it]
    const shapes: [string, Record<string, unknown>, string[]][] = [];
    const want = (what: string, o: Record<string, unknown>, fields: string[]) => shapes.push([what, o, fields]);
    const render = await data("render", "home");
    want("render", render, ["path", "width", "lines", "headings"]);
    want("render headings[]", render.headings[0], ["level", "text", "slug", "line"]);
    want("capture", await data("capture", "a thought"), ["scratch", "project", "entry"]);
    want("scratch show", await data("scratch", "show"), ["path", "content", "sha"]);
    want("scratch", await data("scratch"), ["path", "content", "sha"]);
    want("scratch path", await data("scratch", "path"), ["path", "exists"]);
    want("scratch copy", await data("scratch", "copy"), ["path", "chars", "methods", "file", "confirmed"]);
    want("scratch clear", await data("scratch", "clear"), ["path", "cleared", "previousSha"]);
    want("resolve", await data("resolve", "home"), [
      "link",
      "status",
      "path",
      "abs",
      "shown",
      "href",
      "heading",
      "line",
      "candidates",
      "root",
      "name",
      "reason",
      "how",
    ]);
    want("links[]", (await data("links", "home"))[0], [
      "kind",
      "target",
      "heading",
      "text",
      "line",
      "column",
      "end",
      "status",
      "path",
      "shown",
      "how",
      "certainty",
    ]);
    const problems = await data("problems");
    want("problems", problems, ["broken", "ambiguous", "fragile", "orphans"]);
    want("problems broken[]", problems.broken[0], ["from", "line", "column", "end", "kind", "target"]);
    want("tags[]", (await data("tags"))[0], ["tag", "count"]);
    want("tags <tag>", await data("tags", (await data("tags"))[0].tag), ["tag", "notes"]);
    const backlinks = await data("backlinks", "home");
    want("backlinks", backlinks, ["path", "backlinks"]);
    want("backlinks[]", backlinks.backlinks[0], [
      "from",
      "root",
      "name",
      "shown",
      "line",
      "column",
      "end",
      "text",
      "kind",
      "target",
    ]);
    want("ls[]", (await data("ls"))[0], ["path", "title", "size", "mtime", "tags", "links"]);
    want(
      "ls --files, a file",
      (await data("ls", "--files")).find((f: { group?: string }) => f.group),
      ["path", "group", "format", "size", "mtime"],
    );
    const outline = await data("outline", "home");
    want("outline", outline, ["path", "headings"]);
    want("outline headings[]", outline.headings[0], ["depth", "text", "slug", "line"]);
    const context = await data("context", "home");
    want("context", context, ["start", "depth", "backlinks", "limit", "files", "left", "text"]);
    want("context files[]", context.files[0], ["path", "why", "depth", "from", "lines"]);
    const footnotes = await data("footnotes", "partners-and-names");
    want("footnotes", footnotes, ["path", "sha", "footnotes"]);
    want("footnotes[]", footnotes.footnotes[0], ["label", "id", "text", "line", "def", "references"]);
    want("footnotes references[]", footnotes.footnotes[0].references[0], ["line", "column", "start", "end"]);
    want("themes[]", (await data("themes"))[0], ["name", "source", "current"]);
    want("commands[]", (await data("commands"))[0], ["id", "title", "cli", "desc"]);
    const find = await data("find", "dome");
    want("find", find, ["query", "regex", "whole", "count", "matches"]);
    want("find matches[]", find.matches[0], ["path", "line", "column", "match", "text"]);
    want("index", await data("index"), ["path", "rebuilt", "indexed", "removed", "files", "ms"]);
    want("index --refresh", await data("index", "--refresh"), [
      "root",
      "notes",
      "changed",
      "unchanged",
      "gone",
      "reached",
      "indexed",
      "ms",
    ]);
    const search = await data("search", "dome");
    want("search", search, ["query", "engine", "relaxed", "hits"]);
    want("search hits[]", search.hits[0], ["path", "line", "column", "heading", "section", "score", "snippet"]);
    const replace = await data("replace", "home", "Halden", "HALDEN", "--dry-run");
    want("replace", replace, ["path", "count", "dryRun", "sha", "newSha", "changes"]);
    want("replace changes[]", replace.changes[0], ["line", "column", "before", "after", "text", "textAfter"]);
    const tasks = await data("task", "2026-09-14-weekly");
    want("task <note>", tasks, ["path", "sha", "tasks"]);
    want("task <note> tasks[]", tasks.tasks[0], ["line", "checked", "text", "raw"]);
    want("task <note> <line>", await data("task", "2026-09-14-weekly", String(tasks.tasks[0].line)), [
      "path",
      "line",
      "text",
      "checked",
      "changed",
      "sha",
    ]);
    want("read", await data("read", "home"), ["path", "abs", "sha", "bom", "crlf", "invalidUtf8", "content"]);
    want("stat", await data("stat", "home"), [
      "path",
      "abs",
      "root",
      "name",
      "properties",
      "size",
      "mtime",
      "title",
      "tags",
      "headings",
      "links",
      "unresolved",
    ]);
    want("write --create", await data("write", "logs/promised", "# Promised", "--create"), [
      "path",
      "created",
      "shadows",
      "appended",
      "previousSha",
      "sha",
    ]);
    want("write", await data("write", "logs/promised", "more", "--append"), [
      "path",
      "created",
      "appended",
      "previousSha",
      "sha",
    ]);
    want("mkdir", await data("mkdir", "promised-folder"), ["path", "created"]);
    want("history", await data("history"), ["read", "open", "activeTab", "current"]);
    want("link", await data("link", "home"), ["link", "path", "from", "style", "pathForm", "extension"]);
    want("mv --dry-run", await data("mv", "logs/promised.md", "logs/kept.md", "--dry-run"), [
      "kind",
      "from",
      "to",
      "dryRun",
      "move",
      "files",
      "warnings",
      "skipped",
    ]);
    want("cp", await data("cp", "logs/promised.md", "logs/copied.md"), ["from", "to", "dir"]);
    const rm = await data("rm", "logs/copied.md");
    want("rm", rm, ["path", "dryRun", "breaking", "trashed"]);
    want("rm trashed", rm.trashed, ["id", "abs", "shown", "dir", "at"]);
    want("info", await data("info"), ["root", "mode", "name", "key", "folder", "links", "index"]);
    const missing = shapes
      .map(([what, o, fields]) => [what, fields.filter((f) => !Object.hasOwn(o ?? {}, f))])
      .filter(([, gone]) => gone!.length);
    expect(missing).toEqual([]);
  });

  test("--width takes a whole number from 20 to 1000, written in digits", async () => {
    const dir = demo();
    expect((await run(["render", "home", "--width", "20"], dir)).code).toBe(0);
    expect((await run(["render", "home", "--width", "1000"], dir)).code).toBe(0);
    for (const bad of ["19", "1001", "1e2", "+30", "40.5"]) {
      const r = await run(["render", "home", "--width", bad], dir);
      expect([bad, r.code, r.err]).toEqual([bad, 2, "slipbox: --width must be a whole number from 20 to 1000\n"]);
    }
  });

  test("render colours only a terminal without NO_COLOR; --plain, --color never and a pipe print no escapes", async () => {
    const dir = demo();
    const term = { NO_COLOR: undefined, TERM: "xterm-256color", COLORTERM: "truecolor" };
    expect((await run(["render", "home"], dir, { isTTY: true, env: term })).out).toContain("\x1b[");
    for (const [args, o] of [
      [["render", "home"], { isTTY: true, env: { ...term, NO_COLOR: "1" } }],
      [["render", "home", "--plain"], { isTTY: true, env: term }],
      [["render", "home", "--color", "never"], { isTTY: true, env: term }],
      [["render", "home"], { isTTY: false, env: term }],
    ] as const) {
      const r = await run([...args], dir, o);
      expect([args.join(" "), o.env.NO_COLOR ?? "", o.isTTY, r.code, r.out.includes("\x1b")]).toEqual([
        args.join(" "),
        o.env.NO_COLOR ?? "",
        o.isTTY,
        0,
        false,
      ]);
    }
  });

  test("a name several notes share: exit 4 and data.candidates, whichever command names the note", async () => {
    const dir = demo();
    for (const args of [
      ["read", "contacts"],
      ["stat", "contacts"],
      ["write", "contacts", "x"],
      ["links", "contacts"],
      ["outline", "contacts"],
    ]) {
      const r = await run([...args, "--json"], dir);
      expect([args[0], r.code, r.json.data?.candidates]).toEqual([
        args[0],
        4,
        ["equipment/contacts.md", "people/contacts.md"],
      ]);
    }
    expect(readFileSync(join(dir, "people", "contacts.md"), "utf8")).not.toBe("x\n");
  });

  test("search gives 20 hits unless --limit says (up to 500); context's --limit is 1–500", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-limit-"));
    mkdirSync(join(dir, ".slipbox"));
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `n${i}.md`), `# N${i}\n\ncomet ${i}\n`);
    expect((await run(["search", "comet", "--json"], dir)).json.data.hits).toHaveLength(20);
    expect((await run(["search", "comet", "--limit", "25", "--json"], dir)).json.data.hits).toHaveLength(25);
    expect((await run(["search", "comet", "--limit", "500", "--json"], dir)).json.data.hits).toHaveLength(30);
    expect((await run(["search", "comet", "--limit", "501"], dir)).code).toBe(2);
    expect((await run(["context", "n1", "--limit", "500"], dir)).code).toBe(0);
    for (const bad of ["0", "501"])
      expect([bad, (await run(["context", "n1", "--limit", bad], dir)).code]).toEqual([bad, 2]);
  });

  test('[search] engine = "index" builds the index before the first search; never a scan', async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-engine-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[search]\nengine = "index"\n');
    writeFileSync(join(dir, "a.md"), "# A\n\nthe comet's tail\n");
    const r = await run(["search", "comet", "--json"], dir);
    expect(r.json.data).toMatchObject({ engine: "index", hits: [{ path: "a.md", line: 3 }] });
    expect(r.json.warnings).toEqual([]);
    expect((await run(["info", "--json"], dir)).json.data.search).toEqual({
      engine: "index",
      index: { files: 1, complete: true },
    });
  });

  test("[context] sets the bundle's defaults; the flags win over it", async () => {
    const dir = demo();
    writeFileSync(join(dir, ".slipbox", "config.toml"), "[context]\ndepth = 0\nbacklinks = false\nlimit = 2\n");
    const paths = async (...flags: string[]) =>
      (await run(["context", "people/kenji-mori.md", ...flags, "--json"], dir)).json.data;
    const byConfig = await paths();
    expect(byConfig).toMatchObject({ depth: 0, backlinks: false, limit: 2 });
    expect(byConfig.files.map((f: { why: string }) => f.why)).toEqual(["start"]);
    const byFlags = await paths("--depth", "1", "--limit", "3");
    expect(byFlags).toMatchObject({ depth: 1, backlinks: false, limit: 3 });
    expect(byFlags.files.map((f: { why: string }) => f.why)).toEqual(["start", "link", "link"]);
    expect(byFlags.left.length).toBeGreaterThan(0); // past the limit: named, not included
  });

  test("scratch path says whether it exists yet; scratch copy says how it copied, and how much", async () => {
    const dir = demo();
    const before = (await run(["scratch", "path", "--json"], dir)).json.data;
    expect(before.exists).toBe(false);
    expect(existsSync(before.path)).toBe(false);
    expect((await run(["scratch", "copy"], dir)).code).toBe(3); // nothing to copy
    await run(["capture", "the dew heater"], dir);
    expect((await run(["scratch", "path", "--json"], dir)).json.data).toEqual({ path: before.path, exists: true });
    const content = readFileSync(before.path, "utf8");
    const copy = (await run(["scratch", "copy", "--json"], dir)).json.data;
    expect(copy).toMatchObject({ path: before.path, chars: content.length, methods: ["file"], confirmed: false });
    expect(readFileSync(copy.file, "utf8")).toBe(content);
    expect((await run(["scratch", "copy"], dir)).out).toBe(`wrote ${copy.file} (${content.length} chars)\n`);
  });

  test("--root names a root: a folder that isn't there, or holds no root marker, is exit 3 with how to make one", async () => {
    const dir = demo();
    const missing = await run(["ls", "--root", join(dir, "no-such-folder"), "--json"], dir);
    expect(missing.json).toMatchObject({ ok: false, error: { code: 3 } });
    expect(missing.code).toBe(3);
    const plain = mkdtempSync(join(tmpdir(), "slipbox-plain-root-"));
    const notRoot = await run(["ls", "--root", plain], dir);
    expect(notRoot.code).toBe(3);
    expect(notRoot.err).toContain(
      `isn't a vault (none of .git, .slipbox, .obsidian, .zk in it): slipbox init ${plain} makes it one`,
    );
    expect((await run(["ls", "--root", join(dir, "people")], dir)).code).toBe(3); // a folder of a root isn't one
    expect((await run(["ls", "--root", dir], join(dir, "people"))).code).toBe(0);
  });

  test("the scratch's project is the root, from any folder in it; else the folder you're in — whose scratch stays in its state", async () => {
    const dir = demo();
    const fromSub = (await run(["capture", "--ref", "kenji-mori.md:3", "--json"], join(dir, "people"))).json.data;
    expect(fromSub).toMatchObject({ project: dir, entry: "**At:** `people/kenji-mori.md:3`" });
    expect((await run(["capture", "a thought", "--json"], dir)).json.data.scratch).toBe(fromSub.scratch); // one scratch per project
    const plain = mkdtempSync(join(tmpdir(), "slipbox-plain-scratch-"));
    writeFileSync(join(plain, "loose.md"), "# Loose\n");
    const cfg = join(plain, "..", `${basename(plain)}.toml`);
    writeFileSync(cfg, '[capture]\nlocation = "vault"\n');
    const loose = (await run(["capture", "--ref", "loose.md:1", "--json", "--config", cfg], plain)).json.data;
    expect(loose).toMatchObject({ project: plain, entry: "**At:** `loose.md:1`" });
    expect(loose.scratch.startsWith(plain)).toBe(false); // nothing written into a plain folder
    expect(existsSync(join(plain, "scratch.md"))).toBe(false);
    // A vault takes location = "vault": its scratch is in it.
    expect((await run(["capture", "x", "--json", "--config", cfg], dir)).json.data.scratch).toBe(
      join(dir, "scratch.md"),
    );
  });

  test("an unexpected error is exit 1 and one line; SLIPBOX_DEBUG adds its stack trace (manual/configuration.md, Environment)", async () => {
    const dir = demo();
    const failing = async (env: Record<string, string>) => {
      let err = "";
      const code = await runCli(["write", "home", "--stdin"], {
        out: () => {},
        err: (s) => (err += s),
        stdin: async () => Promise.reject(new Error("the pipe broke")),
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: { ...process.env, ...env },
      });
      return { code, err };
    };
    const { SLIPBOX_DEBUG: _, ...quiet } = process.env as Record<string, string>;
    expect(await failing(quiet)).toEqual({ code: 1, err: "slipbox: the pipe broke\n" });
    const debug = await failing({ SLIPBOX_DEBUG: "1" });
    expect(debug.code).toBe(1);
    expect(debug.err).toStartWith("slipbox: the pipe broke\nError: the pipe broke\n    at ");
    // A refusal is no surprise: never a stack trace.
    expect((await run(["read", "no-such-note"], dir, { env: { SLIPBOX_DEBUG: "1" } })).err).toBe(
      `slipbox: no note or file "no-such-note" in ${dir}\n`,
    );
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
    expect(JSON.parse((await cli(["resolve", "https://x.y", "--root", dir, "--json"])).out).data.status).toBe(
      "external",
    );
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
    const { WalkFilter, walkVault } = await import("../src/core/workspace/walk/walk.ts");
    const { loadConfig } = await import("../src/core/application/config/config.ts");
    const { readVaultVersion } = await import("../src/core/workspace/vaults/vault.ts");
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

  test("Elsewhere in the CLI: no index to build or search (VV-D3)", async () => {
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
    await cli(["ls"], v);
    const index = await cli(["index"], plain);
    expect(index.code).toBe(5);
    expect(index.json.error.message).toBe(`Elsewhere has no index: ${plain} is outside home and every vault`);
    const r = await cli(["search", "walrus", "--scope", "linked"], plain);
    expect(r.code).toBe(5);
    expect(r.json.error.message).toStartWith("Elsewhere has no index, so no search across it");
  });

  test("home opened is never walked then (VV-D2): its top alone until its walk is made, then the walk kept — each note looked at again", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    mkdirSync(join(home, "sub"));
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "sub", "c.md"), "[a](../a.md)\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = locateVault({ path: home, cwd: home });
      expect(loc.mode).toBe("home");
      expect(isListed(loc)).toBe(false);
      // Not walked yet: its top's notes, its folders listed, not looked into.
      const first = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...first.notes.keys()]).toEqual(["a.md"]);
      expect(first.dirs).toEqual(["", "sub"]);
      expect(first.home).toEqual({ walked: null, capped: null });
      // Walked (a slice at a time, while nobody works — here at once) and kept: the graph is built from it.
      const walked = walkHomeNow(loc, DEFAULT_CONFIG);
      expect(walked.walk.files.map((f) => f.rel)).toEqual(["a.md", "sub/c.md"]);
      const g = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...g.notes.keys()]).toEqual(["a.md", "sub/c.md"]);
      expect(g.home?.walked).toBeGreaterThanOrEqual(walked.walked!);
      expect(g.backlinks("a.md").map((b) => b.from)).toEqual(["sub/c.md"]);
      expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(true);
      // Each note looked at again when the graph is built: one gone is gone, one changed is read again.
      rmSync(join(home, "sub", "c.md"));
      writeFileSync(join(home, "a.md"), "# A, longer now\n");
      const again = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...again.notes.keys()]).toEqual(["a.md"]);
      expect(again.entry("a.md")?.title).toBe("A, longer now");
    } finally {
      process.env.HOME = before;
    }
  });
});

describe("review cycle 5 (the watcher's polling fallbacks)", () => {
  const until = async (ok: () => boolean, ms = 25_000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await Bun.sleep(20);
  };
  test("degraded (the watch limit hit): open notes are polled, their changes still reported", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
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
  test("what the watcher sees on its own, and a change heard elsewhere said no second time by its sweep (#13)", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heard-"));
    mkdirSync(join(dir, ".stash"));
    writeFileSync(join(dir, "a.md"), "one\n");
    writeFileSync(join(dir, ".draft.md"), "draft\n");
    writeFileSync(join(dir, ".stash", "h.md"), "hidden\n");
    writeFileSync(join(dir, ".stash", "k.md"), "kept\n");
    const stampOf = (rel: string) => statSync(join(dir, rel)).mtimeMs;
    const changed: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      pollMs: 100, // the sweep of every known note each 15th tick: 1.5 s
      known: new Map(["a.md", ".stash/h.md", ".stash/k.md"].map((r) => [r, stampOf(r)])),
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: () => {},
    });
    try {
      // Its folder watched and its name taken: seen. A hidden name in it, or a folder not watched: not. A folder polled
      // (its watch failed) has its notes looked at, nothing else.
      expect([w.sees("a.md"), w.sees(".draft.md"), w.sees(".stash/h.md")]).toEqual([true, false, false]);
      (w as unknown as { polled: Set<string> }).polled.add("sub");
      expect([w.sees("sub/n.md"), w.sees("sub/d.json")]).toEqual([true, false]);
      // Heard of a file that's no note: not kept by its stamp, so never swept.
      w.heard(".stash/d.json", { mtimeMs: 1, size: 1 });
      // Both rewritten (a later second, a new size); h.md's change heard elsewhere, k.md's not: the sweep says k.md's.
      await Bun.sleep(1100);
      writeFileSync(join(dir, ".stash", "h.md"), "hidden, rewritten\n");
      writeFileSync(join(dir, ".stash", "k.md"), "kept, rewritten\n");
      w.heard(".stash/h.md", statSync(join(dir, ".stash", "h.md")));
      await until(() => changed.includes(".stash/k.md"), 4000);
      await Bun.sleep(300);
      expect(changed).toContain(".stash/k.md");
      expect(changed).not.toContain(".stash/h.md");
      expect(changed).not.toContain(".stash/d.json");
    } finally {
      w.close();
    }
  });

  test("a folder that can't be watched is polled: its new and changed notes still come", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
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
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
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
      // The watch live first: macOS's starts a moment after it's asked for, and a change before then isn't seen.
      writeFileSync(join(dir, "ready.md"), "# Ready\n");
      await until(() => changed.some((c) => c.rel === "ready.md"));
      changed.length = 0;
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
  test("a note written and removed between two looks is said gone: what read it from the disk meanwhile looks again", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cameandwent-"));
    const changes: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [],
      debounceMs: 20,
      known: new Map(),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      // Its events (made, then removed) in one debounce: settled once, the file not there and never known.
      writeFileSync(join(dir, "rota.md"), "# Rota\n");
      rmSync(join(dir, "rota.md"));
      (w as unknown as { pending: Set<string> }).pending.add("rota.md");
      w.flush();
      expect(changes).toEqual(["deleted rota.md"]);
    } finally {
      w.close();
    }
  });
});

describe("the watcher's second look: what its events didn't say (5.1, #56)", () => {
  // macOS's watch reports nothing for a moment after any folder's watch is added or removed (Bun restarts its one
  // FSEvents stream "since now"). The watches closed here make that loss certain: only the second look remains.
  const silenced = async (o: {
    root: string;
    dirs: string[];
    known?: Map<string, number>;
    attachments?: string[];
    walkedAt?: () => number;
    listed?: boolean;
  }) => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const changes: string[] = [];
    const w = new VaultWatcher({
      ...o,
      filter: new WalkFilter(o.root, DEFAULT_CONFIG.walk),
      known: o.known ?? new Map(),
      debounceMs: 20,
      pollMs: 600_000, // ticks only when the test calls one
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}${c.isNote ? "" : " (file)"}`)),
      onDegraded: () => {},
    });
    for (const fsw of (w as unknown as { watchers: Map<string, { close(): void }> }).watchers.values()) fsw.close();
    const tick = () => {
      w.pollTick();
      w.flush();
      return changes.splice(0).sort();
    };
    return { w, tick };
  };
  const hourAgo = () => new Date(Date.now() - 3_600_000);
  const age = (...dirs: string[]) => {
    for (const d of dirs) utimesSync(d, hourAgo(), hourAgo());
  };

  test("a folder whose mtime moved is listed again: what came and went there is said, the rest isn't", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-lost-"));
    mkdirSync(join(root, "sub"));
    for (const f of ["a.md", "sub/b.md", "pic.png", "old.png"]) writeFileSync(join(root, f), "x\n");
    symlinkSync(join(root, "nowhere.md"), join(root, "dead.md")); // left out, as the walk leaves it: never said gone
    age(root, join(root, "sub"));
    const known = new Map(["a.md", "sub/b.md"].map((f) => [f, statSync(join(root, f)).mtimeMs] as [string, number]));
    const { w, tick } = await silenced({ root, dirs: ["", "sub"], known, attachments: ["pic.png", "old.png"] });
    try {
      // Nothing changed: nothing said.
      expect(tick()).toEqual([]);
      renameSync(join(root, "a.md"), join(root, "sub", "moved.md"));
      mkdirSync(join(root, "deep", "er"), { recursive: true });
      writeFileSync(join(root, "deep", "er", "n.md"), "# N\n");
      writeFileSync(join(root, "new.png"), "png");
      rmSync(join(root, "old.png"));
      expect(tick()).toEqual([
        "created deep/er/n.md",
        "created new.png (file)",
        "created sub/moved.md",
        "deleted a.md",
        "deleted old.png (file)",
      ]);
      expect(w.watchedCount).toBe(4); // deep and deep/er, adopted
      // Looked at again while their mtimes are fresh, all of it known now: said once.
      expect(tick()).toEqual([]);
    } finally {
      w.close();
    }
  });

  test("a file written after the walk read its folder, before the watch, is found on the first tick", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-late-"));
    writeFileSync(join(root, "late.md"), "# Late\n");
    // The folder changed ten seconds ago, after the walk began a minute ago: the walk may not have seen it.
    const tenAgo = new Date(Date.now() - 10_000);
    utimesSync(root, tenAgo, tenAgo);
    const { w, tick } = await silenced({ root, dirs: [""], walkedAt: () => Date.now() - 60_000 });
    try {
      expect(tick()).toEqual(["created late.md"]);
    } finally {
      w.close();
    }
  });

  test("a change the folder's mtime can't tell apart, so soon after the last, is still found", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-coarse-"));
    writeFileSync(join(root, "a.md"), "# A\n");
    // Changed half a second before the walk: a coarse clock can give the next change the very same mtime.
    const was = new Date(Date.now() - 500);
    utimesSync(root, was, was);
    const known = new Map([["a.md", statSync(join(root, "a.md")).mtimeMs]]);
    const { w, tick } = await silenced({ root, dirs: [""], known, walkedAt: () => Date.now() });
    try {
      writeFileSync(join(root, "b.md"), "# B\n");
      utimesSync(root, was, was);
      expect(tick()).toEqual(["created b.md"]);
    } finally {
      w.close();
    }
  });

  test("a folder listed, not walked (~): a second look takes in its new notes, never its folders or other files", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-listed-"));
    mkdirSync(join(root, "Documents"));
    writeFileSync(join(root, "Documents", "deep.md"), "# Deep\n");
    age(root);
    const { w, tick } = await silenced({ root, dirs: [""], listed: true });
    try {
      writeFileSync(join(root, "todo.md"), "# Todo\n");
      writeFileSync(join(root, "photo.png"), "png");
      expect(tick()).toEqual(["created todo.md"]);
      expect(w.watchedCount).toBe(1);
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
    writeFileSync(
      join(dir, "app.toml"),
      '[api]\nschema = "schemas/user.json"\ndocs = "design.md"\nout = "no/such/dir/"\nhome = "https://example.invalid"\n',
    );
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
    const body = [
      "[space](my note.md)",
      "[paren](plan (v2).md)",
      "[angle](<my note.md>)",
      "[enc](plan%20(v2).md)",
      "[brackets](<draft [wip].md>)",
      '[title](x.md "A title")',
      "[single](x.md 'single')",
      "[empty]()",
      "[hash](#)",
    ];
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

  test("a code or data file moved: its own relative paths follow it, each in its form; one the root still reaches stays (D63)", async () => {
    const { planNoteRename } = await import("../src/core/rename.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-ownpaths-"));
    const files: Record<string, string> = {
      ".slipbox/config.toml": "",
      "docs/x.md": "# X\n",
      "schemas/user.yaml": "type: object\n",
      "src/util.ts": "export const u = 1;\n",
      "src/a.ts":
        "// see ../docs/x.md and util.ts:1:2; from the root docs/x.md; https://example.invalid/x\nexport const a = 1;\n",
      "api/spec.yaml": "user:\n  $ref: ../schemas/user.yaml#/definitions/User\nguide: ../docs/x.md\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await g.loadGrammars();
    const reached = (gr: typeof g, rel: string) => gr.linksOf(rel).map((l) => [l.resolvedKind, l.path]);
    const code = reached(g, "src/a.ts");
    const data = reached(g, "api/spec.yaml");
    applyPlan(g, planNoteRename(g, "src/a.ts", "src/sub/a.ts"));
    expect(read("src/sub/a.ts")).toBe(
      "// see ../../docs/x.md and ../util.ts:1:2; from the root docs/x.md; https://example.invalid/x\nexport const a = 1;\n",
    );
    applyPlan(g, planNoteRename(g, "api/spec.yaml", "api/v2/spec.yaml"));
    expect(read("api/v2/spec.yaml")).toBe(
      "user:\n  $ref: ../../schemas/user.yaml#/definitions/User\nguide: ../../docs/x.md\n",
    );
    // Each reaches what it did.
    const after = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await after.loadGrammars();
    expect(reached(after, "src/sub/a.ts")).toEqual(code);
    expect(reached(after, "api/v2/spec.yaml")).toEqual(data);
    expect(code.map(([, p]) => p)).toEqual(["docs/x.md", "src/util.ts", "docs/x.md", "https://example.invalid/x"]);
    expect(data.map(([, p]) => p)).toEqual(["schemas/user.yaml", "docs/x.md"]);
  });
});

describe("links in a component's comments (16.10, 16.22)", () => {
  test("a path in a Vue component's script comment, or its template's: a link and a backlink, at its place in the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-complinks-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "design.md"), "# Design\n");
    writeFileSync(
      join(dir, "Card.vue"),
      '<template>\n  <!-- the layout: design.md -->\n  <p>x</p>\n</template>\n<script setup lang="ts">\n  // why: design.md\n  const s = "design.md";\n</script>\n',
    );
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    await g.loadGrammars(); // Vue's, and TypeScript's for its script
    expect(g.linksOf("Card.vue").map((l) => [l.target, l.resolvedKind, l.line, l.column])).toEqual([
      ["/design.md", "note", 2, 20],
      ["/design.md", "note", 6, 11], // in the script, where it is in the file
    ]);
    expect(g.backlinks("design.md").map((b) => [b.from, b.line])).toEqual([
      ["Card.vue", 2],
      ["Card.vue", 6],
    ]);
  });
});

describe("the demo vault's code samples", () => {
  test("each language's sample parses cleanly, has an outline, and every path in its comments resolves", async () => {
    const { grammar, grammarFor, parseSyntax } = await import("../src/core/syntax.ts");
    const { classify, extensionOf } = await import("../src/core/filetypes.ts");
    const demo = join(import.meta.dir, "..", "examples", "vault");
    const g = openGraph(locateVault({ root: demo }), DEFAULT_CONFIG, false);
    await g.loadGrammars();
    const code = g
      .filePaths()
      .filter((p) => {
        const k = classify(p, ["md"]);
        return k.group === "text" && grammarFor(k.format, extensionOf(p));
      })
      .sort();
    // A sample for every grammar slipbox bundles (the broken one on purpose aside).
    const langs = new Set(code.map((p) => grammarFor(classify(p, ["md"]).format, extensionOf(p))));
    expect([...langs].sort()).toEqual(["bash", "go", "javascript", "lua", "python", "rust", "typescript"]);
    for (const rel of code) {
      const kind = classify(rel, ["md"]);
      const tree = parseSyntax(
        (await grammar(grammarFor(kind.format, extensionOf(rel))!))!,
        readFileSync(join(demo, rel), "utf8"),
      )!;
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
    return {
      io: {
        out: (s: string) => out.push(s),
        err: (s: string) => err.push(s),
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
      err,
    };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli(args, r.io);
    return {
      code,
      out: r.out.join(""),
      err: r.err.join(""),
      json: args.includes("--json") ? JSON.parse(r.out.join("")) : null,
    };
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
    expect(loadConfig({ configFile: user }).warnings.join()).toContain(
      "[vault] belongs in a folder's .slipbox/config.toml (its identity)",
    );
  });

  test("a .slipbox/ is never written to on its own (21.8): opened, read as it is; named only when asked", async () => {
    const dir = fresh("old");
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '# mine\n[walk]\nexclude = ["x/"]\n');
    const loc = locateVault({ path: dir });
    expect(loc).toMatchObject({ id: null, name: null, key: vaultKey(dir) });
    await cli(["ls"], dir);
    expect(readFileSync(join(dir, ".slipbox", "config.toml"), "utf8")).toBe('# mine\n[walk]\nexclude = ["x/"]\n');
    expect((await cli(["init", "--json"], dir)).json.data).toMatchObject({
      created: false,
      identified: false,
      name: null,
    });
    // Named when asked: its comments kept.
    const tag = `old${basename(dir).slice(-6).toLowerCase()}`;
    const r = await cli(["init", "--name", tag, "--json"], dir);
    expect(r.json.data).toMatchObject({ identified: true, name: tag });
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    expect(cfg.startsWith('# mine\n[walk]\nexclude = ["x/"]\n')).toBe(true);
    expect(locateVault({ path: dir })).toMatchObject({ id: r.json.data.id, name: tag });
    // init --name on a named one: that's slipbox name's.
    expect((await cli(["init", "--name", "other-name", "--json"], dir)).json.error.message).toContain(
      "slipbox name other-name",
    );
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

  test("init --private where git can't say (a .git it can't read): the exclude file still found, its lines kept, ours once (17.18)", async () => {
    const top = fresh("private-nogit");
    mkdirSync(join(top, ".git", "info"), { recursive: true }); // no HEAD, no objects: git says it's no repository
    writeFileSync(join(top, ".git", "info", "exclude"), "*.log");
    const r = await cli(["init", top, "--private", "--json"], top);
    expect(r.code).toBe(0);
    expect(r.json.data.excluded).toBe(join(top, ".git", "info", "exclude"));
    await cli(["init", top, "--private", "--json"], top);
    expect(readFileSync(join(top, ".git", "info", "exclude"), "utf8")).toBe("*.log\n/.slipbox/\n");
  });

  test("init on a named folder: its name again is no change; --private later still keeps .slipbox/ out of git (17.18)", async () => {
    const dir = fresh("private-later");
    if (Bun.spawnSync(["git", "init", "-q", dir]).exitCode !== 0) return; // no git here
    const tag = `pl${basename(dir).slice(-6).toLowerCase()}`;
    const named = await cli(["init", dir, "--name", tag, "--json"], dir);
    const cfg = readFileSync(join(dir, ".slipbox", "config.toml"), "utf8");
    const again = await cli(["init", dir, "--name", tag, "--json"], dir);
    expect(again.code).toBe(0);
    expect(again.json.data).toMatchObject({
      created: false,
      identified: false,
      id: named.json.data.id,
      name: tag,
      excluded: null,
    });
    const priv = await cli(["init", dir, "--private", "--json"], dir);
    expect(priv.json.data).toMatchObject({
      created: false,
      identified: false,
      id: named.json.data.id,
      name: tag,
      excluded: join(dir, ".git", "info", "exclude"),
    });
    expect(readFileSync(join(dir, ".git", "info", "exclude"), "utf8").split("\n")).toContain("/.slipbox/");
    expect(Bun.spawnSync(["git", "-C", dir, "status", "--porcelain"]).stdout.toString()).not.toContain(".slipbox");
    expect(readFileSync(join(dir, ".slipbox", "config.toml"), "utf8")).toBe(cfg); // its identity untouched
  });

  test("names: one a different folder has is refused, by a dry run too, with one that isn't — x-<folder> inside x, -2 when taken (17.5, 21.6)", async () => {
    const { suggestFolderName } = await import("../src/core/workspace/vaults/folders.ts");
    const base = fresh("names");
    const tag = `xn${basename(base).slice(-6).toLowerCase()}`;
    const top = join(base, "x");
    mkdirSync(join(top, "plan"), { recursive: true });
    expect((await cli(["init", top, "--name", tag, "--json"], top)).json.data.name).toBe(tag);
    // A root inside it: one of its own, unnamed unless named.
    expect((await cli(["init", join(top, "plan"), "--json"], top)).json.data).toMatchObject({
      root: join(top, "plan"),
      name: null,
    });
    const other = join(base, "y");
    mkdirSync(other);
    const refused = await cli(["init", other, "--name", tag, "--json"], other);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain(`a different folder is called "${tag}", at ${top}`);
    expect(refused.json.error.message).toContain('try "y"');
    expect((await cli(["init", other, "--name", "a:b"], other)).code).toBe(5);
    // A dry run refuses as the run would (DF A9): exit 5, the same message, nothing written.
    const dry = await cli(["init", other, "--name", tag, "--dry-run", "--json"], other);
    expect(dry.code).toBe(5);
    expect(dry.json.error.message).toBe(refused.json.error.message);
    expect((await cli(["init", other, "--name", "a:b", "--dry-run"], other)).code).toBe(5);
    expect(existsSync(join(other, ".slipbox"))).toBe(false);
    expect(
      (await cli(["init", top, "--name", `${tag}-again`, "--dry-run", "--json"], top)).json.error.message,
    ).toContain(`slipbox name ${tag}-again`);
    // …and a [vault] table the edit can't follow, as the run refuses it; the file as it was.
    const odd = join(base, "z");
    mkdirSync(join(odd, ".slipbox"), { recursive: true });
    writeFileSync(join(odd, ".slipbox", "config.toml"), '[ vault ]\naliases = ["n"]\n');
    const oddDry = await cli(["init", odd, "--name", `${tag}-z`, "--dry-run", "--json"], odd);
    expect(oddDry.code).toBe(5);
    expect(oddDry.json.error.message).toBe(
      (await cli(["init", odd, "--name", `${tag}-z`, "--json"], odd)).json.error.message,
    );
    expect(readFileSync(join(odd, ".slipbox", "config.toml"), "utf8")).toBe('[ vault ]\naliases = ["n"]\n');
    // A name nobody has: previewed, nothing written.
    expect((await cli(["init", other, "--name", `${tag}-y`, "--dry-run", "--json"], other)).json.data).toEqual({
      root: other,
      dryRun: true,
    });
    expect(existsSync(join(other, ".slipbox"))).toBe(false);
    // The suggestion: prefixed with the root it sits in; a name taken gets -2.
    expect(suggestFolderName(join(top, "notes"), tag)).toBe(`${tag}-notes`);
    const again = join(base, tag);
    mkdirSync(again);
    expect(suggestFolderName(again, null)).toBe(`${tag}-2`);
  });

  test("state by path (21.8): each copy its own; a named folder moved by hand takes its state along — sure, never a guess", async () => {
    const { PositionStore, loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const { lookupFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const { stateDir } = await import("../src/core/foundation/platform/paths.ts");
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
    saveSession(locA, {
      version: 1,
      tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }],
      activeTab: 0,
      sidebar: true,
    });
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
    expect(
      readRoots()
        .find((v) => v.path === c)
        ?.moved?.map((m) => [m.from, m.to]),
    ).toEqual([[a, c]]);
    expect(readRoots().some((v) => v.path === a)).toBe(false);
    expect(lookupFolder(tag)).toMatchObject({ status: "found", path: c });
    expect((await cli(["ls", "--json"], c)).json.warnings.join()).not.toContain("moved here"); // once
    // Found where it went by the background index before it's opened there: still its move, when opened.
    const c3 = join(base, "found-first");
    const { recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const { recordRoot } = await import("../src/core/workspace/vaults/registry.ts");
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

  test("a named repository moved by hand, its graph built at the new path first (the background index): its state still comes along (0.10, 21.8)", async () => {
    const { loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    const { recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const { recordRoot } = await import("../src/core/workspace/vaults/registry.ts");
    const { rootAt } = await import("../src/core/workspace/vaults/vault.ts");
    const { stateDir } = await import("../src/core/foundation/platform/paths.ts");
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).exitCode;
    const base = fresh("moved-indexed");
    const a = join(base, "a", "research");
    mkdirSync(a, { recursive: true });
    if (git(a, "init", "-q") !== 0) return; // no git here
    git(a, "remote", "add", "origin", `git@github.com:me/${basename(base)}.git`);
    writeFileSync(join(a, "n.md"), "# N\n");
    git(a, "add", ".");
    git(a, "commit", "-qm", "one");
    await cli(["ls"], a);
    const locA = locateVault({ path: a });
    saveSession(locA, {
      version: 1,
      tabs: [{ panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }],
      activeTab: 0,
      sidebar: true,
    });
    const b = join(base, "b", "research");
    mkdirSync(dirname(b));
    renameSync(a, b);
    // The background index finds it first, and builds its graph there (AutoIndex.open).
    recordRoot({ kind: "vault", path: b, found: true });
    recordFolder(b, { found: true });
    openGraph(rootAt(b), DEFAULT_CONFIG, true, "lazy");
    expect(existsSync(stateDir(rootAt(b)))).toBe(true); // heads.json, at least
    expect((await cli(["ls", "--json"], b)).json.warnings.join()).toContain(`moved here from ${a}`);
    expect(loadSession(locateVault({ path: b }))?.tabs).toHaveLength(1);
    expect(existsSync(stateDir(locA))).toBe(false);
  });

  test("a root's storage taken to its new key: the personal state the old key's, the new key's derived files kept (21.8)", async () => {
    const { adoptStorage } = await import("../src/core/workspace/vaults/registry.ts");
    const { cacheHome, stateHome } = await import("../src/core/foundation/platform/paths.ts");
    const tag = basename(fresh("adopt-storage"));
    const [from, to, alone] = [`${tag}-from`, `${tag}-to`, `${tag}-alone`];
    const put = (home: string, key: string, rel: string, text: string) => {
      mkdirSync(dirname(join(home, key, rel)), { recursive: true });
      writeFileSync(join(home, key, rel), text);
    };
    const at = (home: string, key: string, rel: string) =>
      existsSync(join(home, key, rel)) ? readFileSync(join(home, key, rel), "utf8") : null;
    put(stateHome(), from, "session.json", "old session");
    put(stateHome(), from, "heads.json", "old heads");
    put(stateHome(), from, "trash/1/x.md", "# X\n");
    put(cacheHome(), from, "graph.json", "old graph");
    put(cacheHome(), from, "parse.json", "old parse");
    // The background index opened it at the new path first: a session, heads and a cache already there.
    put(stateHome(), to, "session.json", "new session");
    put(stateHome(), to, "heads.json", "new heads");
    put(cacheHome(), to, "graph.json", "new graph");
    adoptStorage(from, to);
    expect([
      at(stateHome(), to, "session.json"),
      at(stateHome(), to, "heads.json"),
      at(stateHome(), to, "trash/1/x.md"),
    ]).toEqual(["old session", "new heads", "# X\n"]);
    expect([at(cacheHome(), to, "graph.json"), at(cacheHome(), to, "parse.json")]).toEqual(["new graph", "old parse"]);
    expect([existsSync(join(stateHome(), from)), existsSync(join(cacheHome(), from))]).toEqual([false, false]);
    // Nothing at the new key: all of it moves.
    put(stateHome(), alone, "session.json", "its session");
    adoptStorage(alone, `${alone}-2`);
    expect([at(stateHome(), `${alone}-2`, "session.json"), existsSync(join(stateHome(), alone))]).toEqual([
      "its session",
      false,
    ]);
  });

  test("a named folder moved by hand: its trash restores into where it is now, its undo log follows (0.10, 21.8)", async () => {
    const { readRenames } = await import("../src/core/rename-log.ts");
    const base = fresh("trash-moved");
    const tag = `tm${basename(base).slice(-6).toLowerCase()}`;
    const a = join(base, "a", "notes");
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, "x.md"), "# X\n");
    writeFileSync(join(a, "y.md"), "# Y\n");
    await cli(["init", a, "--name", tag], a);
    expect((await cli(["rm", "x.md"], a)).code).toBe(0);
    expect((await cli(["mv", "y.md", "z.md"], a)).code).toBe(0);
    renameSync(join(base, "a"), join(base, "b"));
    const b = join(base, "b", "notes");
    expect((await cli(["ls", "--json"], b)).json.warnings.join()).toContain(`moved here from ${a}`);
    expect(readRenames(locateVault({ path: b })).at(-1)?.move).toMatchObject({
      from: join(b, "y.md"),
      to: join(b, "z.md"),
    });
    const restored = await cli(["trash", "restore", "x.md"], b);
    expect(restored.code).toBe(0);
    expect(readFileSync(join(b, "x.md"), "utf8")).toBe("# X\n");
    expect(existsSync(join(base, "a"))).toBe(false); // the old place isn't made again
    expect((await cli(["undo"], b)).code).toBe(0);
    expect(existsSync(join(b, "y.md"))).toBe(true);
  });

  test("a named folder moved by hand: the session's scratch, in the state folder by its absolute path, follows it (0.10, 21.8)", async () => {
    const { loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    const { appendScratch, scratchLocation } = await import("../src/core/capture.ts");
    const base = fresh("scratch-moved");
    const tag = `sm${basename(base).slice(-6).toLowerCase()}`;
    const a = join(base, "a", "notes");
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, "x.md"), "# X\n");
    await cli(["init", a, "--name", tag], a);
    const before = locateVault({ path: a });
    const scratch = scratchLocation(before, DEFAULT_CONFIG).path;
    appendScratch(scratchLocation(before, DEFAULT_CONFIG), "a thought\n");
    const place = { key: scratch, anchor: { heading: null, headingIndex: 0, offset: 0, line: 0 } };
    saveSession(before, {
      version: 1,
      tabs: [{ panes: [{ path: scratch, anchor: place.anchor, back: [place] }], active: 0 }],
      activeTab: 0,
      sidebar: true,
      recent_notes: [scratch, "x.md"],
    });
    renameSync(join(base, "a"), join(base, "b"));
    const b = join(base, "b", "notes");
    const after = locateVault({ path: b });
    expect(recordLocation(after).carriedFrom).toBe(a);
    const moved = scratchLocation(after, DEFAULT_CONFIG).path;
    expect(moved).not.toBe(scratch);
    const s = loadSession(after)!;
    expect(s.tabs[0]!.panes[0]!.path).toBe(moved);
    expect(s.tabs[0]!.panes[0]!.back![0]!.key).toBe(moved);
    expect(s.recent_notes).toEqual([moved, "x.md"]);
    expect(readFileSync(moved, "utf8")).toContain("a thought");
  });

  test("a name that starts with dots (`..draft.md`) is inside its root: its position carried and listed, git's paths kept", async () => {
    const { PositionStore, carryPositions } = await import("../src/core/workspace/session/position.ts");
    const { inVault } = await import("../src/core/gitops.ts");
    const base = fresh("dotdot");
    const a = join(base, "a");
    const b = join(base, "b");
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    const pa = new PositionStore(locateVault({ path: a }));
    pa.set("..draft.md", { heading: null, headingIndex: 0, offset: 0, line: 7 });
    pa.save();
    expect(new PositionStore(locateVault({ path: a })).entries().map((e) => e.key)).toContain("..draft.md");
    renameSync(a, b);
    carryPositions(a, b);
    expect(new PositionStore(locateVault({ path: b })).get("..draft.md")?.line).toBe(7);
    expect(inVault({ root: base }, b, "b/..draft.md")).toBe("..draft.md");
    expect(inVault({ root: base }, b, "a/x.md")).toBeNull();
  });

  test("today's state moved once (21.8): the instances' list read into the roots', each one's state from its key to its path's", async () => {
    const { readRoots, rootsFile } = await import("../src/core/workspace/vaults/registry.ts");
    const { PositionStore, loadSession, positionsFile } = await import("../src/core/workspace/session/position.ts");
    const { cacheDir, stateDir, stateHome, cacheHome } = await import("../src/core/foundation/platform/paths.ts");
    const { writeJson } = await import("../src/core/foundation/platform/fsutil.ts");
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
      writeJson(join(stateHome(), "vaults.json"), {
        version: 1,
        vaults: [
          {
            key: instance,
            instance,
            id: null,
            kind: "vault",
            name: null,
            aliases: [],
            previous_names: [],
            path: dir,
            seen: new Date(0).toISOString(),
          },
        ],
      });
      writeJson(join(stateHome(), instance, "positions.json"), {
        "n.md": { heading: null, headingIndex: 0, offset: 0, line: 4, at: new Date(0).toISOString() },
      });
      writeJson(join(stateHome(), instance, "session.json"), {
        version: 1,
        tabs: [
          { panes: [{ path: "n.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 },
        ],
        activeTab: 0,
        sidebar: true,
      });
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
    const { PositionStore } = await import("../src/core/workspace/session/position.ts");
    const dir = fresh("byfile");
    mkdirSync(join(dir, "docs"), { recursive: true });
    mkdirSync(join(dir, ".git"));
    const fromRoot = new PositionStore(locateVault({ path: dir }));
    fromRoot.set("docs/a.md", { heading: null, headingIndex: 0, offset: 0, line: 12 });
    fromRoot.save();
    // The same file, asked by its absolute path (another root opened it, or the folder alone).
    const loose = elsewhereAt(join(dir, "docs"));
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
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const base = fresh("reached");
    const [a, b] = [join(base, "a"), join(base, "b")];
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    mkdirSync(join(b, ".git"), { recursive: true });
    writeFileSync(join(a, "a.md"), "# A\n\n[b](../b/b.md#top)\n");
    writeFileSync(join(b, "b.md"), "# Top\n\n[back](../a/a.md)\n");
    expect(readRoots().some((v) => v.path === b)).toBe(false);
    // Its heading read there: the root is opened, and known from now on.
    expect((await cli(["resolve", "../b/b.md#Top", "--from", "a.md", "--json"], a)).json.data).toMatchObject({
      status: "resolved",
      abs: join(b, "b.md"),
      line: 1,
    });
    expect(readRoots().find((v) => v.path === b)).toMatchObject({ kind: "vault", key: vaultKey(b) });
  });

  test("a list that can't be written: the path's key, the same each time", () => {
    const { chmodSync } = require("node:fs") as typeof import("node:fs");
    const { stateHome } =
      require("../src/core/foundation/platform/paths.ts") as typeof import("../src/core/foundation/platform/paths.ts");
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
    const { readRoots, rootsFile } = await import("../src/core/workspace/vaults/registry.ts");
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

  test("Elsewhere keeps one session for the machine, wherever it's opened; positions by file (VV-D3, 21.8)", async () => {
    const { PositionStore, loadSession, saveSession } = await import("../src/core/workspace/session/position.ts");
    const one = fresh("l1");
    const two = fresh("l2");
    const a = locateVault({ path: one });
    const b = locateVault({ path: two });
    expect(a.key).toBe(b.key);
    const pa = new PositionStore(a);
    pa.set(join(one, "n.md"), { heading: null, headingIndex: 0, offset: 0, line: 3 });
    pa.save();
    expect(new PositionStore(b).get(join(one, "n.md"))?.line).toBe(3); // kept, by the file's whole path
    expect(new PositionStore(b).get(join(two, "n.md"))).toBeNull(); // another folder's n.md
    saveSession(a, {
      version: 1,
      tabs: [
        {
          panes: [{ path: join(one, "n.md"), anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }],
          active: 0,
        },
      ],
      activeTab: 0,
      sidebar: true,
    });
    expect(loadSession(b)?.tabs).toHaveLength(1);
  });
});

describe("links across vaults: paths; names only for the converter (17.7–17.11, 20.22)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    const err: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: (s: string) => err.push(s),
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
      err,
    };
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
    "notes/index.md":
      "# Index\n\n[[xapp:design]] [[xapp:design#Goals|the goals]] [[xapp:missing]] [[nope:x]] [[xnotes:todo]]\n\n[[nick]] [[old-name]] [paths](../app/design.md)\n",
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
    return {
      after: r.json.data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after)).join("\n"),
      skipped: r.json.data.skipped.map((x: { reason: string }) => x.reason) as string[],
    };
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
    expect((await cli(["resolve", "[g](xapp:design.md#Goals)"], notes)).json.data.suggest).toBe(
      "slipbox://xapp/design.md",
    );
    expect((await cli(["resolve", "slipbox://xapp/design.md#Goals"], notes)).json.data).toMatchObject({
      status: "resolved",
      abs: join(app, "design.md"),
      root: app,
      name: "xapp",
      line: 5,
    });
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
    expect(
      skipped.some((x) => x.includes("[[xapp:missing]]") && x.includes('no note "missing" in folder "xapp"')),
    ).toBe(true);
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown folder "nope"'))).toBe(true);
  });

  test("a colon in a name no folder has: the converter reads it as the alias it is (21.3)", async () => {
    await ready;
    writeFileSync(join(notes, "q3.md"), '---\naliases: ["Meeting: Q3"]\n---\n# Q3\n');
    writeFileSync(join(notes, "meet.md"), "[[Meeting: Q3]] [[nope:x]]\n");
    expect((await cli(["resolve", "[[Meeting: Q3]]"], notes)).json.data).toMatchObject({
      status: "resolved",
      path: "q3.md",
    });
    const r = await cli(["convert-links", "meet", "--dry-run"], notes);
    const after = r.json.data.files
      .flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after))
      .join("\n");
    expect(after).toContain("[Meeting: Q3](q3.md)");
    const skipped = r.json.data.skipped.map((x: { reason: string }) => x.reason) as string[];
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown folder "nope"'))).toBe(true);
    rmSync(join(notes, "q3.md"));
    rmSync(join(notes, "meet.md"));
  });

  test("an alias is a name again (21.3), a previous name isn't — the converter reads both (17.7)", async () => {
    await ready;
    expect((await cli(["resolve", "[[nick]]"], notes)).json.data).toMatchObject({
      status: "resolved",
      path: "person.md",
    });
    expect((await cli(["resolve", "[[old-name]]"], notes)).code).toBe(3);
    expect((await converted()).after).toContain("[nick](person.md) [old-name](renamed.md)");
  });

  test("a path out of the root reaches the file in the other vault (17.9)", async () => {
    await ready;
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "../app/design.md")).toMatchObject({
      status: "note",
      path: join(app, "design.md"),
      root: app,
      name: "xapp",
    });
  });

  test("backlinks come from other vaults' indexes too, as of their last indexing (17.11)", async () => {
    await ready;
    const todo = (await cli(["backlinks", "todo"], notes)).json.data.backlinks;
    expect(todo).toContainEqual(
      expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }),
    );
    const person = (await cli(["backlinks", "person"], notes)).json.data.backlinks;
    expect(person).toContainEqual(
      expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }),
    );
  });

  test("another root's picture and path wikilinks are backlinks too; a move here rewrites them (17.11, 17.16)", async () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-img-"));
    const ra = join(top, "ra");
    const rb = join(top, "rb");
    mkdirSync(ra, { recursive: true });
    mkdirSync(rb, { recursive: true });
    writeFileSync(join(ra, "note.md"), "# Note\n");
    writeFileSync(join(ra, "pic.png"), "png");
    writeFileSync(join(rb, "b.md"), "![x](../ra/pic.png) [[../ra/note]] ![[../ra/pic.png]]\n");
    await cli(["init", ra], ra);
    await cli(["init", rb], rb);
    await cli(["ls"], rb); // rb's index: its links into ra
    const back = async (rel: string) =>
      (await cli(["backlinks", rel], ra)).json.data.backlinks.map(
        (x: { from: string; kind: string; target: string }) => [x.from, x.kind, x.target],
      );
    expect(await back("pic.png")).toEqual([
      [join(rb, "b.md"), "image", "../ra/pic.png"],
      [join(rb, "b.md"), "embed", "../ra/pic.png"],
    ]);
    expect(await back("note.md")).toEqual([[join(rb, "b.md"), "wiki", "../ra/note"]]);
    expect((await cli(["mv", "pic.png", "img/pic.png"], ra)).code).toBe(0);
    expect(readFileSync(join(rb, "b.md"), "utf8")).toBe(
      "![x](../ra/img/pic.png) [[../ra/note]] ![[../ra/img/pic.png]]\n",
    );
  });

  test("another root's links to this repository's hosting are backlinks here, as its pointers are (D87, 17.11)", async () => {
    const { openVault } = await import("../src/core/reach.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-host-"));
    const tag = basename(top)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const ra = join(top, "A");
    const rb = join(top, "B");
    mkdirSync(join(ra, ".git"), { recursive: true });
    writeFileSync(join(ra, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(ra, ".git", "config"), `[remote "origin"]\n\turl = git@github.com:me/a${tag}.git\n`);
    writeFileSync(join(ra, "x.md"), "# X\n");
    mkdirSync(join(rb, ".slipbox"), { recursive: true });
    const url = `https://github.com/me/a${tag}/blob/main/x.md`;
    // Another repository's file of the same path: not this one's.
    writeFileSync(
      join(rb, "README.md"),
      `# B\n\n[x](${url}#x) [them](https://github.com/them/a${tag}/blob/main/x.md)\n`,
    );
    openVault(ra); // A known on this machine, by its remote (21.6)
    openVault(rb).ensureAll(); // B's index: its links
    const g = openVault(ra);
    expect(g.backlinks("x.md").map((b) => [b.from, b.target])).toEqual([[join(rb, "README.md"), `${url}#x`]]);
  });

  test("a file named with # or % in another root: its backlinks found all the same (17.11)", async () => {
    const { openVault } = await import("../src/core/reach.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-hash-"));
    const rg = join(top, "G");
    const ro = join(top, "O");
    for (const [rel, text] of Object.entries({
      "G/.slipbox/config.toml": "",
      "G/C#.md": "# C#\n",
      "G/x.md": "# x\n",
      "O/.slipbox/config.toml": "",
      "O/o.md": "[c](../G/C%23.md) [x](../G/x.md)\n",
    })) {
      mkdirSync(join(top, rel, ".."), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    openVault(ro).ensureAll(); // O's index: its links into G
    const g = openVault(rg);
    expect(g.backlinks("x.md").map((b) => b.from)).toEqual([join(ro, "o.md")]);
    expect(g.backlinks("C#.md").map((b) => b.from)).toEqual([join(ro, "o.md")]);
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
    writeFileSync(
      join(notes, "index.md"),
      readFileSync(join(notes, "index.md"), "utf8").replace("[[xapp:design]]", "[[xapp2:design]]"),
    );
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
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
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
    const dir = vault({
      "notes/plan.md": "# The plan\n\nSteps.\n",
      "index.md": "[p](notes/plan.md) [s](notes/plan.md#the-plan)\n",
    });
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
    const problems = (await cli(["diagnostics", "index.md"], dir)).json.data.problems.map(
      (p: { severity: string; message: string }) => [p.severity, p.message],
    );
    expect(problems[0]).toEqual([
      "warning",
      "broken link: notes/plan.md — moved to archive/old-plan.md (relink fixes it)",
    ]);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.movedTarget({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBe("archive/old-plan.md");
    expect(g.missingNote({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBeNull();
    expect(g.missingNote({ kind: "markdown", target: "notes/never.md" }, "index.md")).toBe("notes/never.md");
    // Moved again: the chain is followed.
    renameSync(join(dir, "archive", "old-plan.md"), join(dir, "plan-final.md"));
    expect((await cli(["relink", "--dry-run"], dir)).json.data.files[0].edits[0].after).toBe(
      "[p](plan-final.md) [s](plan-final.md#the-plan)",
    );
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
    // Elsewhere has no root (VV-D3): `/` is the filesystem's alone, and a note in a folder of it, never walked, is
    // reached by its whole path.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-loose-slash-"));
    mkdirSync(join(loose, "notes"));
    writeFileSync(join(loose, "notes", "a.md"), "# A\n");
    const lg = openGraph(elsewhereAt(loose), DEFAULT_CONFIG, true);
    expect(lg.resolveLink({ kind: "markdown", target: "/notes/a.md" }, "x.md").resolvedKind).toBe("unresolved");
    expect(lg.resolveLink({ kind: "markdown", target: join(loose, "notes", "a.md") }, "x.md")).toMatchObject({
      resolvedKind: "note",
      path: join(loose, "notes", "a.md"),
    });
  });

  test("a path without an extension is the file as written, else its note, else a folder; a trailing / a folder (21.2)", () => {
    const dir = vault({
      "notes/plan.md": "# Plan\n",
      "notes/Makefile": "all:\n",
      "notes/v1.2.md": "# v\n",
      "docs/guide.md": "# G\n",
      "docs.md": "# Docs\n",
      "zk/202608151900-index.md": "# I\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "index.md") => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("plan#Plan", "notes/x.md")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("/notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("202608151900-index", "zk/a.md")).toMatchObject({
      resolvedKind: "note",
      path: "zk/202608151900-index.md",
    }); // zk's
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
    expect(g2.linksOf("index.md").map((l) => [l.target, l.resolvedKind])).toEqual([
      ["docs/", "folder"],
      ["notes", "folder"],
    ]);
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

  test("the watcher pairs a move only when one gone note had that text, as the index does (D63)", () => {
    const dir = vault({ "a.md": "# same\n", "b.md": "# same\n", "e.md": "# same\n", "c.md": "# other\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
    // Two gone with one text, one back elsewhere: which one moved can't be told — no move.
    rmSync(join(dir, "a.md"));
    rmSync(join(dir, "b.md"));
    g.removeFile("a.md");
    g.removeFile("b.md");
    writeFileSync(join(dir, "x.md"), "# same\n");
    g.updateFile("x.md", file("x.md"));
    expect(g.redirects!.follow("a.md")).toBeNull();
    expect(g.redirects!.follow("b.md")).toBeNull();
    // The other order: two arrived with one text, one gone — no move either.
    writeFileSync(join(dir, "y.md"), "# other\n");
    writeFileSync(join(dir, "z.md"), "# other\n");
    g.updateFile("y.md", file("y.md"));
    g.updateFile("z.md", file("z.md"));
    rmSync(join(dir, "c.md"));
    g.removeFile("c.md");
    expect(g.redirects!.follow("c.md")).toBeNull();
    // A third gone after the arrival doesn't make the one arrival its own.
    rmSync(join(dir, "e.md"));
    g.removeFile("e.md");
    expect(g.redirects!.follow("e.md")).toBeNull();
    // One candidate: the move is recorded as before.
    const h = vault({ "p.md": "# alone\n" });
    const hg = openGraph(locateVault({ root: h }), DEFAULT_CONFIG, true);
    rmSync(join(h, "p.md"));
    hg.removeFile("p.md");
    writeFileSync(join(h, "q.md"), "# alone\n");
    hg.updateFile("q.md", {
      rel: "q.md",
      abs: join(h, "q.md"),
      size: statSync(join(h, "q.md")).size,
      mtimeMs: statSync(join(h, "q.md")).mtimeMs,
    });
    expect(hg.redirects!.follow("p.md")).toBe("q.md");
  });

  test("a rename keeps each link's form: from the root, without the extension; a folder's links follow it, its / kept (21.2)", async () => {
    const dir = vault({
      "notes/plan.md": "# Plan\n",
      "notes/deep/x.md": "# X\n",
      "index.md":
        "[root](/notes/plan.md#Plan) [bare](notes/plan) [rootbare](/notes/plan) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n",
    });
    expect((await cli(["mv", "notes/plan.md", "notes/roadmap.md"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(
      "[root](/notes/roadmap.md#Plan) [bare](notes/roadmap) [rootbare](/notes/roadmap) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n",
    );
    // The folder moved: links to it and to the folder in it, each its own way; links into it too.
    expect((await cli(["mv", "notes", "archive"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(
      "[root](/archive/roadmap.md#Plan) [bare](archive/roadmap) [rootbare](/archive/roadmap) [folder](archive/) [folder2](archive) [deep](archive/deep/)\n",
    );
  });

  test("relinked, a link written without its extension stays so (21.2)", () => {
    const dir = vault({
      "docs/guide.md": "# The guide, long enough to be known again when it moves.\n",
      "index.md": "[g](docs/guide)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
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
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
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
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
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

  test("a nested root's file rewritten by a rename stays that root's: never one of this root's notes (17.17)", async () => {
    const { openVault } = await import("../src/core/reach.ts");
    const { planNoteRename } = await import("../src/core/rename.ts");
    const dir = vault({ "a.md": "# A\n", "sub/.slipbox/config.toml": "", "sub/b.md": "[a](../a.md)\n" });
    openVault(join(dir, "sub")).ensureAll();
    const g = openVault(dir);
    expect([...g.notes.keys()]).toEqual(["a.md"]);
    applyPlan(g, planNoteRename(g, "a.md", "c"));
    expect(read(dir, "sub/b.md")).toBe("[a](../c.md)\n");
    expect([...g.notes.keys()]).toEqual(["c.md"]);
    expect(g.backlinks("c.md").map((b) => b.from)).toEqual([join(dir, "sub", "b.md")]);
  });

  test("a note's rename rewrites every link form, keeps how each was written, and writes nothing into it but its links (21.12)", async () => {
    const dir = vault({
      "notes/plan.md":
        "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../index.md) and [index](../index.md).\n",
      "index.md":
        "# Index\n\n[plan](notes/plan.md) and [the steps](notes/plan.md#steps) and ![plan](notes/plan.md)\n\n" +
        "[p](notes/plan.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](notes/plan.md) | y |\n\n[ref]: notes/plan.md\n",
      "notes/other.md": "---\naliases: [nickname]\n---\nSee [x](plan.md), [plan](plan.md) 🔭 [plan](plan.md).\n",
      "code.md":
        "`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](notes/plan.md) and [p](notes/plan.md) aren't.\n",
    });
    const dry = await cli(["mv", "plan", "archive/2026/roadmap", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.dryRun).toBe(true);
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true); // nothing written by a preview
    expect(dry.json.data.files.map((f: { path: string }) => f.path).sort()).toEqual([
      "code.md",
      "index.md",
      "notes/other.md",
      "notes/plan.md",
    ]);
    const done = await cli(["mv", "plan", "archive/2026/roadmap"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "index.md")).toBe(
      "# Index\n\n[plan](archive/2026/roadmap.md) and [the steps](archive/2026/roadmap.md#steps) and ![plan](archive/2026/roadmap.md)\n\n" +
        "[p](archive/2026/roadmap.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](archive/2026/roadmap.md) | y |\n\n[ref]: archive/2026/roadmap.md\n",
    );
    expect(read(dir, "notes/other.md")).toBe(
      "---\naliases: [nickname]\n---\nSee [x](../archive/2026/roadmap.md), [plan](../archive/2026/roadmap.md) 🔭 [plan](../archive/2026/roadmap.md).\n",
    );
    // The link at the index's position, not the same text in code before it.
    expect(read(dir, "code.md")).toBe(
      "`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) aren't.\n",
    );
    // It moved two folders deeper: its own relative links follow; no old name written in (21.12).
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    expect(read(dir, "archive/2026/roadmap.md")).toBe(
      "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../../index.md) and [index](../../index.md).\n",
    );
    // Every link resolves to it now, by its new path.
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(
      links
        .filter((l: { target: string }) => l.target.includes("roadmap"))
        .every((l: { path: string }) => l.path === "archive/2026/roadmap.md"),
    ).toBe(true);
  });

  test("a file it rewrites keeps its byte order mark; one not valid UTF-8 is left as it is, and said", async () => {
    const dir = vault({ "a.md": "# A\n", "bom.md": "\uFEFF[a](a.md)\n", "sub/own.md": "\uFEFF[a](../a.md)\n" });
    // A note moved, its own links rewritten for its new folder: its mark goes with it.
    expect((await cli(["mv", "sub/own", "own"], dir)).code).toBe(0);
    expect(read(dir, "own.md")).toBe("\uFEFF[a](a.md)\n");
    writeFileSync(
      join(dir, "bad.md"),
      Buffer.concat([Buffer.from("[a](a.md) "), Buffer.from([0xff]), Buffer.from("\n")]),
    );
    const done = await cli(["mv", "a", "d"], dir);
    expect(done.code).toBe(0);
    expect([...readFileSync(join(dir, "bom.md")).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(read(dir, "bom.md")).toBe("\uFEFF[a](d.md)\n");
    // Its invalid byte would have been written back as U+FFFD: the file is skipped, whole.
    expect([...readFileSync(join(dir, "bad.md"))]).toEqual([...Buffer.from("[a](a.md) "), 0xff, 0x0a]);
    expect(done.json.warnings).toContain("bad.md:1: not valid UTF-8: not rewritten");
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
    const app = vault({
      "links.md": "[p](../NOTES/plan.md) and [t](../NOTES/plan.md)\n".replaceAll("NOTES", basename(notes)),
    });
    await cli(["init", notes, "--name", "rnotes"], notes);
    await cli(["init", app, "--name", "rapp"], app);
    await cli(["ls"], app); // its index: the links into rnotes
    // The preview: another root's file by its root and name (21.10); this one's by neither.
    const preview = (await cli(["mv", "plan", "roadmap", "--dry-run"], notes)).json.data.files;
    expect(preview.find((f: { abs: string }) => f.abs === join(app, "links.md"))).toMatchObject({
      root: app,
      name: "rapp",
    });
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(
      `[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`,
    );
    // The folder's name changed: the config, the old name kept; a path link has no name to fix.
    await cli(["ls"], app);
    const r = await cli(["name", "rnotes2"], notes);
    expect(r.code).toBe(0);
    expect(read(app, "links.md")).toBe(
      `[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`,
    );
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
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
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
    expect(dry.json.data).toMatchObject({
      kind: "note",
      from: "archive/2026/roadmap.md",
      to: "notes/plan.md",
      dryRun: true,
      undo: { at: expect.any(String) },
    });
    expect(dry.json.data.files.find((f: { path: string }) => f.path === "index.md").edits[0]).toMatchObject({
      line: 3,
      before:
        "[plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) 🔭 [the plan](archive/2026/roadmap.md#plan)",
      after: "[plan](notes/plan.md) and [p](notes/plan.md) 🔭 [the plan](notes/plan.md#plan)",
    });
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    const done = await cli(["undo"], dir);
    expect(done.code).toBe(0);
    expect(snapshot(dir)).toEqual(before); // its previous name, the moved links, the folders it made: all gone
    // The index follows: it's where it was, and a link to it reaches it again, not by a redirect.
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).json.data).toMatchObject({
      status: "resolved",
      path: "notes/plan.md",
    });
    // Taken back, it's out of the log: nothing more to undo.
    const none = await cli(["undo"], dir);
    expect(none.code).toBe(3);
    expect(none.json.error.message).toContain("nothing to undo");
  });

  test("an undo of a move, made or applied from a plan, warns of nothing: not of the path it moved from (DF A10)", async () => {
    const dir = vault({ "notes/plan.md": "# Plan\n", "index.md": "[plan](notes/plan.md)\n", "other.md": "# Other\n" });
    expect((await cli(["mv", "plan", "archive/plan"], dir)).json.warnings).toEqual([]);
    const undone = await cli(["undo"], dir);
    expect(undone.json.data).toMatchObject({
      kind: "note",
      from: "archive/plan.md",
      to: "notes/plan.md",
      dryRun: false,
    });
    expect(undone.json.warnings).toEqual([]);
    const planned = await cli(["mv", "plan", "archive/plan", "--plan"], dir);
    expect((await cli(["apply", planned.json.data.plan.id], dir)).json.warnings).toEqual([]);
    const again = await cli(["undo"], dir);
    expect(again.json.data).toMatchObject({
      kind: "note",
      from: "archive/plan.md",
      to: "notes/plan.md",
      dryRun: false,
    });
    expect(again.json.warnings).toEqual([]);
    expect(read(dir, "index.md")).toBe("[plan](notes/plan.md)\n");
  });

  test("newest first: a folder's move, then a note's rename, then the move; a file changed since stops it, and it waits", async () => {
    const dir = vault({
      "a/one.md": "# One\n\n[two](two.md)\n",
      "a/two.md": "# Two\n",
      "index.md": "[x](a/one.md) [y](a/two.md)\n",
    });
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
    expect(r.json.data).toMatchObject({ kind: "root", from: "undo-uno", to: "undo-one" });
    expect(read(two, "x.md")).toBe(`[n](../${basename(one)}/n.md)\n`);
    expect(read(one, ".slipbox/config.toml")).toBe(cfg);
    // The lookup has its name back at once, as seen from another root (21.6).
    expect((await cli(["folders"], two)).json.data.find((f: { default: string }) => f.default === one)).toMatchObject({
      name: "undo-one",
    });
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

describe("replace in every note (25.4)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string | Buffer>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-replace-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const bytes = (dir: string, rel: string) => readFileSync(join(dir, rel));
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("every note's matches, previewed by --dry-run, then written; a text file only with --files; undo takes it all back", async () => {
    const bad = Buffer.concat([Buffer.from("Quill "), Buffer.from([0xff]), Buffer.from("\n")]);
    const dir = vault({
      "a.md": "# Quill\n\nA Quill, a quill.\n",
      "b.md": "nothing here\n",
      "sub/c.md": "\uFEFFQuill\r\n",
      "bad.md": bad,
      "code.ts": "// Quill\n",
    });
    const dry = await cli(["replace", "--all", "Quill", "Pen", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.kind).toBe("replace");
    expect(dry.json.data.dryRun).toBe(true);
    // Smart case, as find has it: a capital in the query, so `quill` is left.
    expect(dry.json.data.files.map((f: { path: string; edits: unknown[] }) => [f.path, f.edits])).toEqual([
      [
        "a.md",
        [
          { line: 1, before: "# Quill", after: "# Pen" },
          { line: 3, before: "A Quill, a quill.", after: "A Pen, a quill." },
        ],
      ],
      ["sub/c.md", [{ line: 1, before: "Quill", after: "Pen" }]],
    ]);
    // Its invalid byte would be written back as U+FFFD: said, not rewritten.
    expect(dry.json.warnings).toContain("bad.md:1: not valid UTF-8: not rewritten");
    expect(read(dir, "a.md")).toBe("# Quill\n\nA Quill, a quill.\n");
    const done = await cli(["replace", "--all", "Quill", "Pen"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "a.md")).toBe("# Pen\n\nA Pen, a quill.\n");
    // Its byte order mark and its CRLF kept.
    expect(read(dir, "sub/c.md")).toBe("\uFEFFPen\r\n");
    expect([...bytes(dir, "bad.md")]).toEqual([...bad]);
    expect(read(dir, "code.ts")).toBe("// Quill\n");
    writeFileSync(join(dir, "z.md"), "Quill\n");
    const files = await cli(["replace", "--all", "Quill", "Pen", "--files"], dir);
    // By path, the text files among the notes.
    expect(files.json.data.files.map((f: { path: string }) => f.path)).toEqual(["code.ts", "z.md"]);
    expect(read(dir, "code.ts")).toBe("// Pen\n");
    // Undone newest first, as a rename is: the code file, then the notes; said the other way.
    const out: string[] = [];
    await runCli(["undo", "--dry-run"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(out.join("")).toStartWith('would undo the replace of "Quill" with "Pen": 2 changes in 2 files\n');
    expect((await cli(["undo"], dir)).code).toBe(0);
    expect([read(dir, "code.ts"), read(dir, "z.md")]).toEqual(["// Quill\n", "Quill\n"]);
    const back = await cli(["undo"], dir);
    expect(back.code).toBe(0);
    expect(back.json.data.kind).toBe("replace");
    expect(read(dir, "a.md")).toBe("# Quill\n\nA Quill, a quill.\n");
    expect(read(dir, "sub/c.md")).toBe("\uFEFFQuill\r\n");
  });

  test("regex and its groups, whole words, ignoring case; the human answer names both", async () => {
    const dir = vault({ "a.md": "k=1 and kk=2\nK=3\n" });
    const r = await cli(["replace", "--all", "(k)=(\\d)", "$2:$1", "--regex", "--whole", "--ignore-case"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "a.md")).toBe("1:k and kk=2\n3:K\n");
    const out: string[] = [];
    await runCli(["replace", "--all", "and", "or", "--dry-run"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(out.join("")).toStartWith(
      'would replace "and" with "or": 1 change in 1 file\n  a.md:1\n    - 1:k and kk=2\n    + 1:k or kk=2\n',
    );
  });

  test("--plan saves it for apply; refused when a file changed since; nothing to replace writes nothing", async () => {
    const dir = vault({ "a.md": "x\n", "b.md": "x\n" });
    const planned = await cli(["replace", "--all", "x", "y", "--plan"], dir);
    expect(planned.code).toBe(0);
    expect(read(dir, "a.md")).toBe("x\n");
    expect((await cli(["apply", planned.json.data.plan.id], dir)).code).toBe(0);
    expect([read(dir, "a.md"), read(dir, "b.md")]).toEqual(["y\n", "y\n"]);
    const none = await cli(["replace", "--all", "zzz", "y"], dir);
    expect(none.code).toBe(0);
    expect(none.json.data.files).toEqual([]);
    // Each match replaced by itself: no file changes.
    expect((await cli(["replace", "--all", "y", "y"], dir)).json.data.files).toEqual([]);
    // Nothing replaced isn't logged: undo takes back the last real one.
    expect((await cli(["undo"], dir)).code).toBe(0);
    expect([read(dir, "a.md"), read(dir, "b.md")]).toEqual(["x\n", "x\n"]);
  });

  test("what it finds is text, never a note: a pointer, a path to another root's file", async () => {
    const other = vault({ "x.md": "# X\n" });
    const abs = join(other, "x.md");
    const dir = vault({ "a.md": `see slipbox://gone/a.md and ${abs}\n` });
    const r = await cli(["replace", "--all", "slipbox://gone/a.md", "slipbox://here/a.md"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "a.md")).toBe(`see slipbox://here/a.md and ${abs}\n`);
    // A file's path as the text: this root's notes searched, not that file's root.
    expect(
      (await cli(["replace", "--all", abs, "elsewhere"], dir)).json.data.files.map((f: { path: string }) => f.path),
    ).toEqual(["a.md"]);
    expect(read(dir, "a.md")).toBe("see slipbox://here/a.md and elsewhere\n");
    expect(read(other, "x.md")).toBe("# X\n");
  });

  test("planned with nothing to find: refused, not a match at every place", async () => {
    const { planReplace } = await import("../src/core/replace-files.ts");
    const dir = vault({ "a.md": "x\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(() => planReplace(g, "", "y", ["a.md"], { regex: true, whole: false })).toThrow(
      "nothing to find: an empty pattern matches nothing",
    );
  });

  test("usage: two arguments and no note; one note's flags refused with --all; --files and --plan only with it; a bad regex", async () => {
    const dir = vault({ "a.md": "x\n" });
    for (const args of [
      ["replace", "--all", "x"],
      ["replace", "--all", "a.md", "x", "y"],
      ["replace", "--all", "x", "y", "--first"],
      ["replace", "--all", "x", "y", "--lines", "1"],
      ["replace", "a", "x", "y", "--files"],
      ["replace", "a", "x", "y", "--plan"],
      ["replace", "--all", "(", "y", "--regex"],
      ["replace", "--all", "", "y"],
    ])
      expect([args, (await cli(args, dir)).code]).toEqual([args, 2]);
    expect(read(dir, "a.md")).toBe("x\n");
  });
});

// typos: off — the spell checker's tests misspell on purpose.
describe("slipbox spell (25.6)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-spell-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("a note's misspelt words by line and column, in its lang: or [spell] languages; --suggest, --lang", async () => {
    const dir = vault({
      "en.md": "# Nte\n\nA 🔭 recieve, `kodd`.\n",
      "tr.md": "---\nlang: tr\n---\nevlerinzde kitap\n",
      "x.md": "---\nlang: xx\n---\nzzq\n",
    });
    const en = await cli(["spell", "en"], dir);
    expect(en.code).toBe(0);
    // Columns in code points, as find's: the telescope is one.
    expect(en.json.data).toEqual({
      path: "en.md",
      languages: ["en"],
      missing: [],
      words: [
        { line: 1, column: 3, word: "Nte" },
        { line: 3, column: 5, word: "recieve" },
      ],
    });
    const sugg = await cli(["spell", "en", "--suggest"], dir);
    expect(sugg.json.data.words[1].suggestions[0]).toBe("receive");
    expect((await cli(["spell", "tr"], dir)).json.data.words.map((w: { word: string }) => w.word)).toEqual([
      "evlerinzde",
    ]);
    // --lang over the note's own: English doesn't know Turkish.
    expect((await cli(["spell", "tr", "--lang", "en,tr"], dir)).json.data).toMatchObject({
      languages: ["en", "tr"],
      words: [{ word: "evlerinzde" }],
    });
    expect(
      (await cli(["spell", "tr", "--lang", "en"], dir)).json.data.words.map((w: { word: string }) => w.word),
    ).toEqual(["evlerinzde", "kitap"]);
    // A language with no dictionary: said, nothing marked for it.
    const x = await cli(["spell", "x"], dir);
    expect(x.json.data).toMatchObject({ missing: ["xx"], words: [] });
    expect(x.json.warnings).toContain("no dictionary for xx — [spell] dictionaries can name yours");
  });

  test("--add puts a word in your own list: marked no more; usage: --add alone, one word; a note, not another file", async () => {
    const dir = vault({ "a.md": "Zorvexion here\n", "b.txt": "text\n" });
    expect((await cli(["spell", "a"], dir)).json.data.words.map((w: { word: string }) => w.word)).toEqual([
      "Zorvexion",
    ]);
    const added = await cli(["spell", "--add", "Zorvexion"], dir);
    expect(added.code).toBe(0);
    expect(added.json.data.added).toBe("Zorvexion");
    expect(readFileSync(added.json.data.file, "utf8").split("\n")).toContain("Zorvexion");
    expect((await cli(["spell", "a"], dir)).json.data.words).toEqual([]);
    for (const args of [
      ["spell", "a", "--add", "w"],
      ["spell", "--add", "two words"],
      ["spell", "--add", "w", "--suggest"],
      ["spell", "b.txt"],
      ["spell"],
    ]) {
      expect([args, (await cli(args, dir)).code]).toEqual([args, 2]);
    }
  });
});
// typos: on

describe("path links, as other tools write them (17.16)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
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
  write(
    join(notes, "index.md"),
    [
      "[rel](../app/design.md) [goals](../app/design.md#goals) ![pic](../app/pic.png)",
      "[home](~/app/design.md)",
      `[abs](${app}/design.md)`,
      `[url](file://${app}/design.md#goals)`,
      `[inside](${notes}/todo.md) [iu](file://${notes}/todo.md)`,
      "[spaced](<../app/my design.md>) [encoded](../app/my%20design.md)",
      "",
    ].join("\n\n"),
  );
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
    for (const t of [
      "../app/design.md",
      "../app/design.md#goals",
      "~/app/design.md",
      `${app}/design.md`,
      `file://${app}/design.md#goals`,
    ]) {
      expect(at(t)).toMatchObject({ status: "note", path: join(app, "design.md"), root: app, name: "papp" });
    }
    expect(at("../app/pic.png")).toMatchObject({ status: "file", path: join(app, "pic.png") });
    for (const t of [`${notes}/todo.md`, `file://${notes}/todo.md`])
      expect(at(t)).toMatchObject({ status: "note", path: "todo.md" });
    expect(at("../app/my design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    expect(at("../app/my%20design.md")).toMatchObject({ status: "note", path: join(app, "my design.md") });
    // resolve takes them too: a file:// URL is a file, not a web page.
    const r = await withHome(() => cli(["resolve", `file://${app}/design.md`], notes));
    expect(r.json.data).toMatchObject({ status: "resolved", abs: join(app, "design.md") });
    expect((await withHome(() => cli(["resolve", `[x](file://${app}/design.md#goals)`], notes))).json.data.abs).toBe(
      join(app, "design.md"),
    );
  });

  test("backlinks: this vault's absolute links, and another vault's path links in every form", async () => {
    await ready;
    const bl = await withHome(async () => (await cli(["backlinks", "todo"], notes)).json.data.backlinks);
    expect(bl.filter((b: { from: string }) => b.from === "index.md")).toHaveLength(2);
    expect(
      bl
        .filter((b: { name: string | null }) => b.name === "papp")
        .map((b: { target: string }) => b.target)
        .sort(),
    ).toEqual(["../notes/todo.md", `file://${notes}/todo.md`, "~/notes/todo.md"].sort());
  });

  test("a rename keeps each path link in its form: absolute, ~/, file://, relative, encoded", async () => {
    await ready;
    await withHome(() => cli(["ls"], app));
    const r = await withHome(() => cli(["mv", "todo", "tasks"], notes));
    expect(r.code).toBe(0);
    const index = readFileSync(join(notes, "index.md"), "utf8");
    expect(index).toContain(`[inside](${notes}/tasks.md) [iu](file://${notes}/tasks.md)`);
    expect(readFileSync(join(app, "links.md"), "utf8")).toBe(
      `[r](../notes/tasks.md) [t](~/notes/tasks.md) [u](file://${notes}/tasks.md)\n`,
    );
    // In the other vault: the spaced note renamed, each link keeps its encoding.
    await withHome(() => cli(["ls"], notes));
    await withHome(() => cli(["mv", "my design", "your design"], app));
    expect(readFileSync(join(notes, "index.md"), "utf8")).toContain(
      "[spaced](<../app/your design.md>) [encoded](../app/your%20design.md)",
    );
  });
});

describe("nested vaults, known to each other without being opened (17.17)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
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
    for (const l of links)
      expect(l).toMatchObject({ status: "note", path: join(kid, "note.md"), root: kid, name: "dkid" });
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
    expect(r.json.data).toMatchObject({
      status: "resolved",
      abs: join(fresh, "index.md"),
      root: fresh,
      name: "dparent2",
      href: "../index.md",
    });
    const old = await cli(["resolve", "dparent2:index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({ status: "unresolved", suggest: "slipbox://dparent2/index.md" });
    expect((await cli(["resolve", "[[dparent2:index]]"], join(fresh, "kid"))).code).toBe(3);
  });

  test("a second copy (a second clone): each one's names mean its own nested vault, and its links stay its own", async () => {
    // The first copy opened before the second came (as the tests before this one do): its nested vault recorded, and
    // the first known, the default.
    await cli(["links", "index"], parent);
    const second = mkdtempSync(join(tmpdir(), "slipbox-nest-copy-"));
    cpSync(parent, second, { recursive: true });
    // Its nested vault not yet recorded, the first one's is, by the same name: its own still meant.
    const first = (await cli(["links", "index"], second)).json.data;
    expect(first[0]).toMatchObject({ status: "note", path: join(second, "kid", "note.md") });
    for (const root of [parent, second]) await cli(["backlinks", "index"], root); // each indexed, as when opened
    for (const [root, other] of [
      [parent, second],
      [second, parent],
    ] as const) {
      const links = (await cli(["links", "index"], root)).json.data;
      // Two copies of dkid on this machine: each its own, by its path; the name is the folder's (21.6).
      for (const l of links)
        expect(l).toMatchObject({
          status: "note",
          path: join(root, "kid", "note.md"),
          root: join(root, "kid"),
          name: "dkid",
        });
      // dparent by its old form: not a link, nor an argument (21.12); by its pointer, its default copy (21.6).
      expect((await cli(["resolve", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["read", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["resolve", "slipbox://dparent/index.md"], join(root, "kid"))).json.data).toMatchObject({
        status: "resolved",
        abs: join(parent, "index.md"),
      });
      // The other copy's links to its own nested vault aren't backlinks here.
      const bl = (await cli(["backlinks", "note"], join(root, "kid"))).json.data.backlinks;
      expect(bl.map((b: { from: string }) => b.from)).toContain(join(root, "index.md"));
      expect(bl.map((b: { from: string }) => b.from)).not.toContain(join(other, "index.md"));
    }
    // The second made the default: the pointer means it, from anywhere.
    expect((await cli(["folders", "default", "dparent", second], parent)).code).toBe(0);
    expect((await cli(["resolve", "slipbox://dparent/index.md"], join(parent, "kid"))).json.data).toMatchObject({
      status: "resolved",
      abs: join(second, "index.md"),
    });
  });
});

describe("moving a folder (18.3)", () => {
  test("links between notes that move together stay; links out of it and into it are fixed; everything in it moves", async () => {
    const { openGraph: open } = await import("../src/core/graph.ts");
    const { planFolderMove, applyPlan } = await import("../src/core/rename.ts");
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
    const { openVault } = await import("../src/core/reach.ts");
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

describe("a folder made a vault, and a vault made a plain folder again (18.11)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  const base = mkdtempSync(join(tmpdir(), "slipbox-make-"));
  const parent = join(base, "parent");
  const other = join(base, "other");
  const files: Record<string, string> = {
    "parent/.slipbox/config.toml": '[vault]\nid = "mkparent000001"\nname = "mkparent"\n',
    "parent/home.md":
      "# Home\n\n[a](proj/alpha.md) [g](proj/deep/gamma.md) [b](proj/beta.md) [b2](proj/beta.md#beta) ![p](proj/pic.png)\n",
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
      for (const l of (await cli(["links", "--all"], root)).json.data as {
        from: string;
        status: string;
        path: string | null;
      }[]) {
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
    expect(dry.data).toMatchObject({ kind: "make-root", from: "proj", to: "mkproj", dryRun: true });
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
    expect(back.data).toMatchObject({ kind: "unmake-root", from: "proj", to: "mkparent", dryRun: false });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    for (const rel of Object.keys(files)) expect([rel, read(rel)]).toEqual([rel, texts[rel]!]);
    expect(await reached([parent])).toEqual(before);
    // The machine forgot it — a root no more, its name gone with its .slipbox/ — which is in the parent's trash, restorable.
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    expect(readRoots().some((v) => v.path === join(parent, "proj"))).toBe(false);
    expect((await cli(["folders"], parent)).json.data.some((f: { name: string }) => f.name === "mkproj")).toBe(false);
    expect((await cli(["trash"], parent)).json.data[0]).toMatchObject({ shown: "proj/.slipbox", dir: true });
    // Refused: a folder that's already a vault; a vault not nested in another.
    expect((await cli(["deinit", "proj"], parent)).code).toBe(5);
    expect((await cli(["deinit", "."], other)).code).toBe(5);
    // And a git checkout (20.3): a vault by itself, with .slipbox/ or without — nothing changes.
    mkdirSync(join(parent, "proj", ".git"));
    const repo = (await cli(["deinit", "proj"], parent)).json;
    expect(repo.error.message).toContain("has no .slipbox/ to take away (it's a vault by its .git)");
    await cli(["init", "proj", "--name", "mkrepo"], parent);
    const both = (await cli(["deinit", "proj"], parent)).json;
    expect(both.error.message).toContain("proj is a vault by its .git too: it stays one, with or without .slipbox/");
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(true);
  });

  test("deinit rewrites the pointers by its name, which goes with its .slipbox/: from apart, the parent's pointer, else a path (D74, D75)", async () => {
    const { openVault } = await import("../src/core/reach.ts");
    const at = mkdtempSync(join(tmpdir(), "slipbox-deinit-ptr-"));
    const tree: Record<string, string> = {
      "named/.slipbox/config.toml": '[vault]\nid = "dpnamed000001"\nname = "dpnamed"\n',
      "named/home.md": "# Home\n\n[in](slipbox://dpbox/x.md#top) [dir](slipbox://dpbox/)\n",
      "named/box/.slipbox/config.toml": '[vault]\nid = "dpbox00000001"\nname = "dpbox"\n',
      "named/box/x.md": "# Top\n\n[self](slipbox://dpbox/sub/my%20y.md)\n",
      "named/box/sub/my y.md": "# Y\n",
      "plain/.slipbox/config.toml": "",
      "plain/pbox/.slipbox/config.toml": '[vault]\nid = "dppbox0000001"\nname = "dppbox"\n',
      "plain/pbox/z.md": "# Z\n",
      "far/.slipbox/config.toml": '[vault]\nid = "dpfar00000001"\nname = "dpfar"\n',
      "far/links.md": "[x](slipbox://dpbox/x.md#top) [y](<slipbox://dpbox/sub/my y.md>) [z](slipbox://dppbox/z.md)\n",
    };
    for (const [rel, text] of Object.entries(tree)) {
      mkdirSync(join(at, rel, ".."), { recursive: true });
      writeFileSync(join(at, rel), text);
    }
    const read = (rel: string) => readFileSync(join(at, rel), "utf8");
    // This machine has seen them all, with their indexes.
    for (const r of ["far", "named/box", "named", "plain/pbox", "plain"]) openVault(join(at, r)).ensureAll();
    const statuses = async () =>
      (await cli(["links", "links"], join(at, "far"))).json.data.map((l: { status: string; path: string | null }) => [
        l.status,
        l.path,
      ]);
    expect(await statuses()).toEqual([
      ["note", join(at, "named", "box", "x.md")],
      ["note", join(at, "named", "box", "sub", "my y.md")],
      ["note", join(at, "plain", "pbox", "z.md")],
    ]);
    // Previewed: from apart, the named parent's pointer; from the parent and within, a path.
    const dry = (await cli(["deinit", "box", "--dry-run"], join(at, "named"))).json.data;
    expect(
      dry.files.map((f: { abs: string; edits: { after: string }[] }) => [f.abs, f.edits.map((e) => e.after)]),
    ).toEqual(
      expect.arrayContaining([
        [join(at, "named", "box", "x.md"), ["[self](sub/my%20y.md)"]],
        [join(at, "named", "home.md"), ["[in](box/x.md#top) [dir](box/)"]],
        [
          join(at, "far", "links.md"),
          ["[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](slipbox://dppbox/z.md)"],
        ],
      ]),
    );
    expect(dry.files).toHaveLength(3);
    expect((await cli(["deinit", "box"], join(at, "named"))).code).toBe(0);
    expect(read("far/links.md")).toBe(
      "[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](slipbox://dppbox/z.md)\n",
    );
    expect(read("named/home.md")).toBe("# Home\n\n[in](box/x.md#top) [dir](box/)\n");
    expect(read("named/box/x.md")).toBe("# Top\n\n[self](sub/my%20y.md)\n");
    // A parent with no name: a path, which works while the folders are laid out alike.
    expect((await cli(["deinit", "pbox"], join(at, "plain"))).code).toBe(0);
    expect(read("far/links.md")).toBe(
      "[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](../plain/pbox/z.md)\n",
    );
    // Each reaches what it did.
    expect(await statuses()).toEqual([
      ["note", join(at, "named", "box", "x.md")],
      ["note", join(at, "named", "box", "sub", "my y.md")],
      ["note", join(at, "plain", "pbox", "z.md")],
    ]);
    const home = (await cli(["links", "home"], join(at, "named"))).json.data.map(
      (l: { status: string; path: string | null }) => [l.status, l.path],
    );
    expect(home).toEqual([
      ["note", "box/x.md"],
      ["folder", "box"],
    ]);
  });
});

describe("tags (1.6)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
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
      "a.md":
        "# A\n\n[b](b.md), [c](c.md), [code](s.ts), ![p](pic.png), [missing](missing.md), [log](big.log) and [b](b.md) again.\n",
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
    expect(paths(b)).toEqual([
      "start:a.md",
      "link:b.md",
      "link:c.md",
      "link:s.ts",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
    ]);
    expect(b.left).toEqual([
      { path: "pic.png", why: "link", from: "a.md", reason: "binary" },
      { path: "big.log", why: "link", from: "a.md", reason: "size" },
    ]);
    expect(b.items[1]).toMatchObject({ depth: 1, from: "a.md", lines: 7 });
    // Written as the scratch is: each file's reference and why, its text fenced (longer than a fence inside it).
    expect(b.text).toStartWith(
      "# Context: a.md\n\nThe note, 3 files it links to and 3 files linking to it: each with its path and lines, fenced as it is on disk.\n\n## a.md\n\n`a.md:1-3` — asked for\n\n```markdown\n# A\n",
    );
    expect(b.text).toContain(
      "## b.md\n\n`b.md:1-7` — linked from a.md\n\n````markdown\n# B\n\n```js\nlet x;\n```\n\nOn to [d](d.md).\n````\n",
    );
    expect(b.text).toContain("## s.ts\n\n`s.ts:1` — linked from a.md\n\n```typescript\nexport const s = 1;\n```\n");
    expect(b.text).toContain("## e.md\n\n`e.md:1` — links to a.md\n");
    expect(b.text).toEndWith(
      "## Left out\n\n- `pic.png` — linked from a.md: not text\n- `big.log` — linked from a.md: too large\n",
    );
    expect(b.text).not.toContain("unrelated");
  });

  test("a linked file gone since the index, or one that can't be read: named as such, never included", async () => {
    const { buildContext } = await import("../src/core/context.ts");
    const { chmodSync } = await import("node:fs");
    const g = setup();
    rmSync(join(g.root, "c.md"));
    chmodSync(join(g.root, "s.ts"), 0o000);
    try {
      const b = buildContext(g, ["a.md"], { depth: 1, backlinks: false, limit: 25 });
      expect(paths(b)).toEqual(["start:a.md", "link:b.md"]);
      expect(b.left.filter((l) => l.reason === "unreadable")).toEqual([
        { path: "c.md", why: "link", from: "a.md", reason: "unreadable" },
        { path: "s.ts", why: "link", from: "a.md", reason: "unreadable" },
      ]);
      expect(b.text).toContain(
        "- `c.md` — linked from a.md: can't be read\n- `s.ts` — linked from a.md: can't be read\n",
      );
    } finally {
      chmodSync(join(g.root, "s.ts"), 0o644);
    }
  });

  test("deeper, none, no backlinks, a limit: what's past it named, not included", async () => {
    const { buildContext } = await import("../src/core/context.ts");
    const g = setup();
    expect(paths(buildContext(g, ["a.md"], { depth: 2, backlinks: true, limit: 25 }))).toEqual([
      "start:a.md",
      "link:b.md",
      "link:c.md",
      "link:s.ts",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
      "link:d.md",
    ]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: false, limit: 25 }))).toEqual(["start:a.md"]);
    expect(paths(buildContext(g, ["a.md"], { depth: 0, backlinks: true, limit: 25 }))).toEqual([
      "start:a.md",
      "backlink:ab.json",
      "backlink:e.md",
      "backlink:f.md",
    ]);
    const two = buildContext(g, ["a.md", "d.md"], { depth: 1, backlinks: false, limit: 3 });
    expect(paths(two)).toEqual(["start:a.md", "start:d.md", "link:b.md"]);
    expect(two.left.map((l) => `${l.reason}:${l.path}`)).toEqual([
      "limit:c.md",
      "limit:s.ts",
      "binary:pic.png",
      "size:big.log",
    ]);
    expect(two.text).toStartWith("# Context: a.md, d.md\n\nThe notes, 1 file they link to:");
    expect(two.text).toContain("- `c.md` — linked from a.md: past the limit of 3\n");
    // A long list of what's left out: the first 20 named, the rest counted.
    writeFileSync(join(g.root, "hub.md"), Array.from({ length: 25 }, (_, i) => `[n${i}](n${i}.md)`).join("\n"));
    for (let i = 0; i < 25; i++) writeFileSync(join(g.root, `n${i}.md`), `# ${i}\n`);
    const hub = buildContext(openGraph(locateVault({ root: g.root }), DEFAULT_CONFIG, true), ["hub.md"], {
      depth: 1,
      backlinks: false,
      limit: 1,
    });
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
      "dome.md":
        "---\ntitle: Dome refit\naliases: [Shutter work]\ntags: [dome/shutter, budget]\n---\n# Dome refit\n\nThe summer shutdown.\n\n## Parts\n\nNew rollers for the shutter belt.\n\n```\n# not a heading\nshutter in code\n```\n",
      "log.md":
        "# Night log\n\nOpened the dome at 21:10.\nThe shutter stuck once.\n\nCalibration\n===========\n\nFlats at dusk. #calibration\n",
      "notes/café.md": "# Café\n\nThe naïve résumé was at the café.\n",
      "notes/plan.md":
        '+++\ntitle = "Plan"\ntags = ["planning"]\n+++\n\nPhotometry pipeline plans; calibrating everything.\n',
      "data.toml": 'name = "observatory"\nshutter_speed = 3\n',
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
    const log = indexDoc(
      "log.md",
      "# Night log\n\ntext\n\nCalibration\n===========\n\nFlats. #calibration #dome/flat\n",
      "note",
    );
    expect(log.headings).toEqual([
      { line: 1, text: "Night log" },
      { line: 5, text: "Calibration" },
    ]);
    expect(log.tags).toEqual(["calibration", "dome/flat"]);
    expect(indexDoc("x/untitled.md", "just text\n", "note").title).toBe("untitled");
    expect(indexDoc("plan.md", '+++\ntitle = "Plan"\n+++\n', "note").title).toBe("Plan");
    // A data file with no blank lines: one unit, one section (under the band's top).
    expect(
      indexDoc("big.csv", Array.from({ length: 200 }, (_, i) => `row ${i}`).join("\n"), "data").sections.map((x) => [
        x.name,
        x.line,
        x.end,
      ]),
    ).toEqual([["§:file", 1, 200]]);
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
    expect(ftsMatch(q)).toBe(
      '("dome" AND "shutter belt" AND "roll"* AND {title aliases} : "refit" AND " AND ( NEAR") NOT "summer"',
    );
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
    expect(search(g, idx, "shutter dusk")).toMatchObject({
      relaxed: false,
      hits: [{ path: "log.md", line: 4, more: 1 }],
    });
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

  test("index and scan agree: -word with filters only, a phrase across a line break, path: in any case; marks merged", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-agree-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "A"));
    const files: Record<string, string> = {
      "a.md": "#project draft here\n",
      "b.md": "#project final\n",
      "w.md": "the quick brown\nfox jumps\n",
      "c.md": "brown, fox\n",
      "A/up.md": "upper\n",
      "ny.md": "new york is new\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    const both = (q: string) =>
      [idx, null].map((x) =>
        search(g, x, q)
          .hits.map((h) => h.path)
          .sort(),
      );
    expect(both("#project -draft")).toEqual([["b.md"], ["b.md"]]);
    expect(both('"brown fox"')).toEqual([
      ["c.md", "w.md"],
      ["c.md", "w.md"],
    ]);
    expect(both("path:a/")).toEqual([["A/up.md"], ["A/up.md"]]);
    for (const x of [idx, null]) {
      const hit = search(g, x, 'new "new york"').hits[0]!;
      expect(hit.marks).toEqual([
        [0, 8],
        [12, 15],
      ]);
    }
    idx.close();
  });

  test("the scan answers the same query the same way, before there's an index", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const { g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const q of [
      "shutter",
      "shutter stuck",
      "belt stuck",
      "shutter -stuck",
      "shutter #budget",
      "#dome",
      "path:notes/",
      "calibrat*",
      "naive resume",
      "title:refit",
      "zzz",
    ]) {
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
    expect(
      search(g, null, "zebra", { texts: new Map([["log.md", "# Night log\n\na zebra\n"]]) }).hits.map((h) => h.path),
    ).toEqual(["log.md"]);
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
    expect(
      search(again, idx, "zebra")
        .hits.map((h) => h.path)
        .sort(),
    ).toEqual(["log.md", "new.md"]);
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
    expect(heard).toEqual(
      expect.arrayContaining([
        { kind: "moved", from: "new.md", to: "fresh.md" },
        { kind: "removed", path: "new.md" },
        { kind: "changed", path: "fresh.md" },
      ]),
    );
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
      expect(search(g, engine, "alpha beta").hits[0]).toMatchObject({
        path: "two.md",
        line: 7,
        heading: "Both",
        more: 1,
      });
    }
    idx.close();
  });

  test("an index of another version, or one SQLite can't read, is made again; a new one is built before it's used", async () => {
    const { SearchIndex } = await import("../src/core/search.ts");
    const { cacheDir } = await import("../src/core/foundation/platform/paths.ts");
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
    expect(fresh.db.pragma("user_version")).toBe(3);
    // The runtime's own SQLite (node:sqlite): FTS5 in it, a version new enough for what the index asks.
    const v = (fresh.db.prepare("select sqlite_version() as v").get() as { v: string }).v.split(".").map(Number);
    expect(v[0] === 3 && v[1]! >= 43).toBe(true);
    fresh.close();
  });

  test("filters alone with `only` (the TUI's unsaved notes): just those files read", async () => {
    const { search } = await import("../src/core/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-only-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const f of ["a.md", "b.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(search(g, null, "path:a", { only: ["b.md"] }).hits).toEqual([]);
    expect(search(g, null, "path:a", { only: ["a.md"] }).hits.map((h) => h.path)).toEqual(["a.md"]);
  });

  test("a phrase wrapped across a line break, or starting inside a word turned down: found and placed, by the scan and the index", async () => {
    const { catchUp, search, SearchIndex } = await import("../src/core/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-phrase-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), "uno no no\n");
    writeFileSync(join(dir, "b.md"), "# b\n\n## Trip\n\nWe went to New\nYork last week.\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const i of [null, idx]) {
      expect(search(g, i, '"new york"').hits).toMatchObject([
        { path: "b.md", line: 5, column: 12, heading: "Trip", snippet: "We went to New" },
      ]);
      const [no] = search(g, i, '"no no"').hits;
      expect(no).toMatchObject({ path: "a.md", line: 1, column: 5, snippet: "uno no no" });
      expect(no!.snippet.slice(no!.marks[0]![0], no!.marks[0]![1])).toBe("no no");
    }
    idx.close();
  });

  test('the CLI: a scan until `slipbox index`, then the index, kept current; [search] engine = "scan" never uses one', async () => {
    const { dir } = setup();
    const out = async (args: string[]) => {
      const o: string[] = [];
      const code = await runCli([...args, "--json"], {
        out: (x: string) => o.push(x),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: process.env,
      });
      return { code, json: JSON.parse(o.join("")) };
    };
    const first = await out(["search", "shutter", "stuck"]);
    expect(first.json.data).toMatchObject({ engine: "scan", relaxed: false, hits: [{ path: "log.md", line: 4 }] });
    expect(first.json.warnings.join()).toContain("no search index yet");
    expect((await out(["index"])).json.data).toMatchObject({ indexed: 5, removed: 0, files: 5, rebuilt: false });
    expect((await out(["search", "shutter", "stuck"])).json.data).toMatchObject({
      engine: "index",
      hits: [{ path: "log.md", line: 4 }],
    });
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
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
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
    expect(locateVault({ path: join(wt, "a.md") })).toMatchObject({
      mode: "vault",
      root: wt,
      id: main.id,
      name: main.name,
      worktree: { name: "wt" },
    });
    expect(existsSync(join(wt, ".slipbox"))).toBe(false);
  });

  test("read from .git: the main checkout, a worktree, its name and branch; a vault below the top folder too", async () => {
    const { checkoutOf, headOf, inMain } = await import("../src/core/git.ts");
    const l = await layout(++n);
    if (!l) return;
    expect(checkoutOf(l.x)).toEqual({
      root: l.x,
      gitDir: join(l.x, ".git"),
      common: join(l.x, ".git"),
      main: l.x,
      worktree: null,
    });
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
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const { PositionStore } = await import("../src/core/workspace/session/position.ts");
    const l = await layout(++n);
    if (!l) return;
    const wt = locateVault({ root: l.wt });
    const main = locateVault({ root: l.x });
    expect(wt).toMatchObject({
      name: `x${n}`,
      key: vaultKey(l.wt),
      worktree: { name: "feat", checkout: l.wt, main: l.x, mainVault: l.x },
    });
    expect(wt.key).not.toBe(main.key);
    expect(wt.id).toBe(main.id);
    // The machine's list knows which is which.
    await cli(["ls"], l.wt);
    expect(readRoots().find((v) => v.path === l.wt)).toMatchObject({
      key: wt.key,
      worktree: { name: "feat", main: l.x },
    });
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
    const { pruneWorktrees, readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const { cacheDir, stateDir } = await import("../src/core/foundation/platform/paths.ts");
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

  test("a named .slipbox/ folder inside a worktree: its copy is the main checkout's folder, not a second one (21.6)", async () => {
    const { readFolders } = await import("../src/core/workspace/vaults/folders.ts");
    const { rootAt } = await import("../src/core/workspace/vaults/vault.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-wt-named-"));
    const main = join(base, "repo");
    const name = `hb${basename(base).slice(-6).toLowerCase()}`;
    mkdirSync(join(main, "docs"), { recursive: true });
    writeFileSync(join(main, "docs", "a.md"), "# A\n");
    if (git(main, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    initVault(join(main, "docs"), name);
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "x");
    recordLocation(rootAt(join(main, "docs")));
    const wt = join(base, "wt");
    if (git(main, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) return;
    recordLocation(rootAt(join(wt, "docs")));
    const f = readFolders().find((x) => x.name === name);
    expect(f?.copies.map((c) => c.path)).toEqual([join(main, "docs")]);
    expect(f?.ask).toBeUndefined();
  });

  test("a worktree's root marked only by .obsidian/ isn't gone while it's there (21.1, 17.19)", async () => {
    const { cacheDir } = await import("../src/core/foundation/platform/paths.ts");
    const { rootAt } = await import("../src/core/workspace/vaults/vault.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-wt-obs-"));
    const main = join(base, "repo");
    mkdirSync(join(main, "notes", ".obsidian"), { recursive: true });
    writeFileSync(join(main, "notes", ".obsidian", "app.json"), "{}\n");
    writeFileSync(join(main, "notes", "a.md"), "# A\n");
    if (git(main, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "x");
    const wt = join(base, "wt");
    if (git(main, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) return;
    const loc = rootAt(join(wt, "notes"));
    expect(loc.worktree).toBeTruthy();
    recordLocation(loc);
    mkdirSync(cacheDir(loc), { recursive: true });
    writeFileSync(join(cacheDir(loc), "index.json"), "{}");
    recordLocation(rootAt(join(main, "notes"))); // any open prunes
    expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(true);
    git(main, "worktree", "remove", "--force", wt);
    recordLocation(rootAt(join(main, "notes")));
    expect(existsSync(cacheDir(loc))).toBe(false);
  });
});

describe("a branch switch (5.9)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
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

describe("git in a root you don't trust (23.6)", () => {
  // A repository whose .git/config and .gitattributes name programs — as one copied or unpacked brings
  // them (git clone doesn't) — each leaving a mark when git runs it.
  const hostile = () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-hostile-git-"));
    const g = (...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", top, ...args]);
    if (g("init", "-q", "-b", "main").exitCode !== 0) return null;
    writeFileSync(join(top, "a.md"), "# A\n");
    writeFileSync(join(top, ".gitattributes"), "*.md filter=evil diff=evil merge=evil\n");
    g("add", "-A");
    g("commit", "-q", "-m", "files");
    const mark = (what: string) => `sh -c 'touch ${join(top, `${what}-ran`)}; cat'`;
    g("config", "filter.evil.clean", mark("clean"));
    g("config", "diff.evil.textconv", `sh -c 'touch ${join(top, "textconv-ran")}; cat "$1"' --`);
    g("config", "core.fsmonitor", `sh -c 'touch ${join(top, "fsmonitor-ran")}'`);
    writeFileSync(join(top, ".git", "hooks", "post-index-change"), `#!/bin/sh\ntouch ${join(top, "hook-ran")}\n`);
    chmodSync(join(top, ".git", "hooks", "post-index-change"), 0o755);
    writeFileSync(join(top, "a.md"), "# A\n\nchanged\n");
    return top;
  };
  const marks = (top: string) =>
    ["clean", "textconv", "fsmonitor", "hook"].filter((m) => existsSync(join(top, `${m}-ran`)));

  test("status, what changed, a file as a branch has it: nothing the repository names runs", async () => {
    const top = hostile();
    if (!top) return; // no git here
    const { statusOf, changedSince, showAt } = await import("../src/core/gitops.ts");
    const c = { root: top };
    expect(statusOf(c)!.get("a.md")).toBe("modified");
    expect(changedSince(c, "main")).not.toBeNull();
    expect(showAt(c, "main", "a.md")).toBe("# A\n");
    expect(marks(top)).toEqual([]);
  });

  test("a git version that can't be read is guarded all the same — never taken, and kept, for one too old (regression)", () => {
    // Found 2026-10-10: `git --version` failing once (a start that failed on a machine short of memory) left the
    // attributes unguarded for the rest of the process, and a repository's clean filter ran.
    const top = hostile();
    if (!top) return; // no git here
    const noGit = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    const gitops = join(import.meta.dir, "..", "src", "core", "gitops.ts");
    const script = `
      const { gitArgs, statusOf } = await import(${JSON.stringify(gitops)});
      const real = process.env.PATH;
      process.env.PATH = ${JSON.stringify(noGit)};
      const blind = gitArgs(${JSON.stringify(top)}, ["status"]).some((a) => a.startsWith("--attr-source="));
      process.env.PATH = real;
      console.log(JSON.stringify({ blind, status: statusOf({ root: ${JSON.stringify(top)} })?.get("a.md") ?? null }));
    `;
    const r = Bun.spawnSync([process.execPath, "-e", script], { cwd: tmpdir(), stderr: "pipe" });
    expect(r.stderr.toString()).toBe("");
    expect(JSON.parse(r.stdout.toString())).toEqual({ blind: true, status: "modified" });
    expect(marks(top)).toEqual([]);
  });

  test("in a root you trust, git as the repository has it: its filters and hooks run", async () => {
    const top = hostile();
    if (!top) return;
    const { statusOf, changedSince } = await import("../src/core/gitops.ts");
    const { setTrustedRoots } = await import("../src/core/workspace/vaults/trust.ts");
    setTrustedRoots([top]);
    try {
      statusOf({ root: top });
      changedSince({ root: top }, "main");
      expect(marks(top).length).toBeGreaterThan(0);
    } finally {
      setTrustedRoots([]);
    }
  });
});

describe("git: status, what changed, diffs, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
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
    const z = [
      "?? new.md",
      " M a.md",
      "R  to.md",
      "from.md",
      " D gone.md",
      "UU both.md",
      "AA added-twice.md",
      "M  staged.md",
      "",
    ].join("\0");
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
    const far = diffRows(
      ["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"),
      ["X", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"),
      1,
    );
    expect(far.filter((r) => r.kind === "@@")).toEqual([
      { kind: "@@", text: "line 1", line: 1 },
      { kind: "@@", text: "line 9", line: 9 },
    ]);
    // A line added above moves what follows: the second group's context is a line further down.
    const moved = diffRows(
      ["x", "1", "2", "3", "4", "5", "6", "7", "y"].join("\n"),
      ["x", "new", "1", "2", "3", "4", "5", "6", "7", "Y"].join("\n"),
      1,
    );
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
    expect((await cli(["diff", "b.md"], r.root)).json.data).toMatchObject({
      new: true,
      rows: [{ kind: "@@" }, { kind: "+", text: "# B, not committed", line: 1 }],
    });
    expect((await cli(["changed", "--base", "nope"], r.root)).code).toBe(3);
    // The worktrees: the main checkout first; this one marked.
    const wt = join(r.top, "..", `${basename(r.top)}-wt`);
    git(r.top, "worktree", "add", "-q", "-b", "other", wt);
    const list = (await cli(["worktrees"], r.root)).json.data;
    expect(
      list.map((w: { path: string; branch: string; main: boolean; current: boolean; root: string }) => [
        w.branch,
        w.main,
        w.current,
        w.root,
      ]),
    ).toEqual([
      ["feat", true, true, r.root],
      ["other", false, false, join(wt, "docs")],
    ]);
    // Outside git: said so, exit 3.
    const plain = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    mkdirSync(join(plain, ".slipbox"));
    expect((await cli(["changed"], plain)).code).toBe(3);
  });

  test("diff: a byte order mark kept, line endings and a final line break changed: no line changed", async () => {
    const r = await repo();
    if (!r) return;
    git(r.top, "checkout", "-q", "main");
    writeFileSync(join(r.root, "m.md"), "\uFEFF# M\n\nbody\n");
    writeFileSync(join(r.root, "e.md"), "# E\n\nbody\n");
    git(r.top, "add", "-A");
    git(r.top, "commit", "-q", "-m", "m and e");
    git(r.top, "checkout", "-q", "feat");
    git(r.top, "merge", "-q", "main");
    expect((await cli(["diff", "m.md"], r.root)).json.data.rows).toEqual([]);
    writeFileSync(join(r.root, "e.md"), "# E\r\n\r\nbody");
    expect((await cli(["diff", "e.md"], r.root)).json.data.rows).toEqual([]);
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
  const draw = async (
    g: ReturnType<typeof openGraph>,
    rel: string,
    caches?: {
      parse: import("../src/core/parse.ts").ParseCache;
      render: import("../src/core/layout/render.ts").RenderCache;
    },
  ) => {
    const { layoutNote } = await import("../src/core/note.ts");
    const { parseMarkdown } = await import("../src/core/parse.ts");
    const { glyphsFor } = await import("../src/core/glyphs.ts");
    return layoutNote(
      parseMarkdown(readFileSync(g.abs(rel), "utf8"), caches?.parse),
      g,
      rel,
      { width: 60, glyphs: glyphsFor("unicode"), showUrls: false },
      caches?.render,
    );
  };
  const text = (l: { lines: { spans: { text: string }[] }[] }) =>
    l.lines.map((r) =>
      r.spans
        .map((x) => x.text)
        .join("")
        .trimEnd(),
    );

  test("a note in a frame where it's embedded: its name, then its text behind a bar — no frontmatter; its headings not this note's", async () => {
    const { g } = vaultOf({
      "host.md": "# Host\n\nBefore.\n\n![inner](sub/inner.md)\n\nAfter.\n",
      "sub/inner.md": "---\ntitle: Inner\n---\n# Inner\n\nSee [the sibling](sibling.md) and [sibling](./sibling.md).\n",
      "sub/sibling.md": "# Sibling\n",
    });
    const l = await draw(g, "host.md");
    expect(text(l)).toEqual([
      "▌ Host",
      "",
      "Before.",
      "",
      "⧉ inner",
      "▎ ▌ Inner",
      "▎",
      "▎ See the sibling and sibling.",
      "",
      "After.",
    ]);
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
    expect(l.links.find((x) => x.line === 4)).toMatchObject({
      kind: "image",
      target: "sub/inner.md",
      text: "inner",
      line: 4,
    });
  });

  test("an embedded note deleted, or one that can't be read: a reference, never its old text; changed, drawn as it is now", async () => {
    const { chmodSync } = await import("node:fs");
    const { dir, g } = vaultOf({
      "host.md": "![[gone]]\n\n![[locked]]\n",
      "gone.md": "# Gone\n\nIts text.\n",
      "locked.md": "# Locked\n\nSecret text.\n",
    });
    expect(text(await draw(g, "host.md"))).toContain("▎ Its text.");
    rmSync(join(dir, "gone.md"));
    writeFileSync(join(dir, "locked.md"), "# Locked\n\nNew text, longer.\n");
    chmodSync(join(dir, "locked.md"), 0o000);
    try {
      const l = await draw(g, "host.md");
      expect(l.embedded ?? []).toEqual([]);
      expect(text(l)).toEqual(["⧉ gone", "", "⧉ locked"]);
    } finally {
      chmodSync(join(dir, "locked.md"), 0o644);
    }
    const again = await draw(g, "host.md");
    expect(again.embedded).toEqual([join(dir, "locked.md")]);
    expect(text(again)).toContain("▎ New text, longer.");
  });

  test("a heading's section, a block by its ^id (a paragraph's, a list item's, a table's on the line after); missing ones said", async () => {
    const { g } = vaultOf({
      "host.md":
        "![src › Two](src.md#two)\n\n![src › ^para](src.md#^para)\n\n![src › ^item](src.md#^item)\n\n![src › ^tab](src.md#^tab)\n\n![src › Nope](src.md#nope)\n\n![src › ^nope](src.md#^nope)\n",
      "src.md":
        "# One\n\nfirst\n\n## Two\n\nsecond ^para\n\n### Two-a\n\ndeeper\n\n## Three\n\n- a\n- b ^item\n\n| x |\n| - |\n| 1 |\n\n^tab\n",
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
    expect(text(await draw(g, "a.md"))).toEqual([
      "A",
      "",
      "⧉ b",
      "▎ B",
      "▎",
      "▎ ⧉ a",
      "▎ ▎ embeds itself: not drawn again",
    ]);
    expect(text(await draw(g, "self.md"))).toEqual(["S", "", "⧉ self", "▎ embeds itself: not drawn again"]);
    const deep = text(await draw(g, "d1.md"));
    expect(deep.at(-1)).toBe("▎ ▎ ▎ ▎ embedded deeper still: enter opens it");
    expect(deep.join("\n")).not.toContain("bottom");
    const refs = await draw(g, "refs.md");
    expect(refs.lines.filter((line) => line.caption)).toHaveLength(3);
    expect(refs.lines.find((line) => line.caption)?.caption?.text).toBe("pic.png");
    expect(text(refs).slice(3)).toEqual(["", "see ⧉ b here", "", "⧉ missing"]);
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
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  test("every link that reaches nothing — with where and how written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-problems-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "twin.md"), "# Twin A\n");
    writeFileSync(join(dir, "b", "twin.md"), "# Twin B\n");
    writeFileSync(
      join(dir, "index.md"),
      "# Index\n\n[missing](missing.md) and [x](gone.md).\n\n[alive](alive.md) and [ok](https://example.org)\n",
    );
    writeFileSync(join(dir, "alive.md"), "# Alive\n");
    writeFileSync(join(dir, "self.md"), "# Self\n\nSee [self](self.md), [top](#self).\n");
    const p = (await cli(["problems"], dir)).json.data;
    expect(p.broken.map((x: { line: number; column: number; target: string }) => [x.line, x.column, x.target])).toEqual(
      [
        [3, 1, "missing.md"],
        [3, 27, "gone.md"],
      ],
    );
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
    writeFileSync(
      join(dir, "a.md"),
      "# A\n\n🌍 [Bee](b.md) then ![b](b.md)\n[md](b.md) and [ref][r] ![pic](p.png) [gone](gone.md)\n\n[r]: b.md\n",
    );
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
    expect(g.problems().broken.find((p) => p.target === "gone.md")).toMatchObject({
      line: 4,
      column: 39,
      end: { line: 4, column: 54 },
    });
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
    writeFileSync(
      join(dir, "b.md"),
      "# B\n\n## Old Name ##\n\ntext ^blk\n\nsee [Old Name](#old-name) and [up](#old-name)\n",
    );
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
    expect(readFileSync(join(dir, "b.md"), "utf8")).toBe(
      "# B\n\n## New Title ##\n\ntext ^blk\n\nsee [Old Name](#new-title) and [up](#new-title)\n",
    );
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
    expect(names).toEqual([
      "§:file",
      "Auth/Redirects",
      "Auth/Big/§:part",
      "Auth/Big/§:part~2",
      "Auth/Data",
      "Auth/data~2",
      "Auth/a%2Fb%23c%25d%7Ee",
      "Auth/Fenced/§:part",
      "Auth/Fenced/§:part~2",
    ]);
    // Auth, How auth works and Cookies are each under the band: Cookies into How auth works, that into
    // Auth, Auth into the root — which is kept though it's still under.
    const root = d.sections[0]!;
    expect(root.lines.map((l) => l.text)).toEqual(
      expect.arrayContaining(["lead text", "# Auth", "### Cookies", "cookies here"]),
    );
    expect(root.tokens).toBeLessThan(400);
    // A section's range is its first and last line, merged text and all.
    expect([root.line, root.end]).toEqual([1, 17]); // Cookies' blank line after its text, its own
    // Big is over the band: cut at paragraphs, each piece in it.
    for (const piece of d.sections.filter((x) => x.name.startsWith("Auth/Big/")))
      expect(piece.tokens).toBeLessThanOrEqual(BAND_MAX);
    // A fenced block is one unit, never cut: over the band, it's a piece of its own, kept whole and said
    // so — its heading, packed first, a piece before it (scout's rule, as written).
    const fenced = d.sections.find((x) => x.name === "Auth/Fenced/§:part~2")!;
    expect(fenced.oversized).toBe(true);
    expect(fenced.lines.map((l) => l.text).filter((t) => t.startsWith("code")).length).toBe(4);
    expect(d.sections.find((x) => x.name === "Auth/Fenced/§:part")!.lines.map((l) => l.text)).toEqual(["## Fenced"]);
  });

  test("a split's last piece under the band's bottom goes onto the one before", async () => {
    const { indexDoc } = await import("../src/core/search.ts");
    const text = [
      "# Tail",
      "",
      ...Array.from({ length: 6 }, (_, i) => [para(1000, `p${i}`), ""]).flat(),
      para(200, "last"),
    ].join("\n");
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
    expect(plan.ambiguous).toEqual([
      { key: "r.md:1:5", shown: "r.md", line: 1, written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] },
    ]);
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
    expect(planConvert(g, ["a.md"]).files.map((f) => [f.shown, f.next])).toEqual([
      ["a.md", "[b](b.md) and [b](b.md)\n"],
    ]);
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
      "a.md":
        "[[b|a\\]] [[b|2*3*4]] [[b|x<y>]] [[b|`c`]] [[b|snake_case and _x_]] [[b|a & b ~ c]]\n\n| p |\n| --- |\n| ![[pic.png\\|300]] |\n\n[[e#🎉]]\n",
      "b.md": B,
      "e.md": "# E\n\n## 🎉\n",
      "pic.png": "png",
    });
    const plan = planConvert(g);
    const out = plan.files[0]!.next;
    expect(out.split("\n")[0]).toBe(
      "[a\\\\](b.md) [2\\*3\\*4](b.md) [x\\<y>](b.md) [\\`c\\`](b.md) [snake_case and \\_x\\_](b.md) [a \\& b \\~ c](b.md)",
    );
    // Read back: one link each, its text exactly the alias.
    const para = (
      parseMarkdown(out).tree.children[0] as { children: { type: string; children?: { value?: string }[] }[] }
    ).children.filter((c) => c.type === "link");
    expect(para.map((l) => (l.children ?? []).map((t) => t.value).join(""))).toEqual([
      "a\\",
      "2*3*4",
      "x<y>",
      "`c`",
      "snake_case and _x_",
      "a & b ~ c",
    ]);
    expect(out).toContain("| ![pic.png\\|300](pic.png) |"); // the table's divider kept escaped
    expect(out).toContain("[[e#🎉]]");
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      '[[e#🎉]]: the heading "🎉" has no slug to link to — left as it is',
    ]);
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
      const code = await runCli([...args, "--json"], {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: process.env,
      });
      return { code, json: JSON.parse(out.join("")) };
    };
    // A note named: its links only.
    writeFileSync(join(dir, "other.md"), "[[b]]\n");
    expect(
      (await run(["convert-links", "a.md", "--dry-run"])).json.data.files.map((f: { path: string }) => f.path),
    ).toEqual(["a.md"]);
    const dry = await run(["convert-links", "--dry-run"]);
    expect(dry.code).toBe(0);
    expect(dry.json.data).toMatchObject({
      kind: "convert",
      dryRun: true,
      files: [
        {
          path: "a.md",
          edits: [{ line: 1, before: "[[b]], [[dup]], [[nope]]", after: "[b](b.md), [[dup]], [[nope]]" }],
        },
        { path: "other.md" },
      ],
    });
    expect(dry.json.data.ambiguous).toMatchObject([{ written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] }]);
    expect(dry.json.warnings).toContain('a.md:1: [[nope]]: no note named "nope" — left as it is');
    expect(
      dry.json.warnings.some((w: string) => w.startsWith("a.md:1: [[dup]] matches 2 notes (x/dup.md, y/dup.md)")),
    ).toBe(true);
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
    const l = layoutNote(parseMarkdown(readFileSync(g.abs("host.md"), "utf8")), g, "host.md", {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    const rows = l.lines.map((r) =>
      r.spans
        .map((x) => x.text)
        .join("")
        .trimEnd(),
    );
    expect(rows.slice(0, 13)).toEqual([
      "▌ Host",
      "",
      "⧉ inner",
      "▎ ▌ Inner",
      "▎",
      "▎ First.",
      "▎",
      "▎ ▌ Second Part",
      "▎",
      "▎ Second.",
      "",
      "⧉ inner › Second Part",
      "▎ ▌ Second Part",
    ]);
    expect(rows.some((r) => r.includes("⧉ pic"))).toBe(false); // a picture stays a picture
    const far = layoutNote(parseMarkdown(readFileSync(g.abs("notes/far.md"), "utf8")), g, "notes/far.md", {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
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
    const config = [
      "[core]",
      "\tbare = false",
      '[remote "origin"]',
      "\turl = git@github.com:o/r.git",
      "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      "# a comment",
      '[branch "main"]',
      "\turl = not-a-remote",
      '[remote "up"]',
      '\turl = "https://github.com/o/r"',
      "\turl = https://gitlab.com/o/r",
    ].join("\n");
    expect(remotesIn(config, "/r")).toEqual(["github.com/o/r", "gitlab.com/o/r"]);
  });

  test("a remote URL that doesn't parse names nothing: skipped, the repository's other remotes still read", async () => {
    const { normalizeRemote, remotesIn } = await import("../src/core/remotes.ts");
    expect(normalizeRemote("https://", "/r")).toBeNull();
    expect(normalizeRemote("http://[::1/x", "/r")).toBeNull();
    expect(
      remotesIn('[remote "broken"]\n\turl = https://\n[remote "origin"]\n\turl = git@github.com:o/r.git\n', "/r"),
    ).toEqual(["github.com/o/r"]);
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
    const { rootLabel } = await import("../src/core/workspace/vaults/names.ts");
    const { homeFolder } = await import("../src/core/workspace/vaults/vault.ts");
    expect(rootLabel({ mode: "vault", name: "research", root: "/x/research", worktree: null })).toBe("research");
    expect(
      rootLabel({ mode: "vault", name: null, root: join(homeFolder(), "src", "experiment"), worktree: null }),
    ).toBe("~/src/experiment");
    expect(rootLabel({ mode: "home", name: null, root: homeFolder(), worktree: null })).toBe("~");
    // Outside home and every vault: Elsewhere, wherever it's opened (VV-D3).
    expect(rootLabel({ mode: "folder", name: null, root: "/srv/scratch", worktree: null })).toBe("Elsewhere");
  });

  test("Elsewhere isn't in the machine's list; given .slipbox/, the vault's entry; an old folder's, gone a month, forgotten", async () => {
    const { pruneWorktrees, readRoots, recordRoot, rootsFile } = await import(
      "../src/core/workspace/vaults/registry.ts"
    );
    const dir = fresh("plainf");
    writeFileSync(join(dir, "n.md"), "# N\n");
    await cli(["ls"], dir);
    expect(readRoots().filter((v) => v.path === dir)).toEqual([]);
    await cli(["init", dir], dir);
    expect(
      readRoots()
        .filter((v) => v.path === dir)
        .map((v) => v.kind),
    ).toEqual(["vault"]);
    // A folder an older slipbox listed, gone a month, is dropped; one gone a day is kept.
    const gone = fresh("plaingone");
    recordRoot({ kind: "folder", path: gone });
    // Its own cache (index, search) and state (session): kept a day, removed with it after the month.
    const { cacheHome, stateHome } = await import("../src/core/foundation/platform/paths.ts");
    const own = [join(cacheHome(), vaultKey(gone)), join(stateHome(), vaultKey(gone))];
    for (const d of own) mkdirSync(d, { recursive: true });
    rmSync(gone, { recursive: true });
    pruneWorktrees(Date.now() + 86_400_000);
    expect(readRoots().some((v) => v.path === gone)).toBe(true);
    expect(own.map((d) => existsSync(d))).toEqual([true, true]);
    pruneWorktrees(Date.now() + 31 * 86_400_000);
    expect(readRoots().some((v) => v.path === gone)).toBe(false);
    expect(own.map((d) => existsSync(d))).toEqual([false, false]);
    expect(existsSync(rootsFile())).toBe(true);
  });
});

describe("settings, deeper over broader (20.7)", () => {
  test("a vault inside another: its own settings, then the outer one's, then yours; a program named in a vault's never runs", async () => {
    const { configFilesFor } = await import("../src/core/workspace/vaults/vault.ts");
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
    expect(configFilesFor(locateVault({ path: repo }))).toEqual({
      vaultFile: join(repo, ".slipbox", "config.toml"),
      outerFiles: [outerCfg, innerCfg],
    });
    expect(
      loadConfig({ ...configFilesFor(locateVault({ path: repo })), configFile: user }).config.ui.readable_max,
    ).toBe(70);
    // The outer vault itself: its own, nothing above. A loose file: the home vault's.
    expect(configFilesFor(locateVault({ path: outer })).outerFiles).toEqual([]);
    // slipbox info says which files, in that order.
    const out: string[] = [];
    await runCli(["info", "--json", "--config", user], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: inner,
      env: process.env,
    });
    expect(JSON.parse(out.join("")).data.config.sources).toEqual([user, outerCfg, innerCfg]);
  });
});

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
    return runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
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
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const { cacheDir } = await import("../src/core/foundation/platform/paths.ts");
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
    const { readFolders } = await import("../src/core/workspace/vaults/folders.ts");
    const named = readFolders().filter((f) => f.copies.some((c) => c.path.startsWith(`${home}/`)));
    // (notes/inner's .slipbox/ has no name, and none is written into it: unnamed, 21.8.)
    expect(named.map((f) => [f.name, f.copies.map((c) => [c.path.slice(home.length + 1), c.found])]).sort()).toEqual([
      [`anotes-${basename(home)}`, [["notes", true]]],
    ]);
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
    await runCli(["backlinks", "target.md", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: join(home, "notes"),
      env: process.env,
    });
    expect(JSON.parse(out.join("")).data.backlinks.map((b: { from: string }) => b.from)).toContain(
      join(home, "proj", "a.md"),
    );
  });

  test("its place is kept: a new run resumes the pass; a day after one is done, the next starts; opened, a vault is no longer only found", async () => {
    const { AutoIndex, REPASS_MS } = await import("../src/core/autoindex.ts");
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const home = makeHome();
    const file = join(home, "..", `${basename(home)}-progress.json`);
    const first = new AutoIndex(home, file);
    // Home first, then the vaults it found, one at a time: stopped with some left.
    while (!first.status.home) first.step(0);
    first.step(0);
    const left = [...first.status.queue];
    expect(left.length).toBeGreaterThan(0);
    const again = new AutoIndex(home, file);
    expect(again.status.queue).toEqual(left);
    expect(again.status.home).toBe(true);
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
        await runCli([...args, "--json"], {
          out: (x: string) => out.push(x),
          err: () => {},
          stdin: async () => "",
          isTTY: false,
          columns: 80,
          cwd: join(home, "loose"),
          env: process.env,
        });
        return JSON.parse(out.join("")).data;
      };
      const r = await run(["index", "--home"]);
      expect(r).toMatchObject({ root: home, found: 4, indexed: 4, left: 0, home: { indexed: true, notes: 1 } });
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

describe("home, a vault without a marker (VV-D2)", () => {
  /**
   * A watcher over home as the TUI starts one over its graph `g` (its folders, `leftToWalk`), and a look: a tick, its
   * batch and the events' settled — what they reported (by path, or `kind path` with `kinds`), the folders they named
   * for the walk, whether they asked for a rescan.
   */
  const watchHome = async (
    home: string,
    g: Graph,
    opts: { known?: Map<string, number>; sizes?: Map<string, number>; maxDirs?: number; kinds?: boolean } = {},
  ) => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const reported: string[] = [];
    const toWalk: string[] = [];
    let rescan = false;
    /** The watcher's clock, set ahead to make what was just done look long ago. */
    const clock = { ahead: 0 };
    const w = new VaultWatcher({
      root: home,
      filter: g.filter,
      dirs: g.dirs,
      debounceMs: 20,
      pollMs: 1_000_000,
      known: opts.known ?? new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number])),
      ...(opts.sizes ? { sizes: opts.sizes } : {}),
      ...(opts.maxDirs === undefined ? {} : { maxDirs: opts.maxDirs }),
      attachments: g.filePaths(),
      walkedAt: () => g.walkedAt,
      leftToWalk: (rel) => g.waitsForHomeWalk(rel),
      walkPending: () => g.home?.walked === null,
      now: () => Date.now() + clock.ahead,
      onBatch: (b) => {
        reported.push(...b.changes.map((c) => (opts.kinds ? `${c.kind} ${c.rel}` : c.rel)));
        toWalk.push(...(b.toWalk ?? []));
        rescan ||= b.rescan;
      },
      onDegraded: () => {},
    });
    const look = async () => {
      await Bun.sleep(30);
      w.pollTick();
      w.flush();
      await Bun.sleep(30);
      w.flush();
      const out = { reported: [...new Set(reported.splice(0))].sort(), toWalk: [...new Set(toWalk.splice(0))], rescan };
      rescan = false;
      return out;
    };
    return { w, look, reported, clock };
  };
  const none = { reported: [], toWalk: [], rescan: false };
  /** A home folder of its own: `files` in it, `$HOME` while `f` runs. */
  const withHome = async <T>(files: Record<string, string>, f: (home: string) => T | Promise<T>): Promise<T> => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-")));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      return await f(home);
    } finally {
      process.env.HOME = before;
    }
  };
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
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

  test("its skip list: hidden folders, the system's, Downloads, the busy folders, and what isn't a note or a text file; large notes listed, not read; no .gitignore", async () => {
    const { homeSkip, isBusyName, SlicedWalk, WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const busy = ["node_modules", ".venv", "venv", "__pycache__", "target", "build", "dist", ".next", "vendor"];
    const busier = ["Pods", "DerivedData", ".gradle", ".tox", "cache", "Caches", ".cache", "pip-cache"];
    const files: Record<string, string> = {
      "a.md": "# A\n",
      "docs/b.md": "# B\n",
      "docs/plan.json": "{}\n",
      "docs/script.py": "print(1)\n",
      "docs/photo.png": "png",
      "docs/archive.zip": "zip",
      "docs/big.md": `# Big\n\n${"x".repeat(300)}\n`,
      ".config/c.md": "# C\n",
      ".local/share/s.md": "# S\n",
      "Downloads/d.md": "# D\n",
      "Library/l.md": "# L\n",
      "AppData/x.md": "# X\n",
      "work/.gitignore": "*\n",
      "work/w.md": "# W\n",
      "work/sub/Downloads/kept.md": "# a Downloads below the top is a folder like any\n",
      "repo/.git/HEAD": "ref: refs/heads/main\n",
      "repo/r.md": "# R\n",
      // A busy name with a note at its top is a folder like any (D237); home reads no .gitignore to say otherwise.
      "notes/build/plan.md": "# Plan\n",
    };
    for (const b of [...busy, ...busier]) files[`work/${b}/pkg/n.md`] = "# busy\n";
    await withHome(files, (home) => {
      const config = structuredClone(DEFAULT_CONFIG);
      config.walk.max_file_size = 200;
      const walk = (platform: string) => {
        const w = new SlicedWalk(home, new WalkFilter(home, config.walk, { home: true, platform }));
        while (w.step(50)) {}
        return w.result!;
      };
      const mac = walk("darwin");
      expect(mac.files.map((f) => f.rel)).toEqual([
        "AppData/x.md",
        "a.md",
        "docs/b.md",
        "notes/build/plan.md",
        "work/sub/Downloads/kept.md",
        "work/w.md",
      ]);
      // Text files are home's files; a picture, an archive aren't.
      expect(mac.assets.sort()).toEqual(["docs/plan.json", "docs/script.py"]);
      // A large note: listed, not read. A vault: a boundary, its own.
      expect(mac.skipped).toContainEqual({ rel: "docs/big.md", reason: expect.stringMatching(/^larger than/) });
      expect(mac.skipped).toContainEqual({ rel: "repo", reason: "nested vault" });
      expect(mac.dirs).not.toContain("Library");
      expect(walk("win32").files.map((f) => f.rel)).toEqual([
        "Library/l.md",
        "a.md",
        "docs/b.md",
        "notes/build/plan.md",
        "work/sub/Downloads/kept.md",
        "work/w.md",
      ]);
      // Each folder's reason, for the explorer's marks to say.
      expect(homeSkip(".config")).toBe("hidden");
      expect(homeSkip("Downloads")).toBe("Downloads");
      expect(homeSkip("Library", { platform: "darwin" })).toBe("system folder");
      expect(homeSkip("work/Library", { platform: "darwin" })).toBeNull();
      expect(homeSkip("x/dist")).toBeNull(); // the filter's, which looks into it
      const filter = new WalkFilter(home, config.walk, { home: true });
      expect(filter.exclusion("work/dist", true)).toBe("busy folder");
      expect(filter.exclusion("notes/build", true)).toBeNull();
      for (const b of [...busy, ...busier]) expect(isBusyName(b)).toBe(true);
      for (const b of ["notes", "docs", "src", "cached-notes", "Builds"]) expect(isBusyName(b)).toBe(false);
      // Named, a file the skip list leaves out is opened, and nothing more: never indexed.
      const g = openGraph(homeAt(home), config, true);
      for (const rel of [".config/c.md", "Downloads/d.md", "work/node_modules/pkg/n.md", "docs/photo.png"])
        expect(g.reachFile(rel, { keep: true })).toBe(false);
      expect(g.reachFile("docs/big.md")).toBe(false);
    });
  });

  test("its Downloads is where the desktop keeps it (user-dirs.dirs)", async () => {
    const { SlicedWalk, WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const files = { "Téléchargements/t.md": "# T\n", "Downloads/d.md": "# D\n" };
    await withHome(files, (home) => {
      const config = join(home, "..", `${basename(home)}-config`);
      mkdirSync(config, { recursive: true });
      writeFileSync(join(config, "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/Téléchargements"\n');
      const before = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = config;
      try {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }));
        while (w.step(50)) {}
        expect(w.result!.files.map((f) => f.rel)).toEqual(["Downloads/d.md"]);
      } finally {
        process.env.XDG_CONFIG_HOME = before;
      }
    });
  });

  test("a vault inside home stays its own: a boundary of home's walk, its notes never home's — nor its backlinks", async () => {
    const { Reach } = await import("../src/core/reach.ts");
    const { walkHomeNow } = await import("../src/core/workspace/vaults/home.ts");
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-other-")));
    await withHome(
      {
        "todo.md": "# Todo\n",
        "journal/day.md": "[todo](../todo.md) and [r](../repo/r.md)\n",
        "repo/.git/HEAD": "ref: refs/heads/main\n",
        "repo/r.md": "[todo](../todo.md)\n",
      },
      (home) => {
        mkdirSync(join(elsewhere, ".slipbox"));
        writeFileSync(join(elsewhere, "x.md"), `[t](${home}/todo.md) [r](${home}/repo/r.md)\n`);
        const ox = rootAt(elsewhere);
        recordLocation(ox);
        openGraph(ox, DEFAULT_CONFIG, true).ensureAll();
        const loc = locateVault({ path: join(home, "todo.md") });
        walkHomeNow(loc, DEFAULT_CONFIG);
        const g = openGraph(loc, DEFAULT_CONFIG, true);
        expect([...g.notes.keys()].sort()).toEqual(["journal/day.md", "todo.md"]);
        expect(g.nestedRoots()).toEqual(["repo"]);
        expect(locateVault({ path: join(home, "repo", "r.md") })).toMatchObject({
          mode: "vault",
          root: join(home, "repo"),
        });
        g.reach = new Reach(loc);
        // The other vault's link to a note of home: a backlink; to a note of the vault inside it: that vault's, not home's.
        const inbound = g.reach.inbound(g);
        expect([...inbound.keys()]).toEqual(["todo.md"]);
        expect(
          g
            .backlinks("todo.md")
            .map((b) => b.from)
            .sort(),
        ).toEqual([join(elsewhere, "x.md"), "journal/day.md"]);
      },
    );
  });

  test("built in slices while nobody is working: its walk, then its index; the cap said when it's reached", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    const { SlicedWalk, WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const files: Record<string, string> = { "a.md": "# A\n" };
    for (let i = 0; i < 6; i++) files[`f${i}/n${i}.md`] = `[a](../a.md)\n`;
    files["repo/.git/HEAD"] = "ref: refs/heads/main\n";
    files["repo/r.md"] = "# R\n";
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const told: (string | null)[] = [];
      // The TUI's, the background index off: home's own walk and index, the vaults in it left alone.
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, onHome: (c) => told.push(c) });
      expect(job.step(0)).toBe(true); // a folder at a time: one slice is far from done
      expect(homeWalkKept(loc)).toBe(false);
      let slices = 1;
      while (job.step(0)) slices++;
      expect(slices).toBeGreaterThan(3);
      expect(told).toEqual([null]);
      expect(job.status).toMatchObject({ home: true, homeNotes: 7, found: 0, indexed: 0 });
      expect(homeWalkKept(loc)).toBe(true);
      expect(job.idle).toBe(true);
      // Its index written: the graph opened from the walk kept has the backlinks, parsed already.
      const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
      expect(g.pendingCount).toBe(0);
      expect(g.backlinks("a.md").length).toBe(6);
      // Walked again when asked (a folder came): told again.
      writeFileSync(join(home, "f0", "new.md"), "[a](../a.md)\n");
      job.homeAgain();
      while (job.step(50)) {}
      expect(told).toEqual([null, null]);
      expect(openGraph(loc, DEFAULT_CONFIG, true).backlinks("a.md").length).toBe(7);
      // The cap: so many notes, so many folders at most — the nearest the top kept — and said.
      const capped = (limits: { notes: number; folders: number }) => {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }), limits);
        while (w.step(50)) {}
        return { files: w.result!.files.map((f) => f.rel), dirs: w.result!.dirs, capped: w.capped };
      };
      expect(capped({ notes: 3, folders: 100 })).toMatchObject({
        files: ["a.md", "f0/n0.md", "f0/new.md"],
        capped: "notes",
      });
      expect(capped({ notes: 100, folders: 2 })).toMatchObject({
        files: ["a.md", "f0/n0.md", "f0/new.md"],
        dirs: ["", "f0"],
        capped: "folders",
      });
      expect(capped({ notes: 100, folders: 100 }).capped).toBeNull();
    });
  });

  test("past home's cap, the background index still finds the vaults in the folders it left, its skip list held", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const files = {
      "a/n.md": "# N\n",
      "b/c/repo/.git/HEAD": "ref: refs/heads/main\n",
      "b/c/repo/r.md": "# R\n",
      "b/node_modules/dep/.git/HEAD": "ref: refs/heads/main\n",
      "b/.hidden/h/.git/HEAD": "ref: refs/heads/main\n",
    };
    await withHome(files, async (home) => {
      const file = join(home, "..", `${basename(home)}-progress.json`);
      const ai = new AutoIndex(home, file, () => Date.now(), { limits: { notes: 100, folders: 2 } });
      while (ai.step(50)) {}
      expect(ai.status).toMatchObject({ home: true, capped: "folders", homeNotes: 1, found: 1, indexed: 1 });
      const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
      expect(readRoots().some((v) => v.path === join(home, "b", "c", "repo") && v.found)).toBe(true);
    });
  });

  test("its notes are backlinks of a vault's, found by the background index; a vault's notes are home's", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    await withHome(
      {
        "plan.md": "[target](notes/target.md)\n",
        "notes/.slipbox/config.toml": "",
        "notes/target.md": "[plan](../plan.md)\n",
      },
      async (home) => {
        const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
        while (ai.step(50)) {}
        expect(ai.status).toMatchObject({ home: true, homeNotes: 1, found: 1, indexed: 1 });
        const into = await cli(["backlinks", "target.md"], join(home, "notes"));
        expect(into.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual([join(home, "plan.md")]);
        const out = await cli(["backlinks", "plan.md"], home);
        expect(out.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual([
          join(home, "notes", "target.md"),
        ]);
      },
    );
  });

  test("its walk kept is brought up to now: a note come since, a folder become a vault, a vault become home's again", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    const files = {
      "a.md": "# A\n",
      "keep/k.md": "# K\n",
      "proj/p.md": "[a](../a.md)\n",
      "was/.slipbox/config.toml": "",
      "was/w.md": "[a](../a.md)\n",
    };
    await withHome(files, (home) => {
      const loc = homeAt(home);
      // Its folders' times an hour back: unchanged since the walk, none is listed again.
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj", "was"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      markKept(file);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      expect(unwritten(file)).toBe(true); // nothing changed: the walk kept as it was
      // Home's time moved on, nothing in it changed (a shell's history written over): listed again, not kept again.
      utimesSync(home, new Date(), new Date());
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      expect(unwritten(file)).toBe(true);
      restamp(file, home, ""); // the top seen as it is: what follows is found in the folders it's in
      // Since: a note in a folder, a repository made of another, a .slipbox/ taken away.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      mkdirSync(join(home, "proj", ".git"));
      rmSync(join(home, "was", ".slipbox"), { recursive: true });
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "was/w.md"]);
      const g = openGraph(loc, DEFAULT_CONFIG, true);
      expect(g.nestedRoots()).toEqual(["proj"]);
      expect(g.backlinks("a.md").map((b) => b.from)).toEqual(["was/w.md"]);
      expect(unwritten(file)).toBe(false); // kept so, for the next
    });
  });

  test("its walk kept lists again a folder whose time differs from the walk's, set back too: cp -a, rsync -a, a clock behind (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n", "w/w.md": "# W\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj", "w"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "w/w.md"]);
      // A note come, its folder's time then set back to before the walk, as `rsync -a` or `cp -a` leave it.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/p.md", "w/w.md"]);
      // Kept so: the folder's stamp its time now, the others' as they were.
      expect(keptStamps(homeWalkFile(loc))).toMatchObject({
        "": hour.getTime(),
        keep: twoHours.getTime(),
        w: hour.getTime(),
      });
      // A disk whose clock is behind: the folder's time moved, but to before the walk.
      writeFileSync(join(home, "proj", "late.md"), "# Late\n");
      const behind = new Date(Date.now() - 30_000);
      utimesSync(join(home, "proj"), behind, behind);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      // A time set back, nothing in its folder changed: kept again all the same, with its new stamp, so that it isn't
      // listed again at every build. Set back from the walk's time, after its stamp (`cp -a` from a backup made since) …
      const halfHour = new Date(Date.now() - 1_800_000);
      utimesSync(join(home, "w"), halfHour, halfHour);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      expect(keptStamps(homeWalkFile(loc)).w).toBe(halfHour.getTime());
      // … or before its stamp.
      utimesSync(join(home, "w"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      expect(keptStamps(homeWalkFile(loc)).w).toBe(twoHours.getTime());
      // Not listed again at the next build: a note taken out of the walk kept stays out.
      const file = homeWalkFile(loc);
      const before = readFileSync(file, "utf8");
      const kept = JSON.parse(before);
      writeFileSync(file, JSON.stringify({ ...kept, notes: kept.notes.filter((n: string) => n !== "w/w.md") }));
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md"]);
      writeFileSync(file, before);
      // A note come, its folder's time put back to exactly its stamp: listed again all the same, its ctime moved.
      writeFileSync(join(home, "w", "put.md"), "# Put\n");
      utimesSync(join(home, "w"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/put.md", "w/w.md"]);
      // Made a vault, its time set back as if nothing had come: it leaves home all the same.
      mkdirSync(join(home, "proj", ".git"));
      utimesSync(join(home, "proj"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "w/put.md", "w/w.md"]);
      expect(openGraph(loc, DEFAULT_CONFIG, true).nestedRoots()).toEqual(["proj"]);
    });
  });

  test("a folder of home walked within two seconds of its change is listed again: a change its time can't tell apart is found (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "notes/a.md": "# A\n" }, (home) => {
      const loc = homeAt(home);
      const notes = join(home, "notes");
      utimesSync(home, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
      // Changed just before the walk: a coarse clock can give the next change the very same time. The clock held
      // still for the walk, so a slow run can't take it past the two seconds.
      const now = Date.now();
      const was = new Date(now - 100);
      utimesSync(notes, was, was);
      setSystemTime(new Date(now));
      try {
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        setSystemTime();
      }
      expect(keptStamps(homeWalkFile(loc)).notes).toBe(-1);
      // A note come, the folder's time put back to the same: found (its ctime moved too, here; the -1 above is the
      // rule a file system with coarse times needs).
      writeFileSync(join(notes, "b.md"), "# B\n");
      utimesSync(notes, was, was);
      expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort()).toEqual(["notes/a.md", "notes/b.md"]);
    });
  });

  test("a folder of home whose time is still its stamp isn't listed again, wherever walk.json has it (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      // Each folder a time of its own, so a stamp given to the wrong folder would tell.
      const at = (min: number) => new Date(Date.now() - 3_600_000 - min * 60_000);
      const times = { "": at(0), keep: at(1), proj: at(2) };
      for (const [d, t] of Object.entries(times)) utimesSync(join(home, d), t, t);
      walkHomeNow(loc, DEFAULT_CONFIG);
      // Its folders and their stamps in another order, and its notes taken out: each stamp stays with its folder, so
      // none is listed again — one that was would bring its note back.
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      kept.dirs.push(kept.dirs.shift());
      kept.times.push(kept.times.shift());
      kept.notes = [];
      writeFileSync(file, JSON.stringify(kept));
      expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()]).toEqual([]);
    });
  });

  test("a walk kept without its folders' times (an earlier version's) is brought up to now as before, none taken as seen until it's listed (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const rewrite = (times: unknown) => {
        const kept = JSON.parse(readFileSync(file, "utf8"));
        if (times === undefined) delete kept.times;
        else kept.times = times;
        writeFileSync(file, JSON.stringify(kept));
      };
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      rewrite(undefined);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      // A folder's time set back: not told from no change, as before — newer than the walk is what it goes by.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      // Another folder changed, so the walk is kept again: the one not listed isn't stamped as seen.
      writeFileSync(join(home, "proj", "q.md"), "# Q\n");
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "proj/q.md"]);
      // `proj`, listed, is stamped (-1 if within two seconds of its change); `keep` stays unknown.
      const stamps = keptStamps(file);
      expect(stamps.keep).toBeNull();
      expect(typeof stamps.proj).toBe("number");
      // Times that don't match its folders say nothing: none known.
      rewrite([
        [1, 1],
        [2, 2],
      ]);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "proj/q.md"]);
      // Home walked again: every folder stamped, the note found.
      walkHomeNow(loc, DEFAULT_CONFIG);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/p.md", "proj/q.md"]);
      expect(Object.values(keptStamps(file)).every((t) => typeof t === "number")).toBe(true);
    });
  });

  test("a folder's stamp: its mtime and ctime; to list again when either is too recent to tell a later change apart — its ctime only in whole seconds, a coarse clock's (#12)", async () => {
    const { RELIST, stampOf } = await import("../src/core/workspace/walk/walk.ts");
    const now = 1_800_000_000_000;
    const old = now - 3_600_000;
    expect(stampOf(old, old + 0.25, now)).toEqual([old, old + 0.25]);
    expect(stampOf(now - 100, old + 0.25, now)).toEqual(RELIST); // its mtime just now
    expect(stampOf(old, now - 999.75, now)).toEqual([old, now - 999.75]); // a fine ctime just now: a change moves it
    expect(stampOf(old, now - 1000, now)).toEqual(RELIST); // a coarse one just now: a change in its second might not
    expect(stampOf(old, now - 3000, now)).toEqual([old, now - 3000]); // a coarse one long enough ago
  });

  test("a folder listed again for its stamp alone is kept with its new stamp; one whose time moved on past the walk isn't (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "v/v.md": "# V\n", "w/w.md": "# W\n" }, (home) => {
      const loc = homeAt(home);
      const twoHours = new Date(Date.now() - 7_200_000);
      for (const d of ["", "v", "w"]) utimesSync(join(home, d), twoHours, twoHours);
      walkHomeNow(loc, DEFAULT_CONFIG);
      // As a walk made in slices leaves it: begun three hours back, its folders listed two hours back.
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...kept, walked: new Date(Date.now() - 3 * 3_600_000).toISOString() }));
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      // w's time moved on past the walk's start, nothing new in it (a shell's history written over): listed again at
      // each build, as "newer than the walk" listed it, the walk not kept again for it.
      const recent = new Date(Date.now() - 30_000);
      utimesSync(join(home, "w"), recent, recent);
      markKept(file);
      expect(notes()).toEqual(["a.md", "v/v.md", "w/w.md"]);
      expect(unwritten(file)).toBe(true);
      // v set back to before its stamp, still after the walk's start (`cp -a`): kept again, with its new stamp.
      const between = new Date(Date.now() - 2.5 * 3_600_000);
      utimesSync(join(home, "v"), between, between);
      expect(notes()).toEqual(["a.md", "v/v.md", "w/w.md"]);
      expect(keptStamps(file).v).toBe(between.getTime());
    });
  });

  test("a folder of home that can't be read is listed again at each build, the walk not kept again for it; readable, its notes come back (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "p/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "p"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // Its ctime moved by the chmod: listed again, and it can't be read — to list again, its notes out meanwhile.
        chmodSync(p, 0o000);
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).p).toBe(-1);
        // Listed again, still unreadable: nothing new to keep, the walk not written again.
        markKept(file);
        expect(notes()).toEqual(["a.md"]);
        expect(unwritten(file)).toBe(true);
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["a.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
      }
    });
  });

  test("a folder of home that can't be read when home is walked is tried again at each build; readable, its notes are found (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "p/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "p"]) utimesSync(join(home, d), hour, hour);
      try {
        chmodSync(p, 0o000);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // p isn't in the walk: the folder holding it, home's top, is stamped to list again, so p is tried again.
        const file = homeWalkFile(loc);
        expect(keptStamps(file)).toEqual({ "": -1 });
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        markKept(file);
        expect(notes()).toEqual(["a.md"]);
        expect(unwritten(file)).toBe(true); // tried again, still unreadable: the walk not written again
        // Readable: a chmod moves p's ctime alone, which the walk doesn't hold — found all the same.
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["a.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
      }
    });
  });

  test("a vault of home that's home's again, unreadable then, is tried again at each build; readable, its notes are found (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "proj/.git/HEAD": "ref: refs/heads/main\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      const proj = join(home, "proj");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md"]); // proj a vault of its own
      try {
        // Its marker gone, and it can't be read (searched, not listed: its marker's absence still seen).
        rmSync(join(proj, ".git"), { recursive: true });
        chmodSync(proj, 0o311);
        expect(notes()).toEqual(["a.md"]);
        // Not in the walk: home's top, which holds it, to list again, so it's tried again.
        expect(keptStamps(homeWalkFile(loc))[""]).toBe(-1);
        chmodSync(proj, 0o755);
        expect(notes()).toEqual(["a.md", "proj/p.md"]);
      } finally {
        chmodSync(proj, 0o755);
      }
    });
  });

  test("a folder listed again whose folder can't be read keeps its own stamp: only the one in it is to list again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n", "a/b/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/b"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const ab = join(home, "a", "b");
      try {
        // A note in a, its time then set back, and a/b made unreadable: both listed again.
        writeFileSync(join(home, "a", "x.md"), "# X\n");
        const back = new Date(Date.now() - 7_200_000);
        utimesSync(join(home, "a"), back, back);
        chmodSync(ab, 0o000);
        expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort()).toEqual(["a/n.md", "a/x.md"]);
        // a/b is to list again itself; a, which was read, keeps the stamp it was read with.
        const stamps = keptStamps(homeWalkFile(loc));
        expect(stamps["a/b"]).toBe(-1);
        expect(stamps.a).toBe(back.getTime());
      } finally {
        chmodSync(ab, 0o755);
      }
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's to the command line: walked again at its next command (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, async (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      const file = homeWalkFile(loc);
      expect(JSON.parse(readFileSync(file, "utf8")).dirs).toEqual([]);
      expect(homeWalkKept(loc)).toBe(false);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      expect((await cli(["ls"], home)).code).toBe(0);
      expect(JSON.parse(readFileSync(file, "utf8")).notes).toEqual(["a.md", "keep/k.md"]);
    });
  });

  test("a folder of home that can't be looked at any more is tried again from the folder holding it, not dropped for good (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n", "a/b/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const a = join(home, "a");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/b"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // a readable, not searched: a/b can't be statted, as a permission, a policy or a disk's error can have it. The
        // walk kept as if it had seen a so: a/b alone is lost, and a, which holds it, is to list again.
        chmodSync(a, 0o600);
        restamp(file, home, "a");
        expect(notes()).toEqual([]);
        expect(keptStamps(file).a).toBe(-1);
        chmodSync(a, 0o755);
        expect(notes()).toEqual(["a/b/m.md", "a/n.md"]);
      } finally {
        chmodSync(a, 0o755);
      }
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's for a plan across it either: walked again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow } = await import("../src/core/workspace/vaults/home.ts");
    const { openVault } = await import("../src/core/reach.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      expect([...openVault(home).notes.keys()].sort()).toEqual(["a.md", "keep/k.md"]);
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's to the TUI either: home's top shown, its walk made again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      // Readable again: home's top alone, as for a walk under other settings, home not walked yet.
      const h = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG));
      expect(h.walked).toBeNull();
      expect(h.walk.files.map((f) => f.rel)).toEqual(["a.md"]);
    });
  });

  test("a vault of home through a link the walk follows, its target away for a while (a disk taken away), is found again when it's back (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        mkdirSync(join(disk, "proj", ".git"), { recursive: true });
        writeFileSync(join(disk, "proj", "p.md"), "# P\n");
        const lnk = join(home, "lnk");
        symlinkSync(join(disk, "proj"), lnk);
        setLinkAnswer(lnk, "follow");
        expect(await probe(join(disk, "proj"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        expect(JSON.parse(readFileSync(file, "utf8")).skipped).toContainEqual({ rel: "lnk", reason: "nested vault" });
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        // The disk taken away: the link there, what it leads to not. Home's top, holding it, to list again, build after
        // build, the link looked at again each time.
        renameSync(join(disk, "proj"), join(disk, "proj-away"));
        expect(notes()).toEqual(["a.md"]);
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        // Back, its marker gone meanwhile: home's again, its note found.
        renameSync(join(disk, "proj-away"), join(disk, "proj"));
        rmSync(join(disk, "proj", ".git"), { recursive: true });
        expect(await probe(join(disk, "proj"))).toBe(true);
        expect(notes()).toEqual(["a.md", "lnk/p.md"]);
      } finally {
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a folder of home through a link the walk follows, its target not to be looked at when home's top is listed again, is found again once it can be (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        mkdirSync(join(disk, "notes"));
        writeFileSync(join(disk, "notes", "n.md"), "# N\n");
        symlinkSync(join(disk, "notes"), join(home, "shelf"));
        setLinkAnswer(join(home, "shelf"), "follow");
        expect(await probe(join(disk, "notes"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        expect(notes()).toEqual(["a.md", "shelf/n.md"]);
        // The disk not searched; a note in home's top, its time then set back, so home's top is listed again while
        // what shelf leads to can't be looked at. Home's top to list again, build after build.
        chmodSync(disk, 0o600);
        writeFileSync(join(home, "b.md"), "# B\n");
        const twoHours = new Date(Date.now() - 7_200_000);
        utimesSync(home, twoHours, twoHours);
        expect(notes()).toEqual(["a.md", "b.md"]);
        expect(notes()).toEqual(["a.md", "b.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        // Searched again: shelf walked again, its note back.
        chmodSync(disk, 0o755);
        expect(await probe(join(disk, "notes"))).toBe(true);
        expect(notes()).toEqual(["a.md", "b.md", "shelf/n.md"]);
      } finally {
        chmodSync(disk, 0o755);
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a note of home through a link the walk follows, its target away for a while, has its folder listed again till it's back (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        writeFileSync(join(disk, "far.md"), "# Far\n");
        symlinkSync(join(disk, "far.md"), join(home, "far.md"));
        setLinkAnswer(join(home, "far.md"), "follow");
        expect(await probe(join(disk, "far.md"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        expect(notes()).toEqual(["a.md", "far.md"]);
        // What far.md leads to taken away, home's top unchanged: home's top to list again all the same.
        renameSync(join(disk, "far.md"), join(disk, "far-away.md"));
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        renameSync(join(disk, "far-away.md"), join(disk, "far.md"));
        expect(notes()).toEqual(["a.md", "far.md"]);
      } finally {
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a vault home's again that home's cap left unreached isn't taken as unreadable: its folder not to list again for it (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    await withHome(
      { "a.md": "# A\n", "big/b0.md": "# B\n", "proj/.git/HEAD": "ref: refs/heads/main\n", "proj/p.md": "# P\n" },
      (home) => {
        const loc = homeAt(home);
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "big", "proj"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // big gets ten notes, listed again; proj's marker goes, home's again — after big, past a cap of five notes.
        for (let i = 1; i <= 10; i++) writeFileSync(join(home, "big", `n${i}.md`), "# N\n");
        rmSync(join(home, "proj", ".git"), { recursive: true });
        expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], { notes: 5, folders: 100 }).capped).toBe("notes");
        // proj wasn't reached, not unreadable: home's top keeps its stamp.
        expect(keptStamps(homeWalkFile(loc))[""]).toBe(hour.getTime());
      },
    );
  });

  test("a note of home that can't be looked at any more has its folder tried again, not dropped for good (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "n/one.md": "# One\n", "n/two.md": "# Two\n" }, (home) => {
      const loc = homeAt(home);
      const n = join(home, "n");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "n"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // n readable, not searched: its notes can't be statted, as a permission, a policy or a disk's error can have
        // it. The walk kept as if it had seen n so: its notes lost, n to list again.
        chmodSync(n, 0o600);
        restamp(file, home, "n");
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).n).toBe(-1);
        // Listed again, its notes still not to be looked at: still to list again, not stamped as seen.
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).n).toBe(-1);
        chmodSync(n, 0o755);
        expect(notes()).toEqual(["a.md", "n/one.md", "n/two.md"]);
      } finally {
        chmodSync(n, 0o755);
      }
    });
  });

  test("the command line walks home again, once, when its walk kept is an earlier version's, without folders' stamps (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, async (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      delete kept.times;
      writeFileSync(file, JSON.stringify(kept));
      // A note come, its folder's time set back: a walk without stamps can't tell.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      // Another folder changed (the TUI building home, say), so it's kept again: a stamp for that one, not for all.
      writeFileSync(join(home, "proj", "q.md"), "# Q\n");
      openGraph(loc, DEFAULT_CONFIG, true);
      expect(keptStamps(file).keep).toBeNull();
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      // The next command walks home again, as the first one did: the note found, every folder stamped.
      expect((await cli(["ls"], home)).code).toBe(0);
      expect(JSON.parse(readFileSync(file, "utf8")).notes).toContain("keep/new.md");
      expect(Object.values(keptStamps(file)).every((t) => typeof t === "number")).toBe(true);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(true);
    });
  });

  test("a plan across home (openVault, the TUI's too) goes by its walk kept, an earlier version's as well: never walks home for want of its stamps (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    const { openVault } = await import("../src/core/reach.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify(kept));
      expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(true);
      expect([...openVault(home).notes.keys()].sort()).toEqual(["a.md", "keep/k.md"]);
      expect(JSON.parse(readFileSync(file, "utf8")).times).toBeUndefined();
    });
  });

  test("a folder of home made a vault, and back: a name across the new edge rewritten to reach the same note", async () => {
    const files = {
      "a.md": "[[b]], and [the plan](projects/thesis/plan.md)\n",
      "projects/thesis/b.md": "# B\n",
      "projects/thesis/plan.md": "# Plan\n",
    };
    await withHome(files, async (home) => {
      const thesis = join(home, "projects", "thesis");
      const reached = async () =>
        ((await cli(["links", "a.md"], home)).json.data as { status: string; path: string }[]).map((l) => [
          l.status,
          l.path.startsWith("/") ? l.path : join(home, l.path),
        ]);
      const before = [
        ["note", join(thesis, "b.md")],
        ["note", join(thesis, "plan.md")],
      ];
      // The first command in home: home walked for it, every folder of it there for the plan.
      const made = (await cli(["init", "projects/thesis"], home)).json;
      expect(made.data).toMatchObject({ kind: "make-root", from: "projects/thesis", dryRun: false });
      expect(existsSync(join(thesis, ".slipbox", "config.toml"))).toBe(true);
      expect(locateVault({ path: join(thesis, "b.md") }).root).toBe(thesis);
      // A name doesn't reach into another vault: [[b]] written so it reaches b.md still; the path as it was.
      const a = readFileSync(join(home, "a.md"), "utf8");
      expect(a).not.toContain("[[b]]");
      expect(a).toContain("(projects/thesis/plan.md)");
      expect(await reached()).toEqual(before);
      // Back: home's again, every link reaching what it did.
      const back = (await cli(["deinit", "projects/thesis"], home)).json;
      expect(back.data).toMatchObject({ kind: "unmake-root", from: "projects/thesis", dryRun: false });
      expect(existsSync(join(thesis, ".slipbox"))).toBe(false);
      expect(locateVault({ path: join(thesis, "b.md") })).toMatchObject({ mode: "home", root: home });
      expect(await reached()).toEqual(before);
    });
  });

  test("an agent in home: walked the first time, then the walk kept read; info says home", async () => {
    const { homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "deep/er/b.md": "[a](../../a.md)\n" }, async (home) => {
      expect(homeWalkKept(homeAt(home))).toBe(false);
      const r = await cli(["backlinks", "a.md"], home);
      expect(r.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual(["deep/er/b.md"]);
      expect(homeWalkKept(homeAt(home))).toBe(true);
      const info = (await cli(["info"], join(home, "deep"))).json.data;
      expect(info).toMatchObject({ root: home, mode: "home", name: null, notes: 2 });
      expect(info.index.walked).not.toBeNull();
      expect(info.index.capped).toBeNull();
      expect((await cli(["name", "mine"], home)).code).toBe(5);
    });
  });

  test("the mount table read without going near the mounts: /proc/mounts' escapes, macOS's `mount`, a folder of home by either of its paths", async () => {
    const { mountsIn, parseMountOutput, parseProcMounts } = await import("../src/core/workspace/vaults/mounts.ts");
    const linux = parseProcMounts("server:/x /home/me/my\\040share nfs4 rw,relatime 0 0\n/dev/sda1 / ext4 rw 0 0\n");
    expect(linux.map((m) => [m.at, m.type])).toEqual([
      ["/home/me/my share", "nfs4"],
      ["/", "ext4"],
    ]);
    const mac = parseMountOutput(
      [
        "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
        "/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse)",
        "//me@nas/notes on /Users/me/nas notes (smbfs, nodev, nosuid, mounted by me)",
        "me@host:/srv on /System/Volumes/Data/Users/me/remote (macfuse, nodev, nosuid, mounted by me)",
      ].join("\n"),
    );
    expect(mac.map((m) => [m.at, m.type])).toEqual([
      ["/", "apfs"],
      ["/System/Volumes/Data", "apfs"],
      ["/Users/me/nas notes", "smbfs"],
      ["/System/Volumes/Data/Users/me/remote", "macfuse"],
    ]);
    // Inside home only, by home's paths: the data volume's name for a folder of /Users too.
    expect([...mountsIn("/Users/me", "/Users/me", mac)].sort()).toEqual(["nas notes", "remote"]);
    expect([...mountsIn("/home/me", "/home/me", linux)]).toEqual(["my share"]);
    // Home reached through a link: the table names its real path.
    const linked = parseProcMounts("s:/x /data/home/me/mnt nfs rw 0 0\n/dev/sdb /data nfs rw 0 0\n");
    expect([...mountsIn("/home/me", "/data/home/me", linked)]).toEqual(["mnt"]);
  });

  test("a folder where another disk is mounted is never walked: known from the mount table alone, left out as another disk — dropped from a walk kept, walked again once the disk is gone", async () => {
    const { setMountTable } = await import("../src/core/workspace/vaults/mounts.ts");
    const { homeFilter, homeWalk, leftOutOfHome } = await import("../src/core/workspace/vaults/home.ts");
    const { ANOTHER_DISK, SlicedWalk, walkTop } = await import("../src/core/workspace/walk/walk.ts");
    await withHome({ "a.md": "# A\n", "mnt/m.md": "# M\n", "notes/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const mounts: { device: string; at: string; type: string; options: string }[] = [];
      setMountTable(() => mounts);
      try {
        // Walked and kept before the disk came: a folder like any. Its folders' times an hour back: unchanged since.
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "mnt", "notes"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // A disk mounted on it — one you may not read stands in for it, so a walk going into it would say so.
        mounts.push({ device: "server:/share", at: join(home, "mnt"), type: "nfs", options: "rw" });
        chmodSync(join(home, "mnt"), 0o000);
        const filter = homeFilter(loc, DEFAULT_CONFIG);
        const kept = homeWalk(loc, filter);
        expect(kept.walk.files.map((f) => f.rel)).toEqual(["a.md", "notes/n.md"]);
        expect(kept.walk.dirs).not.toContain("mnt");
        expect(kept.walk.skipped).toContainEqual({ rel: "mnt", reason: ANOTHER_DISK });
        expect(kept.walk.errors).toEqual([]);
        // Walked anew, a slice at a time, or its top alone: left out the same, never read.
        const w = new SlicedWalk(home, filter);
        while (w.step(50)) {}
        expect(w.result!.skipped).toContainEqual({ rel: "mnt", reason: ANOTHER_DISK });
        expect(w.result!.errors).toEqual([]);
        expect(walkTop(home, filter).dirs).toEqual(["", "notes"]);
        // Asked for by name, it isn't walked either: home's index leaves it out, and says why.
        expect(leftOutOfHome(home, filter, "mnt")).toBe(ANOTHER_DISK);
        expect(leftOutOfHome(home, filter, "mnt/sub")).toBe(ANOTHER_DISK);
        expect(homeWalk(loc, filter, ["mnt"]).walk.errors).toEqual([]);
        // The disk taken away: home's folder again, walked.
        chmodSync(join(home, "mnt"), 0o755);
        mounts.length = 0;
        expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG)).walk.files.map((f) => f.rel)).toEqual([
          "a.md",
          "mnt/m.md",
          "notes/n.md",
        ]);
      } finally {
        chmodSync(join(home, "mnt"), 0o755);
        setMountTable(null);
      }
    });
  });

  test("a folder of home listed again for a disk taken away, and unreadable then, is stamped to list again, not as seen (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { setMountTable } = await import("../src/core/workspace/vaults/mounts.ts");
    const { homeFilter, homeWalk, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "p/n.md": "# N\n", "p/mnt/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const mounts = [{ device: "server:/share", at: join(p, "mnt"), type: "nfs", options: "rw" }];
      setMountTable(() => mounts);
      try {
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "p", "p/mnt"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const notes = () => homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG)).walk.files.map((f) => f.rel);
        expect(notes()).toEqual(["p/n.md"]);
        // The disk taken away, p's time unchanged: listed again for it — but it can't be read now. (The chmod moved
        // p's ctime: the walk kept as if it had seen p so, so that the disk alone lists it again.)
        mounts.length = 0;
        chmodSync(p, 0o000);
        restamp(homeWalkFile(loc), home, "p");
        expect(notes()).toEqual([]);
        expect(keptStamps(homeWalkFile(loc)).p).toBe(-1);
        // Readable again, its time as it was: listed again all the same, what it holds back.
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["p/mnt/m.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
        setMountTable(null);
      }
    });
  });

  test("its walk kept follows [walk]: one kept under other settings is no walk of home's — a folder excluded leaves, an extension added comes, a marker added makes a vault; a walk under way made again", async () => {
    const { homeFilter, homeWalk, homeWalkKept } = await import("../src/core/workspace/vaults/home.ts");
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const files = { "a/n.md": "# N\n", "b/m.md": "# M\n", "b/t.txt": "text\n", "c/Cargo.toml": "", "c/c.md": "# C\n" };
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const settings = (f: (c: typeof DEFAULT_CONFIG) => void) => {
        const c = structuredClone(DEFAULT_CONFIG);
        f(c);
        return c;
      };
      const walked = (c: typeof DEFAULT_CONFIG) => homeWalk(loc, homeFilter(loc, c));
      const notes = (c: typeof DEFAULT_CONFIG) => walked(c).walk.files.map((f) => f.rel);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "b", "c"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      expect(notes(DEFAULT_CONFIG)).toEqual(["a/n.md", "b/m.md", "c/c.md"]);
      // A folder excluded since: the walk kept isn't home's under it — its top alone, until it's walked again.
      const excluded = settings((c) => (c.walk.exclude = ["a/"]));
      expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(true);
      expect(homeWalkKept(loc, excluded)).toBe(false);
      expect(walked(excluded).walked).toBeNull();
      expect([...openGraph(loc, excluded, true).notes.keys()]).toEqual([]);
      walkHomeNow(loc, excluded);
      expect(notes(excluded)).toEqual(["b/m.md", "c/c.md"]);
      // An extension added: a text file of home's is a note now.
      const txt = settings((c) => c.walk.extensions.push("txt"));
      expect(walked(txt).walked).toBeNull();
      walkHomeNow(loc, txt);
      expect(notes(txt)).toEqual(["a/n.md", "b/m.md", "b/t.txt", "c/c.md"]);
      // A marker added: a folder holding one is a vault of its own.
      setRootMarkers([...DEFAULT_CONFIG.walk.root_markers, "Cargo.toml"]);
      try {
        expect(homeWalkKept(loc, txt)).toBe(false);
        walkHomeNow(loc, txt);
        expect(notes(txt)).toEqual(["a/n.md", "b/m.md", "b/t.txt"]);
      } finally {
        setRootMarkers(null);
      }
      // [walk] changed while home's walk is under way: made again under what it says now, never kept under the old.
      const now = structuredClone(DEFAULT_CONFIG);
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, config: () => now });
      expect(job.step(0)).toBe(true);
      now.walk.exclude = ["b/"];
      while (job.step(50)) {}
      expect(homeWalkKept(loc, now)).toBe(true);
      expect(notes(now)).toEqual(["a/n.md", "c/c.md"]);
    });
  });

  test("its cap: a walk of exactly so many notes left nothing out; its other files capped too, those nearest the top", async () => {
    const { SlicedWalk, WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const files = { "a.md": "", "b.md": "", "c.md": "", "d/x.txt": "", "d/y.txt": "", "e.txt": "", "f.json": "" };
    await withHome(files, (home) => {
      const walk = (limits: { notes: number; folders: number; assets?: number }) => {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }), limits);
        while (w.step(50)) {}
        return { capped: w.capped, files: w.result!.files.length, dirs: w.result!.dirs, assets: w.result!.assets };
      };
      // Three notes, three at most: none left out, every folder listed.
      expect(walk({ notes: 3, folders: 100 })).toMatchObject({ capped: null, files: 3, dirs: ["", "d"] });
      expect(walk({ notes: 2, folders: 100 })).toMatchObject({ capped: "notes", files: 2 });
      // Three other files at most: the top's first; the walk goes on for notes.
      expect(walk({ notes: 100, folders: 100, assets: 3 })).toMatchObject({
        capped: null,
        files: 3,
        dirs: ["", "d"],
        assets: ["e.txt", "f.json", "d/x.txt"],
      });
    });
  });

  test("its cap holds what comes into a folder of a walk kept: a tree unpacked past the folder cap listed as far as the room left, and said", async () => {
    const { homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const limits = { notes: 100, folders: 5 };
      utimesSync(home, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
      walkHomeNow(loc, DEFAULT_CONFIG, limits);
      // Unpacked into a: its time moves, so it's listed again.
      for (let i = 0; i < 10; i++) {
        mkdirSync(join(home, "a", "big", `d${i}`), { recursive: true });
        writeFileSync(join(home, "a", "big", `d${i}`, "n.md"), "# N\n");
      }
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], limits);
      expect(w.capped).toBe("folders");
      expect(w.walk.dirs.length).toBeLessThanOrEqual(limits.folders);
      expect(w.walk.files.map((f) => f.rel)).toContain("a/n.md");
      expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], limits).capped).toBe("folders");
    });
  });

  test("a folder asked for that a capped walk listed is walked whole: what's deeper wasn't listed", async () => {
    const { AutoIndex } = await import("../src/core/autoindex.ts");
    const { homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    await withHome({ "notes/inbox.md": "[d](sub/deep.md)\n", "notes/sub/deep.md": "# D\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "notes", "notes/sub"]) utimesSync(join(home, d), hour, hour);
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, limits: { notes: 100, folders: 2 } });
      while (job.step(50)) {}
      expect(job.status.capped).toBe("folders");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["notes"]);
      expect(w.walk.files.map((f) => f.rel)).toEqual(["notes/inbox.md", "notes/sub/deep.md"]);
      expect(new Set(w.walk.dirs).size).toBe(w.walk.dirs.length);
    });
  });

  test("a folder asked for, home's index full: the folder whole, home's own deepest notes left out to hold the cap", async () => {
    const { describeCap, homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    const notes = ["a.md", "b.md", "x/c.md", "x/d.md", "x/y/e.md", "x/y/f.md", "w/notes/n1.md", "w/notes/n2.md"];
    const files = Object.fromEntries([...notes, "w/notes/sub/n3.md", "w/notes/sub/n4.md"].map((f) => [f, "# N\n"]));
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const limits = { notes: 8, folders: 100 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "w", "w/notes", "w/notes/sub", "x", "x/y"]) utimesSync(join(home, d), hour, hour);
      // Home's own walk, breadth first, full before it reaches w/notes/sub.
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).walk.files.map((f) => f.rel)).toEqual([...notes].sort());
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["w/notes"], limits);
      // At the cap still: every note of the folder asked for, and home's own as far as the room left — x/y's, the
      // deepest, left out.
      expect(w.walk.files.map((f) => f.rel)).toEqual([
        "a.md",
        "b.md",
        "w/notes/n1.md",
        "w/notes/n2.md",
        "w/notes/sub/n3.md",
        "w/notes/sub/n4.md",
        "x/c.md",
        "x/d.md",
      ]);
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["w/notes"], notes: 4 });
      // Said as the cap is, the folder said to be whole.
      expect(describeCap("notes", w.asked)).toBe(
        "home's index is full: it holds 10,000 notes, those nearest the top — the rest aren't indexed; ~/w/notes, the folder open, is whole",
      );
      expect(describeCap("folders", { folders: ["a", "b"], notes: 2 })).toBe(
        "home's walk stopped at 5,000 folders, those nearest the top — the notes deeper aren't indexed; ~/a and ~/b, the folders open, are whole",
      );
    });
  });

  test("a folder asked for that home's walk covers stays whole when another asked for needs room", async () => {
    const { homeFilter, homeWalk, homeWalkFile } = await import("../src/core/workspace/vaults/home.ts");
    const notes = ["top.md", "a/x/y/deep1.md", "a/x/y/deep2.md", "o/p.md", "o/q/r.md"];
    await withHome(Object.fromEntries(notes.map((f) => [f, "# N\n"])), (home) => {
      const loc = homeAt(home);
      const limits = { notes: 5, folders: 100 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/x", "a/x/y", "o", "o/q"]) utimesSync(join(home, d), hour, hour);
      // Exactly at the cap: nothing left out, every folder covered.
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).capped).toBeNull();
      // b comes after, the walk kept as if it had seen home with it: home's walk doesn't see it, so it's walked when
      // asked for.
      for (const n of ["b/n1.md", "b/n2.md"]) {
        mkdirSync(dirname(join(home, n)), { recursive: true });
        writeFileSync(join(home, n), "# N\n");
      }
      restamp(homeWalkFile(loc), home, "");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["a", "b"], limits);
      // Home's walk kept, uncapped, covers a: kept whole from it, not walked again.
      expect(JSON.parse(readFileSync(homeWalkFile(loc), "utf8")).capped).toBeNull();
      // a's notes, the deepest in home, stay: home's own make room for b's.
      expect(w.walk.files.map((f) => f.rel)).toEqual([
        "a/x/y/deep1.md",
        "a/x/y/deep2.md",
        "b/n1.md",
        "b/n2.md",
        "top.md",
      ]);
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["a", "b"], notes: 4 });
    });
  });

  test("a folder asked for that alone holds more than home's cap: walked whole all the same, home's own all left out", async () => {
    const { describeCap, homeFilter, homeWalk } = await import("../src/core/workspace/vaults/home.ts");
    const notes = ["a.md", "big/1.md", "big/2.md", "big/s/3.md", "big/s/t/4.md", "big/u/5.md"];
    await withHome(Object.fromEntries(notes.map((f) => [f, "# N\n"])), (home) => {
      const loc = homeAt(home);
      const limits = { notes: 3, folders: 3 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "big", "big/s", "big/s/t", "big/u"]) utimesSync(join(home, d), hour, hour);
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).capped).toBe("notes");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["big"], limits);
      // Past both caps, every note and folder of it.
      expect(w.walk.files.map((f) => f.rel)).toEqual(notes.slice(1));
      expect(w.walk.dirs).toEqual(expect.arrayContaining(["big", "big/s", "big/s/t", "big/u"]));
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["big"], notes: 5 });
      expect(describeCap("notes", { folders: ["big"], notes: 12_345 })).toBe(
        "home's index is full: it holds 12,345 notes, all in ~/big, the folder open — the rest aren't indexed",
      );
    });
  });

  test("a note made in a folder asked for, home's index full: taken in, home's deepest own note left out for it", async () => {
    const { applyToGraph } = await import("../src/core/workspace/vaults/vault-feed.ts");
    await withHome({ "a.md": "# A\n", "x/y/deep.md": "# D\n", "w/notes/n.md": "# N\n" }, (home) => {
      walkHomeNow(homeAt(home), DEFAULT_CONFIG);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "w", "notes")]);
      expect(g.askedFolders).toEqual(["w/notes"]);
      for (const n of ["z.md", "w/notes/new.md"]) writeFileSync(join(home, n), "# N\n");
      const created = (rel: string) => ({ rel, kind: "created" as const, isNote: true });
      // Home holds 3 at most here: z.md, home's own, is left to its walk; new.md comes, x/y/deep.md making room.
      applyToGraph(g, { changes: ["z.md", "w/notes/new.md"].map(created), rescan: false }, 1e9, 3);
      expect([...g.notes.keys()].sort()).toEqual(["a.md", "w/notes/n.md", "w/notes/new.md"]);
    });
  });

  test("index --refresh ~ says when home's walk reached its cap", async () => {
    await withHome({ "a.md": "# A\n" }, async (home) => {
      for (let i = 0; i <= 5_000; i++) mkdirSync(join(home, `f${i}`));
      const r = await cli(["index", "--refresh", home], home);
      expect(r.json.data.capped).toBe("folders");
      const out: string[] = [];
      await runCli(["index", "--refresh", home], {
        out: (x: string) => out.push(x),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: home,
        env: process.env,
      });
      expect(out.join("")).toContain("home's walk stopped at 5,000 folders");
    });
  });

  test("what comes while home is open holds its cap: past it, a folder isn't taken in, nor a note — left to home's walk", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter } = await import("../src/core/workspace/walk/walk.ts");
    const { applyToGraph } = await import("../src/core/workspace/vaults/vault-feed.ts");
    await withHome({ "a.md": "# A\n" }, (home) => {
      for (let i = 0; i < 6; i++) mkdirSync(join(home, "big", `d${i}`), { recursive: true });
      const w = new VaultWatcher({
        root: home,
        filter: new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }),
        dirs: [""],
        debounceMs: 20,
        known: new Map(),
        onBatch: () => {},
        onDegraded: () => {},
        maxDirs: 3,
      });
      try {
        (w as unknown as { adoptTree(d: string): string[] }).adoptTree("big");
        expect(w.watchedCount + w.polledDirs.length).toBe(3);
      } finally {
        w.close();
      }
      walkHomeNow(homeAt(home), DEFAULT_CONFIG);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      for (const n of ["b.md", "c.md", "d.md"]) writeFileSync(join(home, n), "# N\n");
      const created = (rel: string) => ({ rel, kind: "created" as const, isNote: true });
      applyToGraph(g, { changes: ["b.md", "c.md", "d.md"].map(created), rescan: false }, 1e9, 2);
      expect([...g.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
    });
  });

  test("before home's first walk, the watcher looks into no folder its graph hasn't: a folder in one is the walk's, one come into home's top is listed for it; in a folder asked for, or home walked, a folder is taken in (#16)", async () => {
    const { HOME_LIMITS } = await import("../src/core/workspace/walk/walk.ts");
    const { applyToGraph } = await import("../src/core/workspace/vaults/vault-feed.ts");
    const files: Record<string, string> = { "a.md": "# A\n", "Documents/top.md": "# Top\n", "touched/t.md": "# T\n" };
    for (const top of ["Documents", "touched", "notes"])
      for (const d of ["d0", "d1"]) files[`${top}/${d}/sub/n.md`] = "# N\n";
    await withHome(files, async (home) => {
      // A person's folders, dated back; touched/ changed in the two seconds before the watcher starts.
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "Documents", "notes", "notes/d0", "notes/d1"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "notes")]); // `slipbox ~/notes`: walked whole
      expect(g.home?.walked).toBeNull();
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // touched/ changed just now, however long the setup took: inside the two seconds the watcher looks again.
      const now = new Date();
      utimesSync(join(home, "touched"), now, now);
      const { w, look } = await watchHome(home, g, { known, maxDirs: HOME_LIMITS.folders });
      try {
        // touched/ listed again at once: its own note comes, its folders are the walk's.
        expect(await look()).toEqual({ ...none, reported: ["touched/t.md"] });
        // A shell's history rewritten in ~, by a file put in its place: nothing taken in, nothing named.
        writeFileSync(join(home, ".zsh_history.new"), "ls\n");
        renameSync(join(home, ".zsh_history.new"), join(home, ".zsh_history"));
        expect(await look()).toEqual(none);
        // A file saved in Documents: the same — nothing a folder down, nothing named (the walk takes them).
        writeFileSync(join(home, "Documents", "letter.txt"), "Dear…\n");
        expect(await look()).toEqual({ ...none, reported: ["Documents/letter.txt", "Documents/top.md"] });
        // A folder come into home's top: left to the walk, named once for the graph to list — no note came with it —
        // then watched, as the TUI does, never looked into.
        mkdirSync(join(home, "cloned", "x", "y"), { recursive: true });
        writeFileSync(join(home, "cloned", "x", "y", "deep.md"), "# Deep\n");
        expect(await look()).toEqual({ ...none, toWalk: ["cloned"] });
        expect(await look()).toEqual(none);
        const notes = [...g.notes.keys()];
        expect(applyToGraph(g, { changes: [], rescan: false, toWalk: ["cloned"] }, 1e9).structural).toBe(false);
        expect(g.dirs).toContain("cloned");
        expect([...g.notes.keys()]).toEqual(notes); // listed, nothing built again
        w.watchNamed(["cloned"], () => true);
        writeFileSync(join(home, "cloned", "own.md"), "# Own\n");
        expect(await look()).toEqual({ ...none, reported: ["cloned/own.md"] });
        // One gone before it's watched, and made again: new, named again.
        mkdirSync(join(home, "brief"));
        expect(await look()).toEqual({ ...none, toWalk: ["brief"] });
        rmSync(join(home, "brief"), { recursive: true });
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "brief"));
        expect(await look()).toEqual({ ...none, toWalk: ["brief"] });
        // A known note gone as a folder comes into home's top: none went there, so it's named, not read.
        rmSync(join(home, "a.md"));
        mkdirSync(join(home, "bulk", "x"), { recursive: true });
        writeFileSync(join(home, "bulk", "x", "n.md"), "# N\n");
        expect(await look()).toEqual({ ...none, reported: ["a.md"], toWalk: ["bulk"] });
        // Listed as the walk would take it when the batch is applied (held while git wrote): one gone since, or become a
        // vault, isn't. A vault come into home's top is never named.
        mkdirSync(join(home, "vaulted", ".slipbox"), { recursive: true });
        expect(await look()).toEqual(none);
        applyToGraph(g, { changes: [], rescan: false, toWalk: ["gone", "vaulted"] }, 1e9);
        expect(g.dirs).not.toContain("gone");
        expect(g.dirs).not.toContain("vaulted");
        // One listed before, a vault since (gone and made again while git wrote): not listed, nor watched, again.
        mkdirSync(join(home, "cloned", ".slipbox"));
        expect(applyToGraph(g, { changes: [], rescan: false, toWalk: ["cloned"] }, 1e9).listed).toEqual([]);
        // A folder left to the walk, gone: nothing to say — it was never a file.
        rmSync(join(home, "Documents", "d1"), { recursive: true });
        expect(await look()).toEqual(none);
        // A folder made in one asked for, which is whole: taken in at once.
        mkdirSync(join(home, "notes", "d0", "fresh"));
        writeFileSync(join(home, "notes", "d0", "fresh", "f.md"), "# F\n");
        expect((await look()).reported).toEqual(["notes/d0/fresh/f.md"]);
        // The folder asked for renamed: its notes found where they went, by their time and size; the folder, come into
        // home's top, named.
        renameSync(join(home, "notes"), join(home, "zettel"));
        const renamed = await look();
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "notes/d0/fresh/f.md",
          "notes/d0/sub/n.md",
          "notes/d1/sub/n.md",
          "zettel/d0/fresh/f.md",
          "zettel/d0/sub/n.md",
          "zettel/d1/sub/n.md",
        ]);
        expect(renamed.toWalk).toEqual(["zettel"]);
        // Home walked: a folder that comes is taken in, as in a vault.
        walkHomeNow(homeAt(home), DEFAULT_CONFIG);
        g.build(true, "lazy");
        expect(g.home?.walked).not.toBeNull();
        expect(g.waitsForHomeWalk("Documents")).toBe(false);
        w.sync(g.dirs, new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number])));
        await look();
        mkdirSync(join(home, "Documents", "d9", "sub"), { recursive: true });
        writeFileSync(join(home, "Documents", "d9", "sub", "z.md"), "# Z\n");
        expect((await look()).reported).toEqual(["Documents/d9/sub/z.md"]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, a folder of home polled (its watch failed) is listed at every tick: its folders the walk's, never named; one come into home's top named once, then watched (#16)", async () => {
    const files: Record<string, string> = { "a.md": "# A\n", "Documents/top.md": "# Top\n" };
    for (const d of ["d0", "d1"]) files[`Documents/${d}/sub/n.md`] = "# N\n";
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "Documents"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // Documents' own note known, as when it came by its event.
      known.set("Documents/top.md", statSync(join(home, "Documents", "top.md")).mtimeMs);
      // home's cap, as if three folders were all it may watch
      const { w, look } = await watchHome(home, g, { known, maxDirs: 3 });
      // Home's top and Documents polled alone: their watches closed, as when they fail.
      const inside = w as unknown as {
        watchers: Map<string, { close(): void }>;
        pollDir(d: string, r: string): void;
        degrade(r: string): void;
        pending: Set<string>;
      };
      for (const d of ["", "Documents"]) {
        inside.watchers.get(d)?.close();
        inside.watchers.delete(d);
        inside.pollDir(d, "EACCES: test");
      }
      try {
        expect(w.polledDirs.sort()).toEqual(["", "Documents"]);
        // Its folders found at every tick, the walk's each time: nothing taken in, nothing named, no rescan.
        expect(await look()).toEqual(none);
        // An event naming Documents, polled: never named for the walk, its place in home's top though it is.
        inside.pending.add("Documents");
        w.flush();
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "Documents", "d2"));
        writeFileSync(join(home, "Documents", "d2", "m.md"), "# M\n");
        expect(await look()).toEqual(none);
        expect(await look()).toEqual(none);
        // Its note moved into a folder made in it, seen by the listing alone: where it went is taken in, the move seen.
        mkdirSync(join(home, "Documents", "new"));
        renameSync(join(home, "Documents", "top.md"), join(home, "Documents", "new", "top.md"));
        expect(await look()).toEqual({ ...none, reported: ["Documents/new/top.md", "Documents/top.md"] });
        // A folder come into home's top, found by its listing: named once, not again before it's watched; watched, a
        // note in it comes. Named, it holds its room under home's cap: one more come meanwhile isn't named.
        mkdirSync(join(home, "cloned", "z"), { recursive: true });
        writeFileSync(join(home, "cloned", "z", "deep.md"), "# Deep\n");
        expect(await look()).toEqual({ ...none, toWalk: ["cloned"] });
        expect(await look()).toEqual(none);
        mkdirSync(join(home, "spare"));
        expect(await look()).toEqual(none);
        w.watchNamed(["cloned"], () => true);
        writeFileSync(join(home, "cloned", "own.md"), "# Own\n");
        expect(await look()).toEqual({ ...none, reported: ["cloned/own.md"] });
        // Home's cap reached (three folders): another isn't named, nor watched if asked — the walk, which holds the cap,
        // has it.
        mkdirSync(join(home, "more"));
        expect(await look()).toEqual(none);
        w.watchNamed(["more"], () => true);
        expect(w.watchedCount).toBe(1);
        // Watching degraded (the system's limit): nothing watched, the folders still found at every tick — none named.
        inside.degrade("ENOSPC: test");
        expect(await look()).toEqual(none);
        expect(await look()).toEqual(none);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, a folder a known note was moved into is taken in, found by its time and size; never for a note of the same name, nor through a link it doesn't follow (#16)", async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-outside-")));
    mkdirSync(join(outside, "deep"));
    writeFileSync(join(outside, "a.md"), "# A\n");
    writeFileSync(join(outside, "deep", "far.md"), "# Far\n");
    const files = {
      "a.md": "# A\n",
      "index.md": "# Home\n",
      "Documents/keep.md": "# Keep\n",
      "Documents/README.md": "# Read me\n",
      "Documents/proj/old.md": "# Old\n",
      "Projects/p.md": "# P\n",
      "Projects/deep/sub/x.md": "# X\n",
      "Documents/orig.md": "# Orig\n",
      "Documents/backup/orig.md": "# Orig\n",
      "Archive/a1.md": "# Archived\n",
      "Documents/archive-bak/a1.md": "# Archived\n",
      "Documents/spare.md": "# Spare\n",
    };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      // A copy made with its times kept (`cp -p`), in a folder left as it was since.
      for (const f of ["Documents/orig.md", "Documents/backup/orig.md", "Archive/a1.md", "Documents/archive-bak/a1.md"])
        utimesSync(join(home, f), hour, hour);
      for (const d of ["", "Documents", "Documents/proj", "Documents/backup", "Documents/archive-bak", "Projects"])
        utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      // The top folders' own notes known, as when they came by their events.
      for (const rel of [
        "Documents/keep.md",
        "Documents/README.md",
        "Projects/p.md",
        "Documents/orig.md",
        "Archive/a1.md",
        "Documents/spare.md",
      ])
        known.set(rel, statSync(join(home, rel)).mtimeMs);
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look, reported, clock } = await watchHome(home, g, { known, sizes, kinds: true });
      const inside = w as unknown as {
        lookAgain(moved: [string, number][], at: number): void;
        pending: Set<string>;
        leftSeen: Map<string, number>;
      };
      try {
        await look();
        // A note moved under another name into a folder made in Documents: found at its top, by its time and size.
        mkdirSync(join(home, "Documents", "new"));
        renameSync(join(home, "a.md"), join(home, "Documents", "new", "b.md"));
        expect(await look()).toEqual({ ...none, reported: ["created Documents/new/b.md", "deleted a.md"], toWalk: [] });
        // Moved on from there, into another folder made in Documents: Documents/new unwatched, the note followed into it
        // is looked at every tick, so it's seen to go, and followed again.
        mkdirSync(join(home, "Documents", "again"));
        renameSync(join(home, "Documents", "new", "b.md"), join(home, "Documents", "again", "c.md"));
        expect(await look()).toEqual({
          ...none,
          reported: ["created Documents/again/c.md", "deleted Documents/new/b.md"],
        });
        // A known note gone as a folder comes into home's top holding one of the same name, another file: named, not
        // read.
        rmSync(join(home, "index.md"));
        mkdirSync(join(home, "bulk", "x"), { recursive: true });
        writeFileSync(join(home, "bulk", "index.md"), "# Another index, nothing to do with home's\n");
        writeFileSync(join(home, "bulk", "x", "n.md"), "# N\n");
        expect(await look()).toEqual({ ...none, reported: ["deleted index.md"], toWalk: ["bulk"] });
        // A known note moved into a folder that was there: its event says it went, and the second look a tick later
        // finds the folder — it's found there, the rest of the folder left to the walk.
        // (Documents dated back, so it settles, and what second looks found in it is forgotten.)
        utimesSync(join(home, "Documents"), hour, hour);
        for (let n = 0; n < 3; n++) await look();
        renameSync(join(home, "Documents", "README.md"), join(home, "Documents", "proj", "moved.md"));
        await Bun.sleep(30);
        w.flush(); // its event's batch first: README.md went
        expect(await look()).toEqual({
          ...none,
          reported: ["created Documents/proj/moved.md", "deleted Documents/README.md"],
          toWalk: [],
        });
        // A known note deleted, its copy kept in a folder unchanged since: no move. (The watcher's clock a minute ahead:
        // the copy, made a moment ago, as if made long before.)
        clock.ahead = 60_000;
        rmSync(join(home, "Documents", "orig.md"));
        expect(await look()).toEqual({ ...none, reported: ["deleted Documents/orig.md"] });
        // A folder moved out of home, a copy of it kept with its times (`cp -a`) in a folder a second look finds: no move —
        // though another note went a moment before, as the copy's folder was made (the clock as it is for that one).
        clock.ahead = 0;
        rmSync(join(home, "Documents", "spare.md"));
        await Bun.sleep(30);
        w.flush();
        clock.ahead = 60_000;
        mkdirSync(join(home, "Documents", "tick")); // Documents listed again: archive-bak found
        renameSync(join(home, "Archive"), join(outside, "Archive"));
        const deleted = await look();
        expect(deleted.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "deleted Archive/a1.md",
          "deleted Documents/spare.md",
        ]);
        clock.ahead = 0;
        // A top folder renamed: its known notes found under the new name, nothing deeper read; the folder named.
        renameSync(join(home, "Projects"), join(home, "Work"));
        const renamed = await look();
        // (Bun says the watched folder itself went, as a file of it: `Projects/Projects`, on dev too.)
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "created Work/p.md",
          "deleted Projects/p.md",
        ]);
        expect(renamed.toWalk).toEqual(["Work"]);
        // A folder a second look left, become a link out of home that isn't followed, and a known note moved where it
        // leads: never read through.
        mkdirSync(join(home, "Documents", "later"));
        await look();
        inside.lookAgain([["Documents", 1]], Date.now());
        inside.pending.clear();
        expect([...inside.leftSeen.keys()]).toContain("Documents/later");
        rmSync(join(home, "Documents", "later"), { recursive: true });
        symlinkSync(outside, join(home, "Documents", "later"));
        renameSync(join(home, "Documents", "keep.md"), join(outside, "keep.md"));
        inside.pending.add("Documents/keep.md");
        w.flush();
        expect([...new Set(reported.splice(0))]).toEqual(["deleted Documents/keep.md"]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, a move is followed whatever its batches: a folder's ends in two, a note's gone found only by the batch's last look; never into a vault made in it (#16)", async () => {
    const files = {
      "a.md": "# A\n",
      "kept/inbox.md": "# Inbox\n",
      "kept/sub/deep.md": "# Deep\n",
      "kept/sub/table.csv": "a,b\n",
      "fifth/inbox.md": "# Fifth\n",
      "fifth/sub/deep.md": "# Fifth deep\n",
      "held/inbox.md": "# Held\n",
      "held/sub/deep.md": "# Held deep\n",
      "third/old.md": "# Old\n",
      "third/inbox.md": "# Third\n",
      "third/sub/deep.md": "# Third deep\n",
    };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "kept", "kept/sub", "held", "held/sub", "third", "third/sub", "fifth", "fifth/sub"])
        utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      // Both asked for by name: walked whole, their notes known.
      g.askFolders([join(home, "kept")]);
      g.askFolders([join(home, "held")]);
      g.askFolders([join(home, "third")]);
      g.askFolders([join(home, "fifth")]);
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look, reported } = await watchHome(home, g, { known, sizes, kinds: true });
      const inside = w as unknown as { pending: Set<string> };
      /** A batch of these paths alone, before any event of theirs comes: what it reported. */
      const batch = (...paths: string[]) => {
        for (const p of paths) inside.pending.add(p);
        w.flush();
        return [...new Set(reported.splice(0))].sort();
      };
      try {
        await look();
        // A folder renamed, the batch saying it went before the one finding where: its notes followed, a folder down too,
        // and the other files known in it (a table a note links).
        renameSync(join(home, "kept"), join(home, "zettel"));
        expect(batch("kept")).toEqual([
          "deleted kept/inbox.md",
          "deleted kept/sub/deep.md",
          "deleted kept/sub/table.csv",
        ]);
        expect(batch("zettel")).toEqual([
          "created zettel/inbox.md",
          "created zettel/sub/deep.md",
          "created zettel/sub/table.csv",
        ]);
        await look();
        reported.length = 0;
        // A note moved under another name into a folder made, the batch naming the folder alone: the batch's last look
        // finds it went, and it's followed.
        mkdirSync(join(home, "dest"));
        renameSync(join(home, "a.md"), join(home, "dest", "b.md"));
        expect(batch("dest")).toEqual(["created dest/b.md", "deleted a.md"]);
        await look();
        reported.length = 0;
        // A folder renamed, a vault made in it before the batch: what's in the vault is never home's.
        renameSync(join(home, "held"), join(home, "kept2"));
        mkdirSync(join(home, "kept2", "sub", ".slipbox"));
        expect(batch("held", "kept2")).toEqual([
          "created kept2/inbox.md",
          "deleted held/inbox.md",
          "deleted held/sub/deep.md",
        ]);
        await look();
        reported.length = 0;
        // A note of a folder deleted alone, and the folder renamed a moment later: the rest of its notes followed.
        rmSync(join(home, "third", "old.md"));
        expect(batch("third/old.md")).toEqual(["deleted third/old.md"]);
        renameSync(join(home, "third"), join(home, "fourth"));
        expect(batch("third", "fourth")).toEqual([
          "created fourth/inbox.md",
          "created fourth/sub/deep.md",
          "deleted third/inbox.md",
          "deleted third/sub/deep.md",
        ]);
        // A folder renamed, the batch finding the new name first — named, and watched, as the TUI does — and the one
        // saying the old went after: its notes followed all the same.
        renameSync(join(home, "fifth"), join(home, "sixth"));
        expect(batch("sixth")).toEqual([]);
        w.watchNamed(["sixth"], () => true);
        expect(batch("fifth")).toEqual([
          "created sixth/inbox.md",
          "created sixth/sub/deep.md",
          "deleted fifth/inbox.md",
          "deleted fifth/sub/deep.md",
        ]);
      } finally {
        w.close();
      }
    });
  });

  test("before home's first walk, the folder opened by name renamed while home's top is polled: its notes followed (#16)", async () => {
    const files = { "a.md": "# A\n", "kept/inbox.md": "# Inbox\n", "kept/sub/deep.md": "# Deep\n" };
    await withHome(files, async (home) => {
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "kept", "kept/sub"]) utimesSync(join(home, d), hour, hour);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "kept")]);
      const known = new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
      const sizes = new Map([...known.keys()].map((rel) => [rel, statSync(join(home, rel)).size] as [string, number]));
      const { w, look } = await watchHome(home, g, { known, sizes, kinds: true });
      // Home's top polled alone, its watch closed as when it fails: its listing finds the new name.
      const inside = w as unknown as { watchers: Map<string, { close(): void }>; pollDir(d: string, r: string): void };
      inside.watchers.get("")?.close();
      inside.watchers.delete("");
      inside.pollDir("", "EACCES: test");
      try {
        expect(await look()).toEqual(none);
        renameSync(join(home, "kept"), join(home, "zettel"));
        const renamed = await look();
        expect(renamed.reported.filter((r) => r.endsWith(".md"))).toEqual([
          "created zettel/inbox.md",
          "created zettel/sub/deep.md",
          "deleted kept/inbox.md",
          "deleted kept/sub/deep.md",
        ]);
        expect(renamed.toWalk).toEqual(["zettel"]);
        // Found again at every tick, not watched yet: named once.
        expect(await look()).toEqual(none);
      } finally {
        w.close();
      }
    });
  });
});

describe("freshness and coverage (20.10)", () => {
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
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    expect(readRoots().find((v) => v.path === there)?.indexed).toBeDefined();
    writeFileSync(join(there, "a.md"), "# A, longer now\n");
    rmSync(join(there, "b.md"));
    expect((await cli(["index", "--refresh", join(there, "a.md")], here)).json.data).toMatchObject({
      root: there,
      notes: 1,
      changed: 1,
      unchanged: 0,
      gone: 1,
    });
    expect((await cli(["index", "--refresh"], here)).json.data.root).toBe(here); // this one, unnamed
    // Elsewhere has no index (VV-D3): refused; home has one (VV-D2), its every folder listed again.
    const loose = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-fresh-loose-")));
    writeFileSync(join(loose, "l.md"), "# L\n");
    expect((await cli(["index", "--refresh", loose], here)).code).toBe(5);
    const home = process.env.HOME;
    process.env.HOME = loose;
    try {
      mkdirSync(join(loose, "sub"));
      writeFileSync(join(loose, "sub", "m.md"), "# M\n");
      expect((await cli(["index", "--refresh", join(loose, "sub")], here)).json.data).toMatchObject({
        root: loose,
        notes: 2,
      });
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
    await runCli(["info"], {
      out: (x: string) => lines.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(lines.join("")).toMatch(/\nindex {5}written \d{4}-\d\d-\d\d \d\d:\d\d\n/);
    expect(lines.join("")).toMatch(/\nhome {6}background index\b/);
    const { describeBackground } = await import("../src/core/autoindex.ts");
    const b = { found: 0, indexed: 0, left: 0, finished: null, started: null, home: false, homeNotes: 0, capped: null };
    expect(describeBackground({ ...b, on: false })).toBe("background index off ([index] background)");
    expect(describeBackground({ ...b, on: true, started: "x" })).toBe("background index: walking home");
    expect(
      describeBackground({ ...b, on: true, found: 2, indexed: 1, left: 7, started: "x", home: true, homeNotes: 12 }),
    ).toBe("background index: home's 12 notes indexed, 2 vaults found so far, 7 left");
    expect(
      describeBackground({
        ...b,
        on: true,
        found: 1,
        started: "x",
        finished: "2026-10-15T09:30:00Z",
        home: true,
        homeNotes: 1,
        capped: "notes",
      }),
    ).toBe(
      "background index: pass done 2026-10-15 09:30 — home's 1 note, 1 vault found — home's index is full: it holds 10,000 notes, those nearest the top — the rest aren't indexed",
    );
  });

  test("a drive unplugged: its roots unavailable, not gone — kept, never pruned, and a link into one says why it's broken", async () => {
    const { pruneWorktrees, readRoots, recordRoot, unavailable } = await import(
      "../src/core/workspace/vaults/registry.ts"
    );
    const drive = `/media/slipbox-test-nodrive-${basename(mkdtempSync(join(tmpdir(), "slipbox-nodrive-")))}`;
    expect(unavailable(`${drive}/notes`)).toBe(true);
    expect(unavailable("/tmp/certainly/not/here")).toBe(false);
    expect(unavailable(tmpdir())).toBe(false);
    const long = new Date(Date.now() - 60 * 86_400_000);
    recordRoot({ kind: "vault", path: `${drive}/notes` }, long);
    recordRoot({ kind: "vault", path: `${drive}/wt`, worktree: { name: "wt", main: `${drive}/notes` } }, long);
    recordRoot({ kind: "folder", path: `${drive}/loose` }, long);
    pruneWorktrees();
    expect(
      readRoots()
        .filter((v) => v.path.startsWith(`${drive}/`))
        .map((v) => v.kind)
        .sort(),
    ).toEqual(["folder", "vault", "vault"]);
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-drive-")), {
      "n.md": `[far](${drive}/notes/a.md) [near](gone.md)\n`,
    });
    const problems = (await cli(["diagnostics", "n.md", "--severity", "info"], dir)).json.data.problems.map(
      (p: { message: string }) => p.message,
    );
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
    expect(gb.resolveLink({ kind: "markdown", target: "y.md" }, "x.md")).toMatchObject({
      resolvedKind: "note",
      path: "y.md",
    });
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
    own.put(ParseCache.key(contentHash("# N\n\n[a](a.md)\n"), "markdown", INDEX_VERSION), {
      title: "From the cache",
      headings: [],
      links: [],
      tags: ["cached"],
      aliases: [],
      previous: [],
    });
    expect(extractNote({ rel: "n.md", abs: join(dir, "n.md"), size: 0, mtimeMs: 0 }, own)).toMatchObject({
      title: "From the cache",
      links: [],
      tags: ["cached"],
    });
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

  test("the shared cache is the cache folder's as it is now: moved, the old one let go (it may be gone)", async () => {
    const { ParseCache, sharedParseCache } = await import("../src/core/parsecache.ts");
    const was = process.env.XDG_CACHE_HOME;
    const base = mkdtempSync(join(tmpdir(), "slipbox-pcmove-"));
    const key = ParseCache.key(`moved-${basename(base)}`, "md", 1);
    try {
      process.env.XDG_CACHE_HOME = join(base, "one");
      sharedParseCache()!.put(key, { title: "T", links: [], headings: [], tags: [], tasks: [] } as never);
      expect(sharedParseCache()!.get(key)).not.toBeNull();
      rmSync(join(base, "one"), { recursive: true, force: true }); // as a test file's sandbox goes when it ends
      process.env.XDG_CACHE_HOME = join(base, "two");
      expect(sharedParseCache()!.get(key)).toBeNull(); // the folder's own cache, not the one that went
      sharedParseCache()!.put(key, { title: "T", links: [], headings: [], tags: [], tasks: [] } as never);
      expect(sharedParseCache()!.get(key)).not.toBeNull();
    } finally {
      if (was === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = was;
    }
  });
});

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

  test("a scope leaves worktrees out, even one a note links into by @branch or by path: their notes are their main checkout's", async () => {
    const { scopeRoots } = await import("../src/core/scope.ts");
    const { openVault } = await import("../src/core/reach.ts");
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
    const { searchOthers } = await import("../src/core/scope.ts");
    const { SearchIndex } = await import("../src/core/search-index.ts");
    const { catchUp } = await import("../src/core/search.ts");
    const { openVault } = await import("../src/core/reach.ts");
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
    const { searchOthers } = await import("../src/core/scope.ts");
    const { openVault } = await import("../src/core/reach.ts");
    const { readRoots, writeRoots } = await import("../src/core/workspace/vaults/registry.ts");
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
    const { openVault } = await import("../src/core/reach.ts");
    const { readRoots, writeRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const { planRelink } = await import("../src/core/rename.ts");
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

describe("repairs from what the state knows (20.17)", () => {
  test("a named folder moved by hand: relink fixes its links out by a path, and the other roots' links into it, each in its form", async () => {
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
      return { code, json: JSON.parse(out.join("")) };
    };
    const base = mkdtempSync(join(tmpdir(), "slipbox-repair-"));
    const tag = basename(base).replace(/[^a-z0-9]/gi, "");
    const [a, b, c] = ["a", "b", "c"].map((v) => join(base, "x", v)) as [string, string, string];
    for (const [v, dir] of [
      ["a", a],
      ["b", b],
      ["c", c],
    ] as const) {
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
    const edits = dry.json.data.files.flatMap((f: { abs: string; edits: { before: string; after: string }[] }) =>
      f.edits.map((e) => [relative(base, f.abs), e.before, e.after]),
    );
    expect(edits.sort()).toEqual(
      [
        ["x/c/in.md", `[t](../a/t.md) [abs](${a}/t.md)`, `[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)`],
        ["y/deeper/a/out.md", "[n](../b/n.md#top) and [in](t.md)", "[n](../../../x/b/n.md#top) and [in](t.md)"],
      ].sort(),
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../a/t.md) [abs](${a}/t.md)\n`); // only shown so far
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect(readFileSync(join(moved, "out.md"), "utf8")).toBe(
      "[n](../../../x/b/n.md#top) and [in](t.md)\n\n[near](../near.md)\n",
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)\n`);
    // Fixed. b is a named folder that doesn't travel with a: the relink offers its pointer now (21.7).
    const offer = (await cli(["relink", "--dry-run"], moved)).json.data.files;
    expect(offer.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after))).toEqual([
      `[n](slipbox://b${tag}/n.md#top) and [in](t.md)`,
    ]);
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toEqual([]);
    // Moved again: the last move is the one to read from — and the pointer needs nothing.
    const again = join(base, "z", "a");
    mkdirSync(dirname(again), { recursive: true });
    renameSync(moved, again);
    await cli(["ls"], again);
    expect((await cli(["relink"], again)).code).toBe(0);
    expect(readFileSync(join(again, "out.md"), "utf8").split("\n")[0]).toBe(
      `[n](slipbox://b${tag}/n.md#top) and [in](t.md)`,
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../z/a/t.md) [abs](${again}/t.md)\n`);
  });

  test("a moved folder's warning counts the links its move broke — never relink's pointer offers for links still whole", async () => {
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
      return { code, json: JSON.parse(out.join("")) };
    };
    const base = mkdtempSync(join(tmpdir(), "slipbox-whole-"));
    const tag = basename(base)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const [a, b] = ["a", "b"].map((v) => join(base, "x", v)) as [string, string];
    for (const [v, dir] of [
      ["a", a],
      ["b", b],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      await cli(["init", dir, "--name", `w${v}${tag}`], dir);
    }
    writeFileSync(join(b, "n.md"), "# N\n");
    // A link by b's absolute path: whole wherever a goes, though relink would offer b's pointer for it.
    writeFileSync(join(a, "out.md"), `[n](${b}/n.md)\n`);
    for (const dir of [a, b]) await cli(["ls"], dir);
    const moved = join(base, "y", "a");
    mkdirSync(dirname(moved), { recursive: true });
    renameSync(a, moved);
    const said = (await cli(["ls"], moved)).json.warnings.join();
    expect(said).toContain(`moved here from ${a}`);
    expect(said).not.toContain("broke links");
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toHaveLength(1); // the offer is still made
  });
});

describe("generated edits as plans, in two steps (20.18)", () => {
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
    expect((await cli(["apply"], dir)).json.data.find((p: { id: string }) => p.id === id)).toMatchObject({
      command: "mv",
      kind: "note",
      from: "a.md",
      to: "b.md",
      root: dir,
      files: 1,
    }); // index.md: nothing written into the note itself (21.12)
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
    expect((await cli(["apply", id, "--dry-run"], dir)).json.warnings.join()).toContain(
      "stale: index.md changed since it was planned",
    );
    const refused = await cli(["apply", id], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain("changed since the preview");
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md) edited meanwhile\n");
  });
});

describe("plans write only inside the vault (VV-D6)", () => {
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
    return { code, json: JSON.parse(out.join("")) };
  };
  /** A test run with a home of its own: nothing it does is near the real one. */
  const homed = (fn: (home: string) => Promise<void>) => async () => {
    const before = process.env.HOME;
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    process.env.HOME = home;
    try {
      await fn(home);
    } finally {
      process.env.HOME = before;
    }
  };
  /** A vault, a folder outside it with notes, and a link to it from the vault that you follow. */
  const linked = async () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
    const vault = join(top, "vault");
    const outer = join(top, "out");
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    mkdirSync(join(outer, "sub"), { recursive: true });
    writeFileSync(join(vault, "a.md"), "# A\n\n## H\n");
    writeFileSync(join(outer, "x.md"), "# X\n\nsee [[a]] and [h](../a.md#h) TOKEN\n");
    writeFileSync(join(outer, "s.md"), "# S\n");
    writeFileSync(join(outer, "sub", "t.md"), "# T\n");
    const link = join(vault, "outdir");
    symlinkSync(outer, link);
    setLinkAnswer(link, "follow");
    await probe(outer);
    return { top, vault, outer, link };
  };

  test(
    "a rename's relinking, a replace across files, the converter and a heading's rename leave a note through a followed link out of the vault as it is, and say so",
    homed(async () => {
      const { vault, outer } = await linked();
      const x = readFileSync(join(outer, "x.md"), "utf8");
      const skipped = "outdir/x.md:3: a link leads it out of the vault: not rewritten";
      expect(JSON.stringify((await cli(["backlinks", "a.md"], vault)).json.data.backlinks)).toContain("outdir/x.md");
      for (const argv of [
        ["replace", "--all", "TOKEN", "CHANGED"],
        ["convert-links"],
        ["rename-heading", "a.md", "H", "Renamed"],
        ["mv", "a.md", "b.md"],
      ]) {
        const r = await cli(argv, vault);
        expect(r.code).toBe(0);
        expect(r.json.warnings).toContain(skipped);
        expect(readFileSync(join(outer, "x.md"), "utf8")).toBe(x);
      }
      // The rename itself went ahead in the vault.
      expect(existsSync(join(vault, "b.md"))).toBe(true);
    }),
  );

  test(
    "applying a plan writes nothing when any file of it, or what it moves, lands out of the vault",
    homed(async () => {
      const { vault, outer, link } = await linked();
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      type Plan = Parameters<typeof applyPlan>[1];
      const change = (abs: string, from: string, to: string) => {
        const text = readFileSync(abs, "utf8");
        return { abs, shown: "a.md", vault: null, edits: [], text, next: text.replace(from, to) };
      };
      const a = readFileSync(join(vault, "a.md"), "utf8");
      const x = readFileSync(join(outer, "x.md"), "utf8");
      const plan: Plan = {
        kind: "replace",
        from: "TOKEN",
        to: "CHANGED",
        move: null,
        files: [change(join(vault, "a.md"), "# A", "# CHANGED"), change(join(link, "x.md"), "TOKEN", "CHANGED")],
        warnings: [],
        skipped: [],
      };
      expect(() => applyPlan(g, plan)).toThrow(
        "outdir/x.md: a link leads it out of the vault, where nothing is written; nothing changed",
      );
      expect(readFileSync(join(vault, "a.md"), "utf8")).toBe(a);
      expect(readFileSync(join(outer, "x.md"), "utf8")).toBe(x);
      // A move out of the link's target, or into it.
      const moving = (from: string, to: string): Plan => ({
        kind: "note",
        from,
        to,
        move: { from: join(vault, from), to: join(vault, to), dir: false },
        files: [],
        warnings: [],
        skipped: [],
      });
      expect(() => applyPlan(g, moving("outdir/s.md", "s.md"))).toThrow("outdir/s.md resolves outside the vault");
      expect(() => applyPlan(g, moving("a.md", "outdir/a.md"))).toThrow("outdir/a.md resolves outside the vault");
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(vault, "s.md"))).toBe(false);
      expect(existsSync(join(vault, "a.md"))).toBe(true);
    }),
  );

  test(
    "a note or folder reached through a followed link out of the vault isn't moved out of it, in a vault or in home",
    homed(async (home) => {
      const { vault, outer } = await linked();
      const { planFolderMove, planNoteRename } = await import("../src/core/rename.ts");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planNoteRename(g, "outdir/s.md", "moved.md")).toThrow("outdir/s.md resolves outside the vault");
      expect(() => planFolderMove(g, "outdir/sub", "insub")).toThrow("outdir/sub resolves outside the vault");
      const note = await cli(["mv", "outdir/s.md", "moved.md"], vault);
      expect(note.code).toBe(5);
      expect(note.json.error.message).toBe("outdir/s.md resolves outside the vault");
      expect((await cli(["mv", "outdir/sub", "insub"], vault)).code).toBe(5);
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(outer, "sub", "t.md"))).toBe(true);
      expect(existsSync(join(vault, "moved.md"))).toBe(false);
      expect(existsSync(join(vault, "insub"))).toBe(false);
      // Home writes a note's text through a link it follows; a move across the link, never.
      writeFileSync(join(home, "n.md"), "# N\n");
      symlinkSync(outer, join(home, "data"));
      setLinkAnswer(join(home, "data"), "follow");
      const homeMove = await cli(["mv", "data/s.md", "s.md"], home);
      expect(homeMove.code).toBe(5);
      expect(homeMove.json.error.message).toBe("data/s.md resolves outside the vault");
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(home, "s.md"))).toBe(false);
    }),
  );

  test(
    "a followed link out of the vault, named itself, is renamed and moved as a link: its target stays where it is",
    homed(async () => {
      const { top, vault, outer, link } = await linked();
      const { planFolderMove, planNoteRename } = await import("../src/core/rename.ts");
      // A file link, and a relative one to a folder of its own.
      const file = join(vault, "ext.md");
      symlinkSync(join(outer, "s.md"), file);
      setLinkAnswer(file, "follow");
      await probe(join(outer, "s.md"));
      mkdirSync(join(top, "far"));
      writeFileSync(join(top, "far", "f.md"), "# F\n");
      const rel = join(vault, "rel");
      symlinkSync("../far", rel);
      setLinkAnswer(rel, "follow");
      await probe(join(top, "far"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](outdir/s.md), [e](ext.md) and [f](rel/f.md)\n");
      mkdirSync(join(vault, "box"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(planFolderMove(g, "outdir", "outlink").move).toEqual({
        from: link,
        to: join(vault, "outlink"),
        dir: true,
        link: true,
      });
      expect(planNoteRename(g, "ext.md", "box/ext.md").move?.to).toBe(join(vault, "box", "ext.md"));
      // Through the CLI: each link moves, what it leads to stays, and the links to it follow.
      const before = readdirSync(outer).sort();
      expect((await cli(["mv", "outdir", "outlink"], vault)).code).toBe(0);
      expect((await cli(["mv", "ext.md", "box/"], vault)).code).toBe(0);
      const moved = await cli(["mv", "rel", "box/"], vault);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings).toContain(
        `rel is a relative link: written again at box/rel to lead where it did (${join("..", "..", "far")})`,
      );
      expect(lstatSync(join(vault, "outlink")).isSymbolicLink()).toBe(true);
      expect(realpathSync(join(vault, "outlink"))).toBe(outer);
      expect(realpathSync(join(vault, "box", "ext.md"))).toBe(join(outer, "s.md"));
      // A relative one written again, to lead where it did.
      expect(readlinkSync(join(vault, "box", "rel"))).toBe(join("..", "..", "far"));
      expect([existsSync(link), existsSync(file), existsSync(rel)]).toEqual([false, false, false]);
      expect(readdirSync(outer).sort()).toEqual(before);
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe(
        "# B\n\n[s](outlink/s.md), [e](box/ext.md) and [f](box/rel/f.md)\n",
      );
      // Still followed where they are: read through, and listed there.
      for (const at of ["outlink", "box/ext.md", "box/rel"]) expect(linkAnswer(join(vault, at))).toBe("follow");
      expect((await cli(["read", "outlink/s.md"], vault)).code).toBe(0);
      expect((await cli(["read", "box/rel/f.md"], vault)).code).toBe(0);
      const keys = () =>
        (JSON.parse(readFileSync(linksFile(), "utf8")).links as { link: string }[])
          .map((e) => e.link)
          .filter((k) => k.startsWith(`${vault}/`));
      expect(keys().sort()).toEqual([join(vault, "box", "ext.md"), join(vault, "box", "rel"), join(vault, "outlink")]);
      // Undone, each link is back where it was, as it was written, its answer with it; the relative one said again.
      const undone = await cli(["undo"], vault);
      expect(undone.code).toBe(0);
      expect(undone.json.warnings).toContain(
        "box/rel is a relative link: written again at rel to lead where it did (../far)",
      );
      for (let i = 0; i < 2; i++) expect((await cli(["undo"], vault)).code).toBe(0);
      expect([lstatSync(link), lstatSync(file), lstatSync(rel)].map((s) => s.isSymbolicLink())).toEqual([
        true,
        true,
        true,
      ]);
      expect(readlinkSync(rel)).toBe("../far");
      expect(keys().sort()).toEqual([link, file, rel].sort());
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe(
        "# B\n\n[s](outdir/s.md), [e](ext.md) and [f](rel/f.md)\n",
      );
      // What the link leads to is still never moved out of it, nor into it; nor a link inside it.
      const g2 = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planNoteRename(g2, "outdir/s.md", "s.md")).toThrow("outdir/s.md resolves outside the vault");
      expect(() => planNoteRename(g2, "a.md", "outdir/a.md")).toThrow("outdir/a.md would land outside the vault");
      symlinkSync(join(outer, "s.md"), join(outer, "inner.md"));
      const inner = { from: join(link, "inner.md"), to: join(vault, "inner.md"), dir: false, link: true };
      const plan = { kind: "note" as const, from: "outdir/inner.md", to: "inner.md", move: inner, files: [] };
      expect(() => applyPlan(g2, { ...plan, warnings: [], skipped: [] })).toThrow(
        "outdir/inner.md resolves outside the vault",
      );
      expect(lstatSync(join(outer, "inner.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "in home, a file reached through a followed link is written through it, never over it: by a rename's relinking, and moving the link itself",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "s.md"), "# S\n\nsee [a](a.md)\n");
      const ext = join(home, "ext.md");
      symlinkSync(join(top, "s.md"), ext);
      setLinkAnswer(ext, "follow");
      await probe(join(top, "s.md"));
      expect((await cli(["mv", "a.md", "z.md"], home)).code).toBe(0);
      expect(lstatSync(ext).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](z.md)\n");
      // The link moved, its own link rewritten from where it is now: in what it leads to.
      mkdirSync(join(home, "box"));
      expect((await cli(["mv", "ext.md", "box/"], home)).code).toBe(0);
      expect(lstatSync(join(home, "box", "ext.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](../z.md)\n");
      expect(linkAnswer(join(home, "box", "ext.md"))).toBe("follow");
      expect((await cli(["undo"], home)).code).toBe(0);
      expect(lstatSync(ext).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](z.md)\n");
    }),
  );

  test(
    "a followed link to a vault, or to a folder holding one, isn't moved by its name: a vault's place is its real path",
    homed(async () => {
      const { recordLocation, rootAt } = await import("../src/core/workspace/vaults/vault.ts");
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const other = join(top, "other");
      const held = join(top, "holder", "v2");
      for (const d of [vault, other, held]) mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(other, "o.md"), "# O\n");
      writeFileSync(join(held, "h.md"), "# H\n");
      writeFileSync(join(vault, "a.md"), "# A\n\n[o](ov/o.md) and [h](hold/v2/h.md)\n");
      symlinkSync(other, join(vault, "ov"));
      symlinkSync(join(top, "holder"), join(vault, "hold"));
      for (const [link, target] of [
        ["ov", other],
        ["hold", join(top, "holder")],
      ] as const) {
        setLinkAnswer(join(vault, link), "follow");
        await probe(target);
      }
      for (const v of [other, vault]) recordLocation(rootAt(v));
      const roots = () =>
        readRoots()
          .map((r) => r.path)
          .sort();
      const before = roots();
      for (const [from, to] of [
        ["ov", "ov2"],
        ["hold", "held"],
      ] as const) {
        const r = await cli(["mv", from, to], vault);
        expect([r.code, r.json.error.message]).toEqual([5, `${from} resolves outside the vault`]);
        expect(lstatSync(join(vault, from)).isSymbolicLink()).toBe(true);
      }
      expect(roots()).toEqual(before);
      expect(readFileSync(join(vault, "a.md"), "utf8")).toBe("# A\n\n[o](ov/o.md) and [h](hold/v2/h.md)\n");
      // Carried out as a plan made before the link was there: refused as it's carried out.
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const move = { from: join(vault, "ov"), to: join(vault, "ov2"), dir: true };
      const plan = { kind: "folder" as const, from: "ov", to: "ov2", move, files: [], warnings: [], skipped: [] };
      expect(() => applyPlan(g, { ...plan, vaults: [[move.from, move.to]] })).toThrow("ov resolves outside the vault");
      // Planned as a link, with the vault moving with it: still refused.
      const asLink = { ...plan, move: { ...move, link: true }, vaults: [[move.from, move.to]] as [string, string][] };
      expect(() => applyPlan(g, asLink)).toThrow("ov resolves outside the vault");
      expect(lstatSync(join(vault, "ov")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a rename's relinking never writes through a link into a folder the walk doesn't list, in a vault or home: said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, ".hidden"));
      mkdirSync(join(vault, "box"));
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, ".hidden", "n.md"), "# N\n\nsee [a](a.md)\n");
      symlinkSync(".hidden/n.md", join(vault, "n.md"));
      const r = await cli(["mv", "a.md", "z.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain("n.md:3: a link leads it into a folder the walk doesn't list: not rewritten");
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\nsee [a](a.md)\n");
      // The link moved itself: its own links aren't written there either.
      expect((await cli(["mv", "n.md", "box/"], vault)).code).toBe(0);
      expect(lstatSync(join(vault, "box", "n.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\nsee [a](a.md)\n");
      // Home's own: a note that is a link to ~/.bashrc.
      writeFileSync(join(home, "b.md"), "# B\n");
      writeFileSync(join(home, ".bashrc"), "# rc\n\n[b](b.md)\n");
      symlinkSync(join(home, ".bashrc"), join(home, "rc.md"));
      expect((await cli(["mv", "b.md", "c.md"], home)).code).toBe(0);
      expect(readFileSync(join(home, ".bashrc"), "utf8")).toBe("# rc\n\n[b](b.md)\n");
    }),
  );

  test(
    "a file link moved where a link leading nowhere is: refused, nothing written; one shared with another name keeps its own links",
    homed(async (home) => {
      const { planNoteRename } = await import("../src/core/rename.ts");
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "s.md"), "# S\n\nsee [a](a.md)\n");
      writeFileSync(join(home, "b.md"), "# B\n\n[e](e1.md)\n");
      for (const n of ["e1.md", "e2.md"]) {
        symlinkSync(join(top, "s.md"), join(home, n));
        setLinkAnswer(join(home, n), "follow");
      }
      await probe(join(top, "s.md"));
      mkdirSync(join(home, "box"));
      // Planned, then a link leading nowhere put where it goes: carried out, refused, nothing written.
      const g = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      const plan = planNoteRename(g, "e1.md", "box/e1.md");
      symlinkSync(join(top, "gone.md"), join(home, "box", "e1.md"));
      expect(() => applyPlan(g, plan)).toThrow("exists now; nothing changed");
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](e1.md)\n");
      expect(lstatSync(join(home, "e1.md")).isSymbolicLink()).toBe(true);
      const there = await cli(["mv", "e1.md", "box/"], home);
      expect([there.code, there.json.error.message]).toEqual([5, "box/e1.md exists; not overwriting it"]);
      rmSync(join(home, "box", "e1.md"));
      // Where it can't be made (its folder can't be written), nothing is written either.
      chmodSync(join(home, "box"), 0o500);
      try {
        expect(() => applyPlan(g, plan)).toThrow("e1.md can't be moved (EACCES); nothing changed");
      } finally {
        chmodSync(join(home, "box"), 0o755);
      }
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](e1.md)\n");
      // What it leads to is e2.md's too: its links are left as they are, and said.
      const moved = await cli(["mv", "e1.md", "box/"], home);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings).toContain("e1.md: what it leads to is e2.md too: its own links left as they are");
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](a.md)\n");
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](box/e1.md)\n");
    }),
  );

  test(
    "undo moves back only what moved as it moved: a link put where a folder went isn't moved back as a link",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const ext = join(top, "ext");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "a"));
      mkdirSync(ext);
      writeFileSync(join(vault, "a", "n.md"), "# N\n");
      writeFileSync(join(ext, "n.md"), "# N\n\nfrom outside\n");
      expect((await cli(["mv", "a", "b"], vault)).code).toBe(0);
      rmSync(join(vault, "b"), { recursive: true });
      symlinkSync(ext, join(vault, "b")); // a pull made it a link out
      const r = await cli(["undo"], vault);
      expect([r.code, r.json.error.message]).toEqual([
        5,
        "b resolves outside the vault: the move of a/ can't be undone",
      ]);
      expect([lstatSync(join(vault, "b")).isSymbolicLink(), existsSync(join(vault, "a"))]).toEqual([true, false]);
    }),
  );

  test(
    "a folder moved with a relative file link in it that leads out of it: the link's note left as it is, said — never written where the moved link leads",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "a", "docs"), { recursive: true });
      writeFileSync(join(vault, "a", "b.md"), "# B\n");
      // The note kept where the walk leaves it out, reached by its link only; beside the vault, where the link moved up
      // leads.
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      writeFileSync(join(vault, "shelf", "kept.md"), "# Kept\n\n[b](../b.md)\n");
      mkdirSync(join(top, "shelf"));
      writeFileSync(join(top, "shelf", "kept.md"), "# Outside\n");
      symlinkSync("../../shelf/kept.md", join(vault, "a", "docs", "kept.md"));
      const r = await cli(["mv", "a/docs", "docs"], vault);
      expect(r.code).toBe(0);
      // Moved with its folder, the link leads elsewhere after: an edit for it is right for no name.
      expect(r.json.warnings).toContain(
        "a/docs/kept.md:3: a link moving with its folder leads elsewhere after: not rewritten",
      );
      expect(readFileSync(join(vault, "shelf", "kept.md"), "utf8")).toBe("# Kept\n\n[b](../b.md)\n");
      expect(readFileSync(join(top, "shelf", "kept.md"), "utf8")).toBe("# Outside\n");
      expect(lstatSync(join(vault, "docs", "kept.md")).isSymbolicLink()).toBe(true);
      // Undone, the folder back, nothing to give back: never read through the moved link.
      const undone = await cli(["undo"], vault);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(readFileSync(join(vault, "shelf", "kept.md"), "utf8")).toBe("# Kept\n\n[b](../b.md)\n");
      expect(readFileSync(join(top, "shelf", "kept.md"), "utf8")).toBe("# Outside\n");
      expect(lstatSync(join(vault, "a", "docs", "kept.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a link moved onto what it leads to, or onto another link to it, is refused: nothing is put over it",
    homed(async () => {
      const { vault, outer, link } = await linked();
      writeFileSync(join(vault, "img.png"), "PNG");
      symlinkSync("img.png", join(vault, "alias.png"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[a](a.md)\n");
      symlinkSync("b.md", join(vault, "e.md"));
      const two = join(vault, "outdir2");
      symlinkSync(outer, two);
      setLinkAnswer(two, "follow");
      for (const [from, to, why] of [
        ["alias.png", "img.png", /^img\.png exists; not overwriting it$/],
        ["e.md", "b.md", /^b\.md exists; not overwriting it$/],
        // A folder there is one to go into, not itself: through the link, out of the vault — or, the walk listing the
        // other of two links to one folder, no folder of the index.
        ["outdir", "outdir2", /^(outdir2\/outdir would land outside the vault|no folder outdir in .*)$/],
      ] as const) {
        const r = await cli(["mv", from, to], vault);
        expect(r.code).toBe(5);
        expect(r.json.error?.message).toMatch(why);
      }
      expect(readFileSync(join(vault, "img.png"), "utf8")).toBe("PNG");
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe("# B\n\n[a](a.md)\n");
      for (const l of ["alias.png", "e.md", "outdir", "outdir2"])
        expect(lstatSync(join(vault, l)).isSymbolicLink()).toBe(true);
      expect([linkAnswer(link), linkAnswer(two)]).toEqual(["follow", "follow"]);
    }),
  );

  test(
    "a file reached by two links from two folders isn't written for either: said; two names moved together, written once",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      mkdirSync(join(vault, "sub"));
      writeFileSync(join(vault, "sub", "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "s.md"), "# S\n\n[x](sub/a.md) [y](a.md)\n");
      // Two links to it, each reading its links from its own folder: each would edit it its own way.
      symlinkSync("shelf/s.md", join(vault, "e1.md"));
      symlinkSync("../shelf/s.md", join(vault, "sub", "e2.md"));
      const r = await cli(["mv", "sub/a.md", "sub/z.md"], vault);
      expect(r.code).toBe(0);
      const why = (other: string) => `reached as ${other} too, from another folder: not rewritten`;
      expect(r.json.warnings).toEqual(
        expect.arrayContaining([`e1.md:3: ${why("sub/e2.md")}`, `sub/e2.md:3: ${why("e1.md")}`]),
      );
      expect(readFileSync(join(vault, "shelf", "s.md"), "utf8")).toBe("# S\n\n[x](sub/a.md) [y](a.md)\n");
      expect((await cli(["undo"], vault)).code).toBe(0);
      // Both names moved together, by the same way: each edits it the same, so it's written once.
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "t.md"), "# T\n\n[a](../a.md)\n");
      mkdirSync(join(vault, "box"));
      for (const n of ["e3.md", "e4.md"]) symlinkSync(join(vault, "shelf", "t.md"), join(vault, "box", n));
      const moved = await cli(["mv", "box", "deep/box"], vault);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings.filter((w: string) => w.includes("too"))).toEqual([]);
      expect(moved.json.data.files.map((f: { path: string }) => f.path)).toEqual(["box/e3.md"]);
      expect(readFileSync(join(vault, "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../../a.md)\n");
      expect((await cli(["undo"], vault)).code).toBe(0);
      expect(readFileSync(join(vault, "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../a.md)\n");
      // Written once, through one name: the other's links indexed again too, as an undo's.
      const g = openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false);
      const { planNoteRename } = await import("../src/core/rename.ts");
      applyPlan(g, planNoteRename(g, "a.md", "b.md"));
      const from = (rel: string) =>
        g
          .backlinks(rel)
          .map((b) => b.from)
          .sort();
      expect(from("b.md")).toEqual(["box/e3.md", "box/e4.md"]);
      applyPlan(g, planUndo(g));
      expect(from("a.md")).toEqual(["box/e3.md", "box/e4.md", "e1.md"]);
      // Two names in one folder edited otherwise each: neither is written, both said.
      const { Collector } = await import("../src/core/rename-plan.ts");
      const c = new Collector(openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false));
      for (const [n, to] of [
        ["e3.md", "[a](x.md)"],
        ["e4.md", "[a](y.md)"],
      ] as const)
        c.line(join(vault, "box", n), null, 3, () => to, "");
      expect(c.result()).toEqual([]);
      expect(c.skipped.map((x) => `${x.shown}:${x.line}: ${x.reason}`)).toEqual([
        "box/e3.md:3: reached as box/e4.md too, edited otherwise there: not rewritten",
        "box/e4.md:3: reached as box/e3.md too, edited otherwise there: not rewritten",
      ]);
    }),
  );

  test(
    "a reached note in a hidden folder that is a link into another hidden folder isn't written through: as it's refused named",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      for (const d of [".notes", ".private"]) mkdirSync(join(vault, d));
      writeFileSync(join(vault, "a.md"), "# A\n\n[n](.notes/n.md)\n");
      writeFileSync(join(vault, "b.md"), "# B\n");
      writeFileSync(join(vault, ".private", "p.md"), "# P\n\n[b](../b.md)\n");
      symlinkSync("../.private/p.md", join(vault, ".notes", "n.md"));
      const r = await cli(["mv", "b.md", "c.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        ".notes/n.md:3: a link leads it into a folder the walk doesn't list: not rewritten",
      );
      expect(readFileSync(join(vault, ".private", "p.md"), "utf8")).toBe("# P\n\n[b](../b.md)\n");
    }),
  );

  test(
    "a note of another vault reached through a link isn't written for the link's reading of it: its own vault reads its links otherwise; said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const parent = join(top, "parent");
      const nested = join(parent, "sub", "n");
      for (const d of [parent, nested]) mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(parent, "t.md"), "# T\n");
      writeFileSync(join(nested, "t.md"), "# NT\n"); // its own `t.md`, as it reads the link
      writeFileSync(join(nested, "n.md"), "# N\n\n[t](t.md)\n");
      symlinkSync("sub/n/n.md", join(parent, "alias.md"));
      const r = await cli(["mv", "t.md", "u.md"], parent);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain("alias.md:3: reached as sub/n/n.md too, from another folder: not rewritten");
      expect(readFileSync(join(nested, "n.md"), "utf8")).toBe("# N\n\n[t](t.md)\n");
      // In home, through a followed link into a vault of home's, and one into a vault out of it.
      mkdirSync(join(home, "notes", ".slipbox"), { recursive: true });
      writeFileSync(join(home, "notes", "a.md"), "# NA\n");
      writeFileSync(join(home, "notes", "s.md"), "# S\n\n[a](a.md)\n");
      writeFileSync(join(home, "a.md"), "# A\n");
      symlinkSync("notes/s.md", join(home, "ext.md"));
      mkdirSync(join(top, "proj", ".slipbox"), { recursive: true });
      writeFileSync(join(top, "proj", "a.md"), "# PA\n");
      writeFileSync(join(top, "proj", "p.md"), "# P\n\n[a](a.md)\n");
      symlinkSync(join(top, "proj", "p.md"), join(home, "far.md"));
      setLinkAnswer(join(home, "far.md"), "follow");
      await probe(join(top, "proj", "p.md"));
      const h = await cli(["mv", "a.md", "z.md"], home);
      expect(h.code).toBe(0);
      expect(h.json.warnings).toEqual(
        expect.arrayContaining([
          "ext.md:3: reached as notes/s.md too, from another folder: not rewritten",
          `far.md:3: reached as ${join(top, "proj", "p.md")} too, from another folder: not rewritten`,
        ]),
      );
      expect(readFileSync(join(home, "notes", "s.md"), "utf8")).toBe("# S\n\n[a](a.md)\n");
      expect(readFileSync(join(top, "proj", "p.md"), "utf8")).toBe("# P\n\n[a](a.md)\n");
    }),
  );

  test(
    "in home, a folder moved with a followed link in it: the link's note left, said — not followed at its new place — and the move undone",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(top, "out", "s.md"), "# S\n\n[z](../z.md)\n");
      writeFileSync(join(home, "z.md"), "# Z\n");
      mkdirSync(join(home, "a"));
      symlinkSync(join(top, "out", "s.md"), join(home, "a", "l.md"));
      setLinkAnswer(join(home, "a", "l.md"), "follow");
      await probe(join(top, "out", "s.md"));
      const r = await cli(["mv", "a", "b/c/a"], home);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "a/l.md:3: a followed link moving with its folder isn't followed at its new place: not rewritten",
      );
      expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\n[z](../z.md)\n");
      const undone = await cli(["undo"], home);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(lstatSync(join(home, "a", "l.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a folder moved with links in it, each judged by where it leads after, as the disk reads it: an absolute one into the folder left, said; a relative one through another link written",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      writeFileSync(join(vault, "a.md"), "# A\n");
      // An absolute link to a note in the folder itself: it leads nowhere once the folder has moved.
      mkdirSync(join(vault, "box", "shelf"), { recursive: true });
      writeFileSync(join(vault, "box", "shelf", "t.md"), "# T\n\n[a](../a.md)\n");
      symlinkSync(join(vault, "box", "shelf", "t.md"), join(vault, "box", "l.md"));
      // A relative one whose way goes through another link and back up: it leads where it did.
      mkdirSync(join(vault, "shelf", "inner"), { recursive: true });
      writeFileSync(join(vault, "shelf", "u.md"), "# U\n\n[a](../a.md)\n");
      symlinkSync(join(vault, "shelf", "inner"), join(vault, "box", "lnk"));
      symlinkSync("lnk/../u.md", join(vault, "box", "c.md"));
      mkdirSync(join(vault, "deep"));
      const r = await cli(["mv", "box", "deep/box"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "box/l.md:3: a link moving with its folder leads elsewhere after: not rewritten",
      );
      expect(readFileSync(join(vault, "deep", "box", "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../a.md)\n");
      expect(r.json.warnings.filter((w: string) => w.startsWith("box/c.md"))).toEqual([]);
      expect(readFileSync(join(vault, "shelf", "u.md"), "utf8")).toBe("# U\n\n[a](../../a.md)\n");
      const undone = await cli(["undo"], vault);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(readFileSync(join(vault, "shelf", "u.md"), "utf8")).toBe("# U\n\n[a](../a.md)\n");
    }),
  );

  test(
    "a data file and a link to it from another folder: a rename writes it for neither, said",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      for (const d of ["docs", "other"]) mkdirSync(join(vault, d));
      writeFileSync(join(vault, "docs", "real.json"), '{"$ref": "./x.md"}\n');
      writeFileSync(join(vault, "docs", "x.md"), "# X\n");
      writeFileSync(join(vault, "other", "x.md"), "# OX\n");
      symlinkSync("../docs/real.json", join(vault, "other", "alias.json")); // from other/, its `./x.md` is other's
      const r = await cli(["mv", "docs/x.md", "docs/sub/x.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "docs/real.json:1: reached as other/alias.json too, from another folder: not rewritten",
      );
      expect(readFileSync(join(vault, "docs", "real.json"), "utf8")).toBe('{"$ref": "./x.md"}\n');
    }),
  );

  test(
    "a move planned, its note gone before it's carried out: refused, nothing written; a rename onto a second name for the file (a hard link): refused",
    homed(async () => {
      const { vault } = await linked();
      writeFileSync(join(vault, "index.md"), "# Index\n\n[a](a.md)\n");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const { planNoteRename } = await import("../src/core/rename.ts");
      const plan = planNoteRename(g, "a.md", "b.md");
      rmSync(join(vault, "a.md"));
      expect(() => applyPlan(g, plan)).toThrow("a.md isn't there any more; nothing changed");
      expect(readFileSync(join(vault, "index.md"), "utf8")).toBe("# Index\n\n[a](a.md)\n");
      // Two names for one file (hard links) — another name in its folder, its name in another — aren't one entry: the
      // second isn't the first's case-only rename.
      mkdirSync(join(vault, "sub"));
      writeFileSync(join(vault, "sub", "h.md"), "# H\n");
      linkSync(join(vault, "sub", "h.md"), join(vault, "sub", "h2.md"));
      linkSync(join(vault, "sub", "h.md"), join(vault, "h.md"));
      for (const [to, why] of [
        ["sub/h2.md", "sub/h2.md exists; not overwriting it"],
        ["h.md", "h.md exists; not overwriting it"],
      ] as const) {
        const r = await cli(["mv", "sub/h.md", to], vault);
        expect([r.code, r.json.error?.message]).toEqual([5, why]);
      }
      expect(readFileSync(join(vault, "sub", "h.md"), "utf8")).toBe("# H\n");
    }),
  );

  test(
    "a folder moved with a followed link out in it: nothing read through the link at its new place, not followed there; a stale answer isn't one",
    homed(async () => {
      const { top, vault } = await linked();
      mkdirSync(join(top, "out2"));
      writeFileSync(join(top, "out2", "s.md"), "# S\n");
      mkdirSync(join(vault, "a"));
      symlinkSync(join(top, "out2"), join(vault, "a", "out"));
      setLinkAnswer(join(vault, "a", "out"), "follow");
      await probe(join(top, "out2"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](a/out/s.md)\n");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(g.notes.has("a/out/s.md")).toBe(true);
      const { planFolderMove } = await import("../src/core/rename.ts");
      applyPlan(g, planFolderMove(g, "a", "c"));
      expect([...g.notes.keys()].filter((r) => r.startsWith("c/out/"))).toEqual([]);
      expect(g.skipped.some((x) => x.rel === "c/out")).toBe(true);
      // A link once followed elsewhere, its answer for another target now: not followed, so judged by where it leads.
      mkdirSync(join(vault, ".slipbox-free", "shelf"), { recursive: true });
      const shelf = join(vault, "shelf2");
      mkdirSync(shelf);
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf2/"]\n');
      writeFileSync(join(shelf, "x.md"), "# X\n\n[b](../b.md)\n");
      mkdirSync(join(vault, "f"));
      symlinkSync(join(top, "out2", "s.md"), join(vault, "f", "l.md"));
      setLinkAnswer(join(vault, "f", "l.md"), "follow"); // kept for out2/s.md
      rmSync(join(vault, "f", "l.md"));
      symlinkSync(join(shelf, "x.md"), join(vault, "f", "l.md")); // re-pointed into the vault
      mkdirSync(join(vault, "deep"));
      const r = await cli(["mv", "f", "deep/f"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings.filter((w: string) => w.includes("followed link moving"))).toEqual([]);
      expect(readFileSync(join(shelf, "x.md"), "utf8")).toBe("# X\n\n[b](../../b.md)\n");
    }),
  );

  test(
    "in home, an undo reads nothing through a link not followed: refused before it's read, said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(top, "out", "s.md"), "# S\n\n[a](../a.md)\n");
      writeFileSync(join(home, "a.md"), "# A\n");
      mkdirSync(join(home, "box"));
      symlinkSync(join(top, "out"), join(home, "outdir"));
      setLinkAnswer(join(home, "outdir"), "follow");
      await probe(join(top, "out"));
      const shared = join(process.env.XDG_STATE_HOME!, "slipbox");
      const g0 = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      mkdirSync(stateDir(g0.loc), { recursive: true });
      const move = async () => {
        chmodSync(shared, 0o500);
        try {
          expect((await cli(["mv", "outdir", "box/outdir"], home)).code).toBe(0);
        } finally {
          chmodSync(shared, 0o755);
        }
        expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\n[a](../../a.md)\n");
      };
      // The note it wrote is reached through the link, not followed at its new name: refused before it's read.
      await move();
      const r = await cli(["undo"], home);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toBe(
        "outdir/s.md is reached through a link that isn't followed: the move of outdir/ can't be undone",
      );
    }),
  );

  test(
    "a link to an image moved by its name: nothing said of its own links, which it has none of",
    homed(async () => {
      const { vault } = await linked();
      writeFileSync(join(vault, "img.png"), "PNG");
      symlinkSync("img.png", join(vault, "alias.png"));
      mkdirSync(join(vault, "box"));
      const r = await cli(["mv", "alias.png", "box/"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings.filter((w: string) => w.includes("its own links"))).toEqual([]);
    }),
  );

  test(
    "a move that can't be finished changes nothing: what a link leads to can't be written there, what moves can't leave its folder or go into one",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "out", "s.md"), "# S\n\nsee [a](a.md)\n");
      writeFileSync(join(home, "b.md"), "# B\n\n[e](ext.md) [r](box/rel.md)\n");
      const ext = join(home, "ext.md");
      symlinkSync(join(top, "out", "s.md"), ext);
      setLinkAnswer(ext, "follow");
      await probe(join(top, "out", "s.md"));
      mkdirSync(join(home, "box"));
      writeFileSync(join(home, "t.md"), "# T\n");
      symlinkSync("../t.md", join(home, "box", "rel.md"));
      const b = readFileSync(join(home, "b.md"), "utf8");
      // What it leads to is in a folder that can't be written: its own link can't be, so nothing moves.
      chmodSync(join(top, "out"), 0o500);
      try {
        const r = await cli(["mv", "ext.md", "deep/"], home);
        expect([r.code, r.json.error?.message]).toEqual([
          5,
          "ext.md can't be written where it is (EACCES); nothing changed",
        ]);
      } finally {
        chmodSync(join(top, "out"), 0o755);
      }
      expect([lstatSync(ext).isSymbolicLink(), existsSync(join(home, "deep"))]).toEqual([true, false]);
      expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\nsee [a](a.md)\n");
      // A link that can't leave its folder: the folders made for it are taken away again.
      chmodSync(join(home, "box"), 0o500);
      try {
        const r = await cli(["mv", "box/rel.md", "new/sub/rel.md"], home);
        expect([r.code, r.json.error?.message]).toEqual([5, "box/rel.md can't be moved (EACCES); nothing changed"]);
      } finally {
        chmodSync(join(home, "box"), 0o755);
      }
      expect([lstatSync(join(home, "box", "rel.md")).isSymbolicLink(), existsSync(join(home, "new"))]).toEqual([
        true,
        false,
      ]);
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe(b);
      // A note moved into a folder that can't be written, a folder out of one: nothing written, nothing made.
      writeFileSync(join(home, "c.md"), "# C\n\n[a](a.md)\n");
      mkdirSync(join(home, "ro"));
      mkdirSync(join(home, "shut", "f"), { recursive: true });
      writeFileSync(join(home, "shut", "f", "n.md"), "# N\n");
      for (const d of ["ro", "shut"]) chmodSync(join(home, d), 0o500);
      try {
        const into = await cli(["mv", "a.md", "ro/"], home);
        expect([into.code, into.json.error?.message]).toEqual([5, "a.md can't be moved (EACCES); nothing changed"]);
        const out = await cli(["mv", "shut/f", "new2/f"], home);
        expect([out.code, out.json.error?.message]).toEqual([5, "shut/f can't be moved (EACCES); nothing changed"]);
      } finally {
        for (const d of ["ro", "shut"]) chmodSync(join(home, d), 0o755);
      }
      expect(readFileSync(join(home, "c.md"), "utf8")).toBe("# C\n\n[a](a.md)\n");
      expect([existsSync(join(home, "a.md")), existsSync(join(home, "new2"))]).toEqual([true, false]);
      // Planned, then its folder made one that can be written but not searched: refused as it's carried out.
      mkdirSync(join(home, "src"));
      writeFileSync(join(home, "src", "s.md"), "# S\n");
      writeFileSync(join(home, "ref.md"), "# Ref\n\n[s](src/s.md)\n");
      const { planNoteRename } = await import("../src/core/rename.ts");
      const plan = planNoteRename(openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false), "src/s.md", "s.md");
      chmodSync(join(home, "src"), 0o600);
      try {
        expect(() => applyPlan(openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false), plan)).toThrow(
          "src/s.md can't be moved (EACCES); nothing changed",
        );
      } finally {
        chmodSync(join(home, "src"), 0o755);
      }
      expect(readFileSync(join(home, "ref.md"), "utf8")).toBe("# Ref\n\n[s](src/s.md)\n");
    }),
  );

  test(
    "a followed link moved where its answer can't be kept: said, in the CLI's data too, and nothing read through it at its new name",
    homed(async () => {
      const { vault, outer, link } = await linked();
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](outdir/s.md)\n");
      const shared = join(process.env.XDG_STATE_HOME!, "slipbox");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      mkdirSync(stateDir(g.loc), { recursive: true }); // the vault's own, there from its first use: its log written
      const { planFolderMove } = await import("../src/core/rename.ts");
      const plan = planFolderMove(g, "outdir", "outlink");
      const heard: string[] = [];
      g.onChange((c) => {
        if ("path" in c && c.path.startsWith("outlink/")) heard.push(c.path);
      });
      chmodSync(shared, 0o500);
      try {
        expect(applyPlan(g, plan).warnings).toEqual([
          expect.stringContaining("the link moved, but its answer couldn't be kept for its new place (EACCES)"),
        ]);
      } finally {
        chmodSync(shared, 0o755);
      }
      expect(lstatSync(join(vault, "outlink")).isSymbolicLink()).toBe(true);
      expect([...g.notes.keys()].filter((r) => r.startsWith("outlink/"))).toEqual([]);
      expect(g.dirs.filter((d) => d === "outlink" || d.startsWith("outlink/"))).toEqual([]);
      expect(g.skipped.some((x) => x.rel === "outlink")).toBe(true); // a link of its own, not followed
      expect(heard).toEqual([]); // nothing read through it
      expect(linkAnswer(link, outer)).toBe("follow"); // where it was
      // Not followed at its new name, it isn't the index's to move: undone, it's back where its answer is, followed.
      expect((await cli(["undo"], vault)).code).toBe(0);
      expect(linkAnswer(link)).toBe("follow");
      // The command line's JSON says it in its data, as the plan's own warnings.
      chmodSync(shared, 0o500);
      try {
        const r = await cli(["mv", "outdir", "outlink"], vault);
        expect(r.code).toBe(0);
        expect(r.json.data.warnings).toEqual([
          expect.stringContaining("its answer couldn't be kept for its new place"),
        ]);
      } finally {
        chmodSync(shared, 0o755);
      }
    }),
  );

  test(
    "a vault reached through a followed link is named as before: its own config.toml written, not taken for a hidden folder",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "proj", ".slipbox"), { recursive: true });
      writeFileSync(join(top, "proj", ".slipbox", "config.toml"), '[vault]\nname = "proj"\n');
      writeFileSync(join(top, "proj", "n.md"), "# N\n");
      writeFileSync(join(home, "h.md"), "# H\n");
      symlinkSync(join(top, "proj"), join(home, "work"));
      setLinkAnswer(join(home, "work"), "follow");
      await probe(join(top, "proj"));
      const { planVaultRename } = await import("../src/core/rename.ts");
      const g = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      applyPlan(g, planVaultRename(rootAt(join(home, "work")), "proj2"));
      expect(readFileSync(join(top, "proj", ".slipbox", "config.toml"), "utf8")).toContain('name = "proj2"');
      expect(lstatSync(join(top, "proj", ".slipbox", "config.toml")).isFile()).toBe(true);
    }),
  );

  test(
    "a note the vault reached in a hidden folder, and a link to it from another folder: written for neither name, said",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, ".hidden"));
      writeFileSync(join(vault, "b.md"), "# B\n");
      writeFileSync(join(vault, ".hidden", "b.md"), "# HB\n");
      writeFileSync(join(vault, ".hidden", "n.md"), "# N\n\n[b](b.md)\n");
      writeFileSync(join(vault, "r.md"), "# R\n\n[x](.hidden/b.md) [n](.hidden/n.md)\n"); // what reaches them
      symlinkSync(".hidden/n.md", join(vault, "l.md")); // from the top, its `b.md` is the top's
      const r = await cli(["mv", ".hidden/b.md", "c.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(".hidden/n.md:3: reached as l.md too, from another folder: not rewritten");
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\n[b](b.md)\n");
    }),
  );

  test(
    "a folder moved under a folder that can't be made: refused, said, nothing changed",
    homed(async () => {
      const { vault } = await linked();
      mkdirSync(join(vault, "f"));
      writeFileSync(join(vault, "f", "n.md"), "# N\n");
      mkdirSync(join(vault, "ro"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const { planFolderMove } = await import("../src/core/rename.ts");
      const plan = planFolderMove(g, "f", "ro/deep/f");
      chmodSync(join(vault, "ro"), 0o500);
      try {
        expect(() => applyPlan(g, plan)).toThrow(
          `${join(vault, "ro", "deep")} can't be made (EACCES); nothing changed`,
        );
      } finally {
        chmodSync(join(vault, "ro"), 0o755);
      }
      expect(existsSync(join(vault, "f", "n.md"))).toBe(true);
    }),
  );

  test(
    "a followed link's case-only rename, as a disk that ignores case has it: the link moved, never refused through it",
    homed(async () => {
      const { top, vault } = await linked();
      // A folder of its own: the only link followed to it.
      mkdirSync(join(top, "case"));
      writeFileSync(join(top, "case", "c.md"), "# C\n");
      symlinkSync(join(top, "case"), join(vault, "Outer"));
      setLinkAnswer(join(vault, "Outer"), "follow");
      await probe(join(top, "case"));
      // A disk that ignores case gives `outer` for `Outer` itself; here, a second name for the link's own entry does.
      const ignoresCase = existsSync(join(vault, "OUTER"));
      if (!ignoresCase && process.platform !== "linux") return;
      if (!ignoresCase) linkSync(join(vault, "Outer"), join(vault, "outer"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      // The walk lists one of the names (where case is ignored, there's one): the rename goes to the other.
      const [from, to] = g.dirs.includes("Outer") ? ["Outer", "outer"] : ["outer", "Outer"];
      const { planFolderMove } = await import("../src/core/rename.ts");
      const plan = planFolderMove(g, from, to);
      expect(plan.move?.link).toBe(true);
      expect(outside(g, plan)).toBeNull();
      // The command line's own check of where it goes, too.
      const r = await cli(["mv", from, to], vault);
      expect([r.code, r.json.error?.message]).toEqual([0, undefined]);
    }),
  );

  test(
    "another name for a file is never looked for through a followed link whose target has stopped answering",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "s.md"), "# S\n\n[a](a.md)\n");
      symlinkSync("shelf/s.md", join(vault, "e1.md"));
      // A second name for it, behind a followed link out of the vault.
      mkdirSync(join(top, "out"));
      symlinkSync(join(vault, "shelf", "s.md"), join(top, "out", "e2.md"));
      symlinkSync(join(top, "out"), join(vault, "q"));
      setLinkAnswer(join(vault, "q"), "follow");
      await probe(join(top, "out"));
      const { planNoteRename } = await import("../src/core/rename.ts");
      const g = openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false);
      expect(planNoteRename(g, "a.md", "z.md").skipped.map((x) => x.reason)).toEqual([
        "reached as q/e2.md too, from another folder: not rewritten",
      ]);
      // Its target not answering now: nothing is read behind it, so that name isn't one this plan knows.
      forgetProbes();
      expect(planNoteRename(g, "a.md", "z.md").files.map((f) => f.shown)).toEqual(["e1.md"]);
    }),
  );

  test(
    "undo moves a note back only inside the vault: where a link out of it stands now, nothing is moved",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const ext = join(top, "ext");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "notes"));
      mkdirSync(ext);
      writeFileSync(join(vault, "notes", "a.md"), "# A\n");
      expect((await cli(["mv", "notes/a.md", "b.md"], vault)).code).toBe(0);
      // The folder it came from is a link out of the vault now (a pull made it one).
      rmSync(join(vault, "notes"), { recursive: true });
      symlinkSync(ext, join(vault, "notes"));
      const r = await cli(["undo"], vault);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toBe(
        "notes/a.md resolves outside the vault: the rename of notes/a.md can't be undone",
      );
      expect(existsSync(join(vault, "b.md"))).toBe(true);
      expect(readdirSync(ext)).toEqual([]);
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planUndo(g)).toThrow("resolves outside the vault");
    }),
  );

  test(
    "apply takes a plan by its id, from slipbox's plans only: each file shown where it is, and one out of the vault refused",
    homed(async () => {
      const { plansDir } = await import("../src/core/plans.ts");
      const { top, vault } = await linked();
      const loose = join(top, "loose.txt");
      writeFileSync(loose, "before\n");
      const saved = {
        version: 1,
        id: "0123abcd",
        made: new Date().toISOString(),
        root: vault,
        command: "mv",
        plan: {
          kind: "replace",
          from: "before",
          to: "after",
          move: null,
          files: [
            {
              abs: loose,
              shown: "a.md",
              vault: null,
              edits: [{ line: 1, before: "before", after: "after" }],
              text: "before\n",
              next: "after\n",
            },
          ],
          warnings: [],
          skipped: [],
        },
      };
      // A plan file named by its path isn't one.
      writeFileSync(join(vault, "plan.json"), JSON.stringify(saved));
      expect((await cli(["apply", join(vault, "plan.json")], vault)).code).toBe(3);
      expect((await cli(["apply", "plan.json"], vault)).code).toBe(3);
      // Among slipbox's plans: shown by where it is, and refused, nothing written.
      mkdirSync(plansDir(), { recursive: true });
      writeFileSync(join(plansDir(), "0123abcd.json"), JSON.stringify(saved));
      const dry = await cli(["apply", "0123abcd", "--dry-run"], vault);
      expect(dry.json.data.files[0].path).toBe(loose);
      expect(dry.json.warnings.join()).toContain(`${loose}: a link leads it out of the vault`);
      const r = await cli(["apply", "0123abcd"], vault);
      expect(r.code).toBe(5);
      expect(readFileSync(loose, "utf8")).toBe("before\n");
    }),
  );

  test(
    "an export of a note through a followed link out of the vault isn't written beside it unless --out names a place",
    homed(async () => {
      const { vault, outer } = await linked();
      const r = await cli(["export", "outdir/s.md", "--to", "md"], vault);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toContain("name a place with --out");
      expect(readdirSync(outer).sort()).toEqual(["s.md", "sub", "x.md"]);
      expect((await cli(["export", "outdir/s.md", "--to", "md", "--out", "s.md"], vault)).code).toBe(0);
      expect(readFileSync(join(vault, "s.md"), "utf8")).toContain("# S");
    }),
  );
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
    const code = await runCli(["mv", "a", "docs/a", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
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

describe("renames refused before anything is written (cli.md, Renames)", () => {
  const root = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-mvref-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  test("a file where the target's folder would be: refused when planned; appeared since, nothing written", async () => {
    const { planNoteRename, RenameError } = await import("../src/core/rename.ts");
    const dir = root({ "a.md": "# A\n", "x.md": "# X\n", "index.md": "[a](a.md)\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planNoteRename(g, "a.md", "x.md/a")).toThrow("x.md is a file: x.md/a can't go under it");
    const plan = planNoteRename(g, "a.md", "y/a");
    writeFileSync(join(dir, "y"), "now a file\n");
    expect(() => applyPlan(g, plan)).toThrow(RenameError);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md)\n");
    expect(existsSync(join(dir, "a.md"))).toBe(true);
  });

  test("onto a different file whose name differs only in case: refused, both kept; a lone note's case-only rename works", async () => {
    const { planNoteRename } = await import("../src/core/rename.ts");
    const dir = root({
      "note.md": "# lower\n",
      "Note.md": "# UPPER\n",
      "solo.md": "# solo\n",
      "index.md": "[s](solo.md)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    // Two files whose names differ only in case: a filesystem that folds case (macOS's) can't hold both.
    if (readdirSync(dir).includes("note.md") && readdirSync(dir).includes("Note.md")) {
      expect(() => planNoteRename(g, "note.md", "Note")).toThrow("Note.md exists; not overwriting it");
      expect(readFileSync(join(dir, "note.md"), "utf8")).toBe("# lower\n");
      expect(readFileSync(join(dir, "Note.md"), "utf8")).toBe("# UPPER\n");
    }
    applyPlan(g, planNoteRename(g, "solo.md", "Solo"));
    expect(readdirSync(dir).filter((f) => f.toLowerCase() === "solo.md")).toEqual(["Solo.md"]);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[s](Solo.md)\n");
  });

  test("a folder's case-only rename works; onto a different existing folder, refused", async () => {
    const { planFolderMove } = await import("../src/core/rename.ts");
    const dir = root({ "notes/a.md": "# A\n", "other/b.md": "# B\n", "index.md": "[a](notes/a.md)\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planFolderMove(g, "notes", "other")).toThrow("other exists; not overwriting it");
    applyPlan(g, planFolderMove(g, "notes", "Notes"));
    expect(existsSync(join(dir, "Notes", "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](Notes/a.md)\n");
  });

  test("a move typed as a path: a folder that's there, or a path ending in /, is into it, the name kept (DF-D4)", async () => {
    const { moveTarget, planFolderMove, planNoteRename } = await import("../src/core/rename.ts");
    const dir = root({
      "a.md": "# A\n",
      "ideas/b.md": "# B\n",
      "drafts/c.md": "# C\n",
      "index.md": "[a](a.md) [c](drafts/c.md)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(moveTarget(g, "a.md", "ideas/")).toBe("ideas/a.md");
    expect(moveTarget(g, "a.md", "ideas")).toBe("ideas/a.md"); // there already
    expect(moveTarget(g, "a.md", "later/")).toBe("later/a.md"); // made by the move
    expect(moveTarget(g, "a.md", "later")).toBe("later"); // no folder there: a rename, to later.md
    expect(moveTarget(g, "ideas/b.md", "/")).toBe("b.md"); // the root
    expect(moveTarget(g, "ideas/b.md", ".")).toBe("b.md");
    expect(moveTarget(g, "drafts", "ideas")).toBe("ideas/drafts");
    expect(moveTarget(g, "drafts", "archive/")).toBe("archive/drafts"); // made: never drafts renamed archive (DF-D21)
    expect(moveTarget(g, "drafts", "drafts")).toBe("drafts"); // itself: refused as already there, not into itself
    expect(moveTarget(g, "a.md", "../")).toBe("../a.md"); // out of the root: its plan refuses it
    applyPlan(g, planNoteRename(g, "a.md", moveTarget(g, "a.md", "ideas/")));
    expect(existsSync(join(dir, "ideas", "a.md"))).toBe(true);
    expect(existsSync(join(dir, "ideas.md"))).toBe(false);
    applyPlan(g, planFolderMove(g, "drafts", moveTarget(g, "drafts", "ideas")));
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](ideas/a.md) [c](ideas/drafts/c.md)\n");
  });

  test("a wikilinked note whose name has a colon: renamed, its links name it, no folder prefix (21.12)", async () => {
    const { planNoteRename } = await import("../src/core/rename.ts");
    const dir = root({ "notes/Meeting: Q3.md": "# Q3\n", "index.md": "See [[Meeting: Q3]].\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    applyPlan(g, planNoteRename(g, "notes/Meeting: Q3.md", "notes/Meeting: Q4"));
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("See [[Meeting: Q4]].\n");
  });

  test("a renamed folder's previous_names on several lines, or with a comment: kept one key, its id and the old name", async () => {
    const { planVaultRename } = await import("../src/core/rename.ts");
    const { readIdentity } = await import("../src/core/workspace/vaults/registry.ts");
    const tag = (dir: string) => basename(dir).slice(-6).toLowerCase();
    for (const prev of ['previous_names = [\n  "older",\n]\n', 'previous_names = ["older"] # kept\n']) {
      const dir = root({ "a.md": "# A\n" });
      const cfg = join(dir, ".slipbox", "config.toml");
      writeFileSync(cfg, `[vault]\nid = "dd835b829b2153ca"\nname = "al${tag(dir)}"\n${prev}`);
      const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
      applyPlan(g, planVaultRename(g.loc, `be${tag(dir)}`));
      expect(readIdentity(cfg)).toMatchObject({
        id: "dd835b829b2153ca",
        name: `be${tag(dir)}`,
        previous_names: ["older", `al${tag(dir)}`],
      });
      expect(readFileSync(cfg, "utf8").match(/^previous_names/gm)).toHaveLength(1);
    }
    // A table the edit can't follow (`[ vault ]`): refused, nothing written.
    const dir = root({ "a.md": "# A\n" });
    const cfg = join(dir, ".slipbox", "config.toml");
    const text = `[ vault ]\nid = "dd835b829b2153cb"\nname = "al${tag(dir)}"\n`;
    writeFileSync(cfg, text);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(() => planVaultRename(g.loc, `be${tag(dir)}`)).toThrow("edit it by hand");
    expect(readFileSync(cfg, "utf8")).toBe(text);
  });

  test("a folder's naming, and its undo, leave .slipbox/config.toml out of the root's files", async () => {
    const { planVaultRename } = await import("../src/core/rename.ts");
    const { search } = await import("../src/core/search.ts");
    const dir = root({ "a.md": "# A\n", ".slipbox/config.toml": "" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    applyPlan(g, planVaultRename(g.loc, `nm${basename(dir).slice(-6).toLowerCase()}`));
    expect(g.filePaths()).toEqual([]);
    expect(search(g, null, "config").hits.map((h) => h.path)).toEqual([]);
    applyPlan(g, planUndo(g));
    expect(g.filePaths()).toEqual([]);
  });
});

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

describe("another folder's file as an argument: its pointer (21.10); vault:path gone (21.12)", () => {
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
  const human = async (args: string[], cwd: string) => {
    const lines: string[] = [];
    await runCli(args, {
      out: (x: string) => lines.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return lines.join("");
  };
  /** a's notes/plan.md links to b's algorithms/dijkstra.md. */
  const two = async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-vform-"));
    const tag = basename(base)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
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
    expect((await cli(["outline", ptr(b, "algorithms/dijkstra.md")], at("a"))).json.data.headings[1]).toMatchObject({
      text: "Relaxation",
    });
    // Backlinks of b's note, asked from a: a's link among them, by its path (21.9).
    const bl = (await cli(["backlinks", ptr(b, "algorithms/dijkstra")], at("a"))).json.data.backlinks;
    expect(bl).toContainEqual(
      expect.objectContaining({ from: join(at("a"), "notes", "plan.md"), shown: join(at("a"), "notes", "plan.md") }),
    );
    // find's note is its second argument; context takes several.
    expect((await cli(["find", "Edges", ptr(b, "algorithms/dijkstra.md")], at("a"))).code).toBe(0);
    expect(
      (await cli(["context", ptr(a, "notes/other.md"), ptr(a, "notes/plan.md")], at("b"))).json.data.start,
    ).toEqual(["notes/other.md", "notes/plan.md"]);
    // Each argument itself: the first saying which folder never stands for the rest.
    expect((await cli(["context", "notes/other.md", "notes/plan.md"], at("a"))).json.data.start).toEqual([
      "notes/other.md",
      "notes/plan.md",
    ]);
    // --from too.
    expect((await cli(["resolve", "other.md", "--from", ptr(a, "notes/plan.md")], at("b"))).json.data).toMatchObject({
      status: "resolved",
      path: "notes/other.md",
    });
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
    const r = await cli(
      ["resolve", `slipbox://${b}/algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"],
      at("a"),
    );
    expect(r.json.data).toMatchObject({
      status: "resolved",
      path: join(at("b"), "algorithms", "dijkstra.md"),
      abs: join(at("b"), "algorithms", "dijkstra.md"),
      shown: join(at("b"), "algorithms", "dijkstra.md"),
      href: "../../b/algorithms/dijkstra.md#relaxation",
      heading: "Relaxation",
      line: 3,
      root: at("b"),
      name: b,
    });
    // This folder's own: its path here.
    const own = await cli(["resolve", `slipbox://${a}/notes/other.md`, "--from", "notes/plan.md"], at("a"));
    expect(own.json.data).toMatchObject({
      status: "resolved",
      path: "notes/other.md",
      shown: "notes/other.md",
      href: "other.md",
      root: null,
      name: null,
    });
    // A folder too; a file that isn't there, not.
    expect(
      (await cli(["resolve", `slipbox://${b}/algorithms`, "--from", "notes/plan.md"], at("a"))).json.data,
    ).toMatchObject({ status: "resolved", abs: join(at("b"), "algorithms"), href: "../../b/algorithms" });
    expect((await cli(["resolve", `slipbox://${b}/algorithms/nope.md`, "--from", "notes/plan.md"], at("a"))).code).toBe(
      3,
    );
    // Without --from: no link to write.
    expect((await cli(["resolve", `slipbox://${b}/algorithms/dijkstra.md`], at("a"))).json.data).toMatchObject({
      status: "resolved",
      href: null,
    });
    // The old form: unresolved, and the pointer that is one.
    const old = await cli(["resolve", `${b}:algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"], at("a"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({
      status: "unresolved",
      href: null,
      suggest: `slipbox://${b}/algorithms/dijkstra.md`,
    });
    // A path's href too, with the spaces a link encodes.
    writeFileSync(join(at("a"), "notes", "a note.md"), "# A note\n");
    expect((await cli(["resolve", "a note.md", "--from", "notes/plan.md"], at("a"))).json.data.href).toBe(
      "a%20note.md",
    );
  });

  test("out: links and backlinks show another vault's file by its path (21.9), its vault's name beside it", async () => {
    const { at, a, b } = await two();
    const links = (await cli(["links", "notes/plan.md"], at("a"))).json.data;
    expect(links[0]).toMatchObject({
      path: join(at("b"), "algorithms", "dijkstra.md"),
      shown: join(at("b"), "algorithms", "dijkstra.md"),
      root: at("b"),
      name: b,
    });
    expect(await human(["links", "notes/plan.md"], at("a"))).toContain(
      `-> ${join(at("b"), "algorithms", "dijkstra.md")}\n`,
    );
    const bl = (await cli(["backlinks", "algorithms/dijkstra.md"], at("b"))).json.data.backlinks;
    expect(bl[0]).toMatchObject({ shown: join(at("a"), "notes", "plan.md"), root: at("a"), name: a });
    expect(await human(["backlinks", "algorithms/dijkstra.md"], at("b"))).toContain(
      `${join(at("a"), "notes", "plan.md")}:3  shortest`,
    );
  });

  test("mv and cp: a source by its pointer, the command in its folder; a destination a path there, never a pointer", async () => {
    const { at, b } = await two();
    const moved = await cli(
      ["mv", `slipbox://${b}/algorithms/dijkstra.md`, "graphs/dijkstra.md", "--dry-run"],
      at("a"),
    );
    expect(moved.code).toBe(0);
    expect(moved.json.data).toMatchObject({ from: "algorithms/dijkstra.md", to: "graphs/dijkstra.md", dryRun: true });
    const pointed = await cli(
      ["mv", `slipbox://${b}/algorithms/dijkstra.md`, `slipbox://${b}/graphs/dijkstra.md`, "--dry-run"],
      at("a"),
    );
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
  const human = async (args: string[], cwd: string) => {
    const lines: string[] = [];
    await runCli(args, {
      out: (x: string) => lines.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return lines.join("");
  };
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
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
    put(
      root,
      "docs/b.md",
      `# B\n\n[the plan](plan.md#goals) and [old](old.md)\n\n[by its path](${root}/docs/plan.md) [mine](my%20plan.md)\n`,
    );
    put(root, "shared.md", "ours\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "main");
    return root;
  };
  const brief = (r: {
    json: {
      data: {
        breaks: { path: string; target: string; cause: string; by: string; to: string | null; fix: string | null }[];
      };
    };
  }) => r.json.data.breaks.map((b) => [b.path, b.target, b.cause, b.by, b.to, b.fix]);

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

  test("the merge review leaves out a busy folder that looks generated, as the walk does; a notes build/ is read (D237)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-busy-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const long = "long enough to be known by its text when it moves.\n";
    put(root, "build/plan.md", `# Plan\n\nThe plan, ${long}`);
    put(root, "build/keep.md", "# Keep\n");
    put(root, "vendor/pkg/doc.md", `# Doc\n\nA vendored doc, ${long}`); // no note at vendor's top
    put(root, "index.md", "# Index\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "build", "new"));
    git(root, "mv", "build/plan.md", "build/new/plan.md");
    git(root, "mv", "vendor/pkg/doc.md", "vendor/pkg/doc2.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    put(root, "c.md", "# C\n\n[plan](build/plan.md) [doc](vendor/pkg/doc.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      ["c.md", "build/plan.md", "moved", "refactor", "build/new/plan.md", "build/new/plan.md"],
    ]);
  });

  test("the merge review reads links to this repository's hosting and pointers naming this folder: each fix in its form (D87, 21.7)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-hosted-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const name = `r${basename(root)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    git(root, "remote", "add", "origin", `git@github.com:me/${name}.git`);
    put(root, "docs/plan.md", "# Plan\n\n## Goals\n\nThe plan, long enough to be known by its text when it moves.\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "branch", "feature/x");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/plan.md", "docs/new/plan.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    const base = `https://github.com/me/${name}`;
    // This repository's file at main, at a branch with a `/`; by its pointer; another repository's; its own page.
    put(
      root,
      "docs/b.md",
      `# B\n\n[p](${base}/blob/main/docs/plan.md#goals) [x](${base}/blob/feature/x/docs/plan.md) [ptr](slipbox://${name}/docs/plan#goals) [else](https://github.com/them/other/blob/main/docs/plan.md) [page](${base})\n`,
    );
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "b");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      [
        "docs/b.md",
        `${base}/blob/main/docs/plan.md#goals`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `${base}/blob/main/docs/new/plan.md#goals`,
      ],
      [
        "docs/b.md",
        `${base}/blob/feature/x/docs/plan.md`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `${base}/blob/feature/x/docs/new/plan.md`,
      ],
      [
        "docs/b.md",
        `slipbox://${name}/docs/plan#goals`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `slipbox://${name}/docs/new/plan#goals`,
      ],
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
    expect(text).toContain(
      "  docs/b.md:3:1  plan.md#goals — refactor moves docs/plan.md to docs/new/plan.md — the fix: new/plan.md#goals\n",
    );
    expect(text).toContain(
      "  notes/e.md:3:1  plan2.md — refactor moves this note; the link named docs/plan2.md — the fix: ../docs/plan2.md\n",
    );
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
    expect(brief(await cli(["merge-review", "refactor"], root)).find((b) => b[0] === "docs/d.md")).toEqual([
      "docs/d.md",
      "nowhere.md",
      "missing",
      "refactor",
      null,
      null,
    ]);
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
    put(
      root,
      "notes/.slipbox/config.toml",
      `[vault]\nid = "sub${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "sub"\n`,
    );
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

  test("wikilinks to nothing: one the branch writes, by name or by path, is `missing`; one to a note it deleted, `deleted`", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-missing-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "docs/old.md", "# Old\n");
    put(root, "docs/keep.md", "# Keep\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    git(root, "rm", "-q", "docs/old.md");
    put(root, "docs/c.md", "# C\n\n[[nowhere]] [[docs/gone]] [[keep]] [[docs/keep]]\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "refactor");
    git(root, "checkout", "-q", "main");
    put(root, "docs/b.md", "# B\n\n[[docs/old]] [[old]]\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "main");
    const r = await cli(["merge-review", "refactor"], root);
    expect(
      r.json.data.breaks.map(
        (b: {
          path: string;
          target: string;
          cause: string;
          by: string;
          names: string;
          to: string | null;
          fix: string | null;
        }) => [b.path, b.target, b.cause, b.by, b.names, b.to, b.fix],
      ),
    ).toEqual([
      ["docs/b.md", "docs/old", "deleted", "refactor", "docs/old.md", null, null],
      ["docs/b.md", "old", "deleted", "refactor", "docs/old.md", null, null],
      ["docs/c.md", "nowhere", "missing", "refactor", "nowhere", null, null],
      ["docs/c.md", "docs/gone", "missing", "refactor", "docs/gone.md", null, null],
    ]);
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
    writeFileSync(
      join(root, "docs", "a.md"),
      `${readFileSync(join(root, "docs", "a.md"), "utf8")}Changed as it moved: no longer the same text.\n`,
    );
    git(root, "commit", "-q", "-am", "moved");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root); // seen on main, as it was
    git(root, "checkout", "-q", "elsewhere");
    await cli(["ls"], root); // and on elsewhere: each branch's place kept apart
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--ff-only", "elsewhere"); // a pull, as far as this copy can tell
    git(root, "pack-refs", "--all"); // the branch's commit in packed-refs only
    const p = (await cli(["problems"], root)).json.data;
    expect(p.broken).toContainEqual(
      expect.objectContaining({
        from: "b.md",
        target: "a.md",
        moved: "docs/a.md",
        reason: "moved to docs/a.md — relink fixes it",
      }),
    );
    const { openVault } = await import("../src/core/reach.ts");
    expect(openVault(root).redirects?.all()["a.md"]).toMatchObject({
      to: "docs/a.md",
      by: expect.stringMatching(/^[0-9a-f]{7}\.\.[0-9a-f]{7}$/),
    });
    await cli(["relink"], root);
    expect(readFileSync(join(root, "b.md"), "utf8")).toBe("# B\n\n[a](docs/a.md)\n");
  });

  test("a repository appearing while it's watched: where its branch is, seen at once — its next merge has a before", async () => {
    const { VaultFeed } = await import("../src/core/workspace/vaults/vault-feed.ts");
    const { checkoutOf } = await import("../src/core/git.ts");
    const { openVault } = await import("../src/core/reach.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-appear-"));
    put(
      root,
      ".slipbox/config.toml",
      `[vault]\nid = "ap${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "appear"\n`,
    );
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    const g = openVault(root);
    let c: ReturnType<typeof checkoutOf> = null;
    const heard: [string, string][][] = [];
    const feed = new VaultFeed({
      checkout: () => c,
      graph: () => g,
      now: () => Date.now(),
      apply: () => {},
      headMoved: (_was, _now, moves) => heard.push(moves),
    });
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
    const { VaultFeed } = await import("../src/core/workspace/vaults/vault-feed.ts");
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
    const feed = new VaultFeed({
      checkout: () => checkoutOf(root),
      graph: () => g,
      now: () => Date.now(),
      apply: () => {},
      headMoved: (was, now) => heard.push([was.branch, now.branch]),
    });
    feed.checkHead();
    // Stopped after its first step (an --exec that fails): HEAD detached, the rebase not done.
    git(root, "rebase", "-q", "--exec", "false", "main");
    expect(existsSync(join(root, ".git", "rebase-merge"))).toBe(true);
    expect(feed.checkHead()).toBe(false);
    git(root, "rebase", "--continue");
    expect(feed.checkHead()).toBe(true);
    expect(heard).toEqual([["topic", "topic"]]);
  });

  test("the feed closed (another vault opened) while git still writes: what it held is never applied after", async () => {
    const { VaultFeed } = await import("../src/core/workspace/vaults/vault-feed.ts");
    let locked = true;
    const applied: string[][] = [];
    const make = () =>
      new VaultFeed({
        checkout: () => null,
        graph: () => {
          throw new Error("no graph wanted");
        },
        now: () => Date.now(),
        apply: (b) => applied.push(b.changes.map((c) => c.rel)),
        locked: () => locked,
      });
    const batch = (rel: string) => ({ changes: [{ rel, kind: "changed" as const, isNote: true }], rescan: false });
    // Open: held while git writes, applied once it's done.
    const open = make();
    open.receive(batch("a.md"));
    expect(applied).toEqual([]);
    locked = false;
    await Bun.sleep(250);
    expect(applied).toEqual([["a.md"]]);
    // Closed while it waits: nothing lands.
    locked = true;
    const closed = make();
    closed.receive(batch("b.md"));
    closed.close();
    locked = false;
    await Bun.sleep(250);
    expect(applied).toEqual([["a.md"]]);
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
    expect(p.broken).toContainEqual(
      expect.objectContaining({ from: "b.md", target: "a.md", moved: null, reason: null }),
    );
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
    const dir = tree({
      "top.md": "# Top\n",
      ".slipbox/": "",
      "obs/.obsidian/": "",
      "obs/deep/n.md": "# N\n",
      "zk/.zk/": "",
      "zk/z.md": "# Z\n",
    });
    expect(findVaultRoot(join(dir, "obs", "deep", "n.md"))).toBe(join(dir, "obs"));
    expect(findVaultRoot(join(dir, "zk", "z.md"))).toBe(join(dir, "zk"));
    expect(locateVault({ path: join(dir, "obs", "deep", "n.md") })).toMatchObject({
      mode: "vault",
      root: join(dir, "obs"),
    });
    // The root around them leaves them to themselves, as it does a nested repository.
    expect((await cli(["ls"], dir)).json.data.map((n: { path: string }) => n.path)).toEqual(["top.md"]);
    expect((await cli(["ls"], join(dir, "obs", "deep"))).json.data.map((n: { path: string }) => n.path)).toEqual([
      "deep/n.md",
    ]);
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
    const dir = tree({
      "top.md": "# Top\n",
      ".slipbox/": "",
      "obs/.obsidian/": "",
      "obs/n.md": "# N\n",
      "foam/.foam/": "",
      "foam/f.md": "# F\n",
    });
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
    expect(vaultSays.warnings.join()).toContain(
      "sets walk.root_markers, which only your own config may set (it decides where vaults are)",
    );
    const user = join(dir, "user.toml");
    writeFileSync(user, '[walk]\nroot_markers = [".git", "a/b", "..", ""]\n');
    const userSays = loadConfig({ configFile: user });
    expect(userSays.config.walk.root_markers).toEqual([".git"]);
    expect(userSays.warnings.join()).toContain(
      'walk.root_markers takes names (".git", ".obsidian"), not paths; ignored ["a/b","..",""]',
    );
  });

  test("deinit takes .slipbox/ away only where it's the only marker: an Obsidian vault stays a root", async () => {
    const dir = tree({
      ".slipbox/": "",
      "top.md": "# Top\n",
      "obs/.obsidian/": "",
      "obs/.slipbox/config.toml": '[vault]\nid = "obsdeinit000001"\nname = "obsd"\n',
      "obs/n.md": "# N\n",
    });
    const r = await cli(["deinit", join(dir, "obs"), "--dry-run"], dir);
    expect(r.code).toBe(5);
    expect(r.json.error.message).toContain(
      "obs is a vault by its .obsidian too: it stays one, with or without .slipbox/",
    );
    const plain = await cli(["deinit", join(dir, "nope")], dir);
    expect(plain.code).toBe(5);
  });
});

describe("the links' convention, found (21.4)", () => {
  const notes = (links: [string, string][]) =>
    links.map(([kind, target]) => ({ kind, target, resolvedKind: "note", path: "x.md" }));
  test("the notes' links counted by style, path and extension: only those reaching a note in the root", async () => {
    const { countForms } = await import("../src/core/convention.ts");
    const c = countForms([
      ...notes([
        ["wiki", "Dal"],
        ["embed", "Recipes/Dal"],
        ["wiki", "../up/Dal.md"],
        ["wiki", "/Recipes/Dal"],
      ]),
      ...notes([
        ["markdown", "a.md#top"],
        ["markdown", "../b"],
        ["markdown", "/docs/c.md"],
        ["image", "sub/d e.md?x"],
        ["markdown", "~/x.md"],
        ["markdown", "file:///x.md"],
      ]),
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
      return (
        t && {
          tool: t.tool,
          file: t.file,
          style: t.style,
          wiki: [t.path("wiki"), t.extension("wiki")],
          markdown: [t.path("markdown"), t.extension("markdown")],
        }
      );
    };
    expect(at({ ".obsidian/x": null })).toEqual({
      tool: "obsidian",
      file: ".obsidian/",
      style: "wiki",
      wiki: ["name", "dropped"],
      markdown: [undefined, "kept"],
    });
    expect(at({ ".obsidian/app.json": '{"useMarkdownLinks": true, "newLinkFormat": "relative",}' })).toMatchObject({
      file: ".obsidian/app.json",
      style: "markdown",
      markdown: ["relative", "kept"],
    });
    expect(at({ ".obsidian/app.json": '{"newLinkFormat": "absolute"}' })).toMatchObject({
      style: "wiki",
      wiki: ["root", "dropped"],
    });
    expect(at({ ".obsidian/app.json": "not json" })).toMatchObject({ file: ".obsidian/", style: "wiki" }); // unreadable: Obsidian's defaults
    expect(at({ ".zk/x": null })).toEqual({
      tool: "zk",
      file: ".zk/",
      style: "markdown",
      wiki: ["root", "dropped"],
      markdown: ["relative", "dropped"],
    });
    expect(
      at({ ".zk/config.toml": '[format.markdown]\nlink-format = "wiki"\nlink-drop-extension = false\n' }),
    ).toMatchObject({ file: ".zk/config.toml", style: "wiki", wiki: ["root", "kept"] });
    expect(at({ ".zk/config.toml": '[format.markdown]\nlink-format = "[[{{filename}}]]"\n' })).toMatchObject({
      style: undefined,
      wiki: [undefined, "dropped"],
    });
    expect(at({ ".git/HEAD": "ref" })).toBeNull();
  });

  test("a zk config that doesn't parse (a typo mid-edit): zk's defaults, as an Obsidian app.json that doesn't", async () => {
    const { toolSays } = await import("../src/core/convention.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-tool-zkbad-"));
    mkdirSync(join(dir, ".zk"));
    writeFileSync(
      join(dir, ".zk", "config.toml"),
      '[format.markdown\nlink-format = "wiki"\nlink-drop-extension = false\n',
    );
    const t = toolSays(dir)!;
    expect({
      tool: t.tool,
      file: t.file,
      style: t.style,
      wiki: [t.path("wiki"), t.extension("wiki")],
      markdown: [t.path("markdown"), t.extension("markdown")],
    }).toEqual({
      tool: "zk",
      file: ".zk/",
      style: "markdown",
      wiki: ["root", "dropped"],
      markdown: ["relative", "dropped"],
    });
  });

  test("each part the first that says: your setting, the root's tool, its notes at two-thirds, ours", async () => {
    const { emptyCounts, findConvention } = await import("../src/core/convention.ts");
    const auto = { style: "auto", path: "auto", extension: "auto" } as const;
    const counts = (
      style: [number, number],
      wikiPath: [number, number, number],
      wikiExt: [number, number],
      mdPath: [number, number, number] = [0, 0, 0],
      mdExt: [number, number] = [0, 0],
    ) => {
      const c = emptyCounts();
      [c.style.markdown, c.style.wiki] = style;
      [c.path.wiki.relative, c.path.wiki.root, c.path.wiki.name] = wikiPath;
      [c.extension.wiki.kept, c.extension.wiki.dropped] = wikiExt;
      [c.path.markdown.relative, c.path.markdown.root, c.path.markdown.name] = mdPath;
      [c.extension.markdown.kept, c.extension.markdown.dropped] = mdExt;
      return c;
    };
    const parts = (c: ReturnType<typeof findConvention>) =>
      [c.style, c.path, c.extension].map((p) => `${p.value}:${p.source}`);
    const obsidian = {
      tool: "obsidian" as const,
      file: ".obsidian/app.json",
      style: "wiki" as const,
      path: (s: string) => (s === "wiki" ? ("name" as const) : undefined),
      extension: (s: string) => (s === "wiki" ? ("dropped" as const) : ("kept" as const)),
    };
    // Nothing says: ours.
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: null, counts: null }))).toEqual([
      "markdown:default",
      "relative:default",
      "kept:default",
    ]);
    // The notes, each part within the style they chose: two-thirds is enough.
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: null,
          counts: counts([1, 2], [0, 2, 1], [1, 2]),
        }),
      ),
    ).toEqual(["wiki:notes", "root:notes", "dropped:notes"]);
    // Under two-thirds: ours for that part (a root mixing forms).
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: null,
          counts: counts([4, 6], [3, 3, 4], [5, 5]),
        }),
      ),
    ).toEqual(["markdown:default", "relative:default", "kept:default"]);
    // The tool before the notes.
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: obsidian,
          counts: counts([10, 0], [0, 0, 0], [0, 0], [0, 10, 0], [0, 10]),
        }),
      ),
    ).toEqual(["wiki:tool", "name:tool", "dropped:tool"]);
    // Your setting before the tool; the tool's "shortest" isn't a path for a markdown link: the notes', else ours.
    const md = findConvention({
      links: { ...auto, style: "markdown" },
      origins: { "links.style": ".slipbox/config.toml" },
      hasRoot: true,
      tool: obsidian,
      counts: counts([3, 0], [0, 0, 0], [0, 0], [0, 3, 0], [3, 0]),
    });
    expect(parts(md)).toEqual(["markdown:setting", "root:notes", "kept:tool"]);
    expect(md.style.why).toBe("[links] in .slipbox/config.toml");
    expect(
      parts(
        findConvention({
          links: { ...auto, style: "markdown" },
          origins: {},
          hasRoot: true,
          tool: obsidian,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "kept:tool"]);
    // A path by name, set, fits only a wikilink.
    expect(
      parts(
        findConvention({
          links: { style: "markdown", path: "name", extension: "drop" },
          origins: {},
          hasRoot: true,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "dropped:setting"]);
    expect(
      parts(
        findConvention({
          links: { style: "wiki", path: "name", extension: "keep" },
          origins: {},
          hasRoot: true,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["wiki:setting", "name:setting", "kept:setting"]);
    // No root: your setting, else ours — no tool, no notes.
    expect(
      parts(
        findConvention({
          links: { ...auto, extension: "drop" },
          origins: {},
          hasRoot: false,
          tool: obsidian,
          counts: counts([0, 9], [0, 0, 9], [0, 9]),
        }),
      ),
    ).toEqual(["markdown:default", "relative:default", "dropped:setting"]);
    // …where a folder can read it: no wikilink, no path from a root, no name there.
    const plain = findConvention({
      links: { style: "wiki", path: "root", extension: "drop" },
      origins: {},
      hasRoot: false,
      tool: null,
      counts: null,
    });
    expect(parts(plain)).toEqual(["markdown:default", "relative:default", "dropped:setting"]);
    expect([plain.style.why, plain.path.why]).toEqual([
      "no vault: a wikilink needs one",
      "no vault: `/` and names need one",
    ]);
    expect(
      parts(
        findConvention({
          links: { style: "markdown", path: "root", extension: "auto" },
          origins: {},
          hasRoot: false,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "kept:default"]);
    // A wikilink typed stays one, its path relative.
    expect(
      parts(
        findConvention({
          links: { style: "auto", path: "name", extension: "auto" },
          origins: {},
          hasRoot: false,
          tool: null,
          counts: null,
          style: "wiki",
        }),
      ),
    ).toEqual(["wiki:typed", "relative:default", "kept:default"]);
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
    expect(loaded.warnings.join("\n")).toContain(
      '"links.path" must be one of auto, relative, root, name (got "sideways")',
    );
    // The notes say the path: by name, all of them.
    writeFileSync(join(dir, "a.md"), "[[b]] [[c]] and [b](notes/b.md)\n");
    writeFileSync(join(dir, "notes", "b.md"), "# B\n");
    writeFileSync(join(dir, "c.md"), "# C\n");
    const r = await cli(["--root", dir, "--config", user, "info", "--json"]);
    const links = JSON.parse(r.out).data.links;
    expect(
      [links.style, links.path, links.extension].map(
        (p: { value: string; source: string }) => `${p.value}:${p.source}`,
      ),
    ).toEqual(["wiki:setting", "name:notes", "dropped:setting"]);
    expect(links.path.why).toBe("the notes, 100% of 2 links");
    const human = (await cli(["--root", dir, "--config", user, "info"])).out;
    expect(human).toContain(
      `links     wikilinks, by name, without .md — style: [links] in .slipbox/config.toml; path: the notes, 100% of 2 links; extension: [links] in ${user}`,
    );
  });
});

describe("the reference set's conventions (21.4)", () => {
  // Copied first: opened in place, a root would be written to (its id, its state).
  const at = async (rel: string) => {
    const { conventionOf, describeConvention } = await import("../src/core/convention.ts");
    const dir = join(mkdtempSync(join(tmpdir(), "slipbox-home-conv-")), basename(rel));
    cpSync(join(import.meta.dir, "..", "examples", "home", rel), dir, { recursive: true });
    const loaded = loadConfig({ vaultRoot: dir });
    return describeConvention(
      conventionOf(openGraph(locateVault({ root: dir }), loaded.config, false), loaded.config, loaded.origins),
    );
  };
  test("each root's, as CASES.md says (links/conventions)", async () => {
    expect(await at("hobbies/cooking")).toBe("wikilinks, by name, without .md — Obsidian's .obsidian/app.json");
    expect(await at("hobbies/cycling")).toBe("markdown links, relative, without .md — zk's .zk/config.toml");
    // Its own setting says markdown, over Obsidian's wikilinks; a markdown link is a path, not a name.
    expect(await at("work/product/design")).toMatch(
      /^markdown links, relative, with \.md — style: \[links\] in \.slipbox\/config\.toml; path: the notes, \d+% of \d+ links?; extension: Obsidian's \.obsidian\/app\.json$/,
    );
    expect(await at("work/kestrel")).toMatch(
      /^markdown links, relative, with \.md — style: the notes, 100% of \d+ links; path: the notes, \d+% of \d+ links; extension: the notes, \d+% of \d+ links$/,
    );
  });
});

describe("links written in the convention (21.5)", () => {
  const vault = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-write-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const d of ["sub", "other", "img", "my notes"]) mkdirSync(join(dir, d));
    for (const f of ["a.md", "sub/b.md", "sub/x.md", "other/b.md", "my notes/c d.md"])
      writeFileSync(join(dir, f), `# ${f}\n`);
    writeFileSync(join(dir, "img", "p.png"), "png");
    return dir;
  };
  test("each path and extension, in each style; a name only where it reaches the note, else the path from the root", async () => {
    const { linkDestination, linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const dir = vault();
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const conv = (path: string, extension: string) =>
      ({
        path: { value: path, source: "setting", why: "" },
        extension: { value: extension, source: "setting", why: "" },
      }) as never;
    const dest = (from: string, to: string, style: "markdown" | "wiki", path: string, ext: string) =>
      linkDestination(conv(path, ext), style, linkEnds(g, join(dir, from), join(dir, to)));
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
    expect(dest("a.md", relative(dir, join(outside, "far.md")), "wiki", "name", "dropped")).toBe(
      `../${basename(outside)}/far.md`,
    );
    // The whole link: text escaped, an alias only when it says more, an embed.
    const ends = linkEnds(g, join(dir, "sub/x.md"), join(dir, "sub/b.md"));
    expect(writeLink(conv("relative", "kept"), "markdown", ends, "the [b] note")).toBe("[the \\[b\\] note](b.md)");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "b")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "the b note")).toBe("[[b|the b note]]");
    expect(
      writeLink(conv("name", "dropped"), "wiki", linkEnds(g, join(dir, "a.md"), join(dir, "img/p.png")), "", true),
    ).toBe("![[p.png]]");
  });

  test("a top-level note with a nearer namesake: a relative path, never its name, which lands on the namesake", async () => {
    const { linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-write-top-"));
    mkdirSync(join(dir, ".obsidian"));
    mkdirSync(join(dir, "sub"));
    for (const f of ["plan.md", "sub/plan.md", "sub/a.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const conv = (path: string, extension: string) =>
      ({
        path: { value: path, source: "setting", why: "" },
        extension: { value: extension, source: "setting", why: "" },
      }) as never;
    const ends = linkEnds(g, join(dir, "sub/a.md"), join(dir, "plan.md"));
    const lands = (link: string) => g.resolveLink({ kind: "wiki", target: link.slice(2, -2) }, "sub/a.md").path;
    for (const [path, ext, want] of [
      ["name", "dropped", "[[../plan]]"],
      ["name", "kept", "[[../plan.md]]"],
      ["root", "dropped", "[[../plan]]"],
    ] as const) {
      const link = writeLink(conv(path, ext), "wiki", ends, "");
      expect(link).toBe(want);
      expect(lands(link)).toBe("plan.md");
    }
    // Where its name does reach it, the name.
    expect(
      writeLink(conv("root", "dropped"), "wiki", linkEnds(g, join(dir, "sub/a.md"), join(dir, "sub/plan.md")), ""),
    ).toBe("[[sub/plan]]");
  });

  test("slipbox link: as the root's convention writes it from --from — the note's title its text; --style, --text, --embed", async () => {
    const dir = vault();
    rmSync(join(dir, ".slipbox"), { recursive: true });
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "sub", "b.md"), "---\ntitle: The B note\n---\n# B\n");
    const link = async (...args: string[]) =>
      JSON.parse((await cli(["--root", dir, "link", ...args, "--json"])).out).data;
    expect(await link("sub/b.md", "--from", "sub/x.md")).toMatchObject({
      link: "[[b]]",
      path: "sub/b.md",
      from: "sub/x.md",
      style: "wiki",
      pathForm: "name",
      extension: "dropped",
    });
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
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "n")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  /** A folder: a `.slipbox/` with this name and id, and/or a repository with this origin. */
  const folder = (opts: { name?: string; id?: string; old?: string[]; remote?: string; obsidian?: boolean } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-named-"));
    if (opts.name || opts.id) {
      mkdirSync(join(dir, ".slipbox"));
      const fields = [
        opts.id ? `id = "${opts.id}"` : "",
        opts.name ? `name = "${opts.name}"` : "",
        opts.old ? `previous_names = ${JSON.stringify(opts.old)}` : "",
      ].filter(Boolean);
      writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\n${fields.join("\n")}\n`);
    }
    if (opts.remote !== undefined) {
      mkdirSync(join(dir, ".git", "info"), { recursive: true });
      writeFileSync(
        join(dir, ".git", "config"),
        `[core]\n\tbare = false\n${opts.remote ? `[remote "origin"]\n\turl = ${opts.remote}\n` : ""}`,
      );
    }
    if (opts.obsidian) mkdirSync(join(dir, ".obsidian"));
    return dir;
  };

  test("a name travels with what it names: .slipbox/'s, else the remote's; never a folder's own", async () => {
    const { folderIdentity } = await import("../src/core/workspace/vaults/folders.ts");
    const id = uniq();
    expect(folderIdentity(folder({ name: "notes", id, old: ["kb"] }))).toMatchObject({
      key: `slipbox:${id}`,
      name: "notes",
      remote: null,
      id,
      old: ["kb"],
      private: false,
    });
    expect(folderIdentity(folder({ remote: "git@github.com:me/Research.git" }))).toMatchObject({
      key: "remote:github.com/me/Research",
      name: "Research",
      remote: "github.com/me/Research",
    });
    // Two remotes: origin's names it, wherever it's listed.
    const two = folder({ remote: "" });
    writeFileSync(
      join(two, ".git", "config"),
      '[remote "mirror"]\n\turl = https://github.com/them/mirror-name\n[remote "origin"]\n\turl = git@github.com:me/fork-name.git\n[remote "upstream"]\n\turl = https://github.com/them/upstream-name\n',
    );
    expect(folderIdentity(two)).toMatchObject({ name: "fork-name", remote: "github.com/me/fork-name" });
    // Both: the name someone chose; the remote kept, its qualified name.
    expect(folderIdentity(folder({ name: "papers", id, remote: "https://gitlab.com/lab/research.git" }))).toMatchObject(
      { key: `slipbox:${id}`, name: "papers", remote: "gitlab.com/lab/research" },
    );
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
    const { lookupFolder, readFolders, recordFolder, setDefaultCopy } = await import(
      "../src/core/workspace/vaults/folders.ts"
    );
    const name = `n${uniq()}`;
    const id = uniq();
    const a = folder({ name, id });
    const b = folder({ name, id });
    expect(recordFolder(a)).toMatchObject({ name, copies: [{ path: a }], default: a });
    expect(recordFolder(a)?.ask).toBeUndefined(); // seen again: not a second copy
    expect(recordFolder(b, { found: true })).toMatchObject({
      default: a,
      ask: true,
      copies: [{ path: a }, { path: b, found: true }],
    });
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
    expect(lookupFolder(`gone${uniq()}`)).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("isn't on this machine yet: open it, or let the index find it"),
    });
  });

  test("different folders of one name: repositories by their qualified names, .slipbox/ folders until one is renamed; old names still find", async () => {
    const { lookupFolder, pointerName, readFolders, recordFolder } = await import(
      "../src/core/workspace/vaults/folders.ts"
    );
    const short = `r${uniq()}`;
    const mine = folder({ remote: `git@github.com:me/${short}.git` });
    const theirs = folder({ remote: `https://gitlab.com/lab/${short}` });
    recordFolder(mine);
    recordFolder(theirs);
    // Each named by its path (the remotes in the reason).
    expect(lookupFolder(short)).toMatchObject({
      status: "ambiguous",
      candidates: [mine, theirs].sort(),
      reason: `2 repositories are called ${short}: name one by its remote (github.com/me/${short}, gitlab.com/lab/${short})`,
    });
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
    expect(amb).toMatchObject({
      status: "ambiguous",
      reason: `2 different folders are called ${same}: rename one (slipbox name <new>, in it)`,
    });
    // Renamed in its config, its old name kept: the old name still finds it, said so.
    const was = `w${uniq()}`;
    const now = `v${uniq()}`;
    const id = uniq();
    const p = folder({ name: was, id });
    recordFolder(p);
    writeFileSync(
      join(p, ".slipbox", "config.toml"),
      `[vault]\nid = "${id}"\nname = "${now}"\nprevious_names = ["${was}"]\n`,
    );
    recordFolder(p);
    expect(lookupFolder(now)).toMatchObject({ status: "found", path: p });
    expect(lookupFolder(was)).toMatchObject({ status: "found", path: p, via: "old-name" });
    // No longer named (its .slipbox/ gone, no remote): out of the lookup.
    rmSync(join(p, ".slipbox"), { recursive: true });
    expect(recordFolder(p)).toBeNull();
    expect(lookupFolder(now)).toMatchObject({ status: "unknown" });
  });

  test("a repository and a clone of it with a .slipbox/ name of its own are copies of one: by the remote, a pointer and a hosting URL open the default copy", async () => {
    const { lookupFolder, pointerNaming, readFolders, recordFolder } = await import(
      "../src/core/workspace/vaults/folders.ts"
    );
    const { parsePointer, resolvePointer } = await import("../src/core/pointer.ts");
    // As the reference set has them: the repository named in its .slipbox/ as its remote names it, the clone
    // (found first) given a name of its own.
    const short = `k${uniq()}`;
    const remote = `git@github.com:labs/${short}.git`;
    const qualified = `github.com/labs/${short}`;
    const clone = folder({ name: `${short}-spike`, id: uniq(), remote });
    const repo = folder({ name: short, id: uniq(), remote });
    writeFileSync(join(repo, "README.md"), "# Repo\n");
    writeFileSync(join(clone, "README.md"), "# Spike\n");
    recordFolder(clone);
    recordFolder(repo);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    expect(resolvePointer(parsePointer(`slipbox://${qualified}/README.md`)!)).toMatchObject({
      status: "found",
      abs: join(repo, "README.md"),
    });
    expect(lookupFolder(`${short}-spike`)).toMatchObject({ status: "found", path: clone }); // its own name, itself
    const a = mkdtempSync(join(tmpdir(), "slipbox-named-a-"));
    mkdirSync(join(a, ".slipbox"));
    writeFileSync(
      join(a, "a.md"),
      `[r](https://github.com/labs/${short}/blob/main/README.md) [p](https://github.com/labs/${short})\n`,
    );
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    expect(g.linksOf("a.md").map((l) => [l.resolvedKind, l.path, l.via])).toEqual([
      ["note", join(repo, "README.md"), "hosting"],
      ["note", join(repo, "README.md"), "hosting"],
    ]);
    // The repository named by its remote alone: the same. Its copy gone, the clone answers, said so.
    const bare = `b${uniq()}`;
    const bareClone = folder({ name: `${bare}-spike`, id: uniq(), remote: `https://gitlab.com/lab/${bare}` });
    const bareRepo = folder({ remote: `https://gitlab.com/lab/${bare}` });
    recordFolder(bareClone);
    recordFolder(bareRepo);
    expect(lookupFolder(`gitlab.com/lab/${bare}`)).toMatchObject({ status: "found", path: bareRepo });
    rmSync(bareRepo, { recursive: true });
    expect(lookupFolder(`gitlab.com/lab/${bare}`)).toMatchObject({
      status: "found",
      path: bareClone,
      via: "another-copy",
    });
    // A clone named as the repository is no different folder: its short name is written, and followed it opens the
    // repository's default copy. With a different repository of the name too, an error names each once, by its path.
    const twin = folder({ name: short, id: uniq(), remote });
    recordFolder(twin);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo });
    expect(pointerNaming(readFolders().find((f) => f.copies.some((c) => c.path === twin))!)).toMatchObject({
      name: short,
      clash: [],
    });
    const other = folder({ remote: `https://gitlab.com/else/${short}` });
    recordFolder(other);
    expect(lookupFolder(short)).toMatchObject({
      status: "ambiguous",
      candidates: [repo, other].sort(),
      reason: `2 repositories are called ${short}: name one by its remote (${qualified}, gitlab.com/else/${short})`,
    });
    expect(pointerNaming(readFolders().find((f) => f.copies.some((c) => c.path === twin))!)).toMatchObject({
      name: qualified,
      clash: [expect.objectContaining({ remote: `gitlab.com/else/${short}` })],
    });
  });

  test("a clone with a .slipbox/ name of its own is still a copy: made its repository's default copy, and named as its repository is (DF-D30)", async () => {
    const { lookupFolder, readFolders, recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const { tildePath } = await import("../src/core/workspace/vaults/names.ts");
    const short = `c${uniq()}`;
    const remote = `git@github.com:labs/${short}.git`;
    const qualified = `github.com/labs/${short}`;
    const repo = folder({ name: short, id: uniq(), remote });
    const clone = folder({ name: `${short}-spike`, id: uniq(), remote });
    recordFolder(repo);
    recordFolder(clone);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    // `folders default`, by the repository's full name or its short one: the clone is one of its copies.
    const set = await cli(["folders", "default", qualified, clone, "--json"]);
    expect([set.code, JSON.parse(set.out).data]).toEqual([0, { name: short, default: clone }]);
    for (const name of [qualified, short, `${short}-spike`])
      expect([name, lookupFolder(name)]).toEqual([name, expect.objectContaining({ status: "found", path: clone })]);
    expect((await cli(["folders"])).out).toContain(
      `${short}  ${qualified}\n    ${tildePath(repo)}\n  * ${tildePath(clone)}  (named ${short}-spike)\n`,
    );
    expect((await cli(["folders", "default", short, repo])).code).toBe(0);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    // A folder of another repository is no copy of it: refused, its copies listed.
    const stranger = folder({ name: `${short}-x`, id: uniq(), remote: `https://gitlab.com/else/${short}` });
    recordFolder(stranger);
    const refused = await cli(["folders", "default", short, stranger]);
    expect([refused.code, refused.err]).toEqual([
      5,
      expect.stringContaining(`isn't a copy of ${short}: ${repo}, ${clone}`),
    ]);
    // The clone made the default, then no copy of the repository (its remote changed): the repository's own again.
    await cli(["folders", "default", short, clone]);
    writeFileSync(
      join(clone, ".git", "config"),
      `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://gitlab.com/else/${short}-spike\n`,
    );
    recordFolder(clone);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo });
    // `name`: a clone named as its repository is (no different folder), a different folder's name still refused.
    const twin = folder({ name: `${short}-twin`, id: uniq(), remote });
    recordFolder(twin);
    const named = await cli(["--root", twin, "name", short, "--json"]);
    expect(named.code).toBe(0);
    expect(readFileSync(join(twin, ".slipbox", "config.toml"), "utf8")).toContain(`name = "${short}"`);
    expect(readFolders().find((f) => f.copies.some((c) => c.path === twin))?.name).toBe(short);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo }); // one repository still, not two folders
    const taken = await cli(["--root", twin, "name", `${short}-x`]);
    expect([taken.code, taken.err]).toEqual([5, expect.stringContaining(`a different folder is called ${short}-x`)]);
    // `init --name`: a clone given its .slipbox/ by the repository's name.
    const plain = folder({ remote });
    const init = await cli(["init", plain, "--name", short, "--json"]);
    expect([init.code, JSON.parse(init.out).data.name]).toEqual([0, short]);
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
    expect(r.copies).toEqual([
      expect.objectContaining({ path: a, here: false, available: true }),
      expect.objectContaining({ path: b, here: true, available: true }),
    ]);
    expect((await cli(["--root", b, "info"])).out).toContain(`name      ${name} — 2 copies, links open ${a}`);
    const unnamed = folder({ obsidian: true });
    writeFileSync(join(unnamed, "y.md"), "# Y\n");
    expect((await cli(["--root", unnamed, "info"])).out).toContain(
      "name      none — no remote and no .slipbox/ name: linked to by relative path",
    );
  });
});

describe("slipbox:// pointers (21.7)", () => {
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "p")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], {
      cwd,
    }).exitCode;
  /** A named folder (`.slipbox/` with this name), its files, opened once so the lookup has it. */
  const named = async (
    name: string,
    files: Record<string, string>,
    parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-")),
  ) => {
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
    const known = [
      {
        key: "remote:github.com/me/research",
        name: "research",
        remote: "github.com/me/research",
        id: null,
        aliases: [],
        old: [],
        private: false,
        copies: [],
        default: null,
      },
    ];
    expect(parsePointer("slipbox://notes/inbox.md", known)).toEqual({
      name: "notes",
      branch: null,
      path: "inbox.md",
      fragment: null,
    });
    expect(parsePointer("slipbox://research@refactor/a%20b/x.md#Proof%20one", known)).toEqual({
      name: "research",
      branch: "refactor",
      path: "a b/x.md",
      fragment: "Proof one",
    });
    expect(parsePointer("slipbox://github.com/me/research@feat%2Fx/algo/d.md", known)).toEqual({
      name: "github.com/me/research",
      branch: "feat/x",
      path: "algo/d.md",
      fragment: null,
    });
    expect(parsePointer("slipbox://gitlab.com/them/other/x.md", known)).toMatchObject({
      name: "gitlab.com/them/other",
      path: "x.md",
    }); // unknown, by its look
    // A remote of four parts: only the lookup knows where its name ends.
    const deep = [
      ...known,
      { ...known[0]!, key: "remote:gitlab.com/group/sub/proj", name: "proj", remote: "gitlab.com/group/sub/proj" },
    ];
    expect(parsePointer("slipbox://gitlab.com/group/sub/proj/notes/x.md", deep)).toMatchObject({
      name: "gitlab.com/group/sub/proj",
      path: "notes/x.md",
    });
    expect(parsePointer("slipbox://notes", known)).toMatchObject({ name: "notes", path: "" });
    expect(parsePointer("https://notes/x.md", known)).toBeNull();
    // A known short name with dots (a GitHub Pages repository): the name, however deep the path.
    const pages = [
      {
        ...known[0]!,
        key: "remote:github.com/me/me.github.io",
        name: "me.github.io",
        remote: "github.com/me/me.github.io",
        old: ["old.site.io"],
      },
    ];
    expect(parsePointer("slipbox://me.github.io/a.md", pages)).toMatchObject({ name: "me.github.io", path: "a.md" });
    expect(parsePointer("slipbox://me.github.io/_posts/2026/x.md", pages)).toMatchObject({
      name: "me.github.io",
      branch: null,
      path: "_posts/2026/x.md",
    });
    expect(parsePointer("slipbox://ME.github.io@draft/_posts/2026/x.md", pages)).toMatchObject({
      name: "ME.github.io",
      branch: "draft",
      path: "_posts/2026/x.md",
    });
    expect(parsePointer("slipbox://old.site.io/_posts/2026/x.md", pages)).toMatchObject({
      name: "old.site.io",
      path: "_posts/2026/x.md",
    });
    expect(formatPointer({ name: "research", branch: "feat/x", path: "a b.md", fragment: "Top" }, encodeURI)).toBe(
      "slipbox://research@feat/x/a%20b.md#Top",
    ); // as a branch is written
  });

  test("followed into another folder: its note, file or folder, extensionless; in its own root, a link like any; or why not", async () => {
    const tag = uniq();
    const b = await named(`beta${tag}`, { "sub/x.md": "# X\n\n## Top\n", "img/p.png": "png" });
    const a = await named(`alpha${tag}`, { "a.md": "# A\n", "own.md": `[me](slipbox://alpha${tag}/a.md)\n` });
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const at = (target: string) => g.resolveLink({ kind: "markdown", target }, "own.md");
    expect(at(`slipbox://beta${tag}/sub/x.md#Top`)).toMatchObject({
      resolvedKind: "note",
      path: join(b, "sub", "x.md"),
      vault: `beta${tag}`,
    });
    expect(at(`slipbox://beta${tag}/sub/x`)).toMatchObject({ resolvedKind: "note", path: join(b, "sub", "x.md") });
    expect(at(`slipbox://beta${tag}/img/p.png`)).toMatchObject({ resolvedKind: "file", path: join(b, "img", "p.png") });
    expect(at(`slipbox://beta${tag}/sub/`)).toMatchObject({ resolvedKind: "folder", path: join(b, "sub") });
    // Its own root: the note by its path here, a backlink like any.
    expect(at(`slipbox://alpha${tag}/a.md`)).toMatchObject({ resolvedKind: "note", path: "a.md" });
    expect(g.backlinks("a.md").map((x) => x.from)).toEqual(["own.md"]);
    expect(at(`slipbox://beta${tag}/nope.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: `no nope.md in beta${tag}`,
    });
    expect(at(`slipbox://beta${tag}/../escape.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: "../escape.md: a pointer's path stays in its folder",
    });
    expect(at(`slipbox://gone${tag}/x.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: `gone${tag} isn't on this machine yet: open it, or let the index find it`,
    });
    // Two folders of one name: ambiguous, each by where it is.
    await named(`twin${tag}`, { "t.md": "# T\n" });
    await named(`twin${tag}`, { "t.md": "# T\n" });
    expect(at(`slipbox://twin${tag}/t.md`)).toMatchObject({
      resolvedKind: "ambiguous",
      reason: expect.stringContaining(`2 different folders are called twin${tag}`),
    });
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
    expect(r(`slipbox://github.com/me/repo${tag}@draft/x.md`)).toMatchObject({
      status: "branch",
      root: repo,
      rel: "x.md",
      branch: "draft",
    });
    expect(r(`slipbox://repo${tag}@nowhere/x.md`)).toMatchObject({
      status: "unresolved",
      reason: `repo${tag} has no branch nowhere`,
    });
    // A branch with a `/`: the longest the repository has, the rest the path.
    expect(r(`slipbox://repo${tag}@agent/sync-retry/x.md`)).toMatchObject({
      status: "branch",
      rel: "x.md",
      branch: "agent/sync-retry",
    });
    expect(r(`slipbox://repo${tag}@agent%2Fsync-retry/x.md`)).toMatchObject({
      status: "branch",
      rel: "x.md",
      branch: "agent/sync-retry",
    });
    // The path is checked again once the branch has taken its leading parts: it can't climb out then.
    expect(r(`slipbox://repo${tag}@agent/sync-retry/../x.md`)).toMatchObject({
      status: "unresolved",
      reason: "sync-retry/../x.md: a pointer's path stays in its folder",
    });
    // The CLI: the branch read from git.
    const j = JSON.parse(
      (await cli(["--root", repo, "resolve", `slipbox://repo${tag}@draft/x.md`, "--json"])).out,
    ).data;
    expect(j).toMatchObject({ status: "resolved", git: { root: repo, rel: "x.md", branch: "draft" } });
  });

  test("@branch not checked out: its #heading isn't checked against the file on disk (21.7)", async () => {
    const tag = uniq();
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-gitref-"));
    if (git(repo, "init", "-q") !== 0) return; // no git here
    git(repo, "remote", "add", "origin", `git@github.com:me/ref${tag}.git`);
    writeFileSync(join(repo, "a.md"), "# A\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "main");
    git(repo, "checkout", "-qb", "other");
    writeFileSync(join(repo, "x.md"), "# X\n\n## Setup\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "other");
    git(repo, "checkout", "-q", "main");
    writeFileSync(join(repo, "a.md"), `# A\n\n[s](slipbox://ref${tag}@other/x.md#Setup)\n`);
    await cli(["--root", repo, "ls"]);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const g = openGraph(locateVault({ root: repo }), DEFAULT_CONFIG, false);
    expect(g.resolveLink({ kind: "markdown", target: `slipbox://ref${tag}@other/x.md#Setup` }, "a.md")).toMatchObject({
      resolvedKind: "note",
      gitRef: { branch: "other" },
    });
    expect(noteProblems(g, "a.md")).toEqual([]);
  });

  test("the CLI resolves one; another folder's pointer is a backlink; a rename keeps it a pointer, in its form", async () => {
    const tag = uniq();
    const parent = await named(`p${tag}`, { "p.md": "# P\n" });
    const b = await named(`b${tag}`, { "sub/x.md": "# X\n\n## Top\n" }, parent);
    const a = await named(`a${tag}`, {
      "a.md": `[x](slipbox://b${tag}/sub/x.md#Top) [bare](slipbox://b${tag}/sub/x)\n`,
    });
    const r = JSON.parse(
      (await cli(["--root", a, "resolve", `slipbox://b${tag}/sub/x.md#Top`, "--from", "a.md", "--json"])).out,
    ).data;
    expect(r).toMatchObject({ status: "resolved", path: join(b, "sub", "x.md"), line: 3 });
    const unknown = await cli(["--root", a, "resolve", `slipbox://zz${tag}/x.md`]);
    expect(unknown.code).toBe(3);
    expect(unknown.err).toContain(`zz${tag} isn't on this machine yet`);
    const back = JSON.parse((await cli(["--root", b, "backlinks", "sub/x.md", "--json"])).out).data.backlinks;
    expect(back.map((x: { from: string; target: string }) => x.target)).toEqual([
      `slipbox://b${tag}/sub/x.md#Top`,
      `slipbox://b${tag}/sub/x`,
    ]);
    expect((await cli(["--root", b, "mv", "sub/x.md", "moved/y.md"])).code).toBe(0);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(
      `[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`,
    );
    // The folder itself moved by slipbox: a pointer names it, wherever it is — nothing rewritten.
    expect((await cli(["--root", parent, "mv", `b${tag}`, `deeper/b${tag}`])).code).toBe(0);
    expect(existsSync(join(parent, "deeper", `b${tag}`, "moved", "y.md"))).toBe(true);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(
      `[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`,
    );
  });

  test("written across folders that don't travel together: a pointer; together (one repository, nested outside git), a relative path", async () => {
    const { linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const { travelTogether } = await import("../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-w-"));
    const b = await named(`wb${tag}`, { "far note.md": "---\ntitle: Far\n---\n# Far\n" }, parent);
    const a = await named(`wa${tag}`, { "a.md": "# A\n" }, parent);
    const inner = await named(`wi${tag}`, { "i.md": "# I\n" }, a);
    expect([travelTogether(a, b), travelTogether(a, inner), travelTogether(inner, a)]).toEqual([false, true, true]);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const conv = {
      path: { value: "name", source: "tool", why: "" },
      extension: { value: "dropped", source: "tool", why: "" },
    } as never;
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "Far")).toBe(
      `[Far](slipbox://wb${tag}/far%20note.md)`,
    );
    // A wikilink root: a pointer is a URL, so a markdown link.
    expect(writeLink(conv, "wiki", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "")).toBe(
      `[far note](slipbox://wb${tag}/far%20note.md)`,
    );
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(inner, "i.md")), "I")).toBe(
      `[I](wi${tag}/i.md)`,
    );
    // One repository: its named folders travel together, wherever each is in it.
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-repo-"));
    mkdirSync(join(repo, ".git"));
    const r1 = await named(`r1${tag}`, { "one.md": "# One\n" }, join(repo, "docs"));
    const r2 = await named(`r2${tag}`, { "two.md": "# Two\n" }, join(repo, "notes"));
    expect(travelTogether(r1, r2)).toBe(true);
    const gr = openGraph(locateVault({ root: r1 }), DEFAULT_CONFIG, false);
    expect(writeLink(conv, "markdown", linkEnds(gr, join(r1, "one.md"), join(r2, "two.md")), "Two")).toBe(
      `[Two](../../notes/r2${tag}/two.md)`,
    );
    const j = JSON.parse(
      (await cli(["--root", a, "link", join(b, "far note.md"), "--from", "a.md", "--json"])).out,
    ).data;
    expect(j.link).toBe(`[Far](slipbox://wb${tag}/far%20note.md)`);
  });

  test("pointers to many files from one root, with a memo: the same as one by one, each folder's name worked out once, the named folders read once", async () => {
    const { linkEnds, linkWarnings, pointerAt } = await import("../src/core/write-link.ts");
    const { foldersFile, recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-memo-"));
    const b = await named(`mb${tag}`, { "x.md": "# X\n", "sub/y.md": "# Y\n", "z.md": "# Z\n" }, parent);
    const c = await named(`mc${tag}`, { "w.md": "# W\n" }, parent);
    const a = await named(`ma${tag}`, { "a.md": "# A\n" }, parent);
    const inner = await named(`mi${tag}`, { "i.md": "# I\n" }, a);
    // Two folders of one name (ambiguous), a private name, and two repositories of one short name (qualified).
    const twin1 = await named(`mt${tag}`, { "t.md": "# T\n" }, join(parent, "one"));
    await named(`mt${tag}`, { "t.md": "# T\n" }, join(parent, "two"));
    const priv = join(parent, `mp${tag}`);
    mkdirSync(priv);
    expect(git(priv, "init", "-q")).toBe(0);
    writeFileSync(join(priv, "p.md"), "# P\n");
    expect((await cli(["init", priv, "--name", `mp${tag}`, "--private"])).code).toBe(0);
    const repo = (remote: string) => {
      const d = mkdtempSync(join(parent, "repo-"));
      mkdirSync(join(d, ".git", "info"), { recursive: true });
      writeFileSync(join(d, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n`);
      writeFileSync(join(d, "r.md"), "# R\n");
      recordFolder(d);
      return d;
    };
    const mine = repo(`git@github.com:me/mr${tag}.git`);
    repo(`https://gitlab.com/lab/mr${tag}`);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const from = join(a, "a.md");
    const targets = [
      join(b, "x.md"),
      join(b, "sub", "y.md"),
      join(c, "w.md"),
      join(b, "z.md"),
      join(inner, "i.md"),
      join(parent, "loose.md"),
      join(twin1, "t.md"),
      join(priv, "p.md"),
      join(mine, "r.md"),
    ];
    const ends = (memo?: import("../src/core/write-link.ts").PointerMemo) =>
      targets.map((t) => linkEnds(g, from, t, memo));
    const shape = (e: ReturnType<typeof linkEnds>) => ({ pointer: e.pointer, naming: e.naming, say: linkWarnings(e) });
    const read = fs.readFileSync;
    let reads = 0;
    const spy = spyOn(fs, "readFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, ...rest: never[]) => {
      if (path === foldersFile()) reads++;
      return read(path, ...rest);
    }) as typeof fs.readFileSync);
    try {
      const alone = ends();
      expect(reads).toBeGreaterThan(1); // without a memo, read again per file
      reads = 0;
      const memo = { root: a, naming: new Map() };
      const memoed = ends(memo);
      expect(reads).toBe(1);
      expect(memoed.map(shape)).toEqual(alone.map(shape));
      expect(alone.map((e) => e.pointer)).toEqual([
        `slipbox://mb${tag}/x.md`,
        `slipbox://mb${tag}/sub/y.md`,
        `slipbox://mc${tag}/w.md`,
        `slipbox://mb${tag}/z.md`,
        null, // travels with it: a relative path
        null, // in no named folder
        `slipbox://mt${tag}/t.md`,
        `slipbox://mp${tag}/p.md`,
        `slipbox://github.com/me/mr${tag}/r.md`,
      ]);
      expect(alone.slice(6).map((e) => linkWarnings(e).length)).toEqual([1, 1, 1]);
      // One folder's files share its name, worked out once; another folder has its own.
      expect(memoed[1]!.naming).toBe(memoed[0]!.naming!);
      expect(memoed[3]!.naming).toBe(memoed[0]!.naming!);
      expect(memoed[2]!.naming).not.toBe(memoed[0]!.naming!);
      expect(alone[1]!.naming).not.toBe(alone[0]!.naming!);
      // From another root, the memo is left alone: the folder nested in this one travels with it, not with that one.
      expect(pointerAt(b, join(inner, "i.md"), memo)?.pointer).toBe(`slipbox://mi${tag}/i.md`);
    } finally {
      spy.mockRestore();
    }
  });

  test("a pointer written says when its name is private; on a name different folders share, the qualified one, said — else ambiguous, said (D74, D83)", async () => {
    const { linkEnds, linkWarnings, writeLink } = await import("../src/core/write-link.ts");
    const { recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-say-"));
    const a = await named(`sa${tag}`, { "a.md": "# A\n" }, parent);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const conv = {
      path: { value: "relative", source: "ours", why: "" },
      extension: { value: "kept", source: "ours", why: "" },
    } as never;
    const write = (abs: string) => {
      const ends = linkEnds(g, join(a, "a.md"), abs);
      return { link: writeLink(conv, "markdown", ends, "T"), warnings: linkWarnings(ends) };
    };
    // A private name (`init --private`: its .slipbox/ kept out of git): the pointer works here only.
    const priv = join(parent, `priv${tag}`);
    mkdirSync(priv);
    expect(git(priv, "init", "-q")).toBe(0);
    writeFileSync(join(priv, "p.md"), "# P\n");
    expect((await cli(["init", priv, "--name", `pv${tag}`, "--private"])).code).toBe(0);
    const privately = `pv${tag} is a private name (its .slipbox/ is kept out of git): the pointer works on this machine only`;
    expect(write(join(priv, "p.md"))).toEqual({ link: `[T](slipbox://pv${tag}/p.md)`, warnings: [privately] });
    const j = JSON.parse((await cli(["--root", a, "link", join(priv, "p.md"), "--from", "a.md", "--json"])).out);
    expect([j.data.link, j.warnings]).toEqual([`[P](slipbox://pv${tag}/p.md)`, [privately]]);
    // The relink writing one, in its plan.
    writeFileSync(join(a, "rel.md"), `[p](../priv${tag}/p.md)\n`);
    const relink = JSON.parse((await cli(["--root", a, "relink", "rel.md", "--dry-run", "--json"])).out);
    expect([relink.data.files[0].edits[0].after, relink.warnings]).toEqual([
      `[p](slipbox://pv${tag}/p.md)`,
      [privately],
    ]);
    // Repositories of one short name: alone, the short one, nothing said; with another, the qualified one, said.
    const repo = (remote: string) => {
      const d = mkdtempSync(join(parent, "repo-"));
      mkdirSync(join(d, ".git", "info"), { recursive: true });
      writeFileSync(join(d, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n`);
      writeFileSync(join(d, "r.md"), "# R\n");
      recordFolder(d);
      return d;
    };
    const mine = repo(`git@github.com:me/rr${tag}.git`);
    expect(write(join(mine, "r.md"))).toEqual({ link: `[T](slipbox://rr${tag}/r.md)`, warnings: [] });
    repo(`https://gitlab.com/lab/rr${tag}`);
    const qualified = `2 different folders are called rr${tag}: written by its qualified name, github.com/me/rr${tag}`;
    expect(write(join(mine, "r.md"))).toEqual({
      link: `[T](slipbox://github.com/me/rr${tag}/r.md)`,
      warnings: [qualified],
    });
    const cliSays = await cli(["--root", a, "link", join(mine, "r.md"), "--from", "a.md"]);
    expect([cliSays.out, cliSays.err]).toEqual([
      `[R](slipbox://github.com/me/rr${tag}/r.md)\n`,
      `slipbox: warning: ${qualified}\n`,
    ]);
    // Two .slipbox/ folders of one name, no qualified name: the short one, said to be ambiguous.
    const s1 = await named(`ss${tag}`, { "s.md": "# S\n" }, mkdtempSync(join(parent, "s1-")));
    await named(`ss${tag}`, { "s.md": "# S\n" }, mkdtempSync(join(parent, "s2-")));
    const ambiguous = (name: string) =>
      `2 different folders are called ${name}: followed, the pointer asks which — rename one (slipbox name <new>, in it)`;
    expect(write(join(s1, "s.md"))).toEqual({
      link: `[T](slipbox://ss${tag}/s.md)`,
      warnings: [ambiguous(`ss${tag}`)],
    });
    // A different folder answering to the name by an alias shares it too, as following reads it.
    const al = await named(`al${tag}`, { "l.md": "# L\n" }, parent);
    expect(write(join(al, "l.md")).warnings).toEqual([]);
    const other = await named(`ot${tag}`, {}, parent); // typos: ignore-line
    writeFileSync(
      join(other, ".slipbox", "config.toml"),
      `[vault]\nid = "${uniq()}"\nname = "ot${tag}"\naliases = ["al${tag}"]\n`, // typos: ignore-line
    );
    recordFolder(other);
    expect(write(join(al, "l.md")).warnings).toEqual([ambiguous(`al${tag}`)]);
  });

  test("the relink offers a pointer for a relative link into a named folder — reached, or broken where that folder was", async () => {
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-r-"));
    const b = await named(`rb${tag}`, { "n.md": "# N\n" }, parent);
    const a = await named(`ra${tag}`, { "a.md": `[n](../rb${tag}/n.md#top) [n2](../rb${tag}/n.md)\n` }, parent);
    const files = (r: Captured) =>
      JSON.parse(r.out).data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after));
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([
      `[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`,
    ]);
    // Moved by hand, opened where it went: the links broke; the relink offers the pointer to where it is.
    const moved = join(mkdtempSync(join(tmpdir(), "slipbox-ptr-r2-")), `rb${tag}`);
    renameSync(b, moved);
    await cli(["--root", moved, "ls"]);
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([
      `[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`,
    ]);
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
    expect(githubSlugs(["a", "a", "a-1", "b", "a"].map((slug) => ({ slug })))).toEqual([
      "a",
      "a-1",
      "a-1-1",
      "b",
      "a-2",
    ]);
    const { dir, g } = vault({
      "n.md": "# N\n\n## Setup\n\none\n\n## Setup\n\ntwo\n",
      "a.md": "[1](n.md#setup) [2](n.md#setup-1) [[n#Setup]]\n",
    });
    expect(landingLine(g, "n.md", "setup", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup-1", null)).toBe(7);
    expect(landingLine(g, "n.md", "Setup", null, true)).toBe(3);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const probs = noteProblems(g, "a.md").map((p) => [p.code, p.target, p.message]);
    expect(probs).toEqual([
      ["ambiguous-heading", "n", 'several headings "Setup" in n.md: this link reaches the first'],
    ]);
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
    const { g } = vault({
      "n.md":
        '# N\n\n## Setup {#install-guide .wide}\n\nx\n\n<a id="faq"></a>\n\nQ?\n\nThe <a name="old">old</a> place.\n',
    });
    expect(g.entry("n.md")!.headings.find((h) => h.depth === 2)).toMatchObject({ text: "Setup", id: "install-guide" });
    expect(landingLine(g, "n.md", "install-guide", null)).toBe(3);
    expect(landingLine(g, "n.md", "setup", null)).toBe(3); // its own slug too
    expect(landingLine(g, "n.md", "faq", null)).toBe(7);
    expect(landingLine(g, "n.md", "old", null)).toBe(11);
    const r = renderMarkdown("## Setup {#install-guide}\n", {
      width: 40,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    expect(r.lines.map((l) => l.spans.map((s) => s.text).join("")).join("\n")).not.toContain("{#");
    expect(r.headings[0]).toMatchObject({ text: "Setup", id: "install-guide" });
  });

  test("line links: L42, L42-L50, L42C5-L45C10; a ^id inside a code fence is code, not a block", async () => {
    const { blockIds, landingLine, landingText, lineFragment } = await import("../src/core/landing.ts");
    expect(lineFragment("L42-L50")).toEqual({ line: 42, col: null, endLine: 50 });
    expect(lineFragment("L42C5-L45C10")).toEqual({ line: 42, col: 5, endLine: 45 });
    expect(lineFragment("L0")).toEqual({ line: 1, col: null, endLine: null });
    expect(lineFragment("Lx")).toBeNull();
    const text =
      "# N\n\n```js\nconst a = 1; ^fake\n```\n\nreal paragraph ^real\n\n~~~~\n``` not a close\n~~~\nb ^fake2\n~~~~\n\n```not `a` fence\nstill text ^inline\n";
    expect(blockIds(text)).toEqual([
      { id: "real", line: 7 },
      { id: "inline", line: 16 },
    ]);
    const { g } = vault({ "n.md": text });
    expect(landingLine(g, "n.md", null, "fake")).toBeNull();
    expect(landingLine(g, "n.md", null, "real")).toBe(7);
    expect(landingLine(g, "n.md", "L3C2-L5C1", null)).toBe(3);
    expect(landingText(g, "n.md", "L3-L5", null)).toBe("```js\nconst a = 1; ^fake\n```");
  });

  test("a link to a note itself lands on its start, its front matter left out; one never closed is text; a note that isn't, nothing", async () => {
    const { landingText } = await import("../src/core/landing.ts");
    const { g } = vault({
      "plan.md": "---\ntitle: Plan\ntags: [a]\n---\n\n# Plan\n\nThe body.\n",
      "yaml.md": "---\ntitle: Dots\n...\nAfter the dots.\n",
      "open.md": "---\ntitle: Open\nno close\n",
    });
    expect(landingText(g, "plan.md", null, null)).toBe("# Plan\n\nThe body.");
    expect(landingText(g, "yaml.md", null, null)).toBe("After the dots.");
    expect(landingText(g, "open.md", null, null)).toBe("---\ntitle: Open\nno close");
    expect(landingText(g, "nope.md", null, null)).toBeNull();
  });
});

describe("links in front matter (Obsidian's properties)", () => {
  test("a property's wikilinks are links: read where written, backlinked, renamed in place, drawn and checked; a comment's aren't", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-fmlinks-"));
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "Dal.md"), "# Dal\n");
    writeFileSync(join(dir, "Home.md"), "# Home\n");
    writeFileSync(join(dir, "pic.png"), "png");
    writeFileSync(
      join(dir, "x.md"),
      '---\nrelated: "[[Dal]]"\nup: ["[[Home|home]]", "![[pic.png]]"]\n# not this: [[Nope]]\nmissing: "[[Gone]]"\n---\n# X\n',
    );
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
    const parsed = (await import("../src/core/readers.ts")).parseNoteFile(
      "x.md",
      readFileSync(join(dir, "x.md"), "utf8"),
    );
    const { renderTree } = await import("../src/core/layout/render.ts");
    const r = renderTree(
      parsed.tree,
      {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
        resolveLink: (_k, t) => (t === "Gone" ? "unresolved" : "resolved"),
      },
      parsed.frontmatter,
    );
    expect(r.links.map((l) => [l.kind, l.target, l.text])).toEqual([
      ["wiki", "Dal", "Dal"],
      ["wiki", "Home", "home"],
      ["embed", "pic.png", "pic.png"],
      ["wiki", "Gone", "Gone"],
    ]);
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
    expect(how("Starter", "Recipes/Baking/x.md")).toEqual([
      "Recipes/Baking/Starter.md",
      "same-folder",
      "inferred",
      "in the same folder, of 2",
    ]);
    expect(how("Starter")).toEqual(["Archive/Starter.md", "shortest", "inferred", "the shortest path of 2 named so"]);
    expect(how("Recipes/Notes.md", "Home.md", "markdown")).toEqual(["Recipes/Notes.md", "path", "exact", null]);
    expect(certainty({ resolvedKind: "ambiguous" })).toBe("ambiguous");
    expect(certainty({ resolvedKind: "unresolved" })).toBe("broken");
  });

  test("every link says how it landed, not wikilinks only: a markdown link by its path, a pointer by its folder's name, a hosting URL by the remote (D86)", async () => {
    const { certainty, describeLanding } = await import("../src/core/graph.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-how-kinds-"));
    const name = `h${basename(dir)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, ".git", "config"), `[remote "origin"]\n\turl = git@github.com:me/${name}.git\n`);
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "plan.md"), "# Plan\n");
    const pointer = `slipbox://${name}/docs/plan.md`;
    const hosted = `https://github.com/me/${name}/blob/main/docs/plan.md`;
    writeFileSync(
      join(dir, "README.md"),
      `[p](docs/plan.md) [d](docs/) [ptr](${pointer}) [h](${hosted}) [out](../elsewhere.md)\n`,
    );
    const resolved = async (link: string) => {
      const r = JSON.parse((await cli(["--root", dir, "resolve", link, "--from", "README.md", "--json"])).out).data;
      return [r.status, r.path, r.how, r.certainty];
    };
    expect(await resolved("docs/plan.md")).toEqual(["resolved", "docs/plan.md", "path", "exact"]);
    expect(await resolved(pointer)).toEqual(["resolved", "docs/plan.md", "pointer", "exact"]);
    expect(await resolved(hosted)).toEqual(["resolved", "docs/plan.md", "hosting", "exact"]);
    // The resolver's own: every link reaching a file or folder; nothing to say in the hover or the link check for an exact one.
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(g.linksOf("README.md").map((l) => [l.target, l.how ?? null, certainty(l), describeLanding(l)])).toEqual([
      ["docs/plan.md", "path", "exact", null],
      ["docs/", "path", "exact", null],
      [pointer, "pointer", "exact", null],
      [hosted, "hosting", "exact", null],
      ["../elsewhere.md", null, "broken", null],
    ]);
  });

  test("a link won by where it's written is fragile: said, with the path that names it for sure, a fix; problems and the CLI list them", async () => {
    const { dir, g } = vault(files);
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const fragile = noteProblems(g, "Home.md").filter((p) => p.code === "fragile");
    expect(fragile.map((p) => [p.target, p.fix])).toEqual([
      ["Pie", { title: "Name it for sure: [[Recipes/Baking/Pie]]", text: "[[Recipes/Baking/Pie]]" }],
      ["Starter", { title: "Name it for sure: [[Archive/Starter]]", text: "[[Archive/Starter]]" }],
    ]);
    expect(fragile[0]!.message).toBe(
      "[[Pie]] reaches Recipes/Baking/Pie.md as the shortest path of 2 named so — a note of that name nearer would take it; [[Recipes/Baking/Pie]] names it for sure",
    );
    expect(g.problems().fragile.map((p) => [p.from, p.target, p.fix])).toEqual([
      ["Home.md", "Pie", "Recipes/Baking/Pie"],
      ["Home.md", "Starter", "Archive/Starter"],
    ]);
    const human = (await cli(["--root", dir, "problems"])).out;
    expect(human).toContain("fragile links (2)");
    expect(human).toContain(
      "Home.md:1:55  [[Pie]]  — the shortest path of 2 named so; [[Recipes/Baking/Pie]] names it for sure",
    );
    const links = JSON.parse((await cli(["--root", dir, "links", "Home.md", "--json"])).out).data;
    expect(
      links.map((l: { target: string; how: string; certainty: string }) => [l.target, l.how, l.certainty]),
    ).toEqual([
      ["Notes", "same-folder", "inferred"],
      ["Recipes/Notes", "path", "exact"],
      ["Dal", "name", "exact"],
      ["Weeknight/Dal", "suffix", "inferred"],
      ["Pie", "shortest", "inferred"],
      ["Starter", "shortest", "inferred"],
      ["Recipes/Notes.md", "path", "exact"],
    ]);
    expect((await cli(["--root", dir, "links", "Home.md"])).out).toContain(
      "[[Pie]] -> Recipes/Baking/Pie.md (the shortest path of 2 named so)",
    );
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
    g.updateFile("Recipes/Baking/Pie.md", {
      rel: "Recipes/Baking/Pie.md",
      abs: join(g.root, "Recipes/Baking/Pie.md"),
      size: 30,
      mtimeMs: Date.now(),
    });
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
    expect(parseHosted("https://github.com/me/repo/blob/main/docs/my%20plan.md#goals")).toEqual({
      remote: "github.com/me/repo",
      ref: "main",
      path: "docs/my plan.md",
      fragment: "goals",
      folder: false,
    });
    expect(parseHosted("https://github.com/me/repo/tree/v2/docs")).toMatchObject({
      ref: "v2",
      path: "docs",
      folder: true,
    });
    expect(parseHosted("https://GitLab.com/group/sub/proj/-/blob/main/x.md")).toMatchObject({
      remote: "gitlab.com/group/sub/proj",
      ref: "main",
      path: "x.md",
    });
    expect(parseHosted("https://bitbucket.org/team/repo/src/main/docs/x.md#markdown-header-goals")).toMatchObject({
      remote: "bitbucket.org/team/repo",
      path: "docs/x.md",
      fragment: "goals",
    });
    expect(parseHosted("https://github.com/me/repo.git#readme")).toEqual({
      remote: "github.com/me/repo",
      ref: null,
      path: "",
      fragment: null,
      folder: false,
    });
    expect(parseHosted("https://github.com/me/repo/issues/12")).toBeNull();
    // Encoded slashes never climb out of the copy: not a hosting link, an external one.
    expect(parseHosted("https://github.com/me/repo/blob/main/..%2F..%2Fsecret.md")).toBeNull();
    expect(parseHosted("https://github.com/me/repo/blob/main/docs%2F.%2Fplan.md")).toBeNull();
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
    writeFileSync(
      join(dir, "README.md"),
      `# Repo\n\n[plan](${base}/blob/main/docs/plan.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/plan.md) [home](https://github.com/ME/Repo#readme) [else](https://github.com/them/other/blob/main/x.md) [gone](${base}/blob/main/gone.md)\n`,
    );
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
    const r = JSON.parse(
      (await cli(["--root", dir, "resolve", `${base}/blob/main/docs/plan.md#goals`, "--json"])).out,
    ).data;
    expect(r).toMatchObject({ status: "resolved", path: "docs/plan.md", line: 3 });
    expect((await cli(["--root", dir, "mv", "docs/plan.md", "docs/road map.md"])).code).toBe(0);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain(
      `[plan](${base}/blob/main/docs/road%20map.md#goals) [docs](${base}/tree/main/docs) [dev](${base}/blob/dev/docs/road%20map.md)`,
    );
  });

  test("another repository this machine knows by its remote (21.6): its file there", async () => {
    const { recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const tag = basename(mkdtempSync(join(tmpdir(), "h")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
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
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "w")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
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
    const f = JSON.parse((await cli(["folders", "--json"])).out).data.find(
      (x: { name: string }) => x.name === `f${tag}`,
    );
    expect(f).toMatchObject({
      pointer: `f${tag}`,
      default: one,
      copies: [
        { path: one, available: true },
        { path: two, available: true },
      ],
    });
    expect((await cli(["folders"])).out).toContain(`f${tag}\n  * ${one}\n    ${two}`);
    expect((await cli(["folders", "default", `f${tag}`, two])).code).toBe(0);
    expect(
      JSON.parse((await cli(["folders", "--json"])).out).data.find((x: { name: string }) => x.name === `f${tag}`)
        .default,
    ).toBe(two);
    expect((await cli(["folders", "default", `f${tag}`, "/not/a/copy"])).code).toBe(5);
    expect((await cli(["folders", "default", `nope${tag}`, two])).code).toBe(3);
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

  test("an attachment renamed or moved keeps its wikilinks' extension once: ![[dal.png]] → ![[dal2.png]]", async () => {
    const { planNoteRename, planFolderMove } = await import("../src/core/rename.ts");
    const { dir, g } = root({
      "x.md": "![[dal.png]] ![[pics/a.pdf]] [[pics/a.pdf]]\n",
      "pics/y.md": "![[./a.pdf]]\n",
      "dal.png": "png",
      "pics/a.pdf": "pdf",
    });
    applyPlan(g, planNoteRename(g, "dal.png", "dal2.png"));
    expect(read(dir, "x.md")).toBe("![[dal2.png]] ![[pics/a.pdf]] [[pics/a.pdf]]\n");
    applyPlan(g, planNoteRename(g, "pics/a.pdf", "pics/b.pdf"));
    expect(read(dir, "pics/y.md")).toBe("![[./b.pdf]]\n");
    applyPlan(g, planFolderMove(g, "pics", "docs"));
    expect(read(dir, "x.md")).toBe("![[dal2.png]] ![[docs/b.pdf]] [[docs/b.pdf]]\n");
    expect(read(dir, "docs/y.md")).toBe("![[./b.pdf]]\n");
    const fresh = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    for (const l of fresh.entry("x.md")!.links) expect(fresh.resolveLink(l, "x.md").resolvedKind).toBe("file");
    expect(fresh.resolveLink(fresh.entry("docs/y.md")!.links[0]!, "docs/y.md")).toMatchObject({
      resolvedKind: "file",
      path: "docs/b.pdf",
    });
  });

  test("rename-heading on a setext heading rewrites it with its links; a heading not found writes nothing", async () => {
    const { RenameError } = await import("../src/core/rename.ts");
    const { dir, g } = root({
      "plan.md": "Plan\n====\n\nGoals {#g}\n-----\n",
      "x.md": "[a](plan.md#goals) [[plan#Goals]]\n",
    });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("Plan\n====\n\nAims {#g}\n-----\n");
    expect(read(dir, "x.md")).toBe("[a](plan.md#aims) [[plan#Aims]]\n");
    // The file changed under its index: the heading's line is no heading now — refused, nothing written.
    const { dir: d2, g: g2 } = root({ "plan.md": "# Plan\n\n## Goals\n", "x.md": "[a](plan.md#goals)\n" });
    writeFileSync(join(d2, "plan.md"), "# Plan\n\nGoals, no longer a heading\n");
    expect(() => planHeadingRename(g2, "plan.md", "Goals", "Aims")).toThrow(RenameError);
    expect(read(d2, "x.md")).toBe("[a](plan.md#goals)\n");
  });

  test("rename-heading keeps the heading's {#id}: links by the id still reach it", () => {
    const { dir, g } = root({
      "plan.md": "# Plan\n\n## Goals {#g} ##\n",
      "x.md": "[a](plan.md#goals) [b](plan.md#g)\n",
    });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("# Plan\n\n## Aims {#g} ##\n");
    expect(read(dir, "x.md")).toBe("[a](plan.md#aims) [b](plan.md#g)\n");
    const fresh = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(fresh.entry("plan.md")!.headings.find((h) => h.text === "Aims")).toMatchObject({ id: "g" });
  });

  test("rename-heading rewrites the note's own links to it by its path or name, not only its anchors", () => {
    const { dir, g } = root({ "plan.md": "[self](plan.md#goals) [[plan#Goals]] [[#Goals]]\n\n## Goals\n" });
    applyPlan(g, planHeadingRename(g, "plan.md", "Goals", "Aims"));
    expect(read(dir, "plan.md")).toBe("[self](plan.md#aims) [[plan#Aims]] [[#Aims]]\n\n## Aims\n");
  });

  test("a fragile link to a top-level note is fixed by a relative path: [[plan]] → [[../plan]], never [[plan]] again", async () => {
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const { g } = root({
      "plan.md": "# P\n",
      "a/b/plan.md": "# P2\n",
      "dal.png": "png",
      "a/b/dal.png": "png",
      "x/note.md": "See [[plan]]. ![[dal.png]]\n",
      "top.md": "[[plan]]\n",
    });
    expect(g.resolveLink({ kind: "wiki", target: "plan" }, "x/note.md")).toMatchObject({
      path: "plan.md",
      how: "shortest",
    });
    // A top-level attachment, its extension written, is its path from the root already: not fragile.
    expect(g.resolveLink({ kind: "embed", target: "dal.png" }, "x/note.md")).toMatchObject({
      path: "dal.png",
      how: "path",
    });
    expect(
      g
        .problems()
        .fragile.filter((p) => p.from !== "top.md")
        .map((p) => [p.from, p.target, p.fix]),
    ).toEqual([["x/note.md", "plan", "../plan"]]);
    const fixes = noteProblems(g, "x/note.md").filter((p) => p.code === "fragile");
    expect(fixes.map((p) => p.fix)).toEqual([{ title: "Name it for sure: [[../plan]]", text: "[[../plan]]" }]);
    expect(fixes[0]!.message).toContain("[[../plan]] names it for sure");
    // The fix names it by its path: a note of that name nearer can't take it.
    writeFileSync(join(g.root, "x", "plan.md"), "# near\n");
    g.updateFile("x/plan.md", { rel: "x/plan.md", abs: join(g.root, "x", "plan.md"), size: 7, mtimeMs: Date.now() });
    expect(g.resolveLink({ kind: "wiki", target: "../plan" }, "x/note.md")).toMatchObject({
      resolvedKind: "note",
      path: "plan.md",
      how: "path",
    });
    expect(g.resolveLink({ kind: "embed", target: "../dal.png" }, "x/note.md")).toMatchObject({
      resolvedKind: "file",
      path: "dal.png",
    });
  });

  test("a front matter line's trailing YAML comment holds no links: `# was [[Draft]]` is neither a link nor broken", async () => {
    const { frontmatterLinks } = await import("../src/core/graph.ts");
    const targets = (raw: string) => frontmatterLinks(raw).map((l) => l.target);
    expect(targets('related: "[[Plan]]"  # was [[Draft]]\n# all [[Gone]]\n')).toEqual(["Plan"]);
    // A `#` in a link, or in quotes, is no comment; a plain scalar's apostrophe opens no quote.
    expect(
      targets("up: \"[[Plan#Goals]]\" # [[No]]\nt: \"a # b [[In]]\"\nu: 'it''s # [[In2]]'\nby: Bob's # [[No2]]\n"),
    ).toEqual(["Plan", "In", "In2"]);
    const { g } = root(
      { "Plan.md": "# P\n", "x.md": '---\nrelated: "[[Plan]]"  # was [[Draft]]\n---\n# X\n' },
      ".obsidian",
    );
    expect(g.linksOf("x.md").map((l) => l.target)).toEqual(["Plan"]);
    expect(g.problems().broken.map((p) => p.target)).not.toContain("Draft");
  });

  test("a wikilink path to a dotted name (2024.01.05, v1.2) reaches its note out of the root and into a nested one, a backlink there", async () => {
    const { openVault } = await import("../src/core/reach.ts");
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

  test("in a folder with no root, a [links] style of wiki or a path from the root writes a link the folder reads", async () => {
    const { conventionOf } = await import("../src/core/convention.ts");
    const { linkEnds, writeLink } = await import("../src/core/write-link.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-plain-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "plan.md"), "# Plan\n");
    writeFileSync(join(dir, "sub", "a.md"), "# A\n");
    const g = openGraph(elsewhereAt(dir), DEFAULT_CONFIG, true);
    for (const [style, path] of [
      ["wiki", "name"],
      ["markdown", "root"],
      ["wiki", "root"],
    ] as const) {
      const c = conventionOf(g, { ...DEFAULT_CONFIG, links: { style, path, extension: "auto" } }, {});
      const written = writeLink(c, c.style.value, linkEnds(g, join(dir, "sub", "a.md"), join(dir, "plan.md")), "");
      expect(written).toBe("[plan](../plan.md)");
      const target = /\]\(([^)]*)\)/.exec(written)![1]!;
      expect(g.resolveLink({ kind: "markdown", target }, "sub/a.md")).toMatchObject({
        resolvedKind: "note",
        path: "plan.md",
      });
    }
  });

  test("convert-links makes a `/…` link into a nested root relative, never 'nothing there'", async () => {
    const { planConvert } = await import("../src/core/convert.ts");
    const { dir, g } = root({
      "docs/home.md": "[x](/F/plan.md) [y](/docs/o.md)\n",
      "docs/o.md": "# O\n",
      "F/.slipbox/config.toml": "",
      "F/plan.md": "# Plan\n",
    });
    expect(g.resolveLink({ kind: "markdown", target: "/F/plan.md" }, "docs/home.md")).toMatchObject({
      resolvedKind: "note",
      path: join(dir, "F", "plan.md"),
    });
    const plan = planConvert(g);
    expect(plan.skipped).toEqual([]);
    applyPlan(g, plan);
    expect(read(dir, "docs/home.md")).toBe("[x](../F/plan.md) [y](o.md)\n");
  });

  test("init --name on a [vault] table the edit can't follow (dotted keys, `[ vault ]`): refused, the file as it was", () => {
    for (const text of ['vault.aliases = ["n"]\n\n[render]\ninset = 2\n', '[ vault ]\naliases = ["n"]\n']) {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-init-"));
      mkdirSync(join(dir, ".slipbox"));
      writeFileSync(join(dir, ".slipbox", "config.toml"), text);
      expect(() =>
        initVault(
          dir,
          `n${basename(dir)
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase()}`,
        ),
      ).toThrow("can't edit .slipbox/config.toml's [vault] table safely: edit it by hand");
      expect(read(dir, ".slipbox/config.toml")).toBe(text);
    }
    // A table it can follow: named, the rest kept.
    const ok = mkdtempSync(join(tmpdir(), "slipbox-c3-init-"));
    mkdirSync(join(ok, ".slipbox"));
    writeFileSync(join(ok, ".slipbox", "config.toml"), '[vault]\naliases = ["n"]\n\n[render]\ninset = 2\n');
    const name = `n${basename(ok)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    expect(initVault(ok, name)).toMatchObject({ identified: true, name });
    expect(loadConfig({ vaultRoot: ok }).config.render.inset).toBe(2);
  });

  test("a folder's alias finds it as its name does — exact, never relinked away; a previous name is said and relinked", async () => {
    const { lookupFolder, recordFolder } = await import("../src/core/workspace/vaults/folders.ts");
    const { certainty } = await import("../src/core/graph.ts");
    const tag = basename(mkdtempSync(join(tmpdir(), "a")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const { dir } = root({
      ".slipbox/config.toml": `[vault]\nid = "al${tag}"\nname = "notes${tag}"\naliases = ["n${tag}"]\nprevious_names = ["was${tag}"]\n`,
      "x.md": "# X\n",
    });
    recordFolder(dir);
    expect(lookupFolder(`n${tag}`)).toMatchObject({ status: "found", path: dir });
    expect(lookupFolder(`n${tag}`)).not.toHaveProperty("via");
    expect(lookupFolder(`was${tag}`)).toMatchObject({ status: "found", path: dir, via: "old-name" });
    const { dir: other, g } = root({ "a.md": `[x](slipbox://n${tag}/x.md) [y](slipbox://was${tag}/x.md)\n` });
    expect(g.linksOf("a.md").map((l) => [l.resolvedKind, l.via ?? null, certainty(l)])).toEqual([
      ["note", null, "exact"],
      ["note", "old-name", "inferred"],
    ]);
    applyPlan(g, planRelink(g));
    expect(read(other, "a.md")).toBe(`[x](slipbox://n${tag}/x.md) [y](slipbox://notes${tag}/x.md)\n`);
  });

  test("one named folder reached by its real path and by a symlink is one copy: nothing asked", async () => {
    const { readFolders } = await import("../src/core/workspace/vaults/folders.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-link-"));
    const tag = basename(top)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const real = join(top, "real", "notes");
    mkdirSync(join(real, ".slipbox"), { recursive: true });
    writeFileSync(join(real, ".slipbox", "config.toml"), `[vault]\nid = "ln${tag}"\nname = "ln${tag}"\n`);
    writeFileSync(join(real, "x.md"), "# X\n");
    symlinkSync(join(top, "real"), join(top, "link"));
    recordLocation(locateVault({ path: real }));
    recordLocation(locateVault({ path: join(top, "link", "notes", "x.md") }));
    const f = readFolders().find((x) => x.key === `slipbox:ln${tag}`)!;
    expect(f.copies.map((c) => c.path)).toEqual([realpathSync(real)]);
    expect(f.default).toBe(realpathSync(real));
    expect(f.ask).toBeUndefined();
  });

  test("a new worktree under a removed one's name is a new worktree: no state carried, no move; git worktree move still carries", async () => {
    const { stateDir } = await import("../src/core/foundation/platform/paths.ts");
    const { readRoots } = await import("../src/core/workspace/vaults/registry.ts");
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    const base = mkdtempSync(join(tmpdir(), "slipbox-c3-wt-"));
    const x = join(base, "x");
    mkdirSync(x);
    writeFileSync(join(x, "a.md"), "# A\n");
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    const first = join(base, "a", "feat");
    if (git(x, "worktree", "add", "-q", "-b", "feat", first).exitCode !== 0) return;
    const one = locateVault({ root: first });
    recordLocation(one);
    mkdirSync(stateDir(one), { recursive: true });
    writeFileSync(join(stateDir(one), "scratch.md"), "old task\n");
    // Removed; another added with the same basename: git gives it the same name.
    git(x, "worktree", "remove", first);
    const second = join(base, "b", "feat");
    if (git(x, "worktree", "add", "-q", "-b", "other-task", second).exitCode !== 0) return;
    const two = locateVault({ root: second });
    expect(two.worktree?.name).toBe("feat");
    expect(recordLocation(two)).toEqual({ carriedFrom: null });
    expect(existsSync(join(stateDir(two), "scratch.md"))).toBe(false);
    expect(readRoots().find((v) => v.path === second)?.moved).toBeUndefined();
    // Moved by git: the same worktree, carried.
    const third = join(base, "c", "feat");
    mkdirSync(dirname(third), { recursive: true });
    mkdirSync(stateDir(two), { recursive: true });
    writeFileSync(join(stateDir(two), "scratch.md"), "this task\n");
    if (git(x, "worktree", "move", second, third).exitCode !== 0) return;
    const moved = locateVault({ root: third });
    expect(recordLocation(moved)).toEqual({ carriedFrom: second });
    expect(read(stateDir(moved), "scratch.md")).toBe("this task\n");
  });

  test("moving a nested root's folder rewrites the links into it from a root nested beside it", async () => {
    const { planVaultFolderMove } = await import("../src/core/rename.ts");
    const { openVault } = await import("../src/core/reach.ts");
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
    const { planFolderMove } = await import("../src/core/rename.ts");
    const { openVault } = await import("../src/core/reach.ts");
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

  test("the watcher takes symlinks as the walk does: a symlinked folder never followed, a file outside never adopted", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { WalkFilter, walkVault } = await import("../src/core/workspace/walk/walk.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-watchln-"));
    const dir = join(top, "root");
    const outside = join(top, "outside");
    mkdirSync(join(dir, "assets"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "assets", "real.png"), "png");
    writeFileSync(join(outside, "secret.md"), "# Secret\n");
    const changes: string[] = [];
    const filter = new WalkFilter(dir, DEFAULT_CONFIG.walk);
    const w = new VaultWatcher({
      root: dir,
      filter,
      dirs: ["", "assets"],
      debounceMs: 20,
      known: new Map([["a.md", statSync(join(dir, "a.md")).mtimeMs]]),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      symlinkSync(join(outside), join(dir, "linked")); // a folder, outside
      symlinkSync(join(outside, "secret.md"), join(dir, "s.md")); // a note, outside
      symlinkSync(join(dir, "a.md"), join(dir, "twin.md")); // a note already in the vault
      symlinkSync(join(dir, "assets", "real.png"), join(dir, "pic.png")); // a file inside: kept, as the walk keeps it
      // A folder moved in, holding a link out.
      mkdirSync(join(top, "moving"));
      symlinkSync(join(outside, "secret.md"), join(top, "moving", "x.md"));
      renameSync(join(top, "moving"), join(dir, "moved"));
      // Whatever the platform's events say, each name settled.
      const pending = (w as unknown as { pending: Set<string> }).pending;
      for (const rel of ["linked", "s.md", "twin.md", "pic.png", "moved"]) pending.add(rel);
      w.flush();
      await Bun.sleep(150);
      // The names made once the watch began: macOS's events may also tell of a file made just before it
      // (assets/real.png), which isn't what this asks.
      const made = new Set(["linked", "s.md", "twin.md", "pic.png", "moved", "moved/x.md"]);
      const created = changes.filter((c) => c.startsWith("created ") && made.has(c.slice("created ".length)));
      expect([...new Set(created)].sort()).toEqual(["created pic.png"]);
      expect(w.watchedCount).toBe(3); // the root, assets, the folder moved in — never `linked`
      // The walk agrees.
      const walked = walkVault(dir, filter);
      expect(walked.files.map((f) => f.rel)).toEqual(["a.md"]);
      expect(walked.assets.sort()).toEqual(["assets/real.png", "pic.png"]);
    } finally {
      w.close();
    }
  });

  test("a wikilink path broken by a move made outside slipbox is relinked, in its own form; its problem says where it went", async () => {
    const { noteProblems } = await import("../src/core/diagnostics.ts");
    const { dir } = root({
      "docs/plan.md": "# The plan\n",
      "docs/my plan.md": "# Mine\n",
      "index.md": "[[docs/plan]] [[docs/plan#The plan|p]] ![[docs/plan.md]]\n[[docs/my plan]]\n",
      "docs/near.md": "[[./plan]] [[plan]]\n",
    });
    expect((await cli(["--root", dir, "ls"])).code).toBe(0); // indexed: plan.md's text is known
    mkdirSync(join(dir, "notes"));
    renameSync(join(dir, "docs", "plan.md"), join(dir, "notes", "plan.md"));
    renameSync(join(dir, "docs", "my plan.md"), join(dir, "notes", "my plan.md"));
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.movedTarget({ kind: "wiki", target: "docs/plan" }, "index.md")).toBe("notes/plan.md");
    expect(g.movedTarget({ kind: "wiki", target: "plan" }, "docs/near.md")).toBeNull(); // a name: no path to follow
    expect(
      g
        .problems()
        .broken.filter((p) => p.from === "index.md")
        .map((p) => p.moved),
    ).toEqual(["notes/plan.md", "notes/plan.md", "notes/plan.md", "notes/my plan.md"]);
    expect(noteProblems(g, "index.md")[0]!.message).toBe(
      "broken link: docs/plan — moved to notes/plan.md (relink fixes it)",
    );
    applyPlan(g, planRelink(g));
    expect(read(dir, "index.md")).toBe(
      "[[notes/plan]] [[notes/plan#The plan|p]] ![[notes/plan.md]]\n[[notes/my plan]]\n",
    );
    expect(read(dir, "docs/near.md")).toBe("[[../notes/plan]] [[plan]]\n");
  });

  test("the merge review checks wikilinks: a path a branch moved, a name it renamed or deleted; each fix a wikilink's", async () => {
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    const put = (rel: string, text: string) => {
      mkdirSync(dirname(join(top, rel)), { recursive: true });
      writeFileSync(join(top, rel), text);
    };
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-mergewiki-"));
    if (git(top, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    put("docs/plan.md", "# Plan\n\nThe plan, long enough to be known by its text when it moves.\n");
    put("docs/old.md", "# Old\n");
    put("docs/idea.md", "# Idea\n\nAn idea, long enough to be known by its text when it is renamed.\n");
    put("index.md", "# Index\n");
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "base");
    git(top, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(top, "notes"));
    git(top, "mv", "docs/plan.md", "notes/plan.md");
    git(top, "mv", "docs/idea.md", "docs/thought.md");
    git(top, "rm", "-q", "docs/old.md");
    git(top, "commit", "-q", "-m", "refactor");
    git(top, "checkout", "-q", "main");
    put("docs/b.md", "# B\n\n[[docs/plan]] [[./plan#Plan|p]] [[idea]] [[old]] [[index]] [[nowhere]]\n");
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "main");
    const out: string[] = [];
    await runCli(["merge-review", "refactor", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: top,
      env: process.env,
    });
    const breaks = JSON.parse(out.join("")).data.breaks.map(
      (b: { target: string; cause: string; to: string | null; fix: string | null }) => [b.target, b.cause, b.to, b.fix],
    );
    expect(breaks).toEqual([
      ["docs/plan", "moved", "notes/plan.md", "notes/plan"],
      ["./plan", "moved", "notes/plan.md", "../notes/plan"],
      ["idea", "moved", "docs/thought.md", "thought"],
      ["old", "deleted", null, null],
      // `[[nowhere]]` reached nothing in main either: not the merge's.
    ]);
  });

  test("a note moved into a nested root: [[name]] links to it become paths into it, its own names and `/` paths relative out", async () => {
    const { planNoteRename } = await import("../src/core/rename.ts");
    const { dir, g } = root({
      "home.md": "[[plan]] [p](plan.md) [[plan|the plan]]\n",
      "plan.md": "[[home]] [h](home.md) [r](/home.md) [[docs/x]] ![[pic.png]]\n",
      "docs/x.md": "# X\n",
      "pic.png": "png",
      "N/.slipbox/config.toml": "",
      "N/n.md": "# N\n",
    });
    applyPlan(g, planNoteRename(g, "plan.md", "N/plan.md"));
    expect(read(dir, "home.md")).toBe("[[N/plan]] [p](N/plan.md) [[N/plan|the plan]]\n");
    expect(read(dir, "N/plan.md")).toBe("[[../home]] [h](../home.md) [r](../home.md) [[../docs/x]] ![[../pic.png]]\n");
    const parent = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    for (const l of parent.linksOf("home.md"))
      expect([l.target, l.resolvedKind, l.path]).toEqual([l.target, "note", join(dir, "N", "plan.md")]);
    const nested = openGraph(locateVault({ root: join(dir, "N") }), DEFAULT_CONFIG, false);
    expect(nested.linksOf("plan.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "home.md")],
      ["note", join(dir, "home.md")],
      ["note", join(dir, "home.md")],
      ["note", join(dir, "docs", "x.md")],
      ["file", join(dir, "pic.png")],
    ]);
  });

  test("init <folder> keeps wikilinks reaching: names into it become paths, its names out relative, its root paths its own", async () => {
    const { planMakeVault } = await import("../src/core/rename.ts");
    const { dir, g } = root({
      "home.md": "[[plan]] [[F/plan]] [[docs/x]]\n",
      "docs/x.md": "# X\n",
      "F/plan.md": "[[home]] [[F/other]] [[other]] [[docs/x]] [[F/sub/deep]]\n",
      "F/other.md": "# Other\n",
      "F/sub/deep.md": "# Deep\n",
    });
    applyPlan(g, planMakeVault(g, "F", null));
    expect(read(dir, "home.md")).toBe("[[F/plan]] [[F/plan]] [[docs/x]]\n");
    expect(read(dir, "F/plan.md")).toBe("[[../home]] [[./other]] [[other]] [[../docs/x]] [[sub/deep]]\n");
    const f = openGraph(locateVault({ root: join(dir, "F") }), DEFAULT_CONFIG, false);
    expect(f.linksOf("plan.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "home.md")],
      ["note", "other.md"],
      ["note", "other.md"],
      ["note", join(dir, "docs", "x.md")],
      ["note", "sub/deep.md"],
    ]);
    const parent = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(parent.linksOf("home.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "F", "plan.md")],
      ["note", join(dir, "F", "plan.md")],
      ["note", "docs/x.md"],
    ]);
  });

  test("deinit keeps wikilinks reaching what they did: its root paths gain its folder, a name shared with the parent's a path", async () => {
    const { planUnmakeVault } = await import("../src/core/rename.ts");
    const { dir, g } = root({
      "home.md": "[[y]] [[solo]]\n",
      "sub/y.md": "# Parent's y\n",
      "solo.md": "# Solo\n",
      "V/.slipbox/config.toml": "",
      "V/a.md": "[[sub/y]] [md](/sub/y.md) [[y]] [[uniq]]\n",
      "V/sub/y.md": "# V's y\n",
      "V/uniq.md": "# Uniq\n",
    });
    expect(g.resolveLink({ kind: "wiki", target: "y" }, "home.md")).toMatchObject({ path: "sub/y.md" });
    applyPlan(g, planUnmakeVault(g, "V"));
    expect(read(dir, "V/a.md")).toBe("[[V/sub/y]] [md](/V/sub/y.md) [[V/sub/y]] [[uniq]]\n");
    expect(read(dir, "home.md")).toBe("[[sub/y]] [[solo]]\n");
    const after = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(after.linksOf("V/a.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", "V/sub/y.md"],
      ["note", "V/sub/y.md"],
      ["note", "V/sub/y.md"],
      ["note", "V/uniq.md"],
    ]);
    expect(after.linksOf("home.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", "sub/y.md"],
      ["note", "solo.md"],
    ]);
  });
});

describe("deleting and copying: the path checked by the core, whoever asks (18.4, 18.5)", () => {
  test("a file gone since it was listed, a path out of the root, slipbox's and git's own: refused, nothing trashed or copied", async () => {
    const { copyPath, FileOpError, listTrash, trashPath } = await import("../src/core/files.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-fileops-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "gone.md"), "# Gone\n");
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, false);
    rmSync(join(dir, "gone.md")); // deleted by another program, the sidebar still listing it
    const refused = (f: () => unknown) => {
      try {
        f();
      } catch (err) {
        expect(err).toBeInstanceOf(FileOpError);
        return (err as Error).message;
      }
      return null;
    };
    expect(refused(() => trashPath(g, loc, "gone.md"))).toBe(`no note, file or folder gone.md in ${dir}`);
    expect(refused(() => copyPath(g, "/gone.md/"))).toBe(`no note, file or folder gone.md in ${dir}`);
    expect(refused(() => trashPath(g, loc, "../a.md"))).toBe("../a.md isn't inside the vault");
    expect(refused(() => copyPath(g, "docs/../.."))).toBe("docs/../.. isn't inside the vault");
    expect(refused(() => trashPath(g, loc, ".slipbox/config.toml"))).toBe(
      ".slipbox/config.toml: slipbox's and git's own folders aren't notes",
    );
    expect(refused(() => copyPath(g, ".git/HEAD"))).toBe(".git/HEAD: slipbox's and git's own folders aren't notes");
    expect(listTrash(loc)).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual([".git", ".slipbox", "a.md"]);
    // The check passes what's there: a.md trashed.
    expect(trashPath(g, loc, "a.md")).toMatchObject({ abs: join(dir, "a.md"), dir: false });
    expect(existsSync(join(dir, "a.md"))).toBe(false);
  });

  test("the trash emptied: all, or what a preview listed; past 30 days, gone when the trash is next read or written (DF-D14)", async () => {
    const { emptyTrash, FileOpError, listTrash, restorePath, TRASH_DAYS, trashDir, trashPath } = await import(
      "../src/core/files.ts"
    );
    const dir = mkdtempSync(join(tmpdir(), "slipbox-trash-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const n of ["a", "b", "c", "d"]) writeFileSync(join(dir, `${n}.md`), `# ${n}\n`);
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, false);
    const now = Date.now();
    const day = (n: number) => new Date(now + n * 86_400_000);
    const shown = (at: Date) => listTrash(loc, at).map((i) => i.shown);
    expect(TRASH_DAYS).toBe(30);
    const a = trashPath(g, loc, "a.md", day(-45));
    trashPath(g, loc, "b.md", day(-20));
    expect(shown(day(-15))).toEqual(["b.md", "a.md"]); // a.md 30 days old: kept
    expect(existsSync(join(trashDir(loc), a.id, "a.md"))).toBe(true);
    // Written: a.md, past 30 days, goes as c.md comes — its folder too.
    trashPath(g, loc, "c.md", day(0));
    expect(shown(day(0))).toEqual(["c.md", "b.md"]);
    expect(existsSync(join(trashDir(loc), a.id))).toBe(false);
    // Read: b.md goes in its turn; gone, it can't be restored.
    expect(shown(day(11))).toEqual(["c.md"]);
    expect(() => restorePath(g, loc, "b.md", day(11))).toThrow(FileOpError);
    // Emptied: what a preview listed (d.md, deleted since, stays), then the rest.
    const listed = listTrash(loc, day(11)).map((i) => i.id);
    trashPath(g, loc, "d.md", day(11));
    expect(emptyTrash(loc, listed, day(11)).map((i) => i.shown)).toEqual(["c.md"]);
    expect(shown(day(11))).toEqual(["d.md"]);
    expect(emptyTrash(loc, undefined, day(11)).map((i) => i.shown)).toEqual(["d.md"]);
    expect(shown(day(11))).toEqual([]);
    expect(readdirSync(trashDir(loc))).toEqual(["trash.json"]);
    expect(existsSync(join(dir, "d.md"))).toBe(false); // gone for good, never put back
    // An id edited to climb out of the trash is never followed: only the list forgets it.
    const outside = join(dirname(trashDir(loc)), "keep");
    mkdirSync(outside);
    writeFileSync(
      join(trashDir(loc), "trash.json"),
      JSON.stringify({
        version: 1,
        items: [{ id: "../keep", abs: join(dir, "x.md"), shown: "x.md", dir: false, at: day(-90).toISOString() }],
      }),
    );
    expect(shown(day(0))).toEqual([]);
    expect(existsSync(outside)).toBe(true);
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

describe("links followed only when you say so (VV-D6)", () => {
  /** A vault, a folder outside it holding a note, and a link from the vault to that folder. */
  const linked = () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-links-")));
    const vault = join(top, "vault");
    const out = join(top, "out");
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    mkdirSync(out);
    writeFileSync(join(vault, "index.md"), "[far](data/far.md)\n");
    writeFileSync(join(out, "far.md"), "# Far\n\n[home](../../vault/index.md)\n");
    symlinkSync(out, join(vault, "data"));
    return { top, vault, out, link: join(vault, "data") };
  };
  const capture = async (argv: string[], cwd: string) => {
    let out = "";
    let err = "";
    const code = await runCli(argv, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: false,
      columns: undefined,
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code, out, err };
  };

  test("the answer is kept by link and target, in slipbox's state — asked again when the link leads elsewhere", () => {
    const { vault, top, link, out } = linked();
    expect(linkAnswer(link)).toBeNull();
    setLinkAnswer(link, "follow");
    expect(linkAnswer(link)).toBe("follow");
    expect(readFileSync(linksFile(), "utf8")).toContain(JSON.stringify(out));
    expect(linksFile().startsWith(process.env.XDG_STATE_HOME!)).toBe(true);
    expect(readdirSync(vault).sort()).toEqual([".slipbox", "data", "index.md"]);
    // The link pointed elsewhere (a pull changed it): nothing answered for that target.
    mkdirSync(join(top, "other"));
    rmSync(link);
    symlinkSync(join(top, "other"), link);
    expect(linkAnswer(link)).toBeNull();
    expect(linkState(link, linkScope({ mode: "vault", root: vault }))).toBe("ask");
    setLinkAnswer(link, "no");
    expect(linkAnswer(link)).toBe("no");
  });
  test("which links ask: one out of its vault or home; within either, a second name, never; in Elsewhere, every one", () => {
    const { vault, top, link } = linked();
    symlinkSync(join(vault, "index.md"), join(vault, "again.md"));
    const scope = linkScope({ mode: "vault", root: vault });
    expect(linkState(join(vault, "again.md"), scope)).toBe("within");
    expect(linkState(link, scope)).toBe("ask");
    // Home: a link within home, the kind stow makes, is a second name, even into a vault of its own.
    expect(linkState(link, linkScope({ mode: "home", root: top }))).toBe("within");
    // Elsewhere: nothing to stay inside.
    expect(linkScope({ mode: "folder", root: top })).toBeNull();
    expect(linkState(join(vault, "again.md"), null)).toBe("ask");
    expect(linkState(join(top, "nowhere"), scope)).toBe("broken");
  });
  test("the walk goes through a link only when it's followed and its target answered; a second name never twice", async () => {
    const { vault, link, out } = linked();
    mkdirSync(join(vault, "notes"));
    writeFileSync(join(vault, "notes", "n.md"), "# N\n");
    symlinkSync(join(vault, "notes"), join(vault, "again"));
    const walk = () => walkVault(vault, new WalkFilter(vault, DEFAULT_CONFIG.walk));
    let w = walk();
    expect(w.files.map((f) => f.rel)).toEqual(["index.md", "notes/n.md"]);
    expect(w.skipped).toContainEqual({ rel: "data", reason: LINK_REASON.out, link: { target: out, dir: true } });
    expect(w.skipped).toContainEqual({
      rel: "again",
      reason: LINK_REASON.within,
      link: { target: join(vault, "notes"), dir: true },
    });
    // Followed, its target not asked yet: never read on the walk's own thread.
    setLinkAnswer(link, "follow");
    expect(walk().skipped).toContainEqual({
      rel: "data",
      reason: LINK_REASON.waiting,
      link: { target: out, dir: true },
    });
    expect(await probe(out)).toBe(true);
    w = walk();
    expect(w.files.map((f) => f.rel)).toEqual(["data/far.md", "index.md", "notes/n.md"]);
    expect(w.dirs).toContain("data");
    // Indexed as the vault's: its links, its backlinks.
    const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
    expect(g.backlinks("data/far.md").map((b) => b.from)).toEqual(["index.md"]);
    // A second link to the same folder walks it once; one to a folder holding the vault, never.
    symlinkSync(out, join(vault, "data2"));
    setLinkAnswer(join(vault, "data2"), "follow");
    symlinkSync(dirname(vault), join(vault, "up"));
    setLinkAnswer(join(vault, "up"), "follow");
    await probe(dirname(vault));
    w = walk();
    const far = w.files.filter((f) => f.rel.endsWith("far.md")).map((f) => f.rel);
    expect(far).toHaveLength(1); // whichever the folder lists first
    const other = far[0] === "data/far.md" ? "data2" : "data";
    expect(w.skipped.find((s) => s.rel === other)?.reason).toBe(LINK_REASON.twice);
    expect(w.skipped.find((s) => s.rel === "up")?.reason).toBe(LINK_REASON.loop);
    // Said no: not walked.
    setLinkAnswer(link, "no");
    expect(walk().files.map((f) => f.rel)).not.toContain("data/far.md");
  });
  test("home's kept walk goes through a link while it's followed and answering: followed since, walked; no longer, dropped", async () => {
    const { vault: home, link, out } = linked();
    writeFileSync(join(home, "index.md"), "# Index\n"); // no link to reach it by: only the walk finds it
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = locateVault({ path: home, cwd: home });
      expect(loc.mode).toBe("home");
      // Its folder unchanged since the walk: only the link's answer says to list it again.
      const longAgo = new Date(Date.now() - 86_400_000);
      utimesSync(home, longAgo, longAgo);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, false).notes.keys()].sort();
      expect(notes()).toEqual(["index.md"]);
      // Followed since, and answering: the kept walk lists its folder again, so it goes through.
      setLinkAnswer(link, "follow");
      await probe(out);
      expect(notes()).toEqual(["data/far.md", "index.md"]);
      // Not answering (a disk gone): left out, never read through, and walked again once it answers.
      forgetProbes();
      expect(notes()).toEqual(["index.md"]);
      await probe(out);
      expect(notes()).toEqual(["data/far.md", "index.md"]);
      // Said no: dropped with all it held.
      setLinkAnswer(link, "no");
      expect(notes()).toEqual(["index.md"]);
    } finally {
      process.env.HOME = before;
    }
  });
  test("a target followed but not answering isn't read through, not even by a note's link reaching it", () => {
    const { vault, link } = linked();
    setLinkAnswer(link, "follow"); // its target never asked: on a disk that may not answer
    const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
    expect(g.notes.get("index.md")?.links.map((l) => l.target)).toEqual(["data/far.md"]);
    expect(g.notes.has("data/far.md")).toBe(false);
  });
  test("a target that doesn't answer is given up on: never waited for", async () => {
    const never = () => new Promise<boolean>(() => {});
    const t0 = performance.now();
    expect(await probe("/nowhere/at/all", 50, never)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(answered("/nowhere/at/all")).toBe(false);
  });
  test("the watcher follows a followed link: a note made in its folder comes as the vault's", async () => {
    const { VaultWatcher } = await import("../src/core/watch.ts");
    const { vault, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const filter = new WalkFilter(vault, DEFAULT_CONFIG.walk);
    const changes: string[] = [];
    const w = new VaultWatcher({
      root: vault,
      filter,
      dirs: [""],
      debounceMs: 20,
      known: new Map([["index.md", statSync(join(vault, "index.md")).mtimeMs]]),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      // Seen now as it would be when it came: the link followed, what it holds the vault's.
      (w as unknown as { pending: Set<string> }).pending.add("data");
      w.flush();
      expect(changes).toContain("created data/far.md");
      expect(w.watchedCount).toBe(2);
      // A folder that comes holding a link you follow: walked through it, as the walk would.
      mkdirSync(join(vault, "moved"));
      symlinkSync(out, join(vault, "moved", "in"));
      setLinkAnswer(join(vault, "moved", "in"), "follow");
      (w as unknown as { pending: Set<string> }).pending.add("moved");
      w.flush();
      expect(changes).toContain("created moved/in/far.md");
      // Not followed: nothing through it.
      setLinkAnswer(link, "no");
      const w2 = new VaultWatcher({
        root: vault,
        filter,
        dirs: [""],
        debounceMs: 20,
        known: new Map(),
        onBatch: (b) => changes.push(...b.changes.map((c) => `again ${c.kind} ${c.rel}`)),
        onDegraded: () => {},
      });
      (w2 as unknown as { pending: Set<string> }).pending.add("data");
      w2.flush();
      expect(changes.filter((c) => c.startsWith("again"))).toEqual([]);
      w2.close();
    } finally {
      w.close();
    }
  });
  test("writes: in a vault never out of it, followed or not; in home through a link it follows; in Elsewhere as the file system allows", () => {
    const { vault, top, link, out } = linked();
    setLinkAnswer(link, "follow");
    const far = join(link, "far.md");
    expect(writesThrough({ mode: "vault", root: vault }, far)).toBe(false);
    expect(writesThrough({ mode: "home", root: vault }, far)).toBe(true);
    setLinkAnswer(link, "no");
    expect(writesThrough({ mode: "home", root: vault }, far)).toBe(false);
    // Elsewhere: every link below the folder opened asks; a path named outright outside it, only the file itself.
    expect(blockingLink({ mode: "folder", root: top }, far)?.link).toBe(link);
    expect(blockingLink({ mode: "folder", root: out }, far)).toBeNull();
    symlinkSync(join(out, "far.md"), join(top, "far-link.md"));
    expect(writesThrough({ mode: "folder", root: top }, join(top, "far-link.md"))).toBe(false);
    setLinkAnswer(join(top, "far-link.md"), "follow");
    expect(writesThrough({ mode: "folder", root: top }, join(top, "far-link.md"))).toBe(true);
    expect(writesThrough({ mode: "folder", root: out }, join(out, "far.md"))).toBe(true);
  });
  test("the command line refuses a link not followed — reading, writing — and in a vault never writes through one", async () => {
    const { vault, link } = linked();
    const read = await capture(["read", "data/far.md"], vault);
    expect(read.code).toBe(5);
    expect(read.err).toContain("isn't followed");
    expect((await capture(["write", "data/far.md", "x"], vault)).code).toBe(5);
    expect((await capture(["write", "data/new.md", "x", "--create"], vault)).code).toBe(5);
    // Followed (asked in the TUI): read and indexed; never written to, being outside the vault.
    setLinkAnswer(link, "follow");
    forgetProbes();
    // Its target asked first, before the walk goes through it: listed with the vault's notes.
    expect((await capture(["ls"], vault)).out).toContain("data/far.md");
    expect((await capture(["read", "data/far.md"], vault)).out).toBe("# Far\n\n[home](../../vault/index.md)\n");
    expect((await capture(["backlinks", "data/far.md"], vault)).out).toContain("index.md");
    const write = await capture(["write", "data/far.md", "x"], vault);
    expect(write.code).toBe(5);
    expect(write.err).toContain("a link leads it out of the vault");
    expect(readFileSync(join(link, "far.md"), "utf8")).toStartWith("# Far");
  });
  test("the command line makes no folder through a link not followed; in home, writes through one it follows", async () => {
    const { vault, link, out } = linked();
    const mkdir = await capture(["mkdir", "data/sub"], vault);
    expect(mkdir.code).toBe(5);
    expect(existsSync(join(out, "sub"))).toBe(false);
    const before = process.env.HOME;
    process.env.HOME = vault; // the folder is home: its link leads out of home
    try {
      expect((await capture(["write", "data/far.md", "y"], vault)).code).toBe(5); // not followed yet
      setLinkAnswer(link, "follow");
      const r = await capture(["write", "data/far.md", "# Written"], vault);
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Written\n");
    } finally {
      process.env.HOME = before;
    }
  });
  test("agents see what's followed: said for a hidden target, or one outside home", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-agents-")));
    expect(agentsWarning(join(home, ".ssh"), home)).toBe("~/.ssh is hidden");
    expect(agentsWarning(join(home, "work", ".aws", "x"), home)).toBe("~/work/.aws/x is hidden");
    expect(agentsWarning("/mnt/disk/data", home)).toBe("/mnt/disk/data is outside your home folder");
    expect(agentsWarning(join(home, "work", "notes"), home)).toBeNull();
  });
});

describe("reading and writing keep to the links of the place a path is in (VV-D6)", () => {
  const capture = async (argv: string[], cwd: string) => {
    let out = "";
    let err = "";
    const code = await runCli(argv, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: false,
      columns: undefined,
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code, out, err };
  };
  /** A test run with a home of its own: nothing it does is near the real one. */
  const homed = (fn: (home: string) => Promise<void>) => async () => {
    const before = process.env.HOME;
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    process.env.HOME = home;
    try {
      await fn(home);
    } finally {
      process.env.HOME = before;
    }
  };
  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  /** Elsewhere's folder (outside home and every vault) and a folder beside it its links lead to. */
  const elsewhere = () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-way-")));
    const e = join(top, "e");
    const apart = join(top, "apart");
    put(join(apart, "o.md"), "# Apart\n");
    put(join(e, "plain.md"), "# Plain\n");
    symlinkSync(apart, join(e, "od"));
    symlinkSync(join(apart, "o.md"), join(e, "of.md"));
    return { top, e, apart };
  };

  test(
    "in Elsewhere, every link from the folder you work in down asks: one on a path's way not followed is refused, read and write",
    homed(async () => {
      const { top, e, apart } = elsewhere();
      for (const [argv, cwd] of [
        [["read", "od/o.md"], e],
        [["read", join(e, "od", "o.md")], e],
        [["read", "e/od/o.md"], top],
        [["write", "od/o.md", "# Written"], e],
      ] as [string[], string][]) {
        const r = await capture(argv, cwd);
        expect(r.code).toBe(5);
        expect(r.err).toContain(`a link that isn't followed (${join(e, "od")} → ${apart})`);
      }
      expect(readFileSync(join(apart, "o.md"), "utf8")).toBe("# Apart\n");
      // Followed: read through, as the file system allows.
      setLinkAnswer(join(e, "od"), "follow");
      expect((await capture(["read", "od/o.md"], e)).out).toBe("# Apart\n");
      expect((await capture(["read", "plain.md"], e)).out).toBe("# Plain\n");
    }),
  );

  test(
    "in Elsewhere, a linked note named is refused — read, render, outline — however it's named",
    homed(async () => {
      const { top, e } = elsewhere();
      for (const [argv, cwd] of [
        [["read", "of.md"], e],
        [["render", "of.md"], e],
        [["outline", "of.md"], e],
        [["read", join(e, "of.md")], top],
      ] as [string[], string][]) {
        const r = await capture(argv, cwd);
        expect(r.code).toBe(5);
        expect(r.err).toContain("isn't followed");
      }
    }),
  );

  test(
    "a write that lands in a hidden folder of home, through a link followed in Elsewhere, is refused as home refuses it",
    homed(async (home) => {
      const { top } = elsewhere();
      put(join(home, ".config", "tool", "settings.md"), "# Settings\n");
      put(join(home, "notes", "n.md"), "# N\n");
      const unpacked = join(top, "unpacked");
      put(join(unpacked, "README.md"), "# Readme\n");
      symlinkSync(home, join(unpacked, "docs"));
      setLinkAnswer(join(unpacked, "docs"), "follow");
      const r = await capture(["write", "docs/.config/tool/settings.md", "# Changed"], unpacked);
      expect(r.code).toBe(5);
      expect(r.err).toContain("it lands in a folder the walk doesn't list");
      expect(readFileSync(join(home, ".config", "tool", "settings.md"), "utf8")).toBe("# Settings\n");
      // As named in home itself.
      expect((await capture(["write", ".config/tool/settings.md", "# Changed"], home)).code).toBe(5);
      // A note of home's where the walk lists it: written through the link followed.
      expect((await capture(["write", "docs/notes/n.md", "# Rewritten"], unpacked)).code).toBe(0);
      expect(readFileSync(join(home, "notes", "n.md"), "utf8")).toBe("# Rewritten\n");
    }),
  );

  test(
    "a new note that lands in a busy folder of home, through a link followed in Elsewhere, is refused as home refuses it",
    homed(async (home) => {
      const { top } = elsewhere();
      put(join(home, "work", "node_modules", "pkg", "README.md"), "# Pkg\n"); // no note at its top: busy
      put(join(home, "notes", "n.md"), "# N\n");
      const unpacked = join(top, "unpacked");
      put(join(unpacked, "README.md"), "# Readme\n");
      symlinkSync(home, join(unpacked, "docs"));
      setLinkAnswer(join(unpacked, "docs"), "follow");
      const r = await capture(["write", "docs/work/node_modules/pkg/x.md", "text", "--create"], unpacked);
      expect(r.code).toBe(5);
      expect(r.err).toContain("it lands in a busy folder, which its vault doesn't index");
      expect(existsSync(join(home, "work", "node_modules", "pkg", "x.md"))).toBe(false);
      // As named in home itself.
      expect((await capture(["write", "work/node_modules/pkg/x.md", "text", "--create"], home)).code).toBe(5);
      // Where home indexes it: written through the link followed.
      expect((await capture(["write", "docs/notes/m.md", "text", "--create"], unpacked)).code).toBe(0);
      expect(existsSync(join(home, "notes", "m.md"))).toBe(true);
    }),
  );

  test(
    "capture --snippet reads a file as read does: never through a link not followed, nor anything but a regular file",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-snip-")));
      const vault = join(top, "vault");
      const apart = join(top, "apart");
      put(join(vault, ".slipbox", "config.toml"), "");
      put(join(vault, "a.md"), "# A\n");
      put(join(apart, "kept.md"), "# Kept apart\nsecond line\n");
      symlinkSync(join(apart, "kept.md"), join(vault, "fl.md"));
      symlinkSync(apart, join(vault, "od"));
      for (const ref of ["fl.md:1", "od/kept.md:1-2"]) {
        const r = await capture(["capture", "hi", "--ref", ref, "--snippet"], vault);
        expect(r.code).toBe(5);
        expect(r.err).toContain("isn't followed");
      }
      expect((await capture(["scratch"], vault)).out).not.toContain("Kept apart");
      // A device: refused at once, never read without end.
      const dev = await capture(["capture", "hi", "--ref", "/dev/zero:1", "--snippet"], vault);
      expect(dev.code).toBe(3);
      expect(dev.err).toContain("not a regular file");
    }),
  );

  test(
    "home's warm start keeps a followed file link only while it leads where it was followed to: pointed elsewhere, it asks again",
    homed(async (home) => {
      const ext = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-ext-")));
      put(join(ext, "a.md"), "# A\n\nalpha\n");
      put(join(ext, "b.md"), "# B\n\nbravo\n");
      put(join(home, "notes", "n.md"), "# N\n");
      const link = join(home, "notes", "x.md");
      symlinkSync(join(ext, "a.md"), link);
      setLinkAnswer(link, "follow");
      await probe(join(ext, "a.md"));
      const loc = locateVault({ path: home, cwd: home });
      const longAgo = new Date(Date.now() - 86_400_000);
      for (const d of [home, join(home, "notes")]) utimesSync(d, longAgo, longAgo);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, false).notes.keys()].sort();
      expect(notes()).toEqual(["notes/n.md", "notes/x.md"]);
      // Pointed elsewhere, its folder unchanged as far as the walk kept knows: never indexed through it.
      rmSync(link);
      symlinkSync(join(ext, "b.md"), link);
      restamp(homeWalkFile(loc), home, "notes");
      expect(notes()).toEqual(["notes/n.md"]);
      const read = await capture(["read", "notes/x.md"], home);
      expect(read.code).toBe(5);
      expect(read.out).not.toContain("bravo");
    }),
  );

  test(
    "in home, a note's text, a new note and a folder go through a followed link; a move, copy or delete across it is refused",
    homed(async (home) => {
      const ext = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-ext-")));
      put(join(ext, "a.md"), "# A\n");
      put(join(ext, "b.md"), "# B\n");
      put(join(home, "n.md"), "# N\n");
      symlinkSync(ext, join(home, "data"));
      setLinkAnswer(join(home, "data"), "follow");
      await probe(ext);
      expect((await capture(["write", "data/a.md", "# Edited"], home)).code).toBe(0);
      expect(readFileSync(join(ext, "a.md"), "utf8")).toBe("# Edited\n");
      expect((await capture(["write", "data/new.md", "# New", "--create"], home)).code).toBe(0);
      expect(existsSync(join(ext, "new.md"))).toBe(true);
      expect((await capture(["mkdir", "data/sub"], home)).code).toBe(0);
      expect(existsSync(join(ext, "sub"))).toBe(true);
      for (const [argv, said] of [
        [["rm", "data/b.md"], "data/b.md resolves outside the vault"],
        [["cp", "n.md", "data/n-copy.md"], "data/n-copy.md would land outside the vault"],
        [["mv", "n.md", "data/n.md"], "data/n.md would land outside the vault"],
      ] as [string[], string][]) {
        const r = await capture(argv, home);
        expect(r.code).toBe(5);
        expect(r.err).toContain(said);
      }
      expect(existsSync(join(ext, "b.md"))).toBe(true);
      expect(existsSync(join(home, "n.md"))).toBe(true);
      expect(readdirSync(ext).sort()).toEqual(["a.md", "b.md", "new.md", "sub"]);
    }),
  );
});

describe("the symlinks you've answered: listed, and forgotten (VV-D6)", () => {
  const cli = async (argv: string[], cwd: string) => {
    let out = "";
    let err = "";
    const code = await runCli(argv, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: false,
      columns: undefined,
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code, out, err, json: () => JSON.parse(out) };
  };

  test("slipbox symlinks lists each answer, where it leads and what was said; forget forgets one: asked again, and followed no more, its notes gone from search", async () => {
    const before = process.env.HOME;
    const state = process.env.XDG_STATE_HOME;
    process.env.HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-state-"))); // answers of its own
    try {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-forget-")));
      const vault = join(top, "vault");
      const out = join(top, "out");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(top, "other"));
      mkdirSync(out);
      writeFileSync(join(vault, "index.md"), "# Index\n\n[far](data/far.md)\n");
      writeFileSync(join(out, "far.md"), "# Far\n\nquetzal feathers\n");
      symlinkSync(out, join(vault, "data"));
      symlinkSync(join(top, "other"), join(vault, "no"));
      expect((await cli(["symlinks"], vault)).out).toBe(
        "no symlink answered yet: one leading out asks when it's first opened in slipbox\n",
      );
      setLinkAnswer(join(vault, "data"), "follow");
      setLinkAnswer(join(vault, "no"), "no");
      await probe(out);
      expect((await cli(["search", "quetzal"], vault)).out).toContain("data/far.md");
      const listed = await cli(["symlinks"], vault);
      expect(listed.out.split("\n").sort()).toEqual(
        [
          "",
          `${join(vault, "data")} → ${out}  followed`,
          `${join(vault, "no")} → ${join(top, "other")}  not followed`,
        ].sort(),
      );
      const json = (await cli(["symlinks", "--json"], vault)).json().data;
      expect(json.find((a: { link: string }) => a.link === join(vault, "data"))).toMatchObject({
        target: out,
        answer: "follow",
        now: out,
      });
      // Forgotten, by its path from here: followed no more — not listed, nor searched, nor read; asked again in slipbox.
      const forgot = await cli(["symlinks", "forget", "data"], vault);
      expect(forgot.code).toBe(0);
      expect(forgot.out).toBe(`forgot ${join(vault, "data")} → ${out} (followed): asked again when it's next opened\n`);
      expect(linkAnswer(join(vault, "data"))).toBeNull();
      expect((await cli(["ls"], vault)).out).not.toContain("data/far.md");
      expect((await cli(["search", "quetzal"], vault)).out).not.toContain("data/far.md");
      expect((await cli(["read", "data/far.md"], vault)).code).toBe(5);
      expect((await cli(["symlinks"], vault)).out).toBe(`${join(vault, "no")} → ${join(top, "other")}  not followed\n`);
      // Nothing said of it now; nor of a path that's no link.
      expect((await cli(["symlinks", "forget", "data"], vault)).code).toBe(3);
      expect((await cli(["symlinks", "forget", join(vault, "index.md")], vault)).code).toBe(3);
      expect((await cli(["symlinks", "forget"], vault)).code).toBe(2);
      expect((await cli(["symlinks", "follow", "data"], vault)).code).toBe(2);
      expect((await cli(["symlinks", "forget", join(vault, "no")], top)).code).toBe(0);
      expect(linkAnswer(join(vault, "no"))).toBeNull();
    } finally {
      process.env.HOME = before;
      process.env.XDG_STATE_HOME = state;
    }
  });

  test("a link moved as a link: a relative one leads where it did, from its own text; its answer goes with it, and only its", () => {
    const state = process.env.XDG_STATE_HOME;
    const answers = () => JSON.parse(readFileSync(linksFile(), "utf8")).links as { link: string }[];
    process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-state-")));
    try {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-move-link-")));
      const w = join(top, "w");
      mkdirSync(join(w, "sub"), { recursive: true });
      mkdirSync(join(top, "far"));
      mkdirSync(join(top, "deep", "inner"), { recursive: true });
      writeFileSync(join(top, "deep", "t.md"), "# T\n");
      symlinkSync("../far", join(w, "b"));
      symlinkSync("b", join(w, "a")); // a link to a link
      symlinkSync(join(top, "deep", "inner"), join(w, "lnk"));
      symlinkSync("lnk/../t.md", join(w, "c.md")); // `..` after a link: the link's target's folder
      setLinkAnswer(join(w, "a"), "follow");
      moveLink(join(w, "a"), join(w, "sub", "a"));
      expect(readlinkSync(join(w, "sub", "a"))).toBe(join("..", "b"));
      expect(realpathSync(join(w, "sub", "a"))).toBe(join(top, "far"));
      expect(existsSync(join(w, "a"))).toBe(false);
      expect([linkAnswer(join(w, "sub", "a")), linkAnswer(join(w, "a"), join(top, "far"))]).toEqual(["follow", null]);
      moveLink(join(w, "c.md"), join(w, "sub", "c.md"));
      expect(readlinkSync(join(w, "sub", "c.md"))).toBe(["..", "lnk", "..", "t.md"].join(sep));
      expect(realpathSync(join(w, "sub", "c.md"))).toBe(join(top, "deep", "t.md"));
      // Back up again, and an absolute link as it is.
      moveLink(join(w, "sub", "a"), join(w, "a"));
      expect(readlinkSync(join(w, "a"))).toBe("b");
      moveLink(join(w, "lnk"), join(w, "sub", "lnk"));
      expect(readlinkSync(join(w, "sub", "lnk"))).toBe(join(top, "deep", "inner"));
      // Moved, without an answer, where one was kept once: one for where it leads holds (an answer is a place and where
      // it leads, as a link made there by hand would find it); one for elsewhere goes.
      symlinkSync("../../far", join(w, "sub", "d"));
      setLinkAnswer(join(w, "sub", "d"), "follow");
      rmSync(join(w, "sub", "d"));
      symlinkSync("../far", join(w, "d"));
      moveLink(join(w, "d"), join(w, "sub", "d"));
      expect(linkAnswer(join(w, "sub", "d"))).toBe("follow");
      symlinkSync(join(top, "deep"), join(w, "sub", "f"));
      setLinkAnswer(join(w, "sub", "f"), "follow");
      rmSync(join(w, "sub", "f"));
      symlinkSync("../far", join(w, "f"));
      moveLink(join(w, "f"), join(w, "sub", "f"));
      expect(linkAnswer(join(w, "sub", "f"))).toBeNull();
      expect(answers().filter((e) => e.link === join(w, "sub", "f"))).toEqual([]);
      // Where it can't be made, nothing has changed.
      writeFileSync(join(w, "sub", "taken"), "x");
      symlinkSync("../far", join(w, "taken"));
      expect(() => moveLink(join(w, "taken"), join(w, "sub", "taken"))).toThrow();
      expect(readlinkSync(join(w, "taken"))).toBe("../far");
      expect(readFileSync(join(w, "sub", "taken"), "utf8")).toBe("x");
      // A `\` is a name's own character here, not a folder's end.
      if (process.platform !== "win32") {
        writeFileSync(join(w, "x\\y.md"), "# XY\n");
        symlinkSync("x\\y.md", join(w, "bs.md"));
        moveLink(join(w, "bs.md"), join(w, "sub", "bs.md"));
        expect(readlinkSync(join(w, "sub", "bs.md"))).toBe("../x\\y.md");
        expect(realpathSync(join(w, "sub", "bs.md"))).toBe(join(w, "x\\y.md"));
      }
      // Moved, but its answer can't be kept for where it is now: said, the link moved all the same.
      symlinkSync("../far", join(w, "e"));
      setLinkAnswer(join(w, "e"), "follow");
      const stateDir = join(process.env.XDG_STATE_HOME!, "slipbox");
      chmodSync(stateDir, 0o500);
      try {
        expect(moveLink(join(w, "e"), join(w, "sub", "e"))).toMatch(
          /sub\/e: the link moved, but its answer couldn't be kept for its new place \(EACCES\)/,
        );
      } finally {
        chmodSync(stateDir, 0o755);
      }
      expect(readlinkSync(join(w, "sub", "e"))).toBe(join("..", "..", "far"));
      // Its answer stayed where it was: moved back there (an undo), the link is followed again.
      expect(moveLink(join(w, "sub", "e"), join(w, "e"))).toBeNull();
      expect(linkAnswer(join(w, "e"))).toBe("follow");
      // A link with no answer of its own, moved where an old one for elsewhere is, the state folder unwritable: no
      // answer lost, so nothing said.
      symlinkSync(join(top, "deep"), join(w, "sub", "h"));
      setLinkAnswer(join(w, "sub", "h"), "follow");
      rmSync(join(w, "sub", "h"));
      symlinkSync("../far", join(w, "h"));
      chmodSync(stateDir, 0o500);
      try {
        expect(moveLink(join(w, "h"), join(w, "sub", "h"))).toBeNull();
      } finally {
        chmodSync(stateDir, 0o755);
      }
    } finally {
      process.env.XDG_STATE_HOME = state;
    }
  });
});
