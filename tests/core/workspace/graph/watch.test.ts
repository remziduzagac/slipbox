import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review cycle 5 (the watcher's polling fallbacks)", () => {
  const until = async (ok: () => boolean, ms = 25_000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await Bun.sleep(20);
  };
  test("degraded (the watch limit hit): open notes are polled, their changes still reported", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-poll-"));
    writeFileSync(join(dir, "a.md"), "one\n");
    const changed: string[] = [];
    const degraded: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      pollMs: 200, // the sweep of every known note comes each 15th tick: 3 s
      known: new Map([["a.md", 0]]),
      pollTargets: () => ["a.md"],
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: (r) => degraded.push(r),
    });
    try {
      (w as unknown as { degrade(r: string): void }).degrade("ENOSPC: test");
      expect(degraded.join()).toContain("polling open notes");
      expect(w.degraded).toContain("ENOSPC");
      writeFileSync(join(dir, "a.md"), "two, longer\n");
      // Polled as an open note within a few ticks, long before the sweep would find it.
      await until(() => changed.includes("a.md"), 1500);
      expect(changed).toContain("a.md");
    } finally {
      w.close();
    }
  });
  test("what the watcher sees on its own, and a change heard elsewhere said no second time by its sweep (#13)", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-heard-"));
    mkdirSync(join(dir, ".stash"));
    writeFileSync(join(dir, "a.md"), "one\n");
    writeFileSync(join(dir, ".draft.md"), "draft\n");
    writeFileSync(join(dir, ".stash", "h.md"), "hidden\n");
    writeFileSync(join(dir, ".stash", "k.md"), "kept\n");
    const stampOf = (rel: string) => statSync(join(dir, rel)).mtimeMs;
    const changed: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      pollMs: 100, // the sweep of every known note each 15th tick: 1.5 s
      known: new Map(["a.md", ".stash/h.md", ".stash/k.md"].map((r) => [r, stampOf(r)])),
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: () => {},
    });
    try {
      // Its folder watched and its name taken: seen. A hidden name in it, or a folder not watched: not. A folder polled
      // (its watch failed) has its notes looked at, nothing else.
      expect([w.sees("a.md"), w.sees(".draft.md"), w.sees(".stash/h.md")]).toEqual([true, false, false]);
      (w as unknown as { polled: Set<string> }).polled.add("sub");
      expect([w.sees("sub/n.md"), w.sees("sub/d.json")]).toEqual([true, false]);
      // Heard of a file that's no note: not kept by its stamp, so never swept.
      w.heard(".stash/d.json", { mtimeMs: 1, size: 1 });
      // Both rewritten (a later second, a new size); h.md's change heard elsewhere, k.md's not: the sweep says k.md's.
      await Bun.sleep(1100);
      writeFileSync(join(dir, ".stash", "h.md"), "hidden, rewritten\n");
      writeFileSync(join(dir, ".stash", "k.md"), "kept, rewritten\n");
      w.heard(".stash/h.md", statSync(join(dir, ".stash", "h.md")));
      await until(() => changed.includes(".stash/k.md"), 4000);
      await Bun.sleep(300);
      expect(changed).toContain(".stash/k.md");
      expect(changed).not.toContain(".stash/h.md");
      expect(changed).not.toContain(".stash/d.json");
    } finally {
      w.close();
    }
  });

  test("a folder that can't be watched is polled: its new and changed notes still come", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-polldir-"));
    mkdirSync(join(dir, "sub"));
    const changed: string[] = [];
    const warned: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [],
      debounceMs: 20,
      pollMs: 50,
      known: new Map(),
      onBatch: (b) => changed.push(...b.changes.map((c) => c.rel)),
      onDegraded: () => {},
      onWarn: (m) => warned.push(m),
    });
    try {
      (w as unknown as { pollDir(d: string, r: string): void }).pollDir("sub", "EACCES: test");
      expect(warned.join()).toContain("polling it");
      expect(w.polledDirs).toContain("sub");
      writeFileSync(join(dir, "sub", "new.md"), "# New\n");
      await until(() => changed.includes("sub/new.md"));
      expect(changed).toContain("sub/new.md");
    } finally {
      w.close();
    }
  });
  test("a folder moved in brings its attachments with its notes: `![[dal.png]]` finds the picture in it (21.3)", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-adopt-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-adopt-out-"));
    mkdirSync(join(outside, "photos", "old"), { recursive: true });
    writeFileSync(join(outside, "photos", "dal.png"), "png");
    writeFileSync(join(outside, "photos", "old", "flip.jpg"), "jpg");
    writeFileSync(join(outside, "photos", "captions.md"), "# Captions\n");
    const changed: { rel: string; isNote: boolean }[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [""],
      debounceMs: 20,
      known: new Map(),
      onBatch: (b) => changed.push(...b.changes.map((c) => ({ rel: c.rel, isNote: c.isNote }))),
      onDegraded: () => {},
    });
    try {
      // The watch live first: macOS's starts a moment after it's asked for, and a change before then isn't seen.
      writeFileSync(join(dir, "ready.md"), "# Ready\n");
      await until(() => changed.some((c) => c.rel === "ready.md"));
      changed.length = 0;
      renameSync(join(outside, "photos"), join(dir, "photos"));
      await until(() => changed.length >= 3);
      expect(changed.sort((a, b) => a.rel.localeCompare(b.rel))).toEqual([
        { rel: "photos/captions.md", isNote: true },
        { rel: "photos/dal.png", isNote: false },
        { rel: "photos/old/flip.jpg", isNote: false },
      ]);
    } finally {
      w.close();
    }
  });
  test("a note written and removed between two looks is said gone: what read it from the disk meanwhile looks again", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cameandwent-"));
    const changes: string[] = [];
    const w = new VaultWatcher({
      root: dir,
      filter: new WalkFilter(dir, DEFAULT_CONFIG.walk),
      dirs: [],
      debounceMs: 20,
      known: new Map(),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      // Its events (made, then removed) in one debounce: settled once, the file not there and never known.
      writeFileSync(join(dir, "rota.md"), "# Rota\n");
      rmSync(join(dir, "rota.md"));
      (w as unknown as { pending: Set<string> }).pending.add("rota.md");
      w.flush();
      expect(changes).toEqual(["deleted rota.md"]);
    } finally {
      w.close();
    }
  });
});

