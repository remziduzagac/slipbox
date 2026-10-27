import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const last = (h: Harness) => h.app.messages.at(-1)!;

  test("a note saved, moved, copied or captured where walk.exclude leaves it out: written, every write says so (D246)", async () => {
    const root = makeVault();
    // The harness's drafts/, a folder named by its path, and the scratch kept in the vault, in drafts/.
    const h = await harness({
      root,
      open: join(root, "drafts", "wip.md"),
      config: (c) => {
        c.walk.exclude.push("/projects/notes/", "nested-vault/");
        c.capture.location = "root";
        c.capture.file = "drafts/scratch.md";
      },
    });
    const wip = h.app.view!.buf;
    expect(wip.key).toBe("drafts/wip.md");
    // Every save says it, not the first alone: each save's message stands on its own.
    for (let i = 0; i < 2; i++) {
      wip.edit(0, 0, "x");
      await h.app.run("note.save");
      expect(last(h)).toMatchObject({ level: "info", text: "saved drafts/wip.md (not indexed: walk.exclude)" });
    }
    expect(readFileSync(join(root, "drafts", "wip.md"), "utf8")).toStartWith("xx");
    wip.edit(0, 0, "x");
    await h.app.run("note.save_force");
    expect(last(h).text).toBe("saved drafts/wip.md (not indexed: walk.exclude) over the file on disk");
    wip.edit(0, 0, "x");
    h.app.saving.autosave();
    expect(last(h).text).toBe("autosaved drafts/wip.md (not indexed: walk.exclude)");
    // `:wa`: the one left out named. A note the vault indexes says nothing more.
    const alpha = h.app.buffer("notes/alpha.md")!;
    alpha.edit(0, 0, "x");
    wip.edit(0, 0, "x");
    await h.app.run("note.save_all");
    expect(last(h).text).toBe("saved 2 notes (drafts/wip.md not indexed: walk.exclude)");
    h.app.open("notes/alpha.md");
    alpha.edit(0, 0, "x");
    await h.app.run("note.save");
    expect(last(h).text).toBe("saved notes/alpha.md");
    // Moved there: said after where it went.
    h.app.renaming.noteTo("notes/beta.md", "drafts/");
    await h.keys("enter");
    expect(existsSync(join(root, "drafts", "beta.md"))).toBe(true);
    expect(last(h).text).toStartWith("renamed notes/beta.md → drafts/beta.md (not indexed: walk.exclude): ");
    expect(h.app.graph.notes.has("drafts/beta.md")).toBe(false);
    // A folder copied into a folder whose path walk.exclude names.
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    h.app.explorer.select("notes");
    await h.keys("y");
    h.app.explorer.select("projects");
    await h.keys("p");
    expect(existsSync(join(root, "projects", "notes", "alpha.md"))).toBe(true);
    expect(last(h).text).toBe("copied notes → projects/notes (not indexed: walk.exclude)");
    // In the explorer, its ⊘ row as a typed path: a new note, a new folder and a paste are made there, and said so.
    const pick = (name: string) => {
      h.app.region = "sidebar";
      h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === name);
      expect(h.app.explorer.rows()[h.app.sidebar.selected]).toMatchObject({ outside: true });
    };
    pick("drafts");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.leftOut).toBe("walk.exclude");
    h.app.explorer.action("new_note");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).label).toBe(
      "new note in drafts/",
    );
    await type(h, "fresh");
    await h.keys("enter");
    expect(readFileSync(join(root, "drafts", "fresh.md"), "utf8")).toStartWith("# fresh\n");
    expect(h.app.messages.map((m) => m.text)).toContain("created drafts/fresh.md (not indexed: walk.exclude)");
    await h.keys("escape");
    pick("drafts");
    h.app.explorer.action("new_folder");
    await type(h, "sub");
    await h.keys("enter");
    expect(existsSync(join(root, "drafts", "sub"))).toBe(true);
    expect(last(h).text).toBe("created drafts/sub/ (not indexed: walk.exclude)");
    h.app.files.clipItem("copy", { rel: "index.md", dir: false });
    pick("drafts");
    h.app.files.pasteItem();
    expect(last(h).text).toBe("copied index.md → drafts/index.md (not indexed: walk.exclude)");
    // A file's row in it: its folder.
    pick("drafts");
    h.app.explorer.action("expand");
    pick("wip.md");
    h.app.explorer.action("new_note");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).label).toBe(
      "new note in drafts/",
    );
    await h.keys("escape");
    // A busy folder that looks generated, and a vault of its own there, are refused as before.
    for (const name of ["node_modules", "nested-vault"]) {
      pick(name);
      h.app.explorer.action("new_note");
      expect(h.app.overlay).toBeNull();
      expect(last(h).text).toBe("a folder this vault doesn't index: select one it does");
    }
    // Exported there as Markdown, a note; as Word, nothing a vault indexes, so nothing said.
    const { formatFor } = await import("../../../../src/core/rendering/export/index.ts");
    await h.app.exporter.write(["index.md"], formatFor("md")!, join(root, "drafts", "index.export.md"));
    expect(last(h).text).toBe(
      "exported index.md to drafts/index.export.md (Markdown (.md), not indexed: walk.exclude)",
    );
    await h.app.exporter.write(["index.md"], formatFor("docx")!, join(root, "drafts", "index.docx"));
    expect(last(h).text).toBe("exported index.md to drafts/index.docx (Word (.docx))");
    // Captured into the scratch, there.
    h.app.scratch.capture("an idea\n");
    expect(last(h).text).toBe("added to the scratch (not indexed: walk.exclude); add a note, esc then q closes it");
    expect(readFileSync(join(root, "drafts", "scratch.md"), "utf8")).toContain("an idea");
    // In a root nested in this one, which indexes it by its own settings: this vault's walk.exclude says nothing.
    h.app.files.createNote("nested-vault/idea", "");
    expect(last(h).text).toBe("created nested-vault/idea.md");
  });
});
