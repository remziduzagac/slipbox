// What follows a switch into another vault (`SwitchHow.after`), done once what it opens is in — read on the disk threads
// (SD-T5, SD-T9), the keys waiting for it — never for a read given up: a note made in a nested vault typed into, a
// data file's section gone to, a folder revealed. What waits is told by the hold (`Hold`), never by a clock (#75).

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { saveSession, type SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
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
    const inner = join(h.root, "nested-vault");
    mkdirSync(join(inner, "held"));
    writeFileSync(join(inner, "held", "a.md"), "aye\n");
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
    const other = makeVault();
    mkdirSync(join(other, "cfg"));
    writeFileSync(
      join(other, "cfg", "app.toml"),
      '# app\ntheme = "nord"\n\n[editor]\ncommand = "nvim"\n\n[ui]\nwrap = true\n',
    );
    const root = makeVault();
    const to = relative(root, join(other, "cfg", "app.toml"));
    writeFileSync(join(root, "to-config.md"), `# T\n\nThe [ui](${to}#ui) section.\n`);
    const h = await offThread(root, "to-config.md", true);
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.app.run("link.go");
    await answerSwitch(h);
    await settled(h);
    expect(h.app.loc.root).toBe(other);
    expect(h.app.view!.buf.rel).toBe("cfg/app.toml");
    expect(rowText(h)).toMatch(/ ui\s*$/); // its [ui] section's heading
  });

  test("a folder of another vault revealed: shown in the explorer once its own note, or the tab it kept, is in", async () => {
    const tab = (path: string): SessionTab => ({ panes: [{ path }], active: 0 }) as SessionTab;
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

  test("held: what follows a switch, waiting for the tabs read behind, isn't done in a vault gone into meanwhile", async () => {
    const tab = (path: string): SessionTab => ({ panes: [{ path }], active: 0 }) as SessionTab;
    const other = makeVault();
    mkdirSync(join(other, "held"));
    writeFileSync(join(other, "held", "a.md"), "aye\n");
    // The tab shown gone since: the one behind it read in the background, held, before the vault's own note would open.
    saveSession(rootAt(other), { version: 1, tabs: [tab("gone.md"), tab("held/a.md")], activeTab: 0, sidebar: true });
    const h = await offThread();
    const held = holding(() => false);
    let after = 0;
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true, after: () => after++ });
    await untilHeld(held);
    // The keys free: the read behind is no key's.
    expect([h.app.reads.busy, after]).toEqual([false, 0]);
    h.app.vaults.switchVault(rootAt(makeVault()), null, undefined, { asked: true });
    held.release();
    await settled(h);
    expect(after).toBe(0);
    expect(held.gaveUp).toBe(0);
  });
});
