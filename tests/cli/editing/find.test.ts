import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { vault, slipbox } = makeCliProcessSandbox();

describe("find and replace", () => {
  test("find: the vault or one note; plain by default; regex, whole words, smart case", () => {
    const all = slipbox(["find", "Aster", "--json"]).json.data;
    expect(all.count).toBeGreaterThan(10);
    expect(new Set(all.matches.map((m: { path: string }) => m.path)).size).toBeGreaterThan(3);
    const one = slipbox(["find", "O2[0-9]:", "operations-handbook", "--regex", "--json"]).json.data;
    expect(
      one.matches.every(
        (m: { path: string; match: string }) => m.path === "handbook/operations-handbook.md" && /^O2\d:$/.test(m.match),
      ),
    ).toBe(true);
    expect(
      slipbox(["find", "a.b", "--json"]).json.data.matches.every((m: { match: string }) => m.match === "a.b"),
    ).toBe(true); // a literal dot
    expect(slipbox(["find", "ASTER", "--json"]).json.data.count).toBe(0); // a capital: case-sensitive
    expect(slipbox(["find", "ASTER", "--ignore-case", "--json"]).json.data.count).toBeGreaterThan(all.count); // "master" too
    expect(slipbox(["find", "Aster"]).out).toMatch(/^[\w/.-]+\.md:\d+:\d+: /m);
    expect(slipbox(["find", "(", "--regex"]).code).toBe(2);
    // --whole: "aster" in "master" no longer counts.
    const whole = slipbox(["find", "aster", "--whole", "--ignore-case", "--json"]).json.data;
    const any = slipbox(["find", "aster", "--ignore-case", "--json"]).json.data;
    expect(whole.count).toBeGreaterThan(0);
    expect(whole.count).toBeLessThan(any.count);
    expect(
      whole.matches.every((m: { text: string; match: string }) =>
        new RegExp(`(^|[^\\p{L}\\p{N}_])${m.match}([^\\p{L}\\p{N}_]|$)`, "iu").test(m.text),
      ),
    ).toBe(true);
  });
  test("find: every match, however many — none left out, nothing warned", () => {
    writeFileSync(join(vault, "many-finds.md"), "Zephyrine and Zephyrine\n".repeat(6_000));
    try {
      for (const regex of [[], ["--regex"]]) {
        const r = slipbox(["find", "Zephyrine", ...regex, "--json"]);
        expect(r.json.data.count).toBe(12_000);
        expect(r.json.warnings).toEqual([]);
      }
    } finally {
      rmSync(join(vault, "many-finds.md"));
    }
  });
});
