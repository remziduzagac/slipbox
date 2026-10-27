import { describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";

import { RANKED, rank } from "../../../../src/tui/shell/overlays/match.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder, type Harness } from "../../../tui-harness.ts";

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

  test("a link's target completed (20.13): after ]( the files it could reach — this vault's by path, another's by its full path (21.9) — narrowed as typed; the path from the note written, another named folder's pointer (21.7)", async () => {
    const { base, notes, app, n } = await twoVaults();
    mkdirSync(join(notes, "sub"), { recursive: true });
    writeFileSync(join(notes, "sub", "here.md"), "# Here\n");
    writeFileSync(join(notes, "zq b.md"), "# Spaced\n");
    const h = await harness({ root: notes, open: "sub/here.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    for (const k of "[x](") await h.keys(k);
    const shown = (h: Harness) => h.app.completion?.shown.map((i) => i.label) ?? [];
    expect(h.app.completion?.links).toBe("markdown");
    expect(shown(h)).toContain("todo.md");
    expect(shown(h)).toContain(join(app, "design.md"));
    expect(shown(h)).not.toContain("sub/here.md"); // not the note itself
    // This vault's first.
    expect(shown(h).indexOf("todo.md")).toBeLessThan(shown(h).indexOf(join(app, "design.md")));
    // Typed as it's shown (other test vaults have a design.md too: this one's folder narrows).
    for (const k of `${basename(base)}/app/desi`) await h.keys(k);
    expect(shown(h)[0]).toBe(join(app, "design.md"));
    await h.keys("tab");
    expect(h.app.view!.buf.source).toBe(`# Here\n[x](slipbox://tapp${n}/design.md\n`); // a named folder of its own (21.7)
    expect(h.app.completion).toBeNull();
    // Closed by the link's end; a space is a path's too, written encoded.
    await h.keys(")", "space");
    expect(h.app.completion).toBeNull();
    for (const k of "[y](zq") await h.keys(k);
    expect(shown(h)[0]).toBe("zq b.md");
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[y](../zq%20b.md\n");
    // Narrowed by the full path too: its folder's name, which no vault form has.
    await h.keys(")", "space");
    for (const k of `[z](${basename(dirname(notes))}`) await h.keys(k);
    expect(shown(h)).toContain("todo.md");
    // Typing past the target closes it; a ( that isn't a link's opens nothing.
    await h.keys(")");
    expect(h.app.completion).toBeNull();
    for (const k of " f(") await h.keys(k);
    expect(h.app.completion).toBeNull();
    await h.keys("escape");
  });

  test("a link's target that matches nothing keeps its list while typed: the other vaults' indexes read once per link, not per key", async () => {
    const { base, notes, app } = await twoVaults();
    await onlyRootsUnder(base, async () => {
      const { cacheDir } = await import("../../../../src/core/foundation/platform/paths.ts");
      const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
      const { foldersFile } = await import("../../../../src/core/workspace/vaults/folders.ts");
      const match = await import("../../../../src/tui/shell/overlays/match.ts");
      const index = join(cacheDir(readRoots().find((v) => v.path === app)!), "index.json");
      const h = await harness({ root: notes, open: "index.md" });
      await h.app.run("view.source");
      await h.keys("shift+g", "o");
      const read = fs.readFileSync;
      let reads = 0;
      let named = 0;
      // The list's own reads and rankings, not a frame's (backlinks across vaults, a pointer followed, a filter): told
      // by the whole stack, as each is some frames below `linkItems` or `narrow`.
      const under = (fn: string) => {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = Number.POSITIVE_INFINITY;
        const stack = new Error().stack ?? "";
        Error.stackTraceLimit = limit;
        return stack.includes(fn);
      };
      const spy = spyOn(fs, "readFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, ...rest: never[]) => {
        if ((path === index || path === foldersFile()) && under("linkItems")) {
          if (path === index) reads++;
          else named++;
        }
        return read(path, ...rest);
      }) as typeof fs.readFileSync);
      // How many items each key ranked, and how many each matched.
      const rank = match.rank;
      const sizes: { among: number; found: number }[] = [];
      const ranked = spyOn(match, "rank").mockImplementation(((...args: Parameters<typeof rank>) => {
        const out = rank(...args);
        if (under("narrow")) sizes.push({ among: args[1].length, found: out.length });
        return out;
      }) as typeof rank);
      const among = () => sizes.map((x) => x.among);
      const found = () => sizes.map((x) => x.found);
      const shown = () => h.app.completion?.shown.map((i) => i.label) ?? [];
      try {
        // An item's text holds its whole path, and a temporary folder's name can hold any letters (under `run-To-…`,
        // every item matched "to"): the target reaches a `.`, which no such name holds.
        for (const k of "[x](todo.m") await h.keys(k);
        expect(shown()).toEqual(["todo.md"]);
        // The named folders read once for the list, not once per other vault's note.
        expect(named).toBe(1);
        // Each key ranks only what the last one matched: the whole list for `t`, then fewer.
        expect(among()).toHaveLength(6);
        expect(among().slice(1)).toEqual(found().slice(0, -1));
        expect(among().at(-1)).toBeLessThan(among()[0]!);
        // Past any match: nothing shown, and typing on reads nothing again, nor ranks anything.
        sizes.length = 0;
        for (const k of "qQqq") await h.keys(k);
        expect(shown()).toEqual([]);
        expect(reads).toBe(1);
        expect(among()).toEqual([1, 0, 0, 0]);
        // Back to a match, it shows again from the same list; each backspace ranks only what its shorter word
        // matched when it was typed.
        sizes.length = 0;
        for (let i = 0; i < 4; i++) await h.keys("backspace");
        expect(shown()).toEqual(["todo.md"]);
        expect(reads).toBe(1);
        expect(among()).toEqual([0, 0, 0, 1]);
        // tab while nothing shows isn't the popup's: it indents the line, as with no popup. The target moved, the
        // same list.
        await h.keys("q", "tab");
        expect(h.app.view!.buf.source).toEndWith("\n  [x](todo.mq\n");
        expect(reads).toBe(1);
        // The link ended, the next one reads them again: a note indexed since is offered.
        await h.keys("backspace", "backspace", ")", "space");
        expect(h.app.completion).toBeNull();
        writeFileSync(join(app, "later.md"), "# Later\n");
        openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
        const before = reads;
        for (const k of "[y](") await h.keys(k);
        expect(reads).toBe(before + 1);
        expect(shown()).toContain(join(app, "later.md"));
      } finally {
        spy.mockRestore();
        ranked.mockRestore();
      }
      await h.keys("escape");
    });
    // A wikilink's list (this vault's alone) is kept the same way; narrowed from the last key's matches, it shows
    // what ranking the whole list would.
    const h = await harness({ root: notes, open: "index.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    await h.keys("[", "[");
    for (const k of "to") {
      await h.keys(k);
      const c = h.app.completion!;
      const word = h.app.view!.buf.source.slice(c.from, offsetOf(h.app, h.app.view!));
      const whole = word ? rank(word, c.items, (i) => i.filterText ?? i.label).map((r) => r.item) : c.items;
      expect(c.shown).toEqual(whole);
    }
    const list = h.app.completion;
    expect(list?.shown.map((i) => i.detail)).toEqual(["todo.md"]);
    // Past any match by a `~`, which no path here holds: a temporary folder's name could hold "toq", and tab would take
    // the item.
    for (const k of "~~") await h.keys(k);
    expect(h.app.completion).toBe(list);
    expect(list?.shown).toEqual([]);
    await h.keys("backspace", "backspace");
    expect(h.app.completion).toBe(list);
    expect(list?.shown.map((i) => i.detail)).toEqual(["todo.md"]);
    // An indent (tab while nothing shows) moves the target: the same list.
    await h.keys("~", "tab");
    expect(h.app.view!.buf.source).toEndWith("\n  [[to~\n");
    expect(h.app.completion).toBe(list);
    // Its target ended: gone.
    await h.keys("backspace", "]");
    expect(h.app.completion).toBeNull();
    // Another line's target gets its own list, the cursor gone there straight from one kept. A target matching
    // nothing has a `~`: an item's text holds its whole path, and a random temporary folder's name can hold any two
    // letters (`two-dG0Zz7` matched "zz").
    await h.keys("enter");
    for (const k of "[[z~") await h.keys(k);
    const next = h.app.completion;
    expect(next?.shown).toEqual([]);
    await h.keys("up");
    expect(h.app.completion?.links).toBe("wiki");
    expect(h.app.completion).not.toBe(next);
    expect(h.app.completion!.from).toBeLessThan(next!.from);
    // Another target on the same line too, the cursor gone there at a jump (end).
    await h.keys("escape", "o");
    for (const k of "[[to") await h.keys(k);
    await h.keys("home");
    expect(h.app.completion).toBeNull();
    for (const k of "[[z~") await h.keys(k);
    const first = h.app.completion;
    expect(first?.shown).toEqual([]);
    await h.keys("end");
    expect(h.app.view!.buf.source).toContain("\n[[z~  [[to\n");
    expect(h.app.completion).not.toBe(first);
    expect(h.app.completion?.shown.map((i) => i.detail)).toEqual(["todo.md"]);
    // A paste that leaves the cursor in another target on the line, then a key there: its own list too.
    await h.keys("escape", "o");
    for (const k of "[[z~") await h.keys(k);
    const kept = h.app.completion;
    expect(kept?.shown).toEqual([]);
    await h.app.input.paste("]] [[to");
    await h.keys("left");
    expect(h.app.view!.buf.source).toContain("\n[[z~]] [[to\n");
    expect(h.app.completion?.links).toBe("wiki");
    expect(h.app.completion).not.toBe(kept);
    // What's before a target changed where it stands, its start unmoved (an edit from outside, a reload): its own list.
    await h.keys("escape", "o");
    for (const k of ["a", "space", ..."[[z~"]) await h.keys(k);
    const here = h.app.completion;
    expect(here?.shown).toEqual([]);
    const buf = h.app.view!.buf;
    buf.edit(buf.source.lastIndexOf("a [[z~"), 1, "b");
    await h.keys("z");
    expect(h.app.view!.buf.source).toContain("\nb [[z~z\n");
    expect(h.app.completion?.links).toBe("wiki");
    expect(h.app.completion).not.toBe(here);
    await h.keys("escape");
  });

  test("a link's list narrows from every match of the last key, not only the ones shown (20.13)", async () => {
    const root = makeVault();
    for (let i = 0; i < RANKED + 100; i++) writeFileSync(join(root, `t${String(i).padStart(3, "0")}.md`), "# T\n");
    writeFileSync(join(root, "target.md"), "# Target\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    for (const k of "[[t") await h.keys(k);
    const details = () => h.app.completion?.shown.map((i) => i.detail) ?? [];
    // More match than are shown, and target.md, the longest, isn't among those shown.
    expect(details()).toHaveLength(RANKED);
    expect(details()).not.toContain("target.md");
    await h.keys("a");
    expect(details()).toContain("target.md");
    await h.keys("escape");
  });

  test("a paste while typing closes the completion: tab or enter never takes back what was pasted (20.13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.app.run("view.source");
    // Pasted while a link's list shows, on into another target or past the target's end: closed, and tab is the
    // editor's.
    await h.keys("shift+g", "o");
    for (const k of "[[to") await h.keys(k);
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.app.input.paste("]] [[qqq");
    expect(h.app.completion).toBeNull();
    await h.keys("tab");
    expect(h.app.view!.buf.source).toContain("[[to]] [[qqq");
    await h.keys("escape", "o");
    for (const k of "[x](to") await h.keys(k);
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.app.input.paste(") and more");
    expect(h.app.completion).toBeNull();
    await h.keys("tab");
    expect(h.app.view!.buf.source).toContain("[x](to) and more");
    // Pasted into a target whose list was closed: none opened, and enter is a new line.
    await h.keys("escape", "o");
    for (const k of "[x](") await h.keys(k);
    await h.keys("ctrl+e");
    await h.app.input.paste("diagram");
    expect(h.app.completion).toBeNull();
    await h.keys("enter");
    expect(h.app.view!.buf.source).toContain("[x](diagram\n");
    // The next key typed in a target makes its list again.
    for (const k of "[x](diagra") await h.keys(k);
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.keys("escape");
  });

  test("`.` after a link completed and more typed repeats it as typed: the item, then a new line and the rest (20.13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    for (const k of "[[to") await h.keys(k);
    expect(h.app.completion?.shown.length).toBeGreaterThan(0);
    await h.keys("tab", "enter", "x", "escape");
    const src = h.app.view!.buf.source;
    const change = src.slice(src.lastIndexOf("\n[[") + 1);
    expect(change).toMatch(/^\[\[[^\n]+\nx\n$/);
    await h.keys(".");
    expect(h.app.view!.buf.source).toEndWith(change + change);
  });

  test("a pointer completed to a name two folders share asks first (D74, D83): written as it is, or one folder renamed first, previewed, then written; a private name, said", async () => {
    const { initVault, locateVault: locate } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const n = ++made;
    const base = mkdtempSync(join(sandbox, "clash-"));
    const notes = join(base, "notes");
    const twin1 = join(base, "one", `tw${n}`);
    const twin2 = join(base, "two", `tw${n}`);
    for (const [dir, file] of [
      [notes, "a.md"],
      [twin1, "t1.md"],
      [twin2, "t2.md"],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, file), `# ${file}\n`);
    }
    initVault(notes, `cnotes${n}`);
    initVault(twin1, `tw${n}`);
    // A second folder of the name: made by hand (init refuses a name this machine knows), seen.
    mkdirSync(join(twin2, ".slipbox"));
    writeFileSync(join(twin2, ".slipbox", "config.toml"), `[vault]\nid = "two${n}"\nname = "tw${n}"\n`);
    recordFolder(twin2);
    openGraph(locate({ root: twin1 }), DEFAULT_CONFIG, true); // its index: completion lists its notes
    const h = await harness({ root: notes, open: "a.md" });
    await h.app.run("view.source");
    const complete = async (typed: string) => {
      await h.keys("shift+g", "o");
      for (const k of `[x](one/tw${n}/${typed}`) await h.keys(k);
      expect(h.app.completion?.shown[0]?.detail).toEndWith(join(twin1, "t1.md"));
      await h.keys("tab");
    };
    const list = () => h.app.overlay as ListOverlay;
    await complete("t1");
    // Asked, nothing written yet.
    expect(list().title).toBe(`tw${n}: 2 different folders have this name — how is the link written?`);
    const parent = (dir: string) => basename(dirname(dir));
    expect(list().items.map((i) => [i.label, i.detail])).toEqual([
      [`Write it by tw${n} as it is`, "followed, it asks which folder is meant"],
      [`Rename ${twin1}'s name first…`, `tw${n} → ${parent(twin1)}-tw${n}`],
      [`Rename ${twin2}'s name first…`, `tw${n} → ${parent(twin2)}-tw${n}`],
    ]);
    expect(h.app.view!.buf.source).toBe("# a.md\n[x](one/tw" + n + "/t1\n");
    // As it is: the short name.
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.source).toBe(`# a.md\n[x](slipbox://tw${n}/t1.md\n`);
    await h.keys(")", "escape");
    // Again, the other folder renamed first: its name suggested, the rename previewed — then the link, by the name
    // that's now the linked folder's alone, nothing more asked.
    await complete("t1");
    list().selected = 2;
    await h.keys("enter");
    expect(h.app.overlay?.kind).toBe("prompt");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).text).toBe(`two-tw${n}`);
    await h.keys("enter");
    expect(list().title).toStartWith(`name tw${n} → two-tw${n}: 1 change in 1 file`);
    await h.keys("enter");
    expect(readFileSync(join(twin2, ".slipbox", "config.toml"), "utf8")).toContain(`name = "two-tw${n}"`);
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.source).toBe(`# a.md\n[x](slipbox://tw${n}/t1.md)\n[x](slipbox://tw${n}/t1.md\n`);
    await h.keys(")", "escape");
    // Esc at the question writes nothing.
    writeFileSync(join(twin2, ".slipbox", "config.toml"), `[vault]\nid = "two${n}"\nname = "tw${n}"\n`);
    recordFolder(twin2);
    await complete("t1");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.source).toEndWith(`\n[x](one/tw${n}/t1\n`);
    await h.keys("escape");
    // A private name (its .slipbox/ kept out of git): written, and said in the message line.
    const priv = join(base, `pv${n}`);
    mkdirSync(priv);
    Bun.spawnSync(["git", "init", "-q"], { cwd: priv });
    writeFileSync(join(priv, "p.md"), "# p\n");
    initVault(priv, `pv${n}`, { private: true });
    openGraph(locate({ root: priv }), DEFAULT_CONFIG, true);
    await h.keys("shift+g", "o");
    for (const k of `[p](pv${n}/p.m`) await h.keys(k);
    expect(h.app.completion?.shown[0]?.detail).toEndWith(join(priv, "p.md"));
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith(`\n[p](slipbox://pv${n}/p.md\n`);
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: `pv${n} is a private name (its .slipbox/ is kept out of git): the pointer works on this machine only`,
    });
    await h.keys("escape");
  });

  test("links completed in the root's convention (21.5): after [[ a name where it reaches the note, else its path; after ]( the convention's path and extension", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-complete-conv-"));
    mkdirSync(join(root, ".obsidian"));
    for (const d of ["sub", "other"]) mkdirSync(join(root, d));
    for (const f of ["sub/b.md", "other/b.md", "sub/dal.md"]) writeFileSync(join(root, f), `# ${f}\n`);
    writeFileSync(join(root, "sub", "here.md"), "# Here\n");
    const h = await harness({ root, open: "sub/here.md" });
    await h.app.run("view.source");
    await h.keys("shift+g", "o");
    const shown = () => h.app.completion?.shown.map((i) => [i.label, i.detail]) ?? [];
    for (const k of "[[") await h.keys(k);
    expect(h.app.completion?.links).toBe("wiki");
    // Each as it would be written: beside this note a name; the other b by its path.
    expect(shown()).toContainEqual(["b", "sub/b.md"]);
    expect(shown()).toContainEqual(["other/b", "other/b.md"]);
    for (const k of "da") await h.keys(k);
    expect(shown()[0]).toEqual(["dal", "sub/dal.md"]);
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[[dal\n");
    await h.keys("]", "]", "space");
    expect(h.app.completion).toBeNull();
    // A markdown link typed in a wikilink root: Obsidian keeps .md in one; relative (ours).
    for (const k of "[x](oth") await h.keys(k);
    await h.keys("tab");
    expect(h.app.view!.buf.source).toEndWith("[[dal]] [x](../other/b.md\n");
    await h.keys("escape");
  });
});
