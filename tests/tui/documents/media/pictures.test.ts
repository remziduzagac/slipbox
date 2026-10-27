// Pictures sized to their window, shown at their own size on a click (PIC, issue #52): the two sizes, the layout's
// rows for them, the click, the keys and the wheel, how long a picture stays at its own size, wrapping off, and the
// drawing of the part that shows.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OptimizedBuffer } from "@opentui/core";
import { loadRasterizer } from "../../../../src/core/rendering/media/images/svg.ts";
import type { Layout, Line } from "../../../../src/core/rendering/layout/ir.ts";
import type { Host, View } from "../../../../src/tui/app/runtime/app.ts";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { FLOOR_COLS, FLOOR_ROWS, pictureSizes } from "../../../../src/tui/documents/media/images.ts";
import { Pictures as OpenTuiPictures } from "../../../../src/tui/shell/terminal/opentui.ts";
import { PICTURES_REST_MS } from "../../../../src/tui/documents/media/pictures.ts";
import { pictureId, placeholderCell, placeholderRow } from "../../../../src/tui/shell/terminal/placeholders.ts";
import { harness, type Harness, lineText, makeSandbox, makeVault } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

const CELL = { width: 8, height: 16 };
/** The docs' screenshots' size: 1,734 × 950 pixels, decoded 1,351 × 740 — 169 × 47 cells its own. */
const SHOT = { width: 1734, height: 950 };

describe("a picture's two sizes (PIC-D1, PIC-D2)", () => {
  test("fitted to its room's columns, never wider than its own size", () => {
    const { own, fit } = pictureSizes(SHOT.width, SHOT.height, { cols: 100, rows: 39 }, CELL);
    expect(own).toEqual({ cols: 169, rows: 47 });
    expect(fit).toEqual({ cols: 100, rows: 28 });
    // Smaller than its room: its own size, both.
    const small = pictureSizes(400, 200, { cols: 100, rows: 39 }, CELL);
    expect(small.own).toEqual({ cols: 50, rows: 13 });
    expect(small.fit).toEqual(small.own);
  });
  test("no taller than its window's rows less its ▣ rows, narrower then — never under the floor", () => {
    // A phone's screenshot, 1,170 × 2,532 (85 × 92 its own), in 39 rows: 36 × 39.
    expect(pictureSizes(1170, 2532, { cols: 100, rows: 39 }, CELL).fit).toEqual({ cols: 36, rows: 39 });
    // 9 rows for it: the floor's 12 rows, taller than the window.
    expect(pictureSizes(SHOT.width, SHOT.height, { cols: 100, rows: 9 }, CELL).fit).toEqual({
      cols: 43,
      rows: FLOOR_ROWS,
    });
    // Tall and narrow, 800 × 10,000: the floor's 20 columns, its rows far past the window's.
    const tall = pictureSizes(800, 10_000, { cols: 100, rows: 39 }, CELL);
    expect(tall.own).toEqual({ cols: 21, rows: 132 });
    expect(tall.fit).toEqual({ cols: FLOOR_COLS, rows: 125 });
    // The floor is never past its own size, nor past its room.
    expect(pictureSizes(80, 40, { cols: 100, rows: 2 }, CELL).fit).toEqual({ cols: 10, rows: 3 });
    expect(pictureSizes(SHOT.width, SHOT.height, { cols: 30, rows: 5 }, CELL).fit.cols).toBe(30);
    // No rows known (a window not drawn yet): the width alone.
    expect(pictureSizes(SHOT.width, SHOT.height, { cols: 100, rows: Number.POSITIVE_INFINITY }, CELL).fit).toEqual({
      cols: 100,
      rows: 28,
    });
  });
  test("within the screen's budget, a megapixel and 2,048 a side: its own size no bigger", () => {
    // 4,000 × 3,000: a megapixel's worth, 1,155 × 866.
    expect(pictureSizes(4000, 3000, { cols: 300, rows: 100 }, CELL).own).toEqual({ cols: 145, rows: 55 });
    // A banner 5,000 wide: 2,048 a side.
    expect(pictureSizes(5000, 100, { cols: 300, rows: 100 }, CELL).own).toEqual({ cols: 256, rows: 3 });
    // A size the note gives that enlarges a smaller file: kept, within the budget.
    expect(pictureSizes(3000, 1500, { cols: 400, rows: 100 }, CELL).own.cols).toBe(177);
  });
});

/** A terminal that draws pictures, its cells 8 × 16; the files' sizes as it would read them. */
const terminal = (sizes: Record<string, { width: number; height: number }>, placeholders = false): Host["images"] => ({
  supported: () => true,
  size: (path) => sizes[basename(path)] ?? null,
  cell: () => CELL,
  ...(placeholders ? { placeholders: () => true } : {}),
});

const PARAS = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}, long enough to wrap in a narrow window.`);

/** A note with the screenshot between paragraphs, in a terminal `width` × `height`. */
async function open(
  opts: {
    md?: string;
    width?: number;
    height?: number;
    files?: Record<string, { width: number; height: number }>;
    config?: Parameters<typeof harness>[0] extends infer O ? (O extends { config?: infer C } ? C : never) : never;
    placeholders?: boolean;
  } = {},
): Promise<{ h: Harness; v: View; root: string }> {
  const root = makeVault();
  const md = opts.md ?? `# P\n\nText before.\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`;
  writeFileSync(join(root, "p.md"), md);
  const files = opts.files ?? { "shot.png": SHOT };
  for (const f of Object.keys(files)) writeFileSync(join(root, f), "a stand-in: its size is the terminal's to say");
  const h = await harness({
    root,
    open: "p.md",
    width: opts.width ?? 100,
    height: opts.height ?? 40,
    images: terminal(files, opts.placeholders),
    ...(opts.config ? { config: opts.config } : {}),
  });
  return { h, v: h.app.view!, root };
}

