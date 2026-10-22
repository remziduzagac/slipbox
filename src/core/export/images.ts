// Pictures for an export (plan 10.x): a picture's bytes, kind and size — read from its file's own header, nothing
// decoded — and an SVG (a file, a diagram, a display's maths) rasterised to PNG for the formats that hold no SVG.

import { readExportAsset } from "./reads.ts";
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
  const info = headerInfo(b);
  // A header saying no width or no height is no picture; any size it says is taken, as big as it is.
  return info && info.width > 0 && info.height > 0 ? info : null;
}

function headerInfo(b: Uint8Array): Omit<Raster, "data"> | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { type: "png", width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)
    return { type: "gif", width: v.getUint16(6, true), height: v.getUint16(8, true) };
  if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d)
    return { type: "bmp", width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) };
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (chunk === "VP8 ")
      return { type: "webp", width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = v.getUint32(21, true);
      return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X")
      return {
        type: "webp",
        width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      };
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: its size in the first start-of-frame segment.
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { type: "jpg", width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** MathJax's sizes are in `ex`: a display's, in pixels, at this many to the ex (11-point text). */
const EX_PX = 6.3;

/** A MathJax SVG's size in `ex`, and how far below the line it sits (a line's maths); null where it says none. */
export function mathSize(svg: string): { width: number; height: number; valign: number } | null {
  const head = /<svg[^>]*>/.exec(svg)?.[0] ?? "";
  const ex = (attr: string) => Number(new RegExp(`\\b${attr}="(-?[\\d.]+)ex"`).exec(head)?.[1] ?? Number.NaN);
  const width = ex("width");
  const height = ex("height");
  if (!(width > 0 && height > 0)) return null;
  return { width, height, valign: Number(/vertical-align:\s*(-?[\d.]+)ex/.exec(head)?.[1] ?? 0) };
}

/** A picture as it is — its bytes, its kind (`svg` for one), its own size in pixels — with the size it's shown at. */
export interface PictureData {
  data: Uint8Array;
  type: Raster["type"] | "svg";
  width: number;
  height: number;
  shown: { width: number; height: number };
}

/**
 * A picture as it is, with the size it's shown at — its own, or Obsidian's (`|300` its width, `|240x180` the box it
 * fits in) — at most `maxWidth` pixels wide; null where it can't be read (nothing there, not a picture, an SVG with no
 * size and no rasteriser to ask) or isn't the root's (DF-D24: never read).
 */
export function pictureData(pic: ExportPicture, r: Rasterizer | null, maxWidth: number): PictureData | null {
  if (pic.outside) return null;
  let svg = pic.svg ?? null;
  let raster: Raster | null = null;
  if (!svg && (pic.data || pic.file)) {
    let bytes: Uint8Array;
    try {
      bytes = pic.data ?? readExportAsset(pic.file!);
    } catch {
      return null;
    }
    const info = rasterInfo(bytes);
    if (info) raster = { ...info, data: bytes };
    else if (looksLikeSvg(new TextDecoder().decode(bytes.subarray(0, 512)))) svg = new TextDecoder().decode(bytes);
    else return null;
  }
  let own: { width: number; height: number };
  if (raster) own = { width: raster.width, height: raster.height };
  else if (svg) {
    const m = pic.kind === "math" ? mathSize(svg) : null;
    const size = m ? { width: m.width * EX_PX, height: m.height * EX_PX } : (r?.size(svg) ?? null);
    if (!size || !(size.width > 0 && size.height > 0)) return null;
    own = size;
  } else return null;
  let width = own.width;
  if (pic.size)
    width = Math.min(
      pic.size.width,
      pic.size.height ? (pic.size.height * own.width) / own.height : Number.POSITIVE_INFINITY,
    );
  width = Math.min(width, maxWidth);
  const shown = {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round((width * own.height) / own.width)),
  };
  return raster
    ? { ...raster, shown }
    : { data: new TextEncoder().encode(svg!), type: "svg", width: own.width, height: own.height, shown };
}

/**
 * A picture as a raster an export can hold — a file as it is, an SVG rasterised at `scale` times its size (sharper
 * where it's shrunk) — with the size it's shown at, at most `maxWidth` pixels wide; null where it can't be (no
 * rasteriser, a kind not read). `kinds`: the raster kinds the format holds as they are.
 */
export function rasterOf(
  pic: ExportPicture,
  r: Rasterizer | null,
  maxWidth: number,
  kinds: Raster["type"][],
  scale = 2,
): (Raster & { shown: { width: number; height: number } }) | null {
  const p = pictureData(pic, r, maxWidth);
  if (!p) return null;
  // A kind not held: made a PNG before the export (`convert.ts`), or it's its words.
  if (p.type !== "svg")
    return kinds.includes(p.type)
      ? { data: p.data, type: p.type, width: p.width, height: p.height, shown: p.shown }
      : null;
  const png = r?.png(new TextDecoder().decode(p.data), p.shown.width * scale);
  if (!png) return null;
  const info = rasterInfo(png)!;
  return { data: png, type: "png", width: info.width, height: info.height, shown: p.shown };
}

/** A picture's media type, by its kind. */
export function mediaType(type: PictureData["type"]): string {
  return type === "svg" ? "image/svg+xml" : type === "jpg" ? "image/jpeg" : `image/${type}`;
}
