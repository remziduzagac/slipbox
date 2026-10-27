import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG, loadConfig } from "../../../../src/core/application/config/config.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("settings, deeper over broader (20.7)", () => {
  test("a vault inside another: its own settings, then the outer one's, then yours; a program named in a vault's never runs", async () => {
    const { configFilesFor } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const base = mkdtempSync(join(tmpdir(), "slipbox-deeper-"));
    const outer = join(base, "outer");
    const inner = join(outer, "inner");
    mkdirSync(join(inner, ".slipbox"), { recursive: true });
    mkdirSync(join(outer, ".slipbox"));
    const outerCfg = join(outer, ".slipbox", "config.toml");
    const innerCfg = join(inner, ".slipbox", "config.toml");
    writeFileSync(outerCfg, '[ui]\nsidebar_width = 31\nreadable_max = 90\n\n[editor]\ncommand = "rm -rf"\n');
    writeFileSync(innerCfg, "[ui]\nreadable_max = 70\n");
    const user = join(base, "user.toml");
    writeFileSync(user, "[ui]\nsidebar_width = 25\noutline_width = 33\n");
    const files = configFilesFor(locateVault({ path: inner }));
    expect(files).toEqual({ vaultFile: innerCfg, outerFiles: [outerCfg] });
    const loaded = loadConfig({ ...files, configFile: user });
    expect(loaded.config.ui.readable_max).toBe(70); // its own
    expect(loaded.config.ui.sidebar_width).toBe(31); // the outer vault's, over yours
    expect(loaded.config.ui.outline_width).toBe(33); // yours, where no vault says
    expect(loaded.config.editor.command).toBe(DEFAULT_CONFIG.editor.command);
    expect(loaded.warnings.join()).toContain("editor.command");
    expect(loaded.sources).toEqual([user, outerCfg, innerCfg]);
    // Three deep: broadest first. A git vault inside has no file of its own, and takes theirs.
    const repo = join(inner, "code");
    mkdirSync(join(repo, ".git"), { recursive: true });
    expect(configFilesFor(locateVault({ path: repo }))).toEqual({
      vaultFile: join(repo, ".slipbox", "config.toml"),
      outerFiles: [outerCfg, innerCfg],
    });
    expect(
      loadConfig({ ...configFilesFor(locateVault({ path: repo })), configFile: user }).config.ui.readable_max,
    ).toBe(70);
    // The outer vault itself: its own, nothing above. A loose file: the home vault's.
    expect(configFilesFor(locateVault({ path: outer })).outerFiles).toEqual([]);
    // slipbox info says which files, in that order.
    const out: string[] = [];
    await runCli(["info", "--json", "--config", user], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: inner,
      env: process.env,
    });
    expect(JSON.parse(out.join("")).data.config.sources).toEqual([user, outerCfg, innerCfg]);
  });
});
