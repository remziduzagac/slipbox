// The background auto-index (plan 20.9; docs/idea.md, "The index"): the home folder walked slowly, a
// folder at a time, for the vaults in it — each recorded in the machine's list and its index built,
// so links from vaults never opened count as backlinks (17.11) by themselves. The work is done in
// slices, only when asked (the TUI asks while nobody is working), and its place is kept, so it
// resumes where it stopped. A pass done, the next starts a day later.

import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import { readJson, writeJson, ensureDir } from "./fsutil.ts";
import { Graph } from "./graph.ts";
import { stateHome } from "./paths.ts";
import { noteIndexed, readRegistry, writeRegistry } from "./registry.ts";
import { configFilesFor, isNeverRoot, isVaultRoot, rootAt } from "./vault.ts";

/** Folders the walk of the home folder never goes into: tools' and caches', and every hidden one. */
const SKIPPED = new Set(["node_modules", "venv", "__pycache__"]);

/** A pass finished: the next starts this long after. */
export const REPASS_MS = 24 * 60 * 60 * 1000;

export interface AutoIndexProgress {
  version: 1;
  /** The folder walked: the home folder. */
  root: string;
  /** Folders still to look in, in order. */
  queue: string[];
  /** The vault whose index is being built, if one is. */
  current: string | null;
  found: number;
  indexed: number;
  passStarted: string | null;
  passFinished: string | null;
}

export function autoIndexFile(): string {
  return join(stateHome(), "autoindex.json");
}

function fresh(root: string): AutoIndexProgress {
  return { version: 1, root, queue: [], current: null, found: 0, indexed: 0, passStarted: null, passFinished: null };
}

export class AutoIndex {
  private progress: AutoIndexProgress;
  private graph: Graph | null = null;

  constructor(
    readonly root: string,
    private readonly file = autoIndexFile(),
    private readonly now = () => Date.now(),
  ) {
    const kept = readJson<AutoIndexProgress | null>(file, null);
    this.progress = kept?.version === 1 && kept.root === root && Array.isArray(kept.queue) ? kept : fresh(root);
  }

  /** Where it is: folders left, vaults found and indexed this pass, whether the pass is done. */
  get status(): Readonly<AutoIndexProgress> {
    return this.progress;
  }

  /** Nothing to do until the next pass is due. */
  get idle(): boolean {
    const p = this.progress;
    return !!p.passFinished && this.now() - Date.parse(p.passFinished) < REPASS_MS;
  }

  /** Work for up to `budgetMs`; false when the pass is done (or none is due). The place is kept. */
  step(budgetMs: number): boolean {
    if (this.idle) return false;
    const end = performance.now() + budgetMs;
    const p = this.progress;
    if (!p.passStarted || p.passFinished) Object.assign(p, fresh(this.root), { queue: [this.root], passStarted: new Date(this.now()).toISOString() });
    try {
      while (performance.now() < end) {
        // A vault's index, built a slice at a time; done, the vaults nested in it are next.
        if (p.current) {
          this.graph ??= this.open(p.current);
          if (this.graph && this.graph.parseSome(Math.max(1, end - performance.now()))) return true;
          if (this.graph) {
            p.indexed++;
            for (const s of this.graph.skipped) if (s.reason === "nested vault") p.queue.unshift(join(p.current, s.rel));
            this.markIndexed(p.current);
          }
          this.graph = null;
          p.current = null;
          continue;
        }
        const dir = p.queue.shift();
        if (dir === undefined) {
          p.passFinished = new Date(this.now()).toISOString();
          return false;
        }
        if (dir !== this.root && isVaultRoot(dir)) {
          p.current = dir;
          p.found++;
          continue;
        }
        let entries: Dirent[] = [];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        const under: string[] = [];
        for (const e of entries) {
          if (!e.isDirectory() || e.name.startsWith(".") || SKIPPED.has(e.name)) continue;
          if (dir === this.root && e.name === "Library" && process.platform === "darwin") continue;
          const abs = join(dir, e.name);
          if (!isNeverRoot(abs)) under.push(abs);
        }
        p.queue.unshift(...under.sort());
      }
      return true;
    } finally {
      this.save();
    }
  }

  /** The vault at `root`, its index read and refreshed lazily; recorded as found, not opened. */
  private open(root: string): Graph | null {
    const had = readRegistry().some((v) => v.kind === "vault" && v.path === root);
    try {
      const loc = rootAt(root);
      if (!had) this.markFound(loc.key);
      return new Graph(loc, loadConfig({ ...configFilesFor(loc) }).config).build(true, "lazy");
    } catch {
      return null;
    }
  }

  /** A vault the auto-index found: listed after those opened, until it's opened itself. */
  private markFound(key: string): void {
    const list = readRegistry();
    const v = list.find((x) => x.key === key);
    if (!v || v.found) return;
    v.found = true;
    writeRegistry(list);
  }

  private markIndexed(root: string): void {
    const v = readRegistry().find((x) => x.kind === "vault" && x.path === root);
    if (v) noteIndexed(v.key, new Date(this.now()));
  }

  private save(): void {
    try {
      ensureDir(stateHome());
      writeJson(this.file, this.progress);
    } catch {}
  }
}

/** When an agent last ran a command (the CLI notes it): the auto-index waits while one works. */
export function activityFile(): string {
  return join(stateHome(), "activity");
}

/** The background auto-index of the home folder (20.9), as far as it's got: off, a pass done, or folders left. */
export function backgroundStatus(config: Pick<Config, "index">): { on: boolean; found: number; indexed: number; left: number; finished: string | null; started: string | null } {
  const p = readJson<{ queue?: string[]; current?: string | null; found?: number; indexed?: number; passFinished?: string | null; passStarted?: string | null } | null>(autoIndexFile(), null);
  return { on: config.index.background, found: p?.found ?? 0, indexed: p?.indexed ?? 0, left: (p?.queue?.length ?? 0) + (p?.current ? 1 : 0), finished: p?.passFinished ?? null, started: p?.passStarted ?? null };
}

/** Where the background auto-index is, in words (`info`, `space v i`). */
export function describeBackground(b: ReturnType<typeof backgroundStatus>): string {
  if (!b.on) return "background index off ([index] background)";
  if (!b.started) return "background index not started yet";
  if (b.finished) return `background index: pass done ${b.finished.slice(0, 16).replace("T", " ")} — ${b.found} vault${b.found === 1 ? "" : "s"} found`;
  return `background index: ${b.found} vault${b.found === 1 ? "" : "s"} found so far, ${b.left} folder${b.left === 1 ? "" : "s"} left`;
}
