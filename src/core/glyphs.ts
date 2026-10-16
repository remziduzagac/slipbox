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
    tl: string;
    tm: string;
    tr: string;
    ml: string;
    mm: string;
    mr: string;
    bl: string;
    bm: string;
    br: string;
    h: string;
    v: string;
    hl: string;
    hx: string;
    hr: string;
    hh: string;
  };
  codeWrap: string;
  /** A code block scrolled sideways (`[render] code_wrap`): at its left edge on a row whose text is hidden that way,
   *  and at its right. */
  codeLeft: string;
  codeRight: string;
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
  /**
   * Where rules and borders meet, keyed by the directions with a line: some of u(p), d(own),
   * l(eft), r(ight), in that order — `udr` is ┣.
   */
  joints: Record<string, string>;
  dirOpen: string;
  dirClosed: string;
  /** A folder that is its own root (17.13): one with a `.slipbox/`. */
  vault: string;
  /** The explorer's buttons (18.1): a new note, a new folder on its title; on the selected row,
   *  one that opens its menu, whose entries carry the rest. */
  newNote: string;
  newFolder: string;
  itemMenu: string;
  renameItem: string;
  moveItem: string;
  deleteItem: string;
  /** The outline's fold markers (the explorer uses dirOpen / dirClosed). */
  foldOpen: string;
  foldClosed: string;
  /** Tree lines in the explorer and the outline: │ ├ └ ─. */
  guide: string;
  guideBranch: string;
  guideLast: string;
  guideDash: string;
  file: string;
  /** Files beyond notes in the explorer: data (JSON, TOML…) and text or code. */
  dataFile: string;
  textFile: string;
  /**
   * A row's marks in the explorer (VV-D9), at its right, each one column wide in every terminal and none an emoji: its
   * index's state — indexed, being indexed, not indexed, not yours to read, a problem (a link whose target isn't
   * there) — and git's mark on a folder with a change in it (5.11), a file's being its letter.
   */
  markIndexed: string;
  markIndexing: string;
  markNotIndexed: string;
  markCantRead: string;
  markProblem: string;
  markGitFolder: string;
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
  /** The right rail's footnotes button (3.17), under the outline's. */
  footnotesButton: string;
  /** The right rail's Info button (3.19), above the outline's. */
  infoButton: string;
  /** The Problems panel's button (1.7), on the status line while the file has no problems (`⚠ 0`). */
  problemsButton: string;
  /** A git branch (17.19): in the worktree picker and the status line. */
  branch: string;
  /** The left rail's history button. */
  historyButton: string;
  /** The source control view's rail button (26.2). */
  gitButton: string;
  close: string;
  /** A pinned tab's mark, before its name. */
  pin: string;
  crumb: string;
  /** Before a window's breadcrumb. */
  crumbIcon: string;
  /** Before a message, by level, so the level shows without colour too. */
  msgError: string;
  msgWarn: string;
  msgInfo: string;
  /** A problem's severity: beside its line (the problems bar) and on the status line. */
  problemError: string;
  problemWarn: string;
  problemInfo: string;
  problemHint: string;
  /** A line changed against what's staged (26.1), in the gutter: added, changed, deleted below it, deleted above it. */
  gitAdd: string;
  gitChange: string;
  gitDelete: string;
  gitTopDelete: string;
  /** The status line's branch, ahead of its upstream and behind it (26.6): `main ↑2 ↓1`. */
  gitAhead: string;
  gitBehind: string;
  /** The status line's back and forward, around the path; the place you're at, in its history. */
  navBack: string;
  navForward: string;
  historyHere: string;
  /** A code cell's header (24.13): its definition's kind — a function or method, a class, a type, a top-level value. */
  codeFunction: string;
  codeClass: string;
  codeType: string;
  codeValue: string;
  /** A comment's cell (24.13): prose that documents nothing, in a box of its own. */
  cellNote: string;
  /** A code cell's buttons (24.13): edit it, copy it, where it's used, add it to the scratch. */
  cellEdit: string;
  cellCopy: string;
  cellRefs: string;
  cellScratch: string;
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
    tl: "┌",
    tm: "┬",
    tr: "┐",
    ml: "├",
    mm: "┼",
    mr: "┤",
    bl: "└",
    bm: "┴",
    br: "┘",
    h: "─",
    v: "│",
    hl: "╞",
    hx: "╪",
    hr: "╡",
    hh: "═",
  },
  codeWrap: "↪",
  codeLeft: "‹",
  codeRight: "›",
  embed: "⧉",
  image: "▣",
  footnote: "†",
  callout: { note: "ℹ", tip: "✦", important: "❢", warning: "⚠", caution: "✖", quote: "❝" },
  fmOpen: "≡",
  ellipsis: "…",
  vbar: "┃",
  hbar: "━",
  lensRule: "━",
  joints: { udlr: "╋", udr: "┣", udl: "┫", dlr: "┳", ulr: "┻", dr: "┏", dl: "┓", ur: "┗", ul: "┛" },
  dirOpen: "▾",
  dirClosed: "▸",
  vault: "◈",
  newNote: "+",
  newFolder: "+▸",
  itemMenu: "…",
  renameItem: "✎",
  moveItem: "↦",
  deleteItem: "✕",
  foldOpen: "▾",
  foldClosed: "▸",
  guide: "│",
  guideBranch: "├",
  guideLast: "└",
  guideDash: "─",
  file: " ",
  dataFile: " ",
  textFile: " ",
  markIndexed: "●",
  markIndexing: "◐",
  markNotIndexed: "⊘",
  // A squared key (U+26BF), not an emoji: 🔒 is drawn two columns wide in some terminals.
  markCantRead: "⚿",
  markProblem: "⚠",
  markGitFolder: "•",
  sep: "›",
  // The bar is a thin column, unlike the ┃ borders it often sits beside; colour tells the thumb.
  scrollThumb: "▐",
  scrollTrack: "▐",
  hScrollThumb: "▄",
  hScrollTrack: "▄",
  dirty: "●",
  explorerButton: "≡",
  outlineButton: "▤",
  footnotesButton: "¹",
  infoButton: "ℹ",
  problemsButton: "⚠",
  branch: "⎇",
  historyButton: "◷",
  gitButton: "±",
  close: "×",
  pin: "⚑",
  crumb: "›",
  crumbIcon: "§",
  msgError: "✗",
  msgWarn: "!",
  msgInfo: "·",
  problemError: "✖",
  problemWarn: "⚠",
  problemInfo: "ℹ",
  problemHint: "·",
  gitAdd: "▎",
  gitChange: "▎",
  gitDelete: "▁",
  gitTopDelete: "▔",
  gitAhead: "↑",
  gitBehind: "↓",
  navBack: "‹",
  navForward: "›",
  historyHere: "●",
  codeFunction: "ƒ",
  codeClass: "◆",
  codeType: "◇",
  codeValue: "•",
  cellNote: "¶",
  cellEdit: "✎",
  cellCopy: "⧉",
  cellRefs: "⇢",
  cellScratch: "◎",
};

