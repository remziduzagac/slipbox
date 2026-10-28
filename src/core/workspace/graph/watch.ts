// Vault watcher (plan 5.1, 5.2). One non-recursive watch per walked directory, so the watcher
// subscribes to exactly what the walk includes (0.11 = 5.2): a busy folder (`node_modules`, a
// `target/` with no note at its top: D237) and anything gitignored are never watched. A busy folder
// that changes kind — its first note, its line in a `.gitignore` gone — is taken in when its parent
// is listed again (the filter asks the folder again once it changed) or the vault is walked again.
// Before home's first walk, a folder its graph hasn't looked into is the walk's (VV-D2): never taken in here.
//
// Events are debounced — agents write in bursts, and editors save by temp-and-rename, which looks
// like delete-then-create — and then settled by stat, so the consumer gets one clean list of
// created / changed / deleted notes. Our own writes are ignored by (path, mtime).
//
// If registration fails (inotify limits on the Linux VMs: ENOSPC / EMFILE), the watcher degrades
// *loudly*: it reports once and falls back to polling the files it was asked to poll.
//
// Events can be lost (on macOS, Bun restarts its one FSEvents stream "since now" whenever a watch is
// added or removed), so each tick stats the watched directories, and one whose mtime moved since it
// was last looked at is listed again: what came or went there is settled as its events would have been.

import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { parentOf, settled } from "../walk/io/stamps.ts";
import type { WatcherOptions, Settling } from "./watch/contracts.ts";
import { WatchState } from "./watch/state.ts";
import { WatchDirectories } from "./watch/directories.ts";
import { WatchReconciliation } from "./watch/reconciliation.ts";
import { every, dirMtime, watchTakes, statOrNull } from "./watch/io.ts";

export class VaultWatcher {
  private readonly state = new WatchState();
  private readonly directories: WatchDirectories;
  private readonly reconciliation: WatchReconciliation;
  degraded: string | null = null;

  /** The root's real path: a symlink is kept when it points inside it, or out and you follow it (0.11, VV-D6). */
  private readonly realRoot: string;

  constructor(private readonly opts: WatcherOptions) {
    let realRoot = opts.root;
    try {
      realRoot = realpathSync(opts.root);
    } catch {}
    this.realRoot = realRoot;
    const owner = this;
    this.directories = new WatchDirectories(opts, this.state, this.realRoot, {
      get degraded() {
        return owner.degraded;
      },
      degrade: (reason) => this.degrade(reason),
      ensurePollTimer: () => this.ensurePollTimer(),
      schedule: () => this.schedule(),
    });
    this.reconciliation = new WatchReconciliation(opts, this.state, this.directories);

    for (const [k, v] of opts.sizes ?? []) this.state.sizes.set(k, v);
    for (const rel of opts.attachments ?? []) this.directories.attachment(rel, true);
    const walkedAt = opts.walkedAt?.() ?? Date.now();
    for (const d of opts.dirs) this.directories.watchDir(d, walkedAt);
    this.ensurePollTimer();
  }

  /**
   * Whether a change to the file `rel` reaches this watcher on its own: degraded, it polls every open file; else its
   * folder is watched (or polled) and its name one its filter takes — a hidden or ignored file in a watched folder isn't.
   */
  sees(rel: string): boolean {
    if (this.degraded) return true;
    return watchTakes(this.opts.filter, rel, this.state.watchers, this.state.polled);
  }

  /** A change to `rel` heard elsewhere (the TUI's poll of a file no watch sees): known at this stamp, so a sweep or a
   *  folder listed again doesn't say it a second time; gone, known no more. */
  heard(rel: string, st: { mtimeMs: number; size: number } | null): void {
    // Notes alone are known by their stamps (as `noteOwnWrite` keeps them): another file isn't swept.
    if (!this.opts.filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) return;
    if (!st) {
      this.opts.known.delete(rel);
      this.state.sizes.delete(rel);
      return;
    }
    this.opts.known.set(rel, st.mtimeMs);
    this.state.sizes.set(rel, st.size);
  }

