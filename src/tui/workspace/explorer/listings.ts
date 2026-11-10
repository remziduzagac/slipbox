// The explorer's listings (T12, VV-D5): every folder it shows — above the vault open, beside it, other vaults, what its
// walk leaves out unfolded, Elsewhere, and the folders of the vault open's own tree (SD-T7: each entry with its walk's
// verdict, `own`) — read on the disk threads (walk-thread.ts), kept, and read again in the background as the tree is
// built again, never on the main thread, where a folder on a disk that answers slowly would freeze the keys and the
// screen. One cache for both sides of the vault, one limit (SD-D12); a folder asked for on both (a nested vault's,
// unfolded and holding a row revealed) is kept once for each. A folder not listed yet says so once its read has taken
// a moment (`PENDING_MS`); an answer that changed nothing draws nothing, one for a folder let go of meanwhile is
// dropped, and rows that come keep the selection on the row it was on.

import { relative, sep } from "node:path";
import { listFolder, type FolderListing } from "../../../core/workspace/walk/listing.ts";
import type { JudgeBy } from "../../../core/workspace/graph/watch/judging.ts";
import { diskThreads } from "../../../core/workspace/walk/walk-thread.ts";
import { WorkerRequestError } from "../../../core/foundation/workers/worker-requests.ts";
import type { App } from "../../app/runtime/app.ts";

/** How long a folder's first listing is read before its rows say it's being listed: a fast disk never shows it. */
export const PENDING_MS = 150;
/** A listing read longer ago than this is read again when the tree is built again: what came or went, seen. */
export const REREAD_MS = 1000;
/** One that failed (it couldn't be read, or gave no answer) is read again only this long after: a share that's gone
 *  isn't asked at every rebuild, a thread held each time. */
export const RETRY_MS = 60_000;
/** Folders kept listed at most, those the tree shows aside: the one shown longest ago let go of first, on either side
 *  of the vault (SD-D12). */
const KEPT = 256;

interface Kept {
  dir: string;
  /** A folder of the vault open's own tree, listed with its walk's verdicts (SD-T7). */
  own: boolean;
  listing: FolderListing | null;
  /** The read under way, by its number; null when none is. */
  reading: number | null;
  /** When it was first asked for, and when it was last read (0: read again when next shown). */
  asked: number;
  at: number;
  /** What it was read under (`walk`: what a busy folder is; `files.hidden`; a folder of the vault's own tree, its walk's
   *  filter): under others, it's read again. */
  settings: string;
  /** The tree it was last shown in (`newTree`): never let go of while that's the tree shown. */
  tree: number;
  /** The keys waiting for it (`relist`): settled once a listing of it is taken, whichever read takes it — the one they
   *  asked, or one asked since (the settings changed, `reread`), their deadline its — failed by one with no answer. */
  waits: { taken: () => void; failed: (err: Error) => void }[];
  /** The watcher saw its entries change since its read began (`changed`): read again once its second has passed. */
  changed: boolean;
  /** The tree's build for that asked for (`due`), while it waits. */
  due: boolean;
}

/** Why a listing's thread gave no answer, as its row says it — of the folder (`walkFailure` says it of the walk). */
export function noAnswer(err: Error): string {
  const kind = err instanceof WorkerRequestError ? err.kind : null;
  if (kind === "deadline") return "no answer in time";
  if (kind === "unavailable" || kind === "crashed") return "its thread stopped";
  return err.message;
}

/** A folder's place among those kept: by its path, and on which side of the vault it's listed. */
const keyOf = (dir: string, own: boolean): string => (own ? `${dir}\0own` : dir);

export class Listings {
  private readonly kept = new Map<string, Kept>();
  private serial = 0;
  private tree = 0;

  /** `offThread`: read on the disk threads (the TUI's); else here, at once, as the tree is built (a test's App). */
  constructor(
    private readonly app: App,
    readonly offThread = false,
  ) {}

  /** The vault open's walk's filter, as a disk thread is asked it: its settings and its epoch (what it read dropped). */
  private judge(): JudgeBy {
    const f = this.app.graph.filter;
    return { filter: f.settings, epoch: f.epoch };
  }

  /** The names of the notes the vault open's walk gave, by their folder's path in it: made again once its notes move. */
  private notesBy: { graph: object; generation: number; by: Map<string, string[]> } | null = null;

