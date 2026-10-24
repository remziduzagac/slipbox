// The release builds a run made for the checks of upgrading (release-builds.ts, UPG), as its workers and those checks
// find them: every check's session reads where they are, so this file is the harness's, not theirs alone.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The release builds, where `SLIPBOX_TERMINAL_RELEASES` says. */
export interface Releases {
  /** The folder they're in. */
  dir: string;
  target: string;
  /** This checkout's version, and its binary. */
  old: string;
  oldBin: string;
  /** The newer one's version, its binary unpacked, its pack's name, and the releases' folder serving the pack. */
  new: string;
  newBin: string;
  pack: string;
  releases: string;
}

/** The builds a run made, as its workers find them; null when none were. */
export function releasesBuilt(): Releases | null {
  const dir = process.env.SLIPBOX_TERMINAL_RELEASES;
  if (!dir) return null;
  try {
    return JSON.parse(readFileSync(join(dir, "releases.json"), "utf8")) as Releases;
  } catch {
    return null;
  }
}
