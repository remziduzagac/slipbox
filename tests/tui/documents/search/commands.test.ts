import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 2", () => {
  test("an empty search clears the find; alias candidates: move to one to apply it, else the picker", async () => {
    const h = await harness({ width: 120, height: 30 });
    await h.keys("/", "enter");
    expect(h.app.view!.find).toBeNull();
    await h.keys(":", "t", "h", "e", "m", "e", "space", "down");
    const o = h.app.overlay as ListOverlay;
    const pick = o.filtered[o.selected]!.item.data as string;
    await h.keys("enter");
    expect(`theme.set ${h.app.ui.theme}`).toBe(pick);
    await h.keys(":", "e", "space", "enter"); // not moved: the note picker, not some note
    expect(h.app.overlay?.kind).toBe("list");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
});
