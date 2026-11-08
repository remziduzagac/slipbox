import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App, ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// A branch's commits (EG-D4): the panel's "This branch's commits", a branch's in Branches, and `:log` — each commit
// opened into its files, each file's change in the diff window, esc back where it was asked from.
const { git, repo, until, panel, typed, rowOf } = makeGitPanelFixture();

/** The fixture's `feature` with three commits since main: c.md made, a.md changed, b.md renamed. */
function three(): string {
  const root = repo();
  writeFileSync(join(root, "a.md"), "# A\n\nONE\n");
  git(root, "commit", "-qam", "Shout a");
  git(root, "mv", "b.md", "e.md");
  git(root, "commit", "-qm", "Rename b");
  return root;
}

const subjects = (app: App, branch: string | null) =>
  app.gitPanel
    .rows()
    .flatMap((r) => (r.kind === "commit" && (r.branch?.name ?? null) === branch ? [r.commit.subject] : []));
const commitRow = (app: App, subject: string, branch: string | null) =>
  rowOf(app, (r) => r.kind === "commit" && r.commit.subject === subject && (r.branch?.name ?? null) === branch);
const files = (app: App, branch: string | null) =>
  app.gitPanel
    .rows()
    .flatMap((r) =>
      r.kind === "cfile" && (r.branch?.name ?? null) === branch ? [`${r.file.state} ${r.file.path}`] : [],
    );

describe("this branch's commits, in the git panel", () => {
  test("since its base, newest first; one opened into its files; a file's change in the diff window, esc back", async () => {
    const root = three();
    const short = git(root, "rev-parse", "--short=7", "HEAD~1").trim();
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), subjects(app, null).length === 3))).toBe(true);
    expect(subjects(app, null)).toEqual(["Rename b", "Shout a", "c"]);
    const heading = app.gitPanel.rows().find((r) => r.kind === "heading" && r.section === "commits");
    expect(heading).toMatchObject({ label: "This branch's commits (3)" });
    expect(frame()).toContain(`${short} Shout a`);
    app.sidebar.selected = commitRow(app, "Shout a", null);
    await keys("enter");
    expect(await until(() => (frame(), files(app, null).length === 1))).toBe(true);
    expect(files(app, null)).toEqual(["modified a.md"]);
    app.sidebar.selected = rowOf(app, (r) => r.kind === "cfile");
    await keys("enter");
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe(`${short} Shout a: a.md — esc: source control`);
    expect((app.floating as unknown as { diff: { before: string; now: string } }).diff).toMatchObject({
      before: "# A\n\none\n",
      now: "# A\n\nONE\n",
    });
    await keys("escape");
    expect([app.floating, app.leftView, app.region]).toEqual([null, "git", "sidebar"]);
    // A rename's files: the new name, where it came from.
    app.sidebar.selected = commitRow(app, "Rename b", null);
    await keys("l");
    expect(await until(() => (frame(), files(app, null).includes("renamed e.md")))).toBe(true);
    // h on a file folds its commit, selected.
    app.sidebar.selected = rowOf(app, (r) => r.kind === "cfile" && r.file.path === "e.md");
    await keys("h");
    expect(files(app, null)).toEqual(["modified a.md"]);
    expect(app.sidebar.selected).toBe(commitRow(app, "Rename b", null));
    // The filter keeps commits by their subject.
    await keys("/", ...typed("shout"));
    expect(subjects(app, null)).toEqual(["Shout a"]);
  });

  test("none on the base itself; a branch opened in Branches lists its commits since its base, under its files", async () => {
    const root = three();
    git(root, "branch", "agent/side", "main");
    git(root, "switch", "-q", "agent/side");
    writeFileSync(join(root, "s.md"), "# S\n");
    git(root, "add", "s.md");
    git(root, "commit", "-qm", "Side");
    git(root, "switch", "-q", "main");
    const { app, frame, keys } = await panel(root);
    const branchRow = (name: string) => rowOf(app, (r) => r.kind === "branch" && r.branch.name === name);
    expect(await until(() => (frame(), branchRow("feature") >= 0))).toBe(true);
    expect(app.gitPanel.rows().some((r) => r.kind === "heading" && r.section === "commits")).toBe(false);
    app.sidebar.selected = branchRow("feature");
    await keys("enter");
    expect(await until(() => (frame(), subjects(app, "feature").length === 3))).toBe(true);
    const sub = app.gitPanel.rows().find((r) => r.kind === "bsub" && r.against === "commits");
    expect(sub).toMatchObject({ label: "Commits (3)" });
    app.sidebar.selected = commitRow(app, "Shout a", "feature");
    await keys("enter");
    expect(await until(() => (frame(), files(app, "feature").length === 1))).toBe(true);
    // Folded twice: the commit, then the branch.
    await keys("h");
    expect(files(app, "feature")).toEqual([]);
    await keys("h");
    expect(subjects(app, "feature")).toEqual([]);
    // Another branch's: its own base's.
    app.sidebar.selected = branchRow("agent/side");
    await keys("enter");
    expect(await until(() => (frame(), subjects(app, "agent/side").length === 1))).toBe(true);
    expect(subjects(app, "agent/side")).toEqual(["Side"]);
  });
});

