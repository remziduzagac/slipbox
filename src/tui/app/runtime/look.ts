// The TUI's look each second (5.1–5.4, 5.9, 5.10, 20.9; SD-T4): what no watcher sees — the open files it doesn't watch,
// your config and the vault's, git's state where the vault is, the CLI's activity file, the root's tool's settings —
// asked of a disk thread (SD-D2), one look out at a time: a tick while one is out asks nothing (SD-D3). What it finds is
// taken when it comes, against what's there then (SD-D5): all of it dropped for a vault left meanwhile, a file's stamp
// for a buffer closed, saved or read again since, a way checked before a link was answered. What's drawn of git and
// the tool's settings are what it last found (SD-D13), never read as they're drawn. Given up on (SD-D6): said once, and
// looked at again a minute later. A test's App looks on the screen's thread, at once, as before (`Watch.startPolling`).

import type { Stamp } from "../../../core/foundation/platform/fsutil.ts";
import { WorkerRequestError } from "../../../core/foundation/workers/worker-requests.ts";
import { keepOperation } from "../../../core/workspace/git/branches/operation-status.ts";
import { headOf } from "../../../core/workspace/git/git.ts";
import { activityFile } from "../../../core/workspace/graph/autoindex.ts";
import { toolFiles, toolSaid } from "../../../core/workspace/links/convention.ts";
import { isInside } from "../../../core/workspace/vaults/vault.ts";
import type { GitAsker, GitSeen, Head } from "../../../core/workspace/vaults/vault-feed.ts";
import type { LookJob, PathStat, WayAnswer } from "../../../core/workspace/walk/look-jobs.ts";
import { diskThreads, type LookAnswer, type LookAsk } from "../../../core/workspace/walk/walk-thread.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { App } from "./app.ts";
import type { Polled } from "./watch.ts";

/** How long the look waits, given up on, before the next (SD-D6): a disk asleep may have woken. */
export const LOOK_AGAIN_MS = 60_000;

/** A stat's answer as a stamp; null for its error (gone, unreadable), as `stamp` has it. */
const stampOf = (s: PathStat | null | undefined): Stamp | null =>
  s && !("error" in s) ? { mtimeMs: s.mtimeMs, size: s.size } : null;

/** A stat's answer as an mtime; -1 for its error, as `mtimeOf` has it. */
const mtime = (s: PathStat | undefined): number => (s && !("error" in s) ? s.mtimeMs : -1);

/** A place as a disk thread is told it. */
const place = (loc: App["loc"]) => ({ mode: loc.mode, root: loc.root });

/** An open file looked at, and its stamp as its buffer had it then. */
type Looked = { buf: NoteBuffer; stamp: Stamp | null };

/** What one look asked, checked when it answers against what's there then (SD-D5). */
interface Asked {
  loc: App["loc"];
  /** The open files statted outright; those whose way is checked first for a link not followed (`ways`). */
  plain: Looked[];
  ways: Looked[];
  /** The answers to links as they stood (`Following.changes`). */
  links: number;
  /** The config files statted, as last loaded; the tool's settings' files (none in Elsewhere). */
  config: string[];
  tool: string[];
}

export class Look {
  /** Made on the disk threads as the explorer's listings are read there (the TUI's: `AppOptions.listOffThread`); else
   *  on the screen's thread, as before — a test's App, unless it says otherwise. */
  get offThread(): boolean {
    return this.off ?? this.app.explorer.listings.offThread;
  }
  set offThread(off: boolean) {
    this.off = off;
  }
  private off: boolean | null = null;
  /** The CLI's activity file's mtime as last found (-1: none): an agent at work holds the background index back. */
  activityAt = -1;
  /** A look asked and not answered: none other asked meanwhile. */
  private out = false;
  /** Asked for while one was out (git ran, a build): another once it's answered — of every open file, `all`. */
  private again: { all: boolean } | null = null;
  /** Given up on: no look before then (SD-D6); said once, until one answers. */
  private restAt = Number.NEGATIVE_INFINITY;
  private said = false;
  /** The tool's settings' stamps as they were last read, with their root. */
  private toolAt = "";
  /** The vault the last look was asked for: what's drawn of another's operation goes when it changes. */
  private lastLoc: App["loc"] | null = null;
  private gitAsker: GitAsker | null = null;
  /** The look out now, settled once it's taken (tests). */
  answered: Promise<void> = Promise.resolve();