  /** After a rescan: watch exactly `dirs`, and adopt the new graph's notes as known. */
  sync(dirs: string[], known: Map<string, number>, sizes?: Map<string, number>): void {
    // Home's walk kept: nothing left to it any more — what the watcher left, and moves to follow, forgotten.
    if (!this.opts.walkPending?.()) {
      this.state.left.clear();
      this.state.leftSeen.clear();
      this.state.recentlyWent.length = 0;
      this.state.recentlyGone.length = 0;
      this.state.followed.clear();
    }
    const want = new Set(dirs);
    for (const [d, w] of this.state.watchers) {
      if (!want.has(d)) {
        w.close();
        this.state.watchers.delete(d);
        this.state.gitignores.delete(d);
        this.state.stamps.delete(d);
      }
    }
    for (const d of this.state.polled) if (!want.has(d)) this.state.polled.delete(d);
    const walkedAt = this.opts.walkedAt?.() ?? Date.now();
    for (const d of dirs) this.directories.watchDir(d, walkedAt);
    this.opts.known.clear();
    for (const [k, v] of known) this.opts.known.set(k, v);
    this.state.sizes.clear();
    for (const [k, v] of sizes ?? []) this.state.sizes.set(k, v);
  }

  get watchedCount(): number {
    return this.state.watchers.size;
  }

  get polledDirs(): string[] {
    return [...this.state.polled];
  }

  /** Our own write of `rel`, stamped as written (`written`), else as it is on disk now: not reacted to. */
  noteOwnWrite(rel: string, written?: { mtimeMs: number; size: number }): void {
    try {
      const st = written ?? statSync(join(this.opts.root, rel));
      this.state.ownWrites.set(rel, st.mtimeMs);
      // Known at this stamp too, so a later sighting (a polled directory, a sweep) sees no change.
      if (this.opts.filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) {
        this.opts.known.set(rel, st.mtimeMs);
        this.state.sizes.set(rel, st.size);
      }
    } catch {}
  }

  close(): void {
    this.state.closed = true;
    for (const w of this.state.watchers.values()) w.close();
    this.state.watchers.clear();
    if (this.state.timer) clearTimeout(this.state.timer);
    if (this.state.pollTimer) clearInterval(this.state.pollTimer);
  }

  private ensurePollTimer(): void {
    if (this.state.pollTimer) return;
    this.state.pollTimer = setInterval(() => this.pollTick(), this.opts.pollMs ?? 2000);
    (this.state.pollTimer as { unref?: () => void }).unref?.();
  }

