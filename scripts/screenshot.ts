// A terminal screen as a PNG, for the docs: the cells a herdr pane shows, with their colours
// (`herdr pane read <pane> --source visible --format ansi`), drawn into an SVG cell by cell and rasterised by resvg
// with DejaVu Sans Mono. Box-drawing and block characters are drawn as shapes, so borders join across cells. A picture
// shows in the pane's text only as Kitty's placeholder cells (src/tui/placeholders.ts): named, it's drawn over them as
// the terminal draws it; not, they're left blank.
//
//   herdr pane read w1:p2H --source visible --format ansi | bun scripts/screenshot.ts - docs/images/screen.png
//   bun scripts/screenshot.ts screen.ansi screen.png [--cols 120] [--rows 36] [--scale 2] [--picture a.png…]

import { readFileSync, writeFileSync } from "node:fs";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { graphemes, graphemeWidth } from "../src/core/width.ts";
import { PLACEHOLDER, placeholderCell } from "../src/tui/placeholders.ts";

const FONT_DIR = "/usr/share/fonts/truetype/dejavu";
// DejaVu Sans after the mono faces: resvg falls back to it for a symbol the mono font lacks (ℹ).
const FACES = [
  "DejaVuSansMono.ttf",
  "DejaVuSansMono-Bold.ttf",
  "DejaVuSansMono-Oblique.ttf",
  "DejaVuSansMono-BoldOblique.ttf",
  "DejaVuSans.ttf",
];
/** DejaVu Sans Mono's advance, ascent and descent, in ems. */
const ADVANCE = 1233 / 2048;
const ASCENT = 0.928;
const LINE = 1.164;

interface Style {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  reverse: boolean;
}
interface Cell {
  text: string;
  width: number;
  style: Style;
}

const plain = (): Style => ({
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strike: false,
  reverse: false,
});

const BASIC = ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6"];
const BRIGHT = ["#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"];

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** xterm's 256 colours. */
function indexed(n: number): string {
  if (n < 8) return BASIC[n]!;
  if (n < 16) return BRIGHT[n - 8]!;
  if (n < 232) {
    const v = [0, 95, 135, 175, 215, 255];
    const i = n - 16;
    return hex(v[Math.floor(i / 36)]!, v[Math.floor(i / 6) % 6]!, v[i % 6]!);
  }
  const g = 8 + (n - 232) * 10;
  return hex(g, g, g);
}

/** Apply one SGR sequence's parameters to a style. */
function sgr(style: Style, params: number[]): Style {
  let s = { ...style };
  if (params.length === 0) params = [0];
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) s = plain();
    else if (p === 1) s.bold = true;
    else if (p === 2) s.dim = true;
    else if (p === 3) s.italic = true;
    else if (p === 4) s.underline = true;
    else if (p === 7) s.reverse = true;
    else if (p === 9) s.strike = true;
    else if (p === 22) s.bold = s.dim = false;
    else if (p === 23) s.italic = false;
    else if (p === 24) s.underline = false;
    else if (p === 27) s.reverse = false;
    else if (p === 29) s.strike = false;
    else if (p >= 30 && p <= 37) s.fg = BASIC[p - 30]!;
    else if (p >= 90 && p <= 97) s.fg = BRIGHT[p - 90]!;
    else if (p >= 40 && p <= 47) s.bg = BASIC[p - 40]!;
    else if (p >= 100 && p <= 107) s.bg = BRIGHT[p - 100]!;
    else if (p === 39) s.fg = null;
    else if (p === 49) s.bg = null;
    else if (p === 38 || p === 48) {
      let colour: string | null = null;
      if (params[i + 1] === 2) {
        colour = hex(params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0);
        i += 4;
      } else if (params[i + 1] === 5) {
        colour = indexed(params[i + 2] ?? 0);
        i += 2;
      }
      if (p === 38) s.fg = colour;
      else s.bg = colour;
    }
  }
  return s;
}

