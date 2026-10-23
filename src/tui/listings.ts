// The explorer's listings (T12, VV-D5): the folders it lists a level at a time — above the vault open, beside it,
// other vaults, what its walk leaves out unfolded, Elsewhere — read on the listing threads (walk-thread.ts), kept, and
// read again in the background as the tree is built again, never on the main thread, where a folder on a disk that
// answers slowly would freeze the keys and the screen. A folder not listed yet says so once its read has taken a moment
// (`PENDING_MS`); an answer that changed nothing draws nothing, one for a folder let go of meanwhile is dropped, and
// rows that come keep the selection on the row it was on.

import { listFolder, type FolderListing } from "../core/listing.ts";
import { listThreads } from "../core/walk-thread.ts";
import { WorkerRequestError } from "../core/worker-requests.ts";
import type { App } from "./app.ts";

/** How long a folder's first listing is read before its rows say it's being listed: a fast disk never shows it. */
export const PENDING_MS = 150;
/** A listing read longer ago than this is read again when the tree is built again: what came or went, seen. */
export const REREAD_MS = 1000;
/** One that failed (it couldn't be read, or gave no answer) is read again only this long after: a share that's gone
 *  isn't asked at every rebuild, a thread held each time. */
export const RETRY_MS = 60_000;
/** Folders kept listed at most, those the tree shows aside: the one shown longest ago let go of first. */
const KEPT = 256;

interface Kept {
  listing: FolderListing | null;
  /** The read under way, by its number; null when none is. */
  reading: number | null;
  /** When it was first asked for, and when it was last read (0: read again when next shown). */
  asked: number;
  at: number;
  /** What it was read under (`walk`: what a busy folder is; `files.hidden`): under others, it's read again. */
  settings: string;
  /** The tree it was last shown in (`newTree`): never let go of while that's the tree shown. */
  tree: number;
}

/** Why a listing's thread gave no answer, as its row says it — of the folder (`walkFailure` says it of the walk). */
function noAnswer(err: Error): string {
  const kind = err instanceof WorkerRequestError ? err.kind : null;
  if (kind === "deadline") return "no answer in time";
  if (kind === "unavailable" || kind === "crashed") return "its thread stopped";
  return err.message;
}

export class Listings {
  private readonly kept = new Map<string, Kept>();
  private serial = 0;
  private tree = 0;

  /** `offThread`: read on the listing threads (the TUI's); else here, at once, as the tree is built (a test's App). */
  constructor(
    private readonly app: App,
    readonly offThread = false,
  ) {}

  /** What a listing is read under, as it is now. */
  private settings(): string {
    return JSON.stringify({ walk: this.app.config.walk, hidden: this.app.ui.hidden_files });
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

  /** The folder `dir` as last listed — null while its first listing is read — read again when it's old. */
  get(dir: string): FolderListing | null {
    if (!this.offThread) return listFolder(dir, this.app.config.walk, this.app.ui.hidden_files);
    const settings = this.settings();
    let k = this.kept.get(dir);
    if (k) {
      this.kept.delete(dir);
      this.kept.set(dir, k);
    } else {
      k = { listing: null, reading: null, asked: Date.now(), at: 0, settings, tree: this.tree };
      this.kept.set(dir, k);
      // Still not listed then: its rows say it's being listed.
      const t = setTimeout(() => {
        if (this.kept.get(dir)?.listing === null) this.redraw();
      }, PENDING_MS);
      (t as { unref?: () => void }).unref?.();
    }
    k.tree = this.tree;
    const again = k.listing?.error ? RETRY_MS : REREAD_MS;
    if (k.reading === null && (!k.listing || k.settings !== settings || Date.now() - k.at > again))
      this.read(dir, k, settings);
    return k.listing;
  }

  /** Whether a listing is being read (tests wait for none). */
  get reading(): boolean {
    for (const k of this.kept.values()) if (k.reading !== null) return true;
    return false;
  }

  /** Whether `dir`'s first listing has been read for long enough that its rows say so. */
  pending(dir: string): boolean {
    const k = this.kept.get(dir);
    return !!k && !k.listing && Date.now() - k.asked >= PENDING_MS;
  }

  /** The listings of `dir` and of every folder in it let go of (moved away): read afresh when next shown, a read under
   *  way dropped. */
  forget(dir: string): void {
    for (const d of [...this.kept.keys()]) if (d === dir || d.startsWith(`${dir}/`)) this.kept.delete(d);
  }

  /** The listings of `dir` and of every folder in it read again when next shown, shown as they were meanwhile: what's in
   *  them changed (a file operation). A read under way is dropped: it may have read them before the change. */
  stale(dir: string): void {
    for (const [d, k] of this.kept)
      if (d === dir || d.startsWith(`${dir}/`)) {
        k.at = 0;
        k.reading = null;
      }
  }

  /** The listing of `dir` alone read again when next shown, never the folders in it (`stale` reads them too): what an
   *  entry of it says may be old — a folder refused, its permission changed since. */
  again(dir: string): void {
    const k = this.kept.get(dir);
    if (k) {
      k.at = 0;
      k.reading = null;
    }
  }

  private read(dir: string, k: Kept, settings: string): void {
    const n = ++this.serial;
    k.reading = n;
    const empty = { dir, entries: [], notes: false, scope: null };
    listThreads()
      .list(dir, this.app.config.walk, this.app.ui.hidden_files)
      .then(
        (listing) => this.answered(dir, n, settings, listing),
        (err: Error) => {
          // Its thread gave no answer, the folder listed before: shown as it was, read again later. Only a first
          // listing says it couldn't be read.
          const was = this.kept.get(dir);
          if (was?.reading === n && was.listing && was.listing.error === null) {
            was.reading = null;
            was.at = Date.now();
            return;
          }
          this.answered(dir, n, settings, { ...empty, error: noAnswer(err) });
        },
      );
  }

  /** A listing answered: kept, and drawn when it says something new — unless it's for a folder let go of, or read
   *  again since, or under settings changed since: then read again at once, under the settings now (another vault
   *  gone into meanwhile, its own), never waiting for the tree to be built again to ask. */
  private answered(dir: string, n: number, settings: string, listing: FolderListing): void {
    const k = this.kept.get(dir);
    if (!k || k.reading !== n || this.app.quitting) return;
    k.reading = null;
    k.at = Date.now();
    const now = this.settings();
    if (settings !== now) return this.read(dir, k, now);
    const changed =
      !k.listing || k.settings !== settings || k.listing.error !== listing.error || k.listing.digest !== listing.digest;
    k.listing = listing;
    k.settings = settings;
    if (changed) this.redraw();
  }

  /** The tree built again with what came, and drawn: the row the explorer meant to select selected once it's there
   *  (`wanted`, the selection not moved since), else the selection kept on the row it was on. */
  private redraw(): void {
    if (this.app.quitting) return;
    const ex = this.app.explorer;
    const s = this.app.sidebar;
    const mine = this.app.leftView === "explorer" && !s.filter;
    const wanted = ex.wanted?.at === s.selected ? ex.wanted.path : undefined;
    const at = mine ? (wanted ?? ex.rows()[s.selected]?.path) : undefined;
    ex.invalidateTree();
    if (at !== undefined) {
      const i = ex.rows().findIndex((r) => r.path === at);
      if (i >= 0) {
        s.selected = i;
        if (at === wanted) ex.wanted = null;
      }
    }
    this.app.host.requestRender();
  }
}
