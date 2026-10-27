import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("drawing (3.1, 3.2)", () => {
  test("explorer, content and status line; cursor position in the status", async () => {
    const h = await harness();
    const f = h.frame();
    expect(f).toContain("▸ notes");
    expect(f).toContain("▌ Home");
    const status = statusRow(f);
    expect(status).toContain("READ");
    expect(status).toContain("index.md");
    expect(status).toContain("L1:1");
  });
  test("the cursor is drawn with the cursor role, on a banded row", async () => {
    const h = await harness();
    await h.keys("j", "j", "j", "j", "j");
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    const v = h.app.view!;
    const y = pane.y + (v.cur.row - v.top);
    expect(c.styles[y]![pane.textX + v.cur.col]!.bg).toBe(h.app.theme.roles.cursor.bg!);
    expect(c.styles[y]![pane.textX + v.cur.col + 2]!.bg).toBe(h.app.theme.roles.cursor_line.bg!);
  });
  test("the terminal's title follows the file on screen, told once a change; control characters never in it", async () => {
    const h = await harness();
    const titles: string[] = [];
    h.app.host.setTitle = (t) => titles.push(t);
    h.frame(); // index.md's, told at the first frame already: not again
    h.app.openInNewTab("notes/alpha.md");
    h.frame();
    h.frame(); // nothing new: not told again
    writeFileSync(join(h.root, "notes", "evil\x07\x1b]0;PWNED.md"), "# Evil\n");
    h.app.openInNewTab("notes/evil\x07\x1b]0;PWNED.md");
    h.frame();
    expect(titles).toHaveLength(2);
    expect(titles[0]).toBe("slipbox — notes/alpha.md");
    expect(titles[1]).toStartWith("slipbox — notes/evil");
    expect(titles[1]).not.toMatch(/[\x00-\x1f\x7f]/);
  });
  test("tiny terminals do not crash", async () => {
    const h = await harness({ width: 9, height: 3 });
    expect(h.frame()).toContain("slipbox");
    const h2 = await harness({ width: 20, height: 6 });
    await h2.keys("j", "space", "u", "n");
    expect(() => h2.frame()).not.toThrow();
  });
});

describe("review round 3", () => {
  test("tiny terminals: panes go over the note, and nothing fails to draw", async () => {
    for (const width of [12, 20, 26, 40]) {
      const h = await harness({ width, height: 12, config: (c) => ((c.ui.narrow_width = 0), (c.ui.outline = true)) });
      h.frame(); // throws on a drawing failure
      expect(h.app.panels.sidebarBeside && h.app.panels.outlineBeside && h.app.panels.contentWidth() < 24).toBe(false);
    }
  });
});