const layoutOf = (h: Harness) => h.app.currentLayout(h.app.view!);

describe("caption spacing and placement", () => {
  for (const caption of ["bottom", "top"] as const) {
    test(`${caption}: one blank row between caption and image, with lookup and clicks on the image`, async () => {
      const { h, v } = await open({
        md: "![Chart](shot.png)\n",
        config: (c) => {
          c.render.caption = caption;
        },
      });
      const layout = layoutOf(h);
      const first = layout.lines.findIndex((line) => !!line.image);
      const p = layout.lines[first]!.image!;
      const captions = layout.lines.flatMap((line, i) => (line.caption ? [i] : []));
      const gap = caption === "top" ? first - 1 : first + p.rows;
      expect(layout.lines[gap]!.spans).toEqual([]);
      expect(layout.lines[gap]!.caption).toBeUndefined();
      expect(caption === "top" ? captions.at(-1) : captions[0]).toBe(caption === "top" ? gap - 1 : gap + 1);
      for (const i of captions) expect(i - layout.lines[i]!.pic!.row).toBe(first);
      h.app.moveCursor(v, { row: captions[0]!, col: 0 });
      await h.keys("z", "p");
      expect(layoutOf(h).lines.some((line) => line.image?.own)).toBe(true);
      h.app.quit();
    });
  }
  test("a setting change invalidates both layout caches; undrawn images keep their caption alone", async () => {
    const { h } = await open({ md: "![Chart](shot.png)\n" });
    expect(layoutOf(h).lines[0]!.image).toBeDefined();
    h.app.config.render.caption = "top";
    expect(layoutOf(h).lines[0]!.caption).toBeDefined();
    h.app.config.render.images = "never";
    const alone = layoutOf(h);
    expect(alone.lines.every((line) => !!line.caption)).toBe(true);
    h.app.quit();
  });
});
/** The rows of the picture drawn from `src`'s file: its ▣ rows, the rows it's drawn over, its bar. */
const rowsOf = (layout: Layout, file = "shot.png") => {
  const rows = layout.lines.flatMap((l, i) => (l.pic && basename(l.pic.p.file ?? "") === file ? [i] : []));
  const first = rows.find((i) => layout.lines[i]!.pic!.row === 0)!;
  return { rows, first, p: layout.lines[first]!.pic!.p, caption: rows.filter((i) => !!layout.lines[i]!.caption) };
};
/** Its rect where it's drawn, from the last frame. */
const drawnRect = (h: Harness) => h.app.geometry!.pictures[0]!;
const click = (h: Harness, x: number, y: number) => {
  h.app.mouse.handle({ type: "down", x, y, button: 0 });
  h.app.mouse.handle({ type: "up", x, y, button: 0 });
  return h.frame();
};
const textOfRows = (layout: Layout) => layout.lines.filter((l) => !l.pic).map(lineText);

describe("fitted to its window (PIC-D1)", () => {
  test("its window's text width, never wider than its own size; its height within the window's less its ▣ line", async () => {
    const { h, v } = await open();
    const layout = layoutOf(h);
    const { p, caption } = rowsOf(layout);
    expect(p.cols).toBe(Math.min(169, layout.width));
    expect(p.rows).toBeLessThanOrEqual(v.height - caption.length);
    expect(p).toMatchObject({ toggles: true });
    expect(p.own).toBeUndefined();
    // Drawn whole where it is.
    expect(h.canvas().images).toEqual([expect.objectContaining({ cols: p.cols, rows: p.rows, left: 0, wide: p.cols })]);
  });
  test("a short window: fitted to its height, never under 12 rows — taller than the window then", async () => {
    const { h, v } = await open({ height: 12 });
    const { p } = rowsOf(layoutOf(h));
    expect(v.height).toBeLessThan(FLOOR_ROWS);
    expect(p.rows).toBe(FLOOR_ROWS);
    const tall = await open({ height: 30 });
    const fitted = rowsOf(layoutOf(tall.h)).p;
    expect(fitted.rows).toBeLessThanOrEqual(tall.v.height - 1);
    expect(fitted.rows).toBeGreaterThan(FLOOR_ROWS);
  });
  test("a ▣ line that wraps leaves the picture that many rows fewer", async () => {
    const alt = Array.from({ length: 12 }, (_, i) => `word${i}`).join(" ");
    const { h, v } = await open({
      md: `# P\n\n![${alt}](tall.png)\n`,
      files: { "tall.png": { width: 1170, height: 2532 } },
      width: 50,
    });
    const { p, caption } = rowsOf(layoutOf(h), "tall.png");
    expect(caption.length).toBeGreaterThan(1);
    expect(p.rows).toBeLessThanOrEqual(v.height - caption.length);
    expect(p.rows).toBeGreaterThan(v.height - caption.length - 3);
  });
  test("two windows of different heights on one note size it each for itself; a note without pictures isn't laid out again for a height", async () => {
    // 4:3, 1,155 × 866 in the budget: bounded by a short window's height before the floor.
    const { h } = await open({ height: 50, files: { "shot.png": { width: 1600, height: 1200 } } });
    await h.app.run("window.split_stacked");
    h.frame();
    const [a, b] = h.app.tab!.views;
    const pa = rowsOf(h.app.currentLayout(a!)).p;
    expect(a!.height).toBeLessThan(30);
    expect(pa.rows).toBeLessThanOrEqual(a!.height - 1);
    // The other made taller by hand: its own size for it.
    b!.pictureRows = 45;
    const pb = rowsOf(h.app.currentLayout(b!)).p;
    expect(pb.rows).toBeGreaterThan(pa.rows);
    expect(rowsOf(h.app.currentLayout(a!)).p.rows).toBe(pa.rows);
    // Without pictures: the same layout whatever the height.
    const plain = await open({ md: `# P\n\n${PARAS.join("\n\n")}\n` });
    const before = layoutOf(plain.h);
    plain.v.pictureRows = (plain.v.pictureRows ?? plain.v.height) - 7;
    expect(layoutOf(plain.h)).toBe(before);
  });
  test("one only in an embedded note asks for the window's height too", async () => {
    const root = makeVault();
    writeFileSync(join(root, "inner.md"), "# Inner\n\n![a screenshot](shot.png)\n");
    writeFileSync(join(root, "host.md"), "# Host\n\n![[inner]]\n");
    writeFileSync(join(root, "shot.png"), "x");
    const phone = { "shot.png": { width: 1170, height: 2532 } };
    const h = await harness({ root, open: "host.md", width: 100, height: 40, images: terminal(phone) });
    const v = h.app.view!;
    const rows = rowsOf(layoutOf(h)).p.rows;
    expect(layoutOf(h).pictures).toBe(true);
    v.pictureRows = 20;
    expect(rowsOf(layoutOf(h)).p.rows).toBeLessThan(rows);
  });
});

