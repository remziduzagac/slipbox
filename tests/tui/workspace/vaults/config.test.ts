import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("settings from the vaults around this one (20.7)", () => {
  test("a change to an enclosing vault's config is noticed and applied, as the vault's own is", async () => {
    const outer = mkdtempSync(join(sandbox, "outer-"));
    mkdirSync(join(outer, ".slipbox"));
    const cfg = join(outer, ".slipbox", "config.toml");
    writeFileSync(cfg, "[ui]\nsidebar_width = 30\n");
    const inner = join(outer, "inner");
    mkdirSync(join(inner, ".slipbox"), { recursive: true });
    writeFileSync(join(inner, "n.md"), "# N\n");
    const h = await harness({ root: inner, open: "n.md" });
    expect(h.app.settings.changedOnDisk()).toBe(false);
    writeFileSync(cfg, "[ui]\nsidebar_width = 41\n");
    expect(h.app.settings.changedOnDisk()).toBe(true);
    h.app.settings.reload("file changed");
    expect(h.app.config.ui.sidebar_width).toBe(41);
  });
});
