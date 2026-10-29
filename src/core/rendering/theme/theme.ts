// Theme tokens (plan 2.6). Rendering code names semantic roles; only themes hold colours.
// Never put a hex value in layout or drawing code.
//
// A colour is `#rrggbb`, `ansi:N` (follow-the-terminal mode) or `default` (the terminal's own).

import { ROLES, type Color, type RoleStyle, type Role, type Theme, type Palette, type RoleOverrides } from "./roles.ts";
export {
  ROLES,
  OLD_ROLES,
  type Color,
  type RoleStyle,
  type Role,
  type Theme,
  type Palette,
  type RoleOverrides,
} from "./roles.ts";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = Number.parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Mix `a` into `b` by `t` (0 → b, 1 → a). */
export function blend(a: Color, b: Color, t: number): Color {
  if (!a.startsWith("#") || !b.startsWith("#")) return a;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex([x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t)]);
}

/** The 16 colours xterm gives `ansi:0`–`ansi:15` by default. */
const XTERM16 = [
  "#000000",
  "#cd0000",
  "#00cd00",
  "#cdcd00",
  "#0000ee",
  "#cd00cd",
  "#00cdcd",
  "#e5e5e5",
  "#7f7f7f",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#5c5cff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
];

/**
 * A colour as `#rrggbb`, for what slipbox draws as a picture (12.16, 12.17): `ansi:N` as xterm has it by default (a
 * terminal's own palette may differ), `default` as `fallback`.
 */
export function colorHex(c: Color, fallback: string): string {
  if (c.startsWith("#")) return c;
  const n = c.startsWith("ansi:") ? Number(c.slice(5)) : -1;
  if (!(n >= 0 && n <= 255)) return fallback;
  if (n < 16) return XTERM16[n]!;
  if (n >= 232) return toHex([8 + (n - 232) * 10, 8 + (n - 232) * 10, 8 + (n - 232) * 10]);
  const level = (v: number) => (v ? 55 + v * 40 : 0);
  const k = n - 16;
  return toHex([level(Math.floor(k / 36)), level(Math.floor(k / 6) % 6), level(k % 6)]);
}

