import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("distribution (14.x)", () => {
  test("the cache, once anything's cached in it, carries a CACHEDIR.TAG: backup tools skip it (14.9)", () => {
    const dir = mkdtempSync(join(sandbox, "tag-"));
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
    };
    const root = join(dir, "notes");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n");
    expect(slipbox(["index", "--refresh"], { cwd: root, env }).code).toBe(0);
    expect(readFileSync(join(dir, "cache", "slipbox", "CACHEDIR.TAG"), "utf8")).toStartWith(
      "Signature: 8a477f597d28d172789f06886806bc55\n",
    );
  });
});
