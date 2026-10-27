import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the Info view (3.19)", () => {
  const NOTE =
    "---\ntitle: Planning\nowner:\n  name: Rosa\n  desk: 2\ntags: [Plan]\n---\n# Planning\n\nSee [alpha](notes/alpha.md) and [missing](missing.md). #idea\n\n- [x] one\n- [ ] two\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "info.md"), NOTE);
    writeFileSync(join(root, "linker.md"), "[info](info.md)\n");
    return await harness({ root, open: "info.md", width: 140 });
  };
  const rows = (h: Harness) =>
    h.app.info.rows().map((r) => (r.heading ? `# ${r.key}` : `${"  ".repeat(r.depth)}${r.key}: ${r.value}`));

  test("space n i: the file on screen — where, which root, its counts and state; its properties, tags and links; the rail's button above ▤", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    expect(h.app.rightView).toBe("info");
    expect(h.app.region).toBe("outline");
    const r = rows(h);
    expect(r).toContain("path: info.md");
    // Qualified by its folder when other copies are known (20.6).
    expect(r.find((row) => row.startsWith("vault: "))).toBe("vault: fixture"); // its name, as pointers give it (21.9)
    expect(r).toContain("kind: note (markdown)");
    expect(r).toContain("state: saved");
    expect(r.slice(r.indexOf("# Properties"), r.indexOf("# Tags"))).toEqual([
      "# Properties",
      "title: Planning",
      "owner: ",
      "  name: Rosa",
      "  desk: 2",
      "tags: Plan",
    ]);
    expect(r.slice(r.indexOf("# Tags"), r.indexOf("# Links"))).toEqual(["# Tags", "#Plan: ", "#idea: "]);
    expect(r).toContain("links: 2 (1 unresolved)");
    expect(r).toContain("backlinks: 1");
    expect(r).toContain("tasks: 1 of 2 done");
    expect(statusRow(h.frame())).toContain("INFO");
    const hot = (id: string) => h.app.geometry!.hot.find((x) => x.id === id)!;
    expect(hot("btn:outline").y).toBe(hot("btn:info").y + 1);
    // A change shows: unsaved.
    await h.keys("escape");
    h.app.view!.buf.edit(0, 0, "x");
    expect(rows(h)).toContain("state: unsaved changes");
    h.app.saving.save(h.app.view!.buf);
    expect(rows(h)).toContain("state: saved"); // a save doesn't change the text: still shown
    // Another note's link to it counts at once.
    writeFileSync(join(h.root, "linker2.md"), "[info](info.md)\n");
    const st = statSync(join(h.root, "linker2.md"));
    h.app.graph.updateFile("linker2.md", {
      rel: "linker2.md",
      abs: join(h.root, "linker2.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    expect(rows(h)).toContain("backlinks: 2");
  });

  test("the filter's enter on a section heading folds that section, not the row at its index unfiltered", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    expect(h.app.region).toBe("outline");
    await h.keys("/", ..."links");
    expect(h.app.info.rows()[h.app.outline.selected]).toMatchObject({ heading: true, section: "Links" });
    await h.keys("enter");
    expect([...h.app.info.folded]).toEqual(["Links"]);
    expect(h.app.info.rows()[h.app.outline.selected]).toMatchObject({ heading: true, section: "Links" });
  });

  test("a note's links' convention in its Links, and what said each part: the root's tool, its notes, one written since (21.4)", async () => {
    // An Obsidian vault: its settings say all three.
    const vault = mkdtempSync(join(tmpdir(), "slipbox-conv-tui-"));
    mkdirSync(join(vault, ".obsidian"));
    writeFileSync(join(vault, ".obsidian", "app.json"), '{"newLinkFormat": "relative"}\n');
    writeFileSync(join(vault, "a.md"), "# A\n\n[[b]]\n");
    writeFileSync(join(vault, "b.md"), "# B\n");
    const h = await harness({ root: vault, open: "a.md" });
    await h.keys("space", "n", "i");
    const r = rows(h);
    const at = r.indexOf("writes: wikilinks");
    expect(r.slice(at, at + 4)).toEqual([
      "writes: wikilinks",
      "  path: relative",
      "  .md: dropped",
      "  from: Obsidian",
    ]);
    // y copies it whole.
    h.app.outline.selected = h.app.info.rows().findIndex((x) => x.key === "writes");
    h.app.region = "outline";
    await h.keys("y");
    expect(h.copied.at(-1)).toBe("wikilinks, relative, without .md — Obsidian's .obsidian/app.json");
    // A folder of notes: theirs, every note counted; a note written since counts at once.
    const notes = mkdtempSync(join(tmpdir(), "slipbox-conv-tui-notes-"));
    mkdirSync(join(notes, ".slipbox"));
    for (let i = 0; i < 6; i++) writeFileSync(join(notes, `n${i}.md`), `# N${i}\n\n[next](/n${(i + 1) % 6})\n`);
    const n = await harness({ root: notes, open: "n0.md" });
    await n.keys("space", "n", "i");
    expect(rows(n).slice(rows(n).indexOf("writes: markdown"), rows(n).indexOf("writes: markdown") + 4)).toEqual([
      "writes: markdown",
      "  path: from the vault's top",
      "  .md: dropped",
      "  from: notes 100%",
    ]);
    for (const [f, text] of [
      ["m1.md", "[a](n1.md) [b](n2.md)\n"],
      ["m2.md", "[c](./n3.md)\n"],
    ]) {
      writeFileSync(join(notes, f!), text!);
      const st = statSync(join(notes, f!));
      n.app.graph.updateFile(f!, { rel: f!, abs: join(notes, f!), size: st.size, mtimeMs: st.mtimeMs });
    }
    // 6 of 9 from the root: two-thirds still; 6 of 9 without .md too — each part's own source now.
    const mixed = rows(n);
    const m = mixed.indexOf("writes: markdown (notes 100%)");
    expect(mixed.slice(m, m + 3)).toEqual([
      "writes: markdown (notes 100%)",
      "  path: from the vault's top (notes 67%)",
      "  .md: dropped (notes 67%)",
    ]);
    expect(mixed[m + 3] ?? "").not.toMatch(/^ {2}from:/); // each part says its own
  });

  test("enter opens what a row names: a property's line, a tag's notes, the backlinks; y copies; h folds a section; / filters", async () => {
    const h = await setup();
    await h.keys("space", "n", "i");
    const select = (label: string) => {
      h.app.outline.selected = h.app.info.rows().findIndex((r) => (r.heading ? `# ${r.key}` : r.key) === label);
      h.app.region = "outline";
    };
    select("title");
    await h.keys("enter");
    expect(h.app.region).toBe("content");
    expect(h.app.cursorLine(h.app.view!)).toBe(2); // its line in the frontmatter
    // A nested key: its own line in source mode (rendered, its map's row shows it).
    await h.app.run("view.source");
    select("desk");
    await h.keys("enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(5);
    await h.app.run("view.source");
    select("#idea");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("#idea — 1 note");
    await h.keys("escape");
    select("backlinks");
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("Linking to info.md (1)"); // the backlinks list
    await h.keys("escape");
    select("path");
    await h.keys("y");
    expect(h.copied.at(-1)).toBe(join(h.root, "info.md"));
    select("# Properties");
    await h.keys("h");
    expect(rows(h)).not.toContain("title: Planning");
    await h.keys("l");
    expect(rows(h)).toContain("title: Planning");
    await h.keys("/", "r", "o", "s", "a");
    expect(rows(h)).toEqual(["# Properties", "  name: Rosa"]);
  });
});
