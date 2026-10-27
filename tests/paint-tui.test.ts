import { expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { OptimizedBuffer, type RenderContext } from "@opentui/core";
import { onLoaded } from "../src/core/foundation/platform/lazy.ts";
import { loadRasterizer } from "../src/core/rendering/media/images/svg.ts";
import { BufferCanvas, Pictures } from "../src/tui/opentui.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

makeSandbox();
test("a native picture arriving invalidates its fallback layout", async () => {
  const root = makeVault();
  const file = join(root, "picture.png");
  const r = (await loadRasterizer())!;
  writeFileSync(file, r.png('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', 80)!);
  writeFileSync(join(root, "picture.md"), "# Picture\n\n![alt](picture.png)\n");
  const pictures = new Pictures(() => "kitty");
  const h = await harness({
    root,
    open: "picture.md",
    images: {
      supported: () => true,
      cell: () => ({ width: 8, height: 16 }),
      size: (path) => pictures.size(path),
    },
  });
  try {
    const initial = h.app.currentLayout(h.app.view!);
    expect(initial.lines.some((line) => line.image)).toBe(false);
    expect(initial.pending).toContain("pictures");
    await pictures.prepare(file);
    const ready = h.app.currentLayout(h.app.view!);
    expect(ready.lines.some((line) => line.image)).toBe(true);
  } finally {
    pictures.releaseAll();
  }
});

test("pictures drawn every frame stay decoded: with ten on screen, the decoding stops", async () => {
  const root = makeVault();
  const r = (await loadRasterizer())!;
  const files = Array.from({ length: 10 }, (_, i) => {
    const file = join(root, `p${i}.png`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#${i}0${i}0${i}0"/></svg>`;
    writeFileSync(file, r.png(svg, 1200)!);
    return file;
  });
  const pictures = new Pictures(() => "kitty", { write: () => {}, cell: () => ({ width: 8, height: 16 }) });
  // Its jobs' own wait: a frame's decodes in, as the next frame would find them.
  const settle = () => (pictures as unknown as { jobs: { settle(): Promise<void> } }).jobs.settle();
  const buf = OptimizedBuffer.create(20, 4, "unicode");
  let decoded = 0;
  const stop = onLoaded((name) => void (name === "pictures" && decoded++));
  try {
    const frame = async () => {
      for (const f of files) pictures.draw(buf, 0, 0, 1, 1, f, { skip: 0, total: 1, left: 0, wide: 1 });
      await settle();
    };
    // Eight decoded at a time, and finished ones kept within the jobs' budget until a frame takes them: a few frames.
    for (let i = 0; i < 4; i++) await frame();
    const settled = decoded;
    for (let i = 0; i < 4; i++) await frame();
    expect(decoded).toBe(settled);
    expect(settled).toBeLessThanOrEqual(2 * files.length);
  } finally {
    stop();
    pictures.releaseAll();
    buf.destroy();
  }
});

test("the picture drawn every frame is kept while 24 others are drawn once each: it's the last to go, not the first", async () => {
  const root = makeVault();
  const r = (await loadRasterizer())!;
  // Big enough that the jobs' own budget keeps only the last few: one let go here is decoded again.
  const png = r.png(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="9" height="9"/></svg>',
    1200,
  )!;
  const files = Array.from({ length: 25 }, (_, i) => join(root, `q${i}.png`));
  for (const f of files) writeFileSync(f, png);
  const pictures = new Pictures(() => "kitty", { write: () => {}, cell: () => ({ width: 8, height: 16 }) });
  const settle = () => (pictures as unknown as { jobs: { settle(): Promise<void> } }).jobs.settle();
  const buf = OptimizedBuffer.create(20, 4, "unicode");
  let decoded = 0;
  const stop = onLoaded((name) => void (name === "pictures" && decoded++));
  try {
    // Each frame: the first, and the next of the others, twice (decoded, then taken).
    for (const f of files.slice(1)) {
      for (let twice = 0; twice < 2; twice++) {
        for (const g of [files[0]!, f]) pictures.draw(buf, 0, 0, 1, 1, g, { skip: 0, total: 1, left: 0, wide: 1 });
        await settle();
      }
    }
    pictures.draw(buf, 0, 0, 1, 1, files[0]!, { skip: 0, total: 1, left: 0, wide: 1 });
    await settle();
    expect(decoded).toBe(files.length);
  } finally {
    stop();
    pictures.releaseAll();
    buf.destroy();
  }
});

test("native INSERT cursor translates canvas cells to terminal coordinates", () => {
  const positions: unknown[] = [];
  const context = {
    setCursorStyle: () => {},
    setCursorPosition: (...args: unknown[]) => positions.push(args),
  } as unknown as RenderContext;
  const buf = OptimizedBuffer.create(20, 4, "unicode");
  try {
    const canvas = new BufferCanvas(buf, undefined, context);
    canvas.cursor({ x: 0, y: 0 });
    canvas.cursor({ x: 7, y: 2 });
    canvas.cursor(null);
    expect(positions).toEqual([
      [1, 1, true],
      [8, 3, true],
      [0, 0, false],
    ]);
  } finally {
    buf.destroy();
  }
});
