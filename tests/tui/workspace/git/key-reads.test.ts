// Git's keys read as a key's own (SD-T5): a file looked for before the git panel opens it, and what a git read is read
// against (git's index, `HEAD`, the note's file), asked of a disk thread — the key waiting, a frame drawn, `esc` giving
// it up. The repository lives in a folder `held`: every read of it on the disk threads waits for the test, and this
// thread's reads of what's asked hold too, so one put back here holds its key past the hold's deadline (`gaveUp`).

import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { diskThreads } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { reviewOf } from "../../../../src/tui/workspace/git/views/review/review.ts";
import { makeGitPanelFixture } from "../../../support/tui/git-panel-fixture.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";

const { sandbox, repo, until, panel, rowOf } = makeGitPanelFixture();
const { holding, untilHeld } = makeHeldKeys();

/** The fixture's repository moved into a folder `held`; `changed` written in it, uncommitted. */
function heldRepo(changed: Record<string, string>): string {
  const box = join(mkdtempSync(join(sandbox, "box-")), "held");
  mkdirSync(box);
  const root = join(box, "repo");
  renameSync(repo(), root);
  for (const [rel, text] of Object.entries(changed)) writeFileSync(join(root, rel), text);
  return root;
}

describe("git's keys read on a disk thread (SD-T5)", () => {
  test("held: a file opened from the git panel — the key waits, a frame drawn; let go, it opens; esc gives it up", async () => {
    const root = heldRepo({ "a.md": "# A\n\none more\n", "c.md": "# C\n\nchanged\n" });
    const { app, frame } = await panel(root, "b.md");
    app.reads.offThread = true;
    const at = (path: string) => rowOf(app, (r) => r.kind === "file" && r.entry.path === path);
    expect(await until(() => (frame(), at("a.md") >= 0 && at("c.md") >= 0))).toBe(true);
    // This thread holds the file looked for alone: once a.md is open, drawing it reads it here.
    const held = holding((p) => p === join(root, "a.md"));
    app.gitPanel.select(at("a.md"));
    frame();
    const o = app.input.handleKey("o");
    await untilHeld(held);
    expect(held.waiting).toBeGreaterThanOrEqual(1);
    expect(frame()).toContain("reading a.md…");
    expect(app.view!.buf.key).toBe("b.md");
    held.release();
    await o;
    await app.reads.settled();
    expect(app.view!.buf.key).toBe("a.md");
    expect(app.region).toBe("content");
    expect(held.gaveUp).toBe(0);
    // Held again: `esc` while it's looked for, and nothing opens.
    const next = holding((p) => p === join(root, "c.md"));
    app.region = "sidebar";
    app.gitPanel.select(at("c.md"));
    frame();
    const again = app.input.handleKey("o");
    await untilHeld(next);
    await app.input.handleKey("escape");
    expect(frame()).not.toContain("reading c.md…");
    next.release();
    await again;
    await app.reads.settled();
    expect(app.view!.buf.key).toBe("a.md");
    expect(app.buffers.has("c.md")).toBe(false);
    expect(next.gaveUp).toBe(0);
  });

  test("held: a git key with `.git` held starts its read once what it's read against answers", async () => {
    const root = heldRepo({ "a.md": "# A\n\none more\n" });
    const { app, frame } = await panel(root, "a.md", false);
    app.reads.offThread = true;
    // This thread holds only git's index: what the git read's start stats and nothing else here does.
    const held = holding((p) => p === join(root, ".git", "index"));
    const shown = app.run("git.changes");
    await untilHeld(held);
    expect(app.reads.busy).toBe(true);
    frame();
    // Not started: nothing of git's shown yet.
    expect(app.overlay).toBeNull();
    held.release();
    await shown;
    await app.reads.settled();
    expect(await until(() => app.overlay !== null)).toBe(true);
    expect(held.gaveUp).toBe(0);
    expect(root.split(sep)).toContain("held");
  });

  test("held: a review of several files asks a disk thread of git's files twice — before git starts, and once all is read", async () => {
    const root = heldRepo({ "a.md": "# A\n\none more\n", "b.md": "# B\n\nchanged too\n" });
    const { app } = await panel(root, "a.md", false);
    app.reads.offThread = true;
    // The disk threads held alone: git runs, and the files reviewed are read, here.
    const held = holding(() => false);
    const asked = spyOn(diskThreads(), "gitRead");
    app.run("git.review");
    await untilHeld(held);
    held.release();
    expect(await until(() => reviewOf(app) !== null)).toBe(true);
    expect(new Set(reviewOf(app)!.items.map((i) => i.path))).toEqual(new Set(["a.md", "b.md"]));
    // Not a round trip a file: between one file and the next, what it's read for is looked at here.
    expect(asked).toHaveBeenCalledTimes(2);
    expect(held.gaveUp).toBe(0);
  });
});
