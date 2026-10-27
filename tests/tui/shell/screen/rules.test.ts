import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("ui.lines", () => {
  test("light (the default): the frame in ─ │ and light joints; heavy: ━ ┃", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      width: 140,
      height: 30,
      config: (c) => (c.ui.lines = "light"),
    });
    const f = h.frame();
    expect(DEFAULT_CONFIG.ui.lines).toBe("light");
    expect(f).not.toMatch(/[━┃╋┳┻┣┫]/u);
    expect(f).toContain("┬");
    expect(f).toContain("┴");
    expect(f.split("\n")[1]!).toMatch(/^─+┬/u);
    const heavy = await harness({ open: "samples/handbook/operations-handbook.md", width: 140, height: 30 });
    expect(heavy.frame().split("\n")[1]!).toMatch(/^━+┳/u);
  });
});

describe("review cycle 3 (TUI)", () => {
  test(
    "joints: a tab separator over a border is a cross",
    async () => {
      // Somewhere across these widths a tab's separator lands on the outline's border column.
      let checked = 0;
      for (let width = 100; width <= 160; width++) {
        const h = await harness({ open: "index.md", width, height: 12, config: (c) => (c.ui.outline = true) });
        for (const n of ["notes/alpha.md", "notes/beta.md", "crlf.md", "bom.md"]) h.app.openInNewTab(n);
        const rows = h
          .frame()
          .split("\n")
          .map((r) => [...r]);
        rows.forEach((r, y) => {
          r.forEach((ch, x) => {
            // A tee pointing down with a line above it should have been a cross.
            if ((ch === "┬" || ch === "┳") && y > 1 && "│┃┼╋├┤┣┫┬┳".includes(rows[y - 1]![x] ?? " "))
              throw new Error(`${width}: ${ch} under a line at ${x},${y}`);
            if (ch === "┬" || ch === "┳") checked++;
          });
        });
      }
      expect(checked).toBeGreaterThan(0);
    },
    TEST_BUDGETS.layoutMatrix,
  );
});
