// One watcher instance owns these original maps, queues and timers; collaborators share references.
import type { FSWatcher } from "node:fs";
/** A known note that went (`flush`): where it was, its time and size then, and the tick it went in. */
export interface Went {
  rel: string;
  mtimeMs: number;
  size: number | undefined;
  tick: number;
  /** When it was seen gone (epoch ms). */
  at: number;
}
export class WatchState {
  readonly watchers = new Map<string, FSWatcher>();

  pending = new Set<string>();

  rescan = false;

  /** Folders found for a walk to look into, to name in the next batch (`WatchBatch.toWalk`). */
  readonly toWalk = new Set<string>();

  /**
   * The folders found and left to a walk (`leftToWalk`), and whether each was named (`WatchBatch.toWalk`): one named is
   * never named again — a folder polled finds it at every tick until it's watched, and for good once watching degraded
   * — and holds its room under home's cap until it is; one gone was never a file, so nothing is said. Forgotten when it
   * goes, or once the graph took its name (`watchNamed`).
   */
  readonly left = new Map<string, boolean>();

  /** Folders left that a second look found lately, by the tick: where a known note that went may be now (`movedTo`). */
  readonly leftSeen = new Map<string, number>();

  /** Known notes that went lately: a move's two ends may come in two batches, the second look's a tick later. */
  readonly recentlyWent: Went[] = [];

  /**
   * The notes followed into folders left to the walk (`movedTo`): no watch sees them there, so each is looked at every
   * tick — changed, or moved again, it's seen at once — until its folder is watched or it goes.
   */
  readonly followed = new Set<string>();

  /**
   * The folders that went lately holding known notes, the other files known in them (a data file), by the tick:
   * renamed or moved, maybe (`movedTo`).
   */
  readonly recentlyGone: { dir: string; files: string[]; tick: number }[] = [];

  timer: ReturnType<typeof setTimeout> | null = null;

  pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly ownWrites = new Map<string, number>();

  /** Sizes beside the known mtimes: a same-second rewrite that changes the size still counts. */
  readonly sizes = new Map<string, number>();

  /** Directories whose watch failed (e.g. Bun's fs.watch errors on a broken symlink inside). */
  readonly polled = new Set<string>();

  closed = false;

  /** mtime of each watched directory's .gitignore (-1 when absent). Bun's fs.watch reports no
   *  events for dot-files, so these are polled on the housekeeping tick. */
  readonly gitignores = new Map<string, number>();

  /** Each watched directory's mtime when what it holds was last known, or -1 to list it again on the
   *  next tick: a change since that no event reported is found by its mtime (`lookAgain`). */
  readonly stamps = new Map<string, number>();

  /** The non-note files known, by their directory: what a directory listed again holds beyond them
   *  and the notes known is new. */
  readonly attachments = new Map<string, Set<string>>();

  ticks = 0;
}
