import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review round 2 (CLI)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-r2-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  test("a markdown link in the wrong case resolves to the note's own path, and counts as a backlink", async () => {
    const dir = vault({ "note.md": "# note\n", "linker.md": "[x](Note.md)\n" });
    const links = JSON.parse((await cli(["links", join(dir, "linker.md"), "--root", dir, "--json"])).out);
    expect(links.data[0].path).toBe("note.md");
    const bl = JSON.parse((await cli(["backlinks", join(dir, "note.md"), "--root", dir, "--json"])).out);
    expect(bl.data.backlinks.map((b: { from: string }) => b.from)).toContain("linker.md");
  });
});
