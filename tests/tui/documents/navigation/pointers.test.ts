import { describe, expect, test } from "bun:test";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test(":open of a pointer to a folder this machine doesn't know: said, nothing opened", async () => {
    const h = await harness();
    await h.app.run("note.open slipbox://no-such-folder-here/x.md");
    expect(h.app.messages.at(-1)!.level).toBe("warn");
    expect(last(h)).toStartWith("slipbox://no-such-folder-here/x.md: ");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });
});
