import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { homeFilter } from "../../../../../src/core/workspace/vaults/home/filter.ts";
import { homeWalkFile, homeWalkKept } from "../../../../../src/core/workspace/vaults/home/cache.ts";
import { under } from "../../../../../src/core/workspace/vaults/home/paths.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";

const sandbox = makeCoreSandbox();
test("home containment respects segment boundaries while its top contains every relative path", () => {
  expect(under("notes/a.md", "notes")).toBe(true);
  expect(under("notes-extra/a.md", "notes")).toBe(false);
  expect(under("notes", "notes")).toBe(true);
  expect(under("anything", "")).toBe(true);
});

test("the shared home filter factory keeps current extensions and exclusions", () => {
  const root = mkdtempSync(join(sandbox, "home-"));
  const config = structuredClone(DEFAULT_CONFIG);
  config.walk.exclude = ["private/**"];
  const filter = homeFilter({ root }, config);
  expect(filter.isNoteName("a.md")).toBe(true);
  expect(filter.exclusion("private/a.md", false)).not.toBeNull();
});

test("home cache reuse requires its original version and filter contract", () => {
  const root = mkdtempSync(join(sandbox, "home-"));
  writeFileSync(join(root, "a.md"), "# A\n");
  const loc = { root, key: "home-mechanisms" };
  walkHomeNow(loc, DEFAULT_CONFIG);
  expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(true);
  writeFileSync(homeWalkFile(loc), '{"version":0}\n');
  expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(false);
});
