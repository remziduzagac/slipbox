import { describe, expect, test } from "bun:test";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness, type Opts } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  test("search the vault: every note, the open one as it is now; enter opens it at the match", async () => {
    const root = makeVault();
    writeFileSync(join(root, "s1.md"), "# One\n\nthe zebra line\n");
    writeFileSync(join(root, "s2.md"), "# Two\n\nno\n\nzebra again\n");
    const h = await harness({ root, open: "s2.md" });
    await h.keys("space", "n", "v", "g", "g", "A");
    for (const c of " zebra") await h.keys(c === " " ? "space" : c);
    await h.keys("escape"); // unsaved: the search sees it
    await h.keys("space", "f", "g");
    for (const c of "zebra") await h.keys(c);
    await h.keys("enter");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => i.label).sort()).toEqual(["s1.md:3", "s2.md:1", "s2.md:5"]);
    expect(h.frame()).toMatch(/3 matches in 2 files/);
    const pick = o.filtered.findIndex((e) => e.item.label === "s1.md:3");
    for (let i = 0; i < pick; i++) await h.keys("down");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("s1.md");
  });
});

describe("search in the TUI (6.5, 6.9)", () => {
  const typeIn = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const withNotes = async (notes: Record<string, string>, opts: Partial<Opts> = {}) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(notes)) writeFileSync(join(root, rel), text);
    return harness({ root, open: "index.md", config: (c) => (c.search.engine = "auto"), ...opts });
  };

  test("space f s: ranked as you type, from the index built as the vault opened; the words marked; enter opens at the match", async () => {
    const h = await withNotes({
      "dome.md": "# Dome\n\nThe quetzal plinth was replaced,\nits bolts too.\n\n## Later\n\nAnd the dome rollers.\n",
    });
    await h.app.search.whenIndexed();
    expect(h.app.search.index?.complete).toBe(true);
    await h.keys("space", "f", "s");
    expect((h.app.overlay as ListOverlay).title).toStartWith("search here — words");
    await typeIn(h, "quetzal plinth");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe('"quetzal plinth" — 1 file');
    expect(list.filtered[0]!.item).toMatchObject({
      label: "dome.md:3",
      detail: "Dome — The quetzal plinth was replaced,",
    });
    // The words drawn as matches, the rest of the line dim.
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const y = rows.findIndex((r) => r.includes("dome.md:3"));
    const at = (w: string) => c.styles[y]![rows[y]!.indexOf(w)]!.fg;
    expect(at("quetzal")).toBe(h.app.theme.roles.overlay_match.fg!);
    expect(at("replaced")).not.toBe(h.app.theme.roles.overlay_match.fg!);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("dome.md");
    expect(statusRow(h.frame())).toContain("L3:1"); // rendered: the line's start, not its row's end
    // :search takes the words.
    await h.app.run("search.open dome rollers");
    expect((h.app.overlay as ListOverlay).filtered[0]!.item.label).toBe("dome.md:8");
  });

  test("kept current: a save here, a change the watcher reports, a rename; unsaved text searched as it's shown", async () => {
    const h = await withNotes({ "a.md": "# A\n\nplain words\n" });
    await h.app.search.whenIndexed();
    const found = (q: string) => h.app.search.query(q).hits.map((x) => `${x.path}:${x.line}`);
    await h.app.run("note.open a.md");
    // Typed, not saved: found as it's shown — and not as the file still has it.
    await h.keys("shift+g", "o", ...[..."a zebra"].map((ch) => (ch === " " ? "space" : ch)), "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(found("zebra")).toEqual(["a.md:4"]);
    expect(h.app.search.index!.query('"zebra"', { limit: 5 })).toEqual([]); // the index is the disk's
    await h.keys("ctrl+s");
    expect(h.app.search.index!.query('"zebra"', { limit: 5 })!.map((r) => r.path)).toEqual(["a.md"]); // the save, through the feed
    // Unsaved again, the word gone: not found, though the index has it.
    await h.keys("u");
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(found("zebra")).toEqual([]);
    await h.keys("ctrl+r");
    // Changed on disk, as the watcher tells the graph.
    writeFileSync(join(h.root, "b.md"), "# B\n\na quokka\n");
    const st = statSync(join(h.root, "b.md"));
    h.app.graph.updateFile("b.md", { rel: "b.md", abs: join(h.root, "b.md"), size: st.size, mtimeMs: st.mtimeMs });
    expect(found("quokka")).toEqual(["b.md:3"]);
    // Renamed here: the old path gone, the new one found.
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    h.app.renaming.preview(() => planNoteRename(h.app.graph, "b.md", "c"));
    await h.keys("enter");
    expect(found("quokka")).toEqual(["c.md:3"]); // as it was: nothing written into it (21.12)
    expect(h.app.search.index!.indexed().has("b.md")).toBe(false);
  });

  test("while the index is first built the list says so, and fills when it's done; without one (a scan engine), it scans", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 400; i++)
      many[`n${i}.md`] = `# Note ${i}\n\n${"filler words here. ".repeat(40)}${i === 7 ? "a narwhal" : ""}\n`;
    const h = await withNotes(many);
    expect(h.app.search.job).not.toBeNull();
    await h.keys("space", "f", "s");
    await typeIn(h, "narwhal");
    const list = h.app.overlay as ListOverlay;
    expect(h.app.search.job).not.toBeNull(); // keys don't wait for it: its slices run between frames
    // Asked directly meanwhile, the files are scanned: the index isn't whole yet.
    expect(h.app.search.query("narwhal")).toMatchObject({ engine: "scan", hits: [{ path: "n7.md", line: 3 }] });
    expect(list.title).toMatch(/^search — the folder is being indexed: [\d,]+ of [\d,]+ files…$/);
    expect(list.filtered).toEqual([]);
    await h.app.search.whenIndexed();
    expect(list.title).toBe('"narwhal" — 1 file');
    expect(list.filtered.map((f) => f.item.label)).toEqual(["n7.md:3"]);
    // [search] engine = "scan": no index, the files scanned.
    const s = await withNotes({ "w.md": "# W\n\na walrus\n" }, { config: (c) => (c.search.engine = "scan") });
    expect(s.app.search.index).toBeNull();
    await s.keys("space", "f", "s");
    await typeIn(s, "walrus");
    expect((s.app.overlay as ListOverlay).title).toBe('"walrus" — 1 file (scanned: no index here)');
  });
});
