// A key's own reads (SD-D4, SD-T5): what a key asks of the disk and acts on — a note opened, `:e!` and a reload by
// hand, `:e`'s file looked for, a file looked for before git opens it, git's stats before its read, a folder zoomed
// into or unfolded (SD-T7) — asked of a disk thread. The key waits for it, and the keys after it wait their turn
// (`Input.processKey`), as for a big note's parse; a click meanwhile is dropped (`Mouse.handle`). The screen draws:
// `reading <note>…` in the window the note will be in (`Views.layoutFor`). `esc` gives it up at once, out of turn
// (`Input.handleKey`), the window as it was; past its deadline (SD-D6: a key's minute) it's said. Either way the keys
// typed meanwhile, meant for what it opened, are dropped. A test's App reads on the screen's thread, at once, unless
// asked (SD-D10: `AppOptions.listOffThread`).

import { folderUnreadable } from "../../../core/foundation/platform/fsutil.ts";
import { WorkerRequestError } from "../../../core/foundation/workers/worker-requests.ts";
import { tildePath } from "../../../core/workspace/vaults/names.ts";
import { type PathStat, statOf } from "../../../core/workspace/walk/io/stamps.ts";
import { type DiskThreads, diskThreads } from "../../../core/workspace/walk/walk-thread.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { App, View } from "./app.ts";

/** A key's read out: what it reads, as said, the window it's said in (none: said elsewhere, git's), how it's given up. */
interface Out {
  name: string;
  view: View | null;
  stop: AbortController;
  givenUp: boolean;
}

/** `then` after `first`: at once when it's done, else once it is (a key's read was out). */
export function andThen(first: void | Promise<void>, then: () => void | Promise<void>): void | Promise<void> {
  return first instanceof Promise ? first.then(then) : then();
}

/** A key's own reads (`app.reads`). */
export class KeyReads {
  constructor(private readonly app: App) {}

  /** Read on the disk threads (the TUI's); else here, at once (a test's App, unless it asks). */
  offThread = false;
  /** Keys taken up to this one (`Input.keysSeen`) are dropped once their turn comes: typed for what a read gave up. */
  droppedThrough = 0;
  private readonly outs = new Set<Out>();
  /** What the keys wait for: the reads out, and what each is for (an open, once read). */
  private readonly held = new Set<Promise<unknown>>();

  /** Whether a key's read, or what it's for, is under way: the keys wait (`settled`), a click is dropped. */
  get busy(): boolean {
    return this.held.size > 0;
  }

  /** What `view` says while a key's read for it is out (`reading <note>…`); null when none. */
  shownIn(view: View): string | null {
    let said: string | null = null;
    for (const o of this.outs) if (o.view === view) said = `reading ${o.name}…`;
    return said;
  }

  /** `work`, a key's: the keys after it wait for it (`settled`). */
  hold<T>(work: Promise<T>): Promise<T> {
    this.held.add(work);
    const done = () => this.held.delete(work);
    work.then(done, done);
    return work;
  }

  /**
   * `read` asked of the disk threads for a key — `name` said in `view` while it's out — and its answer; null once given
   * up (`esc`) or failed, said (`<name> didn't answer: <notDone>` past its deadline), the keys typed meanwhile dropped.
   * `background`: a read no key waits on (the session's tabs after the one shown), only said when it fails.
   */
  ask<T>(
    name: string,
    view: View | null,
    read: (threads: DiskThreads, stop: AbortController, background: boolean) => Promise<T>,
    notDone = "not opened",
    background = false,
  ): Promise<T | null> {
    const out: Out = { name, view, stop: new AbortController(), givenUp: false };
    if (!background) this.outs.add(out);
    this.app.host.requestRender();
    const asked = async (): Promise<T | null> => {
      try {
        return await read(diskThreads(), out.stop, background);
      } catch (err) {
        const kind = err instanceof WorkerRequestError ? err.kind : null;
        if (!out.givenUp && kind !== "stopped" && !this.app.quitting)
          this.app.message(
            "warn",
            kind === "deadline"
              ? `${name} didn't answer: ${notDone}`
              : `${name} couldn't be read (${(err as Error).message}): ${notDone}`,
          );
        if (!background) this.drop();
        return null;
      } finally {
        this.outs.delete(out);
        this.app.host.requestRender();
      }
    };
    return background ? asked() : this.hold(asked());
  }

