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

import {
  type Dirent,
  existsSync,
  type FSWatcher,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
  watch,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { under, walksInto } from "./home.ts";
import { symlinkVerdict, type WalkFilter } from "./walk.ts";

export interface WatchChange {
  rel: string;
  kind: "created" | "changed" | "deleted";
  isNote: boolean;
}

export interface WatchBatch {
  changes: WatchChange[];
  /**
   * A .gitignore changed, a directory was added or a directory event came without a name: the walk
   * may differ, so rebuild.
   */
  rescan: boolean;
  /**
   * Folders come into one looked into that a walk is to look into (`leftToWalk`: into home's top before its walk,
   * VV-D2), each named once: for the graph to list, and the watcher to watch (`watchNamed`) — never looking in — and the
   * walk to be asked for again.
   */
  toWalk?: string[];
}

export interface WatcherOptions {
  root: string;
  filter: WalkFilter;
  dirs: string[];
  debounceMs: number;
  onBatch: (batch: WatchBatch) => void;
  /** Called once when watching degrades (registration failure). */
  onDegraded: (reason: string) => void;
  /** Called when one directory cannot be watched and is polled instead. */
  onWarn?: (message: string) => void;
  /** Known files and their mtimes, so change vs create vs no-op can be told apart. */
  known: Map<string, number>;
  /** Their sizes, so a same-mtime rewrite that changes the size counts from the start. */
  sizes?: Map<string, number>;
  /** Files to poll when degraded (open buffers). */
  pollTargets?: () => string[];
  pollMs?: number;
  /** The non-note files known (the graph's attachments), so a directory listed again reports only
   *  those that came or went. */
  attachments?: Iterable<string>;
  /** When the walk that found the directories given (`dirs`, or `sync`'s) began: one changed since
   *  may hold what it didn't see, so it is listed again on the next tick. */
  walkedAt?: () => number;
  /** A folder listed, not walked (`~` or `/`, 20.22): its subdirectories aren't the vault's, so a
   *  second look at it takes in none of them, nor any file but a note. */
  listed?: boolean;
  /** Home's cap (VV-D2): how many folders it watches at most — a folder that comes past it isn't taken in, left to
   *  home's walk, which holds the cap. */
  maxDirs?: number;
  /** A folder a walk is to look into, never the watcher (home before its first walk, VV-D2: `waitsForHomeWalk`). */
  leftToWalk?: (dirRel: string) => boolean;
  /** Home's walk still to make (VV-D2): only then are notes moved into what it's left followed (`movedTo`). */
  walkPending?: () => boolean;
  /** The clock (epoch ms): tests set it. */
  now?: () => number;
}

/** A batch being settled (`flush`): the paths, what came of them, and the folders left to a walk among them. */
interface Settling {
  paths: string[];
  seen: Set<string>;
  changes: WatchChange[];
  rescan: boolean;
  /** Folders found unwatched in this batch that a walk is to look into (`found`). */
  found: string[];
  /** Where known notes that went may be now: those, and the folders second looks left lately (`leftSeen`). */
  candidates: string[];
  /** Whether moves are followed: home's walk still to make. */
  following: boolean;
}

/**
 * How long after a directory changes its mtime can't tell a later change apart: a coarse clock (FAT's
 * 2 s, HFS+'s 1 s, Linux's tick) can give the next change the same mtime. A directory read that soon
 * after its change is listed again on the next tick.
 */
const SETTLE_MS = 2000;

/** A known note that went (`flush`): where it was, its time and size then, and the tick it went in. */
interface Went {
  rel: string;
  mtimeMs: number;
  size: number | undefined;
  tick: number;
  /** When it was seen gone (epoch ms). */
  at: number;
}

export class VaultWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private pending = new Set<string>();
  private rescan = false;
  /** Folders found for a walk to look into, to name in the next batch (`WatchBatch.toWalk`). */
  private readonly toWalk = new Set<string>();
  /**
   * The folders found and left to a walk (`leftToWalk`), and whether each was named (`WatchBatch.toWalk`): one named is
   * never named again — a folder polled finds it at every tick until it's watched, and for good once watching degraded —
   * and holds its room under home's cap until it is; one gone was never a file, so nothing is said. Forgotten when it
   * goes, or once the graph took its name (`watchNamed`).
   */
  private readonly left = new Map<string, boolean>();
  /** Folders left that a second look found lately, by the tick: where a known note that went may be now (`movedTo`). */
  private readonly leftSeen = new Map<string, number>();
  /** Known notes that went lately: a move's two ends may come in two batches, the second look's a tick later. */
  private readonly recentlyWent: Went[] = [];
  /**
   * The folders that went lately holding known notes, the other files known in them (an embed's picture), by the tick:
   * renamed or moved, maybe (`movedTo`).
   */
  private readonly recentlyGone: { dir: string; files: string[]; tick: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ownWrites = new Map<string, number>();
  /** Sizes beside the known mtimes: a same-second rewrite that changes the size still counts. */
  private readonly sizes = new Map<string, number>();
  /** Directories whose watch failed (e.g. Bun's fs.watch errors on a broken symlink inside). */
  private readonly polled = new Set<string>();
  degraded: string | null = null;
  private closed = false;

  /** mtime of each watched directory's .gitignore (-1 when absent). Bun's fs.watch reports no
   *  events for dot-files, so these are polled on the housekeeping tick. */
  private readonly gitignores = new Map<string, number>();

  /** Each watched directory's mtime when what it holds was last known, or -1 to list it again on the
   *  next tick: a change since that no event reported is found by its mtime (`lookAgain`). */
  private readonly stamps = new Map<string, number>();

  /** The non-note files known, by their directory: what a directory listed again holds beyond them
   *  and the notes known is new. */
  private readonly attachments = new Map<string, Set<string>>();

  /** The root's real path: a symlink is kept when it points inside it, or out and you follow it (0.11, VV-D6). */
  private readonly realRoot: string;

  constructor(private readonly opts: WatcherOptions) {
    let realRoot = opts.root;
    try {
      realRoot = realpathSync(opts.root);
    } catch {}
    this.realRoot = realRoot;
    for (const [k, v] of opts.sizes ?? []) this.sizes.set(k, v);
    for (const rel of opts.attachments ?? []) this.attachment(rel, true);
    const walkedAt = opts.walkedAt?.() ?? Date.now();
    for (const d of opts.dirs) this.watchDir(d, walkedAt);
    this.ensurePollTimer();
  }

  /** After a rescan: watch exactly `dirs`, and adopt the new graph's notes as known. */
  sync(dirs: string[], known: Map<string, number>, sizes?: Map<string, number>): void {
    // Home's walk kept: nothing left to it any more — what the watcher left, and moves to follow, forgotten.
    if (!this.opts.walkPending?.()) {
      this.left.clear();
      this.leftSeen.clear();
      this.recentlyWent.length = 0;
      this.recentlyGone.length = 0;
    }
    const want = new Set(dirs);
    for (const [d, w] of this.watchers) {
      if (!want.has(d)) {
        w.close();
        this.watchers.delete(d);
        this.gitignores.delete(d);
        this.stamps.delete(d);
      }
    }
    for (const d of this.polled) if (!want.has(d)) this.polled.delete(d);
    const walkedAt = this.opts.walkedAt?.() ?? Date.now();
    for (const d of dirs) this.watchDir(d, walkedAt);
    this.opts.known.clear();
    for (const [k, v] of known) this.opts.known.set(k, v);
    this.sizes.clear();
    for (const [k, v] of sizes ?? []) this.sizes.set(k, v);
  }

  private gitignoreStamp(dirRel: string): number {
    try {
      return statSync(join(this.opts.root, dirRel, ".gitignore")).mtimeMs;
    } catch {
      return -1;
    }
  }

  private unwatchTree(dirRel: string): void {
    for (const [d, w] of this.watchers) {
      if (d === dirRel || d.startsWith(`${dirRel}/`)) {
        w.close();
        this.watchers.delete(d);
        this.gitignores.delete(d);
        this.stamps.delete(d);
      }
    }
    for (const d of this.polled) if (d === dirRel || d.startsWith(`${dirRel}/`)) this.polled.delete(d);
  }

  /** Watch a directory that appeared (created, or moved in with its contents) and everything
   *  below it; return the files already inside — notes and attachments — which are new to us. */
  private adoptTree(dirRel: string): string[] {
    const files: string[] = [];
    const max = this.opts.maxDirs ?? Number.POSITIVE_INFINITY;
    const visit = (d: string) => {
      // Past home's cap (VV-D2): left to its walk, never listed here.
      if (this.watchers.size + this.polled.size >= max) return;
      this.watchDir(d);
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(this.opts.root, d), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) {
          if (this.opts.filter.exclusion(rel, true) === null) visit(rel);
        } else if (e.isSymbolicLink() && !this.symlinkKept(rel)) continue;
        else if (this.opts.filter.exclusion(rel, false) === null) files.push(rel);
      }
    };
    visit(dirRel);
    return files;
  }

  /**
   * Whether the symlink at `rel` is one the walk keeps (0.11, VV-D6), and as what: a file inside the root that isn't a
   * note already known by its own path, or one outside you follow (`"file"`); a folder outside you follow (`"dir"`),
   * watched as the walk walks it; else null — a folder within the root (a second name), a link not followed.
   */
  private symlinkKept(rel: string): "file" | "dir" | null {
    const v = symlinkVerdict(join(this.opts.root, rel), this.realRoot);
    if (!v.kept) return null;
    if (v.dir) return "dir";
    const target = relative(this.realRoot, v.target).split(sep).join("/");
    return target === rel || !this.opts.known.has(target) ? "file" : null;
  }

  /**
   * What becomes of a folder found that isn't watched: taken in with all it holds (`adopt`); or, a walk's to look into
   * (`leftToWalk`), left — come into a folder looked into (home's top), named once in a batch for the graph to list it
   * (`ask`, `WatchBatch.toWalk`), within home's cap; in one left to the walk itself, named already, or with watching
   * degraded, nothing more (`leave`): the walk takes it with the rest.
   */
  private found(dirRel: string): "adopt" | "ask" | "leave" {
    const walks = this.opts.leftToWalk;
    if (!walks?.(dirRel)) return "adopt";
    if (walks(parentOf(dirRel)) || this.left.get(dirRel) || this.degraded) return "leave";
    return this.room() > 0 ? "ask" : "leave";
  }

  /** How many more folders home's cap (`maxDirs`) lets it watch: those named and not watched yet count already. */
  private room(): number {
    let n = this.watchers.size + this.polled.size;
    for (const [d, named] of this.left) if (named && !this.watchers.has(d) && !this.polled.has(d)) n++;
    return (this.opts.maxDirs ?? Number.POSITIVE_INFINITY) - n;
  }

  /** A folder found and left to the walk: named for it (`found`'s `ask`) or not, kept (`left`). */
  private leave(dirRel: string, to: "ask" | "leave"): void {
    if (to === "ask") this.toWalk.add(dirRel);
    if (to === "ask" || !this.left.has(dirRel)) this.left.set(dirRel, to === "ask");
  }

  /** A folder left to the walk, gone or taken: forgotten, with the folders in it — found again, it's new. */
  private forget(dirRel: string): void {
    for (const d of this.left.keys()) if (under(d, dirRel)) this.left.delete(d);
    for (const d of this.leftSeen.keys()) if (under(d, dirRel)) this.leftSeen.delete(d);
  }

  /**
   * Where known notes that went (`went`) are now, in folders left to the walk (`into`): the same file by its time and size
   * (a move keeps them), under the same path below a folder that went (`gone`: renamed or moved there — the other files
   * known in it with them) or at the folder's top under any name (a note moved into it). Those alone: the rest of such a
   * folder is the walk's. A note only into a folder found in this batch (`fresh`), or one changed since a little before
   * it went — never a copy made long ago (`cp -a`), its times kept, though another note went just now — and never one
   * home's walk wouldn't go into, nor through one (`walksInto`): a vault made in it, or a link it doesn't follow, since
   * it was found.
   */
  private movedTo(
    into: readonly string[],
    fresh: ReadonlySet<string>,
    went: readonly Went[],
    gone: readonly { dir: string; files: string[] }[],
  ): string[] {
    const { filter, root } = this.opts;
    const walked = new Map<string, boolean>();
    const walks = (dir: string) => walked.get(dir) ?? walked.set(dir, walksInto(root, filter, dir)).get(dir)!;
    const same = (rel: string, w: Went) => {
      const st = statOrNull(join(root, rel));
      return !!st && st.mtimeMs === w.mtimeMs && (w.size === undefined || st.size === w.size);
    };
    // A note seen gone a tick at most after it went, and a coarse clock (a rename changes the folder's ctime, not its
    // mtime).
    const late = Math.min(this.opts.pollMs ?? 2000, 10_000) + SETTLE_MS;
    const byTime = new Map<number, Went[]>();
    for (const w of went) {
      const bucket = byTime.get(w.mtimeMs);
      if (bucket) bucket.push(w);
      else byTime.set(w.mtimeMs, [w]);
    }
    const folders = gone.map((g) => ({ ...g, notes: went.filter((w) => w.rel.startsWith(`${g.dir}/`)) }));
    const there = new Set<string>();
    for (const d of new Set(into)) {
      const changed = fresh.has(d) ? Number.POSITIVE_INFINITY : (changedAt(join(root, d)) ?? Number.NEGATIVE_INFINITY);
      /** A note that went before `d` changed, give or take: one that can be in it (not a copy made long before). */
      const after = (w: Went) => changed >= w.at - late;
      if (!went.some(after) || !walks(d)) continue;
      // A folder that went, here now: its notes, once one of the first few is (another may have gone alone), and the
      // other files known in it.
      for (const g of folders) {
        const notes = g.notes.filter(after);
        const at = (rel: string) => `${d}${rel.slice(g.dir.length)}`;
        if (!notes.slice(0, 20).some((w) => same(at(w.rel), w))) continue;
        for (const w of notes) if (same(at(w.rel), w) && walks(parentOf(at(w.rel)))) there.add(at(w.rel));
        for (const f of g.files) {
          const rel = at(f);
          if (!this.attachments.get(parentOf(rel))?.has(rel) && existsSync(join(root, rel)) && walks(parentOf(rel)))
            there.add(rel); // not found there before (a later batch in the tick looks again)
        }
      }
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(root, d), { withFileTypes: true });
      } catch {}
      for (const e of entries) {
        if (!e.isFile()) continue;
        const rel = `${d}/${e.name}`;
        const st = statOrNull(join(root, rel));
        if (st && byTime.get(st.mtimeMs)?.some((w) => after(w) && (w.size === undefined || st.size === w.size)))
          there.add(rel);
      }
    }
    return [...there];
  }

  /**
   * The folders a batch named for the walk (`WatchBatch.toWalk`), as the graph took them: those it listed (`listed`)
   * watched, closing none (`sync` watches exactly what it's given), within home's cap — what changed in them since the
   * graph's walk listed on the next tick. Each is forgotten, to be named again if it's found again unwatched.
   */
  watchNamed(dirs: readonly string[], listed: (dirRel: string) => boolean): void {
    const walkedAt = this.opts.walkedAt?.() ?? Date.now();
    const max = this.opts.maxDirs ?? Number.POSITIVE_INFINITY;
    for (const d of dirs) {
      this.left.delete(d);
      if (listed(d) && this.watchers.size + this.polled.size < max) this.watchDir(d, walkedAt);
    }
  }

  get watchedCount(): number {
    return this.watchers.size;
  }

  get polledDirs(): string[] {
    return [...this.polled];
  }

  /** Our own write of `rel`, stamped as written (`written`), else as it is on disk now: not reacted to. */
  noteOwnWrite(rel: string, written?: { mtimeMs: number; size: number }): void {
    try {
      const st = written ?? statSync(join(this.opts.root, rel));
      this.ownWrites.set(rel, st.mtimeMs);
      // Known at this stamp too, so a later sighting (a polled directory, a sweep) sees no change.
      if (this.opts.filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) {
        this.opts.known.set(rel, st.mtimeMs);
        this.sizes.set(rel, st.size);
      }
    } catch {}
  }

  close(): void {
    this.closed = true;
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    if (this.timer) clearTimeout(this.timer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** Watch a directory whose contents were read at `readAt` (the walk's, or a listing about to be). */
  private watchDir(dirRel: string, readAt = Date.now()): void {
    if (this.watchers.has(dirRel) || this.degraded) return;
    try {
      const w = watch(join(this.opts.root, dirRel), { persistent: false }, (_event, name) => {
        if (!name) {
          this.rescan = true;
          this.schedule();
          return;
        }
        const rel = dirRel ? `${dirRel}/${name.toString()}` : name.toString();
        this.pending.add(rel);
        this.schedule();
      });
      w.on("error", (err) => {
        w.close();
        this.watchers.delete(dirRel);
        // Gone: a parent event reports the deletion. Still there: never go quiet — poll it.
        if (existsSync(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
      });
      this.watchers.set(dirRel, w);
      this.gitignores.set(dirRel, this.gitignoreStamp(dirRel));
      this.stamps.set(dirRel, settled(dirMtime(join(this.opts.root, dirRel)), readAt));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EMFILE" || code === "ENFILE")
        this.degrade(`${code}: the system watch limit is exhausted (${this.watchers.size} directories watched)`);
      else if (existsSync(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
    }
  }

  private pollDir(dirRel: string, reason: string): void {
    if (this.closed || this.polled.has(dirRel)) return;
    this.polled.add(dirRel);
    this.opts.onWarn?.(
      `cannot watch ${dirRel || "the vault's top folder"} (${reason.split("\n")[0]}) — polling it every ${every(this.opts.pollMs ?? 2000)} instead`,
    );
    this.ensurePollTimer();
  }

  private ensurePollTimer(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollTick(), this.opts.pollMs ?? 2000);
    (this.pollTimer as { unref?: () => void }).unref?.();
  }

  private ticks = 0;

  /** Stat-scan polled directories (and, when degraded, open files) for changes. Exposed for tests. */
  pollTick(): void {
    const { filter, known, root } = this.opts;
    const tick = ++this.ticks;
    // A move's ends seen more than a tick apart are no move to pair any more.
    for (const [d, at] of this.leftSeen) if (at < tick - 1) this.leftSeen.delete(d);
    while (this.recentlyWent[0] && this.recentlyWent[0].tick < tick - 1) this.recentlyWent.shift();
    while (this.recentlyGone[0] && this.recentlyGone[0].tick < tick - 1) this.recentlyGone.shift();
    // Bun's fs.watch drops some events: a directory renamed out of the vault reports nothing, a
    // rename reports only the new name, and on macOS nothing at all is reported for a moment after
    // any watch is added or removed. So stat each watched directory: one gone is reported, one whose
    // mtime moved is listed again; and every ~15 ticks sweep every known note as a backstop.
    const statAt = Date.now();
    const moved: [string, number][] = [];
    for (const d of this.watchers.keys()) {
      const mtime = dirMtime(join(root, d));
      if (mtime === null) {
        if (d) this.pending.add(d);
      } else if (mtime !== this.stamps.get(d)) moved.push([d, mtime]);
    }
    // The sweep compares each known note's mtime and size, not just that it exists: fs.watch merges a
    // burst of writes (a git checkout) into an event or two, and a missed change would stay missed.
    if (tick % 15 === 0) {
      for (const rel of known.keys()) {
        const st = statOrNull(join(root, rel));
        if (!st || st.mtimeMs !== known.get(rel) || (this.sizes.has(rel) && this.sizes.get(rel) !== st.size))
          this.pending.add(rel);
      }
    }
    for (const [dirRel, before] of this.gitignores) {
      const now = this.gitignoreStamp(dirRel);
      if (now !== before) {
        this.gitignores.set(dirRel, now);
        filter.invalidate(dirRel);
        this.rescan = true;
      }
    }
    for (const dirRel of this.polled) {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(root, dirRel), { withFileTypes: true });
      } catch {
        this.polled.delete(dirRel);
        continue;
      }
      const seen = new Set<string>();
      for (const e of entries) {
        const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!this.watchers.has(rel) && !this.polled.has(rel) && filter.exclusion(rel, true) === null) {
            const to = this.found(rel);
            if (to === "adopt") {
              this.watchDir(rel);
              this.rescan = true;
            } else {
              this.leave(rel, to);
              this.leftSeen.set(rel, tick); // where a note that went may be, for a tick
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
        if (mtime !== undefined && mtime !== known.get(rel)) this.pending.add(rel);
      }
      for (const rel of known.keys()) {
        const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        if (parent === dirRel && !seen.has(rel)) this.pending.add(rel);
      }
    }
    if (this.degraded) for (const rel of this.opts.pollTargets?.() ?? []) this.pending.add(rel);
    if (this.pending.size || this.rescan || this.toWalk.size || (this.leftSeen.size && this.recentlyWent.length))
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
    const missing = new Map(moved.map(([d]) => [d, new Set(this.attachments.get(d))]));
    for (const rel of known.keys()) missing.get(parentOf(rel))?.add(rel);
    const before = this.pending.size;
    let seenLeft = false;
    for (const [d, mtime] of moved) {
      let entries: Dirent[];
      try {
        entries = readdirSync(join(root, d), { withFileTypes: true });
      } catch {
        continue; // gone since: the next tick reports it
      }
      this.stamps.set(d, settled(mtime, statAt));
      const gone = missing.get(d)!;
      for (const e of entries) {
        const rel = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) {
          // A folder the walk would take and not watched yet: adopted, with all it holds — unless a walk is to look into
          // it, and it's nothing to name (`found`): one left before is still left, its markers not looked for again.
          if (listed || this.watchers.has(rel) || this.polled.has(rel)) continue;
          const wasLeft = this.left.has(rel);
          if (!wasLeft && filter.exclusion(rel, true) !== null) continue;
          if (wasLeft || this.found(rel) === "leave") {
            this.leave(rel, "leave");
            if (!this.leftSeen.has(rel)) seenLeft = true;
            this.leftSeen.set(rel, this.ticks);
            continue;
          }
        } else {
          if (gone.delete(rel)) continue; // known, and still here
          if (listed && !filter.isNoteName(e.name)) continue;
          // As the walk takes it: a symlink to a file inside the root, or one you follow (0.11, VV-D6).
          if (filter.exclusion(rel, false) !== null || (e.isSymbolicLink() && !this.symlinkKept(rel))) continue;
        }
        this.pending.add(rel);
      }
      for (const rel of gone) this.pending.add(rel);
    }
    // A folder left, found as a known note went lately: where it went, maybe (`movedTo`).
    if (this.pending.size > before || (seenLeft && this.recentlyWent.length)) this.schedule();
  }

  /** Keep an attachment known as there, or not. */
  private attachment(rel: string, there: boolean): void {
    const dir = parentOf(rel);
    const inDir = this.attachments.get(dir);
    if (there) {
      if (inDir) inDir.add(rel);
      else this.attachments.set(dir, new Set([rel]));
    } else if (inDir?.delete(rel) && !inDir.size) this.attachments.delete(dir);
  }

  private degrade(reason: string): void {
    if (this.degraded) return;
    this.degraded = reason;
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    this.opts.onDegraded(`${reason} — falling back to polling open notes every ${every(this.opts.pollMs ?? 2000)}`);
    this.ensurePollTimer();
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.opts.debounceMs);
  }

  /** Settle pending paths by stat. Exposed for tests. */
  flush(): void {
    this.timer = null;
    const leftSeen = [...this.leftSeen.keys()];
    const batch: Settling = {
      paths: [...this.pending],
      seen: new Set(),
      changes: [],
      rescan: this.rescan,
      found: [],
      candidates: leftSeen,
      following: this.opts.walkPending?.() ?? false,
    };
    this.pending.clear();
    this.rescan = false;
    this.settle(batch, batch.paths);
    this.vanished(batch);
    // Known notes moved lately into a folder left to the walk: found there, so they stay and the move is seen.
    if (batch.following && this.recentlyWent.length && batch.candidates.length)
      this.settle(batch, this.movedTo(batch.candidates, new Set(batch.found), this.recentlyWent, this.recentlyGone));
    for (const d of new Set(batch.found)) {
      if (batch.following) this.leftSeen.set(d, this.ticks); // where a note that goes next may be, for a tick
      // Named in order, each name taking its room under home's cap (`found` again: the room changed).
      const to = this.found(d);
      if (to !== "adopt") this.leave(d, to);
    }
    const toWalk = [...this.toWalk];
    this.toWalk.clear();
    const { changes, rescan } = batch;
    if (changes.length || rescan || toWalk.length)
      this.opts.onBatch({ changes, rescan, ...(toWalk.length ? { toWalk } : {}) });
  }

  /** Each path of `list` — which grows, as folders are taken in and gone ones say what they held — settled by stat. */
  private settle(batch: Settling, list: string[]): void {
    const { filter, known, root } = this.opts;
    for (let i = 0; i < list.length; i++) {
      const rel = list[i]!;
      if (batch.seen.has(rel)) continue;
      batch.seen.add(rel);
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (name === ".gitignore") {
        filter.invalidate(rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
        batch.rescan = true;
        continue;
      }
      let st: ReturnType<typeof statSync> | null = null;
      try {
        st = statSync(join(root, rel));
      } catch {}
      // A symlink as the walk takes it (0.11, VV-D6): a folder within the root never followed, nothing outside
      // adopted unless you follow it.
      if (st && isSymlink(join(root, rel)) && !this.symlinkKept(rel)) {
        if (!known.has(rel)) continue;
        st = null; // a note that became such a link: gone
      }
      if (st?.isDirectory()) {
        if (filter.exclusion(rel, true) === null && !this.watchers.has(rel) && !this.polled.has(rel)) {
          if (this.found(rel) === "adopt") list.push(...this.adoptTree(rel));
          else {
            batch.found.push(rel);
            batch.candidates.push(rel);
          }
        }
        continue;
      }
      if (!st && !known.has(rel)) {
        // Possibly a directory that went away (deleted, or moved out of the vault) — its own
        // watcher may already have errored and gone — so every known note under it went too, and the other files
        // known in it (an embed's picture).
        const prefix = `${rel}/`;
        let any = false;
        for (const k of known.keys()) {
          if (k.startsWith(prefix)) {
            list.push(k);
            any = true;
          }
        }
        const files: string[] = [];
        for (const [dir, inDir] of this.attachments) if (under(dir, rel)) files.push(...inDir);
        for (const f of files) list.push(f);
        const wasLeft = this.left.has(rel);
        // A folder gone: what was left in it, forgotten (a file gone has nothing to forget).
        if (wasLeft || any || files.length || this.watchers.has(rel)) this.forget(rel);
        if (any && batch.following) this.recentlyGone.push({ dir: rel, files, tick: this.ticks });
        if (any || files.length || this.watchers.has(rel)) {
          this.unwatchTree(rel);
          continue;
        }
        if (wasLeft) continue; // a folder left to the walk: never a file, nothing to say
      }
      if (filter.exclusion(rel, false) !== null) continue;
      if (!filter.isNoteName(name)) {
        // Editors' temporary files (vim's 4913, backups~, swap files) are never attachments.
        if (/^\d+$|~$|\.sw[a-p]$|^\.#|^#.*#$/.test(name)) continue;
        // An attachment: the graph keeps a name index of them for ![[embeds]].
        batch.changes.push({ rel, kind: st ? "created" : "deleted", isNote: false });
        this.attachment(rel, !!st);
        continue;
      }
      const own = this.ownWrites.get(rel);
      if (st && own !== undefined && own === st.mtimeMs) {
        this.ownWrites.delete(rel); // our own write, seen once
        continue;
      }
      const before = known.get(rel);
      if (!st) {
        // Gone — or, never known, come and gone between two looks (written and removed at once): said all the
        // same, since what was drawn meanwhile may have read it from the disk (a link to it, resolved by its file).
        if (before !== undefined) this.went(batch, rel, before);
        known.delete(rel);
        batch.changes.push({ rel, kind: "deleted", isNote: true });
        continue;
      }
      if (before === undefined) batch.changes.push({ rel, kind: "created", isNote: true });
      else if (before !== st.mtimeMs || (this.sizes.has(rel) && this.sizes.get(rel) !== st.size))
        batch.changes.push({ rel, kind: "changed", isNote: true });
      else continue;
      known.set(rel, st.mtimeMs);
      this.sizes.set(rel, st.size);
    }
  }

  /** A known note gone (it was `mtimeMs`): kept as gone lately while moves are followed, to find where it went. */
  private went(batch: Settling, rel: string, mtimeMs: number): void {
    if (!batch.following) return;
    const at = this.opts.now?.() ?? Date.now();
    this.recentlyWent.push({ rel, mtimeMs, size: this.sizes.get(rel), tick: this.ticks, at });
  }

  /**
   * A batch's last look (`flush`), before moves are followed: a rename reports only the new name, so notes that
   * vanished from the directories heard from, or moved away under the same name, are found here — gone, and kept as
   * gone lately (`went`), so where they went is followed — and a burst of writes in a folder reported as one event is
   * said for the rest of it.
   */
  private vanished(batch: Settling): void {
    const { known, root } = this.opts;
    const dirs = new Set(batch.paths.map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")));
    const createdNames = new Set(
      batch.changes.filter((c) => c.kind === "created").map((c) => c.rel.slice(c.rel.lastIndexOf("/") + 1)),
    );
    for (const rel of [...known.keys()]) {
      const slash = rel.lastIndexOf("/");
      const dir = slash >= 0 ? rel.slice(0, slash) : "";
      if (!(dirs.has(dir) || createdNames.has(rel.slice(slash + 1))) || batch.seen.has(rel)) continue;
      const st = statOrNull(join(root, rel));
      if (!st) {
        this.went(batch, rel, known.get(rel)!);
        known.delete(rel);
        batch.changes.push({ rel, kind: "deleted", isNote: true });
      } else if (
        dirs.has(dir) &&
        (st.mtimeMs !== known.get(rel) || (this.sizes.has(rel) && this.sizes.get(rel) !== st.size)) &&
        this.ownWrites.get(rel) !== st.mtimeMs
      ) {
        known.set(rel, st.mtimeMs);
        this.sizes.set(rel, st.size);
        batch.changes.push({ rel, kind: "changed", isNote: true });
      }
    }
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** A polling interval for a message: "2 s", or "500 ms" under a second (never "0 s"). */
function every(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`;
}

/** When a folder last changed (its ctime: what came or went in it, or it renamed), or null when it isn't there. */
function changedAt(path: string): number | null {
  try {
    return statSync(path).ctimeMs;
  } catch {
    return null;
  }
}

/** A directory's mtime, or null when it isn't there. */
function dirMtime(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** A directory's mtime as its stamp, when what it holds was read at `readAt`; -1, to list it again on
 *  the next tick, when that was too soon after it changed (`SETTLE_MS`) or it couldn't be stat'ed. */
function settled(mtime: number | null, readAt: number): number {
  return mtime === null || mtime >= readAt - SETTLE_MS ? -1 : mtime;
}

function parentOf(rel: string): string {
  const slash = rel.lastIndexOf("/");
  return slash >= 0 ? rel.slice(0, slash) : "";
}

function statOrNull(path: string): { mtimeMs: number; size: number } | null {
  try {
    const st = statSync(path);
    return st.isFile() ? { mtimeMs: st.mtimeMs, size: st.size } : null;
  } catch {
    return null;
  }
}
