// What a disk thread judges with the watcher's reads (SD-D8, SD-T3): each path the settle stats and each entry a
// listing finds, as the walk judges it — its filter (`exclusion`: a nested vault's marker, a busy folder's note at its
// top, a `.gitignore`) and a link's verdict (`symlinkVerdict`) — a folder taken in (`adopting`'s, a folder at a time),
// and where notes that went have gone (`movedTo`'s): read and decided where they're read, so none of it waits on the
// screen's thread. The filter it judges by is made once on each thread and kept (`judgeContextFor`). What the watcher knows — its stamps, its notes, its own writes — stays there (SD-D8): this decides
// only what the disk says, and the watcher, when the answer comes, what it means now. The same code answers a test's
// watcher at once, on the thread that asks (`watch/reads.ts`).

import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import * as disk from "../../../foundation/platform/disk.ts";
import { walksInto } from "../../vaults/home/paths.ts";
import type { FilterSettings } from "../../walk/contracts.ts";
import { filterFrom, type WalkFilter } from "../../walk/filtering/filter.ts";
import { codeOf, type PathStat, parentOf, SETTLE_MS, statOf } from "../../walk/io/stamps.ts";
import { symlinkVerdict } from "../../walk/traversal/symlinks.ts";
import { changedAt, isSymlink, statOrNull } from "./io.ts";
import type { Went } from "./state.ts";

/** What the watcher's reads are judged by, made where they're read: the walk's filter, the root and its real path. */
export interface JudgeContext {
  filter: WalkFilter;
  root: string;
  realRoot: string;
}

/** The context the filter's settings make, on the thread that reads (the links' rules come with `walkContext`). */
export function judgeContext(settings: FilterSettings): JudgeContext {
  let realRoot = settings.root;
  try {
    realRoot = disk.realpath(settings.root);
  } catch {}
  return { filter: filterFrom(settings), root: settings.root, realRoot };
}

/** What a watcher's reads are judged by, as a disk thread is asked it: the walk's filter's settings, and its epoch
 *  (`WalkFilter.epoch`: what it read of the disk dropped or read again). */
export interface JudgeBy {
  filter: FilterSettings;
  epoch: number;
}

/** The context last made on this thread, and what it was made of. */
let kept: { key: string; ctx: JudgeContext } | null = null;

/** The context `by` makes, kept on this thread while the same is asked — never one made per request, which would read
 *  the mount table (macOS: `/sbin/mount`) and each `.gitignore` again — and made again once the settings or the epoch
 *  change: a `.gitignore` the watcher saw change, the mount table read again. */
export function judgeContextFor(by: JudgeBy): JudgeContext {
  const key = JSON.stringify([by.filter, by.epoch]);
  if (kept?.key !== key) kept = { key, ctx: judgeContext(by.filter) };
  return kept.ctx;
}

/** A link's verdict (`symlinkVerdict`), as the watcher keeps it: not kept; or kept, a folder or a file — a file with
 *  its target's path in the root, which the watcher holds against the notes it knows (`symlinkKept`). */
export type LinkKept = { kept: false } | { kept: true; dir: boolean; target: string };

/** What the settle asked of a path, beside its stat: a link's verdict, when it's one; why the walk leaves it out as a
 *  folder, when it's one, and as a file, when it isn't — or is a link the walk doesn't keep. */
export interface PathVerdict {
  link?: LinkKept;
  dir?: string | null;
  file?: string | null;
}

/** A listing's entry: its kind as the listing says (a link's own); why the walk leaves it out (a folder as a folder,
 *  unless skipped); a link's verdict; a note's mtime, its links followed (null: it couldn't be statted). */
export interface JudgedEntry {
  name: string;
  kind: "dir" | "link" | "file" | "other";
  excluded?: string | null;
  link?: LinkKept;
  mtimeMs?: number | null;
}

/** How a folder's entries are judged: the folders not to (`skip`, by name, those watched already; null, none is), only
 *  the notes (`notesOnly`), each note statted (`stat`), each link given its verdict (`links`). */
export interface EntriesHow {
  skip: string[] | null;
  notesOnly: boolean;
  stat: boolean;
  links: boolean;
}

/** Where notes that went may have gone, for one folder: whether it was found in this batch (`fresh`), the notes that
 *  went and the folders that went with theirs, the files known in the folder (`attachments`), the watcher's tick. */