  /** The notes its walk gave in `dir`, a folder of the vault open's own tree, by name: their size is never looked at
   *  (SD-T7) — a note too big is one it didn't give. */
  private walkedIn(dir: string): string[] {
    const g = this.app.graph;
    if (this.notesBy?.graph !== g || this.notesBy.generation !== g.generation) {
      const by = new Map<string, string[]>();
      for (const rel of g.notes.keys()) {
        const at = rel.lastIndexOf("/");
        const folder = at < 0 ? "" : rel.slice(0, at);
        let names = by.get(folder);
        if (!names) by.set(folder, (names = []));
        names.push(rel.slice(at + 1));
      }
      this.notesBy = { graph: g, generation: g.generation, by };
    }
    return this.notesBy.by.get(relative(this.app.loc.root, dir).split(sep).join("/")) ?? [];
  }

  /** What a listing is read under, as it is now. */
  private settings(own: boolean): string {
    const walk = this.app.config.walk;
    const hidden = this.app.ui.hidden_files;
    return JSON.stringify(own ? { walk, hidden, own: this.judge() } : { walk, hidden });
  }

  /** The explorer's tree built again: the folders it asks for now are the ones it shows. */
  newTree(): void {
    this.tree++;
  }

  /** The tree built: past the cap, the folders it didn't show let go of, those shown longest ago first. */
  endTree(): void {
    for (const [d, k] of this.kept) {
      if (this.kept.size <= KEPT) return;
      if (k.reading === null && k.tree < this.tree) this.kept.delete(d);
    }
  }

  /** The folder `dir` as last listed — null while its first listing is read — read again when it's old. `own`: a folder
   *  of the vault open's own tree, each entry with its walk's verdict (SD-T7). */
  get(dir: string, own = false): FolderListing | null {
    if (!this.offThread) {
      const { walk } = this.app.config;
      const hidden = this.app.ui.hidden_files;
      if (!own) return listFolder(dir, walk, hidden);
      return listFolder(dir, walk, hidden, this.app.graph.filter, new Set(this.walkedIn(dir)));
    }
    const settings = this.settings(own);
    const key = keyOf(dir, own);
    let k = this.kept.get(key);
    if (k) {
      this.kept.delete(key);
      this.kept.set(key, k);
    } else {
      const asked = Date.now();
      k = {
        dir,
        own,
        listing: null,
        reading: null,
        asked,
        at: 0,
        settings,
        tree: this.tree,
        waits: [],
        changed: false,
        due: false,
      };
      this.kept.set(key, k);
      // Still not listed then: its rows say it's being listed.
      const t = setTimeout(() => {
        if (this.kept.get(key)?.listing === null) this.redraw();
      }, PENDING_MS);
      (t as { unref?: () => void }).unref?.();
    }
    k.tree = this.tree;
    const again = k.listing?.error ? RETRY_MS : REREAD_MS;
    if (k.reading === null && (!k.listing || k.settings !== settings || Date.now() - k.at > again))
      this.read(key, k, settings);
    return k.listing;
  }

  /** The folder `dir` as last listed, nothing asked: null when it isn't kept, or its first listing is read. A test's App
   *  lists it here, at once, as `get` does. */
  peek(dir: string, own = false): FolderListing | null {
    if (!this.offThread) return this.get(dir, own);
    return this.kept.get(keyOf(dir, own))?.listing ?? null;
  }

  /** Whether a listing is being read (tests wait for none). */
  get reading(): boolean {
    for (const k of this.kept.values()) if (k.reading !== null) return true;
    return false;
  }

  /** Whether `dir`'s first listing (`own`: as a folder of the vault open's own tree) has been read for long enough
   *  that its rows say so. */
  pending(dir: string, own = false): boolean {
    const k = this.kept.get(keyOf(dir, own));
    return !!k && !k.listing && Date.now() - k.asked >= PENDING_MS;
  }

  /** The kept listings of `dir`, and of every folder in it with `within`, on either side of the vault. */
  private *under(dir: string, within: boolean): Generator<[string, Kept]> {
    for (const [key, k] of this.kept) if (k.dir === dir || (within && k.dir.startsWith(`${dir}/`))) yield [key, k];
  }

