import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("configuration: everything from config, and live reload", () => {
  test("keys, leader, pane keys, aliases and groups come from config", async () => {
    const h = await harness({
      open: "samples/handbook/operations-handbook.md",
      config: (c) => {
        c.input.leader = ",";
        c.keys = {
          x: "cursor.bottom",
          j: "",
          "leader z": "ui.zen",
          explorer: { o: "open" },
        } as unknown as Config["keys"];
        c.aliases = { bye: "app.quit" };
        c.groups = { "leader l": "LINKS" };
      },
    });
    await h.keys("x");
    expect(h.app.view!.cur.row).toBeGreaterThan(100);
    await h.keys("j");
    expect(h.app.transient!.text).toContain("not bound");
    await h.keys(",", "z");
    expect(h.app.ui.zen).toBe(true);
    const f = await h.keys(",");
    expect(f).toContain("+LINKS");
    await h.keys("escape", ":", "b", "y", "e", "enter");
    expect(h.quit.called).toBe(true);
  });
  test("unknown commands in [keys] and [aliases] are reported", async () => {
    const h = await harness({
      config: (c) => ((c.keys = { Q: "no.such" } as Config["keys"]), (c.aliases = { zz: "nope.cmd" })),
    });
    expect(h.app.messages.some((m) => m.text.includes("no.such"))).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("nope.cmd"))).toBe(true);
  });
  test("space v c reloads: new keys, theme and UI defaults apply live", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "tokyo-night"\n');
    const h = await harness({ configFile: file });
    writeFileSync(file, 'theme = "nord"\n[ui]\nline_numbers = true\n[keys]\n"x" = "ui.zen"\n');
    await h.keys("space", "v", "c");
    expect(h.app.theme.name).toBe("nord");
    expect(h.app.ui.line_numbers).toBe(true);
    await h.keys("x");
    expect(h.app.ui.zen).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("config reloaded"))).toBe(true);
  });
  test("a reload's root_markers decide where roots are from then on (21.1)", async () => {
    const { rootMarkers, setRootMarkers } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "nord"\n');
    const h = await harness({ configFile: file });
    try {
      writeFileSync(file, '[walk]\nroot_markers = [".git", ".foam"]\n');
      await h.keys("space", "v", "c");
      expect(rootMarkers()).toEqual([".git", ".foam"]);
    } finally {
      setRootMarkers(null);
    }
  });
  test("[colors] overrides apply to the theme, the picker's preview and a live reload", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, '[colors]\ntree_guide = "#445566"\n');
    const h = await harness({ configFile: file, config: (c) => (c.colors = { tree_guide: "#445566" }) });
    expect(h.app.theme.roles.tree_guide.fg).toBe("#445566");
    expect(h.app.settings.themeNamed("nord").theme.roles.tree_guide.fg).toBe("#445566"); // what the picker previews
    writeFileSync(file, '[colors]\ntree_guide = "#778899"\n');
    await h.keys("space", "v", "c");
    expect(h.app.theme.roles.tree_guide.fg).toBe("#778899");
  });
  test("saving a config file reloads it automatically", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, "");
    const h = await harness({
      configFile: file,
      watch: true,
      config: (c) => ((c.watch.enabled = false), (c.watch.poll_ms = 100)),
    });
    try {
      await new Promise((r) => setTimeout(r, 30));
      writeFileSync(file, 'theme = "gruvbox-dark"\n');
      const end = Date.now() + 3000;
      while (h.app.theme.name !== "gruvbox-dark" && Date.now() < end) await new Promise((r) => setTimeout(r, 30));
      expect(h.app.theme.name).toBe("gruvbox-dark");
    } finally {
      h.app.quit();
    }
  });
  test("a broken config on reload is reported, never fatal", async () => {
    const dir = mkdtempSync(join(sandbox, "cfg-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, 'theme = "nord"\n');
    const h = await harness({ configFile: file });
    writeFileSync(file, "theme = [unclosed\n");
    await h.keys(":", "c", "o", "n", "f", "i", "g", "enter");
    expect(h.app.messages.some((m) => m.level === "warn" && m.text.includes("config.toml"))).toBe(true);
  });
});

describe("review cycle 3 (config in the TUI)", () => {
  test("a typo saved mid-edit keeps the theme, keys and picked settings; :toString isn't an alias", async () => {
    const root = makeVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, 'theme = "nord"\n[keys]\n"leader z" = "ui.zen"\n');
    const h = await harness({ root, configFile: cfg });
    h.app.settings.reload();
    await h.app.run("theme.set dracula");
    writeFileSync(cfg, 'theme = "nord"\n[keys\n');
    h.app.settings.reload();
    expect(h.app.ui.theme).toBe("dracula");
    await h.keys("space", "z");
    expect(h.app.ui.zen).toBe(true);
    await h.keys(":", ...[..."toString"], "enter");
    expect(h.app.messages.some((m) => m.text.includes("is not a function"))).toBe(false);
  });
  test("cancelling a picker after a reload keeps the reloaded setting", async () => {
    const root = makeVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, "");
    const h = await harness({ root, configFile: cfg });
    await h.keys("space", "u", "t", "j");
    writeFileSync(cfg, 'theme = "nord"\n');
    h.app.settings.reload();
    await h.keys("escape");
    expect(h.app.theme.name).toBe("nord");
  });
});
