import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App, PromptOverlay, View } from "../../../../src/tui/app/runtime/app.ts";
import { placeAt } from "../../../../src/tui/documents/editing/source/position.ts";
import { makeGitPanelFixture } from "../../../support/tui/git-panel-fixture.ts";

// `space g`, a group (EG-D15): the panel on `space g g`; the cursor's change or the note's file staged, the file
// unstaged, the change undone after asking or previewed — beside the panel, from the note.
const { git, repo, until, panel } = makeGitPanelFixture();

/** The cursor on a source line. */
const toLine = (app: App, view: View, line: number) => placeAt(app, view, view.buf.lineStarts()[line - 1]!);

/** The fixture's repository with a.md longer, committed: two changes far apart once `one` and `three` are shouted. */
function twoChanges(): string {
  const root = repo();
  writeFileSync(join(root, "a.md"), "# A\n\none\n\ntwo\n\nthree\n");
  git(root, "commit", "-qam", "longer");
  writeFileSync(join(root, "a.md"), "# A\n\nONE\n\ntwo\n\nTHREE\n");
  return root;
}

/** The app on a.md, its changes known: the cursor on line `line`. */
async function onLine(root: string, line: number) {
  const p = await panel(root, "a.md", false);
  const view = p.app.view!;
  expect(await until(() => (p.frame(), (p.app.git.changesOf(view)?.length ?? 0) === 2))).toBe(true);
  toLine(p.app, view, line);
  return { ...p, view };
}

describe("space g, a group (EG-D15)", () => {
  test("space g shows its keys; space g g opens the git panel and focuses it, again closes it", async () => {
    const root = repo();
    const { app, keys, frame } = await panel(root, "a.md", false);
    await keys("space");
    expect(frame()).toContain("+git");
    await keys("g");
    expect(app.panels.sidebarShown && app.leftView === "git").toBe(false);
    const popup = frame();
    for (const title of [
      "The git panel",
      "Stage the change",
      "Unstage this file",
      "Undo the change",
      "Preview the change",
      "This branch's commits",
      "Copy the line's web link",
      "Open the line's web link",
    ])
      expect([title, popup.includes(title)]).toEqual([title, true]);
    await keys("g");
    expect([app.leftView, app.region, app.panels.sidebarShown]).toEqual(["git", "sidebar", true]);
    await keys("space", "g", "g");
    expect(app.panels.sidebarShown).toBe(false);
  });

  test("space g s stages the change at the cursor alone; off a change, the file; space g u unstages the file", async () => {
    const root = twoChanges();
    const { app, keys, view } = await onLine(root, 3);
    await keys("space", "g", "s");
    expect(git(root, "show", ":a.md")).toBe("# A\n\nONE\n\ntwo\n\nthree\n");
    expect(app.messages.at(-1)?.text).toBe("staged the change at line 3 of a.md");
    // On `two`, no change: the whole file.
    expect(await until(() => app.git.changesOf(view)?.length === 1)).toBe(true);
    toLine(app, view, 5);
    await keys("space", "g", "s");
    expect(git(root, "show", ":a.md")).toBe("# A\n\nONE\n\ntwo\n\nTHREE\n");
    expect(app.messages.at(-1)?.text).toBe("staged a.md");
    expect(await until(() => app.git.entries?.find((e) => e.path === "a.md")?.y === " ")).toBe(true);
    await keys("space", "g", "s");
    expect(app.messages.at(-1)?.text).toBe("nothing to stage in a.md");
    await keys("space", "g", "u");
    expect(git(root, "show", ":a.md")).toBe("# A\n\none\n\ntwo\n\nthree\n");
    expect(app.messages.at(-1)?.text).toBe("unstaged a.md");
    expect(await until(() => app.git.entries?.find((e) => e.path === "a.md")?.x === " ")).toBe(true);
    await keys("space", "g", "u");
    expect(app.messages.at(-1)?.text).toBe("nothing staged in a.md");
  });

  test("unsaved, nothing is staged: git stages the file on disk", async () => {
    const root = twoChanges();
    const { app, keys, view } = await onLine(root, 3);
    view.buf.edit(view.buf.source.length, 0, "four\n");
    await keys("space", "g", "s");
    expect(app.messages.at(-1)?.text).toStartWith("unsaved: ");
    toLine(app, view, 5);
    await keys("space", "g", "s");
    expect(app.messages.at(-1)?.text).toStartWith("unsaved: ");
    expect(git(root, "show", ":a.md")).toBe("# A\n\none\n\ntwo\n\nthree\n");
  });

  test("space g d asks before undoing the change at the cursor; no leaves it; yes puts its lines back, unsaved", async () => {
    const root = twoChanges();
    const { app, keys, view } = await onLine(root, 7);
    await keys("space", "g", "d");
    const ask = app.overlay as PromptOverlay;
    expect([ask.kind, ask.confirm, ask.label]).toEqual([
      "prompt",
      true,
      "Undo the change at line 7? Its lines go back as staged; u brings them back.",
    ]);
    await keys("n");
    expect(app.overlay).toBeNull();
    expect(view.buf.source).toBe("# A\n\nONE\n\ntwo\n\nTHREE\n");
    await keys("space", "g", "d", "y");
    expect(view.buf.source).toBe("# A\n\nONE\n\ntwo\n\nthree\n");
    expect(view.buf.dirty).toBe(true);
    await keys("u");
    expect(view.buf.source).toBe("# A\n\nONE\n\ntwo\n\nTHREE\n");
  });

  test("answered after the text moved under the question, nothing is undone (no other lines put back)", async () => {
    const root = twoChanges();
    const { app, keys, view } = await onLine(root, 7);
    await keys("space", "g", "d");
    expect(app.overlay?.kind).toBe("prompt");
    // An agent's rewrite, a line added at the top, while the question waits: the change is at line 8 now.
    view.buf.edit(0, 0, "intro\n");
    await keys("y");
    expect(view.buf.source).toBe("intro\n# A\n\nONE\n\ntwo\n\nTHREE\n");
    expect(app.messages.at(-1)?.text).toBe("the change moved since — nothing undone");
  });

  test("space g enter previews the change at the cursor", async () => {
    const root = twoChanges();
    const { app, keys } = await onLine(root, 3);
    await keys("space", "g", "enter");
    expect(app.floating?.kind).toBe("hover");
    expect(app.floating!.title).toBe("line 3, against what's staged");
    expect(app.floating!.view.buf.source).toBe("```diff\n-one\n+ONE\n```\n");
  });

  test("a file in conflict isn't staged from the note: :resolve settles it first", async () => {
    const root = repo();
    const { app, keys } = await panel(root, "a.md", false);
    app.git.entries = [{ path: "a.md", x: "U", y: "U" }];
    app.git.changesOf = () => [];
    await keys("space", "g", "s");
    expect(app.messages.at(-1)?.text).toBe("a.md is in conflict — :resolve settles it, then s in the panel");
  });
});
