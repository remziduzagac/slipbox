import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("state (3.4, 3.15)", () => {
  test("the cursor position per note survives leaving and returning", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 20 });
    await h.keys("ctrl+d", "ctrl+d", "w");
    const cur = { ...h.app.view!.cur };
    await h.app.run("note.open index.md");
    await h.app.run("note.open samples/handbook/operations-handbook.md");
    h.frame();
    expect(h.app.view!.cur).toEqual(cur);
  });
  test("a re-wrap keeps the cursor's source line, even when no row starts on it", async () => {
    // A paragraph of short source lines renders as one row: lines 4–8 start no row of their own.
    const root = makeVault();
    writeFileSync(
      join(root, "p.md"),
      `# P\n\n${Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n")}\n\nafter\n`,
    );
    const h = await harness({ root, open: "p.md", width: 120 });
    const v = h.app.view!;
    v.curAnchor = { anchor: { heading: null, headingIndex: 0, offset: 5, line: 6 }, sub: 0, col: 0 };
    v.layoutKey = ""; // as when the width changes
    h.frame();
    expect(v.curAnchor.anchor.line).toBe(6); // not the next row's line, which would stick
  });
  test("session restore: tabs, splits with orientation, cursors", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+t", "c", "ctrl+w", "s", "j", "j");
    const cur = { ...h.app.view!.cur };
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.tabs).toHaveLength(2);
    expect(again.app.tabs[1]!.views).toHaveLength(2);
    expect(again.app.tabs[1]!.orientation).toBe("stacked");
    expect(again.app.view!.cur).toEqual(cur);
  });
  test("ctrl+q quits and saves; q alone never quits", async () => {
    const h = await harness();
    await h.keys("q");
    expect(h.quit.called).toBe(false);
    await h.keys("ctrl+q");
    expect(h.quit.called).toBe(true);
  });
});

describe("review cycle 1 (TUI)", () => {
  test("session restore keeps the scroll position, with the breadcrumb on", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "samples/handbook/operations-handbook.md", width: 160, height: 40 });
    for (let i = 0; i < 60; i++) await h.keys("j");
    h.frame();
    const top = h.app.view!.top;
    expect(top).toBeGreaterThan(0);
    h.app.quit();
    const again = await harness({
      root,
      open: null,
      width: 160,
      height: 40,
      config: (c) => (c.ui.restore_session = true),
    });
    again.frame();
    expect(again.app.view!.top).toBe(top);
  });
});
