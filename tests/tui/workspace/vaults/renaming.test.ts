import { describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!;

  test("space v shift+m with another note unsaved: refused before anything changes, the .slipbox/ kept", async () => {
    const root = makeVault();
    writeFileSync(join(root, "nested-vault", "other.md"), "# Other\n");
    const h = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    h.app.buffer("other.md")!.edit(0, 0, "x");
    h.app.vaults.unmakeThis();
    expect(h.app.overlay).toBeNull(); // no preview
    expect(last(h)).toMatchObject({ level: "warn", text: expect.stringContaining("unsaved: other.md") });
    // Made unsaved while the preview showed: refused at its enter.
    const p = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    p.app.vaults.unmakeThis();
    expect(p.app.overlay).not.toBeNull();
    p.app.buffer("other.md")!.edit(0, 0, "x");
    await p.keys("enter");
    expect(existsSync(join(root, "nested-vault", ".slipbox"))).toBe(true);
    expect(p.app.loc.root).toBe(join(root, "nested-vault"));
    expect(last(p)).toMatchObject({ level: "warn", text: expect.stringContaining("unsaved: other.md") });
  });
});
