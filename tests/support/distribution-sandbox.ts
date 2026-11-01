import { afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..", "..");

/** File-owned temporary data; each distribution owner registers its own cleanup. */
export function makeDistributionSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-dist-"));
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  /** A folder of files, made. */
  function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(sandbox, "t-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  }

  return { sandbox, tree };
}
