// The file walk (plan 1.2), implementing decision 0.11. The watcher uses the same `WalkFilter`,
// so what the walk excludes is exactly what the watcher does not subscribe to (5.2).
//
// Home (VV-D2) is walked by the same filter with its skip list (`homeSkip`) instead of `.gitignore`: a slice at a
// time (`SlicedWalk`), breadth first, as far as its cap (`HOME_LIMITS`).

export type {
  NoteFile,
  Skipped,
  WalkResult,
  Stamp,
  BusyWhy,
  HomeSkip,
  FilterSettings,
  WalkLimits,
  WalkCap,
  LinkVerdict,
} from "./contracts.ts";
export { SETTLE_MS, settled, lost, parentOf, RELIST, stampOf, dirStamp } from "./io/stamps.ts";
export { slowDisk, readFolder, setFolderReader } from "./io/folders.ts";
export { BUSY_FOLDERS, isBusyName, isBusyFolder, busyWhy, homeSkip, ANOTHER_DISK } from "./filtering/policy.ts";
export { holdsNotes, filterFrom, WalkFilter } from "./filtering/filter.ts";
export { busyFolderAt, busyFolderWhyAt } from "./filtering/inspection.ts";
export { LINK_REASON, symlinkVerdict } from "./traversal/symlinks.ts";
export { walkVault, HOME_LIMITS, SlicedWalk, walkTop, listDirectory } from "./traversal/walk.ts";
