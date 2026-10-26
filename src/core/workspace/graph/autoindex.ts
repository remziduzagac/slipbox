// The background auto-index (plan 20.9; blueprint/design/roots.md § The index; VV-D2): home walked slowly, a folder at
// a time, for its own notes and the vaults in it — home's index built, then each vault's, recorded in the machine's
// list — so links from vaults never opened, and from home's own notes, count as backlinks (17.11) by themselves. The
// work is done in slices, only when asked (the TUI asks while nobody is working), and its place is kept, so it
// resumes where it stopped: the vaults still to index (home's walk, quick beside them, is made again). A pass done,
// the next starts a day later.

import { join } from "node:path";
import { type Config, loadConfig } from "../../application/config/config.ts";
import { readJson, writeJson, ensureDir } from "../../foundation/platform/fsutil.ts";
import { recordFolder } from "../vaults/folders.ts";
import { describeCap } from "../vaults/home.ts";
import type { Opened } from "./index-job.ts";
import { stateHome } from "../../foundation/platform/paths.ts";
import { noteIndexed, readRoots, recordRoot } from "../vaults/registry.ts";
import { rootMarkers } from "../vaults/vault.ts";
import type { FilterSettings, WalkCap, WalkLimits } from "../walk/walk.ts";
import { HERE, type PastCap, type Pending, type SteppedIndex, type SteppedWalk, type Walker } from "../walk/walkers.ts";