const nerd: Glyphs = {
  ...unicode,
  problemError: "\u{ea87}", // nf-cod-error
  problemWarn: "\u{ea6c}", // nf-cod-warning
  problemInfo: "\u{ea74}", // nf-cod-info
  problemHint: "\u{ea61}", // nf-cod-lightbulb
  codeFunction: "\u{ea8c}", // nf-cod-symbol_method
  codeClass: "\u{eb5b}", // nf-cod-symbol_class
  codeType: "\u{eb61}", // nf-cod-symbol_interface
  codeValue: "\u{eb5d}", // nf-cod-symbol_constant
  cellNote: "\u{ea6b}", // nf-cod-comment
  cellEdit: "\u{ea73}", // nf-cod-edit
  cellCopy: "\u{ebcc}", // nf-cod-copy
  cellRefs: "\u{eb36}", // nf-cod-references
  cellScratch: "\u{eb05}", // nf-cod-pin
  pin: "\u{f0403}", // nf-md-pin
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
  // Material, like the folders (so the same size), and nothing like one: shelves of notes.
  vault: "\u{f125f}", // nf-md-bookshelf
  newNote: "\u{f0752}", // nf-md-file_plus
  footnotesButton: "\u{f0283}", // nf-md-format_superscript
  infoButton: "\u{f02fd}", // nf-md-information_outline
  problemsButton: "\u{f05d6}", // nf-md-alert_circle_outline
  branch: "\u{e725}", // nf-dev-git_branch
  newFolder: "\u{f0257}", // nf-md-folder_plus
  itemMenu: "\u{f01d8}", // nf-md-dots_horizontal
  renameItem: "\u{f03eb}", // nf-md-pencil
  moveItem: "\u{f0ab9}", // nf-md-file_move
  deleteItem: "\u{f0a7a}", // nf-md-trash_can_outline
  file: "󰍔",
  dataFile: "\u{f0626}", // nf-md-code_json
  textFile: "\u{f022e}", // nf-md-file_code
  markCantRead: "\u{f033e}", // nf-md-lock
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
    tl: "+",
    tm: "+",
    tr: "+",
    ml: "+",
    mm: "+",
    mr: "+",
    bl: "+",
    bm: "+",
    br: "+",
    h: "-",
    v: "|",
    hl: "+",
    hx: "+",
    hr: "+",
    hh: "=",
  },
  codeWrap: ">",
  codeLeft: "<",
  codeRight: ">",
  embed: "=>",
  image: "[img]",
  footnote: "^",
  callout: { note: "(i)", tip: "(*)", important: "(!)", warning: "(!)", caution: "(x)", quote: '"' },
  fmOpen: "---",
  ellipsis: "~",
  vbar: "|",
  hbar: "-",
  lensRule: "=",
  joints: { udlr: "+", udr: "+", udl: "+", dlr: "+", ulr: "+", dr: "+", dl: "+", ur: "+", ul: "+" },
  dirOpen: "v",
  dirClosed: ">",
  vault: "#",
  newNote: "+",
  newFolder: "+>",
  itemMenu: "...",
  renameItem: "r",
  moveItem: "m",
  deleteItem: "d",
  foldOpen: "v",
  foldClosed: ">",
  guide: "|",
  guideBranch: "|",
  guideLast: "`",
  guideDash: "-",
  file: " ",
  dataFile: " ",
  textFile: " ",
  markIndexed: "*",
  markIndexing: "~",
  markNotIndexed: "-",
  markCantRead: "#",
  markProblem: "!",
  // Not `*`, which says indexed in the column beside it.
  markGitFolder: "o",
  sep: ">",
  scrollThumb: "#",
  scrollTrack: "|",
  hScrollThumb: "#",
  hScrollTrack: "-",
  dirty: "*",
  explorerButton: "=",
  outlineButton: "#",
  footnotesButton: "^",
  infoButton: "i",
  problemsButton: "!",
  branch: "git:",
  historyButton: "~",
  gitButton: "+",
  close: "x",
  pin: "^",
  crumb: ">",
  crumbIcon: "#",
  msgError: "x",
  msgWarn: "!",
  msgInfo: "-",
  problemError: "E",
  problemWarn: "W",
  problemInfo: "I",
  problemHint: ".",
  gitAdd: "+",
  gitChange: "~",
  gitDelete: "_",
  gitTopDelete: "-",
  gitAhead: "+",
  gitBehind: "-",
  navBack: "<",
  navForward: ">",
  historyHere: "*",
  codeFunction: "f",
  codeClass: "C",
  codeType: "T",
  codeValue: "v",
  cellNote: "#",
  cellEdit: "e",
  cellCopy: "c",
  cellRefs: "r",
  cellScratch: "s",
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
export function glyphsFor(
  mode: GlyphMode | string,
  env: NodeJS.ProcessEnv = process.env,
  lines: "light" | "heavy" = "heavy",
): Glyphs {
  const set = SETS[(Object.hasOwn(SETS, mode) ? mode : detectGlyphMode(env)) as keyof typeof SETS];
  // The frame's lines (`ui.lines`): heavy `━ ┃`, or light `─ │`; ascii has only the one kind.
  if (lines === "heavy" || set.mode === "ascii") return set;
  return { ...set, vbar: "│", hbar: "─", joints: LIGHT_JOINTS };
}

const LIGHT_JOINTS: Record<string, string> = {
  udlr: "┼",
  udr: "├",
  udl: "┤",
  dlr: "┬",
  ulr: "┴",
  dr: "┌",
  dl: "┐",
  ur: "└",
  ul: "┘",
};
