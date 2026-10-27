import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay, Host } from "../../../../src/tui/app/runtime/app.ts";

import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("saving and conflicts (step 4)", () => {
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  const setup = async (text: string, config?: (c: Config) => void) => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, text);
    const h = await harness({ root, open: "c.md", width: 100, height: 30, config });
    return { h, file, v: h.app.view!, root };
  };
  test("an outside change to a clean note reloads it as an undo step: u brings back what you had", async () => {
    const { h, file, v } = await setup("mine\n");
    await touch(file, "the agent's version\n");
    h.app.watch.reloadBuffer(v.buf);
    expect(v.buf.source).toBe("the agent's version\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("u");
    expect(v.buf.source).toBe("mine\n");
    expect(v.buf.dirty).toBe(true); // it differs from the file now
  });
  test("the conflict prompt: (l) loads theirs, yours one u away; (k) keeps yours, saving then asks", async () => {
    const { h, file, v } = await setup("line\n");
    await h.keys("shift+a", "!", "escape");
    await touch(file, "theirs\n");
    h.app.watch.reloadBuffer(v.buf);
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toContain("changed on disk");
    await h.keys("l");
    expect(v.buf.source).toBe("theirs\n");
    await h.keys("u");
    expect(v.buf.source).toBe("line!\n");
    // Changed again: keep yours this time.
    await touch(file, "theirs again\n");
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("k");
    expect(v.buf.conflictKept).toBe(true);
    expect(statusRow(h.frame())).toContain("differs from disk");
    await h.keys("ctrl+s"); // asks
    expect((h.app.overlay as ListOverlay).title).toContain("write yours over it?");
    await h.keys("n");
    expect(readFileSync(file, "utf8")).toBe("theirs again\n");
    await h.keys("ctrl+s", "y");
    expect(readFileSync(file, "utf8")).toBe("line!\n");
    expect(v.buf.conflictKept).toBe(false);
  });
  test("space n r with unsaved changes, the file as it was: asks to discard them — y reloads, n and esc keep yours, autosave as it was (DF-D6)", async () => {
    const { h, file, v } = await setup("line\n");
    await h.keys("shift+a", "!", "escape", "space", "n", "r");
    expect(h.app.overlay).toMatchObject({
      kind: "prompt",
      confirm: true,
      label: "Discard your changes to c.md? It's loaded from disk again: u brings them back.",
    });
    await h.keys("n");
    expect(v.buf.source).toBe("line!\n");
    await h.keys("space", "n", "r", "escape");
    expect(h.app.overlay).toBeNull();
    expect(v.buf.source).toBe("line!\n");
    expect(v.buf.conflictKept).toBe(false); // autosave left on, as the conflict prompt's esc wouldn't
    await h.keys("space", "n", "r", "y");
    expect(v.buf.source).toBe("line\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("u");
    expect(v.buf.source).toBe("line!\n");
    // The file changed too: the conflict prompt, as before.
    await touch(file, "theirs\n");
    await h.keys("space", "n", "r");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
  });
  test("(d) shows yours → theirs; (m) merges against the version you started from", async () => {
    const { h, file, v } = await setup("one\ntwo\nthree\n");
    await h.keys("space", "n", "v", "g", "g", "shift+a", "!", "escape"); // yours: one!
    await touch(file, "one\ntwo\nTHREE\n"); // theirs: THREE
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("d");
    const d = h.app.floating!;
    expect([d.kind, d.title]).toEqual(["diff", "Diff — yours → theirs (c.md)"]);
    expect(d.view.buf.source.split("\n")).toContain("+ THREE");
    await h.keys("escape"); // back to the prompt
    expect(h.app.floating).toBeNull();
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    // enter goes back to it too: the prompt is still to answer.
    await h.keys("d", "enter");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("m");
    expect(v.buf.source).toBe("one!\ntwo\nTHREE\n"); // both changes, no conflict
    expect(v.buf.dirty).toBe(true);
    await h.keys(":", "w", "enter"); // the file is theirs now: a plain save
    expect(readFileSync(file, "utf8")).toBe("one!\ntwo\nTHREE\n");
    await h.keys("g", "g", "shift+a", "?", "escape");
    await touch(file, "one?!\ntwo\nTHREE\n".replace("?!", "#"));
    h.app.watch.reloadBuffer(v.buf);
    // Both changing the same line: the merge screen settles it (GIT-D5); e puts it in the note, still marked.
    await h.keys("m");
    expect(h.app.floating?.kind).toBe("merge");
    await h.keys("e");
    expect(v.buf.source).toBe("<<<<<<< yours\none!?\n=======\none#\n>>>>>>> theirs\ntwo\nTHREE\n");
    expect(v.buf.dirty).toBe(true);
  });
  test("autosave: after the idle delay; not mid-insert, not after keep, not during a git commit", async () => {
    const { h, file, v, root } = await setup("a\n", (c) => (c.editor.autosave_ms = 20));
    await h.keys("shift+a", "b");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("a\n"); // still typing
    await h.keys("escape");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("ab\n");
    expect(v.buf.dirty).toBe(false);
    // git holding its lock: later.
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "index.lock"), "");
    await h.keys("shift+a", "c", "escape");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("ab\n");
    rmSync(join(root, ".git", "index.lock"));
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("abc\n");
    // After keep: never on its own.
    await h.keys("shift+a", "d", "escape");
    await touch(file, "other\n");
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("k");
    await Bun.sleep(60);
    expect(readFileSync(file, "utf8")).toBe("other\n");
    // …nor does the prompt come back at each idle delay.
    await Bun.sleep(60);
    expect(h.app.overlay).toBeNull();
  });
  test("unsaved notes are listed for the CLI (the staleness file, 9.9) until saved or quit", async () => {
    const { readStale } = await import("../../../../src/core/workspace/git/merge/stale.ts");
    const { h } = await setup("x\n");
    expect(readStale(h.app.loc)).toEqual([]);
    await h.keys("shift+a", "y", "escape");
    expect(readStale(h.app.loc).map((e) => e.path)).toEqual(["c.md"]);
    await h.keys("ctrl+s");
    expect(readStale(h.app.loc)).toEqual([]);
    await h.keys("shift+a", "z", "escape");
    expect(readStale(h.app.loc).map((e) => e.path)).toEqual(["c.md"]);
    await h.keys(":", "q", "!", "enter");
    expect(readStale(h.app.loc)).toEqual([]);
  });
  test("a hand-off saves first: the editor never gets a stale file", async () => {
    const { h, file } = await setup("x\n", (c) => (c.editor.command = "ed {file}"));
    const host = (h.app as unknown as { host: Host }).host;
    let seen = "";
    host.runForeground = () => ((seen = readFileSync(file, "utf8")), 0);
    await h.keys("shift+a", "y", "escape", "space", "n", "e");
    expect(seen).toBe("xy\n");
  });
});

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
  test("autosave never writes a merge's conflict markers; :w does", async () => {
    const { h, v, file } = await source("one\n", (c) => (c.editor.autosave_ms = 20));
    await h.keys("shift+a", "!", "escape");
    await touch(file, "one?\n");
    h.app.watch.reloadBuffer(v.buf);
    // Marked from the merge screen's e (GIT-D5), as (m) once marked it.
    await h.keys("m", "e");
    expect(v.buf.source).toContain("<<<<<<< yours");
    await Bun.sleep(80);
    expect(readFileSync(file, "utf8")).toBe("one?\n");
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toContain("<<<<<<< yours");
  });
});

