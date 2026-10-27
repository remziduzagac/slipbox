import { expect, test } from "bun:test";

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";

import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { cacheDir } from "../../../../src/core/foundation/platform/paths.ts";
import { Reach } from "../../../../src/core/workspace/links/reach.ts";
import { readRoots } from "../../../../src/core/workspace/vaults/registry.ts";

import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { onlyRootsUnder } from "../../../support/vault-roots.ts";
import { makePeekFixture } from "../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox } = makePeekFixture();

test("a Reach that doesn't record leaves the machine's list alone; one that doesn't index nested vaults leaves theirs unbuilt", async () => {
  const top = realpathSync(mkdtempSync(join(sandbox, "reach-")));
  const here = join(top, "here");
  const there = join(top, "there");
  const nested = join(there, "nested");
  for (const [dir, note] of [
    [here, "a.md"],
    [there, "b.md"],
    [nested, "c.md"],
  ] as const) {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, note), "# Note\n");
  }
  await onlyRootsUnder(top, async () => {
    const listed = () => readRoots().map((v) => v.path);
    const g = new Reach(locateVault({ root: here }), { record: false }).graphAt(there)!;
    expect(g.thorough).toBe(true);
    expect(listed()).not.toContain(there);
    const r = new Reach(locateVault({ root: there }), { record: false });
    r.discover(g);
    expect(listed()).not.toContain(nested);
    expect(existsSync(join(cacheDir(locateVault({ root: nested })), "index.json"))).toBe(true);
    // Recorded, its index left to whoever reads it: the peek's main thread.
    const own = new Reach(locateVault({ root: here }), { thorough: false }).graphAt(there)!;
    expect(own.thorough).toBe(false);
    expect(listed()).toContain(there);
  });
});

test("a Reach's nested roots without an index, found: indexed, opened alone, or left alone, as it says (#10)", () => {
  const top = realpathSync(mkdtempSync(join(sandbox, "nested-")));
  const there = join(top, "there");
  const nested = join(there, "nested");
  for (const [dir, note] of [
    [there, "b.md"],
    [nested, "c.md"],
  ] as const) {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, note), "# Note\n");
  }
  const loc = locateVault({ root: there });
  const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  const index = join(cacheDir(locateVault({ root: nested })), "index.json");
  const none = new Reach(loc, { record: false, nested: "none" });
  none.discover(g);
  expect(none.held(nested)).toBeUndefined();
  const open = new Reach(loc, { record: false, nested: "open" });
  open.discover(g);
  expect(open.held(nested)).toBeTruthy();
  expect(existsSync(index)).toBe(false);
  // Read alone, its others write nothing: its first index is written all the same.
  const built = new Reach(loc, { record: false, readOnly: true });
  built.discover(g);
  expect(existsSync(index)).toBe(true);
  expect(built.written()).toEqual([locateVault({ root: nested }).key]);
});
