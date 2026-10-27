import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
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
  test("a search hit led by a heading with an escape marks the word itself", async () => {
    const root = makeVault();
    writeFileSync(join(root, "esc.md"), "# E\x07s\x1b[31mc\n\nsome \x1b[31mred\x1b[0m quetzal words\n");
    const h = await harness({
      root,
      open: "index.md",
      width: 140,
      height: 30,
      config: (c) => (c.search.engine = "auto"),
    });
    await h.app.search.whenIndexed();
    await h.keys("space", "f", "s");
    for (const k of "quetzal") await h.keys(k);
    const list = h.app.overlay as ListOverlay;
    const hit = list.filtered.find((e) => e.item.label.startsWith("esc.md"));
    expect(hit?.item.detail).toContain("\x1b[31m"); // its heading, as written, leads the line: drawn sanitized
    const rows = h.canvas().toString().split("\n");
    const y = rows.findIndex((r) => r.includes("esc.md:3"));
    expect(lit(h, y)).toBe("quetzal");
  });
});
