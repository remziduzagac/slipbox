import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pointedAt } from "../../../../../src/tui/workspace/git/views/panel/gitmouse.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { git, repo, until, panel, rowOf } = makeGitPanelFixture();

describe("the review, the merge screen and the rebase, from the panel (GIT-D3, GIT-D5, GIT-D6)", () => {
  test("Review: a button while a change isn't staged, its key v said under the pointer; clicked, the review", async () => {
    const root = repo();
    const { app, click, keys, frame } = await panel(root);
    // Nothing to review: no button.
    expect(app.gitPanel.buttons().map((b) => b.id)).not.toContain("review");
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    await app.git.refreshNow();
    frame();
    expect(app.gitPanel.buttons().map((b) => b.id)).toContain("review");
    expect(pointedAt(app, "git:btn:review")).toEqual({
      key: "v",
      desc: "Review: the changes not staged, a hunk at a time",
    });
    click("git:btn:review");
    expect(await until(() => app.floating?.kind === "review")).toBe(true);
    await keys("escape");
    // A changed file's footer says v too; v reviews.
    app.region = "sidebar";
    app.sidebar.selected = rowOf(app, (r) => r.kind === "file" && r.entry.path === "a.md");
    expect(app.gitPanel.footer(app.gitPanel.rows()[app.sidebar.selected])).toContainEqual(["v", "review"]);
    await keys("v");
    expect(await until(() => app.floating?.kind === "review")).toBe(true);
  });

  /** `feature` merged into main, both having changed a.md's line and b.md's: two files in conflict. */
  const conflicted = () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\nfeature's\n");
    writeFileSync(join(root, "b.md"), "# B, feature's\n");
    git(root, "commit", "-qam", "feature's");
    git(root, "switch", "-q", "main");
    writeFileSync(join(root, "a.md"), "# A\n\nmain's\n");
    writeFileSync(join(root, "b.md"), "# B, main's\n");
    git(root, "commit", "-qam", "main's");
    git(root, "-c", "merge.conflictStyle=merge", "merge", "-q", "feature");
    return root;
  };

  test("Resolve: a button while a file's in conflict; x on a conflicted file, the merge screen on it", async () => {
    const root = conflicted();
    const { app, click, keys, frame } = await panel(root);
    expect(app.gitPanel.buttons().find((b) => b.id === "resolve")?.label).toBe("Resolve 2");
    expect(pointedAt(app, "git:btn:resolve")?.key).toBe("x");
    click("git:btn:resolve");
    // The note on screen is in conflict: it's the one (read from git's stages, once the click's read is in).
    expect(await until(() => app.floating?.kind === "merge")).toBe(true);
    expect(app.floating!.title).toBe("Merge — a.md");
    await keys("escape");
    // The other selected: x takes it, not this note; its footer says so.
    app.region = "sidebar";
    app.sidebar.selected = rowOf(
      app,
      (r) => r.kind === "file" && r.section === "conflicted" && r.entry.path === "b.md",
    );
    expect(app.gitPanel.footer(app.gitPanel.rows()[app.sidebar.selected])).toContainEqual(["x", "merge screen"]);
    await keys("x");
    expect(app.floating?.title).toBe("Merge — b.md");
    frame();
  });

  test("Resolve's button, the row selected gone since the last frame: the merge screen all the same (#14)", async () => {
    const root = conflicted();
    for (const n of ["n1", "n2"]) writeFileSync(join(root, `${n}.md`), "# N\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n2.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("n2.md"));
    frame();
    // n2 gone, no frame since: the button clicked where the last frame drew it.
    rmSync(join(root, "n2.md"));
    await app.git.refreshNow();
    expect(fileAt("n2.md")).toBe(-1);
    const at = app.geometry!.hot.find((h) => h.id === "git:btn:resolve")!;
    app.mouse.handle({ type: "down", x: at.x, y: at.y, button: 0 });
    app.mouse.handle({ type: "up", x: at.x, y: at.y, button: 0 });
    expect(await until(() => app.floating?.kind === "merge")).toBe(true);
  });

  test("a CRLF checkout's conflict (eol=crlf): its base found in git's index, each side shown against it by its change", async () => {
    const root = repo();
    writeFileSync(join(root, ".gitattributes"), "*.md text eol=crlf\n");
    writeFileSync(join(root, "m.md"), "# M\n\none\n\ntwo\n\nend\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "m");
    git(root, "switch", "-q", "-c", "other");
    writeFileSync(join(root, "m.md"), "# M\n\nONE TWO\n\nend\n");
    git(root, "commit", "-qam", "other's");
    git(root, "switch", "-q", "feature");
    writeFileSync(join(root, "m.md"), "# M\n\nuno\n\ntwo\n\nend\n");
    git(root, "commit", "-qam", "feature's");
    git(root, "-c", "merge.conflictStyle=merge", "merge", "-q", "other");
    const { app, click } = await panel(root, "m.md");
    click("git:btn:resolve");
    expect(await until(() => app.floating?.kind === "merge")).toBe(true);
    const shown = app.floating!.view.buf.source.split("\n");
    expect(shown.filter((l) => /^Base/.test(l))).toEqual(["Base"]);
    // Yours and theirs against the base: what each changed; yours left "two" as it was.
    expect(shown.filter((l) => /^[-+] /.test(l))).toEqual(["- one", "+ uno", "- one", "- two", "+ ONE TWO"]);
  });

  test("shift+r: the branch checked out rebased onto its base, asked first; its row's footer says it", async () => {
    const root = repo();
    git(root, "switch", "-q", "main");
    writeFileSync(join(root, "b.md"), "# B, main's\n");
    git(root, "commit", "-qam", "main's");
    git(root, "switch", "-q", "feature");
    const { app, frame, keys } = await panel(root);
    const here = () => rowOf(app, (r) => r.kind === "branch" && r.branch.here);
    const main = () => rowOf(app, (r) => r.kind === "branch" && r.branch.name === "main");
    expect(await until(() => (frame(), here() >= 0 && main() >= 0))).toBe(true);
    expect(app.gitPanel.footer(app.gitPanel.rows()[here()])).toContainEqual(["shift+r", "rebase…"]);
    // Another branch's row doesn't: it isn't the one rebased.
    expect(app.gitPanel.footer(app.gitPanel.rows()[main()]).map(([k]) => k)).not.toContain("shift+r");
    // Nothing under way: no Continue, Skip or Abort, and the panel's top says no shift+r.
    expect(app.gitPanel.buttons().map((b) => b.id)).not.toContain("abort");
    expect(app.gitPanel.footer(undefined).map(([k]) => k)).not.toContain("shift+r");
    app.sidebar.selected = here();
    await keys("shift+r");
    expect(app.overlay).toMatchObject({
      kind: "prompt",
      label: "Rebase feature onto main? Its 1 commit replayed after main's 1 new.",
    });
    await keys("y");
    expect(await until(() => git(root, "merge-base", "main", "feature") === git(root, "rev-parse", "main"))).toBe(true);
    expect(git(root, "log", "--format=%s", "main..feature")).toBe("c\n");
  });

  test("shift+r rebases onto the branch's own base: dev, the nearest of [git] bases, not main", async () => {
    const root = repo();
    // topic made from dev, which then moved on; main hasn't.
    git(root, "switch", "-q", "-c", "dev", "main");
    writeFileSync(join(root, "d.md"), "# D\n");
    git(root, "add", "d.md");
    git(root, "commit", "-q", "-m", "d");
    git(root, "switch", "-q", "-c", "topic");
    writeFileSync(join(root, "e.md"), "# E\n");
    git(root, "add", "e.md");
    git(root, "commit", "-q", "-m", "e");
    git(root, "switch", "-q", "dev");
    writeFileSync(join(root, "f.md"), "# F\n");
    git(root, "add", "f.md");
    git(root, "commit", "-q", "-m", "f");
    git(root, "switch", "-q", "topic");
    const { app, keys } = await panel(root);
    app.config.git.bases = ["main", "dev"];
    app.git.forgetBase();
    await keys("shift+r");
    expect(app.overlay).toMatchObject({
      kind: "prompt",
      label: "Rebase topic onto dev? Its 1 commit replayed after dev's 1 new.",
    });
  });

  test("Continue, Skip and Abort: buttons while a rebase is under way (Skip a rebase's alone); Abort clicked, given up", async () => {
    const root = repo();
    // feature and main both change a.md's line: feature rebased onto main stops there.
    writeFileSync(join(root, "a.md"), "# A\n\nfeature's\n");
    git(root, "commit", "-qam", "feature's");
    git(root, "switch", "-q", "main");
    writeFileSync(join(root, "a.md"), "# A\n\nmain's\n");
    git(root, "commit", "-qam", "main's");
    git(root, "switch", "-q", "feature");
    const was = git(root, "rev-parse", "HEAD");
    git(root, "-c", "merge.conflictStyle=merge", "rebase", "-q", "main");
    const { app, click, frame, keys } = await panel(root, "b.md");
    const ids = () => app.gitPanel.buttons().map((b) => b.id);
    expect(ids()).toEqual(expect.arrayContaining(["resolve", "continue", "skip", "abort"]));
    expect(pointedAt(app, "git:btn:continue")).toEqual({
      key: null,
      desc: "Continue: commits what's settled, and replays the next",
    });
    expect(pointedAt(app, "git:btn:abort")).toEqual({
      key: null,
      desc: "Abort: the branch back where it was before the rebase",
    });
    // The panel's top says shift+r offers them too.
    expect(app.gitPanel.footer(undefined)).toContainEqual(["shift+r", "continue…"]);
    // Continue, with a file still in conflict: refused, said.
    click("git:btn:continue");
    expect(app.messages.at(-1)?.text).toStartWith("still in conflict: a.md");
    // Abort: asked first, then given up. Waited for until slipbox has said so — git's status read again by then, so
    // the buttons from it (Resolve) and from git's files (Continue, Abort) agree.
    click("git:btn:abort");
    expect(app.overlay).toMatchObject({
      kind: "prompt",
      confirm: true,
      label: expect.stringMatching(/^Abort the rebase\?/),
    });
    await keys("y");
    expect(
      await until(() => (frame(), app.messages.some((m) => /^the rebase aborted: feature as it was/.test(m.text)))),
    ).toBe(true);
    expect(git(root, "rev-parse", "HEAD")).toBe(was);
    expect(ids()).not.toContain("continue");
    expect(ids()).not.toContain("resolve");
    // Again; Skip clicked: the conflicting commit left out, the rest rebased.
    git(root, "-c", "merge.conflictStyle=merge", "rebase", "-q", "main");
    await app.git.refreshNow();
    expect(await until(() => (frame(), ids().includes("skip")))).toBe(true);
    click("git:btn:skip");
    expect(
      await until(
        () => (frame(), app.messages.some((m) => /^rebased: the rebase is done, a commit skipped/.test(m.text))),
      ),
    ).toBe(true);
    expect(git(root, "log", "--format=%s", "main..feature")).toBe("c\n");
  });

  test("a merge under way: Continue and Abort, no Skip; Abort clicked, asked, the merge given up", async () => {
    const root = conflicted();
    const { app, click, frame, keys } = await panel(root, "c.md");
    const ids = () => app.gitPanel.buttons().map((b) => b.id);
    expect(ids()).toEqual(expect.arrayContaining(["resolve", "continue", "abort"]));
    expect(ids()).not.toContain("skip");
    expect(pointedAt(app, "git:btn:continue")?.desc).toBe("Continue: commits the merge");
    click("git:btn:abort");
    expect(app.overlay).toMatchObject({
      kind: "prompt",
      confirm: true,
      label: expect.stringMatching(/^Abort the merge\?/),
    });
    await keys("y");
    expect(await until(() => (frame(), app.messages.some((m) => /^the merge aborted/.test(m.text))))).toBe(true);
    expect(ids()).not.toContain("abort");
    expect(git(root, "status", "--porcelain")).toBe("");
  });
});
