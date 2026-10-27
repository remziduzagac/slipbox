import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";

test("package test and documentation runners retain the shared unit fallback", () => {
  const root = join(import.meta.dir, "../..");
  const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const name of ["test", "test:docs"]) {
    const configured = /--timeout\s+(\d+)\b/.exec(scripts[name]);
    expect(configured).not.toBeNull();
    expect(Number(configured![1])).toBe(UNIT_TIMEOUT_MS);
  }
});

test("Bun file-local timeout sites stay named; update this map when a file moves", () => {
  const root = join(import.meta.dir, "../..");
  const expected = new Map([
    ["tests/check-docs.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/cli.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/distribution.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/export-reads.test.ts", "TEST_BUDGETS.exportReads"],
    ["tests/export.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/servers.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/tui-harness.ts", "UNIT_TIMEOUT_MS"],
    ["tests/upgrade-restart.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/vault.test.ts", "UNIT_TIMEOUT_MS"],
  ]);
  const actual: [string, string][] = [];
  for (const file of new Bun.Glob("tests/**/*.ts").scanSync(root)) {
    if (file.includes("/fixtures/")) continue;
    for (const call of readFileSync(join(root, file), "utf8").matchAll(/^\s*setDefaultTimeout\(([^)]+)\);/gm))
      actual.push([file, call[1]!.trim()]);
  }
  expect(actual.sort()).toEqual([...expected].sort());
});
