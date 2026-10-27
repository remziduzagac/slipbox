import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  const click = (h: Harness, x: number, y: number, button = 0) => {
    h.app.mouse.handle({ type: "down", x, y, button });
    h.app.mouse.handle({ type: "up", x, y, button });
    h.frame();
  };
  test("on a narrow strip, +N is clickable: tabs stop before it", async () => {
    const h = await harness({ open: "samples/about-this-vault.md", width: 30, height: 12 });
    for (const n of [
      "notes/alpha.md",
      "notes/beta.md",
      "index.md",
      "samples/equipment/telescope-comparison.md",
      "samples/software/pipeline-cookbook.md",
      "samples/logs/observing-log-2026.md",
      "samples/handbook/operations-handbook.md",
    ])
      h.app.openInNewTab(n);
    h.app.activeTab = 3;
    h.frame();
    const more = h.app.geometry!.hot.find((r) => r.id === "tabmore:")!;
    for (const r of h.app.geometry!.hot)
      if (r.id.startsWith("tab")) expect(r.id === "tabmore:" || r.x + r.w <= more.x).toBe(true);
    const count = h.app.tabs.length;
    click(h, more.x + 2, more.y);
    expect(h.app.tabs).toHaveLength(count);
    expect(h.app.overlay?.kind).toBe("list");
  }); // 29 harnesses
});

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("a tab reads ` N name `, the name cut to 24 columns, and ↻ for 3 s after a reload", async () => {
    const root = makeVault();
    const name = "a-note-whose-name-runs-past-the-tab.md";
    writeFileSync(join(root, name), "# Long\n\ntext\n");
    let now = 1_000_000;
    const h = await harness({ root, open: name });
    (h.app as unknown as { now: () => number }).now = () => now;
    const strip = () => {
      const g = h.app.geometry!.tabStrip!;
      return h.frame().split("\n")[g.y]!.slice(g.x);
    };
    expect(strip()).toContain(" 1 a-note-whose-name-runs-… ");
    expect(strip()).not.toContain("past");
    writeFileSync(join(root, name), "# Long\n\ntext, changed\n");
    h.app.watch.applyChanges({ changes: [{ rel: name, kind: "changed", isNote: true }], rescan: false });
    expect(strip()).toContain("runs-… ↻");
    now += 3_001;
    expect(strip()).not.toContain("↻");
  });
});
