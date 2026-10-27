import { read } from "../../../../support/tui/peek-reading.ts";
import { expect, test } from "bun:test";

import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { STALE_TEMP_MS, sweepTemps } from "../../../../../src/core/foundation/platform/fsutil.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { cacheDir } from "../../../../../src/core/foundation/platform/paths.ts";

import { initVault, locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { harness, onlyRootsUnder } from "../../../../tui-harness.ts";
import { makePeekFixture } from "../../../../support/tui/peek-fixture.ts";

const { sandbox } = makePeekFixture();
let made = 0;
function twoVaults(files: Record<string, string> = {}, index = true) {
  const n = ++made;
  const base = mkdtempSync(join(sandbox, "peek-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const all: Record<string, string> = {
    "notes/index.md": "# Index\n\n[design](../app/design.md)\n",
    "app/design.md": "# Design\n\nShip.\n",
    "app/links.md": "See [design](design.md).\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  initVault(notes, `pnotes${n}`);
  initVault(app, `papp${n}`);
  if (index) openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
  return { base, notes, app, n };
}

test("a temporary file of the index left by a thread let go of mid-write is swept once it's old (#10)", async () => {
  const { base, notes, app } = twoVaults();
  const dir = cacheDir(locateVault({ root: app }));
  const old = join(dir, `.index.json.slipbox-1-7-deadbeef.tmp`);
  const fresh = join(dir, `.index.json.slipbox-1-8-cafebabe.tmp`);
  const other = join(dir, `.heads.json.slipbox-1-7-deadbeef.tmp`);
  for (const f of [old, fresh, other]) writeFileSync(f, "{");
  const hour = new Date(Date.now() - 2 * STALE_TEMP_MS);
  utimesSync(old, hour, hour);
  utimesSync(other, hour, hour);
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
  });
  expect(existsSync(old)).toBe(false);
  expect(existsSync(fresh)).toBe(true); // a write may be under way to it
  expect(existsSync(other)).toBe(true); // not the index's
  sweepTemps(dir, "heads.json");
  expect(existsSync(other)).toBe(false);
});
