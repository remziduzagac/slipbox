import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { expect, setDefaultTimeout, test } from "bun:test";
import { VAULT, makeVaultSandbox } from "../../support/vault-sandbox.ts";
import { cli } from "../../support/vault-cli.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

test("vaults lists known vaults as text and JSON and refuses extra arguments", async () => {
  await cli(["ls"]);
  const json = await cli(["vaults", "--json"]);
  expect(json.code).toBe(0);
  const entries = JSON.parse(json.out).data as { label: string; data: { root: string } | null }[];
  expect(entries.some((entry) => entry.data?.root === VAULT)).toBe(true);
  const text = await cli(["vaults"]);
  expect(text.code).toBe(0);
  expect(text.out).toContain(entries.find((entry) => entry.data?.root === VAULT)!.label);
  expect((await cli(["vaults", "extra"])).code).not.toBe(0);
});
