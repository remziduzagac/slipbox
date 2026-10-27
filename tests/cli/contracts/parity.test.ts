import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { CLI_COMMANDS, FLAGS, GLOBAL_FLAGS } from "../../../src/cli/cli.ts";
import { COMMAND_SPECS } from "../../../src/core/application/commands/catalog.ts";
import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("CLI parity (Principles)", () => {
  test("every command declares its CLI equivalent or is an interaction", () => {
    const ids = new Set<string>();
    for (const c of COMMAND_SPECS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.cli === null || c.cli.startsWith("slipbox") || c.cli.startsWith("$EDITOR")).toBe(true);
      // …and a command the CLI has.
      if (c.cli?.startsWith("slipbox ")) expect(CLI_COMMANDS.has(c.cli.split(" ")[1]!)).toBe(true);
      // …with flags it takes (`read --line` was refused).
      const sub = c.cli?.startsWith("slipbox ") ? c.cli.split(" ")[1]! : null;
      for (const [, flag] of sub ? c.cli!.matchAll(/--([a-z-]+)/g) : [])
        expect([c.id, flag, GLOBAL_FLAGS.has(flag!) || (FLAGS[sub!] ?? []).includes(flag!)]).toEqual([
          c.id,
          flag,
          true,
        ]);
    }
  });
});
