// What drawing asks of the disk (SD-T11, SD-D13): a note's links — what's at a path, a folder's names on a disk that
// folds case — an embedded note's text, a picture's file, the scratch's places' files and the Problems panel's. A draw
// never reads the disk and never waits. Each is answered from what's kept — the walk's notes, files and folders, what a
// disk thread answered before — and, when it isn't, asked of a disk thread in the background, one batch a request,
// meanwhile a link drawn as resolved (SD-D12), a picture's or an embed's place said, a place or a finding as if read;
// the layouts drawn again when an answer changes what was drawn, from their anchors (D98). A kept answer drawn two
// seconds after it was read is asked again, drawn as it was until the new one comes; one drawn sooner is asked again
// once it's two seconds old, though nothing draws it then — a file come where nothing watches drawn so within two
// seconds. A batch given up on (SD-D6) is asked again a minute later. A test's App reads at once, here, through the
// seam, unless it asks (`offThread`).

import { dirname, isAbsolute, relative } from "node:path";
import { type ParsedNote, parseMarkdown } from "../../../core/documents/markdown/parse.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { NamedFolder } from "../../../core/workspace/vaults/folders.ts";
import { answering, type PathProbe } from "../../../core/workspace/links/path-probe.ts";
import { type DrawAnswer, type DrawAsk, type TextRead, textRead } from "../../../core/workspace/walk/draw-jobs.ts";
import { type PathStat, statOf } from "../../../core/workspace/walk/io/stamps.ts";
import { diskThreads } from "../../../core/workspace/walk/walk-thread.ts";

/** How old a kept answer is before it's asked again as it's drawn (ms): the scratch's places' two seconds (D229). */
export const DRAWN_AGAIN_MS = 2000;
/** How long a batch given up on waits before it's asked again (SD-D6). */
const RETRY_MS = 60_000;
/** The most answers kept of each kind: the oldest let go of past it. */
const KEPT = 4096;
/** The most of an embedded note read to draw it. */
const NOTE_MAX = Number.MAX_SAFE_INTEGER;

/** An answer kept, and when it was read. */
type Kept<T> = { value: T; at: number };

/** What's to be asked in the next batch: paths, folders' names, files and the most read of each, the named folders. */
type Asked = { stat: Set<string>; names: Set<string>; texts: Map<string, number>; folders: boolean };

/** What drawing needs of the App. */
export interface DrawnApp {
  readonly graph: Graph;
  readonly buffers: ReadonlyMap<string, { invalidateLayouts(): void }>;
  /** Every view here: the tabs', and the peek's, whose buffer isn't among `buffers`. */
  allViews(): readonly { readonly buf: { invalidateLayouts(): void } }[];
  readonly explorer: { readonly listings: { readonly offThread: boolean } };
  readonly host: { requestRender(): void };
  now(): number;
  relayoutAll(): void;
}

/** Whether two answers draw alike: a folder's by its kind alone, its mtime moving with what's in it. */
function sameStat(a: PathStat, b: PathStat): boolean {
  if ("error" in a || "error" in b) return "error" in a && "error" in b;
  return a.kind === b.kind && (a.kind === "dir" || (a.mtimeMs === b.mtimeMs && a.size === b.size));
}

export class Drawn implements PathProbe {
  constructor(private readonly app: DrawnApp) {}

  /** Asked of the disk threads as the explorer's listings are (the TUI's: `AppOptions.listOffThread`); else read here,
   *  at once — a test's App, unless it says otherwise. */
  get offThread(): boolean {
    return this.off ?? this.app.explorer.listings.offThread;
  }
  set offThread(off: boolean) {
    this.off = off;
  }
  private off: boolean | null = null;

  /** Moved each time an answer changes what's drawn: what keeps something drawn from them keys it by this. */
  epoch = 0;

  private readonly stats = new Map<string, Kept<PathStat>>();
  private readonly listings = new Map<string, Kept<string[] | null>>();
  /** The machine's named folders, as a disk thread last read them. */
  private readonly named = new Map<string, Kept<NamedFolder[]>>();
  private readonly texts = new Map<string, Kept<TextRead | null>>();
  private readonly parses = new Map<string, { stamp: string; parsed: ParsedNote | null }>();
  private asked: Asked = this.none();
  /** A batch out: none other asked till it answers. */
  private out = false;
  /** Set to ask the next batch: once this draw is done, or, given up on, a minute on. */
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pausedUntil = 0;
  /** Kept answers drawn before they were two seconds old, by kind and key: each asked again once it is. */
  private readonly later = new Map<string, { map: Map<string, Kept<unknown>>; key: string; ask: () => void }>();
  /** Set for the soonest of them, and when that is. */
  private laterTimer: ReturnType<typeof setTimeout> | null = null;
  private laterAt = Number.POSITIVE_INFINITY;

  /** `run`, a layout or what's drawn of a note, its links' questions of the disk answered here: off the thread, from
   *  what's kept; else by the disk, at once. */
  during<T>(run: () => T): T {
    return answering(this.offThread ? this : null, run);
  }

