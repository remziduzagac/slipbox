import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App } from "../../../../../src/tui/app/runtime/app.ts";
import { reviewOf } from "../../../../../src/tui/workspace/git/views/review/review.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { git, repo, until, panel, rowOf } = makeGitPanelFixture();

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
