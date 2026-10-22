// The marks an export carries: what lets a later export replace it — a Markdown export though it's a note (plan 10.3)
// — while a file without one is written over only when you say (D243); a Markdown export's also tells its pictures'
// folder from any other (DF-D25). Apart from the writers, so the graph reads them without loading them.

import { closeSync, constants, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/** The mark a Markdown export carries in its frontmatter: what lets a later export replace it, though it's a note. */
export const EXPORT_MARK = "generator: slipbox";

/** A web page's mark in its head, and an e-book's in its package document. */
const GENERATOR_META = /<meta\s+name="generator"\s+content="slipbox"\s*\/?>/;
/** A Word document's mark: a custom property (`docProps/custom.xml`). */
const DOCX_MARK = /<property\b[^>]*\bname="generator"[^>]*>\s*<vt:lpwstr>slipbox<\/vt:lpwstr>/;
/** What's read of a part of a zip, at most: a mark's part is small. */
const PART_MAX = 1 << 20;

/** Whether `head` (a file's first 2,048 characters) opens with frontmatter carrying the Markdown export's mark. */
function markdownMarked(head: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)?.[1] ?? "";
  return fm.split(/\r?\n/).some((line) => line.trim() === EXPORT_MARK);
}

/** Whether the file at `abs` is an earlier Markdown export: its frontmatter carries the mark. */
export function isMarkdownExport(abs: string): boolean {
  try {
    return markdownMarked(readFileSync(abs, "utf8").slice(0, 2048));
  } catch {
    return false;
  }
}

/**
 * Whether the file at `abs` is an earlier export of slipbox's, in any of its formats, by the mark each carries:
 * Markdown's frontmatter line `generator: slipbox`; a web page's `<meta name="generator" content="slipbox">` in its
 * head; an e-book's, the same, in its package document (`OEBPS/content.opf`); a PDF's Creator, `slipbox`; a Word
 * document's custom property `generator`, `slipbox`. A mark says slipbox wrote the file, it doesn't prove it: a file
 * edited since keeps its mark, and another tool's file could carry one.
 */
export function isExport(abs: string): boolean {
  let fd: number;
  try {
    // Not blocking: a pipe there would wait for a writer.
    fd = openSync(abs, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch {
    return false;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return false;
    const head = readAt(fd, 0, 8192);
    const magic = head.toString("latin1", 0, 5);
    if (magic === "%PDF-") return pdfCreator(fd, st.size) === "slipbox";
    if (magic.startsWith("PK\x03\x04")) {
      const opf = zipPart(fd, st.size, "OEBPS/content.opf");
      if (opf !== null) return GENERATOR_META.test(opf);
      const custom = zipPart(fd, st.size, "docProps/custom.xml");
      return custom !== null && DOCX_MARK.test(custom);
    }
    const text = head.toString("utf8");
    if (/^\s*<!doctype html>/i.test(text)) return GENERATOR_META.test(/^[\s\S]*?<\/head>/i.exec(text)?.[0] ?? text);
    return markdownMarked(text.slice(0, 2048));
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

/** Up to `len` bytes of the open file `fd` from `pos`: fewer at its end. */
function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(Math.max(0, len));
  return buf.subarray(0, readSync(fd, buf, 0, buf.length, pos));
}

/**
 * The part `name` of the zip open as `fd`, `size` bytes, as text, by its central directory; null where it has none,
 * or it's bigger than a mark's part would be.
 */
function zipPart(fd: number, size: number, name: string): string | null {
  // The end of central directory record: in the last 22 bytes, or before a comment of up to 64 KiB.
  const tail = readAt(fd, Math.max(0, size - 65_557), 65_557);
  let end = tail.length - 22;
  while (end >= 0 && tail.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) return null;
  const cdSize = tail.readUInt32LE(end + 12);
  if (cdSize > 16 * PART_MAX) return null;
  const cd = readAt(fd, tail.readUInt32LE(end + 16), cdSize);
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nameLen = cd.readUInt16LE(p + 28);
    if (cd.toString("utf8", p + 46, p + 46 + nameLen) === name) {
      const [method, packed, at] = [cd.readUInt16LE(p + 10), cd.readUInt32LE(p + 20), cd.readUInt32LE(p + 42)];
      const local = readAt(fd, at, 30);
      if (packed > PART_MAX || local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) return null;
      const data = readAt(fd, at + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), packed);
      if (method === 0) return data.toString("utf8");
      return method === 8 ? inflateRawSync(data, { maxOutputLength: PART_MAX }).toString("utf8") : null;
    }
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }
  return null;
}

/**
 * The Creator a PDF's Info names, `size` bytes open as `fd`: the trailer's Info found by the cross-reference table,
 * its Creator a string there or an object of its own (as pdfkit writes it); null where it can't be found so.
 */
function pdfCreator(fd: number, size: number): string | null {
  const tail = readAt(fd, Math.max(0, size - 2048), 2048).toString("latin1");
  const xref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  const info = /\/Info\s+(\d+)\s+\d+\s+R/.exec(tail);
  if (!xref || !info) return null;
  /** Object `n`'s start, as text: its offset from the table's section that holds it. */
  const object = (n: number): string | null => {
    let p = Number(xref[1]);
    if (readAt(fd, p, 4).toString("latin1") !== "xref") return null;
    p += 4;
    // Its sections, each `first count` and then `count` entries of 20 bytes: `offset generation n`.
    for (let section = 0; section < 1024; section++) {
      const line = /^\s*(\d+) (\d+)[ \t]*\r?\n/.exec(readAt(fd, p, 64).toString("latin1"));
      if (!line) return null;
      const [first, count] = [Number(line[1]), Number(line[2])];
      p += line[0].length;
      if (n >= first && n < first + count) {
        const entry = /^(\d{10}) \d{5} n/.exec(readAt(fd, p + 20 * (n - first), 20).toString("latin1"));
        return entry ? readAt(fd, Number(entry[1]), 4096).toString("latin1") : null;
      }
      p += 20 * count;
    }
    return null;
  };
  const dict = /^\d+\s+\d+\s+obj\s*<<([^>]*)>>/.exec(object(Number(info[1])) ?? "")?.[1] ?? "";
  const creator = /\/Creator\s*(?:\(([^()\\]*)\)|(\d+)\s+\d+\s+R)/.exec(dict);
  if (!creator) return null;
  if (creator[1] !== undefined) return creator[1];
  return /^\d+\s+\d+\s+obj\s*\(([^()\\]*)\)/.exec(object(Number(creator[2])) ?? "")?.[1] ?? null;
}
