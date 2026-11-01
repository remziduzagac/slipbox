import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): what a filter or a search marks, drawn where it is", () => {
  /** The columns of row `y` drawn in the match colour. */
  const lit = (h: Harness, y: number) => {
    const c = h.canvas();
    const fg = h.app.theme.roles.overlay_match.fg;
    return c.rows[y]!.map((g, x) => (c.styles[y]![x]?.fg === fg && g !== "" ? g : "")).join("");
  };
  test("a name with a control character: the switcher marks the letters typed, not the ones after", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bell\x07ring.md"), "# Bell\n");
    const h = await harness({ root, open: "index.md", width: 120, height: 30 });
    await h.keys("ctrl+p", "r", "i", "n", "g");
    const rows = h.canvas().toString().split("\n");
    const y = rows.findIndex((r) => r.includes("bellring.md"));
    expect(y).toBeGreaterThan(-1);
    expect(lit(h, y)).toBe("ring");
  });
});
