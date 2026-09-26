// Layout IR → ANSI text, for `slipbox render` (the phase 1 snapshot surface) and any other
// non-TUI output. Pure string building; the TUI draws the same IR through OpenTUI instead.

import type { Color, Theme } from "../theme/theme.ts";
import { hexToRgb } from "../theme/theme.ts";
import { stringWidth } from "../width.ts";
import type { Layout, Line } from "./ir.ts";
import { type CellStyle, lineFillBg, spanStyle } from "./style.ts";

export type ColorDepth = "none" | "16" | "256" | "truecolor";

export function detectColorDepth(env: NodeJS.ProcessEnv = process.env, isTTY = !!process.stdout.isTTY): ColorDepth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (!isTTY) return "none";
  const ct = (env.COLORTERM ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return "truecolor";
  const term = env.TERM ?? "";
  if (/-direct|ghostty|kitty|wezterm/.test(term) || /ghostty|iterm|wezterm/i.test(env.TERM_PROGRAM ?? "")) return "truecolor";
  if (/256/.test(term)) return "256";
  if (term === "dumb") return "none";
  return "16";
}

function rgbTo256(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const q = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  const ci = 16 + 36 * q(r) + 6 * q(g) + q(b);
  const avg = (r + g + b) / 3;
  const gi = avg > 238 ? 255 : 232 + Math.round((avg - 8) / 10);
  const dist = (i: number) => {
    const levels = [0, 95, 135, 175, 215, 255];
    const c = i >= 232 ? [8 + (i - 232) * 10, 8 + (i - 232) * 10, 8 + (i - 232) * 10] : [levels[Math.floor((i - 16) / 36)]!, levels[Math.floor((i - 16) / 6) % 6]!, levels[(i - 16) % 6]!];
    return (c[0]! - r) ** 2 + (c[1]! - g) ** 2 + (c[2]! - b) ** 2;
  };
  return dist(gi) < dist(ci) ? gi : ci;
}

function rgbTo16(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const bright = Math.max(r, g, b) > 170 ? 8 : 0;
  const bit = (v: number) => (v > 100 ? 1 : 0);
  const idx = bit(r) | (bit(g) << 1) | (bit(b) << 2);
  return idx + (idx === 0 && Math.max(r, g, b) > 60 ? 8 : bright);
}

/** The xterm 256-colour palette entry `n` (16–255) as #rrggbb: the 6×6×6 cube, then greys. */
function paletteHex(n: number): string {
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `#${hex(v)}${hex(v)}${hex(v)}`;
  }
  const i = n - 16;
  const step = (k: number) => (k === 0 ? 0 : 55 + k * 40);
  return `#${hex(step(Math.floor(i / 36)))}${hex(step(Math.floor(i / 6) % 6))}${hex(step(i % 6))}`;
}

function colorCode(c: Color | null, fg: boolean, depth: ColorDepth): string {
  if (c === null) return fg ? "39" : "49";
  if (c === "default") return fg ? "39" : "49";
  if (c.startsWith("ansi:")) {
    const n = Number(c.slice(5));
    if (n < 8) return String((fg ? 30 : 40) + n);
    if (n < 16) return String((fg ? 90 : 100) + n - 8);
    if (depth === "16") {
      // A 256-colour palette entry, on a 16-colour terminal: the nearest of the 16.
      const m = rgbTo16(paletteHex(n));
      return m < 8 ? String((fg ? 30 : 40) + m) : String((fg ? 90 : 100) + m - 8);
    }
    return `${fg ? 38 : 48};5;${n}`;
  }
  if (depth === "truecolor") {
    const [r, g, b] = hexToRgb(c);
    return `${fg ? 38 : 48};2;${r};${g};${b}`;
  }
  if (depth === "256") return `${fg ? 38 : 48};5;${rgbTo256(c)}`;
  const n = rgbTo16(c);
  return n < 8 ? String((fg ? 30 : 40) + n) : String((fg ? 90 : 100) + n - 8);
}

function sgr(s: CellStyle, depth: ColorDepth, withBg: boolean): string {
  const codes = ["0", colorCode(s.fg, true, depth)];
  if (withBg && s.bg) codes.push(colorCode(s.bg, false, depth));
  if (s.bold) codes.push("1");
  if (s.dim) codes.push("2");
  if (s.italic) codes.push("3");
  if (s.underline) codes.push("4");
  if (s.strike) codes.push("9");
  return `\x1b[${codes.join(";")}m`;
}

export interface AnsiOptions {
  depth: ColorDepth;
  /** Paint the theme's page background behind every row (otherwise the terminal's own shows). */
  pageBackground?: boolean;
  /** Left margin in columns. */
  margin?: number;
}

export function layoutToAnsi(layout: Layout, theme: Theme, opts: AnsiOptions): string {
  return layout.lines.map((line) => lineToAnsi(line, layout.width, theme, opts)).join("\n") + "\n";
}

export function lineToAnsi(line: Line, width: number, theme: Theme, opts: AnsiOptions): string {
  const margin = " ".repeat(opts.margin ?? 0);
  if (opts.depth === "none") {
    const text = line.spans.map((s) => s.text).join("");
    return (margin + text).replace(/\s+$/, "");
  }
  const page = opts.pageBackground && theme.bg.startsWith("#") ? theme.bg : null;
  let out = "";
  if (margin) out += `${sgr({ fg: theme.fg, bg: page, bold: false, italic: false, underline: false, strike: false, dim: false }, opts.depth, !!page)}${margin}`;
  let used = 0;
  for (const span of line.spans) {
    const st = spanStyle(theme, span, line);
    if (!st.bg && page) st.bg = page;
    out += sgr(st, opts.depth, true) + span.text;
    used += stringWidth(span.text);
  }
  const fill = lineFillBg(theme, line) ?? page;
  if (fill && used < width) {
    out += `\x1b[0;${colorCode(fill, false, opts.depth)}m${" ".repeat(width - used)}`;
  }
  return `${out}\x1b[0m`;
}
