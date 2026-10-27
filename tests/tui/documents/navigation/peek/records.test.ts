import { read } from "../../../../support/tui/peek-reading.ts";
import { expect, spyOn, test } from "bun:test";

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";

import { Reach } from "../../../../../src/core/workspace/links/reach.ts";
import { noteIndexed, readRoots } from "../../../../../src/core/workspace/vaults/registry.ts";

import { initVault, locateVault, recordLocation } from "../../../../../src/core/workspace/vaults/vault.ts";
import * as vaultModule from "../../../../../src/core/workspace/vaults/vault.ts";
import * as fsutil from "../../../../../src/core/foundation/platform/fsutil.ts";

import { harness, onlyRootsUnder } from "../../../../tui-harness.ts";
import { makePeekFixture } from "../../../../support/tui/peek-fixture.ts";

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

test("a vault nested in the peeked one, never indexed, has its links among the backlinks: recorded here, indexed on the thread", async () => {
  const { base, notes, app } = twoVaults();
  const sub = join(app, "sub");
  mkdirSync(sub);
  writeFileSync(join(sub, "deep.md"), "# Deep\n\n[up](../design.md)\n");
  // A vault by its marker alone: not in the machine's list until something records it.
  mkdirSync(join(sub, ".slipbox"));
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).toContain("**Linked from** (2):");
    expect(text).toContain("[sub/deep.md:3](<sub/deep.md#L3>) — up");
  });
});

test("a vault come into the peeked one since its first peek has its links among the next peek's backlinks, and is recorded", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("**Linked from** (1):");
    await h.keys("esc");
    const later = join(app, "later");
    mkdirSync(join(later, ".slipbox"), { recursive: true });
    writeFileSync(join(later, "n.md"), "# N\n\n[the design](../design.md)\n");
    await h.keys("enter");
    const text = await read(h);
    expect(text).toContain("**Linked from** (2):");
    expect(text).toContain("[later/n.md:3](<later/n.md#L3>) — the design");
    expect(readRoots().map((v) => v.path)).toContain(later);
  });
});

test("a vault nested in the peeked one, built on the thread, is stamped indexed in the machine's list (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    expect(readRoots().find((v) => v.path === lab)?.indexed).toBeString();
  });
});

test("a vault nested in the peeked one since its last peek, built on the thread, is stamped indexed once it's recorded (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    await h.keys("esc");
    const lab = join(realpathSync(app), "lab");
    mkdirSync(join(lab, ".slipbox"), { recursive: true });
    writeFileSync(join(lab, "n.md"), "# Lab\n");
    await h.keys("enter");
    await read(h);
    expect(readRoots().find((v) => v.path === lab)?.indexed).toBeString();
  });
});

test("several roots stamped indexed at once: each stamped, the machine's list written once (20.9)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    for (const root of [notes, app]) recordLocation(locateVault({ root }));
    const keys = [notes, app].map((root) => locateVault({ root }).key);
    let writes = 0;
    const write = fsutil.writeJson;
    const spy = spyOn(fsutil, "writeJson").mockImplementation((path, value) => {
      if (path.endsWith("roots.json")) writes++;
      return write(path, value);
    });
    try {
      noteIndexed(keys, new Date("2026-10-24T05:00:00Z"));
    } finally {
      spy.mockRestore();
    }
    expect(writes).toBe(1);
    expect(
      readRoots()
        .filter((v) => keys.includes(v.key))
        .map((v) => v.indexed),
    ).toEqual(["2026-10-24T05:00:00.000Z", "2026-10-24T05:00:00.000Z"]);
  });
});

test("the machine's list failing to record a root reached, or found around one: its graph opened, its roots found all the same (17.11, #10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n");
  await onlyRootsUnder(base, async () => {
    const spy = spyOn(vaultModule, "recordLocation").mockImplementation(() => {
      throw new Error("the machine's list can't be written");
    });
    try {
      const reach = new Reach(locateVault({ root: notes }), { thorough: false });
      const g = reach.graphAt(app);
      expect(g).not.toBeNull();
      const around = new Reach(g!.loc, { nested: "open" });
      expect(() => around.discover(g!)).not.toThrow();
      expect(around.held(lab)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

test("a root found around a vault whose record in the machine's list fails is known to that reach all the same: its links counted (17.11, #10)", async () => {
  const { base, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n\nBack to [design](../design.md).\n");
  openGraph(locateVault({ root: lab }), DEFAULT_CONFIG, true); // its index, with the link
  await onlyRootsUnder(base, async () => {
    const g = openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true, "lazy");
    const spy = spyOn(vaultModule, "recordLocation").mockImplementation(() => {
      throw new Error("the machine's list can't be written");
    });
    try {
      const around = new Reach(g.loc);
      around.discover(g);
      expect(
        around
          .inbound(g)
          .get("design.md")
          ?.map((b) => b.from),
      ).toContain(join(lab, "n.md"));
    } finally {
      spy.mockRestore();
    }
  });
});
