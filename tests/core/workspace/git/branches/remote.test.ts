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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTrustedRoots } from "../../../../../src/core/workspace/vaults/trust.ts";

import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("the remote's commands and stash (26.6)", () => {
  /** git as the tests set repositories up: nobody's config but theirs (`isolated`). */
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder()
      .decode(
        Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
      )
      .trim();
  /** The environment these run in: no config of the developer's (their ssh command, credential helpers), no asker. */
  const isolated = async (run: () => Promise<void>) => {
    const keys = [
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
      "GIT_SSH_COMMAND",
      "GIT_SSH",
      "GIT_ASKPASS",
      "SSH_ASKPASS",
      "GIT_TERMINAL_PROMPT",
      "PATH",
    ];
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    for (const k of ["GIT_SSH_COMMAND", "GIT_SSH", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_TERMINAL_PROMPT"])
      delete process.env[k];
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(was)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      setTrustedRoots([]);
    }
  };
  /** A repository with a commit, its origin a bare repository beside it, main tracking origin/main. */
  const withRemote = () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-remote-")));
    const root = join(top, "work");
    const bare = join(top, "origin.git");
    mkdirSync(root);
    git(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "a.md"), "a\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", bare]);
    git(root, "remote", "add", "origin", bare);
    git(root, "push", "-q", "-u", "origin", "main");
    return { top, root, bare };
  };
  const commit = (root: string, file: string, text: string) => {
    writeFileSync(join(root, file), text);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", `${file}: ${text.trim()}`);
  };

  test("the branch against its upstream, from git status --branch's first line", async () => {
    const { parseTrack, trackText } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
    expect(parseTrack("## main...origin/main [ahead 2, behind 1]\0M  a.md\0")).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      gone: false,
    });
    expect(parseTrack("## feat/x...upstream/feat/x [behind 3]")).toMatchObject({
      branch: "feat/x",
      upstream: "upstream/feat/x",
      ahead: 0,
      behind: 3,
    });
    expect(parseTrack("## main")).toEqual({ branch: "main", upstream: null, ahead: 0, behind: 0, gone: false });
    expect(parseTrack("## main...origin/main [gone]")).toMatchObject({ upstream: "origin/main", gone: true });
    expect(parseTrack("## No commits yet on main")).toMatchObject({ branch: "main", upstream: null });
    expect(parseTrack("## HEAD (no branch)")).toMatchObject({ branch: null, upstream: null });
    expect(parseTrack("M  a.md\0")).toBeNull();
    // The status line's: only what isn't zero; nothing in step, without an upstream, or with it gone.
    const t = (s: string) => trackText(parseTrack(s));
    expect(t("## main...origin/main [ahead 2, behind 1]")).toBe("↑2 ↓1");
    expect(t("## main...origin/main [behind 1]")).toBe("↓1");
    expect(t("## main...origin/main [ahead 3]")).toBe("↑3");
    expect(t("## main...origin/main")).toBe("");
    expect(t("## main")).toBe("");
    expect(t("## main...origin/main [gone]")).toBe("");
    expect(trackText(parseTrack("## main...origin/main [ahead 2, behind 1]"), "+", "-")).toBe("+2 -1");
    // The source control view's entries never take the branch's line for a file.
    const { parseEntries } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    expect(parseEntries("## main...origin/main [ahead 1]\0M  a.md\0")).toEqual([{ path: "a.md", x: "M", y: " " }]);
  });

  test("the upstream asked for: origin/<branch>, else the one remote; none with no remote, or several", async () => {
    const { upstreamFor } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
    expect(upstreamFor("main", ["upstream", "origin"])).toEqual({ remote: "origin", branch: "main" });
    expect(upstreamFor("feat/x", ["fork"])).toEqual({ remote: "fork", branch: "feat/x" });
    expect(upstreamFor("main", [])).toBeNull();
    expect(upstreamFor("main", ["a", "b"])).toBeNull();
  });

  test("git without a terminal: no prompt, ssh in batch mode unless you set your own ssh command", async () => {
    const { remoteEnv } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
    expect(remoteEnv({ PATH: "/bin" }, false)).toEqual({
      PATH: "/bin",
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
    });
    expect(remoteEnv({ GIT_SSH_COMMAND: "ssh -i k" }, false).GIT_SSH_COMMAND).toBe("ssh -i k");
    expect(remoteEnv({ GIT_SSH: "/usr/bin/myssh" }, false).GIT_SSH_COMMAND).toBeUndefined();
    expect(remoteEnv({}, true)).toEqual({ GIT_TERMINAL_PROMPT: "0" });
  });

  test("a failure in git's words: a remote's refusal, a fatal or error line with its files, a conflict; hints left out", async () => {
    const { gitReason, needsLogin, parseScoped, ownPrograms } = await import(
      "../../../../../src/core/workspace/git/branches/gitremote.ts"
    );
    expect(
      gitReason(
        "hint: Diverging branches can't be fast-forwarded, you need to either:\nhint:\nfatal: Not possible to fast-forward, aborting.\n",
      ),
    ).toBe("Not possible to fast-forward, aborting.");
    expect(
      gitReason(
        "To /r.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to '/r.git'\nhint: Updates were rejected\n",
      ),
    ).toBe("[rejected] main -> main (fetch first)");
    expect(
      gitReason(
        "error: Your local changes to the following files would be overwritten by merge:\n\tf.txt\n\tg.txt\nPlease commit your changes\n",
      ),
    ).toBe("Your local changes to the following files would be overwritten by merge: f.txt, g.txt");
    expect(
      gitReason(
        "",
        "Auto-merging f.txt\nCONFLICT (content): Merge conflict in f.txt\nThe stash entry is kept in case\n",
      ),
    ).toBe("CONFLICT (content): Merge conflict in f.txt — the stash is kept");
    expect(gitReason("hint: one\nsomething else\n")).toBe("something else");
    expect(gitReason("")).toBe("git failed");
    expect(needsLogin("could not read Username for 'https://h': terminal prompts disabled")).toBe(true);
    expect(needsLogin("git@h: Permission denied (publickey).")).toBe(true);
    expect(needsLogin("Not possible to fast-forward, aborting.")).toBe(false);
    // Whose config names the remote's programs: the repository's own (local, worktree), or yours.
    const scoped = parseScoped(
      "global\tcore.sshcommand ssh -i k\nlocal\tcredential.helper !evil\nworktree\tcore.askpass x\n",
    );
    expect(scoped[0]).toEqual({ scope: "global", key: "core.sshcommand", value: "ssh -i k" });
    expect(ownPrograms(scoped)).toEqual(["credential.helper", "core.askpass"]);
  });

  test("fetch, a fast-forward pull, a push; a pull where both sides moved refused in git's words", async () => {
    await isolated(async () => {
      const { root, bare, top } = withRemote();
      const { fetchLater, pullLater, pushLater, upstreamOf, remotesOf, headShort } = await import(
        "../../../../../src/core/workspace/git/branches/gitremote.ts"
      );
      const { statusLater } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
      const c = { root };
      expect(remotesOf(c)).toEqual(["origin"]);
      expect(upstreamOf(c, "main")).toEqual({ remote: "origin", ref: "refs/heads/main" });
      // Someone else pushes: fetched, the branch is one behind; pulled, fast-forward.
      const other = join(top, "other");
      Bun.spawnSync(["git", "clone", "-q", bare, other]);
      commit(other, "b.md", "theirs");
      git(other, "push", "-q");
      expect((await fetchLater(c)).ok).toBe(true);
      expect((await statusLater(c))!.track).toMatchObject({ ahead: 0, behind: 1 });
      expect((await pullLater(c)).ok).toBe(true);
      expect(readFileSync(join(root, "b.md"), "utf8")).toBe("theirs");
      expect((await statusLater(c))!.track).toMatchObject({ ahead: 0, behind: 0 });
      // A commit here: one ahead; pushed, in step.
      commit(root, "a.md", "mine");
      expect((await statusLater(c))!.track).toMatchObject({ ahead: 1, behind: 0 });
      expect((await pushLater(c, "main", { remote: "origin", ref: "refs/heads/main" })).ok).toBe(true);
      expect(git(bare, "rev-parse", "main")).toBe(git(root, "rev-parse", "HEAD"));
      expect((await statusLater(c))!.track).toMatchObject({ ahead: 0, behind: 0 });
      // Both sides moved: the pull refused, HEAD where it was; the push refused too.
      git(other, "pull", "-q", "--ff-only");
      commit(other, "b.md", "theirs again");
      git(other, "push", "-q");
      commit(root, "a.md", "mine again");
      const before = headShort(c);
      const pull = await pullLater(c);
      expect(pull).toMatchObject({ ok: false, why: "Not possible to fast-forward, aborting.", login: false });
      expect(headShort(c)).toBe(before);
      expect((await statusLater(c))!.track).toMatchObject({ ahead: 1, behind: 1 });
      const push = await pushLater(c, "main", { remote: "origin", ref: "refs/heads/main" });
      expect(push).toMatchObject({ ok: false, why: "[rejected] main -> main (non-fast-forward)" });
    });
  });

  test("a branch with no upstream pushed, tracked there from then on", async () => {
    await isolated(async () => {
      const { root, bare } = withRemote();
      const { pushLater, upstreamOf } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      git(root, "switch", "-q", "-c", "topic");
      commit(root, "t.md", "topic");
      expect(upstreamOf({ root }, "topic")).toBeNull();
      const r = await pushLater({ root }, "topic", { remote: "origin", ref: "refs/heads/topic" }, true);
      expect(r.ok).toBe(true);
      expect(upstreamOf({ root }, "topic")).toEqual({ remote: "origin", ref: "refs/heads/topic" });
      expect(git(bare, "rev-parse", "topic")).toBe(git(root, "rev-parse", "HEAD"));
    });
  });

  test("a remote's name that starts with - isn't passed to git: the push refused, said why (regression)", async () => {
    await isolated(async () => {
      const { root, bare } = withRemote();
      const { pushLater, upstreamOf } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      // The repository's own config names the branch's remote so.
      git(root, "config", "remote.--dry-run.url", bare);
      git(root, "config", "remote.--dry-run.fetch", "+refs/heads/*:refs/remotes/--dry-run/*");
      git(root, "config", "branch.main.remote", "--dry-run");
      commit(root, "a.md", "mine");
      const up = upstreamOf({ root }, "main");
      expect(up).toEqual({ remote: "--dry-run", ref: "refs/heads/main" });
      const before = git(bare, "rev-parse", "main");
      expect(await pushLater({ root }, "main", up!)).toEqual({
        ok: false,
        why: 'the remote\'s name "--dry-run" starts with "-": slipbox doesn\'t pass it to git',
        login: false,
      });
      expect(git(bare, "rev-parse", "main")).toBe(before);
      // An upstream's branch so named, likewise.
      expect(await pushLater({ root }, "main", { remote: "origin", ref: "-x" })).toMatchObject({ ok: false });
    });
  });

  test("a push runs the repository's pre-push hook only where the vault is trusted (regression)", async () => {
    // A hook is the folder's own code (D172, D175): a push in a vault not trusted runs none, as a commit runs none.
    await isolated(async () => {
      const { root } = withRemote();
      const { pushLater } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      const mark = join(root, "..", "pre-push-ran");
      const hook = join(root, ".git", "hooks", "pre-push");
      writeFileSync(hook, `#!/bin/sh\ntouch '${mark}'\n`);
      chmodSync(hook, 0o755);
      commit(root, "a.md", "one");
      expect((await pushLater({ root }, "main", { remote: "origin", ref: "refs/heads/main" })).ok).toBe(true);
      expect(existsSync(mark)).toBe(false);
      setTrustedRoots([root]);
      commit(root, "a.md", "two");
      expect((await pushLater({ root }, "main", { remote: "origin", ref: "refs/heads/main" })).ok).toBe(true);
      expect(existsSync(mark)).toBe(true);
    });
  });

  test("a program the repository's own config names for the remote: refused where the vault isn't trusted", async () => {
    await isolated(async () => {
      const { root, top } = withRemote();
      const { fetchLater } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      const mark = join(top, "ssh-ran");
      git(root, "remote", "set-url", "origin", "ssh://git@example.invalid/x.git");
      git(root, "config", "core.sshCommand", `sh -c 'touch "${mark}"; exit 1' --`);
      const r = await fetchLater({ root });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.why).toMatch(/isn't trusted, and its repository's own config names .*core\.sshcommand/);
      expect(existsSync(mark)).toBe(false);
      // Trusted: git as the repository has it.
      setTrustedRoots([root]);
      expect((await fetchLater({ root })).ok).toBe(false);
      expect(existsSync(mark)).toBe(true);
    });
  });

  test("ssh in batch mode — nothing waits for a passphrase — unless you set your own ssh command", async () => {
    await isolated(async () => {
      const { root, top } = withRemote();
      const { fetchLater } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      // An ssh of the test's own, first on the PATH: what it was asked, and a login refused.
      const bin = join(top, "bin");
      const said = join(top, "ssh-args");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "ssh"),
        `#!/bin/sh\necho "$@" >> '${said}'\necho 'git@example.invalid: Permission denied (publickey).' >&2\nexit 255\n`,
      );
      chmodSync(join(bin, "ssh"), 0o755);
      process.env.PATH = `${bin}:${process.env.PATH}`;
      git(root, "remote", "set-url", "origin", "ssh://git@example.invalid/x.git");
      const r = await fetchLater({ root });
      expect(r).toMatchObject({ ok: false, login: true });
      expect(readFileSync(said, "utf8")).toContain("BatchMode=yes");
      // Your own: GIT_SSH_COMMAND, or core.sshCommand (in a vault you trust, the repository's own may set it).
      rmSync(said);
      process.env.GIT_SSH_COMMAND = "ssh -o Mine=yes";
      await fetchLater({ root });
      expect(readFileSync(said, "utf8")).toMatch(/Mine=yes/);
      expect(readFileSync(said, "utf8")).not.toContain("BatchMode");
      delete process.env.GIT_SSH_COMMAND;
      rmSync(said);
      setTrustedRoots([root]);
      git(root, "config", "core.sshCommand", "ssh -o Ours=yes");
      await fetchLater({ root });
      expect(readFileSync(said, "utf8")).toMatch(/Ours=yes/);
      expect(readFileSync(said, "utf8")).not.toContain("BatchMode");
    });
  });

  test("a remote that asks for a password fails at once, in git's words, rather than wait for one", async () => {
    await isolated(async () => {
      const { root } = withRemote();
      const { fetchLater } = await import("../../../../../src/core/workspace/git/branches/gitremote.ts");
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response("log in", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="r"' } }),
      });
      try {
        git(root, "remote", "set-url", "origin", `http://127.0.0.1:${server.port}/x.git`);
        const t = Date.now();
        const r = await fetchLater({ root });
        expect(r).toMatchObject({ ok: false, login: true });
        // git's own prompt never asked: it says so (where there's a terminal, git would wait at its question).
        expect(!r.ok && r.why).toMatch(/could not read Username for '[^']+': terminal prompts disabled/);
        expect(Date.now() - t).toBeLessThan(15_000);
      } finally {
        server.stop(true);
      }
    });
  });

  test("stash: saved with a message, listed, popped; nothing to save said; a stash that moved refused", async () => {
    await isolated(async () => {
      const { root } = withRemote();
      const { stashesOf, stashSaveLater, stashLater } = await import(
        "../../../../../src/core/workspace/git/branches/gitremote.ts"
      );
      const c = { root };
      expect(stashesOf(c)).toEqual([]);
      const none = await stashSaveLater(c, "nothing", false);
      expect(none.ok && none.out).toMatch(/No local changes to save/);
      writeFileSync(join(root, "a.md"), "wip\n");
      writeFileSync(join(root, "n.md"), "new\n");
      expect((await stashSaveLater(c, "wip: retry", false)).ok).toBe(true);
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\n");
      expect(existsSync(join(root, "n.md"))).toBe(true); // untracked: stays
      const [s] = stashesOf(c)!;
      expect(s).toMatchObject({ ref: "stash@{0}", message: "On main: wip: retry" });
      expect(s!.hash).toMatch(/^[0-9a-f]{40}$/);
      // Untracked files too, when asked.
      expect((await stashSaveLater(c, "", true)).ok).toBe(true);
      expect(existsSync(join(root, "n.md"))).toBe(false);
      const list = stashesOf(c)!;
      expect(list.map((x) => x.ref)).toEqual(["stash@{0}", "stash@{1}"]);
      expect(list[0]!.message).toMatch(/^WIP on main: /);
      // The first saved is stash@{1} now: listed before, it's refused by its old name.
      expect(await stashLater(c, "pop", s!)).toMatchObject({
        ok: false,
        why: expect.stringMatching(/stashes changed/),
      });
      expect((await stashLater(c, "pop", list[1]!)).ok).toBe(true);
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("wip\n");
      expect((await stashLater(c, "apply", stashesOf(c)![0]!)).ok).toBe(true);
      expect(existsSync(join(root, "n.md"))).toBe(true);
      expect(stashesOf(c)!.length).toBe(1);
      expect((await stashLater(c, "drop", stashesOf(c)![0]!)).ok).toBe(true);
      expect(stashesOf(c)).toEqual([]);
    });
  });
});
