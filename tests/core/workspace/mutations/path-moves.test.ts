import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("renames and moves on paths (20.19)", () => {
  test("a note moved: every file linking in — a note, a reached one, a data file's value, a code comment — and its own links out", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-mv19-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "sub"));
    mkdirSync(join(dir, "tmp"));
    const files: Record<string, string> = {
      "a.md": "# A\n\n[up](sub/x.md) [self](#a)\n",
      "index.md": "[a](a.md) [h](a.md#a) [l](tmp/local.md)\n",
      "sub/x.md": "[a](../a.md)\n",
      "sub/tool.py": "# see ../a.md for why\nprint(1)\n",
      "run.py": "# see a.md\nprint(1)\n",
      "cfg.toml": 'doc = "a.md"\n',
      ".gitignore": "tmp/\n",
      "tmp/local.md": "[a](../a.md)\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    const out: string[] = [];
    const code = await runCli(["mv", "a", "docs/a", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(code).toBe(0);
    const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
    expect(read("index.md")).toBe("[a](docs/a.md) [h](docs/a.md#a) [l](tmp/local.md)\n");
    expect(read("sub/x.md")).toBe("[a](../docs/a.md)\n");
    expect(read("tmp/local.md")).toBe("[a](../docs/a.md)\n");
    expect(read("cfg.toml")).toBe('doc = "docs/a.md"\n');
    expect(read("run.py")).toBe("# see docs/a.md\nprint(1)\n");
    expect(read("sub/tool.py")).toBe("# see ../docs/a.md for why\nprint(1)\n");
    expect(read("docs/a.md")).toBe("# A\n\n[up](../sub/x.md) [self](#a)\n");
  });
});
