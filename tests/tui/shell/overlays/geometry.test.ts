import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  test("popups: the bottom-right corner is under the top-right one", async () => {
    const h = await harness({ width: 60, height: 20 });
    await h.keys("space", "?");
    const rows = h.frame().split("\n");
    const top = rows.findIndex((r) => r.includes("┐"));
    const bottom = rows.findIndex((r, i) => i > top && r.includes("┘"));
    expect(rows[bottom]!.lastIndexOf("┘")).toBe(rows[top]!.lastIndexOf("┐"));
  });
});
