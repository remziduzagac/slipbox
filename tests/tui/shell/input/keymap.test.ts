import { describe, expect, test } from "bun:test";
import { COMMAND_SPECS } from "../../../../src/core/application/commands/catalog.ts";
import { canonKey, canonSeq } from "../../../../src/core/application/commands/registry.ts";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { DEFAULT_KEYS, keyName } from "../../../../src/tui/shell/input/keys.ts";
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
  test("every ctrl chord outside cursor movement has a non-ctrl route (keymap.md convention)", () => {
    // Movement has its own alternatives (pagedown, home, arrows); ctrl+c's is y y, ctrl+x's d and x, ctrl+v's p.
    const exempt = (v: string) => v.startsWith("cursor.") || ["copy.selection", "edit.cut", "edit.paste"].includes(v);
    for (const [k, v] of Object.entries(DEFAULT_KEYS)) {
      if (!canonSeq(k).startsWith("ctrl+") || exempt(v)) continue;
      const others = Object.entries(DEFAULT_KEYS).filter(
        ([k2, v2]) => v2.split(" ")[0] === v.split(" ")[0] && !canonSeq(k2).startsWith("ctrl+"),
      );
      if (!others.length) throw new Error(`${k} → ${v} has no non-ctrl route`);
    }
  });
  test("key naming is canonical and comparable to config notation", () => {
    const k = (
      name: string,
      sequence: string,
      mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; super: boolean }> = {},
    ) => keyName({ name, sequence, ctrl: false, meta: false, shift: false, ...mods });
    expect(k("g", "G", { shift: true })).toBe("shift+g");
    expect(k("p", "\x10", { ctrl: true })).toBe("ctrl+p");
    expect(k("return", "\r")).toBe("enter");
    expect(k("tab", "\x1b[9;5u", { ctrl: true })).toBe("ctrl+tab");
    expect(k("left", "\x1b[1;4D", { meta: true, shift: true })).toBe("alt+shift+left");
    expect(canonKey("shift+alt+left")).toBe("alt+shift+left");
    expect(k("e", "\x1b[101;6u", { ctrl: true, shift: true })).toBe("ctrl+shift+e");
    expect(k("backspace", "\x08")).toBe("ctrl+backspace");
    // …the byte many terminals send for ctrl+h: it must still open replace there.
    expect(DEFAULT_KEYS["ctrl+backspace"]).toBe("find.replace");
    expect(DEFAULT_KEYS["ctrl+h"]).toBe("find.replace");
    expect(k("left", "\x1b[1;9D", { super: true })).toBe("cmd+left");
    expect(k("w", "\x1b\x17", { ctrl: true, meta: true })).toBe("ctrl+alt+w");
    expect(k("space", " ")).toBe("space");
    expect(k("$", "$")).toBe("$");
    expect(canonKey("G")).toBe("shift+g");
    expect(canonKey("Esc")).toBe("escape");
    expect(canonSeq("leader l n", ",")).toBe(", l n");
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
