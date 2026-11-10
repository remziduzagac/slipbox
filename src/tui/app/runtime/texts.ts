// A note's text read on the disk threads (SD-T6; SD-D3, SD-D5, SD-D6). What a watcher's batch changes — each note's
// file as the graph takes it in, each open file the batch names — is read in one background request before the batch
// is applied (`VaultFeed`'s `read`); an open file the look each second found changed is read there before it's
// reloaded (`reload`); and the background parse's texts, the next slice's asked while this one's are parsed (`ahead`),
// the graph parsing each from its text given. A key that needs every note waits for the parse to have them all
// (`whenParsed`, `KeyReads.notes`). Nothing is read here instead when a thread doesn't answer: a batch is read again a
// minute later, a slice put aside for a minute. A test's App reads on the screen's thread unless asked (`offThread`).

import { dirname, join } from "node:path";
import { WorkerRequestError } from "../../../core/foundation/workers/worker-requests.ts";
import type { Stamp } from "../../../core/foundation/platform/fsutil.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { WatchBatch } from "../../../core/workspace/graph/watch.ts";
import type { BatchReads } from "../../../core/workspace/vaults/vault-feed.ts";
import type { NoteRead, NoteText } from "../../../core/workspace/walk/io/notes.ts";
import type { LookJobAnswer } from "../../../core/workspace/walk/look-jobs.ts";
import { diskThreads, walkFailure } from "../../../core/workspace/walk/walk-thread.ts";
import type { NoteFile } from "../../../core/workspace/walk/walk.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { App } from "./app.ts";

/** How many notes' texts the background parse asks at once, all of one folder: the next slice (SD-D12). */
export const TEXT_SLICE = 50;

/** A slice given up on is asked again this long after (SD-D6), as a look is. */
export const SLICE_AGAIN_MS = 60_000;

/** One note's file read in the background, as a change to it is taken in (`readNote`): whole (`max` null), or no more
 *  than `max` bytes. */
async function readNotes(paths: string[], max: (number | null)[]): Promise<NoteRead[]> {
  const [a] = (await diskThreads().look({ jobs: [{ op: "notes", paths, max }], background: true })).jobs;
  return (a as Extract<LookJobAnswer, { notes: unknown }>).notes;
}

/** The next slice of `graph`'s notes not parsed yet, but those `skip` says: of one folder, `TEXT_SLICE` at most. */
function nextSlice(graph: Graph, skip: (f: NoteFile) => boolean): NoteFile[] {
  const out: NoteFile[] = [];
  let dir: string | null = null;
  for (const f of graph.unparsedOver(0)) {
    if (skip(f)) continue;
    const d = dirname(f.rel);
    dir ??= d;
    if (d !== dir) continue;
    out.push(f);
    if (out.length >= TEXT_SLICE) break;
  }
  return out;
}

/** A note's texts read on the disk threads (`app.watch.texts`). */
export class Texts {
  constructor(private readonly app: App) {}

  /** Read on the disk threads, as the builds and the look are (the TUI's: `AppOptions.listOffThread`); else here, at
   *  once — a test's App, unless it says otherwise. */
  get offThread(): boolean {
    return this.off ?? this.app.explorer.listings.offThread;
  }
  set offThread(off: boolean) {
    this.off = off;
  }
  private off: boolean | null = null;

  /** How long a slice given up on is put aside; a test's, sooner. */
  againMs = SLICE_AGAIN_MS;

  /** What the feed asks of it (`FeedOptions`): a batch's files read on a disk thread, and its give-up said. */
  feedOptions(): { read: () => ((b: WatchBatch) => Promise<BatchReads>) | null; gaveUp: () => void } {
    return {
      read: () => (this.offThread ? (b) => this.batch(b) : null),
      gaveUp: () => {
        if (this.app.quitting) return;
        this.app.message("warn", "disk not answering: a change to a note wasn't read; it's read again in a minute");
        this.app.host.requestRender();
      },
    };
  }

  /** Each open file's stamp as a batch's files were asked: what's read is its news only while it's so (`unchanged`). */
  private readonly asked = new WeakMap<BatchReads, Map<NoteBuffer, Stamp | null>>();

  /**
   * `b`'s files read on a disk thread, in one background request (a look's minute, SD-D6): each note it changes, as the
   * graph takes it in (`walk.max_file_size` at most, as the walk takes it), and each open file it names, whole.
   */
  private async batch(b: WatchBatch): Promise<BatchReads> {
    const g = this.app.graph;
    const max = this.app.config.walk.max_file_size;
    const want = new Map<string, number | null>();
    const open = new Map<NoteBuffer, Stamp | null>();
    for (const c of b.changes) {
      const buf = this.app.buffers.get(c.rel);
      if (buf) open.set(buf, buf.stamp);
      if (c.kind === "deleted") continue;
      const abs = join(g.root, c.rel);
      if (c.isNote && want.get(abs) !== null) want.set(abs, max);
      if (buf && !buf.virtual) want.set(buf.abs, null);
    }
    const paths = [...want.keys()];
    const read = paths.length ? await readNotes(paths, [...want.values()]) : [];
    const reads = new Map(paths.map((p, i) => [p, read[i] ?? null] as const));
    this.asked.set(reads, open);
    return reads;
  }

  /** Whether `buf` is as it was when `reads` was asked — not saved, read again, nor opened since: what was read of it
   *  is its news. */
  unchanged(reads: BatchReads, buf: NoteBuffer): boolean {
    const open = this.asked.get(reads);
    return !!open?.has(buf) && open.get(buf) === buf.stamp;
  }

