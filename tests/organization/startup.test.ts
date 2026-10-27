import { expect, test } from "bun:test";
import { COMMAND_SPECS } from "../../src/core/command-specs.ts";
import { harness, makeSandbox } from "../tui-harness.ts";

makeSandbox();

test("startup refuses a command spec without an implementation", async () => {
  const first = COMMAND_SPECS[0]!;
  const id = first.id;
  first.id = "test.missing_implementation";
  try {
    await expect(harness()).rejects.toThrow("command test.missing_implementation is specified but not implemented");
  } finally {
    first.id = id;
  }
});

test("startup refuses an implemented action without a command spec", async () => {
  const first = COMMAND_SPECS.shift()!;
  try {
    await expect(harness()).rejects.toThrow(`command ${first.id} has no spec in core/command-specs.ts`);
  } finally {
    COMMAND_SPECS.unshift(first);
  }
});
