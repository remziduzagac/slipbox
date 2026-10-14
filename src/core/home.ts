// Home (VV-D2): `~`, a vault without a marker. Its files are those in it that no other vault holds, less its skip
// list (`homeSkip` in walk.ts); its walk is made a slice at a time while nobody is working — by the background index
// (autoindex.ts), and by the TUI while home is the vault open — and kept in its cache folder (`walk.json`), so opening
// home never walks it: its graph is built from the walk kept, each note's size and time read again. Nothing is
// written into `~` itself (D39).

import { statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { cacheDir, ensureCacheHome, type Keyed } from "./paths.ts";
import { isVaultRoot, type VaultLocation } from "./vault.ts";
import {
  HOME_LIMITS,
  type NoteFile,
  type Skipped,
  SlicedWalk,
  type WalkCap,
  WalkFilter,
  type WalkResult,
  walkTop,
} from "./walk.ts";

/** Home's walk as its cache folder keeps it. */
interface KeptWalk {
  version: 1;
  /** When the walk began (ISO 8601). */
  walked: string;
  capped: WalkCap | null;
  /** Its notes, the ones too large to read among them; its other files; its folders; what it skipped. */
  notes: string[];
  assets: string[];
  dirs: string[];
  skipped: Skipped[];
}

/** Home's walk, to build its graph from. */
export interface HomeWalk {
  walk: WalkResult;
  /** When it was walked (epoch ms); null when it hasn't been yet — its top alone, looked at now. */
  walked: number | null;
  /** What stopped it short (`HOME_LIMITS`), if anything did. */
  capped: WalkCap | null;
}

export function homeWalkFile(loc: Keyed): string {
  return join(cacheDir(loc), "walk.json");
}

const TOO_LARGE = "larger than walk.max_file_size";

/** Home's walk kept: what its graph is built from until the next one. */
export function keepHomeWalk(loc: Keyed, walk: WalkResult, capped: WalkCap | null, walked: number): void {
  const big = walk.skipped.filter((s) => s.reason.startsWith(TOO_LARGE)).map((s) => s.rel);
  try {
    ensureCacheHome();
    ensureDir(cacheDir(loc));
    writeJson(homeWalkFile(loc), {
      version: 1,
      walked: new Date(walked).toISOString(),
      capped,
      notes: [...walk.files.map((f) => f.rel), ...big],
      assets: walk.assets,
      dirs: walk.dirs,
      skipped: walk.skipped.filter((s) => !s.reason.startsWith(TOO_LARGE)),
    } satisfies KeptWalk);
  } catch {}
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** How soon after a folder changes its time can't tell a later change apart (a coarse clock), as the watcher has it. */
const SETTLE_MS = 2000;

/** Whether `rel` is the folder `dir` or in it (`""`: home's top, holding everything). */
const under = (rel: string, dir: string) => dir === "" || rel === dir || rel.startsWith(`${dir}/`);
const parentOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const isDir = (abs: string) => {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Home's walk as it was kept, brought up to now — freshness checked, not assumed (VV-D2): each folder looked at again,
 * since its time moves when what's in it comes or goes. One gone, or become a vault, is dropped with all it held; one
 * changed since the walk is listed again, what came and went in it taken, a folder new in it walked; a vault the walk
 * found that is one no more is walked now, as home's. Each note's size and time is read again — one gone dropped, one
 * grown past `walk.max_file_size` skipped, as the walk would. What changed is kept, for the next. Never walked, home
 * is its top alone, looked at now (`walkTop`).
 */
export function homeWalk(loc: Pick<VaultLocation, "root" | "key">, filter: WalkFilter): HomeWalk {
  const kept = readJson<KeptWalk | null>(homeWalkFile(loc), null);
  if (kept?.version !== 1 || !Array.isArray(kept.notes))
    return { walk: walkTop(loc.root, filter), walked: null, capped: null };
  const now = Date.now();
  const root = loc.root;
  const walked = Date.parse(kept.walked) || 0;
  let capped: WalkCap | null = kept.capped === "notes" || kept.capped === "folders" ? kept.capped : null;
  const dropped: string[] = [];
  const relist: string[] = [];
  const became: Skipped[] = [];
  const dirs: string[] = [];
  for (const d of strings(kept.dirs).sort()) {
    if (dropped.some((x) => under(d, x))) continue;
    const abs = join(root, d);
    let mtime: number;
    try {
      const st = statSync(abs);
      if (!st.isDirectory()) throw new Error("not a folder");
      mtime = st.mtimeMs;
    } catch {
      dropped.push(d);
      continue;
    }
    const changed = mtime >= walked - SETTLE_MS;
    // A marker comes into a folder, its time moves: only a changed one can have become a vault.
    if (changed && d && isVaultRoot(abs)) {
      dropped.push(d);
      became.push({ rel: d, reason: "nested vault" });
      continue;
    }
    dirs.push(d);
    if (changed) relist.push(d);
  }
  const relisted = new Set(relist);
  /** Kept as the walk had it: not in a folder dropped, nor directly in one listed again (that listing has it). */
  const keep = (rel: string) => !dropped.some((x) => under(rel, x)) && !relisted.has(parentOf(rel));
  const keptSkipped = Array.isArray(kept.skipped)
    ? kept.skipped.filter((s) => typeof s?.rel === "string" && typeof s.reason === "string")
    : [];
  const former = keptSkipped.filter(
    (s) => s.reason === "nested vault" && keep(s.rel) && !isVaultRoot(join(root, s.rel)),
  );
  const skipped = [
    ...keptSkipped.filter((s) => keep(s.rel) && !former.includes(s)),
    ...became.filter((s) => !relisted.has(parentOf(s.rel))),
  ];
  const files: NoteFile[] = [];
  for (const rel of strings(kept.notes)) {
    if (!keep(rel)) continue;
    const abs = join(root, rel);
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      if (st.size > filter.maxFileSize) skipped.push({ rel, reason: `${TOO_LARGE} (${st.size} bytes)` });
      else files.push({ rel, abs, size: st.size, mtimeMs: st.mtimeMs });
    } catch {}
  }
  const assets = strings(kept.assets).filter(keep);
  // The folders listed again, and the vaults that are home's again, walked now: what's new in them.
  const from = [...relist, ...former.filter((s) => isDir(join(root, s.rel))).map((s) => s.rel)];
  if (from.length) {
    const w = new SlicedWalk(root, filter, HOME_LIMITS, { from, known: new Set(dirs) });
    while (w.step(1000)) {}
    const more = w.result!;
    files.push(...more.files);
    assets.push(...more.assets);
    skipped.push(...more.skipped);
    for (const d of more.dirs) if (!relisted.has(d)) dirs.push(d);
  }
  // As far as the cap: the notes nearest the top.
  if (files.length > HOME_LIMITS.notes) {
    const depth = (rel: string) => rel.split("/").length;
    files.sort((a, b) => depth(a.rel) - depth(b.rel) || (a.rel < b.rel ? -1 : 1));
    files.length = HOME_LIMITS.notes;
    capped = "notes";
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const walk: WalkResult = { files, assets, dirs: dirs.length ? dirs : [""], skipped, errors: [] };
  // Kept again only when it says something else: a folder whose time moved (a shell's history rewritten in `~`)
  // without a note coming or going isn't worth writing it.
  const big = skipped.filter((s) => s.reason.startsWith(TOO_LARGE)).map((s) => s.rel);
  const changed =
    !same([...files.map((f) => f.rel), ...big], strings(kept.notes)) ||
    !same(assets, strings(kept.assets)) ||
    !same(dirs, strings(kept.dirs)) ||
    !same(
      skipped.filter((s) => !s.reason.startsWith(TOO_LARGE)).map((s) => `${s.rel}\0${s.reason}`),
      keptSkipped.filter((s) => !s.reason.startsWith(TOO_LARGE)).map((s) => `${s.rel}\0${s.reason}`),
    );
  if (changed) keepHomeWalk(loc, walk, capped, now);
  return { walk, walked: changed ? now : walked, capped };
}

/** Two lists holding the same strings, in any order. */
function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** Whether home has a walk kept. */
export function homeWalkKept(loc: Keyed): boolean {
  return readJson<KeptWalk | null>(homeWalkFile(loc), null)?.version === 1;
}

/** Home's filter (VV-D2): its skip list, your config's extensions, exclusions and size cap. */
export function homeFilter(loc: Pick<VaultLocation, "root">, config: Pick<Config, "walk">): WalkFilter {
  return new WalkFilter(loc.root, config.walk, { home: true });
}

/**
 * Home walked now, as far as its cap, and kept: the CLI's, when home has never been walked (it answers now), and
 * `slipbox index --refresh ~`'s.
 */
export function walkHomeNow(loc: Pick<VaultLocation, "root" | "key">, config: Pick<Config, "walk">): HomeWalk {
  const walked = Date.now();
  const w = new SlicedWalk(loc.root, homeFilter(loc, config));
  while (w.step(1000)) {}
  keepHomeWalk(loc, w.result!, w.capped, walked);
  return { walk: w.result!, walked, capped: w.capped };
}

/** What home's cap left out, in words (VV-D2): said when it's reached. */
export function describeCap(cap: WalkCap): string {
  const n = (x: number) => x.toLocaleString("en-US");
  return cap === "notes"
    ? `home's index is full: it holds ${n(HOME_LIMITS.notes)} notes, those nearest the top — the rest aren't indexed`
    : `home's walk stopped at ${n(HOME_LIMITS.folders)} folders, those nearest the top — the notes deeper aren't indexed`;
}
