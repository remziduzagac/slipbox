// A note's text read for the graph (SD-T6), as the screen's thread read it before and a disk thread reads it now: for
// its parse (`readNoteText`, as `extractNote` reads), or for a change the watcher saw (`readNote`, as `applyToGraph`
// stats and then reads it). Light — no parser — so the disk threads that answer it stay so (list-worker.ts).

import * as disk from "../../../foundation/platform/disk.ts";
import { type DecodedFile, decodeText, readText } from "../../../foundation/platform/fsutil.ts";

/** A note's text read for its parse: decoded as `readText` decodes it, or the code of why it couldn't be read. */
export type NoteText = DecodedFile | { error: string };

/**
 * A note's file as the graph takes in a change to it: its size and mtime, its links followed, and — a file of at most
 * the bytes asked — its text, as `NoteText`; none past them (left out of the index: `walk.max_file_size`). Null when
 * nothing is there.
 */
export type NoteRead = { size: number; mtimeMs: number; text?: NoteText } | null;

/** An error's code, as `extractNote` says it (`unreadable: <code>`). */
const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException).code ?? "error";

/** `abs`'s text for its parse, read through the seam: as `extractNote` reads it. */
export function readNoteText(abs: string): NoteText {
  try {
    return readText(abs);
  } catch (err) {
    return { error: codeOf(err) };
  }
}

/**
 * `abs` read as a change to it is taken in: its text and the stat of the file it read, from one open (a save renamed
 * over it meanwhile is neither's); a file past `max` bytes, its stat alone. One that can't be read — not a regular file,
 * not yours — is statted for its size, as before, its error its text; null when nothing is there.
 */
export function readNote(abs: string, max: number | null = null): NoteRead {
  try {
    const { bytes, stat } = disk.readRegularStat(abs, max ?? Number.POSITIVE_INFINITY);
    return { size: stat.size, mtimeMs: stat.mtimeMs, text: decodeText(bytes) };
  } catch (err) {
    const code = codeOf(err);
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    let st: { size: number; mtimeMs: number };
    try {
      st = disk.stat(abs);
    } catch {
      return null;
    }
    const at = { size: st.size, mtimeMs: st.mtimeMs };
    return code === "EFBIG" ? at : { ...at, text: { error: code } };
  }
}
