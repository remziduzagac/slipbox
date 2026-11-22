import { describe, expect, test } from "bun:test";
import { CLI_COMMANDS } from "../../../src/cli/cli.ts";
import { mistypedCommand, mistypedMessage } from "../../../src/cli/mistyped.ts";

const COMMANDS = [...CLI_COMMANDS, "open"];
const meant = (word: string) => mistypedCommand(word, COMMANDS, () => false);

describe("a mistyped command (CL2)", () => {
  test("a slip of one letter, or a swap of two, is asked about", () => {
    expect(meant("serch")).toBe("search"); // typos: ignore-line
    expect(meant("fnid")).toBe("find");
    expect(meant("rendr")).toBe("render");
    expect(meant("serach")).toBe("search"); // typos: ignore-line
  });

  test("a name a person gives a note is a note: short, plural or containing a command, or two edits from one", () => {
    for (const word of [
      "inbox",
      "todo",
      "test",
      "temp",
      "readme",
      "log",
      "map",
      "notes",
      "ideas",
      "journal",
      "draft",
      "tasks",
      "folder",
      "tag",
      "research",
      "install",
      "reads",
    ])
      expect([word, meant(word)]).toEqual([word, null]);
  });

  test("two edits count only from seven letters", () => {
    expect(meant("rendr")).toBe("render"); // one
    expect(meant("rnder")).toBe("render"); // one
    expect(meant("rendre")).toBe("render"); // a swap: one
    expect(meant("doctr")).toBe("doctor"); // one
    expect(meant("conxtext")).toBe("context"); // one, eight letters // typos: ignore-line
    expect(meant("conxtxt")).toBe("context"); // two, seven letters
    expect(meant("rndr")).toBeNull(); // two, four letters
  });

  test("a path, an existing note or a word with a slash or a dot is not asked about", () => {
    expect(mistypedCommand("serch", COMMANDS, (p) => p.endsWith("serch.md"))).toBeNull(); // typos: ignore-line
    expect(mistypedCommand("serch", COMMANDS, (p) => p === "serch")).toBeNull(); // typos: ignore-line
    expect(meant("./serch")).toBeNull(); // typos: ignore-line
    expect(meant("serch.md")).toBeNull(); // typos: ignore-line
  });

  test("the message names the command and how to open a note of that name anyway", () => {
    expect(mistypedMessage("serch", "search")).toBe(
      // typos: ignore-line
      'slipbox: unknown command "serch" — did you mean `search`? (`slipbox help` lists the commands; `slipbox ./serch` opens a new note named serch)\n', // typos: ignore-line
    );
  });
});