  /** The listings of `dir` and of every folder in it let go of (moved away): read afresh when next shown, a read under
   *  way dropped, a key waiting for one let go. */
  forget(dir: string): void {
    for (const [key, k] of [...this.under(dir, true)]) {
      this.kept.delete(key);
      this.settle(k);
    }
  }

  /** The listings of `dir` and of every folder in it read again when next shown, shown as they were meanwhile: what's in
   *  them changed (a file operation). A read under way is dropped: it may have read them before the change. */
  stale(dir: string): void {
    for (const [, k] of this.under(dir, true)) this.reread(k);
  }

  /**
   * The watcher saw the entries of `dirs` change (`Watch.applyChanges`; `within`, of every folder in them too: a
   * rescan): their kept listings read again once a second has passed since each was last read (`REREAD_MS`, the
   * throttle), the tree built again then to ask them — nothing else may build it, and a row would stay as the listing
   * from before had it: a file gone, or one come not shown. A read under way may have read before the change: once it's
   * answered.
   */
  changed(dirs: readonly string[], within = false): void {
    if (!this.offThread) return;
    for (const d of dirs)
      for (const [key, k] of this.under(d, within)) {
        k.changed = true;
        if (k.reading === null) this.due(key, k);
      }
  }

  /** `fn` after `ms`, not holding the process open (a test's App fires it by hand). */
  after = (ms: number, fn: () => void): void => {
    const t = setTimeout(fn, ms);
    (t as { unref?: () => void }).unref?.();
  };

  /** `k`, changed since it was read, read again as the tree is built a second after that read: that build asked for
   *  then. Not if a read of it has begun meanwhile (it reads the change), or it's let go of. */
  private due(key: string, k: Kept): void {
    if (k.due) return;
    k.due = true;
    this.after(Math.max(0, k.at + REREAD_MS + 1 - Date.now()), () => {
      k.due = false;
      if (this.kept.get(key) !== k || !k.changed || k.reading !== null || this.app.quitting) return;
      k.at = 0;
      this.app.explorer.invalidateTree();
      this.app.host.requestRender();
    });
  }

  /** The listing of `dir` alone read again when next shown, never the folders in it (`stale` reads them too): what an
   *  entry of it says may be old — a folder refused, its permission changed since. */
  again(dir: string): void {
    for (const [, k] of this.under(dir, false)) this.reread(k);
  }

  /**
   * Vaults' indexes written (`onIndexWritten`, by their keys), which their rows say (VV-D9): the listings showing one
   * not indexed yet read again, however lately they were read, and the tree built again to ask them — nothing in the
   * folder changed for it to be built again by. So is a first listing still being read: it may have looked before the
   * index was there, and may show one. The vault open's own isn't one: its row says what its index is from here.
   */
  indexed(keys: readonly string[]): void {
    const written = new Set(keys);
    written.delete(this.app.loc.key);
    if (!written.size || this.app.quitting) return;
    let marked = false;
    for (const k of this.kept.values()) {
      const unmarked = k.listing?.entries.some((e) => e.vault && !e.vault.indexed && written.has(e.vault.key));
      if (unmarked || (!k.listing && k.reading !== null)) {
        this.reread(k);
        marked = true;
      }
    }
    if (!marked) return;
    this.app.explorer.invalidateTree();
    this.app.host.requestRender();
  }

  /** `k` read again when next shown, shown as it was meanwhile, however lately it was read. A read of it under way is
   *  dropped, its answer taken for none: it may have read the folder before what changed. A key waiting for it
   *  (`relist`): read again at once, for that key. */
  private reread(k: Kept): void {
    k.at = 0;
    k.reading = null;
    if (k.waits.length) this.read(keyOf(k.dir, k.own), k, this.settings(k.own));
  }

  /** The keys waiting for `k` let go: a listing of it taken (or none to wait for), or `err`, its read's. */
  private settle(k: Kept, err?: Error): void {
    const waits = k.waits;
    k.waits = [];
    for (const w of waits)
      if (err) w.failed(err);
      else w.taken();
  }

