import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

import { makeSandbox, harness, onlyRootsUnder } from "../../../tui-harness.ts";

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

  test("search by root (20.16, 21.10): this root's hits; ctrl+a adds the linked folders' under a divider, then every one's; one peeked at, o goes there (VV-D7)", async () => {
    const { base, notes, app } = await twoVaults();
    await onlyRootsUnder(base, async () => {
      writeFileSync(join(notes, "w.md"), "# W\n\nA walrus here.\n");
      writeFileSync(join(app, "w2.md"), "# W2\n\nA walrus there.\n");
      const h = await harness({ root: notes, open: "index.md" });
      h.app.graph.reach!.graphAt(app)?.ensureAll(); // the app vault's index, as when opened
      await h.keys("space", "f", "s");
      for (const k of "walrus") await h.keys(k);
      const labels = () => (h.app.overlay as ListOverlay).filtered.map((e) => e.item.label);
      expect(labels()).toEqual(["w.md:3"]);
      await h.keys("ctrl+a");
      expect(labels()).toEqual(["w.md:3", "linked folders", `${join(app, "w2.md")}:3`]); // by its path (21.9)
      expect((h.app.overlay as ListOverlay).title).toContain("and the folders linked to it");
      await h.keys("ctrl+a");
      expect((h.app.overlay as ListOverlay).title).toContain("and every folder known");
      await h.keys("ctrl+a"); // and back to this one
      expect(labels()).toEqual(["w.md:3"]);
      await h.keys("ctrl+a");
      (h.app.overlay as ListOverlay).selected = 2;
      await h.keys("enter");
      // Another vault's hit: read in a peek at its line, this vault left as it was; o goes there.
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.floating?.kind).toBe("peek");
      expect(h.app.view!.buf.abs).toBe(join(app, "w2.md"));
      expect(h.app.view!.curAnchor.anchor.line).toBe(3);
      await h.keys("o");
      expect(h.app.loc.root).toBe(app);
      expect(h.app.view!.buf.rel).toBe("w2.md");
      expect(h.app.view!.curAnchor.anchor.line).toBe(3);
    });
  });
});
