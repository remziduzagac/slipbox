// What keeps a graph current with its vault's files (5.1, 5.9, 5.10): the watcher's batches,
// applied to the graph — or, while git writes (its index lock), held and applied together after,
// and the files a branch switch brings and takes not taken for moves. The TUI keeps its graph by
// one; what it does with the news is its own. Git's state is read here at once, or — the TUI's — given by its look
// each second and asked of a disk thread when the feed must know it now (SD-T4), never read on the screen's thread.

import * as disk from "../../foundation/platform/disk.ts";
import { join } from "node:path";
import { type Checkout, checkoutOf, headCommit, headOf } from "../git/git.ts";
import { type Operation, operationOf } from "../git/branches/operation.ts";
import { askGit } from "../git/branches/operation-status.ts";
import type { Graph } from "../graph/graph.ts";
import { deepestOutside, inFolders } from "./home.ts";
import { checkoutAt, type VaultLocation } from "./vault.ts";
import { HOME_LIMITS } from "../walk/walk.ts";
import type { WatchBatch } from "../graph/watch.ts";

/** HEAD as seen: its branch and its commit — a merge, a pull, a commit move it on the branch (20.21). */
export interface Head {
  branch: string | null;
  commit: string | null;
}

/** Git's state where a vault is, as one look found it (SD-T4): what the feed decides by, and what's drawn (SD-D13). */
export interface GitSeen {
  /** The checkout the vault is in; null: none. */
  checkout: Checkout | null;
  /** Git's index lock, where it's looked for — the checkout's, else that of the one a loose folder is in; null: none. */
  lock: string | null;
  /** git is mid-commit (or mid-anything): it holds its lock (5.10). */
  locked: boolean;
  /** Mid-rebase: HEAD detached between its steps. */
  rebasing: boolean;
  head: Head | null;
  /** A merge, a rebase, a cherry-pick or a revert under way (GIT-D6). */
  operation: Operation | null;
}

/** Git's state where `loc` is, read through the seam: on a disk thread for the TUI's look, the same code as here. The
 *  lock first, then HEAD: a commit that lands between the two is seen at the next look. */
export function gitSeenAt(loc: Pick<VaultLocation, "mode" | "root">): GitSeen {
  const c = checkoutAt(loc);
  const lockIn = c ?? checkoutOf(loc.root);
  const lock = lockIn ? join(lockIn.gitDir, "index.lock") : null;
  const locked = lock !== null && disk.exists(lock);
  if (!c) return { checkout: null, lock, locked, rebasing: false, head: null, operation: null };
  const rebasing = disk.exists(join(c.gitDir, "rebase-merge")) || disk.exists(join(c.gitDir, "rebase-apply"));
  const head = { branch: headOf(c).branch, commit: headCommit(c) };
  return { checkout: c, lock, locked, rebasing, head, operation: operationOf(c) };
}

/** How the feed asks git's state off the screen's thread (the TUI's, a disk thread): the whole of it — the question's
 *  number given (`askGit`) — or its lock's stat alone; each answered when the thread does. */
export interface GitAsker {
  git(asked: number): Promise<GitSeen>;
  locked(lock: string): Promise<boolean>;
}

/** After HEAD moves, the watcher's batches for this long are the switch's too. */
export const SWITCH_SETTLE_MS = 3000;

/**
 * A batch applied to the graph: notes updated, added and removed, attachments, a rescan, folders listed for home's walk
 * (`listed`, of `toWalk`). `structural` when notes came or went — every link's status may have changed — and warnings
 * for what was left out. `maxNotes`: home's cap (VV-D2) — a note that comes past it is left to home's walk, which holds it,
 * unless it's in a folder asked for by name.
 */
