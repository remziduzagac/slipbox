import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  test("help and the palette list source mode's keys", async () => {
    const h = await harness();
    await h.keys("space", "?");
    const del = (h.app.overlay as ListOverlay).items.find((i) => i.data === "edit.op_delete")!;
    expect(del.keys).toContain("d");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("help: enter on a command runs it", async () => {
    const h = await harness();
    expect(h.app.ui.zen).toBe(false);
    await h.keys("?");
    for (const ch of "zen mode") await h.keys(ch === " " ? "space" : ch);
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered[o.selected]!.item.label).toBe("Zen mode");
    await h.keys("enter");
    await Bun.sleep(10);
    expect(h.app.overlay).toBeNull();
    expect(h.app.ui.zen).toBe(true);
  });
});
