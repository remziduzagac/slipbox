import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { TextCanvas } from "../../../../../src/tui/shell/terminal/canvas.ts";
import { pointedAt } from "../../../../../src/tui/workspace/git/views/panel/gitmouse.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { git, repo, until, panel, typed, rowOf } = makeGitPanelFixture();

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
