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
//
// What it reads, it reads as looks (watch/reads.ts, SD-D8): each batch asked of the disk threads in the TUI, the screen
// going on meanwhile, and the answer compared with what's known when it comes (SD-D5) — or, a test's, answered here at
// once. One look is out at a time: a tick while one is waits for it, and so does a flush — or, a look in slices (a
// tick's, the stamps'), for its slice. A look given up on (SD-D6) is said once (`onNotAnswering`), and the next waits a
// minute.

import * as disk from "../../foundation/platform/disk.ts";
import { join } from "node:path";
import { type PathStat, parentOf, settled } from "../walk/io/stamps.ts";
import type { WatcherOptions, Settling } from "./watch/contracts.ts";
import { WatchState } from "./watch/state.ts";
import { WatchDirectories } from "./watch/directories.ts";
import { WatchReconciliation } from "./watch/reconciliation.ts";
import { every, noteStamp, watchTakes } from "./watch/io.ts";
import type { JudgedFolder, JudgedListing } from "./watch/judging.ts";
import {
  drive,
  type Look,
  type LookEnd,
  readsHere,
  readsOnThreads,
  SLICE,
  statsInSlices,
  type WatchReads,
} from "./watch/reads.ts";
import { tickGroups } from "./watch/ticks.ts";

/** How long the looks wait after one is given up on (SD-D6): the disk's minute. */
const PAUSE_MS = 60_000;

export class VaultWatcher {
  private readonly state = new WatchState();
  private readonly directories: WatchDirectories;
  private readonly reconciliation: WatchReconciliation;
  private readonly reads: WatchReads;
  degraded: string | null = null;

  /** A look given up on (SD-D6), the disk not answering in time: until the next one answers. */
  notAnswering = false;

  /** When the looks start again after one was given up on (epoch ms, `now`). */
  private pausedUntil = 0;

  /** A look out (`run`), its answer not come: a tick meanwhile asks nothing, a flush waits for it, or for its slice
   *  (`flushWanted`). */
  private out = false;
  private flushWanted = false;

  /** Why the look out is ending early, while its own `finally` blocks run (`drive`'s `ending`). */
  private ending: LookEnd["how"] | null = null;

  /** The sweep under way on the disk threads: a chain of its own, one at a time. */
  private sweeping = false;

  private kicked = false;

  /** The group a tick's slices start at: after the slice the last tick given up on, so one that never answers doesn't
   *  keep those behind it from being looked at. */
  private tickFrom = 0;

