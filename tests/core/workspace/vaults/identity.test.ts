import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG, loadConfig } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import {
  findVaultRoot,
  elsewhereAt,
  isVaultRoot,
  locateVault,
  markersAt,
  recordLocation,
  setRootMarkers,
} from "../../../../src/core/workspace/vaults/vault.ts";
import { vaultKey } from "../../../../src/core/foundation/platform/paths.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

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
    const { suggestFolderName } = await import("../../../../src/core/workspace/vaults/folders.ts");
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
    const { PositionStore, loadSession, saveSession } = await import(
      "../../../../src/core/workspace/session/position.ts"
    );
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { lookupFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
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
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { recordRoot } = await import("../../../../src/core/workspace/vaults/registry.ts");
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
    const { loadSession, saveSession } = await import("../../../../src/core/workspace/session/position.ts");
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { recordRoot } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { rootAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
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
    const { adoptStorage } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { cacheHome, stateHome } = await import("../../../../src/core/foundation/platform/paths.ts");
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
    const { readRenames } = await import("../../../../src/core/workspace/mutations/rename/rename-log.ts");
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
    const { loadSession, saveSession } = await import("../../../../src/core/workspace/session/position.ts");
    const { appendScratch, scratchLocation } = await import("../../../../src/core/workspace/mutations/capture.ts");
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
    const { PositionStore, carryPositions } = await import("../../../../src/core/workspace/session/position.ts");
    const { inVault } = await import("../../../../src/core/workspace/git/branches/gitops.ts");
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
    const { readRoots, rootsFile } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { PositionStore, loadSession, positionsFile } = await import(
      "../../../../src/core/workspace/session/position.ts"
    );
    const { cacheDir, stateDir, stateHome, cacheHome } = await import(
      "../../../../src/core/foundation/platform/paths.ts"
    );
    const { writeJson } = await import("../../../../src/core/foundation/platform/fsutil.ts");
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
    const { PositionStore } = await import("../../../../src/core/workspace/session/position.ts");
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
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
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
      require("../../../../src/core/foundation/platform/paths.ts") as typeof import("../../../../src/core/foundation/platform/paths.ts");
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
    const { readRoots, rootsFile } = await import("../../../../src/core/workspace/vaults/registry.ts");
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
    const { PositionStore, loadSession, saveSession } = await import(
      "../../../../src/core/workspace/session/position.ts"
    );
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
    const { normalizeRemote, remotesIn } = await import("../../../../src/core/workspace/links/remotes.ts");
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
    const { normalizeRemote, remotesIn } = await import("../../../../src/core/workspace/links/remotes.ts");
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
    const { rootLabel } = await import("../../../../src/core/workspace/vaults/names.ts");
    const { homeFolder } = await import("../../../../src/core/workspace/vaults/vault.ts");
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
      "../../../../src/core/workspace/vaults/registry.ts"
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
    const { cacheHome, stateHome } = await import("../../../../src/core/foundation/platform/paths.ts");
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
