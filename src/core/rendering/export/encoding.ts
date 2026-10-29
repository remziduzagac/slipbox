// Bounded UTF-8 output below format dispatch.

import { EXPORT_CHUNK, type ExportSink } from "./spool.ts";

/** Encode in fixed-size windows, keeping surrogate pairs together across a window boundary. */
export function utf8(text: string, sink: ExportSink): void {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(EXPORT_CHUNK);
  for (let at = 0; at < text.length; ) {
    // Three bytes per UTF-16 code unit is the maximum; encodeInto never splits a code point.
    const end = Math.min(text.length, at + Math.floor(EXPORT_CHUNK / 3));
    const high = text.charCodeAt(end - 1);
    const until = end < text.length && high >= 0xd800 && high <= 0xdbff ? end - 1 : end;
    const { read, written } = encoder.encodeInto(text.slice(at, until), buffer);
    if (!read) throw Error("export text encoding made no progress");
    sink(buffer.subarray(0, written));
    at += read;
  }
}
