// Home (VV-D2): `~`, a vault without a marker. Its files are those in it that no other vault holds, less its skip
// list (`homeSkip` in walk.ts); its walk is made a slice at a time while nobody is working — by the background index
// (autoindex.ts), and by the TUI while home is the vault open — and kept in its cache folder (`walk.json`), so opening
// home never walks it: its graph is built from the walk kept, each note's size and time read again — a folder of it
// asked for by name (`slipbox ~/notes`) walked at once when that walk doesn't cover it. Nothing is written into `~`
// itself (D39).

import { realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./fsutil.ts";
import { cacheDir, ensureCacheHome, type Keyed } from "./paths.ts";
import { answered, followedTarget, isLink, linkTarget } from "./symlinks.ts";
import { isVaultRoot, type VaultLocation } from "./vault.ts";
import {
  ANOTHER_DISK,
  HOME_LIMITS,
  LINK_REASON,
  type NoteFile,
  type Skipped,
  SlicedWalk,
  type WalkCap,
  WalkFilter,
  type WalkLimits,
  symlinkVerdict,
  type WalkResult,
  walkTop,
} from "./walk.ts";

/** Home's walk as its cache folder keeps it. */
interface KeptWalk {
  version: 1;
  /** When the walk began (ISO 8601). */
  walked: string;
  /** The settings it was made under (`WalkFilter.signature`): under others, it's no walk of home's now. */
  filter: string;
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

/** Home's walk kept, made with `filter`: what its graph is built from until the next one. */
export function keepHomeWalk(
  loc: Keyed,
  walk: WalkResult,
  capped: WalkCap | null,
  walked: number,
  filter: WalkFilter,
): void {
  const big = walk.skipped.filter((s) => s.reason.startsWith(TOO_LARGE)).map((s) => s.rel);
  try {
    ensureCacheHome();
    ensureDir(cacheDir(loc));
    writeJson(homeWalkFile(loc), {
      version: 1,
      walked: new Date(walked).toISOString(),
      filter: filter.signature(),
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
 * Home's walk, to build its graph from (VV-D2): the walk kept, brought up to now (`keptWalk`) — never walked, its top
 * alone — and the folders of home asked for by name (`asked`, home's paths for them: `slipbox ~/notes`, or a file in
 * it) that it doesn't cover yet, walked now, as far as home's cap and with its skip list: what was asked for has its
 * notes at once. A walk kept that stopped at its cap covers none of them whole: a folder it listed may hold folders it
 * didn't. That walk isn't kept: home's own, made while nobody is working, covers them.
 */
export function homeWalk(
  loc: Pick<VaultLocation, "root" | "key">,
  filter: WalkFilter,
  asked: readonly string[] = [],
  limits: WalkLimits = HOME_LIMITS,
): HomeWalk {
  const home = keptWalk(loc, filter, limits);
  // Never walked, home's top lists its folders without looking into them: none of them is covered.
  const covered = new Set(home.walked === null || home.capped ? [] : home.walk.dirs);
  const from = asked.filter(
    (rel, _, all) =>
      !covered.has(rel) && !all.some((o) => o && o !== rel && under(rel, o)) && walksInto(loc.root, filter, rel),
  );
  if (!from.length) return home;
  const w = new SlicedWalk(loc.root, filter, limits, { from, known: covered });
  while (w.step(1000)) {}
  const more = w.result!;
  const { walk } = home;
  const files = new Set(walk.files.map((f) => f.rel));
  const assets = new Set(walk.assets);
  const dirs = new Set(walk.dirs);
  const skipped = new Set(walk.skipped.map((s) => `${s.rel}\0${s.reason}`));
  return {
    ...home,
    walk: {
      files: [...walk.files, ...more.files.filter((f) => !files.has(f.rel))].sort((a, b) =>
        a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0,
      ),
      assets: [...walk.assets, ...more.assets.filter((a) => !assets.has(a))],
      dirs: [...walk.dirs, ...more.dirs.filter((d) => !dirs.has(d))],
      skipped: [...walk.skipped, ...more.skipped.filter((s) => !skipped.has(`${s.rel}\0${s.reason}`))],
      errors: [...walk.errors, ...more.errors],
    },
  };
}

/**
 * Why home's walk doesn't go into the folder `rel` (home's path for it; VV-D2), or null when it does: something on its
 * way that home's skip list leaves out (`exclusion`'s reason: `Downloads`, `hidden`, `another disk`…), a vault of its
 * own, a link the walk wouldn't go through (VV-D6), or no folder there.
 */
export function leftOutOfHome(root: string, filter: WalkFilter, rel: string): string | null {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const name = parts[i - 1]!;
    const p = parts.slice(0, i).join("/");
    if (!name || name === "." || name === "..") return "not a folder of home";
    const why = filter.exclusion(p, true);
    if (why !== null) return why;
    const abs = join(root, p);
    if (isLink(abs)) {
      const v = symlinkVerdict(abs, realRoot);
      if (!v.kept) return v.reason ?? LINK_REASON.out;
    }
  }
  return isDir(join(root, rel)) ? null : "not a folder";
}

/** Whether home's walk goes into the folder `rel` (home's path for it; VV-D2): `leftOutOfHome` has no reason. */
export function walksInto(root: string, filter: WalkFilter, rel: string): boolean {
  return leftOutOfHome(root, filter, rel) === null;
}

/**
 * Home's walk as it was kept, brought up to now — freshness checked, not assumed (VV-D2): each folder looked at again,
 * since its time moves when what's in it comes or goes. One gone, or become a vault, is dropped with all it held; one
 * changed since the walk is listed again, what came and went in it taken, a folder new in it walked; a vault the walk
 * found that is one no more is walked now, as home's. Each note's size and time is read again — one gone dropped, one
 * grown past `walk.max_file_size` skipped, as the walk would. A folder where another disk is mounted since is dropped
 * with all it held, never looked at, and one that's no longer a mount is walked. What changed is kept, for the next.
 * Never walked, or walked under other settings (`walk.extensions`, `walk.exclude`, the root markers: its filter's
 * signature), home is its top alone, looked at now (`walkTop`).
 */
function keptWalk(loc: Pick<VaultLocation, "root" | "key">, filter: WalkFilter, limits: WalkLimits): HomeWalk {
  const kept = readJson<KeptWalk | null>(homeWalkFile(loc), null);
  if (!fits(kept, filter)) return { walk: walkTop(loc.root, filter), walked: null, capped: null };
  // Where other disks are mounted now, read once for this walk: none of them is looked at.
  filter.readMounts();
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
    // Another disk mounted on it since (VV-D2): dropped with all it held — nothing in it, nor it, looked at.
    if (d && filter.onMount(d)) {
      dropped.push(d);
      became.push({ rel: d, reason: ANOTHER_DISK });
      continue;
    }
    // A folder reached through a link (VV-D6): kept only while you follow it to where it led, and it answers — never
    // read through on this thread before then: one that leads elsewhere now, or isn't followed, dropped with all it
    // held, the link kept as the walk would have it, to walk once it answers.
    if (d && isLink(abs)) {
      const t = followedTarget(abs);
      const waiting = !!t && answered(t) !== true;
      if (!t || waiting || linkTarget(abs) !== t) {
        dropped.push(d);
        became.push({
          rel: d,
          reason: waiting ? LINK_REASON.waiting : LINK_REASON.out,
          link: { target: waiting ? t : (linkTarget(abs) ?? abs), dir: true },
        });
        continue;
      }
    }
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
  const keptSkipped = (
    Array.isArray(kept.skipped)
      ? kept.skipped.filter((s) => typeof s?.rel === "string" && typeof s.reason === "string")
      : []
  ).map((s) =>
    // A vault another disk is mounted on since: that disk, never looked into for its marker.
    s.reason === "nested vault" && filter.onMount(s.rel) ? { rel: s.rel, reason: ANOTHER_DISK } : s,
  );
  // A disk taken away: its folder home's again — the folder holding it listed again, so the walk says what it is now.
  for (const s of keptSkipped) {
    const parent = parentOf(s.rel);
    if (s.reason === ANOTHER_DISK && !filter.onMount(s.rel) && dirs.includes(parent) && !relist.includes(parent))
      relist.push(parent);
  }
  // A link the walk didn't go through, followed now and answering (VV-D6): its folder listed again, so it's walked.
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  for (const k of Array.isArray(kept.skipped) ? kept.skipped : []) {
    if (!k?.link || (k.reason !== LINK_REASON.out && k.reason !== LINK_REASON.waiting)) continue;
    const parent = parentOf(k.rel);
    if (dirs.includes(parent) && !relist.includes(parent) && symlinkVerdict(join(root, k.rel), realRoot).kept)
      relist.push(parent);
  }
  const relisted = new Set(relist);
  /** Kept as the walk had it: not in a folder dropped, nor directly in one listed again (that listing has it). */
  const keep = (rel: string) => !dropped.some((x) => under(rel, x)) && !relisted.has(parentOf(rel));
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
  // The folders listed again, and the vaults that are home's again, walked now: what's new in them — as far as the
  // cap's room left (the folders listed again always: they were listed before), and said when it's reached.
  const from = [...relist, ...former.filter((s) => isDir(join(root, s.rel))).map((s) => s.rel)];
  if (from.length) {
    const folders = Math.max(from.length, limits.folders - dirs.length + relist.length);
    const w = new SlicedWalk(root, filter, { ...limits, folders }, { from, known: new Set(dirs) });
    while (w.step(1000)) {}
    const more = w.result!;
    files.push(...more.files);
    assets.push(...more.assets);
    skipped.push(...more.skipped);
    for (const d of more.dirs) if (!relisted.has(d)) dirs.push(d);
    if (w.capped && capped !== "notes") capped = w.capped;
  }
  const depth = (rel: string) => rel.split("/").length;
  // As far as the cap: the notes nearest the top.
  if (files.length > limits.notes) {
    files.sort((a, b) => depth(a.rel) - depth(b.rel) || (a.rel < b.rel ? -1 : 1));
    files.length = limits.notes;
    capped = "notes";
  }
  // Its other files too, those nearest the top.
  if (limits.assets !== undefined && assets.length > limits.assets) {
    assets.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : 1));
    assets.length = limits.assets;
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const walk: WalkResult = { files, assets, dirs: dirs.length ? dirs : [""], skipped, errors: [] };
  // Kept again only when it says something else: a folder whose time moved (a shell's history rewritten in `~`)
  // without a note coming or going isn't worth writing it.
  const big = skipped.filter((s) => s.reason.startsWith(TOO_LARGE)).map((s) => s.rel);
  const said = (list: unknown) =>
    (Array.isArray(list) ? (list as Skipped[]) : [])
      .filter((s) => typeof s?.reason === "string" && !s.reason.startsWith(TOO_LARGE))
      .map((s) => `${s.rel}\0${s.reason}`);
  const changed =
    !same([...files.map((f) => f.rel), ...big], strings(kept.notes)) ||
    !same(assets, strings(kept.assets)) ||
    !same(dirs, strings(kept.dirs)) ||
    !same(said(skipped), said(kept.skipped)) ||
    capped !== (kept.capped ?? null);
  if (changed) keepHomeWalk(loc, walk, capped, now, filter);
  return { walk, walked: changed ? now : walked, capped };
}

/** Two lists holding the same strings, in any order. */
function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** Whether `kept` is a walk of home's made under `filter`'s settings (its signature), to build from. */
function fits(kept: KeptWalk | null, filter: WalkFilter): kept is KeptWalk {
  return kept?.version === 1 && Array.isArray(kept.notes) && kept.filter === filter.signature();
}

/** Whether home has a walk kept — one made under `config`'s settings, when it's given. */
export function homeWalkKept(loc: Pick<VaultLocation, "root" | "key">, config?: Pick<Config, "walk">): boolean {
  const kept = readJson<KeptWalk | null>(homeWalkFile(loc), null);
  return config ? fits(kept, homeFilter(loc, config)) : kept?.version === 1;
}

/** Home's filter (VV-D2): its skip list, your config's extensions, exclusions and size cap. */
export function homeFilter(loc: Pick<VaultLocation, "root">, config: Pick<Config, "walk">): WalkFilter {
  return new WalkFilter(loc.root, config.walk, { home: true });
}

/**
 * Home walked now, as far as its cap, and kept: the CLI's, when home has never been walked (it answers now), and
 * `slipbox index --refresh ~`'s.
 */
export function walkHomeNow(
  loc: Pick<VaultLocation, "root" | "key">,
  config: Pick<Config, "walk">,
  limits: WalkLimits = HOME_LIMITS,
): HomeWalk {
  const walked = Date.now();
  const filter = homeFilter(loc, config);
  const w = new SlicedWalk(loc.root, filter, limits);
  while (w.step(1000)) {}
  keepHomeWalk(loc, w.result!, w.capped, walked, filter);
  return { walk: w.result!, walked, capped: w.capped };
}

/** What home's cap left out, in words (VV-D2): said when it's reached. */
export function describeCap(cap: WalkCap): string {
  const n = (x: number) => x.toLocaleString("en-US");
  return cap === "notes"
    ? `home's index is full: it holds ${n(HOME_LIMITS.notes)} notes, those nearest the top — the rest aren't indexed`
    : `home's walk stopped at ${n(HOME_LIMITS.folders)} folders, those nearest the top — the notes deeper aren't indexed`;
}
