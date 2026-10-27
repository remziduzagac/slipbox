// Vault fixtures keep their original run-owned cleanup through tests/setup.ts.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const VAULT = join(import.meta.dir, "..", "fixtures", "vault");

export function makeVaultSandbox(): string {
  // Isolate state and cache so tests never touch the real ~/.local/state.
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-test-"));
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
  delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
  process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
  return sandbox;
}
