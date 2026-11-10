// What a link's resolution asks of the disk (SD-T11): whether a path is a file or a folder, the names a folder holds
// (a name's case, where the disk folds it), and the folders this machine has named (a pointer's, a hosting URL's). Read
// through the seam (SD-D10), here, at once — the CLI's, a key's, a test's App's — unless something else answers for a
// while (`answering`): a TUI's drawing, which answers from what it keeps and never reads the disk itself (SD-D13;
// tui/app/runtime/drawn.ts).

import * as disk from "../../foundation/platform/disk.ts";
import { type NamedFolder, readFolders } from "../vaults/folders.ts";

/** What a link asks of the disk about a path, as `links.ts`, the graph's resolver and its lookups ask it. */
export interface PathProbe {
  /** Whether `abs` is a file, its links followed. */
  isFile(abs: string): boolean;
  /** Whether `abs` is a folder, its links followed. */
  isFolder(abs: string): boolean;
  /** Whether anything is at `abs`, its links followed. */
  exists(abs: string): boolean;
  /** The names in the folder `dir`; null when it can't be listed. */
  names(dir: string): string[] | null;
  /** The folders this machine has named (21.6), in slipbox's state folder. */
  folders(): NamedFolder[];
}

/** A path statted through the seam: null when it can't be. */
function statted(abs: string): ReturnType<typeof disk.stat> | null {
  try {
    return disk.stat(abs);
  } catch {
    return null;
  }
}

/** The disk itself, read through the seam on the thread that asks. */
export const DISK_PROBE: PathProbe = {
  isFile: (abs) => statted(abs)?.isFile() ?? false,
  isFolder: (abs) => statted(abs)?.isDirectory() ?? false,
  exists: (abs) => disk.exists(abs),
  names(dir) {
    try {
      return disk.entries(dir).map((e) => e.name);
    } catch {
      return null;
    }
  },
  folders: () => readFolders(),
};

let current: PathProbe = DISK_PROBE;

/** What answers a link's questions of the disk now: the seam's, unless something answers for a while (`answering`). */
export function probe(): PathProbe {
  return current;
}

/** `run`, its links' questions of the disk answered by `by` (a TUI's drawing); none given, by whatever answers now. */
export function answering<T>(by: PathProbe | null, run: () => T): T {
  if (!by) return run();
  const was = current;
  current = by;
  try {
    return run();
  } finally {
    current = was;
  }
}
