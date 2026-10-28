// Existing followed-link verdicts and their refusal reasons.

import { realpathSync, type Stats, statSync } from "node:fs";
import { answered, linkAnswer } from "../../vaults/symlinks.ts";
import { isInside } from "../../vaults/vault.ts";
import type { LinkVerdict } from "../contracts.ts";

/** Why the walk didn't go through a link (VV-D6), as `Skipped` says it. */
export const LINK_REASON = {
  /** Within the vault, to a folder: a second name for what's walked under its own. */
  within: "link within the vault: a second name for its folder",
  /** Out of the vault, not followed: you haven't said to, or said no, or it leads elsewhere since. */
  out: "link not followed: it leads out of the vault",
  /** Followed, its target not answering yet: asked in the background, walked once it answers. */
  waiting: "link followed, its target not answering yet",
  /** Followed, to a folder that holds the vault: walking it would walk the vault again. */
  loop: "link to a folder holding the vault",
  /** Followed, to a folder another followed link leads into: walked once, under that one's name. */
  twice: "link to a folder followed already, through another link",
} as const;

/**
 * What the walk makes of the symlink at `abs` (0.11, VV-D6) — the watcher too, so both take the same. Within the vault
 * (`realRoot`, its real path), a file is kept, and a folder is a second name for what's walked already, never walked
 * twice; a link leading out is followed only when you said so for that link and that target (`links.json`), once its
 * target answered (`answered`: a disk that doesn't is never waited for), and a folder never into one holding the
 * vault. Anything else is skipped, with why (`special`: a FIFO, socket or device).
 */
export function symlinkVerdict(abs: string, realRoot: string): LinkVerdict {
  let target: string;
  try {
    target = realpathSync(abs);
  } catch {
    return { kept: false, reason: "broken symlink" };
  }
  let st: Stats;
  try {
    st = statSync(target);
  } catch {
    return { kept: false, reason: null };
  }
  const dir = st.isDirectory();
  // A FIFO, socket or device: reading one would hang.
  if (!dir && !st.isFile()) return { kept: false, reason: "symlink to something that isn't a file", special: true };
  const link = { target, dir };
  if (isInside(realRoot, target))
    return dir ? { kept: false, reason: LINK_REASON.within, link } : { kept: true, target, dir: false };
  if (linkAnswer(abs, target) !== "follow") return { kept: false, reason: LINK_REASON.out, link };
  if (answered(target) !== true) return { kept: false, reason: LINK_REASON.waiting, link };
  if (dir && isInside(target, realRoot)) return { kept: false, reason: LINK_REASON.loop, link };
  return { kept: true, target, dir };
}
