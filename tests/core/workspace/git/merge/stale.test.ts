import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("advisory staleness (9.9)", () => {
  test("an empty list removes this process's file; another user's process (EPERM) counts as alive", async () => {
    const { readStale, writeDirty } = await import("../../../../../src/core/workspace/git/merge/stale.ts");
    const v = { key: `stale-${process.pid}` };
    writeDirty(v, ["a.md", "b.md"]);
    expect(readStale(v)).toEqual([
      { path: "a.md", pid: process.pid },
      { path: "b.md", pid: process.pid },
    ]);
    writeDirty(v, []);
    expect(readStale(v)).toEqual([]);
    const { stateDir } = await import("../../../../../src/core/foundation/platform/paths.ts");
    expect(existsSync(join(stateDir(v), "dirty", `${process.pid}.json`))).toBe(false);
    writeDirty(v, []); // nothing to remove: no error
    if (process.getuid?.() !== 0) {
      writeDirty(v, ["root.md"], 1); // pid 1 isn't this user's to signal: alive, as far as anyone can tell
      expect(readStale(v)).toEqual([{ path: "root.md", pid: 1 }]);
      writeDirty(v, [], 1);
    }
  });
});
