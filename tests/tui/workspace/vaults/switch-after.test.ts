// What follows a switch into another vault (`SwitchHow.after`), done once what it opens is in — read on the disk threads
// (SD-T5, SD-T9), the keys waiting for it — never for a read given up, failed, or for a vault left since: a note made in
// a nested vault typed into, a data file's section gone to (in a peek too), a folder revealed. What waits is told by the
// hold (`Hold`), never by a clock (#75).

import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { saveSession, type SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { tildePath } from "../../../../src/core/workspace/vaults/names.ts";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { peekOf } from "../../../../src/tui/documents/navigation/peek/state.ts";
import { HELD_MS } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { answerSwitch, type Harness, harness, makeSandbox, makeVault, rowText } from "../../../tui-harness.ts";

makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** slipbox in `root`, its notes shown as source unless `rendered`, its key reads on the disk threads. */
async function offThread(root = makeVault(), open = "index.md", rendered = false): Promise<Harness> {
  const h = await harness({ root, open, width: 100, config: (c) => void (c.render.notes = rendered) });
  h.app.reads.offThread = true;
  return h;
}

/** A key handled, not awaited: it may wait on a read. */
const press = (h: Harness, key: string) => h.app.input.handleKey(key);

/** Once the vault gone into has its session read (SD-T9), and what it opens is in. */
async function settled(h: Harness): Promise<void> {
  await h.app.session.entering;
  await h.app.reads.settled();
  await h.app.session.behind;
  await h.app.reads.settled();
}

/** Awaited till `cond` holds, which no key waits for (a peek's read): said and thrown by HELD_MS. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!cond()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(5);
  }
}

/** A tab a session keeps, of the note at `path`. */
const tab = (path: string): SessionTab => ({ panes: [{ path }], active: 0 }) as SessionTab;

/** A vault with `held/a.md`: a read of it held on the disk threads. */
function withHeld(root = makeVault()): string {
  mkdirSync(join(root, "held"), { recursive: true });
  writeFileSync(join(root, "held", "a.md"), "aye\n");
  return root;
}

/** A note linking to the `[ui]` section of a data file at `rel` in another vault, open rendered, the cursor on the
 *  link. */
async function onSectionLink(rel: string): Promise<{ h: Harness; other: string }> {
  const other = makeVault();
  mkdirSync(dirname(join(other, rel)), { recursive: true });
  writeFileSync(join(other, rel), '# app\ntheme = "nord"\n\n[editor]\ncommand = "nvim"\n\n[ui]\nwrap = true\n');
  const root = makeVault();
  writeFileSync(join(root, "to-config.md"), `# T\n\nThe [ui](${relative(root, join(other, rel))}#ui) section.\n`);
  const h = await offThread(root, "to-config.md", true);
  const v = h.app.view!;
  const l = h.app.currentLayout(v).links[0]!;
  h.app.moveCursor(v, { row: l.line, col: l.col });
  return { h, other };
}

/** Whether the peek has its text. */
const peekRead = (h: Harness) => {
  const p = peekOf(h.app);
  return !!p && !p.unread;
};

const said = (h: Harness) => h.app.messages.map((m) => m.text).join("\n");

/** A read of `abs` on the disk threads, then a failure: as an open failing past its read would. */
const failingAfter = (abs: string) =>
  diskThreads()
    .read(abs, "key")
    .then(() => {
      throw new Error("no room");
    });

describe("what follows a switch, once what it opens is in", () => {
  test("held: a note made by ctrl+n in a nested vault is typed into once it's read there, the keys typed meanwhile in it", async () => {
    const h = await offThread();
    const inner = join(h.root, "nested-vault");
    await h.keys("ctrl+n");
    for (const c of "nested-vault/held/idea") await h.keys(c);
    // The disk threads held alone: the note is made here, the vault's session read on a thread.
    const held = holding(() => false);
    await h.keys("enter");
    await answerSwitch(h); // into the nested vault, asked (D270)
    await untilHeld(held);
    expect(h.app.loc.root).toBe(inner);
    expect(h.app.reads.busy).toBe(true);
    // Typed while it reads: they wait for it, and for its typing into.
    const typed = ["h", "i"].map((k) => press(h, k));
    held.release();
    await Promise.all(typed);
    await settled(h);
    const v = h.app.view!;
    expect(v.buf.abs).toBe(join(inner, "held", "idea.md"));
    expect(v.insert).toBe(true);
    expect(v.buf.source).toBe("# idea\n\nhi\n");
    expect(held.gaveUp).toBe(0);
  });

  test("held: esc while the note gone into for is read: what was to follow its open isn't done", async () => {
    const h = await offThread();
    const inner = withHeld(join(h.root, "nested-vault"));
    const held = holding(() => false);
    let after = 0;
    expect(h.app.vaults.intoOther(join(inner, "held", "a.md"), undefined, () => after++)).toBe(true);
    await answerSwitch(h);
    await untilHeld(held);
    // Taken at once, out of turn: the read given up before its answer.
    await press(h, "escape");
    held.release();
    await settled(h);
    expect(h.app.loc.root).toBe(inner);
    expect(h.app.buffers.has("held/a.md")).toBe(false);
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("ctrl+click on a link to a section of another vault's data file: gone into, at the section once it's read", async () => {
    const { h, other } = await onSectionLink("cfg/app.toml");
    await h.app.run("link.go");
    await answerSwitch(h);
    await settled(h);
    expect(h.app.loc.root).toBe(other);
    expect(h.app.view!.buf.rel).toBe("cfg/app.toml");
    expect(rowText(h)).toMatch(/ ui\s*$/); // its [ui] section's heading
  });

  test("held: ctrl+click on a link to a section of another vault's data file, peeked at when asked: at the section once it's read", async () => {
    const { h, other } = await onSectionLink("held/app.toml");
    const held = holding(() => false);
    await h.app.run("link.go");
    await answerSwitch(h, "p"); // Peek at it, read-only, nothing switched (D270)
    await untilHeld(held);
    held.release();
    await until(() => peekRead(h), "the peek's text");
    expect(h.app.loc.root).not.toBe(other);
    expect(peekOf(h.app)!.abs).toBe(join(other, "held", "app.toml"));
    expect(rowText(h)).toMatch(/ ui\s*$/);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a note made by ctrl+n in a nested vault, peeked at when asked: read there, read-only, nothing typed", async () => {
    const h = await offThread();
    await h.keys("ctrl+n");
    for (const c of "nested-vault/held/idea") await h.keys(c);
    const held = holding(() => false);
    await h.keys("enter");
    await answerSwitch(h, "p");
    await untilHeld(held);
    held.release();
    await until(() => peekRead(h), "the peek's text");
    expect(h.app.loc.root).toBe(h.root);
    expect(peekOf(h.app)!.abs).toBe(join(h.root, "nested-vault", "held", "idea.md"));
    expect(h.app.view!.insert).toBeFalsy();
    expect(said(h)).not.toContain("not editing");
    expect(held.gaveUp).toBe(0);
  });

  test("a folder of another vault revealed: shown in the explorer once its own note, or the tab it kept, is in", async () => {
    // Its own note; a tab it kept; a tab it kept, gone since: its own note, once the tabs behind are read. Read here at
    // once (a test's App, the last), after the rest of the switch.
    for (const [kept, opened, off] of [
      [null, "index.md", true],
      ["notes/beta.md", "notes/beta.md", true],
      ["gone.md", "index.md", true],
      ["notes/beta.md", "notes/beta.md", false],
    ] as const) {
      const other = makeVault();
      if (kept) saveSession(rootAt(other), { version: 1, tabs: [tab(kept)], activeTab: 0, sidebar: false });
      const h = await offThread();
      h.app.reads.offThread = off;
      h.app.explorer.revealFolder(join(other, "notes"));
      await answerSwitch(h);
      await settled(h);
      expect(h.app.loc.root).toBe(other);
      expect(h.app.view!.buf.rel).toBe(opened);
      const row = h.app.explorer.rows()[h.app.sidebar.selected]!;
      expect([h.app.region, h.app.sidebar.visible, h.app.explorer.rowAbs(row)]).toEqual([
        "sidebar",
        true,
        join(other, "notes"),
      ]);
    }
  });

  test("held: what follows a switch, waiting for the tabs read behind, isn't done once a key was taken since", async () => {
    for (const typed of [true, false]) {
      // The tab shown gone since: the one behind it read in the background, held, before the vault's own note opens.
      const other = withHeld();
      saveSession(rootAt(other), { version: 1, tabs: [tab("gone.md"), tab("held/a.md")], activeTab: 0, sidebar: true });
      const h = await offThread();
      const held = holding(() => false);
      let after = 0;
      h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true, after: () => after++ });
      await untilHeld(held);
      // The keys free: the read behind is no key's; one typed meanwhile acts at once.
      expect([h.app.reads.busy, after]).toEqual([false, 0]);
      if (typed) await press(h, "j");
      held.release();
      await settled(h);
      expect(h.app.view!.buf.rel).toBe("held/a.md");
      expect({ typed, after }).toEqual({ typed, after: typed ? 0 : 1 });
      expect(held.gaveUp).toBe(0);
    }
  });

  test("held: what follows a switch, waiting for the tabs read behind, isn't done in a vault gone into meanwhile", async () => {
    // The tab shown gone since: the one behind it read in the background, held, before the vault's own note would open.
    const other = withHeld();
    saveSession(rootAt(other), { version: 1, tabs: [tab("gone.md"), tab("held/a.md")], activeTab: 0, sidebar: true });
    const h = await offThread();
    const held = holding(() => false);
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    expect([h.app.reads.busy, after]).toEqual([false, 0]);
    h.app.vaults.switchVault(rootAt(makeVault()), null, undefined, { asked: true });
    held.release();
    await settled(h);
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a switch's note waiting for the tab shown, the vault left meanwhile: not opened, nor followed, in the one gone into", async () => {
    const other = withHeld();
    saveSession(rootAt(other), { version: 1, tabs: [tab("held/a.md")], activeTab: 0, sidebar: true });
    const h = await offThread();
    const held = holding(() => false);
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), join(other, "index.md"), undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    // The keys wait for the tab shown: gone into another vault meanwhile by no key.
    expect(h.app.reads.busy).toBe(true);
    const third = makeVault();
    h.app.vaults.switchVault(rootAt(third), null, undefined, { asked: true });
    held.release();
    await settled(h);
    expect(h.app.loc.root).toBe(third);
    // Not the vault left's note opened here, which would ask to go back into it.
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: slipbox quitting as the switch's note is read: what was to follow it isn't done", async () => {
    const h = await offThread();
    const inner = withHeld(join(h.root, "nested-vault"));
    const held = holding(() => false);
    let after = 0;
    h.app.vaults.switchVault(rootAt(inner), join(inner, "held", "a.md"), undefined, {
      asked: true,
      after: () => after++,
    });
    await untilHeld(held);
    // Quitting as the read answers: `App.quit` lets the threads go first; here they answer all the same.
    h.app.quitting = true;
    held.release();
    await settled(h);
    h.app.quitting = false;
    expect(h.app.view!.buf.rel).toBe("held/a.md");
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: the switch's note failing as it's opened: said, and what was to follow it isn't done", async () => {
    const h = await offThread();
    const other = withHeld();
    const held = holding(() => false);
    spyOn(h.app, "openInNewTab").mockImplementation(() => h.app.reads.hold(failingAfter(join(other, "held", "a.md"))));
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), join(other, "index.md"), undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    expect([h.app.reads.busy, after]).toEqual([true, 0]);
    held.release();
    await settled(h);
    expect(said(h)).toContain(`${tildePath(join(other, "index.md"))} couldn't be opened (no room)`);
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: the vault's own note failing as it's opened: said, and what follows the switch done all the same", async () => {
    const h = await offThread();
    const other = withHeld();
    const held = holding(() => false);
    spyOn(h.app, "openInNewTab").mockImplementation(() => h.app.reads.hold(failingAfter(join(other, "held", "a.md"))));
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    expect([h.app.reads.busy, after]).toEqual([true, 0]);
    held.release();
    await settled(h);
    expect(said(h)).toContain(`${tildePath(other)}'s own note couldn't be opened (no room)`);
    expect(after).toBe(1);
    expect(held.gaveUp).toBe(0);
  });

  test("held: the tab shown failing as it's brought back: said, and the switch's note opened and followed all the same", async () => {
    const other = withHeld();
    saveSession(rootAt(other), { version: 1, tabs: [tab("held/a.md")], activeTab: 0, sidebar: true });
    const h = await offThread();
    const held = holding(() => false);
    const opening = h.app.bufferOpening;
    const load = opening.load.bind(opening);
    spyOn(opening, "load").mockImplementation((path, shownIn, background) =>
      path === "held/a.md" ? failingAfter(join(other, path)) : load(path, shownIn, background),
    );
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), join(other, "index.md"), undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    expect([h.app.reads.busy, after]).toEqual([true, 0]);
    held.release();
    await settled(h);
    expect(said(h)).toContain(`${tildePath(other)}'s tabs couldn't be opened (no room)`);
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(after).toBe(1);
    expect(held.gaveUp).toBe(0);
  });
});
