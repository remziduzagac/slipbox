import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("file groups (16.1)", () => {
  test("notes by the vault's extensions, data by format, binary by extension, text otherwise", async () => {
    const { classify, isKnownExtension } = await import("../../../../src/core/documents/model/filetypes.ts");
    const notes = ["md", "markdown"];
    expect(classify("a/b.md", notes)).toEqual({ group: "note", format: "markdown" });
    expect(classify("x.org", notes).group).toBe("text"); // not a note unless the vault lists it
    expect(classify("x.org", [...notes, "org"])).toEqual({ group: "note", format: "markdown" }); // a listed extension: read as markdown
    expect(classify("cfg/app.toml", notes)).toEqual({ group: "data", format: "toml" });
    expect(classify("a.YML", notes)).toEqual({ group: "data", format: "yaml" });
    expect(classify("t.tsv", notes)).toEqual({ group: "data", format: "tsv" });
    expect(classify("src/app.ts", notes)).toEqual({ group: "text", format: "typescript" });
    expect(classify("Makefile", notes)).toEqual({ group: "text", format: "makefile" });
    expect(classify("notes.txt", notes)).toEqual({ group: "text", format: "text" });
    expect(classify("img/photo.PNG", notes).group).toBe("binary");
    expect(isKnownExtension("toml") && isKnownExtension("py") && !isKnownExtension("2")).toBe(true);
  });
});
