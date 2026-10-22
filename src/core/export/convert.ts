// Pictures made PNG before an export (plan 10.10): each format holds some kinds of picture and not others (Word no
// WebP, PDF only PNG and JPEG, an e-book no BMP), so one that isn't held is decoded and written again as a PNG first,
// and the writers see only what they take. BMP is decoded here, GIF by resvg, WebP by libwebp as WebAssembly
// (@jsquash/webp, Apache-2.0; libwebp BSD-3-Clause), loaded the first time a WebP is met.

import { readExportAsset } from "./reads.ts";
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import wasm from "@jsquash/webp/codec/dec/webp_dec.wasm" with { type: "file" };
import type { Rasterizer } from "../svg.ts";
import type { ExportDoc, ExportPicture } from "./assemble.ts";
import { type Raster, rasterInfo } from "./images.ts";

/** Pixels: `width` × `height`, four bytes each — red, green, blue, alpha — row after row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Pixels as a PNG: eight bits a channel, with alpha, each row unfiltered, deflated. */
export function encodePng(img: Rgba): Uint8Array {
  const rows = new Uint8Array(img.height * (img.width * 4 + 1));
  for (let y = 0; y < img.height; y++)
    rows.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1);
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const h = new DataView(header.buffer);
  h.setUint32(0, img.width);
  h.setUint32(4, img.height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

/**
 * A BMP's pixels: 1, 4 and 8 bits a pixel through its palette, 16 (5-5-5 or its masks), 24 and 32 (its masks, its
 * alpha where it says one), bottom-up or top-down; null for what it isn't, or a compressed one (RLE).
 */
export function decodeBmp(b: Uint8Array): Rgba | null {
  if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const offset = v.getUint32(10, true);
  const size = v.getUint32(14, true);
  const core = size === 12;
  const width = core ? v.getUint16(18, true) : v.getInt32(18, true);
  const rawHeight = core ? v.getInt16(20, true) : v.getInt32(22, true);
  const bpp = v.getUint16(core ? 24 : 28, true);
  const compression = core ? 0 : v.getUint32(30, true);
  const height = Math.abs(rawHeight);
  if (width <= 0 || height === 0 || width * height > 1 << 26) return null;
  if (compression !== 0 && compression !== 3 && compression !== 6) return null;
  // The masks: in the header (52 bytes or more), else just after a 40-byte one.
  let masks: [number, number, number, number] | null = null;
  if (compression === 3 || compression === 6) {
    const at = size >= 52 ? 54 : 14 + size;
    if (at + 12 > b.length) return null;
    const alpha = size >= 56 || compression === 6 ? v.getUint32(at + 12, true) : 0;
    masks = [v.getUint32(at, true), v.getUint32(at + 4, true), v.getUint32(at + 8, true), alpha];
  } else if (bpp === 16) masks = [0x7c00, 0x03e0, 0x001f, 0];
  else if (bpp === 32) masks = [0xff0000, 0xff00, 0xff, 0];
  const channel = (px: number, mask: number) => {
    if (!mask) return 255;
    let shift = 0;
    while (!((mask >>> shift) & 1)) shift++;
    const max = mask >>> shift;
    return Math.round((((px & mask) >>> shift) * 255) / max);
  };
  const entry = core ? 3 : 4;
  const colours = bpp <= 8 ? (core ? 0 : v.getUint32(46, true)) || 1 << bpp : 0;
  const palette = 14 + size + (compression === 3 && size === 40 ? 12 : compression === 6 && size === 40 ? 16 : 0);
  const stride = Math.ceil((bpp * width) / 32) * 4;
  if (![1, 4, 8, 16, 24, 32].includes(bpp) || offset + stride * height > b.length) return null;
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const src = offset + (rawHeight > 0 ? height - 1 - row : row) * stride;
    for (let x = 0; x < width; x++) {
      const o = (row * width + x) * 4;
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 255;
      if (bpp <= 8) {
        const bit = x * bpp;
        const index = (b[src + (bit >> 3)]! >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        if (index >= colours) return null;
        const p = palette + index * entry;
        [bl, g, r] = [b[p]!, b[p + 1]!, b[p + 2]!];
      } else if (bpp === 24) [bl, g, r] = [b[src + x * 3]!, b[src + x * 3 + 1]!, b[src + x * 3 + 2]!];
      else {
        const px = bpp === 16 ? v.getUint16(src + x * 2, true) : v.getUint32(src + x * 4, true);
        [r, g, bl] = [channel(px, masks![0]), channel(px, masks![1]), channel(px, masks![2])];
        if (masks![3]) a = channel(px, masks![3]);
      }
      out.set([r, g, bl, a], o);
    }
  }
  return { width, height, data: out };
}

type WebpDecode = (buffer: ArrayBuffer) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
let webp: Promise<WebpDecode> | null = null;

/** A WebP's pixels, by libwebp; null where it can't be read. */
export async function decodeWebp(bytes: Uint8Array): Promise<Rgba | null> {
  webp ??= (async () => {
    const mod = await import("@jsquash/webp/decode.js");
    // Its WebAssembly given, not fetched: from the file Bun embeds in a compiled slipbox.
    await (mod.init as unknown as (module: WebAssembly.Module) => Promise<void>)(
      new WebAssembly.Module(readFileSync(wasm)),
    );
    return mod.default as WebpDecode;
  })();
  try {
    const img = await (await webp)(bytes.slice().buffer as ArrayBuffer);
    return {
      width: img.width,
      height: img.height,
      data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    };
  } catch {
    return null;
  }
}

/** A GIF's first frame as a PNG, drawn by resvg inside an SVG; null where it can't be. */
function gifPng(bytes: Uint8Array, width: number, height: number, r: Rasterizer | null): Uint8Array | null {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/gif;base64,${Buffer.from(bytes).toString("base64")}" width="${width}" height="${height}"/></svg>`;
  return r?.png(svg, width) ?? null;
}

/** A raster picture as a PNG: BMP, GIF and WebP decoded and written again; one already a PNG as it is. */
export async function toPng(bytes: Uint8Array, r: Rasterizer | null): Promise<Uint8Array | null> {
  const info = rasterInfo(bytes);
  if (!info) return null;
  if (info.type === "png") return bytes;
  if (info.type === "bmp") {
    const img = decodeBmp(bytes);
    return img ? encodePng(img) : null;
  }
  if (info.type === "webp") {
    const img = await decodeWebp(bytes);
    return img ? encodePng(img) : null;
  }
  if (info.type === "gif") return gifPng(bytes, info.width, info.height, r);
  return null;
}

/**
 * Every picture of `doc` a format doesn't hold — a file of a raster kind not in `kinds` — made a PNG first, in place:
 * its bytes on the picture, which is read from them. One that can't be is left, and is its words.
 */
export async function convertPictures(doc: ExportDoc, kinds: Raster["type"][], r: Rasterizer | null): Promise<void> {
  const done = new Map<string, Uint8Array | null>();
  const visit = async (nodes: readonly unknown[]) => {
    for (const n of nodes as { type: string; data?: { picture?: ExportPicture }; children?: unknown[] }[]) {
      const pic = n.data?.picture;
      if (pic?.file && !pic.data && !pic.outside) {
        if (!done.has(pic.file)) {
          let bytes: Uint8Array | null = null;
          try {
            bytes = readExportAsset(pic.file);
          } catch {}
          const info = bytes ? rasterInfo(bytes) : null;
          done.set(pic.file, bytes && info && !kinds.includes(info.type) ? await toPng(bytes, r) : null);
        }
        const png = done.get(pic.file);
        if (png) pic.data = png;
      }
      if (n.children) await visit(n.children);
    }
  };
  for (const ch of doc.chapters) await visit(ch.nodes);
}
