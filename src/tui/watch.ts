// Keeping up with the disk (5.1–5.4): the graph indexed in the background, the watcher's batches applied, what it
// can't see polled, the background auto-index (20.9), and a note changed on disk reloaded.

import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readText } from "../core/fsutil.ts";
import { offsetOf } from "./editing.ts";
import { planRelink } from "../core/rename.ts";
import { activityFile, AutoIndex, autoIndexFile } from "../core/autoindex.ts";
import { loadConfig } from "../core/config.ts";
import { describeCap, type HomeWalk, keepHomeWalk } from "../core/home.ts";
import { HOME_LIMITS, type WalkCap } from "../core/walk.ts";
import { homeFolder, isListed } from "../core/vault.ts";
import { applyToGraph } from "../core/vault-feed.ts";
import { VaultWatcher, type WatchBatch, type WatchChange, watchTakes } from "../core/watch.ts";
import { walkFailure, walkThread } from "../core/walk-thread.ts";
import { newParseCache } from "../core/parse.ts";
import { parseInBackground } from "../core/parse-pool.ts";
import { BACKGROUND_PARSE, type NoteBuffer } from "./buffer.ts";
import type { App } from "./app.ts";
import type { Graph } from "../core/graph.ts";

/**
 * A graph's notes not parsed yet, parsed between frames, a slice at a time (5.1): a big note on other threads first
 * (15.1), the main thread only putting its chunks together — parsed here whole, one would hold every key for seconds;
 * where threads can't start, it's parsed here after all. `graph` is asked again at each slice; `slice` hears how many
 * are left after each, `done` that none is.
 */
