// Directory registration/admission and attachment tracking through live watcher capabilities. A folder registered is
// stamped from what was read of it with the look that found it, or now, here; on the disk threads, by the next look.
import { watch } from "node:fs";
import * as disk from "../../../foundation/platform/disk.ts";
import { join } from "node:path";
import { under } from "../../vaults/home/paths.ts";
import { type PathStat, parentOf, settled, statOf } from "../../walk/io/stamps.ts";
import type { DirectoryOptions, DirectoryState, DirectoryHost } from "./contracts.ts";
import { every } from "./io.ts";
import type { JudgeBy, JudgeContext, JudgedFolder, LinkKept, ListJudge } from "./judging.ts";
import { type Look, runHere } from "./reads.ts";

/** A folder's stamps as read: its own stat and its `.gitignore`'s. */
export interface FolderStamps {
  dir: PathStat;
  gitignore: PathStat;
}

export class WatchDirectories {
  constructor(
    private readonly opts: DirectoryOptions,
    private readonly state: DirectoryState,
    /** The root's real path, or how to find it, the first time a look here asks it. */
    private realRoot: string | (() => string),
    private readonly host: DirectoryHost,
  ) {}

  /** What a listing here is judged by: the watcher's own filter, its root. */
  judging(): JudgeContext {
    if (typeof this.realRoot !== "string") this.realRoot = this.realRoot();
    return { filter: this.opts.filter, root: this.opts.root, realRoot: this.realRoot };
  }

  gitignoreStamp(dirRel: string): number {
    return gitignoreOf(statOf(join(this.opts.root, dirRel, ".gitignore")));
  }

  unwatchTree(dirRel: string): void {
    for (const [d, w] of this.state.watchers) {
      if (d === dirRel || d.startsWith(`${dirRel}/`)) {
        w.close();
        this.state.watchers.delete(d);
        this.state.gitignores.delete(d);
        this.state.stamps.delete(d);
      }
    }
    for (const d of this.state.polled) if (d === dirRel || d.startsWith(`${dirRel}/`)) this.state.polled.delete(d);
  }

  /** Watch a directory that appeared (created, or moved in with its contents) and everything
   *  below it; return the files already inside — notes and attachments — which are new to us. Read here, at once. */
  adoptTree(dirRel: string): string[] {
    return runHere(this.adopting(dirRel), this.judging());
  }

  /**
   * `adoptTree` as a look: the tree listed a folder at a time, nearest first, each judged where it's read (judging.ts)
   * and watched here as its answer comes, from its stamps read just before it was listed, within home's cap — so a big
   * tree moved in is no one request a slow disk can't answer in time. Ended early (given up on, dropped), the folders
   * not listed yet and the files found so far are pending again: the next batch takes them in, what's watched kept.
   */
  *adopting(dirRel: string): Look<string[]> {
    const max = this.opts.maxDirs ?? Number.POSITIVE_INFINITY;
    const queue = [dirRel];
    const files: string[] = [];
    let next = 0;
    let done = false;
    try {
      // Past home's cap (VV-D2): left to its walk, never listed here.
      for (; next < queue.length && this.state.watchers.size + this.state.polled.size < max; next++) {
        const d = queue[next]!;
        const { listings } = yield { list: [{ dir: join(this.opts.root, d), judge: this.judged({ adopt: true }) }] };
        const folder = listings[0];
        if (folder?.how !== "adopt") continue;
        this.watchDir(d, folder.at, { dir: folder.stat, gitignore: folder.gitignore });
        queue.push(...folder.dirs);
        for (const f of folder.files) if (!f.link || this.symlinkKept(f.rel, f.link)) files.push(f.rel);
      }
      done = true;
    } finally {
      if (!done) for (const rel of [...queue.slice(next), ...files]) this.state.pending.add(rel);
    }
    return files;
  }

