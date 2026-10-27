import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";

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

  test("an agent in home: walked the first time, then the walk kept read; info says home", async () => {
    const { homeWalkKept } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "deep/er/b.md": "[a](../../a.md)\n" }, async (home) => {
      expect(homeWalkKept(homeAt(home))).toBe(false);
      const r = await cli(["backlinks", "a.md"], home);
      expect(r.json.data.backlinks.map((b: { from: string }) => b.from)).toEqual(["deep/er/b.md"]);
      expect(homeWalkKept(homeAt(home))).toBe(true);
      const info = (await cli(["info"], join(home, "deep"))).json.data;
      expect(info).toMatchObject({ root: home, mode: "home", name: null, notes: 2 });
      expect(info.index.walked).not.toBeNull();
      expect(info.index.capped).toBeNull();
      expect((await cli(["name", "mine"], home)).code).toBe(5);
    });
  });
});
