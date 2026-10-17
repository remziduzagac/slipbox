// Vault watcher (plan 5.1, 5.2). One non-recursive watch per walked directory, so the watcher
// subscribes to exactly what the walk includes (0.11 = 5.2): a busy folder (`node_modules`, a
// `target/` with no note at its top: D237) and anything gitignored are never watched. A busy folder
// that changes kind — its first note, its line in a `.gitignore` gone — is taken in when its parent
// is listed again (the filter asks the folder again once it changed) or the vault is walked again.
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
}

/**
 * How long after a directory changes its mtime can't tell a later change apart: a coarse clock (FAT's
 * 2 s, HFS+'s 1 s, Linux's tick) can give the next change the same mtime. A directory read that soon
 * after its change is listed again on the next tick.
 */
const SETTLE_MS = 2000;

export class VaultWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private pending = new Set<string>();
  private rescan = false;
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
    if (++this.ticks % 15 === 0) {
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
            this.watchDir(rel);
            this.rescan = true;
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
    if (this.pending.size || this.rescan) this.flush();
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
          // A folder the walk would take and not watched yet: adopted, with all it holds.
          if (listed || this.watchers.has(rel) || this.polled.has(rel) || filter.exclusion(rel, true) !== null)
            continue;
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
    if (this.pending.size > before) this.schedule();
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
    const paths = [...this.pending];
    this.pending.clear();
    const seen = new Set<string>();
    let rescan = this.rescan;
    this.rescan = false;
    const changes: WatchChange[] = [];
    const { filter, known, root } = this.opts;
    for (let i = 0; i < paths.length; i++) {
      const rel = paths[i]!;
      if (seen.has(rel)) continue;
      seen.add(rel);
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (name === ".gitignore") {
        filter.invalidate(rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
        rescan = true;
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
        if (filter.exclusion(rel, true) === null && !this.watchers.has(rel)) paths.push(...this.adoptTree(rel));
        continue;
      }
      if (!st && !known.has(rel)) {
        // Possibly a directory that went away (deleted, or moved out of the vault) — its own
        // watcher may already have errored and gone — so every known note under it went too.
        const prefix = `${rel}/`;
        let any = false;
        for (const k of known.keys()) {
          if (k.startsWith(prefix)) {
            paths.push(k);
            any = true;
          }
        }
        if (any || this.watchers.has(rel)) {
          this.unwatchTree(rel);
          continue;
        }
      }
      if (filter.exclusion(rel, false) !== null) continue;
      if (!filter.isNoteName(name)) {
        // Editors' temporary files (vim's 4913, backups~, swap files) are never attachments.
        if (/^\d+$|~$|\.sw[a-p]$|^\.#|^#.*#$/.test(name)) continue;
        // An attachment: the graph keeps a name index of them for ![[embeds]].
        changes.push({ rel, kind: st ? "created" : "deleted", isNote: false });
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
        known.delete(rel);
        changes.push({ rel, kind: "deleted", isNote: true });
        continue;
      }
      if (before === undefined) changes.push({ rel, kind: "created", isNote: true });
      else if (before !== st.mtimeMs || (this.sizes.has(rel) && this.sizes.get(rel) !== st.size))
        changes.push({ rel, kind: "changed", isNote: true });
      else continue;
      known.set(rel, st.mtimeMs);
      this.sizes.set(rel, st.size);
    }
    // A rename reports only the new name; notes that vanished from the directories we heard
    // from, or moved away under the same name, are found here.
    const dirs = new Set(paths.map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")));
    const createdNames = new Set(
      changes.filter((c) => c.kind === "created").map((c) => c.rel.slice(c.rel.lastIndexOf("/") + 1)),
    );
    for (const rel of [...known.keys()]) {
      const slash = rel.lastIndexOf("/");
      const dir = slash >= 0 ? rel.slice(0, slash) : "";
      if (!(dirs.has(dir) || createdNames.has(rel.slice(slash + 1))) || seen.has(rel)) continue;
      const st = statOrNull(join(root, rel));
      if (!st) {
        known.delete(rel);
        changes.push({ rel, kind: "deleted", isNote: true });
      } else if (
        dirs.has(dir) &&
        (st.mtimeMs !== known.get(rel) || (this.sizes.has(rel) && this.sizes.get(rel) !== st.size)) &&
        this.ownWrites.get(rel) !== st.mtimeMs
      ) {
        // A burst of writes in this folder reported as one event: the others changed too.
        known.set(rel, st.mtimeMs);
        this.sizes.set(rel, st.size);
        changes.push({ rel, kind: "changed", isNote: true });
      }
    }
    if (changes.length || rescan) this.opts.onBatch({ changes, rescan });
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
