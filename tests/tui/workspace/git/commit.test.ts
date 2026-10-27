import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTrust } from "../../../../src/core/workspace/vaults/trust.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("commit (26.3)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder().decode(
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
    );
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** A repository with a failing pre-commit hook: a commit that runs hooks can't go through. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "commit-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    writeFileSync(join(root, "a.md"), "a\n");
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@example.invalid");
    git(root, "config", "user.name", "t");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    writeFileSync(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho refused by the hook >&2\nexit 1\n");
    chmodSync(join(root, ".git", "hooks", "pre-commit"), 0o755);
    return git(root, "rev-parse", "HEAD") ? root : null;
  };
  const type = (s: string) => [...s].map((ch) => (ch === " " ? "space" : ch));
  const open = async (root: string, trusted = false) => {
    setTrust(root, trusted ? "trusted" : null);
    const h = await harness({ root, open: "a.md", width: 120, height: 40 });
    await h.app.run("git.view");
    await h.app.git.refreshNow();
    return h;
  };

  test("the commit editor opens ready to type; ctrl+s while typing commits (regression)", async () => {
    // Found trying 26.3 live (2026-10-10): it opened in normal mode, so the message's first letter was taken as a
    // command (`A`), and ctrl+s typed in insert mode committed nothing.
    const root = repo();
    if (!root) return;
    const h = await open(root);
    writeFileSync(join(root, "a.md"), "A\n");
    await h.app.git.refreshNow();
    await h.keys("a", "c");
    await h.app.git.refreshNow();
    await h.keys("c");
    expect(h.app.floating?.kind).toBe("commit");
    expect(h.app.floating!.view.insert).toBe(true);
    await h.keys(...type("Add a capital"), "ctrl+s");
    expect(await until(() => h.app.floating === null)).toBe(true);
    expect(git(root, "log", "-1", "--format=%s")).toBe("Add a capital\n");
  });

  test("a commit git refuses is tried again by ctrl+s, the message as it was — no change needed first (regression)", async () => {
    // Found trying 26.3 live (2026-10-10): git refused (no identity); ctrl+s again said "no changes to save".
    const root = repo();
    if (!root) return;
    const h = await open(root);
    writeFileSync(join(root, "a.md"), "A\n");
    await h.app.git.refreshNow();
    await h.keys("a", "c");
    await h.app.git.refreshNow();
    // No identity, and none guessed: git refuses to commit.
    git(root, "config", "--unset", "user.name");
    git(root, "config", "--unset", "user.email");
    git(root, "config", "user.useConfigOnly", "true");
    const was = {
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
      GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
    };
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      await h.keys("c", ...type("Try twice"), "ctrl+s");
      expect(await until(() => h.app.messages.at(-1)?.text.startsWith("git: ") ?? false)).toBe(true);
      expect(h.app.floating?.kind).toBe("commit");
      git(root, "config", "user.name", "t");
      git(root, "config", "user.email", "t@example.invalid");
      await h.keys("escape", "ctrl+s");
      expect(await until(() => h.app.floating === null)).toBe(true);
      expect(git(root, "log", "-1", "--format=%s")).toBe("Try twice\n");
    } finally {
      for (const [k, v] of Object.entries(was)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
  });

  test("what's staged committed with the message written in the floating editor; in a root not trusted, no hook runs", async () => {
    const root = repo();
    if (!root) return;
    const h = await open(root);
    // Nothing staged: said, no editor.
    await h.keys("c");
    expect(h.app.floating).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("nothing staged — s stages a file in the git panel (space g)");
    // The repository's own config signs commits with a program of its choosing: not run in a root not trusted.
    const signer = join(root, ".git", "signer.sh");
    writeFileSync(signer, `#!/bin/sh\ntouch ${JSON.stringify(join(root, ".git", "SIGNER_RAN"))}\nexit 1\n`);
    chmodSync(signer, 0o755);
    git(root, "config", "commit.gpgSign", "true");
    git(root, "config", "gpg.program", signer);
    writeFileSync(join(root, "a.md"), "A\n");
    await h.app.git.refreshNow();
    await h.keys("a", "c");
    await h.app.git.refreshNow();
    await h.keys("c");
    expect(h.app.floating?.kind).toBe("commit");
    expect(h.app.floating!.view.buf.source).toContain("# Committing: 1 file staged (a.md).");
    expect(h.app.floating!.view.buf.source).toContain(
      "# This vault isn't trusted: its hooks don't run, and the commit isn't signed",
    );
    expect(h.app.messages.at(-1)?.text).toBe(
      "this vault isn't trusted: the commit's hooks don't run, and it isn't signed",
    );
    await h.keys(...type("Capitalise a"), "escape", "ctrl+s");
    expect(await until(() => h.app.floating === null)).toBe(true);
    expect(h.app.messages.at(-1)?.text).toMatch(/^committed [0-9a-f]{7,}: Capitalise a$/);
    expect(git(root, "log", "-1", "--format=%s%n%b")).toBe("Capitalise a\n\n");
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(existsSync(join(root, ".git", "SIGNER_RAN"))).toBe(false);
    // The view asked again: nothing left in it.
    expect(await until(() => !h.app.gitPanel.rows().some((r) => r.kind === "file"))).toBe(true);
  });

  test("amended: the last message to start from; an empty message refused; esc leaves it; trusted, a hook refusing it says so", async () => {
    const root = repo();
    if (!root) return;
    const h = await open(root);
    await h.keys("shift+c");
    expect(h.app.floating?.kind).toBe("commit");
    expect(h.app.floating!.view.buf.source.split("\n")[0]).toBe("start");
    // Emptied: refused, the editor kept.
    await h.keys("d", "d", "ctrl+s");
    expect(await until(() => h.app.messages.at(-1)?.text === "git: the message is empty: nothing committed")).toBe(
      true,
    );
    expect(h.app.floating?.kind).toBe("commit");
    await h.keys("shift+o", ...type("Begin"), "escape", "ctrl+s");
    expect(await until(() => h.app.floating === null)).toBe(true);
    expect(h.app.messages.at(-1)?.text).toMatch(/^amended [0-9a-f]{7,}: Begin$/);
    expect(git(root, "rev-list", "--count", "HEAD")).toBe("1\n");
    // Back in source control: left without committing.
    expect(h.app.region).toBe("sidebar");
    await h.keys("shift+c", "q");
    expect(h.app.floating).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("not amended");
    // Trusted: its hook runs, and refuses — said in git's words, the editor kept.
    const t = await open(root, true);
    writeFileSync(join(root, "a.md"), "changed\n");
    git(root, "add", "a.md");
    await t.app.git.refreshNow();
    await t.keys("c");
    expect(t.app.floating!.view.buf.source).not.toContain("isn't trusted");
    await t.keys("x", "escape", "ctrl+s");
    expect(await until(() => t.app.messages.at(-1)?.text === "git: refused by the hook")).toBe(true);
    expect(t.app.floating?.kind).toBe("commit");
    expect(git(root, "rev-list", "--count", "HEAD")).toBe("1\n");
    setTrust(root, null);
  });
});
