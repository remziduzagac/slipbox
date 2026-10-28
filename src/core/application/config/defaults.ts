// Default settings and the original vault template, shared by loading and presentation.

import type { Config } from "./contracts.ts";

export const DEFAULT_CONFIG: Config = {
  theme: "tokyo-night",
  render: {
    inset: 4,
    max_width: 0,
    glyphs: "auto",
    show_urls: "auto",
    notes: true,
    code: true,
    data: true,
    code_cells: "box",
    code_wrap: "scroll",
    images: "auto",
    caption: "bottom",
    images_remote: "ask",
    mermaid: "text",
    math: "text",
  },
  walk: {
    extensions: ["md", "markdown"],
    exclude: [],
    max_file_size: 4 * 1024 * 1024,
    root_markers: [".git", ".slipbox", ".obsidian", ".zk"],
  },
  links: { style: "auto", path: "auto", extension: "auto" },
  trust: { roots: [] },
  files: { show: "auto", include: [], exclude: [], hidden: false },
  ui: {
    sidebar: true,
    sidebar_width: 30,
    outline: false,
    outline_width: 32,
    split_ratio: 0.5,
    mouse: true,
    narrow_width: 90,
    restore_session: true,
    cursorline: true,
    line_numbers: true,
    relative_numbers: "lens",
    wrap: true,
    readable_width: false,
    readable_max: 100,
    zen: false,
    window_header: true,
    breadcrumb: true,
    lines: "light",
    left_rail: true,
    right_rail: true,
    scrolloff: 3,
    history_limit: 100,
  },
  input: { leader: "space", which_key: true, which_key_delay_ms: 500 },
  lint: { enabled: "auto", command: [], follow_view: true, ignore: [] },
  capture: { location: "state", file: "scratch.md", open_in: "float" },
  git: {
    base: "",
    signs: true,
    signs_at: "gutter_right",
    bases: ["main"],
    worktrees: "{parent}/{repo}-{branch}",
    diff: "blocks",
    diff_layout: "auto",
  },
  search: { engine: "auto" },
  index: { background: true, idle_seconds: 30 },
  diagnostics: { bar: "auto", marks: "error", severity: "warning" },
  "language-server": {},
  language: [],
  linter: {},
  lsp: { enabled: true, auto_install: true },
  update: { check: true },
  types: {},
  context: { depth: 1, backlinks: true, limit: 25 },
  editor: {
    command: "",
    remote: ["nvim"],
    autosave_ms: 30000,
    edit_in: "lens",
    lens_min_rows: 6,
    lens_max: 0.5,
    auto_pairs: false,
  },
  spell: { enabled: false, languages: ["en"], dictionaries: {} },
  watch: { enabled: true, debounce_ms: 120, poll_ms: 2000 },
  keys: {},
  aliases: {},
  colors: {},
  groups: {},
};

export const VAULT_CONFIG_TEMPLATE = `# slipbox: this folder's settings. They override ~/.config/slipbox/config.toml.
# Every key: docs/manual/configuration.md in slipbox's documentation.

# theme = "tokyo-night"

[walk]
# Extra gitignore-syntax patterns to leave out of this vault, on top of .gitignore.
# exclude = ["archive/"]
`;