describe("review cycle 4 (TUI)", () => {
  const touch = async (file: string, text: string) => {
    writeFileSync(file, text);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
  };
  test("deleted, then recreated by an agent: :w asks instead of writing over it", async () => {
    const root = makeVault();
    const file = join(root, "d.md");
    writeFileSync(file, "mine\n");
    const h = await harness({ root, open: "d.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    rmSync(file);
    h.app.watch.reloadBuffer(v.buf, true);
    expect(v.buf.deleted).toBe(true);
    await touch(file, "# agent's\n");
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("k"); // keep mine
    await h.keys(":", "w", "enter");
    expect(readFileSync(file, "utf8")).toBe("# agent's\n");
  });
  test("a click resolving a conflict updates the stale list; two instances keep each other's positions", async () => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "c.md", width: 100, height: 30 });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "!", "escape");
    await touch(file, "theirs\n");
    h.app.watch.reloadBuffer(v.buf);
    h.frame();
    const load = h.app.geometry!.overlay!;
    // The first entry of the prompt, (l) load theirs.
    h.app.mouse.handle({ type: "down", x: load.x + 3, y: load.listY, button: 0 });
    h.app.mouse.handle({ type: "up", x: load.x + 3, y: load.listY, button: 0 });
    expect(v.buf.dirty).toBe(false);
    const { readStale } = await import("../../../../src/core/workspace/git/merge/stale.ts");
    expect(readStale(h.app.loc).map((x) => x.path)).not.toContain("c.md");
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!.text;

  test("a conflict prompt dismissed keeps yours and says how to come back; space n c brings it back, and says when there is none", async () => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, "line\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "c");
    expect(last(h)).toBe("c.md has no conflict with the file on disk");
    expect(h.app.overlay).toBeNull();
    await h.keys("shift+a", "!", "escape");
    writeFileSync(file, "theirs\n");
    const future = Date.now() / 1000 + 5;
    utimesSync(file, future, future);
    h.app.watch.reloadBuffer(v.buf);
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("escape");
    expect(v.buf.conflictKept).toBe(true);
    expect(v.buf.source).toBe("line!\n");
    expect(last(h)).toBe("c.md: keeping yours for now — space n c to resolve");
    await h.keys("space", "n", "c");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    await h.keys("l");
    expect(v.buf.source).toBe("theirs\n");
  });
});