describe("at its own size, by a click or z p (PIC-D3)", () => {
  test("a click on it: the cursor to its ▣ line, the picture at its own size, scrolled sideways under a bar of its own; the text as it was", async () => {
    const { h, v } = await open();
    const before = layoutOf(h);
    const r = drawnRect(h);
    h.app.moveCursor(v, { row: before.lines.length - 1, col: 0 });
    click(h, r.x + 2, r.y + 1);
    const after = layoutOf(h);
    const { p, first, caption } = rowsOf(after);
    expect(p).toMatchObject({ cols: 169, rows: 47, own: true, scrolls: true });
    // Its rows scroll as a code block's do, a bar under them.
    expect(after.lines[first]!.scroll).toEqual({ x: 0, w: after.width, total: 169 });
    expect(after.lines[first + p.rows]!.scroll).toMatchObject({ part: "bar" });
    expect(after.lines[caption[0]!]!.scroll).toBeUndefined();
    // Nothing reflowed: the text's rows are the same, the picture's longer.
    expect(textOfRows(after)).toEqual(textOfRows(before));
    expect(v.cur.row).toBe(first);
    expect(h.app.messages.at(-1)!.text).toContain("at its own size");
    // Again: fitted.
    const again = drawnRect(h);
    click(h, again.x + 1, again.y);
    expect(rowsOf(layoutOf(h)).p).toMatchObject({ cols: Math.min(169, before.width) });
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    expect(layoutOf(h).lines.length).toBe(before.lines.length);
  });
  test("z p from its ▣ line does the same; elsewhere it says how", async () => {
    const { h, v } = await open();
    const { caption } = rowsOf(layoutOf(h));
    h.app.moveCursor(v, { row: caption[0]!, col: 0 });
    await h.keys("z", "p");
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    await h.keys("z", "p");
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    h.app.moveCursor(v, { row: 0, col: 0 });
    await h.keys("z", "p");
    expect(h.app.messages.at(-1)!.text).toContain("no picture here");
  });
  test("where no pictures are drawn, z p on a ▣ line says why, not where to go", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "# P\n\n![a screenshot](shot.png)\n");
    writeFileSync(join(root, "shot.png"), "x");
    const h = await harness({ root, open: "p.md", width: 100, height: 40 });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("▣")), col: 0 });
    await h.keys("z", "p");
    expect(h.app.messages.at(-1)!.text).toContain("no pictures drawn");
  });
  test("one already whole at its own size stays, and says so", async () => {
    const { h } = await open({ files: { "shot.png": { width: 400, height: 200 } } });
    const r = drawnRect(h);
    click(h, r.x, r.y);
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    expect(h.app.messages.at(-1)!.text).toContain("whole at its own size already");
  });
  test("a drag from it selects, as before; beside it, nothing toggles; quick clicks are two clicks, never a double-click", async () => {
    const { h, v } = await open();
    const r = drawnRect(h);
    h.app.mouse.handle({ type: "down", x: r.x + 1, y: r.y + 1, button: 0 });
    h.app.mouse.handle({ type: "drag", x: r.x + 1, y: r.y + 30, button: 0 });
    h.app.mouse.handle({ type: "up", x: r.x + 1, y: r.y + 30, button: 0 });
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    expect(v.sel).not.toBeNull();
    // Past its right edge, on its row: the text's click, not the picture's.
    v.sel = null;
    click(h, r.x + r.w + 1, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    // Twice quickly: at its own size, then fitted.
    click(h, r.x + 1, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    click(h, r.x + 1, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
  });
  test("with the lens open, a click toggles it and leaves the cursor, and the lens, where they are", async () => {
    const { h, v } = await open({ config: (c) => (c.editor.edit_in = "live") });
    // The lens below the picture, which stays drawn above it.
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Paragraph 3,")), col: 0 });
    await h.keys("i");
    expect(v.live).toBe(true);
    const lens = v.liveBase!.active;
    const on = layoutOf(h).lines[v.cur.row]!.src;
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    // The cursor on its line still, the lens on its lines: only the picture above them grew.
    expect(layoutOf(h).lines[v.cur.row]!.src).toBe(on);
    expect(v.liveBase!.active).toEqual(lens);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    // The window's height changed, the lens still open: fitted again for it.
    click(h, drawnRect(h).x + 1, drawnRect(h).y);
    const was = rowsOf(layoutOf(h)).p.rows;
    v.pictureRows = 14;
    expect(rowsOf(layoutOf(h)).p.rows).toBeLessThan(was);
  });
});

describe("scrolled sideways (PIC-D3)", () => {
  const atOwn = async () => {
    const o = await open({ placeholders: true });
    const r = drawnRect(o.h);
    click(o.h, r.x + 1, r.y + 1);
    return o;
  };
  test("z l and z h, a quarter of its room a press, kept within it; drawn from the column that shows", async () => {
    const { h } = await atOwn();
    const { first } = rowsOf(layoutOf(h));
    const w = layoutOf(h).lines[first]!.scroll!.w;
    await h.keys("z", "l");
    const step = Math.floor(w / 4);
    expect(h.app.code.offset(h.app.view!, layoutOf(h), first)).toBe(step);
    expect(h.canvas().images).toEqual([
      expect.objectContaining({ left: step, wide: 169, cols: Math.min(w, 169 - step) }),
    ]);
    for (let k = 0; k < 10; k++) await h.keys("z", "l");
    expect(h.app.code.offset(h.app.view!, layoutOf(h), first)).toBe(169 - w);
    expect(h.canvas().images).toEqual([expect.objectContaining({ left: 169 - w, cols: w })]);
    for (let k = 0; k < 10; k++) await h.keys("z", "h");
    expect(h.app.code.offset(h.app.view!, layoutOf(h), first)).toBe(0);
  });
  test("fitted, z l says it scrolls at its own size; the wheel sideways and its bar move it too", async () => {
    const { h, v } = await open({ placeholders: true });
    h.app.moveCursor(v, { row: rowsOf(layoutOf(h)).caption[0]!, col: 0 });
    await h.keys("z", "l");
    expect(h.app.messages.at(-1)!.text).toContain("z p shows it at its own size");
    await h.keys("z", "p");
    const { first } = rowsOf(layoutOf(h));
    const r = drawnRect(h);
    h.app.mouse.handle({
      type: "scroll",
      x: r.x + 3,
      y: r.y + 3,
      button: 0,
      scroll: { direction: "down", delta: 1 },
      shift: true,
    });
    expect(h.app.code.offset(v, layoutOf(h), first)).toBe(6);
    h.app.mouse.handle({ type: "scroll", x: r.x + 3, y: r.y + 3, button: 0, scroll: { direction: "right", delta: 1 } });
    expect(h.app.code.offset(v, layoutOf(h), first)).toBe(12);
    // Its bar, on the row under it: dragged to its end.
    v.top = first + 20;
    h.frame();
    const bar = h.app.geometry!.scrollbars.find((b) => b.block !== undefined)!;
    expect(bar).toBeDefined();
    h.app.mouse.handle({ type: "down", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: bar.x + bar.w - 1, y: bar.y, button: 0 });
    expect(h.app.code.offset(v, layoutOf(h), first)).toBe(169 - bar.w);
  });
});

describe("how long it stays at its own size (PIC-D4)", () => {
  test("scrolled away and back, an edit above it, the window resized: still; another note shown and back: fitted", async () => {
    const { h, v, root } = await open({ placeholders: true });
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    await h.keys("ctrl+d", "ctrl+d", "g", "g");
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    // An agent's write above it: the file read again, the picture moved down a line.
    writeFileSync(
      join(root, "p.md"),
      `# P\n\nA line an agent added.\n\nText before.\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`,
    );
    h.app.watch.reloadBuffer(v.buf);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    // Resized: still at its own size.
    v.pictureRows = 20;
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    // Another note, then back: fitted.
    writeFileSync(join(root, "q.md"), "# Q\n\nElse.\n");
    h.app.open("q.md");
    h.frame();
    h.app.open("p.md");
    h.frame();
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    // Back, then forward, through the window's history alone: likewise.
    await h.keys("g", "g");
    const third = drawnRect(h);
    click(h, third.x + 1, third.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    await h.app.run("history.back");
    h.frame();
    expect(basename(h.app.view!.buf.abs)).toBe("q.md");
    await h.app.run("history.forward");
    h.frame();
    expect(basename(h.app.view!.buf.abs)).toBe("p.md");
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
  });
  test("one file at two Obsidian sizes: both at their own sizes, each its own", async () => {
    const md = "# P\n\n![[shot.png|300]]\n\n![[shot.png]]\n";
    const { h } = await open({ md });
    const layout = layoutOf(h);
    const ps = layout.lines.filter((l) => l.image).map((l) => l.image!);
    expect(ps.map((p) => p.cols)).toEqual([38, Math.min(169, layout.width)]);
    click(h, h.app.geometry!.pictures[1]!.x + 1, h.app.geometry!.pictures[1]!.y + 1);
    const own = layoutOf(h)
      .lines.filter((l) => l.image)
      .map((l) => l.image!);
    expect(own.map((p) => [p.cols, !!p.own])).toEqual([
      [38, true],
      [169, true],
    ]);
  });
});

test("a toggle that leaves the note's rows as many still places the window's cursor and top again", async () => {
  // A banner one row tall either way, wrapping off: no bar of its own, the same count of rows.
  const md = `# P\n\n${"wide ".repeat(25)}\n\n![a banner](banner.png)\n\nAfter.\n`;
  const { h, v } = await open({
    md,
    files: { "banner.png": { width: 808, height: 16 } },
    config: (c) => (c.ui.wrap = false),
  });
  const before = layoutOf(h);
  const key = v.layoutKey;
  const r = drawnRect(h);
  click(h, r.x, r.y);
  const after = layoutOf(h);
  expect(rowsOf(after, "banner.png").p.own).toBe(true);
  expect(after.lines.length).toBe(before.lines.length);
  expect(v.layoutKey).not.toBe(key);
  // And it's drawn so: its whole 101 columns sent, the window's part of them shown.
  expect(h.canvas().images).toEqual([expect.objectContaining({ wide: 101, left: 0 })]);
});

describe("wrapping off (PIC-D6)", () => {
  const wide = `# P\n\n${"wide ".repeat(25)}\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`;
  test("fitted to the window, not the note's natural width; at its own size, the window reaches its edge, and it's drawn cropped while scrolled sideways", async () => {
    const { h, v } = await open({ md: wide, config: (c) => (c.ui.wrap = false), placeholders: true });
    const cols = h.app.views.textColumns(v);
    const layout = layoutOf(h);
    expect(layout.width).toBeGreaterThan(cols);
    expect(rowsOf(layout).p.cols).toBeLessThanOrEqual(cols);
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    const own = layoutOf(h);
    expect(rowsOf(own).p).toMatchObject({ cols: 169, own: true });
    expect(rowsOf(own).p.scrolls).toBeUndefined();
    expect(own.extent).toBe(169);
    // z l scrolls the window.
    await h.keys("z", "l");
    expect(v.left).toBe(Math.floor(cols / 4));
    expect(h.canvas().images).toEqual([expect.objectContaining({ left: v.left, wide: 169 })]);
    v.left = 169 - cols;
    expect(h.canvas().images).toEqual([expect.objectContaining({ left: 169 - cols, cols })]);
  });
});

describe("drawing the part that shows", () => {
  test("a picture taller than 60 rows, scrolled past its top, is still found and drawn", async () => {
    const { h, v } = await open({
      md: "# P\n\n![tall](tall.png)\n\nAfter.\n",
      files: { "tall.png": { width: 800, height: 4000 } },
    });
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    const { first, p } = rowsOf(layoutOf(h), "tall.png");
    expect(p.rows).toBeGreaterThan(70);
    v.top = first + 70;
    expect(h.canvas().images).toEqual([expect.objectContaining({ skip: 70, total: p.rows })]);
  });
  test("a window resized holds its pictures back until its size rests, as placeholders too (PIC-D5)", async () => {
    const { h, v } = await open({ placeholders: true });
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    const draw = (w: number, ht: number) => {
      const c = new TextCanvas(w, ht);
      h.app.draw(c);
      return c.images.length > 0;
    };
    v.pictures = undefined;
    expect(draw(100, 40)).toBe(true);
    t += 1000;
    expect(draw(90, 40)).toBe(false);
    t += 40;
    expect(draw(80, 40)).toBe(false);
    t += PICTURES_REST_MS + 1;
    expect(draw(80, 40)).toBe(true);
  });
});

/** A layout's picture rows run on unbroken: each the one before's next, from its ▣ rows to its bar. */
function picturesWhole(lines: Line[]): boolean {
  return lines.every((l, i) => {
    const before = lines[i - 1]?.pic;
    return !l.pic || before?.p !== l.pic.p || l.pic.row === before.row + 1;
  });
}

test("an embedded note's picture toggles too, and scrolls inside its frame", async () => {
  const root = makeVault();
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "inner.md"), "# Inner\n\n![a screenshot](shot.png)\n");
  writeFileSync(join(root, "host.md"), "# Host\n\n![[inner]]\n");
  writeFileSync(join(root, "sub", "shot.png"), "x");
  const h = await harness({ root, open: "host.md", width: 100, height: 60, images: terminal({ "shot.png": SHOT }) });
  const r = h.app.geometry!.pictures[0]!;
  click(h, r.x + 1, r.y + 1);
  const layout = layoutOf(h);
  const { p, first } = rowsOf(layout);
  expect(p.own).toBe(true);
  // Past the frame's bar.
  expect(layout.lines[first]!.scroll!.x).toBe(2);
  expect(picturesWhole(layout.lines)).toBe(true);
});

