// Semantic theme vocabulary and palette contracts below theme construction.

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
  "text",
  "dim",
  "strong",
  "emphasis",
  "strike",
  "highlight",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code_inline",
  "code_block",
  "code_label",
  "code_gutter",
  "link",
  "link_unresolved",
  "link_ambiguous",
  "wikilink",
  "embed",
  "url",
  "link_focus",
  "quote",
  "quote_bar",
  "list_marker",
  "check_done",
  "check_todo",
  "rule",
  "table_border",
  "table_header",
  "fm_key",
  "fm_value",
  "fm_border",
  "fm_error",
  "callout_note",
  "callout_tip",
  "callout_important",
  "callout_warning",
  "callout_caution",
  "footnote",
  "tag",
  "html",
  "image",
  "math",
  // syntax inside code blocks
  "syn_keyword",
  "syn_function",
  "syn_string",
  "syn_number",
  "syn_comment",
  "syn_type",
  "syn_variable",
  "syn_constant",
  "syn_operator",
  "syn_punctuation",
  "syn_tag",
  "syn_attr",
  "syn_builtin",
  "syn_meta",
  "syn_regexp",
  "syn_section",
  "syn_addition",
  "syn_deletion",
  // a source file's syntax error (16.9), drawn over the text in source mode; other problems by
  // severity (19.10), in source mode and the rendered view; a misspelt word (25.6)
  "syntax_error",
  "problem_error",
  "problem_warn",
  "problem_info",
  "spell",
  // chrome
  "border",
  "status",
  "status_accent",
  "view_read",
  "view_source",
  "view_lens",
  "mode_normal",
  "mode_insert",
  "mode_visual",
  "status_dim",
  "sidebar",
  "sidebar_dir",
  "sidebar_selected",
  "sidebar_active",
  "sidebar_root",
  // a row's mark in the explorer that it's indexed (VV-D9): dimmed, since most folders are
  "sidebar_mark",
  // a file's git state in the explorer (5.11); a diff's added and removed lines (5.13), and a changed line's changed
  // words, tinted more strongly than their line (GIT-D2)
  "git_new",
  "git_modified",
  "git_conflict",
  "diff_add",
  "diff_del",
  "diff_head",
  "diff_add_word",
  "diff_del_word",
  // the gutter's signs for lines changed against what's staged (26.1): added, changed, deleted
  "git_sign_add",
  "git_sign_change",
  "git_sign_delete",
  "tab",
  "tab_active",
  "tab_active_idle",
  "pane_title",
  "pane_title_active",
  "overlay",
  "overlay_border",
  "overlay_selected",
  "overlay_match",
  "overlay_dim",
  "overlay_group",
  "keycap",
  "keycap_selected",
  "selection",
  "bracket_match",
  "error",
  "warn",
  "info",
  "scrollbar",
  "scrollbar_track",
  "cursor",
  "cursor_line",
  "line_number",
  "line_number_current",
  "gutter",
  "cell_line",
  "which_key_key",
  "which_key_group",
  "topbar",
  "topbar_button",
  "topbar_button_on",
  // a button that can't be used: a mode the window's file has no view for, on its header (HDR-D2)
  "topbar_button_disabled",
  "topbar_chip",
  "topbar_group",
  "upgrade_available",
  "picture_caption",
  "hover",
  "breadcrumb",
  "breadcrumb_current",
  "breadcrumb_sep",
  "breadcrumb_icon",
  "breadcrumb_band",
  "tree_guide",
  "rail",
  "lens",
  "lens_band",
  "lens_edit",
  "lens_band_edit",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles your config may still name by an old word, each read as the role that took its place (DF-D22). */
export const OLD_ROLES: Record<string, Role> = { sidebar_vault: "sidebar_root" };

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
  /** Foreground for bold text; a theme may use its normal foreground or a stronger one (2.7). */
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

export type RoleOverrides = Partial<Record<Role, RoleStyle>>;
