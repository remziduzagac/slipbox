import { describe, expect, test } from "bun:test";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the lens on a CSV (16.14)", () => {
  test("a few rows around the cursor, never the whole table; sliding a row at a time", async () => {
    const root = makeVault();
    // Records counted, a row each: no counters to make a long one wrap.
    const h = await harness({
      root,
      open: "samples/logs/photometry-2026.csv",
      width: 140,
      height: 40,
      config: (c) => (c.ui.relative_numbers = "off"),
    });
    const v = h.app.view!;
    const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.[1] ?? "none";
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 10), col: 2 });
    await h.keys("space", "n", "l");
    expect(lens()).toBe("8–13"); // lens_min_rows of records, not 2,601 lines
    await h.keys("j", "j", "j", "j");
    expect(lens()).toBe("9–14"); // the cursor past its end: one row in, one out
    await h.keys("j");
    expect(lens()).toBe("10–15");
  });
});