  /**
   * The kept listings of `dirs` read again at once, on either side of the vault, a key's own read (SD-D4: a key's
   * deadline): what a file operation of slipbox's changed in them (`Explorer.afterOp`). Settled once a listing of each
   * read since has been taken — by the read asked here, or by one asked after it (the walk's filter moved meanwhile, an
   * index written); failed when one gave no answer, or once `stop` gives up waiting — that read goes on, taken if it
   * comes.
   */
  relist(dirs: readonly string[], stop: AbortSignal): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const [key, k] of this.kept) {
      if (!dirs.includes(k.dir)) continue;
      waits.push(new Promise((taken, failed) => k.waits.push({ taken, failed })));
      this.read(key, k, this.settings(k.own));
    }
    const givenUp = new Promise<never>((_, no) =>
      stop.addEventListener("abort", () => no(Error("given up")), { once: true }),
    );
    return Promise.race([Promise.all(waits).then(() => {}), givenUp]);
  }

  /** Whether a listing of one of `dirs` is kept. */
  keeps(dirs: readonly string[]): boolean {
    for (const k of this.kept.values()) if (dirs.includes(k.dir)) return true;
    return false;
  }

  /** `k` read on a disk thread, by the explorer — or as a key's, one waiting for it (`relist`): the keys failed then by
   *  what its thread said. */
  private read(key: string, k: Kept, settings: string): void {
    const n = ++this.serial;
    k.reading = n;
    // Reads the folder as it is now: what the watcher saw before, too.
    k.changed = false;
    const dir = k.dir;
    const empty = { dir, entries: [], notes: false, scope: null };
    const own = k.own ? { ...this.judge(), walked: this.walkedIn(dir) } : undefined;
    const by = k.waits.length ? "key" : "explorer";
    void diskThreads()
      .list(dir, this.app.config.walk, this.app.ui.hidden_files, by, own)
      .then(
        (listing) => this.answered(key, n, settings, listing),
        (err: Error) => {
          // Read again since: that read answers for it.
          const was = this.kept.get(key);
          if (was?.reading !== n) return;
          this.settle(was, err);
          // Its thread gave no answer, the folder listed before: shown as it was, read again later. Only a first
          // listing says it couldn't be read.
          if (was.listing && was.listing.error === null) {
            was.reading = null;
            was.at = Date.now();
            if (was.changed) this.due(key, was);
          } else this.answered(key, n, settings, { ...empty, error: noAnswer(err) });
        },
      );
  }

  /** A listing answered: kept, and drawn when it says something new — unless it's for a folder let go of, or read
   *  again since, or under settings changed since: then read again at once, under the settings now (another vault
   *  gone into meanwhile, its own; a folder of the vault's own tree, by its walk's filter now), never waiting for the
   *  tree to be built again to ask. */
  private answered(key: string, n: number, settings: string, listing: FolderListing): void {
    const k = this.kept.get(key);
    if (!k || k.reading !== n || this.app.quitting) return;
    k.reading = null;
    k.at = Date.now();
    const now = this.settings(k.own);
    if (settings !== now) return this.read(key, k, now);
    const changed =
      !k.listing || k.settings !== settings || k.listing.error !== listing.error || k.listing.digest !== listing.digest;
    k.listing = listing;
    k.settings = settings;
    // The watcher saw a change while it was read: maybe after it looked.
    if (k.changed) this.due(key, k);
    if (changed) this.redraw();
    this.settle(k);
  }

  /** The tree built again with what came, and drawn: the row the explorer meant to select selected once it's there
   *  (`wanted`, the selection not moved since), else the selection kept on the row it was on. */
  private redraw(): void {
    if (this.app.quitting) return;
    const ex = this.app.explorer;
    const s = this.app.sidebar;
    const mine = this.app.leftView === "explorer" && !s.filter;
    const wanted = ex.wanted?.at === s.selected ? ex.wanted : null;
    const was = mine && !wanted ? ex.rows()[s.selected]?.path : undefined;
    ex.invalidateTree();
    // Its path read once the tree is built: the row's path it was asked by may be another now (`ExplorerPaths.rekey`).
    const rows = mine ? ex.rows() : [];
    const at = wanted ? wanted.path : was;
    if (at !== undefined) {
      const i = rows.findIndex((r) => r.path === at);
      if (i >= 0) {
        s.selected = i;
        if (wanted) ex.wanted = null;
      }
    }
    this.app.host.requestRender();
  }
}
