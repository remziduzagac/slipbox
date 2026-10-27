import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";
import type { ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { makeGitPanelFixture } from "../../../../support/tui/git-panel-fixture.ts";

// File-owned Git-panel setup preserves its environment restoration and cleanup.
const { git, repo, until, panel } = makeGitPanelFixture();

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

  test("the top bar's branch clicked: push and fetch, then the branches; one picked, checked out", async () => {
    const root = repo();
    writeFileSync(join(root, ".slipbox", "config.toml"), '[vault]\nname = "review"\n');
    const { app, click } = await panel(root, "a.md", false, 2 * stringWidth(root) + 100);
    click("top:branch");
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
