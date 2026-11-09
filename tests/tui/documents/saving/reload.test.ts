import { describe, expect, test } from "bun:test";
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 1 (TUI)", () => {
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  const source = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    const file = join(root, "r.md");
    writeFileSync(file, text);
    const h = await harness({ root, open: "r.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    const at = (row: number, col: number) => h.app.moveCursor(v, { row, col });
    const ex = (cmd: string) => h.keys(":", ...[...cmd].map((ch) => (ch === " " ? "space" : ch)), "enter");
    return { h, v, at, ex, file, root };
  };
  test("a change on disk while typing waits for esc: typed letters never pick l, k, d or m", async () => {
    const { h, v, file } = await source("mine\n");
    await h.keys("shift+a", "space", "h", "e");
    await touch(file, "theirs\n");
    h.app.watch.reloadBuffer(v.buf);
    expect(h.app.overlay).toBeNull();
    await h.keys("l", "l", "o");
    expect(v.buf.source).toBe("mine hello\n");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull(); // not on the esc: a second one (closing the lens) would dismiss it
    await h.keys("0");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
  });
  test("the watcher saying an open note came, its file as it was read (a folder it only now watches): nothing asked, nothing reloaded (#73)", async () => {
    const { h, v, file } = await source("mine\n");
    await h.keys("shift+a", "!", "escape");
    h.app.watch.applyChanges({ changes: [{ rel: "r.md", kind: "created", isNote: true }], rescan: false });
    expect(h.app.overlay).toBeNull();
    expect(v.buf.source).toBe("mine!\n");
    expect(v.buf.dirty).toBe(true);
    // Saved, then said again: not read again either.
    await h.keys("ctrl+s");
    h.app.watch.applyChanges({ changes: [{ rel: "r.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.messages.some((m) => m.text.includes("reloaded"))).toBe(false);
    // Changed there since: asked.
    await h.keys("shift+a", "?", "escape");
    await touch(file, "theirs\n");
    h.app.watch.applyChanges({ changes: [{ rel: "r.md", kind: "changed", isNote: true }], rescan: false });
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
  });
  test("a conflict kept, its file put back as the note was read: kept no more, as a reload leaves it (#73)", async () => {
    const { h, v, file } = await source("mine\n");
    const changed = () =>
      h.app.watch.applyChanges({ changes: [{ rel: "r.md", kind: "changed", isNote: true }], rescan: false });
    // Changed there while typing: the prompt waits; put back, there's nothing left to ask.
    await h.keys("shift+a", "!");
    await touch(file, "theirs\n");
    changed();
    expect(v.buf.conflictWaiting).toBe(true);
    await touch(file, "mine\n");
    changed();
    expect(v.buf.conflictWaiting).toBe(false);
    // Changed again, yours kept, then undone: clean, the file put back — neither kept nor said to differ.
    await h.keys("escape");
    await touch(file, "theirs\n");
    changed();
    await h.keys("k");
    expect(v.buf.conflictKept).toBe(true);
    await h.keys("u");
    expect(v.buf.dirty).toBe(false);
    await touch(file, "mine\n");
    changed();
    expect(v.buf.conflictKept).toBe(false);
    expect(statusRow(h.frame())).not.toContain("differs from disk");
  });
  test("a file rewritten outside with a byte that isn't UTF-8 where it had U+FFFD: read again, never edited or saved over (#73)", async () => {
    const { h, v, file } = await source("a�\n");
    expect(v.buf.invalidUtf8).toBe(false);
    // The same text decoded: the invalid byte shows as U+FFFD too.
    writeFileSync(file, Buffer.from([0x61, 0xff, 0x0a]));
    const future = Date.now() / 1000 + 5;
    utimesSync(file, future, future);
    h.app.watch.applyChanges({ changes: [{ rel: "r.md", kind: "changed", isNote: true }], rescan: false });
    expect(v.buf.invalidUtf8).toBe(true);
    await h.keys("shift+a", "!", "escape", "ctrl+s");
    expect([...readFileSync(file)]).toEqual([0x61, 0xff, 0x0a]);
  });
});

describe("review cycle 4 (TUI)", () => {
  const until = async (pred: () => boolean, ms = 25_000) => {
    const end = Date.now() + ms;
    while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  };

  test("a burst of writes in one folder reloads every open note (the watcher re-reads the folder)", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: "notes/alpha.md",
      watch: true,
      config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    try {
      await h.keys("ctrl+w", "v");
      await h.app.run("note.open notes/beta.md");
      // The watch live first: macOS's starts a moment after it's asked for, and a write before then isn't seen.
      writeFileSync(join(root, "notes", "ready.md"), "# Ready\n");
      await until(() => h.app.graph.notes.has("notes/ready.md"));
      for (let i = 0; i < 30; i++) {
        writeFileSync(join(root, "notes", "alpha.md"), `# Alpha ${i}\n`);
        writeFileSync(join(root, "notes", "beta.md"), `# Beta ${i}\n`);
      }
      const texts = () => h.app.tab!.views.map((x) => x.buf.source).sort();
      await until(() => JSON.stringify(texts()) === JSON.stringify(["# Alpha 29\n", "# Beta 29\n"]));
      expect(texts()).toEqual(["# Alpha 29\n", "# Beta 29\n"]);
    } finally {
      h.app.quit();
    }
  });
  test("an agent's write landing right after a save is a change, not ours", async () => {
    const root = makeVault();
    const file = join(root, "r.md");
    writeFileSync(file, "start\n");
    const h = await harness({
      root,
      open: "r.md",
      watch: true,
      config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    try {
      const v = h.app.view!;
      const w = h.app.watcher!;
      const orig = w.noteOwnWrite.bind(w);
      w.noteOwnWrite = (rel, st) => {
        writeFileSync(file, "# AGENT\n"); // lands between the rename and the stamp
        orig(rel, st);
      };
      await h.keys("space", "n", "v", "shift+a", "x", "escape", "ctrl+s");
      w.noteOwnWrite = orig;
      expect(v.buf.changedOnDisk()).toBe(true);
    } finally {
      h.app.quit();
    }
  });
});
