// Folder entries, file admission and followed symlinks during traversal.

import { type Dirent, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isInside } from "../../vaults/vault.ts";
import type { WalkState } from "./state.ts";
import { RELIST, dirStamp, lost, parentOf } from "../io/stamps.ts";
import { folderReader } from "../io/folders.ts";
import { ANOTHER_DISK } from "../filtering/policy.ts";
import { LINK_REASON, symlinkVerdict } from "./symlinks.ts";
import type { WalkFilter } from "../filtering/filter.ts";
import type { WalkResult } from "../contracts.ts";

/** One folder listed: its notes and files kept, each folder of it given to `descend`, a vault in it skipped. */
export function listDir(st: WalkState, dirRel: string, descend: (rel: string) => void): void {
  const { root, filter, out } = st;
  // Stamped before it's read: a change while it's read moves its time past the stamp.
  const stamp = out.times && dirStamp(join(root, dirRel), Date.now());
  let entries: Dirent[];
  try {
    entries = folderReader(join(root, dirRel));
  } catch (err) {
    out.errors.push(`${dirRel || "."}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    return;
  }
  if (st.sorted) entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  out.dirs.push(dirRel);
  if (stamp) out.times?.set(dirRel, stamp);
  for (const entry of entries) {
    const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    const abs = join(root, rel);
    if (entry.isDirectory()) {
      const why = filter.exclusion(rel, true);
      if (why === null) descend(rel);
      // A vault of its own, another disk (home's, VV-D2): said, so what's kept knows it.
      else if (why === "nested vault" || why === ANOTHER_DISK) out.skipped.push({ rel, reason: why });
      continue;
    }
    if (entry.isSymbolicLink()) {
      handleSymlink(abs, rel, st, descend);
      continue;
    }
    if (!entry.isFile()) continue;
    if (filter.exclusion(rel, false) !== null) continue;
    if (filter.isNoteName(entry.name)) addFile(abs, rel, filter, out);
    else if (out.assets.length < st.maxAssets) out.assets.push(rel);
  }
}

export function handleSymlink(abs: string, rel: string, st: WalkState, descend: (rel: string) => void): void {
  const { filter, out, realRoot } = st;
  const v = symlinkVerdict(abs, realRoot);
  if (!v.kept) {
    // Home's walk: a link whose target can't be looked at now (gone, a disk taken away, not searched) — its folder to
    // list again, so it's looked at again at each build, and walked once its target is back (#12).
    if (out.times && (v.reason === "broken symlink" || v.reason === null)) out.times.set(parentOf(rel), RELIST);
    if (v.reason && (!v.special || filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))))
      out.skipped.push({ rel, reason: v.reason, ...(v.link ? { link: v.link } : {}) });
    return;
  }
  const target = v.target;
  if (v.dir) {
    // A folder you follow (VV-D6): walked as the vault's, under the link's name — once, whatever leads to it.
    const why = filter.exclusion(rel, true);
    if (why === "nested vault") out.skipped.push({ rel, reason: why });
    if (why !== null) return;
    if ([...st.followed].some((f) => isInside(f, target) || isInside(target, f)))
      return void out.skipped.push({ rel, reason: LINK_REASON.twice, link: { target, dir: true } });
    st.followed.add(target);
    descend(rel);
    return;
  }
  if (filter.exclusion(rel, false) !== null) return;
  if (!filter.isNoteName(rel.slice(rel.lastIndexOf("/") + 1))) {
    if (out.assets.length < st.maxAssets) out.assets.push(rel);
    return;
  }
  addFile(abs, rel, filter, out);
  const added = out.files[out.files.length - 1];
  if (added?.rel === rel) st.links.set(added, relative(realRoot, target).split(sep).join("/"));
}

export function addFile(abs: string, rel: string, filter: WalkFilter, out: WalkResult): void {
  try {
    const st = statSync(abs);
    if (st.size > filter.maxFileSize) {
      out.skipped.push({ rel, reason: `larger than walk.max_file_size (${st.size} bytes)` });
      return;
    }
    out.files.push({ rel, abs, size: st.size, mtimeMs: st.mtimeMs });
  } catch (err) {
    out.errors.push(`${rel}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    // Home's walk: a note there but not to be looked at — its folder to list again, so it's tried again (#12).
    if (lost(err) && out.times) out.times.set(parentOf(rel), RELIST);
  }
}
