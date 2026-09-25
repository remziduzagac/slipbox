// The one file that touches OpenTUI's drawing API: a Canvas over its frame buffer, and the
// Renderable that hosts the app. Pinned at @opentui/core 0.5.12 (see docs/design/architecture.md
// for the upgrade policy) — if the API churns, this file and run.ts are what change.

import { type OptimizedBuffer, Renderable, type RenderContext, RGBA, TextAttributes } from "@opentui/core";
import type { CellStyle } from "../core/layout/style.ts";
import type { Color } from "../core/theme/theme.ts";
import type { Canvas } from "./canvas.ts";

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
  return a;
}

export class BufferCanvas implements Canvas {
  constructor(private readonly buf: OptimizedBuffer) {}
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
    this.buf.drawText(g, x, y, toRGBA(s.fg, true), toRGBA(s.bg, false), attrs(s));
  }
  ascii(x: number, y: number, text: string, s: CellStyle): void {
    this.buf.drawText(text, x, y, toRGBA(s.fg, true), toRGBA(s.bg, false), attrs(s));
  }
}

/** A full-screen renderable whose paint step is the app's draw. */
export class AppRenderable extends Renderable {
  constructor(
    ctx: RenderContext,
    private readonly paint: (canvas: Canvas) => void,
  ) {
    super(ctx, { width: "100%", height: "100%", position: "absolute", left: 0, top: 0 });
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.paint(new BufferCanvas(buffer));
  }
}
