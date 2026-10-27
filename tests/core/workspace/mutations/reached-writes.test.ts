import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

test("writers change a reached note in a hidden folder; never one the vault hasn't reached, nor .slipbox/ (20.8)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-reachw-"));
  mkdirSync(join(dir, ".slipbox"));
  mkdirSync(join(dir, ".notes"));
  writeFileSync(join(dir, "index.md"), "[h](.notes/h.md)\n");
  writeFileSync(join(dir, ".notes", "h.md"), "# H\n");
  writeFileSync(join(dir, ".notes", "u.md"), "# U\n");
  const out: string[] = [];
  const cli = async (args: string[]) => {
    out.length = 0;
    return runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
  };
  expect(await cli(["write", ".notes/h.md", "# H\n\nmore"])).toBe(0);
  expect(readFileSync(join(dir, ".notes", "h.md"), "utf8")).toBe("# H\n\nmore\n");
  expect(await cli(["write", ".slipbox/x.md", "no", "--create"])).toBe(5);
  expect(await cli(["write", ".notes/new.md", "no", "--create"])).toBe(5);
  expect(existsSync(join(dir, ".notes", "new.md"))).toBe(false);
});
