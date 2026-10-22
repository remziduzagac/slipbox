// A ZIP written an entry at a time into a sink, for EPUB (10.x). Each entry is whole when it's added, so its header
// carries its checksum and sizes, and no data descriptor follows it: a reader that streams the archive reads it as one
// that goes by its central directory does. Some streaming readers (Java's `ZipInputStream`) refuse a stored entry with
// a descriptor, and EPUB's first entry, `mimetype`, must be stored. fflate's streaming `Zip` describes every entry
// after its data, so it only compresses here. No ZIP64: an archive past 4 GiB, or 65,535 entries, is refused.

import { deflateSync } from "fflate";
import { crc32 } from "node:zlib";
import { EXPORT_CHUNK, type ExportSink } from "./spool.ts";

const MAX32 = 0xffffffff;

interface Entry {
  name: Uint8Array;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
}

export class ZipWriter {
  private readonly entries: Entry[] = [];
  private offset = 0;
  private readonly time: number;
  private readonly date: number;

  constructor(
    private readonly sink: ExportSink,
    now = new Date(),
  ) {
    // MS-DOS's time and date, as every entry's: local time, two-second steps, years from 1980.
    this.time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    this.date = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  }

  /** An entry, compressed unless `stored` or unless compressing doesn't make it smaller. */
  add(path: string, bytes: Uint8Array, stored = false): void {
    const name = new TextEncoder().encode(path);
    const packed = stored ? null : deflateSync(bytes, { level: 6 });
    const data = packed && packed.length < bytes.length ? packed : bytes;
    const entry: Entry = {
      name,
      // A name past ASCII says it's UTF-8.
      flags: name.length !== path.length ? 0x800 : 0,
      method: data === bytes ? 0 : 8,
      crc: crc32(bytes) >>> 0,
      compressed: data.length,
      size: bytes.length,
      offset: this.offset,
    };
    if (this.entries.length >= 0xffff || this.offset + 30 + name.length + data.length > MAX32)
      throw Error("EPUB too large: an archive past 4 GiB or 65,535 files");
    const header = new Uint8Array(30 + name.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    this.common(v, 6, entry);
    header.set(name, 30);
    this.write(header);
    for (let at = 0; at < data.length; at += EXPORT_CHUNK) this.write(data.subarray(at, at + EXPORT_CHUNK));
    this.entries.push(entry);
  }

  /** The central directory and its end: the archive complete. */
  end(): void {
    const start = this.offset;
    for (const entry of this.entries) {
      const header = new Uint8Array(46 + entry.name.length);
      const v = new DataView(header.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); // made by: MS-DOS, version 2.0
      v.setUint16(6, 20, true);
      this.common(v, 8, entry);
      // Comment length, disk, internal and external attributes: none.
      v.setUint32(42, entry.offset, true);
      header.set(entry.name, 46);
      this.write(header);
    }
    if (this.offset > MAX32) throw Error("EPUB too large: an archive past 4 GiB");
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, this.offset - start, true);
    v.setUint32(16, start, true);
    this.write(end);
  }

  /** What a local header and a central one share, from its flags to its extra field's length (none). */
  private common(v: DataView, at: number, entry: Entry): void {
    v.setUint16(at, entry.flags, true);
    v.setUint16(at + 2, entry.method, true);
    v.setUint16(at + 4, this.time, true);
    v.setUint16(at + 6, this.date, true);
    v.setUint32(at + 8, entry.crc, true);
    v.setUint32(at + 12, entry.compressed, true);
    v.setUint32(at + 16, entry.size, true);
    v.setUint16(at + 20, entry.name.length, true);
    v.setUint16(at + 22, 0, true);
  }

  private write(chunk: Uint8Array): void {
    this.sink(chunk);
    this.offset += chunk.length;
  }
}
