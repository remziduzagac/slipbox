// The git panel (GIT-D8): its message box, its buttons and rows by mouse, its footer, what the branch changed — on an
// App drawn to a text canvas, driven by keys and by the mouse's events, as the terminal sends them to it.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonKey } from "../src/core/commands.ts";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { attention } from "../src/core/gitrepos.ts";
import { locateVault } from "../src/core/vault.ts";
import { App, type ListOverlay } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { pointedAt } from "../src/tui/gitmouse.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-gitpanel-"));
const saved = { ...process.env };
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data");
process.env.SLIPBOX_CLIPBOARD = "file";
delete process.env.SLIPBOX_CONFIG;
afterAll(() => {
  for (const k of ["XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "SLIPBOX_CLIPBOARD"])
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  rmSync(sandbox, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args], {
    encoding: "utf8",
  }).stdout;

/** A repository of two notes, committed on main; `feature` a branch with a commit of its own, checked out. */
function repo(): string {
  const root = mkdtempSync(join(sandbox, "repo-"));
  mkdirSync(join(root, ".slipbox"));
  writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
  writeFileSync(join(root, "a.md"), "# A\n\none\n");
  writeFileSync(join(root, "b.md"), "# B\n");
  git(root, "init", "-q", "-b", "main");
  // Who commits from the app: git won't without a name.
  git(root, "config", "user.email", "t@example.invalid");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "start");
  git(root, "switch", "-q", "-c", "feature");
  writeFileSync(join(root, "c.md"), "# C\n");
  git(root, "add", "c.md");
  git(root, "commit", "-q", "-m", "c");
  return root;
}

const until = async (ok: () => boolean, ms = 10_000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

/** The app on `root`, `open` open, the git panel open and focused (unless `show` is false), git's answer in. */
async function panel(root: string, open: string | null = "a.md", show = true) {
  const config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.lint.enabled = "off";
  config.search.engine = "scan";
  config.index.background = false;
  config.render.glyphs = "unicode";
  config.ui.sidebar_width = 44;
  const loc = locateVault({ root });
  const app = new App({
    loc,
    config,
    graph: openGraph(loc, config, false),
    host: { requestRender() {}, osc52: () => true, quit: () => {}, fetch: () => Promise.reject(new Error("no")) },
    open,
    watch: false,
  });
  const frame = () => {
    const c = new TextCanvas(140, 40);
    app.draw(c);
    return c.toString();
  };
  const keys = async (...ks: string[]) => {
    for (const k of ks) {
      await app.input.handleKey(canonKey(k));
      frame();
    }
  };
  /** A click where the last frame drew the hot region `id`: SGR's press and release, button 0 (2 the right one). */
  const click = (id: string, button = 0) => {
    frame();
    const h = app.geometry!.hot.find((x) => x.id === id);
    expect(h).toBeDefined();
    app.mouse.handle({ type: "down", x: h!.x, y: h!.y, button });
    app.mouse.handle({ type: "up", x: h!.x, y: h!.y, button });
    frame();
  };
  if (show) await app.run("git.view");
  await app.git.refreshNow();
  frame();
  return { app, frame, keys, click };
}

/** Typed, a key a character (a space by its name). */
const typed = (text: string) => [...text].map((c) => (c === " " ? "space" : c));

/** The panel's row of a kind and label (or a file's path), by its index. */
const rowOf = (app: App, test: (r: ReturnType<App["gitPanel"]["rows"]>[number]) => boolean) =>
  app.gitPanel.rows().findIndex(test);

describe("the git panel by mouse as by keys (GIT-D8)", () => {
  test("the message box: i types in it, ctrl+enter commits what's staged with it, and it's empty again", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    git(root, "add", "a.md");
    const { app, keys, frame } = await panel(root);
    expect(frame()).toContain("ctrl+enter commits");
    await keys("i", ..."Say two".split("").map((c) => (c === " " ? "space" : c)));
    expect([app.gitPanel.typing, app.gitPanel.message]).toEqual([true, "Say two"]);
    expect(frame()).toContain("Say two");
    await keys("ctrl+enter");
    expect(await until(() => git(root, "log", "-1", "--format=%s").trim() === "Say two")).toBe(true);
    expect(await until(() => app.gitPanel.message === "" && !app.gitPanel.typing)).toBe(true);
    // git's status after the commit, in: nothing staged now (on a slow machine it comes after the box empties).
    expect(await until(() => app.git.entries?.length === 0)).toBe(true);
    // enter takes a message to the floating editor, the text it had there to go on with.
    await keys("i", "x", "enter");
    expect(app.gitPanel.typing).toBe(false);
    // Nothing staged: said, no editor.
    expect(app.messages.at(-1)?.text).toBe("nothing staged — s stages a file in the git panel (space g)");
  });

  test("a line starting with # is the message's own: the box commits it as typed; the editor's guide starts with ; then", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    git(root, "add", "a.md");
    const { app, keys } = await panel(root);
    await keys("i", ...typed("#12 fix the link"), "ctrl+enter");
    expect(await until(() => git(root, "log", "-1", "--format=%s").trim() === "#12 fix the link")).toBe(true);
    expect(await until(() => app.gitPanel.message === "" && app.git.entries?.length === 0)).toBe(true);
    // Amended in the editor: the message to start from has a # line, so the guide's lines start with ; instead.
    await keys("shift+c");
    expect(app.floating?.kind).toBe("commit");
    const text = app.floating!.view.buf.source;
    expect(text).toStartWith("#12 fix the link\n\n; Amending the last commit: 0 files staged.\n");
    expect(text).toContain("; Lines starting with ; are left out.");
    await keys("ctrl+s");
    expect(await until(() => app.floating === null)).toBe(true);
    expect(git(root, "log", "-1", "--format=%B").trim()).toBe("#12 fix the link");
  });

  test("u on a staged rename unstages it whole: its old path back, the new one untracked", async () => {
    const root = repo();
    git(root, "mv", "b.md", "d.md");
    const { app, keys } = await panel(root);
    const i = rowOf(app, (r) => r.kind === "file" && r.section === "staged" && r.entry.path === "d.md");
    expect(i).toBeGreaterThanOrEqual(0);
    app.sidebar.selected = i;
    await keys("u");
    expect(await until(() => git(root, "status", "--porcelain") === " D b.md\n?? d.md\n")).toBe(true);
  });

  test("a row's buttons under the pointer: + stages, − unstages; the footer says the button's key and what it does", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    const { app, click, frame } = await panel(root);
    const i = rowOf(app, (r) => r.kind === "file" && r.entry.path === "a.md");
    app.mouse.hover = `git:row:${i}`;
    frame();
    expect(pointedAt(app, `git:act:${i}:stage`)).toEqual({ key: "s", desc: "stages it" });
    app.mouse.hover = `git:act:${i}:stage`;
    expect(frame()).toContain("s stages it");
    click(`git:act:${i}:stage`);
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "a.md\n")).toBe(true);
    await app.git.refreshNow();
    const j = rowOf(app, (r) => r.kind === "file" && r.section === "staged");
    app.mouse.hover = `git:row:${j}`;
    click(`git:act:${j}:unstage`);
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "")).toBe(true);
    // A heading's buttons are always there: Changes' + stages its files.
    await app.git.refreshNow();
    const h = rowOf(app, (r) => r.kind === "heading" && r.section === "unstaged");
    click(`git:act:${h}:stage`);
    expect(await until(() => git(root, "diff", "--cached", "--name-only") === "a.md\n")).toBe(true);
    // A button at the top says its key under the pointer.
    expect(pointedAt(app, "git:btn:amend")).toEqual({
      key: "shift+c",
      desc: "Amend: amends the last commit with what's staged",
    });
  });

  test("a click on a file shows its diff, esc back to the panel; a right click, its menu; a heading clicked folds", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\ntwo\n");
    const { app, click } = await panel(root);
    const i = rowOf(app, (r) => r.kind === "file" && r.entry.path === "a.md");
    click(`git:row:${i}`);
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe("a.md against what's staged — esc: source control");
    await app.input.handleKey("escape");
    expect([app.floating, app.region]).toEqual([null, "sidebar"]);
    click(`git:row:${i}`, 2);
    const menu = app.overlay as ListOverlay;
    expect(menu.items.map((it) => it.label)).toEqual([
      "Stage",
      "Discard…",
      "Its diff",
      "Open it",
      "Show it in the explorer",
      "A note for the agent…",
      "Copy its path",
    ]);
    await app.input.handleKey("escape");
    const h = rowOf(app, (r) => r.kind === "heading" && r.section === "unstaged");
    click(`git:row:${h}`);
    expect(app.gitPanel.folded.has("unstaged")).toBe(true);
    expect(rowOf(app, (r) => r.kind === "file")).toBe(-1);
  });

  test("a branch committed and clean: nothing uncommitted, This branch against main its files, a click its diff", async () => {
    const root = repo();
    const { app, frame, click } = await panel(root);
    expect(await until(() => (frame(), rowOf(app, (r) => r.kind === "ahead") >= 0))).toBe(true);
    const rows = app.gitPanel.rows();
    expect(rows.some((r) => r.kind === "note" && r.text === "nothing uncommitted")).toBe(true);
    expect(rows.find((r) => r.kind === "heading" && r.section === "ahead")).toMatchObject({
      label: "This branch against main (1)",
    });
    const i = rowOf(app, (r) => r.kind === "ahead" && r.file.path === "c.md");
    click(`git:row:${i}`);
    expect(app.floating?.title).toBe("c.md against main — esc: source control");
    // On the base itself: none.
    git(root, "switch", "-q", "main");
    app.git.checkHead();
    await app.git.refreshNow();
    expect(await until(() => (frame(), rowOf(app, (r) => r.kind === "ahead") < 0))).toBe(true);
  });

  test("This branch's files marked as the explorer marks them: its letter, in its colour", async () => {
    const root = repo();
    git(root, "mv", "b.md", "e.md");
    git(root, "commit", "-q", "-m", "e");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), rowOf(app, (r) => r.kind === "ahead" && r.file.path === "e.md") >= 0))).toBe(
      true,
    );
    const c = new TextCanvas(140, 40);
    app.draw(c);
    const drawn = (text: string) => {
      const y = c.rows.findIndex((r) => r.join("").includes(text));
      expect(y).toBeGreaterThanOrEqual(0);
      return c.styles[y]![c.rows[y]!.join("").indexOf(text)]!.fg;
    };
    expect(drawn("+ c.md")).toBe(app.theme.roles.git_new.fg!);
    expect(drawn("R e.md")).toBe(app.theme.roles.git_modified.fg!);
  });
});

