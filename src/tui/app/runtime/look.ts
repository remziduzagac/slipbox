// The TUI's look each second (5.1–5.4, 5.9, 5.10, 20.9; SD-T4): what no watcher sees — the open files it doesn't watch,
// your config and the vault's, git's state where the vault is, the CLI's activity file, the root's tool's settings —
// asked of a disk thread (SD-D2) as one request, one look out at a time: a tick while one is out asks nothing (SD-D3).
// What it finds is taken when it comes, against what's there then (SD-D5): all of it dropped for a vault left
// meanwhile, a file's stamp for a buffer closed, saved or read again since, a way checked before a link was answered,
// git's state asked before what's kept was (`askGit`). What's drawn of git and the tool's settings are what it last
// found (SD-D13), never read as they're drawn. Given up on (SD-D6): said once, and nothing asked for a minute — a look
// asked for meanwhile kept for then. A test's App looks on the screen's thread, at once, as before
// (`Watch.startPolling`).

import type { Stamp } from "../../../core/foundation/platform/fsutil.ts";
import { WorkerRequestError } from "../../../core/foundation/workers/worker-requests.ts";
import { askGit, keepOperation } from "../../../core/workspace/git/branches/operation-status.ts";
import { headOf } from "../../../core/workspace/git/git.ts";
import { activityFile } from "../../../core/workspace/graph/autoindex.ts";
import { toolFiles, toolSaid } from "../../../core/workspace/links/convention.ts";
import { type LinksStamp, lookAfterLinks, tookLinks } from "../../../core/workspace/vaults/symlinks.ts";
import { isInside } from "../../../core/workspace/vaults/vault.ts";
import type { GitAsker, GitSeen, Head } from "../../../core/workspace/vaults/vault-feed.ts";
import type { PathStat } from "../../../core/workspace/walk/io/stamps.ts";
import type { LookJob, WayAnswer } from "../../../core/workspace/walk/look-jobs.ts";
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

/** A tool's folder as its stamp has it: there or not, never its mtime (`toolFiles`). */
const there = (s: PathStat | undefined): string => (s && !("error" in s) && s.kind === "dir" ? "dir" : "none");

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
  tool: { path: string; folder: boolean }[];
  /** The answers kept for links followed: their file, its mtime as kept, the answers written here by then (SD-T9). */
  answers: LinksStamp;
}

