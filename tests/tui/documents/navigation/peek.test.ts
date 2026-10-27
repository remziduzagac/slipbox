import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

import { peekOf } from "../../../../src/tui/documents/navigation/peek.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder } from "../../../tui-harness.ts";

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

  test("backlinks from another vault are listed by their path (21.9), never a name:path label", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "todo.md" });
    await h.app.run("backlinks.open");
    // The item's own label (the screen cuts a long path short: macOS's temporary folders are long).
    const labels = (h.app.overlay as ListOverlay).filtered.map((f) => f.item.label);
    expect(labels).toContain(join(app, "links.md"));
    expect(h.frame()).not.toContain(`tapp${n}:`);
  });

  test("a link without text shows its target as written (21.9): no form made up for the screen; its hover titled by the file's path", async () => {
    const { notes, app, n } = await twoVaults();
    mkdirSync(join(notes, "sub"), { recursive: true });
    writeFileSync(
      join(notes, "sub", "forms.md"),
      "[](../todo.md) [../todo.md](../todo.md) [](../../APP/design.md#goals) [](nowhere.md) [named](../todo.md)\n".replace(
        "APP",
        basename(app),
      ),
    );
    const h = await harness({ root: notes, open: "sub/forms.md" });
    const row = () =>
      h
        .frame()
        .split("\n")
        .find((r) => r.includes("nowhere.md"))!;
    expect(row()).toContain(`../todo.md ../todo.md ../../${basename(app)}/design.md#goals nowhere.md named`);
    expect(row()).not.toContain(`tapp${n}:`);
    await h.app.run("ui.urls");
    expect(row()).toContain(`../todo.md ../todo.md ../../${basename(app)}/design.md#goals nowhere.md`); // the toast covers the rest
    // Its hover is titled so too.
    await h.app.run("ui.urls");
    const link = h.app.currentLayout(h.app.view!).links.find((l) => l.target.endsWith("design.md#goals"))!;
    h.app.moveCursor(h.app.view!, { row: link.line, col: link.col });
    await h.keys("shift+k");
    expect(h.app.floating?.title).toBe(`${join(app, "design.md")} › Goals`);
  });

  test("following a path link into another vault peeks, at the heading: nothing switches (VV-D7; D50's switch gone)", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    // Looking never moves you: this vault's TUI, its tabs as they were; the note read in a peek, at ## Goals.
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.graph.root).toBe(notes);
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"]]);
    expect(h.app.vaults.trail).toEqual([]);
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(h.app.view!.curAnchor.anchor.line).toBe(5);
    const f = h.frame();
    expect(f).toContain(`tapp${n} › design.md`);
    expect(f).toContain("Goals");
    expect(f).toContain("o go there · t keep as a tab · z fill");
    // Read-only: typing is refused, said why.
    await h.keys("i");
    expect(h.app.view!.insert).toBeFalsy();
    expect(h.app.messages.at(-1)!.text).toContain("a peek is read-only — o goes there, to edit it");
  });

  test("following a path link into another vault, o goes there, at the heading; back returns (17.10, VV-D4)", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter", "o");
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(app);
    expect(h.app.loc.name).toBe(`tapp${n}`);
    expect(h.app.view!.buf.rel).toBe("design.md");
    expect(h.app.view!.curAnchor.anchor.line).toBe(5); // at ## Goals
    expect(h.app.messages.some((m) => m.text === `tapp${n} — ${app}`)).toBe(true);
    expect(h.app.graph.root).toBe(app);
    expect(h.frame()).toContain("Design");
    // The first place in this vault: back goes to the vault before, at the link.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("index.md");
    // A path out of the root, without a heading: ctrl+click's command goes there at once, no peek between.
    await h.keys("tab", "tab");
    await h.app.run("link.go");
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
  });

  test("a peek's keys (VV-D7): esc closes it where you were; z fills the screen and back; t keeps it as a tab, read-only, marked", async () => {
    const { notes, app, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab");
    const at = { ...h.app.view!.cur };
    const top = h.app.view!.top;
    await h.keys("enter");
    expect(h.app.floating?.kind).toBe("peek");
    // esc: exactly where you were.
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(h.app.view!.cur).toEqual(at);
    expect(h.app.view!.top).toBe(top);
    // z: the whole screen; again, most of it, in the middle.
    await h.keys("enter");
    const box = () => ({ ...h.app.geometry!.floating! });
    const most = box();
    expect(most.w).toBeLessThan(120);
    expect(most.x).toBeGreaterThan(0);
    await h.keys("z");
    expect(box()).toMatchObject({ x: 0, w: 120 });
    expect(h.frame()).toContain("z smaller");
    await h.keys("z");
    expect(box()).toEqual(most);
    // t: a tab of its own here, the vault not left; read-only, the tab marked with its vault's name.
    await h.keys("t");
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.tabs.length).toBe(2);
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(h.app.view!.curAnchor.anchor.line).toBe(5); // where the peek was
    expect(h.app.displayName(h.app.view!.buf)).toBe(`tapp${n}: design.md`);
    expect(h.frame()).toContain(`tapp${n}: design.md`);
    await h.keys("i");
    expect(h.app.view!.insert).toBeFalsy();
    expect(h.app.messages.at(-1)!.text).toContain(`read-only here: tapp${n}'s — go into tapp${n} to edit it`);
    // Go there, from the tab: into its vault, at the same place; back, into this vault again.
    await h.app.run("peek.go");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
    expect(h.app.view!.buf.readOnly).toBeNull();
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(notes);
  });

  test("a tab kept from a peek reads its links in its own vault: one to this vault's note opens here (VV-D7)", async () => {
    const { notes, app } = await twoVaults();
    writeFileSync(join(notes, "to-links.md"), "[links](../app/links.md)\n");
    const h = await harness({ root: notes, open: "to-links.md" });
    await h.keys("tab", "enter", "t");
    expect(h.app.view!.buf.abs).toBe(join(app, "links.md"));
    expect(h.app.view!.buf.elsewhere?.rel).toBe("links.md");
    await h.keys("g", "g", "tab", "enter"); // [todo](../notes/todo.md), as links.md's vault reads it
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("todo.md");
  });

  test("links inside a peek (VV-D7): its own vault's moves it, ctrl+o back inside it; a third vault's moves it; this vault's closes it, opened here", async () => {
    const { initVault } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { base, notes, app, n } = await twoVaults();
    const third = join(base, "third");
    mkdirSync(third);
    writeFileSync(join(third, "far.md"), "# Far\n\nAway.\n");
    initVault(third, `tthird${n}`);
    writeFileSync(
      join(app, "hub.md"),
      "# Hub\n\n[mine](design.md)\n\n[home](../notes/todo.md)\n\n[far](../third/far.md)\n",
    );
    writeFileSync(join(notes, "start.md"), "# Start\n\n[hub](../app/hub.md)\n");
    const h = await harness({ root: notes, open: "start.md" });
    const peeked = () => (h.app.floating?.kind === "peek" ? h.app.view!.buf.abs : null);
    await h.keys("tab", "enter");
    expect(peeked()).toBe(join(app, "hub.md"));
    // Its own vault's: the peek moves there; ctrl+o comes back, inside the peek, to the link.
    await h.keys("tab", "enter");
    expect(peeked()).toBe(join(app, "design.md"));
    expect(h.frame()).toContain("ctrl+o back");
    await h.keys("ctrl+o");
    expect(peeked()).toBe(join(app, "hub.md"));
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.linking.linkUnderCursor(h.app.view!)).toBeGreaterThanOrEqual(0);
    // A third vault's: the peek moves there, named by it; back again.
    await h.keys("tab", "tab", "enter");
    expect(peeked()).toBe(join(third, "far.md"));
    expect(h.frame()).toContain(`tthird${n} › far.md`);
    await h.keys("ctrl+o");
    expect(peeked()).toBe(join(app, "hub.md"));
    // This vault's: the peek closes, and the note opens in the tabs, as usual.
    await h.keys("shift+tab", "enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("todo.md");
    await h.app.run("history.back");
    expect(h.app.view!.buf.rel).toBe("start.md");
  });

  test("a backlink from another vault peeks (VV-D7); a peeked note shows its backlinks when its vault has an index, else how to see them", async () => {
    const { base, notes, app, n } = await twoVaults();
    // design.md links to links.md, in app: its index has it.
    writeFileSync(join(app, "design.md"), "# Design\n\nIntro, see [links](links.md).\n\n## Goals\n\nShip.\n");
    openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
    await onlyRootsUnder(base, async () => {
      // todo.md's backlinks: app/links.md, from another vault (its index has it).
      const h = await harness({ root: notes, open: "todo.md" });
      await h.app.run("backlinks.open");
      await h.keys("enter");
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.floating?.kind).toBe("peek");
      expect(h.app.view!.buf.abs).toBe(join(app, "links.md"));
      // links.md's own backlinks, from app's index, after its text, once their thread has worked them out (#10).
      await peekOf(h.app)!.reading;
      const text = h.app.view!.buf.source;
      expect(text).toContain("**Linked from** (1):");
      expect(text).toContain("[design.md:3](<design.md#L3>) — links");
      // Followed from the peek: the peek moves to the line linking here.
      const v = h.app.view!;
      const i = h.app.currentLayout(v).links.findIndex((l) => l.target === "design.md#L3");
      h.app.moveCursor(v, { row: h.app.currentLayout(v).links[i]!.line, col: h.app.currentLayout(v).links[i]!.col });
      await h.keys("enter");
      expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
      expect(h.app.view!.curAnchor.anchor.line).toBe(3);
      // A vault with no index here: built for the peek, its backlinks shown when it's done (D259).
      const bare = join(base, "bare");
      mkdirSync(bare);
      writeFileSync(join(bare, "b.md"), "# B\n");
      (await import("../../../../src/core/workspace/vaults/vault.ts")).initVault(bare, `tbare${n}`);
      writeFileSync(join(notes, "to-bare.md"), "[b](../bare/b.md)\n");
      h.app.overlays.closeFloating();
      await h.app.run("note.open to-bare.md");
      await h.keys("tab", "enter");
      expect(h.app.view!.buf.abs).toBe(join(bare, "b.md"));
      expect(h.app.view!.buf.source).toContain(`**Linked from:** tbare${n} has no index here yet — building it`);
      await peekOf(h.app)!.reading;
      expect(h.app.view!.buf.source).toContain("**Linked from:** no note links here.");
    });
  });

  test("a click on a link out of the vault peeks; ctrl+click goes there at once (VV-D7)", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    const click = async (ctrl: boolean) => {
      const v = h.app.view!;
      const l = h.app.currentLayout(v).links.find((x) => x.target === "../app/design.md")!;
      const pane = h.app.geometry!.panes[0]!;
      const x = pane.textX + l.col + 1;
      const y = pane.y + l.line - v.top;
      h.app.mouse.handle({ type: "down", x, y, button: 0, ctrl });
      h.app.mouse.handle({ type: "up", x, y, button: 0, ctrl });
      await Bun.sleep(5);
    };
    await click(false);
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.floating?.kind).toBe("peek");
    h.app.overlays.closeFloating();
    h.frame();
    await Bun.sleep(400); // past a double-click
    await click(true);
    expect(h.app.floating).toBeNull();
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
  });

  test("a file of Elsewhere's, peeked at: its relative links followed from where it is; t keeps it read-only (VV-D7)", async () => {
    const root = makeVault();
    const loose = mkdtempSync(join(sandbox, "nowhere-"));
    writeFileSync(join(loose, "a.md"), "# A\n\n[b](b.md)\n");
    writeFileSync(join(loose, "b.md"), "# B\n\nBee.\n");
    writeFileSync(join(root, "out.md"), `# Out\n\n[a](${join(loose, "a.md")})\n`);
    const h = await harness({ root, open: "out.md" });
    await h.keys("tab", "enter");
    expect(h.app.floating?.kind).toBe("peek");
    // Named Elsewhere; drawn, a long path is cut from the front (macOS's temporary ones are), the file's name kept.
    expect(h.app.floating!.title).toBe(`Elsewhere › ${join(loose, "a.md")}`);
    expect(h.frame()).toMatch(/Elsewhere › \S*\/a\.md /);
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(loose, "b.md"));
    await h.keys("t");
    expect(h.app.view!.buf.abs).toBe(join(loose, "b.md"));
    expect(h.app.view!.buf.readOnly).toBe("read-only here: Elsewhere's — o goes there, to edit it");
    expect(h.app.loc.root).toBe(root);
  });

  test("a peek's title too long for its window keeps where the file is and its name: the path cut from the front", async () => {
    const { notes, app, n } = await twoVaults();
    const deep = join("a-folder-with-a-long-name", "another-folder-with-a-long-name", "and-one-more-long-name");
    mkdirSync(join(app, deep), { recursive: true });
    writeFileSync(join(app, deep, "far.md"), "# Far\n");
    const loose = join(mkdtempSync(join(sandbox, "nowhere-")), "a-folder-with-a-long-name", "and-another-one-too");
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(loose, "x.md"), "# X\n");
    writeFileSync(join(notes, "long.md"), `[far](../app/${deep}/far.md)\n\n[x](${join(loose, "x.md")})\n`);
    const h = await harness({ root: notes, open: "long.md", width: 80 });
    const title = () =>
      h
        .frame()
        .split("\n")
        .find((r) => r.includes("┌─"))!;
    await h.keys("g", "g", "enter"); // the first row's link
    expect(title()).toContain(`tapp${n} › …`);
    expect(title()).toContain("/far.md ");
    await h.keys("escape", "shift+g", "enter"); // the last row's
    // Elsewhere's file: where it is named, its path cut from the front.
    expect(title()).toContain("Elsewhere › …");
    expect(title()).toContain("/x.md ─");
  });

  test("another vault's picture, linked: its own path copied, never this vault's root before it", async () => {
    const { notes, app } = await twoVaults();
    writeFileSync(join(app, "pic.png"), "\x89PNG\r\n\x1a\n");
    writeFileSync(join(notes, "pic.md"), "# Pic\n\n[the picture](../app/pic.png)\n");
    const h = await harness({ root: notes, open: "pic.md" });
    await h.keys("tab", "enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe(`attachment ${join(app, "pic.png")} — path copied`);
    expect(h.copied.at(-1)).toBe(join(app, "pic.png"));
  });

  test("a file:// link and a ~/ link are followed into the other vault's note, at the heading: a peek, o going there (17.16, VV-D7)", async () => {
    const { base, notes, app } = await twoVaults();
    writeFileSync(
      join(notes, "paths.md"),
      `# Paths\n\n[url](file://${app}/design.md#goals)\n\n[home](~/app/design.md#goals)\n`,
    );
    const before = process.env.HOME;
    process.env.HOME = base;
    try {
      const h = await harness({ root: notes, open: "paths.md" });
      await h.keys("tab", "enter");
      expect(h.app.floating?.kind).toBe("peek");
      expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
      expect(h.app.view!.curAnchor.anchor.line).toBe(5);
      expect(h.copied).toEqual([]); // followed, not copied as a URL
      await h.keys("o");
      expect(h.app.loc.root).toBe(app);
      expect(h.app.view!.buf.rel).toBe("design.md");
      await h.app.run("history.back");
      expect(h.app.view!.buf.rel).toBe("paths.md");
      await h.keys("tab", "tab", "enter");
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
      expect(h.app.view!.curAnchor.anchor.line).toBe(5);
    } finally {
      process.env.HOME = before;
    }
  });
});