describe("space g, the status line's branch, a change's sign (GIT-D8, GIT-D12)", () => {
  test("space g opens the git panel and focuses it; again, closes it", async () => {
    const root = repo();
    const { app, keys } = await panel(root, "a.md", false);
    expect(app.panels.sidebarShown && app.leftView === "git").toBe(false);
    await keys("space", "g");
    expect([app.leftView, app.region, app.panels.sidebarShown]).toEqual(["git", "sidebar", true]);
    await keys("space", "g");
    expect(app.panels.sidebarShown).toBe(false);
  });

  test("the status line's vault and branch clicked: push and fetch, then the branches; one picked, checked out", async () => {
    const root = repo();
    const { app, click } = await panel(root, "a.md", false);
    click("status:branch");
    const list = app.overlay as ListOverlay;
    expect(list.title).toStartWith("Branches (2)");
    expect(list.items.map((i) => i.label)).toEqual([
      "↑ Push, and track it on origin",
      "Fetch",
      "The git panel",
      "feature",
      "main",
      "A new branch from here…",
    ]);
    list.selected = list.filtered.findIndex((f) => f.item.label === "main");
    await app.input.handleKey("enter");
    expect(git(root, "branch", "--show-current")).toBe("main\n");
  });

  test("a change's sign clicked: the change, with Revert and Stage; Stage stages that change alone", async () => {
    const root = repo();
    writeFileSync(join(root, "a.md"), "# A\n\nONE\n\nmore\n");
    const { app, click, frame } = await panel(root, "a.md", false);
    const view = app.view!;
    expect(await until(() => (frame(), (app.git.changesOf(view)?.length ?? 0) > 0))).toBe(true);
    const sign = () => app.geometry!.hot.find((h) => h.id.startsWith("gsign:"))?.id;
    expect(await until(() => (frame(), !!sign()))).toBe(true);
    click(sign()!);
    const menu = app.overlay as ListOverlay;
    expect(menu.title).toBe("lines 3–5, against what's staged");
    expect(menu.items.map((i) => i.label)).toEqual(["Revert it", "Stage it", "- one", "+ ONE", "+ ", "+ more"]);
    await app.input.handleKey("s");
    expect(git(root, "show", ":a.md")).toBe("# A\n\nONE\n\nmore\n");
  });
});

