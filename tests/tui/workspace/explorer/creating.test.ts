import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("creating notes and folders", () => {
  test("ctrl+n: a name, the note beside this one with its title, opened and typed into — in the lens or source mode", async () => {
    for (const edit_in of ["live", "source"] as const) {
      const root = makeVault();
      const h = await harness({ root, open: "notes/alpha.md", config: (c) => (c.editor.edit_in = edit_in) });
      await h.keys("ctrl+n");
      expect(h.frame()).toContain("new note in notes/");
      for (const c of "idea") await h.keys(c);
      await h.keys("enter");
      expect(readFileSync(join(root, "notes", "idea.md"), "utf8")).toBe("# idea\n\n");
      const v = h.app.view!;
      expect(v.buf.rel).toBe("notes/idea.md");
      expect(v.insert).toBe(true); // at once: making the note was the editing key's first press
      expect(edit_in === "live" ? v.live : v.source).toBe(true);
      await h.keys("h", "i", "escape", "ctrl+s");
      expect(readFileSync(join(root, "notes", "idea.md"), "utf8")).toBe("# idea\n\nhi\n");
      expect(h.app.graph.notes.has("notes/idea.md")).toBe(true);
    }
  });
  test(":new takes folders (made) and other note formats; an existing file opens; outside the vault is refused", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.app.run("note.create projects/deep/plan");
    expect(readFileSync(join(root, "projects", "deep", "plan.md"), "utf8")).toBe("# plan\n\n");
    await h.app.run("note.create /cfg.toml");
    expect(existsSync(join(root, "cfg.toml"))).toBe(true);
    expect(h.app.view!.buf.rel).toBe("cfg.toml");
    await h.app.run("note.create notes/alpha");
    expect(h.app.messages.at(-1)!.text).toContain("exists");
    await h.app.run("note.create ../../escape"); // from notes/: past the root
    expect(h.app.messages.at(-1)!.text).toContain("not inside the vault");
    expect(existsSync(join(root, "..", "escape.md"))).toBe(false);
  });
  test("the explorer: n a note in the selected folder (space n n too), N a folder — shown though empty, and selected", async () => {
    const root = makeVault();
    const h = await harness({ root });
    await h.keys("space", "e");
    const at = h.app.explorer.rows().findIndex((r) => r.kind === "dir" && r.path === "notes");
    h.app.sidebar.selected = at;
    h.app.region = "sidebar";
    await h.keys("shift+n");
    // Not drafts: the harness's walk.exclude leaves out every drafts/ folder.
    for (const c of "ideas") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas"))).toBe(true);
    const sel = h.app.explorer.rows()[h.app.sidebar.selected]!;
    expect([sel.kind, sel.path]).toEqual(["dir", "notes/ideas"]);
    expect(h.frame()).toContain("ideas"); // empty, still listed
    await h.keys("n");
    for (const c of "first") await h.keys(c);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas", "first.md"))).toBe(true);
    expect(h.app.view!.buf.rel).toBe("notes/ideas/first.md");
    // space n n, from the explorer: the same, in its selected folder.
    await h.keys("escape", "space", "e");
    h.app.region = "sidebar";
    h.app.explorer.select("notes/ideas");
    await h.keys("space", "n", "n");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "new note in notes/ideas/" });
  });
  test("a pane's own key sequence waits for its second key: a global key it starts with isn't run after a pause", async () => {
    // w is the note's word motion; in the explorer, w w is bound here: w waits, however long.
    const h = await harness({ config: (c) => (c.keys.explorer = { "w w": "bottom" }) });
    await h.keys("space", "e");
    h.app.region = "sidebar";
    h.app.sidebar.selected = 0;
    await h.keys("w");
    await Bun.sleep(DEFAULT_CONFIG.input.which_key_delay_ms + 150);
    expect(h.app.pending).toEqual(["w"]);
    expect(h.app.region).toBe("sidebar");
    h.app.input.whichKey = true;
    expect(h.frame()).toContain("Bottom"); // which-key names the pane's action as help does
    await h.keys("w");
    expect(h.app.sidebar.selected).toBe(h.app.explorer.rows().length - 1);
  });
  test("following a link to a note that doesn't exist asks to create it, the name filled in", async () => {
    const root = makeVault();
    writeFileSync(join(root, "notes", "hub.md"), "# Hub\n\nSee [future note](future%20note.md).\n");
    const h = await harness({ root, open: "notes/hub.md" });
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(h.app.overlay).toMatchObject({ kind: "prompt", text: "future note" });
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "future note.md"))).toBe(true);
    await h.keys("escape", "ctrl+o");
    expect(h.app.view!.buf.rel).toBe("notes/hub.md");
    expect(h.app.graph.linksOf("notes/hub.md")[0]!.resolvedKind).toBe("note"); // the link resolves now
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const last = (h: Harness) => h.app.messages.at(-1)!;

  test("a new note in a nested root or a walk-excluded folder isn't this root's; the nested one opens in its root", async () => {
    const root = makeVault();
    const h = await harness({ root });
    h.app.files.promptNewNote("");
    await type(h, "nested-vault/idea");
    await h.keys("enter");
    expect(existsSync(join(root, "nested-vault", "idea.md"))).toBe(true);
    expect(h.app.loc.root).toBe(join(root, "nested-vault"));
    expect(h.app.view!.buf.rel).toBe("idea.md");
    expect(h.app.view!.insert).toBe(true); // typed into, as any new note
    const d = await harness({ root: makeVault() }); // walk.exclude = ["drafts/"]
    const r = d.app.files.createNote("drafts/new-one", "")!;
    // Made, and said that it isn't indexed (D246); the nested root's, below, is that root's: nothing said.
    expect(last(d)).toMatchObject({ level: "info", text: "created drafts/new-one.md (not indexed: walk.exclude)" });
    expect(d.app.graph.notes.has("drafts/new-one.md")).toBe(false);
    expect(d.app.graph.dirs.filter((x) => x === "drafts" || x.startsWith("drafts/"))).toEqual([]);
    d.app.open(r.open);
    expect(d.app.view!.buf.key).toBe("drafts/new-one.md");
    const n = d.app.files.createNote("nested-vault/idea", "")!;
    expect(last(d).text).toBe("created nested-vault/idea.md");
    expect(d.app.graph.notes.has("nested-vault/idea.md")).toBe(false);
    expect(n.open).toBe(join(d.root, "nested-vault", "idea.md"));
    d.app.files.createFolder("drafts/sub", "");
    expect(last(d).text).toBe("created drafts/sub/ (not indexed: walk.exclude)");
    expect(d.app.graph.dirs.filter((x) => x.startsWith("drafts"))).toEqual([]);
  });

  test("a new note typed into a busy folder that looks generated is refused; at a busy name's top it makes a notes folder", async () => {
    const root = makeVault();
    mkdirSync(join(root, "target", "debug"), { recursive: true }); // only folders at its top
    writeFileSync(join(root, "target", "debug", "out.json"), "{}\n");
    writeFileSync(join(root, ".gitignore"), "ignored/\n*.skip.md\ndist/\n");
    mkdirSync(join(root, "dist")); // ignored
    writeFileSync(join(root, "dist", "d.md"), "# D\n");
    const h = await harness({ root });
    for (const typed of ["dist/y", "target/debug/x", "notes/my-cache/sub/c"])
      expect(h.app.files.createNote(typed, "")).toBeNull();
    expect(last(h)).toMatchObject({
      level: "warn",
      text: "not creating notes/my-cache/sub/c.md: notes/my-cache/ is a busy folder (no note at its top), which the vault doesn't index",
    });
    for (const rel of ["dist/y.md", "target/debug/x.md", "notes/my-cache"])
      expect(existsSync(join(root, rel))).toBe(false);
    // At a busy name's top, not ignored: made, and the folder one like any — indexed, opened as the vault's.
    expect(h.app.files.createNote("build/plan", "")).toMatchObject({
      rel: "build/plan.md",
      created: true,
      open: "build/plan.md",
    });
    expect(h.app.graph.notes.has("build/plan.md")).toBe(true);
    expect(h.app.graph.dirs).toContain("build");
    // A note already in a busy folder opens.
    expect(h.app.files.createNote("dist/d", "")).toMatchObject({ rel: "dist/d.md", created: false });
  });

  test("a new note or folder named ..draft is inside the root; a root file named ..notes.md is keyed by its path", async () => {
    const root = makeVault();
    const h = await harness({ root });
    expect(h.app.files.createNote("..draft", "")).toMatchObject({ rel: "..draft.md", created: true });
    expect(existsSync(join(root, "..draft.md"))).toBe(true);
    expect(h.app.files.createFolder("..dir", "")).toBe("..dir");
    writeFileSync(join(root, "..notes.md"), "# N\n");
    expect(h.app.buffer("..notes.md")!.key).toBe("..notes.md");
  });
});
