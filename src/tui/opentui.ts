// The one file that touches OpenTUI's drawing API: a Canvas over its frame buffer, and the
// Renderable that hosts the app. Pinned at @opentui/core 0.5.12 (see blueprint/design/how-it-works.md
// for the upgrade policy) — if the API churns, this file and run.ts are what change.

import { readFileSync, statSync } from "node:fs";
import {
  imageInfo,
  NativeImage,
  type OptimizedBuffer,
  Renderable,
  type RenderContext,
  RGBA,
  TextAttributes,
} from "@opentui/core";
import type { CellStyle } from "../core/layout/style.ts";
import type { Color } from "../core/theme/theme.ts";
import { type Canvas, glyphCell } from "./canvas.ts";
import { idColor, MAX_PLACEHOLDER_CELLS, pictureId, placeholderRow, release, transmit } from "./placeholders.ts";

const colors = new Map<string, RGBA>();

export function toRGBA(c: Color | null, fg: boolean): RGBA {
  const key = `${fg ? "f" : "b"}${c ?? "default"}`;
  let v = colors.get(key);
  if (!v) {
    if (!c || c === "default") v = fg ? RGBA.defaultForeground() : RGBA.defaultBackground();
    else if (c.startsWith("ansi:")) v = RGBA.fromIndex(Number(c.slice(5)));
    else v = RGBA.fromHex(c);
    colors.set(key, v);
  }
  return v;
}

function attrs(s: CellStyle): number {
  let a = 0;
  if (s.bold) a |= TextAttributes.BOLD;
  if (s.italic) a |= TextAttributes.ITALIC;
  if (s.underline) a |= TextAttributes.UNDERLINE;
  if (s.strike) a |= TextAttributes.STRIKETHROUGH;
  if (s.dim) a |= TextAttributes.DIM;
  if (s.inverse) a |= TextAttributes.INVERSE;
  return a;
}

/**
 * A note's pictures (12.x) through OpenTUI: an image file's size, and the image decoded, each read once by path and
 * modified time (the decoded ones the last few); drawn with the protocol the terminal speaks, Kitty graphics or sixel —
 * never in blocks of colour: where it speaks neither, there are no pictures, `▣ alt` the floor.
 */
export class Pictures {
  private readonly sizes = new Map<string, { at: number; size: { width: number; height: number } | null }>();
  private readonly images = new Map<string, { at: number; image: NativeImage | null }>();
  /** The pictures sent as Unicode placeholders (12.7), by id, the oldest first. */
  private readonly sent = new Set<number>();
  constructor(
    readonly protocol: () => "kitty" | "sixel" | null,
    /** Kitty graphics as Unicode placeholders (12.7): what writes to the terminal in step with the frames, and the
     *  cell's size in pixels (a picture is sent that size). Without them, OpenTUI's own picture path. */
    private readonly placeholders?: {
      write: (s: string) => void;
      cell: () => { width: number; height: number } | null;
    },
  ) {}

  /** Whether pictures are drawn as Unicode placeholders: text that scrolls, nothing sent again (12.7). */
  usesPlaceholders(): boolean {
    return !!this.placeholders && this.protocol() === "kitty";
  }

  size(path: string): { width: number; height: number } | null {
    const at = modified(path);
    if (at === null) return null;
    const hit = this.sizes.get(path);
    if (hit?.at === at) return hit.size;
    let size: { width: number; height: number } | null = null;
    try {
      const info = imageInfo(readFileSync(path));
      size = { width: info.width, height: info.height };
    } catch {}
    if (this.sizes.size >= 500) this.sizes.delete(this.sizes.keys().next().value!);
    this.sizes.set(path, { at, size });
    return size;
  }

  draw(
    buf: OptimizedBuffer,
    x: number,
    y: number,
    cols: number,
    rows: number,
    src: string,
    crop: { skip: number; total: number },
  ): void {
    const protocol = this.protocol();
    const image = protocol ? this.image(src) : null;
    if (!protocol || !image || rows <= 0) return;
    if (this.usesPlaceholders() && cols <= MAX_PLACEHOLDER_CELLS && crop.total <= MAX_PLACEHOLDER_CELLS) {
      const id = this.send(src, image, cols, crop.total);
      if (id === null) return;
      const fg = RGBA.fromHex(idColor(id));
      for (let k = 0; k < rows; k++) buf.drawText(placeholderRow(crop.skip + k, cols), x, y + k, fg);
      return;
    }
    const top = Math.round((image.height * crop.skip) / crop.total);
    const tall = Math.max(1, Math.min(image.height - top, Math.round((image.height * rows) / crop.total)));
    buf.drawImage(image, x, y, cols, rows, undefined, undefined, 0, top, image.width, tall, protocol);
  }