describe("the branches (GIT-D9, GIT-D10, GIT-D13)", () => {
  /** A worktree for `branch`, made from `from`, beside the repository; its commit, `commit`. */
  const worktree = (root: string, branch: string, from: string, commit = false) => {
    const at = `${root}-${branch.replace(/\//g, "-")}`;
    git(root, "worktree", "add", "-q", "-b", branch, at, from);
    if (commit) {
      writeFileSync(join(at, "w.md"), "# W\n");
      git(at, "add", "w.md");
      git(at, "commit", "-q", "-m", "w");
    }
    return at;
  };
  const branchRow = (app: App, name: string) => rowOf(app, (r) => r.kind === "branch" && r.branch.name === name);

  test("this branch, then the worktrees', then the rest; merged ones folded; / filters; opened up, its buttons and files", async () => {
    const root = repo();
    git(root, "branch", "merged-one", "main");
    const at = worktree(root, "agent/a", "main", true);
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), branchRow(app, "agent/a") >= 0))).toBe(true);
    const names = () =>
      app.gitPanel
        .rows()
        .filter((r) => r.kind === "branch" || (r.kind === "heading" && r.section === "older"))
        .map((r) => (r.kind === "branch" ? r.branch.name : "(older)"));
    expect(await until(() => (frame(), names().join() === "feature,agent/a,main,(older)"))).toBe(true);
    // Folded: the merged one; unfolded, it's there.
    app.sidebar.selected = rowOf(app, (r) => r.kind === "heading" && r.section === "older");
    await keys("enter");
    expect(names()).toEqual(["feature", "agent/a", "main", "(older)", "merged-one"]);
    // / filters by name.
    await keys("/", ...typed("agent"));
    expect(names()).toEqual(["agent/a"]);
    await keys("enter");
    // Opened up in place (enter kept the filter): its folder, its buttons, its files against its base.
    expect(await until(() => (frame(), app.gitPanel.rows().some((r) => r.kind === "bfile")))).toBe(true);
    const rows = app.gitPanel.rows();
    expect(rows.find((r) => r.kind === "bline")).toMatchObject({ gone: false });
    expect(rows.find((r) => r.kind === "bbuttons")).toMatchObject({
      buttons: [
        { action: "go", label: "Open" },
        { action: "merge", label: "Merge…" },
        { action: "remove", label: "Remove…" },
      ],
    });
    expect(rows.filter((r) => r.kind === "bfile").map((r) => (r.kind === "bfile" ? r.path : ""))).toEqual(["w.md"]);
    expect(at).toBeTruthy();
  });

  test("a branch made from another in a new worktree beside the repository, measured against what it was made from", async () => {
    const root = repo();
    git(root, "branch", "dev", "main");
    git(root, "switch", "-q", "dev");
    writeFileSync(join(root, "d.md"), "# D\n");
    git(root, "add", "d.md");
    git(root, "commit", "-q", "-m", "d");
    git(root, "switch", "-q", "feature");
    const { app, frame, keys } = await panel(root);
    await keys("n", ...typed("agent/cache"), "enter");
    expect((app.overlay as ListOverlay).title).toBe("agent/cache: from where?");
    await keys(...typed("dev"), "enter");
    expect((app.overlay as ListOverlay).title).toBe("agent/cache from dev: where?");
    await keys("enter");
    const folder = `${root}-agent-cache`;
    expect(git(folder, "branch", "--show-current")).toBe("agent/cache\n");
    // Its base is dev, kept — [git] bases names main alone.
    writeFileSync(join(folder, "w.md"), "# W\n");
    git(folder, "add", "w.md");
    git(folder, "commit", "-q", "-m", "w");
    await app.git.refreshNow();
    const stats = () => {
      const b = app.gitPanel.rows().find((r) => r.kind === "branch" && r.branch.name === "agent/cache");
      return b?.kind === "branch" ? app.gitPanel.branches.statsOf(b.branch) : null;
    };
    expect(await until(() => (frame(), stats()?.base === "dev" && stats()?.ahead === 1))).toBe(true);
    expect(frame()).toContain("↑1 on dev");
  });

  test("Remove…: refused for one not merged, and for one with uncommitted files; a merged one removed after asking; a gone one pruned", async () => {
    const root = repo();
    const ahead = worktree(root, "agent/ahead", "main", true);
    const done = worktree(root, "agent/done", "main");
    const gone = worktree(root, "agent/gone", "main");
    const { app, frame } = await panel(root);
    const branch = (name: string) => {
      const r = app.gitPanel.rows().find((x) => x.kind === "branch" && x.branch.name === name);
      return r?.kind === "branch" ? r.branch : null;
    };
    expect(await until(() => (frame(), !!branch("agent/done")))).toBe(true);
    const said = (text: string) => until(() => app.messages.at(-1)?.text.startsWith(text) ?? false);
    app.gitPanel.branches.button(branch("agent/ahead")!, "remove");
    expect(await said("not removed: agent/ahead isn't merged into main — 1 commit of its own")).toBe(true);
    writeFileSync(join(done, "notes.md"), "notes\n");
    app.gitPanel.branches.button(branch("agent/done")!, "remove");
    expect(await said(`not removed: ${done} has 1 uncommitted file`)).toBe(true);
    rmSync(join(done, "notes.md"));
    app.gitPanel.branches.button(branch("agent/done")!, "remove");
    expect(await until(() => (app.overlay as ListOverlay | null)?.title === `Remove the worktree ${done}?`)).toBe(true);
    await app.input.handleKey("enter");
    expect(await said(`removed the worktree ${done}; agent/done kept`)).toBe(true);
    expect([existsSync(done), git(root, "branch", "--list", "agent/done")]).toEqual([false, "  agent/done\n"]);
    expect(existsSync(ahead)).toBe(true);
    // Gone by hand: marked, and pruned.
    rmSync(gone, { recursive: true, force: true });
    await app.git.refreshNow();
    expect(await until(() => (frame(), branch("agent/gone")?.worktree?.gone === true))).toBe(true);
    app.gitPanel.branches.button(branch("agent/gone")!, "prune");
    expect(git(root, "worktree", "list")).not.toContain("agent-gone");
  });
});

