// One traversal state and its original initialization/finish order.

import { realpathSync } from "node:fs";
import type { WalkFilter } from "../filtering/filter.ts";
import type { NoteFile, WalkResult } from "../contracts.ts";

/** One walk's place: what it has found so far, and its symlinked notes' targets (a note twice is dropped at its end). */
export interface WalkState {
  root: string;
  realRoot: string;
  filter: WalkFilter;
  out: WalkResult;
  /** Symlinked notes found → their target, vault-relative. */
  links: Map<NoteFile, string>;
  /** Each folder's entries by name: which come first decides what a cap leaves out, the same each time. */
  sorted: boolean;
  /** The folders outside the vault its followed links lead to (VV-D6), by their real paths: each walked once. */
  followed: Set<string>;
  /** How many of its other files it lists at most (home's cap, VV-D2): those found first, nearest the top. */
  maxAssets: number;
}

/** `mounts`: the mount table read again for this walk — not for one that goes on from another (home's folders listed
 *  again, or asked for: the build's own walk read it). `stamped`: each folder's time kept as it's listed (`times`). */
export function startWalk(
  root: string,
  filter: WalkFilter,
  { sorted = false, maxAssets = Infinity, mounts = true, stamped = false } = {},
): WalkState {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  // Where other disks are mounted, read once for the walk (home's: never gone into, VV-D2).
  if (mounts) filter.readMounts();
  filter.newWalk(); // the busy-named folders looked into again (D237)
  const out: WalkResult = { files: [], assets: [], dirs: [], skipped: [], errors: [] };
  if (stamped) out.times = new Map();
  return { root, realRoot, filter, out, links: new Map(), sorted, followed: new Set(), maxAssets };
}

/** A walk done: a symlinked note whose target it includes dropped, the notes sorted. */
export function finishWalk(st: WalkState): WalkResult {
  const result = st.out;
  // A symlinked note whose target the walk already includes is the same note twice: it would
  // double every backlink. Keep it only when its target is not otherwise in the vault.
  const walked = new Set(result.files.filter((f) => !st.links.has(f)).map((f) => f.rel));
  result.files = result.files.filter((f) => {
    const target = st.links.get(f);
    if (target === undefined || !walked.has(target)) return true;
    result.skipped.push({ rel: f.rel, reason: `symlink to ${target}, already in the vault` });
    return false;
  });
  result.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return result;
}
