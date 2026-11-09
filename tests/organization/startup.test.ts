import { expect, test } from "bun:test";
import { COMMAND_SPECS } from "../../src/core/application/commands/catalog.ts";
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

test("startup refuses an action implemented under an id that is only a command's former one (D274)", async () => {
  // As if an implementation had kept the id its command had before a rename: no spec has it, another lists it.
  const first = COMMAND_SPECS.shift()!;
  const other = COMMAND_SPECS[0]!;
  const formerly = other.formerly;
  other.formerly = [...(formerly ?? []), first.id];
  try {
    await expect(harness()).rejects.toThrow(`command ${first.id} has no spec in core/application/commands/catalog.ts`);
  } finally {
    other.formerly = formerly;
    COMMAND_SPECS.unshift(first);
  }
});

test("startup refuses an implemented action without a command spec", async () => {
  const first = COMMAND_SPECS.shift()!;
  try {
    await expect(harness()).rejects.toThrow(`command ${first.id} has no spec in core/application/commands/catalog.ts`);
  } finally {
    COMMAND_SPECS.unshift(first);
  }
});
