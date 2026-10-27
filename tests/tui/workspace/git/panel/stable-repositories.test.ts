import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App } from "../../../../../src/tui/app/runtime/app.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { sandbox, git, until, panel, typed, rowOf } = makeGitPanelFixture();

describe("the repositories hold still as git answers: under the pointer, under the keys (#14)", () => {
  /** A folder of three repositories, alpha, beta and gamma, a note committed in each; in `group/` the ones named. */
  function folder(grouped: string[] = []): string {
    const root = mkdtempSync(join(sandbox, "folder-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const name of ["alpha", "beta", "gamma"]) {
      const at = join(root, grouped.includes(name) ? "group" : "", name);
      mkdirSync(at, { recursive: true });
      writeFileSync(join(at, "x.md"), "# X\n");
      git(at, "init", "-q", "-b", "main");
      git(at, "add", "-A");
      git(at, "commit", "-q", "-m", "x");
    }
    return root;
  }
  /** By what needs attention, the other way round from by name: gamma changed and its worktree too, beta changed. */
  const change = (root: string) => {
    writeFileSync(join(root, "gamma", "x.md"), "# X, changed\n");
    git(join(root, "gamma"), "worktree", "add", "-q", "-b", "agent", join(root, "gamma-agent"), "main");
    writeFileSync(join(root, "gamma-agent", "y.md"), "# Y\n");
    writeFileSync(join(root, "beta", "x.md"), "# X, changed\n");
  };
  /** The repositories' names, as the panel lists them. */
  const listed = (app: App) => app.gitPanel.rows().flatMap((r) => (r.kind === "repo" ? [r.repo.name] : []));
  /** git has answered for every checkout of every repository listed. */
  const answered = (app: App) =>
    app.gitPanel.rows().every((r) => r.kind !== "repo" || r.repo.checkouts.every((c) => app.gitPanel.repos.known(c)));
  /** The first frame that draws them, which asks git: nothing has answered yet (git answers in another turn). */
  async function drawnByName(app: App, frame: () => string, names = "alpha,beta,gamma") {
    expect(await until(() => (frame(), listed(app).join() === names))).toBe(true);
    expect(answered(app)).toBe(false);
  }
  /** Where the last frame drew the panel's row `i`, and what the screen says there. */
  const drawnAt = (app: App, frame: () => string, i: number) => {
    const at = app.geometry!.hot.find((h) => h.id === `git:row:${i}`)!;
    return { x: at.x + 2, y: at.y, text: frame().split("\n")[at.y] ?? "" };
  };
  const repoAt = (app: App, i: number) => {
    const r = app.gitPanel.rows()[i];
    return r?.kind === "repo" ? r.repo.name : r?.kind;
  };

  /** The pointer moved to `x`, `y`, as the terminal reports it. */
  const point = (app: App, x: number, y: number) => app.mouse.handle({ type: "move", x, y, button: 0 });
  /** The pointer off the panel, over the note. */
  const away = (app: App) => point(app, 100, 10);
  /** What the row selected is: a repository's name, a checkout's or a file's, or the kind of row. */
  const selected = (app: App) => {
    const r = app.gitPanel.rows()[app.sidebar.selected];
    return r?.kind === "repo"
      ? r.repo.name
      : r?.kind === "rcheckout" || r?.kind === "rfile"
        ? `${r.repo.name} ${r.kind}`
        : r?.kind;
  };

  test("the pointer on the panel's rows holds their order as git answers: the row under it stays, a click opens it", async () => {
    const root = folder();
    change(root);
    const { app, frame } = await panel(root);
    await drawnByName(app, frame);
    // The pointer on alpha's row, before git answers.
    const i = rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha");
    const alpha = (app.gitPanel.rows()[i] as { repo: { key: string } }).repo.key;
    const at = drawnAt(app, frame, i);
    point(app, at.x, at.y);
    expect(await until(() => (frame(), answered(app)))).toBe(true);
    // Every answer in, and drawn: alpha still under the pointer, on the screen as in the rows; a click opens alpha.
    expect([listed(app).join(), repoAt(app, i)]).toEqual(["alpha,beta,gamma", "alpha"]);
    expect(drawnAt(app, frame, i).text).toMatch(/[▸▾] alpha\b.*clean/);
    app.mouse.handle({ type: "down", x: at.x, y: at.y, button: 0 });
    app.mouse.handle({ type: "up", x: at.x, y: at.y, button: 0 });
    frame();
    expect([...app.gitPanel.repos.opened]).toEqual([alpha]);
    app.gitPanel.repos.opened.clear();
    // On a row's own button, and on the rows' empty space below the last, it holds them too.
    const go = app.geometry!.hot.find((h) => h.id === `git:act:${i}:go`)!;
    point(app, go.x, go.y);
    frame();
    expect(listed(app).join()).toBe("alpha,beta,gamma");
    const list = app.geometry!.gitRows!;
    point(app, list.x + 2, list.y + list.h - 1);
    frame();
    expect([app.mouse.hover, listed(app).join()]).toEqual([null, "alpha,beta,gamma"]);
    // The pointer off the rows: by what needs attention.
    away(app);
    frame();
    expect(listed(app).join()).toBe("gamma,beta,alpha");
    // Back on them, git's news holds too; the mouse turned off, nothing holds them.
    point(app, at.x, at.y);
    frame();
    writeFileSync(join(root, "alpha", "x.md"), "# X, changed\n");
    app.gitPanel.repos.again();
    const said = (name: string) =>
      app.gitPanel.rows().flatMap((r) => (r.kind === "repo" && r.repo.name === name ? [r.repo] : []))[0];
    expect(await until(() => (frame(), app.gitPanel.repos.summary(said("alpha")!)?.text === "✎1"))).toBe(true);
    expect(listed(app).join()).toBe("gamma,beta,alpha");
    app.ui.mouse = false;
    frame();
    expect(listed(app).join()).toBe("gamma,alpha,beta");
    // Turned on again, the pointer not reported since: where it was doesn't hold them — gamma clean, it goes last.
    app.ui.mouse = true;
    frame();
    git(join(root, "gamma"), "checkout", "--", "x.md");
    rmSync(join(root, "gamma-agent", "y.md"));
    app.gitPanel.repos.again();
    expect(await until(() => (frame(), app.gitPanel.repos.summary(said("gamma")!)?.text === "clean"))).toBe(true);
    frame();
    expect(listed(app).join()).toBe("alpha,beta,gamma");
  });

  test("a pointer last reported before the panel showed doesn't hold its rows until it moves", async () => {
    const root = folder();
    change(root);
    const { app, frame } = await panel(root, "a.md", false);
    // The pointer over the left panel while it's the explorer; then the git panel, by keys, its rows there.
    app.panels.openLeftView("explorer");
    frame();
    point(app, 6, 20);
    await app.run("git.view");
    await drawnByName(app, frame);
    expect(app.mouse.over(app.geometry!.gitRows)).toBe(true);
    // git answers: sorted, the pointer never having moved over them.
    expect(await until(() => (frame(), answered(app)))).toBe(true);
    frame();
    expect(listed(app).join()).toBe("gamma,beta,alpha");
  });

  test("the row under a still pointer changing as they're sorted, the frame asks to be drawn again, by the row there", async () => {
    const root = folder();
    change(root);
    const { app, frame } = await panel(root);
    await drawnByName(app, frame);
    // The pointer where alpha's row is, by name, reported with the panel closed: it holds nothing once it's back.
    const y = drawnAt(
      app,
      frame,
      rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha"),
    ).y;
    await app.run("git.view");
    frame();
    point(app, 10, y);
    await app.run("git.view");
    frame();
    expect(await until(() => answered(app))).toBe(true);
    // The frame that sorts them: gamma comes under the pointer, at alpha's index, so it asks for another frame.
    let renders = 0;
    app.host.requestRender = () => void renders++;
    frame();
    expect([listed(app).join(), repoAt(app, 1), renders]).toEqual(["gamma,beta,alpha", "gamma", 1]);
    frame();
    expect(app.geometry!.hot.some((h) => h.id === "git:act:1:go")).toBe(true);
  });

  test("between frames nothing moves: git's answers sort them for the next frame drawn, not for a key or a click", async () => {
    const root = folder();
    change(root);
    const { app, frame } = await panel(root);
    await drawnByName(app, frame);
    const i = rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha");
    const at = drawnAt(app, frame, i);
    // Every answer in, no frame drawn since: the rows as drawn, and a click where alpha was drawn opens alpha.
    expect(await until(() => answered(app))).toBe(true);
    expect(listed(app).join()).toBe("alpha,beta,gamma");
    app.mouse.handle({ type: "down", x: at.x, y: at.y, button: 0 });
    app.mouse.handle({ type: "up", x: at.x, y: at.y, button: 0 });
    expect(app.gitPanel.rows()[i]).toMatchObject({ kind: "repo", repo: { name: "alpha" }, open: true });
    // The pointer off the rows: the next frame sorts them.
    away(app);
    frame();
    expect(listed(app).join()).toBe("gamma,beta,alpha");
  });

  test("the selection stays on its repository as they're sorted again: a repository's row, a checkout's, a file's", async () => {
    const root = folder();
    change(root);
    const { app, frame, keys } = await panel(root);
    await drawnByName(app, frame);
    const s = app.sidebar;
    // alpha, the first row, chosen before git answers (j then k, no frame between), the pointer nowhere near: sorted
    // as git answers, alpha selected still.
    await app.gitPanel.action("down");
    await app.gitPanel.action("up");
    frame();
    expect(selected(app)).toBe("alpha");
    expect(await until(() => (frame(), answered(app)))).toBe(true);
    frame();
    expect([listed(app).join(), selected(app)]).toEqual(["gamma,beta,alpha", "alpha"]);
    await keys("enter");
    expect(app.gitPanel.repos.opened.size).toBe(1);
    expect(app.gitPanel.rows()[s.selected]).toMatchObject({ kind: "repo", repo: { name: "alpha" }, open: true });
    // Its checkout selected; alpha changed, and asked again: alpha before beta now, its checkout selected still.
    await keys("j");
    expect(selected(app)).toBe("alpha rcheckout");
    writeFileSync(join(root, "alpha", "x.md"), "# X, changed\n");
    app.gitPanel.repos.again();
    expect(await until(() => (frame(), listed(app).join() === "gamma,alpha,beta"))).toBe(true);
    expect(selected(app)).toBe("alpha rcheckout");
    // Its file selected; gamma clean again, and asked again: alpha first, its file selected still.
    await keys("j");
    expect(selected(app)).toBe("alpha rfile");
    git(join(root, "gamma"), "checkout", "--", "x.md");
    rmSync(join(root, "gamma-agent", "y.md"));
    app.gitPanel.repos.again();
    expect(await until(() => (frame(), listed(app).join() === "alpha,beta,gamma"))).toBe(true);
    expect(selected(app)).toBe("alpha rfile");
  });

  test("a repository followed out of view is scrolled to", async () => {
    const root = folder();
    change(root);
    // beta's forty new files, listed when it's opened up: more rows than the panel shows.
    for (let i = 0; i < 40; i++) writeFileSync(join(root, "beta", `n${String(i).padStart(2, "0")}.md`), "# N\n");
    const { app, frame } = await panel(root);
    await drawnByName(app, frame);
    // The pointer on the rows, beta opened up as git answers: by name still, beta's files under it, gamma last.
    const at = drawnAt(
      app,
      frame,
      rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha"),
    );
    point(app, at.x, at.y);
    app.gitPanel.repos.opened.add(
      (app.gitPanel.rows()[rowOf(app, (r) => r.kind === "repo" && r.repo.name === "beta")] as { repo: { key: string } })
        .repo.key,
    );
    expect(
      await until(
        () => (frame(), answered(app) && app.gitPanel.rows().filter((r) => r.kind === "rfile").length === 41),
      ),
    ).toBe(true);
    // gamma selected by a key, at the bottom, and drawn there.
    const s = app.sidebar;
    app.gitPanel.select(
      rowOf(app, (r) => r.kind === "repo" && r.repo.name === "gamma"),
      undefined,
      true,
    );
    frame();
    expect([selected(app), s.scroll > 0]).toEqual(["gamma", true]);
    expect(app.geometry!.hot.some((h) => h.id === `git:row:${s.selected}`)).toBe(true);
    // The pointer gone: sorted, gamma first; selected still, and scrolled to.
    away(app);
    frame();
    expect([listed(app).join(), selected(app), s.selected, s.scroll <= 1]).toEqual([
      "gamma,beta,alpha",
      "gamma",
      1,
      true,
    ]);
    expect(app.geometry!.hot.some((h) => h.id === `git:row:${s.selected}`)).toBe(true);
  });

  test("the panel's own pick stays where it put it: the first row when it opens, the filter's first match", async () => {
    const root = folder();
    change(root);
    const { app, frame, keys } = await panel(root);
    // Opened, the first row selected, alpha before git answers; the filter opened and closed, and the panel left by
    // esc, which pick no row; once sorted, the first row still: gamma.
    await drawnByName(app, frame);
    expect(selected(app)).toBe("alpha");
    await keys("/", "escape", "escape");
    expect(app.region).toBe("content");
    // Keys of the panel's own, acting on no row (fetch, a new branch: here, neither), leave it there too.
    await app.gitPanel.action("fetch");
    await app.gitPanel.action("new_branch");
    expect(await until(() => (frame(), answered(app)))).toBe(true);
    frame();
    expect([listed(app).join(), selected(app)]).toEqual(["gamma,beta,alpha", "gamma"]);
    app.region = "sidebar";
    // Filtered to alpha with the pointer on the rows (low in them: the filter's line pushes them down), then not: the
    // others in their places, the first selected.
    const list = app.geometry!.gitRows!;
    point(app, list.x + 2, list.y + list.h - 1);
    await keys("/", ...typed("al"));
    expect([listed(app).join(), selected(app)]).toEqual(["alpha", "alpha"]);
    await keys("backspace", "backspace");
    expect([listed(app).join(), selected(app)]).toEqual(["gamma,beta,alpha", "gamma"]);
  });

  test("the panel's own pick clicked, by either button, or opened by enter is the user's: it follows as they're sorted", async () => {
    for (const how of ["click", "right click", "enter"]) {
      const root = folder();
      change(root);
      const { app, frame, keys } = await panel(root);
      await drawnByName(app, frame);
      // alpha, the first row, the panel's pick, clicked before git answers (opened up, or its menu, closed), the
      // pointer staying a while; or opened up by enter, the pointer on the rows from before.
      const at = drawnAt(
        app,
        frame,
        rowOf(app, (r) => r.kind === "repo" && r.repo.name === "alpha"),
      );
      const button = how === "right click" ? 2 : 0;
      if (how === "enter") {
        point(app, at.x, at.y);
        await keys("enter");
      } else {
        app.mouse.handle({ type: "down", x: at.x, y: at.y, button });
        app.mouse.handle({ type: "up", x: at.x, y: at.y, button });
      }
      if (how === "right click") {
        expect(app.overlay?.kind).toBe("list");
        await keys("escape");
      }
      expect(await until(() => (frame(), answered(app)))).toBe(true);
      expect([listed(app).join(), selected(app)]).toEqual(["alpha,beta,gamma", "alpha"]);
      // The pointer gone: sorted, alpha selected still.
      away(app);
      frame();
      expect([how, listed(app).join(), selected(app)]).toEqual([how, "gamma,beta,alpha", "alpha"]);
    }
  });

  test("another view isn't held to the order drawn for the last, even under the pointer", async () => {
    // group/ holds alpha (clean) and beta (changed); gamma beside it, changed, its worktree too: the most to review.
    const root = folder(["alpha", "beta"]);
    writeFileSync(join(root, "group", "beta", "x.md"), "# X, changed\n");
    writeFileSync(join(root, "gamma", "x.md"), "# X, changed\n");
    git(join(root, "gamma"), "worktree", "add", "-q", "-b", "agent", join(root, "gamma-agent"), "main");
    writeFileSync(join(root, "gamma-agent", "y.md"), "# Y\n");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), listed(app).join() === "gamma,beta,alpha" && answered(app)))).toBe(true);
    // The view zoomed into group/, the pointer on its rows.
    app.explorer.zoomTo(join(root, "group"));
    expect(await until(() => (frame(), listed(app).join() === "beta,alpha"))).toBe(true);
    const at = drawnAt(
      app,
      frame,
      rowOf(app, (r) => r.kind === "repo"),
    );
    point(app, at.x, at.y);
    frame();
    // Zoomed out again, the pointer where it was: the folder's list by what needs attention, gamma first.
    app.explorer.zoomTo(root);
    expect(await until(() => (frame(), listed(app).length === 3))).toBe(true);
    expect(listed(app).join()).toBe("gamma,beta,alpha");
  });
});
