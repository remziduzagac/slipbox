import { vaultChoices } from "../../../../src/tui/workspace/vaults/vault-list.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { type ListOverlay, App, type Host } from "../../../../src/tui/app/runtime/app.ts";

import { DEFAULT_ALIASES } from "../../../../src/tui/shell/input/keys.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder, topRow, whereNow } from "../../../tui-harness.ts";

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

  test("into another vault (VV-D5): the view zooms out to the common parent, both unfolded; nothing listed beside the tree; :pin-root is gone", async () => {
    const { base, notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    expect(h.app.explorer.top).toBe(notes);
    await h.keys("tab", "enter", "o"); // into the app vault, by the link: its peek, then o
    expect(h.app.loc.root).toBe(app);
    const shown = () =>
      h.app.explorer.rows().map((r) => `${"  ".repeat(r.depth)}${r.name}${r.root?.here ? " (here)" : ""}`);
    expect(h.app.explorer.top).toBe(base);
    expect(shown()).toEqual(["app (here)", "  design.md", "  links.md", "notes", "  index.md", "  todo.md"]);
    // The breadcrumb leads to where you went.
    expect(h.app.explorer.crumbs().at(-1)).toMatchObject({ abs: app, current: true, past: true });
    // One tree: every row is the view's or under one of its folders — no vault listed beside it (20.15's are gone).
    const own = () =>
      h.app.explorer.rows().every((r) => r.depth > 0 || dirname(h.app.explorer.rowAbs(r)) === h.app.explorer.top);
    expect(own()).toBe(true);
    // Another vault's file chosen goes into it, its tabs (VV-D4); the view holds both, and stays.
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === "todo.md");
    expect(h.app.explorer.item()).toBeNull(); // not this vault's to rename or delete
    await h.keys("enter");
    expect(h.app.loc.root).toBe(notes);
    expect(h.app.view!.buf.rel).toBe("todo.md");
    expect(h.app.explorer.top).toBe(base);
    expect(own()).toBe(true);
    // Back: into app again, the view as it was.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.explorer.top).toBe(base);
    // Zoomed in on app, notes outside the view — the vault opened, gone into since: nothing lists it beside the tree.
    h.app.explorer.zoomTo(app);
    expect(h.app.explorer.rows().some((r) => r.path === notes || r.root?.abs === notes)).toBe(false);
    expect(own()).toBe(true);
    // Nothing pins a vault beside the tree any more.
    expect(h.app.registry.get("vault.pin_root")).toBeUndefined();
    expect(DEFAULT_ALIASES["pin-root"]).toBeUndefined();
  });

  test("another vault's row: its name once, no menu button for the menu that refuses it", async () => {
    const { notes, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md", width: 120, height: 30 });
    await h.keys("tab", "enter", "o"); // into the app vault, by the link: its peek, then o
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.root?.abs === notes);
    const row = h
      .frame()
      .split("\n")
      .find((r) => r.includes(`tnotes${n}`))!;
    expect(row.split(`tnotes${n}`).length - 1).toBe(1);
    expect(row).not.toContain(h.app.glyphs.itemMenu);
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(false);
    // Its files' rows neither.
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === "todo.md");
    h.frame();
    expect(h.app.geometry!.hot.some((x) => x.id === "xrow:menu")).toBe(false);
  });

  test("a vault nested in the one open: going into it keeps the view, it unfolded and highlighted; back, its own tree again", async () => {
    const { locateVault } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const outer = makeVault(); // its nested-vault/ is a vault of its own
    const inner = join(outer, "nested-vault");
    const h = await harness({ loc: locateVault({ path: outer }), open: null });
    h.app.vaults.switchVault(locateVault({ path: inner }), null);
    expect(h.app.loc.root).toBe(inner);
    expect(h.app.explorer.top).toBe(outer);
    const here = h.app.explorer.rows().findIndex((r) => r.root?.here);
    expect(h.app.explorer.rows()[here]).toMatchObject({ name: "nested-vault", path: inner, depth: 0 });
    expect(h.app.explorer.rows()[here + 1]!.depth).toBe(1); // unfolded: its tree under it
    h.app.vaults.switchVault(locateVault({ path: outer }), null);
    expect(h.app.explorer.top).toBe(outer);
    expect(h.app.explorer.rows().find((r) => r.name === "nested-vault")).toMatchObject({ path: "nested-vault" });
  });

  test("h on another vault's row folds it, the selection staying there", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter", "o"); // into app (its peek, then o); notes beside it in the view, unfolded
    expect(h.app.loc.root).toBe(app);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    const at = h.app.explorer.rows().findIndex((r) => r.root?.abs === notes);
    h.app.sidebar.selected = at;
    expect(h.app.explorer.expanded.has(notes)).toBe(true);
    h.app.explorer.action("collapse");
    expect(h.app.explorer.expanded.has(notes)).toBe(false);
    expect(h.app.explorer.rows().some((r) => r.name === "todo.md")).toBe(false);
    expect(h.app.sidebar.selected).toBe(at);
    h.app.explorer.action("collapse"); // folded already, at the view's top: stays put
    expect(h.app.sidebar.selected).toBe(at);
    h.app.explorer.action("expand");
    expect(h.app.explorer.rows().some((r) => r.name === "todo.md")).toBe(true);
  });

  test("paste, new note and new folder on another vault's row are refused, never a folder named by its path", async () => {
    const { notes, app } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter", "o"); // into app (its peek, then o); notes beside it in the view
    expect(h.app.loc.root).toBe(app);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    const sel = (f: (r: ReturnType<App["explorer"]["rows"]>[number]) => boolean) =>
      (h.app.sidebar.selected = h.app.explorer.rows().findIndex(f));
    sel((r) => r.path === "design.md");
    h.app.explorer.action("copy");
    const before = readdirSync(app, { recursive: true }).sort();
    const refused = () =>
      expect(h.app.messages.at(-1)!.text).toBe("another vault's folder: select a folder of this vault");
    sel((r) => r.root?.abs === notes);
    h.app.explorer.action("paste");
    refused();
    h.app.explorer.action("new_note");
    refused();
    expect(h.app.overlay).toBeNull();
    h.app.explorer.action("new_folder");
    refused();
    expect(h.app.overlay).toBeNull();
    // A row under it: the same.
    sel((r) => r.name === "todo.md");
    expect(h.app.sidebar.selected).toBeGreaterThan(0);
    h.app.explorer.action("paste");
    refused();
    expect(h.app.files.createNote("x", h.app.files.newItemBase())).toBeNull();
    expect(readdirSync(app, { recursive: true }).sort()).toEqual(before);
    expect(readdirSync(notes)).not.toContain("design.md");
  });

  test("a file of Elsewhere's followed to and gone into (VV-D3, VV-D4): the view zooms out to hold both, its folder unfolded", async () => {
    const base = mkdtempSync(join(sandbox, "beside-"));
    const root = join(base, "v");
    const loose = join(base, "loose");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(loose);
    writeFileSync(join(loose, "l.md"), "# Loose\n");
    writeFileSync(join(loose, "m.md"), "# More\n");
    writeFileSync(join(root, "beside.md"), `# Beside\n\n[l](${join(loose, "l.md")})\n`);
    const h = await harness({ root, open: "beside.md" });
    expect(h.app.explorer.top).toBe(root);
    // Followed to: a file of Elsewhere's is peeked at (VV-D7), the view unmoved; o goes into Elsewhere, and the view
    // zooms out to hold both.
    await h.keys("tab", "enter");
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.explorer.top).toBe(root); // looking never moves the view
    await h.keys("o");
    expect(h.app.floating).toBeNull();
    expect(h.app.loc).toMatchObject({ mode: "folder", root: loose });
    expect(h.app.view?.buf.abs).toBe(join(loose, "l.md"));
    expect(h.app.view?.buf.readOnly).toBeNull();
    expect(h.app.explorer.top).toBe(base);
    const shown = () => h.app.explorer.rows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);
    expect(shown()).toEqual(["loose", "  l.md", "  m.md", "v", "  beside.md"]);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe(join(loose, "l.md"));
    // Back: into the vault, beside.md; the view holds both still.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(root);
    expect(h.app.view?.buf.rel).toBe("beside.md");
    expect(h.app.explorer.top).toBe(base);
  });

  test("the explorer shows a nested vault with its own icon; enter goes into it (17.13)", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "nested-vault", ".slipbox", "config.toml"),
      '[vault]\nid = "nestedid1"\nname = "inner-notes"\n',
    );
    const h = await harness({ root, open: "index.md", config: (c) => (c.colors = { sidebar_root: "#ff00aa" }) });
    h.app.region = "sidebar";
    const rows = h.app.explorer.rows();
    const i = rows.findIndex((r) => r.path === "nested-vault");
    expect(rows[i]).toMatchObject({ kind: "root", root: { kind: "vault", name: "inner-notes" } });
    const f = h.frame();
    expect(f).toContain("◈ nested-vault inner-notes");
    // A folder's colour by default (its icon tells it apart), from a role of its own: set here.
    expect(h.app.theme.roles.sidebar_root.fg).not.toEqual(h.app.theme.roles.sidebar_dir.fg);
    const c = h.canvas();
    const y = c
      .toString()
      .split("\n")
      .findIndex((r) => r.includes("◈ nested-vault"));
    const x = c.toString().split("\n")[y]!.indexOf("◈");
    expect(c.styles[y]![x]).toMatchObject({ fg: h.app.theme.roles.sidebar_root.fg });
    h.app.sidebar.selected = i;
    await h.keys("enter");
    expect(h.app.loc.root).toBe(join(root, "nested-vault"));
    expect(h.app.view!.buf.rel).toBe("inner.md");
  });

  test("Elsewhere's folder is listed: its folders and the vaults in it, by their whole paths (VV-D3, VV-D5)", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const dir = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(dir, "note.md"), "# loose\n");
    mkdirSync(join(dir, "plain"));
    writeFileSync(join(dir, "plain", "p.md"), "# p\n");
    mkdirSync(join(dir, "code", ".git"), { recursive: true }); // a repository: a vault by itself (20.3)
    mkdirSync(join(dir, "box", ".slipbox"), { recursive: true });
    const h = await harness({ loc: elsewhereAt(dir), open: "note.md" });
    // Listed a level at a time, never walked (VV-D3): its folders, the vaults in it roots of their own.
    expect(h.app.explorer.rows().map((r) => [r.name, r.kind, r.root?.kind])).toEqual([
      ["box", "root", "vault"],
      ["code", "root", "vault"],
      ["plain", "dir", undefined],
      ["note.md", "note", undefined],
    ]);
    expect(h.frame()).toContain("◈ box");
    expect(h.frame()).toContain("◈ code");
    expect(whereNow(h)).toBe("Elsewhere"); // one place, wherever it's opened (VV-D3)
    expect(topRow(h.frame())).toContain("Elsewhere");
    h.app.vaults.enterRoot(h.app.explorer.rows()[0]!);
    expect(h.app.loc).toMatchObject({ mode: "vault", root: join(dir, "box") });
  });

  test("a note in a git repository opens the repository as its root: nothing offered, nothing written (20.3)", async () => {
    const { elsewhereAt, locateVault } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const repo = join(mkdtempSync(join(sandbox, "repo-")), "alpha");
    mkdirSync(join(repo, "docs"), { recursive: true });
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "docs", "readme.md"), "# Readme\n\n[top](../top.md)\n");
    writeFileSync(join(repo, "top.md"), "# Top\n");
    const h = await harness({ loc: locateVault({ path: join(repo, "docs", "readme.md") }), open: "docs/readme.md" });
    expect(h.app.loc).toMatchObject({ mode: "vault", root: repo, name: null }); // no remote: unnamed (21.6)
    expect(h.app.overlay).toBeNull();
    expect(h.app.graph.notes.has("top.md")).toBe(true); // the whole repository, from its top
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
    // A loose folder: :init offers .slipbox/, and goes into the vault it makes.
    const loose = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(loose, "n.md"), "# N\n");
    const l = await harness({ loc: elsewhereAt(loose), open: "n.md" });
    expect(l.app.overlay).toBeNull();
    await l.app.run("vault.init");
    expect((l.app.overlay as ListOverlay).title).toBe(`${loose} is a folder without .slipbox/ — give it one?`);
    expect((l.app.overlay as ListOverlay).items.map((it) => it.label)).toEqual(["Give it .slipbox/", "Cancel"]);
    await l.keys("enter");
    expect(l.app.loc).toMatchObject({ mode: "vault", root: loose });
    expect(existsSync(join(loose, ".slipbox", "config.toml"))).toBe(true);
  });

  test("opened on a loose folder, no list of named folders over it (VV-D5); space v v lists them, seen last first (21.10)", async () => {
    const { base, notes, app, n } = await twoVaults();
    await onlyRootsUnder(base, async () => {
      const dir = mkdtempSync(join(sandbox, "launch-"));
      // Started as the TUI starts: prepare's options, as they are, make the App.
      const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
      const start = prepare([dir]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(start.loc.mode).toBe("folder");
      const host: Host = { requestRender() {}, osc52: () => true, quit() {} };
      const started = new App({ ...start, host, watch: false });
      expect(vaultChoices().length).toBeGreaterThan(0); // there are named folders to list
      expect(started.overlay).toBeNull();
      started.quit();
      // space v v: the named folders, from anywhere; enter goes into one.
      const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const h = await harness({ loc: elsewhereAt(dir), open: null });
      expect(h.app.overlay).toBeNull();
      await h.keys("space", "v", "v");
      const f = h.frame();
      expect(f).toContain(`tnotes${n}`);
      expect(f).toContain(`tapp${n}`);
      const items = (h.app.overlay as ListOverlay).items.map((it) => it.label);
      for (let i = 0; i < items.indexOf(`tnotes${n}`); i++) await h.keys("down");
      await h.keys("enter");
      expect(h.app.loc.root).toBe(notes);
      await h.keys("space", "v", "v");
      expect(h.frame()).toContain(`tapp${n}`);
      expect((h.app.overlay as ListOverlay).items.some((it) => it.detail === app)).toBe(true);
    });
  });
});
