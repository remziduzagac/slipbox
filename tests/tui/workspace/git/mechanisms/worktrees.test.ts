// Worktree dialogs remain interactive App clients; their refusal paths do not mutate the repository.
import { expect, test } from "bun:test";
import { BranchWorktrees } from "../../../../../src/tui/workspace/git/views/branches/worktrees.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

const { repo, git, panel, typed } = makeGitPanelFixture();

test("a new branch with an invalid name stops before placement and leaves the branch list unchanged", async () => {
  const root = repo();
  const { app, keys } = await panel(root);
  try {
    const before = git(root, "branch", "--format=%(refname:short)");
    const worktrees = new BranchWorktrees(app, app.gitPanel.branches);
    worktrees.newBranch("main");
    expect(app.overlay?.kind).toBe("prompt");
    await keys(...typed("bad name"), "enter");
    expect(app.messages.at(-1)?.level).toBe("warn");
    expect(app.overlay).toBeNull();
    expect(git(root, "branch", "--format=%(refname:short)")).toBe(before);
  } finally {
    app.dismissToasts();
    app.quit();
  }
});

test("removing the current worktree is refused before opening a confirmation or changing the checkout", async () => {
  const root = repo();
  const { app } = await panel(root);
  try {
    const before = git(root, "worktree", "list", "--porcelain");
    expect(await app.gitPanel.branches.listed()).toBe(true);
    const branch = app.gitPanel.branches.here()!;
    new BranchWorktrees(app, app.gitPanel.branches).remove(branch);
    expect(app.messages.at(-1)).toMatchObject({
      level: "info",
      text: "the worktree you're in can't be removed from here: go into another first",
    });
    expect(app.overlay).toBeNull();
    expect(git(root, "worktree", "list", "--porcelain")).toBe(before);
  } finally {
    app.dismissToasts();
    app.quit();
  }
});