  constructor(private readonly opts: WatcherOptions) {
    const owner = this;
    this.directories = new WatchDirectories(
      opts,
      this.state,
      () => {
        try {
          return disk.realpath(opts.root);
        } catch {
          return opts.root;
        }
      },
      {
        get degraded() {
          return owner.degraded;
        },
        degrade: (reason) => this.degrade(reason),
        ensurePollTimer: () => this.ensurePollTimer(),
        schedule: () => this.schedule(),
        stampLater: (dirRel, readAt) => this.stampLater(dirRel, readAt),
      },
    );
    this.reconciliation = new WatchReconciliation(opts, this.state, this.directories);
    this.reads = opts.offThread ? readsOnThreads() : readsHere(() => this.directories.judging());

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

  /** After a rescan: watch exactly `dirs`, and adopt the new graph's notes as known. A look out answers too late. */
  sync(dirs: string[], known: Map<string, number>, sizes?: Map<string, number>): void {
    this.state.syncs++;
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

  /** Our own write of `rel`, stamped as written (`written`), else as it is on disk now: not reacted to — nor a look's
   *  stat of it asked before (SD-D5). */
  noteOwnWrite(rel: string, written?: { mtimeMs: number; size: number }): void {
    this.state.writtenAt.set(rel, this.state.writes++);
    try {
      const st = written ?? disk.stat(join(this.opts.root, rel));
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

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /** Whether a look may be asked now: none out, none given up on in the last minute. */
  private free(): boolean {
    return !this.state.closed && !this.out && this.now() >= this.pausedUntil;
  }

  /**
   * A look run to its end (`drive`): one at a time, its answers taken while the watcher is the one it was asked of — not
   * closed, not synced since (SD-D5). Then whatever waited for it: a flush, the stamps of folders registered meanwhile.
   */
  private run(look: Look): void {
    this.out = true;
    const syncs = this.state.syncs;
    drive(look, this.reads, () => !this.state.closed && this.state.syncs === syncs, {
      now: () => this.now(),
      answered: (at) => this.answered(at),
      ending: (how) => {
        this.ending = how;
      },
      end: (e) => {
        this.out = false;
        this.ended(e);
        this.after();
      },
    });
  }

  private ended(e: LookEnd): void {
    if (!this.out && !this.sweeping) this.state.writtenAt.clear(); // no look asked before them is out
    if (e.how !== "failed" || this.state.closed) return;
    this.pausedUntil = this.now() + PAUSE_MS;
    if (this.notAnswering) return;
    this.notAnswering = true;
    this.opts.onNotAnswering?.(true);
  }

  /** A look answered, asked at `askedAt`: the disk answers again — once a look asked after the pause answers, never
   *  one asked before it was given up on. */
  private answered(askedAt: number): void {
    if (!this.notAnswering || this.state.closed || askedAt < this.pausedUntil) return;
    this.notAnswering = false;
    this.pausedUntil = 0;
    this.opts.onNotAnswering?.(false);
  }

  private after(): void {
    if (!this.free()) return;
    if (this.flushWanted) this.flush();
    else if (this.state.unstamped.size) this.run(this.stamping());
  }

  /** A folder registered on the disk threads' way: its stamps asked by a look of their own, once none is out. */
  private stampLater(dirRel: string, readAt: number): boolean {
    if (this.reads.here) return false;
    this.state.unstamped.set(dirRel, readAt);
    if (!this.kicked) {
      this.kicked = true;
      queueMicrotask(() => {
        this.kicked = false;
        this.after();
      });
    }
    return true;
  }

  /** The folders registered whose stamps are still to be read, still watched, taken to be asked. */
  private unstamped(): Map<string, number> {
    const taken = new Map<string, number>();
    for (const [d, at] of this.state.unstamped) if (this.state.watchers.has(d)) taken.set(d, at);
    this.state.unstamped.clear();
    return taken;
  }

  /** Folders taken to be stamped and not (their look ended early): still to be. */
  private unstampedAgain(taken: Map<string, number>): void {
    for (const [d, at] of taken) if (!this.state.unstamped.has(d)) this.state.unstamped.set(d, at);
  }

  /** The stamps of the folders registered since the last look (`watchDir`'s two stats): a folder and its `.gitignore`,
   *  a slice at a time, each folder stamped as its slice answers. */
  private *stamping(): Look {
    const { root } = this.opts;
    const taken = this.unstamped();
    const groups = [...taken].map(([d, readAt]) => ({
      paths: [join(root, d), join(root, d, ".gitignore")],
      seen: ([dir, gitignore]: PathStat[]) => {
        taken.delete(d);
        if (this.state.watchers.has(d)) this.directories.stamp(d, readAt, { dir: dir!, gitignore: gitignore! });
      },
    }));
    let done = false;
    try {
      yield* statsInSlices(groups, { between: () => this.flushBetween() });
      done = true;
    } finally {
      if (!done) this.unstampedAgain(taken); // those not stamped yet
    }
  }

  /** Between a look's slices: a flush wanted meanwhile, so a change heard waits for a slice, not for the whole look. */
  private *flushBetween(): Look {
    if (this.flushWanted) yield* this.flushing();
  }

  /** Stat-scan polled directories (and, when degraded, open files) for changes. Exposed for tests. */
  pollTick(): void {
    if (this.free()) this.run(this.ticking());
  }

  /**
   * A tick's look: each watched folder and its `.gitignore`, each note followed, statted a slice at a time — the first
   * slice with each polled folder listed, its notes statted — each slice compared, as it answers, with what's known then.
   * One given up on keeps what answered before; the next tick starts after it, and goes round to it.
   */
  private *ticking(): Look {
    const { known, root } = this.opts;
    const { state } = this;
    const tick = ++state.ticks;
    // A move's ends seen more than a tick apart are no move to pair any more.
    for (const [d, at] of state.leftSeen) if (at < tick - 1) state.leftSeen.delete(d);
    while (state.recentlyWent[0] && state.recentlyWent[0].tick < tick - 1) state.recentlyWent.shift();
    while (state.recentlyGone[0] && state.recentlyGone[0].tick < tick - 1) state.recentlyGone.shift();
    // Bun's fs.watch drops some events: a directory renamed out of the vault reports nothing, a
    // rename reports only the new name, and on macOS nothing at all is reported for a moment after
    // any watch is added or removed. So stat each watched directory: one gone is reported, one whose
    // mtime moved is listed again; and every ~15 ticks sweep every known note as a backstop.
    const fresh = this.unstamped();
    for (const rel of state.followed)
      if (!known.has(rel) || state.watchers.has(parentOf(rel))) state.followed.delete(rel);
    const moved: [string, number][] = [];
    const groups = tickGroups(this.opts, state, this.directories, fresh, moved);
    const polled = [...state.polled];
    const list = polled.map((d) => ({
      dir: join(root, d),
      judge: this.directories.judged({
        entries: { skip: this.directories.childNames(d), notesOnly: true, stat: true, links: false },
      }),
    }));
    const seen = (listings: JudgedListing[]) =>
      polled.forEach((dirRel, k) => this.directories.polledSeen(dirRel, listings[k] as JudgedFolder, tick));
    const statAt = Date.now();
    const from = this.tickFrom;
    let next = from;
    let done = false;
    try {
      const asking = (k: number) => {
        next = k;
      };
      yield* statsInSlices(groups, { from, listed: { list, seen }, between: () => this.flushBetween(), asking });
      done = true;
    } finally {
      if (!done) {
        this.unstampedAgain(fresh); // those not stamped yet: by the next look
        this.tickFrom = next; // the next tick starts after the slice given up on, and goes round to it
      }
    }
    // The sweep compares each known note's mtime and size, not just that it exists: fs.watch merges a
    // burst of writes (a git checkout) into an event or two, and a missed change would stay missed.
    if (tick % 15 === 0) {
      if (this.reads.here) yield* this.sweep(false);
      else this.startSweep();
    }
    if (this.degraded) for (const rel of this.opts.pollTargets?.() ?? []) state.pending.add(rel);
    if (state.pending.size || state.rescan || state.toWalk.size || (state.leftSeen.size && state.recentlyWent.length))
      yield* this.flushing();
    if (moved.length) yield* this.lookingAgain(moved, statAt);
  }

  /** The sweep on the disk threads, unless one is under way or the looks are paused: its slices asked one after
   *  another, ticks going on — dropped once they pause (SD-D6), asking nothing more meanwhile. */
  private startSweep(): void {
    if (this.sweeping || this.now() < this.pausedUntil) return;
    this.sweeping = true;
    const syncs = this.state.syncs;
    const current = () => !this.state.closed && this.state.syncs === syncs && this.now() >= this.pausedUntil;
    drive(this.sweep(true), this.reads, current, {
      now: () => this.now(),
      answered: (at) => this.answered(at),
      ending: () => {},
      end: (e) => {
        this.sweeping = false;
        this.ended(e);
      },
    });
  }

  /** Every known note statted, a slice at a time: one changed or gone pending — settled at once when on its own. */
  private *sweep(alone: boolean): Look {
    const { known, root } = this.opts;
    const notes = [...known.keys()];
    for (let i = 0; i < notes.length; i += SLICE) {
      const slice = notes.slice(i, i + SLICE);
      const asked = this.state.writes;
      const { stats } = yield { stat: { paths: slice.map((rel) => join(root, rel)) } };
      const before = this.state.pending.size;
      slice.forEach((rel, k) => {
        const was = known.get(rel);
        if (was === undefined || (this.state.writtenAt.get(rel) ?? -1) >= asked) return; // gone, or ours since
        const st = noteStamp(stats[k]);
        if (!st || st.mtimeMs !== was || (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size))
          this.state.pending.add(rel);
      });
      if (alone && this.state.pending.size > before) this.flush();
    }
  }

  /**
   * List again the watched directories whose mtime moved (stat'ed at `statAt`), and add what came or
   * went there to the pending paths, as their events would have: a new note, attachment or
   * directory (adopted with all it holds), a known one gone. The debounce settles them with any
   * events that did come. A look of its own, exposed for tests (the tick asks it with its own).
   */
  lookAgain(moved: [string, number][], statAt: number): void {
    this.run(this.lookingAgain(moved, statAt));
  }

  /** `lookAgain` as a look: each folder listed and its entries judged where it's read, compared with what's known then. */
  private *lookingAgain(moved: [string, number][], statAt: number): Look {
    const { filter, known, root, listed } = this.opts;
    const { state } = this;
    const list = moved.map(([d]) => ({
      dir: join(root, d),
      judge: this.directories.judged({
        entries: {
          skip: listed ? null : this.directories.childNames(d, true),
          notesOnly: !!listed,
          stat: false,
          links: true,
        },
      }),
    }));
    const { listings } = yield { list };
    // What's known in each: whatever isn't listed there now went.
    const missing = new Map(moved.map(([d]) => [d, new Set(state.attachments.get(d))]));
    for (const rel of known.keys()) missing.get(parentOf(rel))?.add(rel);
    const before = state.pending.size;
    let seenLeft = false;
    moved.forEach(([d, mtime], k) => {
      const listing = listings[k] as JudgedFolder;
      if (listing.error !== null) return; // gone since: the next tick reports it
      state.stamps.set(d, settled(mtime, statAt));
      const gone = missing.get(d)!;
      for (const e of listing.entries) {
        const rel = d ? `${d}/${e.name}` : e.name;
        if (e.kind === "dir") {
          // A folder the walk would take and not watched yet: adopted, with all it holds — unless a walk is to look into
          // it, and it's nothing to name (`found`): one left before is still left, its markers not looked for again.
          if (listed || state.watchers.has(rel) || state.polled.has(rel)) continue;
          const wasLeft = state.left.has(rel);
          // Not judged (watched or left when asked, and not now): gone since, as its parent's next look says.
          if (!wasLeft && e.excluded !== null) continue;
          if (wasLeft || this.directories.found(rel) === "leave") {
            this.directories.leave(rel, "leave");
            if (!state.leftSeen.has(rel)) seenLeft = true;
            state.leftSeen.set(rel, state.ticks);
            continue;
          }
        } else {
          if (gone.delete(rel)) continue; // known, and still here
          if (listed && !filter.isNoteName(e.name)) continue;
          // As the walk takes it: a symlink to a file inside the root, or one you follow (0.11, VV-D6).
          if (e.excluded !== null || (e.kind === "link" && !(e.link && this.directories.symlinkKept(rel, e.link))))
            continue;
        }
        state.pending.add(rel);
      }
      for (const rel of gone) state.pending.add(rel);
    });
    // A folder left, found as a known note went lately: where it went, maybe (`movedTo`).
    if (state.pending.size > before || (seenLeft && state.recentlyWent.length)) this.schedule();
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

  /** Settle pending paths by stat — once the look out has answered, or its slice has. Exposed for tests. */
  flush(): void {
    this.state.timer = null;
    if (this.out || this.now() < this.pausedUntil) {
      this.flushWanted = true;
      return;
    }
    this.flushWanted = false;
    this.run(this.flushing());
  }

  /** `flush` as a look: what the settle reads asked of the disk, and the batch said once it all answered. */
  private *flushing(): Look {
    const { state } = this;
    this.flushWanted = false; // this one takes what's pending
    const leftSeen = [...state.leftSeen.keys()];
    const batch: Settling = {
      paths: [...state.pending],
      seen: new Set(),
      changes: [],
      rescan: state.rescan,
      found: [],
      candidates: leftSeen,
      following: this.opts.walkPending?.() ?? false,
    };
    state.pending.clear();
    state.rescan = false;
    let done = false;
    try {
      yield* this.reconciliation.settle(batch, batch.paths);
      yield* this.reconciliation.vanishing(batch);
      // Known notes moved lately into a folder left to the walk: found there, so they stay and the move is seen.
      if (batch.following && state.recentlyWent.length && batch.candidates.length) {
        const moved = yield* this.reconciliation.movedTo(
          batch.candidates,
          new Set(batch.found),
          state.recentlyWent,
          state.recentlyGone,
        );
        batch.paths.push(...moved); // settled with the rest, or pending again with them
        yield* this.reconciliation.settle(batch, batch.paths);
        for (const rel of moved)
          if (this.opts.known.has(rel) && !state.watchers.has(parentOf(rel))) state.followed.add(rel);
      }
      done = true;
    } finally {
      if (!done) this.unsettled(batch);
    }
    for (const d of new Set(batch.found)) {
      if (batch.following) state.leftSeen.set(d, state.ticks); // where a note that goes next may be, for a tick
      // Named in order, each name taking its room under home's cap (`found` again: the room changed).
      const to = this.directories.found(d);
      if (to !== "adopt") this.directories.leave(d, to);
    }
    const toWalk = [...state.toWalk];
    state.toWalk.clear();
    const { changes, rescan } = batch;
    if (changes.length || rescan || toWalk.length)
      this.opts.onBatch({ changes, rescan, ...(toWalk.length ? { toWalk } : {}) });
  }

  /**
   * A flush's look ended before it settled all: given up on (SD-D6), what it settled is said, the rest pending again;
   * dropped (synced since, SD-D5), all of it pending again, to be settled against what the build knows.
   */
  private unsettled(batch: Settling): void {
    const { state } = this;
    if (state.closed) return;
    const failed = this.ending === "failed";
    for (const rel of batch.paths) if (!failed || !batch.seen.has(rel)) state.pending.add(rel);
    if (!failed) {
      state.rescan ||= batch.rescan;
      return;
    }
    if (batch.changes.length || batch.rescan) this.opts.onBatch({ changes: batch.changes, rescan: batch.rescan });
  }

  watchNamed(dirs: readonly string[], listed: (dirRel: string) => boolean): void {
    this.directories.watchNamed(dirs, listed);
  }
}
export type { WatchChange, WatchBatch, WatcherOptions } from "./watch/contracts.ts";

export { watchTakes } from "./watch/io.ts";
