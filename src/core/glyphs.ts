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
  /** The lens's rules: heavy whatever `ui.lines` says, so they stand out from the frame. */
  lensRule: string;
  /** The lens's left bar, joining its rules: top corner, the rows, bottom corner. */
  lensBar: [string, string, string];
  /**
   * Where rules and borders meet, keyed by the directions with a line: some of u(p), d(own),
   * l(eft), r(ight), in that order — `udr` is ┣.
   */
  joints: Record<string, string>;
  dirOpen: string;
  dirClosed: string;
  /** The outline's fold markers (the explorer uses dirOpen / dirClosed). */
  foldOpen: string;
  foldClosed: string;
  /** Tree lines in the explorer and the outline: │ ├ └ ─. */
  guide: string;
  guideBranch: string;
  guideLast: string;
  guideDash: string;
  file: string;
  sep: string;
  scrollThumb: string;
  scrollTrack: string;
  /** The horizontal scrollbar (wrapping off): a lower half block, like the vertical's half. */
  hScrollThumb: string;
  hScrollTrack: string;
  dirty: string;
  /** Top bar buttons and the tab close button. */
  explorerButton: string;
  outlineButton: string;
  /** The left rail's history button. */
  historyButton: string;
  close: string;
  crumb: string;
  /** Before a window's breadcrumb. */
  crumbIcon: string;
  /** Before a message, by level, so the level shows without colour too. */
  msgError: string;
  msgWarn: string;
  msgInfo: string;
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
  lensRule: "━",
  lensBar: ["┏", "┃", "┗"],
  joints: { udlr: "╋", udr: "┣", udl: "┫", dlr: "┳", ulr: "┻", dr: "┏", dl: "┓", ur: "┗", ul: "┛" },
  dirOpen: "▾",
  dirClosed: "▸",
  foldOpen: "▾",
  foldClosed: "▸",
  guide: "│",
  guideBranch: "├",
  guideLast: "└",
  guideDash: "─",
  file: " ",
  sep: "›",
  // The bar is a thin column, unlike the ┃ borders it often sits beside; colour tells the thumb.
  scrollThumb: "▐",
  scrollTrack: "▐",
  hScrollThumb: "▄",
  hScrollTrack: "▄",
  dirty: "●",
  explorerButton: "≡",
  outlineButton: "▤",
  historyButton: "◷",
  close: "×",
  crumb: "›",
  crumbIcon: "§",
  msgError: "✗",
  msgWarn: "!",
  msgInfo: "·",
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
  dirOpen: "\u{f0770}", // nf-md-folder_open (escaped: private-use characters get lost in editing)
  dirClosed: "\u{f024b}", // nf-md-folder
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
  lensRule: "=",
  lensBar: ["+", "|", "+"],
  joints: { udlr: "+", udr: "+", udl: "+", dlr: "+", ulr: "+", dr: "+", dl: "+", ur: "+", ul: "+" },
  dirOpen: "v",
  dirClosed: ">",
  foldOpen: "v",
  foldClosed: ">",
  guide: "|",
  guideBranch: "|",
  guideLast: "`",
  guideDash: "-",
  file: " ",
  sep: ">",
  scrollThumb: "#",
  scrollTrack: "|",
  hScrollThumb: "#",
  hScrollTrack: "-",
  dirty: "*",
  explorerButton: "=",
  outlineButton: "#",
  historyButton: "~",
  close: "x",
  crumb: ">",
  crumbIcon: "#",
  msgError: "x",
  msgWarn: "!",
  msgInfo: "-",
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
export function glyphsFor(mode: GlyphMode | string, env: NodeJS.ProcessEnv = process.env, lines: "light" | "heavy" = "heavy"): Glyphs {
  const set = SETS[(Object.hasOwn(SETS, mode) ? mode : detectGlyphMode(env)) as keyof typeof SETS];
  // The frame's lines (`ui.lines`): heavy `━ ┃`, or light `─ │`; ascii has only the one kind.
  if (lines === "heavy" || set.mode === "ascii") return set;
  return { ...set, vbar: "│", hbar: "─", joints: LIGHT_JOINTS };
}

const LIGHT_JOINTS: Record<string, string> = { udlr: "┼", udr: "├", udl: "┤", dlr: "┬", ulr: "┴", dr: "┌", dl: "┐", ur: "└", ul: "┘" };
