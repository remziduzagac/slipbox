// File-owned model filesystem setup, independent of App and screen composition.
import { afterAll, setDefaultTimeout } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UNIT_TIMEOUT_MS } from "../timeouts.ts";

/** The sandbox of the file running, which `makeSandbox` sets. */
let sandbox = "";

/** The sandbox of the file running; a file that never made one is told so, rather than writing where it runs. */
export function box(): string {
  if (!sandbox) throw new Error("tui-harness: call makeSandbox() at the test file's top");
  return sandbox;
}

/**
 * A sandbox for the test file that calls it, at its top (its `afterAll` is that file's): the state, cache, config and
 * data folders (the home vault, 17.2) in it, removed when the file ends; never the developer's own config or clipboard.
 */
export function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-tui-"));
  sandbox = dir;
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
  // Harnesses copy and index a vault, CLI tests start processes: slow on a loaded machine, not stuck.
  setDefaultTimeout(UNIT_TIMEOUT_MS);
  delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
  process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
  delete process.env.NO_COLOR;
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
