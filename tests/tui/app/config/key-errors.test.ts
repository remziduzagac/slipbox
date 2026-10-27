import { describe, expect, test } from "bun:test";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 3", () => {
  test("a config key with an unknown modifier is reported and binds nothing", async () => {
    const h = await harness({ config: (c) => (c.keys = { "hyper+x": "ui.zen" } as Config["keys"]) });
    expect(h.app.messages.some((m) => m.text.includes('unknown modifier "hyper"'))).toBe(true);
    await h.keys("x");
    expect(h.app.ui.zen).toBe(false);
  });
});
