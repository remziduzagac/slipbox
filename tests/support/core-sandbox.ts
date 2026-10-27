// Each core test file owns its environment and cleanup; no TUI model is needed.
import { afterAll, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTrustedRoots } from "../../src/core/workspace/vaults/trust.ts";

export function makeCoreSandbox(): string {
  // Isolation (testing.md): never read or write the real config, cache or state directories.
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-core-"));
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
  delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
  process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
  // A root is trusted only where a test says so (23.x): none by default, as in use.
  afterEach(() => setTrustedRoots([]));
  return sandbox;
}
