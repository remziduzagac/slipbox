import { describe, expect, test } from "bun:test";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test("with no note named and no session, the vault's home note opens", async () => {
    const h = await harness({});
    expect(h.app.view?.buf.rel).toBe("index.md");
  });
});
