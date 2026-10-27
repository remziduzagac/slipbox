import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("link-like tokens in code (16.10)", () => {
  test("URLs without the sentence's punctuation; paths with an extension, `:line` apart", async () => {
    const { linkTokens } = await import("../../../../src/core/documents/syntax/syntax.ts");
    const t = (s: string) => linkTokens(s).map((k) => [k.target, k.at, s.slice(k.index, k.index + k.length)]);
    expect(t("see docs/a.md and src/x.ts:42.")).toEqual([
      ["docs/a.md", null, "docs/a.md"],
      ["src/x.ts", 42, "src/x.ts:42"],
    ]);
    expect(t("(https://example.invalid/a_(b)), https://x.invalid/y.")).toEqual([
      ["https://example.invalid/a_(b)", null, "https://example.invalid/a_(b)"],
      ["https://x.invalid/y", null, "https://x.invalid/y"],
    ]);
    expect(t("version 1.5, ../up.py:3:7 and ./r.toml")).toEqual([
      ["../up.py", 3, "../up.py:3:7"],
      ["./r.toml", null, "./r.toml"],
    ]);
    // Climbing more than once: the whole path, as a moved file's rewritten one is (D63).
    expect(t("see ../../docs/x.md:2 and .../no.md")).toEqual([["../../docs/x.md", 2, "../../docs/x.md:2"]]);
  });
});