/** The screen's rows of cells, from the pane's text with its escapes. */
export function parseAnsi(text: string): Cell[][] {
  const rows: Cell[][] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const row: Cell[] = [];
    let style = plain();
    let i = 0;
    while (i < line.length) {
      if (line[i] === "\x1b") {
        const m = /^\x1b\[([0-9;:]*)([A-Za-z])/.exec(line.slice(i));
        if (m) {
          if (m[2] === "m") style = sgr(style, m[1] === "" ? [] : m[1]!.split(/[;:]/).map((n) => Number(n || 0)));
          i += m[0].length;
          continue;
        }
        const osc = /^\x1b\][^\x07\x1b]*(\x07|\x1b\\)/.exec(line.slice(i));
        i += osc ? osc[0].length : 1;
        continue;
      }
      let j = i;
      while (j < line.length && line[j] !== "\x1b") j++;
      for (const g of graphemes(line.slice(i, j))) row.push({ text: g, width: Math.max(1, graphemeWidth(g)), style });
      i = j;
    }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1]!.length === 0) rows.pop();
  return rows;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Mix two colours: `t` of the way from `a` to `b`. */
function mix(a: string, b: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const [x, y] = [p(a), p(b)];
  return hex(...(x.map((v, k) => Math.round(v + (y[k]! - v) * t)) as [number, number, number]));
}

/** A box-drawing or block character as shapes in its cell, or null where the font should draw it. */
function shape(ch: string, x: number, y: number, w: number, h: number, fill: string): string | null {
  const c = ch.codePointAt(0)!;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const t = Math.max(1, Math.round(w / 8)); // a light line
  const T = t * 2; // a heavy one
  const rect = (rx: number, ry: number, rw: number, rh: number) =>
    `<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="${fill}"/>`;
  // Which arms a light or heavy box character has: up, right, down, left; 1 light, 2 heavy, 3 double.
  const arms: Record<string, [number, number, number, number]> = {
    "─": [0, 1, 0, 1],
    "━": [0, 2, 0, 2],
    "│": [1, 0, 1, 0],
    "┃": [2, 0, 2, 0],
    "┌": [0, 1, 1, 0],
    "┐": [0, 0, 1, 1],
    "└": [1, 1, 0, 0],
    "┘": [1, 0, 0, 1],
    "├": [1, 1, 1, 0],
    "┤": [1, 0, 1, 1],
    "┬": [0, 1, 1, 1],
    "┴": [1, 1, 0, 1],
    "┼": [1, 1, 1, 1],
    "┏": [0, 2, 2, 0],
    "┓": [0, 0, 2, 2],
    "┗": [2, 2, 0, 0],
    "┛": [2, 0, 0, 2],
    "┣": [2, 2, 2, 0],
    "┫": [2, 0, 2, 2],
    "┳": [0, 2, 2, 2],
    "┻": [2, 2, 0, 2],
    "╋": [2, 2, 2, 2],
    "╴": [0, 0, 0, 1],
    "╶": [0, 1, 0, 0],
    "╵": [1, 0, 0, 0],
    "╷": [0, 0, 1, 0],
    "═": [0, 3, 0, 3],
    "║": [3, 0, 3, 0],
    "╔": [0, 3, 3, 0],
    "╗": [0, 0, 3, 3],
    "╚": [3, 3, 0, 0],
    "╝": [3, 0, 0, 3],
  };
  const a = arms[ch];
  if (a) {
    const out: string[] = [];
    const [up, right, down, left] = a;
    const thick = (k: number) => (k === 2 ? T : t);
    const hz = (from: number, to: number, k: number) => {
      if (k === 3) return rect(from, cy - t * 1.5, to - from, t) + rect(from, cy + t * 0.5, to - from, t);
      return rect(from, cy - thick(k) / 2, to - from, thick(k));
    };
    const vt = (from: number, to: number, k: number) => {
      if (k === 3) return rect(cx - t * 1.5, from, t, to - from) + rect(cx + t * 0.5, from, t, to - from);
      return rect(cx - thick(k) / 2, from, thick(k), to - from);
    };
    const reach = Math.max(up, down) === 2 || Math.max(up, down) === 3 ? T : t;
    const reachH = Math.max(left, right) === 2 || Math.max(left, right) === 3 ? T : t;
    if (left) out.push(hz(x, cx + reach / 2, left));
    if (right) out.push(hz(cx - reach / 2, x + w, right));
    if (up) out.push(vt(y, cy + reachH / 2, up));
    if (down) out.push(vt(cy - reachH / 2, y + h, down));
    return out.join("");
  }
  // Rounded corners: a quarter circle joining the two arms.
  const round: Record<string, [number, number]> = { "╭": [1, 1], "╮": [-1, 1], "╰": [1, -1], "╯": [-1, -1] };
  const r = round[ch];
  if (r) {
    const [dx, dy] = r;
    const rad = Math.min(w, h) / 2;
    const ex = dx > 0 ? x + w : x;
    const ey = dy > 0 ? y + h : y;
    const sx = cx + dx * rad;
    const sy = cy + dy * rad;
    return (
      `<path d="M ${ex.toFixed(2)} ${cy.toFixed(2)} L ${sx.toFixed(2)} ${cy.toFixed(2)} ` +
      `Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${cx.toFixed(2)} ${sy.toFixed(2)} L ${cx.toFixed(2)} ${ey.toFixed(2)}" ` +
      `fill="none" stroke="${fill}" stroke-width="${t}"/>`
    );
  }
  // Blocks: eighths from the left (▏…▉), from the bottom (▁…▇), halves and the full block.
  if (c >= 0x2589 && c <= 0x258f) return rect(x, y, (w * (0x2590 - c)) / 8, h);
  if (c >= 0x2581 && c <= 0x2587) {
    const part = (h * (c - 0x2580)) / 8;
    return rect(x, y + h - part, w, part);
  }
  if (ch === "█") return rect(x, y, w, h);
  if (ch === "▀") return rect(x, y, w, h / 2);
  if (ch === "▄") return rect(x, y + h / 2, w, h / 2);
  if (ch === "▌") return rect(x, y, w / 2, h);
  if (ch === "▐") return rect(x + w / 2, y, w / 2, h);
  if (ch === "▔") return rect(x, y, w, h / 8);
  if (ch === "▕") return rect(x + (w * 7) / 8, y, w / 8, h);
  return null;
}

