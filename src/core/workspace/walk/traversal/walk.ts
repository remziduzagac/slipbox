// Whole, sliced and single-directory walks over the same traversal rules.

import { type Dirent, lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WalkFilter } from "../filtering/filter.ts";
import type { WalkCap, WalkLimits, WalkResult } from "../contracts.ts";
import { type WalkState, finishWalk, startWalk } from "./state.ts";
import { listDir } from "./listing.ts";
import { RELIST, parentOf } from "../io/stamps.ts";

export function walkVault(root: string, filter: WalkFilter): WalkResult {
  const st = startWalk(root, filter);
  const visit = (rel: string) => listDir(st, rel, visit);
  visit("");
  return finishWalk(st);
}

/**
 * Home's cap (VV-D2): its index holds this many notes at most, and its walk lists this many folders — and this many of
 * its other files, for a link to name one (those past it are left unlisted: the walk goes on for notes).
 */
export const HOME_LIMITS = { notes: 10_000, folders: 5_000, assets: 10_000 } as const;

/**
 * A walk made a slice at a time (VV-D2: home's, while nobody is working), breadth first — the folders nearest the top
 * before deeper ones, so a cap leaves out the deepest — as far as `limits` allows. `step` works for a while; `result`
 * is the walk once it's done, `capped` what stopped it short. Each folder listed is stamped (`times`), for home's
 * walk kept to tell one changed since.
 */
export class SlicedWalk {
  private readonly st: WalkState;
  private readonly queue: string[];
  private next = 0;
  private done: WalkResult | null = null;
  capped: WalkCap | null = null;

  /** `from`: the folders to list, the top by default — a walk going on from another, whose mount table it takes;
   *  `known`: folders walked already, never gone into again; `stamped: false`, for a walk never kept: no stamps. */
  constructor(
    root: string,
    filter: WalkFilter,
    readonly limits: WalkLimits = HOME_LIMITS,
    private readonly opts: { from?: string[]; known?: ReadonlySet<string>; stamped?: boolean } = {},
  ) {
    const { stamped = true } = opts;
    this.st = startWalk(root, filter, { sorted: true, maxAssets: limits.assets, mounts: !opts.from, stamped });
    this.queue = [...(opts.from ?? [""])];
  }

  /** Folders listed so far. */
  get folders(): number {
    return this.st.out.dirs.length;
  }

  /** The walk, once it's done; null until then. */
  get result(): WalkResult | null {
    return this.done;
  }

  /** Work for up to `budgetMs`, a folder at least; false once the walk is done. */
  step(budgetMs: number): boolean {
    if (this.done) return false;
    const end = performance.now() + budgetMs;
    const out = this.st.out;
    do {
      if (this.next >= this.queue.length) return this.finish(null);
      if (out.dirs.length >= this.limits.folders) return this.finish("folders");
      const dir = this.queue[this.next++]!;
      const listed = out.dirs.length;
      listDir(this.st, dir, (rel) => {
        if (!this.opts.known?.has(rel)) this.queue.push(rel);
      });
      // One that couldn't be read isn't in the walk: the folder holding it stamped to list again, so it's tried again
      // at each build till it can be read — a chmod moves no time the walk keeps (#12). Not one the walk had: that one
      // is to list again itself.
      if (out.times && dir && out.dirs.length === listed && !this.opts.known?.has(dir) && out.times.has(parentOf(dir)))
        out.times.set(parentOf(dir), RELIST);
      // Past the cap, not at it: a walk of exactly so many notes left nothing out.
      if (out.files.length > this.limits.notes) {
        out.files.length = this.limits.notes;
        return this.finish("notes");
      }
    } while (performance.now() < end);
    return true;
  }

  /** The folders a cap left unlisted: found, not looked into. */
  rest(): string[] {
    return this.queue.slice(this.next);
  }

  private finish(cap: WalkCap | null): false {
    this.capped = cap;
    this.done = finishWalk(this.st);
    return false;
  }
}

/**
 * A folder's top alone (VV-D2: home, not walked yet): its notes and files, the vaults in it; its folders listed, not
 * looked into.
 */
export function walkTop(root: string, filter: WalkFilter): WalkResult {
  const st = startWalk(root, filter, { sorted: true });
  listDir(st, "", (rel) => st.out.dirs.push(rel));
  return finishWalk(st);
}

/** Single-file mode: only the notes directly in one directory. */
export function listDirectory(dir: string, filter: WalkFilter): WalkResult {
  const result: WalkResult = { files: [], assets: [], dirs: [""], skipped: [], errors: [] };
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    result.errors.push(`${dir}: ${(err as Error).message}`);
  }
  for (const e of entries) {
    if (!filter.isNoteName(e.name) || filter.exclusion(e.name, false) !== null) continue;
    const abs = join(dir, e.name);
    try {
      const st = lstatSync(abs).isSymbolicLink() ? statSync(abs) : lstatSync(abs);
      if (!st.isFile()) continue;
      if (st.size > filter.maxFileSize) {
        result.skipped.push({ rel: e.name, reason: `larger than walk.max_file_size (${st.size} bytes)` });
        continue;
      }
      result.files.push({ rel: e.name, abs, size: st.size, mtimeMs: st.mtimeMs });
    } catch {}
  }
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return result;
}
