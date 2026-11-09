import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  canonKey,
  CommandRegistry,
  Keymap,
  unknownModifiers,
} from "../../../../src/core/application/commands/registry.ts";
import { COMMAND_SPECS, currentCommand, FORMER_IDS } from "../../../../src/core/application/commands/catalog.ts";
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

  test("the registry finds and runs a command by a former id, and lists it by its id alone", async () => {
    const r = new CommandRegistry<string[]>();
    r.register({
      id: "file.rename",
      title: "Rename",
      formerly: ["note.rename"],
      run: (ran, arg) => void ran.push(arg ?? ""),
    });
    expect(r.get("note.rename")?.id).toBe("file.rename");
    const ran: string[] = [];
    expect(await r.run(ran, "note.rename b.md")).toBe(true);
    expect(ran).toEqual(["b.md"]);
    expect(r.list().map((c) => c.id)).toEqual(["file.rename"]);
    // A former id is no command's own, and no two commands share one.
    expect(() => r.register({ id: "note.rename", title: "x", run: () => {} })).toThrow("registered twice");
    expect(() => r.register({ id: "y", title: "y", formerly: ["note.rename"], run: () => {} })).toThrow(
      "registered twice",
    );
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