export interface Options {
  cols?: number;
  rows?: number;
  fontSize?: number;
  fg?: string;
  bg?: string;
  /** The pictures on the screen, PNG files, in the order their first cells come: each drawn over its cells. */
  pictures?: string[];
}

/** A picture's cells on the screen: where its first row and column would be, its columns and rows, those shown. */
interface Placed {
  x: number;
  y: number;
  cols: number;
  rows: number;
  top: number;
  bottom: number;
}

/** A PNG's size, from its header. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.byteLength < 24 || view.getUint32(0) !== 0x89504e47) throw new Error("a screenshot's picture must be a PNG");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The pictures over their cells, as Kitty draws a placement: fitted to its box, proportions kept, centred, and clipped
 * to the rows shown. A box partly off the screen is as tall as the cells shown say, or as the picture's proportions do.
 */
function pictures(placed: Placed[], files: string[], w: number, h: number): string {
  return placed
    .map((p, k) => {
      const file = files[k];
      if (!file) return "";
      const png = new Uint8Array(readFileSync(file));
      const size = pngSize(png);
      const rows = Math.max(p.rows, Math.ceil((p.cols * w * size.height) / size.width / h));
      const box = `x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${(p.cols * w).toFixed(2)}" height="${(rows * h).toFixed(2)}"`;
      const shown = `x="${p.x.toFixed(2)}" y="${p.top.toFixed(2)}" width="${(p.cols * w).toFixed(2)}" height="${(p.bottom - p.top).toFixed(2)}"`;
      const href = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
      return (
        `<clipPath id="picture-${k}"><rect ${shown}/></clipPath>` +
        `<image ${box} href="${href}" preserveAspectRatio="xMidYMid meet" clip-path="url(#picture-${k})"/>`
      );
    })
    .join("");
}

