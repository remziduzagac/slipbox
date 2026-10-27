import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { git, repo, until, panel, typed } = makeGitPanelFixture();

describe("the panel's state, by vault and in flight (GIT-D8)", () => {
  test("the commit box, git's files and those opened up are the vault's: switching vaults empties them", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    const other = repo();
    const { app, keys } = await panel(root);
    await keys("i", ...typed("half a message"));
    expect(app.git.entries?.length).toBe(1);
    app.git.opened.add("unstaged:a.md");
    app.vaults.switchVault(locateVault({ root: other }), null);
    expect([app.gitPanel.message, app.gitPanel.typing, app.git.entries, app.git.track]).toEqual([
      "",
      false,
      null,
      null,
    ]);
    expect(app.git.opened.size).toBe(0);
  });

  test("ctrl+enter twice before git answers commits once, and says the second waits", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    git(root, "add", "a.md");
    const { app, keys } = await panel(root);
    const before = Number(git(root, "rev-list", "--count", "HEAD"));
    await keys("i", ...typed("Once"), "ctrl+enter", "i", "ctrl+enter");
    expect(app.messages.some((m) => m.text === "committing already — git hasn't answered yet")).toBe(true);
    expect(await until(() => app.messages.some((m) => m.text.startsWith("committed ")))).toBe(true);
    await Bun.sleep(300);
    expect(Number(git(root, "rev-list", "--count", "HEAD"))).toBe(before + 1);
    expect(app.messages.some((m) => m.level === "warn")).toBe(false);
    // Answered: the box commits again.
    expect(app.gitPanel.committing).toBe(false);
  });

  test("the base a frame draws is asked of git once each time git has news, not on every frame", async () => {
    const root = repo();
    git(root, "switch", "-q", "main");
    const { app } = await panel(root);
    const c = app.git.checkout!;
    expect(app.git.fallbackBase(c)).toBe("main");
    // Gone from git, not yet news: the answer kept.
    git(root, "branch", "-m", "main", "trunk");
    expect(app.git.fallbackBase(c)).toBe("main");
    // git's news: asked again.
    await app.git.refreshNow();
    expect(app.git.fallbackBase(c)).toBeNull();
  });
});
