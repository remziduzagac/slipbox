import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { homeAt, setRootMarkers } from "../../../../../src/core/workspace/vaults/vault.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { markKept, unwritten, restamp } from "../../../../support/home-walk.ts";

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

  test("its walk kept is brought up to now: a note come since, a folder become a vault, a vault become home's again", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const files = {
      "a.md": "# A\n",
      "keep/k.md": "# K\n",
      "proj/p.md": "[a](../a.md)\n",
      "was/.slipbox/config.toml": "",
      "was/w.md": "[a](../a.md)\n",
    };
    await withHome(files, (home) => {
      const loc = homeAt(home);
      // Its folders' times an hour back: unchanged since the walk, none is listed again.
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj", "was"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      markKept(file);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      expect(unwritten(file)).toBe(true); // nothing changed: the walk kept as it was
      // Home's time moved on, nothing in it changed (a shell's history written over): listed again, not kept again.
      utimesSync(home, new Date(), new Date());
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      expect(unwritten(file)).toBe(true);
      restamp(file, home, ""); // the top seen as it is: what follows is found in the folders it's in
      // Since: a note in a folder, a repository made of another, a .slipbox/ taken away.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      mkdirSync(join(home, "proj", ".git"));
      rmSync(join(home, "was", ".slipbox"), { recursive: true });
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "was/w.md"]);
      const g = openGraph(loc, DEFAULT_CONFIG, true);
      expect(g.nestedRoots()).toEqual(["proj"]);
      expect(g.backlinks("a.md").map((b) => b.from)).toEqual(["was/w.md"]);
      expect(unwritten(file)).toBe(false); // kept so, for the next
    });
  });

  test("its walk kept follows [walk]: one kept under other settings is no walk of home's — a folder excluded leaves, an extension added comes, a marker added makes a vault; a walk under way made again", async () => {
    const { homeFilter, homeWalk, homeWalkKept } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const files = { "a/n.md": "# N\n", "b/m.md": "# M\n", "b/t.txt": "text\n", "c/Cargo.toml": "", "c/c.md": "# C\n" };
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const settings = (f: (c: typeof DEFAULT_CONFIG) => void) => {
        const c = structuredClone(DEFAULT_CONFIG);
        f(c);
        return c;
      };
      const walked = (c: typeof DEFAULT_CONFIG) => homeWalk(loc, homeFilter(loc, c));
      const notes = (c: typeof DEFAULT_CONFIG) => walked(c).walk.files.map((f) => f.rel);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "b", "c"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      expect(notes(DEFAULT_CONFIG)).toEqual(["a/n.md", "b/m.md", "c/c.md"]);
      // A folder excluded since: the walk kept isn't home's under it — its top alone, until it's walked again.
      const excluded = settings((c) => (c.walk.exclude = ["a/"]));
      expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(true);
      expect(homeWalkKept(loc, excluded)).toBe(false);
      expect(walked(excluded).walked).toBeNull();
      expect([...openGraph(loc, excluded, true).notes.keys()]).toEqual([]);
      walkHomeNow(loc, excluded);
      expect(notes(excluded)).toEqual(["b/m.md", "c/c.md"]);
      // An extension added: a text file of home's is a note now.
      const txt = settings((c) => c.walk.extensions.push("txt"));
      expect(walked(txt).walked).toBeNull();
      walkHomeNow(loc, txt);
      expect(notes(txt)).toEqual(["a/n.md", "b/m.md", "b/t.txt", "c/c.md"]);
      // A marker added: a folder holding one is a vault of its own.
      setRootMarkers([...DEFAULT_CONFIG.walk.root_markers, "Cargo.toml"]);
      try {
        expect(homeWalkKept(loc, txt)).toBe(false);
        walkHomeNow(loc, txt);
        expect(notes(txt)).toEqual(["a/n.md", "b/m.md", "b/t.txt"]);
      } finally {
        setRootMarkers(null);
      }
      // [walk] changed while home's walk is under way: made again under what it says now, never kept under the old.
      const now = structuredClone(DEFAULT_CONFIG);
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, config: () => now });
      expect(job.step(0)).toBe(true);
      now.walk.exclude = ["b/"];
      while (job.step(50)) {}
      expect(homeWalkKept(loc, now)).toBe(true);
      expect(notes(now)).toEqual(["a/n.md", "c/c.md"]);
    });
  });
});
