// Home-walk persistence, validation and reuse with the original stamps and admission rules.

import { realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../application/config/config.ts";
import { ensureDir, readJson, writeJson } from "../../../foundation/platform/fsutil.ts";
import { cacheDir, ensureCacheHome, type Keyed } from "../../../foundation/platform/paths.ts";
import { answered, followedTarget, isLink, linkTarget } from "../symlinks.ts";
import { isVaultRoot, type VaultLocation } from "../vault.ts";
import { ANOTHER_DISK } from "../../walk/filtering/policy.ts";
import { LINK_REASON, symlinkVerdict } from "../../walk/traversal/symlinks.ts";
import { lost, parentOf, RELIST, SETTLE_MS } from "../../walk/io/stamps.ts";
import type { NoteFile, Skipped, Stamp, WalkCap, WalkLimits, WalkResult } from "../../walk/contracts.ts";
import { SlicedWalk, walkTop } from "../../walk/traversal/walk.ts";
import type { WalkFilter } from "../../walk/filtering/filter.ts";
import type { HomeWalk, KeptWalk } from "./contracts.ts";
import { nearer, under } from "./paths.ts";
import { homeFilter } from "./filter.ts";

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
      times: walk.dirs.map((d) => walk.times?.get(d) ?? null),
    } satisfies KeptWalk);
  } catch {}
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Each folder's stamp as the walk kept saw it (`KeptWalk.times`), by its path: those known. */
function keptTimes(kept: KeptWalk): Map<string, Stamp> {
  const times = new Map<string, Stamp>();
  const { dirs, times: list } = kept;
  // Read beside its folders, before either is sorted or sifted: a list that doesn't match them says nothing.
  if (!Array.isArray(dirs) || !Array.isArray(list) || list.length !== dirs.length) return times;
  dirs.forEach((d, i) => {
    const t = list[i];
    if (typeof d === "string" && Array.isArray(t) && t.length === 2 && t.every(Number.isFinite)) times.set(d, t);
  });
  return times;
}

/**
 * Home's walk as it was kept, brought up to now — freshness checked, not assumed (VV-D2): each folder looked at again,
 * since its time moves when what's in it comes or goes. One gone, or become a vault, is dropped with all it held; one
 * changed since the walk — its time not the one the walk saw, set back too (#12) — is listed again, what came and went
 * in it taken, a folder new in it walked; a vault the walk
 * found that is one no more is walked now, as home's. Each note's size and time is read again — one gone dropped, one
 * grown past `walk.max_file_size` skipped, as the walk would. A folder where another disk is mounted since is dropped
 * with all it held, never looked at, and one that's no longer a mount is walked. What changed is kept, for the next.
 * Never walked, or walked under other settings (`walk.extensions`, `walk.exclude`, the root markers: its filter's
 * signature), home is its top alone, looked at now (`walkTop`).
 */
