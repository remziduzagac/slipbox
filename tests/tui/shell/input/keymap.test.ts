import { describe, expect, test } from "bun:test";
import { COMMAND_SPECS } from "../../../../src/core/application/commands/catalog.ts";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { DEFAULT_KEYS } from "../../../../src/tui/shell/input/keys.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

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
