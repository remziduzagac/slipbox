import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkoutOf } from "../../../src/core/workspace/git/git.ts";
import { keepBase } from "../../../src/core/workspace/git/gitbase.ts";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, env, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("changed and diff measure the branch against its own base, as the screen does, and say how it was chosen (D255)", () => {
    const dir = join(sandbox, "gitcli-base");
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", dir, ...args]);
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nfirst\n");
    expect(slipbox(["init", dir, "--name", "gitcli-base"]).code).toBe(0);
    if (git("init", "-q", "-b", "main").exitCode !== 0) return;
    git("add", "-A");
    git("commit", "-q", "-m", "start");
    git("checkout", "-q", "-b", "dev");
    writeFileSync(join(dir, "dev.md"), "# Dev\n");
    git("add", "-A");
    git("commit", "-q", "-m", "dev");
    git("checkout", "-q", "-b", "feat");
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nsecond\n");
    const changed = (...more: string[]) => {
      const d = slipbox(["changed", "--json", ...more], { cwd: dir }).json.data as {
        base: string;
        baseChosen: string;
        files: { path: string }[];
      };
      return [d.base, d.baseChosen, d.files.map((f) => f.path).sort()];
    };
    // Guessed among [git] bases, main as it comes: dev's commit counted as feat's.
    expect(changed()).toEqual(["main", "nearest", ["dev.md", "plan.md"]]);
    // Kept for the branch, as --base on opening or Compare against… keeps it: the screen's base, here too.
    const was = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = env.XDG_STATE_HOME;
    try {
      keepBase(checkoutOf(dir)!, "feat", "dev");
    } finally {
      if (was === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = was;
    }
    expect(changed()).toEqual(["dev", "kept", ["plan.md"]]);
    expect(slipbox(["diff", "plan.md", "--json"], { cwd: dir }).json.data).toMatchObject({
      base: "dev",
      baseChosen: "kept",
    });
    // --base still wins; a revision given as the commit it names (feat has no commit of its own: HEAD~1 is main's).
    expect(changed("--base", "main")).toEqual(["main", "given", ["dev.md", "plan.md"]]);
    const parent = git("rev-parse", "HEAD~1").stdout.toString().trim();
    expect(changed("--base", "HEAD~1")).toEqual([parent, "given", ["dev.md", "plan.md"]]);
    expect(slipbox(["changed", "--base", "-x"], { cwd: dir }).code).toBe(3);
  });

  test("changed, diff, worktrees: this branch against main (5.13, 5.14)", () => {
    const dir = join(sandbox, "gitcli");
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", dir, ...args]);
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nfirst\n");
    expect(slipbox(["init", dir, "--name", "gitcli"]).code).toBe(0);
    if (git("init", "-q", "-b", "main").exitCode !== 0) return;
    git("add", "-A");
    git("commit", "-q", "-m", "start");
    git("checkout", "-q", "-b", "feat");
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nsecond\n");
    expect(slipbox(["changed"], { cwd: dir }).out).toBe("M plan.md\n");
    expect(slipbox(["diff", "plan.md"], { cwd: dir }).out).toBe("@@ line 3\n  # Plan\n  \n- first\n+ second\n");
    expect(slipbox(["worktrees", "--json"], { cwd: dir }).json.data).toMatchObject([
      { path: dir, branch: "feat", main: true, current: true },
    ]);
    expect(slipbox(["changed", "--base", "nope"], { cwd: dir }).code).toBe(3);
    // Before a merge (20.21): what merging feat into main would break — committed work only.
    git("commit", "-q", "-am", "second");
    expect(slipbox(["merge-review", "feat", "--into", "main"], { cwd: dir }).out).toBe(
      "merging feat into main: no link would break\n",
    );
    // Histories with nothing in common: said so, not as an old git.
    git("checkout", "-q", "--orphan", "lone");
    git("commit", "-q", "-am", "lone");
    const lone = slipbox(["merge-review", "lone", "--into", "main"], { cwd: dir });
    expect(lone.code).not.toBe(0);
    expect(lone.err).toContain("lone and main have no commit in common: git won't merge them");
    expect(lone.err).not.toContain("2.38");
  });
  test("worktrees of a bare repository: none of them the main checkout (5.14)", () => {
    const top = join(sandbox, "gitbare");
    const src = join(top, "src");
    mkdirSync(src, { recursive: true });
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    writeFileSync(join(src, "plan.md"), "# Plan\n");
    if (git(src, "init", "-q", "-b", "main").exitCode !== 0) return;
    git(src, "add", "-A");
    git(src, "commit", "-q", "-m", "start");
    git(top, "clone", "-q", "--bare", src, "repo.git");
    const bare = join(top, "repo.git");
    git(bare, "worktree", "add", "-q", join(top, "w-main"), "main");
    git(bare, "worktree", "add", "-q", "-b", "feat", join(top, "w-feat"));
    const list = slipbox(["worktrees", "--json"], { cwd: join(top, "w-feat") }).json.data as {
      path: string;
      main: boolean;
    }[];
    expect(list.map((w) => basename(w.path)).sort()).toEqual(["w-feat", "w-main"]);
    expect(list.map((w) => w.main)).toEqual([false, false]);
  });
});
