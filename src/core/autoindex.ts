// The background auto-index (plan 20.9; blueprint/design/roots.md § The index; VV-D2): home walked slowly, a folder at
// a time, for its own notes and the vaults in it — home's index built, then each vault's, recorded in the machine's
// list — so links from vaults never opened, and from home's own notes, count as backlinks (17.11) by themselves. The
// work is done in slices, only when asked (the TUI asks while nobody is working), and its place is kept, so it
// resumes where it stopped: the vaults still to index (home's walk, quick beside them, is made again). A pass done,
// the next starts a day later.

import { join } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import { readJson, writeJson, ensureDir } from "./fsutil.ts";
import { describeCap, homeFilter, keepHomeWalk } from "./home.ts";
import { stateHome } from "./paths.ts";
import { noteIndexed, readRoots } from "./registry.ts";
import { homeAt, type VaultLocation } from "./vault.ts";
import type { WalkCap, WalkFilter, WalkLimits } from "./walk.ts";
import { HERE, type PastCap, type Pending, type SteppedIndex, type SteppedWalk, type Walker } from "./walkers.ts";

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
  /** The folders home's cap left unlisted, still looked in for vaults, a level at a time. */
  seek?: string[];
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
    seek: [],
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
  /** Home's cap, `HOME_LIMITS` unless a test says otherwise. */
  limits?: WalkLimits;
  /** Home's settings — yours alone (VV-D2) — as the one who asks has them (the TUI's, `--config` and all); your config
   *  file's by default. */
  config?: () => Config;
  /** Where its walks are made (T12): here by default (the CLI's), on the walk's own thread for the TUI. */
  walker?: Walker;
  /** Home's walk or index given up on, and why: its thread didn't answer in time, or couldn't start (T12). */
  onGaveUp?: (what: "walk" | "index", why: string) => void;
}

