// The git panel (GIT-D8): its message box, its buttons and rows by mouse, its footer, what the branch changed — on an
// App drawn to a text canvas, driven by keys and by the mouse's events, as the terminal sends them to it.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonKey } from "../src/core/commands.ts";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { keepBase, keptBases } from "../src/core/gitbase.ts";
import { attention } from "../src/core/gitrepos.ts";
import { setTrust } from "../src/core/trust.ts";
import { locateVault } from "../src/core/vault.ts";
import { App, type ListOverlay } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { type BranchList, type BranchViewRow, shownOn } from "../src/tui/gitbranchview.ts";
import type { Branch } from "../src/core/gitbranches.ts";
import { pointedAt } from "../src/tui/gitmouse.ts";
import { DIFF_MAX, readForDiff } from "../src/tui/gitview.ts";
import { reviewOf } from "../src/tui/review.ts";

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

  test("a CRLF checkout (eol=crlf): a file's diff against what's staged shows the line changed, not every line", async () => {
    const root = repo();
    writeFileSync(join(root, ".gitattributes"), "*.md text eol=crlf\n");
    writeFileSync(join(root, "n.md"), "one line\ntwo line\nthree line\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "n");
    // Checked out again: CRLF on disk, LF in git. One word changed.
    rmSync(join(root, "n.md"));
    git(root, "checkout", "--", "n.md");
    writeFileSync(join(root, "n.md"), "one line\r\ntwo lines\r\nthree line\r\n");
    expect(git(root, "status", "--porcelain", "--", "n.md")).toBe(" M n.md\n");
    const { app, click } = await panel(root);
    const i = rowOf(app, (r) => r.kind === "file" && r.entry.path === "n.md");
    click(`git:row:${i}`);
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    const w = app.floating?.kind === "diff" ? app.floating.diff : null;
    expect(w?.rows.filter((r) => r.kind === "-" || r.kind === "+").map((r) => `${r.kind} ${r.text}`)).toEqual([
      "- two line",
      "+ two lines",
    ]);
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
    // A click isn't a key: nothing waits for the diff git is read for, so the test does.
    click(`git:row:${i}`);
    expect(await until(() => app.floating?.title === "c.md against main — esc: source control")).toBe(true);
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
    // Checked out in the background: a big tree takes a while.
    expect(await until(() => git(root, "branch", "--show-current") === "main\n")).toBe(true);
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
  /** The branch of that name as the panel lists it; null while it doesn't. */
  const branchOf = (app: App, name: string) => {
    const r = app.gitPanel.rows()[branchRow(app, name)];
    return r?.kind === "branch" ? r.branch : null;
  };
  /** The open list's title; "" with none open. */
  const listTitle = (app: App) => (app.overlay as ListOverlay | null)?.title ?? "";
  /**
   * Whether what git answers in the background is drawn as it lands, not left to whatever draws next: each message said
   * and each list opened is numbered, and marks its turn before it's said or opened (a message asks for its own frame),
   * the marks gone with the turn's microtasks; a frame asked for while marked counts them drawn. The check returned waits for the last landing after `act` that `landed` picks (a
   * message's text, a list's title), so a progress message or a question before it, or an earlier one of the same words,
   * never counts for it.
   */
  const drawnAsItLands = (app: App) => {
    const landed: string[] = [];
    const drawn = new Set<number>();
    let turn: number[] = [];
    const land = (what: string) => {
      if (!turn.length)
        queueMicrotask(() => {
          turn = [];
        });
      turn.push(landed.push(what) - 1);
    };
    (app.host as { requestRender: () => void }).requestRender = () => {
      for (const i of turn) drawn.add(i);
    };
    const say = app.message.bind(app);
    app.message = (...m: Parameters<App["message"]>) => {
      land(m[1]);
      say(...m);
    };
    const open = app.overlays.openList.bind(app.overlays);
    app.overlays.openList = (...o: Parameters<App["overlays"]["openList"]>) => {
      land(o[0].title);
      open(...o);
    };
    return async (act: () => unknown, picks: (what: string) => boolean): Promise<boolean> => {
      const from = landed.length;
      await act();
      const at = () => landed.findLastIndex((w, i) => i >= from && picks(w));
      expect(await until(() => at() >= 0)).toBe(true);
      return drawn.has(at());
    };
  };

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
    expect(await until(() => app.messages.some((m) => m.text.startsWith("made agent/cache from dev")))).toBe(true);
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
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    const said = (text: string) => until(() => app.messages.at(-1)?.text.startsWith(text) ?? false);
    app.gitPanel.branches.button(branchOf(app, "agent/ahead")!, "remove");
    expect(await said("not removed: agent/ahead isn't merged into main — 1 commit of its own")).toBe(true);
    writeFileSync(join(done, "notes.md"), "notes\n");
    app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
    expect(await said(`not removed: ${done} has 1 uncommitted file`)).toBe(true);
    rmSync(join(done, "notes.md"));
    app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
    expect(await until(() => (app.overlay as ListOverlay | null)?.title === `Remove the worktree ${done}?`)).toBe(true);
    await app.input.handleKey("enter");
    expect(await said(`removed the worktree ${done}; agent/done kept`)).toBe(true);
    expect([existsSync(done), git(root, "branch", "--list", "agent/done")]).toEqual([false, "  agent/done\n"]);
    expect(existsSync(ahead)).toBe(true);
    // Gone by hand: marked, and pruned.
    rmSync(gone, { recursive: true, force: true });
    await app.git.refreshNow();
    expect(await until(() => (frame(), branchOf(app, "agent/gone")?.worktree?.gone === true))).toBe(true);
    app.gitPanel.branches.button(branchOf(app, "agent/gone")!, "prune");
    expect(git(root, "worktree", "list")).not.toContain("agent-gone");
  });

  test("Remove… names the ignored files the removal deletes too, notes first, never a busy folder's; none gone till asked", async () => {
    const root = repo();
    const done = worktree(root, "agent/done", "main");
    writeFileSync(join(root, ".git", "info", "exclude"), "local/\n.env\nnode_modules/\n");
    mkdirSync(join(done, "local"));
    mkdirSync(join(done, "node_modules"));
    for (const f of ["local/draft.md", ".env", "node_modules/m.md"]) writeFileSync(join(done, f), "x\n");
    const { app, frame } = await panel(root);
    const row = () => app.gitPanel.rows().find((x) => x.kind === "branch" && x.branch.name === "agent/done");
    expect(await until(() => (frame(), !!row()))).toBe(true);
    const r = row();
    if (r?.kind !== "branch") throw new Error("no branch row");
    app.gitPanel.branches.button(r.branch, "remove");
    expect(await until(() => (app.overlay as ListOverlay | null)?.title === `Remove the worktree ${done}?`)).toBe(true);
    const items = (app.overlay as ListOverlay).items;
    expect(items[0]!.detail).toBe("also deletes 1 ignored note and 1 other ignored file: local/draft.md, .env");
    expect(items[1]!.detail).toBe(
      "merged into main; also deletes 1 ignored note and 1 other ignored file: local/draft.md, .env",
    );
    expect(existsSync(join(done, "local", "draft.md"))).toBe(true);
  });

  test("Remove…'s refusal and question, and Merge…'s menu, come from git in the background: each drawn as it comes (regression)", async () => {
    // Found by the terminal checks: the refusal was said with no frame asked for, so it showed only once something
    // else drew — another answer, or the next key — and on a slow machine, not before the check gave up.
    const root = repo();
    worktree(root, "agent/ahead", "main", true);
    worktree(root, "agent/done", "main");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    const drawn = drawnAsItLands(app);
    const ahead = branchOf(app, "agent/ahead")!;
    expect(
      await drawn(
        () => app.gitPanel.branches.button(ahead, "remove"),
        (w) => w.startsWith("not removed:"),
      ),
    ).toBe(true);
    expect(
      await drawn(
        () => app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove"),
        (w) => w.startsWith("Remove the worktree"),
      ),
    ).toBe(true);
    await app.input.handleKey("escape");
    expect(
      await drawn(
        () => app.gitPanel.branches.button(ahead, "merge"),
        (w) => w === "Merge agent/ahead into main",
      ),
    ).toBe(true);
  });

  test("git refusing Open in a worktree, a new worktree, a removal asked for, a switch to a branch just made: each drawn as it comes (regression)", async () => {
    // Said once git had answered, in the background, with no frame asked for: shown only once something else drew.
    const root = repo();
    git(root, "branch", "loose", "feature");
    const done = worktree(root, "agent/done", "main");
    git(root, "worktree", "lock", done);
    // Where Open in a worktree and a new worktree go, as [git] worktrees says: taken, a file in each.
    for (const at of [`${root}-loose`, `${root}-agent-taken`]) {
      mkdirSync(at);
      writeFileSync(join(at, "x.md"), "x\n");
    }
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "loose") && !!branchOf(app, "agent/done")))).toBe(true);
    const refused = drawnAsItLands(app);

    app.gitPanel.branches.button(branchOf(app, "loose")!, "worktree");
    expect(listTitle(app)).toBe("The worktree's folder");
    expect(
      await refused(
        () => keys("enter"),
        (t) => t.startsWith("git:") && t.includes(`${root}-loose`),
      ),
    ).toBe(true);

    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/taken"), "enter", ...typed("main"), "enter");
    expect(listTitle(app)).toBe("agent/taken from main: where?");
    expect(
      await refused(
        () => keys("enter"),
        (t) => t.startsWith("git:") && t.includes(`${root}-agent-taken`),
      ),
    ).toBe(true);
    expect(git(root, "branch", "--list", "agent/taken")).toBe("");

    app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
    expect(await until(() => listTitle(app) === `Remove the worktree ${done}?`)).toBe(true);
    expect(
      await refused(
        () => keys("enter"),
        (t) => t.startsWith("git:") && t.includes("locked"),
      ),
    ).toBe(true);
    expect(existsSync(done)).toBe(true);

    // c.md is feature's, not main's: switching to a branch made from main would lose its change.
    writeFileSync(join(root, "c.md"), "# C, changed\n");
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/here"), "enter", ...typed("main"), "enter");
    expect(listTitle(app)).toBe("agent/here from main: where?");
    expect(
      await refused(
        () => keys("down", "down", "enter"),
        (t) => t.startsWith("agent/here made, but git:"),
      ),
    ).toBe(true);
    expect(git(root, "branch", "--list", "agent/here")).toBe("  agent/here\n");
    expect(git(root, "branch", "--show-current")).toBe("feature\n");
  });

  test("a new branch checked out here: made, switched to, said; Open in a worktree: made where [git] worktrees says, said, gone into", async () => {
    const root = repo();
    git(root, "branch", "loose", "feature");
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "loose")))).toBe(true);
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/here"), "enter", ...typed("main"), "enter");
    expect(listTitle(app)).toBe("agent/here from main: where?");
    await keys("down", "down", "enter");
    expect(
      await until(() => app.messages.some((m) => m.text === "made agent/here from main, and checked it out")),
    ).toBe(true);
    expect(git(root, "branch", "--show-current")).toBe("agent/here\n");

    app.gitPanel.branches.button(branchOf(app, "loose")!, "worktree");
    expect(listTitle(app)).toBe("The worktree's folder");
    await keys("enter");
    // By the folders' real paths: a temporary folder may be reached through a link (macOS's /var).
    const at = `${realpathSync(root)}-loose`;
    expect(await until(() => realpathSync(app.loc.root) === at)).toBe(true);
    expect(app.messages.some((m) => m.text.startsWith("loose is in a worktree at "))).toBe(true);
    expect(git(at, "branch", "--show-current")).toBe("loose\n");
    expect(app.tabView?.buf.rel).toBe("a.md");
  });

  /** The branch row selected, by its name; null on another kind of row. */
  const selectedBranch = (app: App) => {
    const r = app.gitPanel.rows()[app.sidebar.selected];
    return r?.kind === "branch" ? r.branch.name : null;
  };
  /** A branch as git last listed it, folded away or not. */
  const listedBranch = (app: App, name: string) =>
    app.gitPanel.branches.branches()?.branches.find((b) => b.name === name);

  test("the status line's switch, refused: drawn as git's answer lands", async () => {
    // c.md is feature's, not main's: switching to main would lose its change.
    const root = repo();
    writeFileSync(join(root, "c.md"), "# C, changed\n");
    const { app, keys } = await panel(root);
    const drawn = drawnAsItLands(app);
    app.git.openBranches();
    expect(listTitle(app).startsWith("Branches (")).toBe(true);
    expect(
      await drawn(
        () => keys(...typed("main"), "enter"),
        (w) => w.startsWith("git:") && w.includes("overwritten"),
      ),
    ).toBe(true);
    expect(git(root, "branch", "--show-current")).toBe("feature\n");
  });

  test("Remove it and the branch, the worktree removed but the branch refused: listed again at once, its worktree gone", async () => {
    const root = repo();
    const at = worktree(root, "agent/x", "main", true);
    // main moved on to agent/x: merged into its base, not into feature, here, which `git branch -d` asks of it.
    git(root, "branch", "-f", "main", "agent/x");
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/x")))).toBe(true);
    app.gitPanel.branches.button(branchOf(app, "agent/x")!, "remove");
    expect(await until(() => listTitle(app).startsWith("Remove the worktree"))).toBe(true);
    await keys("down", "enter");
    expect(await until(() => app.messages.some((m) => m.text.includes("the worktree is gone, the branch kept")))).toBe(
      true,
    );
    expect(existsSync(at)).toBe(false);
    expect(
      await until(() => (frame(), !!listedBranch(app, "agent/x") && !listedBranch(app, "agent/x")!.worktree)),
    ).toBe(true);
  });

  test("a new branch git won't switch to: made all the same, listed, opened up and selected", async () => {
    const root = repo();
    writeFileSync(join(root, "c.md"), "# C, changed\n");
    const { app, frame, keys } = await panel(root);
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/here"), "enter", ...typed("main"), "enter", "down", "down", "enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("agent/here made, but git:")))).toBe(true);
    expect(await until(() => (frame(), selectedBranch(app) === "agent/here"))).toBe(true);
    expect(app.gitPanel.branches.opened.has("agent/here")).toBe(true);
  });

  test("a new worktree git refuses once it's checked out (a hook, the vault trusted): the branch it leaves keeps its base, shown", async () => {
    const root = repo();
    hookSaysNo(root);
    const { app, frame, keys } = await panel(root);
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/hooked"), "enter", ...typed("main"), "enter", "enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("git:")))).toBe(true);
    // git made it, and its worktree, then said no: `git branch -D` can't delete a branch a worktree has.
    expect(git(root, "branch", "--list", "agent/hooked")).toBe("+ agent/hooked\n");
    expect(keptBases(app.git.checkout!)["agent/hooked"]).toBe("main");
    expect(await until(() => (frame(), selectedBranch(app) === "agent/hooked"))).toBe(true);
    // git's refusal said, nothing of it done.
    expect(app.messages.some((m) => m.text.startsWith("made agent/hooked"))).toBe(false);
  });

  test("a new branch made, in a new worktree or just made: opened up and selected once git lists it, unfolded to", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/fresh"), "enter", ...typed("main"), "enter", "enter");
    expect(await until(() => (frame(), selectedBranch(app) === "agent/fresh"))).toBe(true);
    // Just made from main, it's merged: folded with the older ones, unfolded to.
    expect(app.gitPanel.folded.has("older")).toBe(true);
    app.gitPanel.branches.newBranch();
    await keys(...typed("agent/plain"), "enter", ...typed("main"), "enter", "down", "down", "down", "enter");
    expect(await until(() => (frame(), selectedBranch(app) === "agent/plain"))).toBe(true);
    expect(app.gitPanel.folded.has("older")).toBe(false);
  });

  /**
   * The guard an answer in the background goes through (`BranchView.still`), counted: once it's been asked, git has
   * answered and the answer has been weighed — what a test of a late answer waits for, not a time.
   */
  const guarded = (app: App) => {
    const bv = app.gitPanel.branches as unknown as { still: (visit: number) => boolean };
    const still = bv.still.bind(bv);
    let asked = 0;
    bv.still = (visit) => (asked++, still(visit));
    return () => asked;
  };
  /** A vault of its own in the repository (`sub/`, by its `.obsidian`), committed: on every branch made from feature. */
  const withSub = (root: string) => {
    mkdirSync(join(root, "sub", ".obsidian"), { recursive: true });
    writeFileSync(join(root, "sub", ".obsidian", "app.json"), "{}\n");
    writeFileSync(join(root, "sub", "s.md"), "# S\n");
    git(root, "add", "sub");
    git(root, "commit", "-q", "-m", "sub");
    return join(root, "sub");
  };

  test("Remove…'s question and Merge…'s menu, git answering while a prompt is open: nothing pops up over it, its text kept", async () => {
    const root = repo();
    worktree(root, "agent/done", "main");
    worktree(root, "agent/ahead", "main", true);
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done") && !!branchOf(app, "agent/ahead")))).toBe(true);
    const weighed = guarded(app);
    let lists = 0;
    const open = app.overlays.openList.bind(app.overlays);
    app.overlays.openList = (...o: Parameters<App["overlays"]["openList"]>) => {
      lists++;
      open(...o);
    };
    for (const [name, action] of [
      ["agent/done", "remove"],
      ["agent/ahead", "merge"],
    ] as const) {
      const before = weighed();
      app.gitPanel.branches.button(branchOf(app, name)!, action);
      app.overlays.prompt("typed meanwhile: ", () => {});
      const o = app.overlay;
      if (o?.kind === "prompt") o.text = "half typed";
      // git has answered, and the answer been weighed: no list over the prompt.
      expect(await until(() => weighed() > before)).toBe(true);
      expect(lists).toBe(0);
      expect(app.overlay?.kind === "prompt" && app.overlay.text).toBe("half typed");
      await app.input.handleKey("escape");
    }
  });

  test("a removal done once another vault is gone into: the branch of that name opened up there stays opened up", async () => {
    const root = repo();
    const sub = withSub(root);
    worktree(root, "agent/done", "main");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    const say = app.message.bind(app);
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      // Gone into sub/ as git is asked to remove it, and agent/done opened up there.
      if (m[1].startsWith("removing the worktree ")) {
        app.vaults.switchVault(locateVault({ root: sub }), null);
        app.gitPanel.branches.opened.add("agent/done");
      }
    };
    app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
    expect(await until(() => listTitle(app).startsWith("Remove the worktree"))).toBe(true);
    await app.input.handleKey("enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("removed the worktree ")))).toBe(true);
    expect(app.gitPanel.branches.opened.has("agent/done")).toBe(true);
  });

  test("Remove…'s question and Merge…'s menu, another vault gone into before git answers: nothing opens there", async () => {
    const root = repo();
    const sub = withSub(root);
    worktree(root, "agent/done", "main");
    worktree(root, "agent/ahead", "main", true);
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done") && !!branchOf(app, "agent/ahead")))).toBe(true);
    const weighed = guarded(app);
    for (const [name, action] of [
      ["agent/done", "remove"],
      ["agent/ahead", "merge"],
    ] as const) {
      // In the repository again (no watcher here: git asked by hand, as gone into).
      expect(app.vaults.switchVault(locateVault({ root }), null)).toBe(true);
      await app.git.refreshNow();
      expect(await until(() => (frame(), !!branchOf(app, name)))).toBe(true);
      const before = weighed();
      app.gitPanel.branches.button(branchOf(app, name)!, action);
      expect(app.vaults.switchVault(locateVault({ root: sub }), null)).toBe(true);
      expect(await until(() => weighed() > before)).toBe(true);
      expect(app.overlay).toBeNull();
    }
  });

  test("Merge… on a branch with no base, a prompt open as git answers: said all the same, the prompt kept", async () => {
    // main is the trunk: no base of its own to merge into.
    const root = repo();
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!listedBranch(app, "main")))).toBe(true);
    app.gitPanel.branches.button(listedBranch(app, "main")!, "merge");
    app.overlays.prompt("typed meanwhile: ", () => {});
    const said = "main has no base to merge into — Compare against… sets one";
    expect(await until(() => app.messages.some((m) => m.text === said))).toBe(true);
    expect(app.overlay?.kind).toBe("prompt");
  });

  test("Open in a worktree, another vault gone into before git answers, or before the list is asked again: said, and you stay where you went", async () => {
    const root = repo();
    const sub = withSub(root);
    git(root, "branch", "loose", "feature");
    git(root, "branch", "later", "feature");
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "loose") && !!branchOf(app, "later")))).toBe(true);
    // Gone into sub/ as git is asked: before it can answer.
    const say = app.message.bind(app);
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("checking loose out at ")) app.vaults.switchVault(locateVault({ root: sub }), null);
    };
    app.gitPanel.branches.button(branchOf(app, "loose")!, "worktree");
    await keys("enter");
    const went = app.loc.root;
    expect(went).toBe(realpathSync(sub));
    expect(await until(() => app.messages.some((m) => m.text.startsWith("loose is in a worktree at ")))).toBe(true);
    // Whatever the list asked again would have done, done: the vault's own, asked once more after it.
    await app.git.refreshNow();
    expect(app.loc.root).toBe(went);
    // Back, and the next one: gone into sub/ once git has answered, while the list is asked again.
    expect(app.vaults.switchVault(locateVault({ root }), null)).toBe(true);
    await app.git.refreshNow();
    expect(await until(() => (frame(), !!branchOf(app, "later")))).toBe(true);
    const refresh = app.git.refreshNow.bind(app.git);
    let armed = false;
    app.git.refreshNow = () => {
      const asked = refresh();
      if (armed) {
        armed = false;
        app.vaults.switchVault(locateVault({ root: sub }), null);
      }
      return asked;
    };
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("later is in a worktree at ")) armed = true;
    };
    app.gitPanel.branches.button(branchOf(app, "later")!, "worktree");
    await keys("enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("later is in a worktree at ")))).toBe(true);
    await refresh();
    expect(app.loc.root).toBe(realpathSync(sub));
  });

  /**
   * The lists of the branches a branch made waits for (`BranchView.listed`), counted as each settles: once one has, what
   * the branch made does next is done — what a test of it waits for, not a time.
   */
  const listings = (app: App) => {
    const bv = app.gitPanel.branches as unknown as { listed: () => Promise<boolean> };
    const listed = bv.listed.bind(bv);
    let settled = 0;
    bv.listed = () => listed().then((ok) => (settled++, ok));
    return () => settled;
  };

  /** A `post-checkout` hook that says no, in a vault trusted: hooks run only there (`gitArgs`). */
  const hookSaysNo = (root: string) => {
    setTrust(root, "trusted");
    // The repository's own hooks, whatever a global `core.hooksPath` says (a hook manager's).
    git(root, "config", "core.hooksPath", join(root, ".git", "hooks"));
    writeFileSync(join(root, ".git", "hooks", "post-checkout"), "#!/bin/sh\necho no >&2\nexit 1\n", { mode: 0o755 });
  };
  /** A new branch from `from`, its "where?" answered by `keys` (enter: In a new worktree). */
  const newBranch = async (
    app: App,
    keys: (...k: string[]) => Promise<void>,
    name: string,
    from: string,
    ...how: string[]
  ) => {
    app.gitPanel.branches.newBranch();
    await keys(...typed(name), "enter", ...typed(from), "enter");
    expect(listTitle(app)).toBe(`${name} from ${from}: where?`);
    await keys(...(how.length ? how : ["enter"]));
  };

  test("a new branch by the name of one there already: git refuses, and that branch keeps its own base", async () => {
    const root = repo();
    git(root, "branch", "dev", "main");
    git(root, "branch", "agent/x", "dev");
    const { app, keys } = await panel(root);
    keepBase(app.git.checkout!, "agent/x", "dev");
    await newBranch(app, keys, "agent/x", "main");
    expect(
      await until(() => app.messages.some((m) => m.text.startsWith("git:") && m.text.includes("already exists"))),
    ).toBe(true);
    await app.git.refreshNow();
    expect(keptBases(app.git.checkout!)["agent/x"]).toBe("dev");
  });

  test("a new branch made while you've moved on — another view on the left, the selection moved, another vault: left as you put it", async () => {
    const root = repo();
    const sub = withSub(root);
    const { app, keys } = await panel(root);
    const settled = listings(app);
    const say = app.message.bind(app);
    // Something done as git is asked to make each branch, before it can answer.
    let meanwhile: () => void = () => {};
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("making ")) meanwhile();
    };
    /** The branch made, and the branches listed once since: what the branch made does next, done. */
    const made = async (name: string) => {
      const n = settled();
      expect(await until(() => app.messages.some((m) => m.text.startsWith(`made ${name} from`)))).toBe(true);
      expect(await until(() => settled() > n)).toBe(true);
    };
    // The explorer on the left meanwhile: its selection not moved; back in the git panel, its own where it was.
    const before = app.sidebar.selected;
    let explorer = -1;
    meanwhile = () => {
      app.panels.switchLeftView("explorer");
      explorer = app.sidebar.selected;
    };
    await newBranch(app, keys, "agent/a", "main");
    await made("agent/a");
    expect([app.leftView, app.sidebar.selected]).toEqual(["explorer", explorer]);
    app.panels.switchLeftView("git");
    expect(app.sidebar.selected).toBe(before);
    // The selection moved in the git panel meanwhile, by its key: it stays where it was put.
    let moved = -1;
    meanwhile = () => {
      void app.gitPanel.action("down");
      moved = app.sidebar.selected;
    };
    await newBranch(app, keys, "agent/b", "main");
    await made("agent/b");
    expect(app.sidebar.selected).toBe(moved);
    // Another vault gone into meanwhile: not opened up there, nor anything selected.
    meanwhile = () => app.vaults.switchVault(locateVault({ root: sub }), null);
    await newBranch(app, keys, "agent/c", "main");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("made agent/c from")))).toBe(true);
    await app.git.refreshNow();
    expect(app.gitPanel.branches.opened.has("agent/c")).toBe(false);
  });

  test("a new branch made while git has news after every answer: selected once a list asked since is shown, the news going on", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    // News as each answer asks for its frame, five times, once the branch made waits to be listed: the list it waits for
    // is no longer the newest by the time it's shown.
    let news = 0;
    (app.host as { requestRender: () => void }).requestRender = () => {
      if (news > 0) {
        news--;
        app.git.generation++;
      }
    };
    const bv = app.gitPanel.branches as unknown as { listed: () => Promise<boolean> };
    const listed = bv.listed.bind(bv);
    // How much news came while it waited; on a loaded machine each list's answer takes a while.
    let during = -1;
    bv.listed = () => {
      news = 5;
      return listed().then((ok) => ((during = 5 - news), ok));
    };
    await newBranch(app, keys, "agent/busy", "main");
    expect(await until(() => during >= 0, 25_000)).toBe(true);
    frame();
    expect(selectedBranch(app)).toBe("agent/busy");
    // Settled with news come, and before it stopped: never waiting for git to be quiet.
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan(5);
  });

  test("a new branch made, the panel's filter not matching it: nothing unfolded, nothing selected", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    const settled = listings(app);
    app.sidebar.filter = "feature";
    // As the filter draws it: the selection kept within the rows it leaves.
    frame();
    const before = app.sidebar.selected;
    const n = settled();
    await newBranch(app, keys, "agent/plain", "main", "down", "down", "down", "enter");
    expect(await until(() => app.messages.some((m) => m.text === "made agent/plain from main"))).toBe(true);
    expect(await until(() => settled() > n)).toBe(true);
    expect(app.gitPanel.folded.has("older")).toBe(true);
    expect(app.sidebar.selected).toBe(before);
  });

  test("Open in a worktree a hook refuses once it's checked out (the vault trusted): listed again, the worktree on its branch", async () => {
    const root = repo();
    git(root, "branch", "loose", "feature");
    hookSaysNo(root);
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "loose")))).toBe(true);
    app.gitPanel.branches.button(branchOf(app, "loose")!, "worktree");
    await keys("enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("git:")))).toBe(true);
    expect(await until(() => (frame(), !!listedBranch(app, "loose")?.worktree))).toBe(true);
  });

  test("a new branch's switch a hook refuses once it's switched (the vault trusted): HEAD seen where it went at once", async () => {
    const root = repo();
    hookSaysNo(root);
    const { app, keys } = await panel(root);
    await newBranch(app, keys, "agent/hooked", "main", "down", "down", "enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("agent/hooked made, but git:")))).toBe(true);
    expect(git(root, "branch", "--show-current")).toBe("agent/hooked\n");
    expect(app.git.head?.branch).toBe("agent/hooked");
  });

  test("Remove…'s question, git answering while you type in a note or the commit's message: not asked over it, and said", async () => {
    const root = repo();
    worktree(root, "agent/done", "main");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    const weighed = guarded(app);
    // Each where its keys go, as Input.dispatchKey sends them.
    const typings = [
      () => {
        app.region = "content";
        app.view!.insert = true;
      },
      () => {
        app.region = "sidebar";
        app.gitPanel.typing = true;
      },
      () => {
        app.region = "outline";
        app.outline.visible = true;
        app.outline.filtering = true;
      },
      () => {
        app.region = "problems";
        app.problems.panel.shown = true;
        app.problems.list().filtering = true;
      },
    ];
    for (const typing of typings) {
      const before = weighed();
      app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
      typing();
      expect(await until(() => weighed() > before)).toBe(true);
      expect(app.overlay).toBeNull();
      expect(
        app.messages.at(-1)?.text.endsWith("— not asked over what you were doing: ask again") &&
          app.messages.at(-1)?.text.startsWith("Remove the worktree"),
      ).toBe(true);
      app.view!.insert = false;
      app.gitPanel.typing = false;
      app.outline.filtering = false;
      app.problems.list().filtering = false;
      app.region = "sidebar";
    }
  });

  test("Merge…'s menu asked for with the panel's filter on, git answering as it still is: opened — your keys went there when you asked", async () => {
    const root = repo();
    worktree(root, "agent/ahead", "main", true);
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/ahead")))).toBe(true);
    // The filter typed in, and Merge… clicked: the filter as it was, the keys where they were.
    app.sidebar.filtering = true;
    app.gitPanel.branches.button(branchOf(app, "agent/ahead")!, "merge");
    expect(await until(() => listTitle(app) === "Merge agent/ahead into main")).toBe(true);
    await app.input.handleKey("escape");
    app.sidebar.filtering = false;
    // A note left in insert mode, the keys in the panel all the while: not the note's, so opened.
    app.view!.insert = true;
    app.region = "sidebar";
    app.gitPanel.branches.button(branchOf(app, "agent/ahead")!, "merge");
    expect(await until(() => listTitle(app) === "Merge agent/ahead into main")).toBe(true);
    app.view!.insert = false;
  });

  test("a new branch made, the panel scrolled by the wheel meanwhile: left where it's scrolled; else selected, brought into sight", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    const settled = listings(app);
    const say = app.message.bind(app);
    let meanwhile: () => void = () => {};
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("making ")) meanwhile();
    };
    // The wheel over the panel, as a terminal sends it: the panel used.
    frame();
    const pane = app.geometry!.sidebarPane!;
    meanwhile = () =>
      app.mouse.handle({
        type: "scroll",
        x: pane.x + 2,
        y: pane.y + 2,
        button: 0,
        scroll: { direction: "down", delta: 1 },
      });
    const before = app.sidebar.selected;
    let n = settled();
    await newBranch(app, keys, "agent/scrolled", "main");
    expect(await until(() => settled() > n)).toBe(true);
    expect(app.sidebar.selected).toBe(before);
    // Pinned where something else put it, nothing done in the panel: selected, and the panel follows it.
    meanwhile = () => {
      app.sidebar.pinned = true;
    };
    n = settled();
    await newBranch(app, keys, "agent/seen", "main");
    expect(await until(() => settled() > n)).toBe(true);
    expect([selectedBranch(app), app.sidebar.pinned]).toEqual(["agent/seen", false]);
  });

  test("a list opened once git answers, a key sequence begun meanwhile: not opened over it", async () => {
    const root = repo();
    worktree(root, "agent/done", "main");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    const weighed = guarded(app);
    app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
    app.pending.push("space");
    expect(await until(() => weighed() > 0)).toBe(true);
    expect(app.overlay).toBeNull();
    app.pending.length = 0;
  });

  test("Remove…'s question, git answering while a command of the note's waits for its next key (an operator, a count, f's character), in visual mode or resizing panes: not asked over it", async () => {
    const root = repo();
    worktree(root, "agent/done", "main");
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "agent/done")))).toBe(true);
    await app.run("view.source");
    const weighed = guarded(app);
    const vim = app.vim;
    const view = app.view!;
    // Each made by its keys in the note, taken away while Remove… is asked from the panel, put back before git answers.
    const away =
      <T>(get: () => T, set: (v: T) => void, none: T) =>
      () => {
        const was = get();
        set(none);
        return () => set(was);
      };
    const waits = [
      {
        make: () => keys("d"),
        take: away(
          () => vim.op,
          (v) => (vim.op = v),
          null,
        ),
      },
      {
        make: () => keys("3"),
        take: away(
          () => vim.count,
          (v) => (vim.count = v),
          "",
        ),
      },
      {
        make: () => keys("f"),
        take: away(
          () => vim.awaitChar,
          (v) => (vim.awaitChar = v),
          null,
        ),
      },
      {
        make: () => keys("v"),
        take: away(
          () => view.visual,
          (v) => (view.visual = v),
          null,
        ),
      },
      {
        make: () => app.run("window.resize_mode"),
        take: away(
          () => app.panels.resizeMode,
          (v) => (app.panels.resizeMode = v),
          false,
        ),
      },
    ];
    for (const w of waits) {
      app.region = "content";
      await w.make();
      expect(app.overlays.keysGo()).not.toBe("");
      const put = w.take();
      app.region = "sidebar";
      expect(app.overlays.keysGo()).toBe("");
      const before = weighed();
      app.gitPanel.branches.button(branchOf(app, "agent/done")!, "remove");
      app.region = "content";
      put();
      expect(await until(() => weighed() > before)).toBe(true);
      expect(app.overlay).toBeNull();
      expect(app.messages.at(-1)?.text).toEndWith("— not asked over what you were doing: ask again");
      await keys("escape");
      expect(app.overlays.keysGo()).toBe("");
    }
  });

  test("Open in a worktree, a question opened before git answers: not gone into from under it — o goes into it", async () => {
    const root = repo();
    git(root, "branch", "loose", "feature");
    const { app, frame, keys } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "loose")))).toBe(true);
    const say = app.message.bind(app);
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("checking loose out at ")) app.overlays.prompt("typed meanwhile: ", () => {});
    };
    const went = app.loc.root;
    app.gitPanel.branches.button(branchOf(app, "loose")!, "worktree");
    await keys("enter");
    expect(
      await until(() => app.messages.some((m) => m.text === "loose's worktree not gone into — o goes into it")),
    ).toBe(true);
    expect(app.loc.root).toBe(went);
    expect(app.overlay?.kind).toBe("prompt");
  });

  test("git's answer to a list of the branches: on it while it's the last asked; else on the newer, if older — never a failure, never another vault's", () => {
    const list = (root: string, generation: number, answered: number): BranchList => ({
      root,
      generation,
      branches: [],
      merged: new Set(),
      asking: null,
      answered,
    });
    const branches: Branch[] = [];
    const asked = list("/a", 5, 3);
    expect(shownOn(asked, asked, branches)).toBe(asked);
    // A failure, the last asked's own too: what's listed stays.
    expect(shownOn(asked, asked, null)).toBeNull();
    // Overtaken: shown on the newer while what it shows is older.
    const newer = list("/a", 6, 3);
    expect(shownOn(newer, asked, branches)).toBe(newer);
    expect(shownOn(list("/a", 7, 5), asked, branches)).toBeNull();
    expect(shownOn(list("/a", 7, 6), asked, branches)).toBeNull();
    // A failure overtaken leaves what's listed; another repository's answer never lands on this one's.
    expect(shownOn(newer, asked, null)).toBeNull();
    expect(shownOn(list("/b", 6, -1), asked, branches)).toBeNull();
    expect(shownOn(null, asked, branches)).toBeNull();
  });

  test("into another repository: its branches asked for, the last one's never shown meanwhile", async () => {
    const root = repo();
    const other = repo();
    git(other, "branch", "only-there", "main");
    const { app, frame } = await panel(root);
    expect(await until(() => (frame(), !!branchOf(app, "feature")))).toBe(true);
    expect(app.vaults.switchVault(locateVault({ root: other }), null)).toBe(true);
    // The same generation as before: nothing of the last repository's carried over to show while it's asked.
    expect(app.gitPanel.branches.branches()).toBeNull();
    await app.git.refreshNow();
    expect(await until(() => (frame(), !!listedBranch(app, "only-there")))).toBe(true);
  });

  test("a new branch made, the panel hidden, or its filter's keys used, meanwhile: nothing unfolded or selected there", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    const settled = listings(app);
    const say = app.message.bind(app);
    let meanwhile: () => void = () => {};
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      if (m[1].startsWith("made ")) meanwhile();
    };
    // Hidden: the folds as they were, the selection too.
    frame();
    const before = app.sidebar.selected;
    meanwhile = () => app.panels.showSidebar(false);
    let n = settled();
    await newBranch(app, keys, "agent/hidden", "main", "down", "down", "down", "enter");
    expect(await until(() => settled() > n)).toBe(true);
    expect([app.gitPanel.folded.has("older"), app.sidebar.selected]).toEqual([true, before]);
    app.panels.showSidebar(true);
    // The filter's keys moving the selection: using the panel.
    meanwhile = () => {
      app.sidebar.filtering = true;
      void app.panels.filterKey("down");
      app.sidebar.filtering = false;
    };
    n = settled();
    await newBranch(app, keys, "agent/filtered", "main", "down", "down", "down", "enter");
    expect(await until(() => settled() > n)).toBe(true);
    expect(app.gitPanel.folded.has("older")).toBe(true);
  });

  test("a new branch made, the selection moved by the panel itself meanwhile (not you): selected all the same", async () => {
    const root = repo();
    const { app, frame, keys } = await panel(root);
    app.sidebar.selected = 2;
    frame();
    const say = app.message.bind(app);
    app.message = (...m: Parameters<App["message"]>) => {
      say(...m);
      // As the panel keeps a selection within rows that went: moved, by no key of yours.
      if (m[1].startsWith("making ")) app.sidebar.selected = 0;
    };
    await newBranch(app, keys, "agent/kept", "main");
    expect(await until(() => (frame(), selectedBranch(app) === "agent/kept"))).toBe(true);
  });

  test("a new branch made while the panel can only say it's asking git: nothing unfolded", async () => {
    const root = repo();
    const { app, keys } = await panel(root);
    const settled = listings(app);
    // git status failing once the branch is made: the panel's rows "asking git…".
    const refresh = app.git.refreshNow.bind(app.git);
    let failing = false;
    app.git.refreshNow = () =>
      refresh().then(() => {
        if (failing) app.git.entries = null;
      });
    const n = settled();
    failing = true;
    await newBranch(app, keys, "agent/plain", "main", "down", "down", "down", "enter");
    expect(await until(() => settled() > n)).toBe(true);
    expect(app.gitPanel.folded.has("older")).toBe(true);
  });

  test("the status line's new branch from here, a hook refusing once it's switched (the vault trusted): HEAD seen at once", async () => {
    const root = repo();
    hookSaysNo(root);
    const { app, keys } = await panel(root);
    app.git.openBranches();
    await keys(...typed("A new branch from here"), "enter", ...typed("agent/status"), "enter");
    expect(await until(() => app.messages.some((m) => m.text.startsWith("git:")))).toBe(true);
    expect(git(root, "branch", "--show-current")).toBe("agent/status\n");
    expect(app.git.head?.branch).toBe("agent/status");
  });

  test("an uncommitted file too big for a diff, clicked: said as it lands; overtaken by another diff, not said", async () => {
    const root = repo();
    const at = worktree(root, "agent/big", "main");
    writeFileSync(join(at, "big.md"), Buffer.alloc(DIFF_MAX + 1, 97));
    writeFileSync(join(at, "small.md"), "small\n");
    const { app, frame, click } = await panel(root);
    app.gitPanel.branches.opened.add("agent/big");
    const fileRow = (path: string) => app.gitPanel.rows().findIndex((r) => r.kind === "bfile" && r.path === path);
    expect(await until(() => (frame(), fileRow("big.md") >= 0 && fileRow("small.md") >= 0))).toBe(true);
    const drawn = drawnAsItLands(app);
    const tooBig = (w: string) => w === "big.md: larger than 8 MB: no diff shown";
    expect(await drawn(() => click(`git:row:${fileRow("big.md")}`), tooBig)).toBe(true);
    // Asked for, then another diff asked for before git answers: the first says nothing.
    const said = () => app.messages.filter((m) => tooBig(m.text)).length;
    const before = said();
    const rows = app.gitPanel.rows();
    const big = rows[fileRow("big.md")] as BranchViewRow;
    const small = rows[fileRow("small.md")] as BranchViewRow;
    await Promise.all([app.gitPanel.branches.action(big, "open"), app.gitPanel.branches.action(small, "open")]);
    expect(said()).toBe(before);
    expect(app.floating?.kind).toBe("diff");
  });

  test("a branch's renamed file, one line changed: its diff against the base is that line, from the name it had", async () => {
    const root = repo();
    writeFileSync(join(root, "long.md"), `${Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n")}\n`);
    git(root, "add", "long.md");
    git(root, "commit", "-q", "-m", "long");
    git(root, "branch", "-f", "main", "feature");
    const at = worktree(root, "agent/mv", "main");
    git(at, "mv", "long.md", "moved.md");
    writeFileSync(
      join(at, "moved.md"),
      `${Array.from({ length: 12 }, (_, i) => (i === 5 ? "line SIX" : `line ${i + 1}`)).join("\n")}\n`,
    );
    git(at, "commit", "-q", "-am", "moved");
    const { app, frame } = await panel(root);
    app.gitPanel.branches.opened.add("agent/mv");
    const file = () => app.gitPanel.rows().find((r) => r.kind === "bfile" && r.path === "moved.md");
    expect(await until(() => (frame(), !!file()))).toBe(true);
    const f = file()!;
    expect(f).toMatchObject({ from: "long.md", letter: "R" });
    if (f.kind !== "bfile") throw new Error("no file row");
    app.gitPanel.branches.action(f, "open");
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe("agent/mv: long.md → moved.md against main — esc: source control");
    const d = (app.floating as { diff: { before: string; now: string } }).diff;
    expect(d.before).toContain("line 6\n");
    expect(d.before.replace("line 6", "line SIX")).toBe(d.now);
  });
});

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

