// The git panel's branches (GIT-D9, GIT-D10, GIT-D13), as the core has them: each branch's own base — kept, guessed
// among `[git] bases`, changed — where a new worktree goes, and the order the panel lists the branches in.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { type Checkout, checkoutOf } from "../src/core/git.ts";
import { baseFor, chooseBase, keepBase, keptBases, nearest } from "../src/core/gitbase.ts";
import { folderSafe, OLD_MS, orderBranches, parseWorktrees, worktreeFolder } from "../src/core/gitbranches.ts";

/** git in `repo`, as a test runs it: its own name and no system config. */
function git(repo: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** A commit of a file's new text. */
function commit(repo: string, file: string, text: string): void {
  writeFileSync(join(repo, file), text);
  git(repo, "add", file);
  git(repo, "commit", "-qm", `${file}: ${text}`);
}

describe("each branch's own base (GIT-D10)", () => {
  let dir = "";
  let c: Checkout;
  const state = process.env.XDG_STATE_HOME;
  const config = { base: "", bases: ["main", "dev"] };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "bases-"));
    // The kept bases are slipbox's state: this test's own.
    process.env.XDG_STATE_HOME = join(dir, "state");
    const repo = join(dir, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    commit(repo, "a.md", "one");
    // dev: two commits past main; feature, made from dev, one more; main moves on after dev left it.
    git(repo, "switch", "-qc", "dev");
    commit(repo, "b.md", "two");
    commit(repo, "c.md", "three");
    git(repo, "switch", "-qc", "feature");
    commit(repo, "d.md", "four");
    git(repo, "switch", "-qc", "hotfix", "main");
    commit(repo, "e.md", "five");
    git(repo, "switch", "-q", "main");
    commit(repo, "f.md", "six");
    c = checkoutOf(repo)!;
  });

  afterAll(() => {
    if (state === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = state;
  });

  test("guessed: the nearest of [git] bases, the one that leaves the branch fewest commits of its own", () => {
    expect(baseFor(c, "feature", config)).toEqual({ base: "dev", how: "nearest" });
    expect(baseFor(c, "hotfix", config)).toEqual({ base: "main", how: "nearest" });
    // A base listed is measured against those listed before it: dev against main, main — the trunk — against none,
    // never against dev, which has main's commits and more.
    expect(baseFor(c, "dev", config)).toEqual({ base: "main", how: "nearest" });
    expect(baseFor(c, "main", config)).toBeNull();
    expect(baseFor(c, "main", { base: "", bases: ["main"] })).toBeNull();
    // [git] bases left as it comes: main, for every branch.
    expect(baseFor(c, "feature", { base: "", bases: ["main"] })).toEqual({ base: "main", how: "nearest" });
  });

  test("kept: the branch slipbox made it from wins over the guess; changed (Compare against…); dropped, guessed again", () => {
    keepBase(c, "feature", "main");
    expect(keptBases(c)).toEqual({ feature: "main" });
    expect(baseFor(c, "feature", config)).toEqual({ base: "main", how: "kept" });
    keepBase(c, "feature", "hotfix");
    expect(baseFor(c, "feature", config)).toEqual({ base: "hotfix", how: "kept" });
    keepBase(c, "feature", null);
    expect(keptBases(c)).toEqual({});
    expect(baseFor(c, "feature", config)).toEqual({ base: "dev", how: "nearest" });
  });

  test("a kept base that's gone is guessed again; [git] base, when set, is a candidate; none there, main or master", () => {
    keepBase(c, "feature", "no-such-branch");
    expect(baseFor(c, "feature", config)).toEqual({ base: "dev", how: "nearest" });
    keepBase(c, "feature", null);
    // A config that named a base before [git] bases keeps it among the candidates.
    expect(baseFor(c, "feature", { base: "dev", bases: ["main"] })).toEqual({ base: "dev", how: "nearest" });
    // Neither of [git] bases there: [git] base's fallback, main.
    expect(baseFor(c, "feature", { base: "", bases: ["trunk"] })).toEqual({ base: "main", how: "configured" });
  });

  test("the choice itself, as git's counts would have it", () => {
    expect(
      nearest([
        { base: "main", ahead: 3 },
        { base: "dev", ahead: 1 },
      ]),
    ).toBe("dev");
    expect(
      nearest([
        { base: "main", ahead: 2 },
        { base: "dev", ahead: 2 },
      ]),
    ).toBe("main"); // a tie: the first listed
    expect(nearest([{ base: "main", ahead: null }])).toBeNull();
    const q = {
      kept: {},
      bases: ["main", "dev"],
      base: "",
      exists: (r: string) => r !== "dev",
      ahead: () => 1,
      fallback: () => "main",
    };
    expect(chooseBase("x", q)).toEqual({ base: "main", how: "nearest" });
    expect(chooseBase("main", { ...q, bases: ["main"] })).toBeNull();
  });
});

