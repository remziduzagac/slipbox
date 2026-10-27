import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { probe, setLinkAnswer } from "../../../../src/core/workspace/vaults/symlinks.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { peekOf } from "../../../../src/tui/documents/navigation/peek.ts";
import { makeSandbox, harness, onlyRootsUnder, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("out of the vault open, the links of the place a file is in: the peek, the explorer, home (VV-D6)", () => {
  /** This vault; another beside it, with links out of it not followed; Elsewhere's folder with one; where they lead. */
  const places = () => {
    const top = realpathSync(mkdtempSync(join(sandbox, "places-")));
    const notes = join(top, "notes");
    const cloned = join(top, "cloned");
    const apart = join(top, "apart");
    const loose = join(top, "loose");
    for (const v of [notes, cloned]) mkdirSync(join(v, ".slipbox"), { recursive: true });
    mkdirSync(apart);
    mkdirSync(loose);
    writeFileSync(join(apart, "kept.md"), "# Kept apart\n\nnot for a peek\n");
    writeFileSync(join(notes, "index.md"), "# Index\n\n[x](../cloned/readme.md)\n");
    writeFileSync(join(notes, "via.md"), "# Via\n\n[h](../cloned/hub.md)\n");
    writeFileSync(join(cloned, "hub.md"), "# Hub\n\n[d](docs.md)\n");
    symlinkSync(join(apart, "kept.md"), join(cloned, "readme.md"));
    symlinkSync(join(apart, "kept.md"), join(cloned, "docs.md"));
    symlinkSync(join(apart, "kept.md"), join(loose, "leaf.md"));
    symlinkSync(apart, join(loose, "od"));
    return { top, notes, cloned, apart, loose };
  };
  const peeked = (h: Harness) => (h.app.floating?.kind === "peek" ? h.app.view!.buf : null);
  /** Whether anything open holds what the links lead to. */
  const held = (h: Harness) =>
    [...h.app.buffers.values(), ...(peeked(h) ? [peeked(h)!] : [])].some((b) => b.source.includes("not for a peek"));

  test("a peek into another vault through its link not followed doesn't read it, and says so; t keeps nothing; o goes there, where it asks", async () => {
    const { notes, cloned } = places();
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(peeked(h)?.abs).toBe(join(cloned, "readme.md"));
    expect(peeked(h)!.source).toContain(`isn't followed in ${tildePath(cloned)}`);
    expect(h.frame()).not.toContain("not for a peek");
    await h.keys("t");
    expect(h.app.messages.at(-1)!.text).toContain("isn't followed in");
    expect(h.app.floating?.kind).toBe("peek");
    expect(held(h)).toBe(false);
    await h.keys("o");
    expect(h.app.loc.root).toBe(cloned);
    expect((h.app.overlay as ListOverlay).title).toContain("leads out of");
    expect(held(h)).toBe(false);
  });

  test("inside a peek, a link its vault hasn't followed moves it without reading; ctrl+o and forward read only what may be", async () => {
    const { notes, cloned } = places();
    const h = await harness({ root: notes, open: "via.md" });
    await h.keys("tab", "enter");
    expect(peeked(h)?.abs).toBe(join(cloned, "hub.md"));
    await h.keys("tab", "enter");
    expect(peeked(h)?.abs).toBe(join(cloned, "docs.md"));
    expect(held(h)).toBe(false);
    await h.keys("ctrl+o");
    expect(peeked(h)?.source).toContain("# Hub");
    // Followed there since: forward, read.
    setLinkAnswer(join(cloned, "docs.md"), "follow");
    await h.app.run("history.forward");
    expect(peeked(h)?.source).toContain("not for a peek");
    // Said no since: back and forward again, not read.
    await h.keys("ctrl+o");
    setLinkAnswer(join(cloned, "docs.md"), "no");
    await h.app.run("history.forward");
    expect(peeked(h)?.abs).toBe(join(cloned, "docs.md"));
    expect(peeked(h)!.source).not.toContain("not for a peek");
  });

  test("a peek into Elsewhere through a link there isn't read; one of this vault's on the way asks first", async () => {
    const { notes, cloned, loose } = places();
    writeFileSync(join(notes, "far.md"), `# Far\n\n[e](${join(loose, "leaf.md")})\n`);
    symlinkSync(cloned, join(notes, "ext"));
    writeFileSync(join(notes, "own.md"), "# Own\n\n[c](ext/hub.md)\n");
    const h = await harness({ root: notes, open: "far.md" });
    await h.keys("tab", "enter");
    expect(peeked(h)?.abs).toBe(join(loose, "leaf.md"));
    expect(peeked(h)!.source).toContain("isn't followed in Elsewhere");
    expect(held(h)).toBe(false);
    h.app.overlays.closeFloating();
    await h.app.run("note.open own.md");
    await h.keys("tab", "enter");
    expect(h.app.floating).toBeNull();
    expect((h.app.overlay as ListOverlay).title).toBe(
      `${tildePath(join(notes, "ext"))} → ${tildePath(cloned)} leads out of ${tildePath(notes)}: follow it?`,
    );
  });

  test("a peek's backlinks from files named with > or a newline are links, followed to their line", async () => {
    const top = realpathSync(mkdtempSync(join(sandbox, "names-")));
    const notes = join(top, "notes");
    const other = join(top, "other");
    for (const v of [notes, other]) mkdirSync(join(v, ".slipbox"), { recursive: true });
    writeFileSync(join(other, "target.md"), "# Target\n");
    writeFileSync(join(other, "x>y.md"), "# XY\n\n[t](target.md)\n");
    writeFileSync(join(other, "line\nbreak.md"), "# Break\n\n[t](target.md)\n");
    openGraph(locateVault({ root: other }), DEFAULT_CONFIG, true);
    writeFileSync(join(notes, "to.md"), "# To\n\n[t](../other/target.md)\n");
    await onlyRootsUnder(top, async () => {
      const h = await harness({ root: notes, open: "to.md" });
      await h.keys("tab", "enter");
      expect(peeked(h)?.abs).toBe(join(other, "target.md"));
      await peekOf(h.app)!.reading;
      expect(h.frame()).not.toContain("](<");
      for (const [name, shown] of [
        ["x>y.md", "x>y.md:3"],
        ["line\nbreak.md", "line\\nbreak.md:3"],
      ] as const) {
        const v = h.app.view!;
        const links = h.app.currentLayout(v).links;
        const l = links.find((k) => k.text.startsWith(shown));
        expect(l).toBeDefined();
        h.app.moveCursor(v, { row: l!.line, col: l!.col });
        await h.keys("enter");
        expect(peeked(h)?.abs).toBe(join(other, name));
        expect(h.app.view!.curAnchor.anchor.line).toBe(3);
        await h.keys("ctrl+o");
        await peekOf(h.app)!.reading;
      }
    });
  });

  test("from a vault, a link in a folder outside it, not followed there, says so and is unfolded only once asked", async () => {
    const { top, notes, loose } = places();
    const h = await harness({ root: notes, open: "index.md" });
    h.app.leftView = "explorer";
    h.app.sidebar.visible = true;
    h.app.explorer.zoomTo(top);
    const select = (name: string) => {
      h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === name);
      h.app.region = "sidebar";
    };
    select("loose");
    await h.keys("l");
    const od = h.app.explorer.rows().find((r) => r.path === join(loose, "od"))!;
    expect(h.app.following.describe(od)).toContain("not followed");
    select("od");
    await h.keys("l");
    expect((h.app.overlay as ListOverlay).title).toContain("is a link: follow it?");
    expect(h.app.explorer.rows().some((r) => r.path === join(loose, "od", "kept.md"))).toBe(false);
    await h.keys("n");
    expect(h.app.explorer.rows().some((r) => r.path === join(loose, "od", "kept.md"))).toBe(false);
  });

  test("in home, a new note and a folder are made through a followed link; a move or delete across it is refused, as the command line says", async () => {
    const top = realpathSync(mkdtempSync(join(sandbox, "home-ops-")));
    const home = join(top, "home");
    const ext = join(top, "ext");
    mkdirSync(home);
    mkdirSync(ext);
    writeFileSync(join(home, "n.md"), "# N\n");
    writeFileSync(join(ext, "b.md"), "# B\n");
    symlinkSync(ext, join(home, "data"));
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      setLinkAnswer(join(home, "data"), "follow");
      await probe(ext);
      const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const h = await harness({ loc: homeAt(home), open: "n.md" });
      expect(h.app.files.createNote("data/new", "")).toMatchObject({ created: true });
      expect(readFileSync(join(ext, "new.md"), "utf8")).toBe("# new\n\n");
      expect(h.app.files.createFolder("data/sub", "")).toBe("data/sub");
      expect(existsSync(join(ext, "sub"))).toBe(true);
      h.app.renaming.noteTo("n.md", "data/n.md");
      expect(h.app.messages.at(-1)!.text).toBe("data/n.md would land outside the vault");
      h.app.files.deleteItem({ rel: "data/b.md", dir: false });
      await h.keys("y");
      expect(h.app.messages.at(-1)!.text).toBe("data/b.md resolves outside the vault");
      expect(existsSync(join(ext, "b.md"))).toBe(true);
      expect(existsSync(join(home, "n.md"))).toBe(true);
      // Through a link not followed: nothing made.
      symlinkSync(ext, join(home, "other"));
      expect(h.app.files.createNote("other/x", "")).toBeNull();
      expect(h.app.messages.at(-1)!.text).toContain("isn't followed");
      expect(existsSync(join(ext, "x.md"))).toBe(false);
    } finally {
      process.env.HOME = before;
    }
  });
});