export interface MovedHow {
  fresh: boolean;
  went: Went[];
  gone: { dir: string; files: string[] }[];
  attachments: string[];
  pollMs: number;
}

/** What a watcher's listing is for: its entries judged, the folder taken in (`adopt`), or where notes that went have
 *  gone in it. */
export type ListHow = { entries: EntriesHow } | { adopt: true } | { moved: MovedHow };

/** A watcher's listing, as the disk threads are asked it: how it's judged by the walk's filter. */
export interface ListJudge extends JudgeBy {
  how: ListHow;
}

/** A folder's entries judged: when it was listed (before), and why it couldn't be (its error's code). */
export interface JudgedFolder {
  how: "entries";
  at: number;
  error: string | null;
  entries: JudgedEntry[];
}

/** A folder taken in: stamped just before it was listed (`at`; its stat, its `.gitignore`'s), the files the walk takes
 *  in it (a link with its verdict), and the folders in it the walk goes into, each taken in by a listing of its own. */
export interface AdoptedFolder {
  how: "adopt";
  at: number;
  stat: PathStat;
  gitignore: PathStat;
  dirs: string[];
  files: { rel: string; link?: LinkKept }[];
}

/** Where notes that went are now, in one folder. */
export interface MovedInto {
  how: "moved";
  there: string[];
}

export type JudgedListing = JudgedFolder | AdoptedFolder | MovedInto;

/** `abs` as the root's path for it, `/`-separated (`""`: the root). */
const relIn = (root: string, abs: string): string => relative(root, abs).split(sep).join("/");

function linkKept(abs: string, ctx: JudgeContext): LinkKept {
  const v = symlinkVerdict(abs, ctx.realRoot);
  return v.kept ? { kept: true, dir: v.dir, target: relIn(ctx.realRoot, v.target) } : { kept: false };
}

/** What the settle asks of `abs` beside its stat `st`, as it used to read it: a link's verdict when it's there and a
 *  link, why the walk leaves it out as what it is. */
export function judgePath(abs: string, st: PathStat, ctx: JudgeContext): PathVerdict {
  const rel = relIn(ctx.root, abs);
  const there = !("error" in st);
  const out: PathVerdict = {};
  if (there && isSymlink(abs)) out.link = linkKept(abs, ctx);
  const dir = there && st.kind === "dir";
  if (dir) out.dir = ctx.filter.exclusion(rel, true);
  if (!dir || (out.link && !out.link.kept)) out.file = ctx.filter.exclusion(rel, false);
  return out;
}

/** The folder `dir` listed, judged as `how` says. */
export function judgeListing(dir: string, how: ListHow, ctx: JudgeContext): JudgedListing {
  if ("adopt" in how) return adopted(relIn(ctx.root, dir), ctx);
  if ("moved" in how) return { how: "moved", there: movedInto(relIn(ctx.root, dir), how.moved, ctx) };
  return entriesOf(dir, how.entries, ctx);
}

const kindOf = (e: Dirent): JudgedEntry["kind"] =>
  e.isDirectory() ? "dir" : e.isSymbolicLink() ? "link" : e.isFile() ? "file" : "other";

function entriesOf(dir: string, how: EntriesHow, ctx: JudgeContext): JudgedFolder {
  const { filter, root } = ctx;
  const at = Date.now();
  let listed: Dirent[];
  try {
    listed = disk.entries(dir);
  } catch (err) {
    return { how: "entries", at, error: codeOf(err), entries: [] };
  }
  const dirRel = relIn(root, dir);
  const skip = new Set(how.skip ?? []);
  const entries = listed.map((e): JudgedEntry => {
    const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
    const out: JudgedEntry = { name: e.name, kind: kindOf(e) };
    if (out.kind === "dir") {
      if (how.skip && !skip.has(e.name)) out.excluded = filter.exclusion(rel, true);
      return out;
    }
    if (how.notesOnly && !filter.isNoteName(e.name)) return out;
    out.excluded = filter.exclusion(rel, false);
    if (out.excluded !== null) return out;
    if (how.links && out.kind === "link") out.link = linkKept(join(root, rel), ctx);
    if (how.stat && filter.isNoteName(e.name)) {
      const st = statOf(join(root, rel));
      out.mtimeMs = "error" in st ? null : st.mtimeMs;
    }
    return out;
  });
  return { how: "entries", at, error: null, entries };
}

