import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("home, a vault without a marker (VV-D2)", () => {
  /** A home folder of its own: `files` in it, `$HOME` while `f` runs. */
  const withHome = async <T>(files: Record<string, string>, f: (home: string) => T | Promise<T>): Promise<T> => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-")));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      return await f(home);
    } finally {
      process.env.HOME = before;
    }
  };

  test("built in slices while nobody is working: its walk, then its index; the cap said when it's reached", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const { homeWalkKept } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const { SlicedWalk, WalkFilter } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const files: Record<string, string> = { "a.md": "# A\n" };
    for (let i = 0; i < 6; i++) files[`f${i}/n${i}.md`] = `[a](../a.md)\n`;
    files["repo/.git/HEAD"] = "ref: refs/heads/main\n";
    files["repo/r.md"] = "# R\n";
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const told: (string | null)[] = [];
      // The TUI's, the background index off: home's own walk and index, the vaults in it left alone.
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, onHome: (c) => told.push(c) });
      expect(job.step(0)).toBe(true); // a folder at a time: one slice is far from done
      expect(homeWalkKept(loc)).toBe(false);
      let slices = 1;
      while (job.step(0)) slices++;
      expect(slices).toBeGreaterThan(3);
      expect(told).toEqual([null]);
      expect(job.status).toMatchObject({ home: true, homeNotes: 7, found: 0, indexed: 0 });
      expect(homeWalkKept(loc)).toBe(true);
      expect(job.idle).toBe(true);
      // Its index written: the graph opened from the walk kept has the backlinks, parsed already.
      const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
      expect(g.pendingCount).toBe(0);
      expect(g.backlinks("a.md").length).toBe(6);
      // Walked again when asked (a folder came): told again.
      writeFileSync(join(home, "f0", "new.md"), "[a](../a.md)\n");
      job.homeAgain();
      while (job.step(50)) {}
      expect(told).toEqual([null, null]);
      expect(openGraph(loc, DEFAULT_CONFIG, true).backlinks("a.md").length).toBe(7);
      // The cap: so many notes, so many folders at most — the nearest the top kept — and said.
      const capped = (limits: { notes: number; folders: number }) => {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }), limits);
        while (w.step(50)) {}
        return { files: w.result!.files.map((f) => f.rel), dirs: w.result!.dirs, capped: w.capped };
      };
      expect(capped({ notes: 3, folders: 100 })).toMatchObject({
        files: ["a.md", "f0/n0.md", "f0/new.md"],
        capped: "notes",
      });
      expect(capped({ notes: 100, folders: 2 })).toMatchObject({
        files: ["a.md", "f0/n0.md", "f0/new.md"],
        dirs: ["", "f0"],
        capped: "folders",
      });
      expect(capped({ notes: 100, folders: 100 }).capped).toBeNull();
    });
  });
});
