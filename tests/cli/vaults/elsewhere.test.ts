import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review cycle 5 (vault, a loose folder)", () => {
  test("Elsewhere in the CLI: no index to build or search (VV-D3)", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-plainscope-"));
    const plain = join(base, "plain");
    const v = join(base, "v");
    mkdirSync(plain);
    mkdirSync(join(v, ".slipbox"), { recursive: true });
    writeFileSync(join(v, "w.md"), "# W\n\nA walrus.\n");
    writeFileSync(join(plain, "p.md"), "# P\n\n[w](../v/w.md) and a walrus.\n");
    const out: string[] = [];
    const cli = async (args: string[], cwd: string) => {
      out.length = 0;
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
    await cli(["ls"], v);
    const index = await cli(["index"], plain);
    expect(index.code).toBe(5);
    expect(index.json.error.message).toBe(`Elsewhere has no index: ${plain} is outside home and every vault`);
    const r = await cli(["search", "walrus", "--scope", "linked"], plain);
    expect(r.code).toBe(5);
    expect(r.json.error.message).toStartWith("Elsewhere has no index, so no search across it");
  });
});
