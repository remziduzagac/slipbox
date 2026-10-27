import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

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