  constructor(private readonly app: App) {}

  /** Each second (`watch.poll_ms`, a second at most), the first now. */
  start(): void {
    const t = setInterval(
      () => {
        if (this.app.quitting) return clearInterval(t);
        this.tick();
      },
      Math.min(this.app.config.watch.poll_ms, 1000),
    );
    (t as { unref?: () => void }).unref?.();
    this.tick();
  }

  /** The look each second: asked, unless one is out, or the last was given up on less than a minute ago. */
  tick(): void {
    if (this.out || this.app.now() < this.restAt) return;
    void this.look(false);
  }

  /** A look asked for now (git ran, a build): at once, or once the one out has answered. `all`: every open file. */
  request(all = false): void {
    if (this.out) {
      this.again = { all: all || (this.again?.all ?? false) };
      return;
    }
    void this.look(all);
  }

  /** Once no look is out (tests). */
  async settled(): Promise<void> {
    while (this.out) await this.answered;
  }

  /** HEAD looked at again, git having run (a checkout, a pull): here at once; off the screen's thread, a look asked and
   *  what moved said when it answers. True when it moved, here. */
  checkHead(): boolean {
    if (!this.offThread) return this.app.feed.checkHead();
    this.request();
    return false;
  }

  /** HEAD as drawn (SD-D13): what the look last found — before it has, what the feed saw at the start — never read as
   *  it's drawn; a test's App reads it at once. */
  head(): Head | null {
    if (!this.offThread) {
      const c = this.app.git.checkout;
      return c ? headOf(c) : null;
    }
    const s = this.app.feed.seen;
    return s ? s.head : this.app.feed.head;
  }

  /** How the feed asks git's state between looks — a batch received, git's lock waited out — off the screen's thread;
   *  null on it. */
  asker(): GitAsker | null {
    if (!this.offThread) return null;
    this.gitAsker ??= {
      git: async () => {
        const loc = this.app.loc;
        const [answer] = (await diskThreads().look({ jobs: [{ op: "git", loc: place(loc) }] })).jobs;
        const seen = (answer as { git: GitSeen }).git;
        if (this.app.loc === loc) this.keepGit(seen);
        return seen;
      },
      locked: async (lock) => {
        const [s] = await diskThreads().stat([lock], "look");
        return !!s && !("error" in s);
      },
    };
    return this.gitAsker;
  }

  private async look(all: boolean): Promise<void> {
    this.out = true;
    let done = () => {};
    this.answered = new Promise((r) => {
      done = r;
    });
    try {
      if (await this.lookOnce(all)) this.app.host.requestRender();
    } catch (err) {
      this.gaveUp(err as Error);
    } finally {
      this.out = false;
      done();
      const again = this.again;
      this.again = null;
      if (again && !this.app.quitting) void this.look(again.all);
    }
  }

  /** One look: its stats and git's state, the open files' ways; then, the config's stamps or the tool's moved, those
   *  read and parsed there. True when something changed. */
  private async lookOnce(all: boolean): Promise<boolean> {
    const app = this.app;
    if (app.loc !== this.lastLoc) {
      this.lastLoc = app.loc;
      keepOperation(app, null);
    }
    const a = this.plan(all);
    const first = await diskThreads().look(this.batchOf(a));
    if (!this.current(a)) return false;
    this.said = false;
    let changed = this.taken(a, first);
    const stats = first.stats.slice(a.plain.length);
    const config = stats.slice(0, a.config.length);
    const tool = stats.slice(a.config.length + 1);
    const known = app.settings.stamped;
    const moved = a.config.some((f, k) => mtime(config[k]) !== known.get(f));
    const toolAt = a.tool.length ? `${a.loc.root}:${tool.map(mtime).join(":")}` : "";
    const toolMoved = toolAt !== this.toolAt;
    if (!moved && !toolMoved) return changed;
    const loads = app.settings.loads;
    const jobs: LookJob[] = [];
    if (moved) {
      const configFile = app.configFile ? { configFile: app.configFile } : {};
      jobs.push({ op: "config", loc: place(a.loc), ...configFile, lastGood: [...app.settings.lastGood] });
    }
    if (toolMoved && a.tool.length) jobs.push({ op: "tool", root: a.loc.root });
    const second = jobs.length ? await diskThreads().look({ jobs }) : { jobs: [] };
    if (!this.current(a)) return changed;
    this.toolAt = toolAt;
    for (const j of second.jobs) {
      if ("config" in j && app.settings.loads === loads) app.settings.reload("file changed", j.config);
      else if ("tool" in j) app.settings.keepTool(a.loc.root, toolSaid(j.tool));
      changed = true;
    }
    return changed;
  }

