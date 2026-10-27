import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";

import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";

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
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };

  test("past home's cap, the background index still finds the vaults in the folders it left, its skip list held", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const files = {
      "a/n.md": "# N\n",
      "b/c/repo/.git/HEAD": "ref: refs/heads/main\n",
      "b/c/repo/r.md": "# R\n",
      "b/node_modules/dep/.git/HEAD": "ref: refs/heads/main\n",
      "b/.hidden/h/.git/HEAD": "ref: refs/heads/main\n",
    };
    await withHome(files, async (home) => {
      const file = join(home, "..", `${basename(home)}-progress.json`);
      const ai = new AutoIndex(home, file, () => Date.now(), { limits: { notes: 100, folders: 2 } });
      while (ai.step(50)) {}
      expect(ai.status).toMatchObject({ home: true, capped: "folders", homeNotes: 1, found: 1, indexed: 1 });
      const { readRoots } = await import("../../../../../src/core/workspace/vaults/registry.ts");
      expect(readRoots().some((v) => v.path === join(home, "b", "c", "repo") && v.found)).toBe(true);
    });
  });

  test("its cap: a walk of exactly so many notes left nothing out; its other files capped too, those nearest the top", async () => {
    const { SlicedWalk, WalkFilter } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const files = { "a.md": "", "b.md": "", "c.md": "", "d/x.txt": "", "d/y.txt": "", "e.txt": "", "f.json": "" };
    await withHome(files, (home) => {
      const walk = (limits: { notes: number; folders: number; assets?: number }) => {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }), limits);
        while (w.step(50)) {}
        return { capped: w.capped, files: w.result!.files.length, dirs: w.result!.dirs, assets: w.result!.assets };
      };
      // Three notes, three at most: none left out, every folder listed.
      expect(walk({ notes: 3, folders: 100 })).toMatchObject({ capped: null, files: 3, dirs: ["", "d"] });
      expect(walk({ notes: 2, folders: 100 })).toMatchObject({ capped: "notes", files: 2 });
      // Three other files at most: the top's first; the walk goes on for notes.
      expect(walk({ notes: 100, folders: 100, assets: 3 })).toMatchObject({
        capped: null,
        files: 3,
        dirs: ["", "d"],
        assets: ["e.txt", "f.json", "d/x.txt"],
      });
    });
  });

  test("its cap holds what comes into a folder of a walk kept: a tree unpacked past the folder cap listed as far as the room left, and said", async () => {
    const { homeFilter, homeWalk } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const limits = { notes: 100, folders: 5 };
      utimesSync(home, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
      walkHomeNow(loc, DEFAULT_CONFIG, limits);
      // Unpacked into a: its time moves, so it's listed again.
      for (let i = 0; i < 10; i++) {
        mkdirSync(join(home, "a", "big", `d${i}`), { recursive: true });
        writeFileSync(join(home, "a", "big", `d${i}`, "n.md"), "# N\n");
      }
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], limits);
      expect(w.capped).toBe("folders");
      expect(w.walk.dirs.length).toBeLessThanOrEqual(limits.folders);
      expect(w.walk.files.map((f) => f.rel)).toContain("a/n.md");
      expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], limits).capped).toBe("folders");
    });
  });

  test("index --refresh ~ says when home's walk reached its cap", async () => {
    await withHome({ "a.md": "# A\n" }, async (home) => {
      for (let i = 0; i <= 5_000; i++) mkdirSync(join(home, `f${i}`));
      const r = await cli(["index", "--refresh", home], home);
      expect(r.json.data.capped).toBe("folders");
      const out: string[] = [];
      await runCli(["index", "--refresh", home], {
        out: (x: string) => out.push(x),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: home,
        env: process.env,
      });
      expect(out.join("")).toContain("home's walk stopped at 5,000 folders");
    });
  });
});
