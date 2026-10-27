import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay, Host } from "../../../../src/tui/app/runtime/app.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import type { Layout } from "../../../../src/core/rendering/layout/ir.ts";
import { loadRasterizer, rasterizer } from "../../../../src/core/rendering/media/images/svg.ts";
import { loadMermaid, mermaidSvg } from "../../../../src/core/rendering/media/diagrams/diagrams.ts";
import { loadTypesetter } from "../../../../src/core/rendering/media/typeset.ts";
import { paintJobs } from "../../../../src/core/rendering/media/paint/paint-jobs.ts";
import { colorHex } from "../../../../src/core/rendering/theme/theme.ts";
import { svgText } from "../../../../src/tui/documents/media/images.ts";
import {
  idColor,
  pictureId,
  placeholderCell,
  placeholderRow,
  release,
  transmit,
} from "../../../../src/tui/shell/terminal/placeholders.ts";
import { Pictures } from "../../../../src/tui/shell/terminal/opentui.ts";
import { OptimizedBuffer } from "@opentui/core";
import { inflateSync } from "node:zlib";

import { PICTURES_REST_MS } from "../../../../src/tui/documents/media/pictures.ts";
import { makeSandbox, makeVault, harness, lineText, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("pictures (12.x)", () => {
  // A terminal that draws images, its cells 8 × 16 pixels; the image files' sizes as it would read them.
  const terminal = (supported: boolean, sizes: Record<string, { width: number; height: number }>): Host["images"] => ({
    supported: () => supported,
    size: (path) => sizes[basename(path)] ?? null,
    cell: () => ({ width: 8, height: 16 }),
  });
  const note = `# P\n\nText before.\n\n![chart](chart.png)\n\nAfter, ![icon](chart.png) inline.\n\n![web](https://example.invalid/chart.png)\n\n${Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`).join("\n\n")}\n`;
  const open = async (supported = true, config?: (c: Config) => void, height = 40) => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), note);
    writeFileSync(join(root, "chart.png"), "a stand-in: its size is the terminal's to say");
    const h = await harness({
      root,
      open: "p.md",
      width: 100,
      height,
      config,
      images: terminal(supported, { "chart.png": { width: 400, height: 200 } }),
    });
    return { h, v: h.app.view!, root };
  };
  test("a local picture alone in its paragraph: its image rows, then a caption box — sized to its proportions, fitted to its window; beside text, on the internet, or missing: ▣ alt alone", async () => {
    const { h, v, root } = await open();
    const layout = h.app.currentLayout(v);
    const picture = layout.lines.findIndex((line) => line.image);
    const alt = layout.lines.findIndex((line) => line.caption?.text === "chart");
    expect(alt).toBeGreaterThan(picture + 12);
    // 400 × 200 pixels in 8 × 16 cells: 50 columns by 13 rows, its own size, which the window has room for.
    expect(layout.lines[picture]).toMatchObject({
      decor: false,
      spans: [],
      image: { src: join(root, "chart.png"), cols: 50, rows: 13 },
    });
    expect(layout.lines.slice(picture + 1, picture + 13).every((l) => l.decor && !l.spans.length && !l.image)).toBe(
      true,
    );
    expect(layout.lines[alt + 3]!.spans.length).toBe(0); // the gap after the paragraph
    // Drawn over its rows, from the text column.
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    expect(c.images).toEqual([
      {
        x: pane.textX,
        y: pane.y + picture - v.top,
        cols: 50,
        rows: 13,
        src: join(root, "chart.png"),
        skip: 0,
        total: 13,
        left: 0,
        wide: 50,
      },
    ]);
    // An image beside text, or on the internet: its ▣ alt line alone.
    expect(layout.lines.some((l) => l.spans.some((s) => s.text === "▣ icon"))).toBe(true);
    expect(layout.lines.filter((l) => l.image)).toHaveLength(1);
  });
  test("a step of scrolling draws its pictures; quick steps after it don't, until it rests — then a frame draws them (12.7)", async () => {
    const { h, v } = await open(true, undefined, 30);
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    v.pictures = undefined; // what the harness drew before this clock
    let asked = 0;
    h.app.host.requestRender = () => void asked++;
    const drawn = () => h.canvas().images.length > 0;
    expect(drawn()).toBe(true); // opened
    const step = (ms: number) => {
      t += ms;
      v.top += 1;
    };
    step(10);
    expect(drawn()).toBe(true); // the first step, however soon: a step
    step(1000);
    expect(drawn()).toBe(true); // one step, a while after: drawn at once
    step(40);
    expect(drawn()).toBe(false); // quick: not sent again
    step(40);
    expect(drawn()).toBe(false);
    t += 50;
    expect(drawn()).toBe(false); // not rested yet
    t += 80;
    expect(drawn()).toBe(true); // rested: drawn where it is now
    // The frame that draws them asks for itself.
    step(1000);
    expect(drawn()).toBe(true);
    step(40);
    asked = 0;
    expect(drawn()).toBe(false);
    await Bun.sleep(PICTURES_REST_MS + 40);
    expect(asked).toBeGreaterThan(0);
  });
  test("scrolled so its top is out of sight: the rest drawn, cut where it shows", async () => {
    const { h, v } = await open();
    const layout = h.app.currentLayout(v);
    const first = layout.lines.findIndex((l) => l.image);
    v.top = first + 5;
    const c = h.canvas();
    const pane = h.app.geometry!.panes[0]!;
    expect(c.images).toEqual([expect.objectContaining({ y: pane.y, rows: 8, skip: 5, total: 13 })]);
  });
  test("where the terminal draws no images, or [render] images = never: the note as it was — ▣ alt and its path, nothing more", async () => {
    for (const [supported, setting] of [
      [false, "auto"],
      [true, "never"],
    ] as const) {
      const { h, v } = await open(supported, (c) => (c.render.images = setting));
      const layout = h.app.currentLayout(v);
      expect(layout.lines.some((l) => l.image)).toBe(false);
      const alt = layout.lines.findIndex((l) => l.spans.some((s) => s.text === "▣ chart"));
      expect(layout.lines[alt + 1]!.caption?.text).toBe("chart"); // the caption's closing border
      expect(layout.lines[alt + 2]!.spans.length).toBe(0); // the paragraph gap
      expect(layout.lines[alt + 3]!.spans.map((s) => s.text).join("")).toContain("After,");
      expect(h.canvas().images).toEqual([]);
    }
  });
  test("a picture embedded by name, `![[chart.png]]` (12.13): found as its link is, in another folder or root too, and drawn as a path's is — `|80` its width, `|400x32` the box it fits in; two of the name tied, or beside text: ▣ alone", async () => {
    const root = makeVault();
    for (const d of ["gallery", "shots", "twin-a", "twin-b"]) mkdirSync(join(root, d));
    const md =
      "# N\n\n![[chart.png]]\n\n![[chart.png|80]]\n\n![[chart.png|400x32]]\n\n![[twin.png]]\n\nBeside ![[chart.png]] text.\n\n![[gallery-other]]\n![[chart.png|80]]\n\n![[nested-vault/inner.png|80]]\n";
    writeFileSync(join(root, "gallery", "n.md"), md);
    writeFileSync(join(root, "gallery", "gallery-other.md"), "# Other\n\nHello.\n");
    for (const f of ["shots/chart.png", "twin-a/twin.png", "twin-b/twin.png", "nested-vault/inner.png"])
      writeFileSync(join(root, f), "x");
    const sizes = {
      "chart.png": { width: 400, height: 200 },
      "twin.png": { width: 400, height: 200 },
      "inner.png": { width: 400, height: 200 },
    };
    const h = await harness({ root, open: "gallery/n.md", width: 100, height: 40, images: terminal(true, sizes) });
    const layout = h.app.currentLayout(h.app.view!);
    const chart = join(root, "shots", "chart.png");
    // 400 × 200 in 8 × 16 cells: its own size 50 × 13; 80 pixels wide, 10 × 3; 64 by 32, 8 × 2.
    const drawn = layout.lines
      .filter((l) => l.image)
      .map((l) => [l.src, { src: l.image!.src, cols: l.image!.cols, rows: l.image!.rows }]);
    expect(drawn).toEqual([
      [3, { src: chart, cols: 50, rows: 13 }],
      [5, { src: chart, cols: 10, rows: 3 }],
      [7, { src: chart, cols: 8, rows: 2 }],
      [14, { src: chart, cols: 10, rows: 3 }],
      [16, { src: join(root, "nested-vault", "inner.png"), cols: 10, rows: 3 }], // a root inside this one: its path
    ]);
    // The tied name and the one beside text: their ▣ name alone; the note beside a picture framed in place.
    expect(layout.lines.some((l) => lineText(l).includes("▣ twin.png"))).toBe(true);
    expect(layout.lines.some((l) => lineText(l).includes("Beside ▣ chart.png text."))).toBe(true);
    expect(layout.lines.some((l) => lineText(l).includes("Hello."))).toBe(true);
  });
  // Where a picture's `▣ alt` text starts on its row, and where each picture is drawn: the column past the text's.
  const altAt = (layout: Layout, alt: string) =>
    layout.lines.flatMap((l) => {
      const k = l.spans.findIndex((sp) => sp.text === alt);
      return k < 0 ? [] : [l.spans.slice(0, k).reduce((w, sp) => w + stringWidth(sp.text), 0) - 2];
    });
  const drawnAt = (h: Harness) => h.canvas().images.map((im) => im.x - h.app.geometry!.panes[0]!.textX);
  test("a picture in an embedded note (12.14): found from where that note is — its path from its folder, its name from its place — and drawn inside its frame, an embed's in an embed's too", async () => {
    const root = makeVault();
    for (const d of ["frames", "frames/sub", "frames/sub/deep"]) mkdirSync(join(root, d));
    writeFileSync(join(root, "frames", "host.md"), "# Host\n\n![[frame-inner]]\n");
    writeFileSync(
      join(root, "frames", "sub", "frame-inner.md"),
      "# Inner\n\n![chart](chart.png)\n\n![[spot.png|80]]\n\n![[frame-deeper]]\n",
    );
    writeFileSync(join(root, "frames", "sub", "deep", "frame-deeper.md"), "# Deeper\n\n![deep chart](chart.png)\n");
    // Two of each: the host's folder has its own, which the embedded notes' must not be taken for.
    for (const f of [
      "frames/chart.png",
      "frames/spot.png",
      "frames/sub/chart.png",
      "frames/sub/spot.png",
      "frames/sub/deep/chart.png",
    ])
      writeFileSync(join(root, f), "x");
    const sizes = { "chart.png": { width: 400, height: 200 }, "spot.png": { width: 400, height: 200 } };
    const h = await harness({ root, open: "frames/host.md", width: 100, height: 80, images: terminal(true, sizes) });
    const layout = h.app.currentLayout(h.app.view!);
    const sub = join(root, "frames", "sub");
    // Inside its frame: two columns narrower than the note, each embed's.
    expect(
      layout.lines.filter((l) => l.image).map((l) => ({ src: l.image!.src, cols: l.image!.cols, rows: l.image!.rows })),
    ).toEqual([
      { src: join(sub, "chart.png"), cols: 50, rows: 13 },
      { src: join(sub, "spot.png"), cols: 10, rows: 3 },
      { src: join(sub, "deep", "chart.png"), cols: 50, rows: 13 },
    ]);
    // Drawn past its frame's bar, where its ▣ alt line's text starts.
    const bars = [...altAt(layout, "▣ chart"), ...altAt(layout, "▣ spot.png"), ...altAt(layout, "▣ deep chart")];
    expect(bars).toEqual([2, 2, 4]);
    expect(drawnAt(h)).toEqual(bars);
  });
  test("a picture in a list item or a quote: drawn where its ▣ alt text starts, past the bullet or the bar, never over them", async () => {
    const root = makeVault();
    writeFileSync(join(root, "indented.md"), "# I\n\n- ![listed](chart.png)\n\n> ![quoted](chart.png)\n");
    writeFileSync(join(root, "chart.png"), "x");
    const h = await harness({
      root,
      open: "indented.md",
      width: 100,
      height: 60,
      images: terminal(true, { "chart.png": { width: 400, height: 200 } }),
    });
    const layout = h.app.currentLayout(h.app.view!);
    const starts = [...altAt(layout, "▣ listed"), ...altAt(layout, "▣ quoted")];
    expect(starts.every((x) => x > 0)).toBe(true);
    expect(drawnAt(h)).toEqual(starts);
  });
  describe("as Kitty's Unicode placeholders (12.7)", () => {
    const PH = "\u{10EEEE}";
    test("a row of cells: the placeholder, its row's mark, its column's — Kitty's marks for 0, 1, 2", () => {
      expect(placeholderRow(1, 3)).toBe(`${PH}\u030D\u0305${PH}\u030D\u030D${PH}\u030D\u030E`);
      expect(placeholderRow(0, 1)).toBe(`${PH}\u0305\u0305`);
      expect(idColor(42)).toBe("#00002a");
      const id = pictureId("/p.png", 10, 3);
      expect(id).toBe(pictureId("/p.png", 10, 3));
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(0xffffff);
      expect(
        new Set([id, pictureId("/p.png", 11, 3), pictureId("/p.png", 10, 4), pictureId("/q.png", 10, 3)]).size,
      ).toBe(4);
      // One whose hash would make it 0 — no id, to Kitty — is 1 (found by searching).
      expect(pictureId("/p14964393.png", 1, 1)).toBe(1);
    });
    test("a cell read back: its row and column from its marks; any other text, none", () => {
      const cells = [...placeholderRow(7, 200)].join("").match(/\u{10EEEE}[^\u{10EEEE}]*/gu)!;
      expect(cells.map(placeholderCell)).toEqual(Array.from({ length: 200 }, (_, col) => ({ row: 7, col })));
      expect(placeholderCell("a")).toBeNull();
      expect(placeholderCell(PH)).toBeNull();
      expect(placeholderCell(`${PH}\u0305x`)).toBeNull();
    });
    test("sent once, quietly: its pixels compressed in chunks with a virtual placement of its cells; let go by id", () => {
      const parts = (s: string) =>
        [...s.matchAll(/\x1b_G([^;]*);([^\x1b]*)\x1b\\/g)].map((m) => ({ keys: m[1]!, data: m[2]! }));
      const small = parts(transmit(42, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 2, 1, 3, 1));
      expect(small.map((p) => p.keys)).toEqual(["a=T,U=1,f=32,o=z,s=2,v=1,i=42,c=3,r=1,q=2,m=0"]);
      expect([...inflateSync(Buffer.from(small[0]!.data, "base64"))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      // Noise: nothing for deflate to shorten, so several chunks.
      let seed = 1;
      const noise = Uint8Array.from({ length: 20_000 }, () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return seed & 255;
      });
      const big = parts(transmit(7, noise, 100, 50, 10, 4));
      expect(big.length).toBeGreaterThan(2);
      expect(big[0]!.keys.endsWith("m=1")).toBe(true);
      expect(big.slice(1, -1).every((p) => p.keys === "m=1,q=2")).toBe(true);
      expect(big.at(-1)!.keys).toBe("m=0,q=2");
      expect(big.every((p) => p.data.length <= 4096)).toBe(true);
      expect([...inflateSync(Buffer.from(big.map((p) => p.data).join(""), "base64"))]).toEqual([...noise]);
      expect(release(42)).toBe("\x1b_Ga=d,d=I,i=42,q=2\x1b\\");
    });
    test("drawn through OpenTUI: sent once — scrolled, drawn again without sending — its cells text in its id's colour", async () => {
      const r = (await loadRasterizer())!;
      const file = join(mkdtempSync(join(sandbox, "ph-")), "p.png");
      writeFileSync(
        file,
        r.png(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#f00"/></svg>',
          64,
        )!,
      );
      const written: string[] = [];
      const pictures = new Pictures(() => "kitty", {
        write: (s) => written.push(s),
        cell: () => ({ width: 8, height: 16 }),
      });
      expect(pictures.usesPlaceholders()).toBe(true);
      const buf = OptimizedBuffer.create(20, 6, "unicode");
      // The frame's text, a line per row: a cell a cluster (its spans read placeholders as spaces; their colours are
      // right).
      const lines = () => {
        const cells = [...new Intl.Segmenter().segment(new TextDecoder().decode(buf.getRealCharBytes()))].map(
          (g) => g.segment,
        );
        return Array.from({ length: buf.height }, (_, y) => cells.slice(y * buf.width, (y + 1) * buf.width).join(""));
      };
      await pictures.prepare(file);
      pictures.draw(buf, 2, 1, 4, 2, file, { skip: 0, total: 2, left: 0, wide: 4 });
      expect(written).toHaveLength(1);
      // 64 × 32 pixels into 4 × 2 cells of 8 × 16: sent at the 32 × 16 it's drawn.
      expect(written[0]).toContain(",s=32,v=16,");
      expect(written[0]).toContain(",c=4,r=2,");
      const id = pictureId(`${file}\u0000${statSync(file).mtimeMs}`, 4, 2);
      expect(written[0]).toContain(`,i=${id},`);
      expect(lines()[1]).toStartWith(`  ${placeholderRow(0, 4)} `);
      expect(lines()[2]).toStartWith(`  ${placeholderRow(1, 4)} `);
      const cells = buf.getSpanLines()[1]!.spans[1]!;
      expect([cells.width, ...cells.fg.toInts().slice(0, 3)]).toEqual([4, (id >> 16) & 255, (id >> 8) & 255, id & 255]);
      // Scrolled: its second row at the top — the same picture, nothing sent.
      buf.clear();
      pictures.draw(buf, 2, 0, 4, 1, file, { skip: 1, total: 2, left: 0, wide: 4 });
      expect(written).toHaveLength(1);
      expect(lines()[0]).toStartWith(`  ${placeholderRow(1, 4)} `);
      // Quitting lets it go.
      pictures.releaseAll();
      expect(written.at(-1)).toBe(release(id));
      buf.destroy();
    });
    test("the oldest of more than 48 let go; with sixel, OpenTUI's own path — no placeholders", async () => {
      const r = (await loadRasterizer())!;
      const dir = mkdtempSync(join(sandbox, "ph-"));
      const written: string[] = [];
      const pictures = new Pictures(() => "kitty", {
        write: (s) => written.push(s),
        cell: () => ({ width: 8, height: 16 }),
      });
      const buf = OptimizedBuffer.create(20, 4, "unicode");
      const png = r.png('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>', 8)!;
      const files = Array.from({ length: 49 }, (_, i) => join(dir, `p${i}.png`));
      for (const f of files) writeFileSync(f, png);
      const idOf = (f: string) => pictureId(`${f}\u0000${statSync(f).mtimeMs}`, 1, 1);
      for (const f of files.slice(0, 48)) {
        await pictures.prepare(f);
        pictures.draw(buf, 0, 0, 1, 1, f, { skip: 0, total: 1, left: 0, wide: 1 });
      }
      // The first drawn again is the newest: the second is the oldest when the 49th comes.
      await pictures.prepare(files[0]!);
      pictures.draw(buf, 0, 0, 1, 1, files[0]!, { skip: 0, total: 1, left: 0, wide: 1 });
      await pictures.prepare(files[48]!);
      pictures.draw(buf, 0, 0, 1, 1, files[48]!, { skip: 0, total: 1, left: 0, wide: 1 });
      expect(written.filter((w) => w.startsWith("\x1b_Ga=d"))).toEqual([release(idOf(files[1]!))]);
      // Wider than its columns can be numbered: OpenTUI's own path.
      const wide = OptimizedBuffer.create(400, 2, "unicode");
      const sent = written.length;
      pictures.draw(wide, 0, 0, 298, 1, files[2]!, { skip: 0, total: 1, left: 0, wide: 298 });
      expect(written.length).toBe(sent);
      expect(new TextDecoder().decode(wide.getRealCharBytes())).not.toContain(PH);
      wide.destroy();
      const sixel = new Pictures(() => "sixel", {
        write: (s) => written.push(s),
        cell: () => ({ width: 8, height: 16 }),
      });
      expect(sixel.usesPlaceholders()).toBe(false);
      buf.clear();
      const before = written.length;
      sixel.draw(buf, 0, 0, 1, 1, files[1]!, { skip: 0, total: 1, left: 0, wide: 1 });
      expect(written.length).toBe(before);
      expect(new TextDecoder().decode(buf.getRealCharBytes(true))).not.toContain(PH);
      buf.destroy();
    });
  });
  test("as placeholders, pictures are drawn at every step; else a wheel holds them back from its first tick until it rests", async () => {
    const { h, v } = await open(true, undefined, 30);
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    v.pictures = undefined;
    const drawn = () => h.canvas().images.length > 0;
    expect(drawn()).toBe(true);
    // A wheel: held back from its first tick.
    t += 1000;
    h.app.mouse.handle({ type: "scroll", x: 50, y: 10, button: 0, scroll: { direction: "down", delta: 1 } });
    expect(v.top).toBeGreaterThan(0);
    expect(drawn()).toBe(false);
    t += PICTURES_REST_MS;
    expect(drawn()).toBe(true);
    // As placeholders: quick steps drawn too.
    h.app.host.images!.placeholders = () => true;
    for (let k = 0; k < 3; k++) {
      t += 10;
      v.top += 1;
      expect(drawn()).toBe(true);
    }
  });
  describe("SVG drawn, and what slipbox draws as pictures (12.15–12.17)", () => {
    beforeAll(async () => {
      await Promise.all([loadRasterizer(), loadMermaid(), loadTypesetter()]);
    });
    const SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#3080f0"/></svg>';
    const pngWidth = (path: string) => new DataView(readFileSync(path).buffer).getUint32(16);
    const at = async (
      note: string,
      config?: (c: Config) => void,
      files: Record<string, string> = {},
      cell = { width: 8, height: 16 },
    ) => {
      const root = makeVault();
      writeFileSync(join(root, "draw.md"), note);
      for (const [f, text] of Object.entries(files)) writeFileSync(join(root, f), text);
      const h = await harness({
        root,
        open: "draw.md",
        width: 100,
        height: 60,
        config,
        images: { ...terminal(true, {})!, cell: () => cell },
      });
      h.app.currentLayout(h.app.view!);
      await loadMermaid();
      let layout = h.app.currentLayout(h.app.view!);
      for (let i = 0; i < 10 && (layout.pending?.includes("pictures") || layout.pending?.includes("mermaid")); i++) {
        await Promise.all([paintJobs.settle(), loadMermaid()]);
        layout = h.app.currentLayout(h.app.view!);
      }
      return { h, layout };
    };
    test("an SVG picture: rasterised into the cache at its own size, and drawn as a PNG would be", async () => {
      const { layout } = await at("# D\n\n![chart](chart.svg)\n", undefined, { "chart.svg": SVG });
      // 400 × 200 in 8 × 16 cells: 50 by 13, rasterised 400 pixels wide.
      const p = layout.lines.find((l) => l.image)!.image!;
      // (Bun's toMatchObject writes an asymmetric matcher into what it matched: `src` read first.)
      const src = p.src;
      expect(p).toMatchObject({ cols: 50, rows: 13, src: expect.stringMatching(/svg-[0-9a-f]{32}-400\.png$/) });
      expect(pngWidth(src)).toBe(400);
    });
    test("a picture fetched and kept by its address is told an SVG by how it starts; a name says it", () => {
      const dir = mkdtempSync(join(sandbox, "svgs-"));
      const write = (name: string, text: string) => (writeFileSync(join(dir, name), text), join(dir, name));
      expect(svgText(write("0123abcd", `<?xml version="1.0"?>\n${SVG}`))).toContain("<svg");
      expect(svgText(write("4567abcd", "\x89PNG\r\n\x1a\n"))).toBeNull();
      expect(svgText(write("d.svg", SVG))).toBe(SVG);
      expect(svgText(write("d.png", SVG))).toBeNull(); // a PNG by its name: not read as text
      expect(svgText(write("big.svg", `${SVG}${" ".repeat(9 * 1024 * 1024)}`))).toBeNull(); // past 8 MB: not drawn
    });
    const mermaid = "# D\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
    test("Mermaid as a picture, as chosen: in the theme's colours, centred — drawn past its indent; as text by default", async () => {
      // A table's border unlike the frame's, to tell them apart.
      const { h, layout } = await at(
        mermaid,
        (c) => ((c.render.mermaid = "picture"), (c.colors = { table_border: "#a1b2c3" })),
      );
      const first = layout.lines.findIndex((l) => l.image);
      const p = layout.lines[first]!.image!;
      expect(p.src).toMatch(/svg-[0-9a-f]{32}-\d+\.png$/);
      const indent = layout.lines[first]!.spans[0]!.text.length;
      expect(indent).toBeGreaterThan(1); // narrower than the text: room either side
      const pane = h.app.geometry!.panes[0]!;
      expect(h.canvas().images.map((im) => im.x - pane.textX)).toEqual([indent]);
      // The theme's colours, each its role's.
      const t = h.app.theme;
      const fg = colorHex(t.roles.text.fg ?? t.fg, "?");
      const of = (r: keyof typeof t.roles) => colorHex(t.roles[r].fg ?? fg, fg);
      const pictures = h.app.pictures.forView(h.app.view!, 80)!;
      expect(pictures.drawings!.colors).toEqual({
        bg: colorHex(t.bg, "?"),
        fg,
        line: of("table_border"),
        accent: of("link"),
        muted: of("dim"),
        math: of("math"),
      });
      expect(pictures.drawings!.colors.line).toBe("#a1b2c3");
      // As big as the terminal's words would be: its 13-pixel words at 0.8 of the cell's height — a Retina one's here.
      const retina = await at(mermaid, (c) => (c.render.mermaid = "picture"), {}, { width: 16, height: 34 });
      const drawn = retina.layout.lines.find((l) => l.image)!.image!;
      const r = (await loadRasterizer())!;
      const colors = retina.h.app.pictures.forView(retina.h.app.view!, 80)!.drawings!.colors;
      const own = r.size(mermaidSvg("graph TD\n  A --> B", colors, rasterizer()!.family)!)!;
      expect(drawn.cols).toBe(Math.ceil((own.width * 34 * 0.8) / 13 / 16));
      const text = await at(mermaid);
      expect(text.layout.lines.some((l) => l.image)).toBe(false);
      expect(text.h.app.pictures.forView(text.h.app.view!, 80)!.key).not.toBe(pictures.key); // a choice changed: laid out again
    });
    test("a drawing taller than a picture may be: scrolled past its top, the rest still drawn", async () => {
      const chain = Array.from({ length: 8 }, (_, i) => `N${i}[Step ${i}]`).join(" --> ");
      const { h, layout } = await at(
        `# D\n\n\`\`\`mermaid\ngraph TD\n  ${chain}\n\`\`\`\n`,
        (c) => (c.render.mermaid = "picture"),
      );
      const first = layout.lines.findIndex((l) => l.image);
      const rows = layout.lines[first]!.image!.rows;
      const past = 13;
      expect(rows).toBeGreaterThan(past + 1);
      // Centred, as from its top: its indent is its first row's alone.
      const indent = layout.lines[first]!.spans.reduce((w, sp) => w + stringWidth(sp.text), 0);
      expect(indent).toBeGreaterThan(0);
      h.app.view!.top = first + past;
      const x = h.app.geometry!.panes[0]!.textX + indent;
      expect(h.canvas().images).toEqual([expect.objectContaining({ x, skip: past, total: rows })]);
    });
    test("a click on a drawing places the cursor, as on its rows before: it's no picture to show at its own size", async () => {
      const { h, layout } = await at(
        "# D\n\nText.\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nAfter.\n",
        (c) => (c.render.mermaid = "picture"),
      );
      const first = layout.lines.findIndex((l) => l.image);
      h.canvas();
      expect(h.app.geometry!.pictures).toEqual([]);
      const pane = h.app.geometry!.panes[0]!;
      const y = pane.y + first - h.app.view!.top;
      h.app.mouse.handle({ type: "down", x: pane.textX + 2, y, button: 0 });
      h.app.mouse.handle({ type: "up", x: pane.textX + 2, y, button: 0 });
      expect(h.app.view!.cur.row).toBe(first);
      expect(h.app.messages.some((m) => m.text.includes("no picture here"))).toBe(false);
      // z l on it: no picture of a file to scroll, said so (not "it fits the window").
      await h.keys("z", "l");
      expect(h.app.messages.at(-1)!.text).toContain("no picture here");
    });
    test("rasterised once: drawn from the cache after, not rasterised again", async () => {
      const { h, layout } = await at("# D\n\n![chart](chart.svg)\n", undefined, { "chart.svg": SVG });
      const src = layout.lines.find((l) => l.image)!.image!.src;
      writeFileSync(src, "kept");
      h.app.view!.buf.invalidateLayouts();
      h.app.relayoutAll();
      expect(h.app.currentLayout(h.app.view!).lines.find((l) => l.image)!.image!.src).toBe(src);
      expect(readFileSync(src, "utf8")).toBe("kept");
    });
    test("a display's maths as a picture, as chosen: typeset at the size of the words beside it; wider than the text, text", async () => {
      const { layout } = await at("# M\n\n$$\n\\frac{a}{b}\n$$\n", (c) => (c.render.math = "picture"));
      expect(layout.lines.find((l) => l.image)!.image).toMatchObject({
        cols: 2,
        rows: 2,
        src: expect.stringMatching(/svg-.*\.png$/),
      });
      const long = Array.from({ length: 60 }, (_, i) => `x_{${i}}`).join(" + ");
      const wide = await at(`# M\n\n$$\n${long}\n$$\n`, (c) => (c.render.math = "picture"));
      expect(wide.layout.lines.some((l) => l.image)).toBe(false);
    });
  });
  describe("on the internet (12.12)", () => {
    test("reloading never cancels pending downloads without publishing their partial files", async () => {
      const root = makeVault();
      const cfg = join(root, "user-config.toml");
      writeFileSync(cfg, '[render]\nimages_remote = "show"\n[lsp]\nenabled = false\n[lint]\nenabled = "off"\n');
      let cancelled = false;
      let read = false;
      const h = await harness({
        root,
        configFile: cfg,
        fetch: async () =>
          new Response(
            new ReadableStream({
              pull() {
                read = true;
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "image/png" } },
          ),
      });
      const url = "https://pictures.example/config-cancel.png";
      h.app.pictures.remote.fetch(url);
      for (const t = performance.now(); performance.now() - t < 10_000 && !read; ) await Bun.sleep(2);
      expect(read).toBe(true);
      writeFileSync(cfg, '[render]\nimages_remote = "never"\n[lsp]\nenabled = false\n[lint]\nenabled = "off"\n');
      h.app.settings.reload();
      await h.app.pictures.remote.settle();
      expect(cancelled).toBe(true);
      expect(h.app.pictures.remote.cached(url)).toBeNull();
      expect(h.app.messages.some((m) => m.text.startsWith("couldn't fetch"))).toBe(false);
    });

    const sizes: Host["images"] = {
      supported: () => true,
      size: () => ({ width: 400, height: 200 }),
      cell: () => ({ width: 8, height: 16 }),
    };
    const web = async (
      mode: "ask" | "show" | "never",
      answer: (url: string) => Response = () => new Response("png bytes", { headers: { "content-type": "image/png" } }),
    ) => {
      const root = makeVault();
      const url = `https://pictures.example/${mode}-${Math.random().toString(36).slice(2)}.png`;
      writeFileSync(
        join(root, "w.md"),
        `# W\n\n![web](${url})\n\n![other](https://pictures.example/other-${url.slice(-12)})\n`,
      );
      const asked: string[] = [];
      const fetch = async (u: string) => (asked.push(u), answer(u));
      const h = await harness({
        root,
        open: "w.md",
        width: 100,
        height: 40,
        images: sizes,
        fetch,
        config: (c) => (c.render.images_remote = mode),
      });
      const pictures = () => h.app.currentLayout(h.app.view!).lines.filter((l) => l.image).length;
      const onLink = async (alt: string) => {
        const row = h.app
          .currentLayout(h.app.view!)
          .lines.findIndex((l) => l.spans.some((sp) => sp.text === `▣ ${alt}`));
        h.app.moveCursor(h.app.view!, { row, col: 0 });
        await h.keys("enter");
      };
      const settle = async (want: () => boolean) => {
        for (let k = 0; k < 100 && !want(); k++) await Bun.sleep(5);
      };
      return { h, url, asked, pictures, onLink, settle };
    };
    test("ask (the default): the link alone until enter asks — yes this once fetches it; yes for its site, its others too", async () => {
      const { h, url, asked, pictures, onLink, settle } = await web("ask");
      expect([pictures(), asked]).toEqual([0, []]); // nothing fetched by itself
      await onLink("web");
      expect((h.app.overlay as ListOverlay).title).toBe("Fetch this picture from https://pictures.example?");
      await h.keys("o");
      await settle(() => pictures() === 1);
      expect([asked, pictures()]).toEqual([[url], 1]);
      expect(h.app.currentLayout(h.app.view!).lines.find((l) => l.image)!.image!.src).toBe(
        h.app.pictures.remote.file(url),
      );
      // The other: yes for the site — and then any picture of it fetched as the note's laid out.
      await onLink("other");
      await h.keys("s");
      await settle(() => pictures() === 2);
      expect(h.app.pictures.remote.sites.has("https://pictures.example")).toBe(true);
    });
    test("ask, answered no: nothing fetched", async () => {
      const { h, asked, pictures, onLink } = await web("ask");
      await onLink("web");
      await h.keys("n");
      await Bun.sleep(20);
      expect([asked, pictures()]).toEqual([[], 0]);
    });
    test("show: fetched as the note's laid out; never: not fetched, not drawn even when fetched before — enter copies its address", async () => {
      const shown = await web("show");
      await shown.settle(() => shown.pictures() === 2);
      expect(shown.asked).toHaveLength(2);
      const never = await web("never");
      writeFileSync(never.h.app.pictures.remote.file(never.url), "fetched before");
      never.h.app.pictures.changed();
      expect([never.pictures(), never.asked]).toEqual([0, []]);
      await never.onLink("web");
      expect(never.h.copied.at(-1)).toBe(never.url);
      await never.onLink("other"); // not fetched before: never fetched on enter either
      await Bun.sleep(20);
      expect([never.asked, never.h.app.overlay]).toEqual([[], null]);
      expect(never.h.copied.at(-1)).toMatch(/^https:\/\/pictures\.example\/other-/);
    });
    test("an image larger than 20 MB isn't kept: said so before it's read, or once it's read", async () => {
      const big = new Uint8Array(21 * 1024 * 1024);
      const large = await web("show", (u) =>
        u.includes("other-")
          ? new Response(big, { headers: { "content-type": "image/png" } })
          : new Response("small, but says it's big", {
              headers: { "content-type": "image/png", "content-length": String(big.length) },
            }),
      );
      await large.settle(() => large.h.app.messages.filter((m) => m.text.startsWith("couldn't fetch")).length === 2);
      expect(large.h.app.messages.filter((m) => m.text.endsWith(": larger than 20 MB"))).toHaveLength(2);
      expect(large.pictures()).toBe(0);
    });
    test("a fetch that fails — the site's error, not an image — says why, and isn't tried again by itself; enter tries again", async () => {
      const failing = await web("show", (u) =>
        u.includes("other-")
          ? new Response("<html>", { headers: { "content-type": "text/html" } })
          : new Response("gone", { status: 404 }),
      );
      await failing.settle(
        () => failing.h.app.messages.filter((m) => m.text.startsWith("couldn't fetch")).length === 2,
      );
      const said = failing.h.app.messages.map((m) => m.text).filter((t) => t.startsWith("couldn't fetch"));
      expect(said.sort()).toEqual(
        [
          `couldn't fetch ${failing.url}: the site answered 404`,
          expect.stringMatching(/: not an image \(text\/html\)$/),
        ].sort(),
      );
      failing.h.app.pictures.changed();
      failing.h.frame();
      await Bun.sleep(20);
      expect(failing.asked).toHaveLength(2); // not again by itself
      await failing.onLink("web");
      await failing.settle(() => failing.asked.length === 3);
      expect(failing.asked).toHaveLength(3);
    });
  });
  test("support said after the first frame: the note laid out again, its pictures in", async () => {
    let supported = false;
    const root = makeVault();
    writeFileSync(join(root, "p.md"), note);
    writeFileSync(join(root, "chart.png"), "x");
    const images: Host["images"] = {
      supported: () => supported,
      size: () => ({ width: 400, height: 200 }),
      cell: () => ({ width: 8, height: 16 }),
    };
    const h = await harness({ root, open: "p.md", width: 100, height: 40, images });
    expect(h.app.currentLayout(h.app.view!).lines.some((l) => l.image)).toBe(false);
    supported = true;
    h.app.pictures.changed();
    expect(h.app.currentLayout(h.app.view!).lines.some((l) => l.image)).toBe(true);
  });
});