describe("the repositories in the view (VV-D10)", () => {
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

describe("the repositories by what needs attention (VV-D10)", () => {
  const state = (entries: number, ahead = 0) => ({
    branch: "main",
    entries: Array.from({ length: entries }, (_, i) => ({ path: `f${i}`, x: " ", y: "M" })),
    track: { branch: "main", upstream: "origin/main", ahead, behind: 0, gone: false },
  });
  test("a worktree's work to review, then changes, then ahead or behind, then clean; not asked, last", () => {
    expect(attention([state(0), state(2)])).toBe(4);
    expect(attention([state(3), state(0)])).toBe(3);
    expect(attention([state(0, 1)])).toBe(2);
    expect(attention([state(0)])).toBe(1);
    expect(attention([null, undefined])).toBe(0);
  });
});

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
    // The note on screen is in conflict: it's the one.
    expect(app.floating?.kind).toBe("merge");
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
    const { app, click, frame } = await panel(root, "b.md");
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
    click("git:btn:abort");
    expect(await until(() => (frame(), !ids().includes("abort")))).toBe(true);
    expect(git(root, "rev-parse", "HEAD")).toBe(was);
    expect(ids()).not.toContain("continue");
    expect(ids()).not.toContain("resolve");
    // Again; Skip clicked: the conflicting commit left out, the rest rebased.
    git(root, "-c", "merge.conflictStyle=merge", "rebase", "-q", "main");
    await app.git.refreshNow();
    expect(await until(() => (frame(), ids().includes("skip")))).toBe(true);
    click("git:btn:skip");
    expect(await until(() => (frame(), !ids().includes("skip")))).toBe(true);
    expect(git(root, "log", "--format=%s", "main..feature")).toBe("c\n");
  });

  test("a merge under way: Continue and Abort, no Skip; Abort clicked, the merge given up", async () => {
    const root = conflicted();
    const { app, click, frame } = await panel(root, "c.md");
    const ids = () => app.gitPanel.buttons().map((b) => b.id);
    expect(ids()).toEqual(expect.arrayContaining(["resolve", "continue", "abort"]));
    expect(ids()).not.toContain("skip");
    expect(pointedAt(app, "git:btn:continue")?.desc).toBe("Continue: commits the merge");
    click("git:btn:abort");
    expect(await until(() => (frame(), !ids().includes("abort")))).toBe(true);
    expect(git(root, "status", "--porcelain")).toBe("");
  });
});
