import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, inflateSync } from "node:zlib";

/** A plain blue rectangle, `w` by `h`: a picture with nothing in it. */
export const rect = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#0969da"/></svg>`;
/** A real WebP from the reference set: a harbour photo, 240 by 160. */
export const WEBP = readFileSync(
  join(import.meta.dir, "../..", "examples", "home", "hobbies", "photography", "images", "harbour-01.webp"),
);
/** A GIF of one red pixel. */
export const GIF = Buffer.from("R0lGODdhAQABAIABAP8AAP///ywAAAAAAQABAAACAkQBADs=", "base64");

/** A BMP made byte by byte: `rows` as the file holds them (bottom-up unless `height` is negative), each padded to 4. */
export function bmpFile(
  width: number,
  height: number,
  bpp: number,
  rows: number[][],
  o: { palette?: number[]; masks?: number[]; compression?: number; core?: boolean } = {},
): Uint8Array {
  const header = o.core ? 12 : 40;
  const masks = o.masks ?? [];
  const palette = o.palette ?? [];
  const stride = Math.ceil((bpp * width) / 32) * 4;
  const offset = 14 + header + masks.length * 4 + palette.length;
  const b = new Uint8Array(offset + stride * Math.abs(height));
  const v = new DataView(b.buffer);
  b.set([0x42, 0x4d]);
  v.setUint32(2, b.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, header, true);
  if (o.core) {
    v.setUint16(18, width, true);
    v.setInt16(20, height, true);
    v.setUint16(22, 1, true);
    v.setUint16(24, bpp, true);
  } else {
    v.setInt32(18, width, true);
    v.setInt32(22, height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, bpp, true);
    v.setUint32(30, o.compression ?? 0, true);
    if (palette.length) v.setUint32(46, palette.length / 4, true);
  }
  masks.forEach((m, i) => v.setUint32(14 + header + i * 4, m, true));
  b.set(palette, 14 + header + masks.length * 4);
  rows.forEach((row, i) => b.set(row, offset + i * stride));
  return b;
}

/** A PNG's pixels, as `encodePng` writes them (each row unfiltered). */
export function pngPixels(png: Uint8Array): { width: number; height: number; data: number[] } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const [width, height] = [v.getUint32(16), v.getUint32(20)];
  // Eight bits a channel, red, green, blue and alpha.
  expect([png[24], png[25]]).toEqual([8, 6]);
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length; ) {
    const len = v.getUint32(at);
    // Each chunk's check: over its type and its data.
    expect(v.getUint32(at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)));
    if (new TextDecoder().decode(png.subarray(at + 4, at + 8)) === "IDAT")
      idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    expect(rows[y * (width * 4 + 1)]).toBe(0);
    data.push(...rows.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)));
  }
  return { width, height, data };
}
