import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the explorer's file operations and buttons (18.x)", () => {
  /** The explorer focused, `rel` selected. */
  async function at(root: string, rel: string, open = "index.md") {
    const h = await harness({ root, open });
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.explorer.select(rel);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe(rel);
    return h;
  }
  const prompt = (h: Harness) => h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };

  test("r renames in place, m moves to a picked folder: links fixed after the preview", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    await h.keys("r", "ctrl+u");
    await type(h, "first");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → notes/first.md");
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "first.md"))).toBe(true);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](notes/first.md)");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe("notes/first.md"); // still selected
    // m: the folders as a tree, the root first, this one marked (18.8).
    await h.keys("m");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Move notes/first.md to… — type to filter, ← → fold");
    expect(list.filtered[0]!.item.label.trim()).toBe("▾ / (the vault's top)");
    expect(list.filtered.find((e) => e.item.data === "notes")!.item.hint).toBe("here");
    await type(h, "projects");
    await h.keys("enter", "enter");
    expect(existsSync(join(root, "projects", "first.md"))).toBe(true);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](projects/first.md)");
  });

  test("d deletes to the trash after asking, saying what breaks; u puts it back", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    await h.keys("d");
    expect(prompt(h)).toMatchObject({
      confirm: true,
      label: expect.stringMatching(/^Delete notes\/alpha\.md\? \d+ links to it will break\. It goes to the trash/),
    });
    await h.keys("escape");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // esc: nothing
    await h.keys("d", "n");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // n: nothing
    await h.keys("d", "y");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("deleted notes/alpha.md to the trash");
    await h.keys("u");
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain("Alpha");
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    // A folder, with everything in it; the trash lists it, enter restores.
    h.app.explorer.select("projects");
    await h.keys("d", "y");
    expect(existsSync(join(root, "projects"))).toBe(false);
    await h.app.run("trash.open");
    expect((h.app.overlay as ListOverlay).items.map((it) => it.label)).toEqual(["projects/", "", "Empty the trash…"]);
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "index.md"))).toBe(true);
  });

  test("the trash's last row empties it after asking, what the list showed going for good; :empty-trash opens on it (DF-D14)", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    await h.keys("d", "y");
    h.app.explorer.select("notes/beta.md");
    await h.keys("d", "y");
    const { trashPath } = await import("../../../../src/core/workspace/mutations/files.ts");
    const { listTrash, trashDir } = await import("../../../../src/core/workspace/mutations/trash.ts");
    expect(listTrash(h.app.loc)).toHaveLength(2);
    // The list's last row, reached by up from the first: it asks; n leaves the trash as it was.
    await h.app.run("trash.open");
    const list = () => h.app.overlay as ListOverlay;
    expect(list().filtered[list().selected]!.item.label).toBe("notes/beta.md"); // enter still restores the newest
    await h.keys("up");
    expect(list().filtered[list().selected]!.item.label).toBe("Empty the trash…");
    await h.keys("enter");
    expect(prompt(h)).toMatchObject({
      confirm: true,
      label: "Empty the trash? Its 2 items go for good: none can be restored.",
    });
    await h.keys("n");
    expect(listTrash(h.app.loc)).toHaveLength(2);
    // The command (:empty-trash) opens the trash on that row; y empties it, and u has nothing to restore.
    await h.keys(":");
    await type(h, "empty-trash");
    await h.keys("enter");
    expect(list().title).toBe("Trash (2) — enter restores");
    expect(list().filtered[list().selected]!.item.label).toBe("Empty the trash…");
    await h.keys("enter");
    trashPath(h.app.graph, h.app.loc, "index.md"); // deleted elsewhere while it asks: not what the list showed
    await h.keys("y");
    expect(listTrash(h.app.loc).map((i) => i.shown)).toEqual(["index.md"]);
    expect(h.app.messages.at(-1)!.text).toBe("emptied the trash: 2 items gone for good");
    expect(existsSync(join(root, "notes", "beta.md"))).toBe(false);
    // u: what was deleted last is gone, so the trash opens instead.
    await h.keys("u");
    expect(list().title).toBe("Trash (1) — enter restores");
    await h.keys("escape");
    await h.app.run("trash.empty");
    await h.keys("enter", "y");
    expect(readdirSync(trashDir(h.app.loc))).toEqual(["trash.json"]);
    await h.app.run("trash.empty");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("the trash is empty");
  });

  test("y and p copy beside it (name-copy) or into the selected folder; x and p move it there", async () => {
    const root = makeVault();
    const h = await at(root, "notes/beta.md");
    await h.keys("y");
    await h.keys("p"); // the selection is beside it: a copy there
    expect(existsSync(join(root, "notes", "beta-copy.md"))).toBe(true);
    h.app.explorer.select("projects");
    await h.keys("p");
    expect(existsSync(join(root, "projects", "beta.md"))).toBe(true);
    // Cut, then paste into a folder: a move, links fixed after the preview.
    h.app.explorer.select("notes/alpha.md");
    await h.keys("x");
    h.app.explorer.select("projects");
    await h.keys("p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(h.app.files.clip).toBeNull(); // pasted: done
  });

  test("a root switch forgets what was copied or cut and the last delete: p and u never reach the other root's files", async () => {
    const a = makeVault();
    const b = makeVault();
    writeFileSync(join(a, "notes", "x.md"), "# from A\n");
    writeFileSync(join(b, "notes", "x.md"), "# from B\n");
    const h = await at(a, "notes/x.md");
    await h.keys("y");
    h.app.explorer.select("notes/alpha.md");
    await h.keys("d", "y");
    expect(existsSync(join(a, "notes", "alpha.md"))).toBe(false);
    h.app.vaults.switchVault((await import("../../../../src/core/workspace/vaults/vault.ts")).rootAt(b), null);
    expect(h.app.loc.root).toBe(b);
    h.app.files.pasteItem();
    expect(h.app.messages.at(-1)!.text).toBe("nothing copied or cut: y copies, x cuts");
    expect(readdirSync(join(b, "notes")).filter((n) => n.startsWith("x"))).toEqual(["x.md"]);
    expect(readdirSync(b).filter((n) => n.startsWith("x"))).toEqual([]);
    // u: B's trash (empty), not A's last delete looked for in it.
    h.app.files.restoreLast();
    expect(h.app.messages.at(-1)!.text).toBe("the trash is empty");
  });

  test("a folder renamed or moved takes its notes, their open windows and every link along", async () => {
    const root = makeVault();
    const h = await at(root, "notes", "notes/beta.md");
    await h.keys("r", "ctrl+u");
    await type(h, "papers");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/ → papers/");
    await h.keys("enter");
    expect(existsSync(join(root, "papers", "beta.md"))).toBe(true);
    expect(existsSync(join(root, "notes"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("papers/beta.md"); // the open note went with it
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](papers/alpha.md)");
    expect(h.app.graph.notes.has("papers/alpha.md")).toBe(true);
  });

  test("the view's folder renamed takes the view and the breadcrumb along; deleted, the view zooms out and says so", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/beta.md" });
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.explorer.zoomTo(join(root, "notes"));
    // space d r: the open note's folder, the view's own.
    await h.app.run("folder.rename");
    await h.keys("ctrl+u");
    await type(h, "papers");
    await h.keys("enter", "enter");
    expect(existsSync(join(root, "papers"))).toBe(true);
    expect(h.app.explorer.top).toBe(join(root, "papers"));
    expect(h.app.explorer.rows().map((r) => r.path)).toContain("papers/beta.md");
    // Zoomed out of it, it's the trail: renamed again from the view above, the trail follows it too.
    h.app.explorer.zoomOut();
    expect(h.app.explorer.trail).toBe(join(root, "papers"));
    h.app.region = "content";
    await h.app.run("folder.rename");
    await h.keys("ctrl+u");
    await type(h, "notes");
    await h.keys("enter", "enter");
    expect(h.app.explorer.trail).toBe(join(root, "notes"));
    expect(h.app.explorer.crumbs().at(-1)).toMatchObject({ abs: join(root, "notes"), past: true });
    // Deleted while the view is on it: zoomed out to the folder holding it, said, nothing pointing at it.
    h.app.explorer.zoomTo(join(root, "notes"));
    await h.app.run("folder.delete");
    await h.keys("y");
    expect(existsSync(join(root, "notes"))).toBe(false);
    expect(h.app.explorer.rows().length).toBeGreaterThan(0);
    expect(h.app.explorer.top).toBe(root);
    expect(h.app.messages.at(-1)!.text).toBe(
      `${tildePath(join(root, "notes"))} isn't there any more: the view is on ${tildePath(root)}`,
    );
    expect(h.app.explorer.crumbs().map((c) => c.abs)).not.toContain(join(root, "notes"));
    // Gone outside slipbox, the trail too gives way to what's there.
    mkdirSync(join(root, "gone", "deeper"), { recursive: true });
    h.app.explorer.zoomTo(join(root, "gone", "deeper"));
    h.app.explorer.zoomTo(root);
    rmSync(join(root, "gone"), { recursive: true });
    h.app.explorer.invalidateTree();
    expect(h.app.explorer.crumbs().at(-1)!.abs).toBe(root);
    // And the view, as its rows are asked for: there's no breadcrumb drawn in a short pane.
    mkdirSync(join(root, "gone"));
    h.app.explorer.zoomTo(join(root, "gone"));
    rmSync(join(root, "gone"), { recursive: true });
    h.app.explorer.invalidateTree();
    expect(h.app.explorer.rows().length).toBeGreaterThan(0);
    expect(h.app.explorer.top).toBe(root);
  });

  test("buttons: a new note and a new folder on the title; on the selected row, … opens its menu", async () => {
    const root = makeVault();
    const h = await at(root, "notes/alpha.md");
    const f = h.frame();
    const title = f.split("\n").find((r) => r.includes("Explorer"))!;
    expect(title).toMatch(/Explorer\s+\+\s+\+▸/);
    const row = f.split("\n").find((r) => r.includes("alpha.md"))!;
    expect(row).toMatch(/alpha\.md\s+… /);
    // Its right edge under the title's last button's (by column).
    expect([...row].lastIndexOf("…")).toBe([...title].lastIndexOf("▸"));
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    const click = (x: number, y: number) => {
      h.app.mouse.handle({ type: "down", x, y, button: 0 });
      h.app.mouse.handle({ type: "up", x, y, button: 0 });
    };
    const clickHot = (id: string) => click(hot(id).x + 1, hot(id).y);
    click(hot("xnew:folder").x + 1, hot("xnew:folder").y);
    expect(prompt(h).label).toBe("new folder in notes/");
    await h.keys("escape");
    h.frame();
    clickHot("xnew:note");
    expect(prompt(h).label).toBe("new note in notes/");
    await h.keys("escape");
    // The row's … : a menu under it, from its column; each entry with its key.
    h.frame();
    const button = { ...hot("xrow:menu") };
    clickHot("xrow:menu");
    const menu = () => h.app.overlay as ListOverlay;
    expect(menu()).toMatchObject({ menu: true, title: "alpha.md" });
    expect(menu().items.map((it) => [it.label, it.hint])).toEqual([
      ["Rename", "r"],
      ["Move to…", "m"],
      ["Copy", "y"],
      ["Cut", "x"],
      ["Copy path", "Y"],
      ["Delete", "d"],
    ]);
    h.frame();
    const m = h.app.geometry!.overlay!;
    expect({ x: m.x, y: m.y }).toEqual({ x: button.x, y: button.y + 1 });
    expect(h.frame().split("\n")[m.y]).toContain("alpha.md");
    // A click on an entry does it.
    click(m.x + 2, m.listY + 5);
    expect(prompt(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^Delete notes\/alpha\.md\?/) });
    await h.keys("escape");
    // `.` opens it by key; an entry's key picks it there.
    await h.keys(".");
    expect(menu().menu).toBe(true);
    await h.keys("r");
    expect(prompt(h).text).toBe("alpha");
    await h.keys("escape", ".", "m");
    expect(menu().title).toStartWith("Move notes/alpha.md to…");
    await h.keys("escape");
    // Copy path: the row's whole path, from the menu and by its key, said by where it is.
    await h.keys(".", "Y");
    expect(h.copied.at(-1)).toBe(join(root, "notes", "alpha.md"));
    expect(h.app.messages.at(-1)?.text).toStartWith(`copied ${tildePath(join(root, "notes", "alpha.md"))}`);
    h.copied.length = 0;
    await h.keys("shift+y");
    expect(h.copied).toEqual([join(root, "notes", "alpha.md")]);
    // A folder's: zoom in here first, new note and folder in it, and, with something copied, paste.
    await h.keys("y");
    h.app.explorer.select("projects");
    await h.keys(".");
    expect(menu().items.map((it) => it.label)).toEqual([
      "Zoom in here",
      "New note here",
      "New folder here",
      "Rename",
      "Move to…",
      "Copy",
      "Cut",
      "Copy path",
      "Give it .slipbox/",
      "Paste a copy of alpha.md here",
      "Delete",
    ]);
    await h.keys("p");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    // Zoom in here: the view shows the folder, as `z` does.
    h.app.explorer.select("projects");
    await h.keys(".", "z");
    expect(h.app.explorer.top).toBe(join(root, "projects"));
    await h.keys("-");
    // Not focused: no row button.
    h.app.region = "content";
    expect(
      h
        .frame()
        .split("\n")
        .find((r) => r.split(/[┃┣]/)[0]!.includes("alpha.md")),
    ).not.toMatch(/…/); // the explorer's row, not a message
    // A long name beside it: the pane scrolls sideways — a scrollbar, and its end reachable.
    writeFileSync(join(root, "notes", "a-longish-note-xyz12.md"), "# long\n"); // fits the pane, not beside it
    const long = await at(root, "notes/a-longish-note-xyz12.md");
    const longRow = () =>
      long
        .frame()
        .split("\n")
        .find((r) => r.includes("longish") || r.includes("note-xyz12"))!;
    expect(longRow()).toMatch(/a-longish\S*[^…\s] +… /);
    expect(longRow()).not.toContain("note-xyz12.md");
    expect(long.app.geometry!.scrollbars.some((b) => b.pane === "sidebar" && b.horizontal)).toBe(true);
    long.app.sidebar.left = 999;
    expect(longRow()).toMatch(/note-xyz12\.md +… /);
    // Not focused, no button: the names fit, no scrollbar.
    long.app.region = "content";
    long.frame();
    expect(long.app.geometry!.scrollbars.some((b) => b.pane === "sidebar" && b.horizontal)).toBe(false);
  });

  test("space n d deletes the note; space v t lists the trash", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/beta.md" });
    await h.keys("space", "n", "d", "y");
    expect(existsSync(join(root, "notes", "beta.md"))).toBe(false);
    expect(h.app.view!.buf.deleted).toBe(true);
    await h.keys("space", "v", "t");
    expect((h.app.overlay as ListOverlay).title).toBe("Trash (1) — enter restores");
  });

  test("a vault's row: rename (its folder), move, delete, and rename the vault — its menu (18.7)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "vault-links.md"), "[in](nested-vault/inner.md)\n");
    const h = await at(root, "nested-vault");
    const row = h
      .frame()
      .split("\n")
      .find((r) => r.includes("nested-vault"))!;
    expect(row).toMatch(/nested-vault.*… /);
    await h.keys(".");
    const menu = h.app.overlay as ListOverlay;
    expect(menu.items.map((it) => [it.label, it.hint])).toEqual([
      ["Zoom in here", "z"],
      ["Rename the folder", "r"],
      ["Name it", "R"], // beside its folder's
      ["Move to…", "m"],
      ["Copy", "y"],
      ["Cut", "x"],
      ["Copy path", "Y"],
      ["Make it part of the vault holding it", "V"],
      ["Delete the vault", "d"],
    ]);
    await h.keys("R"); // its own case: not the folder's r
    expect(prompt(h).label).toBe("name fixture-nested, as pointers name it: ");
    await h.keys("escape");
    // d: the whole vault, said so.
    await h.keys("d");
    expect(prompt(h).label).toMatch(
      /^Delete the vault fixture-nested \(nested-vault\/, 1 note\)\? 1 link to it will break\./,
    ); // by its path
    await h.keys("escape");
    // R: the vault's name; its folder stays.
    await h.keys("shift+r");
    expect(prompt(h)).toMatchObject({ label: "name fixture-nested, as pointers name it: ", text: "fixture-nested" });
    await h.keys("ctrl+u");
    await type(h, "inner-box");
    await h.keys("enter", "enter");
    expect(readFileSync(join(root, "nested-vault", ".slipbox", "config.toml"), "utf8")).toContain('name = "inner-box"');
    expect(existsSync(join(root, "nested-vault"))).toBe(true);
    // r: its folder; links into it by path fixed.
    h.app.explorer.select("nested-vault");
    await h.keys("r", "ctrl+u");
    await type(h, "box");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("nested-vault/ → box/");
    await h.keys("enter");
    expect(existsSync(join(root, "box", "inner.md"))).toBe(true);
    expect(readFileSync(join(root, "vault-links.md"), "utf8")).toBe("[in](box/inner.md)\n");
    expect(h.app.explorer.rows().some((r) => r.path === "box" && r.root?.kind === "vault")).toBe(true);
  });

  test("v gives a folder .slipbox/ (its name asked, the links previewed); V makes it a plain folder again (18.11, 21.10)", async () => {
    const root = makeVault();
    const h = await at(root, "notes");
    const index = () => readFileSync(join(root, "index.md"), "utf8");
    const before = index();
    await h.keys("v");
    expect(prompt(h)).toMatchObject({
      label: "give notes/ its .slipbox/, called (empty: no name): ",
      text: "fixture-notes",
    });
    await h.keys("enter");
    const preview = h.app.overlay as ListOverlay;
    expect(preview.title).toMatch(/^notes\/ → a vault of its own, called fixture-notes: \d+ changes? in \d+ files?/);
    expect(existsSync(join(root, "notes", ".slipbox"))).toBe(false); // nothing yet
    await h.keys("enter");
    expect(existsSync(join(root, "notes", ".slipbox", "config.toml"))).toBe(true);
    expect(index()).toBe(before); // a path still reaches its notes: nothing to rewrite
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toContain(
      "Back to [index](../index.md) and on to [beta](beta.md).",
    );
    // The explorer: its row a vault's now, selected; its notes the new vault's.
    const row = h.app.explorer.rows()[h.app.sidebar.selected]!;
    expect(row).toMatchObject({ path: "notes", kind: "root" });
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toMatch(/^made notes\/ a vault of its own, called fixture-notes/);
    // V: back.
    await h.keys("shift+v");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^notes\/ → part of fixture/);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", ".slipbox"))).toBe(false);
    expect(index()).toBe(before);
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]).toMatchObject({ path: "notes", kind: "dir" });
    // The name cleared: a vault of its own, unnamed (21.10).
    await h.keys("v");
    (h.app.overlay as { text: string }).text = "";
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^notes\/ → a vault of its own: /);
    await h.keys("escape");
    // On a note, and on a vault for v: said so.
    h.app.explorer.select("notes/alpha.md");
    await h.keys("v");
    expect(h.app.messages.at(-1)!.text).toContain("select a folder first");
  });

  test("V on a named folder previews the pointers by its name rewritten, another root's too: deinit's plan (18.11, D75)", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const root = makeVault();
    // Names of their own: every test's copy of the fixture has the same ones.
    const tag = randomBytes(4).toString("hex");
    writeFileSync(
      join(root, ".slipbox", "config.toml"),
      `[vault]\nid = "${randomBytes(8).toString("hex")}"\nname = "top-${tag}"\n`,
    );
    writeFileSync(
      join(root, "nested-vault", ".slipbox", "config.toml"),
      `[vault]\nid = "${randomBytes(8).toString("hex")}"\nname = "box-${tag}"\n`,
    );
    const far = mkdtempSync(join(sandbox, "far-"));
    mkdirSync(join(far, ".slipbox"));
    writeFileSync(join(far, "links.md"), `[in](slipbox://box-${tag}/inner.md#top)\n`);
    for (const r of [far, join(root, "nested-vault")]) openVault(r).ensureAll();
    const h = await at(root, "nested-vault");
    await h.keys("shift+v");
    const preview = h.app.overlay as ListOverlay;
    expect(preview.title).toMatch(new RegExp(`^nested-vault/ → part of top-${tag}: 1 change in 1 file`));
    expect(preview.items.map((i) => [i.label, i.detail])).toEqual([
      [
        `${join(far, "links.md")}:1`,
        `[in](slipbox://box-${tag}/inner.md#top)  →  [in](slipbox://top-${tag}/nested-vault/inner.md#top)`,
      ],
    ]);
    await h.keys("enter");
    expect(readFileSync(join(far, "links.md"), "utf8")).toBe(`[in](slipbox://top-${tag}/nested-vault/inner.md#top)\n`);
  });

  test("space n notes, space d folders, space v vaults: which-key lists them; the explorer's selection, or this note (18.13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    const group = async (...keys: string[]) => {
      await h.keys("space", ...keys);
      const out = Object.fromEntries(h.app.input.whichKeyEntries().map((e) => [e.key, e.label]));
      await h.keys("escape");
      return out;
    };
    expect(await group("n")).toMatchObject({
      n: "New note",
      m: "Rename or move the note",
      "shift+m": "Move the note to a folder…",
      d: "Delete the note",
      y: "Copy the note, to paste",
      x: "Cut the note, to paste",
      "shift+y": "Duplicate the note",
    });
    expect(await group("d")).toMatchObject({
      n: "New folder",
      r: "Rename the folder",
      m: "Move the folder…",
      d: "Delete the folder",
      y: "Copy the folder, to paste",
      x: "Cut the folder, to paste",
      p: "Paste into the folder",
    });
    expect(await group("v")).toMatchObject({
      m: "Give a folder .slipbox/",
      "shift+m": "Take .slipbox/ away",
      n: "Name this folder, as pointers name it",
      t: "The trash",
      u: "Restore the last deleted",
      v: "Vaults: go into one",
      "shift+v": "Which copy a folder's links open",
    });
    expect(await group("v")).not.toHaveProperty("d"); // a new folder is space d n now
    // From the note: it, its folder, this vault.
    await h.keys("space", "n", "shift+m");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Move notes/alpha.md to…");
    await h.keys("escape", "space", "d", "r");
    expect(prompt(h)).toMatchObject({ label: "rename notes/ to: ", text: "notes" });
    await h.keys("escape", "space", "d", "m");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Move notes/ to…");
    await h.keys("escape", "space", "d", "d");
    expect(prompt(h)).toMatchObject({
      confirm: true,
      label: expect.stringMatching(/^Delete notes\/ and everything in it\?/),
    });
    await h.keys("escape", "space", "n", "y", "space", "d", "p");
    expect(existsSync(join(root, "notes", "alpha-copy.md"))).toBe(true);
    await h.keys("space", "v", "m");
    expect(prompt(h)).toMatchObject({ label: "give notes/ its .slipbox/, called (empty: no name): " });
    await h.keys("escape", "space", "n", "d", "y");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    await h.keys("space", "v", "u");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    await h.keys("space", "v", "shift+m"); // this vault isn't nested in another
    expect(h.app.messages.at(-1)!.text).toContain("isn't inside another vault");
    await h.keys("space", "n", "shift+y");
    expect(h.app.view!.buf.rel).toBe("notes/alpha-copy-2.md");
    // A note at the root has no folder for space d.
    await h.app.run("note.open index.md");
    await h.keys("space", "d", "r");
    expect(h.app.messages.at(-1)!.text).toContain("index.md is at the vault's top");
    // With the explorer focused: its selected row — a folder for space d, a note for space n, a vault for space v.
    const e = await at(root, "projects");
    await e.keys("space", "d", "r");
    expect(prompt(e).label).toBe("rename projects/ to: ");
    await e.keys("escape", "space", "n", "d");
    expect(e.app.messages.at(-1)!.text).toContain("space n acts on a note");
    await e.keys("space", "v", "m");
    expect(prompt(e).label).toBe("give projects/ its .slipbox/, called (empty: no name): ");
    const v = await at(root, "nested-vault");
    await v.keys("space", "v", "n");
    expect(prompt(v).label).toBe("name fixture-nested, as pointers name it: ");
    await v.keys("escape", "space", "v", "shift+m");
    expect((v.app.overlay as ListOverlay).title).toMatch(/^nested-vault\/ → part of fixture/);
  });

  test("space v shift+m inside a vault nested in another: made a plain folder of it, and into it, the note still open (18.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "to-nested.md"), "[inner](nested-vault/inner.md)\n");
    const h = await harness({ root: join(root, "nested-vault"), open: "inner.md" });
    expect(h.app.loc.name).toBe("fixture-nested");
    await h.keys("space", "v", "shift+m");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^nested-vault\/ → part of fixture/);
    await h.keys("enter");
    expect(existsSync(join(root, "nested-vault", ".slipbox"))).toBe(false);
    expect(h.app.loc.root).toBe(root);
    expect(h.app.view!.buf.rel).toBe("nested-vault/inner.md");
    expect(readFileSync(join(root, "to-nested.md"), "utf8")).toBe("[inner](nested-vault/inner.md)\n"); // a path: nothing to rewrite
  });

  test("filters: each word as typed, in any order — the explorer's (its name lit where it matched) and the palette's (3.16)", async () => {
    const root = makeVault();
    const h = await at(root, "index.md");
    await h.keys("/");
    await type(h, "alpha notes");
    expect(
      h.app.explorer
        .rows()
        .filter((r) => r.kind === "note")
        .map((r) => r.path),
    ).toEqual(["notes/alpha.md"]);
    await h.keys("ctrl+u");
    await type(h, "al");
    const al = h.app.explorer
      .rows()
      .filter((r) => r.kind === "note")
      .map((r) => r.path);
    expect(al).toContain("notes/alpha.md");
    expect(al.filter((p) => !p.toLowerCase().includes("al"))).toEqual([]); // never a…l scattered
    const c = h.canvas();
    const rowsNow = c.toString().split("\n");
    const y = rowsNow.findIndex((r) => r.includes("alpha.md"));
    const x = [...rowsNow[y]!.slice(0, rowsNow[y]!.indexOf("alpha.md"))].length; // its column
    const lit = h.app.theme.roles.overlay_match.fg;
    expect(c.styles[y]![x]!.fg).toBe(lit!); // "al" lit
    expect(c.styles[y]![x + 1]!.fg).toBe(lit!);
    expect(c.styles[y]![x + 2]!.fg).not.toBe(lit!); // "p" not
    // A word matching the folder: the name's own match still lit.
    await h.keys("ctrl+u");
    await type(h, "notes al");
    const c2 = h.canvas();
    expect(c2.styles[y]![x]!.fg).toBe(lit!);
    expect(c2.styles[y]![x + 1]!.fg).toBe(lit!);
    // The palette: both words, in the label first.
    await h.keys("escape", "escape", ":");
    await type(h, "folder move");
    const labels = (h.app.overlay as ListOverlay).filtered.map((e) => e.item.label);
    expect(labels.slice(0, 2)).toEqual(["Move the folder…", "Move the note to a folder…"]);
    expect(labels).not.toContain("Delete the note");
  });

  test("the move picker is a tree: the explorer's folds, ← → fold, typing filters under the parents (18.8)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "projects", "deep", "deeper"), { recursive: true });
    writeFileSync(join(root, "projects", "deep", "deeper", "d.md"), "# d\n");
    const h = await at(root, "notes/alpha.md");
    h.app.graph.build(false);
    h.app.explorer.expanded.delete("projects");
    await h.keys("m");
    const o = () => h.app.overlay as ListOverlay;
    const labels = () => o().filtered.map((e) => e.item.label.trim());
    expect(labels()[0]).toBe("▾ / (the vault's top)");
    expect(labels()).toContain("▾ notes"); // where it is: unfolded, as in the explorer (no folders in it), marked, selected
    expect(o().filtered[o().selected]!.item).toMatchObject({ data: "notes", hint: "here" });
    expect(labels()).toContain("▸ projects"); // folded, as in the explorer
    expect(labels()).not.toContain("▸ deep");
    // → unfolds projects.
    const at_ = o().filtered.findIndex((e) => e.item.data === "projects");
    o().selected = at_;
    await h.keys("right");
    expect(labels()).toContain("▸ deep");
    await h.keys("left");
    expect(labels()).not.toContain("▸ deep");
    // Typing: the matches, under their parents, unfolded; the first match selected, not a parent.
    await type(h, "deeper");
    expect(o().filtered.map((e) => e.item.data)).toEqual(["", "projects", "projects/deep", "projects/deep/deeper"]);
    expect(o().selected).toBe(3);
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/deep/deeper/alpha.md");
    // A folder the explorer has unfolded is unfolded here, its folders shown.
    await h.keys("escape");
    h.app.explorer.expanded.add("projects");
    await h.keys("m");
    expect(labels()).toContain("▾ projects");
    expect(labels()).toContain("▸ deep");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test("space n x cuts this note, space d x and space d y its folder; space d p in another note's folder moves or copies them there", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("space", "n", "x");
    expect(last(h)).toContain("cut notes/alpha.md");
    await h.app.run("note.open projects/index.md");
    await h.keys("space", "d", "p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha](projects/alpha.md)");
    // This note's folder copied, pasted beside notes/beta.md.
    await h.keys("space", "d", "y");
    expect(last(h)).toContain("copied projects/");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "d", "p");
    expect(existsSync(join(root, "notes", "projects", "index.md"))).toBe(true);
    expect(existsSync(join(root, "projects", "index.md"))).toBe(true);
    // And cut: notes/ moved into projects/.
    await h.keys("space", "d", "x");
    expect(last(h)).toContain("cut notes/");
    await h.app.run("note.open projects/index.md");
    await h.keys("space", "d", "p");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/ → projects/notes/");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "notes", "beta.md"))).toBe(true);
    expect(existsSync(join(root, "notes"))).toBe(false);
  });

  test("space n shift+y on a note gone from disk: said, no copy, still on it", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    rmSync(join(root, "notes", "alpha.md"));
    await h.keys("space", "n", "shift+y");
    expect(h.app.messages.at(-1)!.level).toBe("warn");
    expect(last(h)).toContain("no note, file or folder notes/alpha.md");
    expect(existsSync(join(root, "notes", "alpha-copy.md"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
});
