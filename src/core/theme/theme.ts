// Theme tokens (plan 2.6). Rendering code names semantic roles; only themes hold colours.
// Never put a hex value in layout or drawing code.
//
// A colour is `#rrggbb`, `ansi:N` (follow-the-terminal mode) or `default` (the terminal's own).

export type Color = string;

export interface RoleStyle {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
  /** Swap foreground and background — how the cursor shows without colour (NO_COLOR). */
  inverse?: boolean;
}

export const ROLES = [
  // document
  "text", "dim", "strong", "emphasis", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "code_inline", "code_block", "code_label", "code_gutter",
  "link", "link_unresolved", "link_ambiguous", "wikilink", "embed", "url", "link_focus",
  "quote", "quote_bar", "list_marker", "check_done", "check_todo", "rule",
  "table_border", "table_header",
  "fm_key", "fm_value", "fm_border", "fm_error",
  "callout_note", "callout_tip", "callout_important", "callout_warning", "callout_caution",
  "footnote", "html", "image",
  // syntax inside code blocks
  "syn_keyword", "syn_function", "syn_string", "syn_number", "syn_comment", "syn_type",
  "syn_variable", "syn_constant", "syn_operator", "syn_punctuation", "syn_tag", "syn_attr",
  "syn_builtin", "syn_meta", "syn_regexp", "syn_section", "syn_addition", "syn_deletion",
  // chrome
  "border", "status", "status_accent", "status_dim",
  "sidebar", "sidebar_dir", "sidebar_selected", "sidebar_active",
  "tab", "tab_active", "tab_active_idle", "pane_title", "pane_title_active", "overlay", "overlay_border", "overlay_selected", "overlay_match", "overlay_dim", "overlay_group", "keycap", "keycap_selected",
  "selection", "error", "warn", "info", "scrollbar", "scrollbar_track",
  "cursor", "cursor_line", "line_number", "line_number_current",
  "which_key_key", "which_key_group",
  "topbar", "topbar_button", "topbar_button_on", "topbar_chip", "hover",
  "breadcrumb", "breadcrumb_current", "breadcrumb_sep", "breadcrumb_icon", "breadcrumb_band", "tree_guide",
] as const;

export type Role = (typeof ROLES)[number];

export interface Theme {
  name: string;
  kind: "dark" | "light";
  /** Pane background and default foreground. */
  bg: Color;
  fg: Color;
  roles: Record<Role, RoleStyle>;
  source: "builtin" | "base16" | "user";
}

/**
 * Semantic palette. Hand-tuned themes and base16 schemes both reduce to this, so there is one
 * role mapping to get right rather than one per theme.
 */
export interface Palette {
  bg: Color;
  /** Darker surface: code blocks, sidebar. */
  bg_dark: Color;
  /** Raised surface: inline code, selection, status. */
  surface: Color;
  surface2: Color;
  fg: Color;
  fg_dim: Color;
  /** Bold text needs an explicit lighter foreground or it does not read as bold (2.7). */
  fg_strong: Color;
  comment: Color;
  red: Color;
  orange: Color;
  yellow: Color;
  green: Color;
  teal: Color;
  cyan: Color;
  blue: Color;
  magenta: Color;
  purple: Color;
  /** Borders need real contrast (2.7). */
  border: Color;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mix `a` into `b` by `t` (0 → b, 1 → a). */
export function blend(a: Color, b: Color, t: number): Color {
  if (!a.startsWith("#") || !b.startsWith("#")) return a;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex([x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t)]);
}

export function luminance(hex: Color): number {
  if (!hex.startsWith("#")) return 0;
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type RoleOverrides = Partial<Record<Role, RoleStyle>>;

export function themeFromPalette(
  name: string,
  p: Palette,
  source: Theme["source"],
  overrides: RoleOverrides = {},
): Theme {
  const kind = luminance(p.bg) > 0.4 ? "light" : "dark";
  const band = (c: Color) => blend(c, p.bg, kind === "dark" ? 0.14 : 0.16);
  const heading = (c: Color): RoleStyle => ({ fg: c, bg: band(c), bold: true });
  const roles: Record<Role, RoleStyle> = {
    text: { fg: p.fg },
    dim: { fg: p.fg_dim },
    strong: { fg: p.fg_strong, bold: true },
    emphasis: { fg: p.fg, italic: true },
    strike: { fg: p.fg_dim },
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
    callout_note: { fg: p.blue, bold: true },
    callout_tip: { fg: p.green, bold: true },
    callout_important: { fg: p.purple, bold: true },
    callout_warning: { fg: p.yellow, bold: true },
    callout_caution: { fg: p.red, bold: true },
    footnote: { fg: p.cyan },
    html: { fg: p.comment },
    image: { fg: p.magenta },
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
    status: { fg: p.fg_dim, bg: p.bg_dark },
    status_accent: { fg: p.bg, bg: p.blue, bold: true },
    status_dim: { fg: p.comment, bg: p.bg_dark },
    sidebar: { fg: p.fg_dim, bg: p.bg },
    sidebar_dir: { fg: p.blue },
    sidebar_selected: { fg: p.fg_strong, bg: p.surface, bold: true },
    sidebar_active: { fg: p.cyan },
    tab: { fg: p.comment, bg: p.bg_dark },
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
    which_key_key: { fg: p.orange, bg: p.bg_dark, bold: true },
    which_key_group: { fg: p.blue, bg: p.bg_dark },
    // On the page: the frame rule under it gives the bar the same air as the rows below.
    topbar: { fg: p.fg_dim },
    // Toggle buttons sit on whatever they're drawn on: dim while off, bright while on.
    topbar_button: { fg: p.comment },
    topbar_button_on: { fg: p.fg_strong, bold: true },
    topbar_chip: { fg: p.purple, bold: true },
    hover: { fg: p.fg_strong, bg: p.surface2, bold: true },
    breadcrumb_band: { bg: blend(p.surface, p.bg, 0.35) }, // the breadcrumb row's background
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
    status: { fg: a(7), bg: a(0) },
    link_focus: { fg: a(0), bg: a(6) },
    cursor: { fg: a(0), bg: a(15) },
    cursor_line: { bg: a(0) },
    which_key_key: { fg: a(3), bg: a(0), bold: true },
    which_key_group: { fg: a(4), bg: a(0) },
    topbar: { fg: a(7) },
    topbar_button: { fg: a(8) },
    topbar_button_on: { fg: a(15), bold: true },
    topbar_chip: { fg: a(5), bold: true },
    hover: { fg: a(0), bg: a(7), bold: true },
    breadcrumb_band: { bg: a(0) },
    breadcrumb: { fg: a(7) },
    breadcrumb_current: { fg: a(15), bold: true },
    breadcrumb_sep: { fg: a(8) },
    breadcrumb_icon: { fg: a(4) },
    tree_guide: { fg: a(8) },
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
  roles.cursor = { inverse: true };
  roles.cursor_line = {};
  roles.hover = { inverse: true };
  roles.topbar_button_on = { bold: true };
  roles.sidebar_active = { bold: true }; // the current note / section, without colour
  roles.topbar_button = { dim: true };
  return { ...t, name: "mono", roles };
}