describe("the watcher's second look: what its events didn't say (5.1, #56)", () => {
  // macOS's watch reports nothing for a moment after any folder's watch is added or removed (Bun restarts its one
  // FSEvents stream "since now"). The watches closed here make that loss certain: only the second look remains.
  const silenced = async (o: {
    root: string;
    dirs: string[];
    known?: Map<string, number>;
    attachments?: string[];
    walkedAt?: () => number;
    listed?: boolean;
  }) => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter } = await import("../../../../src/core/workspace/walk/walk.ts");
    const changes: string[] = [];
    const w = new VaultWatcher({
      ...o,
      filter: new WalkFilter(o.root, DEFAULT_CONFIG.walk),
      known: o.known ?? new Map(),
      debounceMs: 20,
      pollMs: 600_000, // ticks only when the test calls one
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}${c.isNote ? "" : " (file)"}`)),
      onDegraded: () => {},
    });
    for (const fsw of (w as unknown as { watchers: Map<string, { close(): void }> }).watchers.values()) fsw.close();
    const tick = () => {
      w.pollTick();
      w.flush();
      return changes.splice(0).sort();
    };
    return { w, tick };
  };
  const hourAgo = () => new Date(Date.now() - 3_600_000);
  const age = (...dirs: string[]) => {
    for (const d of dirs) utimesSync(d, hourAgo(), hourAgo());
  };

  test("a folder whose mtime moved is listed again: what came and went there is said, the rest isn't", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-lost-"));
    mkdirSync(join(root, "sub"));
    for (const f of ["a.md", "sub/b.md", "pic.png", "old.png"]) writeFileSync(join(root, f), "x\n");
    symlinkSync(join(root, "nowhere.md"), join(root, "dead.md")); // left out, as the walk leaves it: never said gone
    age(root, join(root, "sub"));
    const known = new Map(["a.md", "sub/b.md"].map((f) => [f, statSync(join(root, f)).mtimeMs] as [string, number]));
    const { w, tick } = await silenced({ root, dirs: ["", "sub"], known, attachments: ["pic.png", "old.png"] });
    try {
      // Nothing changed: nothing said.
      expect(tick()).toEqual([]);
      renameSync(join(root, "a.md"), join(root, "sub", "moved.md"));
      mkdirSync(join(root, "deep", "er"), { recursive: true });
      writeFileSync(join(root, "deep", "er", "n.md"), "# N\n");
      writeFileSync(join(root, "new.png"), "png");
      rmSync(join(root, "old.png"));
      expect(tick()).toEqual([
        "created deep/er/n.md",
        "created new.png (file)",
        "created sub/moved.md",
        "deleted a.md",
        "deleted old.png (file)",
      ]);
      expect(w.watchedCount).toBe(4); // deep and deep/er, adopted
      // Looked at again while their mtimes are fresh, all of it known now: said once.
      expect(tick()).toEqual([]);
    } finally {
      w.close();
    }
  });

  test("a file written after the walk read its folder, before the watch, is found on the first tick", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-late-"));
    writeFileSync(join(root, "late.md"), "# Late\n");
    // The folder changed ten seconds ago, after the walk began a minute ago: the walk may not have seen it.
    const tenAgo = new Date(Date.now() - 10_000);
    utimesSync(root, tenAgo, tenAgo);
    const { w, tick } = await silenced({ root, dirs: [""], walkedAt: () => Date.now() - 60_000 });
    try {
      expect(tick()).toEqual(["created late.md"]);
    } finally {
      w.close();
    }
  });

  test("a change the folder's mtime can't tell apart, so soon after the last, is still found", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-coarse-"));
    writeFileSync(join(root, "a.md"), "# A\n");
    // Changed half a second before the walk: a coarse clock can give the next change the very same mtime.
    const was = new Date(Date.now() - 500);
    utimesSync(root, was, was);
    const known = new Map([["a.md", statSync(join(root, "a.md")).mtimeMs]]);
    const { w, tick } = await silenced({ root, dirs: [""], known, walkedAt: () => Date.now() });
    try {
      writeFileSync(join(root, "b.md"), "# B\n");
      utimesSync(root, was, was);
      expect(tick()).toEqual(["created b.md"]);
    } finally {
      w.close();
    }
  });

  test("a folder listed, not walked (~): a second look takes in its new notes, never its folders or other files", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-listed-"));
    mkdirSync(join(root, "Documents"));
    writeFileSync(join(root, "Documents", "deep.md"), "# Deep\n");
    age(root);
    const { w, tick } = await silenced({ root, dirs: [""], listed: true });
    try {
      writeFileSync(join(root, "todo.md"), "# Todo\n");
      writeFileSync(join(root, "photo.png"), "png");
      expect(tick()).toEqual(["created todo.md"]);
      expect(w.watchedCount).toBe(1);
    } finally {
      w.close();
    }
  });
});

describe("review cycle 3 (core)", () => {
  test("the watcher takes symlinks as the walk does: a symlinked folder never followed, a file outside never adopted", async () => {
    const { VaultWatcher } = await import("../../../../src/core/workspace/graph/watch.ts");
    const { WalkFilter, walkVault } = await import("../../../../src/core/workspace/walk/walk.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-watchln-"));
    const dir = join(top, "root");
    const outside = join(top, "outside");
    mkdirSync(join(dir, "assets"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "assets", "real.png"), "png");
    writeFileSync(join(outside, "secret.md"), "# Secret\n");
    const changes: string[] = [];
    const filter = new WalkFilter(dir, DEFAULT_CONFIG.walk);
    const w = new VaultWatcher({
      root: dir,
      filter,
      dirs: ["", "assets"],
      debounceMs: 20,
      known: new Map([["a.md", statSync(join(dir, "a.md")).mtimeMs]]),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      symlinkSync(join(outside), join(dir, "linked")); // a folder, outside
      symlinkSync(join(outside, "secret.md"), join(dir, "s.md")); // a note, outside
      symlinkSync(join(dir, "a.md"), join(dir, "twin.md")); // a note already in the vault
      symlinkSync(join(dir, "assets", "real.png"), join(dir, "pic.png")); // a file inside: kept, as the walk keeps it
      // A folder moved in, holding a link out.
      mkdirSync(join(top, "moving"));
      symlinkSync(join(outside, "secret.md"), join(top, "moving", "x.md"));
      renameSync(join(top, "moving"), join(dir, "moved"));
      // Whatever the platform's events say, each name settled.
      const pending = (w as unknown as { pending: Set<string> }).pending;
      for (const rel of ["linked", "s.md", "twin.md", "pic.png", "moved"]) pending.add(rel);
      w.flush();
      await Bun.sleep(150);
      // The names made once the watch began: macOS's events may also tell of a file made just before it
      // (assets/real.png), which isn't what this asks.
      const made = new Set(["linked", "s.md", "twin.md", "pic.png", "moved", "moved/x.md"]);
      const created = changes.filter((c) => c.startsWith("created ") && made.has(c.slice("created ".length)));
      expect([...new Set(created)].sort()).toEqual(["created pic.png"]);
      expect(w.watchedCount).toBe(3); // the root, assets, the folder moved in — never `linked`
      // The walk agrees.
      const walked = walkVault(dir, filter);
      expect(walked.files.map((f) => f.rel)).toEqual(["a.md"]);
      expect(walked.assets.sort()).toEqual(["assets/real.png", "pic.png"]);
    } finally {
      w.close();
    }
  });
});