/** A look asked for and not yet taken by one: of every open file (`all`), and what waits for its answer. */
type Wanted = { all: boolean; waiters: (() => void)[] };

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
  /** The CLI's activity file's mtime as last found (-1: none): an agent at work holds the background index back. Null:
   *  not known — no look has answered yet, or the last was given up on. */
  activityAt: number | null = null;
  /** A look asked and not answered: none other asked meanwhile. */
  private out = false;
  /** Asked for while one was out, or while the look rests (git ran, a build): asked once it may be. */
  private wanted: Wanted | null = null;
  /** Given up on: no look before then (SD-D6). */
  private restAt = Number.NEGATIVE_INFINITY;
  /** Given up on, and none answered since: said once, and `⚠ disk not answering` on the status line with the
   *  watcher's (`Watch.notAnswering`). */
  notAnswering = false;
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

  /** The look each second: asked, with any asked for meanwhile, unless one is out, or the last was given up on less
   *  than a minute ago. */
  tick(): void {
    if (this.out || this.resting()) return;
    this.wanted ??= { all: false, waiters: [] };
    this.next();
  }

  /** A look asked for now (git ran, a build), `all`: of every open file. Asked at once; or once the one out has
   *  answered; or, the look given up on, once its minute is over (SD-D6). Settled once that look has answered or been
   *  given up on. */
  request(all = false): Promise<void> {
    return new Promise((done) => {
      const w = (this.wanted ??= { all: false, waiters: [] });
      w.all ||= all;
      w.waiters.push(done);
      this.next();
    });
  }

  /** Once no look is out (tests). */
  async settled(): Promise<void> {
    while (this.out) await this.answered;
  }

  /** HEAD looked at again, git having run (a checkout, a pull, a merge): settled once it's seen and a move said and
   *  done (`headMoved`). Here at once; off the screen's thread, once the look asked for it has answered. So what the key
   *  does next comes after it, as on the screen's thread. */
  async checkHead(): Promise<void> {
    if (!this.offThread) {
      this.app.feed.checkHead();
      return;
    }
    await this.request();
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
    // Given up on, its minute not over (SD-D6): nothing asked — the feed applies its batches as git was last seen.
    this.gitAsker ??= {
      git: async (asked) => {
        if (this.resting()) throw new Error("the look given up on: asked again in a minute");
        const loc = this.app.loc;
        const [answer] = (await diskThreads().look({ jobs: [{ op: "git", loc: place(loc) }], background: true })).jobs;
        const seen = (answer as { git: GitSeen }).git;
        if (this.app.loc === loc) this.keepGit(seen, asked);
        return seen;
      },
      locked: async (lock) => {
        if (this.resting()) return false;
        const [s] = (await diskThreads().look({ stat: { paths: [lock] }, background: true })).stats;
        return !!s && !("error" in s);
      },
    };
    return this.gitAsker;
  }

  /** Given up on less than a minute ago (SD-D6): nothing asked of the disk till then. */
  private resting(): boolean {
    return this.app.now() < this.restAt;
  }

  /** What's wanted, asked now — unless a look is out, or the look rests: then once it may be. */
  private next(): void {
    const w = this.wanted;
    if (!w || this.out || this.resting() || this.app.quitting) return;
    this.wanted = null;
    void this.look(w);
  }

  private async look(w: Wanted): Promise<void> {
    this.out = true;
    let done = () => {};
    this.answered = new Promise((r) => {
      done = r;
    });
    try {
      if (await this.lookOnce(w.all)) this.app.host.requestRender();
    } catch (err) {
      this.gaveUp(err as Error);
    } finally {
      this.out = false;
      done();
      for (const settle of w.waiters) settle();
      this.next();
    }
  }

  /** One look: its stats and git's state, the open files' ways; then, the config's stamps, the tool's or the answers'
   *  kept for links moved, those read and parsed there. True when something changed. */
  private async lookOnce(all: boolean): Promise<boolean> {
    const app = this.app;
    if (app.loc !== this.lastLoc) {
      this.lastLoc = app.loc;
      keepOperation(app, null, askGit());
    }
    const a = this.plan(all);
    const asked = askGit();
    const first = await diskThreads().look(this.batchOf(a));
    // The disk answered: the status line's warning goes (with the watcher's, if that one answers too).
    const cleared = this.notAnswering;
    this.notAnswering = false;
    if (!this.current(a)) return cleared;
    let changed = this.taken(a, first, asked) || cleared;
    const stats = first.stats.slice(a.plain.length);
    const config = stats.slice(0, a.config.length);
    const answersAt = mtime(stats[a.config.length + 1]);
    const tool = stats.slice(a.config.length + 2);
    const known = app.settings.stamped;
    const moved = a.config.some((f, k) => mtime(config[k]) !== known.get(f));
    const stamps = tool.map((s, k) => (a.tool[k]?.folder ? there(s) : mtime(s)));
    const toolAt = a.tool.length ? `${a.loc.root}:${stamps.join(":")}` : "";
    const toolMoved = toolAt !== this.toolAt;
    const answersMoved = !Object.is(answersAt, a.answers.mtime);
    if (!moved && !toolMoved && !answersMoved) return changed;
    const loads = app.settings.loads;
    const jobs: LookJob[] = [];
    if (moved) {
      const configFile = app.configFile ? { configFile: app.configFile } : {};
      jobs.push({ op: "config", loc: place(a.loc), ...configFile, lastGood: [...app.settings.lastGood] });
    }
    if (toolMoved && a.tool.length) jobs.push({ op: "tool", root: a.loc.root });
    if (answersMoved) jobs.push({ op: "links" });
    const second = jobs.length ? await diskThreads().look({ jobs, background: true }) : { jobs: [] };
    if (!this.current(a)) return changed;
    this.toolAt = toolAt;
    for (const j of second.jobs) {
      if ("config" in j && app.settings.loads === loads) app.settings.reload("file changed", j.config);
      else if ("tool" in j) app.settings.keepTool(a.loc.root, toolSaid(j.tool));
      else if ("links" in j) tookLinks(j.links, a.answers);
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
    return { loc, plain, ways, links: this.app.following.changes, config, tool, answers: lookAfterLinks() };
  }

  /** One batch, one request: git's state, the ways, and a stat of every path (the files, the config's, the activity
   *  file, the tool's) — in the background, as the watcher's are, so the two never hold both threads (SD-D2). */
  private batchOf(a: Asked): LookAsk {
    const { loc } = a;
    const jobs: LookJob[] = [{ op: "git", loc: place(loc) }];
    if (a.ways.length) {
      const at = { ...place(loc), ...(loc.workDir ? { workDir: loc.workDir } : {}) };
      const looking = [...this.app.following.looking];
      jobs.push({ op: "way", place: at, looking, paths: a.ways.map((w) => w.buf.abs) });
    }
    const paths = [
      ...a.plain.map((p) => p.buf.abs),
      ...a.config,
      activityFile(),
      a.answers.file,
      ...a.tool.map((t) => t.path),
    ];
    return { stat: { paths }, jobs, background: true };
  }

  /** Whether an answer is for what's open now: the vault it was asked for, the TUI not quitting. */
  private current(a: Asked): boolean {
    return this.app.loc === a.loc && !this.app.quitting;
  }

  /** The first answer taken: git's state kept, unless one asked after it is (`asked`), and HEAD decided; the activity
   *  file's stamp; the open files' — each only while its buffer is open and as it was, its way only while the answers
   *  to links are. */
  private taken(a: Asked, first: LookAnswer, asked: number): boolean {
    const app = this.app;
    this.keepGit((first.jobs[0] as { git: GitSeen }).git, asked);
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

  /** Git's state as a disk thread found it, kept: what the feed decides by, the checkout, what's drawn — unless what's
   *  kept answered a question asked after this one (`asked`): answers can come in another order than asked. */
  private keepGit(seen: GitSeen, asked: number): void {
    if (!this.app.feed.saw(seen, asked)) return;
    this.app.git.reads.took(this.app.loc.root, seen.checkout);
    keepOperation(this.app, seen.operation, asked);
  }

  /** The look given up on (SD-D6): said once, and on the status line, until one answers; the next a minute later, the
   *  activity file's stamp unknown till then. Quitting: nothing. */
  private gaveUp(err: Error): void {
    const kind = err instanceof WorkerRequestError ? err.kind : null;
    if (this.app.quitting || kind === "stopped") return;
    this.restAt = this.app.now() + LOOK_AGAIN_MS;
    this.activityAt = null;
    if (this.notAnswering) return;
    this.notAnswering = true;
    this.app.message(
      "warn",
      "disk not answering: the look at your config, git and the open files gave up; it looks again in a minute",
    );
    this.app.host.requestRender();
  }
}