describe(":log, a branch's commits in a window", () => {
  const title = (app: App) => (app.overlay as ListOverlay | null)?.title ?? "";
  const labels = (app: App) => (app.overlay as ListOverlay).items.map((i) => i.label);

  test("the commits, a commit's files, a file's change; esc goes back a step each time", async () => {
    const root = three();
    const short = (rev: string) => git(root, "rev-parse", "--short=7", rev).trim();
    const { app, keys } = await panel(root, "a.md", false);
    await keys(":", ...typed("log"), "enter");
    expect(await until(() => title(app).startsWith("feature:"))).toBe(true);
    expect(title(app)).toBe("feature: 3 commits since main — enter: its files");
    expect(labels(app)).toEqual([`${short("HEAD")} Rename b`, `${short("HEAD~1")} Shout a`, `${short("HEAD~2")} c`]);
    expect((app.overlay as ListOverlay).items[0]!.detail).toMatch(/^t · \d{4}-\d\d-\d\d$/);
    await keys("down", "enter");
    expect(await until(() => title(app).startsWith(`${short("HEAD~1")} Shout a:`))).toBe(true);
    expect(title(app)).toBe(`${short("HEAD~1")} Shout a: 1 file — enter: its change · esc: the commits`);
    expect(labels(app)).toEqual(["M a.md"]);
    await keys("enter");
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe(`${short("HEAD~1")} Shout a: a.md — esc: the files`);
    await keys("escape");
    expect(await until(() => title(app).endsWith("esc: the commits"))).toBe(true);
    expect(app.floating).toBeNull();
    await keys("escape");
    expect(await until(() => title(app).startsWith("feature:"))).toBe(true);
    expect((app.overlay as ListOverlay).selected).toBe(1);
    // A rename's file: the new name, from the old.
    await keys("up", "enter");
    expect(await until(() => title(app).startsWith(`${short("HEAD")} Rename b:`))).toBe(true);
    expect((app.overlay as ListOverlay).items.map((i) => [i.label, i.detail])).toEqual([["R e.md", "from b.md"]]);
    await keys("escape", "escape");
    expect(app.overlay).toBeNull();
  });

  test("space g l is :log; on the base itself, or with no commits since it, said", async () => {
    const root = repo();
    const { app, keys } = await panel(root, "a.md", false);
    await keys("space", "g", "l");
    expect(await until(() => title(app).startsWith("feature:"))).toBe(true);
    expect(title(app)).toBe("feature: 1 commit since main — enter: its files");
    await keys("escape");
    git(root, "switch", "-q", "main");
    await app.git.refreshNow();
    await keys("space", "g", "l");
    expect(app.messages.at(-1)?.text).toBe("main is a base: :log lists a branch's commits since its own base");
    git(root, "switch", "-q", "-c", "agent/new");
    await app.git.refreshNow();
    await keys("space", "g", "l");
    expect(app.messages.at(-1)?.text).toBe("no commits since main");
  });
});
