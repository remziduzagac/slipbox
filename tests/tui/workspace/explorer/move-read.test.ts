import { expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { Listings } from "../../../../src/tui/workspace/explorer/listings.ts";
import { HELD_MS } from "../../../fixtures/walk/slow.ts";
import { answerHeld, listed } from "../../../support/tui/explorer-listings.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();

for (const held of ["source", "destination"] as const)
  test(`a moved note waits for its ${held} folder's listing before the next explorer key`, async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", config: (c) => void (c.files.hidden = false) });
    const ex = h.app.explorer;
    ex.listings = new Listings(h.app, true);
    h.app.reads.offThread = true;
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    ex.expanded.add("notes");
    ex.expanded.add("projects");
    await listed(h);
    ex.select("notes/alpha.md");
    const paths = () => ex.rows().map((r) => r.path);
    const selected = () => ex.rows()[h.app.sidebar.selected]?.path;
    expect(paths()).toContain("notes/alpha.md");
    expect(paths()).toContain("projects/index.md");
    expect(selected()).toBe("notes/alpha.md");
    // Kept listings never grow old during the move: only the operation can request them again.
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    const source = join(root, "notes");
    const destination = join(root, "projects");
    const late = answerHeld(held === "source" ? source : destination);
    try {
      await h.keys("m");
      for (const c of "projects") await h.keys(c);
      await h.keys("enter");
      expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md");
      await h.keys("enter");
      expect(existsSync(join(root, "notes/alpha.md"))).toBe(false);
      expect(existsSync(join(root, "projects/alpha.md"))).toBe(true);
      expect(late.asked(source)).toBeGreaterThan(0);
      expect(late.asked(destination)).toBeGreaterThan(0);
      await late.read;
      // One endpoint's answer is not enough: the other still has its pre-move rows.
      const other = held === "source" ? destination : source;
      const end = performance.now() + HELD_MS;
      while (!late.answered(other)) {
        if (performance.now() > end) throw new Error(`the other folder never answered: ${other}`);
        await Bun.sleep(5);
      }
      const copy = h.app.input.handleKey("y");
      expect(h.app.reads.busy).toBe(true);
      expect(h.app.files.clip).toBeNull();
      late.release();
      await copy;
      expect(paths()).not.toContain("notes/alpha.md");
      expect(paths()).toContain("projects/alpha.md");
      expect(selected()).toBe("projects/alpha.md");
      expect(h.app.files.clip?.rel).toBe("projects/alpha.md");
    } finally {
      late.release();
      await h.app.reads.settled();
      late.restore();
      clock.mockRestore();
      h.app.quit();
    }
  });
