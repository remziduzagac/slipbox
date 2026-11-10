// A tick's stats (SD-T3), asked a slice at a time (`statsInSlices`): a group to each watched folder (its stamp, and its
// `.gitignore`'s), each `.gitignore` known of a folder no longer watched, each note followed — so a slow disk answers
// each request within its deadline, and what answered is taken when a later slice is given up on.

import { join } from "node:path";
import { type PathStat, parentOf } from "../../walk/io/stamps.ts";
import type { WatcherOptions } from "./contracts.ts";
import type { WatchDirectories } from "./directories.ts";
import { noteStamp } from "./io.ts";
import type { StatGroup } from "./reads.ts";
import type { WatchState } from "./state.ts";

/**
 * The tick's groups, each taken as its slice answers: a watched folder gone is pending, one whose mtime moved goes to
 * `moved` (to be listed again); one registered since the last look (`fresh`) is stamped from them and taken out of
 * `fresh`; a `.gitignore` changed asks the filter again and the vault walked again; a note followed that changed or
 * went is pending.
 */
export function tickGroups(
  opts: Pick<WatcherOptions, "filter" | "known" | "root">,
  state: WatchState,
  directories: Pick<WatchDirectories, "stamp">,
  fresh: Map<string, number>,
  moved: [string, number][],
): StatGroup[] {
  const { filter, known, root } = opts;
  const ignoreSeen = (dirRel: string, st: PathStat) => {
    const before = state.gitignores.get(dirRel);
    if (before === undefined) return;
    const now = "error" in st ? -1 : st.mtimeMs;
    if (now === before) return;
    state.gitignores.set(dirRel, now);
    filter.invalidate(dirRel);
    state.rescan = true;
  };
  const ignores = new Set(state.gitignores.keys());
  const groups: StatGroup[] = [];
  for (const d of state.watchers.keys()) {
    const ignored = ignores.delete(d);
    const readAt = fresh.get(d);
    const gitignore = ignored || readAt !== undefined;
    groups.push({
      paths: gitignore ? [join(root, d), join(root, d, ".gitignore")] : [join(root, d)],
      seen: ([st, gi]) => {
        fresh.delete(d);
        if (state.watchers.has(d)) {
          // Registered since the last look: stamped from this one, as it would have been when it was registered.
          if (readAt !== undefined) directories.stamp(d, readAt, { dir: st!, gitignore: gi! });
          if ("error" in st!) {
            if (d) state.pending.add(d);
          } else if (st!.mtimeMs !== state.stamps.get(d)) moved.push([d, st!.mtimeMs]);
        }
        if (ignored) ignoreSeen(d, gi!);
      },
    });
  }
  for (const d of ignores) groups.push({ paths: [join(root, d, ".gitignore")], seen: ([gi]) => ignoreSeen(d, gi!) });
  // The notes followed into folders left to the walk, whose folders no watch sees: looked at every tick.
  for (const rel of state.followed) {
    groups.push({
      paths: [join(root, rel)],
      seen: ([s]) => {
        if (!known.has(rel) || state.watchers.has(parentOf(rel))) return;
        const st = noteStamp(s);
        if (!st || st.mtimeMs !== known.get(rel) || (state.sizes.has(rel) && state.sizes.get(rel) !== st.size))
          state.pending.add(rel);
      },
    });
  }
  return groups;
}