/** The folder `dirRel` taken in as the walk would walk it, stamped before it's listed: its files, and the folders in it
 *  the walk goes into — each the next listing's, so a tree moved in comes a folder at a time, never in one request. */
function adopted(dirRel: string, ctx: JudgeContext): AdoptedFolder {
  const { filter, root } = ctx;
  const abs = join(root, dirRel);
  const at = Date.now();
  const stat = statOf(abs);
  const gitignore = statOf(join(abs, ".gitignore"));
  const out: AdoptedFolder = { how: "adopt", at, stat, gitignore, dirs: [], files: [] };
  let entries: Dirent[];
  try {
    entries = disk.entries(abs);
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dirRel}/${e.name}`;
    if (e.isDirectory()) {
      if (filter.exclusion(rel, true) === null) out.dirs.push(rel);
    } else if (e.isSymbolicLink()) {
      const link = linkKept(join(root, rel), ctx);
      if (link.kept && filter.exclusion(rel, false) === null) out.files.push({ rel, link });
    } else if (filter.exclusion(rel, false) === null) out.files.push({ rel });
  }
  return out;
}

/**
 * Where known notes that went (`went`) are now in `d`, a folder left to the walk: the same file by its time and size (a
 * move keeps them), under the same path below a folder that went (`gone`: renamed or moved there — the other files
 * known in it with them) or at the folder's top under any name (a note moved into it). Those alone: the rest of such a
 * folder is the walk's. A note only into a folder found in this batch (`fresh`), or one changed since a little before
 * it went — never a copy made long ago (`cp -a`), its times kept, though another note went just now — and never one
 * home's walk wouldn't go into, nor through one (`walksInto`): a vault made in it, or a link it doesn't follow, since
 * it was found.
 */
function movedInto(d: string, how: MovedHow, ctx: JudgeContext): string[] {
  const { filter, root } = ctx;
  const walked = new Map<string, boolean>();
  const walks = (dir: string) => walked.get(dir) ?? walked.set(dir, walksInto(root, filter, dir)).get(dir)!;
  const same = (rel: string, w: Went) => {
    const st = statOrNull(join(root, rel));
    return !!st && st.mtimeMs === w.mtimeMs && (w.size === undefined || st.size === w.size);
  };
  // A note seen gone a tick at most after it went, and a coarse clock (a rename changes the folder's ctime, not its
  // mtime).
  const late = Math.min(how.pollMs, 10_000) + SETTLE_MS;
  const byTime = new Map<number, Went[]>();
  for (const w of how.went) {
    const bucket = byTime.get(w.mtimeMs);
    if (bucket) bucket.push(w);
    else byTime.set(w.mtimeMs, [w]);
  }
  const attachments = new Set(how.attachments);
  const there = new Set<string>();
  const changed = how.fresh ? Number.POSITIVE_INFINITY : (changedAt(join(root, d)) ?? Number.NEGATIVE_INFINITY);
  /** A note that went before `d` changed, give or take: one that can be in it (not a copy made long before). */
  const after = (w: Went) => changed >= w.at - late;
  if (!how.went.some(after) || !walks(d)) return [];
  // A folder that went, here now: its notes, once one of the first few is (another may have gone alone), and the
  // other files known in it.
  for (const g of how.gone) {
    const notes = how.went.filter((w) => w.rel.startsWith(`${g.dir}/`) && after(w));
    const at = (rel: string) => `${d}${rel.slice(g.dir.length)}`;
    if (!notes.slice(0, 20).some((w) => same(at(w.rel), w))) continue;
    for (const w of notes) if (same(at(w.rel), w) && walks(parentOf(at(w.rel)))) there.add(at(w.rel));
    for (const f of g.files) {
      const rel = at(f);
      // Not found there before (a later batch in the tick looks again).
      if (!attachments.has(rel) && disk.exists(join(root, rel)) && walks(parentOf(rel))) there.add(rel);
    }
  }
  let entries: Dirent[] = [];
  try {
    entries = disk.entries(join(root, d));
  } catch {}
  for (const e of entries) {
    if (!e.isFile()) continue;
    const rel = `${d}/${e.name}`;
    const st = statOrNull(join(root, rel));
    if (st && byTime.get(st.mtimeMs)?.some((w) => after(w) && (w.size === undefined || st.size === w.size)))
      there.add(rel);
  }
  return [...there];
}