describe("a diff's file read from disk", () => {
  test("a link read as git keeps it, where it leads, never followed; a file past the cap not read; one not there, empty", () => {
    const dir = mkdtempSync(join(sandbox, "read-"));
    writeFileSync(join(dir, "elsewhere.md"), "not the vault's\n");
    symlinkSync(join(dir, "elsewhere.md"), join(dir, "link.md"));
    expect(readForDiff(join(dir, "link.md"))).toBe(join(dir, "elsewhere.md"));
    expect(readForDiff(join(dir, "elsewhere.md"))).toBe("not the vault's\n");
    writeFileSync(join(dir, "big.md"), Buffer.alloc(DIFF_MAX + 1, 97));
    expect(readForDiff(join(dir, "big.md"))).toEqual({ why: "larger than 8 MB: no diff shown" });
    expect(readForDiff(join(dir, "none.md"))).toBe("");
  });
});

describe("a rename staged (git mv), and its diffs", () => {
  /** Twelve lines, `line 1`…; `edits` puts other words on some. */
  const lines = (edits: Record<number, string> = {}) =>
    `${Array.from({ length: 12 }, (_, i) => edits[i + 1] ?? `line ${i + 1}`).join("\n")}\n`;
  /** A repository with long.md committed, then renamed to moved.md by git mv, line 6 changed and staged. */
  const renamed = () => {
    const root = repo();
    writeFileSync(join(root, "long.md"), lines());
    git(root, "add", "long.md");
    git(root, "commit", "-q", "-m", "long");
    git(root, "mv", "long.md", "moved.md");
    writeFileSync(join(root, "moved.md"), lines({ 6: "line SIX" }));
    git(root, "add", "moved.md");
    return root;
  };
  const diffOf = (app: App) => {
    const { before, now } = (app.floating as unknown as { diff: { before: string; now: string } }).diff;
    return { before, now };
  };
  const fileRow = (app: App, section: string) =>
    rowOf(app, (r) => r.kind === "file" && r.section === section && r.entry.path === "moved.md");

  test("its row says old → new; a click, enter and its changes opened up all diff it from the name it had", async () => {
    const root = renamed();
    const { app, click, keys } = await panel(root, null);
    const i = fileRow(app, "staged");
    expect(app.gitPanel.rows()[i]).toMatchObject({ label: "R long.md → moved.md" });
    // A click: the last commit's long.md against the index's moved.md — line 6 changed, nothing else.
    click(`git:row:${i}`);
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe("long.md → moved.md against the last commit — esc: source control");
    expect(diffOf(app)).toEqual({ before: lines(), now: lines({ 6: "line SIX" }) });
    await keys("escape");
    // enter, the same.
    app.region = "sidebar";
    app.sidebar.selected = fileRow(app, "staged");
    await keys("enter");
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(diffOf(app)).toEqual({ before: lines(), now: lines({ 6: "line SIX" }) });
    await keys("escape");
    // Opened up: one change, at line 6.
    app.git.opened.add("staged:moved.md");
    const changes = () => app.gitPanel.rows().filter((r) => r.kind === "change" && r.section === "staged");
    expect(await until(() => changes().length > 0)).toBe(true);
    expect(changes().map((r) => (r.kind === "change" ? r.change.from : 0))).toEqual([6]);
  });

  test("a rename with edits not staged: Staged diffs from the old name, Changes the index against the file, as v does", async () => {
    const root = renamed();
    writeFileSync(join(root, "moved.md"), lines({ 6: "line SIX", 9: "line NINE" }));
    const { app, click, keys } = await panel(root, null);
    // Staged: what the rename staged, line 6 alone.
    click(`git:row:${fileRow(app, "staged")}`);
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(diffOf(app)).toEqual({ before: lines(), now: lines({ 6: "line SIX" }) });
    await keys("escape");
    // Changes: what's on disk against the index, line 9 alone; a plain M row.
    const j = fileRow(app, "unstaged");
    expect(app.gitPanel.rows()[j]).toMatchObject({ label: "M moved.md" });
    click(`git:row:${j}`);
    expect(await until(() => app.floating?.kind === "diff")).toBe(true);
    expect(app.floating!.title).toBe("moved.md against what's staged — esc: source control");
    expect(diffOf(app)).toEqual({ before: lines({ 6: "line SIX" }), now: lines({ 6: "line SIX", 9: "line NINE" }) });
    await keys("escape");
    // The review agrees: one hunk, line 9 of moved.md.
    app.region = "sidebar";
    await keys("v");
    expect(await until(() => app.floating?.kind === "review")).toBe(true);
    expect(reviewOf(app)!.items.map((it) => [it.path, it.change.from])).toEqual([["moved.md", 9]]);
  });
});

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

describe("the repositories in the view (VV-D10)", () => {
  test("a busy-named folder is looked into for repositories only when it holds a note at its top (D237)", async () => {
    const top = mkdtempSync(join(sandbox, "busy-repos-"));
    for (const d of ["vendor/lib", "node_modules/dep"]) {
      mkdirSync(join(top, d), { recursive: true });
      git(join(top, d), "init", "-q", "-b", "main");
    }
    writeFileSync(join(top, "vendor", "notes.md"), "# Notes\n");
    const { reposUnder } = await import("../src/core/gitrepos.ts");
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
