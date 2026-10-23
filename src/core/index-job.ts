// An index the background auto-index builds (20.9, T12): a vault it found — opened, recorded as found, walked, its notes
// parsed — or home's own from the walk just made, a slice at a time, as `AutoIndex` steps it. Made on the walk's thread
// in the TUI (walk-jobs.ts), so a vault on a disk that answers slowly never holds up the screen; here for the CLI
// (walkers.ts). The machine's lists are written from there as a CLI command writes them, beside the TUI.

import { type Config, loadConfig } from "./config.ts";
import { recordFolder } from "./folders.ts";
import { Graph } from "./graph.ts";
import type { HomeWalk } from "./home.ts";
import { readRoots, recordRoot } from "./registry.ts";
import { configFilesFor, homeAt, isVaultRoot, knownWorktree, rootAt, type VaultLocation } from "./vault.ts";

/** What an index is of: a vault found, by its folder — or home, from its walk, under its settings (yours alone). */
export type IndexOf = { root: string } | { root: string; home: HomeWalk; config: Config };

/** A vault opened, by its key: what the machine's lists know it by. */
export interface Opened {
  key: string;
}

/** Where an index stands: none (not a vault any more), or a vault's — opened, then done with its notes counted and the
 *  vaults nested in it (by their paths in it), to index next. */
export type IndexAnswer =
  | { vault: false }
  | { vault: true; opened?: Opened; done: false }
  | { vault: true; opened?: Opened; done: true; notes: number; nested: string[] };

/**
 * A root found recorded in the machine's list, when it isn't known yet — listed after those opened, until it's opened
 * itself; its name in the lookup (21.6). By its key (its real path's): reached by another path, it's the root already
 * listed. Nothing recorded when the lists can't be written.
 */
function recordFound(loc: VaultLocation): void {
  try {
    if (loc.mode === "home") {
      if (!readRoots().some((v) => v.key === loc.key && v.kind === "home"))
        recordRoot({ kind: "home", path: loc.root, found: true });
      return;
    }
    if (!readRoots().some((v) => v.kind === "vault" && v.key === loc.key))
      recordRoot({
        kind: "vault",
        path: loc.root,
        found: true,
        ...(loc.worktree ? { worktree: knownWorktree(loc.worktree) } : {}),
      });
    recordFolder(loc.root, { found: true });
  } catch {}
}

export class IndexJob {
  private graph: Graph | null = null;

  constructor(private readonly of: IndexOf) {}

  /** Work for up to `budgetMs`, a note at least: opened and walked first, then its notes parsed. */
  step(budgetMs: number): IndexAnswer {
    if (!this.graph) {
      if ("home" in this.of) {
        const loc = homeAt(this.of.root);
        recordFound(loc);
        this.graph = new Graph(loc, this.of.config).build(true, "lazy", this.of.home);
        return { vault: true, opened: { key: loc.key }, done: false };
      }
      if (!isVaultRoot(this.of.root)) return { vault: false };
      const loc = rootAt(this.of.root);
      recordFound(loc);
      this.graph = new Graph(loc, loadConfig({ ...configFilesFor(loc) }).config).build(true, "lazy");
      return { vault: true, opened: { key: loc.key }, done: false };
    }
    if (this.graph.parseSome(budgetMs)) return { vault: true, done: false };
    const nested = this.graph.skipped.filter((s) => s.reason === "nested vault").map((s) => s.rel);
    return { vault: true, done: true, notes: this.graph.notes.size, nested };
  }
}