  /**
   * A picture sent to the terminal for placeholders, once — by its file, when it was changed, and its cells: scaled to
   * the pixels it's drawn in (never up), with a virtual placement of those cells. The oldest let go past 48. Its id.
   */
  private send(src: string, image: NativeImage, cols: number, rows: number): number | null {
    const id = pictureId(`${src}\u0000${this.images.get(src)?.at ?? 0}`, cols, rows);
    if (this.sent.has(id)) {
      // Used again: the newest.
      this.sent.delete(id);
      this.sent.add(id);
      return id;
    }
    const cell = this.placeholders!.cell() ?? { width: 8, height: 16 };
    const scale = Math.min(1, (cols * cell.width) / image.width, (rows * cell.height) / image.height);
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    let rgba: Uint8Array;
    try {
      const sized = w === image.width && h === image.height ? image : image.resize({ width: w, height: h });
      const raw = sized.raw("rgba8");
      rgba = raw.stride === w * 4 ? raw.data.slice(0, w * h * 4) : packRows(raw.data, raw.stride, w, h);
      if (sized !== image) sized.dispose();
    } catch {
      return null;
    }
    this.placeholders!.write(transmit(id, rgba, w, h, cols, rows));
    this.sent.add(id);
    if (this.sent.size > 48) {
      const old = this.sent.values().next().value!;
      this.sent.delete(old);
      this.placeholders!.write(release(old));
    }
    return id;
  }

  /** Every picture sent let go: slipbox is quitting, and the terminal keeps what it's sent until told. */
  releaseAll(): void {
    for (const id of this.sent) this.placeholders?.write(release(id));
    this.sent.clear();
  }

  private image(src: string): NativeImage | null {
    const at = modified(src);
    if (at === null) return null;
    const hit = this.images.get(src);
    if (hit?.at === at) return hit.image;
    hit?.image?.dispose();
    let image: NativeImage | null = null;
    try {
      image = NativeImage.decode(readFileSync(src));
    } catch {}
    // The last few decoded: a note's pictures, and the ones before it.
    if (this.images.size >= 24) {
      const [old, kept] = this.images.entries().next().value!;
      kept.image?.dispose();
      this.images.delete(old);
    }
    this.images.set(src, { at, image });
    return image;
  }
}

/** Pixel rows, `stride` bytes apart, packed tight (`w` × 4 bytes each). */
function packRows(data: Uint8Array, stride: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(y * stride, y * stride + w * 4), y * w * 4);
  return out;
}

function modified(path: string): number | null {
  try {
    const st = statSync(path);
    return st.isFile() ? st.mtimeMs : null;
  } catch {
    return null;
  }
}

export class BufferCanvas implements Canvas {
  asciiGlyphs?: boolean;
  constructor(
    private readonly buf: OptimizedBuffer,
    private readonly pictures?: Pictures,
  ) {}
  get width(): number {
    return this.buf.width;
  }
  get height(): number {
    return this.buf.height;
  }
  fill(x: number, y: number, w: number, h: number, bg: Color | null): void {
    if (w <= 0 || h <= 0) return;
    this.buf.fillRect(x, y, w, h, toRGBA(bg, false));
  }
  cell(x: number, y: number, g: string, _w: number, s: CellStyle): void {
    this.buf.drawText(glyphCell(this, g), x, y, toRGBA(s.fg, true), toRGBA(s.bg, false), attrs(s));
  }
  ascii(x: number, y: number, text: string, s: CellStyle): void {
    this.buf.drawText(text, x, y, toRGBA(s.fg, true), toRGBA(s.bg, false), attrs(s));
  }
  image(x: number, y: number, cols: number, rows: number, src: string, crop: { skip: number; total: number }): void {
    this.pictures?.draw(this.buf, x, y, cols, rows, src, crop);
  }
}

/** A full-screen renderable whose paint step is the app's draw. */
export class AppRenderable extends Renderable {
  constructor(
    ctx: RenderContext,
    private readonly paint: (canvas: Canvas) => void,
    private readonly pictures?: Pictures,
  ) {
    super(ctx, { width: "100%", height: "100%", position: "absolute", left: 0, top: 0 });
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.paint(new BufferCanvas(buffer, this.pictures));
  }
}
