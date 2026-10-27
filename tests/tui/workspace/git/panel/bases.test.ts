import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { sandbox, git, repo, until, panel, typed } = makeGitPanelFixture();

describe("a base from a remote, a tag or a commit (D255)", () => {
  test("Compare against… lists the remote-tracking branches and takes a typed ref; a remote base says when it was fetched", async () => {
    const root = repo();
    // An origin with main and dev, fetched: origin/dev, origin/main, origin/feature here.
    const bare = join(sandbox, `origin-${Date.now()}.git`);
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
    git(root, "remote", "add", "origin", bare);
    git(root, "push", "-q", "origin", "main", "feature", "main:dev");
    git(root, "fetch", "-q", "origin");
    const { app, frame, keys } = await panel(root);
    const branch = () => {
      const r = app.gitPanel.rows().find((x) => x.kind === "branch" && x.branch.name === "feature");
      return r?.kind === "branch" ? r.branch : null;
    };
    expect(await until(() => (frame(), !!branch()))).toBe(true);
    const listed = () => app.overlay as ListOverlay | null;
    app.gitPanel.branches.button(branch()!, "compare");
    expect(await until(() => listed()?.title === "Compare feature against…")).toBe(true);
    expect(listed()!.items.map((i) => [i.label, i.detail])).toEqual([
      ["main", ""],
      ["origin/dev", "remote"],
      ["origin/feature", "remote"],
      ["origin/main", "remote"],
      ["A branch, tag or commit…", "typed: v2.3, a commit, HEAD~3"],
    ]);
    await keys(...typed("origin/dev"), "enter");
    const said = (text: string) => until(() => app.messages.at(-1)?.text === text);
    expect(await said("feature is compared against origin/dev now")).toBe(true);
    // The heading: against the remote branch, as of the fetch.
    await app.git.refreshNow();
    const heading = () =>
      app.gitPanel.rows().find((r) => r.kind === "heading" && r.section === "ahead") as { label: string } | undefined;
    expect(
      await until(() => (frame(), /^This branch against origin\/dev \(1\) · updated /.test(heading()?.label ?? ""))),
    ).toBe(true);
    expect(heading()!.label).toEndWith(" · updated just now");
    // A commit typed (HEAD~1): kept as the commit it names.
    app.gitPanel.branches.button(branch()!, "compare");
    expect(await until(() => listed()?.title === "Compare feature against…")).toBe(true);
    expect(listed()!.items[0]!.label).toBe("The base guessed from [git] bases");
    await keys(...typed("tag or commit"), "enter");
    expect(await until(() => app.overlay?.kind === "prompt")).toBe(true);
    await keys(...typed("HEAD~1"), "enter");
    const parent = git(root, "rev-parse", "HEAD~1").trim();
    expect(await said(`feature is compared against ${parent} (HEAD~1) now`)).toBe(true);
    // A local base says nothing of fetching.
    await app.git.refreshNow();
    expect(await until(() => (frame(), (heading()?.label ?? "").startsWith(`This branch against ${parent} (1)`)))).toBe(
      true,
    );
    expect(heading()!.label).not.toContain(" · ");
    // One that names nothing: said, nothing kept.
    app.gitPanel.branches.button(branch()!, "compare");
    expect(await until(() => listed()?.title === "Compare feature against…")).toBe(true);
    await keys(...typed("tag or commit"), "enter");
    await keys(...typed("no-such"), "enter");
    expect(await said('no branch or commit "no-such" in the repository')).toBe(true);
  });
});
