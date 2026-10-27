import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../../../src/cli/args.ts";
import { CliError, Session, type Io } from "../../../src/cli/common.ts";
import { READING_COMMANDS } from "../../../src/cli/reading.ts";
import { locateVault } from "../../../src/core/workspace/vaults/vault.ts";
import { makeCoreSandbox } from "../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();

// Handlers return data/human text; dispatch, envelopes and process exit codes have their own launcher coverage.
function session(command: string): Session {
  const root = join(sandbox, command);
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  writeFileSync(join(root, "a.md"), "# A\n\n## Details\n\nSaved text.\n");
  const io: Io = {
    out: () => {
      throw new Error("handlers return text instead of writing stdout");
    },
    err: () => {
      throw new Error("handlers return diagnostics instead of writing stderr");
    },
    stdin: async () => "",
    isTTY: false,
    columns: 80,
    cwd: root,
    env: process.env,
  };
  return new Session(parseArgs([command]), locateVault({ cwd: root }), io);
}

describe("reading handlers without the launcher", () => {
  test("read returns saved text and its content hash without a JSON envelope", async () => {
    const s = session("read");
    const result = await READING_COMMANDS.read!(s, ["a.md"]);
    expect(result.human).toBe("# A\n\n## Details\n\nSaved text.\n");
    expect(result.data).toMatchObject({
      path: "a.md",
      content: result.human,
      sha: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(result.code).toBeUndefined();
    expect(s.allWarnings()).toEqual([]);
  });

  test("outline returns the real heading lines and the same human heading text", async () => {
    const result = await READING_COMMANDS.outline!(session("outline"), ["a.md"]);
    expect(result.data).toMatchObject({
      path: "a.md",
      headings: [
        { depth: 1, text: "A", line: 1 },
        { depth: 2, text: "Details", line: 3 },
      ],
    });
    expect(result.human).toBe("    1  # A\n    3    ## Details\n");
  });

  test("a missing note retains the typed not-found refusal for the dispatch adapter", () => {
    const s = session("missing");
    let error: unknown;
    try {
      READING_COMMANDS.read!(s, ["missing.md"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe(3);
    expect((error as Error).message).toContain("missing.md");
  });
});
