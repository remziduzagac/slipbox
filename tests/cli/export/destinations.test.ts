import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("writing", () => {
  test("export: -o ending in / a folder, made, the note's name in it, its own name no format; never over another root's note", () => {
    const made = slipbox(["export", "dome-refit", "-o", "made/v1.2/", "--json"]);
    expect([made.code, made.json.data.path]).toEqual([0, "made/v1.2/dome-refit.docx"]);
    expect(
      readFileSync(join(vault, "made", "v1.2", "dome-refit.docx"))
        .subarray(0, 4)
        .toString("latin1"),
    ).toBe("PK\x03\x04");
    const other = join(sandbox, "other-root");
    mkdirSync(join(other, ".slipbox"), { recursive: true });
    writeFileSync(join(other, "theirs.md"), "# Theirs\n");
    const over = slipbox(["export", "dome-refit", "-o", join(other, "theirs.md"), "--to", "docx"]);
    expect([over.code, over.err]).toEqual([
      5,
      `slipbox: ${join(other, "theirs.md")} is a note — an export doesn't write over it\n`,
    ]);
    expect(readFileSync(join(other, "theirs.md"), "utf8")).toBe("# Theirs\n");
  });
});
