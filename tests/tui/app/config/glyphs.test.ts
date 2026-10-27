import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test("the glyphs picker: a move previews the set, enter keeps it and says so", async () => {
    const h = await harness();
    await h.keys("space", "u", "g");
    expect((h.app.overlay as ListOverlay).title).toBe("Glyphs (live preview)");
    await h.keys("down"); // unicode → ascii
    expect(h.app.glyphs.mode).toBe("ascii");
    await h.keys("enter");
    expect(h.app.ui.glyphs).toBe("ascii");
    expect(h.app.glyphs.mode).toBe("ascii");
    expect(last(h)).toBe("glyphs: ascii");
  });
});
