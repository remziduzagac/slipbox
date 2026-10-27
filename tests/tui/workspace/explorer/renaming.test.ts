import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
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

  test("space n m renames a note: a preview of every change, then enter; open notes follow (17.15)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("space", "n", "m");
    const p = h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
    expect(p.kind).toBe("prompt");
    expect(p.text).toBe("notes/alpha");
    p.text = "notes/first";
    await h.keys("enter");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("notes/alpha.md → notes/first.md: ");
    expect(
      list.items.some((it) => it.label.startsWith("index.md:") && it.detail!.includes("[alpha](notes/first.md)")),
    ).toBe(true);
    expect(list.items.some((it) => it.label.startsWith("crlf.md:"))).toBe(true);
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true); // a preview writes nothing
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(false);
    expect(readFileSync(join(root, "notes", "first.md"), "utf8")).not.toContain("previous_names"); // nothing written into it (21.12)
    const index = readFileSync(join(root, "index.md"), "utf8");
    expect(index).toContain("[alpha](notes/first.md), [Beta](notes/beta.md)");
    expect(index).toContain("[alpha › Section One](notes/first.md#section-one)");
    expect(index).toContain("a markdown link to [alpha](notes/first.md)");
    expect(index).toContain("| [aliased](notes/first.md) |");
    expect(readFileSync(join(root, "crlf.md"), "utf8")).toContain("line two with [alpha](notes/first.md)\r\n");
    expect(h.app.view!.buf.rel).toBe("notes/first.md");
    expect(h.app.graph.notes.has("notes/first.md")).toBe(true);
    expect(h.app.graph.backlinks("notes/first.md").length).toBeGreaterThan(3);
    expect(h.app.messages.at(-1)!.text).toMatch(
      /^renamed notes\/alpha.md → notes\/first.md: \d+ changes in \d+ files$/,
    );
  });

  test("space n m into a folder: one that's there, or a path ending in /, keeps the note's name (DF-D4)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("space", "n", "m");
    (h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).text = "projects";
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → projects/alpha.md: ");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "projects.md"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("projects/alpha.md");
    // `:mv` too; a folder named with a `/` is made, the root is `/`.
    await h.app.run("note.rename later/");
    expect((h.app.overlay as ListOverlay).title).toStartWith("projects/alpha.md → later/alpha.md: ");
    await h.keys("escape");
    await h.app.run("note.rename /");
    expect((h.app.overlay as ListOverlay).title).toStartWith("projects/alpha.md → alpha.md: ");
  });

  test("space n h renames the cursor's heading, r the outline's: a preview, then its links (11.9)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.app.run("cursor.goto_line 9"); // in Section One
    await h.keys("space", "n", "h");
    const p = h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
    expect(p.text).toBe("Section One");
    p.text = "Part One";
    await h.keys("enter");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("notes/alpha.md#Section One → notes/alpha.md#Part One: 2 changes in 2 files");
    await h.keys("enter");
    expect(readFileSync(join(root, "index.md"), "utf8")).toContain("[alpha › Section One](notes/alpha.md#part-one)");
    expect(h.app.view!.buf.source).toContain("## Part One\n");
    // The outline's r: its selected heading.
    await h.app.run("outline.toggle");
    const rows = h.app.outlineView.rows();
    h.app.outline.selected = rows.findIndex((r) => r.text === "Section Two");
    await h.keys("r");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).text).toBe("Section Two");
    await h.keys("escape");
    // Above the first heading: nothing to rename.
    await h.app.run("cursor.goto_line 1");
    await h.keys("space", "n", "h");
    expect(h.app.messages.at(-1)!.text).toBe("no heading here: the cursor is above the first");
  });

  test("space v shift+u undoes the last rename: its preview, then every file as it was; open notes follow it back (7.4)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    const index = readFileSync(join(root, "index.md"), "utf8");
    const alpha = readFileSync(join(root, "notes", "alpha.md"), "utf8");
    await h.app.run("note.rename notes/first");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/first.md");
    await h.keys("space", "v", "shift+u");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("undo: notes/first.md → notes/alpha.md: ");
    expect(
      list.items.some(
        (it) => it.label.startsWith("index.md:") && /\(notes\/first\.md\).*→.*\(notes\/alpha\.md\)/.test(it.detail!),
      ),
    ).toBe(true);
    expect(existsSync(join(root, "notes", "first.md"))).toBe(true); // a preview writes nothing
    await h.keys("enter");
    expect(readFileSync(join(root, "index.md"), "utf8")).toBe(index);
    expect(readFileSync(join(root, "notes", "alpha.md"), "utf8")).toBe(alpha); // its previous name gone too
    expect(existsSync(join(root, "notes", "first.md"))).toBe(false);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.graph.notes.has("notes/alpha.md")).toBe(true);
    expect(h.app.graph.notes.has("notes/first.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toMatch(
      /^renamed notes\/first.md back to notes\/alpha.md: \d+ changes in \d+ files$/,
    );
    // Nothing more: said so. The explorer's shift+u is the same command.
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    await h.keys("shift+u");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("nothing to undo");
  });

  test("a rename is refused while a file it rewrites is unsaved; :rename takes the path; the explorer's r asks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await h.app.run("tab.new");
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.rename notes/first");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("unsaved: index.md");
    await h.app.run("tab.prev");
    await h.keys("ctrl+s");
    await h.app.run("tab.next");
    await h.app.run("note.rename notes/first");
    expect((h.app.overlay as ListOverlay).title).toStartWith("notes/alpha.md → notes/first.md");
    await h.keys("escape"); // cancelled: nothing changed
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    // The explorer: r on the selected note asks for its new name, in its folder.
    h.app.panels.showSidebar(true);
    h.app.region = "sidebar";
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.path === "notes/beta.md");
    await h.keys("r");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "rename notes/beta.md to: ", text: "beta" });
  });

  test("a folder's move is refused while a note in it is unsaved, its links rewritten or not", async () => {
    const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    h.app.view!.buf.edit(0, 0, "UNSAVED ");
    h.app.renaming.preview(() => planFolderMove(h.app.graph, "notes", "notes2"));
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toStartWith("unsaved: notes/alpha.md");
    expect(existsSync(join(root, "notes", "alpha.md"))).toBe(true);
    expect(existsSync(join(root, "notes2"))).toBe(false);
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(h.app.view!.buf.source).toStartWith("UNSAVED ");
  });

  test("naming the folder anew, and relinking a moved note's links, from the TUI", async () => {
    const { notes, n } = await twoVaults();
    const h = await harness({ root: notes, open: "index.md" });
    await h.app.run(`folder.name tnotes${n}b`);
    await h.keys("enter");
    expect(h.app.loc.name).toBe(`tnotes${n}b`);
    expect(readFileSync(join(notes, ".slipbox", "config.toml"), "utf8")).toContain(`previous_names = ["tnotes${n}"]`);
    // A note moved outside slipbox: its links are broken, the move known; relink rewrites them.
    const { renameSync } = await import("node:fs");
    writeFileSync(join(notes, "todo-link.md"), "[t](todo.md)\n");
    h.app.graph.build(true);
    renameSync(join(notes, "todo.md"), join(notes, "tasks.md"));
    h.app.graph.build(true);
    await h.app.run("note.open todo-link.md");
    await h.app.run("link.relink");
    expect((h.app.overlay as ListOverlay).title).toStartWith("relink: 1 change in 1 file");
    await h.keys("enter");
    expect(readFileSync(join(notes, "todo-link.md"), "utf8")).toBe("[t](tasks.md)\n");
    // Nothing left to relink: the preview says what it looked for (no names: links are paths, 20.22).
    await h.app.run("link.relink");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual([
      "no broken link points where a file moved from",
    ]);
  });

  test("a new note named like another is offered a distinct name from its folder; typed again, it's kept (17.5)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "projects/index.md" });
    await h.keys("ctrl+n");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter");
    expect(h.app.messages.at(-1)!.text).toContain("a note named alpha is at notes/alpha.md");
    const p = h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
    expect(p.text).toBe("projects-alpha");
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "projects-alpha.md"))).toBe(true);
    // Insisting: the same name typed again is made.
    await h.keys("escape"); // the new note opened to be typed into
    await h.app.run("note.open projects/index.md");
    await h.keys("ctrl+n");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter", "ctrl+u");
    for (const c of "alpha") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "projects", "alpha.md"))).toBe(true);
  });
});
