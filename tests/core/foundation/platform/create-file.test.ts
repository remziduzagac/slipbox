import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, entryAt, writeNote } from "../../../../src/core/foundation/platform/fsutil.ts";

const root = mkdtempSync(join(tmpdir(), "slipbox-create-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("exclusive first save (#168)", () => {
  test("publishes the complete file, with its stamp and no temporary file left", () => {
    const path = join(root, "parents/deep/new.md");
    const stamp = writeNote(root, path, "# New\n", { create: true });
    expect(readFileSync(path, "utf8")).toBe("# New\n");
    expect(stamp.size).toBe(6);
    expect(readdirSync(join(root, "parents/deep"))).toEqual(["new.md"]);
  });

  test("the atomic publication cannot replace an entry already there", () => {
    const path = join(root, "existing.md");
    writeFileSync(path, "Theirs");
    expect(() => atomicWrite(path, "Mine", true)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("Theirs");
    expect(readdirSync(root).some((n) => n.includes(".slipbox-") && n.endsWith(".tmp"))).toBe(false);
  });

  test("a dangling symlink occupies the new name too, and its target stays absent", () => {
    const path = join(root, "dangling.md");
    const target = join(root, "target.md");
    symlinkSync(target, path);
    expect(() => writeNote(root, path, "Mine", { create: true })).toThrow("was created on disk");
    expect(entryAt(path)).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  test("creating through a symlink out of the vault is still refused", () => {
    symlinkSync(tmpdir(), join(root, "out"));
    expect(() => writeNote(root, join(root, "out/slipbox-new-168.md"), "Mine", { create: true })).toThrow(
      "resolves outside the vault",
    );
  });
});
