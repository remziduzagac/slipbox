// What drawing asks of the disk (SD-T11, SD-D13; disk-jobs.ts hands it here): what's at each of some paths — a link's
// target, a picture's file — the names a folder holds (a name's case, on a disk that folds it), files' texts — an
// embedded note's, an SVG's, the scratch's places', the Problems panel's — and the folders this machine has named (a
// pointer's, a hosting URL's: in slipbox's state folder, as the asking thread's environment finds it). Each read as the
// screen's thread would read it, through the seam (SD-D10); one request a batch, asked in the background
// (tui/app/runtime/drawn.ts).

import * as disk from "../../foundation/platform/disk.ts";
import { decodeText } from "../../foundation/platform/fsutil.ts";
import { type NamedFolder, readFolders } from "../vaults/folders.ts";
import { type PathStat, statOf } from "./io/stamps.ts";

/** A file's text as drawing reads it, with the stamp (`mtime:size`) of the file it was read from. */
export interface TextRead {
  text: string;
  stamp: string;
}

/** What a batch of drawing asks: paths statted, their links followed; folders' names; files' texts, each at most `max`
 *  bytes; and, asked, the machine's named folders. */
export interface DrawAsk {
  stat: string[];
  names: string[];
  texts: { path: string; max: number }[];
  folders?: boolean;
}

/** A batch answered, each in the order asked: a path's stat or its error's code; a folder's names (null: it can't be
 *  listed); a file's text (null: it isn't a regular file of at most its `max` bytes, or can't be read). */
export interface DrawAnswer {
  stats: PathStat[];
  names: (string[] | null)[];
  texts: (TextRead | null)[];
  folders?: NamedFolder[];
}

/** A folder's names, as `onDisk` reads them; null when it can't be listed. */
function namesIn(dir: string): string[] | null {
  try {
    return disk.entries(dir).map((e) => e.name);
  } catch {
    return null;
  }
}

/** A file's text, decoded as `readText` decodes it, refused past `max` bytes or when it isn't a regular file. */
export function textRead(path: string, max: number): TextRead | null {
  try {
    const { bytes, stat } = disk.readRegularStat(path, max);
    return { text: decodeText(bytes).text, stamp: `${stat.mtimeMs}:${stat.size}` };
  } catch {
    return null;
  }
}

/** A batch answered here, read as the screen's thread would. */
export function answerDraw(ask: DrawAsk): DrawAnswer {
  return {
    stats: ask.stat.map((p) => statOf(p)),
    names: ask.names.map(namesIn),
    texts: ask.texts.map((t) => textRead(t.path, t.max)),
    ...(ask.folders ? { folders: readFolders() } : {}),
  };
}
