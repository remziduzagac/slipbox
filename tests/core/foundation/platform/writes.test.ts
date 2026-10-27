import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WriteRefused, writeNote } from "../../../../src/core/foundation/platform/fsutil.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review cycle 1 (core)", () => {
  const tmp = (name: string) => mkdtempSync(join(tmpdir(), `slipbox-${name}-`));
  test("writeNote: a new file through a symlinked folder is refused; a vault reached by a symlink is fine", () => {
    const root = tmp("wroot");
    const outside = tmp("wout");
    symlinkSync(outside, join(root, "out"));
    expect(() => writeNote(root, join(root, "out", "new.md"), "x")).toThrow(WriteRefused);
    expect(existsSync(join(outside, "new.md"))).toBe(false);
    const via = join(tmp("wvia"), "link");
    symlinkSync(root, via);
    writeNote(via, join(via, "brand-new.md"), "ok");
    expect(readFileSync(join(root, "brand-new.md"), "utf8")).toBe("ok");
    writeNote(root, join(root, "..notes.md"), "dots"); // a name starting with dots is inside
    expect(existsSync(join(root, "..notes.md"))).toBe(true);
  });
});