describe("drawn through OpenTUI, from its whole size", () => {
  const png = async (w: number, h: number) => {
    const r = (await loadRasterizer())!;
    const file = join(mkdtempSync(join(sandbox, "pic-")), "p.png");
    writeFileSync(
      file,
      r.png(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#08f"/></svg>`,
        w,
      )!,
    );
    return file;
  };
  test("as placeholders: sent once at its whole size; scrolled sideways, its cells from the column that shows, nothing sent", async () => {
    const file = await png(160, 32);
    const written: string[] = [];
    const pictures = new OpenTuiPictures(() => "kitty", { write: (s) => written.push(s), cell: () => CELL });
    const buf = OptimizedBuffer.create(20, 4, "unicode");
    try {
      await pictures.prepare(file);
      pictures.draw(buf, 0, 0, 8, 2, file, { skip: 0, total: 2, left: 0, wide: 20 });
      expect(written).toHaveLength(1);
      expect(written[0]).toContain(",c=20,r=2,");
      expect(written[0]).toContain(`,i=${pictureId(`${file}\u0000${statSync(file).mtimeMs}`, 20, 2)},`);
      buf.clear();
      pictures.draw(buf, 0, 0, 8, 2, file, { skip: 0, total: 2, left: 12, wide: 20 });
      expect(written).toHaveLength(1);
      const text = new TextDecoder().decode(buf.getRealCharBytes());
      expect(text).toContain(placeholderRow(0, 8, 12));
      expect(text).toContain(placeholderRow(1, 8, 12));
    } finally {
      pictures.releaseAll();
      buf.destroy();
    }
  });
  test("a row of placeholders from a column: each cell its row's and its own column's marks", () => {
    const cells = placeholderRow(3, 4, 10).match(/\u{10EEEE}[^\u{10EEEE}]*/gu)!;
    expect(cells.map(placeholderCell)).toEqual([10, 11, 12, 13].map((col) => ({ row: 3, col })));
  });
  test("OpenTUI's own path: the source rectangle of the part that shows, rows and columns, its edges from the cells'", async () => {
    const file = await png(160, 64);
    const pictures = new OpenTuiPictures(() => "sixel");
    const buf = OptimizedBuffer.create(40, 8, "unicode");
    const asked: unknown[][] = [];
    (buf as unknown as { drawImage: (...a: unknown[]) => boolean }).drawImage = (...a: unknown[]) => {
      asked.push(a.slice(1, 11));
      return true;
    };
    try {
      await pictures.prepare(file);
      // Of its 20 × 4 cells, columns 5 to 15 and rows 1 to 3: pixels 40 to 120 across, 16 to 64 down.
      pictures.draw(buf, 2, 1, 10, 3, file, { skip: 1, total: 4, left: 5, wide: 20 });
      expect(asked).toEqual([[2, 1, 10, 3, undefined, undefined, 40, 16, 80, 48]]);
    } finally {
      pictures.releaseAll();
      buf.destroy();
    }
  });
});

