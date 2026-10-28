import { expect, test } from "bun:test";
import { DEFAULT_KEYS, MOVE_COMMANDS } from "../../../../../src/tui/shell/input/keys/bindings.ts";
import {
  DEFAULT_SOURCE_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
} from "../../../../../src/tui/shell/input/keys/contexts.ts";
import { DEFAULT_ALIASES } from "../../../../../src/tui/shell/input/keys/aliases.ts";
import { parseGroup } from "../../../../../src/tui/shell/input/keys/help.ts";
import { keyChar, keyName, prettyKey } from "../../../../../src/tui/shell/input/keys/decoding.ts";

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
