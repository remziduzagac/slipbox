import { describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { linkAnswer, linkKey, probe, setLinkAnswer } from "../../../../src/core/workspace/vaults/symlinks.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("links followed only when you say so (VV-D6)", () => {
  /** A vault with a link to a folder outside it, and a note there. */
  const linked = () => {
    const top = realpathSync(mkdtempSync(join(sandbox, "links-")));
    const root = join(top, "vault");
    const out = join(top, "out");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(out);
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](data/far.md)\n");
    writeFileSync(join(out, "far.md"), "# Far\n\nFrom far away.\n");
    symlinkSync(out, join(root, "data"));
    return { top, root, out, link: join(root, "data") };
  };
  const row = (h: Harness, name: string) => h.app.explorer.rows().find((r) => r.name === name);
  const select = (h: Harness, name: string) => {
    h.app.leftView = "explorer";
    h.app.sidebar.visible = true;
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === name);
    h.app.region = "sidebar";
  };

  test("a link out of the vault: shown where it leads, not followed; opened, asked — and followed, read and indexed", async () => {
    const { root, out } = linked();
    const h = await harness({ root, open: "index.md", config: (c) => (c.ui.sidebar_width = 50) });
    expect(h.app.graph.notes.has("data/far.md")).toBe(false);
    expect(row(h, "data")?.link).toMatchObject({ target: out, dir: true });
    expect(h.app.following.describe(row(h, "data")!)).toBe(`→ ${out}  not followed`);
    select(h, "data");
    // Drawn in the description column, where it leads cut from the front: its last folder and its state kept; not
    // indexed, its mark says.
    h.app.region = "content"; // no buttons over the row's end
    expect(h.frame()).toMatch(/ data +→ …\S*out {2}not followed +⊘/);
    expect(h.app.explorer.marks.of(row(h, "data")!).index).toBe("not-indexed");
    // Short of room for even its state, cut from its end: never wider than its room.
    expect(stringWidth(h.app.following.describe(row(h, "data")!, 10)!)).toBeLessThanOrEqual(10);
    h.app.region = "sidebar";
    await h.keys("enter");
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toBe(`${tildePath(join(root, "data"))} → ${out} leads out of ${tildePath(root)}: follow it?`);
    // Outside home: agents will see what's followed, said over the answers.
    expect(o.items.map((i) => i.label)).toEqual([
      `${out} is outside your home folder: agents see what's followed — search, the context bundle, the command line`,
      "Follow it",
      "Just look",
      "No",
    ]);
    await h.keys("f");
    await h.app.following.settled();
    expect(h.app.graph.notes.has("data/far.md")).toBe(true);
    expect(h.app.graph.backlinks("data/far.md").map((b) => b.from)).toEqual(["index.md"]);
    expect(h.app.explorer.expanded.has("data")).toBe(true);
    expect(h.app.following.describe(row(h, "data")!)).toBe(`→ ${out}`);
    expect(h.app.explorer.rows().some((r) => r.path === "data/far.md")).toBe(true);
    // Followed, it opens as the vault's: read and indexed, never written to — it's outside the vault.
    h.app.open("data/far.md");
    expect(h.app.view!.buf.rel).toBe("data/far.md");
    expect(h.app.writeBuffer(h.app.view!.buf, "# Changed\n")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("resolves outside the vault");
    expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Far\n\nFrom far away.\n");
  });

  test("just look: read-only, this once, nothing indexed; no: not followed, asked again when it's opened", async () => {
    const { root, link } = linked();
    const h = await harness({ root, open: "index.md" });
    // A note through the link, followed from a note: asked first.
    await h.keys("tab", "enter");
    expect((h.app.overlay as ListOverlay).title).toContain("leads out of");
    await h.keys("n");
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(linkAnswer(link)).toBe("no");
    expect(h.app.following.describe(row(h, "data")!)).toContain("not followed");
    // Asked again, opened again; just looked at: read-only, never the vault's.
    await h.keys("enter");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("l");
    expect(h.app.view!.buf.abs).toBe(join(link, "far.md"));
    expect(h.app.view!.buf.readOnly).toBe(`just looking: ${tildePath(link)} isn't followed — read-only`);
    expect(h.app.graph.notes.has("data/far.md")).toBe(false);
    // The folder unfolds, listed a level at a time; nothing asked while you look.
    select(h, "data");
    await h.keys("l");
    expect(h.app.overlay).toBeNull();
    expect(h.app.explorer.rows().some((r) => r.path === join(link, "far.md"))).toBe(true);
    expect(h.app.following.describe(row(h, "data")!)).toContain("just looking");
    // Gone into another vault: what was looked at is behind you.
    h.app.vaults.switchVault(locateVault({ root: makeVault() }), null);
    expect(h.app.following.looking.size).toBe(0);
  });

  test("a note just looked at through a link: not the vault's, read-only, while it's looked at; the link followed, the vault's and writable (#13)", async () => {
    const { root, link, out } = linked();
    const h = await harness({ root, open: "index.md" });
    await h.keys("tab", "enter");
    await h.keys("l");
    const far = h.app.view!.buf;
    expect([far.abs, far.rel, far.throughLink]).toEqual([join(link, "far.md"), null, true]);
    // Still looked at, the vault built again: not the vault's.
    await h.app.run("vault.reindex");
    expect([far.rel, far.readOnly]).toEqual([null, `just looking: ${tildePath(link)} isn't followed — read-only`]);
    // Forgotten, then followed as the question answers it: the same buffer, the vault's note, writable.
    h.app.following.forget(link);
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    expect(h.app.graph.notes.has("data/far.md")).toBe(true);
    expect([far.rel, far.readOnly, far.throughLink]).toEqual(["data/far.md", null, false]);
  });

  test("a vault: a note too big to index, looked at through a link, then followed: still read-only, never written out of the vault (VV-D6, #13)", async () => {
    const { root, link, out } = linked();
    writeFileSync(join(out, "far.md"), `# Far\n\n${"A long line of a big note. ".repeat(40)}\n`);
    const h = await harness({ root, open: "index.md", config: (c) => (c.walk.max_file_size = 500) });
    await h.keys("tab", "enter");
    await h.keys("l");
    const far = h.app.view!.buf;
    expect(far.throughLink).toBe(true);
    h.app.following.forget(link);
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    // Followed, but the vault doesn't take it (past walk.max_file_size): no vault path, so still read-only.
    expect(h.app.graph.notes.has("data/far.md")).toBe(false);
    expect([far.rel, far.throughLink]).toEqual([null, true]);
    expect(far.readOnly).not.toBeNull();
  });

  test("a link followed, its note open, then forgotten: read-only, nothing read through it; followed again, the window writable (#13)", async () => {
    const { root, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md" });
    expect(h.app.graph.notes.has("data/far.md")).toBe(true);
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    expect([far.rel, far.readOnly]).toEqual(["data/far.md", null]);
    h.app.following.forget(link);
    expect(far.readOnly).toContain("isn't followed now");
    // Changed out there while forgotten: the poll reads nothing through the link.
    writeFileSync(join(out, "far.md"), "# Far\n\nChanged out there.\n");
    expect(h.app.watch.poll()).toBe(false);
    expect(far.source).toBe("# Far\n\nFrom far away.\n");
    // Followed again, as the question answers it: the vault walked through it, the window read again and writable.
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    expect([far.rel, far.readOnly, far.throughLink]).toEqual(["data/far.md", null, false]);
    expect(far.source).toBe("# Far\n\nChanged out there.\n");
  });

  test("a link followed, then forgotten, news of its note heard late: nothing read or indexed through it, still read-only (#13)", async () => {
    const { root, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    h.app.following.forget(link);
    const said = far.readOnly;
    expect(said).toContain("isn't followed now");
    // No longer the vault's: nothing polls or indexes it through the link.
    expect(far.rel).toBeNull();
    // A change heard before it was forgotten, said after: neither the graph nor the window takes it.
    const updated = spyOn(h.app.graph, "updateFile");
    h.app.watch.applyChanges({ changes: [{ rel: "data/far.md", kind: "changed", isNote: true }], rescan: false });
    expect(updated).not.toHaveBeenCalled();
    updated.mockRestore();
    expect([far.readOnly, far.throughLink]).toEqual([said, true]);
    writeFileSync(join(out, "far.md"), "# Far\n\nChanged out there.\n");
    h.app.watch.applyChanges({ changes: [{ rel: "data/far.md", kind: "changed", isNote: true }], rescan: false });
    expect([far.source, far.readOnly]).toEqual(["# Far\n\nFrom far away.\n", said]);
  });

  test("a link followed, its note edited, then forgotten: its unsaved text never written through it (VV-D6, #13)", async () => {
    const { root, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    far.edit(0, 0, "Typed. ");
    h.app.following.forget(link);
    // Neither saved nor autosaved, nor a task toggled: a vault never writes out of itself, and the link isn't followed.
    expect(h.app.saving.save(far)).toBe(false);
    h.app.saving.autosave();
    expect(h.app.writeBuffer(far, "# Far\n\nToggled.\n")).toBe(false);
    expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Far\n\nFrom far away.\n");
    expect(h.app.messages.at(-1)?.text).toContain("data/far.md not written: ");
  });

  test("home: a link out of it followed, its note edited, then forgotten: its unsaved text never written through it (VV-D6, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "homelinks-")));
    const home = join(top, "home");
    const out = join(top, "out");
    mkdirSync(home);
    mkdirSync(out);
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(out, "far.md"), "# Far\n\nFrom far away.\n");
    symlinkSync(out, join(home, "data"));
    const link = join(home, "data");
    setLinkAnswer(link, "follow");
    await probe(out);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      h.app.open(join(link, "far.md"));
      const far = h.app.view!.buf;
      far.edit(0, 0, "Typed. ");
      h.app.following.forget(link);
      h.app.saving.autosave();
      expect(h.app.saving.save(far)).toBe(false);
      expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Far\n\nFrom far away.\n");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a vault's followed link to a note too big to index, opened: never written out of the vault (VV-D6, #13)", async () => {
    const { root, link, out } = linked();
    const big = `# Far\n\n${"A long line of a big note. ".repeat(40)}\n`;
    writeFileSync(join(out, "far.md"), big);
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md", config: (c) => (c.walk.max_file_size = 500) });
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    expect(far.rel).toBeNull();
    far.edit(0, 0, "Typed. ");
    expect(h.app.saving.save(far)).toBe(false);
    expect(h.app.messages.at(-1)?.text).toContain("resolves outside the vault");
    expect(readFileSync(join(out, "far.md"), "utf8")).toBe(big);
  });

  test("home: a note looked at through a link, followed, its target not answering: still read-only, the poll lifts nothing (VV-D6, #13)", async () => {
    // Root reads any folder: a target that won't list is only so for others.
    if (process.getuid?.() === 0) return;
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "homelinks-")));
    const home = join(top, "home");
    const out = join(top, "out");
    mkdirSync(home);
    mkdirSync(out);
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(out, "far.md"), "# Far\n\nFrom far away.\n");
    symlinkSync(out, join(home, "data"));
    const link = join(home, "data");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      h.app.following.looking.add(linkKey(link));
      h.app.open(join(link, "far.md"));
      const far = h.app.view!.buf;
      expect(far.throughLink).toBe(true);
      // The target lists nothing (its file still read and written): asked, it doesn't answer.
      chmodSync(out, 0o300);
      try {
        h.app.following.answer(link, out, "follow");
        await h.app.following.settled();
        expect(h.app.messages.at(-1)?.text).toContain("not followed for now");
        h.app.watch.poll();
        expect([far.throughLink, far.readOnly]).toEqual([
          true,
          `just looking: ${tildePath(link)} isn't followed — read-only`,
        ]);
        far.edit(0, 0, "Typed. ");
        expect(h.app.saving.save(far)).toBe(false);
        expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Far\n\nFrom far away.\n");
      } finally {
        chmodSync(out, 0o755);
      }
    } finally {
      process.env.HOME = before;
    }
  });

  test("a note looked at through a file link, the link made a note of the vault's own: indexed, and the window its note (VV-D6, #13)", async () => {
    const top = realpathSync(mkdtempSync(join(sandbox, "links-")));
    const root = join(top, "vault");
    const out = join(top, "out");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(out);
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](far.md)\n");
    writeFileSync(join(out, "far.md"), "# Far\n");
    symlinkSync(join(out, "far.md"), join(root, "far.md"));
    const h = await harness({ root, open: "index.md" });
    h.app.following.looking.add(linkKey(join(root, "far.md")));
    h.app.open("far.md");
    const far = h.app.view!.buf;
    expect(far.throughLink).toBe(true);
    // The link replaced by a note of the vault's own, as an editor or git would: the watcher's news of it taken.
    rmSync(join(root, "far.md"));
    writeFileSync(join(root, "far.md"), "# Far, here now\n");
    h.app.watch.applyChanges({ changes: [{ rel: "far.md", kind: "created", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("far.md")).toBe(true);
    h.app.watch.poll();
    expect([far.source, far.rel, far.throughLink, far.readOnly]).toEqual(["# Far, here now\n", "far.md", false, null]);
  });

  test("a link followed, its note open, then forgotten: a task toggled in it reads nothing through the link (VV-D6, #13)", async () => {
    const { root, link, out } = linked();
    writeFileSync(join(out, "far.md"), "# Far\n\n- [ ] one\n");
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    h.app.following.forget(link);
    writeFileSync(join(out, "far.md"), "# Far\n\n- [ ] one\n- [ ] changed out there\n");
    h.app.views.toggleTaskAt(h.app.view!, { line: 3, end: 3, checked: false });
    expect(far.source).toBe("# Far\n\n- [ ] one\n");
    expect(h.app.messages.at(-1)?.text).toContain("not toggled");
  });

  test("a link followed, its note edited, forgotten, changed out there: saved or autosaved, nothing read through the link to compare (VV-D6, #13)", async () => {
    const { root, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open data/far.md");
    const far = h.app.view!.buf;
    far.edit(0, 0, "Typed. ");
    h.app.following.forget(link);
    // Autosave leaves it be, saying nothing: the window says why it's read-only.
    const said = h.app.messages.length;
    h.app.saving.autosave();
    expect(h.app.messages.length).toBe(said);
    writeFileSync(join(out, "far.md"), "# Far\n\nChanged out there.\n");
    // No conflict asked about, however it comes: theirs would be read through the link.
    h.app.saving.autosave();
    h.app.saving.conflictPrompt(far);
    expect(h.app.overlay).toBeNull();
    expect(h.app.saving.save(far)).toBe(false);
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)?.text).toContain("data/far.md not written: ");
    expect([far.source, far.dirty]).toEqual(["Typed. # Far\n\nFrom far away.\n", true]);
  });

  test("Elsewhere: a note just looked at through a link, the link forgotten, then followed: writable again (VV-D3, #13)", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "plain-")));
    const plain = join(top, "plain");
    const out = join(top, "out");
    mkdirSync(plain);
    mkdirSync(out);
    writeFileSync(join(plain, "a.md"), "# A\n");
    writeFileSync(join(out, "far.md"), "# Far\n");
    symlinkSync(out, join(plain, "data"));
    const link = join(plain, "data");
    const h = await harness({ loc: elsewhereAt(plain), open: null });
    h.app.open(join(link, "far.md"));
    expect((h.app.overlay as ListOverlay).title).toContain("follow it?");
    await h.keys("l");
    const far = h.app.view!.buf;
    expect([far.readOnly, far.throughLink]).toEqual([
      `just looking: ${tildePath(link)} isn't followed — read-only`,
      true,
    ]);
    h.app.following.forget(link);
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    expect([far.readOnly, far.throughLink]).toEqual([null, false]);
  });

  test("Elsewhere: a note looked at through a link, changed by an agent, then followed: read again at once, writable (VV-D3, #13)", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "plain-")));
    const plain = join(top, "plain");
    const out = join(top, "out");
    mkdirSync(plain);
    mkdirSync(out);
    writeFileSync(join(plain, "a.md"), "# A\n");
    writeFileSync(join(out, "far.md"), "# Far\n");
    symlinkSync(out, join(plain, "data"));
    const link = join(plain, "data");
    const h = await harness({ loc: elsewhereAt(plain), open: null });
    h.app.open(join(link, "far.md"));
    await h.keys("l");
    const far = h.app.view!.buf;
    expect(far.throughLink).toBe(true);
    // Nothing reads it through the link while it's only looked at: an agent's change waits.
    writeFileSync(join(out, "far.md"), "# Far\n\nRewritten by an agent.\n");
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    // Followed: read again before it takes typing (no poll yet), never writable showing what's no longer there.
    expect([far.source, far.readOnly, far.throughLink]).toEqual(["# Far\n\nRewritten by an agent.\n", null, false]);
  });

  test("Elsewhere: a link followed, the others not: a note forgotten, or one looked at, changed by an agent, still not read through theirs (VV-D6, #13)", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "plain-")));
    const plain = join(top, "plain");
    mkdirSync(plain);
    writeFileSync(join(plain, "a.md"), "# A\n");
    for (const d of ["forgot", "looked", "one", "two"]) {
      mkdirSync(join(top, d));
      writeFileSync(join(top, d, `${d}.md`), `# ${d}\n`);
      symlinkSync(join(top, d), join(plain, d));
    }
    const changed = (d: string) => writeFileSync(join(top, d, `${d}.md`), `# ${d}\n\nRewritten by an agent.\n`);
    const follow = async (d: string) => {
      h.app.following.answer(join(plain, d), join(top, d), "follow");
      await h.app.following.settled();
    };
    setLinkAnswer(join(plain, "forgot"), "follow");
    const h = await harness({ loc: elsewhereAt(plain), open: null });
    // Followed, open, then forgotten; another link followed, nothing looked at.
    h.app.open(join(plain, "forgot", "forgot.md"));
    const forgot = h.app.view!.buf;
    h.app.following.forget(join(plain, "forgot"));
    changed("forgot");
    await follow("one");
    expect([forgot.source, forgot.throughLink]).toEqual(["# forgot\n", true]);
    // One looked at; another followed.
    h.app.open(join(plain, "looked", "looked.md"));
    await h.keys("l");
    const looked = h.app.view!.buf;
    changed("looked");
    await follow("two");
    expect([looked.source, looked.throughLink, forgot.source]).toEqual(["# looked\n", true, "# forgot\n"]);
  });

  test("Elsewhere: a link followed, typed into, forgotten, changed by an agent, followed again: the conflict prompt asks at once (VV-D3, 5.5, #13)", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const top = realpathSync(mkdtempSync(join(sandbox, "plain-")));
    const plain = join(top, "plain");
    const out = join(top, "out");
    mkdirSync(plain);
    mkdirSync(out);
    writeFileSync(join(plain, "a.md"), "# A\n");
    writeFileSync(join(out, "far.md"), "# Far\n");
    symlinkSync(out, join(plain, "data"));
    const link = join(plain, "data");
    setLinkAnswer(link, "follow");
    const h = await harness({ loc: elsewhereAt(plain), open: null });
    h.app.open(join(link, "far.md"));
    const far = h.app.view!.buf;
    far.edit(0, 0, "Typed. ");
    h.app.following.forget(link);
    writeFileSync(join(out, "far.md"), "# Far\n\nRewritten by an agent.\n");
    h.app.following.answer(link, out, "follow");
    await h.app.following.settled();
    // Writable again, yours kept, and asked now which to keep — not at the next poll.
    expect([far.readOnly, far.throughLink, far.source]).toEqual([null, false, "Typed. # Far\n"]);
    expect((h.app.overlay as ListOverlay | null)?.title).toEndWith(
      "far.md changed on disk, and you have unsaved changes",
    );
  });

  test("a followed link's target asked at the start, in the background: walked once it answers", async () => {
    const { root, link, out } = linked();
    setLinkAnswer(link, "follow");
    // Started as slipbox starts, watching: the graph built before its target is asked, the walk not going through.
    const h = await harness({ root, open: "index.md", watch: true });
    try {
      expect(h.app.graph.notes.has("data/far.md")).toBe(false);
      expect(h.app.following.describe(row(h, "data")!)).toBe(`→ ${out}  not answering`);
      await h.app.following.settled();
      expect(h.app.graph.notes.has("data/far.md")).toBe(true);
      expect(h.app.following.describe(row(h, "data")!)).toBe(`→ ${out}`);
    } finally {
      h.app.watcher?.close();
    }
  });

  test(":e naming a note through a link not followed asks first: never made the vault's unasked", async () => {
    const { root } = linked();
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open data/far.md");
    expect((h.app.overlay as ListOverlay).title).toContain("leads out of");
    expect(h.app.graph.notes.has("data/far.md")).toBe(false);
    expect(h.app.view!.buf.rel).toBe("index.md");
  });

  test("a link that leads elsewhere now is asked about again; a session's tab through one isn't read", async () => {
    const { top, root, link } = linked();
    setLinkAnswer(link, "follow");
    await probe(join(top, "out"));
    const h = await harness({ root, open: "index.md" });
    expect(h.app.graph.notes.has("data/far.md")).toBe(true);
    // A pull pointed it elsewhere.
    mkdirSync(join(top, "other"));
    writeFileSync(join(top, "other", "far.md"), "# Other\n");
    rmSync(link);
    symlinkSync(join(top, "other"), link);
    await h.app.run("vault.reindex");
    expect(h.app.graph.notes.has("data/far.md")).toBe(false);
    expect(h.app.buffer("data/far.md")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe(
      `${tildePath(link)} → ${join(top, "other")} isn't followed — open it to choose`,
    );
    h.app.open("data/far.md");
    expect((h.app.overlay as ListOverlay).title).toContain(`→ ${join(top, "other")} leads out of`);
  });

  test("within the vault, a second name: never asked about; a folder's, opened, shows the folder it names", async () => {
    const root = makeVault();
    symlinkSync(join(root, "notes"), join(root, "again"));
    const h = await harness({ root, open: "index.md" });
    expect(row(h, "again")?.link).toMatchObject({ dir: true });
    expect(h.app.following.describe(row(h, "again")!)).toBe(`→ ${tildePath(join(root, "notes"))}`);
    select(h, "again");
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("again is a second name for notes");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe("notes");
  });

  test("home writes through a link it follows, and reads nothing through one it doesn't", async () => {
    const { root, link, out } = linked();
    const before = process.env.HOME;
    process.env.HOME = root; // the folder is home: its link leads out of home
    try {
      setLinkAnswer(link, "follow");
      await probe(out);
      const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const h = await harness({ loc: homeAt(root), open: null });
      const buf = h.app.buffer(join(link, "far.md"))!;
      expect(buf.readOnly).toBeNull();
      expect(h.app.writeBuffer(buf, "# Written\n")).toBe(true);
      expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Written\n");
      // Said no: nothing read through it.
      setLinkAnswer(link, "no");
      writeFileSync(join(out, "more.md"), "# More\n");
      expect(h.app.buffer(join(link, "more.md"))).toBeNull();
    } finally {
      process.env.HOME = before;
    }
  });

  test("a rename moves nothing out of a followed link's target, and its relinking leaves a note there as it is", async () => {
    const { root, out, link } = linked();
    const before = process.env.HOME;
    process.env.HOME = mkdtempSync(join(sandbox, "home-")); // a home of the test's own
    try {
      writeFileSync(join(out, "x.md"), "# X\n\n[i](../index.md)\n");
      setLinkAnswer(link, "follow");
      await probe(out);
      const h = await harness({ root, open: "index.md" });
      expect(h.app.graph.notes.has("data/far.md")).toBe(true);
      h.app.renaming.noteTo("data/far.md", "moved.md");
      expect(h.app.overlay).toBeNull();
      expect(h.app.messages.at(-1)!.text).toBe("data/far.md resolves outside the vault");
      expect(existsSync(join(out, "far.md"))).toBe(true);
      expect(existsSync(join(root, "moved.md"))).toBe(false);
      // The vault's own note renamed: the note out there that links to it is left, and the preview says so.
      h.app.renaming.noteTo("index.md", "home.md");
      expect((h.app.overlay as ListOverlay).items.map((i) => `${i.label} ${i.detail ?? ""}`)).toContain(
        "skipped data/x.md:3 a link leads it out of the vault: not rewritten",
      );
      await h.keys("enter");
      expect(existsSync(join(root, "home.md"))).toBe(true);
      expect(readFileSync(join(out, "x.md"), "utf8")).toBe("# X\n\n[i](../index.md)\n");
    } finally {
      process.env.HOME = before;
    }
  });

  test("the symlinks answered, listed with where they lead and what was said; one forgotten asks again, and one followed is followed no more", async () => {
    const { top, root, out, link } = linked();
    const before = process.env.HOME;
    const state = process.env.XDG_STATE_HOME;
    process.env.HOME = mkdtempSync(join(sandbox, "home-")); // a home of the test's own
    process.env.XDG_STATE_HOME = mkdtempSync(join(sandbox, "state-")); // and answers of its own
    const { linkKey } = await import("../../../../src/core/workspace/vaults/symlinks.ts");
    mkdirSync(join(top, "other"));
    writeFileSync(join(top, "other", "o.md"), "# O\n");
    symlinkSync(join(top, "other"), join(root, "no"));
    mkdirSync(join(top, "seen"));
    symlinkSync(join(top, "seen"), join(root, "seen"));
    setLinkAnswer(link, "follow");
    setLinkAnswer(join(root, "no"), "no");
    await probe(out);
    const h = await harness({ root, open: "index.md", watch: true });
    try {
      await h.app.following.settled();
      h.app.following.looking.add(linkKey(join(root, "seen")));
      h.app.open("data/far.md");
      const far = h.app.view!.buf;
      expect(far.readOnly).toBeNull();
      const watched = () => (h.app.watcher as unknown as { watchers: Map<string, unknown> }).watchers.has("data");
      expect(watched()).toBe(true);
      await h.app.run("vault.links");
      const list = h.app.overlay as ListOverlay;
      expect(list.title).toBe("Symlinks you've answered (3) — enter forgets one: asked again when it's next opened");
      expect(list.items.map((i) => `${i.label}  ${i.detail}`).sort()).toEqual(
        [
          `${tildePath(link)} → ${out}  followed`,
          `${tildePath(join(root, "no"))} → ${join(top, "other")}  not followed`,
          `${tildePath(join(root, "seen"))} → ${join(top, "seen")}  just looking, this once`,
        ].sort(),
      );
      // Forgotten: followed no more, at once — out of the index, no longer watched, its open tab read-only, its row
      // marked — and asked again when it's opened.
      list.selected = list.items.findIndex((i) => i.detail === "followed");
      await h.keys("enter");
      expect(linkAnswer(link)).toBeNull();
      expect(h.app.messages.at(-1)!.text).toBe(
        `forgot ${tildePath(link)} → ${out} (followed): asked again when it's next opened`,
      );
      expect(h.app.graph.notes.has("data/far.md")).toBe(false);
      expect(watched()).toBe(false);
      expect(far.readOnly).toContain("isn't followed now — read-only");
      // Never read again through it: changed out there, the vault walked again, the tab keeps what it showed.
      writeFileSync(join(out, "far.md"), "# Changed out there\n");
      h.app.following.walkAgain();
      expect(far.source).toBe("# Far\n\nFrom far away.\n");
      expect(h.app.following.describe(h.app.explorer.rows().find((r) => r.name === "data")!)).toBe(
        `→ ${out}  not followed`,
      );
      h.app.open("data/far.md");
      expect((h.app.overlay as ListOverlay).title).toContain("leads out of");
      await h.keys("escape");
      // The others: forgotten, the "no" asks again, and the look is over.
      h.app.following.forget(join(root, "no"));
      h.app.following.forget(join(root, "seen"));
      expect(h.app.following.looking.size).toBe(0);
      await h.app.run("vault.links");
      expect(h.app.overlay).toBeNull();
      expect(h.app.messages.at(-1)!.text).toBe("no symlink answered yet: one leading out asks when it's first opened");
    } finally {
      h.app.watcher?.close();
      process.env.HOME = before;
      process.env.XDG_STATE_HOME = state;
    }
  });
});
