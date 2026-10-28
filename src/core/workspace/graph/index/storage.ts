// Note-index reuse and persistence. Graph owns the live maps, flags and observable errors.
import { basename, join } from "node:path";
import { ensureDir, sweepTemps, writeJson } from "../../../foundation/platform/fsutil.ts";
import { cacheDir, ensureCacheHome, type Keyed } from "../../../foundation/platform/paths.ts";
import type { NoteFile, WalkFilter } from "../../walk/walk.ts";
import type { NoteEntry } from "../graph-types.ts";
import type { EditorOverlay } from "../overlays/editor.ts";
import { INDEX_VERSION, type IndexFile } from "./schema.ts";

interface BuildContext {
  readonly notes: Map<string, NoteEntry>;
  readonly reached: Set<string>;
  readonly filter: Pick<WalkFilter, "isNoteName">;
  addAsset(rel: string): boolean;
}

export function reuseEntries(
  context: BuildContext,
  unparsed: Map<string, NoteFile>,
  files: NoteFile[],
  reachedPaths: string[],
  old: Record<string, NoteEntry>,
  reachable: (rel: string) => NoteFile | null,
): number {
  let reused = 0;
  context.notes.clear();
  unparsed.clear();
  // Files reached before (20.8), still there and still left out by the walk: indexed again.
  context.reached.clear();
  const reachedFiles: NoteFile[] = [];
  for (const rel of reachedPaths) {
    const f = reachable(rel);
    if (!f || files.some((w) => w.rel === rel)) continue;
    context.reached.add(rel);
    if (context.filter.isNoteName(basename(rel))) reachedFiles.push(f);
    else context.addAsset(rel);
  }
  for (const f of [...files, ...reachedFiles]) {
    const prev = old[f.rel];
    if (prev && prev.mtimeMs === f.mtimeMs && prev.size === f.size && !isUnreadable(prev)) {
      context.notes.set(f.rel, prev);
      reused++;
    } else {
      context.notes.set(f.rel, stub(f));
      unparsed.set(f.rel, f);
    }
  }
  return reused;
}

interface PersistContext {
  readonly loc: Keyed;
  readonly reached: ReadonlySet<string>;
  branchNow(): string | null;
}

export function persistIndex(context: PersistContext, entries: Record<string, NoteEntry>): number {
  ensureCacheHome();
  ensureDir(cacheDir(context.loc));
  // A temporary file of it a write let go of left behind (a thread stopped mid-write): gone once it's old.
  sweepTemps(cacheDir(context.loc), "index.json");
  writeJson(join(cacheDir(context.loc), "index.json"), {
    version: INDEX_VERSION,
    entries,
    branch: context.branchNow(),
    reached: [...context.reached],
  } satisfies IndexFile);
  return Date.now();
}

export function isUnreadable(e: NoteEntry): boolean {
  return e.flags.some((f) => f.startsWith("unreadable"));
}

export function stub(f: NoteFile): NoteEntry {
  return {
    rel: f.rel,
    title: basename(f.rel).replace(/\.(md|markdown)$/i, ""),
    headings: [],
    links: [],
    tags: [],
    aliases: [],
    previous: [],
    hash: "",
    mtimeMs: f.mtimeMs,
    size: f.size,
    flags: ["unparsed"],
  };
}

/** Serialization inputs are collected before the IO refusal boundary, as in Graph.writeCache. */
export function cacheEntries(
  notes: ReadonlyMap<string, NoteEntry>,
  unparsed: ReadonlyMap<string, NoteFile>,
  overlays: ReadonlyMap<string, EditorOverlay>,
): Record<string, NoteEntry> {
  const entries: Record<string, NoteEntry> = {};
  // A read failure is not a fact about the note: never cache it (chmod does not touch mtime).
  for (const [rel, e] of notes) if (!unparsed.has(rel) && !isUnreadable(e)) entries[rel] = overlays.get(rel)?.disk ?? e;
  return entries;
}