  // What a link asks (PathProbe), answered only while drawing (`during`), off the thread: not known yet, a path is
  // what's asked of it — a link drawn as resolved — and a folder holds no names, its link's spelling kept.

  isFile(abs: string): boolean {
    const s = this.stat(abs);
    return s === undefined || ("kind" in s && s.kind === "file");
  }

  isFolder(abs: string): boolean {
    const s = this.stat(abs);
    return s === undefined || ("kind" in s && s.kind === "dir");
  }

  exists(abs: string): boolean {
    const s = this.stat(abs);
    return s === undefined || "kind" in s;
  }

  names(dir: string): string[] | null {
    return this.kept(this.listings, dir, () => this.asked.names.add(dir)) ?? null;
  }

  /** The machine's named folders (21.6), as last read: none known till the first answer — a pointer drawn as not found
   *  and a hosting URL as a web link meanwhile, a moment on a disk that answers. */
  folders(): NamedFolder[] {
    return this.kept(this.named, "", () => (this.asked.folders = true)) ?? [];
  }

  /** A picture's file's mtime (12.x): null when it isn't a file; undefined while it's read. */
  fileAt(abs: string): number | null | undefined {
    // Its own stat, never the walk's: a picture is drawn again once its file changes.
    const s = this.offThread ? this.stat(abs, false) : statOf(abs);
    if (s === undefined) return undefined;
    return "kind" in s && s.kind === "file" ? s.mtimeMs : null;
  }

  /** A file's text, at most `max` bytes: null when there's none to read; undefined while it's read. */
  text(abs: string, max: number): string | null | undefined {
    if (!this.offThread) return textRead(abs, max)?.text ?? null;
    const t = this.kept(this.texts, abs, () => this.asked.texts.set(abs, max));
    return t === undefined ? undefined : (t?.text ?? null);
  }

  /** What a layout reads embedded notes by: this drawing, off the thread; else the layout itself, at once. */
  embeds(): { embedded?: (abs: string) => ParsedNote | null } {
    return this.offThread ? { embedded: this.embedded } : {};
  }

  /** An embedded note's parse (1.11), kept by its file's stamp: null, not drawn in place — not there, or not read yet. */
  readonly embedded = (abs: string): ParsedNote | null => {
    const t = this.kept(this.texts, abs, () => this.asked.texts.set(abs, NOTE_MAX));
    if (!t) return null;
    const hit = this.parses.get(abs);
    if (hit?.stamp === t.stamp) return hit.parsed;
    let parsed: ParsedNote | null = null;
    try {
      parsed = parseMarkdown(t.text);
    } catch {}
    if (this.parses.size >= 200) this.parses.delete(this.parses.keys().next().value!);
    this.parses.set(abs, { stamp: t.stamp, parsed });
    return parsed;
  };

  /** A path as the walk gave it — a note, a file, a folder of the vault open — or as a disk thread answered; undefined
   *  while it's asked. What the walk didn't give is asked, since it leaves out what its filter does; till it answers,
   *  one in a folder the walk listed isn't there, as the walk says (a link to a note not written yet, drawn so). */
  private stat(abs: string, walked = true): PathStat | undefined {
    const g = this.app.graph;
    const rel = relative(g.root, abs);
    const inside = walked && !!rel && !rel.startsWith("..") && !isAbsolute(rel);
    if (inside) {
      const walked = g.known(rel) ? "file" : this.walkedFolders(g).has(rel) ? "dir" : null;
      if (walked) return { kind: walked, mtimeMs: 0, ctimeMs: 0, size: 0 };
    }
    const kept = this.kept(this.stats, abs, () => this.asked.stat.add(abs));
    if (kept !== undefined || !inside) return kept;
    const folder = dirname(rel);
    return this.walkedFolders(g).has(folder === "." ? "" : folder) ? { error: "ENOENT" } : undefined;
  }

  private folderSet: { graph: Graph; dirs: string[]; set: Set<string> } | null = null;

  /** The vault open's folders, as its walk listed them. */
  private walkedFolders(g: Graph): Set<string> {
    if (this.folderSet?.graph !== g || this.folderSet.dirs !== g.dirs)
      this.folderSet = { graph: g, dirs: g.dirs, set: new Set(g.dirs) };
    return this.folderSet.set;
  }

  /** What's kept of `key`, asked again (`ask`) when there's none or it's two seconds old; younger, once it is. */
  private kept<T>(map: Map<string, Kept<T>>, key: string, ask: () => void): T | undefined {
    const k = map.get(key);
    const age = k ? this.app.now() - k.at : Number.POSITIVE_INFINITY;
    if (age >= DRAWN_AGAIN_MS) {
      ask();
      this.soon(0);
    } else this.askLater(map as Map<string, Kept<unknown>>, key, ask, DRAWN_AGAIN_MS - age);
    return k?.value;
  }

  /** `key`, drawn from an answer `ms` short of two seconds old, asked again then. */
  private askLater(map: Map<string, Kept<unknown>>, key: string, ask: () => void, ms: number): void {
    const kind = map === this.stats ? "s" : map === this.listings ? "n" : map === this.named ? "f" : "t";
    this.later.set(`${kind}${key}`, { map, key, ask });
    const at = this.app.now() + ms;
    if (this.laterTimer && this.laterAt <= at) return;
    if (this.laterTimer) clearTimeout(this.laterTimer);
    this.laterAt = at;
    this.laterTimer = setTimeout(() => this.due(), ms);
    (this.laterTimer as { unref?: () => void }).unref?.();
  }