  /**
   * `abs` statted (its links followed) for a key, and `then` with its answer — its error's code when it has one: asked
   * of a disk thread as a key's read, `name` said in `view` meanwhile (here at once on a test's App), the keys waiting
   * for all of it; not when the read gave up. A file looked for before it's opened: `:e`'s, a link's, git's (SD-T5).
   */
  statted(abs: string, name: string, view: View | null, then: (st: PathStat) => unknown): Promise<void> {
    const looked = async (): Promise<void> => {
      const st = this.offThread
        ? await this.ask(name, view, async (t, stop) => (await t.stat([abs], "key", false, stop))[0]!)
        : statOf(abs);
      if (st !== null) await then(st);
    };
    return this.hold(looked());
  }

  /**
   * Whether the folder `abs` can be gone into, for a key (`folderUnreadable`'s words; null when it can), and `then` with
   * it: asked of a disk thread as a key's read, the keys waiting, nothing said in a window — a frame drawn all the same
   * (here at once on a test's App); not when the read gave up, `<folder> didn't answer: <notDone>` past its deadline. A
   * zoom, a folder unfolded, slipbox opened on a folder (SD-T7, SD-T10).
   */
  folder(abs: string, notDone: string, then: (why: string | null) => unknown): void | Promise<void> {
    if (!this.offThread) return void then(folderUnreadable(abs));
    const looked = async (): Promise<void> => {
      const read = (t: DiskThreads, stop: AbortController) => t.access(abs, "key", stop);
      const answer = await this.ask(tildePath(abs), null, async (t, stop) => ({ why: await read(t, stop) }), notDone);
      if (answer !== null) await then(answer.why);
    };
    return this.hold(looked());
  }

  /** `then` once something is at `abs` (`existsSync`'s answer), `otherwise` when nothing is, looked for as `statted`. */
  whenThere(
    abs: string,
    name: string,
    view: View | null,
    then: () => unknown,
    otherwise?: () => unknown,
  ): Promise<void> {
    return this.statted(abs, name, view, (st) => ("error" in st ? otherwise?.() : then()));
  }

  /**
   * `buf` loaded again from its file (`:e!`, loading theirs over yours), read as a key's own, `reading` said in the
   * window showing it; `then` with whether its file is there (false: gone, `load`'s answer). Neither when the read gave
   * up, or the buffer moved meanwhile (a reload of the watcher's took it first).
   */
  reload(buf: NoteBuffer, then: (there: boolean) => unknown): Promise<void> | void {
    if (!this.offThread || buf.virtual) return void then(buf.load());
    const version = buf.version;
    const view = this.app.view?.buf === buf ? this.app.view : null;
    const loaded = async (): Promise<void> => {
      const read = await this.ask(
        this.app.displayName(buf),
        view,
        (t, stop) => t.read(buf.abs, "key", stop),
        "not reloaded",
      );
      if (!read || buf.version !== version) return;
      if ("error" in read) buf.deleted = true;
      await then(!("error" in read) && buf.took(read));
    };
    return this.hold(loaded());
  }

  /** Keys waiting for every note's parse (`notes`): `reading notes…` on the status line meanwhile. */
  private waitingNotes = 0;
  get readingNotes(): boolean {
    return this.waitingNotes > 0;
  }

  /**
   * `then` once every note of the vault open is parsed: at once when they are, or when they're read here (a test's
   * App). Else, their texts read on the disk threads (SD-T6, SD-D12), a key's wait — the keys after it wait too,
   * `reading notes…` on the status line, `esc` gives it up; a slice given up on meanwhile is said (`the notes didn't
   * answer: <notDone>`). What needs them all: a rename's preview, the tags' lists, the backlinks list.
   */
  notes(then: () => unknown, notDone = "not done"): void | Promise<void> {
    const g = this.app.graph;
    if (!this.app.watch.texts.offThread || !g.pendingCount) return void then();
    const waited = async (): Promise<void> => {
      this.waitingNotes++;
      const parsed = await this.ask(
        "the notes",
        null,
        async (_t, stop) => (await this.app.watch.texts.whenParsed(g, stop.signal), true),
        notDone,
      ).finally(() => this.waitingNotes--);
      if (parsed && this.app.graph === g) await then();
    };
    return this.hold(waited());
  }

  /** `esc` while a key's read is out: each given up — its thread started afresh — and the keys typed meanwhile
   *  dropped. Whether one was. */
  giveUp(): boolean {
    if (!this.outs.size) return false;
    for (const o of this.outs) {
      o.givenUp = true;
      o.stop.abort();
    }
    // Gone from the screen at once: the window as it was, before the thread's answer to the abort.
    this.outs.clear();
    this.drop();
    this.app.host.requestRender();
    return true;
  }

  /** The keys taken so far dropped when their turn comes: what they were typed for didn't open. */
  drop(): void {
    this.droppedThrough = this.app.input.keysSeen;
  }

  /** Once no key's read, nor what it's for, is under way. */
  async settled(): Promise<void> {
    while (this.held.size) await Promise.allSettled([...this.held]);
  }
}
