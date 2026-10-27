import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("blame and a file's history (26.4, 22.1)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder().decode(
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=Ann", "-C", cwd, ...args]).stdout,
    );
  /** A root whose note was renamed and changed: three commits. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "blame-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "old.md"), "one\n\ntwo\n");
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "First", "-m", "Why it began.");
    git(root, "mv", "old.md", "new.md");
    git(root, "commit", "-q", "-m", "Renamed");
    writeFileSync(join(root, "new.md"), "one\n\nTWO\n");
    git(root, "commit", "-q", "-am", "Shout two");
    return git(root, "rev-parse", "HEAD") ? root : null;
  };

  test("delayed history, blame and version reads leave timers running and discard changed revisions", async () => {
    const root = repo();
    if (!root) return;
    const real = Bun.which("git")!;
    const h = await harness({ root, open: "new.md", width: 120, height: 40 });
    const folder = mkdtempSync(join(sandbox, "slow-history-"));
    writeFileSync(join(folder, "git"), `#!/bin/sh\nsleep 0.08\nexec '${real.replaceAll("'", "'\\''")}' "$@"\n`);
    chmodSync(join(folder, "git"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${folder}:${path}`;
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    try {
      await h.app.run("git.history");
      expect(ticks).toBeGreaterThan(1);
      const before = ticks;
      await h.keys("enter");
      expect(ticks).toBeGreaterThan(before + 1);
      await h.keys("escape");
      const blaming = ticks;
      await h.app.run("git.blame");
      expect(ticks).toBeGreaterThan(blaming + 1);
      await h.keys("escape");
      const pending = h.app.run("git.history");
      h.app.view!.buf.edit(0, 0, "changed\n");
      await pending;
      expect(h.app.overlay).toBeNull();
    } finally {
      clearInterval(timer);
      process.env.PATH = path;
    }
  });

  test("who changed the cursor's line: the commit, author, date, message; a line changed since: not committed yet", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "new.md", width: 120, height: 40 });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.keys("g", "g");
    await h.app.run("git.blame");
    expect(h.app.floating?.kind).toBe("hover");
    const said = h.app.floating!.view.buf.source;
    expect(said).toMatch(/^\*\*[0-9a-f]{8}\*\* · Ann · \d{4}-\d{2}-\d{2}\n\n```text\nFirst\n\nWhy it began\.\n```/);
    expect(h.app.floating!.title).toMatch(/^line 1, last changed in [0-9a-f]{8}$/);
    await h.keys("escape");
    // Line 3: its last commit; a line added above it moves nothing.
    h.app.view!.buf.edit(0, 0, "zero\n");
    await h.app.run("cursor.goto_line 4");
    await h.app.run("git.blame");
    expect(h.app.floating!.view.buf.source).toContain("Shout two");
    await h.keys("escape");
    await h.app.run("cursor.goto_line 1");
    await h.app.run("git.blame");
    expect(h.app.messages.at(-1)?.text).toBe("line 1 is changed since the last commit: not committed yet");
  });

  test("the history: commits newest first, through the rename; one read as it was, or its diff to now", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "new.md", width: 120, height: 40 });
    await h.app.run("git.history");
    const list = () => h.app.overlay as ListOverlay;
    expect(list().title).toBe("new.md — 3 commits: enter, read it or its diff to now");
    expect(list().items.map((i) => i.label.slice(8))).toEqual(["Shout two", "Renamed", "First"]);
    expect(list().items[2]!.detail).toMatch(/^Ann · \d{4}-\d{2}-\d{2} · as old\.md$/);
    // The first: read as it was.
    await h.keys("down", "down", "enter");
    expect(list().items.map((i) => i.label)).toEqual(["Read it as it was", "Its diff to the text now"]);
    await h.keys("enter");
    expect(h.app.floating!.view.buf.source).toBe("one\n\ntwo\n");
    expect(h.app.floating!.title).toMatch(/^old\.md at [0-9a-f]{7} \(\d{4}-\d{2}-\d{2}\), read-only$/);
    await h.keys("escape");
    await h.app.run("git.history");
    await h.keys("down", "down", "enter", "down", "enter");
    // Its blocks before and after, as a note's diff has them, in the diff window (GIT-D2): a word rewritten whole, the
    // paragraph removed and added; the line of text before it shown.
    expect(h.app.floating?.kind).toBe("diff");
    expect(h.app.floating!.view.buf.source.split("\n")).toEqual(["@@ line 1", "  one", "- two", "+ TWO"]);
  });

  test("a version read as it was is read-only: typing, deleting, pasting there change nothing, and say so (regression)", async () => {
    // Found trying 22.1 live (2026-10-10): `A` in the floating window, titled read-only, took typing and was unsaved.
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "new.md", width: 120, height: 40 });
    await h.app.run("git.history");
    await h.keys("down", "down", "enter", "enter");
    const fv = h.app.floating!.view;
    expect(fv.buf.source).toBe("one\n\ntwo\n");
    // Each refused, so what would be typed after never lands: insert's keys, rendered; then in source mode (ctrl+k)
    // a delete, a line's delete, a paste too.
    const refused = async (keys: string[]) => {
      await h.keys(...keys);
      expect(h.app.floating?.view).toBe(fv);
      expect([fv.buf.source, fv.buf.dirty, fv.insert ?? false]).toEqual(["one\n\ntwo\n", false, false]);
      expect(h.app.messages.at(-1)?.text).toStartWith("the floating window is read-only");
    };
    for (const keys of [["A"], ["i"], ["o"]]) await refused(keys);
    await h.keys("ctrl+k");
    expect(fv.source).toBe(true);
    for (const keys of [["A"], ["i"], ["o"], ["x"], ["d", "d"], ["p"]]) await refused(keys);
  });
});