/** A pass finished: the next starts this long after. */
export const REPASS_MS = 24 * 60 * 60 * 1000;
/** Home's walk given up on (its thread didn't answer in time): tried again this long after, the pass waiting for it. */
export const WALK_RETRY_MS = 10 * 60 * 1000;

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
  /** The vault last counted as found: one being indexed when the TUI quit isn't counted again. */
  counted?: string | null;
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
    counted: null,
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
  /** A vault's index under way, and whether it's recorded as found yet; home's own the same. */
  private vaultIndex: SteppedIndex | null = null;
  private recorded = false;
  private homeRecorded = false;
  /** Home's walk under way, the settings it's made under, and when it began; then home's index, being built. */
  private walk: SteppedWalk | null = null;
  private walkSettings: { filter: FilterSettings; said: string } | null = null;
  private walkStarted = 0;
  private homeIndex: SteppedIndex | null = null;
  /** Home walked again within a pass (`homeAgain`): the vaults' place in it kept. */
  private again = false;
  /** When home's walk given up on is tried again (epoch ms); 0: whenever it's due. */
  private walkRetry = 0;
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
   * Home's walk made again at the next slice (VV-D2): a folder came in home, which only a walk finds — or, `later`, ten
   * minutes from now (T12: its graph's build from the last one given up on). The vaults' pass stays where it is, and
   * goes on meanwhile.
   */
  homeAgain(later = false): void {
    if (!this.progress.passStarted || !this.progress.home) return;
    this.progress.home = false;
    this.again = true;
    if (later) this.walkRetry = this.now() + WALK_RETRY_MS;
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
        // Home first (VV-D2): its walk, a slice at a time, then its index; the vaults it found are next. Its walk given
        // up on is tried again later: until then there's nothing to do — but the vaults of a pass it's walked again in.
        if (!p.home) {
          if (this.now() >= this.walkRetry) {
            if (this.stepHome(end)) return true;
            continue;
          }
          if (!this.again) return false;
        }
        // A vault's index, built a slice at a time where the walker builds it — opened, walked, its notes parsed; done,
        // the vaults nested in it are next. Not a vault, or not one that can be opened: let go of.
        if (p.current) {
          const root = p.current;
          const index = (this.vaultIndex ??= this.walker.index({ root }));
          const more = index.step(Math.max(1, end - performance.now()));
          // Opened: counted once, and recorded as found here — from what was read of it where it was opened.
          if (index.opened && !this.recorded) {
            this.recorded = true;
            if (p.counted !== root) p.found++;
            p.counted = root;
            this.recordFound(root, index.opened);
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
    // A folder, or a note, at least.
    const left = () => Math.max(0, end - performance.now());
    if (!this.homeIndex) {
      if (!this.walk) {
        this.walkStarted = this.now();
        // By its settings alone: its filter's made where it walks, which reads home (where Downloads is); here, nothing.
        this.walkSettings = this.homeSettings();
        this.walk = this.walker.sliced(this.walkSettings.filter, this.opts.limits);
      }
      if (this.walk.step(left())) return true;
      if (!this.walk.done) {
        // Given up on (T12): made again from its top a while later, the pass waiting for it — the vaults it finds are
        // the pass's.
        const why = this.walk.failed ?? "no answer";
        this.walk = null;
        this.walkRetry = this.now() + WALK_RETRY_MS;
        this.opts.onGaveUp?.("walk", why);
        return false;
      }
      const walk = this.walk;
      const capped = walk.capped;
      const rest = walk.rest().map((rel) => join(this.root, rel));
      const made = this.walkSettings!;
      this.walk = null;
      // [walk] changed while it was under way (VV-D2): made again, under what it says now — never kept under the old.
      if (made.said !== this.homeSettings().said) return true;
      // The vaults in home, each indexed in turn after it — the pass's own, not a walk made again within it; and,
      // past its cap, the folders it left, still looked in for vaults.
      if (!this.again) {
        p.queue = walk
          .nested()
          .map((rel) => join(this.root, rel))
          .sort();
        p.seek = rest;
        p.current = null;
      }
      p.capped = capped;
      // The walk kept, and its index built from it, where the walk is.
      this.homeIndex = this.walker.index({
        root: this.root,
        home: walk.handOver(this.walkStarted),
        config: this.config(),
      });
      if (performance.now() >= end) return true;
    }
    const index = this.homeIndex;
    for (;;) {
      const more = index.step(left());
      if (index.opened && !this.homeRecorded) {
        this.homeRecorded = true;
        this.recordFound(this.root, index.opened);
      }
      if (!more) break;
      if (index.waiting || performance.now() >= end) return true;
    }
    this.homeIndex = null;
    this.homeRecorded = false;
    const r = index.result;
    // Walked under settings home's are no longer (where Downloads is, read where the walk is): walked again.
    if (r?.vault && r.again) return true;
    p.home = true;
    this.again = false;
    if (!r?.vault) {
      this.opts.onGaveUp?.("index", index.failed ?? "no answer");
      return false;
    }
    p.homeNotes = r.notes;
    if (index.opened) this.markIndexed(index.opened.key);
    this.opts.onHome?.(p.capped);
    return false;
  }

  /** Home's walk's filter by its settings (VV-D2: its skip list, your config's extensions, exclusions and size cap),
   *  and what in them says whether a walk was made under them — none of it read from home. */
  private homeSettings(): { filter: FilterSettings; said: string } {
    const walk = this.config().walk;
    return {
      filter: { root: this.root, walk, opts: { home: true } },
      said: JSON.stringify({ walk, markers: rootMarkers() }),
    };
  }

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
    if (this.seeking?.dir !== dir) this.seeking = { dir, found: this.walker.seek(dir, this.homeSettings().filter) };
    const { found } = this.seeking;
    if (!found.settled) return false;
    this.seeking = null;
    p.queue.push(...(found.value?.vaults ?? []));
    (p.seek ??= []).push(...(found.value?.folders ?? []));
    return true;
  }

  /**
   * A root the index opened (`opened`: what was read of it where it was opened, nothing read here), recorded as found,
   * not opened, when it isn't known yet: listed after those opened, until it's opened itself; its name in the lookup
   * (21.6). By its key (its real path's): reached by another path, it's the root already listed. The machine's lists
   * are written here alone, never from two threads at once.
   */
  private recordFound(root: string, opened: Opened): void {
    try {
      const kind = opened.home ? "home" : "vault";
      if (!readRoots().some((v) => v.kind === kind && v.key === opened.key))
        recordRoot(
          { kind, path: root, found: true, ...(opened.worktree ? { worktree: opened.worktree } : {}) },
          new Date(),
          opened.key,
        );
      if (!opened.home) {
        const known = { ident: opened.ident ?? null, real: opened.real ?? root, copies: opened.copies };
        recordFolder(root, { found: true, known });
      }
    } catch {}
  }

  private markIndexed(key: string): void {
    const v = readRoots().find((x) => x.kind !== "folder" && x.key === key);
    if (v) noteIndexed(v.key, new Date(this.now()));
  }

  /** The place kept — when it changed since it was last kept: a tick waiting on a thread, or a retry, writes nothing. */
  private save(): void {
    if (!this.file) return;
    const now = JSON.stringify(this.progress);
    if (now === this.saved) return;
    try {
      ensureDir(stateHome());
      writeJson(this.file, this.progress);
      this.saved = now;
    } catch {}
  }
  private saved = "";
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
