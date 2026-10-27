import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review cycle 4 (vault, hostile files)", () => {
  test("a symlinked FIFO is skipped; device symlinks for .gitignore, config and version are refused", async () => {
    const { symlinkSync } = await import("node:fs");
    const { WalkFilter, walkVault } = await import("../../../../src/core/workspace/walk/walk.ts");
    const { loadConfig } = await import("../../../../src/core/application/config/config.ts");
    const { readVaultVersion } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-hostile-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "# a\n");
    Bun.spawnSync(["mkfifo", join(dir, "pipe")]);
    symlinkSync("pipe", join(dir, "flink.md"));
    symlinkSync("/dev/zero", join(dir, "sub", ".gitignore"));
    symlinkSync("/dev/zero", join(dir, ".slipbox", "config.toml"));
    symlinkSync("/dev/zero", join(dir, ".slipbox", "version"));
    const walk = walkVault(dir, new WalkFilter(dir, DEFAULT_CONFIG.walk));
    expect(walk.files.map((f) => f.rel)).toEqual(["a.md"]);
    expect(walk.skipped.find((s) => s.rel === "flink.md")?.reason).toContain("isn't a file");
    const cfg = loadConfig({ vaultRoot: dir, configFile: join(dir, "none.toml") });
    expect(cfg.warnings.join("\n")).toContain("not a regular file");
    expect(readVaultVersion(dir)).toBeNull();
  });
});
