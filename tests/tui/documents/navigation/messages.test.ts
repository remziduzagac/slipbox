import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): vim and editing edges", () => {
  test("enter where there's no link names the next-link keys as bound (tab), never ctrl+tab's tab switch", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "# P\n\nplain text\n");
    const h = await harness({ root, open: "p.md" });
    await h.app.run("link.follow");
    const said = h.app.messages.at(-1)!.text;
    expect(said).toBe("no link here · tab or ␣ l n goes to the next one");
  });
});