  /** The open files read again for the look (`reload`), one read out each. */
  private readonly rereading = new WeakSet<NoteBuffer>();

  /** `buf`, an open file the look each second found changed, read on a disk thread and then reloaded with what it read
   *  (`Watch.reloadBuffer`) — while it's open and as it was. Given up on, the next look finds it changed still. */
  reload(buf: NoteBuffer): void {
    if (this.rereading.has(buf)) return;
    this.rereading.add(buf);
    const at = buf.stamp;
    const done = () => this.rereading.delete(buf);
    readNotes([buf.abs], [null]).then(([read]) => {
      done();
      if (this.app.quitting || buf.stamp !== at || ![...this.app.buffers.values()].includes(buf)) return;
      this.app.watch.reloadBuffer(buf, false, read ?? null);
      this.app.host.requestRender();
    }, done);
  }

  /** A big note's text read on a disk thread for its parse, in the background — before and after it's parsed on the
   *  parse threads; null once given up on (put aside, as a slice is) or the threads stopped. */
  async text(graph: Graph, f: NoteFile): Promise<NoteText | null> {
    try {
      const [a] = (await diskThreads().look({ jobs: [{ op: "texts", paths: [f.abs] }], background: true })).jobs;
      return (a as Extract<LookJobAnswer, { texts: unknown }>).texts[0]!;
    } catch (err) {
      if (walkFailure(err as Error) !== "stopped" && !this.app.quitting) this.putAside(graph, [f]);
      return null;
    }
  }

  /** Whether `rel`, of `graph`, is put aside: its text's read given up on a moment ago. */
  isAside(graph: Graph, rel: string): boolean {
    return !!this.aside.get(graph)?.has(rel);
  }

  /** The slice out: the graph it's for, built so many times. */
  private slice: { graph: Graph; builds: number } | null = null;
  /** The notes of each graph put aside, their slice given up on: asked again a minute later. */
  private readonly aside = new WeakMap<Graph, Set<string>>();
  /** Slices given up on so far: a key waiting for every note since one is let go (`whenParsed`). */
  private gaveUp = 0;

  /**
   * The next slice's texts asked of a disk thread while what's given is parsed (SD-D12): none while one is out for the
   * graph as it is, nor while a slice's are given still — two slices' texts at most. A slice is the next notes not
   * parsed yet but `skip`'s (a big note, read and parsed apart), of one folder: a slow folder, a mount most often, holds
   * no other folder's notes in its request. Answered, each text given to the graph it was read for, unless it has been
   * built since (SD-D5); given up on (SD-D6), its notes put aside for a minute, said once a slice.
   */
  ahead(graph: Graph, skip: (f: NoteFile) => boolean): void {
    if (!this.offThread) return;
    if (this.slice && this.slice.graph === graph && this.slice.builds === graph.builds) return;
    if (graph.texts.ready().length >= TEXT_SLICE) return;
    const aside = this.aside.get(graph);
    const files = nextSlice(graph, (f) => skip(f) || graph.texts.has(f.rel) || !!aside?.has(f.rel));
    if (!files.length) return;
    const out = { graph, builds: graph.builds };
    this.slice = out;
    const paths = files.map((f) => f.abs);
    diskThreads()
      .look({ jobs: [{ op: "texts", paths }], background: true })
      .then(
        ({ jobs: [a] }) => {
          if (this.slice === out) this.slice = null;
          if (graph.builds !== out.builds) return;
          const texts = (a as Extract<LookJobAnswer, { texts: unknown }>).texts;
          files.forEach((f, i) => graph.texts.give(f, texts[i]!));
        },
        (err: Error) => {
          if (this.slice === out) this.slice = null;
          if (walkFailure(err) === "stopped" || this.app.quitting) return;
          this.putAside(graph, files);
        },
      );
  }

  /** `files`, their slice given up on: left out of the slices for a minute, said. */
  private putAside(graph: Graph, files: NoteFile[]): void {
    this.gaveUp++;
    const aside = this.aside.get(graph) ?? new Set<string>();
    this.aside.set(graph, aside);
    for (const f of files) aside.add(f.rel);
    const timer = setTimeout(() => {
      for (const f of files) aside.delete(f.rel);
    }, this.againMs);
    (timer as { unref?: () => void }).unref?.();
    const n = files.length;
    this.app.message(
      "warn",
      `indexing: ${n} note${n === 1 ? "" : "s"} in ${dirname(files[0]!.rel)} didn't answer in time; read again in a minute`,
    );
    this.app.host.requestRender();
  }

  /**
   * Once every note of `graph` is parsed, the background parse reading their texts — started again if it isn't going:
   * what a key that needs them waits for (`KeyReads.notes`). Fails as a key's read does: `signal` given up (`esc`),
   * the vault left, or a slice given up on meanwhile (SD-D6).
   */
  whenParsed(graph: Graph, signal: AbortSignal): Promise<void> {
    const since = this.gaveUp;
    return new Promise((resolve, reject) => {
      const look = () => {
        if (signal.aborted) return reject(new WorkerRequestError("worker request cancelled", "cancelled"));
        if (this.app.graph !== graph || this.app.quitting)
          return reject(new WorkerRequestError("worker request cancelled", "stopped"));
        if (!graph.pendingCount) return resolve();
        if (this.gaveUp !== since)
          return reject(new WorkerRequestError("worker request deadline exceeded", "deadline"));
        if (!this.app.indexing) this.app.watch.indexInBackground();
        setTimeout(look, 20);
      };
      look();
    });
  }
}
