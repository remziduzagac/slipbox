// Persisted home-walk and live result records.

import type { Skipped, Stamp, WalkCap, WalkResult } from "../../walk/contracts.ts";

/** Home's walk as its cache folder keeps it. */
export interface KeptWalk {
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
  /**
   * Each folder's stamp as the walk saw it, in `dirs`' order (`Stamp`: its mtime, -1 to list it again, and its ctime);
   * null when it isn't known — a folder of a walk an earlier version kept, not listed since. None in a walk an earlier
   * version kept (#12).
   */
  times?: (Stamp | null)[];
}

/** Home's walk, to build its graph from. */
export interface HomeWalk {
  walk: WalkResult;
  /** When it was walked (epoch ms); null when it hasn't been yet — its top alone, looked at now. */
  walked: number | null;
  /** What stopped it short (`HOME_LIMITS`), if anything did. */
  capped: WalkCap | null;
  /** The folders asked for by name walked into it whole (VV-D2); none when home's walk covers them. */
  asked?: AskedWhole;
  /** Home's own walk, brought up to now and changed, not kept yet (`homeWalk`'s `keep` false, T12): kept by whoever
   *  takes it (`keepHomeWalk`), so an answer dropped as obsolete writes nothing. */
  unkept?: { walk: WalkResult; capped: WalkCap | null; walked: number };
}

/** Folders of home asked for by name, walked whole (VV-D2): home's paths for them, and how many notes they hold. */
export interface AskedWhole {
  folders: string[];
  notes: number;
}