  /** The answers drawn young that are two seconds old now asked again, in the next batch; the rest when they are. */
  private due(): void {
    this.laterTimer = null;
    this.laterAt = Number.POSITIVE_INFINITY;
    const now = this.app.now();
    let next = Number.POSITIVE_INFINITY;
    for (const [id, l] of this.later) {
      const k = l.map.get(l.key);
      const age = k ? now - k.at : Number.POSITIVE_INFINITY;
      if (age < DRAWN_AGAIN_MS) next = Math.min(next, DRAWN_AGAIN_MS - age);
      else {
        l.ask();
        this.later.delete(id);
      }
    }
    if (next < Number.POSITIVE_INFINITY) {
      this.laterAt = now + next;
      this.laterTimer = setTimeout(() => this.due(), next);
      (this.laterTimer as { unref?: () => void }).unref?.();
    }
    if (this.any(this.asked)) this.soon(0);
  }

  private none(): Asked {
    return { stat: new Set(), names: new Set(), texts: new Map(), folders: false };
  }

  /** Whether anything's to be asked. */
  private any(a: Asked): boolean {
    return a.stat.size > 0 || a.names.size > 0 || a.texts.size > 0 || a.folders;
  }

  /** The next batch asked `ms` from now, unless one is set to be. */
  private soon(ms: number): void {
    if (this.timer || this.out) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.ask();
    }, ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** What's been asked, as one batch in the background (SD-D3): its answers kept, and drawn again if they change
   *  what was drawn; given up on, asked again a minute later. */
  private async ask(): Promise<void> {
    const wait = this.pausedUntil - this.app.now();
    if (wait > 0) return this.soon(wait);
    const a = this.asked;
    if (this.out || !this.any(a)) return;
    this.asked = this.none();
    const ask: DrawAsk = {
      stat: [...a.stat],
      names: [...a.names],
      texts: [...a.texts].map(([path, max]) => ({ path, max })),
      ...(a.folders ? { folders: true } : {}),
    };
    this.out = true;
    try {
      const answer = await diskThreads().ask<{ drawn: DrawAnswer }>({ op: "draw", ask }, "look", undefined, true);
      this.take(ask, answer.drawn);
    } catch {
      // Given up on (SD-D6): drawn as it was, asked again a minute on.
      this.pausedUntil = this.app.now() + RETRY_MS;
      for (const p of ask.stat) this.asked.stat.add(p);
      for (const d of ask.names) this.asked.names.add(d);
      for (const t of ask.texts) this.asked.texts.set(t.path, t.max);
      this.asked.folders ||= a.folders;
    } finally {
      this.out = false;
    }
    if (this.any(this.asked)) this.soon(0);
  }

  /** A batch's answers kept; the layouts drawn again when one changes what was drawn — a first answer always does. */
  private take(ask: DrawAsk, answer: DrawAnswer): void {
    const at = this.app.now();
    let changed = false;
    const put = <T>(map: Map<string, Kept<T>>, key: string, value: T, same: (a: T, b: T) => boolean) => {
      const was = map.get(key);
      if (!was || !same(was.value, value)) changed = true;
      map.delete(key);
      if (map.size >= KEPT) map.delete(map.keys().next().value!);
      map.set(key, { value, at });
    };
    ask.stat.forEach((p, i) => put(this.stats, p, answer.stats[i]!, sameStat));
    ask.names.forEach((d, i) =>
      put(this.listings, d, answer.names[i] ?? null, (a, b) => (a ?? []).join("\0") === (b ?? []).join("\0")),
    );
    ask.texts.forEach((t, i) => put(this.texts, t.path, answer.texts[i] ?? null, (a, b) => a?.stamp === b?.stamp));
    if (answer.folders) put(this.named, "", answer.folders, (a, b) => JSON.stringify(a) === JSON.stringify(b));
    if (!changed) return;
    this.epoch++;
    // The peek's too: a link in another vault's note asks of the disk as much as one here.
    for (const b of new Set([...this.app.buffers.values(), ...this.app.allViews().map((v) => v.buf)]))
      b.invalidateLayouts();
    this.app.relayoutAll();
    this.app.host.requestRender();
  }

  /** Once nothing's asked or out (tests): what's drawn is drawn from what's kept, till an answer drawn young is old. */
  async settled(): Promise<void> {
    while (this.out || this.timer || this.any(this.asked)) await new Promise((r) => setTimeout(r, 5));
  }

  /** Files seen to change (the watcher's): what's kept of each asked again as it's next drawn, drawn as it was till
   *  then. */
  stale(paths: Iterable<string>): void {
    for (const p of paths)
      for (const map of [this.stats, this.texts] as Map<string, Kept<unknown>>[]) {
        const k = map.get(p);
        if (k) k.at = Number.NEGATIVE_INFINITY;
      }
  }
}