export function luminance(hex: Color): number {
  if (!hex.startsWith("#")) return 0;
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function themeFromPalette(
  name: string,
  p: Palette,
  source: Theme["source"],
  overrides: RoleOverrides = {},
): Theme {
  const kind = luminance(p.bg) > 0.4 ? "light" : "dark";
  const band = (c: Color) => blend(c, p.bg, kind === "dark" ? 0.14 : 0.16);
  const heading = (c: Color): RoleStyle => ({ fg: c, bg: band(c), bold: true });
  const sign = (c: Color) => blend(c, p.bg, kind === "dark" ? 0.5 : 0.6);
  const roles: Record<Role, RoleStyle> = {
    text: { fg: p.fg },
    dim: { fg: p.fg_dim },
    strong: { fg: p.fg_strong, bold: true },
    emphasis: { fg: p.fg, italic: true },
    strike: { fg: p.fg_dim },
    // Obsidian's `==highlight==` (DF-D17): a marker pen's yellow behind the text.
    highlight: { fg: p.fg_strong, bg: blend(p.yellow, p.bg, kind === "dark" ? 0.3 : 0.4) },
    h1: heading(p.blue),
    h2: heading(p.yellow),
    h3: heading(p.green),
    h4: heading(p.teal),
    h5: heading(p.magenta),
    h6: heading(p.purple),
    // The single biggest readability win in prose: inline code with its own background (2.7).
    code_inline: { fg: p.fg_strong, bg: p.surface, italic: true },
    code_block: { fg: p.fg, bg: p.bg_dark },
    code_label: { fg: p.comment, bg: p.bg_dark, italic: true },
    code_gutter: { fg: p.comment, bg: p.bg_dark },
    link: { fg: p.blue, underline: true },
    link_unresolved: { fg: p.red, underline: true },
    link_ambiguous: { fg: p.orange, underline: true },
    wikilink: { fg: p.cyan },
    embed: { fg: p.purple, italic: true },
    url: { fg: p.comment },
    link_focus: { fg: p.bg, bg: p.cyan, bold: true },
    quote: { fg: p.fg_dim, italic: true },
    quote_bar: { fg: p.comment },
    list_marker: { fg: p.orange },
    check_done: { fg: p.green },
    check_todo: { fg: p.fg_dim },
    rule: { fg: p.surface2 },
    table_border: { fg: p.surface2 },
    table_header: { fg: p.fg_strong, bold: true },
    fm_key: { fg: p.cyan },
    fm_value: { fg: p.fg },
    fm_border: { fg: p.surface2 },
    fm_error: { fg: p.red },
    syntax_error: { fg: p.red, underline: true },
    problem_error: { fg: p.red, underline: true },
    problem_warn: { fg: p.yellow, underline: true },
    problem_info: { fg: p.cyan, underline: true },
    spell: { fg: p.magenta, underline: true },
    callout_note: { fg: p.blue, bold: true },
    callout_tip: { fg: p.green, bold: true },
    callout_important: { fg: p.purple, bold: true },
    callout_warning: { fg: p.yellow, bold: true },
    callout_caution: { fg: p.red, bold: true },
    footnote: { fg: p.cyan },
    tag: { fg: p.orange },
    html: { fg: p.comment },
    image: { fg: p.magenta },
    math: { fg: p.teal },
    syn_keyword: { fg: p.magenta, bold: true },
    syn_function: { fg: p.blue, bold: true },
    syn_string: { fg: p.green },
    syn_number: { fg: p.orange },
    syn_comment: { fg: p.comment, italic: true },
    syn_type: { fg: p.teal },
    syn_variable: { fg: p.fg },
    syn_constant: { fg: p.orange },
    syn_operator: { fg: p.cyan },
    syn_punctuation: { fg: p.fg_dim },
    syn_tag: { fg: p.red },
    syn_attr: { fg: p.yellow },
    syn_builtin: { fg: p.cyan },
    syn_meta: { fg: p.purple },
    syn_regexp: { fg: p.cyan },
    syn_section: { fg: p.blue, bold: true },
    syn_addition: { fg: p.green },
    syn_deletion: { fg: p.red },
    border: { fg: p.border },
    // The tab strip and the status line sit on the page, like the top bar.
    status: { fg: p.fg_dim },
    status_accent: { fg: p.bg, bg: p.blue, bold: true },
    view_read: { fg: p.blue, bold: true },
    view_source: { fg: p.teal, bold: true },
    view_lens: { fg: p.purple, bold: true },
    mode_normal: { fg: p.bg, bg: p.blue, bold: true },
    mode_insert: { fg: p.bg, bg: p.green, bold: true },
    mode_visual: { fg: p.bg, bg: p.magenta, bold: true },
    status_dim: { fg: p.comment },
    sidebar: { fg: p.fg_dim, bg: p.bg },
    sidebar_dir: { fg: p.blue },
    sidebar_selected: { fg: p.fg_strong, bg: p.surface, bold: true },
    sidebar_active: { fg: p.cyan },
    // A folder that is a root of its own, nested (17.13): a folder's colour — its icon tells it apart —
    // and a role of its own, for [colors] to set.
    sidebar_root: { fg: p.blue },
    // That a row is indexed (VV-D9), at its right: dimmer than its name, since most folders are.
    sidebar_mark: { fg: p.comment },
    git_new: { fg: p.green },
    git_modified: { fg: p.yellow },
    git_conflict: { fg: p.red, bold: true },
    // A diff's lines (GIT-D2): the sign in the colour, the row on a tint of it; a changed line's changed words on a
    // stronger tint, their text keeping its highlighting.
    diff_add: { fg: p.green, bg: blend(p.green, p.bg, kind === "dark" ? 0.12 : 0.14) },
    diff_del: { fg: p.red, bg: blend(p.red, p.bg, kind === "dark" ? 0.12 : 0.14) },
    diff_head: { fg: p.cyan },
    diff_add_word: { bg: blend(p.green, p.bg, kind === "dark" ? 0.32 : 0.34) },
    diff_del_word: { bg: blend(p.red, p.bg, kind === "dark" ? 0.32 : 0.34) },
    // The gutter's signs (#22): the explorer's colours for new and modified, a diff's for deleted, each halfway to the
    // page — beside every changed line, next to the line numbers, full strength draws the eye from the text.
    git_sign_add: { fg: sign(p.green) },
    git_sign_change: { fg: sign(p.yellow) },
    git_sign_delete: { fg: sign(p.red) },
    tab: { fg: p.comment },
    tab_active: { fg: p.fg_strong, bg: p.bg, bold: true },
    // Focus shows as brightness, never as colour: the active tab and the side panes' titles are
    // bright while their part of the screen has focus, dimmer (still bold) otherwise.
    tab_active_idle: { fg: p.fg_dim, bg: p.bg, bold: true },
    pane_title: { fg: p.fg_dim, bold: true },
    pane_title_active: { fg: p.fg_strong, bold: true },
    overlay: { fg: p.fg, bg: p.bg_dark },
    overlay_border: { fg: p.blue, bg: p.bg_dark },
    overlay_selected: { fg: p.fg_strong, bg: p.surface, bold: true },
    overlay_match: { fg: p.orange, bold: true },
    overlay_dim: { fg: p.comment, bg: p.bg_dark },
    // Group headings in help and the palette; key bindings drawn as keycaps.
    overlay_group: { fg: p.fg_dim, bg: p.bg_dark, bold: true },
    keycap: { fg: p.fg, bg: p.surface },
    keycap_selected: { fg: p.fg_strong, bg: p.surface2 },
    selection: { bg: p.surface2 },
    // The bracket matching the one at the cursor, and that one (25.3).
    bracket_match: { fg: p.fg_strong, bg: p.surface2, bold: true },
    error: { fg: p.red, bold: true },
    warn: { fg: p.yellow },
    info: { fg: p.cyan },
    scrollbar: { fg: p.surface2 },
    scrollbar_track: { fg: blend(p.surface, p.bg, 0.5) },
    // The reading cursor: a block over the character, and a row band behind it.
    cursor: { fg: p.bg, bg: p.fg_strong },
    cursor_line: { bg: blend(p.surface, p.bg, 0.55) },
    line_number: { fg: p.surface2 },
    line_number_current: { fg: p.orange, bold: true },
    // A code cell's lines — its box's, the tree's between a class and its members (24.13): a step brighter than the
    // frame's and the rules', so a cell stands out from the chrome around it; the indent guides in its code stay quiet.
    cell_line: { fg: blend(p.surface2, p.fg_dim, 0.35) },
    // The gutter (the problems bar, the line numbers): halfway from the page to the window header's shade, the two
    // framing the text, the gutter the quieter — not the rails' and code blocks' dark, which a code block beside it
    // would run into.
    gutter: { bg: blend(p.surface, p.bg, 0.175) },
    which_key_key: { fg: p.orange, bg: p.bg_dark, bold: true },
    which_key_group: { fg: p.blue, bg: p.bg_dark },
    // On the page: the frame rule under it gives the bar the same air as the rows below.
    topbar: { fg: p.fg_dim },
    // Toggle buttons sit on whatever they're drawn on: dim while off, bright while on.
    topbar_button: { fg: p.comment },
    topbar_button_on: { fg: p.fg_strong, bold: true },
    // Fainter than an unused one, halfway from its colour to surface2's, and in italics: it reads as disabled, not as
    // missing (HDR-D6).
    topbar_button_disabled: { fg: blend(p.comment, p.surface2, 0.5), italic: true },
    topbar_chip: { fg: p.purple, bold: true },
    upgrade_available: { fg: p.green, bold: true },
    topbar_group: { bg: blend(p.surface, p.bg, 0.35) },
    picture_caption: { bg: blend(p.surface, p.bg, 0.35) },
    hover: { fg: p.fg_strong, bg: p.surface2, bold: true },
    breadcrumb_band: { bg: blend(p.surface, p.bg, 0.35) }, // the window header's background
    // The rails: a tinted column instead of a bordered one (the tab strip's shade).
    rail: { bg: p.bg_dark },
    // The lens's rules and label: the accent, bold — clearer than any frame line.
    lens: { fg: p.blue, bold: true },
    // The lens's rows of markdown: a shade lighter than the page (a code block is darker).
    lens_band: { bg: blend(p.surface, p.bg, 0.3) },
    // While it's typed into: green, so editing never looks like reading.
    lens_edit: { fg: p.green, bold: true },
    lens_band_edit: { bg: blend(p.green, p.bg, 0.07) },
    breadcrumb: { fg: p.fg_dim },
    breadcrumb_current: { fg: p.fg_strong, bold: true },
    breadcrumb_sep: { fg: p.comment },
    breadcrumb_icon: { fg: p.blue },
    // Indent guides in the explorer and the outline.
    tree_guide: { fg: p.surface2 },
  };
  for (const [role, style] of Object.entries(overrides)) {
    roles[role as Role] = { ...roles[role as Role], ...style };
  }
  return { name, kind, bg: p.bg, fg: p.fg, roles, source };
}

/** Follow-the-terminal mode: ANSI indexed colours, so herdr's or Ghostty's theme flows through. */
export function terminalTheme(): Theme {
  const a = (n: number) => `ansi:${n}`;
  const p: Palette = {
    bg: "default",
    bg_dark: a(0),
    surface: a(8),
    surface2: a(8),
    fg: "default",
    fg_dim: a(7),
    fg_strong: a(15),
    comment: a(8),
    red: a(1),
    orange: a(3),
    yellow: a(3),
    green: a(2),
    teal: a(6),
    cyan: a(6),
    blue: a(4),
    magenta: a(5),
    purple: a(13),
    border: a(4),
  };
  const t = themeFromPalette("terminal", p, "builtin", {
    // Indexed backgrounds on headings look heavy; use colour and weight only.
    h1: { fg: a(4), bg: undefined, bold: true },
    h2: { fg: a(3), bg: undefined, bold: true },
    h3: { fg: a(2), bg: undefined, bold: true },
    h4: { fg: a(6), bg: undefined, bold: true },
    h5: { fg: a(5), bg: undefined, bold: true },
    h6: { fg: a(13), bg: undefined, bold: true },
    code_block: { fg: "default", bg: undefined },
    code_label: { fg: a(8), bg: undefined },
    code_gutter: { fg: a(8), bg: undefined },
    code_inline: { fg: a(15), bg: a(8), italic: false },
    highlight: { fg: a(0), bg: a(3) },
    status: { fg: a(7) },
    link_focus: { fg: a(0), bg: a(6) },
    cursor: { fg: a(0), bg: a(15) },
    cursor_line: { bg: a(0) },
    which_key_key: { fg: a(3), bg: a(0), bold: true },
    which_key_group: { fg: a(4), bg: a(0) },
    topbar: { fg: a(7) },
    topbar_button: { fg: a(8) },
    topbar_button_on: { fg: a(15), bold: true },
    // The palette's own colour 8 for both: told apart by dim and italics, as without colour (HDR-D5).
    topbar_button_disabled: { fg: a(8), dim: true, italic: true },
    topbar_chip: { fg: a(5), bold: true },
    topbar_group: { bg: a(0) },
    picture_caption: { bg: a(0) },
    hover: { fg: a(0), bg: a(7), bold: true },
    breadcrumb_band: { bg: a(0) },
    rail: { bg: a(0) },
    gutter: { bg: a(0) },
    cell_line: { fg: a(7) },
    lens: { fg: a(4), bold: true },
    lens_band: { bg: a(0) },
    lens_edit: { fg: a(2), bold: true },
    lens_band_edit: { bg: a(0) },
    breadcrumb: { fg: a(7) },
    breadcrumb_current: { fg: a(15), bold: true },
    breadcrumb_sep: { fg: a(8) },
    breadcrumb_icon: { fg: a(4) },
    tree_guide: { fg: a(8) },
    // A terminal's palette can't be mixed with the page: its colours, dimmed.
    git_sign_add: { fg: a(2), dim: true },
    git_sign_change: { fg: a(3), dim: true },
    git_sign_delete: { fg: a(1), dim: true },
    // Nor tinted: a diff's lines by their sign's colour alone, a changed line's changed words bold and underlined.
    diff_add: { fg: a(2), bg: undefined },
    diff_del: { fg: a(1), bg: undefined },
    diff_add_word: { bg: undefined, bold: true, underline: true },
    diff_del_word: { bg: undefined, bold: true, underline: true },
  });
  t.kind = "dark";
  return t;
}

/** NO_COLOR: no colour at all, attributes only, and still readable. */
export function monoTheme(): Theme {
  const t = terminalTheme();
  const roles = {} as Record<Role, RoleStyle>;
  for (const r of ROLES) {
    const s = t.roles[r];
    roles[r] = { bold: s.bold, italic: s.italic, underline: s.underline };
  }
  roles.link_focus = { bold: true, underline: true };
  roles.sidebar_selected = { bold: true, underline: true };
  roles.overlay_selected = { bold: true, underline: true };
  roles.status_accent = { bold: true };
  roles.selection = { underline: true };
  roles.bracket_match = { bold: true, underline: true };
  roles.cursor = { inverse: true };
  roles.cursor_line = {};
  roles.hover = { inverse: true };
  roles.topbar_button_on = { bold: true };
  roles.sidebar_active = { bold: true }; // the current note / section, without colour
  // Focus without colour: the focused title and the active tab are underlined too.
  roles.pane_title = { bold: true };
  roles.pane_title_active = { bold: true, underline: true };
  roles.tab_active_idle = { bold: true };
  roles.tab_active = { bold: true, underline: true };
  roles.topbar_button = { dim: true };
  roles.topbar_button_disabled = { dim: true, italic: true }; // not an unused one's dim alone: it can't be used (HDR-D5)
  // Links and code must still read as such without colour, and a link's status must show.
  roles.link = { underline: true };
  roles.wikilink = { underline: true };
  roles.link_unresolved = { underline: true, dim: true };
  roles.link_ambiguous = { underline: true, italic: true };
  roles.code_inline = { bold: true };
  roles.highlight = { inverse: true };
  roles.footnote = { underline: true };
  roles.tag = { bold: true };
  roles.git_conflict = { bold: true };
  roles.diff_head = { bold: true };
  roles.image = { underline: true, italic: true };
  roles.math = { italic: true };
  roles.url = { dim: true };
  roles.html = { dim: true };
  roles.dim = { dim: true };
  roles.fm_error = { bold: true };
  roles.syntax_error = { bold: true, underline: true };
  roles.problem_error = { bold: true, underline: true };
  roles.problem_warn = { underline: true };
  roles.problem_info = { underline: true };
  roles.spell = { underline: true };
  roles.lens_edit = { bold: true, underline: true }; // editing: the label says so too
  return { ...t, name: "mono", roles };
}
