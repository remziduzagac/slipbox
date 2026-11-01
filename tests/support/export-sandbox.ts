import { afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootMarkers, setRootMarkers } from "../../src/core/workspace/vaults/vault.ts";

/** Export roots use their own .slipbox markers; an ancestor checkout is outside this fixture. */
export function makeExportSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-export-"));
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data");
  delete process.env.SLIPBOX_CONFIG;

  const markers = rootMarkers();
  setRootMarkers([".slipbox"]);
  afterAll(() => setRootMarkers(markers));
  return sandbox;
}
