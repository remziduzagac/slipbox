// Directory registration/admission and attachment tracking through live watcher capabilities.
import { type Dirent, existsSync, readdirSync, statSync, watch } from "node:fs";
import { join, relative, sep } from "node:path";
import { under } from "../../vaults/home/paths.ts";
import { parentOf, settled } from "../../walk/io/stamps.ts";
import { symlinkVerdict } from "../../walk/traversal/symlinks.ts";
import type { DirectoryOptions, DirectoryState, DirectoryHost } from "./contracts.ts";
import { every, dirMtime } from "./io.ts";
export class WatchDirectories {
  constructor(
    private readonly opts: DirectoryOptions,
    private readonly state: DirectoryState,
    private readonly realRoot: string,
    private readonly host: DirectoryHost,
  ) {}
  gitignoreStamp(dirRel: string): number {
    try {
      return statSync(join(this.opts.root, dirRel, ".gitignore")).mtimeMs;
    } catch {
      return -1;
    }
  }

  unwatchTree(dirRel: string): void {
    for (const [d, w] of this.state.watchers) {
      if (d === dirRel || d.startsWith(`${dirRel}/`)) {
        w.close();
        this.state.watchers.delete(d);
        this.state.gitignores.delete(d);
        this.state.stamps.delete(d);
      }
    }
    for (const d of this.state.polled) if (d === dirRel || d.startsWith(`${dirRel}/`)) this.state.polled.delete(d);
  }

