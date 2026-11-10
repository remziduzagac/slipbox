// Keeping up with the disk (5.1–5.4): the graph indexed in the background, the watcher's batches applied, what it
// can't see polled, the background auto-index (20.9), and a note changed on disk reloaded — the TUI's texts read on a
// disk thread first (SD-T6: `Texts`).

import { dirname, join } from "node:path";
import * as disk from "../../../core/foundation/platform/disk.ts";
import { type DecodedFile, readText, type Stamp, stamp } from "../../../core/foundation/platform/fsutil.ts";
import { offsetOf } from "../../documents/editing/editing.ts";
import { planRelink } from "../../../core/workspace/mutations/rename/rename.ts";
import type { AutoIndex } from "../../../core/workspace/graph/autoindex.ts";
import { HOME_LIMITS, type WalkCap } from "../../../core/workspace/walk/walk.ts";
import { isListed } from "../../../core/workspace/vaults/vault.ts";
import { applyToGraph, type BatchReads } from "../../../core/workspace/vaults/vault-feed.ts";
import type { NoteRead } from "../../../core/workspace/walk/io/notes.ts";
import { VaultWatcher, type WatchBatch, type WatchChange, watchTakes } from "../../../core/workspace/graph/watch.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { App } from "./app.ts";
import { Builds } from "./builds.ts";
import { GraphRefresh } from "./graph-refresh.ts";
import { Look } from "./look.ts";
import { Texts } from "./texts.ts";
export { parseInSlices } from "./graph-refresh.ts";

/** An open file as a look found it: its stamp on disk (null: gone, or unreadable). */
export interface Polled {
  buf: NoteBuffer;
  at: Stamp | null;
}

/** The watcher, polling, indexing in the background, and reloads. */
export class Watch {
  readonly refresh: GraphRefresh;
  /** The look each second at what no watcher sees (SD-T4). */
  readonly look: Look;
  /** The vault open built again, its walk and index read on a disk thread (SD-T8). */
  readonly builds: Builds;
  /** A changed note's text, and the background parse's, read on a disk thread (SD-T6). */
  readonly texts: Texts;

  constructor(readonly app: App) {
    const delivery = { rememberSelections: () => this.rememberSelections(), rebuilt: () => this.rebuilt() };
    this.refresh = new GraphRefresh(app, delivery);
    this.look = new Look(app);
    this.builds = new Builds(app, delivery);
    this.texts = new Texts(app);
  }

  /** The disk not answering (SD-D6): the watcher's look given up on, the look each second's, or a batch's texts — one
   *  warning on the status line (`⚠ disk not answering`) until each answers again. */
  get notAnswering(): boolean {
    return this.app.watcher?.notAnswering === true || this.look.notAnswering || this.app.feed.notAnswering;
  }

  /** A batch from the watcher: applied now — or, while git writes, held with the rest it writes. */
  receiveBatch(b: WatchBatch): void {
    this.app.feed.receive(b);
  }

  private stopEmbedFeed: (() => void) | null = null;
  private stopAdoptFeed: (() => void) | null = null;
  private stopRetargetFeed: (() => void) | null = null;

  /** A new graph (the vault opened, switched, walked again): the search index and embeds follow it, and the buffers
   *  open before it knew their files are its notes as it comes to know them — at each build and each change. */
  followGraph(): void {
    this.stopAdoptFeed?.();
    const g = this.app.graph;
    this.builds.adopt(g);
    // Its notes' texts read on a disk thread when the TUI's are (SD-T6): parsed as they come.
    g.texts.elsewhere = () => this.texts.offThread;
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
    this.refresh.indexInBackground();
  }