export function parseInSlices(
  graph: () => Graph,
  opts: { stopped: () => boolean; slice?: (left: number) => void; done: () => void },
): void {
  const elsewhere = new Set<string>();
  const failed = new Set<string>();
  const tick = () => {
    if (opts.stopped()) return;
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

/** The watcher, polling, indexing in the background, and reloads. */
export class Watch {
  constructor(readonly app: App) {}

  /** A batch from the watcher: applied now — or, while git writes, held with the rest it writes. */
  receiveBatch(b: WatchBatch): void {
    this.app.feed.receive(b);
  }

  private stopEmbedFeed: (() => void) | null = null;
  private stopAdoptFeed: (() => void) | null = null;
  private stopRetargetFeed: (() => void) | null = null;

  /** A new graph (the vault opened, switched, walked again): the search index and embeds follow it, and the buffers open
   *  before it knew their files are its notes as it comes to know them — at each build and each change. */
  followGraph(): void {
    this.stopAdoptFeed?.();
    const g = this.app.graph;
    const stopBuild = g.onBuild(() => this.app.claimKnown());
    // A change to one file: its buffer alone, if one is open.
    const stopChange = g.onChange((c) => {
      const b = this.app.buffers.get(c.kind === "moved" ? c.to : c.path);
      if (b) this.app.claim(b);
    });
    this.stopAdoptFeed = () => {
      stopBuild();
      stopChange();
    };
    this.app.claimKnown();
    this.app.search.start();
    // A note coming or going sent links by name elsewhere: said, never silent.
    this.stopRetargetFeed?.();
    this.stopRetargetFeed = this.app.graph.onRetarget((rs) => {
      const first = rs[0]!;
      this.app.message(
        "warn",
        `${rs.length === 1 ? `[[${first.target}]] in ${first.from}` : `${rs.length} links by name`} reach${rs.length === 1 ? "es" : ""} ${first.now} now, not ${first.was}`,
      );
    });
    // A note drawn inside another (1.11) changed: whatever shows it lays out again.
    this.stopEmbedFeed?.();
    this.stopEmbedFeed = g.onChange((c) => {
      const paths = c.kind === "moved" ? [c.from, c.to] : [c.path];
      const abs = new Set(paths.map((p) => g.abs(p)));
      let again = false;
      for (const b of this.app.buffers.values()) {
        if (![...b.embedded].some((p) => abs.has(p))) continue;
        b.invalidateLayouts();
        again = true;
      }
      if (again) {
        for (const v of this.app.allViews()) v.layoutKey = "";
        this.app.host.requestRender();
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Background indexing, watching (5.1–5.4), polling outside files and the config.

  indexInBackground(): void {
    if (this.app.indexing) return; // a pass is already running; it picks up the new stubs
    const total = this.app.graph.pendingCount;
    if (!total) return;
    this.app.indexing = total;
    const t0 = this.app.now();
    // This vault's graph as it is at each slice: switched to another, the pass goes on with that one's notes.
    parseInSlices(() => this.app.graph, {
      stopped: () => this.app.quitting,
      slice: (left) => {
        this.app.indexing = left;
        if (left && total > 200) this.app.host.requestRender();
      },
      done: () => {
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

  knownFromGraph(): Map<string, number> {
    return new Map([...this.app.graph.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
  }

  sizesFromGraph(): Map<string, number> {
    return new Map([...this.app.graph.notes.values()].map((n) => [n.rel, n.size] as [string, number]));
  }

  startWatcher(): void {
    this.app.watcher = new VaultWatcher({
      root: this.app.loc.root,
      filter: this.app.graph.filter,
      dirs: isListed(this.app.loc) ? [""] : this.app.graph.dirs,
      debounceMs: this.app.config.watch.debounce_ms,
      pollMs: this.app.config.watch.poll_ms,
      known: this.knownFromGraph(),
      sizes: this.sizesFromGraph(),
      attachments: this.app.graph.filePaths(),
      walkedAt: () => this.app.graph.walkedAt,
      listed: isListed(this.app.loc),
      // Home's cap held by what comes while it's open too (VV-D2); before its first walk, what its graph hasn't looked
      // into is the walk's, made while nobody works, and a note moved there followed.
      ...(this.app.loc.mode === "home"
        ? {
            maxDirs: HOME_LIMITS.folders,
            leftToWalk: (rel: string) => this.app.graph.waitsForHomeWalk(rel),
            walkPending: () => this.app.graph.home?.walked === null,
          }
        : {}),
      onBatch: (b) => this.receiveBatch(b),
      onDegraded: (reason) => {
        this.app.message("error", `watching degraded: ${reason}`);
        this.app.host.requestRender();
      },
      onWarn: (text) => {
        this.app.message("warn", text);
        this.app.host.requestRender();
      },
      pollTargets: () => [...this.app.buffers.values()].filter((b) => b.rel).map((b) => b.rel!),
    });
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
   * while nothing else built the graph since, nor asked for another folder: else what's here is newer. A file that
   * came, went or changed in it meanwhile — the watcher's, or slipbox's own write — may be newer than what the thread
   * read: taken in again over the walk, as the watcher takes a change in.
   */
  private homeIndexed(capped: WalkCap | null): void {
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
    if (now.builds !== builds || now.askedFolders.join("\0") !== asked.join("\0")) return;
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
    const keep = this.rememberSelections();
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
    this.rebuilt();
    const home = this.app.graph.home;
    const cap = home?.capped ?? capped;
    if (cap) this.app.message("warn", describeCap(cap, home?.asked));
    this.app.host.requestRender();
  }

  /**
   * The graph built again while it's open (VV-D2: home's walk made, folders of home asked for): the watcher, the
   * background parse, search and the layouts follow it.
   */
  rebuilt(): void {
    this.app.watcher?.sync(this.app.graph.dirs, this.knownFromGraph(), this.sizesFromGraph());
    // The watcher knows the files as built: an open note changed before it said so is read again now, or never would
    // be — never through a link not followed (VV-D6).
    for (const buf of this.app.buffers.values())
      if (buf.changedOnDisk() && (buf.elsewhere || !this.app.following.blocked(buf.abs))) this.reloadBuffer(buf);
    // Not in an app that isn't live (a test's), which starts no background parse.
    if (this.app.live) this.indexInBackground();
    // The notes the walk found, searched too: the search index caught up with them.
    this.app.search.start();
    this.app.explorer.invalidateTree();
    for (const b of this.app.buffers.values()) b.invalidateLayouts();
    this.app.relayoutAll();
  }

  /** Poll what the vault watcher cannot see: files open from outside the vault (the scratch), or from
   *  what home's index leaves out, and the config files, which reload automatically when saved. */
  startPolling(): void {
    const t = setInterval(
      () => {
        if (this.app.quitting) return clearInterval(t);
        let changed = this.poll();
        if (this.app.settings.changedOnDisk()) {
          this.app.settings.reload("file changed");
          changed = true;
        }
        // HEAD moved without a file changing with it (5.9): a switch between branches alike.
        if (this.app.git.checkHead()) changed = true;
        if (changed) this.app.host.requestRender();
      },
      Math.min(this.app.config.watch.poll_ms, 1000),
    );
    (t as { unref?: () => void }).unref?.();
  }

  /**
   * The open files no watcher sees, looked at (each second, `startPolling`): outside the vault (the scratch), or a file
   * of it the walk leaves out — in home, one in Downloads or a hidden folder (VV-D2) — or one the graph knows that the
   * watcher doesn't take (`VaultWatcher.sees`: reached, 20.8, in a folder it doesn't watch, or hidden or ignored in one
   * it does). Never one read through a link not followed (VV-D6). Changed on disk: one the graph knows told to it as
   * the watcher would, through the feed (held while git writes, 5.10), once for each change, and the watcher told it's
   * heard, so its sweep says it no second time; any other read again. Unchanged, one the graph knows now is claimed
   * (`App.claim`): a conflict settled with the disk's text leaves it so. True when one was read or told.
   */
  poll(): boolean {
    let changed = false;
    const told: WatchChange[] = [];
    let dirs: Set<string> | null = null;
    // Without a watcher (watching off, or a test's app), what one would see: the graph's folders, its filter's names.
    const sees = (rel: string) =>
      this.app.watcher
        ? this.app.watcher.sees(rel)
        : watchTakes(this.app.graph.filter, rel, (dirs ??= new Set(this.app.graph.dirs)));
    for (const buf of this.app.buffers.values()) {
      const rel = buf.rel;
      if (rel !== null && sees(rel)) continue;
      if (!buf.elsewhere && this.app.following.blocked(buf.abs)) continue;
      if (buf.changedOnDisk()) {
        if (rel !== null && this.app.graph.known(rel)) {
          // Told once: one with unsaved changes isn't read again until its conflict is settled, so it stays changed.
          const st = statSync(buf.abs, { throwIfNoEntry: false }) ?? null;
          const at = st ? `${st.mtimeMs}:${st.size}` : "gone";
          if (this.toldAt.get(buf) !== at) {
            this.toldAt.set(buf, at);
            this.app.watcher?.heard(rel, st);
            told.push({ rel, kind: st ? "changed" : "deleted", isNote: this.app.graph.notes.has(rel) });
            changed = true;
          }
        } else {
          this.reloadBuffer(buf);
          changed = true;
        }
      } else if (rel === null) this.app.claim(buf);
    }
    if (told.length) this.app.feed.receive({ changes: told, rescan: false });
    return changed;
  }

  /** Each polled file's stamp as last told to the graph (`poll`). */
  private readonly toldAt = new WeakMap<NoteBuffer, string>();

  applyChanges(given: WatchBatch): void {
    // A change to a note open only through a link not followed now (VV-D6: heard before it was forgotten): never read.
    const batch: WatchBatch = {
      ...given,
      changes: given.changes.filter((c) => !this.app.buffers.get(c.rel)?.throughLink),
    };
    // The panes' selections are row indexes: an agent's new or deleted note, or a heading added
    // above, would move them to another item. Kept by what they select, not where.
    const keep = this.rememberSelections();
    // Files moved elsewhere (an editor, a file manager, git), seen by their content as they went and came.
    const moves: [string, string][] = [];
    const stop = this.app.graph.onChange((c) => {
      if (c.kind === "moved") moves.push([c.from, c.to]);
    });
    try {
      this.applyChangesNow(batch);
    } finally {
      stop();
      keep();
    }
    if (moves.length) this.offerRelink(moves);
  }

  /**
   * A batch of moves made elsewhere broke links (21.11): the relink offered once for it — its preview,
   * nothing written unasked. Typing, or something else open: said instead, with where to find it.
   */
  private offerRelink(moves: [string, string][]): void {
    const plan = planRelink(this.app.graph, undefined, { pointers: false });
    if (!plan.files.length) return;
    const what = moves.length === 1 ? `${moves[0]![0]} moved to ${moves[0]![1]}` : `${moves.length} files moved`;
    const links = plan.files.reduce((n, f) => n + f.edits.length, 0);
    if (this.app.overlay || this.app.view?.insert)
      return this.app.message(
        "warn",
        `${what}: ${links} line${links === 1 ? "" : "s"} of links broke — space v p shows them, space l r relinks a note's`,
      );
    this.app.message(
      "info",
      `${what}: ${links} line${links === 1 ? "" : "s"} of links broke — the relink, to look over`,
    );
    this.app.renaming.preview(() => plan);
  }

  /** What the explorer and the outline have selected; the function puts them back on it. */
  private rememberSelections(): () => void {
    const explorer =
      this.app.leftView === "explorer" ? this.app.explorer.rows()[this.app.sidebar.selected]?.path : undefined;
    const rows = this.app.panels.outlineShown && this.app.rightView === "outline" ? this.app.outlineView.rows() : [];
    const heading = rows[this.app.outline.selected];
    const nth = heading ? rows.slice(0, this.app.outline.selected).filter((r) => r.text === heading.text).length : 0;
    return () => {
      if (explorer !== undefined) {
        const i = this.app.explorer.rows().findIndex((r) => r.path === explorer);
        if (i >= 0) this.app.sidebar.selected = i;
      }
      if (heading) {
        const now = this.app.outlineView.rows();
        const same = now.map((r, i) => ({ r, i })).filter((x) => x.r.text === heading.text);
        const hit = same[Math.min(nth, same.length - 1)];
        if (hit) this.app.outline.selected = hit.i;
      }
    };
  }

  private applyChangesNow(batch: WatchBatch): void {
    const {
      structural: setChanged,
      warnings,
      listed,
    } = applyToGraph(this.app.graph, batch, this.app.config.walk.max_file_size);
    for (const w of warnings) this.app.message("warn", w);
    if (batch.rescan) {
      this.indexInBackground();
      this.app.watcher?.sync(
        isListed(this.app.loc) ? [""] : this.app.graph.dirs,
        this.knownFromGraph(),
        this.sizesFromGraph(),
      );
      // Home's graph is built from its walk kept (VV-D2): a folder that came is walked with the rest, while nobody works.
      this.walkHomeAgain();
      // The walk itself changed: any open note may have changed, appeared or gone — never read again through a link
      // not followed now (VV-D6: one forgotten).
      for (const buf of this.app.buffers.values())
        if (buf.changedOnDisk() && (buf.elsewhere || !this.app.following.blocked(buf.abs))) this.reloadBuffer(buf);
    }
    if (batch.toWalk?.length) {
      // Folders come into home's top before its walk (VV-D2), listed: watched, never looked into — the walk, asked for
      // again, takes what's in them. Only the explorer shows a folder. None listed (walked since, while git wrote; or
      // gone, a vault): nothing to ask. With a rescan, that has done both.
      this.app.watcher?.watchNamed(batch.toWalk, (d) => listed.includes(d));
      if (listed.length && !batch.rescan) {
        this.app.explorer.invalidateTree();
        this.walkHomeAgain();
      }
    }
    for (const c of batch.changes) {
      // An open note reloads — a data or text file too, like a note (16.4) — and a big one still
      // does when it's out of the index. One gone again before it was looked at comes as deleted.
      const buf = this.app.buffers.get(c.rel);
      if (!buf || (c.isNote && c.kind !== "deleted" && !existsSync(buf.abs))) continue;
      this.reloadBuffer(buf, c.kind === "deleted");
    }
    if (setChanged) {
      // New or removed notes change link statuses everywhere and the explorer.
      this.app.explorer.invalidateTree();
      for (const b of this.app.buffers.values()) b.invalidateLayouts();
      this.app.relayoutAll();
    } else if (batch.changes.length) {
      // Only changed notes: their own buffers reloaded above; others re-lay out only when they
      // link to one (its headings, and so a [[note#heading]]'s status, may have changed).
      const changed = new Set(batch.changes.map((c) => c.rel));
      for (const b of this.app.buffers.values()) {
        if (!b.rel || changed.has(b.rel)) continue;
        if (this.app.graph.linksOf(b.rel).some((l) => l.path !== null && l.path !== undefined && changed.has(l.path)))
          b.invalidateLayouts();
      }
    }
  }

  reloadBuffer(buf: NoteBuffer, deleted = false): void {
    // Back after being deleted (recreated): not deleted any more, whatever happens next.
    if (!deleted && buf.deleted && existsSync(buf.abs)) buf.deleted = false;
    if (buf.dirty && !deleted) {
      // Unsaved changes here and a new version there: the conflict prompt decides (5.5).
      if (!buf.conflictKept) this.app.saving.conflictPrompt(buf);
      return;
    }
    if (deleted || !buf.load()) {
      buf.deleted = true;
      buf.changedAt = this.app.now();
      this.app.message("warn", `${buf.key} was deleted on disk — still showing the last version`);
      return;
    }
    buf.changedAt = this.app.now();
    for (const v of this.app.allViews()) {
      if (v.buf !== buf) continue;
      // Keep the anchors (3.5): the heading above the viewport and the cursor's source line.
      v.layoutKey = "";
      v.sel = null;
      v.visual = null;
    }
    // A selection the replace row keeps to was offsets into the old text: they mean nothing now.
    const o = this.app.overlay;
    if (o?.kind === "prompt" && o.replace?.range && o.view?.buf === buf) {
      // Closed rather than widened: replace-all must never reach text you didn't select.
      o.replace = undefined;
      o.change?.(o.text);
      this.app.message(
        "warn",
        `${this.app.displayName(buf)} changed on disk — the replace row closed (its selection is gone); select again`,
      );
    }
    // The reload was an undo step of its own: typing going on in it continues as one step again.
    const typing = this.app.allViews().find((v) => v.buf === buf && v.insert);
    if (typing) buf.beginStep(offsetOf(this.app, typing));
    this.app.message("info", `↻ ${this.app.displayName(buf)} changed on disk — reloaded`);
    setTimeout(() => this.app.host.requestRender(), 3100).unref?.();
    // Read as it is now: the vault's, the graph knowing it (`App.claim`).
    this.app.claim(buf);
  }
}