  /**
   * Whether the symlink at `rel` is one the walk keeps (0.11, VV-D6), and as what, from its verdict where it was read
   * (`link`): a file inside the root that isn't a note already known by its own path, or one outside you follow
   * (`"file"`); a folder outside you follow (`"dir"`), watched as the walk walks it; else null — a folder within the
   * root (a second name), a link not followed.
   */
  symlinkKept(rel: string, link: LinkKept): "file" | "dir" | null {
    if (!link.kept) return null;
    if (link.dir) return "dir";
    return link.target === rel || !this.opts.known.has(link.target) ? "file" : null;
  }

  /**
   * What becomes of a folder found that isn't watched: taken in with all it holds (`adopt`); or, a walk's to look into
   * (`leftToWalk`), left — come into a folder looked into (home's top), named once in a batch for the graph to list it
   * (`ask`, `WatchBatch.toWalk`), within home's cap; in one left to the walk itself, named already, or with watching
   * degraded, nothing more (`leave`): the walk takes it with the rest.
   */
  found(dirRel: string): "adopt" | "ask" | "leave" {
    const walks = this.opts.leftToWalk;
    if (!walks?.(dirRel)) return "adopt";
    if (walks(parentOf(dirRel)) || this.state.left.get(dirRel) || this.host.degraded) return "leave";
    return this.room() > 0 ? "ask" : "leave";
  }

  /** How many more folders home's cap (`maxDirs`) lets it watch: those named and not watched yet count already. */
  room(): number {
    let n = this.state.watchers.size + this.state.polled.size;
    for (const [d, named] of this.state.left)
      if (named && !this.state.watchers.has(d) && !this.state.polled.has(d)) n++;
    return (this.opts.maxDirs ?? Number.POSITIVE_INFINITY) - n;
  }

  /** A folder found and left to the walk: named for it (`found`'s `ask`) or not, kept (`left`). */
  leave(dirRel: string, to: "ask" | "leave"): void {
    if (to === "ask") this.state.toWalk.add(dirRel);
    if (to === "ask" || !this.state.left.has(dirRel)) this.state.left.set(dirRel, to === "ask");
  }

