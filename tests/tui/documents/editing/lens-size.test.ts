import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the lens's modes and size", () => {
  const NOTE = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n") + "\n";
  const lensLabel = (h: Harness) =>
    /(source|editing) · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.slice(1).join(" ") ?? "none";
  test("the rule says view or editing, in its own colour", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), NOTE);
    const h = await harness({ root, open: "p.md", width: 80 });
    await h.keys("space", "n", "l");
    expect(lensLabel(h)).toMatch(/^source /);
    const ruleColour = () => {
      const c = h.canvas();
      const y = c.rows.findIndex((r) => r.join("").includes(" · line"));
      return c.styles[y]![c.line(y).indexOf("━")]!.fg;
    };
    const viewing = ruleColour();
    await h.keys("i");
    expect(lensLabel(h)).toMatch(/^editing /);
    expect(ruleColour()).not.toBe(viewing);
    await h.keys("escape");
    expect(lensLabel(h)).toMatch(/^source /);
  });
  test("+ and - size it by a block, the size kept as it moves; = lets it size itself", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), NOTE);
    const h = await harness({ root, open: "p.md", width: 80, height: 40 });
    await h.keys("space", "n", "l");
    const first = lensLabel(h);
    await h.keys("+");
    expect(lensLabel(h)).not.toBe(first);
    const grown = lensLabel(h).split(" ")[1]!;
    const size = (r: string) => {
      const [a, b] = r.split("–").map(Number);
      return (b ?? a!) - a! + 1;
    };
    await h.keys("-", "-");
    const shrunk = lensLabel(h).split(" ")[1]!;
    expect(size(shrunk)).toBeLessThan(size(grown));
    // Moving past its end: the same size, further down.
    for (let i = 0; i < 12; i++) await h.keys("j");
    const moved = lensLabel(h).split(" ")[1]!;
    expect(size(moved)).toBe(size(shrunk));
    expect(moved).not.toBe(shrunk);
    await h.keys("=");
    expect(h.app.view!.lensSize).toBeUndefined();
    await h.keys("escape");
    await h.keys("+");
    expect(h.app.messages.at(-1)!.text).toContain("isn't open");
  });
  test("on a CSV, + takes a record more and the lens slides at that size", async () => {
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
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 10), col: 2 });
    await h.keys("space", "n", "l", "+");
    expect(lensLabel(h)).toBe("source 8–14");
    await h.keys("j", "j", "j", "j", "j");
    expect(lensLabel(h)).toBe("source 9–15");
  });
});
