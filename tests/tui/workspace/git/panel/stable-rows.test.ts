import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import type { App } from "../../../../../src/tui/app/runtime/app.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { sandbox, git, repo, until, panel, rowOf } = makeGitPanelFixture();

describe("the panel's rows by what they are, not where they were: as rows come and go above them (#14)", () => {
  /** What row `i` is: a branch's name, a file's path, a repository's name, else its kind. */
  const what = (app: App, i: number) => {
    const r = app.gitPanel.rows()[i];
    return r?.kind === "branch"
      ? `branch ${r.branch.name}`
      : r?.kind === "file"
        ? `file ${r.entry.path}`
        : r?.kind === "repo"
          ? `repo ${r.repo.name}`
          : r?.kind;
  };
  const indexOf = (app: App, name: string) =>
    app.gitPanel.rows().findIndex((r) => r.kind === "branch" && r.branch.name === name);
  /** The screen line the last frame drew row `i` on; undefined off the screen. */
  const lineOf = (app: App, i: number) => app.geometry!.hot.find((h) => h.id === `git:row:${i}`)?.y;

  test("the selection stays on its branch as the working tree's rows arrive above it", async () => {
    const root = repo();
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    expect(what(app, app.sidebar.selected)).toBe("branch main");
    // Two new files, and git's news: their heading and rows above the branches.
    writeFileSync(join(root, "n1.md"), "# N1\n");
    writeFileSync(join(root, "n2.md"), "# N2\n");
    await app.git.refreshNow();
    frame();
    expect(app.gitPanel.rows().some((r) => r.kind === "file" && r.entry.path === "n2.md")).toBe(true);
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("the row under a resting pointer stays on its line as rows arrive above it; the wheel's scroll stays", async () => {
    const root = repo();
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    const y = lineOf(app, indexOf(app, "main"))!;
    app.mouse.handle({ type: "move", x: 6, y, button: 0 });
    frame();
    writeFileSync(join(root, "n1.md"), "# N1\n");
    writeFileSync(join(root, "n2.md"), "# N2\n");
    await app.git.refreshNow();
    frame();
    expect(app.gitPanel.rows().some((r) => r.kind === "file" && r.entry.path === "n2.md")).toBe(true);
    expect([what(app, indexOf(app, "main")), lineOf(app, indexOf(app, "main"))]).toEqual(["branch main", y]);
    // Nothing arriving, the wheel's scroll is left as it is.
    const scroll = app.sidebar.scroll;
    expect(scroll).toBeGreaterThan(0);
    app.mouse.handle({ type: "scroll", x: 6, y, button: 0, scroll: { direction: "up", delta: 1 } });
    frame();
    expect(app.sidebar.scroll).toBe(Math.max(0, scroll - 3));
    // The filter opened, its line pushing the rows down: the user's own doing, not held.
    app.mouse.handle({ type: "move", x: 6, y: y + 1, button: 0 });
    frame();
    await app.gitPanel.action("filter");
    frame();
    expect(app.sidebar.scroll).toBe(0);
  });

  test("a pointer resting below the last row: rows arriving above leave the spot under it empty", async () => {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const name of ["alpha", "beta"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "x.md"), "# X\n");
      git(join(root, name), "init", "-q", "-b", "main");
      git(join(root, name), "add", "-A");
      git(join(root, name), "commit", "-q", "-m", "x");
    }
    const { app, frame } = await panel(root);
    const named = (name: string) => app.gitPanel.rows().findIndex((r) => r.kind === "repo" && r.repo.name === name);
    expect(await until(() => (frame(), named("beta") >= 0))).toBe(true);
    // The pointer a line under beta, the last row; alpha opened up above it, its checkout's row under it.
    const y = lineOf(app, named("beta"))! + 1;
    app.mouse.handle({ type: "move", x: 6, y, button: 0 });
    frame();
    expect(app.mouse.hover).toBeNull();
    const alpha = app.gitPanel.rows()[named("alpha")] as { repo: { key: string } };
    app.gitPanel.repos.opened.add(alpha.repo.key);
    frame();
    frame();
    expect([lineOf(app, named("beta")), app.mouse.hover]).toEqual([y - 1, null]);
  });

  test("a click or a key between frames acts on the row drawn there, though rows came above it since", async () => {
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
    const { app, frame } = await panel(root);
    const named = (name: string) => app.gitPanel.rows().findIndex((r) => r.kind === "repo" && r.repo.name === name);
    const repoNamed = (name: string) =>
      app.gitPanel.rows().flatMap((r) => (r.kind === "repo" && r.repo.name === name ? [r.repo] : []))[0]!;
    expect(await until(() => (frame(), named("gamma") >= 0 && !!app.gitPanel.repos.summary(repoNamed("gamma"))))).toBe(
      true,
    );
    frame();
    const gamma = app.geometry!.hot.find((h) => h.id === `git:row:${named("gamma")}`)!;
    // alpha opened up, no frame since: its checkout's row under it, gamma a row further down than drawn.
    app.gitPanel.repos.opened.add(repoNamed("alpha").key);
    app.mouse.handle({ type: "down", x: gamma.x + 2, y: gamma.y, button: 0 });
    app.mouse.handle({ type: "up", x: gamma.x + 2, y: gamma.y, button: 0 });
    expect([app.loc.root, what(app, app.sidebar.selected)]).toEqual([root, "repo gamma"]);
    expect(app.gitPanel.repos.opened.size).toBe(2);
    // Closed again, beta selected and drawn; alpha opened up, no frame since: enter opens beta, the row drawn selected.
    app.gitPanel.repos.opened.clear();
    app.gitPanel.select(named("beta"));
    frame();
    app.gitPanel.repos.opened.add(repoNamed("alpha").key);
    await app.input.handleKey("enter");
    expect(what(app, app.sidebar.selected)).toBe("repo beta");
    expect(app.gitPanel.rows()[named("beta")]).toMatchObject({ open: true });
  });

  /** A repository with forty new files: more rows than the panel shows. */
  const crowded = () => {
    const root = repo();
    for (let i = 0; i < 40; i++) writeFileSync(join(root, `n${String(i).padStart(2, "0")}.md`), "# N\n");
    return root;
  };

  test("rows gone above a resting pointer's row, the list scrolled: the row stays on its line", async () => {
    const root = crowded();
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    // Scrolled down a little by the wheel, short of the list's end; the pointer on a file in the middle.
    app.mouse.handle({ type: "scroll", x: 6, y: 20, button: 0, scroll: { direction: "down", delta: 2 } });
    frame();
    expect(app.sidebar.scroll).toBe(6);
    const list = app.geometry!.gitRows!;
    const y = list.y + 10;
    const under = app.gitPanel.rows()[app.sidebar.scroll + 10];
    expect(under?.kind).toBe("file");
    const path = (under as { entry: { path: string } }).entry.path;
    app.mouse.handle({ type: "move", x: 6, y, button: 0 });
    frame();
    for (const n of ["n00", "n01", "n02"]) rmSync(join(root, `${n}.md`));
    await app.git.refreshNow();
    frame();
    expect(fileAt("n00.md")).toBe(-1);
    expect(lineOf(app, fileAt(path))).toBe(y);
    // It's the row under the pointer still: its buttons drawn on it.
    expect(app.geometry!.hot.some((h) => h.id === `git:act:${fileAt(path)}:stage`)).toBe(true);
  });

  test("rows moved under a pointer that doesn't hold them: what's under it is what it's on, as the frame drew it", async () => {
    const root = repo();
    const { app, frame } = await panel(root, "a.md", false);
    // The pointer over the explorer; then the git panel by keys, under the pointer that hasn't moved since.
    app.panels.openLeftView("explorer");
    frame();
    const y = 12;
    app.mouse.handle({ type: "move", x: 6, y, button: 0 });
    await app.run("git.view");
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    frame();
    const list = app.geometry!.gitRows!;
    const at = () => app.sidebar.scroll + y - list.y;
    expect(app.mouse.hover).toBe(`git:row:${at()}`);
    // Rows arrive above it: the row under the pointer is another, and the hover says so.
    writeFileSync(join(root, "n1.md"), "# N1\n");
    writeFileSync(join(root, "n2.md"), "# N2\n");
    await app.git.refreshNow();
    frame();
    expect(app.mouse.hover).toBe(`git:row:${at()}`);
    expect(app.gitPanel.rows()[at()]).toBeDefined();
  });

  test("a key that moves the selection shows it, though the pointer rests on the rows", async () => {
    const root = crowded();
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    const top = app.geometry!.hot.find((h) => h.id === "git:row:1")!;
    app.mouse.handle({ type: "move", x: 6, y: top.y, button: 0 });
    frame();
    await keys("shift+g");
    expect(lineOf(app, app.sidebar.selected)).toBeDefined();
    expect(app.sidebar.scroll).toBeGreaterThan(0);
    // The wheel scrolls it back up; g g: the first row, shown again.
    for (let n = 0; n < 30; n++)
      app.mouse.handle({ type: "scroll", x: 6, y: top.y, button: 0, scroll: { direction: "up", delta: 1 } });
    frame();
    await keys("shift+g");
    expect(lineOf(app, app.sidebar.selected)).toBeDefined();
  });

  test("a row gone since it was drawn: a click there, or a key on it, does nothing to the row now in its place", async () => {
    const root = repo();
    writeFileSync(join(root, "n1.md"), "# N1\n");
    writeFileSync(join(root, "n2.md"), "# N2\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n2.md") >= 0))).toBe(true);
    // n1 selected and drawn, its stage button with it; then gone (no frame since): a click on the button stages
    // nothing, though n2 is in its place now.
    app.gitPanel.select(fileAt("n1.md"));
    frame();
    const stage = app.geometry!.hot.find((h) => h.id === `git:act:${fileAt("n1.md")}:stage`)!;
    expect(stage).toBeDefined();
    rmSync(join(root, "n1.md"));
    await app.git.refreshNow();
    app.mouse.handle({ type: "down", x: stage.x, y: stage.y, button: 0 });
    app.mouse.handle({ type: "up", x: stage.x, y: stage.y, button: 0 });
    // A key: `s` on the selection, n1, gone since the frame: nothing staged.
    await app.gitPanel.action("stage");
    await Bun.sleep(300);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
  });

  test("away to the explorer and back, the selection still on its branch, rows having come above it meanwhile", async () => {
    const root = repo();
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    app.panels.openLeftView("explorer");
    frame();
    writeFileSync(join(root, "n1.md"), "# N1\n");
    writeFileSync(join(root, "n2.md"), "# N2\n");
    await app.git.refreshNow();
    app.panels.openLeftView("git");
    expect(
      await until(() => (frame(), app.gitPanel.rows().some((r) => r.kind === "file" && r.entry.path === "n2.md"))),
    ).toBe(true);
    frame();
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("a selection set without the panel (a view's restored) is taken as it is, not pulled back", async () => {
    const root = repo();
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "feature"));
    frame();
    app.sidebar.selected = indexOf(app, "main");
    frame();
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("another repository's rows aren't held to the pointer's row in this one: its row of that name isn't scrolled to", async () => {
    const a = repo();
    const b = repo();
    writeFileSync(join(b, "n1.md"), "# N1\n");
    writeFileSync(join(b, "n2.md"), "# N2\n");
    const { app, frame } = await panel(a);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    const i = indexOf(app, "main");
    app.gitPanel.select(i);
    frame();
    app.mouse.handle({ type: "move", x: 6, y: lineOf(app, i)!, button: 0 });
    frame();
    // Into b, whose new files come before its branches: its main isn't scrolled to the pointer's line.
    app.vaults.switchVault(locateVault({ root: b }), null);
    await app.git.refreshNow();
    frame();
    expect(await until(() => (frame(), indexOf(app, "main") > i))).toBe(true);
    expect(app.sidebar.scroll).toBe(0);
  });

  test("the footer says what the pointer's on as the rows have it, though they moved under it this frame", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("b.md") >= 0))).toBe(true);
    // The pointer on b.md's row, then on its discard button.
    app.mouse.handle({ type: "move", x: 8, y: lineOf(app, fileAt("b.md"))!, button: 0 });
    frame();
    const discard = app.geometry!.hot.find((h) => h.id === `git:act:${fileAt("b.md")}:discard`)!;
    app.mouse.handle({ type: "move", x: discard.x, y: discard.y, button: 0 });
    expect(frame()).toContain("discards its changes, after asking");
    // a.md staged: Staged and a.md's row above b.md now, this frame.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    expect(frame()).toContain("discards its changes, after asking");
  });

  test("two changes of one file alike: the first selected stays the first, never taken for the other", async () => {
    const root = repo();
    const lines = (n: string) => ["# A", "", n, "", "1", "2", "3", "4", "5", "6", "7", "8", "", n, ""].join("\n");
    writeFileSync(join(root, "a.md"), lines("one"));
    git(root, "commit", "-q", "-am", "twice");
    writeFileSync(join(root, "a.md"), lines("uno"));
    const { app, frame } = await panel(root);
    app.git.opened.add("unstaged:a.md");
    const changes = () =>
      app.gitPanel
        .rows()
        .map((r, i) => (r.kind === "change" ? i : -1))
        .filter((i) => i >= 0);
    expect(await until(() => (frame(), changes().length === 2))).toBe(true);
    const first = changes()[0]!;
    app.gitPanel.select(first);
    frame();
    frame();
    expect(app.sidebar.selected).toBe(first);
  });

  test("a change selected, under a resting pointer, gone a moment while git's answer is read again: kept to", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    const changeAt = () => rowOf(app, (r) => r.kind === "change");
    app.git.opened.add("unstaged:a.md");
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    app.gitPanel.select(changeAt());
    frame();
    const y = lineOf(app, changeAt())!;
    app.mouse.handle({ type: "move", x: 8, y, button: 0 });
    frame();
    // git's news: the first frame after it hasn't a.md's texts yet, so no change rows; then they're back.
    await app.git.refreshNow();
    frame();
    expect(changeAt()).toBe(-1);
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    frame();
    expect([app.sidebar.selected, lineOf(app, changeAt())]).toEqual([changeAt(), y]);
  });

  /** a.md with "one" in two places far apart, committed; then "uno" in both: two changes of one file, alike. */
  const alike = () => {
    const root = repo();
    const lines = (n: string) => ["# A", "", n, "", "1", "2", "3", "4", "5", "6", "7", "8", "", n, ""].join("\n");
    writeFileSync(join(root, "a.md"), lines("one"));
    git(root, "commit", "-q", "-am", "twice");
    writeFileSync(join(root, "a.md"), lines("uno"));
    return root;
  };
  const changesOf = (app: App) =>
    app.gitPanel
      .rows()
      .map((r, i) => (r.kind === "change" ? i : -1))
      .filter((i) => i >= 0);

  test("two changes of one file alike: a click on the second selects it, and s stages it", async () => {
    const root = alike();
    const { app, frame } = await panel(root);
    app.git.opened.add("unstaged:a.md");
    expect(await until(() => (frame(), changesOf(app).length === 2))).toBe(true);
    const second = changesOf(app)[1]!;
    const at = app.geometry!.hot.find((h) => h.id === `git:row:${second}`)!;
    app.mouse.handle({ type: "down", x: at.x + 2, y: at.y, button: 0 });
    app.mouse.handle({ type: "up", x: at.x + 2, y: at.y, button: 0 });
    expect(app.sidebar.selected).toBe(second);
    frame();
    await app.gitPanel.action("stage");
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "a.md\n")).toBe(true);
  });

  test("the pointer resting on one of two changes alike: the frames settle, none asks for another", async () => {
    const root = alike();
    const { app, frame } = await panel(root);
    app.git.opened.add("unstaged:a.md");
    expect(await until(() => (frame(), changesOf(app).length === 2))).toBe(true);
    app.mouse.handle({ type: "move", x: 8, y: lineOf(app, changesOf(app)[1]!)!, button: 0 });
    frame();
    frame();
    let renders = 0;
    app.host.requestRender = () => void renders++;
    frame();
    frame();
    frame();
    expect(renders).toBe(0);
  });

  test("scrolled by the wheel away from the selection: rows arriving above it leave the scroll as it is", async () => {
    const root = crowded();
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n05.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("n05.md"));
    frame();
    app.mouse.handle({ type: "scroll", x: 6, y: 20, button: 0, scroll: { direction: "down", delta: 4 } });
    frame();
    const scroll = app.sidebar.scroll;
    expect(scroll).toBeGreaterThan(fileAt("n05.md"));
    app.mouse.handle({ type: "move", x: 100, y: 10, button: 0 });
    frame();
    // A file new before it, git's news: n05 selected still, a row further down; the view where the wheel left it.
    writeFileSync(join(root, "a0.md"), "# A0\n");
    await app.git.refreshNow();
    frame();
    expect(fileAt("a0.md")).toBeGreaterThan(-1);
    expect([what(app, app.sidebar.selected), app.sidebar.scroll]).toEqual(["file n05.md", scroll]);
  });

  test("the panel's top growing over the pointer's line (a button more, wrapped): its rows not scrolled out of sight", async () => {
    const root = repo();
    writeFileSync(join(root, "d.md"), "# D, staged\n");
    git(root, "add", "d.md");
    const { app, frame } = await panel(root);
    app.panels.sideW = 56;
    const staged = () => rowOf(app, (r) => r.kind === "heading" && r.section === "staged");
    expect(await until(() => (frame(), staged() >= 0))).toBe(true);
    const list = app.geometry!.gitRows!;
    // The pointer on the list's first line; then a change not staged: Review among the buttons, which wrap a line more.
    app.mouse.handle({ type: "move", x: 8, y: list.y, button: 0 });
    frame();
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    await app.git.refreshNow();
    frame();
    expect(app.geometry!.gitRows!.y).toBe(list.y + 1);
    expect([app.sidebar.scroll, lineOf(app, staged())]).toEqual([0, list.y + 1]);
  });

  test("a row gone for good: the selection lets go of it, and isn't pulled to one like it later", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const fileAt = (path: string, section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("b.md", "unstaged") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("a.md", "unstaged"));
    frame();
    // a.md staged elsewhere: gone from Changes; a while after, the selection's on the row in its place.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    frame();
    t += 5000;
    frame();
    const there = what(app, app.sidebar.selected);
    // a.md changed again, in Changes once more: the selection stays where it is.
    writeFileSync(join(root, "a.md"), "# A\n\nthree\n");
    await app.git.refreshNow();
    frame();
    expect(fileAt("a.md", "unstaged")).toBeGreaterThan(-1);
    expect(what(app, app.sidebar.selected)).toBe(there);
    expect(app.sidebar.selected).not.toBe(fileAt("a.md", "unstaged"));
  });

  test("a row gone for good: a while after, the row in its place is the selection's, kept to as rows come above", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const fileAt = (path: string, section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    const which = (i: number) => {
      const r = app.gitPanel.rows()[i];
      return r?.kind === "file" ? `${r.section} ${r.entry.path}` : r?.kind;
    };
    expect(await until(() => (frame(), fileAt("b.md", "unstaged") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("a.md", "unstaged"));
    frame();
    // a.md staged elsewhere: gone from Changes; a while after, the selection's the row in its place.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    frame();
    t += 5000;
    frame();
    const there = which(app.sidebar.selected);
    expect(there).not.toBe("unstaged a.md");
    // A file staged before them all: the selection stays on that row, though it's a row further down.
    writeFileSync(join(root, "0.md"), "# 0\n");
    git(root, "add", "0.md");
    await app.git.refreshNow();
    frame();
    expect(fileAt("0.md", "staged")).toBeGreaterThan(-1);
    expect(fileAt("0.md", "staged")).toBeLessThan(app.sidebar.selected);
    expect(which(app.sidebar.selected)).toBe(there);
  });

  test("the filter's down between frames steps from the row drawn selected, though rows came above it", async () => {
    const root = repo();
    for (const n of ["n1", "n2", "n3"]) writeFileSync(join(root, `${n}.md`), "# N\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n3.md") >= 0))).toBe(true);
    await app.gitPanel.action("filter");
    for (const c of "n") await app.panels.filterKey(c);
    frame();
    app.gitPanel.select(fileAt("n2.md"));
    frame();
    writeFileSync(join(root, "n0.md"), "# N\n");
    await app.git.refreshNow();
    await app.panels.filterKey("ctrl+n");
    expect(what(app, app.sidebar.selected)).toBe("file n3.md");
  });

  test("in a folder of repositories, a key on a row gone since it was drawn says nothing", async () => {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    mkdirSync(join(root, "alpha"));
    writeFileSync(join(root, "alpha", "x.md"), "# X\n");
    git(join(root, "alpha"), "init", "-q", "-b", "main");
    git(join(root, "alpha"), "add", "-A");
    git(join(root, "alpha"), "commit", "-q", "-m", "x");
    const { app, frame } = await panel(root);
    const checkout = () => rowOf(app, (r) => r.kind === "rcheckout");
    expect(await until(() => (frame(), rowOf(app, (r) => r.kind === "repo") >= 0))).toBe(true);
    const alpha = app.gitPanel.rows()[rowOf(app, (r) => r.kind === "repo")] as { repo: { key: string } };
    app.gitPanel.repos.opened.add(alpha.repo.key);
    frame();
    app.gitPanel.select(checkout());
    frame();
    // Closed again, no frame since: enter on its checkout's row, gone, does nothing, and says nothing.
    app.gitPanel.repos.opened.clear();
    const said = app.messages.length;
    await app.gitPanel.action("open");
    expect(app.messages.length).toBe(said);
  });

  test("into another repository: the selection isn't pulled to its row of the same name", async () => {
    // a's first row its Changes; b's first its Staged, its Changes further down.
    const a = repo();
    writeFileSync(join(a, "a.md"), "# A, changed\n");
    const b = repo();
    writeFileSync(join(b, "d.md"), "# D\n");
    git(b, "add", "d.md");
    writeFileSync(join(b, "a.md"), "# A, changed\n");
    const { app, frame } = await panel(a);
    const heading = (section: string) => rowOf(app, (r) => r.kind === "heading" && r.section === section);
    expect(await until(() => (frame(), heading("unstaged") === 0))).toBe(true);
    app.gitPanel.select(0);
    frame();
    // Into b, the panel's selection at the top as before (a switch that starts it there): b's Staged, not its Changes.
    app.vaults.switchVault(locateVault({ root: b }), null);
    app.sidebar.selected = 0;
    await app.git.refreshNow();
    expect(await until(() => (frame(), heading("unstaged") > 0))).toBe(true);
    frame();
    expect([app.sidebar.selected, heading("staged")]).toEqual([0, 0]);
  });

  test("the panel's own pick acted on by a key is the user's: it follows its row as rows arrive above it", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    const heading = (section: string) => rowOf(app, (r) => r.kind === "heading" && r.section === section);
    expect(await until(() => (frame(), heading("unstaged") === 0))).toBe(true);
    // The panel's pick, its first row: Changes; l on it (unfolded already, it stays so).
    expect(app.sidebar.selected).toBe(0);
    await app.gitPanel.action("expand");
    frame();
    // b.md staged elsewhere: Staged and b.md above Changes now; Changes selected still.
    git(root, "add", "b.md");
    await app.git.refreshNow();
    frame();
    expect([heading("staged"), app.sidebar.selected]).toEqual([0, heading("unstaged")]);
  });

  test("staging by a click on + in a panel the wheel scrolled: the scroll kept, not jumped back to the file staged", async () => {
    const root = crowded();
    const { app, frame } = await panel(root);
    const fileAt = (path: string, section = "untracked") =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("n30.md") >= 0))).toBe(true);
    app.mouse.handle({ type: "scroll", x: 6, y: 20, button: 0, scroll: { direction: "down", delta: 3 } });
    frame();
    const scroll = app.sidebar.scroll;
    expect(scroll).toBeGreaterThan(0);
    // The pointer on n20's row, then its + clicked: n20 staged, selected where it went (Staged, at the top), the
    // view where the wheel left it.
    const y = lineOf(app, fileAt("n20.md"))!;
    app.mouse.handle({ type: "move", x: 8, y, button: 0 });
    frame();
    const plus = app.geometry!.hot.find((h) => h.id === `git:act:${fileAt("n20.md")}:stage`)!;
    app.mouse.handle({ type: "move", x: plus.x, y, button: 0 });
    frame();
    app.mouse.handle({ type: "down", x: plus.x, y, button: 0 });
    app.mouse.handle({ type: "up", x: plus.x, y, button: 0 });
    expect(await until(() => (frame(), fileAt("n20.md", "staged") >= 0))).toBe(true);
    frame();
    expect([app.sidebar.selected, app.sidebar.pinned, app.sidebar.scroll >= scroll]).toEqual([
      fileAt("n20.md", "staged"),
      true,
      true,
    ]);
  });

  test("the panel's own pick between frames: a key acts on the row drawn there, not on what came to its place", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    const heading = (section: string) => rowOf(app, (r) => r.kind === "heading" && r.section === section);
    expect(await until(() => (frame(), heading("unstaged") === 0))).toBe(true);
    // Changes drawn selected, the panel's pick; b.md staged elsewhere, no frame since: Staged at 0 now. u on what's
    // selected, Changes, unstages nothing.
    git(root, "add", "b.md");
    await app.git.refreshNow();
    expect(heading("staged")).toBe(0);
    await app.gitPanel.action("unstage");
    await Bun.sleep(300);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("b.md\n");
  });

  test("the note closed, This file's rows gone above the branches: the branch selected stays selected", async () => {
    const root = repo();
    // Two branches more below main, each a commit of its own (not merged, so listed).
    for (const b of ["omega", "zeta"]) {
      git(root, "switch", "-q", "-c", b);
      writeFileSync(join(root, `${b}.md`), `# ${b}\n`);
      git(root, "add", `${b}.md`);
      git(root, "commit", "-q", "-m", b);
      git(root, "switch", "-q", "feature");
    }
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "zeta") >= 0))).toBe(true);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    expect(rowOf(app, (r) => r.kind === "thisfile")).toBeGreaterThan(-1);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    await app.run("tab.close_all");
    frame();
    frame();
    expect(rowOf(app, (r) => r.kind === "thisfile")).toBe(-1);
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("scrolled past the list's end for the pointer's row: the scrollbar's thumb stays in the list", async () => {
    const root = crowded();
    // On main, nothing of its own against a base: no This branch section, whose rows (these files again) come in their
    // own time, below the pointer's row, and leave the list no end to scroll past (#77).
    git(root, "switch", "-q", "main");
    const { app, frame } = await panel(root);
    expect(app.gitPanel.aheadFiles()).toBeNull();
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    // Every row below the files in before the wheel: the branches, the last to answer.
    expect(await until(() => (frame(), fileAt("n39.md") >= 0 && rowOf(app, (r) => r.kind === "branch") >= 0))).toBe(
      true,
    );
    app.mouse.handle({ type: "scroll", x: 6, y: 20, button: 0, scroll: { direction: "down", delta: 20 } });
    frame();
    const list = app.geometry!.gitRows!;
    // The pointer near the top of the rows; files below it gone: the list scrolled past its end to keep its row.
    app.mouse.handle({ type: "move", x: 8, y: list.y + 1, button: 0 });
    frame();
    const under = app.gitPanel.rows()[app.sidebar.scroll + 1] as { entry: { path: string } };
    const n = Number(/^n(\d\d)\.md$/.exec(under.entry.path)![1]);
    expect(n).toBeLessThan(39);
    for (let i = n + 1; i < 40; i++) rmSync(join(root, `n${String(i).padStart(2, "0")}.md`));
    await app.git.refreshNow();
    // The files gone from the panel's rows (git's answer in), the list drawn again.
    expect(await until(() => (frame(), fileAt("n39.md") < 0))).toBe(true);
    frame();
    expect(app.sidebar.scroll).toBeGreaterThan(Math.max(0, app.gitPanel.rows().length - list.h));
    // The scrollbar's column under the list (the footer's rule and text): no thumb drawn there.
    const lines = frame().split("\n");
    const x = list.x + list.w - 1;
    for (let y = list.y + list.h; y < list.y + list.h + 2; y++) expect([...(lines[y] ?? "")][x]).not.toBe("▐");
  });

  test("a note opened from the panel (o on a file): the git panel's selection is its own still, the explorer's apart", async () => {
    const root = repo();
    for (const n of ["d1", "d2", "d3", "d4", "d5"]) writeFileSync(join(root, `${n}.md`), "# D\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("d5.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("d5.md"));
    frame();
    await app.gitPanel.action("go");
    frame();
    expect(app.view!.buf.rel).toBe("d5.md");
    app.region = "sidebar";
    frame();
    expect(what(app, app.sidebar.selected)).toBe("file d5.md");
  });

  test("a row gone for good, then like it back after a long while with no frame between: the selection isn't pulled to it", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const fileAt = (path: string, section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("b.md", "unstaged") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("a.md", "unstaged"));
    frame();
    // a.md staged elsewhere: gone from Changes, one frame drawn within the second; then minutes with no frame, and
    // a.md changed again, in Changes once more: the selection stays where it went.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    frame();
    t += 5 * 60_000;
    writeFileSync(join(root, "a.md"), "# A\n\nthree\n");
    await app.git.refreshNow();
    frame();
    expect(fileAt("a.md", "unstaged")).toBeGreaterThan(-1);
    expect(app.sidebar.selected).not.toBe(fileAt("a.md", "unstaged"));
  });

  test("the panel's own pick, rows come above it, a key of the panel's own: the pick stays at its place", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    const heading = (section: string) => rowOf(app, (r) => r.kind === "heading" && r.section === section);
    expect(await until(() => (frame(), heading("unstaged") === 0))).toBe(true);
    // b.md staged elsewhere, no frame since; then the filter opened and closed (the panel's own key): drawn, the
    // panel's pick at its place, the first row (Staged now).
    git(root, "add", "b.md");
    await app.git.refreshNow();
    await app.gitPanel.action("filter");
    app.sidebar.filtering = false;
    frame();
    frame();
    expect([app.sidebar.selected, heading("staged")]).toEqual([0, 0]);
  });

  test("the panel's follow after a stage, its answer come with the explorer shown: the explorer's selection its own", async () => {
    const root = repo();
    for (const n of ["d1", "d2", "d3"]) writeFileSync(join(root, `${n}.md`), "# D\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string, section = "untracked") =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("d3.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("d3.md"));
    frame();
    // s on d3, and straight to the explorer before git answers.
    const staging = app.gitPanel.action("stage");
    app.panels.openLeftView("explorer");
    frame();
    const explorer = app.sidebar.selected;
    await staging;
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "d3.md\n")).toBe(true);
    await app.git.refreshNow();
    await Bun.sleep(100);
    frame();
    expect(app.sidebar.selected).toBe(explorer);
    // Back on the git panel: d3 selected, where it went.
    app.panels.openLeftView("git");
    frame();
    expect(what(app, app.sidebar.selected)).toBe("file d3.md");
    expect(fileAt("d3.md", "staged")).toBe(app.sidebar.selected);
  });

  test("into another repository, a key or a click before its first frame: nothing done to its row of the same name", async () => {
    const a = repo();
    const b = repo();
    const { app, frame } = await panel(a);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    // main picked again, no frame since; into b, the selection at the index it had (a switch that keeps it), b's rows
    // read, none drawn yet.
    app.gitPanel.select(indexOf(app, "main"));
    const i = app.sidebar.selected;
    const drawn = app.geometry!.hot.find((h) => h.id === `git:row:${i}`)!;
    app.vaults.switchVault(locateVault({ root: b }), null);
    app.sidebar.selected = i;
    await app.git.refreshNow();
    expect(await until(() => indexOf(app, "main") >= 0)).toBe(true);
    // enter, before b's panel is drawn: b's main not opened up; nor by a click where a's main was drawn, nor its menu
    // by a right click.
    await app.gitPanel.action("open");
    expect(app.gitPanel.rows()[indexOf(app, "main")]).toMatchObject({ kind: "branch", open: false });
    for (const button of [0, 2]) {
      app.mouse.handle({ type: "down", x: drawn.x, y: drawn.y, button });
      app.mouse.handle({ type: "up", x: drawn.x, y: drawn.y, button });
    }
    expect(app.gitPanel.rows()[indexOf(app, "main")]).toMatchObject({ kind: "branch", open: false });
    expect(app.overlay).toBeNull();
  });

  test("a branch selected, gone before the next frame: n starts no branch from what came to its place", async () => {
    const root = repo();
    git(root, "switch", "-q", "-c", "omega");
    writeFileSync(join(root, "omega.md"), "# omega\n");
    git(root, "add", "omega.md");
    git(root, "commit", "-q", "-m", "omega");
    git(root, "switch", "-q", "feature");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "omega") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "omega"));
    frame();
    git(root, "branch", "-q", "-D", "omega");
    await app.git.refreshNow();
    expect(await until(() => indexOf(app, "omega") < 0)).toBe(true);
    await app.gitPanel.action("new_branch");
    expect(app.overlay).toBeNull();
  });

  test("the filter's enter between frames, matches above gone since: it acts on the row drawn selected", async () => {
    const root = repo();
    for (const n of ["n1", "n2", "n3"]) writeFileSync(join(root, `${n}.md`), "# N\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    const branch = () => rowOf(app, (r) => r.kind === "branch");
    expect(await until(() => (frame(), fileAt("n3.md") >= 0 && branch() >= 0))).toBe(true);
    await app.gitPanel.action("filter");
    for (const c of "n") await app.panels.filterKey(c);
    frame();
    // A row near the end to act on: Branches' heading, main under it.
    const branches = rowOf(app, (r) => r.kind === "heading" && r.section === "branches");
    expect(branches).toBe(app.gitPanel.rows().length - 2);
    app.gitPanel.select(branches);
    frame();
    // n1 and n2 gone, no frame since: the list shorter, the index drawn past its end; enter folds Branches.
    rmSync(join(root, "n1.md"));
    rmSync(join(root, "n2.md"));
    await app.git.refreshNow();
    expect(app.gitPanel.rows().length).toBeLessThanOrEqual(branches);
    await app.panels.filterKey("enter");
    expect(app.gitPanel.folded.has("branches")).toBe(true);
  });

  test("the pointer resting on the scrollbar: rows arriving above aren't held to it", async () => {
    const root = crowded();
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n30.md") >= 0))).toBe(true);
    const list = app.geometry!.gitRows!;
    const y = lineOf(app, fileAt("n10.md"))!;
    // On the scrollbar's column, the row's line: a file new above; the scroll as it was.
    app.mouse.handle({ type: "move", x: list.x + list.w - 1, y, button: 0 });
    frame();
    const scroll = app.sidebar.scroll;
    writeFileSync(join(root, "a0.md"), "# A0\n");
    await app.git.refreshNow();
    frame();
    expect(fileAt("a0.md")).toBeGreaterThan(-1);
    expect(app.sidebar.scroll).toBe(scroll);
  });

  test("scrolled past the list's end for the pointer's row, the wheel down: the rows don't move down", async () => {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const name of ["alpha", "beta"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "x.md"), "# X\n");
      git(join(root, name), "init", "-q", "-b", "main");
      git(join(root, name), "add", "-A");
      git(join(root, name), "commit", "-q", "-m", "x");
    }
    const { app, frame } = await panel(root);
    const named = (name: string) => app.gitPanel.rows().findIndex((r) => r.kind === "repo" && r.repo.name === name);
    expect(await until(() => (frame(), named("beta") >= 0))).toBe(true);
    const y = lineOf(app, named("beta"))! + 1;
    app.mouse.handle({ type: "move", x: 6, y, button: 0 });
    frame();
    const alpha = app.gitPanel.rows()[named("alpha")] as { repo: { key: string } };
    app.gitPanel.repos.opened.add(alpha.repo.key);
    frame();
    frame();
    expect(app.sidebar.scroll).toBeGreaterThan(0);
    const beta = lineOf(app, named("beta"));
    app.mouse.handle({ type: "scroll", x: 6, y, button: 0, scroll: { direction: "down", delta: 1 } });
    frame();
    expect(lineOf(app, named("beta"))).toBe(beta);
  });

  test("a pick of the user's, the row selected before it gone a while since: the new row followed as rows come above it", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const fileAt = (path: string, section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("b.md", "unstaged") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("a.md", "unstaged"));
    frame();
    // a.md staged elsewhere: gone from Changes, the selection kept to it a moment. A while after, no frame between,
    // b.md picked; then a file staged before them all.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    frame();
    t += 5000;
    app.gitPanel.select(fileAt("b.md", "unstaged"));
    writeFileSync(join(root, "0.md"), "# 0\n");
    git(root, "add", "0.md");
    await app.git.refreshNow();
    frame();
    expect(app.sidebar.selected).toBe(fileAt("b.md", "unstaged"));
  });

  test("a row gone, back after a while with no frame between, then picked again: followed as a row comes above it", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const fileAt = (path: string, section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("a.md", "unstaged") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("a.md", "unstaged"));
    frame();
    // a.md staged elsewhere, gone from Changes a frame; a while after, unstaged again, no frame between, and picked
    // again (as the panel follows a file); then a file staged before them all.
    git(root, "add", "a.md");
    await app.git.refreshNow();
    frame();
    t += 5000;
    git(root, "reset", "-q", "a.md");
    await app.git.refreshNow();
    app.gitPanel.selectWhere((r) => r.kind === "file" && r.entry.path === "a.md" && r.section === "unstaged");
    writeFileSync(join(root, "0.md"), "# 0\n");
    git(root, "add", "0.md");
    await app.git.refreshNow();
    frame();
    expect(app.sidebar.selected).toBe(fileAt("a.md", "unstaged"));
  });

  test("in a checkout, a row of another repository selected: the panel's own keys are the panel's", async () => {
    // The vault's repository and lib beside it, the view zoomed out to their folder: lib under Other repositories.
    const top = mkdtempSync(join(sandbox, "pair-"));
    const root = join(top, "trail");
    renameSync(repo(), root);
    const lib = join(top, "lib");
    mkdirSync(lib);
    writeFileSync(join(lib, "x.md"), "# X\n");
    git(lib, "init", "-q", "-b", "main");
    git(lib, "add", "-A");
    git(lib, "commit", "-q", "-m", "x");
    const { app, frame } = await panel(root);
    const libAt = () => rowOf(app, (r) => r.kind === "repo" && r.repo.name === "lib");
    app.explorer.zoomTo(top);
    app.gitPanel.folded.delete("repos");
    expect(await until(() => (frame(), libAt() >= 0))).toBe(true);
    app.gitPanel.select(libAt());
    frame();
    // i: the message box, typed into; not lost on the repository's row.
    await app.gitPanel.action("message");
    expect(app.gitPanel.typing).toBe(true);
    app.gitPanel.typing = false;
    // A row's key that isn't a repository's (d discards a file's changes): nothing on it, never taken for a branch's.
    for (const key of ["discard", "stage", "unstage", "push_branch"]) await app.gitPanel.action(key);
    expect(app.overlay).toBeNull();
  });

  test("the filter's enter on a match gone since the last frame: nothing, the filter still typed", async () => {
    const root = repo();
    for (const n of ["n1", "n2", "n3"]) writeFileSync(join(root, `${n}.md`), "# N\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n3.md") >= 0))).toBe(true);
    await app.gitPanel.action("filter");
    for (const c of "n") await app.panels.filterKey(c);
    frame();
    app.gitPanel.select(fileAt("n2.md"));
    frame();
    // n2 gone, no frame since: enter does nothing, and what's typed next is the filter's still.
    rmSync(join(root, "n2.md"));
    await app.git.refreshNow();
    expect(fileAt("n2.md")).toBe(-1);
    await app.panels.filterKey("enter");
    expect(app.sidebar.filtering).toBe(true);
  });

  test("in a repository, the explorer's view zoomed in, then out to hold the note: the branch selected stays selected as a row comes above it", async () => {
    const root = repo();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "s.md"), "# S\n");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    // The view zoomed into sub/ while the panel shows; main selected.
    app.explorer.zoomTo(join(root, "sub"));
    frame();
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    // A file new, and the note revealed as when it's opened: the view zooms out to hold it, in the same frame.
    writeFileSync(join(root, "n1.md"), "# N\n");
    await app.git.refreshNow();
    app.explorer.reveal(undefined, false, true);
    expect(app.explorer.top).toBe(root);
    frame();
    expect(rowOf(app, (r) => r.kind === "file" && r.entry.path === "n1.md")).toBeGreaterThan(-1);
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("the panel's follow after a stage, its answer come with the explorer shown and filtered: the file found among the panel's own rows", async () => {
    const root = repo();
    for (const n of ["d1", "d2", "d3"]) writeFileSync(join(root, `${n}.md`), "# D\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string, section = "untracked") =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === path && r.section === section);
    expect(await until(() => (frame(), fileAt("d3.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("d3.md"));
    frame();
    // s on d3; to the explorer, filtered by what no file of git's matches, before git answers.
    const staging = app.gitPanel.action("stage");
    app.panels.openLeftView("explorer");
    app.sidebar.filter = "zzz";
    frame();
    await staging;
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "d3.md\n")).toBe(true);
    await app.git.refreshNow();
    await Bun.sleep(100);
    app.sidebar.filter = "";
    // Back on the git panel: d3 selected, where it went.
    app.panels.openLeftView("git");
    frame();
    expect(fileAt("d3.md", "staged")).toBe(app.sidebar.selected);
  });

  test("into another repository, the panel's own pick there before its first frame: a key acts on it", async () => {
    const a = repo();
    const b = repo();
    const { app, frame } = await panel(a);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    app.vaults.switchVault(locateVault({ root: b }), null);
    await app.git.refreshNow();
    expect(await until(() => indexOf(app, "main") >= 0)).toBe(true);
    // The panel's pick in b, made before b's first frame (as showing the panel there does): enter opens main up.
    const rows = app.gitPanel.rows();
    app.gitPanel.place(indexOf(app, "main"), rows);
    await app.gitPanel.action("open");
    expect(app.gitPanel.rows()[indexOf(app, "main")]).toMatchObject({ kind: "branch", open: true });
  });

  test("the row under a resting pointer, a moment gone in its first frame, the last one's moment long past: held for its moment", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    writeFileSync(join(root, "b.md"), "# B, changed\n");
    const { app, frame } = await panel(root);
    let t = Date.now();
    (app as { now: () => number }).now = () => t;
    const changeAt = () => rowOf(app, (r) => r.kind === "change");
    app.git.opened.add("unstaged:a.md");
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    app.gitPanel.select(changeAt());
    frame();
    const list = app.geometry!.gitRows!;
    app.mouse.handle({ type: "move", x: 8, y: lineOf(app, changeAt())!, button: 0 });
    frame();
    // The change gone a moment under the pointer, which then leaves the rows before it's back.
    await app.git.refreshNow();
    frame();
    expect(changeAt()).toBe(-1);
    app.mouse.handle({ type: "move", x: list.x + list.w + 10, y: list.y + 1, button: 0 });
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    frame();
    // A while after, the pointer back on it, and git's news before the next frame: gone a moment again, then back.
    t += 5000;
    const y = lineOf(app, changeAt())!;
    app.mouse.handle({ type: "move", x: 8, y, button: 0 });
    await app.git.refreshNow();
    frame();
    expect(changeAt()).toBe(-1);
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    frame();
    expect(lineOf(app, changeAt())).toBe(y);
  });

  test("outside a repository, More in home unfolds and folds by enter and by a click", async () => {
    const was = process.env.HOME;
    const home = mkdtempSync(join(sandbox, "home-"));
    process.env.HOME = home;
    try {
      const root = join(home, "folder");
      mkdirSync(join(root, ".slipbox"), { recursive: true });
      writeFileSync(join(root, "a.md"), "# A\n");
      for (const at of [join(root, "alpha"), join(home, "elsewhere")]) {
        mkdirSync(at, { recursive: true });
        writeFileSync(join(at, "x.md"), "# X\n");
        git(at, "init", "-q", "-b", "main");
        git(at, "add", "-A");
        git(at, "commit", "-q", "-m", "x");
      }
      const { app, frame, keys } = await panel(root);
      const heading = () => rowOf(app, (r) => r.kind === "heading" && r.section === "home");
      const elsewhere = () => rowOf(app, (r) => r.kind === "repo" && r.repo.name === "elsewhere");
      expect(await until(() => (frame(), heading() >= 0))).toBe(true);
      expect(elsewhere()).toBe(-1);
      app.gitPanel.select(heading());
      await keys("enter");
      expect(await until(() => (frame(), elsewhere() >= 0))).toBe(true);
      const at = app.geometry!.hot.find((h) => h.id === `git:row:${heading()}`)!;
      app.mouse.handle({ type: "down", x: at.x, y: at.y, button: 0 });
      app.mouse.handle({ type: "up", x: at.x, y: at.y, button: 0 });
      frame();
      expect(elsewhere()).toBe(-1);
    } finally {
      if (was === undefined) delete process.env.HOME;
      else process.env.HOME = was;
    }
  });

  test("the explorer's rows changed while the git panel showed: shown again, its selection on the note revealed, not at its old index", async () => {
    const root = crowded();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "s.md"), "# S\n");
    const { app, frame } = await panel(root, "sub/s.md", false);
    frame();
    // The explorer zoomed into sub/, s.md selected; then the git panel shown.
    app.explorer.zoomTo(join(root, "sub"));
    app.explorer.selectRow(app.explorer.rowPath(join(root, "sub", "s.md")));
    const before = app.sidebar.selected;
    app.panels.openLeftView("git");
    frame();
    // n30.md opened, outside the view: it zooms out to hold it, while the explorer isn't shown.
    app.open("n30.md");
    expect(app.explorer.top).toBe(root);
    frame();
    app.panels.openLeftView("explorer");
    frame();
    expect(app.explorer.rows()[app.sidebar.selected]?.path).toBe("n30.md");
    expect(app.sidebar.selected).not.toBe(before);
  });

  test("the explorer's rows changed while the git panel showed, each way — zoomed out, a path selected, its folder gone: shown again, its selection where it goes", async () => {
    const root = crowded();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "s.md"), "# S\n");
    mkdirSync(join(root, "gone"));
    for (const n of ["g1", "g2", "g3"]) writeFileSync(join(root, "gone", `${n}.md`), "# G\n");
    const { app, frame } = await panel(root, "a.md", false);
    frame();
    const on = () => app.explorer.rows()[app.sidebar.selected]?.path;
    const away = () => (app.panels.openLeftView("git"), frame());
    const back = () => (app.panels.openLeftView("explorer"), frame());
    // Zoomed into sub/, then out to the vault while hidden: sub/ selected, the folder it came from.
    app.explorer.zoomTo(join(root, "sub"));
    away();
    app.explorer.zoomTo(root);
    back();
    expect(on()).toBe("sub");
    // A path selected while hidden (a rename's): its row.
    away();
    app.explorer.select("n05.md");
    back();
    expect(on()).toBe("n05.md");
    // Zoomed into gone/, g3 selected; gone/ deleted while hidden: the view at the vault, its first row selected.
    app.explorer.zoomTo(join(root, "gone"));
    app.explorer.selectRow(app.explorer.rowPath(join(root, "gone", "g3.md")));
    expect(app.sidebar.selected).toBe(2);
    away();
    rmSync(join(root, "gone"), { recursive: true });
    app.explorer.invalidateTree();
    app.explorer.treeRows();
    back();
    expect(app.explorer.top).toBe(root);
    expect([app.sidebar.selected, app.sidebar.scroll]).toEqual([0, 0]);
  });

  test("the explorer filtered, a note revealed while the git panel showed: shown again, the match it had selected", async () => {
    const root = crowded();
    const { app, frame } = await panel(root, "a.md", false);
    frame();
    // Filtered by n0, a match down the list selected; then the git panel.
    app.sidebar.filter = "n0";
    frame();
    app.sidebar.selected = 3;
    const before = app.explorer.rows()[3]!.path;
    app.panels.openLeftView("git");
    frame();
    // n30.md opened meanwhile: shown again, its filter kept and its match selected, every note matching as it was.
    app.open("n30.md");
    frame();
    app.panels.openLeftView("explorer");
    frame();
    expect(app.sidebar.filter).toBe("n0");
    expect(app.explorer.rows()[app.sidebar.selected]?.path).toBe(before);
  });

  test("a path selected in the explorer while the git panel shows, filtered: shown again, that path's row", async () => {
    const root = crowded();
    const { app, frame } = await panel(root, "a.md", false);
    frame();
    app.panels.openLeftView("git");
    frame();
    // The git panel filtered by what no note matches; a path selected in the explorer meanwhile (a rename's).
    app.sidebar.filter = "zzz";
    app.explorer.select("n05.md");
    app.sidebar.filter = "";
    app.panels.openLeftView("explorer");
    frame();
    expect(app.explorer.rows()[app.sidebar.selected]?.path).toBe("n05.md");
  });

  test("the explorer's place noted in one vault, shown again in another where no note opens: not taken for its row of the same name", async () => {
    const a = crowded();
    mkdirSync(join(a, "sub"));
    writeFileSync(join(a, "sub", "s.md"), "# S\n");
    // b in a hidden folder (the view can't hold both, and moves to b), no note in it: aaa/ and sub/, a data file each.
    const b = join(mkdtempSync(join(sandbox, ".hidden-")), "b");
    mkdirSync(join(b, ".slipbox"), { recursive: true });
    for (const d of ["aaa", "sub"]) {
      mkdirSync(join(b, d), { recursive: true });
      writeFileSync(join(b, d, "data.json"), "{}\n");
    }
    const { app, frame } = await panel(a, "a.md", false);
    frame();
    // The explorer zoomed into sub/; the git panel shown; the view zoomed out to a meanwhile: sub/ noted, where it was.
    app.explorer.zoomTo(join(a, "sub"));
    app.panels.openLeftView("git");
    frame();
    app.explorer.zoomTo(a);
    // Into b, no note to open there; its explorer shown: its first row, not its sub/.
    app.vaults.switchVault(locateVault({ root: b }), null);
    frame();
    app.panels.openLeftView("explorer");
    frame();
    expect(app.loc.root).toBe(b);
    expect(app.explorer.rows().map((r) => r.path)).toEqual(["aaa", "sub"]);
    expect(app.explorer.rows()[app.sidebar.selected]?.path).toBe("aaa");
  });

  test("outside a repository, the view zoomed out while the pointer rests: the last view's row isn't held in the new list", async () => {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const at of ["alpha", "group/beta", "group/gamma"]) {
      mkdirSync(join(root, at), { recursive: true });
      writeFileSync(join(root, at, "x.md"), "# X\n");
      git(join(root, at), "init", "-q", "-b", "main");
      git(join(root, at), "add", "-A");
      git(join(root, at), "commit", "-q", "-m", "x");
    }
    const { app, frame } = await panel(root);
    const named = (name: string) => rowOf(app, (r) => r.kind === "repo" && r.repo.name === name);
    expect(await until(() => (frame(), named("alpha") >= 0))).toBe(true);
    // The view zoomed into group/: beta and gamma; the pointer on beta.
    app.explorer.zoomTo(join(root, "group"));
    expect(await until(() => (frame(), named("alpha") < 0 && named("beta") >= 0))).toBe(true);
    app.mouse.handle({ type: "move", x: 8, y: lineOf(app, named("beta"))!, button: 0 });
    frame();
    // Out to the folder again: group's list drawn until the folder's is found; then the folder's, from its top.
    app.explorer.zoomTo(root);
    frame();
    expect(named("alpha")).toBe(-1);
    expect(await until(() => (frame(), named("alpha") >= 0))).toBe(true);
    frame();
    expect(app.sidebar.scroll).toBe(0);
    expect(lineOf(app, named("alpha"))).toBeDefined();
  });

  test("into another repository, a pick there before its first frame, a row come above it: the pick followed", async () => {
    const a = repo();
    const b = repo();
    const { app, frame } = await panel(a);
    expect(await until(() => (frame(), indexOf(app, "main") >= 0))).toBe(true);
    app.gitPanel.select(indexOf(app, "main"));
    frame();
    app.vaults.switchVault(locateVault({ root: b }), null);
    await app.git.refreshNow();
    expect(await until(() => indexOf(app, "main") >= 0)).toBe(true);
    // main picked in b before its first frame; a file new in b before that frame.
    app.gitPanel.select(indexOf(app, "main"));
    writeFileSync(join(b, "n1.md"), "# N\n");
    await app.git.refreshNow();
    frame();
    expect(rowOf(app, (r) => r.kind === "file" && r.entry.path === "n1.md")).toBeGreaterThan(-1);
    expect(what(app, app.sidebar.selected)).toBe("branch main");
  });

  test("a file selected, gone before the next frame: n starts a branch from HEAD all the same", async () => {
    const root = repo();
    writeFileSync(join(root, "d1.md"), "# D\n");
    const { app, frame } = await panel(root);
    const fileAt = (section: string) =>
      rowOf(app, (r) => r.kind === "file" && r.entry.path === "d1.md" && r.section === section);
    expect(await until(() => (frame(), fileAt("untracked") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("untracked"));
    frame();
    git(root, "add", "d1.md");
    await app.git.refreshNow();
    expect(fileAt("untracked")).toBe(-1);
    await app.gitPanel.action("new_branch");
    expect(app.overlay).not.toBeNull();
  });

  test("the explorer's reveal, zoom and view kept to what's there, while the git panel shows: its scroll, pin and selection alone", async () => {
    const root = crowded();
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "s.md"), "# S\n");
    mkdirSync(join(root, "gone"));
    writeFileSync(join(root, "gone", "g.md"), "# G\n");
    const { app, frame } = await panel(root);
    const fileAt = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), fileAt("n30.md") >= 0))).toBe(true);
    app.gitPanel.select(fileAt("n20.md"));
    frame();
    app.mouse.handle({ type: "scroll", x: 6, y: 20, button: 0, scroll: { direction: "down", delta: 2 } });
    frame();
    const s = app.sidebar;
    const was = () => [s.selected, s.scroll, s.pinned];
    const before = was();
    expect(before[1]).toBeGreaterThan(0);
    // A note revealed, a path selected (a rename's); the view zoomed into a folder, then out to hold a note outside
    // it; a view's folder gone.
    app.explorer.reveal();
    expect(was()).toEqual(before);
    app.explorer.select("sub/s.md");
    expect(was()).toEqual(before);
    app.explorer.zoomTo(join(root, "sub"));
    expect(was()).toEqual(before);
    app.explorer.reveal(join(root, "a.md"), false, true);
    expect(was()).toEqual(before);
    app.explorer.zoomTo(join(root, "gone"));
    rmSync(join(root, "gone"), { recursive: true });
    app.explorer.invalidateTree();
    app.explorer.treeRows();
    expect(was()).toEqual(before);
  });

  test("a change opened up and selected, then edited: another change isn't taken for it", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    const { app, frame } = await panel(root);
    const changeAt = () => rowOf(app, (r) => r.kind === "change");
    app.git.opened.add("unstaged:a.md");
    expect(await until(() => (frame(), changeAt() >= 0))).toBe(true);
    app.gitPanel.select(changeAt());
    frame();
    // Its lines changed again, no frame since — the rows have the new change where the old one was: `s` stages
    // nothing, the change selected being gone.
    writeFileSync(join(root, "a.md"), "# A\n\nthree\n");
    await app.git.refreshNow();
    expect(
      await until(() => app.gitPanel.rows().some((r) => r.kind === "change" && r.change.now.includes("three"))),
    ).toBe(true);
    expect(app.gitPanel.rows()[app.sidebar.selected]?.kind).toBe("change");
    await app.gitPanel.action("stage");
    await Bun.sleep(300);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
  });
});
