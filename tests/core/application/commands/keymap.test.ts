import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { canonKey, Keymap, unknownModifiers } from "../../../../src/core/application/commands/registry.ts";
import { COMMAND_SPECS, currentCommand, FORMER_IDS } from "../../../../src/core/application/commands/catalog.ts";
import { recentCommands, type SessionState } from "../../../../src/core/workspace/session/position.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("keymap (0.8)", () => {
  test("sequences, prefixes and overrides", () => {
    const k = new Keymap({ "g g": "scroll.top", j: "scroll.down" }, { j: "", "g  t": "tab.next" });
    expect(k.lookup("g g")).toBe("scroll.top");
    expect(k.lookup("j")).toBeUndefined();
    expect(k.isPrefix("g")).toBe(true);
    expect(k.lookup("g t")).toBe("tab.next");
  });
});

describe("a command's former ids (D274)", () => {
  test("each is one command's, never an id a command has now; a spec under one reads as under the id now", () => {
    const ids = new Set(COMMAND_SPECS.map((c) => c.id));
    const former = COMMAND_SPECS.flatMap((c) => c.formerly ?? []);
    expect(former.length).toBe(FORMER_IDS.size); // none claimed twice
    expect(former.filter((old) => ids.has(old))).toEqual([]);
    // The renames of #104's regroup: what acts on any file is file.*, what the vault group holds vault.*.
    expect(FORMER_IDS.get("note.rename")).toBe("file.rename");
    expect(FORMER_IDS.get("note.save")).toBe("file.save");
    expect(FORMER_IDS.get("folders.open")).toBe("vault.open");
    expect(FORMER_IDS.get("folder.name")).toBe("vault.name");
    expect(FORMER_IDS.has("note.edit")).toBe(false); // a note's own keeps its name
    expect(currentCommand("note.rename")).toBe("file.rename");
    expect(currentCommand("note.open notes/a.md")).toBe("file.open notes/a.md"); // its argument kept
    expect(currentCommand("note.save_all")).toBe("file.save_all"); // whole ids, never a prefix
    expect(currentCommand("ui.zen")).toBe("ui.zen");
    expect(currentCommand("no.such thing")).toBe("no.such thing");
  });

  test("a session's recent commands come back by their ids now, each once, where it came first", () => {
    const kept = (ids: string[]) => ({ version: 1, tabs: [], activeTab: 0, sidebar: true, recent_commands: ids });
    // Run before the rename and after it: Rename was listed twice in the palette's Recent.
    const ids = ["note.rename", "ui.zen", "file.rename", "folders.open", "vault.open", "note.save", "help.open"];
    expect(recentCommands(kept(ids) as SessionState, 5)).toEqual([
      "file.rename",
      "ui.zen",
      "vault.open",
      "file.save",
      "help.open",
    ]);
    expect(recentCommands(null, 5)).toEqual([]);
  });
});

describe("review round 3 (core)", () => {
  test("an unknown modifier keeps the key from binding plain x, and is reported", () => {
    expect(canonKey("hyper+x")).toBe("hyper+x");
    expect(unknownModifiers("hyper+x g g")).toEqual(["hyper"]);
    expect(unknownModifiers("ctrl+w shift+h")).toEqual([]);
    expect(unknownModifiers("ctrl++")).toEqual([]);
  });
});
