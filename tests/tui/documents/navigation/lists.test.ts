import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, rowText } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("lists and commands no test had run (the TUI model)", () => {
  test("backlinks: enter opens the linking note at the link's line", async () => {
    const h = await harness({ open: "notes/beta.md" });
    await h.keys("space", "l", "b");
    const o = h.app.overlay as ListOverlay;
    const pick = o.filtered[o.selected]!.item.data as { from: string; line: number };
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick.from);
    expect(h.app.cursorLine(h.app.view!)).toBe(pick.line);
  });

  test("the links list: enter puts the cursor on the link and follows it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "l", "l");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => i.label)).toContain("beta");
    o.selected = o.filtered.findIndex((e) => e.item.label === "beta");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys("ctrl+o"); // back: the cursor was put on the link before it was followed
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(rowText(h)).toContain("on to beta");
  });
});
