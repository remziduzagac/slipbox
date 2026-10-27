import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (TUI journeys: the lens after a reload)", () => {
  test(
    "loading theirs under a tall lens at the note's end: the top stays in range, never past 100%",
    async () => {
      const rel = "samples/scratch/broken-frontmatter.md";
      const bad: string[] = [];
      for (const paras of [1, 2, 4]) {
        for (const at of [0, 1, 2]) {
          for (const keep of ["l", "m"]) {
            const root = makeVault();
            const h = await harness({
              root,
              open: rel,
              width: 40,
              height: 12,
              config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)),
            });
            const v = h.app.view!;
            await h.keys("space", "n", "l", "shift+g", "k", "x");
            const file = join(root, rel);
            const text = readFileSync(file, "utf8");
            // After the at-th blank line: paragraphs long enough to wrap at this width.
            let i = -2;
            for (let k = 0; k <= at; k++) i = text.indexOf("\n\n", i + 2);
            i = i < 0 ? text.length : i + 2;
            const add = Array.from(
              { length: paras },
              (_, k) => `An agent's paragraph ${k}, long enough to wrap twice at forty columns.\n\n`,
            ).join("");
            writeFileSync(file, text.slice(0, i) + add + text.slice(i));
            const t = Date.now() / 1000 + 5;
            (await import("node:fs")).utimesSync(file, t, t);
            h.app.watch.reloadBuffer(v.buf);
            await h.keys(keep); // load theirs, or merge
            const status = statusRow(h.frame());
            const pct = Number(/(\d+)%/.exec(status)?.[1] ?? 0);
            const shown = h.app.lens.screenRows(v, h.app.currentLayout(v)).length;
            if (pct > 100 || shown < v.height)
              bad.push(`${paras}/${at}/${keep}: ${status.trim()} (${shown} rows of ${v.height})`);
          }
        }
      }
      expect(bad).toEqual([]);
    },
    TEST_BUDGETS.lensReload,
  );
});
