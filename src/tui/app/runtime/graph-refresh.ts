// Background parsing and home refresh; watcher delivery stays in Watch.
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { type Config, loadConfig } from "../../../core/application/config/config.ts";
import { readText } from "../../../core/foundation/platform/fsutil.ts";
import { activityFile, AutoIndex, autoIndexFile } from "../../../core/workspace/graph/autoindex.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import { describeCap, type HomeWalk, inFolders, keepHomeWalk, walksInto } from "../../../core/workspace/vaults/home.ts";
import { homeFolder, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import { applyToGraph } from "../../../core/workspace/vaults/vault-feed.ts";
import type { WalkCap } from "../../../core/workspace/walk/walk.ts";
import { walkFailure, walkThread } from "../../../core/workspace/walk/walk-thread.ts";
import { newParseCache } from "../../../core/documents/markdown/parse.ts";
import { parseInBackground } from "../../../core/documents/markdown/parse-pool.ts";
import { BACKGROUND_PARSE } from "../../documents/buffers/buffer.ts";
import type { Level } from "../notifications/contracts.ts";
import type { Background } from "./background.ts";

/** Live index inputs and the effects a completed pass delivers. */
interface GraphRefreshContext {
  readonly graph: Graph;
  readonly loc: VaultLocation;
  readonly config: Config;
  readonly configFile: string | undefined;
  readonly quitting: boolean;
  indexing: number;
  lastInputAt: number;
  readonly background: Pick<Background, "begin">;
  readonly explorer: { invalidateTree(): void };
  readonly buffers: ReadonlyMap<string, { invalidateLayouts(): void }>;
  readonly host: { requestRender(): void };
  now(): number;
  message(level: Level, text: string): void;
  run(spec: string): Promise<void>;
  relayoutAll(): void;
}

/**
 * A graph's notes not parsed yet, parsed between frames, a slice at a time (5.1): a big note on other threads first
 * (15.1), the main thread only putting its chunks together — parsed here whole, one would hold every key for seconds;
 * where threads can't start, it's parsed here after all. `graph` is asked again at each slice; `slice` hears how many
 * are left after each, `done` that none is.
 */
export function parseInSlices(
  graph: () => Graph,
  opts: { stopped: () => boolean; paused?: () => boolean; slice?: (left: number) => void; done: () => void },
): void {
  const elsewhere = new Set<string>();
  const failed = new Set<string>();
  const tick = () => {
    if (opts.stopped()) return;
    if (opts.paused?.()) return void setTimeout(tick, 50);
    for (const f of graph().unparsedOver(BACKGROUND_PARSE)) {
      if (elsewhere.has(f.rel) || failed.has(f.rel)) continue;
      let text: string;
      try {
        text = readText(f.abs).text;
      } catch {
        continue; // unreadable: the parse here says so
      }
      const chunks = newParseCache();
      elsewhere.add(f.rel);
      void parseInBackground(text, chunks)
        .catch(() => false)
        .then((ok) => {
          elsewhere.delete(f.rel);
          if (opts.stopped()) return;
          // The threads couldn't: parsed here after all (parseSome) — never indexed from a parse that failed.
          if (!ok) return void failed.add(f.rel);
          let now: string;
          try {
            now = readText(f.abs).text;
          } catch {
            return void failed.add(f.rel); // unreadable now: the parse here says so
          }
          // Changed while it parsed: its new text goes to the threads on the next tick, not parsed here with
          // chunks of the old.
          if (now === text) graph().entry(f.rel, chunks);
        });
    }
    const left = graph().parseSome(12, elsewhere);
    opts.slice?.(left);
    // Only notes parsing elsewhere left: look again in a while, not every millisecond.
    if (left) return void setTimeout(tick, left > elsewhere.size ? 1 : 50);
    opts.done();
  };
  setTimeout(tick, 1);
}

/** Background parse tasks and auto-index/home-refresh state for one watcher lifetime. */
export class GraphRefresh {
  constructor(
    private readonly app: GraphRefreshContext,
    private readonly delivery: { rememberSelections(): () => void; rebuilt(): void },
  ) {}

  indexInBackground(): void {
    if (this.app.indexing) return; // a pass is already running; it picks up the new stubs
    const total = this.app.graph.pendingCount;
    if (!total) return;
    this.app.indexing = total;
    const t0 = this.app.now();
    let cancelled = false;
    let paused = false;
    const finished = this.app.background.begin(
      "Indexing",
      (quiet) => {
        cancelled = true;
        this.app.indexing = 0;
        if (!quiet)
          this.app.message("warn", "indexing cancelled: search and backlinks may be incomplete; :reindex tries again");
      },
      {
        restart: () => {
          void this.app.run("vault.reindex");
          this.indexInBackground();
        },
        pause: (value) => {
          paused = value;
        },
      },
    );
    finished.update(`Indexing 0/${total} files`);
    // This vault's graph as it is at each slice: switched to another, the pass goes on with that one's notes.
    parseInSlices(() => this.app.graph, {
      paused: () => paused,
      stopped: () => {
        if (this.app.quitting || cancelled) {
          finished();
          return true;
        }
        return false;
      },
      slice: (left) => {
        this.app.indexing = left;
        finished.update(`Indexing ${total - left}/${total} files`);
        if (left && total > 200) this.app.host.requestRender();
      },
      done: () => {
        finished();
        this.app.explorer.invalidateTree();
        // A link that reaches a note by its alias resolves only now that every note is parsed (17.7).
        for (const b of this.app.buffers.values()) b.invalidateLayouts();
        this.app.relayoutAll();
        if (total > 200)
          this.app.message("info", `indexed ${total} notes in ${((this.app.now() - t0) / 1000).toFixed(1)} s`);
        this.app.host.requestRender();
      },
    });
  }

  /** Once the background pass over this vault's notes is done, however long it takes (tests). */
  async whenIndexed(): Promise<void> {
    while (this.app.indexing) await new Promise((r) => setTimeout(r, 5));
  }

  autoIndex: AutoIndex | null = null;
  /** Home's own walk and index (VV-D2), while home is the vault open and the background index is off. */
  homeIndex: AutoIndex | null = null;

  /**
   * Whether the background auto-index may work now (20.9): it's on, and nobody is working (`nobodyWorking`).
   */
  autoIndexDue(now = this.app.now()): boolean {
    return this.app.config.index.background && this.nobodyWorking(now);
  }

  /**
   * Whether nobody is working (20.9): this vault's own index is done, and no key or click here, no CLI command from an
   * agent, for `idle_seconds`.
   */
  nobodyWorking(now = this.app.now()): boolean {
    if (this.app.indexing) return false;
    const quiet = this.app.config.index.idle_seconds * 1000;
    if (now - this.app.lastInputAt < quiet) return false;
    try {
      if (now - statSync(activityFile()).mtimeMs < quiet) return false;
    } catch {}
    return true;
  }

  /**
   * What works while nobody is: the background auto-index of home (20.9) — home's walk and index first (VV-D2), then
   * the vaults in it — or, that off and home the vault open, home's own walk and index alone. Null: neither.
   */
  indexJob(): AutoIndex | null {
    const onHome = (capped: WalkCap | null) => this.homeIndexed(capped);
    // Home's settings, as this TUI has them: its own in home, your config's (`--config` too) in a vault.
    const config = () =>
      this.app.loc.mode === "home" ? this.app.config : loadConfig({ configFile: this.app.configFile }).config;
    // Its walks made on the walk's thread (T12): a folder that answers slowly never holds up the keys or the screen.
    const walker = walkThread();
    const onGaveUp = (what: "walk" | "index", why: string) => this.gaveUp(what, why);
    const opts = { onHome, config, walker, onGaveUp };
    if (this.app.config.index.background)
      return (this.autoIndex ??= new AutoIndex(homeFolder(), autoIndexFile(), () => Date.now(), opts));
    if (this.app.loc.mode !== "home") return null;
    if (this.homeIndex?.root !== this.app.loc.root)
      this.homeIndex = new AutoIndex(this.app.loc.root, null, () => Date.now(), { vaults: false, ...opts });
    return this.homeIndex;
  }

  /** Home's walk or index given up on (T12): said, home's index left as it was until the next. */
  private gaveUp(what: "walk" | "index", why: string): void {
    if (this.app.quitting) return;
    this.app.message(
      "warn",
      what === "walk"
        ? `home's walk gave up: ${why}; it's tried again in ten minutes`
        : `home's index gave up: ${why}; it's made again at the next pass`,
    );
    this.app.host.requestRender();
  }

  /** Home's walk made again while nobody is working (VV-D2): never made yet, or a folder came that only a walk finds. */
  walkHomeAgain(): void {
    if (this.app.loc.mode === "home") this.indexJob()?.homeAgain();
  }

  /** The background auto-index (20.9, VV-D2): a slice of it every quarter second while nobody is working. */
  startAutoIndex(): void {
    this.app.lastInputAt = this.app.now();
    if (this.app.graph.home?.walked === null) this.walkHomeAgain();
    const t = setInterval(() => {
      if (this.app.quitting) return clearInterval(t);
      if (!this.nobodyWorking()) return;
      const job = this.indexJob();
      if (!job || job.idle) return;
      job.step(15);
    }, 250);
    (t as { unref?: () => void }).unref?.();
  }

  /**
   * Home's walk made and its index written (VV-D2): while home is the vault open, its graph built again from them —
   * what came, what went — and its cap said when it's reached: the walk's, or the one the folders asked for by name
   * bring it to, those said to be whole. The walk kept is brought up to now on the walk's thread (T12), and taken only
   * while nothing else built the graph since, nor asked for a folder it doesn't cover: else what's here is newer — or,
   * one asked for that built nothing, home's walk asked for again with it. A file that
   * came, went or changed in it meanwhile — the watcher's, or slipbox's own write — may be newer than what the thread
   * read: taken in again over the walk, as the watcher takes a change in.
   */
  homeIndexed(capped: WalkCap | null): void {
    if (this.app.loc.mode !== "home" || this.app.quitting) return;
    this.homeRefreshed = this.refreshHome(capped, ++this.homeRefresh);
  }

  private async refreshHome(capped: WalkCap | null, at: number): Promise<void> {
    const { loc, graph } = this.app;
    const asked = [...graph.askedFolders];
    const builds = graph.builds;
    const since = new Set<string>();
    const stop = graph.onChange((c) => {
      if (c.kind === "moved") since.add(c.from).add(c.to);
      else since.add(c.path);
    });
    let home: HomeWalk;
    try {
      home = await walkThread().homeWalk(loc, graph.filter.settings, asked);
    } catch (err) {
      // Given up on: said as the walk's, and home walked again ten minutes later, its graph built again at its end.
      if (at === this.homeRefresh && this.app.loc === loc) {
        this.gaveUp("walk", walkFailure(err as Error));
        this.indexJob()?.homeAgain(true);
      }
      return;
    } finally {
      stop();
    }
    const now = this.app.graph;
    if (this.app.quitting || at !== this.homeRefresh || this.app.loc !== loc || now !== graph) return;
    if (now.builds !== builds) return;
    // Folders asked for since, that built nothing (home's walk covers them: a branch's tabs, say): taken when this walk
    // covers them too, as `Graph.askFolders` has it; else home's walk asked for again with them, never left unwalked.
    const covers = (rel: string) =>
      (home.walked !== null && !home.capped && home.walk.dirs.includes(rel)) ||
      inFolders(rel, home.asked?.folders ?? []) ||
      !walksInto(now.root, now.filter, rel);
    if (!now.askedFolders.filter((f) => !asked.includes(f)).every(covers)) {
      this.homeIndexed(capped);
      return this.homeRefreshed;
    }
    if (home.unkept) keepHomeWalk(loc, home.unkept.walk, home.unkept.capped, home.unkept.walked, now.filter);
    this.homeBuilt(home, capped, [...since]);
  }

  /** Home's latest graph asked for, its walk on the walk's thread: an earlier one's answer is dropped. */
  private homeRefresh = 0;
  /** The latest of them answered, taken or dropped (tests wait for it). */
  homeRefreshed: Promise<void> = Promise.resolve();

  /** Home's graph built again from its walk, made on the walk's thread (`homeIndexed`); the files that changed in the
   *  graph while it was made (`since`) taken in again over it, as the watcher takes a change in — one reached (20.8)
   *  reached again. */
  private homeBuilt(walk: HomeWalk, capped: WalkCap | null, since: string[]): void {
    const keep = this.delivery.rememberSelections();
    const graph = this.app.graph;
    const reached = new Set(graph.reached);
    graph.build(true, "lazy", walk);
    // A file the walk leaves out, reached by a link or by being opened, that the build didn't keep: reached as it was,
    // never taken in as one of home's own.
    const changed = since.filter(
      (rel) => !(reached.has(rel) && !graph.known(rel) && existsSync(join(graph.root, rel)) && graph.reachFile(rel)),
    );
    if (changed.length)
      applyToGraph(
        graph,
        {
          changes: changed.map((rel) => ({
            rel,
            kind: existsSync(join(graph.root, rel)) ? "changed" : "deleted",
            isNote: graph.filter.isNoteName(basename(rel)),
          })),
          rescan: false,
        },
        this.app.config.walk.max_file_size,
      );
    keep();
    this.delivery.rebuilt();
    const home = this.app.graph.home;
    const cap = home?.capped ?? capped;
    if (cap) this.app.message("warn", describeCap(cap, home?.asked));
    this.app.host.requestRender();
  }
}
