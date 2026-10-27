import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { lineOf, offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, rowStarting, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review round 3", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  test("the scratch's own writes never read as external changes (polled directories included)", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      watch: true,
      config: (c) => ((c.capture.location = "root"), (c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    try {
      await h.keys("space", "s", "a");
      await sleep(400);
      await h.keys("space", "s", "s"); // the scratch open in a window
      await h.keys("space", "s", "a");
      await sleep(1200);
      expect(h.app.messages.some((m) => m.text.includes("scratch.md changed on disk"))).toBe(false);
    } finally {
      h.app.watcher?.close();
    }
  });
});

describe("scratch (space s)", () => {
  /** The line the window's cursor is on, from 1. */
  const lineAt = (h: Harness, v = h.app.view!) => lineOf(v, offsetOf(h.app, v));

  test("add the cursor row reference, add a selection: each shown floating, typing its note; esc then q back, a note left empty dropped; open, copy (#43, D229)", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const path = h.app.scratch.location().path;
    await h.keys("space", "s", "a");
    const at = () => [h.app.floating?.kind, h.app.displayName(h.app.view!.buf), lineAt(h), h.app.view!.insert];
    expect(at()).toEqual(["scratch", "scratch", 3, true]);
    await h.keys("f", "i", "x", "escape", "q");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
    expect(readFileSync(path, "utf8")).toBe("**At:** `notes/alpha.md:1`\n\n**Note:** fix\n");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Back to"), col: 0 });
    await h.keys("v", "e", "space", "s", "a");
    expect(readFileSync(path, "utf8")).toEndWith(
      "\n\n---\n\n**At:** `notes/alpha.md:9`\n\n```\nBack\n```\n\n**Note:** \n",
    );
    expect(at()).toEqual(["scratch", "scratch", 13, true]);
    // Copied with nothing said yet: the empty note isn't in it.
    await h.keys("escape", "space", "s", "y");
    expect(h.copied.at(-1)).toEndWith("```\nBack\n```\n");
    // Nothing said: esc (out of typing, then the scratch), and the empty note goes.
    await h.keys("escape");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
    const text = readFileSync(path, "utf8");
    expect(text).toBe(
      "**At:** `notes/alpha.md:1`\n\n**Note:** fix\n\n---\n\n**At:** `notes/alpha.md:9`\n\n```\nBack\n```\n",
    );
    await h.keys("space", "s", "s");
    expect([h.app.floating?.kind, h.app.displayName(h.app.view!.buf)]).toEqual(["scratch", "scratch"]);
    await h.keys("space", "s", "y");
    expect(h.copied.at(-1)).toBe(text);
  });

  test("the floating scratch: empty, it opens too, in the middle, three quarters of the screen; typed in, saved as it closes (#43)", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, height: 40 });
    const path = h.app.scratch.location().path;
    expect(existsSync(path)).toBe(false);
    await h.keys("space", "s", "s");
    expect(h.app.floating?.kind).toBe("scratch");
    h.frame();
    const box = h.app.geometry!.floating!;
    const pane = h.app.geometry!.panes.find((p) => p.view === h.app.tabView)!;
    // Its margin taken off: the box itself.
    const [y, rows] = [box.y + 1, box.h - 2];
    expect(Math.abs(y - pane.y - (pane.y + pane.h - (y + rows)))).toBeLessThanOrEqual(3);
    expect([box.w - 4, rows >= Math.floor((pane.h * 2) / 3)]).toEqual([90, true]);
    expect(h.frame()).toContain("esc · q closes, saved");
    await h.keys("i", "i", "d", "e", "a", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("q");
    expect([h.app.floating, readFileSync(path, "utf8")]).toEqual([null, "idea"]);
  });

  test("the floating scratch is a window like any: rendered, the lens, ctrl+k; esc leaves the lens and a find first, and closes it last (#43)", async () => {
    // The lens, as slipbox's own default has it (the harness edits in source mode).
    const h = await harness({
      open: "notes/alpha.md",
      width: 120,
      height: 40,
      config: (c) => (c.editor.edit_in = "live"),
    });
    const path = h.app.scratch.location().path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "# Ideas\n\nfirst idea\n\n- a list item\n");
    await h.keys("space", "s", "s");
    const status = () => h.frame().split("\n").at(-1)!;
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ /)]);
    expect(h.frame()).toContain("▌ Ideas");
    // The lens, typing in it: esc stops typing, esc again leaves the lens, the scratch still open.
    await h.keys("j", "j", "i");
    expect(status()).toMatch(/^ READ·LENS /);
    await h.keys("i");
    expect(status()).toMatch(/^ (?:SOURCE|READ·LENS) │ INSERT /);
    await h.keys("escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ·LENS /)]);
    await h.keys("escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ /)]);
    // A find: esc ends it first.
    await h.keys("/", "i", "d", "e", "a", "enter");
    expect(h.app.view!.find).not.toBeNull();
    await h.keys("escape");
    expect([h.app.floating?.kind, h.app.view!.find]).toEqual(["scratch", null]);
    // ctrl+k: its markdown, still floating; esc, with nothing else to leave, closes it.
    await h.keys("ctrl+k");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ SOURCE /)]);
    await h.keys("escape");
    expect([h.app.floating, h.app.view!.buf.key]).toEqual([null, "notes/alpha.md"]);
  });

  test("a capture in the lens: typing in it at once; esc leaves the typing, q closes the scratch, saved (D229)", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 120, config: (c) => (c.editor.edit_in = "live") });
    const status = () => h.frame().split("\n").at(-1)!;
    await h.keys("space", "s", "a");
    expect([h.app.floating?.kind, status()]).toEqual([
      "scratch",
      expect.stringMatching(/^ (?:SOURCE|READ·LENS) │ INSERT /),
    ]);
    // One message, saying how to go on: not the lens's own.
    expect(h.app.toasts.map((m) => m.text)).toEqual(["added to the scratch; add a note, esc then q closes it"]);
    await h.keys("d", "o", "escape");
    expect([h.app.floating?.kind, status()]).toEqual(["scratch", expect.stringMatching(/^ READ·LENS /)]);
    await h.keys("q");
    expect([h.app.floating, readFileSync(h.app.scratch.location().path, "utf8")]).toEqual([
      null,
      "**At:** `notes/alpha.md:1`\n\n**Note:** do\n",
    ]);
  });

  test("[capture] open_in = right: the scratch on the right; a capture goes to it, typing its note; q closes it, saved, an empty note dropped; space s r; the UI settings switch it, kept (#43, D229)", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: "notes/alpha.md",
      config: (c) => ((c.capture.open_in = "right"), (c.ui.restore_session = true)),
    });
    // A long scratch: what's added goes below the window's last row.
    const path = h.app.scratch.location().path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "x\n\n".repeat(40));
    // A split stacked once and closed since: the scratch goes on the right all the same.
    const t = h.app.tab!;
    Object.assign(t, { orientation: "stacked" });
    await h.keys("space", "s", "s");
    expect([h.app.floating, t.views.length, t.orientation, t.active]).toEqual([null, 2, "side", 1]);
    expect(h.app.displayName(h.app.view!.buf)).toBe("scratch");
    // From the note beside it: the cursor goes to the entry on the right, typing its note, in sight.
    t.active = 0;
    await h.keys("space", "s", "a");
    expect([h.app.floating, t.active, lineAt(h), h.app.view!.insert]).toEqual([null, 1, 85, true]);
    expect(h.frame()).toContain("notes/alpha.md:1");
    await h.keys("w", "h", "y", "escape");
    // The next, from the note: what was typed saved first, the entry after it.
    t.active = 0;
    await h.keys("j", "space", "s", "a");
    expect([t.active, lineAt(h)]).toEqual([1, 91]);
    // Nothing said, and another: the note left empty goes as it's added.
    await h.keys("escape");
    t.active = 0;
    await h.keys("space", "s", "a");
    expect(readFileSync(path, "utf8").match(/\*\*Note:\*\*.*/g)).toEqual(["**Note:** why", "**Note:** "]);
    // Closed with q, nothing said this time either: that note goes too, the rest saved.
    await h.keys("escape", "q");
    expect([t.views.length, h.app.view!.buf.key]).toEqual([1, "notes/alpha.md"]);
    const entry = "\\*\\*At:\\*\\* `notes\\/alpha\\.md:\\d+`\\n";
    expect(readFileSync(path, "utf8")).toMatch(
      new RegExp(`\\n\\*\\*Note:\\*\\* why\\n\\n---\\n\\n${entry}\\n---\\n\\n${entry}$`),
    );
    // The UI settings: floating now, kept from one start to the next; space s r, on the right all the same.
    await h.keys("space", "u", "u");
    expect(h.frame()).toMatch(/Scratch opens +on the right/);
    await h.keys("escape");
    await h.app.run("ui.scratch_in");
    await h.keys("space", "s", "s");
    expect(h.app.floating?.kind).toBe("scratch");
    await h.keys("q", "space", "s", "r");
    expect([h.app.floating, t.views.length, h.app.displayName(h.app.view!.buf)]).toEqual([null, 2, "scratch"]);
    // In a split already: its other window takes the scratch.
    await h.keys("q");
    h.app.windows.split("side");
    t.active = 0;
    await h.keys("space", "s", "r");
    expect([t.views.length, t.active, t.views[0]!.buf.key, h.app.displayName(t.views[1]!.buf)]).toEqual([
      2,
      1,
      "notes/alpha.md",
      "scratch",
    ]);
    h.app.quit();
    const config = (c: Config) => ((c.capture.open_in = "right"), (c.ui.restore_session = true));
    const again = await harness({ root, open: "notes/alpha.md", config });
    expect(again.app.ui.scratch_in).toBe("float");
    // A value saved that isn't one: dropped, the config's taken.
    const { loadSession, saveSession } = await import("../../../../src/core/workspace/session/position.ts");
    again.app.quit();
    const s = loadSession(again.app.loc)!;
    saveSession(again.app.loc, { ...s, ui: { ...s.ui, scratch_in: { value: "bottom", base: "right" } } });
    const bogus = await harness({ root, open: "notes/alpha.md", config });
    expect(bogus.app.ui.scratch_in).toBe("right");
  });
  test("the scratch open never moves the explorer's view (VV-D5): it lives in slipbox's own state folder", async () => {
    const h = await harness();
    h.app.scratch.capture("x");
    await h.app.run("scratch.open");
    expect(h.app.view!.buf.abs.startsWith(`${h.root}/`)).toBe(false); // the default place: outside the root
    expect(h.app.explorer.top).toBe(h.root);
    // Nothing outside the vault listed: its rows are its own, those its walk leaves out (VV-D8) among them.
    expect(h.app.explorer.rows().every((r) => h.app.explorer.rowAbs(r).startsWith(`${h.root}/`))).toBe(true);
  });
});