/** The screen as an SVG: each cell's background, then its character, at its own place. */
export function toSvg(screen: Cell[][], o: Options = {}): string {
  const size = o.fontSize ?? 16;
  const w = size * ADVANCE;
  const h = size * LINE;
  const cols = o.cols ?? Math.max(...screen.map((r) => r.reduce((n, c) => n + c.width, 0)));
  const rows = o.rows ?? screen.length;
  const dfg = o.fg ?? "#c0caf5";
  const dbg = o.bg ?? "#1a1b26";
  const back: string[] = [];
  const front: string[] = [];
  // Each picture's cells, by their colour, which is the picture's id.
  const placed = new Map<string, Placed>();
  for (let y = 0; y < Math.min(rows, screen.length); y++) {
    let x = 0;
    for (const cell of screen[y]!) {
      if (x >= cols) break;
      let fg = cell.style.fg ?? dfg;
      let bg = cell.style.bg ?? dbg;
      if (cell.style.reverse) [fg, bg] = [bg, fg];
      if (cell.style.dim) fg = mix(fg, bg, 0.45);
      const px = x * w;
      const py = y * h;
      const cw = cell.width * w;
      if (bg !== dbg)
        back.push(
          `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${(cw + 0.3).toFixed(2)}" height="${(h + 0.3).toFixed(2)}" fill="${bg}"/>`,
        );
      if (cell.text.startsWith(PLACEHOLDER)) {
        const at = placeholderCell(cell.text);
        const id = cell.style.fg ?? "";
        if (at) {
          let p = placed.get(id);
          if (!p)
            placed.set(id, (p = { x: px - at.col * w, y: py - at.row * h, cols: 0, rows: 0, top: py, bottom: py }));
          p.cols = Math.max(p.cols, at.col + 1);
          p.rows = Math.max(p.rows, at.row + 1);
          p.top = Math.min(p.top, py);
          p.bottom = Math.max(p.bottom, py + h);
        }
      } else if (cell.text.trim() !== "") {
        const drawn = shape(cell.text, px, py, cw, h, fg);
        if (drawn) front.push(drawn);
        else {
          const weight = cell.style.bold ? ` font-weight="bold"` : "";
          const italic = cell.style.italic ? ` font-style="italic"` : "";
          // A wide character is centred in its two cells; the font's own advance decides the rest.
          const tx = cell.width > 1 ? px + cw / 2 : px;
          const anchor = cell.width > 1 ? ` text-anchor="middle"` : "";
          front.push(
            `<text x="${tx.toFixed(2)}" y="${(py + size * ASCENT).toFixed(2)}" fill="${fg}"${weight}${italic}${anchor}>${esc(cell.text)}</text>`,
          );
        }
      }
      if (cell.style.underline)
        front.push(
          `<rect x="${px.toFixed(2)}" y="${(py + size * (ASCENT + 0.1)).toFixed(2)}" width="${cw.toFixed(2)}" height="${Math.max(1, size / 14).toFixed(2)}" fill="${fg}"/>`,
        );
      if (cell.style.strike)
        front.push(
          `<rect x="${px.toFixed(2)}" y="${(py + h / 2).toFixed(2)}" width="${cw.toFixed(2)}" height="${Math.max(1, size / 14).toFixed(2)}" fill="${fg}"/>`,
        );
      x += cell.width;
    }
  }
  const width = cols * w;
  const height = rows * h;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">` +
    `<rect width="100%" height="100%" fill="${dbg}"/>` +
    `<g shape-rendering="crispEdges">${back.join("")}</g>` +
    pictures([...placed.values()], o.pictures ?? [], w, h) +
    `<g font-family="DejaVu Sans Mono" font-size="${size}">${front.join("")}</g></svg>`
  );
}

let ready: Promise<void> | null = null;

/** The SVG as a PNG, `scale` times its size. */
export async function toPng(svg: string, scale = 2): Promise<Uint8Array> {
  // resvg's WebAssembly is loaded once a process.
  ready ??= initWasm(readFileSync(wasm));
  await ready;
  const fontBuffers = FACES.map((f) => new Uint8Array(readFileSync(`${FONT_DIR}/${f}`)));
  const r = new Resvg(svg, {
    font: { fontBuffers, defaultFontFamily: "DejaVu Sans Mono", monospaceFamily: "DejaVu Sans Mono" },
    fitTo: { mode: "zoom", value: scale },
  });
  const image = r.render();
  const png = image.asPng();
  image.free();
  r.free();
  return png;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const cols = flag("cols");
  const rows = flag("rows");
  const scale = Number(flag("scale") ?? 2);
  const fg = flag("fg");
  const bg = flag("bg");
  const shown: string[] = [];
  for (let file = flag("picture"); file; file = flag("picture")) shown.push(file);
  const [input, output] = args;
  if (!input || !output) {
    console.error(
      "usage: bun scripts/screenshot.ts <screen.ansi|-> <out.png|out.svg> [--cols N] [--rows N] [--scale N] [--fg #hex] [--bg #hex] [--picture <png>…]",
    );
    process.exit(2);
  }
  const text = input === "-" ? await Bun.stdin.text() : readFileSync(input, "utf8");
  const svg = toSvg(parseAnsi(text), {
    cols: cols ? Number(cols) : undefined,
    rows: rows ? Number(rows) : undefined,
    fg,
    bg,
    pictures: shown,
  });
  if (output.endsWith(".svg")) writeFileSync(output, svg);
  else writeFileSync(output, await toPng(svg, scale));
}
