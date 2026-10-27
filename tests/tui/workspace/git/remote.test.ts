import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, whereNow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the remote's commands and stash (26.6)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder()
      .decode(
        Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
      )
      .trim();
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** Nobody's git config but the test's, while it runs. */
  const isolated = async (run: () => Promise<void>) => {
    const was = [process.env.GIT_CONFIG_GLOBAL, process.env.GIT_CONFIG_NOSYSTEM];
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      await run();
    } finally {
      for (const [k, v] of [
        ["GIT_CONFIG_GLOBAL", was[0]],
        ["GIT_CONFIG_NOSYSTEM", was[1]],
      ] as const)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };
  /** A vault in a repository whose origin is a bare repository beside it, main tracking origin/main; and a clone. */
  const withRemote = () => {
    const top = mkdtempSync(join(sandbox, "remote-"));
    const root = join(top, "work");
    const bare = join(top, "origin.git");
    const other = join(top, "other");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    writeFileSync(join(root, "a.md"), "a\n");
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", bare]);
    git(root, "remote", "add", "origin", bare);
    git(root, "push", "-q", "-u", "origin", "main");
    Bun.spawnSync(["git", "clone", "-q", bare, other]);
    return { root, bare, other };
  };
  const commit = (root: string, file: string, text: string) => {
    writeFileSync(join(root, file), text);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", `${file}: ${text.trim()}`);
  };
  const said = (h: Harness, text: string | RegExp) =>
    until(() => h.app.messages.some((m) => (typeof text === "string" ? m.text === text : text.test(m.text))));
  const list = (h: Harness) => h.app.overlay as ListOverlay;
  const type = (s: string) => [...s].map((ch) => (ch === " " ? "space" : ch));

  test("fetch, the branch's ↓; a pull, unsaved notes saved or kept first, then fast-forwarded", async () => {
    await isolated(async () => {
      const { root, other } = withRemote();
      commit(other, "b.md", "theirs\n");
      git(other, "push", "-q");
      const h = await harness({ root, open: "a.md", width: 120, height: 40 });
      await h.app.git.refreshNow();
      expect(whereNow(h)).toEndWith(" │ main");
      await h.app.run("git.fetch");
      expect(h.app.messages.some((m) => m.text === "fetching…")).toBe(true);
      expect(await said(h, "fetched: main is 1 commit behind origin/main — p pulls (:pull)")).toBe(true);
      expect(await until(() => whereNow(h).endsWith(" │ main ↓1"))).toBe(true);
      // Unsaved: asked first, as a branch switch asks; cancelled, nothing pulled.
      const a = h.app.view!.buf;
      a.edit(0, 0, "edited ");
      await h.app.run("git.pull");
      expect(list(h).title).toBe("Unsaved: a.md");
      expect(list(h).items.map((i) => i.label)).toEqual([
        "Save them, then pull",
        "Pull, keeping them unsaved",
        "Cancel",
      ]);
      await h.keys("down", "down", "enter");
      expect(existsSync(join(root, "b.md"))).toBe(false);
      // Saved, then pulled: fast-forward, the note's change kept in the file.
      await h.app.run("git.pull");
      await h.keys("enter");
      expect(await said(h, /^pulled: main fast-forwarded to [0-9a-f]+$/)).toBe(true);
      expect(readFileSync(join(root, "b.md"), "utf8")).toBe("theirs\n");
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("edited a\n");
      expect(await until(() => whereNow(h).endsWith(" │ main"))).toBe(true);
      // Nothing more: said so.
      await h.app.run("git.pull");
      expect(await said(h, "main is up to date with origin/main")).toBe(true);
    });
  });

  test("a pull where both sides moved: not refused, but asked how to bring them together (GIT-D6)", async () => {
    await isolated(async () => {
      const { root, other } = withRemote();
      commit(other, "b.md", "theirs\n");
      git(other, "push", "-q");
      commit(root, "c.md", "mine\n");
      const h = await harness({ root, open: "a.md", width: 120, height: 40 });
      const head = git(root, "rev-parse", "HEAD");
      await h.app.run("git.fetch");
      expect(await until(() => whereNow(h).endsWith(" │ main ↑1 ↓1"))).toBe(true);
      await h.app.run("git.pull");
      expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
      expect(list(h).items.map((i) => i.label)).toEqual([
        "(m) Merge origin/main into main",
        "(r) Rebase main onto origin/main",
        "(n) Nothing",
      ]);
      await h.keys("escape");
      expect(git(root, "rev-parse", "HEAD")).toBe(head);
    });
  });

  test("a push to the upstream; a branch with none asked to track origin/<branch> — no pushes nothing", async () => {
    await isolated(async () => {
      const { root, bare } = withRemote();
      commit(root, "a.md", "mine\n");
      const h = await harness({ root, open: "a.md", width: 120, height: 40 });
      await h.app.git.refreshNow();
      expect(whereNow(h)).toEndWith(" │ main ↑1");
      await h.app.run("git.push");
      expect(await said(h, "pushed main to origin/main — this vault isn't trusted, so no hook ran")).toBe(true);
      expect(git(bare, "rev-parse", "main")).toBe(git(root, "rev-parse", "HEAD"));
      expect(await until(() => whereNow(h).endsWith(" │ main"))).toBe(true);
      // A new branch: asked; no, nothing; yes, pushed and tracked.
      git(root, "switch", "-q", "-c", "topic");
      await h.app.run("git.push");
      expect(h.app.overlay).toMatchObject({
        kind: "prompt",
        label: "topic has no upstream. Push it to origin/topic, and track it there?",
      });
      await h.keys("n");
      expect(git(bare, "branch", "--list", "topic")).toBe("");
      await h.app.run("git.push");
      await h.keys("y");
      expect(await said(h, /^pushed topic to origin\/topic, its upstream now/)).toBe(true);
      expect(git(root, "rev-parse", "--abbrev-ref", "topic@{upstream}")).toBe("origin/topic");
      // Again: nothing to push, said so.
      await h.app.run("git.push");
      expect(await said(h, /^origin\/topic is up to date: nothing to push/)).toBe(true);
    });
  });

  test("source control's keys: f fetches, p pulls, shift+p pushes, z lists the stashes", async () => {
    await isolated(async () => {
      const { root, other, bare } = withRemote();
      commit(other, "b.md", "theirs\n");
      git(other, "push", "-q");
      const h = await harness({ root, open: "a.md", width: 120, height: 40 });
      await h.app.run("git.view");
      await h.app.git.refreshNow();
      expect(h.app.leftView).toBe("git");
      await h.keys("f");
      expect(await said(h, /^fetched: main is 1 commit behind/)).toBe(true);
      await h.keys("p");
      expect(await said(h, /^pulled: main fast-forwarded/)).toBe(true);
      commit(root, "a.md", "mine\n");
      await h.keys("shift+p");
      expect(await said(h, /^pushed main to origin\/main/)).toBe(true);
      expect(git(bare, "rev-parse", "main")).toBe(git(root, "rev-parse", "HEAD"));
      await h.keys("z");
      expect(list(h).title).toBe("Stashes (0) — enter: pop, apply or drop one");
    });
  });

  test("stash: the changes saved with a message, listed, popped; dropping one asks first", async () => {
    await isolated(async () => {
      const { root } = withRemote();
      const h = await harness({ root, open: "a.md", width: 120, height: 40 });
      writeFileSync(join(root, "a.md"), "wip\n");
      await h.app.run("git.stash");
      expect(list(h).items.map((i) => i.label)).toEqual([
        "Stash the changes…",
        "Stash the changes, untracked files too…",
      ]);
      await h.keys("enter", ...type("wip: retry"), "enter");
      expect(await said(h, "stashed: wip: retry")).toBe(true);
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\n");
      // Listed after the ways to save; enter on it: pop, apply, drop.
      await h.app.run("git.stash");
      expect(list(h).items.map((i) => i.label)).toContain("stash@{0}  On main: wip: retry");
      await h.keys("down", "down", "enter");
      expect(list(h).items.map((i) => i.label)).toEqual(["Pop it", "Apply it", "Drop it…"]);
      await h.keys("enter");
      expect(await said(h, "popped stash@{0} (On main: wip: retry)")).toBe(true);
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("wip\n");
      expect(git(root, "stash", "list")).toBe("");
      // Dropped only once asked: no keeps it, yes drops it.
      git(root, "stash", "push", "-q", "-m", "keep me");
      await h.app.run("git.stash");
      await h.keys("down", "down", "enter", "down", "down", "enter");
      expect(h.app.overlay).toMatchObject({
        kind: "prompt",
        label: "Drop stash@{0} (On main: keep me)? Its changes are gone with it.",
      });
      await h.keys("n");
      expect(git(root, "stash", "list")).toContain("keep me");
      await h.app.run("git.stash");
      await h.keys("down", "down", "enter", "down", "down", "enter", "y");
      expect(await said(h, "dropped stash@{0} (On main: keep me)")).toBe(true);
      expect(git(root, "stash", "list")).toBe("");
    });
  });
});
