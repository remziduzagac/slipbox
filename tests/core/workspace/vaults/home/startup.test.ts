import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { isListed, locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { cacheDir } from "../../../../../src/core/foundation/platform/paths.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review cycle 5 (vault, a loose folder)", () => {
  test("home opened is never walked then (VV-D2): its top alone until its walk is made, then the walk kept — each note looked at again", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    mkdirSync(join(home, "sub"));
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "sub", "c.md"), "[a](../a.md)\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = locateVault({ path: home, cwd: home });
      expect(loc.mode).toBe("home");
      expect(isListed(loc)).toBe(false);
      // Not walked yet: its top's notes, its folders listed, not looked into.
      const first = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...first.notes.keys()]).toEqual(["a.md"]);
      expect(first.dirs).toEqual(["", "sub"]);
      expect(first.home).toEqual({ walked: null, capped: null });
      // Walked (a slice at a time, while nobody works — here at once) and kept: the graph is built from it.
      const walked = walkHomeNow(loc, DEFAULT_CONFIG);
      expect(walked.walk.files.map((f) => f.rel)).toEqual(["a.md", "sub/c.md"]);
      const g = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...g.notes.keys()]).toEqual(["a.md", "sub/c.md"]);
      expect(g.home?.walked).toBeGreaterThanOrEqual(walked.walked!);
      expect(g.backlinks("a.md").map((b) => b.from)).toEqual(["sub/c.md"]);
      expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(true);
      // Each note looked at again when the graph is built: one gone is gone, one changed is read again.
      rmSync(join(home, "sub", "c.md"));
      writeFileSync(join(home, "a.md"), "# A, longer now\n");
      const again = openGraph(loc, DEFAULT_CONFIG, true);
      expect([...again.notes.keys()]).toEqual(["a.md"]);
      expect(again.entry("a.md")?.title).toBe("A, longer now");
    } finally {
      process.env.HOME = before;
    }
  });
});
