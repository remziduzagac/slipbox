import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTrust } from "../../../../../src/core/workspace/vaults/trust.ts";
import { checkoutOf } from "../../../../../src/core/workspace/git/git.ts";
import {
  abortLater,
  aheadBehind,
  changedTracked,
  continueLater,
  operationOf,
  operationText,
  pullDefault,
  rebaseLater,
  skipLater,
  stashKept,
} from "../../../../../src/core/workspace/git/branches/gitrebase.ts";
import { pullLater, withAutostash } from "../../../../../src/core/workspace/git/branches/gitremote.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("a merge or a rebase under way, and a pull where both sides moved (GIT-D6)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder()
      .decode(
        Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
      )
      .trim();
  /** Nobody's git config but the test's while it runs, its commits made by the test; the environment put back. */
  const isolated = async (run: () => Promise<void>) => {
    const keys = [
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
    ];
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "t";
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@example.invalid";
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };
  const commit = (root: string, file: string, text: string, message = `${file}: ${text.trim()}`) => {
    writeFileSync(join(root, file), text);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", message);
  };
  /** A branch behind main, both having changed the same line. */
  const behind = () => {
    const root = realpathSync(mkdtempSync(join(sandbox, "rebase-")));
    git(root, "init", "-q", "-b", "main");
    commit(root, "a.md", "one\ntwo\nthree\n");
    commit(root, "b.md", "b\n");
    git(root, "switch", "-q", "-c", "agent");
    commit(root, "a.md", "one\nagent's two\nthree\n", "Agent: two");
    commit(root, "b.md", "b, the agent's\n", "Agent: b");
    git(root, "switch", "-q", "main");
    commit(root, "a.md", "one\nmain's two\nthree\n", "Main: two");
    git(root, "switch", "-q", "agent");
    return root;
  };

  test("read from git's own files: a rebase's step and steps, its branch; a merge's other side; git am none", () => {
    const dir = mkdtempSync(join(sandbox, "gitdir-"));
    expect(operationOf({ gitDir: dir })).toBeNull();
    mkdirSync(join(dir, "rebase-merge"));
    writeFileSync(join(dir, "rebase-merge", "msgnum"), "2\n");
    writeFileSync(join(dir, "rebase-merge", "end"), "5\n");
    writeFileSync(join(dir, "rebase-merge", "head-name"), "refs/heads/agent/sync-retry\n");
    const op = operationOf({ gitDir: dir })!;
    expect(op).toEqual({ kind: "rebase", step: 2, total: 5, branch: "agent/sync-retry", merging: null });
    expect(operationText(op)).toBe("rebasing 2/5");
    rmSync(join(dir, "rebase-merge"), { recursive: true });
    mkdirSync(join(dir, "rebase-apply"));
    writeFileSync(join(dir, "rebase-apply", "next"), "1");
    writeFileSync(join(dir, "rebase-apply", "last"), "3");
    writeFileSync(join(dir, "rebase-apply", "head-name"), "detached HEAD");
    expect(operationOf({ gitDir: dir })).toMatchObject({ step: 1, total: 3, branch: null });
    // git am's: none of slipbox's.
    writeFileSync(join(dir, "rebase-apply", "applying"), "");
    expect(operationOf({ gitDir: dir })).toBeNull();
    rmSync(join(dir, "rebase-apply"), { recursive: true });
    writeFileSync(join(dir, "MERGE_HEAD"), "0123\n");
    writeFileSync(join(dir, "MERGE_MSG"), "Merge branch 'main' of /tmp/origin into main\n");
    const merge = operationOf({ gitDir: dir })!;
    expect(merge).toMatchObject({ kind: "merge", merging: "main" });
    expect(operationText(merge)).toBe("merging");
    expect(operationText({ kind: "rebase", step: null, total: null, branch: null, merging: null })).toBe("rebasing");
  });

  test("a cherry-pick or a revert under way, read from git's files: the commit it's at; a series between commits", () => {
    const dir = mkdtempSync(join(sandbox, "gitdir-"));
    writeFileSync(join(dir, "CHERRY_PICK_HEAD"), "0123\n");
    writeFileSync(join(dir, "MERGE_MSG"), "Retry with a budget\n\n# Conflicts:\n#\ta.md\n");
    const pick = operationOf({ gitDir: dir })!;
    expect(pick).toMatchObject({ kind: "cherry-pick", commit: "Retry with a budget", branch: null });
    expect(operationText(pick)).toBe("cherry-picking");
    rmSync(join(dir, "CHERRY_PICK_HEAD"));
    writeFileSync(join(dir, "REVERT_HEAD"), "0123\n");
    writeFileSync(join(dir, "MERGE_MSG"), 'Revert "Retry with a budget"\n\nThis reverts commit 0123.\n');
    const revert = operationOf({ gitDir: dir })!;
    expect(revert).toMatchObject({ kind: "revert", commit: "Retry with a budget" });
    expect(operationText(revert)).toBe("reverting");
    // A series between its commits: what it does next, as its list says.
    rmSync(join(dir, "REVERT_HEAD"));
    rmSync(join(dir, "MERGE_MSG"));
    mkdirSync(join(dir, "sequencer"));
    writeFileSync(join(dir, "sequencer", "todo"), "revert 0123 Retry with a budget\n");
    expect(operationOf({ gitDir: dir })).toMatchObject({ kind: "revert" });
    writeFileSync(join(dir, "sequencer", "todo"), "pick 0123 Retry with a budget\n");
    expect(operationOf({ gitDir: dir })).toMatchObject({ kind: "cherry-pick" });
    // A rebase is a rebase, whatever else is there.
    mkdirSync(join(dir, "rebase-merge"));
    expect(operationOf({ gitDir: dir })!.kind).toBe("rebase");
  });

  test("a base whose name starts with - isn't passed to git: not compared, not rebased onto (regression)", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      const head = git(root, "rev-parse", "HEAD");
      expect(aheadBehind(c, "--all")).toBeNull();
      expect(await rebaseLater(c, "--root")).toEqual({
        ok: false,
        why: 'the base "--root" starts with "-": slipbox doesn\'t pass it to git',
        login: false,
      });
      expect(operationOf(c)).toBeNull();
      expect(git(root, "rev-parse", "HEAD")).toBe(head);
    });
  });

  test("git in English where slipbox reads its words; its options ended before names; a flood said as such (regression)", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      const { stashSaveLater, pushLater } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      const { mergeLater } = await import("../../../../../src/core/workspace/git/branches/gitbranches.ts");
      const { reviewMerge } = await import("../../../../../src/core/workspace/git/review/mergereview.ts");
      // A git that says what it was run with — its locale, its arguments — and fails; or prints too much.
      const bin = mkdtempSync(join(sandbox, "saying-"));
      writeFileSync(
        join(bin, "git"),
        [
          "#!/bin/sh",
          'case "$*" in',
          "  *rev-parse*) echo 0123456789abcdef0123456789abcdef01234567; exit 0 ;;",
          "  *show-scope*) exit 1 ;;",
          "  *flood*) head -c 17000000 /dev/zero; exit 0 ;;",
          "esac",
          'echo "fatal: LC_ALL=${LC_ALL-unset} LANGUAGE=${LANGUAGE-unset} ARGS=$*" >&2',
          "exit 128",
          "",
        ].join("\n"),
      );
      chmodSync(join(bin, "git"), 0o755);
      const was = { PATH: process.env.PATH, LC_ALL: process.env.LC_ALL, LANGUAGE: process.env.LANGUAGE };
      process.env.PATH = `${bin}:${process.env.PATH}`;
      process.env.LC_ALL = "de_DE.UTF-8";
      process.env.LANGUAGE = "de";
      try {
        const english = "LC_ALL=C LANGUAGE=unset";
        const rebased = await rebaseLater(c, "main");
        expect(!rebased.ok && rebased.why).toContain(english);
        expect(!rebased.ok && rebased.why).toContain("rebase --end-of-options main");
        const stashed = await stashSaveLater(c, "", false);
        expect(!stashed.ok && stashed.why).toContain(english);
        const pushed = await pushLater(c, "agent", { remote: "origin", ref: "refs/heads/agent" });
        expect(!pushed.ok && pushed.why).toContain(english);
        expect(!pushed.ok && pushed.why).toContain("--end-of-options origin refs/heads/agent:refs/heads/agent");
        const merged = await mergeLater(root, "main");
        expect(!merged.ok && merged.why).toContain(english);
        expect(() => reviewMerge(c, root, "main", "agent")).toThrow(english);
        // More output than slipbox reads: said so, not as a git that took too long.
        const flood = { ok: false as const, why: "git printed more than slipbox reads, and was stopped", login: false };
        expect(await stashSaveLater(c, "flood", false)).toEqual(flood);
        expect(await rebaseLater(c, "flood")).toEqual(flood);
      } finally {
        for (const [k, v] of Object.entries(was))
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
      }
    });
  });

  test("a rebase stopped at its conflict, read; continued once settled; aborted; a commit skipped", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      expect(aheadBehind(c, "main")).toEqual({ ahead: 2, behind: 1 });
      expect(operationOf(c)).toBeNull();
      const r = await rebaseLater(c, "main");
      expect(r.ok).toBe(false);
      expect(!r.ok && r.why).toContain("CONFLICT (content): Merge conflict in a.md");
      expect(operationOf(c)).toEqual({ kind: "rebase", step: 1, total: 2, branch: "agent", merging: null });
      // Settled and staged: continued, the message kept (no editor).
      writeFileSync(join(root, "a.md"), "one\nboth twos\nthree\n");
      git(root, "add", "a.md");
      const done = await continueLater(c, operationOf(c)!);
      expect(done.ok).toBe(true);
      expect(operationOf(c)).toBeNull();
      expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b\nAgent: two");
    });
  });

  test("aborted: the branch where it was; skipped: the commit left out", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      const was = git(root, "rev-parse", "HEAD");
      await rebaseLater(c, "main");
      expect((await abortLater(c, operationOf(c)!)).ok).toBe(true);
      expect(operationOf(c)).toBeNull();
      expect(git(root, "rev-parse", "HEAD")).toBe(was);
      await rebaseLater(c, "main");
      expect((await skipLater(c, operationOf(c)!)).ok).toBe(true);
      expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b");
    });
  });

  test("not trusted, a rebase runs no hook; trusted, it does", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      const mark = join(root, "..", `${root.split("/").pop()}-hook-ran`);
      const hook = join(root, ".git", "hooks", "pre-rebase");
      mkdirSync(join(root, ".git", "hooks"), { recursive: true });
      writeFileSync(hook, `#!/bin/sh\ntouch '${mark}'\n`);
      chmodSync(hook, 0o755);
      await rebaseLater(c, "main");
      expect(existsSync(mark)).toBe(false);
      await abortLater(c, operationOf(c)!);
      setTrust(root, "trusted");
      try {
        await rebaseLater(c, "main");
        expect(existsSync(mark)).toBe(true);
        await abortLater(c, operationOf(c)!);
      } finally {
        setTrust(root, null);
      }
    });
  });

  test("not trusted, nothing a rebase or a pull commits is signed: the repository's own signing program never runs", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      // The repository's config asks for every commit signed, by a program of its own.
      const mark = join(root, "..", `${root.split("/").pop()}-signer-ran`);
      const signer = join(root, "..", `${root.split("/").pop()}-signer`);
      writeFileSync(signer, `#!/bin/sh\ntouch '${mark}'\nexit 1\n`);
      chmodSync(signer, 0o755);
      git(root, "config", "commit.gpgSign", "true");
      git(root, "config", "gpg.program", signer);
      await rebaseLater(c, "main");
      writeFileSync(join(root, "a.md"), "one\nboth twos\nthree\n");
      git(root, "add", "a.md");
      expect((await continueLater(c, operationOf(c)!)).ok).toBe(true);
      expect(operationOf(c)).toBeNull();
      expect(existsSync(mark)).toBe(false);
      // A pull's merge commit likewise.
      const bare = join(root, "..", `${root.split("/").pop()}-origin.git`);
      const other = join(root, "..", `${root.split("/").pop()}-other`);
      Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "agent", bare]);
      git(root, "remote", "add", "origin", bare);
      git(root, "-c", "commit.gpgSign=false", "push", "-q", "-u", "origin", "agent");
      Bun.spawnSync(["git", "clone", "-q", "-b", "agent", bare, other]);
      commit(other, "c.md", "theirs\n");
      git(other, "push", "-q");
      git(root, "-c", "commit.gpgSign=false", "commit", "-q", "--allow-empty", "-m", "mine");
      expect((await pullLater(c, "merge")).ok).toBe(true);
      expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(2);
      expect(existsSync(mark)).toBe(false);
    });
  });

  /** A branch behind main, main having changed b.md and the branch made c.md: its rebase meets no conflict. */
  const apart = () => {
    const root = realpathSync(mkdtempSync(join(sandbox, "autostash-")));
    git(root, "init", "-q", "-b", "main");
    commit(root, "a.md", "a\n");
    commit(root, "b.md", "b\n");
    git(root, "switch", "-q", "-c", "agent");
    commit(root, "c.md", "c\n", "Agent: c");
    git(root, "switch", "-q", "main");
    commit(root, "b.md", "b, main's\n", "Main: b");
    git(root, "switch", "-q", "agent");
    return root;
  };

  test("files changed: tracked ones, staged or not, never untracked; rebased over, refused, or stashed and put back (D247)", async () => {
    await isolated(async () => {
      const root = apart();
      const c = checkoutOf(root)!;
      // An untracked file is none: git rebases past it.
      writeFileSync(join(root, "u.md"), "untracked\n");
      expect(changedTracked(c)).toEqual([]);
      writeFileSync(join(root, "a.md"), "a, mine\n");
      writeFileSync(join(root, "c.md"), "c, staged\n");
      git(root, "add", "c.md");
      expect(changedTracked(c)!.sort()).toEqual(["a.md", "c.md"]);
      // Not stashed: git refuses, in its words.
      const refused = await rebaseLater(c, "main");
      expect(!refused.ok && refused.why).toContain("cannot rebase");
      expect(aheadBehind(c, "main")).toEqual({ ahead: 1, behind: 1 });
      // Stashed: rebased, the changes put back, the stash gone.
      const r = await rebaseLater(c, "main", true);
      expect(r.ok).toBe(true);
      expect(stashKept(r)).toBe(false);
      expect(aheadBehind(c, "main")).toEqual({ ahead: 1, behind: 0 });
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
      expect(readFileSync(join(root, "c.md"), "utf8")).toBe("c, staged\n");
      expect(readFileSync(join(root, "u.md"), "utf8")).toBe("untracked\n");
      expect(git(root, "stash", "list")).toBe("");
    });
  });

  test("changes that conflict going back are kept in the stash, known by the stash git left (D247)", async () => {
    await isolated(async () => {
      const root = apart();
      const c = checkoutOf(root)!;
      // main changed b.md's line; so did you.
      writeFileSync(join(root, "b.md"), "b, mine\n");
      const r = await rebaseLater(c, "main", true);
      expect(r.ok).toBe(true);
      expect(stashKept(r)).toBe(true);
      expect(r.ok && r.kept).toBe(git(root, "rev-parse", "refs/stash"));
      expect(aheadBehind(c, "main")).toEqual({ ahead: 1, behind: 0 });
      expect(git(root, "stash", "list", "--format=%gd %gs")).toBe("stash@{0} autostash");
      expect(git(root, "show", "stash@{0}:b.md")).toBe("b, mine");
      expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("UU b.md");
      // A run that failed keeps nothing of the kind.
      expect(stashKept({ ok: false, why: "Your changes are safe in the stash.", login: false })).toBe(false);
    });
  });

  test("a stash kept is the one a run left behind, whatever git printed: its words change between versions (regression)", async () => {
    await isolated(async () => {
      const root = apart();
      const c = checkoutOf(root)!;
      // git's words of one version, and no stash left: nothing kept.
      const said = async () => ({ ok: true as const, out: "", err: "Your changes are safe in the stash.\n" });
      expect(stashKept(await withAutostash(c, said))).toBe(false);
      // A stash left, and nothing said (another version's words): kept, and which.
      writeFileSync(join(root, "b.md"), "b, mine\n");
      const quiet = async () => {
        git(root, "stash", "push", "-q", "-m", "autostash");
        return { ok: true as const, out: "", err: "" };
      };
      const r = await withAutostash(c, quiet);
      expect(stashKept(r)).toBe(true);
      expect(r.ok && r.kept).toBe(git(root, "rev-parse", "refs/stash"));
      // One that was there before isn't the run's.
      expect(stashKept(await withAutostash(c, async () => ({ ok: true as const, out: "", err: "" })))).toBe(false);
    });
  });

  test("a merge stopped at its conflict: read, committed with its own message", async () => {
    await isolated(async () => {
      const root = behind();
      const c = checkoutOf(root)!;
      git(root, "switch", "-q", "main");
      git(root, "merge", "-q", "agent");
      expect(operationOf(c)).toMatchObject({ kind: "merge", merging: "agent" });
      writeFileSync(join(root, "a.md"), "one\ntwo\nthree\n");
      git(root, "add", "a.md");
      expect((await continueLater(c, operationOf(c)!)).ok).toBe(true);
      expect(git(root, "log", "-1", "--format=%s")).toBe("Merge branch 'agent'");
    });
  });

  test("a pull where both moved: merged, or rebased; pull.rebase the default", async () => {
    await isolated(async () => {
      const top = realpathSync(mkdtempSync(join(sandbox, "pull-")));
      const root = join(top, "work");
      const bare = join(top, "origin.git");
      const other = join(top, "other");
      mkdirSync(root);
      git(root, "init", "-q", "-b", "main");
      commit(root, "a.md", "a\n");
      Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", bare]);
      git(root, "remote", "add", "origin", bare);
      git(root, "push", "-q", "-u", "origin", "main");
      Bun.spawnSync(["git", "clone", "-q", bare, other]);
      const c = checkoutOf(root)!;
      expect(pullDefault(c, "main")).toBe("merge");
      commit(other, "b.md", "theirs\n");
      git(other, "push", "-q");
      commit(root, "c.md", "mine\n");
      expect((await pullLater(c)).ok).toBe(false);
      const m = await pullLater(c, "merge");
      expect(m.ok).toBe(true);
      expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(2);
      git(root, "config", "pull.rebase", "true");
      expect(pullDefault(c, "main")).toBe("rebase");
      git(root, "config", "branch.main.rebase", "false");
      expect(pullDefault(c, "main")).toBe("merge");
      commit(other, "d.md", "theirs again\n");
      git(other, "push", "-q");
      commit(root, "e.md", "mine again\n");
      expect((await pullLater(c, "rebase")).ok).toBe(true);
      expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(1);
      expect(readFileSync(join(root, "d.md"), "utf8")).toBe("theirs again\n");
    });
  });
});
