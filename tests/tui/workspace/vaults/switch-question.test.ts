// The vault open's boundary (#104): outside it, the explorer dimmed and its keys saying why they change nothing; going
// into another vault, by any way, asked first (D270) — Go, a peek at its note instead, or Stay — unsaved notes' question
// the only one when there are some, a vault made gone into unasked.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { answerSwitch, harness, makeSandbox, type Harness } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

let made = 0;
/** Side by side: the vault `qnotesN` (opened), the vault `qappN`, and `loose`, a plain folder. */
function place() {
  const n = ++made;
  const base = mkdtempSync(join(sandbox, "place-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const files: Record<string, string> = {
    "notes/index.md": "# Index\n\n[design](../app/design.md)\n",
    "notes/todo.md": "# Todo\n",
    "notes/drafts/old.md": "# Old\n",
    "notes/sub/a.md": "# A\n",
    "app/design.md": "# Design\n\nShip.\n",
    "loose/x.md": "# X\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  initVault(notes, `qnotes${n}`);
  initVault(app, `qapp${n}`);
  openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
  return { base, notes, app, n };
}

/** The question open: its title and its choices. */
const question = (h: Harness) => {
  const o = h.app.overlay;
  return o?.kind === "list" ? { title: o.title, items: (o as ListOverlay).items.map((i) => i.label) } : null;
};
/** The explorer, with the keys, on the row named `name`. */
const select = (h: Harness, name: string) => {
  h.app.leftView = "explorer";
  h.app.region = "sidebar";
  h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === name);
  expect(h.app.explorer.rows()[h.app.sidebar.selected]?.name).toBe(name);
};
/** The colour the row named `name` is drawn in, the explorer without the keys (no row selected). */
const fgOf = (h: Harness, name: string) => {
  h.app.leftView = "explorer";
  h.app.region = "content";
  const c = h.canvas();
  const list = h.app.geometry!.sidebar!;
  const y = list.y + h.app.explorer.rows().findIndex((r) => r.name === name) - h.app.sidebar.scroll;
  const x = c.toString().split("\n")[y]!.indexOf(name);
  return c.styles[y]![x]!.fg;
};

describe("outside the vault open, in the explorer (#104)", () => {
  test("zoomed out past it: what's outside dimmed, other vaults and plain folders alike; its own tree as it was", async () => {
    const { base } = place();
    const h = await harness({ root: join(base, "notes"), open: "index.md" });
    h.app.explorer.zoomTo(base);
    const roles = h.app.theme.roles;
    expect(roles.sidebar_outside.fg).not.toEqual(roles.sidebar.fg);
    expect(fgOf(h, "app")).toBe(roles.sidebar_outside.fg!);
    expect(fgOf(h, "loose")).toBe(roles.sidebar_outside.fg!);
    // The vault open highlighted, its tree as ever: a folder's colour, the note open's, a note's.
    expect(fgOf(h, "notes")).toBe(roles.sidebar_active.fg!);
    expect(fgOf(h, "sub")).toBe(roles.sidebar_dir.fg!);
    expect(fgOf(h, "index.md")).toBe(roles.sidebar_active.fg!);
    expect(fgOf(h, "todo.md")).toBe(roles.sidebar.fg!);
  });

  test("its keys on a row they won't change say why: outside, the vault you are in, left out of it", async () => {
    const { base, notes } = place();
    const h = await harness({ root: notes, open: "index.md", config: (c) => (c.walk.exclude = ["drafts"]) });
    h.app.explorer.zoomTo(base);
    const said = () => h.app.messages.at(-1)!.text;
    select(h, "app");
    await h.app.explorer.action("rename");
    expect(said()).toBe("rename: app is outside this vault — go into its own to change it");
    await h.keys(".");
    expect(said()).toBe("menu: app is outside this vault — go into its own to change it");
    expect(question(h)).toBeNull();
    select(h, "notes");
    await h.app.explorer.action("delete");
    expect(said()).toBe("delete: notes is the vault you are in — select something in it");
    select(h, "drafts");
    await h.app.explorer.action("move");
    expect(said()).toMatch(/^move: drafts is left out of this vault \(.+\) — not changed from here$/);
    // In the vault's own tree, the menu as ever.
    select(h, "todo.md");
    await h.keys(".");
    expect(question(h)?.items).toContain("Rename");
  });
});

describe("going into another vault asks first (D270)", () => {
  test("its row in the explorer: Go or Stay; Stay leaves you where you were, Go goes", async () => {
    const { base, notes, app, n } = place();
    const h = await harness({ root: notes, open: "index.md" });
    h.app.explorer.zoomTo(base);
    select(h, "app");
    await h.keys("enter");
    expect(question(h)).toEqual({ title: `Go into qapp${n}? Your tabs there replace these`, items: ["Go", "Stay"] });
    await answerSwitch(h, "c");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("index.md");
    select(h, "app");
    await h.keys("enter");
    await answerSwitch(h, "g");
    expect(h.app.loc.root).toBe(app);
  });

  test("a note of another vault opened: Go, Peek or Stay; Peek reads it there, read-only, nothing switched", async () => {
    const { base, notes, app, n } = place();
    const h = await harness({ root: notes, open: "index.md" });
    h.app.explorer.zoomTo(base);
    select(h, "app");
    await h.keys("l");
    select(h, "design.md");
    await h.keys("enter");
    expect(question(h)).toEqual({
      title: `Go into qapp${n}? Your tabs there replace these`,
      items: ["Go", "Peek at design.md: read it here, read-only", "Stay"],
    });
    await answerSwitch(h, "p");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.floating?.kind === "peek" && h.app.floating.peek.abs).toBe(join(app, "design.md"));
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"]]);
  });

  test("o in a peek asks too, with no other peek; Stay goes back to the peek, Go goes, at the note", async () => {
    const { notes, app } = place();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter"); // the link to app's note: a peek
    expect(h.app.floating?.kind).toBe("peek");
    await h.keys("o");
    expect(question(h)?.items).toEqual(["Go", "Stay"]);
    await answerSwitch(h, "c");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.floating?.kind).toBe("peek");
    await h.keys("o");
    await answerSwitch(h, "g");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
  });

  test("space v v and ctrl+o back ask as well", async () => {
    const { notes, app, n } = place();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("space", "v", "v");
    const list = h.app.overlay as ListOverlay;
    list.selected = list.items.findIndex((i) => i.label.includes(`qapp${n}`));
    expect(list.selected).toBeGreaterThanOrEqual(0);
    await h.keys("enter");
    expect(question(h)?.title).toBe(`Go into qapp${n}? Your tabs there replace these`);
    await answerSwitch(h, "g");
    expect(h.app.loc.root).toBe(app);
    // Back to the vault before: asked, and staying keeps the way back.
    await h.keys("ctrl+o");
    await answerSwitch(h, "c");
    expect(h.app.loc.root).toBe(app);
    await h.keys("ctrl+o");
    await answerSwitch(h, "g");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("index.md");
  });

  test("unsaved notes: their question the only one, saved and gone; a vault made gone into unasked", async () => {
    const { base, notes, app } = place();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("ctrl+k", "i", "x", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    h.app.explorer.zoomTo(base);
    select(h, "app");
    await h.keys("enter");
    expect(question(h)?.title).toBe("Unsaved notes — change vault?");
    await h.keys("s");
    expect(h.app.overlay).toBeNull();
    expect(h.app.loc.root).toBe(app);
    // Given its .slipbox/, a folder is gone into as that was what was asked.
    h.app.vaults.make(join(base, "loose"), false);
    expect(h.app.overlay).toBeNull();
    expect(h.app.loc.root).toBe(join(base, "loose"));
  });
});
