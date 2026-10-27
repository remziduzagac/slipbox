import { expect, test } from "bun:test";

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  askBacklinks,
  backlinkThread,
  stopBacklinkJobs,
} from "../../../../../src/core/workspace/graph/backlinks-jobs.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { cacheDir } from "../../../../../src/core/foundation/platform/paths.ts";
import { Reach } from "../../../../../src/core/workspace/links/reach.ts";

import { homeAt, locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";

import { peekOf, vaultGraph } from "../../../../../src/tui/documents/navigation/peek.ts";
import { harness } from "../../../../tui-harness.ts";
import { makePeekFixture } from "../../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox, read } = makePeekFixture();

test("a peek into home with no index says so and builds none: home's is built in slices while nobody works (VV-D2, D259)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(home, "todo.md"));
    expect(peekOf(h.app)!.reading).toBeUndefined();
    expect(h.frame()).toContain("Linked from: ~ has no index here yet — o goes there, and finds them.");
    expect(existsSync(join(cacheDir(homeAt(home)), "index.json"))).toBe(false);
  } finally {
    process.env.HOME = before;
  }
});

test("home with an index slipbox can't read (another version's) isn't indexed by a peek: home's is the background index's (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const index = join(cacheDir(homeAt(home)), "index.json");
    mkdirSync(dirname(index), { recursive: true });
    const old = JSON.stringify({ version: 1, entries: {} });
    writeFileSync(index, old);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("has no index here yet");
    expect(readFileSync(index, "utf8")).toBe(old);
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("home with an index of this version whose every note changed since is caught up, not said to have none (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    expect(existsSync(join(cacheDir(homeAt(home)), "index.json"))).toBe(true);
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(home, "todo.md"), later, later);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).not.toContain("has no index here yet");
    expect(text).toContain("**Linked from:** no note links here.");
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("home's notes its index lacks, its thread failing, aren't parsed here: home's are the background index's (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    writeFileSync(join(home, "later.md"), "# Later\n"); // since home's index
    stopBacklinkJobs();
    backlinkThread.factory = () => {
      throw new Error("no threads here");
    };
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("**Linked from:** not worked out");
    const g = vaultGraph(h.app, home)!;
    expect(g.pendingCount).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) await Bun.sleep(5);
    expect(g.pendingCount).toBeGreaterThan(0);
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("home's walk made on the thread is never kept there; one made on the main thread is, by any graph of home (VV-D2, T12)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    walkHomeNow(homeAt(home), DEFAULT_CONFIG); // its walk kept
    openGraph(homeAt(home), DEFAULT_CONFIG, true); // and its index
    const kept = join(cacheDir(homeAt(home)), "walk.json");
    const was = readFileSync(kept, "utf8");
    // A folder come since: the walk made now has it.
    mkdirSync(join(home, "later"));
    writeFileSync(join(home, "later", "a.md"), "# A\n");
    // Asked of the thread itself, as the peek asks.
    expect((await askBacklinks({ root: home, rel: "todo.md" }))?.indexed).toBe(true);
    expect(readFileSync(kept, "utf8")).toBe(was);
    // The TUI's graph of home, writing nothing else of home's: on this thread, its walk is kept.
    const reached = new Reach(locateVault({ root: notes }), { readOnly: true, record: false }).graphAt(home)!;
    expect(reached.notes.has("later/a.md")).toBe(true);
    expect(readFileSync(kept, "utf8")).toContain("later");
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});
