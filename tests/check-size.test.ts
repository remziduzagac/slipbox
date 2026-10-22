// The size check (D235, scripts/check-size.ts): no source file over LIMIT lines, the few past it capped.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPPED, judgeSizes, LIMIT, lineCount } from "../scripts/check-size.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-size-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

describe("the size check (D235, scripts/check-size.ts)", () => {
  test("a file over the limit, or over its cap, is over; one a cap can come down for is said", () => {
    const capped = { "src/big.ts": 3000, "src/shrunk.ts": 3000, "src/small.ts": 3000 };
    const v = judgeSizes(
      new Map([
        ["src/new.ts", LIMIT + 1],
        ["src/fine.ts", LIMIT],
        ["src/big.ts", 3001],
        ["src/shrunk.ts", 2000],
        ["src/small.ts", 900],
      ]),
      capped,
    );
    expect(v.over).toEqual([
      { path: "src/big.ts", lines: 3001, limit: 3000 },
      { path: "src/new.ts", lines: LIMIT + 1, limit: LIMIT },
    ]);
    expect(v.lower).toEqual([
      { path: "src/shrunk.ts", lines: 2000, cap: 3000 },
      { path: "src/small.ts", lines: 900, cap: 3000 },
    ]);
  });

  test("a capped file within a little of its cap is left alone", () => {
    expect(judgeSizes(new Map([["src/big.ts", 2900]]), { "src/big.ts": 3000 })).toEqual({ over: [], lower: [] });
  });

  test("a capped file back under the limit is to be dropped from the list, however close to its cap", () => {
    const cap = LIMIT + 100;
    expect(judgeSizes(new Map([["src/back.ts", LIMIT - 50]]), { "src/back.ts": cap }).lower).toEqual([
      { path: "src/back.ts", lines: LIMIT - 50, cap },
    ]);
  });

  test("lines counted as an editor counts them", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a")).toBe(1);
    expect(lineCount("a\n")).toBe(1);
    expect(lineCount("a\nb")).toBe(2);
    expect(lineCount("a\n\n")).toBe(2);
  });

  /** A tree of its own, the script copied into it (it checks the tree it sits in), with these files. */
  const run = (files: Record<string, string>) => {
    const top = mkdtempSync(join(sandbox, "tree-"));
    mkdirSync(join(top, "scripts"));
    writeFileSync(
      join(top, "scripts", "check-size.ts"),
      readFileSync(join(import.meta.dir, "..", "scripts", "check-size.ts"), "utf8"),
    );
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(top, rel, ".."), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    const r = Bun.spawnSync([process.execPath, join(top, "scripts", "check-size.ts")]);
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test("the script fails on a source file one line over the limit, and passes one at it", () => {
    const over = run({ "src/tui/new.ts": "x\n".repeat(LIMIT + 1) });
    expect(over.code).toBe(1);
    expect(over.err).toContain(`src/tui/new.ts has ${LIMIT + 1} lines, over ${LIMIT}`);
    expect(run({ "src/tui/new.ts": "x\n".repeat(LIMIT) }).code).toBe(0);
  });

  test("the repository itself passes, and every capped file still exists and is past the limit", () => {
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "scripts", "check-size.ts")]);
    expect(r.exitCode).toBe(0);
    for (const path of Object.keys(CAPPED)) {
      const lines = lineCount(readFileSync(join(import.meta.dir, "..", path), "utf8"));
      expect(lines).toBeGreaterThan(LIMIT);
    }
  });
});