export function applyToGraph(
  graph: Graph,
  batch: WatchBatch,
  maxFileSize: number,
  maxNotes = graph.home ? HOME_LIMITS.notes : Number.POSITIVE_INFINITY,
): { structural: boolean; warnings: string[]; listed: string[] } {
  let structural = false;
  const warnings: string[] = [];
  if (batch.rescan) {
    graph.build(true, "lazy");
    structural = true;
  }
  // Folders come into home's top before its walk (VV-D2): listed, never looked into. No note came or went with them.
  const listed = (batch.toWalk ?? []).filter((dir) => graph.listForWalk(dir));
  for (const c of batch.changes) {
    if (!c.isNote) {
      // An attachment appeared or went: ![[embeds]] of it change status. Only a real change to the
      // index counts (a rewrite of a known image doesn't).
      if (c.kind === "deleted" ? graph.removeAsset(c.rel) : graph.addAsset(c.rel)) structural = true;
      graph.fileChanged(c.rel); // a data or code file's links may have changed (16.15, 16.10)
      continue;
    }
    if (c.kind === "deleted") {
      graph.removeFile(c.rel);
      structural = true;
      continue;
    }
    const abs = join(graph.root, c.rel);
    let st: { size: number; mtimeMs: number } | null = null;
    try {
      st = disk.stat(abs);
    } catch {}
    if (!st) continue;
    // The walk's size cap holds for notes that appear or grow later too: out of the index; back in
    // when it shrinks under the cap again.
    if (st.size > maxFileSize) {
      if (graph.notes.has(c.rel)) {
        graph.removeFile(c.rel);
        warnings.push(`${c.rel} is larger than walk.max_file_size — left out of the index`);
      }
      structural = true;
    } else {
      if (!graph.notes.has(c.rel) && graph.notes.size >= maxNotes) {
        // One in a folder of home asked for by name comes all the same (VV-D2): it's whole, home's deepest own note
        // left out to make room — or, none of home's own left, past the cap.
        if (!inFolders(c.rel, graph.askedFolders)) continue;
        const out = deepestOutside(
          [...graph.notes.keys()].filter((rel) => !graph.reached.has(rel)),
          graph.askedFolders,
        );
        if (out) graph.removeFile(out);
      }
      if (c.kind === "created" || !graph.notes.has(c.rel)) structural = true;
      graph.updateFile(c.rel, { rel: c.rel, abs, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return { structural, warnings, listed };
}

export interface FeedOptions {
  /** The vault's checkout now (null: no git). */
  checkout: () => Checkout | null;
  graph: () => Graph;
  now: () => number;
  /** The batches held so far, as one: apply it (with `applyToGraph`, then whatever the face does). */
  apply: (batch: WatchBatch) => void;
  /** HEAD moved from one place to another (not a repository appearing or going); `moves`: git's
   *  renames the graph took as evidence, if the branch moved on (20.21). */
  headMoved?: (was: Head, now: Head, moves: [string, string][]) => void;
  /** Anything git did: HEAD moved, or files changed. */
  gitNews?: () => void;
  /** Whether git holds its index lock, when the face looks it up its own way. */
  locked?: () => boolean;
  /** Git's state asked off the screen's thread (the TUI's look, SD-T4): its look gives it each second (`saw`), and a
   *  batch received asks it, git's lock waited out by its stat alone. Null, or left out: read here at once. */
  asker?: () => GitAsker | null;
}

export class VaultFeed {
  /** HEAD as last seen. */
  head: Head | null = null;
  /** Git's state as the look last found it, off the screen's thread (SD-T4); null: not looked at yet, or read here. */
  seen: GitSeen | null = null;
  /** The question `seen` answered (`askGit`): an answer to one asked before it is dropped. */
  private seenAsked = 0;
  private held: WatchBatch[] = [];
  private wait: ReturnType<typeof setTimeout> | null = null;
  /** When HEAD last moved. */
  private switchedAt = Number.NEGATIVE_INFINITY;
  private closed = false;
  /** Git's state asked for the batches held, not answered yet: they go when it is. */
  private asking = false;
  /** Bumped by each vault (`reset`): an answer asked for another is dropped. */
  private resets = 0;

  constructor(private readonly o: FeedOptions) {
    this.head = this.headNow();
  }

  headNow(): Head | null {
    const c = this.o.checkout();
    if (!c) return null;
    return { branch: headOf(c).branch, commit: headCommit(c) };
  }

  /** Git's state given by the look, off the screen's thread: what's decided and drawn from now on — unless what's seen
   *  answered a question asked after this one (`asked`), the answers having come out of order. True when it's taken. */
  saw(seen: GitSeen, asked: number): boolean {
    if (asked < this.seenAsked) return false;
    this.seen = seen;
    this.seenAsked = asked;
    return true;
  }

  /** git is mid-commit (or mid-anything) in the vault's checkout (5.10). */
  gitLocked(): boolean {
    if (this.o.asker?.()) return this.seen?.locked ?? false;
    if (this.o.locked) return this.o.locked();
    const c = this.o.checkout();
    return !!c && disk.exists(join(c.gitDir, "index.lock"));
  }

  /** git is mid-rebase in the checkout: HEAD detached between its steps (or stopped on a conflict)
   *  — not where the branch is going, so not a move of HEAD yet. */
  rebasing(): boolean {
    if (this.o.asker?.()) return this.seen?.rebasing ?? false;
    const c = this.o.checkout();
    return !!c && (disk.exists(join(c.gitDir, "rebase-merge")) || disk.exists(join(c.gitDir, "rebase-apply")));
  }

  /** A batch from the watcher: applied now — or, while git writes, held with the rest it writes. Off the screen's
   *  thread, held until git's state, asked, answers: applied with HEAD as git left it (D153). */
  receive(b: WatchBatch): void {
    this.held.push(b);
    const asker = this.o.asker?.();
    if (asker) return this.askThenFlush(asker);
    if (this.gitLocked()) return this.waitForGit();
    this.flush();
  }

  /** Git's state asked, the held batches applied once it answers — or, git holding its lock, once it lets go. One
   *  question out at a time: a batch received meanwhile goes with its answer. Given up on (the disk didn't answer in
   *  time), they're applied as the state last seen has it, never held for good. */
  private askThenFlush(asker: GitAsker): void {
    if (this.asking || this.wait) return;
    this.asking = true;
    const at = this.resets;
    const asked = askGit();
    const answered = (seen: GitSeen | null) => {
      // Asked for a vault left: its question is no longer the one out (`reset`), so it leaves `asking` alone.
      if (this.closed || at !== this.resets) return;
      this.asking = false;
      // Decided by the state last asked: this answer, unless a look asked after it answered first.
      if (seen) this.saw(seen, asked);
      const now = seen ? this.seen : null;
      if (now?.locked && now.lock) return this.waitForGit(asker, now.lock);
      this.flush();
    };
    asker.git(asked).then(answered, () => answered(null));
  }

  /** git's lock waited out: looked at every 100 ms — here, or its stat alone asked off the screen's thread, one out at
   *  a time — the held batches applied once it's gone. */
  private waitForGit(asker?: GitAsker, lock?: string): void {
    if (this.wait) return;
    const at = this.resets;
    const tick = () => {
      this.wait = null;
      if (this.closed || at !== this.resets) return;
      if (!asker || !lock) return this.gitLocked() ? this.waitForGit() : this.flush();
      this.asking = true;
      const done = (locked: boolean) => {
        if (this.closed || at !== this.resets) return;
        this.asking = false;
        if (locked) this.waitForGit(asker, lock);
        // Let go: the whole state asked again, HEAD as git left it, before the batches go.
        else this.askThenFlush(asker);
      };
      asker.locked(lock).then(done, () => done(false));
    };
    this.wait = setTimeout(tick, 100);
    (this.wait as { unref?: () => void }).unref?.();
  }

  /** The held batches applied as one — a switch that came with them seen first, and their files
   *  not taken for moves (a note only one branch has comes and goes; nothing moved). */
  flush(): void {
    this.applying = true;
    try {
      const batches = this.held;
      this.held = [];
      this.checkHead();
      if (!batches.length) return;
      const toWalk = batches.flatMap((b) => b.toWalk ?? []);
      const merged: WatchBatch = {
        changes: batches.flatMap((b) => b.changes),
        rescan: batches.some((b) => b.rescan),
        ...(toWalk.length ? { toWalk } : {}),
      };
      this.o.gitNews?.();
      if (this.o.now() - this.switchedAt < SWITCH_SETTLE_MS) this.o.graph().pauseMoves(() => this.o.apply(merged));
      else this.o.apply(merged);
    } finally {
      this.applying = false;
      for (const fn of this.afterApplied.splice(0)) fn();
    }
  }

  /**
   * `fn` now — or, asked while held batches are being applied (a switch seen first, its tabs back, the graph built
   * for them), once they are: what git wrote lands before what's looked at after a build.
   */
  whenApplied(fn: () => void): void {
    if (this.applying) this.afterApplied.push(fn);
    else fn();
  }

  private applying = false;
  private readonly afterApplied: (() => void)[] = [];

  /** HEAD looked at (a poll, each batch): true when it moved, or a repository appeared or went.
   *  Not while git still writes, nor mid-rebase: then it hasn't finished moving (a rebase lands as
   *  one change — its branch moved on, never a switch away and back). */
  checkHead(): boolean {
    if (this.gitLocked() || this.rebasing()) return false;
    // Off the screen's thread: HEAD as the look last found it; not looked at yet, nothing to decide.
    const off = !!this.o.asker?.();
    if (off && !this.seen) return false;
    const now = off ? (this.seen?.head ?? null) : this.headNow();
    const was = this.head;
    this.head = now;
    if (now?.branch === was?.branch && now?.commit === was?.commit) return false;
    this.o.gitNews?.();
    // Where each branch is, seen (20.21): a repository appearing too — so its next merge has a "before".
    const moves = now ? this.o.graph().catchUpWithGit() : [];
    if (!now || !was) return true;
    this.switchedAt = this.o.now();
    // git's renames are said once the graph has the files they moved: the watcher may be behind (a dropped event,
    // a slow machine), and what's said invites a relink at once (#40).
    if (moves.length && was.branch === now.branch) this.o.apply({ changes: [], rescan: true });
    this.o.headMoved?.(was, now, moves);
    return true;
  }

  /** Another vault, or the same one again: what was held is dropped, HEAD seen afresh. */
  reset(): void {
    this.held = [];
    this.resets++;
    this.asking = false;
    if (this.wait) clearTimeout(this.wait);
    this.wait = null;
    this.seen = null;
    this.head = this.headNow();
  }

  close(): void {
    this.closed = true;
    if (this.wait) clearTimeout(this.wait);
    this.wait = null;
  }
}
