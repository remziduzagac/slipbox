import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";
import { assemble, type ExportPicture } from "../../../../../src/core/rendering/export/assemble.ts";
import {
  convertPictures,
  decodeBmp,
  decodeWebp,
  encodePng,
  toPng,
} from "../../../../../src/core/rendering/export/assets/convert.ts";
import { rasterInfo, rasterOf } from "../../../../../src/core/rendering/export/assets/images.ts";
import { loadRasterizer } from "../../../../../src/core/rendering/media/images/svg.ts";
import { makeExportFixture, png } from "../../../../support/export-fixture.ts";
import { rect, WEBP, GIF, bmpFile, pngPixels } from "../../../../support/export-pictures.ts";
import { pictures } from "../../../../support/export-nodes.ts";
import { unzip } from "../../../../support/export-readers.ts";

// Drawing diagrams and maths, writing a document: slow on a loaded machine, not stuck.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { root, exportOf } = makeExportFixture();

describe("export: pictures made PNG before an export (10.10)", () => {
  test("a PNG written: its size, its pixels as given, row by row", () => {
    const pixels = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 1, 2, 3, 4, 9, 9, 9, 9, 200, 100, 50, 25];
    const out = encodePng({ width: 3, height: 2, data: new Uint8Array(pixels) });
    expect(rasterInfo(out)).toEqual({ type: "png", width: 3, height: 2 });
    expect(pngPixels(out)).toEqual({ width: 3, height: 2, data: pixels });
  });

  test("a BMP read: 24 bits bottom-up, a palette top-down, 1 bit across a byte, 5-5-5, masks with alpha, the old header", () => {
    const px = (img: ReturnType<typeof decodeBmp>) => (img ? [img.width, img.height, ...img.data] : null);
    // Stored bottom row first: blue, white; then red, green.
    expect(
      px(
        decodeBmp(
          bmpFile(2, 2, 24, [
            [255, 0, 0, 255, 255, 255],
            [0, 0, 255, 0, 255, 0],
          ]),
        ),
      ),
    ).toEqual([2, 2, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const palette = [0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0];
    expect(px(decodeBmp(bmpFile(3, -1, 8, [[0, 1, 2]], { palette })))).toEqual([
      3, 1, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
    const bw = [0, 0, 0, 0, 255, 255, 255, 0];
    const nine = decodeBmp(bmpFile(9, 1, 1, [[0b10101010, 0b10000000]], { palette: bw }))!;
    expect([...nine.data].filter((_, i) => i % 4 === 0)).toEqual([255, 0, 255, 0, 255, 0, 255, 0, 255]);
    const rgb555 = decodeBmp(bmpFile(3, 1, 16, [[0x00, 0x7c, 0xe0, 0x03, 0x1f, 0x00]]))!;
    expect([...rgb555.data]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const alpha = decodeBmp(
      bmpFile(1, 1, 32, [[0, 0, 255, 0x80]], { compression: 6, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }),
    )!;
    expect([...alpha.data]).toEqual([255, 0, 0, 128]);
    // 32 bits with no masks: the fourth byte is no alpha.
    expect([...decodeBmp(bmpFile(1, 1, 32, [[0, 255, 0, 0]]))!.data]).toEqual([0, 255, 0, 255]);
    expect(px(decodeBmp(bmpFile(1, 1, 24, [[10, 20, 30]], { core: true })))).toEqual([1, 1, 30, 20, 10, 255]);
  });

  test("what isn't a BMP it reads, null: run-length encoded, cut short, another kind", () => {
    expect(decodeBmp(bmpFile(2, 1, 8, [[0, 0]], { compression: 1 }))).toBeNull();
    expect(decodeBmp(bmpFile(2, 2, 24, [[1, 2, 3, 4, 5, 6]]).subarray(0, 60))).toBeNull();
    expect(decodeBmp(png)).toBeNull();
  });

  test("a WebP read by libwebp; one it can't, null", async () => {
    const img = (await decodeWebp(WEBP))!;
    expect([img.width, img.height, img.data.length]).toEqual([240, 160, 240 * 160 * 4]);
    expect([...img.data.subarray(0, 4)]).toEqual([45, 79, 118, 255]);
    expect(
      await decodeWebp(
        new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]),
      ),
    ).toBeNull();
  });

  test("a raster as a PNG: a PNG as it is, a BMP, a GIF, a WebP made one; a JPEG not", async () => {
    const r = await loadRasterizer();
    expect(await toPng(png, r)).toBe(png);
    for (const [bytes, size] of [
      [bmpFile(1, 1, 24, [[0, 0, 255]]), [1, 1]],
      [GIF, [1, 1]],
      [WEBP, [240, 160]],
    ] as const)
      expect(rasterInfo((await toPng(bytes, r))!)).toEqual({ type: "png", width: size[0], height: size[1] });
    expect(
      await toPng(
        new Uint8Array([
          0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 3, 0, 0, 0, 0, 0, 0,
        ]),
        r,
      ),
    ).toBeNull();
  });

  test("a document's pictures of a kind the format doesn't hold made PNG, each file once; the rest as they are", async () => {
    const r = root({
      "a.md": "# A\n\n![w](w.webp) ![b](b.bmp) ![p](p.png) ![again](w.webp)\n",
      "w.webp": WEBP,
      "b.bmp": bmpFile(1, 1, 24, [[0, 0, 255]]),
      "p.png": png,
    });
    const doc = await assemble(r.graph, ["a.md"]);
    await convertPictures(doc, ["png", "jpg"], await loadRasterizer());
    const pics = pictures(doc).map((p) => p.picture!);
    expect(pics.map((p) => (p.data ? rasterInfo(p.data)?.type : null))).toEqual(["png", "png", null, "png"]);
    expect(pics[0]!.data).toBe(pics[3]!.data!);
    // A format that holds WebP: left as it is.
    const kept = await assemble(r.graph, ["a.md"]);
    await convertPictures(kept, ["png", "jpg", "webp"], await loadRasterizer());
    expect(pictures(kept)[0]!.picture!.data).toBeUndefined();
  });

  test("an e-book's BMP made PNG: an EPUB holds none", async () => {
    const r = root({
      "a.md": "# A\n\n![dot](d.bmp) ![w](w.webp)\n",
      "d.bmp": bmpFile(1, 1, 24, [[0, 0, 255]]),
      "w.webp": WEBP,
    });
    const z = unzip((await exportOf(r, ["a.md"], "epub")).data);
    expect(
      [...z.keys()]
        .filter((k) => k.startsWith("OEBPS/images/"))
        .map((k) => k.split(".").pop())
        .sort(),
    ).toEqual(["png", "webp"]);
  });
});

describe("export: pictures' sizes, read from their headers", () => {
  test("PNG, GIF, BMP, WebP (lossy, lossless, extended) and JPEG; anything else null", () => {
    const b = (...xs: (number | string)[]) =>
      new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...new TextEncoder().encode(x)] : [x])));
    const zeros = (n: number) => Array<number>(n).fill(0);
    expect(rasterInfo(png)).toEqual({ type: "png", width: 40, height: 20 });
    expect(rasterInfo(b("GIF89a", 0x2c, 1, 0x58, 2, ...zeros(4)))).toEqual({ type: "gif", width: 300, height: 600 });
    expect(rasterInfo(b("BM", ...zeros(16), 0x10, 0, 0, 0, 0xf0, 0xff, 0xff, 0xff, ...zeros(4)))).toEqual({
      type: "bmp",
      width: 16,
      height: 16,
    });
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8 ", ...zeros(10), 0x40, 1, 0xf0, 0, ...zeros(2)))).toEqual({
      type: "webp",
      width: 320,
      height: 240,
    });
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8L", ...zeros(4), 0x2f, 0x3f, 0x40, 0x3b, 0, ...zeros(8)))).toEqual(
      { type: "webp", width: 64, height: 238 },
    );
    expect(rasterInfo(b("RIFF", ...zeros(4), "WEBPVP8X", ...zeros(8), 0x1f, 3, 0, 0xdf, 1, 0))).toEqual({
      type: "webp",
      width: 800,
      height: 480,
    });
    // JPEG: past an APP0 segment to the start of frame.
    expect(
      rasterInfo(b(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 3, ...zeros(6))),
    ).toEqual({ type: "jpg", width: 640, height: 480 });
    expect(rasterInfo(b("not a picture at all, just words"))).toBeNull();
  });

  test("a picture's size shown: its own, Obsidian's width or box, never past the page; an SVG rasterised at twice that", async () => {
    const r = await loadRasterizer();
    const { dir } = root({ "p.png": png, "wide.svg": rect(1000, 500) });
    const shown = (pic: ExportPicture, max = 600) => rasterOf(pic, r, max, ["png"])?.shown;
    expect(shown({ file: join(dir, "p.png") })).toEqual({ width: 40, height: 20 });
    expect(shown({ file: join(dir, "p.png"), size: { width: 30, height: null } })).toEqual({ width: 30, height: 15 });
    expect(shown({ file: join(dir, "p.png"), size: { width: 300, height: 10 } })).toEqual({ width: 20, height: 10 });
    expect(shown({ file: join(dir, "p.png") }, 16)).toEqual({ width: 16, height: 8 });
    const svg = rasterOf({ file: join(dir, "wide.svg") }, r, 600, ["png"])!;
    expect([svg.type, svg.shown, svg.width]).toEqual(["png", { width: 600, height: 300 }, 1200]);
    // A kind the format doesn't hold, or nothing there: null.
    expect(rasterOf({ file: join(dir, "p.png") }, r, 600, ["jpg"])).toBeNull();
    expect(rasterOf({ file: join(dir, "none.png") }, r, 600, ["png"])).toBeNull();
  });
});