  /** A folder left to the walk, gone or taken: forgotten, with the folders in it — found again, it's new. */
  forget(dirRel: string): void {
    for (const d of this.state.left.keys()) if (under(d, dirRel)) this.state.left.delete(d);
    for (const d of this.state.leftSeen.keys()) if (under(d, dirRel)) this.state.leftSeen.delete(d);
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
      this.state.left.delete(d);
      if (listed(d) && this.state.watchers.size + this.state.polled.size < max) this.watchDir(d, walkedAt);
    }
  }

  /**
   * Watch a directory whose contents were read at `readAt` (the walk's, or a listing about to be), stamped from
   * `stamps` (read as it was listed) — else now, here, or by the next look on the disk threads (`stampLater`).
   */
  watchDir(dirRel: string, readAt = Date.now(), stamps?: FolderStamps): void {
    if (this.state.watchers.has(dirRel) || this.host.degraded) return;
    try {
      const w = watch(join(this.opts.root, dirRel), { persistent: false }, (_event, name) => {
        if (!name) {
          this.state.rescan = true;
          this.host.schedule();
          return;
        }
        const rel = dirRel ? `${dirRel}/${name.toString()}` : name.toString();
        this.state.pending.add(rel);
        this.host.schedule();
      });
      w.on("error", (err) => {
        w.close();
        this.state.watchers.delete(dirRel);
        // Gone: a parent event reports the deletion. Still there: never go quiet — poll it.
        if (disk.exists(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
      });
      this.state.watchers.set(dirRel, w);
      if (stamps) this.stamp(dirRel, readAt, stamps);
      else if (!this.host.stampLater?.(dirRel, readAt)) {
        const abs = join(this.opts.root, dirRel);
        this.stamp(dirRel, readAt, { gitignore: statOf(join(abs, ".gitignore")), dir: statOf(abs) });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EMFILE" || code === "ENFILE")
        this.host.degrade(
          `${code}: the system watch limit is exhausted (${this.state.watchers.size} directories watched)`,
        );
      else if (disk.exists(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
    }
  }

  /** A folder watched, stamped from what was read of it (`stamps`), its contents read at `readAt`. */
  stamp(dirRel: string, readAt: number, stamps: FolderStamps): void {
    this.state.gitignores.set(dirRel, gitignoreOf(stamps.gitignore));
    this.state.stamps.set(dirRel, this.startStamp(dirRel, readAt, stamps.dir));
  }

  /**
   * The stamp a folder is watched from, its contents read at `readAt`, from its stat `st`: its mtime, or -1 to list it
   * again at the next tick. The walk's stamp of it (`dirStamps`), its times still those: as the walk listed it,
   * whenever the walk began.
   */
  private startStamp(dirRel: string, readAt: number, st: PathStat): number {
    const seen = this.opts.dirStamps?.().get(dirRel);
    if ("error" in st) return -1;
    if (!seen) return settled(st.mtimeMs, readAt);
    return st.mtimeMs === seen[0] && st.ctimeMs === seen[1] ? st.mtimeMs : -1;
  }

  /** What a disk thread judges the watcher's reads by: the walk's filter, as it is now (`JudgeBy`). */
  judgeBy(): JudgeBy {
    return { filter: this.opts.filter.settings, epoch: this.opts.filter.epoch };
  }

  /** A listing's judging (`ListJudge`): by the walk's filter, as `how` says. */
  judged(how: ListJudge["how"]): ListJudge {
    return { ...this.judgeBy(), how };
  }

  /** The names of the folders in `dirRel` watched or polled (or left to the walk, `left`): a listing judges none. */
  childNames(dirRel: string, left = false): string[] {
    const names: string[] = [];
    const add = (d: string) => {
      if (d && parentOf(d) === dirRel) names.push(d.slice(d.lastIndexOf("/") + 1));
    };
    for (const d of this.state.watchers.keys()) add(d);
    for (const d of this.state.polled) add(d);
    if (left) for (const d of this.state.left.keys()) add(d);
    return names;
  }

  /** A polled folder as a tick's listing found it: a folder taken in or left, each note changed or gone pending. */
  polledSeen(dirRel: string, listing: JudgedFolder, tick: number): void {
    const { filter, known } = this.opts;
    const { state } = this;
    if (!state.polled.has(dirRel)) return;
    if (listing.error !== null) {
      state.polled.delete(dirRel);
      return;
    }
    const seen = new Set<string>();
    for (const e of listing.entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.kind === "dir") {
        if (!state.watchers.has(rel) && !state.polled.has(rel) && e.excluded === null) {
          const to = this.found(rel);
          if (to === "adopt") {
            this.watchDir(rel);
            state.rescan = true;
          } else {
            this.leave(rel, to);
            state.leftSeen.set(rel, tick); // where a note that went may be, for a tick
          }
        }
        continue;
      }
      if (!filter.isNoteName(e.name) || e.excluded !== null) continue;
      seen.add(rel);
      if (typeof e.mtimeMs === "number" && e.mtimeMs !== known.get(rel)) state.pending.add(rel);
    }
    for (const rel of known.keys()) if (parentOf(rel) === dirRel && !seen.has(rel)) state.pending.add(rel);
  }

  pollDir(dirRel: string, reason: string): void {
    if (this.state.closed || this.state.polled.has(dirRel)) return;
    this.state.polled.add(dirRel);
    this.opts.onWarn?.(
      `cannot watch ${dirRel || "the vault's top folder"} (${reason.split("\n")[0]}) — polling it every ${every(this.opts.pollMs ?? 2000)} instead`,
    );
    this.host.ensurePollTimer();
  }

  /** Keep an attachment known as there, or not. */
  attachment(rel: string, there: boolean): void {
    const dir = parentOf(rel);
    const inDir = this.state.attachments.get(dir);
    if (there) {
      if (inDir) inDir.add(rel);
      else this.state.attachments.set(dir, new Set([rel]));
    } else if (inDir?.delete(rel) && !inDir.size) this.state.attachments.delete(dir);
  }
}

/** A `.gitignore`'s stamp from its stat: its mtime, or -1 when it isn't there. */
const gitignoreOf = (st: PathStat): number => ("error" in st ? -1 : st.mtimeMs);
