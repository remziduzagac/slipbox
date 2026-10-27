import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { initVault, locateVault, recordLocation } from "../../../../src/core/workspace/vaults/vault.ts";
import { vaultKey } from "../../../../src/core/foundation/platform/paths.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

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
    const { checkoutOf, headOf, inMain } = await import("../../../../src/core/workspace/git/git.ts");
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
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { PositionStore } = await import("../../../../src/core/workspace/session/position.ts");
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
    const { pruneWorktrees, readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    const { cacheDir, stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
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
    const { readFolders } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { rootAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
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
    const { cacheDir } = await import("../../../../src/core/foundation/platform/paths.ts");
    const { rootAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
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

describe("review cycle 3 (core)", () => {
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("a new worktree under a removed one's name is a new worktree: no state carried, no move; git worktree move still carries", async () => {
    const { stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
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
});
