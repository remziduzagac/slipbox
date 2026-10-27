import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI)", () => {
  const note = `# Title\n\n${Array.from({ length: 12 }, (_, i) => `Para ${i + 1} text here.`).join("\n\n")}\n\nA paragraph of\nfour lines with\nthe zebra here\nand an end.\n\n\`\`\`\ncode 1\ncode 2\n\`\`\`\n`;
  const open = async (mode: "source" | "live", config?: (c: Config) => void) => {
    const root = makeVault();
    writeFileSync(join(root, "l.md"), note);
    const h = await harness({ root, open: "l.md", width: 100, height: 30, config });
    const v = h.app.view!;
    await h.keys("space", "n", mode === "live" ? "l" : "v");
    const goto = (text: string) => {
      const rows = h.app.currentLayout(v).lines.map((l) => l.spans.map((x) => x.text).join(""));
      h.app.moveCursor(v, { row: rows.findIndex((t) => t.includes(text)), col: 0 });
      h.frame();
    };
    return { h, v, goto, root };
  };
  test(
    "the lens: the same typing keys give the same text as source mode (a differential)",
    async () => {
      let seed = 11;
      const rand = (n: number) => {
        // Math.imul: a plain * exceeds 2^53 and loses the low bits, which then take few values.
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        return (seed >>> 8) % n; // the high bits: an LCG's low ones repeat quickly
      };
      const pool = [
        "x",
        "y",
        "space",
        "enter",
        "backspace",
        "delete",
        "left",
        "right",
        "home",
        "end",
        "ctrl+w",
        "ctrl+u",
      ];
      for (let run = 0; run < 25; run++) {
        const keys = Array.from({ length: 25 }, () => pool[rand(pool.length)]!);
        // Block starts: a row the rendered view and the source both begin with (a paragraph's later
        // lines are inside one rendered row, which would start the two modes in different places).
        const start = ["Para 8", "A paragraph", "Para 12"][run % 3]!;
        const texts: string[] = [];
        for (const mode of ["source", "live"] as const) {
          const { h, v, goto } = await open(mode);
          goto(start);
          await h.keys("i", ...keys, "escape");
          texts.push(v.buf.source);
        }
        if (texts[0] !== texts[1])
          throw new Error(
            `from ${start}, keys ${keys.join(" ")}:\nsource ${JSON.stringify(texts[0])}\nlens   ${JSON.stringify(texts[1])}`,
          );
      }
    },
    TEST_BUDGETS.editingDifferential,
  );
  test("the lens: delete across its bottom edge, then typing lands at the cursor", async () => {
    const { h, v, goto } = await open("live");
    goto("Para 8");
    await h.keys("shift+a", "delete", "delete", "delete", "Q", "escape");
    expect(v.buf.source).toContain("Para 8 text here.Qara 9 text here.");
  });
  test("the lens: cgn to a match inside a multi-line block outside it types there", async () => {
    const { h, v, goto } = await open("live");
    goto("Para 2");
    await h.keys("/", ...[..."zebra"], "enter", "g", "g", "c", "g", "n", "Z", "escape");
    expect(v.buf.source).toContain("the Z here");
  });
  test("the lens: an agent's edit elsewhere doesn't stretch it", async () => {
    const { h, v, goto, root } = await open("live");
    goto("Para 5");
    h.frame();
    const span = () => {
      const lines = h.app.currentLayout(v).lines;
      return lines.findIndex((l) => l.lens === "bottom") - lines.findIndex((l) => l.lens === "top");
    };
    const before = span();
    writeFileSync(join(root, "l.md"), `${note}${"more\n\n".repeat(200)}`);
    h.app.watch.reloadBuffer(v.buf);
    h.frame();
    expect(span()).toBeLessThanOrEqual(before + 2);
  });
});
