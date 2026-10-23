// SVG drawn (plan 12.15): resvg, as WebAssembly, rasterises an SVG — a picture written as one (`![x](d.svg)`), and what
// slipbox draws itself as a picture (a Mermaid diagram, 12.16; a display's maths, 12.17) — to a PNG the terminal's
// picture protocol takes. Loaded the first time one is asked for (16.6). It reads no system fonts by itself: a sans
// font found on the machine is given to it, for a diagram's words; none found, what needs words isn't drawn.

import { accessSync, constants, readFileSync } from "node:fs";
import wasm from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { load as loadLazy } from "./lazy.ts";
import { paintJobs } from "./paint-jobs.ts";

type ResvgModule = typeof import("@resvg/resvg-wasm");

/** Sans fonts looked for, Linux's and macOS's, with the family each is: the first there is the one used. */
const FONTS: [string, string][] = [
  ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans"],
  ["/usr/share/fonts/TTF/DejaVuSans.ttf", "DejaVu Sans"],
  ["/usr/share/fonts/dejavu/DejaVuSans.ttf", "DejaVu Sans"],
  ["/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf", "DejaVu Sans"],
  ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "Liberation Sans"],
  ["/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf", "Liberation Sans"],
  ["/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "Noto Sans"],
  ["/usr/share/fonts/noto/NotoSans-Regular.ttf", "Noto Sans"],
  ["/System/Library/Fonts/Supplemental/Arial.ttf", "Arial"],
  ["/Library/Fonts/Arial.ttf", "Arial"],
  ["/System/Library/Fonts/Helvetica.ttc", "Helvetica"],
];

/** The sans font this machine has, the first of `fonts` there to read; null where there's none. */
export function machineFont(fonts: [string, string][] = FONTS): { path: string; family: string } | null {
  for (const [path, family] of fonts) {
    try {
      accessSync(path, constants.R_OK);
      return { path, family };
    } catch {}
  }
  return null;
}

/** The machine's font, as the screen's thread knows it: looked for once, the first time it's asked. */
let screenFont: { path: string; family: string } | null | undefined;
function onScreen(): { path: string; family: string } | null {
  if (screenFont === undefined) screenFont = machineFont();
  return screenFont;
}

/** The name it loads under: what a layout drawn without it waited for. */
export const RESVG = "resvg";

export interface Rasterizer {
  /** The font family given for words, or null where none was found. */
  family: string | null;
  /** An SVG's own size in pixels, or null where it isn't one resvg reads. */
  size(svg: string): { width: number; height: number } | null;
  /** An SVG drawn `width` pixels wide, as a PNG; null where it can't be. */
  png(svg: string, width: number): Uint8Array | null;
}

async function load(): Promise<Rasterizer> {
  const resvg: ResvgModule = await import("@resvg/resvg-wasm");
  await resvg.initWasm(readFileSync(wasm));
  let font: { buffer: Uint8Array; family: string } | null = null;
  for (const [path, family] of FONTS) {
    try {
      font = { buffer: readFileSync(path), family };
      break;
    } catch {}
  }
  const options = font
    ? { font: { fontBuffers: [font.buffer], defaultFontFamily: font.family, sansSerifFamily: font.family } }
    : {};
  const open = (svg: string, extra: object = {}) => {
    try {
      return new resvg.Resvg(svg, { ...options, ...extra });
    } catch {
      return null;
    }
  };
  return {
    family: font?.family ?? null,
    size(svg) {
      const r = open(svg);
      if (!r) return null;
      const size = { width: r.width, height: r.height };
      r.free();
      return size;
    },
    png(svg, width) {
      const r = open(svg, { fitTo: { mode: "width", value: Math.max(1, Math.round(width)) } });
      if (!r) return null;
      try {
        const image = r.render();
        const png = image.asPng();
        image.free();
        return png;
      } catch {
        return null;
      } finally {
        r.free();
      }
    },
  };
}

/**
 * The rasteriser, or null while it loads (what waited for it is laid out again when it's in). Its work is the paint
 * worker's, which gives resvg the machine's font as `sans-serif`; with none (`font`, the machine's unless a test says),
 * it names no family, so a diagram needing words is drawn in characters rather than as a picture without them.
 */
