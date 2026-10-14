// The background auto-index (plan 20.9; blueprint/design/roots.md § The index; VV-D2): home walked slowly, a folder at
// a time, for its own notes and the vaults in it — home's index built, then each vault's, recorded in the machine's
// list — so links from vaults never opened, and from home's own notes, count as backlinks (17.11) by themselves. The
// work is done in slices, only when asked (the TUI asks while nobody is working), and its place is kept, so it
// resumes where it stopped: the vaults still to index (home's walk, quick beside them, is made again). A pass done,
// the next starts a day later.

import { join } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import { readJson, writeJson, ensureDir } from "./fsutil.ts";
import { Graph } from "./graph.ts";
import { recordFolder } from "./folders.ts";
import { describeCap, homeFilter, keepHomeWalk } from "./home.ts";
import { stateHome, vaultKey } from "./paths.ts";
import { noteIndexed, readRoots, recordRoot } from "./registry.ts";
import { configFilesFor, homeAt, isVaultRoot, knownWorktree, rootAt } from "./vault.ts";
import { SlicedWalk, type WalkCap } from "./walk.ts";

/** A pass finished: the next starts this long after. */
export const REPASS_MS = 24 * 60 * 60 * 1000;

export interface AutoIndexProgress {
  version: 2;
  /** The folder walked: home. */
  root: string;
  /** Home walked and its index built this pass (VV-D2): until it is, it's walked again from its top. */
  home: boolean;
  /** The vaults home's walk found, still to index, in order. */
  queue: string[];
  /** The vault whose index is being built, if one is. */
  current: string | null;
  found: number;
  indexed: number;
  /** Home's own notes, as its index holds them, and what its cap left out (VV-D2). */
  homeNotes: number;
  capped: WalkCap | null;
  passStarted: string | null;
  passFinished: string | null;
}

export function autoIndexFile(): string {
  return join(stateHome(), "autoindex.json");
}

function fresh(root: string): AutoIndexProgress {
  return {
    version: 2,
    root,
    home: false,
    queue: [],
    current: null,
    found: 0,
    indexed: 0,
    homeNotes: 0,
    capped: null,
    passStarted: null,
    passFinished: null,
  };
}

export interface AutoIndexOptions {
  /** Index the vaults home holds too (the background index); false: home's own index alone — the TUI's, while home
   *  is the vault open and the background index is off. */
  vaults?: boolean;
  /** Home's index built: its walk kept, its notes parsed and written. */
  onHome?: (capped: WalkCap | null) => void;
}

export class AutoIndex {
  private progress: AutoIndexProgress;
  private graph: Graph | null = null;
  /** Home's walk under way, and when it began; then home's graph, being parsed. */
  private walk: SlicedWalk | null = null;
  private walkStarted = 0;
  private homeGraph: Graph | null = null;
  /** Home walked again within a pass (`homeAgain`): the vaults' place in it kept. */
  private again = false;

  /** `file`: where its place is kept; null keeps it nowhere (a run of its own, from home's top). */
  constructor(
    readonly root: string,
    private readonly file: string | null = autoIndexFile(),
    private readonly now = () => Date.now(),
    private readonly opts: AutoIndexOptions = {},
  ) {
    const kept = file ? readJson<AutoIndexProgress | null>(file, null) : null;
    this.progress = kept?.version === 2 && kept.root === root && Array.isArray(kept.queue) ? kept : fresh(root);
  }

  /** Where it is: vaults left, vaults found and indexed this pass, home's notes, whether the pass is done. */
  get status(): Readonly<AutoIndexProgress> {
    return this.progress;
  }

  /** Nothing to do until the next pass is due. */
  get idle(): boolean {
    const p = this.progress;
    return p.home && !!p.passFinished && this.now() - Date.parse(p.passFinished) < REPASS_MS;
  }

  /**
   * Home's walk made again at the next slice (VV-D2): a folder came in home, which only a walk finds. The vaults' pass
   * stays where it is.
   */
  homeAgain(): void {
    if (!this.progress.passStarted || !this.progress.home) return;
    this.progress.home = false;
    this.again = true;
  }

  /** Work for up to `budgetMs`; false when the pass is done (or none is due). The place is kept. */
  step(budgetMs: number): boolean {
    if (this.idle) return false;
    const end = performance.now() + budgetMs;
    const p = this.progress;
    if (!p.passStarted || (p.passFinished && this.now() - Date.parse(p.passFinished) >= REPASS_MS))
      Object.assign(p, fresh(this.root), { passStarted: new Date(this.now()).toISOString() });
    try {
      do {
        // Home first (VV-D2): its walk, a slice at a time, then its index; the vaults it found are next.
        if (!p.home) {
          if (this.stepHome(end)) return true;
          continue;
        }
        // A vault's index, built a slice at a time; done, the vaults nested in it are next.
        if (p.current) {
          this.graph ??= this.open(p.current);
          if (this.graph?.parseSome(Math.max(1, end - performance.now()))) return true;
          if (this.graph) {
            p.indexed++;
            for (const s of this.graph.skipped)
              if (s.reason === "nested vault") p.queue.unshift(join(p.current, s.rel));
            this.markIndexed(p.current);
          }
          this.graph = null;
          p.current = null;
          continue;
        }
        const dir = this.opts.vaults === false ? undefined : p.queue.shift();
        if (dir === undefined) {
          p.passFinished ??= new Date(this.now()).toISOString();
          return false;
        }
        if (isVaultRoot(dir)) {
          p.current = dir;
          p.found++;
        }
      } while (performance.now() < end);
      return true;
    } finally {
      this.save();
    }
  }

