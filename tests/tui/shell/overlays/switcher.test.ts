import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  test("ctrl+p lists recent notes first, the previous one on top", async () => {
    const h = await harness();
    await h.app.run("note.open notes/beta.md");
    await h.app.run("note.open crlf.md");
    await h.keys("ctrl+p");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered.slice(0, 2).map((e) => e.item.data)).toEqual(["notes/beta.md", "index.md"]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
});
