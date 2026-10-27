import { expect, test } from "bun:test";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";

import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { cacheDir } from "../../../../src/core/foundation/platform/paths.ts";

import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makePeekFixture } from "../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox } = makePeekFixture();

let made = 0;

/** Two vaults: notes, open here, links into app; app's index made as of now, unless `index` is false. */
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

test("Graph.writtenAt: set when it writes its index, not when it has nothing to write or can't (#10)", () => {
  const { app } = twoVaults();
  const loc = locateVault({ root: app });
  expect(openGraph(loc, DEFAULT_CONFIG, true, "lazy").writtenAt).toBeNull(); // fresh: nothing to write
  writeFileSync(join(app, "more.md"), "# More\n");
  const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  g.ensureAll();
  expect(g.writtenAt).toBeNumber();
  const index = join(cacheDir(loc), "index.json");
  rmSync(index);
  mkdirSync(index);
  writeFileSync(join(app, "again.md"), "# Again\n");
  const failed = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  failed.ensureAll();
  expect(failed.writtenAt).toBeNull();
});
