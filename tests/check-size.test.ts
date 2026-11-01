// The size check (D235, scripts/check-size.ts): no source file over LIMIT lines, the few past it capped.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPPED, GENERATED, judgeSizes, LIMIT, lineCount, TEST_CAPPED, TEST_LIMIT } from "../scripts/check-size.ts";

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-size-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

describe("the size check (D235, scripts/check-size.ts)", () => {
  test("a file over the limit, or over its cap, is over; one a cap can come down for is said", () => {
    expect(judgeSizes(new Map([["src/new.ts", 601]]), {}).over).toEqual([
      { path: "src/new.ts", lines: 601, limit: 600 },
    ]);
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

  test("even a one-line shrink requires lowering the exact cap", () => {
    const cap = LIMIT + 100;
    expect(judgeSizes(new Map([["src/big.ts", cap - 1]]), { "src/big.ts": cap })).toEqual({
      over: [],
      lower: [{ path: "src/big.ts", lines: cap - 1, cap }],
    });
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
  const run = (files: Record<string, string>, prepare?: (top: string) => void) => {
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
    prepare?.(top);
    const r = Bun.spawnSync([process.execPath, join(top, "scripts", "check-size.ts")]);
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test("the script fails on a source file one line over the limit, and passes one at it", () => {
    const over = run({ "src/tui/new.ts": "x\n".repeat(LIMIT + 1) });
    expect(over.code).toBe(1);
    expect(over.err).toContain(`src/tui/new.ts has ${LIMIT + 1} lines, over ${LIMIT}`);
    expect(run({ "src/tui/new.ts": "x\n".repeat(LIMIT) }).code).toBe(0);
  });

  test("test owners use their separate ceiling and exact ratchet instead of the source limit", () => {
    expect(LIMIT).toBe(600);
    expect(TEST_LIMIT).toBe(1500);
    expect(run({ "src/fine.ts": "", "tests/new.test.ts": "x\n".repeat(TEST_LIMIT) }).code).toBe(0);
    const over = run({ "src/fine.ts": "", "tests/new.test.ts": "x\n".repeat(TEST_LIMIT + 1) });
    expect(over.code).toBe(1);
    expect(over.err).toContain(`tests/new.test.ts has ${TEST_LIMIT + 1} lines, over ${TEST_LIMIT}`);
    expect(
      judgeSizes(new Map([["tests/back.test.ts", TEST_LIMIT]]), { "tests/back.test.ts": TEST_LIMIT }, TEST_LIMIT).lower,
    ).toEqual([{ path: "tests/back.test.ts", lines: TEST_LIMIT, cap: TEST_LIMIT }]);
    const outside = join(sandbox, "fixture-data");
    mkdirSync(outside);
    writeFileSync(join(outside, "data.ts"), "x\n".repeat(TEST_LIMIT + 1));
    const links = run({ "src/fine.ts": "" }, (top) => {
      mkdirSync(join(top, "tests", "fixtures"), { recursive: true });
      symlinkSync(join(outside, "data.ts"), join(top, "tests", "fixtures", "data.ts"));
      symlinkSync(outside, join(top, "tests", "fixtures", "linked"));
      symlinkSync(join(top, "tests"), join(top, "tests", "fixtures", "cycle"));
    });
    expect(links.code).toBe(0);
    const file = "tests/legacy.test.ts";
    const cap = TEST_LIMIT + 100;
    const capped = (files: Record<string, string>) =>
      run({ "src/fine.ts": "", ...files }, (top) => {
        const script = join(top, "scripts", "check-size.ts");
        const source = readFileSync(script, "utf8").replace(
          /export const TEST_CAPPED: Record<string, number> = \{[^}]*\};/,
          `export const TEST_CAPPED: Record<string, number> = { ${JSON.stringify(file)}: ${cap} };`,
        );
        writeFileSync(script, source);
      });
    const shrunk = capped({ [file]: "x\n".repeat(cap - 1) });
    expect(shrunk.code).toBe(1);
    expect(shrunk.out).toContain(`lower the cap to ${cap - 1}`);
    const back = capped({ [file]: "x\n".repeat(TEST_LIMIT) });
    expect(back.code).toBe(1);
    expect(back.out).toContain("drop it from TEST_CAPPED");
    expect(judgeSizes(new Map([[file, TEST_LIMIT + 1]]), { [file]: TEST_LIMIT + 2 }, TEST_LIMIT).lower).toEqual([
      { path: file, lines: TEST_LIMIT + 1, cap: TEST_LIMIT + 2 },
    ]);
  });

  test("the script fails until a legacy cap is lowered, including a one-line shrink", () => {
    const cap = LIMIT + 100;
    const file = "src/legacy.ts";
    const shrunk = run({ [file]: "x\n".repeat(cap - 1) }, (top) => {
      const script = join(top, "scripts", "check-size.ts");
      const source = readFileSync(script, "utf8").replace(
        /export const CAPPED: Record<string, number> = \{[^}]*\};/,
        `export const CAPPED: Record<string, number> = { ${JSON.stringify(file)}: ${cap} };`,
      );
      writeFileSync(script, source);
    });
    expect(shrunk.code).toBe(1);
    expect(shrunk.out).toContain(`lower the cap to ${cap - 1}`);
    expect(Math.max(...Object.values(CAPPED))).toBeLessThanOrEqual(1500);
  });

  test("the repository itself passes, and every capped file still exists and is past the limit", () => {
    const r = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "scripts", "check-size.ts")]);
    expect(r.exitCode).toBe(0);
    for (const [path, cap] of Object.entries(TEST_CAPPED)) {
      const lines = lineCount(readFileSync(join(import.meta.dir, "..", path), "utf8"));
      expect(lines).toBeGreaterThan(TEST_LIMIT);
      expect(lines).toBe(cap);
    }
    for (const path of Object.keys({ ...CAPPED, ...GENERATED })) {
      const lines = lineCount(readFileSync(join(import.meta.dir, "..", path), "utf8"));
      expect(lines).toBeGreaterThan(LIMIT);
    }
  });
});
