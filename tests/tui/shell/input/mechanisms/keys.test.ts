import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { canonKey, canonSeq } from "../../../../../src/core/application/commands/registry.ts";
import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { DEFAULT_KEYS, MOVE_COMMANDS } from "../../../../../src/tui/shell/input/keys/bindings.ts";
import {
  DEFAULT_SOURCE_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
} from "../../../../../src/tui/shell/input/keys/contexts.ts";
import { DEFAULT_ALIASES } from "../../../../../src/tui/shell/input/keys/aliases.ts";
import { DEFAULT_GROUPS, parseGroup } from "../../../../../src/tui/shell/input/keys/help.ts";
import { keyChar, keyName, prettyKey } from "../../../../../src/tui/shell/input/keys/decoding.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

test("binding owners retain generated window and numbered tab chords beside extended movement", () => {
  expect(DEFAULT_KEYS["ctrl+w left"]).toBe("window.focus_left");
  expect(DEFAULT_KEYS["leader w shift+h"]).toBe("window.move_left");
  expect(DEFAULT_KEYS["alt+9"]).toBe("tab.goto 9");
  expect(DEFAULT_KEYS["shift+right"]).toBe("cursor.right extend");
  expect(MOVE_COMMANDS.has("cursor.right")).toBe(true);
});

test("context bindings retain source operators and independent pane overrides", () => {
  expect(DEFAULT_SOURCE_KEYS.d).toBe("edit.op_delete");
  expect(DEFAULT_OUTLINE_KEYS.r).toBe("rename");
  expect(DEFAULT_FOOTNOTE_KEYS.r).toBe("rename");
  expect(DEFAULT_OUTLINE_KEYS).not.toBe(DEFAULT_FOOTNOTE_KEYS);
});

test("group help splits its first colon and aliases retain save and quit commands", () => {
  expect(parseGroup(" files : rename: move ")).toEqual({ name: "files", desc: "rename: move" });
  expect(parseGroup(" files ")).toEqual({ name: "files", desc: "" });
  expect(DEFAULT_ALIASES.w).toBe("note.save");
  expect(DEFAULT_ALIASES.wq).toBe("app.save_quit");
});

test("decoding separates printable text from modified terminal names and help spelling", () => {
  const key = { name: "x", sequence: "X", ctrl: false, meta: false, shift: true };
  expect(keyName(key)).toBe("shift+x");
  expect(keyName({ ...key, name: "kpenter", sequence: "", shift: false })).toBe("enter");
  expect(keyChar("shift+9")).toBe("(");
  expect(keyChar("ctrl+x")).toBeNull();
  expect(prettyKey("space w shift+h")).toBe("␣ w S-h");
});

describe("review round 3", () => {
  test("keypad keys and legacy ctrl+j arrive under the names the keymaps use", () => {
    expect(keyName({ name: "kpenter", sequence: "\u001b[57414u" } as never)).toBe("enter");
    expect(keyName({ name: "kpleft", sequence: "\u001b[57417u" } as never)).toBe("left");
    expect(keyName({ name: "linefeed", sequence: "\n" } as never)).toBe("ctrl+j");
  });
});

describe("keymap and registry (0.8, 3.12)", () => {
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

describe("which-key", () => {
  test("the explanations of g, z, [ and ] name every key under them", () => {
    for (const prefix of ["g", "z", "[", "]"]) {
      const { desc } = parseGroup(DEFAULT_GROUPS[prefix]!);
      const named = [...desc.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1]!.split(" "));
      const under = Object.keys(DEFAULT_KEYS)
        .filter((k) => k.startsWith(`${prefix} `))
        .map((k) => keyChar(k.slice(prefix.length + 1)) ?? k);
      for (const k of under) expect([prefix, k, named.includes(k)]).toEqual([prefix, k, true]);
    }
  });
});
