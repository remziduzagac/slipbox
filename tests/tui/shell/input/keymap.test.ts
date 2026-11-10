import { describe, expect, test } from "bun:test";
import { COMMAND_SPECS, FORMER_IDS } from "../../../../src/core/application/commands/catalog.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Config, loadConfig } from "../../../../src/core/application/config/config.ts";
import { DEFAULT_KEYS } from "../../../../src/tui/shell/input/keys.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("keymap and registry (0.8, 3.12)", () => {
  test("every default binding names a registered command", async () => {
    const h = await harness();
    for (const spec of Object.values(DEFAULT_KEYS)) expect(h.app.registry.get(spec.split(" ")[0]!)).toBeDefined();
  });
  test("every command spec is implemented", async () => {
    const h = await harness();
    for (const s of COMMAND_SPECS) expect(h.app.registry.get(s.id)).toBeDefined();
  });
  test("every command renamed runs by its former id; help and the palette list it by its id now (D274)", async () => {
    const h = await harness();
    expect(FORMER_IDS.size).toBeGreaterThanOrEqual(20);
    for (const [old, now] of FORMER_IDS) expect([old, h.app.registry.get(now)?.id]).toEqual([old, now]);
    expect(h.app.registry.list().filter((c) => FORMER_IDS.has(c.id))).toEqual([]);
    // Run by the id it had, as a script may still name it: the command it is now.
    expect(h.app.rightView).not.toBe("info");
    await h.app.run("note.info");
    expect(h.app.rightView).toBe("info");
    expect(h.app.messages.filter((m) => m.text.includes("unknown command"))).toEqual([]);
  });
  test("a former id in [keys] and [aliases] still runs: its key and its :alias the command's now, nothing unknown (D274)", async () => {
    // Read as a config file is: the ids it had are the ids now from there on.
    const file = join(makeVault(), "config.toml");
    writeFileSync(file, '[keys]\n"g q" = "note.info"\n"ctrl+s" = "note.save"\n[aliases]\nvv = "folders.open"\n');
    const loaded = loadConfig({ configFile: file }).config;
    expect((loaded.keys as Record<string, string>)["g q"]).toBe("file.info");
    const h = await harness({ config: (c) => ((c.keys = loaded.keys), (c.aliases = loaded.aliases)) });
    expect(h.app.messages.filter((m) => m.text.includes("unknown command"))).toEqual([]);
    // Help and the palette show the key under the command's name now.
    expect(h.app.keymap.keysFor("file.info")).toContain("g q");
    expect(h.app.aliases.vv).toBe("vault.open");
    expect(h.app.rightView).not.toBe("info");
    await h.keys("g", "q");
    expect(h.app.rightView).toBe("info");
    await h.keys(":", "v", "v", "enter");
    expect(h.app.overlay?.kind === "list" && h.app.overlay.title).toStartWith("Vaults");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("a key that is both a command and a prefix: run on its own once the pause passes, not when its sequence follows", async () => {
    const h = await harness({
      config: (c) => (
        (c.input.which_key_delay_ms = 40),
        (c.keys = { q: "ui.zen", "q q": "cursor.bottom" } as unknown as Config["keys"])
      ),
    });
    await h.keys("q");
    expect(h.app.ui.zen).toBe(false); // waiting for a second key
    await Bun.sleep(120);
    expect(h.app.pending).toEqual([]);
    expect(h.app.ui.zen).toBe(true);
    await h.keys("q", "q");
    await Bun.sleep(120);
    expect(h.app.ui.zen).toBe(true); // q q ran, q didn't
    expect(h.app.view!.cur.row).toBeGreaterThan(0);
  });
});
