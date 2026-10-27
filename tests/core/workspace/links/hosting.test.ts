import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("links to a repository's own hosting: the edges", () => {
  test("a path that isn't valid percent-encoding is kept as written; a README any case, a file only", async () => {
    const { inRepo, parseHosted, readmeAt } = await import("../../../../src/core/workspace/links/hosting.ts");
    expect(parseHosted("https://github.com/me/repo/blob/main/100%-done.md")).toMatchObject({
      path: "100%-done.md",
      ref: "main",
    });
    expect(parseHosted("https://github.com/me/repo/blob/main/a.md#50%")).toMatchObject({
      path: "a.md",
      fragment: "50%",
    });
    const top = mkdtempSync(join(tmpdir(), "slipbox-hosting-"));
    expect(readmeAt(top)).toBeNull();
    mkdirSync(join(top, "README.md")); // a folder of that name isn't it
    expect(readmeAt(top)).toBeNull();
    writeFileSync(join(top, "ReadMe.markdown"), "# hi\n");
    expect(readmeAt(top)).toBe("ReadMe.markdown");
    expect(readmeAt(join(top, "missing"))).toBeNull();
    expect(inRepo(top, "ReadMe.markdown")).toBe(true);
    expect(inRepo(top, "docs/x.md")).toBe(false);
    rmSync(top, { recursive: true, force: true });
  });
});
