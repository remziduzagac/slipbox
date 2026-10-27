import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 1", () => {
  test("an exact alias yields to the entry you moved to", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys(":", "q");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered[0]!.item.data).toBe("window.close_or_quit"); // the alias row first
    await h.keys("down");
    // Past the other quit commands (save and quit, quit without saving) to one that doesn't quit.
    while (/^(app\.|window\.close_or_quit)/.test(String(o.filtered[o.selected]!.item.data))) await h.keys("down");
    const chosen = o.filtered[o.selected]!.item.data;
    await h.keys("enter");
    expect(h.quit.called).toBe(false);
    expect(chosen).not.toBe("app.quit");
  }); // 29 harnesses
});
