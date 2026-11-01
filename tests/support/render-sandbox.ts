import { afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMermaid } from "../../src/core/rendering/media/diagrams/diagrams.ts";

/** Each rendering owner registers the original environment, cleanup and Mermaid preload. */
export function makeRenderSandbox() {
  // Isolation (testing.md): never read or write the real config, cache or state directories.
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-render-"));
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
  delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
  process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  // What loads lazily is the process's, shared by the test files run in it (16.6): one run before this, export's, may
  // have loaded the Mermaid library already. Loaded before any render here, the layouts never depend on what ran first:
  // the samples' diagrams are drawn as the TUI draws them once it's in.
  beforeAll(async () => {
    await loadMermaid();
  });
}
