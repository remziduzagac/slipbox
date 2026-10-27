import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandViolations } from "../../scripts/check-boundary.ts";
import { COMMAND_SPECS } from "../../src/core/command-specs.ts";

test("command areas reject the composer for values, types, re-exports and dynamic imports", () => {
  for (const text of [
    'import type { CommandSpec } from "../command-specs";',
    'export type { CommandSpec } from "../command-specs.ts";',
    'import { COMMAND_SPECS } from "../command-specs";',
    'const specs = import("../command-specs.ts");',
  ])
    expect(commandViolations("src/core/commands/editing.ts", text)).toHaveLength(1);
  expect(commandViolations("src/core/commands/editing.ts", 'import type { CommandSpec } from "./contracts";')).toEqual(
    [],
  );
  expect(commandViolations("src/core/commands/contracts.ts", 'import type { App } from "../../tui/app";')).toHaveLength(
    1,
  );
});

test("every real catalog follows the independent contract and command IDs stay unique", () => {
  const root = join(import.meta.dir, "../..");
  for (const file of new Bun.Glob("src/core/commands/*.ts").scanSync(root))
    expect(commandViolations(file, readFileSync(join(root, file), "utf8"))).toEqual([]);
  expect(new Set(COMMAND_SPECS.map((s) => s.id)).size).toBe(COMMAND_SPECS.length);
});