export function keptWalk(
  loc: Pick<VaultLocation, "root" | "key">,
  filter: WalkFilter,
  limits: WalkLimits,
  persist: boolean,
): HomeWalk {
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
  const keptStamps = keptTimes(kept);
  /** The folders' stamps, kept with the walk if it's kept again: those listed again stamped as they're listed. */
  const times = new Map<string, Stamp>();
  /** The folders listed again for their stamp alone — set back, put back, or only their ctime moved (a chmod) — not
   *  for a time moved on past the walk, which "newer than the walk" listed again too. */
  const stampOnly: string[] = [];
  /** Folders and notes the walk loses without seeing them gone (unreadable, not to be looked at): tried again (#12). */
  const unread: string[] = [];
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
    let ctime: number;
    try {
      const st = statSync(abs);
      if (!st.isDirectory()) throw new Error("not a folder");
      mtime = st.mtimeMs;
      ctime = st.ctimeMs;
    } catch (err) {
      dropped.push(d);
      if (lost(err)) unread.push(d); // there, but not to be looked at: a permission, a policy, a disk's error
      continue;
    }
    // Changed since the walk: its time or its ctime isn't the one the walk saw (`Stamp`) — set back too, as `cp -a`,
    // `rsync -a` or an archive unpacked with its times leave it, or a disk whose clock is behind; put back to exactly
    // its stamp, its ctime moved all the same (#12). Its stamp not known (a walk an earlier version kept): newer than
    // the walk.
    const stamp = keptStamps.get(d);
    const changed = stamp === undefined ? mtime >= walked - SETTLE_MS : mtime !== stamp[0] || ctime !== stamp[1];
    // A marker comes into a folder, its time moves: only a changed one can have become a vault.
    if (changed && d && isVaultRoot(abs)) {
      dropped.push(d);
      became.push({ rel: d, reason: "nested vault" });
      continue;
    }
    dirs.push(d);
    if (changed && stamp !== undefined && !(mtime > stamp[0] && mtime >= walked - SETTLE_MS)) stampOnly.push(d);
    if (changed) relist.push(d);
    // One unchanged keeps its stamp — none, its time not known, so that it's never taken as seen without being listed.
    else if (stamp !== undefined) times.set(d, stamp);
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
  // Each listed again, for whatever reason, is stamped as it's listed; until then, or if it can't be, to list again.
  for (const d of relist) times.set(d, RELIST);
  /** Kept as the walk had it: not in a folder dropped, nor directly in one listed again (that listing has it). */
  const keep = (rel: string) => !dropped.some((x) => under(rel, x)) && !relisted.has(parentOf(rel));
  const former = keptSkipped.filter(
    (s) => s.reason === "nested vault" && keep(s.rel) && !isVaultRoot(join(root, s.rel)),
  );
  const skipped = [
    ...keptSkipped.filter((s) => keep(s.rel) && !former.includes(s)),
    ...became.filter((s) => !relisted.has(parentOf(s.rel))),
  ];
  /**
   * A file of the walk kept that is a link (VV-D6): kept only while the walk would keep it — within home, or followed
   * to where it leads now and answering; else left out, its link said as the walk says it. Its folder's time needn't
   * move when the link is pointed elsewhere.
   */
  const linkKept = (rel: string): boolean => {
    const abs = join(root, rel);
    if (!isLink(abs)) return true;
    const v = symlinkVerdict(abs, realRoot);
    if (!v.kept && v.reason) skipped.push({ rel, reason: v.reason, ...(v.link ? { link: v.link } : {}) });
    // Its target can't be looked at now (gone, a disk taken away): its folder to list again, so it's back with it
    // (#12).
    if (!v.kept && (v.reason === "broken symlink" || v.reason === null)) unread.push(rel);
    return v.kept;
  };
  const files: NoteFile[] = [];
  for (const rel of strings(kept.notes)) {
    if (!keep(rel) || !linkKept(rel)) continue;
    const abs = join(root, rel);
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      if (st.size > filter.maxFileSize) skipped.push({ rel, reason: `${TOO_LARGE} (${st.size} bytes)` });
      else files.push({ rel, abs, size: st.size, mtimeMs: st.mtimeMs });
    } catch (err) {
      if (lost(err)) unread.push(rel); // there, not to be looked at: its folder to list again
    }
  }
  const assets = strings(kept.assets).filter((rel) => keep(rel) && linkKept(rel));
  // The folders listed again, and the vaults that are home's again, walked now: what's new in them — as far as the
  // cap's room left (the folders listed again always: they were listed before), and said when it's reached.
  // Looked at as the walk goes into it, through a link it follows too: one that can't be, lost, is tried again.
  const back: string[] = [];
  for (const s of former) {
    try {
      if (statSync(join(root, s.rel)).isDirectory()) back.push(s.rel);
    } catch (err) {
      // There, but not to be looked at — or a link whose target is gone for now (a disk taken away): tried again.
      if (lost(err) || isLink(join(root, s.rel))) unread.push(s.rel);
    }
  }
  const from = [...relist, ...back];
  if (from.length) {
    const folders = Math.max(from.length, limits.folders - dirs.length + relist.length);
    const w = new SlicedWalk(root, filter, { ...limits, folders }, { from, known: new Set(dirs) });
    while (w.step(1000)) {}
    const more = w.result!;
    files.push(...more.files);
    assets.push(...more.assets);
    skipped.push(...more.skipped);
    for (const d of more.dirs) if (!relisted.has(d)) dirs.push(d);
    for (const [d, t] of more.times ?? []) times.set(d, t);
    const unreached = new Set(w.rest()); // left for the cap, not unreadable
    for (const d of back) if (!more.times?.has(d) && !unreached.has(d)) unread.push(d);
    if (w.capped && capped !== "notes") capped = w.capped;
  }
  // What the walk lost without seeing it gone — a folder or a note it may not look at, a vault home's again it couldn't
  // read — isn't in it: the folder holding each to list again, so each is tried again at each build till it can be
  // (#12).
  const inWalk = new Set(dirs);
  for (const d of unread) if (inWalk.has(parentOf(d))) times.set(parentOf(d), RELIST);
  // One listed again for its stamp alone, and stamped now (not to list again: unreadable, or changed just now): the
  // walk kept again for it, or it would be listed again at every build (#12).
  const byStamp = stampOnly.some((d) => (times.get(d)?.[0] ?? -1) !== -1);
  // As far as the cap: the notes nearest the top.
  if (files.length > limits.notes) {
    files.sort((a, b) => nearer(a.rel, b.rel));
    files.length = limits.notes;
    capped = "notes";
  }
  // Its other files too, those nearest the top.
  if (limits.assets !== undefined && assets.length > limits.assets) {
    assets.sort(nearer);
    assets.length = limits.assets;
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const walk: WalkResult = { files, assets, dirs: dirs.length ? dirs : [""], skipped, errors: [], times };
  // Kept again only when it says something else: a folder whose time moved on (a shell's history rewritten in `~`)
  // without a note coming or going isn't worth writing it, listed again till then. One listed again for its stamp
  // alone (`byStamp`: seldom) is, its new stamp with it, or it would be listed again at every build (#12).
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
    capped !== (kept.capped ?? null) ||
    byStamp;
  // Home's top not looked at (its stat failed: a disk's error, a folder above it not searched): nothing of home was
  // seen, so the walk kept stays as it was rather than be kept empty (#12).
  const keptAgain = changed && !dropped.includes("");
  if (keptAgain && persist) keepHomeWalk(loc, walk, capped, now, filter);
  return {
    walk,
    walked: keptAgain ? now : walked,
    capped,
    ...(keptAgain && !persist ? { unkept: { walk, capped, walked: now } } : {}),
  };
}

/** Two lists holding the same strings, in any order. */
function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** Whether `kept` is a walk of home's to build from: made under `filter`'s settings (its signature), and holding home's
 *  top (one that couldn't read it holds none of home, and is made again, #12). */
function fits(kept: KeptWalk | null, filter?: WalkFilter): kept is KeptWalk {
  return (
    kept?.version === 1 &&
    Array.isArray(kept.notes) &&
    (!filter || kept.filter === filter.signature()) &&
    strings(kept.dirs).includes("")
  );
}

/**
 * Whether home has a walk kept — one made under `config`'s settings, when it's given; `stamped`, with every folder's
 * stamp (#12): not an earlier version's walk, nor one kept again from it, which the command line walks again, once.
 */
export function homeWalkKept(
  loc: Pick<VaultLocation, "root" | "key">,
  config?: Pick<Config, "walk">,
  stamped = false,
): boolean {
  const kept = readJson<KeptWalk | null>(homeWalkFile(loc), null);
  if (!fits(kept, config && homeFilter(loc, config))) return false;
  return !stamped || keptTimes(kept).size === strings(kept.dirs).length;
}
