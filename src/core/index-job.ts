// An index the background auto-index builds (20.9, T12): a vault it found — opened, walked, its notes parsed — or home's
// own from the walk just made (that walk kept first), a slice at a time, as `AutoIndex` steps it. Made on the walk's
// thread in the TUI (walk-jobs.ts), so a vault on a disk that answers slowly never holds up the screen; here for the
// CLI (walkers.ts). What the machine's lists record of it is read here and handed back: the lists are written on the
// thread that asks alone, never from two at once.

import { realpathSync } from "node:fs";
import { type Config, loadConfig } from "./application/config/config.ts";
import { type CopyFacts, copyFacts, type FolderIdentity, folderIdentity } from "./folders.ts";
import { Graph } from "./graph.ts";
import { type HomeWalk, homeFilter, keepHomeWalk } from "./home.ts";
import type { KnownRoot } from "./registry.ts";
import { configFilesFor, homeAt, isVaultRoot, knownWorktree, rootAt } from "./vault.ts";

/** What an index is of: a vault found, by its folder — or home, from its walk (with its filter's signature: what it was
 *  walked under), under its settings (yours alone). */
export type IndexOf = { root: string } | { root: string; home: HomeWalk & { signature: string }; config: Config };

/** A root opened, as the machine's lists record it: its key; a vault's worktree, identity and real path, and what the
 *  list of named folders records of their copies (`copyFacts`). */
export interface Opened {
  key: string;
  home?: true;
  worktree?: KnownRoot["worktree"];
  ident?: FolderIdentity | null;
  real?: string;
  copies?: CopyFacts;
}

/** Where an index stands: none (not a vault any more), or a vault's — opened, then done with its notes counted and the
 *  vaults nested in it (by their paths in it), to index next; home's, `again` when its walk is to be made again. */
export type IndexAnswer =
  | { vault: false }
  | { vault: true; opened?: Opened; done: false }
  | { vault: true; opened?: Opened; done: true; notes: number; nested: string[]; again?: true };

export class IndexJob {
  private graph: Graph | null = null;

  constructor(private readonly of: IndexOf) {}

  /** Work for up to `budgetMs`, a note at least: opened and walked first, then its notes parsed — in the same step when
   *  the budget allows (a small vault indexed in one). */
  step(budgetMs: number): IndexAnswer {
    const end = performance.now() + budgetMs;
    let opened: Opened | undefined;
    if (!this.graph) {
      if ("home" in this.of) {
        const loc = homeAt(this.of.root);
        const { walk, capped, walked, signature } = this.of.home;
        const filter = homeFilter(loc, this.of.config);
        // Walked under what home's settings no longer say (Downloads moved, a root marker added): never kept, nor built
        // from — walked again.
        if (signature !== filter.signature()) return { vault: true, done: true, notes: 0, nested: [], again: true };
        keepHomeWalk(loc, walk, capped, walked ?? Date.now(), filter);
        this.graph = new Graph(loc, this.of.config).build(true, "lazy", this.of.home);
        opened = { key: loc.key, home: true };
      } else {
        if (!isVaultRoot(this.of.root)) return { vault: false };
        const loc = rootAt(this.of.root);
        this.graph = new Graph(loc, loadConfig({ ...configFilesFor(loc) }).config).build(true, "lazy");
        let real = this.of.root;
        try {
          real = realpathSync(this.of.root);
        } catch {}
        opened = { key: loc.key, ident: folderIdentity(this.of.root), real, copies: copyFacts() };
        if (loc.worktree) opened.worktree = knownWorktree(loc.worktree);
      }
      if (performance.now() >= end) return { vault: true, opened, done: false };
    }
    const said = opened ? { opened } : {};
    if (this.graph.parseSome(Math.max(1, end - performance.now()))) return { vault: true, ...said, done: false };
    const nested = this.graph.skipped.filter((s) => s.reason === "nested vault").map((s) => s.rel);
    return { vault: true, ...said, done: true, notes: this.graph.notes.size, nested };
  }
}
