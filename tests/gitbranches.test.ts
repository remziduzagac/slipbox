// The git panel's branches (GIT-D9, GIT-D10, GIT-D13), as the core has them: each branch's own base — kept, guessed
// among `[git] bases`, changed — where a new worktree goes, and the order the panel lists the branches in.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import { type Checkout, checkoutOf } from "../src/core/git.ts";
import {
  agoSaid,
  askedBase,
  baseAtOpen,
  baseFor,
  baseForLater,
  chooseBase,
  isRemoteTracking,
  keepBase,
  keptBases,
  nearest,
  remoteBranchesLater,
  remoteMovedAt,
  resolveBase,
  resolveBaseLater,
} from "../src/core/gitbase.ts";
import {
  aheadBehindLater,
  branchChangedLater,
  branchesLater,
  CHECKOUT_MS,
  changedLater,
  checkedOutLater,
  checkoutLater,
  folderSafe,
  ignoredLater,
  ignoredText,
  mergeBaseLater,
  newWorktreeLater,
  OLD_MS,
  orderBranches,
  parseWorktrees,
  worktreeFolder,
} from "../src/core/gitbranches.ts";
import { baseBranch, refName, worktreeList } from "../src/core/gitops.ts";
import { refusedName } from "../src/core/gitremote.ts";
import { setTrust } from "../src/core/trust.ts";

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

  test("asynchronous base selection preserves the synchronous policy", async () => {
    for (const branch of ["main", "dev", "feature"])
      expect(await baseForLater(c, branch, config)).toEqual(baseFor(c, branch, config));
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

describe("a base asked for: --base, remote branches, tags and commits (D255)", () => {
  let dir = "";
  let origin = "";
  let clone = "";
  const state = process.env.XDG_STATE_HOME;
  const config = { base: "", bases: ["origin/main", "origin/dev"] };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "asked-"));
    process.env.XDG_STATE_HOME = join(dir, "state");
    // origin: main, dev two past it, feature one past dev; a clone with only main of its own, the rest remote.
    origin = join(dir, "origin");
    mkdirSync(origin);
    git(origin, "init", "-q", "-b", "main");
    commit(origin, "a.md", "one");
    git(origin, "switch", "-qc", "dev");
    commit(origin, "b.md", "two");
    commit(origin, "c.md", "three");
    git(origin, "switch", "-qc", "feature");
    commit(origin, "d.md", "four");
    git(origin, "switch", "-q", "main");
    clone = join(dir, "clone");
    git(dir, "clone", "-q", origin, clone);
    // A pull request's worktree, as a workspace opens it: a local branch made from the remote one.
    git(clone, "switch", "-qc", "work", "origin/feature");
  });

  afterAll(() => {
    if (state === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = state;
  });

  test("a ref's name is kept as it is; another revision as its commit; nothing else reaches git", async () => {
    const c = checkoutOf(clone)!;
    expect(resolveBase(c, "origin/dev")).toEqual({
      base: "origin/dev",
      commit: false,
      full: "refs/remotes/origin/dev",
    });
    expect(resolveBase(c, " main ")).toEqual({ base: "main", commit: false, full: "refs/heads/main" });
    const tip = git(clone, "rev-parse", "HEAD~1").trim();
    expect(resolveBase(c, "HEAD~1")).toEqual({ base: tip, commit: true, full: "" });
    expect(resolveBase(c, tip)).toEqual({ base: tip, commit: false, full: "" });
    expect(resolveBase(c, tip.slice(0, 9))).toEqual({ base: tip, commit: true, full: "" });
    // One branch however it's spelt, by its plain name: HEAD is the branch checked out's, origin its default branch's.
    for (const spelt of ["work", "heads/work", "refs/heads/work", "HEAD"])
      expect(resolveBase(c, spelt)).toEqual({ base: "work", commit: false, full: "refs/heads/work" });
    expect(resolveBase(c, "origin")).toEqual({ base: "origin/main", commit: false, full: "refs/remotes/origin/main" });
    expect(resolveBase(c, "no-such-branch")).toEqual({
      error: 'no branch or commit "no-such-branch" in the repository',
    });
    expect(await resolveBaseLater(c, "HEAD~1")).toEqual(resolveBase(c, "HEAD~1"));
    expect(await resolveBaseLater(c, "origin/dev")).toEqual(resolveBase(c, "origin/dev"));
    // An option, a space, a control character: refused before git is asked.
    let asked = 0;
    const commitOf = () => (asked++, { commit: "c0ffee", full: "" });
    for (const bad of ["--output=x", "-h", "a b", "a\tb", ""]) expect("error" in askedBase(bad, commitOf)).toBe(true);
    expect(asked).toBe(0);
  });

  test("a remote-tracking branch is a base as a local one is: kept, guessed among [git] bases, compared from", async () => {
    const c = checkoutOf(clone)!;
    // Guessed: work is one past origin/dev, three past origin/main.
    expect(baseFor(c, "work", config)).toEqual({ base: "origin/dev", how: "nearest" });
    keepBase(c, "work", "origin/main");
    expect(baseFor(c, "work", config)).toEqual({ base: "origin/main", how: "kept" });
    expect(await baseForLater(c, "work", config)).toEqual(baseFor(c, "work", config));
    keepBase(c, "work", null);
    expect(isRemoteTracking(c, "origin/dev")).toBe(true);
    expect(isRemoteTracking(c, "main")).toBe(false);
    expect(isRemoteTracking(c, "origin/nope")).toBe(false);
    // Packed by git, still found.
    git(clone, "pack-refs", "--all");
    expect(isRemoteTracking(c, "origin/dev")).toBe(true);
    expect(await remoteBranchesLater(c)).toEqual(["origin/dev", "origin/feature", "origin/main"]);
  });

  test("slipbox [path] --base: kept for the branch checked out there; a ref that names nothing, an error", () => {
    const c = checkoutOf(clone)!;
    expect(baseAtOpen(clone, "origin/dev")).toEqual({ note: "work is compared against origin/dev now" });
    expect(keptBases(c)).toEqual({ work: "origin/dev" });
    expect(baseFor(c, "work", { base: "", bases: ["main"] })).toEqual({ base: "origin/dev", how: "kept" });
    const parent = git(clone, "rev-parse", "HEAD~1").trim();
    expect(baseAtOpen(clone, "HEAD~1")).toEqual({ note: `work is compared against ${parent} (HEAD~1) now` });
    expect(baseAtOpen(clone, "no-such-ref")).toEqual({
      error: '--base: no branch or commit "no-such-ref" in the repository',
    });
    for (const self of ["work", "HEAD", "refs/heads/work"])
      expect(baseAtOpen(clone, self)).toEqual({
        warn: `--base ${self}: that's the branch itself, so its base is guessed`,
      });
    const loose = mkdtempSync(join(tmpdir(), "asked-loose-"));
    expect(baseAtOpen(loose, "dev")).toEqual({ warn: "--base dev: not in a git repository, so it's ignored" });
    git(clone, "switch", "-q", "--detach");
    try {
      expect(baseAtOpen(clone, "origin/dev")).toEqual({
        warn: "--base origin/dev: HEAD is detached, so there's no branch to keep it for",
      });
    } finally {
      git(clone, "switch", "-q", "work");
    }
    keepBase(c, "work", null);
  });

  test("how fresh a remote base is: when the fetch that moved it ran, said in a few words", () => {
    const c = checkoutOf(clone)!;
    // As the clone left them: no record of when.
    expect(remoteMovedAt(c, "origin/dev")).toBeNull();
    git(origin, "switch", "-q", "dev");
    commit(origin, "e.md", "five");
    git(origin, "switch", "-q", "main");
    git(clone, "fetch", "-q");
    const at = remoteMovedAt(c, "origin/dev");
    expect(at).not.toBeNull();
    expect(Math.abs(Date.now() - at!)).toBeLessThan(60_000);
    // A fetch that found nothing new for it: still none.
    expect(remoteMovedAt(c, "origin/main")).toBeNull();
    const now = Date.UTC(2026, 9, 20, 12);
    expect(agoSaid(now - 20_000, now)).toBe("just now");
    expect(agoSaid(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(agoSaid(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(agoSaid(now - 3 * 86_400_000, now)).toBe("3 days ago");
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

  test("a base is a branch's name: anything else in [git] base or bases is left out, and said", () => {
    const dir = mkdtempSync(join(tmpdir(), "git-config-"));
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    const folder = join(dir, "v", ".slipbox", "config.toml");
    writeFileSync(folder, '[git]\nbases = ["-x", "main", "a b", "origin/dev"]\nbase = "-y"\n');
    const got = loadConfig({ configFile: join(dir, "none.toml"), vaultFile: folder });
    expect(got.config.git.bases).toEqual(["main", "origin/dev"]);
    expect(got.config.git.base).toBe("");
    expect(got.warnings.filter((w) => /git\.bases? takes/.test(w))).toHaveLength(2);
    for (const ok of ["main", "origin/main", "release/2.0", "v1.2", "0123abc", "HEAD"]) expect(refName(ok)).toBe(true);
    for (const bad of [
      "",
      "-x",
      "--x=y",
      "a b",
      "a..b",
      "a~1",
      "a^",
      "a:b",
      "a?",
      "a*",
      "a[",
      "@",
      "a/",
      ".a",
      "a.lock",
    ])
      expect(refName(bad)).toBe(false);
    // The same rule for every name slipbox hands git, said why where it's refused (a remote's, a base rebased onto).
    expect(refusedName("the base", "origin/main")).toBeNull();
    expect(refusedName("the base", "--root")).toBe(
      'the base "--root" starts with "-": slipbox doesn\'t pass it to git',
    );
    expect(refusedName("the remote's name", "a b")).toBe(
      "the remote's name \"a b\" isn't a name git takes: slipbox doesn't pass it to git",
    );
  });
});

describe("a base before git uses it", () => {
  test("a base that isn't a branch's name never reaches git: no count, no diff, no merge base, guessed past", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bases-"));
    const repo = join(dir, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    commit(repo, "a.md", "one");
    git(repo, "switch", "-qc", "feature");
    commit(repo, "b.md", "two");
    const odd = `--output=${join(dir, "x")}`;
    expect(await aheadBehindLater(repo, odd, "feature")).toBeNull();
    expect(await branchChangedLater(repo, odd, "feature")).toBeNull();
    expect(await mergeBaseLater(repo, odd, "feature")).toBeNull();
    expect(await changedLater({ root: repo }, odd, [])).toBeNull();
    expect(baseBranch({ root: repo }, odd)).toBeNull();
    expect(readdirSync(dir)).toEqual(["repo"]);
    // Kept, or listed: passed over, the next one taken.
    const c = checkoutOf(repo)!;
    expect(baseFor(c, "feature", { base: odd, bases: [odd, "main"] })).toEqual({ base: "main", how: "nearest" });
    expect(readdirSync(dir)).toEqual(["repo"]);
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
  test("git's worktree list read (-z): the main checkout first, a gone folder marked, a line break in a folder's name", () => {
    const out = [
      "worktree /w/k\0HEAD 1\0branch refs/heads/main\0",
      "worktree /w/k-a\0HEAD 2\0branch refs/heads/agent/a\0prunable gitdir file points to non-existent location\0",
      "worktree /w/k-d\0HEAD 3\0detached\0",
      "worktree /w/k\nnl\0HEAD 4\0branch refs/heads/nl\0",
    ].join("\0");
    expect(parseWorktrees(out)).toEqual([
      { path: "/w/k", main: true, gone: false, branch: "main" },
      { path: "/w/k-a", main: false, gone: true, branch: "agent/a" },
      { path: "/w/k-d", main: false, gone: false, branch: null },
      { path: "/w/k\nnl", main: false, gone: false, branch: "nl" },
    ]);
    // A bare repository is listed first, and has no checkout of its own.
    expect(parseWorktrees("worktree /w/b.git\0bare\0\0worktree /w/x\0HEAD 1\0branch refs/heads/x\0\0")).toEqual([
      { path: "/w/x", main: false, gone: false, branch: "x" },
    ]);
  });
});

describe("worktrees made and removed (GIT-D9)", () => {
  const repo = () => {
    const dir = mkdtempSync(join(tmpdir(), "trees-"));
    const root = join(dir, "repo");
    mkdirSync(root);
    git(root, "init", "-q", "-b", "main");
    commit(root, "a.md", "one");
    return { dir, root };
  };

  test("a checkout opened through a link to its folder is here: its branch marked so, the others not", async () => {
    const { dir, root } = repo();
    const wt = join(dir, "wt");
    git(root, "worktree", "add", "-q", "-b", "feat", wt);
    symlinkSync(wt, join(dir, "link"));
    const list = (await branchesLater(checkoutOf(join(dir, "link"))!))!;
    expect(list.map((b) => [b.name, b.here])).toEqual([
      ["feat", true],
      ["main", false],
    ]);
  });

  test("a branch for a worktree whose folder is taken isn't made; one whose folder is free is, checked out there", async () => {
    const { dir, root } = repo();
    const taken = join(dir, "taken");
    mkdirSync(taken);
    writeFileSync(join(taken, "x"), "x");
    const refused = await newWorktreeLater(root, taken, "nb", "main");
    expect(refused.why).toMatch(/already exists/);
    expect(refused.left).toBe(false);
    expect(git(root, "branch", "--list", "nb")).toBe("");
    expect(await newWorktreeLater(root, join(dir, "free"), "nb", "main")).toEqual({ why: null, left: false });
    expect(git(join(dir, "free"), "branch", "--show-current")).toBe("nb\n");
    // Made from a branch, it doesn't track it.
    expect(spawnSync("git", ["-C", root, "config", "branch.nb.merge"]).status).not.toBe(0);
  });

  test("git stopped partway, as checkoutLater says it — what it may have left after it — is stopped, whatever git's words are", async () => {
    const { root } = repo();
    // git waiting for what it's never sent: stopped when its time is up.
    const stopped = await checkedOutLater(root, ["hash-object", "--stdin"], "the checkout may be half done", 100);
    expect(stopped).toEqual({
      why: "git took too long, and was stopped: the checkout may be half done",
      stopped: true,
    });
    // git's own refusal, its words quoting what says so: refused, not stopped.
    const refused = await checkedOutLater(root, ["rev-parse", "--verify", "and was stopped: x"], "half done");
    expect(refused.stopped).toBe(false);
    expect(refused.why).not.toBeNull();
  });

  test("a name there is already: refused, that branch left as it was; a hook refusing once it's checked out: the branch it made left", async () => {
    const { dir, root } = repo();
    git(root, "branch", "nb");
    const tip = git(root, "rev-parse", "nb");
    const there = await newWorktreeLater(root, join(dir, "a"), "nb", "main");
    expect(there.why).toMatch(/already exists/);
    expect(there.left).toBe(false);
    expect(git(root, "rev-parse", "nb")).toBe(tip);
    // A hook runs only where the root is trusted (gitArgs): its trust this test's own state.
    const state = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(dir, "state");
    try {
      setTrust(root, "trusted");
      // The repository's own hooks, whatever a global `core.hooksPath` says (a hook manager's).
      git(root, "config", "core.hooksPath", join(root, ".git", "hooks"));
      writeFileSync(join(root, ".git", "hooks", "post-checkout"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const hooked = await newWorktreeLater(root, join(dir, "b"), "hooked", "main");
      expect(hooked.why).not.toBeNull();
      // Checked out in its worktree: `git branch -D` won't delete it.
      expect(hooked.left).toBe(true);
      expect(git(root, "branch", "--list", "hooked")).toBe("+ hooked\n");
    } finally {
      setTrust(root, null);
      if (state === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = state;
    }
  });

  test("a git before 2.36 refuses worktree list -z: the list read as lines instead, -z asked of it once", async () => {
    const { dir, root } = repo();
    git(root, "worktree", "add", "-q", "-b", "feat", join(dir, "wt"));
    // A stand-in git: the real one, but for `worktree list -z`, which it refuses as git 2.35 does.
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const refused = join(dir, "refused");
    writeFileSync(
      join(bin, "git"),
      [
        "#!/bin/sh",
        `case " $* " in *" worktree list "*" -z "*) echo z >> '${refused}'; echo "error: unknown switch 'z'" >&2; exit 129;; esac`,
        `exec '${Bun.which("git")}' "$@"`,
        "",
      ].join("\n"),
    );
    chmodSync(join(bin, "git"), 0o755);
    const was = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${was}`;
    try {
      expect(worktreeList({ root })?.map((w) => [w.branch, w.main])).toEqual([
        ["main", true],
        ["feat", false],
      ]);
      const list = (await branchesLater({ root }))!;
      expect(list.map((b) => [b.name, b.here, !!b.worktree])).toEqual([
        ["feat", false, true],
        ["main", true, true],
      ]);
      expect(worktreeList({ root })).toHaveLength(2);
      // Refused once: which form it takes is kept for that git.
      expect(readFileSync(refused, "utf8")).toBe("z\n");
    } finally {
      process.env.PATH = was;
    }
  });

  test("a checkout runs as long as it takes, up to minutes; stopped, it says so and what it may have left", async () => {
    const { root } = repo();
    expect(CHECKOUT_MS).toBeGreaterThanOrEqual(10 * 60_000);
    // A command that waits for what never comes (its input stays open), stopped at 50 ms.
    const why = await checkoutLater(root, ["hash-object", "--stdin"], "what was left", 50);
    expect(why).toBe("git took too long, and was stopped: what was left");
  });

  test("a worktree's ignored files, as Remove names them: notes first, then the others; never a busy folder's", async () => {
    const { root } = repo();
    writeFileSync(join(root, ".gitignore"), "local/\n.env\nnode_modules/\ndist/\n*.log\n");
    git(root, "add", ".gitignore");
    git(root, "commit", "-qm", "ignore");
    mkdirSync(join(root, "local", "sub"), { recursive: true });
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    for (const f of ["local/draft.md", "local/sub/b.md", ".env", "a.log", "node_modules/x/y.md", "dist/out.js"])
      writeFileSync(join(root, f), "x\n");
    const ig = (await ignoredLater(root))!;
    expect(ig).toEqual({ notes: ["local/draft.md", "local/sub/b.md"], others: [".env", "a.log"], more: false });
    expect(ignoredText(ig)).toBe("2 ignored notes and 2 other ignored files: local/draft.md, local/sub/b.md, .env, …");
    expect(ignoredText({ notes: [], others: [".env"], more: false })).toBe("1 ignored file: .env");
    expect(ignoredText({ notes: [], others: [], more: false })).toBe("");
  });
});

test.skipIf(process.platform === "win32")(
  "cancelling a cold asynchronous Git read also stops its capability probe",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "git-probe-"));
    const pid = join(dir, "pid");
    const fake = join(dir, "git");
    writeFileSync(fake, '#!/bin/sh\nprintf "%s" "$$" > "$GIT_PROBE_PID"\nexec sleep 10\n');
    chmodSync(fake, 0o755);
    const script = join(dir, "probe.ts");
    writeFileSync(
      script,
      `
    import {existsSync,readFileSync} from "node:fs";
    import {gitReadLater} from ${JSON.stringify(new URL("../src/core/gitops.ts", import.meta.url).pathname)};
    const abort = new AbortController();
    const pending = gitReadLater({root: ${JSON.stringify(dir)}}, ["status"], false, abort.signal);
    while (!existsSync(process.env.GIT_PROBE_PID!)) await Bun.sleep(5);
    abort.abort();
    await pending;
    await Bun.sleep(50);
    const pid = Number(readFileSync(process.env.GIT_PROBE_PID!,"utf8"));
    let alive = true;
    try {process.kill(pid,0);} catch {alive = false;}
    if (alive) process.kill(-pid,"SIGKILL");
    console.log(alive ? "probe survived cancellation" : "stopped");
  `,
    );
    const child = Bun.spawn([process.execPath, script], {
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, GIT_PROBE_PID: pid },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
    expect((await new Response(child.stdout).text()).trim()).toBe("stopped");
  },
);