describe("where a new worktree goes (GIT-D13)", () => {
  test("by default beside the repository, {repo}-{branch}; a branch's name made safe for a folder's", () => {
    expect(worktreeFolder("", "/w/kestrel", "agent/route-cache", "/h")).toBe("/w/kestrel-agent-route-cache");
    expect(worktreeFolder("{parent}/{repo}-{branch}", "/w/kestrel", "x", "/h")).toBe("/w/kestrel-x");
  });
  test("your own: ~ is home, relative is beside the repository", () => {
    expect(worktreeFolder("~/Projects/worktrees/{repo}/{branch}", "/w/kestrel", "agent/a", "/h")).toBe(
      "/h/Projects/worktrees/kestrel/agent-a",
    );
    expect(worktreeFolder("trees/{branch}", "/w/kestrel", "b", "/h")).toBe("/w/trees/b");
  });
  test("a branch's name for a folder: no separators, no dots or dashes at its ends", () => {
    expect(folderSafe("agent/sync-retry")).toBe("agent-sync-retry");
    expect(folderSafe("feat\\a b:c")).toBe("feat-a-b-c");
    expect(folderSafe("../x")).toBe("x");
    expect(folderSafe("日本/語")).toBe("日本-語");
    expect(folderSafe("///")).toBe("branch");
  });
});

describe("their settings: [git] bases and worktrees, [keys.git]", () => {
  test("yours set them; a folder's own config sets bases and the panel's keys, never where worktrees go", () => {
    const dir = mkdtempSync(join(tmpdir(), "git-config-"));
    const user = join(dir, "config.toml");
    writeFileSync(
      user,
      '[git]\nbases = ["main", "dev"]\nworktrees = "~/trees/{repo}/{branch}"\n[keys.git]\nS = "stage_all"\n',
    );
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    const folder = join(dir, "v", ".slipbox", "config.toml");
    writeFileSync(folder, '[git]\nbases = ["trunk"]\nworktrees = "/tmp/{branch}"\n');
    const mine = loadConfig({ configFile: user });
    expect([mine.config.git.bases, mine.config.git.worktrees, mine.config.keys.git]).toEqual([
      ["main", "dev"],
      "~/trees/{repo}/{branch}",
      { S: "stage_all" },
    ]);
    const theirs = loadConfig({ configFile: user, vaultFile: folder });
    expect(theirs.config.git.bases).toEqual(["trunk"]);
    expect(theirs.config.git.worktrees).toBe("~/trees/{repo}/{branch}");
    expect(theirs.warnings.some((w) => w.includes("sets git.worktrees, which only your own config may set"))).toBe(
      true,
    );
    expect(DEFAULT_CONFIG.git).toMatchObject({ bases: ["main"], worktrees: "{parent}/{repo}-{branch}" });
  });
});

describe("the branches in the panel (GIT-D9)", () => {
  const now = Date.UTC(2026, 9, 15);
  const day = 24 * 3600 * 1000;
  const b = (name: string, ago: number, more: { here?: boolean; tree?: boolean } = {}) => ({
    name,
    date: now - ago * day,
    here: !!more.here,
    worktree: more.tree || more.here ? { path: `/w/${name}`, main: !!more.here, gone: false } : null,
  });
  test("this branch, those in a worktree, those touched lately; merged and untouched for a month folded", () => {
    const list = [
      b("old", 40),
      b("merged", 2),
      b("recent", 1),
      b("agent/b", 50, { tree: true }),
      b("agent/a", 3, { tree: true }),
      b("main", 0, { here: true }),
      b("older-still", 31 + OLD_MS / day),
    ];
    const order = orderBranches(list, (x) => x.name === "merged", now);
    expect(order.shown.map((x) => x.name)).toEqual(["main", "agent/a", "agent/b", "recent"]);
    expect(order.folded.map((x) => x.name)).toEqual(["merged", "old", "older-still"]);
  });
  test("git's worktree list read: the main checkout first, a gone folder marked, a bare repository left out", () => {
    const out = [
      "worktree /w/k\nHEAD 1\nbranch refs/heads/main\n",
      "worktree /w/k-a\nHEAD 2\nbranch refs/heads/agent/a\nprunable gitdir file points to non-existent location\n",
      "worktree /w/k-d\nHEAD 3\ndetached\n",
    ].join("\n");
    expect(parseWorktrees(out)).toEqual([
      { path: "/w/k", main: true, gone: false, branch: "main" },
      { path: "/w/k-a", main: false, gone: true, branch: "agent/a" },
      { path: "/w/k-d", main: false, gone: false, branch: null },
    ]);
  });
});