test("with sixel, quick steps sideways hold a view's pictures back, as quick steps down do (12.7)", async () => {
  const o = await open();
  const r = drawnRect(o.h);
  click(o.h, r.x + 1, r.y + 1);
  let t = 10_000;
  (o.h.app as unknown as { now: () => number }).now = () => t;
  o.v.pictures = undefined;
  const drawn = () => o.h.canvas().images.length > 0;
  expect(drawn()).toBe(true);
  t += 1000;
  await o.h.keys("z", "l");
  expect(o.h.canvas().images.length).toBe(1); // a step: drawn
  t += 30;
  await o.h.keys("z", "l");
  expect(drawn()).toBe(false); // quick: held back
  t += PICTURES_REST_MS + 1;
  expect(drawn()).toBe(true);
});

describe("found in review (PIC, round 1)", () => {
  test("wrapping off, the lens open: the window still reaches the edge of a picture at its own size", async () => {
    const md = `# P\n\n${"wide ".repeat(25)}\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`;
    const { h, v } = await open({ md, config: (c) => ((c.ui.wrap = false), (c.editor.edit_in = "live")) });
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Paragraph 3,")), col: 0 });
    await h.keys("i");
    expect(v.live).toBe(true);
    expect(layoutOf(h).extent).toBe(169);
    await h.keys("escape");
  });
  test("the lens keeps the lines it grew to when the window's height sizes its pictures again", async () => {
    const { h, v } = await open({ config: (c) => (c.editor.edit_in = "live") });
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Paragraph 3,")), col: 0 });
    await h.keys("i", "escape");
    v.live = true;
    await h.keys("+", "+");
    const grown = v.liveBase!.active;
    v.pictureRows = 14;
    layoutOf(h);
    expect(v.liveBase!.active).toEqual(grown);
  });
  test("opening find doesn't size a picture again, nor hold it back", async () => {
    const { h, v } = await open({ height: 24, placeholders: true });
    const before = rowsOf(layoutOf(h)).p;
    expect(before.rows).toBeLessThan(28); // fitted to the window's height
    await h.keys("/");
    expect(h.app.overlay?.kind === "prompt" || !!v.find).toBe(true);
    h.frame();
    expect(rowsOf(layoutOf(h)).p).toMatchObject({ cols: before.cols, rows: before.rows });
    expect(h.canvas().images.length).toBe(1);
  });
  test("an Obsidian size of nothing, `|0`, is its own size, never NaN", async () => {
    const { h } = await open({ md: "# P\n\n![[shot.png|0]]\n" });
    const { p } = rowsOf(layoutOf(h));
    expect(Number.isFinite(p.cols) && Number.isFinite(p.rows)).toBe(true);
    expect(p.cols).toBe(Math.min(169, layoutOf(h).width));
  });
  test("a click on a picture in visual mode ends the selection, as any click does", async () => {
    const { h, v } = await open();
    await h.keys("v", "j", "j");
    expect(v.visual).toBe("char");
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    expect(v.visual).toBeNull();
    expect(v.sel).toBeNull();
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
  });
  test("another note shown between, as source or code, fits the picture again", async () => {
    const { h, root } = await open({ placeholders: true });
    writeFileSync(join(root, "tool.ts"), "export const x = 1;\n");
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    h.app.open("tool.ts");
    h.frame();
    await h.app.run("history.back");
    h.frame();
    expect(basename(h.app.view!.buf.abs)).toBe("p.md");
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    // Opened again rather than gone back to: likewise.
    const again = drawnRect(h);
    click(h, again.x + 1, again.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    h.app.open("tool.ts");
    h.frame();
    h.app.open("p.md");
    h.frame();
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    // Back to the code file, then forward, through the window's history alone: likewise.
    await h.keys("g", "g");
    const third = drawnRect(h);
    click(h, third.x + 1, third.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
    await h.app.run("history.back");
    h.frame();
    expect(basename(h.app.view!.buf.abs)).toBe("tool.ts");
    await h.app.run("history.forward");
    h.frame();
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
  });
  test("a click whose picture moved between the press and the release still shows that picture at its own size", async () => {
    const { h, v, root } = await open();
    const r = drawnRect(h);
    h.app.mouse.handle({ type: "down", x: r.x + 1, y: r.y + 1, button: 0 });
    // An agent's write above it, read before the release: the picture three rows lower.
    writeFileSync(
      join(root, "p.md"),
      `# P\n\nAn added line.\n\nAnother.\n\nText before.\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`,
    );
    h.app.watch.reloadBuffer(v.buf);
    layoutOf(h);
    h.app.mouse.handle({ type: "up", x: r.x + 1, y: r.y + 1, button: 0 });
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
  });
  test("an SVG is rasterised once, at its own size: fitted smaller, or the window resized, the same PNG", async () => {
    await loadRasterizer();
    const root = makeVault();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#3080f0"/></svg>';
    writeFileSync(join(root, "p.md"), "# P\n\n![a drawing](wide.svg)\n");
    writeFileSync(join(root, "wide.svg"), svg);
    const h = await harness({ root, open: "p.md", width: 100, height: 40, images: terminal({}) });
    // The rasteriser's work is a background job: laid out again until it's in.
    const drawn = () => layoutOf(h).lines.find((l) => l.image)?.image;
    for (let i = 0; i < 60 && !drawn(); i++) {
      await Bun.sleep(50);
      h.app.view!.buf.invalidateLayouts();
    }
    const p = drawn()!;
    expect(p.cols).toBeLessThan(200);
    // Its own size within the budget: 1,600 × 800 is past a megapixel, so 177 columns, 1,416 pixels.
    const own = pictureSizes(1600, 800, { cols: 1, rows: 1 }, CELL).own.cols * CELL.width;
    expect(own).toBe(1416);
    expect(p.src).toMatch(new RegExp(`svg-[0-9a-f]{32}-${own}\\.png$`));
    h.app.view!.pictureRows = 12;
    expect(rowsOf(layoutOf(h), "wide.svg").p.src).toBe(p.src);
  });
  test("a click on a quote's bar, or on the window's scrollbar beside a picture, isn't the picture's", async () => {
    const md = `# P\n\n> ![quoted](shot.png)\n\n${PARAS.join("\n\n")}\n`;
    const { h } = await open({ md });
    const r = drawnRect(h);
    expect(r.x).toBeGreaterThan(h.app.geometry!.panes[0]!.textX);
    click(h, h.app.geometry!.panes[0]!.textX, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
    const bar = h.app.geometry!.scrollbars.find((b) => !b.horizontal && b.view)!;
    click(h, bar.x, r.y + 1);
    expect(rowsOf(layoutOf(h)).p.own).toBeUndefined();
  });
  test("at its own size through the lens opened and closed, and an edit typed above it", async () => {
    const { h, v } = await open({ config: (c) => (c.editor.edit_in = "live") });
    const r = drawnRect(h);
    click(h, r.x + 1, r.y + 1);
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Text before.")), col: 0 });
    await h.keys("i");
    if (!v.insert) await h.keys("i");
    expect(v.insert).toBeTruthy();
    await h.keys("x", "y", "z", "escape", "escape");
    expect(v.buf.source).toContain("xyzText before.");
    expect(v.live).toBeFalsy();
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
  });
  test("a separator dragged: the picture drawn once it rests, at the size the window ended at", async () => {
    const { h, v } = await open({ placeholders: true });
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    const drawAt = (w: number) => {
      const c = new TextCanvas(w, 40);
      h.app.draw(c);
      return c.images;
    };
    v.pictures = undefined;
    drawAt(100);
    for (const w of [96, 92, 88, 84, 80]) {
      t += 16;
      expect(drawAt(w)).toEqual([]);
    }
    t += PICTURES_REST_MS + 1;
    const drawn = drawAt(80);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.cols).toBe(rowsOf(layoutOf(h)).p.cols);
  });
});

describe("found in review (PIC, round 2)", () => {
  test("a size that holds its room's rows exactly is that many rows, not one more; the floor is 12 rows", () => {
    // 4,000 × 3,000 in 27 rows: 72 columns hold exactly 27 rows — never 28 from a rounding hair.
    expect(pictureSizes(4000, 3000, { cols: 300, rows: 27 }, CELL).fit.rows).toBeLessThanOrEqual(27);
    expect(pictureSizes(2560, 768, { cols: 300, rows: 5 }, CELL).fit.rows).toBe(FLOOR_ROWS);
    for (const [w, h] of [
      [1600, 800],
      [800, 1600],
      [1920, 768],
      [1440, 720],
      [3000, 1200],
    ] as const)
      for (let rows = 13; rows < 60; rows++) {
        const { fit } = pictureSizes(w, h, { cols: 400, rows }, CELL);
        // (A tall picture at the 20-column floor is taller than its room by design.)
        expect([w, h, rows, fit.rows <= rows || fit.cols === FLOOR_COLS]).toEqual([w, h, rows, true]);
      }
  });
  test("with sixel, a code block scrolled sideways doesn't hold the view's pictures back", async () => {
    const code = `\`\`\`\n${"x".repeat(300)}\n\`\`\``;
    const md = `# P\n\n${code}\n\n![a screenshot](shot.png)\n\nAfter.\n`;
    const { h, v } = await open({ md });
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    v.pictures = undefined;
    expect(h.canvas().images).toHaveLength(1);
    const row = layoutOf(h).lines.findIndex((l) => l.scroll && !l.pic);
    const pane = h.app.geometry!.panes[0]!;
    for (let k = 0; k < 3; k++) {
      t += 20;
      h.app.mouse.handle({
        type: "scroll",
        x: pane.textX + 5,
        y: pane.y + row - v.top,
        button: 0,
        scroll: { direction: "right", delta: 1 },
      });
      expect(h.canvas().images).toHaveLength(1);
    }
    expect(h.app.code.offset(v, layoutOf(h), row)).toBeGreaterThan(0);
  });
  test("z p on the ▣ line of a picture that isn't drawn says why; z p in visual mode ends it", async () => {
    const { h, v } = await open({
      md: `# P\n\n![gone](missing.png)\n\n![a screenshot](shot.png)\n\n${PARAS.join("\n\n")}\n`,
    });
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("▣ gone")), col: 0 });
    await h.keys("z", "p");
    expect(h.app.messages.at(-1)!.text).toContain("isn't drawn");
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Paragraph 2,")), col: 0 });
    await h.keys("v", "k", "k", "k");
    h.app.moveCursor(v, { row: rowsOf(layoutOf(h)).caption[0]!, col: 0 }, { extend: true });
    expect(v.visual).toBe("char");
    await h.keys("z", "p");
    expect(v.visual).toBeNull();
    expect(v.sel).toBeNull();
    expect(rowsOf(layoutOf(h)).p.own).toBe(true);
  });
  test("an SVG's file is read once while it's unchanged: a height changed lays it out without reading it again", async () => {
    await loadRasterizer();
    const root = makeVault();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600"/></svg>';
    writeFileSync(join(root, "p.md"), "# P\n\n![a drawing](tall.svg)\n");
    writeFileSync(join(root, "tall.svg"), svg);
    // A whole second for its time, so it can be set back exactly.
    utimesSync(join(root, "tall.svg"), 1_700_000_000, 1_700_000_000);
    const h = await harness({ root, open: "p.md", width: 100, height: 40, images: terminal({}) });
    const drawn = () => layoutOf(h).lines.find((l) => l.image)?.image;
    for (let i = 0; i < 60 && !drawn(); i++) {
      await Bun.sleep(50);
      h.app.view!.buf.invalidateLayouts();
    }
    const first = drawn()!;
    // Its text gone from the file, its time kept: what's read and kept is the SVG that was there.
    const file = join(root, "tall.svg");
    writeFileSync(file, "not an svg any more, and longer than it was so the size changes too");
    utimesSync(file, 1_700_000_000, 1_700_000_000);
    h.app.view!.pictureRows = 20;
    const after = drawn()!;
    expect(after.src).toBe(first.src);
    expect(after.rows).toBeLessThan(first.rows);
  });
});

