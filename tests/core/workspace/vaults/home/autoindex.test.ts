import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";
import { locateVault, recordLocation } from "../../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the background auto-index of the home folder (20.9)", () => {
  const makeHome = () => {
    const home = mkdtempSync(join(tmpdir(), "slipbox-ahome-"));
    const tree: Record<string, string> = {
      "proj/.git/HEAD": "ref: refs/heads/main\n",
      "proj/a.md": "[target](../notes/target.md)\n",
      "notes/.slipbox/config.toml": `[vault]\nid = "n${basename(home)}"\nname = "anotes-${basename(home)}"\n`,
      "notes/target.md": "# Target\n",
      "notes/inner/.slipbox/config.toml": "",
      "notes/inner/i.md": "# I\n",
      ".hidden/h/.git/HEAD": "x\n",
      "node_modules/m/.git/HEAD": "x\n",
      "deep/x/y/.git/HEAD": "x\n",
      "deep/x/y/y.md": "# Y\n",
      "loose/l.md": "# L\n",
    };
    for (const [rel, text] of Object.entries(tree)) {
      mkdirSync(join(home, rel, ".."), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    return home;
  };

  test("finds the roots in it, nested ones too, never in hidden folders or node_modules; indexes each; listed as found", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const { readRoots } = await import("../../../../../src/core/workspace/vaults/registry.ts");
    const { cacheDir } = await import("../../../../../src/core/foundation/platform/paths.ts");
    const home = makeHome();
    const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
    let slices = 0;
    while (ai.step(50)) slices++;
    expect(ai.status).toMatchObject({ found: 4, indexed: 4, queue: [], current: null });
    expect(ai.status.passFinished).not.toBeNull();
    const mine = readRoots().filter((v) => v.path.startsWith(`${home}/`));
    expect(mine.map((v) => v.path.slice(home.length + 1)).sort()).toEqual(["deep/x/y", "notes", "notes/inner", "proj"]);
    for (const v of mine) {
      expect(v.found).toBe(true);
      expect(v.indexed).toBeDefined();
      expect(existsSync(join(cacheDir(v), "index.json"))).toBe(true);
    }
    // In the lookup pointers use (21.6): the named one, as found; the unnamed ones not.
    const { readFolders } = await import("../../../../../src/core/workspace/vaults/folders.ts");
    const named = readFolders().filter((f) => f.copies.some((c) => c.path.startsWith(`${home}/`)));
    // (notes/inner's .slipbox/ has no name, and none is written into it: unnamed, 21.8.)
    expect(named.map((f) => [f.name, f.copies.map((c) => [c.path.slice(home.length + 1), c.found])]).sort()).toEqual([
      [`anotes-${basename(home)}`, [["notes", true]]],
    ]);
    expect(readFileSync(join(home, "notes", "inner", ".slipbox", "config.toml"), "utf8")).toBe("");
    // A pass done: nothing more for a day.
    expect(ai.idle).toBe(true);
    expect(ai.step(50)).toBe(false);
    expect(slices).toBeGreaterThanOrEqual(0);
  });

  test("a link from a vault never opened, found by it, is a backlink of the vault you open", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const home = makeHome();
    const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
    while (ai.step(50)) {}
    const out: string[] = [];
    await runCli(["backlinks", "target.md", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: join(home, "notes"),
      env: process.env,
    });
    expect(JSON.parse(out.join("")).data.backlinks.map((b: { from: string }) => b.from)).toContain(
      join(home, "proj", "a.md"),
    );
  });

  test("its place is kept: a new run resumes the pass; a day after one is done, the next starts; opened, a vault is no longer only found", async () => {
    const { AutoIndex, REPASS_MS } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const { readRoots } = await import("../../../../../src/core/workspace/vaults/registry.ts");
    const home = makeHome();
    const file = join(home, "..", `${basename(home)}-progress.json`);
    const first = new AutoIndex(home, file);
    // Home first, then the vaults it found, one at a time: stopped with some left.
    while (!first.status.home) first.step(0);
    first.step(0);
    const left = [...first.status.queue];
    expect(left.length).toBeGreaterThan(0);
    const again = new AutoIndex(home, file);
    expect(again.status.queue).toEqual(left);
    expect(again.status.home).toBe(true);
    while (again.step(50)) {}
    expect(again.status.found).toBe(4);
    const later = new AutoIndex(home, file, () => Date.now() + REPASS_MS + 1000);
    expect(later.idle).toBe(false);
    expect(later.step(0)).toBe(true);
    expect(later.status.passFinished).toBeNull();
    // Opened by hand: the mark goes.
    recordLocation(locateVault({ path: join(home, "deep", "x", "y") }));
    expect(readRoots().find((v) => v.path === join(home, "deep", "x", "y"))?.found).toBeUndefined();
  });

  test("slipbox index --home runs it in the foreground: a pass, or as much as --budget allows", async () => {
    const home = makeHome();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const out: string[] = [];
      const run = async (args: string[]) => {
        out.length = 0;
        await runCli([...args, "--json"], {
          out: (x: string) => out.push(x),
          err: () => {},
          stdin: async () => "",
          isTTY: false,
          columns: 80,
          cwd: join(home, "loose"),
          env: process.env,
        });
        return JSON.parse(out.join("")).data;
      };
      const r = await run(["index", "--home"]);
      expect(r).toMatchObject({ root: home, found: 4, indexed: 4, left: 0, home: { indexed: true, notes: 1 } });
      // Every command leaves its mark: the TUI's auto-index waits while an agent works.
      const { activityFile } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
      expect(Date.now() - statSync(activityFile()).mtimeMs).toBeLessThan(5000);
      expect(r.finished).not.toBeNull();
      // Done: nothing more until --rebuild.
      expect((await run(["index", "--home"])).finished).toBe(r.finished);
      expect((await run(["index", "--home", "--rebuild", "--budget", "1"])).finished).toBeNull();
    } finally {
      process.env.HOME = before;
    }
  });
});
