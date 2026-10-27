import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 3 (TUI)", () => {
  test(":vs <note> and :tabnew <note> open that note; an argument a command doesn't take is said", async () => {
    const h = await harness({ open: "index.md", width: 160, height: 40 });
    await h.keys(":", ...[..."vs"], "space", ...[..."notes/alpha"], "enter");
    expect(h.app.tab!.views.map((x) => x.buf.rel)).toContain("notes/alpha.md");
    await h.keys(":", ...[..."tabnew"], "space", ...[..."notes/beta"], "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    await h.keys(":", "w", "space", ...[..."zzqqxx"], "enter");
    expect(h.app.messages.at(-1)!.text).toContain("takes no argument");
  });
});
