import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("tags (1.6)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  const dir = mkdtempSync(join(tmpdir(), "slipbox-tags-"));
  mkdirSync(join(dir, ".slipbox"));
  writeFileSync(join(dir, "a.md"), "---\ntags: [Project, x]\n---\n# A\n\n#project/alpha and #idea\n");
  writeFileSync(join(dir, "b.md"), "# B\n\n#Project/Alpha, #idea `#not-in-code`\n");
  writeFileSync(join(dir, "c.md"), "# C\n\n#other\n");

  test("every tag with its count — one tag whatever its case, a nested one counted under its parent too", async () => {
    expect((await cli(["tags"], dir)).json.data).toEqual([
      { tag: "idea", count: 2 },
      { tag: "other", count: 1 },
      { tag: "Project", count: 2 },
      { tag: "project/alpha", count: 2 },
      { tag: "x", count: 1 },
    ]);
    expect((await cli(["tags", "project"], dir)).json.data).toEqual({ tag: "Project", notes: ["a.md", "b.md"] });
    expect((await cli(["tags", "#Project/Alpha"], dir)).json.data.notes).toEqual(["a.md", "b.md"]);
    expect((await cli(["tags", "nope"], dir)).code).toBe(3);
    // A note's own list: the frontmatter's and the text's, each once.
    expect((await cli(["stat", "a"], dir)).json.data.tags).toEqual(["Project", "x", "project/alpha", "idea"]);
    // An edit shows at once.
    await cli(["write", "c", "# C\n\n#other #idea\n"], dir);
    expect((await cli(["tags", "idea"], dir)).json.data.notes).toEqual(["a.md", "b.md", "c.md"]);
  });
});
