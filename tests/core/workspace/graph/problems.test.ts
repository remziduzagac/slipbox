import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the vault's problems (1.7)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  test("every link that reaches nothing — with where and how written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-problems-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "twin.md"), "# Twin A\n");
    writeFileSync(join(dir, "b", "twin.md"), "# Twin B\n");
    writeFileSync(
      join(dir, "index.md"),
      "# Index\n\n[missing](missing.md) and [x](gone.md).\n\n[alive](alive.md) and [ok](https://example.org)\n",
    );
    writeFileSync(join(dir, "alive.md"), "# Alive\n");
    writeFileSync(join(dir, "self.md"), "# Self\n\nSee [self](self.md), [top](#self).\n");
    const p = (await cli(["problems"], dir)).json.data;
    expect(p.broken.map((x: { line: number; column: number; target: string }) => [x.line, x.column, x.target])).toEqual(
      [
        [3, 1, "missing.md"],
        [3, 27, "gone.md"],
      ],
    );
    // Orphans (9.5): nothing links to them.
    expect(p.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // its own link isn't one
    // Made: gone from the list.
    writeFileSync(join(dir, "missing.md"), "# Missing\n");
    const after = (await cli(["problems"], dir)).json.data;
    expect(after.broken.map((x: { target: string }) => x.target)).toEqual(["gone.md"]);
    expect(after.orphans).toEqual(["a/twin.md", "b/twin.md", "index.md", "self.md"]); // missing.md is linked
  });
});
