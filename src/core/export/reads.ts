// What an export job reads (10.x): its notes and pictures, regular files only — a FIFO or a device named like one is
// refused, never waited on — and each note parsed once in a job, however often it's a chapter or embedded.
import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { decodeText } from "../foundation/platform/fsutil.ts";
import { type ParsedNote, parseMarkdown } from "../documents/markdown/parse.ts";

const job = new AsyncLocalStorage<Map<string, ParsedNote>>();

/** `run` as one export job: the notes it parses kept for it alone (in a job already, that one). */
export function withExportReads<T>(run: () => Promise<T>): Promise<T> {
  if (job.getStore()) return run();
  return job.run(new Map(), run);
}

/** A regular file's bytes; anything else there (a FIFO, a device, a folder) refused. */
function readRegular(file: string): Buffer {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    if (!fstatSync(fd).isFile()) throw Error(`${file} isn't a regular file`);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** A note parsed for an export: once in a job, the tree shared — a chapter changes a copy of it. */
export function parseExportNote(file: string): ParsedNote {
  const parsed = job.getStore();
  const hit = parsed?.get(file);
  if (hit) return hit;
  const note = parseMarkdown(decodeText(readRegular(file)).text);
  parsed?.set(file, note);
  return note;
}

/** A note to embed: its parse, or null where it can't be read — the embed stays its name, the export goes on. */
export function embeddedNote(file: string): ParsedNote | null {
  try {
    return parseExportNote(file);
  } catch {
    return null;
  }
}

/** A picture's bytes, for an export. */
export function readExportAsset(file: string): Buffer {
  return readRegular(file);
}