  /** Watch a directory that appeared (created, or moved in with its contents) and everything
   *  below it; return the files already inside — notes and attachments — which are new to us. */
  adoptTree(dirRel: string): string[] {
    const files: string[] = [];
    const max = this.opts.maxDirs ?? Number.POSITIVE_INFINITY;
    const visit = (d: string) => {
      // Past home's cap (VV-D2): left to its walk, never listed here.
      if (this.state.watchers.size + this.state.polled.size >= max) return;
      this.watchDir(d);
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(this.opts.root, d), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) {
          if (this.opts.filter.exclusion(rel, true) === null) visit(rel);
        } else if (e.isSymbolicLink() && !this.symlinkKept(rel)) continue;
        else if (this.opts.filter.exclusion(rel, false) === null) files.push(rel);
      }
    };
    visit(dirRel);
    return files;
  }

  /**
   * Whether the symlink at `rel` is one the walk keeps (0.11, VV-D6), and as what: a file inside the root that isn't a
   * note already known by its own path, or one outside you follow (`"file"`); a folder outside you follow (`"dir"`),
   * watched as the walk walks it; else null — a folder within the root (a second name), a link not followed.
   */
  symlinkKept(rel: string): "file" | "dir" | null {
    const v = symlinkVerdict(join(this.opts.root, rel), this.realRoot);
    if (!v.kept) return null;
    if (v.dir) return "dir";
    const target = relative(this.realRoot, v.target).split(sep).join("/");
    return target === rel || !this.opts.known.has(target) ? "file" : null;
  }

  /**
   * What becomes of a folder found that isn't watched: taken in with all it holds (`adopt`); or, a walk's to look into
   * (`leftToWalk`), left — come into a folder looked into (home's top), named once in a batch for the graph to list it
   * (`ask`, `WatchBatch.toWalk`), within home's cap; in one left to the walk itself, named already, or with watching
   * degraded, nothing more (`leave`): the walk takes it with the rest.
   */
  found(dirRel: string): "adopt" | "ask" | "leave" {
    const walks = this.opts.leftToWalk;
    if (!walks?.(dirRel)) return "adopt";
    if (walks(parentOf(dirRel)) || this.state.left.get(dirRel) || this.host.degraded) return "leave";
    return this.room() > 0 ? "ask" : "leave";
  }

  /** How many more folders home's cap (`maxDirs`) lets it watch: those named and not watched yet count already. */
  room(): number {
    let n = this.state.watchers.size + this.state.polled.size;
    for (const [d, named] of this.state.left)
      if (named && !this.state.watchers.has(d) && !this.state.polled.has(d)) n++;
    return (this.opts.maxDirs ?? Number.POSITIVE_INFINITY) - n;
  }

  /** A folder found and left to the walk: named for it (`found`'s `ask`) or not, kept (`left`). */
  leave(dirRel: string, to: "ask" | "leave"): void {
    if (to === "ask") this.state.toWalk.add(dirRel);
    if (to === "ask" || !this.state.left.has(dirRel)) this.state.left.set(dirRel, to === "ask");
  }

  /** A folder left to the walk, gone or taken: forgotten, with the folders in it — found again, it's new. */
  forget(dirRel: string): void {
    for (const d of this.state.left.keys()) if (under(d, dirRel)) this.state.left.delete(d);
    for (const d of this.state.leftSeen.keys()) if (under(d, dirRel)) this.state.leftSeen.delete(d);
  }

  /**
   * The folders a batch named for the walk (`WatchBatch.toWalk`), as the graph took them: those it listed (`listed`)
   * watched, closing none (`sync` watches exactly what it's given), within home's cap — what changed in them since the
   * graph's walk listed on the next tick. Each is forgotten, to be named again if it's found again unwatched.
   */
  watchNamed(dirs: readonly string[], listed: (dirRel: string) => boolean): void {
    const walkedAt = this.opts.walkedAt?.() ?? Date.now();
    const max = this.opts.maxDirs ?? Number.POSITIVE_INFINITY;
    for (const d of dirs) {
      this.state.left.delete(d);
      if (listed(d) && this.state.watchers.size + this.state.polled.size < max) this.watchDir(d, walkedAt);
    }
  }

  /** Watch a directory whose contents were read at `readAt` (the walk's, or a listing about to be). */
  watchDir(dirRel: string, readAt = Date.now()): void {
    if (this.state.watchers.has(dirRel) || this.host.degraded) return;
    try {
      const w = watch(join(this.opts.root, dirRel), { persistent: false }, (_event, name) => {
        if (!name) {
          this.state.rescan = true;
          this.host.schedule();
          return;
        }
        const rel = dirRel ? `${dirRel}/${name.toString()}` : name.toString();
        this.state.pending.add(rel);
        this.host.schedule();
      });
      w.on("error", (err) => {
        w.close();
        this.state.watchers.delete(dirRel);
        // Gone: a parent event reports the deletion. Still there: never go quiet — poll it.
        if (existsSync(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
      });
      this.state.watchers.set(dirRel, w);
      this.state.gitignores.set(dirRel, this.gitignoreStamp(dirRel));
      this.state.stamps.set(dirRel, settled(dirMtime(join(this.opts.root, dirRel)), readAt));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EMFILE" || code === "ENFILE")
        this.host.degrade(
          `${code}: the system watch limit is exhausted (${this.state.watchers.size} directories watched)`,
        );
      else if (existsSync(join(this.opts.root, dirRel))) this.pollDir(dirRel, (err as Error).message);
    }
  }

  pollDir(dirRel: string, reason: string): void {
    if (this.state.closed || this.state.polled.has(dirRel)) return;
    this.state.polled.add(dirRel);
    this.opts.onWarn?.(
      `cannot watch ${dirRel || "the vault's top folder"} (${reason.split("\n")[0]}) — polling it every ${every(this.opts.pollMs ?? 2000)} instead`,
    );
    this.host.ensurePollTimer();
  }

  /** Keep an attachment known as there, or not. */
  attachment(rel: string, there: boolean): void {
    const dir = parentOf(rel);
    const inDir = this.state.attachments.get(dir);
    if (there) {
      if (inDir) inDir.add(rel);
      else this.state.attachments.set(dir, new Set([rel]));
    } else if (inDir?.delete(rel) && !inDir.size) this.state.attachments.delete(dir);
  }
}
