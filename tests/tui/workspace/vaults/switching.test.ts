import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("vaults in the TUI (17.x)", () => {
  let made = 0;
  /** Two vaults the machine knows: `tnotesN` (opened) and `tappN`, whose index links into it.
   *  Names are unique on a machine, so each call numbers its own. */
  async function twoVaults() {
    const n = ++made;
    const { initVault, locateVault: locate } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const base = mkdtempSync(join(sandbox, "two-"));
    const notes = join(base, "notes");
    const app = join(base, "app");
    const files: Record<string, string> = {
      "notes/index.md": "# Index\n\n[goals](../app/design.md#goals)\n\n[out](../app/design.md)\n",
      "notes/todo.md": "# Todo\n",
      "app/design.md": "# Design\n\nIntro.\n\n## Goals\n\nShip.\n",
      "app/links.md": "See [todo](../notes/todo.md).\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(base, rel)), { recursive: true });
      writeFileSync(join(base, rel), text);
    }
    initVault(notes, `tnotes${n}`);
    initVault(app, `tapp${n}`);
    openGraph(locate({ root: app }), DEFAULT_CONFIG, true); // tapp's index, as of now
    return { base, notes, app, n };
  }

  test("a switch asks while a note is unsaved; each vault keeps its own tabs (17.10)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.app.run("history.back"); // nothing: no earlier place, no vault before
    h.app.vaults.switchVault(locateVault({ root: app }), join(app, "design.md"));
    expect(h.app.loc.root).toBe(notes);
    expect((h.app.overlay as ListOverlay).title).toBe("Unsaved notes — change vault?");
    await h.keys("c");
    await h.keys("ctrl+s");
    expect(h.app.vaults.switchVault(locateVault({ root: app }), join(app, "design.md"))).toBe(true);
    await h.app.run("tab.new");
    await h.app.run("note.open links.md");
    h.app.vaults.switchVault(locateVault({ root: notes }), null);
    expect(h.app.loc.root).toBe(notes);
    // Into app again: its session comes back, its two tabs.
    h.app.vaults.switchVault(locateVault({ root: app }), null);
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel).sort()).toEqual(["design.md", "links.md"]);
  });

  test("a switch closes the properties editor first: its edits written to the note, or the switch refused while it asks (17.10)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    const type = async (text: string) => {
      for (const c of text) await h.keys(c === " " ? "space" : c);
    };
    await h.app.run("note.properties");
    await h.keys("i");
    await type("a: [");
    await h.keys("escape");
    expect(h.app.floating!.view.buf.dirty).toBe(true);
    // Doesn't parse: it asks, and nothing switches.
    expect(h.app.vaults.switchVault(locateVault({ root: app }), null)).toBe(false);
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.floating).not.toBeNull();
    expect((h.app.overlay as { confirm?: boolean } | null)?.confirm).toBe(true);
    await h.keys("n");
    await h.keys("d", "d", "i");
    await type("a: 1");
    await h.keys("escape");
    // Parses: written into index.md, the editor closed, then the switch.
    expect(h.app.vaults.switchVault(locateVault({ root: app }), null)).toBe(true);
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view?.buf.key).not.toContain("#properties");
    expect(readFileSync(join(notes, "index.md"), "utf8")).toStartWith("---\na: 1\n---\n# Index");
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  test("a root switch forgets the old root's git states: no marks, no conflicts from it", async () => {
    const h = await harness();
    h.app.git.states = new Map([["notes/alpha.md", "conflict"]]);
    h.app.git.folders.set("notes", "conflict");
    expect(h.app.problems.rows().some((r) => r.section === "Conflicts")).toBe(true);
    expect(h.app.vaults.switchVault(locateVault({ root: makeVault() }), null)).toBe(true);
    expect(h.app.git.states).toBeNull();
    expect(h.app.git.folders.size).toBe(0);
    expect(h.app.problems.rows().some((r) => r.section === "Conflicts")).toBe(false);
  });
});