describe("found in review (PIC, round 2, the rest)", () => {
  test("a resize that leaves the pictures in sight their size holds nothing back", async () => {
    // Bound by its width: a shorter window leaves it its size.
    const { h, v } = await open({ height: 60, placeholders: true });
    let t = 10_000;
    (h.app as unknown as { now: () => number }).now = () => t;
    const drawAt = (rows: number) => {
      const c = new TextCanvas(100, rows);
      h.app.draw(c);
      return c.images;
    };
    v.pictures = undefined;
    const before = drawAt(60);
    expect(before).toHaveLength(1);
    t += 1000;
    const after = drawAt(56);
    expect(after).toHaveLength(1);
    expect(after[0]!.wide).toBe(before[0]!.wide);
  });
  test("a release on a picture gone since the press toggles nothing, not the picture now on its row", async () => {
    const md = (first: boolean) =>
      `# P\n\n${first ? "![first](shot.png)\n\n" : ""}![second](other.png)\n\n${PARAS.join("\n\n")}\n`;
    const { h, v, root } = await open({ md: md(true), files: { "shot.png": SHOT, "other.png": SHOT } });
    const r = drawnRect(h);
    h.app.mouse.handle({ type: "down", x: r.x + 1, y: r.y + 1, button: 0 });
    writeFileSync(join(root, "p.md"), md(false));
    h.app.watch.reloadBuffer(v.buf);
    layoutOf(h);
    h.app.mouse.handle({ type: "up", x: r.x + 1, y: r.y + 1, button: 0 });
    expect(rowsOf(layoutOf(h), "other.png").p.own).toBeUndefined();
  });
  test("z p with the lens open, or in source mode, says where it acts", async () => {
    const { h, v } = await open({ config: (c) => (c.editor.edit_in = "live") });
    h.app.moveCursor(v, { row: layoutOf(h).lines.findIndex((l) => lineText(l).includes("Paragraph 3,")), col: 0 });
    await h.keys("i", "escape");
    v.live = true;
    await h.keys("z", "p");
    expect(h.app.messages.at(-1)!.text).toContain("with the lens open");
    h.app.lens.setViewMode(v, "source");
    await h.keys("z", "p");
    expect(h.app.messages.at(-1)!.text).toContain("rendered view");
  });
});

