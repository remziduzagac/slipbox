import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-export-ancestor-"));
const root = join(import.meta.dir, "../../../..");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

test("the export fixture keeps loose files outside roots beneath an ancestor checkout", () => {
  const ancestor = join(sandbox, "ancestor");
  const temporary = join(ancestor, "temporary");
  mkdirSync(join(ancestor, ".git"), { recursive: true });
  mkdirSync(temporary);
  const env = {
    ...process.env,
    TMPDIR: temporary,
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
    XDG_DATA_HOME: join(sandbox, "data"),
    SLIPBOX_CONFIG: "",
  };
  const probe = Bun.spawnSync(
    [
      "bun",
      "-e",
      'import { findVaultRoot } from "./src/core/workspace/vaults/vault.ts"; console.log(findVaultRoot(process.env.TMPDIR!));',
    ],
    { cwd: root, env },
  );
  expect(probe.exitCode).toBe(0);
  expect(probe.stdout.toString().trim()).toBe(ancestor);

  const result = Bun.spawnSync(
    [
      "bun",
      "test",
      "tests/export.test.ts",
      "-t",
      "any other file there, of the format or not|never over a note of any root",
    ],
    { cwd: root, env },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toContain("2 pass");
  expect(result.stderr.toString()).toContain("0 fail");
});
