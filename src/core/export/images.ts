// Pictures for an export (plan 10.x): a picture's bytes, kind and size — read from its file's own header, nothing
// decoded — and an SVG (a file, a diagram, a display's maths) rasterised to PNG for the formats that hold no SVG.

import { readFileSync } from "node:fs";
import { looksLikeSvg, type Rasterizer } from "../svg.ts";
import type { ExportPicture } from "./assemble.ts";

export interface Raster {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp" | "webp";
  /** In pixels. */
  width: number;
  height: number;
}

/** A raster image's kind and size from its header, or null where it isn't one of these. */
export function rasterInfo(b: Uint8Array): Omit<Raster, "data"> | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "png", width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { type: "gif", width: v.getUint16(6, true), height: v.getUint16(8, true) };
  if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d) return { type: "bmp", width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) };
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (chunk === "VP8 ") return { type: "webp", width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = v.getUint32(21, true);
      return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { type: "webp", width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: its size in the first start-of-frame segment.
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { type: "jpg", width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** MathJax's sizes are in `ex`: a display's, in pixels, at this many to the ex (11-point text). */
const EX_PX = 6.3;

/**
 * A picture as a raster an export can hold — a file as it is, an SVG rasterised at `scale` times its size (sharper
 * where it's shrunk) — with the size it's shown at (its own, or Obsidian's), at most `maxWidth` pixels wide; null where
 * it can't be (no rasteriser, a kind not read). `kinds`: the raster kinds the format holds as they are.
 */
export function rasterOf(pic: ExportPicture, r: Rasterizer | null, maxWidth: number, kinds: Raster["type"][], scale = 2): (Raster & { shown: { width: number; height: number } }) | null {
  let svg = pic.svg ?? null;
  let raster: Raster | null = null;
  if (!svg && pic.file) {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(pic.file);
    } catch {
      return null;
    }
    const info = rasterInfo(bytes);
    if (info && kinds.includes(info.type)) raster = { ...info, data: bytes };
    else if (!info && looksLikeSvg(new TextDecoder().decode(bytes.subarray(0, 512)))) svg = new TextDecoder().decode(bytes);
    else return null;
  }
  let own: { width: number; height: number };
  if (raster) own = { width: raster.width, height: raster.height };
  else if (svg && r) {
    const ex = (attr: string) => Number(new RegExp(`<svg[^>]*\\b${attr}="([\\d.]+)ex"`).exec(svg!)?.[1] ?? Number.NaN);
    const size = pic.kind === "math" ? { width: ex("width") * EX_PX, height: ex("height") * EX_PX } : r.size(svg);
    if (!size || !(size.width > 0 && size.height > 0)) return null;
    own = size;
  } else return null;
  // Obsidian's `|300` its width, `|240x180` the box it fits in; then the page's width.
  let width = own.width;
  if (pic.size) width = Math.min(pic.size.width, pic.size.height ? (pic.size.height * own.width) / own.height : Number.POSITIVE_INFINITY);
  width = Math.min(width, maxWidth);
  const shown = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round((width * own.height) / own.width)) };
  if (raster) return { ...raster, shown };
  const png = r!.png(svg!, shown.width * scale);
  if (!png) return null;
  const info = rasterInfo(png)!;
  return { data: png, type: "png", width: info.width, height: info.height, shown };
}