describe("picture caption regressions (#83)", () => {
  test("alt text line breaks become spaces and the caption box follows the image", async () => {
    const { h } = await open({ md: "![First line\nsecond line](shot.png)\n" });
    const layout = layoutOf(h);
    const caption = layout.lines.findIndex((line) => line.caption?.top);
    const image = layout.lines.findIndex((line) => line.image);
    expect(caption).toBeGreaterThan(image + layout.lines[image]!.image!.rows - 1);
    expect(layout.lines[caption]!.caption!.text).toBe("First line second line");
    expect(
      layout.lines
        .filter((line) => line.caption)
        .map(lineText)
        .join(" "),
    ).toContain("First line second line");
    expect(layout.lines[caption]!.fill).toBe("picture_caption");
  });

  test("a picture click does not leave its caption link highlighted, including a stationary drag event", async () => {
    const { linkAt } = await import("../../../../src/tui/documents/navigation/linking.ts");
    const { h, v } = await open({ md: "![A screenshot](shot.png)\n" });
    for (let i = 0; i < 2; i++) {
      const r = drawnRect(h);
      h.app.mouse.handle({ type: "down", x: r.x + 1, y: r.y + 1, button: 0 });
      if (i === 1) h.app.mouse.handle({ type: "drag", x: r.x + 1, y: r.y + 1, button: 0 });
      h.app.mouse.handle({ type: "up", x: r.x + 1, y: r.y + 1, button: 0 });
      h.frame();
      expect(v.sel).toBeNull();
      expect(v.visual).toBeNull();
      expect(linkAt(layoutOf(h), v.cur.row, v.cur.col)).toBe(-1);
    }
  });

  test("caption stands alone without images; its path and alt text buttons copy separately; inline images stay inline", async () => {
    const { h, root } = await open({
      md: "![Caption text](shot.png)\n\nBefore ![inline](shot.png) after.\n",
      config: (c) => {
        c.render.images = "never";
      },
    });
    expect(layoutOf(h).lines.filter((line) => line.caption?.top)).toHaveLength(1);
    expect(layoutOf(h).lines.some((line) => line.image)).toBe(false);
    const buttons = h.app.geometry!.hot.filter((hot) => hot.id.startsWith("caption:"));
    expect(buttons).toHaveLength(3);
    const path = buttons.find((hot) => hot.id.endsWith(":path"))!;
    click(h, path.x, path.y);
    expect(h.copied.at(-1)).toBe(join(root, "shot.png"));
    const alt = buttons.find((hot) => hot.id.endsWith(":caption"))!;
    click(h, alt.x, alt.y);
    expect(h.copied.at(-1)).toBe("Caption text");
    expect(
      layoutOf(h)
        .lines.filter((line) => !line.caption)
        .map(lineText)
        .join(" "),
    ).toContain("Before ▣ inline after.");
  });
});