  /** What one look asks: the open files no watcher sees — through the way's check where the screen's thread would check
   *  it (`Following.blocked`) — the config's files, the tool's. */
  private plan(all: boolean): Asked {
    const { loc } = this.app;
    const plain: Looked[] = [];
    const ways: Looked[] = [];
    for (const buf of this.app.watch.pollTargets(all)) {
      const checked = !buf.elsewhere && (loc.mode === "folder" || isInside(loc.root, buf.abs));
      (checked ? ways : plain).push({ buf, stamp: buf.stamp });
    }
    const config = [...this.app.settings.stamped.keys()];
    const tool = loc.mode === "folder" ? [] : toolFiles(loc.root);
    return { loc, plain, ways, links: this.app.following.changes, config, tool };
  }

  /** One batch: a stat of every path (the files, the config's, the activity file, the tool's), git's state, the ways. */
  private batchOf(a: Asked): LookAsk {
    const { loc } = a;
    const jobs: LookJob[] = [{ op: "git", loc: place(loc) }];
    if (a.ways.length) {
      const at = { ...place(loc), ...(loc.workDir ? { workDir: loc.workDir } : {}) };
      const looking = [...this.app.following.looking];
      jobs.push({ op: "way", place: at, looking, paths: a.ways.map((w) => w.buf.abs) });
    }
    const paths = [...a.plain.map((p) => p.buf.abs), ...a.config, activityFile(), ...a.tool];
    return { stat: { paths }, jobs };
  }

  /** Whether an answer is for what's open now: the vault it was asked for, the TUI not quitting. */
  private current(a: Asked): boolean {
    return this.app.loc === a.loc && !this.app.quitting;
  }

  /** The first answer taken: git's state kept and HEAD decided, the activity file's stamp, the open files' — each only
   *  while its buffer is open and as it was, its way only while the answers to links are. */
  private taken(a: Asked, first: LookAnswer): boolean {
    const app = this.app;
    this.keepGit((first.jobs[0] as { git: GitSeen }).git);
    this.activityAt = mtime(first.stats[a.plain.length + a.config.length]);
    const open = new Set(app.buffers.values());
    const still = (l: Looked) => open.has(l.buf) && l.buf.stamp === l.stamp;
    const seen: Polled[] = [];
    a.plain.forEach((l, k) => {
      if (still(l)) seen.push({ buf: l.buf, at: stampOf(first.stats[k]) });
    });
    const ways = a.ways.length ? (first.jobs[1] as { ways: WayAnswer[] }).ways : [];
    if (app.following.changes === a.links)
      a.ways.forEach((l, k) => {
        const w = ways[k];
        if (w && !w.blocked && still(l)) seen.push({ buf: l.buf, at: stampOf(w.stat) });
      });
    let changed = app.watch.polled(seen);
    // HEAD moved without a file changing with it (5.9): a switch between branches alike.
    if (app.feed.checkHead()) changed = true;
    return changed;
  }

  /** Git's state as a disk thread found it, kept: what the feed decides by, the checkout, what's drawn. */
  private keepGit(seen: GitSeen): void {
    this.app.feed.saw(seen);
    this.app.git.reads.took(this.app.loc.root, seen.checkout);
    keepOperation(this.app, seen.operation);
  }

  /** The look given up on (SD-D6): said once, until one answers; the next a minute later. Quitting: nothing. */
  private gaveUp(err: Error): void {
    const kind = err instanceof WorkerRequestError ? err.kind : null;
    if (this.app.quitting || kind === "stopped") return;
    this.restAt = this.app.now() + LOOK_AGAIN_MS;
    if (this.said) return;
    this.said = true;
    this.app.message(
      "warn",
      "⚠ disk not answering: your config, git and the open files weren't read in time — looked at again in a minute",
    );
    this.app.host.requestRender();
  }
}
