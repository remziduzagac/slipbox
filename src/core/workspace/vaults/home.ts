// Home (VV-D2): `~`, a vault without a marker. Its files are those in it that no other vault holds, less its skip
// list (`homeSkip` in walk.ts); its walk is made a slice at a time while nobody is working — by the background index
// (autoindex.ts), and by the TUI while home is the vault open — and kept in its cache folder (`walk.json`), so opening
// home never walks it: its graph is built from the walk kept, each note's size and time read again — a folder of it
// asked for by name (`slipbox ~/notes`) walked at once when that walk doesn't cover it. Nothing is written into `~`
// itself (D39).

import { type Dirent, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Config } from "../../application/config/config.ts";
import type { VaultLocation } from "./vault.ts";
import { HOME_LIMITS, SlicedWalk } from "../walk/traversal/walk.ts";
import type { WalkCap, WalkLimits } from "../walk/contracts.ts";
import type { WalkFilter } from "../walk/filtering/filter.ts";
import type { AskedWhole, HomeWalk } from "./home/contracts.ts";
import { keepHomeWalk, keptWalk } from "./home/cache.ts";
import { inFolders, nearestTop, under, walksInto } from "./home/paths.ts";
import { homeFilter } from "./home/filter.ts";

/**
 * Home's walk, to build its graph from (VV-D2): the walk kept, brought up to now (`keptWalk`) — never walked, its top
 * alone — and the folders of home asked for by name (`asked`, home's paths for them: `slipbox ~/notes`, or a file in
 * it) that it doesn't cover yet, walked now with its skip list: what was asked for has its notes at once. A walk kept
 * that stopped at its cap covers none of them whole: a folder it listed may hold folders it didn't. That walk isn't
 * kept: home's own, made while nobody is working, covers them.
 *
 * What was asked for is walked whole, whatever it holds — you're working in it — and its notes count against home's
 * cap: home's own make room for them, the deepest left out first, as home's walk leaves them (`nearer`). So home's
 * walk, made before or after, holds as many fewer of its own as the folders asked for hold; and those alone past the
 * cap are whole all the same, home's own all left out. Its other files are held so too.
 *
 * `keep` false: what changed isn't kept, but handed back (`unkept`) — a walk on another thread (T12).
 */
export function homeWalk(
  loc: Pick<VaultLocation, "root" | "key">,
  filter: WalkFilter,
  asked: readonly string[] = [],
  limits: WalkLimits = HOME_LIMITS,
  keep = true,
): HomeWalk {
  const home = keptWalk(loc, filter, limits, keep);
  // Never walked, home's top lists its folders without looking into them: none of them is covered.
  const covered = new Set(home.walked === null || home.capped ? [] : home.walk.dirs);
  /** One asked for that home's walk goes into, in none other asked for. */
  const walked = (rel: string, _: number, all: readonly string[]) =>
    !all.some((o) => o && o !== rel && under(rel, o)) && walksInto(loc.root, filter, rel);
  const from = asked.filter((rel, i, all) => !covered.has(rel) && walked(rel, i, all));
  if (!from.length) return home;
  // Every one is whole, those home's walk covers too: none of theirs is left out to make room for another's.
  const whole = asked.filter((rel, i, all) => from.includes(rel) || (covered.has(rel) && walked(rel, i, all)));
  const w = new SlicedWalk(
    loc.root,
    filter,
    { notes: Number.POSITIVE_INFINITY, folders: Number.POSITIVE_INFINITY },
    { from, known: covered, stamped: false },
  );
  while (w.step(1000)) {}
  const more = w.result!;
  const { walk } = home;
  // Home's walk has theirs that it covers, all kept (the walk now has the others'); and its own, out of every folder
  // asked for, as many as the cap leaves room for.
  const theirs = (rel: string) => inFolders(rel, whole) && !inFolders(rel, from);
  const own = (rel: string) => !inFolders(rel, whole);
  const kept = walk.files.filter((f) => theirs(f.rel));
  const others = walk.files.filter((f) => own(f.rel));
  const files = nearestTop(others, limits.notes - more.files.length - kept.length, (f) => f.rel);
  const keptAssets = walk.assets.filter(theirs);
  const otherAssets = walk.assets.filter(own);
  const assets =
    limits.assets === undefined
      ? otherAssets
      : nearestTop(otherAssets, limits.assets - more.assets.length - keptAssets.length, (a) => a);
  const dirs = new Set(walk.dirs);
  const skipped = new Set(walk.skipped.map((s) => `${s.rel}\0${s.reason}`));
  return {
    ...home,
    capped: files.length < others.length ? "notes" : home.capped,
    asked: { folders: whole, notes: more.files.length + kept.length },
    walk: {
      files: [...kept, ...files, ...more.files].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)),
      assets: [...keptAssets, ...assets, ...more.assets],
      dirs: [...walk.dirs, ...more.dirs.filter((d) => !dirs.has(d))],
      skipped: [...walk.skipped, ...more.skipped.filter((s) => !skipped.has(`${s.rel}\0${s.reason}`))],
      errors: [...walk.errors, ...more.errors],
    },
  };
}

/**
 * A folder home's cap left unlisted, looked in for vaults (20.9): its vaults, to index, and its other folders, to
 * look in later — home's skip list held, as its walk holds it (`filter`, home's). By their whole paths, by name;
 * nothing when it can't be read.
 */
export function vaultsPastCap(dir: string, filter: WalkFilter): { vaults: string[]; folders: string[] } {
  const out = { vaults: [] as string[], folders: [] as string[] };
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!e.isDirectory()) continue;
    const abs = join(dir, e.name);
    const why = filter.exclusion(relative(filter.root, abs).split(sep).join("/"), true);
    if (why === "nested vault") out.vaults.push(abs);
    else if (why === null) out.folders.push(abs);
  }
  return out;
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

/**
 * What home's cap left out, in words (VV-D2): said when it's reached — and, folders asked for by name (`asked`), that
 * they're whole; holding the cap or more alone, home holds theirs and nothing else.
 */
export function describeCap(cap: WalkCap, asked?: AskedWhole): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const names = asked?.folders.map((f) => `~/${f}`) ?? [];
  const named = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const opened = names.length > 1 ? "the folders open" : "the folder open";
  if (cap === "notes" && asked && named && asked.notes >= HOME_LIMITS.notes)
    return `home's index is full: it holds ${n(asked.notes)} notes, all in ${named}, ${opened} — the rest aren't indexed`;
  const said =
    cap === "notes"
      ? `home's index is full: it holds ${n(HOME_LIMITS.notes)} notes, those nearest the top — the rest aren't indexed`
      : `home's walk stopped at ${n(HOME_LIMITS.folders)} folders, those nearest the top — the notes deeper aren't indexed`;
  return named ? `${said}; ${named}, ${opened}, ${names.length > 1 ? "are" : "is"} whole` : said;
}

export type { HomeWalk, AskedWhole } from "./home/contracts.ts";
export { under, inFolders, deepestOutside, leftOutOfHome, walksInto } from "./home/paths.ts";
export { homeWalkFile, keepHomeWalk, homeWalkKept } from "./home/cache.ts";
export { homeFilter } from "./home/filter.ts";