  whenIndexed(): Promise<void> {
    return this.refresh.whenIndexed();
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
      dirStamps: () => this.app.graph.dirStamps,
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
      // Its looks asked of the disk threads, as the explorer's listings are (SD-D8, `listOffThread`): a slow disk never
      // stops a key; a test's App asks at once.
      offThread: this.app.explorer.listings.offThread,
      onNotAnswering: (notAnswering) => {
        if (notAnswering)
          this.app.message("warn", "disk not answering: the watcher's look gave up; it looks again in a minute");
        this.app.host.requestRender();
      },
    });
  }
  get autoIndex(): AutoIndex | null {
    return this.refresh.autoIndex;
  }

  set autoIndex(value: AutoIndex | null) {
    this.refresh.autoIndex = value;
  }

  get homeIndex(): AutoIndex | null {
    return this.refresh.homeIndex;
  }

  set homeIndex(value: AutoIndex | null) {
    this.refresh.homeIndex = value;
  }

  autoIndexDue(now = this.app.now()): boolean {
    return this.refresh.autoIndexDue(now);
  }

  nobodyWorking(now = this.app.now()): boolean {
    return this.refresh.nobodyWorking(now);
  }

  indexJob(): AutoIndex | null {
    return this.refresh.indexJob();
  }

  walkHomeAgain(): void {
    this.refresh.walkHomeAgain();
  }

  startAutoIndex(): void {
    this.refresh.startAutoIndex();
  }

  homeIndexed(capped: WalkCap | null): void {
    this.refresh.homeIndexed(capped);
  }

  get homeRefreshed(): Promise<void> {
    return this.refresh.homeRefreshed;
  }

  set homeRefreshed(value: Promise<void>) {
    this.refresh.homeRefreshed = value;
  }

  /**
   * The graph built again while it's open (VV-D2: home's walk made, folders of home asked for): the watcher, the
   * background parse, search and the layouts follow it.
   */
  rebuilt(): void {
    this.app.watcher?.sync(this.app.graph.dirs, this.knownFromGraph(), this.sizesFromGraph());
    // The watcher knows the files as built: an open note changed before it said so is read again, or never would be —
    // told to the graph as the poll tells one, through the feed (held while git writes: what git does lands as one
    // change, D153), after what the feed is applying (a branch's tabs built for as its switch is seen).
    this.app.feed.whenApplied(() => this.poll(true));
    // Not in an app that isn't live (a test's), which starts no background parse.
    if (this.app.live) this.indexInBackground();
    // The notes the walk found, searched too: the search index caught up with them.
    this.app.search.start();
    this.app.explorer.invalidateTree();
    for (const b of this.app.buffers.values()) b.invalidateLayouts();
    this.app.relayoutAll();
  }

  /** Poll what the vault watcher cannot see: files open from outside the vault (the scratch), or from
   *  what home's index leaves out, and the config files, which reload automatically when saved. The TUI's look is made
   *  on a disk thread (`Look`); a test's App looks here, at once. */
  startPolling(): void {
    if (this.look.offThread) return this.look.start();
    const t = setInterval(
      () => {
        if (this.app.quitting) return clearInterval(t);
        let changed = this.poll();
        if (this.app.settings.changedOnDisk()) {
          this.app.settings.reload("file changed");
          changed = true;
        }
        // HEAD moved without a file changing with it (5.9): a switch between branches alike.
        if (this.app.feed.checkHead()) changed = true;
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
   * it does). Never one read through a link neither followed nor looked at (VV-D6). Changed on disk: one the graph
   * knows told to it as the watcher would, through the feed (held while git writes, 5.10), once for each change, and
   * the watcher told it's heard, so its sweep says it no second time; any other read again. Unchanged, one the graph
   * knows now is claimed (`App.claim`): a conflict settled with the disk's text leaves it so. True when one was read or
   * told. `all`: the files the watcher sees too (a build it was synced to, `rebuilt`).
   */
  poll(all = false): boolean {
    // Off the screen's thread (the TUI's): asked of a disk thread, what changed taken when it answers (`polled`).
    if (this.look.offThread) {
      void this.look.request(all);
      return false;
    }
    const seen: Polled[] = [];
    for (const buf of this.pollTargets(all))
      if (buf.elsewhere || !this.app.following.blocked(buf.abs)) seen.push({ buf, at: stamp(buf.abs) });
    return this.polled(seen);
  }

  /** The open files a look stats (`poll`): those no watcher sees, or every one (`all`). */
  pollTargets(all: boolean): NoteBuffer[] {
    let dirs: Set<string> | null = null;
    // Without a watcher (watching off, or a test's app), what one would see: the graph's folders, its filter's names.
    const sees = (rel: string) =>
      this.app.watcher
        ? this.app.watcher.sees(rel)
        : watchTakes(this.app.graph.filter, rel, (dirs ??= new Set(this.app.graph.dirs)));
    return [...this.app.buffers.values()].filter((buf) => all || buf.rel === null || !sees(buf.rel));
  }

  /** What a look found of the open files (`poll`): each one's stamp on disk now (null: gone, or unreadable), none read
   *  through a link not followed. True when one was read or told. */
  polled(seen: Polled[]): boolean {
    let changed = false;
    const told: WatchChange[] = [];
    for (const { buf, at: st } of seen) {
      const rel = buf.rel;
      if (buf.changedFrom(st)) {
        if (rel !== null && this.app.graph.known(rel)) {
          // Told once: one with unsaved changes isn't read again until its conflict is settled, so it stays changed.
          // Unreadable (a folder on the way locked, made a file, a mount gone) is gone, as the buffer has it.
          const at = st ? `${st.mtimeMs}:${st.size}` : "gone";
          if (this.toldAt.get(buf) !== at) {
            this.toldAt.set(buf, at);
            this.app.watcher?.heard(rel, st);
            if (!st) this.toldGone.add(buf);
            told.push({ rel, kind: st ? "changed" : "deleted", isNote: this.app.graph.notes.has(rel) });
            changed = true;
          }
        } else {
          // Told gone, back since (one reached, 20.8): reached again, as opening it reaches it.
          if (rel !== null && this.toldGone.delete(buf)) this.app.graph.reachFile(rel, { keep: true });
          // Its text read on a disk thread first, when the TUI's are (SD-T6).
          if (this.texts.offThread && !buf.virtual) this.texts.reload(buf);
          else this.reloadBuffer(buf);
          changed = true;
        }
      } else if (rel === null) this.app.claim(buf);
    }
    if (told.length) this.app.feed.receive({ changes: told, rescan: false });
    return changed;
  }

  /** Each polled file's stamp as last told to the graph (`poll`). */
  private readonly toldAt = new WeakMap<NoteBuffer, string>();
  /** The polled files told gone (`poll`): reached again when they're back (20.8). */
  private readonly toldGone = new WeakSet<NoteBuffer>();

  /** A batch applied (`VaultFeed`'s `apply`): with its files as a disk thread read them (`reads`, SD-T6), when it did. */
  applyChanges(given: WatchBatch, reads?: BatchReads): void {
    // A change to a note open only through a link not followed now (VV-D6: heard before it was forgotten): never read —
    // while its path is still through it (one made a note of the vault's own since is the vault's).
    const through = (rel: string) => {
      const b = this.app.buffers.get(rel);
      return !!b?.throughLink && !!(this.app.following.blocked(b.abs) || this.app.following.lookedAt(b.abs));
    };
    const batch: WatchBatch = { ...given, changes: given.changes.filter((c) => !through(c.rel)) };
    // The panes' selections are row indexes: an agent's new or deleted note, or a heading added
    // above, would move them to another item. Kept by what they select, not where.
    const keep = this.rememberSelections();
    // Files moved elsewhere (an editor, a file manager, git), seen by their content as they went and came.
    const moves: [string, string][] = [];
    const stop = this.app.graph.onChange((c) => {
      if (c.kind === "moved") moves.push([c.from, c.to]);
    });
    try {
      this.applyChangesNow(batch, reads);
    } finally {
      stop();
      keep();
    }
    // The folders it changed: the explorer's listings of them read again, once their second has passed (SD-T7).
    const R = this.app.loc.root;
    const at = (rel: string) => [dirname(join(R, rel)), join(R, rel)];
    this.app.explorer.listings.changed(
      batch.rescan ? [R] : [...new Set(batch.changes.flatMap((c) => at(c.rel)))],
      batch.rescan,
    );
    if (moves.length) this.offerRelink(moves);
  }

  /**
   * A batch of moves made elsewhere broke links (21.11): the relink offered once for it — its preview,
   * nothing written unasked. Typing, or something else open: said instead, with where to find it. While the background
   * parse reads the notes on the disk threads (SD-T6), once it has every one: the links to look for are in all of them.
   */
  private offerRelink(moves: [string, string][]): void {
    const g = this.app.graph;
    if (this.texts.offThread && g.pendingCount)
      return void this.texts.whenParsed(g, new AbortController().signal).then(
        () => this.offerRelink(moves),
        () => {},
      );
    const plan = planRelink(g, undefined, { pointers: false });
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

  private applyChangesNow(batch: WatchBatch, reads?: BatchReads): void {
    const {
      structural: setChanged,
      warnings,
      listed,
    } = applyToGraph(this.app.graph, batch, this.app.config.walk.max_file_size, undefined, reads);
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
      // not followed now (VV-D6: one forgotten). Built on a disk thread, each open file is looked at as it's taken
      // (`rebuilt`: a look of every one, SD-T6).
      if (!this.builds.offThread)
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
    // An open note reloads — a data or text file too, like a note (16.4) — and a big one still
    // does when it's out of the index. One gone again before it was looked at comes as deleted.
    // Once a batch, as its last change has it: batches held while git wrote may name it more than once.
    const last = new Map<string, WatchChange>();
    for (const c of batch.changes) {
      last.delete(c.rel);
      last.set(c.rel, c);
    }
    for (const c of last.values()) {
      const buf = this.app.buffers.get(c.rel);
      // Read on a disk thread (SD-T6): not if it's been saved, read again or opened since — what was read is older.
      if (!buf || (reads && !this.texts.unchanged(reads, buf))) continue;
      const read = reads?.get(buf.abs);
      if (c.isNote && c.kind !== "deleted" && (read === undefined ? !disk.exists(buf.abs) : read === null)) continue;
      // Its file as it was read or written: nothing came to read again, or to settle with what's unsaved here — a
      // folder the watcher only now watches (a link followed) says each of its files came.
      if (c.kind !== "deleted" && asRead(buf, read)) {
        this.app.claim(buf);
        continue;
      }
      this.reloadBuffer(buf, c.kind === "deleted", read);
    }
    if (setChanged) {
      // New or removed notes change link statuses everywhere and the explorer.
      this.app.explorer.invalidateTree();
      for (const b of this.app.buffers.values()) b.invalidateLayouts();
      this.app.relayoutAll();
    } else if (batch.changes.length) {
      // Only changed notes: their own buffers reloaded above; others re-lay out only when they
      // link to one (its headings, and so a [[note#heading]]'s status, may have changed).
      // One not parsed yet, its text read on a disk thread (SD-T6): laid out as it's parsed, not read here for this.
      const changed = new Set(batch.changes.map((c) => c.rel));
      const links = (rel: string) => this.app.graph.texts.partially(() => this.app.graph.linksOf(rel));
      for (const b of this.app.buffers.values()) {
        if (!b.rel || changed.has(b.rel)) continue;
        if (links(b.rel).some((l) => l.path !== null && l.path !== undefined && changed.has(l.path)))
          b.invalidateLayouts();
      }
    }
  }

  /** `buf` read again from its file — as `read` has it, read on a disk thread (SD-T6), else here — or told it's gone. */
  reloadBuffer(buf: NoteBuffer, deleted = false, read?: NoteRead): void {
    // Back after being deleted (recreated): not deleted any more, whatever happens next.
    if (!deleted && buf.deleted && (read === undefined ? disk.exists(buf.abs) : read !== null)) buf.deleted = false;
    if ((buf.dirty || buf.newFile) && !deleted) {
      // Unsaved changes here and a new version there: the conflict prompt decides (5.5).
      if (!buf.conflictKept) this.app.saving.conflictPrompt(buf);
      return;
    }
    if (deleted || !(read === undefined ? buf.load() : took(buf, read))) {
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

/**
 * Whether an open file on disk is as its buffer last read or wrote it — its text, its BOM, its bytes all UTF-8 or not —
 * the buffer then left as a reload leaves it: the watcher's word that it came or changed brings nothing new. The text,
 * not the stamp: writes a moment apart can share an mtime. Never one gone since, or never written.
 */
function asRead(buf: NoteBuffer, read?: NoteRead): boolean {
  if (buf.virtual || buf.deleted || buf.newFile) return false;
  // Read on a disk thread (SD-T6): its stamp from the same open. Else stamped before it's read here: a write landing
  // between the two leaves it changed on disk.
  const given = read === undefined ? undefined : textOf(read);
  if (given === null) return false;
  const at = given ? given.stamp : stamp(buf.abs);
  try {
    const d = given ?? readText(buf.abs);
    // A byte that isn't UTF-8 reads as U+FFFD, as that character itself does: the same text, not the same file.
    if (d.text !== buf.baseText || d.bom !== buf.bom || d.invalidUtf8 !== buf.invalidUtf8) return false;
  } catch {
    return false;
  }
  buf.stamp = at;
  // No conflict kept or waiting over a change the file no longer has; a clean one's merge markers gone, as a reload's.
  buf.conflictKept = false;
  buf.conflictWaiting = false;
  if (!buf.dirty) buf.markers = false;
  return true;
}

/** An open file's text and stamp as a disk thread read it (SD-T6); null: gone, or unreadable. */
function textOf(read: NoteRead): (DecodedFile & { stamp: Stamp }) | null {
  if (!read?.text || "error" in read.text) return null;
  return { ...read.text, stamp: { mtimeMs: read.mtimeMs, size: read.size } };
}

/** `buf` reloaded with what a disk thread read of its file (`load`'s answer: false, and deleted, when it's gone). */
function took(buf: NoteBuffer, read: NoteRead): boolean {
  const d = textOf(read);
  if (d) return buf.took(d);
  buf.deleted = true;
  return false;
}
