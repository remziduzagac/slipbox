import { read } from "../../../../support/tui/peek-reading.ts";
import { expect, test } from "bun:test";

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";

import { initVault, locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";

import { peekOf, vaultGraph } from "../../../../../src/tui/documents/navigation/peek.ts";
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

test("a later peek lists the backlinks the other vault has now, not those of the first peek (#10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    let text = await read(h);
    expect(text).toContain("**Linked from** (1):");
    expect(text).toContain("[links.md:1](<links.md#L1>)");
    await h.keys("esc");
    // Meanwhile, in app: a note comes that links to design.md, and links.md stops linking to it.
    writeFileSync(join(app, "plan.md"), "# Plan\n\nAfter [the design](design.md).\n");
    writeFileSync(join(app, "links.md"), "Nothing here now.\n");
    await h.keys("enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    text = await read(h);
    expect(text).toContain("[plan.md:3](<plan.md#L3>) — the design");
    expect(text).not.toContain("links.md");
    // And the graph its links are read in knows the new note: a link to it isn't broken.
    expect(vaultGraph(h.app, app)!.notes.has("plan.md")).toBe(true);
  });
});

test("a peek's backlinks shown only in the peek they were asked for: moved on, kept as a tab, or opened again (#10)", async () => {
  const { base, notes, app } = twoVaults({
    "app/design.md": "# Design\n\nShip [the plan](plan.md).\n",
    "app/plan.md": "# Plan\n\n[back](design.md)\n",
  });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    // Moved on before they came: a link inside the peek, to plan.md; its own backlinks, not design.md's.
    await h.keys("tab", "enter");
    const first = peekOf(h.app)!;
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "plan.md"));
    await first.reading;
    expect(h.app.view!.buf.source).not.toContain("links.md");
    let text = await read(h);
    expect(text.match(/\*\*Linked from/g)).toHaveLength(1);
    expect(text).toContain("[design.md:3](<design.md#L3>) — the plan");
    expect(text).not.toContain("links.md");
    // Kept as a tab before they came: the tab is the file, nothing added to it.
    await h.keys("ctrl+o");
    const kept = peekOf(h.app)!;
    await h.keys("t");
    await kept.reading;
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.source).toBe("# Design\n\nShip [the plan](plan.md).\n");
    // Closed and opened again at once: the second peek's own, once.
    await h.app.run("tab.close");
    await h.keys("tab", "enter", "esc", "enter");
    text = await read(h);
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(text.match(/\*\*Linked from/g)).toHaveLength(1);
    expect(text).toContain("[plan.md:3](<plan.md#L3>) — back");
  });
});

test("a file come to the other vault since its first peek, no note among them, is known to the next peek's links (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/design.md": "# Design\n\n![the chart](chart.png)\n" });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.filePaths()).not.toContain("chart.png");
    await h.keys("esc");
    writeFileSync(join(app, "chart.png"), "not really a picture");
    await h.keys("enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.filePaths()).toContain("chart.png");
  });
});

test("ctrl+o back to a row of a peek's backlinks puts the cursor on that row, once the list has come (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/plan.md": "# Plan\n\nAfter [the design](design.md).\n" });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    const v = h.app.view!;
    const row = h.app.currentLayout(v).links.find((l) => l.text.startsWith("plan.md:3"))!;
    h.app.moveCursor(v, { row: row.line, col: row.col });
    const line = h.app.view!.curAnchor.anchor.line;
    await h.keys("enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "plan.md"));
    await h.keys("ctrl+o");
    // Back, the list it showed here at once, the cursor on its row — before the thread's comes again.
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(h.app.view!.buf.source).toContain("[plan.md:3](<plan.md#L3>)");
    h.frame();
    expect(h.app.view!.curAnchor.anchor.line).toBe(line);
    // A key meanwhile moves it, and the list come again leaves it where the key did.
    await h.keys("k");
    const moved = h.app.view!.curAnchor.anchor.line;
    expect(moved).toBeLessThan(line);
    await read(h);
    h.frame();
    expect(h.app.view!.curAnchor.anchor.line).toBe(moved);
  });
});
