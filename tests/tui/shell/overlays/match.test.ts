import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review cycle 5 (core, from mutation testing)", () => {
  test("the switcher's match is smart-case too", async () => {
    const { match } = await import("../../../../src/tui/shell/overlays/match.ts");
    expect(match("Tel", "telescope.md")).toBeNull();
    expect(match("tel", "Telescope.md")).not.toBeNull();
  });
});
