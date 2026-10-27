import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { sandbox, git, until, panel, rowOf } = makeGitPanelFixture();

describe("the repositories in the view (VV-D10)", () => {
  test("a busy-named folder is looked into for repositories only when it holds a note at its top (D237)", async () => {
    const top = mkdtempSync(join(sandbox, "busy-repos-"));
    for (const d of ["vendor/lib", "node_modules/dep"]) {
      mkdirSync(join(top, d), { recursive: true });
      git(join(top, d), "init", "-q", "-b", "main");
    }
    writeFileSync(join(top, "vendor", "notes.md"), "# Notes\n");
    const { reposUnder } = await import("../../../../../src/core/workspace/git/gitrepos.ts");
    expect((await reposUnder(top)).map((r) => r.name)).toEqual(["lib"]);
  });

  test("in a vault that isn't a repository, they're the panel: by what needs attention, opened up in place, gone into", async () => {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const name of ["alpha", "beta", "gamma"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "x.md"), "# X\n");
      git(join(root, name), "init", "-q", "-b", "main");
      git(join(root, name), "add", "-A");
      git(join(root, name), "commit", "-q", "-m", "x");
    }
    // gamma changed, beta's worktree too (an agent's work to review); alpha clean.
    writeFileSync(join(root, "gamma", "x.md"), "# X, changed\n");
    git(join(root, "beta"), "worktree", "add", "-q", "-b", "agent", join(root, "beta-agent"), "main");
    writeFileSync(join(root, "beta-agent", "y.md"), "# Y\n");
    const { app, frame, keys } = await panel(root);
    const repos = () =>
      app.gitPanel
        .rows()
        .filter((r) => r.kind === "repo")
        .map((r) => (r.kind === "repo" ? r.repo.name : ""));
    expect(await until(() => (frame(), repos().length === 3))).toBe(true);
    expect(app.gitPanel.rows()[0]).toMatchObject({
      kind: "note",
      text: expect.stringMatching(/holds 3 repositories$/),
    });
    expect(await until(() => (frame(), repos().join() === "beta,gamma,alpha"))).toBe(true);
    // Opened up: its checkouts, the worktree by its branch, and their files.
    app.sidebar.selected = rowOf(app, (r) => r.kind === "repo" && r.repo.name === "beta");
    await keys("enter");
    expect(await until(() => (frame(), app.gitPanel.rows().some((r) => r.kind === "rfile")))).toBe(true);
    expect(frame()).toContain("? y.md");
    // o goes into one.
    app.sidebar.selected = rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha");
    await keys("o");
    expect(app.loc.root).toBe(join(root, "alpha"));
  });
});