export function rasterizer(font = onScreen()): Rasterizer | null {
  return {
    family: font ? "sans-serif" : null,
    size(svg) {
      const value = paintJobs.get({ kind: "size", source: svg });
      return value && !(value instanceof Uint8Array) && typeof value !== "string" ? value : null;
    },
    png(svg, width) {
      const value = paintJobs.get({ kind: "png", source: svg, width });
      return value instanceof Uint8Array ? value : null;
    },
  };
}

/** Wait for it (what has no frame to draw again). */
export function loadRasterizer(): Promise<Rasterizer | null> {
  return loadLazy(RESVG, load);
}

/**
 * Whether a file's text is an SVG's: what a picture fetched without its name (12.12) is told by — `<svg`, after an XML
 * declaration, comments and a doctype. The comments are skipped one by one, each to its first `-->`: a pattern
 * repeating `<!--…-->` would try every way to split a head of `<!--` and many `--><!--`, which never ends.
 */
export function looksLikeSvg(head: string): boolean {
  let s = head.trimStart();
  const xml = /^<\?xml[^>]*>/i.exec(s);
  if (xml) s = s.slice(xml[0].length).trimStart();
  while (s.startsWith("<!--")) {
    const end = s.indexOf("-->", 4);
    if (end < 0) return false;
    s = s.slice(end + 3).trimStart();
  }
  const doctype = /^<!DOCTYPE svg[^>]*>/i.exec(s);
  if (doctype) s = s.slice(doctype[0].length).trimStart();
  return /^<svg[\s>]/i.test(s);
}

/** Where a parenthesised expression starting at `open` (its `(`) ends; -1 where it doesn't. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** An argument list split at its own commas, not its arguments'. */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(s.slice(from).trim());
  return out;
}

function rgb(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((x) => x + x).join("") : m[1]!;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * CSS custom properties put in place, as their colours: resvg reads neither `var()` nor `color-mix()`, which a
 * diagram's SVG (`beautiful-mermaid`'s) is coloured with. The properties are the root's `style` and its `<style>`'s;
 * `color-mix(in srgb, A p%, B)` is mixed here. An `@import` (a web font) goes: nothing is fetched.
 */
export function flattenVars(svg: string): string {
  const vars = new Map<string, string>();
  const decl = /(--[\w-]+)\s*:\s*([^;]+)/g;
  const root = /<svg\b[^>]*\bstyle="([^"]*)"/.exec(svg)?.[1] ?? "";
  for (const m of root.matchAll(decl)) vars.set(m[1]!, m[2]!.trim());
  for (const b of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    for (const m of b[1]!.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(decl)) vars.set(m[1]!, m[2]!.trim());
  const evaluate = (e: string, depth = 0): string | null => {
    e = e.trim();
    if (depth > 16) return null;
    if (e.startsWith("var(")) {
      const end = closing(e, 3);
      const [name, ...fallback] = args(e.slice(4, end));
      const v = vars.get(name!);
      return v !== undefined
        ? evaluate(v, depth + 1)
        : fallback.length
          ? evaluate(fallback.join(","), depth + 1)
          : null;
    }
    if (e.startsWith("color-mix(")) {
      const [space, a, b] = args(e.slice(10, closing(e, 9)));
      if (space !== "in srgb" || !a || !b) return null;
      const pa = /\s(\d+(?:\.\d+)?)%$/.exec(a);
      const pb = /\s(\d+(?:\.\d+)?)%$/.exec(b);
      const ca = evaluate(pa ? a.slice(0, pa.index) : a, depth + 1);
      const cb = evaluate(pb ? b.slice(0, pb.index) : b, depth + 1);
      const x = ca && rgb(ca);
      const y = cb && rgb(cb);
      if (!x || !y) return null;
      const t = pa ? Number(pa[1]) / 100 : pb ? 1 - Number(pb[1]) / 100 : 0.5;
      return `#${x
        .map((v, i) =>
          Math.round(v * t + y[i]! * (1 - t))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    }
    return e;
  };
  let out = svg.replace(/@import[^;]*;/g, "");
  for (let i = out.search(/var\(|color-mix\(/); i >= 0; i = out.search(/var\(|color-mix\(/)) {
    const end = closing(out, out.indexOf("(", i));
    if (end < 0) break;
    out = out.slice(0, i) + (evaluate(out.slice(i, end + 1)) ?? "none") + out.slice(end + 1);
  }
  return out;
}
