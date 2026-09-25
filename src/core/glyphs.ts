// Glyph capability (plan 2.8): Nerd Font glyphs, a plain-Unicode set, and an ASCII fallback.
//
// Fonts cannot be probed over the terminal channel, so `auto` is a heuristic with an override:
// ASCII when the locale is not UTF-8 or on the Linux console; Nerd glyphs on terminals that
// bundle the Nerd Font symbols as a fallback font (Ghostty, kitty, WezTerm); Unicode otherwise.

import type { GlyphMode } from "./config.ts";

export interface Glyphs {
  mode: Exclude<GlyphMode, "auto">;
  heading: [string, string, string, string, string, string];
  bullets: string[];
  checkDone: string;
  checkTodo: string;
  checkOther: string;
  quoteBar: string;
  rule: string;
  /** Box drawing for tables: corners, tees, lines. Header separator uses `hh`/`hx`. */
  box: {
    tl: string; tm: string; tr: string;
    ml: string; mm: string; mr: string;
    bl: string; bm: string; br: string;
    h: string; v: string;
    hl: string; hx: string; hr: string; hh: string;
  };
  codeWrap: string;
  embed: string;
  image: string;
  footnote: string;
  callout: Record<string, string>;
  fmOpen: string;
  ellipsis: string;
  // chrome
  vbar: string;
  hbar: string;
  /** Where a horizontal rule meets a vertical border: ┣ ┫ ╋. */
  teeRight: string;
  teeLeft: string;
  cross: string;
  dirOpen: string;
  dirClosed: string;
  file: string;
  sep: string;
  scrollThumb: string;
  scrollTrack: string;
  dirty: string;
  /** Top bar buttons and the tab close button. */
  explorerButton: string;
  outlineButton: string;
  close: string;
  crumb: string;
  /** Before a window's breadcrumb. */
  crumbIcon: string;
}

const unicode: Glyphs = {
  mode: "unicode",
  heading: ["▌", "▌", "▌", "▌", "▌", "▌"],
  bullets: ["•", "◦", "▪", "▫"],
  checkDone: "☑",
  checkTodo: "☐",
  checkOther: "◪",
  quoteBar: "▎",
  rule: "─",
  box: {
    tl: "┌", tm: "┬", tr: "┐",
    ml: "├", mm: "┼", mr: "┤",
    bl: "└", bm: "┴", br: "┘",
    h: "─", v: "│",
    hl: "╞", hx: "╪", hr: "╡", hh: "═",
  },
  codeWrap: "↪",
  embed: "⧉",
  image: "▣",
  footnote: "†",
  callout: { note: "ℹ", tip: "✦", important: "❢", warning: "⚠", caution: "✖", quote: "❝" },
  fmOpen: "≡",
  ellipsis: "…",
  vbar: "┃",
  hbar: "━",
  teeRight: "┣",
  teeLeft: "┫",
  cross: "╋",
  dirOpen: "▾",
  dirClosed: "▸",
  file: " ",
  sep: "›",
  scrollThumb: "┃",
  scrollTrack: " ",
  dirty: "●",
  explorerButton: "≡",
  outlineButton: "▤",
  close: "×",
  crumb: "›",
  crumbIcon: "§",
};

const nerd: Glyphs = {
  ...unicode,
  mode: "nerd",
  // Same icons as render-markdown in the nvim config this replaces.
  heading: ["󰲡 ", "󰲣 ", "󰲥 ", "󰲧 ", "󰲩 ", "󰲫 "],
  checkDone: "󰱒",
  checkTodo: "󰄱",
  checkOther: "󰡖",
  embed: "󰈙",
  image: "󰋩",
  callout: { note: "󰋽", tip: "󰌶", important: "󰅾", warning: "󰀪", caution: "󰳦", quote: "󱆨" },
  fmOpen: "󰈮",
  dirOpen: "",
  dirClosed: "",
  file: "󰍔",
};

const ascii: Glyphs = {
  mode: "ascii",
  heading: ["#", "##", "###", "####", "#####", "######"],
  bullets: ["*", "-", "+", "-"],
  checkDone: "[x]",
  checkTodo: "[ ]",
  checkOther: "[-]",
  quoteBar: "|",
  rule: "-",
  box: {
    tl: "+", tm: "+", tr: "+",
    ml: "+", mm: "+", mr: "+",
    bl: "+", bm: "+", br: "+",
    h: "-", v: "|",
    hl: "+", hx: "+", hr: "+", hh: "=",
  },
  codeWrap: ">",
  embed: "=>",
  image: "[img]",
  footnote: "^",
  callout: { note: "(i)", tip: "(*)", important: "(!)", warning: "(!)", caution: "(x)", quote: "\"" },
  fmOpen: "---",
  ellipsis: "~",
  vbar: "|",
  hbar: "-",
  teeRight: "+",
  teeLeft: "+",
  cross: "+",
  dirOpen: "v",
  dirClosed: ">",
  file: " ",
  sep: ">",
  scrollThumb: "#",
  scrollTrack: " ",
  dirty: "*",
  explorerButton: "=",
  outlineButton: "#",
  close: "x",
  crumb: ">",
  crumbIcon: "#",
};

const SETS = { unicode, nerd, ascii };

export function detectGlyphMode(env: NodeJS.ProcessEnv = process.env): Exclude<GlyphMode, "auto"> {
  const forced = env.SLIPBOX_GLYPHS;
  if (forced === "nerd" || forced === "unicode" || forced === "ascii") return forced;
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  if (env.TERM === "linux" || (locale && !/utf-?8/i.test(locale))) return "ascii";
  const term = `${env.TERM ?? ""} ${env.TERM_PROGRAM ?? ""}`.toLowerCase();
  if (/ghostty|kitty|wezterm/.test(term)) return "nerd";
  return "unicode";
}

export function isGlyphMode(v: string): v is GlyphMode {
  return v === "auto" || Object.hasOwn(SETS, v);
}

/** Unknown modes fall back to detection rather than failing: config validation reports them. */
export function glyphsFor(mode: GlyphMode | string, env: NodeJS.ProcessEnv = process.env): Glyphs {
  return SETS[(Object.hasOwn(SETS, mode) ? mode : detectGlyphMode(env)) as keyof typeof SETS];
}
