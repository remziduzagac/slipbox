// Watch batches/options and the live capabilities used by directory and reconciliation owners.

import type { WalkFilter } from "../../walk/filtering/filter.ts";
import type { WatchState } from "./state.ts";
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
   * VV-D2), each named once: for the graph to list, and the watcher to watch (`watchNamed`) — never looking in — and
   * the walk to be asked for again.
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
export interface Settling {
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
export interface DirectoryHost {
  readonly degraded: string | null;
  degrade(reason: string): void;
  ensurePollTimer(): void;
  schedule(): void;
}
export interface ReconciliationDirectories {
  adoptTree(dirRel: string): string[];
  attachment(rel: string, there: boolean): void;
  forget(dirRel: string): void;
  found(dirRel: string): "adopt" | "ask" | "leave";
  symlinkKept(rel: string): "file" | "dir" | null;
  unwatchTree(dirRel: string): void;
}

export type DirectoryState = Pick<
  WatchState,
  | "attachments"
  | "closed"
  | "gitignores"
  | "left"
  | "leftSeen"
  | "pending"
  | "polled"
  | "rescan"
  | "stamps"
  | "toWalk"
  | "watchers"
>;
export type DirectoryOptions = Pick<
  WatcherOptions,
  "filter" | "known" | "leftToWalk" | "maxDirs" | "onWarn" | "pollMs" | "root" | "walkedAt"
>;

export type ReconciliationState = Pick<
  WatchState,
  "attachments" | "left" | "ownWrites" | "polled" | "recentlyGone" | "recentlyWent" | "sizes" | "ticks" | "watchers"
>;
export type ReconciliationOptions = Pick<WatcherOptions, "filter" | "known" | "root" | "now" | "pollMs">;