  /** Stat-scan polled directories (and, when degraded, open files) for changes. Exposed for tests. */
  pollTick(): void {
    const { filter, known, root } = this.opts;
    const tick = ++this.state.ticks;
    // A move's ends seen more than a tick apart are no move to pair any more.
    for (const [d, at] of this.state.leftSeen) if (at < tick - 1) this.state.leftSeen.delete(d);
    while (this.state.recentlyWent[0] && this.state.recentlyWent[0].tick < tick - 1) this.state.recentlyWent.shift();
    while (this.state.recentlyGone[0] && this.state.recentlyGone[0].tick < tick - 1) this.state.recentlyGone.shift();
    // Bun's fs.watch drops some events: a directory renamed out of the vault reports nothing, a
    // rename reports only the new name, and on macOS nothing at all is reported for a moment after
    // any watch is added or removed. So stat each watched directory: one gone is reported, one whose
    // mtime moved is listed again; and every ~15 ticks sweep every known note as a backstop.
    const statAt = Date.now();
    const moved: [string, number][] = [];
    for (const d of this.state.watchers.keys()) {
      const mtime = dirMtime(join(root, d));
      if (mtime === null) {
        if (d) this.state.pending.add(d);
      } else if (mtime !== this.state.stamps.get(d)) moved.push([d, mtime]);
    }
    // The sweep compares each known note's mtime and size, not just that it exists: fs.watch merges a
    // burst of writes (a git checkout) into an event or two, and a missed change would stay missed.
    if (tick % 15 === 0) {
      for (const rel of known.keys()) {
        const st = statOrNull(join(root, rel));
        if (
          !st ||
          st.mtimeMs !== known.get(rel) ||
          (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size)
        )
          this.state.pending.add(rel);
      }
    }
    for (const [dirRel, before] of this.state.gitignores) {
      const now = this.directories.gitignoreStamp(dirRel);
      if (now !== before) {
        this.state.gitignores.set(dirRel, now);
        filter.invalidate(dirRel);
        this.state.rescan = true;
      }
    }
    // The notes followed into folders left to the walk, whose folders no watch sees: looked at every tick.
    for (const rel of this.state.followed) {
      if (!known.has(rel) || this.state.watchers.has(parentOf(rel))) {
        this.state.followed.delete(rel);
        continue;
      }
      const st = statOrNull(join(root, rel));
      if (!st || st.mtimeMs !== known.get(rel) || (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size))
        this.state.pending.add(rel);
    }
    for (const dirRel of this.state.polled) {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(root, dirRel), { withFileTypes: true });
      } catch {
        this.state.polled.delete(dirRel);
        continue;
      }
      const seen = new Set<string>();
      for (const e of entries) {
        const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!this.state.watchers.has(rel) && !this.state.polled.has(rel) && filter.exclusion(rel, true) === null) {
            const to = this.directories.found(rel);
            if (to === "adopt") {
              this.directories.watchDir(rel);
              this.state.rescan = true;
            } else {
              this.directories.leave(rel, to);
              this.state.leftSeen.set(rel, tick); // where a note that went may be, for a tick
            }
          }
          continue;
        }
        if (!filter.isNoteName(e.name) || filter.exclusion(rel, false) !== null) continue;
        seen.add(rel);
        let mtime: number | undefined;
        try {
          mtime = statSync(join(root, rel)).mtimeMs;
        } catch {}
        if (mtime !== undefined && mtime !== known.get(rel)) this.state.pending.add(rel);
      }
      for (const rel of known.keys()) {
        const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        if (parent === dirRel && !seen.has(rel)) this.state.pending.add(rel);
      }
    }
    if (this.degraded) for (const rel of this.opts.pollTargets?.() ?? []) this.state.pending.add(rel);
    if (
      this.state.pending.size ||
      this.state.rescan ||
      this.state.toWalk.size ||
      (this.state.leftSeen.size && this.state.recentlyWent.length)
    )
      this.flush();
    if (moved.length) this.lookAgain(moved, statAt);
  }

  /**
   * List again the watched directories whose mtime moved (stat'ed at `statAt`), and add what came or
   * went there to the pending paths, as their events would have: a new note, attachment or
   * directory (adopted with all it holds), a known one gone. The debounce settles them with any
   * events that did come.
   */
  private lookAgain(moved: [string, number][], statAt: number): void {
    const { filter, known, root, listed } = this.opts;
    // What's known in each: whatever isn't listed there now went.
    const missing = new Map(moved.map(([d]) => [d, new Set(this.state.attachments.get(d))]));
    for (const rel of known.keys()) missing.get(parentOf(rel))?.add(rel);
    const before = this.state.pending.size;
    let seenLeft = false;
    for (const [d, mtime] of moved) {
      let entries: Dirent[];
      try {
        entries = readdirSync(join(root, d), { withFileTypes: true });
      } catch {
        continue; // gone since: the next tick reports it
      }
      this.state.stamps.set(d, settled(mtime, statAt));
      const gone = missing.get(d)!;
      for (const e of entries) {
        const rel = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) {
          // A folder the walk would take and not watched yet: adopted, with all it holds — unless a walk is to look into
          // it, and it's nothing to name (`found`): one left before is still left, its markers not looked for again.
          if (listed || this.state.watchers.has(rel) || this.state.polled.has(rel)) continue;
          const wasLeft = this.state.left.has(rel);
          if (!wasLeft && filter.exclusion(rel, true) !== null) continue;
          if (wasLeft || this.directories.found(rel) === "leave") {
            this.directories.leave(rel, "leave");
            if (!this.state.leftSeen.has(rel)) seenLeft = true;
            this.state.leftSeen.set(rel, this.state.ticks);
            continue;
          }
        } else {
          if (gone.delete(rel)) continue; // known, and still here
          if (listed && !filter.isNoteName(e.name)) continue;
          // As the walk takes it: a symlink to a file inside the root, or one you follow (0.11, VV-D6).
          if (filter.exclusion(rel, false) !== null || (e.isSymbolicLink() && !this.directories.symlinkKept(rel)))
            continue;
        }
        this.state.pending.add(rel);
      }
      for (const rel of gone) this.state.pending.add(rel);
    }
    // A folder left, found as a known note went lately: where it went, maybe (`movedTo`).
    if (this.state.pending.size > before || (seenLeft && this.state.recentlyWent.length)) this.schedule();
  }

  private degrade(reason: string): void {
    if (this.degraded) return;
    this.degraded = reason;
    for (const w of this.state.watchers.values()) w.close();
    this.state.watchers.clear();
    this.opts.onDegraded(`${reason} — falling back to polling open notes every ${every(this.opts.pollMs ?? 2000)}`);
    this.ensurePollTimer();
  }

  private schedule(): void {
    if (this.state.closed) return;
    if (this.state.timer) clearTimeout(this.state.timer);
    this.state.timer = setTimeout(() => this.flush(), this.opts.debounceMs);
  }

  /** Settle pending paths by stat. Exposed for tests. */
  flush(): void {
    this.state.timer = null;
    const leftSeen = [...this.state.leftSeen.keys()];
    const batch: Settling = {
      paths: [...this.state.pending],
      seen: new Set(),
      changes: [],
      rescan: this.state.rescan,
      found: [],
      candidates: leftSeen,
      following: this.opts.walkPending?.() ?? false,
    };
    this.state.pending.clear();
    this.state.rescan = false;
    this.reconciliation.settle(batch, batch.paths);
    this.reconciliation.vanished(batch);
    // Known notes moved lately into a folder left to the walk: found there, so they stay and the move is seen.
    if (batch.following && this.state.recentlyWent.length && batch.candidates.length) {
      const moved = this.reconciliation.movedTo(
        batch.candidates,
        new Set(batch.found),
        this.state.recentlyWent,
        this.state.recentlyGone,
      );
      this.reconciliation.settle(batch, moved);
      for (const rel of moved)
        if (this.opts.known.has(rel) && !this.state.watchers.has(parentOf(rel))) this.state.followed.add(rel);
    }
    for (const d of new Set(batch.found)) {
      if (batch.following) this.state.leftSeen.set(d, this.state.ticks); // where a note that goes next may be, for a tick
      // Named in order, each name taking its room under home's cap (`found` again: the room changed).
      const to = this.directories.found(d);
      if (to !== "adopt") this.directories.leave(d, to);
    }
    const toWalk = [...this.state.toWalk];
    this.state.toWalk.clear();
    const { changes, rescan } = batch;
    if (changes.length || rescan || toWalk.length)
      this.opts.onBatch({ changes, rescan, ...(toWalk.length ? { toWalk } : {}) });
  }

  watchNamed(dirs: readonly string[], listed: (dirRel: string) => boolean): void {
    this.directories.watchNamed(dirs, listed);
  }
}
export type { WatchChange, WatchBatch, WatcherOptions } from "./watch/contracts.ts";

export { watchTakes } from "./watch/io.ts";
