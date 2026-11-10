// The vault open built again (SD-T8; SD-D3, SD-D5, SD-D11): its walk and its index read on a disk thread
// (`DiskThreads.walk`) — the vault walked whole, Elsewhere's top listed, or home's walk kept brought up to now with the
// folders asked for — and the graph built here from them once it answers (`Graph.build`'s `given`). Meanwhile the graph
// stays as it was, `reading the vault…` among the background tasks. A key's build — a rename's, a folder operation's —
// holds the keys after it as an open does, said in the status line too, and `esc` doesn't give it up: the write is
// made, and the next key must find the graph that follows it. So is the first build of a graph never built (a vault
// gone into): the keys would act on an empty graph. An answer is taken only while the vault and its graph are the
// ones it was asked under; built since by something else, it's read once more, then taken; what the graph took in
// meanwhile (the watcher's changes, slipbox's own writes, a file reached) is taken in again over it. Asked again
// while one is out, it's asked again once, when that answers. Given up on (SD-D6): said, the graph as it was, and
// read again a minute later with all it was asked. A test's App builds here, at once, unless it asks (`offThread`).

import * as disk from "../../../core/foundation/platform/disk.ts";
import { basename, join } from "node:path";
import { Graph } from "../../../core/workspace/graph/graph.ts";
import { indexFile } from "../../../core/workspace/graph/refresh.ts";
import { keepHomeWalk } from "../../../core/workspace/vaults/home.ts";
import { isListed, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import { applyToGraph } from "../../../core/workspace/vaults/vault-feed.ts";
import type { WalkAnswer, WalkAsk } from "../../../core/workspace/walk/disk-jobs.ts";
import { diskThreads, walkFailure } from "../../../core/workspace/walk/walk-thread.ts";
import type { App } from "./app.ts";
import type { Outcome, WorkFinish } from "./background.ts";

/** A build given up on is asked again this long after (SD-D6), as a look is. */
export const BUILD_AGAIN_MS = 60_000;

/** What a build is asked for. */
export interface BuildAsk {
  /** A graph made anew for the vault open, in the old one's place once it's built: a setting of the walk changed, the
   *  vault's own config renamed. What follows it is the asker's (`andThen`). */
  fresh?: boolean;
  /** A key's (SD-D11): the keys after it wait for it. */
  key?: boolean;
  /** With the index kept (`Graph.build`'s `useCache`); unless said, it is. */
  useCache?: boolean;
  /** What follows it, once it's built. */
  andThen?: () => void;
}

/** An ask, settled once the build that answers it is taken, dropped or given up; `only`: no build of its own, what
 *  follows the one out (`after`). */
interface Asked {
  ask: BuildAsk;
  settle: () => void;
  only?: boolean;
}

/** A build out on a disk thread. */
interface Out {
  /** The vault open and its graph as it was asked, and how many times that was built: an answer for another, or one
   *  older than a build since, isn't taken. */
  loc: VaultLocation;
  base: Graph;
  builds: number;
  /** What it builds: `base`, or a graph made anew (`fresh`). */
  target: Graph;
  useCache: boolean;
  asked: Asked[];
  /** Asked while it was out: asked again, once, when it answers. */
  again: Asked[];
  /** The files that changed in `base` while it was out, by their paths. */
  since: Set<string>;
  stopFeed: () => void;
  finish: WorkFinish;
  /** Done with (`retire`): what it was asked, settled or handed on, is no longer its own. */
  retired: boolean;
  /** Read once more already, the graph built since by something else: taken now, never read again. */
  readAgain: boolean;
}

/** The files `since` that changed in `graph` while its walk was read elsewhere, taken in again over what that read —
 *  as the watcher takes a change in — and one reached (20.8) reached again; whether each is there asked of the disk
 *  once. A file the walk leaves out, reached by a link or by being opened, that the build didn't keep, is reached as
 *  it was, never taken in as one of the vault's own (`reached`: the graph's before it was built). */
export function takeAgain(graph: Graph, since: string[], reached: ReadonlySet<string>, maxFileSize: number): void {
  const there = new Map(since.map((rel) => [rel, disk.exists(join(graph.root, rel))]));
  const changed = since.filter(
    (rel) => !(reached.has(rel) && !graph.known(rel) && there.get(rel) && graph.reachFile(rel)),
  );
  if (!changed.length) return;
  const changes = changed.map((rel) => ({
    rel,
    kind: there.get(rel) ? ("changed" as const) : ("deleted" as const),
    isNote: graph.filter.isNoteName(basename(rel)),
  }));
  applyToGraph(graph, { changes, rescan: false }, maxFileSize);
}

/** The vault open's builds (`app.watch.builds`). */
export class Builds {
  constructor(
    private readonly app: App,
    private readonly delivery: { rememberSelections(): () => void; rebuilt(): void },
  ) {}

  /** Built off the screen's thread as the explorer's listings are read there (the TUI's: `AppOptions.listOffThread`);
   *  else here, at once, as before — a test's App, unless it says otherwise. */
  get offThread(): boolean {
    return this.off ?? this.app.explorer.listings.offThread;
  }
  set offThread(off: boolean) {
    this.off = off;
  }
  private off: boolean | null = null;

  /** How long after a build given up on it's asked again (SD-D6); a test's, sooner. */
  againMs = BUILD_AGAIN_MS;
  private out: Out | null = null;
  /** Inside `forKey`: the builds asked are a key's. */
  private keyDepth = 0;
  /** The latest build asked of a disk thread, once it's taken, dropped or given up. */
  built: Promise<void> = Promise.resolve();

  /** Once no build is out: those asked again meanwhile answered too (tests wait for it). */
  async idle(): Promise<void> {
    while (this.out) await this.built;
  }

  /** A key's build out: the keys wait for it, and the status line says `reading the vault…`. */
  get holding(): boolean {
    const out = this.out;
    return !!out && [...out.asked, ...out.again].some((a) => a.ask.key);
  }

  /** `graph`, the vault open's, built through these when it's asked to build itself without its walk (`rebuilder`):
   *  the watcher's rescan, the folders of home asked for, a file operation's build. */
  adopt(graph: Graph): void {
    graph.rebuilder = (useCache) => {
      if (!this.offThread || graph !== this.app.graph) return false;
      this.ask({ useCache });
      return true;
    };
  }

  /** `run`, the builds it asks a key's (SD-D11: a rename, a folder operation). */
  forKey<T>(run: () => T): T {
    this.keyDepth++;
    try {
      return run();
    } finally {
      this.keyDepth--;
    }
  }

  /** The vault open built again: asked of a disk thread, or here at once (a test's App). */
  ask(ask: BuildAsk = {}): void {
    if (!this.offThread) return this.here(ask);
    this.askAll([this.asked(ask)]);
  }

  /** `asked`, asked together: of the build out for the vault open and its graph, or of one started for them. */
  private askAll(asked: Asked[]): void {
    const out = this.out;
    if (out && out.loc === this.app.loc && out.base === this.app.graph) {
      // A graph made anew answers what the one out was asked too; any other ask waits for it, then asks once more —
      // but what only follows a build (`after`), which the one out answers.
      if (!asked.some((a) => a.ask.fresh)) {
        for (const a of asked) (a.only ? out.asked : out.again).push(a);
        return;
      }
      this.retire(out, "stopped", [...out.asked, ...out.again]);
      return this.start([...out.asked, ...out.again, ...asked]);
    }
    if (out) this.retire(out, "stopped");
    this.start(asked);
  }

  /** `run` once the build out for the vault open is taken — a vault gone into: its note, what its walk said — or at once
   *  when none is (null); given up, once it's read again. `hold`: the keys wait for it too. A promise settled once it's
   *  run or dropped, or the build given up. */
  after(run: () => void, hold = false): Promise<void> | null {
    const out = this.out;
    if (!out || out.loc !== this.app.loc || out.base !== this.app.graph) {
      run();
      return null;
    }
    const asked: Asked = { ...this.asked({ andThen: run, key: hold }), only: true };
    const settled = new Promise<void>((resolve) => {
      const settle = asked.settle;
      asked.settle = () => {
        settle();
        resolve();
      };
    });
    out.asked.push(asked);
    return settled;
  }

  /** An ask, the keys waiting for it when it's a key's (asked as one, or inside `forKey`) — and whatever asks it while
   *  the graph open has never been built (a vault gone into): a key would act on an empty graph, a rename rewriting
   *  none of the links to what it moves. Like a key's, it can't be stopped from the background tasks either: the vault
   *  would stay empty. */
  private asked(given: BuildAsk): Asked {
    const ask = this.keyDepth > 0 || this.app.graph.builds === 0 ? { ...given, key: true } : given;
    const asked: Asked = { ask, settle: () => {} };
    const settled = new Promise<void>((resolve) => {
      asked.settle = resolve;
    });
    if (ask.key) void this.app.reads.hold(settled);
    return asked;
  }

  /** Built here, at once, as before SD-T8: a test's App. */
  private here(ask: BuildAsk): void {
    const app = this.app;
    const useCache = ask.useCache ?? true;
    if (ask.fresh) {
      app.graph = new Graph(app.loc, app.config, app.graph.askedFolders).build(useCache, "lazy");
      app.graph.reach = app.reach;
    } else {
      app.graph.build(useCache, "lazy");
      this.delivery.rebuilt();
    }
    ask.andThen?.();
  }

  /** `asked`'s walk and index asked of a disk thread, with a walk's deadline (SD-D6): one thread, while the other is
   *  free (SD-D2). `readAgain`: read once more already, the graph built since by something else. */
  private start(asked: Asked[], readAgain = false): void {
    const app = this.app;
    const { loc, graph: base } = app;
    const target = asked.some((a) => a.ask.fresh) ? new Graph(loc, app.config, base.askedFolders) : base;
    const useCache = asked.every((a) => a.ask.useCache !== false);
    const since = new Set<string>();
    const stopFeed = base.onChange((c) => {
      if (c.kind === "moved") since.add(c.from).add(c.to);
      else since.add(c.path);
    });
    const key = () => [...out.asked, ...out.again].some((a) => a.ask.key);
    const out: Out = {
      loc,
      base,
      builds: base.builds,
      target,
      useCache,
      asked,
      again: [],
      since,
      stopFeed,
      retired: false,
      readAgain,
      // Stopped from the background tasks: the graph stays as it was. A key's isn't stopped (SD-D11).
      finish: app.background.begin("reading the vault…", () => this.retire(out, "stopped"), {
        canStop: () => !key(),
      }),
    };
    this.out = out;
    const ask: WalkAsk = {
      how: loc.mode === "home" ? "home" : isListed(loc) ? "listed" : "vault",
      filter: target.filter.settings,
      ...(loc.mode === "home" ? { home: { key: loc.key, asked: [...target.askedFolders] } } : {}),
      ...(useCache && !isListed(loc) ? { index: indexFile(loc) } : {}),
    };
    this.built = diskThreads()
      .walk(ask)
      .then(
        (answer) => this.answered(out, answer),
        (err: Error) => this.failed(out, err),
      )
      .catch((err: Error) => this.broke(out, err));
    app.host.requestRender();
  }

  /** Whether `out` is the build out, for the vault open and its graph as they are: else what it read is for none. */
  private current(out: Out): boolean {
    const app = this.app;
    return this.out === out && !app.quitting && app.loc === out.loc && app.graph === out.base;
  }

  /** `out`'s walk and index answered: the graph built from them, what changed meanwhile taken in again over it, what
   *  follows a build followed; then what was asked meanwhile, once. */
  private answered(out: Out, answer: WalkAnswer): void {
    if (!this.current(out)) return this.retire(out, "stopped");
    // Built since by something else (home's refresh, from the background index, T12): what this read may be older, so
    // it's read once more (SD-D5) — then taken whatever's built meanwhile, what changed taken in again over it, so a
    // busy vault never keeps it, and the keys a key's build holds, waiting. A graph made anew is none the older for it.
    if (out.base.builds !== out.builds && out.target === out.base && !out.readAgain) {
      const asked = [...out.asked, ...out.again];
      this.retire(out, "stopped", asked);
      return this.start(asked, true);
    }
    // Taken: no longer the one out, nothing more taken in meanwhile.
    this.out = null;
    out.stopFeed();
    const error = this.take(out, answer);
    if (error !== null) this.app.message("error", `reading the vault failed: ${error}; :reindex tries again`);
    // Every ask settled, whatever happened — but those asked meanwhile, asked once more.
    this.retire(out, error === null ? "done" : "failed", error === null ? out.again : undefined, error ?? undefined);
    if (error === null && out.again.length) this.start(out.again);
    this.app.host.requestRender();
  }

  /** `out`'s answer taken: the graph built from it, what changed meanwhile taken in again over it, what follows each
   *  ask followed — a build's own (`Watch.rebuilt`) too when a graph made anew answers asks of the graph as it was. The
   *  error a step of it threw, or null; one of what follows an ask said, the rest followed all the same. */
  private take(out: Out, answer: WalkAnswer): string | null {
    const app = this.app;
    try {
      const keep = this.delivery.rememberSelections();
      const reached = new Set(out.base.reached);
      const unkept = answer.home?.unkept;
      if (unkept) keepHomeWalk(out.loc, unkept.walk, unkept.capped, unkept.walked, out.target.filter);
      out.target.build(out.useCache, "lazy", answer);
      takeAgain(out.target, [...out.since], reached, app.config.walk.max_file_size);
      if (out.target !== out.base) {
        app.graph = out.target;
        app.graph.reach = app.reach;
      }
      keep();
      if (out.target === out.base) this.delivery.rebuilt();
    } catch (err) {
      return (err as Error).message;
    }
    for (const a of out.asked) this.follow(() => a.ask.andThen?.());
    // A reindex, a rescan, the folders asked for, answered by a graph made anew (whose asker follows it first).
    if (out.target !== out.base && out.asked.some((a) => !a.only && !a.ask.fresh))
      this.follow(() => this.delivery.rebuilt());
    return null;
  }

  /** `run`, what follows a build: an error it throws said, as a key's is. */
  private follow(run: () => void): void {
    try {
      run();
    } catch (err) {
      this.app.message("error", (err as Error).message);
    }
  }

  /** `out` given up on (SD-D6): said, the graph as it was, and asked again a minute later with all it was asked — no
   *  longer a key's but for a graph never built — while the vault and its graph are the same: one build, joining the
   *  one out then, if any. */
  private failed(out: Out, err: Error): void {
    const app = this.app;
    const why = walkFailure(err);
    if (!this.current(out) || why === "stopped") return this.retire(out, "stopped");
    this.retire(out, "failed", undefined, why);
    app.message("warn", `reading the vault gave up: ${why}; it's read again in a minute`);
    app.host.requestRender();
    const again = [...out.asked, ...out.again];
    const timer = setTimeout(() => {
      if (app.quitting || app.loc !== out.loc || app.graph !== out.base) return;
      this.askAll(again.map((a) => ({ ...this.asked({ ...a.ask, key: false }), ...(a.only ? { only: true } : {}) })));
    }, this.againMs);
    (timer as { unref?: () => void }).unref?.();
  }

  /** What `out`'s answer threw past `answered` and `failed`: said, and every ask settled, so no key waits on it. */
  private broke(out: Out, err: Error): void {
    if (this.out === out) this.out = null;
    for (const a of [...out.asked, ...out.again]) a.settle();
    this.retire(out, "failed", undefined, err.message);
    this.app.message("error", `reading the vault failed: ${err.message}; :reindex tries again`);
  }

  /** `out` done with: no longer the one out, its feed and its background task ended, its asks settled — all but `keep`,
   *  which another build answers. */
  private retire(out: Out, outcome: Outcome, keep?: Asked[], error?: string): void {
    if (this.out === out) this.out = null;
    if (out.retired) return;
    out.retired = true;
    out.stopFeed();
    out.finish(outcome, error);
    if (keep === undefined) for (const a of [...out.asked, ...out.again]) a.settle();
    else for (const a of [...out.asked, ...out.again]) if (!keep.includes(a)) a.settle();
  }
}
