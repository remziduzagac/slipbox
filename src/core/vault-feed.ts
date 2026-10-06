// What keeps a graph current with its vault's files (5.1, 5.9, 5.10): the watcher's batches,
// applied to the graph — or, while git writes (its index lock), held and applied together after,
// and the files a branch switch brings and takes not taken for moves. The TUI and the LSP server
// (11.2) each keep a graph by one; what they do with the news is their own.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Checkout, headCommit, headOf } from "./git.ts";
import type { Graph } from "./graph.ts";
import type { WatchBatch } from "./watch.ts";

/** HEAD as seen: its branch and its commit — a merge, a pull, a commit move it on the branch (20.21). */
export interface Head {
  branch: string | null;
  commit: string | null;
}

/** After HEAD moves, the watcher's batches for this long are the switch's too. */
export const SWITCH_SETTLE_MS = 3000;

/**
 * A batch applied to the graph: notes updated, added and removed, attachments, a rescan.
 * `structural` when notes came or went — every link's status may have changed — and warnings for
 * what was left out.
 */
export function applyToGraph(graph: Graph, batch: WatchBatch, maxFileSize: number): { structural: boolean; warnings: string[] } {
  let structural = false;
  const warnings: string[] = [];
  if (batch.rescan) {
    graph.build(true, "lazy");
    structural = true;
  }
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
      st = statSync(abs);
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
      if (c.kind === "created" || !graph.notes.has(c.rel)) structural = true;
      graph.updateFile(c.rel, { rel: c.rel, abs, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return { structural, warnings };
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
}

export class VaultFeed {
  /** HEAD as last seen. */
  head: Head | null = null;
  private held: WatchBatch[] = [];
  private wait: ReturnType<typeof setTimeout> | null = null;
  /** When HEAD last moved. */
  private switchedAt = Number.NEGATIVE_INFINITY;
  private closed = false;

  constructor(private readonly o: FeedOptions) {
    this.head = this.headNow();
  }

  headNow(): Head | null {
    const c = this.o.checkout();
    if (!c) return null;
    return { branch: headOf(c).branch, commit: headCommit(c) };
  }

  /** git is mid-commit (or mid-anything) in the vault's checkout (5.10). */
  gitLocked(): boolean {
    if (this.o.locked) return this.o.locked();
    const c = this.o.checkout();
    return !!c && existsSync(join(c.gitDir, "index.lock"));
  }

  /** git is mid-rebase in the checkout: HEAD detached between its steps (or stopped on a conflict)
   *  — not where the branch is going, so not a move of HEAD yet. */
  rebasing(): boolean {
    const c = this.o.checkout();
    return !!c && (existsSync(join(c.gitDir, "rebase-merge")) || existsSync(join(c.gitDir, "rebase-apply")));
  }

  /** A batch from the watcher: applied now — or, while git writes, held with the rest it writes. */
  receive(b: WatchBatch): void {
    this.held.push(b);
    if (this.gitLocked()) return this.waitForGit();
    this.flush();
  }

  private waitForGit(): void {
    if (this.wait) return;
    const tick = () => {
      this.wait = null;
      if (this.closed) return;
      if (this.gitLocked()) {
        this.wait = setTimeout(tick, 100);
        (this.wait as { unref?: () => void }).unref?.();
        return;
      }
      this.flush();
    };
    this.wait = setTimeout(tick, 100);
    (this.wait as { unref?: () => void }).unref?.();
  }

  /** The held batches applied as one — a switch that came with them seen first, and their files
   *  not taken for moves (a note only one branch has comes and goes; nothing moved). */
  flush(): void {
    const batches = this.held;
    this.held = [];
    this.checkHead();
    if (!batches.length) return;
    const merged: WatchBatch = { changes: batches.flatMap((b) => b.changes), rescan: batches.some((b) => b.rescan) };
    this.o.gitNews?.();
    if (this.o.now() - this.switchedAt < SWITCH_SETTLE_MS) this.o.graph().pauseMoves(() => this.o.apply(merged));
    else this.o.apply(merged);
  }

  /** HEAD looked at (a poll, each batch): true when it moved, or a repository appeared or went.
   *  Not while git still writes, nor mid-rebase: then it hasn't finished moving (a rebase lands as
   *  one change — its branch moved on, never a switch away and back). */
  checkHead(): boolean {
    if (this.gitLocked() || this.rebasing()) return false;
    const now = this.headNow();
    const was = this.head;
    this.head = now;
    if (now?.branch === was?.branch && now?.commit === was?.commit) return false;
    this.o.gitNews?.();
    // Where each branch is, seen (20.21): a repository appearing too — so its next merge has a "before".
    const moves = now ? this.o.graph().catchUpWithGit() : [];
    if (!now || !was) return true;
    this.switchedAt = this.o.now();
    this.o.headMoved?.(was, now, moves);
    return true;
  }

  /** Another vault, or the same one again: what was held is dropped, HEAD seen afresh. */
  reset(): void {
    this.held = [];
    this.head = this.headNow();
  }

  close(): void {
    this.closed = true;
    if (this.wait) clearTimeout(this.wait);
    this.wait = null;
  }
}