export class AutoIndex {
  private progress: AutoIndexProgress;
  /** A vault's index under way, and whether it's recorded as found yet. */
  private vaultIndex: SteppedIndex | null = null;
  private recorded = false;
  /** Home's walk under way, its filter, and when it began; then home's index, being built. */
  private walk: SteppedWalk | null = null;
  private walkFilter: WalkFilter | null = null;
  private walkStarted = 0;
  private homeIndex: SteppedIndex | null = null;
  /** Home walked again within a pass (`homeAgain`): the vaults' place in it kept. */
  private again = false;
  /** A folder past home's cap being looked in for vaults. */
  private seeking: { dir: string; found: Pending<PastCap> } | null = null;

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
        // A vault's index, built a slice at a time where the walker builds it — opened, walked, its notes parsed; done,
        // the vaults nested in it are next. Not a vault, or not one that can be opened: let go of.
        if (p.current) {
          const root = p.current;
          const index = (this.vaultIndex ??= this.walker.index({ root }));
          const more = index.step(Math.max(1, end - performance.now()));
          // Opened, and recorded as found where it was opened: counted.
          if (index.opened && !this.recorded) {
            this.recorded = true;
            p.found++;
          }
          if (more) {
            if (index.waiting || performance.now() >= end) return true;
            continue;
          }
          const r = index.result;
          if (r?.vault) {
            p.indexed++;
            for (const rel of r.nested) p.queue.unshift(join(root, rel));
            if (index.opened) this.markIndexed(index.opened.key);
          }
          this.vaultIndex = null;
          this.recorded = false;
          p.current = null;
          continue;
        }
        const dir = this.opts.vaults === false ? undefined : p.queue.shift();
        if (dir === undefined) {
          // Past home's cap, the vaults are still looked for: a folder it left unlisted, a level at a time.
          const more = this.opts.vaults === false ? undefined : p.seek?.[0];
          if (more !== undefined) {
            if (!this.seekIn(more)) return true;
            p.seek!.shift();
            continue;
          }
          p.passFinished ??= new Date(this.now()).toISOString();
          return false;
        }
        // Looked at next: a vault, indexed (`IndexJob` asks whether it is one, where it's made).
        p.current = dir;
      } while (performance.now() < end);
      return true;
    } finally {
      this.save();
    }
  }

  /** Home's part of a slice (VV-D2): its walk, then its index; true while there's more of it. */
  private stepHome(end: number): boolean {
    const p = this.progress;
    const loc = this.home;
    // A folder, or a note, at least.
    const left = () => Math.max(0, end - performance.now());
    if (!this.homeIndex) {
      if (!this.walk) {
        this.walkStarted = this.now();
        this.walkFilter = homeFilter(loc, this.config());
        this.walk = this.walker.sliced(this.root, this.walkFilter, this.opts.limits);
      }
      if (this.walk.step(left())) return true;
      if (!this.walk.result) {
        // Given up on (T12): home's index waits for the next pass, or the next walk asked for; the vaults go on.
        const why = this.walk.failed ?? "no answer";
        this.walk = null;
        p.home = true;
        this.again = false;
        this.opts.onGaveUp?.("walk", why);
        return false;
      }
      const walk = this.walk.result;
      const capped = this.walk.capped;
      const rest = this.walk.rest().map((rel) => join(this.root, rel));
      const filter = this.walkFilter!;
      this.walk = null;
      // [walk] changed while it was under way (VV-D2): made again, under what it says now — never kept under the old.
      if (filter.signature() !== homeFilter(loc, this.config()).signature()) return true;
      keepHomeWalk(loc, walk, capped, this.walkStarted, filter);
      // The vaults in home, each indexed in turn after it — the pass's own, not a walk made again within it; and,
      // past its cap, the folders it left, still looked in for vaults.
      if (!this.again) {
        p.queue = walk.skipped
          .filter((s) => s.reason === "nested vault")
          .map((s) => join(this.root, s.rel))
          .sort();
        p.seek = rest;
        p.current = null;
      }
      p.capped = capped;
      // Its index built from the walk just made, where the walker builds it (recorded as found there).
      this.homeIndex = this.walker.index({
        root: this.root,
        home: { walk, walked: this.walkStarted, capped },
        config: this.config(),
      });
      if (performance.now() >= end) return true;
    }
    const index = this.homeIndex;
    while (index.step(left())) if (index.waiting || performance.now() >= end) return true;
    this.homeIndex = null;
    p.home = true;
    this.again = false;
    const r = index.result;
    if (!r?.vault) {
      this.opts.onGaveUp?.("index", index.failed ?? "no answer");
      return false;
    }
    p.homeNotes = r.notes;
    this.markIndexed(loc.key);
    this.opts.onHome?.(p.capped);
    return false;
  }

  private seekFilter: WalkFilter | null = null;

  /** Home's location, by its key (its real path's): made once, not read again at every slice (T12). */
  private get home(): VaultLocation {
    return (this.homeLoc ??= homeAt(this.root));
  }
  private homeLoc: VaultLocation | null = null;

  /** Home's settings: your config's alone (VV-D2). */
  private config(): Config {
    return this.opts.config?.() ?? loadConfig().config;
  }

  private get walker(): Walker {
    return this.opts.walker ?? HERE;
  }

  /**
   * A folder home's cap left unlisted, looked in for vaults (20.9): a vault in it indexed next, its other folders looked
   * in later — home's skip list held, as its walk holds it (`vaultsPastCap`). False while it's being looked in.
   */
  private seekIn(dir: string): boolean {
    const p = this.progress;
    this.seekFilter ??= homeFilter(this.home, this.config());
    if (this.seeking?.dir !== dir) this.seeking = { dir, found: this.walker.seek(dir, this.seekFilter) };
    const { found } = this.seeking;
    if (!found.settled) return false;
    this.seeking = null;
    p.queue.push(...(found.value?.vaults ?? []));
    (p.seek ??= []).push(...(found.value?.folders ?? []));
    return true;
  }

  private markIndexed(key: string): void {
    const v = readRoots().find((x) => x.kind !== "folder" && x.key === key);
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