  /** Home's part of a slice (VV-D2): its walk, then its index; true while there's more of it. */
  private stepHome(end: number): boolean {
    const p = this.progress;
    const loc = homeAt(this.root);
    // A folder, or a note, at least.
    const left = () => Math.max(0, end - performance.now());
    if (!this.homeGraph) {
      if (!this.walk) {
        this.walkStarted = this.now();
        this.walk = new SlicedWalk(this.root, homeFilter(loc, loadConfig().config));
      }
      if (this.walk.step(left())) return true;
      const walk = this.walk.result!;
      const capped = this.walk.capped;
      this.walk = null;
      keepHomeWalk(loc, walk, capped, this.walkStarted);
      // The vaults in home, each indexed in turn after it — the pass's own, not a walk made again within it.
      if (!this.again) {
        p.queue = walk.skipped
          .filter((s) => s.reason === "nested vault")
          .map((s) => join(this.root, s.rel))
          .sort();
        p.current = null;
      }
      p.capped = capped;
      this.homeGraph = this.openHome(walk, capped);
      if (!this.homeGraph) {
        p.home = true;
        this.again = false;
        return false;
      }
      if (performance.now() >= end) return true;
    }
    if (this.homeGraph.parseSome(left())) return true;
    p.homeNotes = this.homeGraph.notes.size;
    p.home = true;
    this.again = false;
    this.homeGraph = null;
    this.markIndexed(this.root);
    this.opts.onHome?.(p.capped);
    return false;
  }

  /** Home's graph (VV-D2), built from the walk just made; recorded as found when it isn't known yet. */
  private openHome(walk: NonNullable<SlicedWalk["result"]>, capped: WalkCap | null): Graph | null {
    try {
      const loc = homeAt(this.root);
      if (!readRoots().some((v) => v.key === loc.key && v.kind === "home"))
        recordRoot({ kind: "home", path: this.root, found: true });
      return new Graph(loc, loadConfig({ ...configFilesFor(loc) }).config).build(true, "lazy", {
        walk,
        walked: this.walkStarted,
        capped,
      });
    } catch {
      return null;
    }
  }

  /** The root at `root`, its index read and refreshed lazily; recorded as found, not opened. */
  private open(root: string): Graph | null {
    try {
      const loc = rootAt(root);
      // Listed after those opened, until it's opened itself; its name in the lookup (21.6), as found.
      // By its key (its real path's): reached by another path, it's the root already listed.
      if (!readRoots().some((v) => v.kind === "vault" && v.key === loc.key))
        recordRoot({
          kind: "vault",
          path: root,
          found: true,
          ...(loc.worktree ? { worktree: knownWorktree(loc.worktree) } : {}),
        });
      recordFolder(root, { found: true });
      return new Graph(loc, loadConfig({ ...configFilesFor(loc) }).config).build(true, "lazy");
    } catch {
      return null;
    }
  }

  private markIndexed(root: string): void {
    const v = readRoots().find((x) => x.kind !== "folder" && x.key === vaultKey(root));
    if (v) noteIndexed(v.key, new Date(this.now()));
  }

  private save(): void {
    if (!this.file) return;
    try {
      ensureDir(stateHome());
      writeJson(this.file, this.progress);
    } catch {}
  }
}

/** When an agent last ran a command (the CLI notes it): the auto-index waits while one works. */
export function activityFile(): string {
  return join(stateHome(), "activity");
}

/** The background auto-index of home (20.9, VV-D2), as far as it's got: off, a pass done, or vaults left. */
export function backgroundStatus(config: Pick<Config, "index">): {
  on: boolean;
  found: number;
  indexed: number;
  left: number;
  finished: string | null;
  started: string | null;
  /** Home's own index built this pass, its notes, and what its cap left out. */
  home: boolean;
  homeNotes: number;
  capped: WalkCap | null;
} {
  const p = readJson<Partial<AutoIndexProgress> | null>(autoIndexFile(), null);
  const v2 = p?.version === 2 ? p : null;
  return {
    on: config.index.background,
    found: v2?.found ?? 0,
    indexed: v2?.indexed ?? 0,
    left: (v2?.queue?.length ?? 0) + (v2?.current ? 1 : 0),
    finished: v2?.passFinished ?? null,
    started: v2?.passStarted ?? null,
    home: v2?.home ?? false,
    homeNotes: v2?.homeNotes ?? 0,
    capped: v2?.capped === "notes" || v2?.capped === "folders" ? v2.capped : null,
  };
}

/** Where the background auto-index is, in words (`info`, `space v i`). */
export function describeBackground(b: ReturnType<typeof backgroundStatus>): string {
  if (!b.on) return "background index off ([index] background)";
  if (!b.started) return "background index not started yet";
  const vaults = (n: number) => `${n} vault${n === 1 ? "" : "s"}`;
  const notes = `home's ${b.homeNotes} note${b.homeNotes === 1 ? "" : "s"}`;
  const cap = b.capped ? ` — ${describeCap(b.capped)}` : "";
  if (b.finished)
    return `background index: pass done ${b.finished.slice(0, 16).replace("T", " ")} — ${notes}, ${vaults(b.found)} found${cap}`;
  if (!b.home) return "background index: walking home";
  return `background index: ${notes} indexed, ${vaults(b.found)} found so far, ${b.left} left${cap}`;
}
