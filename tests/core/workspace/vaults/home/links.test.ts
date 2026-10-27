import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { locateVault, recordLocation, rootAt } from "../../../../../src/core/workspace/vaults/vault.ts";

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

  test("a vault inside home stays its own: a boundary of home's walk, its notes never home's — nor its backlinks", async () => {
    const { Reach } = await import("../../../../../src/core/workspace/links/reach.ts");
    const { walkHomeNow } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-other-")));
    await withHome(
      {
        "todo.md": "# Todo\n",
        "journal/day.md": "[todo](../todo.md) and [r](../repo/r.md)\n",
        "repo/.git/HEAD": "ref: refs/heads/main\n",
        "repo/r.md": "[todo](../todo.md)\n",
      },
      (home) => {
        mkdirSync(join(elsewhere, ".slipbox"));
        writeFileSync(join(elsewhere, "x.md"), `[t](${home}/todo.md) [r](${home}/repo/r.md)\n`);
        const ox = rootAt(elsewhere);
        recordLocation(ox);
        openGraph(ox, DEFAULT_CONFIG, true).ensureAll();
        const loc = locateVault({ path: join(home, "todo.md") });
        walkHomeNow(loc, DEFAULT_CONFIG);
        const g = openGraph(loc, DEFAULT_CONFIG, true);
        expect([...g.notes.keys()].sort()).toEqual(["journal/day.md", "todo.md"]);
        expect(g.nestedRoots()).toEqual(["repo"]);
        expect(locateVault({ path: join(home, "repo", "r.md") })).toMatchObject({
          mode: "vault",
          root: join(home, "repo"),
        });
        g.reach = new Reach(loc);
        // The other vault's link to a note of home: a backlink; to a note of the vault inside it: that vault's, not home's.
        const inbound = g.reach.inbound(g);
        expect([...inbound.keys()]).toEqual(["todo.md"]);
        expect(
          g
            .backlinks("todo.md")
            .map((b) => b.from)
            .sort(),
        ).toEqual([join(elsewhere, "x.md"), "journal/day.md"]);
      },
    );
  });

  test("its notes are backlinks of a vault's, found by the background index; a vault's notes are home's", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    await withHome(
      {
        "plan.md": "[target](notes/target.md)\n",
        "notes/.slipbox/config.toml": "",
        "notes/target.md": "[plan](../plan.md)\n",
      },
      async (home) => {
        const ai = new AutoIndex(home, join(home, "..", `${basename(home)}-progress.json`));
        while (ai.step(50)) {}
        expect(ai.status).toMatchObject({ home: true, homeNotes: 1, found: 1, indexed: 1 });
        const into = await cli(["backlinks", "target.md"], join(home, "notes"));
        expect(into.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual([join(home, "plan.md")]);
        const out = await cli(["backlinks", "plan.md"], home);
        expect(out.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual([
          join(home, "notes", "target.md"),
        ]);
      },
    );
  });

  test("a folder of home made a vault, and back: a name across the new edge rewritten to reach the same note", async () => {
    const files = {
      "a.md": "[[b]], and [the plan](projects/thesis/plan.md)\n",
      "projects/thesis/b.md": "# B\n",
      "projects/thesis/plan.md": "# Plan\n",
    };
    await withHome(files, async (home) => {
      const thesis = join(home, "projects", "thesis");
      const reached = async () =>
        ((await cli(["links", "a.md"], home)).json.data as { status: string; path: string }[]).map((l) => [
          l.status,
          l.path.startsWith("/") ? l.path : join(home, l.path),
        ]);
      const before = [
        ["note", join(thesis, "b.md")],
        ["note", join(thesis, "plan.md")],
      ];
      // The first command in home: home walked for it, every folder of it there for the plan.
      const made = (await cli(["init", "projects/thesis"], home)).json;
      expect(made.data).toMatchObject({ kind: "make-root", from: "projects/thesis", dryRun: false });
      expect(existsSync(join(thesis, ".slipbox", "config.toml"))).toBe(true);
      expect(locateVault({ path: join(thesis, "b.md") }).root).toBe(thesis);
      // A name doesn't reach into another vault: [[b]] written so it reaches b.md still; the path as it was.
      const a = readFileSync(join(home, "a.md"), "utf8");
      expect(a).not.toContain("[[b]]");
      expect(a).toContain("(projects/thesis/plan.md)");
      expect(await reached()).toEqual(before);
      // Back: home's again, every link reaching what it did.
      const back = (await cli(["deinit", "projects/thesis"], home)).json;
      expect(back.data).toMatchObject({ kind: "unmake-root", from: "projects/thesis", dryRun: false });
      expect(existsSync(join(thesis, ".slipbox"))).toBe(false);
      expect(locateVault({ path: join(thesis, "b.md") })).toMatchObject({ mode: "home", root: home });
      expect(await reached()).toEqual(before);
    });
  });
});
