import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { slipbox } = makeCliProcessSandbox();

test("a move from a fresh process rewrites a code comment's path too: the grammar loaded before planning (20.19)", () => {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-mvcode-"));
  mkdirSync(join(dir, ".slipbox"));
  writeFileSync(join(dir, "a.md"), "# A\n");
  writeFileSync(join(dir, "run.py"), "# see a.md\nprint(1)\n");
  const r = slipbox(["mv", "a", "docs/a", "--json"], { cwd: dir });
  expect(r.code).toBe(0);
  expect(readFileSync(join(dir, "run.py"), "utf8")).toBe("# see docs/a.md\nprint(1)\n");
});
