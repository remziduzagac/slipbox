// Content and git move evidence, scoped to one Graph. No note/index maps are duplicated.
import { readText, ensureDir, readJson, sweepTemps, writeJson } from "../../../foundation/platform/fsutil.ts";
import { stateDir } from "../../../foundation/platform/paths.ts";
import { headCommit, headOf } from "../../git/git.ts";
import { changedBetween, inVault } from "../../git/branches/gitops.ts";
import { contentHash, type Redirects } from "../../links/redirects.ts";
import { checkoutAt, isListed, type VaultLocation } from "../../vaults/vault.ts";
import type { NoteEntry } from "../graph-types.ts";
import type { NoteFile } from "../../walk/walk.ts";
import { join } from "node:path";

interface MoveContext {
  readonly loc: VaultLocation;
  readonly root: string;
  readonly redirects: Redirects | null;
  moved(pairs: [string, string][]): void;
  forgetProblems(): void;
}

export class GraphMoves {
  constructor(readonly context: MoveContext) {}

  /** Notes that went (removed) and came (added) lately, by hash: a watcher sees a move as both. */
  private readonly went = new Map<string, { rel: string; at: number }[]>();
  private readonly came = new Map<string, { rel: string; at: number }[]>();
  /** While a branch switch lands (5.9): files only one branch has come and go, but nothing moved. */
  private movesPaused = 0;

  detectMoves(vanished: NoteEntry[], fresh: NoteFile[]): void {
    const hashed = vanished.filter((e) => e.hash && e.size > 0);
    if (!hashed.length || !fresh.length) return;
    const sizes = new Set(hashed.map((e) => e.size));
    const freshHash = new Map<string, string[]>();
    for (const f of fresh) {
      if (!sizes.has(f.size)) continue;
      let h: string;
      try {
        h = contentHash(readText(f.abs).text);
      } catch {
        continue;
      }
      freshHash.set(h, [...(freshHash.get(h) ?? []), f.rel]);
    }
    const moves: [string, string][] = [];
    for (const e of hashed) {
      const to = freshHash.get(e.hash);
      if (to?.length === 1 && hashed.filter((x) => x.hash === e.hash).length === 1) moves.push([e.rel, to[0]!]);
    }
    if (moves.length) this.context.redirects?.add(moves);
  }

  catchUpWithGit(): [string, string][] {
    // A vault's git; home's only when `~` is itself a repository (VV-D2).
    if (this.context.loc.mode === "folder") return [];
    const c = checkoutAt(this.context.loc);
    const branch = c ? headOf(c).branch : null;
    const commit = c ? headCommit(c) : null;
    if (!c || !branch || !commit) return [];
    const file = join(stateDir(this.context.loc), "heads.json");
    const seen = readJson<{ version?: number; branches?: Record<string, string> } | null>(file, null)?.branches ?? {};
    const was = seen[branch];
    if (was === commit) return [];
    const moves: [string, string][] = [];
    if (was) {
      for (const f of changedBetween(c, was, commit) ?? []) {
        const from = f.from ? inVault(c, this.context.root, f.from) : null;
        const to = inVault(c, this.context.root, f.path);
        if (f.state === "renamed" && from && to) moves.push([from, to]);
      }
      if (moves.length) {
        this.context.redirects?.add(moves, new Date(), `${was.slice(0, 7)}..${commit.slice(0, 7)}`);
        this.context.forgetProblems();
      }
    }
    // The newest last: a long-lived copy's branches, as many as it has had lately.
    delete seen[branch];
    const kept = Object.entries(seen).slice(-199);
    try {
      ensureDir(stateDir(this.context.loc));
      sweepTemps(stateDir(this.context.loc), "heads.json");
      writeJson(file, { version: 1, branches: Object.fromEntries([...kept, [branch, commit]]) });
    } catch {}
    return moves;
  }

  pauseMoves<T>(fn: () => T): T {
    this.movesPaused++;
    try {
      return fn();
    } finally {
      this.movesPaused--;
    }
  }

  branchNow(): string | null {
    const c = checkoutAt(this.context.loc);
    return c ? headOf(c).branch : null;
  }

  /**
   * A removal and an arrival of the same text within a minute, in either order, are a move — as
   * when the index is built (`detectMoves`), only when it is the one such pair: two notes with that
   * text gone (or come) and one come (or gone) are no move, whichever went where. A note back where
   * it was is no move either: its going and coming cancel.
   */
  pairMove(hash: string, rel: string, side: "went" | "came"): void {
    if (!hash || isListed(this.context.loc) || this.movesPaused) return;
    const now = Date.now();
    for (const m of [this.went, this.came])
      for (const [h, vs] of m) {
        const kept = vs.filter((v) => now - v.at <= 60_000);
        if (kept.length) m.set(h, kept);
        else m.delete(h);
      }
    const mine = side === "went" ? this.went : this.came;
    const other = side === "went" ? this.came : this.went;
    const theirs = other.get(hash) ?? [];
    const ours = mine.get(hash) ?? [];
    const others = theirs.filter((v) => v.rel !== rel);
    if (others.length < theirs.length) {
      if (others.length) other.set(hash, others);
      else other.delete(hash);
      return;
    }
    if (others.length === 1 && !ours.length) {
      other.delete(hash);
      const move: [string, string] = side === "went" ? [rel, others[0]!.rel] : [others[0]!.rel, rel];
      this.context.redirects?.add([move]);
      this.context.moved([move]);
      return;
    }
    mine.set(hash, [...ours.filter((v) => v.rel !== rel), { rel, at: now }]);
  }
}
