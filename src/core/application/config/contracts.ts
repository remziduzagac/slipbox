// Configuration shape and load records, independent of loading and validation.

import type { LanguageConfig, ServerConfig } from "../../documents/servers/languages.ts";
import type { LinterConfig } from "../../documents/servers/linters.ts";
import type { TypeConfig } from "../../documents/model/doctypes.ts";

export type GlyphMode = "auto" | "nerd" | "unicode" | "ascii";

export interface Config {
  theme: string;
  render: {
    /** Columns held back from the render width so the right border stays visible (2.7). */
    inset: number;
    /** Cap on the text column in the TUI; 0 means use the full pane. */
    max_width: number;
    glyphs: GlyphMode;
    /** Show link URLs after link text. `auto`: only when colour is off. */
    show_urls: "auto" | "always" | "never";
    /** Opening defaults (VB-D2); legacy code strings are accepted on input. */
    notes: boolean;
    code: boolean;
    data: boolean;
    /** How the code view draws a cell (24.13): in a box, or on a band. */
    code_cells: "box" | "band";
    /** A code block too wide for the window, in a rendered note in the TUI: `scroll`, its lines whole, the block
     *  scrolling sideways on its own; or `wrap`, each long line carried on in the next row. */
    code_wrap: "scroll" | "wrap";
    /** A note's pictures (12.x): drawn under their `▣ alt` line where the terminal draws images (Kitty graphics, sixel)
     *  — `auto` — or never; `▣ alt` and its path are the floor either way. */
    images: "auto" | "never";
    /** The caption box above or below a drawn picture. */
    caption: "bottom" | "top";
    /** A picture on the internet (12.12): `ask` — its link, `enter` asks (this once, or its site) and fetches it —
     *  `show`, fetched as the note opens, or `never` fetched nor drawn. Fetched, it's cached: drawn without asking. */
    images_remote: "ask" | "show" | "never";
    /** A Mermaid diagram (12.10, 12.16): drawn in the terminal's characters — `text` — or, where pictures are drawn, as
     *  one in the theme's colours. */
    mermaid: "text" | "picture";
    /** A display's maths (12.11, 12.17): Unicode text, or, where pictures are drawn, typeset as one. Text's in text. */
    math: "text" | "picture";
  };
  walk: {
    extensions: string[];
    exclude: string[];
    max_file_size: number;
    /**
     * What makes a folder a root (21.1): a file or folder of one of these names in it. Your own config
     * only — a folder's can't decide where roots are, since it's found through them.
     */
    root_markers: string[];
  };
  /**
   * How the links slipbox writes look (21.4): each part "auto" — found from the root's tool and its
   * notes (core/workspace/links/convention.ts) — or set here, for every root, or in a root's own
   * `.slipbox/config.toml`.
   */
  links: {
    style: "auto" | "markdown" | "wiki";
    /** "name": a wikilink's, by the note's name alone; a markdown link is always a path. */
    path: "auto" | "relative" | "root" | "name";
    extension: "auto" | "keep" | "drop";
  };
  /**
   * The roots whose own code may run (23.x): paths, `~`, globs (`~/Projects/*`), each with what's
   * inside it. Elsewhere nothing a folder brings runs. Your own config only — a folder can't trust itself.
   */
  trust: { roots: string[] };
  /** Files beyond notes (16.x): which the explorer, the switcher and find show. */
  files: {
    /** "notes": notes only; "renderable": notes and data files (JSON, YAML, TOML, INI, CSV);
     *  "all": every text file the walk sees. The explorer's key toggles to "all" and back. */
    show: "auto" | "notes" | "renderable" | "all";
    /** gitignore-syntax patterns shown whatever `show` says (`*.ts`, `scripts/`). */
    include: string[];
    /** gitignore-syntax patterns never shown (the walk's own excludes apply too). */
    exclude: string[];
    /** The explorer lists hidden files and folders (names starting with `.`), `.git` aside: marked not indexed, as the
     *  walk leaves them out. Its key (`shift+h`) and the UI settings toggle it. */
    hidden: boolean;
  };
  ui: {
    /** Explorer shown beside the content on wide terminals. */
    sidebar: boolean;
    sidebar_width: number;
    /** Outline pane shown on the right on wide terminals. */
    outline: boolean;
    outline_width: number;
    /** Share of the content width (side by side) or height (stacked) given to the first window. */
    split_ratio: number;
    mouse: boolean;
    /** Below this many columns the explorer and outline overlay the content (3.14). */
    narrow_width: number;
    restore_session: boolean;
    /** Highlight the cursor row. */
    cursorline: boolean;
    /** Source line numbers in a left gutter. */
    line_numbers: boolean;
    /** The lens's counters: in a column of its own, each row's distance from the cursor's (the cursor's 0), vim's
     * counts read off it (`5j`, `d3k`): "lens", or "off". */
    relative_numbers: "lens" | "source" | "both" | "off";
    /** Wrap long lines to the pane; off, notes keep their natural width and scroll sideways. */
    wrap: boolean;
    /** Cap the text column at `readable_max` columns, centred. */
    readable_width: boolean;
    readable_max: number;
    /** Hide the top bar, frame, explorer, outline, tab strip, window headers and status line; readable width on. */
    zen: boolean;
    /** The top bar: the explorer button, the app chip, vault state. */
    /** The window header (HDR-D3): the row atop each window — a split's name, the breadcrumb, the mode's buttons, ▤. */
    window_header: boolean;
    /** The outline breadcrumb on each window's header: the headings the cursor is under. */
    breadcrumb: boolean;
    /** The frame's lines: light `─ │` or heavy `━ ┃`. */
    lines: "light" | "heavy";
    /** The rails: columns of buttons down the left edge (the explorer's) and the right (the outline's). */
    left_rail: boolean;
    right_rail: boolean;
    /** Rows of margin kept between the cursor and the top or bottom of the view. */
    scrolloff: number;
    /** Notes read elsewhere the history lists under the window's timeline; 0: none. */
    history_limit: number;
  };
  input: {
    /** The leader key; `leader` in `[keys]` means this. */
    leader: string;
    /** Show the which-key popup for pending key sequences. */
    which_key: boolean;
    /** Delay before the popup appears for prefixes other than the leader. */
    which_key_delay_ms: number;
  };
  /**
   * The lint surface (3.21): your markdownlint-cli2's findings in notes — slipbox ships no linter.
   * `enabled`: "auto" when a markdownlint config is there (~/.markdownlint-cli2.jsonc, or the
   * vault's own), "on", "off". `command`: the linter, the files appended; empty: markdownlint-cli2
   * (found, else installed into slipbox's own folder: 19.21), with ~/.markdownlint-cli2.jsonc unless
   * the vault has a config of its own. Your own config only (it names a program).
   */
  lint: {
    enabled: "auto" | "on" | "off";
    command: string[];
    follow_view: boolean;
    ignore: string[];
  };
  capture: {
    /** `root`: in the root itself; `vault`, the old word, is read as `root` (DF-D22). */
    location: "state" | "root";
    /** Scratch file name; relative to the root when location = "root". */
    file: string;
    /** Where the TUI shows the scratch: floating over the windows, or in the window on the right (#43). */
    open_in: "float" | "right";
  };
  /** Git (5.11–5.14). `base`: the branch changes and diffs are measured against; empty: `main`, else `master`. */
  git: {
    base: string;
    /** A file's lines changed against what's staged, marked in the gutter (26.1). */
    signs: boolean;
    /** Where the signs sit (#22): the gutter's first column, before the problems bar and the line numbers; its last,
     *  against the text; or the window's right edge, by the scrollbar. */
    signs_at: "gutter_left" | "gutter_right" | "window_right";
    /** The bases a branch's own is guessed among (GIT-D10): the nearest of them, by merge base; `base` too, when
     * set. */
    bases: string[];
    /** Where a worktree slipbox makes goes (GIT-D13): a path template of `{parent}`, `{repo}`, `{branch}` and `~`. */
    worktrees: string;
    /** How a note's diff opens (GIT-D2): its changed blocks before and after, or its lines; `tab` switches. */
    diff: "blocks" | "source";
    /** A code file's diff (GIT-D7): side by side where each side has 80 columns (`auto`), always, or never. */
    diff_layout: "auto" | "unified" | "split";
  };
  /** Search (6.x): `auto`, the index when it's built, else a scan of the files; `index`, the index
   *  (built first when there's none); `scan`, the files every time (no index kept). */
  search: {
    engine: "auto" | "index" | "scan";
  };
  /** The background auto-index of the home folder (20.9): on or off, and how long nobody has been
   *  working — no key in the TUI, no CLI command from an agent — before it works. */
  index: {
    background: boolean;
    idle_seconds: number;
  };
  /** A file's problems shown where they are (19.8–19.11): `bar`, a column beside the text with each
   *  line's count — `auto` while the file has had any, `on` always, `off` never; `marks`, the least
   *  severity underlined in the text (`off`: none); `severity`, the least that shows (a note not written
   *  yet is `info`). */
  diagnostics: {
    bar: "auto" | "on" | "off";
    marks: "off" | "error" | "warning" | "info";
    severity: "error" | "warning" | "info" | "hint";
  };
  /** Language servers in Helix's shape (19.2): each changed or added by name — its command, args,
   *  settings (`config`), environment — over the built-in ones (`core/documents/servers/languages.ts`). */
  "language-server": Record<string, ServerConfig>;
  /** Languages in Helix's shape (`[[language]]`): a language's servers, roots and file types — and its
   *  linters without a server (`linters`, 19.19). */
  language: LanguageConfig[];
  /** Linters without a server (19.19), in efm-langserver's keys (`lint-command`, `lint-formats`,
   *  `lint-stdin`…): each changed or added by name over the built-in ones (`core/documents/servers/linters.ts`). */
  linter: Record<string, LinterConfig>;
  /** Language servers for the code slipbox opens (19.x). */
  lsp: {
    /** Language servers for the code slipbox opens (19.x): its problems, hover, jumps. */
    enabled: boolean;
    /** Servers published on npm installed into slipbox's own folder when first needed (19.5), and
     *  markdownlint-cli2 for the lint surface (19.21). */
    auto_install: boolean;
  };
  /** Document types (22.2, 22.3): notes of a kind by where they are, what their frontmatter must have, their
   *  conventions — each by name, over the built-in `skill` and `adr` (`core/documents/model/doctypes.ts`). */
  types: Record<string, TypeConfig>;
  /** Updates (14.4): a release build asks, once a day in the TUI, whether there's a newer one. Read from your own
   *  config only — a folder's can't turn it on — and off with DO_NOT_TRACK set. */
  update: {
    check: boolean;
  };
  /** The context bundle (9.7): a note with what it links to and what links to it, for an agent. */
  context: {
    /** Links followed out from the note: 1, what it links to; 0, none. */
    depth: number;
    /** The notes linking to it, too. */
    backlinks: boolean;
    /** At most this many files; the rest are named. */
    limit: number;
  };
  editor: {
    /**
     * The editor slipbox steps aside for (4.1): it runs in this terminal and slipbox waits. `{file}`
     * and `{line}` are filled in inside each argument — never through a shell (13.2). Empty:
     * `$VISUAL`, else `$EDITOR`, else `vi`, given the line when it's a known editor.
     */
    command: string;
    /**
     * The editor already running elsewhere to send a note to (4.12): commands run in order, each
     * waited for before the next (slipbox itself doesn't wait). One string is one command, e.g.
     * `code -g {file}:{line}`; nvim takes two, since its `--remote` has no `+{line}`:
     * `nvim --server S --remote {file}`, then `nvim --server S --remote-send <C-\><C-N>:{line}<CR>`.
     * `{server}` is a socket picked from the running nvims. `["nvim"]` (the default) is the preset:
     * find the running nvims, pick one (remembered per root), then those two commands. The watcher
     * picks up its saves. Empty: off.
     */
    remote: string[];
    /**
     * Save a changed note after this long without a key (ms); 0: never. Not mid-insert, not over a
     * file changed on disk, not after (K)eep yours until a confirmed save, not during a git commit.
     */
    autosave_ms: number;
    /** What the editing keys (i, a, o…) switch a rendered window to: "source" or "live" preview. */
    edit_in: "source" | "lens" | "live";
    /** The lens (live preview): at least this many rows of markdown, its neighbours pulled in. */
    lens_min_rows: number;
    /** …and it stops taking in neighbours at this share of the window (a bigger block shows whole). */
    lens_max: number;
    /** Typing an opening bracket or a quote puts its closing one after the cursor (25.3); off by default. */
    auto_pairs: boolean;
  };
  /** Spelling in notes (25.6). */
  spell: {
    /** Misspelt words marked in notes; `space u s` turns it on or off for the session. Off by default. */
    enabled: boolean;
    /** The languages a note is checked in when its front matter names none (`lang: tr`). */
    languages: string[];
    /** Your own Hunspell dictionaries by language: the path to its `.dic`, its `.aff` beside it. */
    dictionaries: Record<string, string>;
  };
  watch: {
    enabled: boolean;
    debounce_ms: number;
    /** Interval for directories that cannot be watched, and for everything when watching degrades. */
    poll_ms: number;
  };
  /**
   * key sequence → command spec, e.g. `"leader l n" = "link.next"`; `""` unbinds a default.
   * Sub-tables `visual`, `source`, `explorer`, `git`, `outline`, `footnotes`, `info` and `resize` hold the
   * keymaps of those contexts.
   */
  keys: Record<string, string> & {
    visual?: Record<string, string>;
    /** Source mode's own keys, before the reading ones (`x` deletes a character there). */
    source?: Record<string, string>;
    explorer?: Record<string, string>;
    /** The git panel's own keys (GIT-D12): staging, discarding, committing, the remote's, the branches'. */
    git?: Record<string, string>;
    outline?: Record<string, string>;
    /** The footnotes view's own keys (3.18): the outline's, and a / e / d / r. */
    footnotes?: Record<string, string>;
    /** The Info view's own keys (3.19): the pane's moves, and y (copy) and e (edit). */
    info?: Record<string, string>;
    resize?: Record<string, string>;
  };
  /** `:` aliases: alias → command spec, e.g. `wq = "app.quit"`; `""` removes a default. */
  aliases: Record<string, string>;
  /**
   * Per-role colour overrides on top of the theme: `role = "#rrggbb"` (the foreground) or
   * `role = { fg, bg, bold, italic, underline, dim }`; `[colors.<theme>]` applies to one theme.
   * Validated when applied (core/theme: applyColorOverrides).
   */
  colors: Record<string, unknown>;
  /** which-key group names by prefix, e.g. `"leader l" = "links"`. */
  groups: Record<string, string>;
}

export interface LoadedConfig {
  config: Config;
  sources: string[];
  warnings: string[];
  /** Which file set each `section.key` taken (the last to set it), for saying where a setting came from. */
  origins: Record<string, string>;
}

export interface LoadConfigOptions {
  vaultRoot?: string | null;
  /** The vault's config file, in place of `vaultRoot`; none for a plain folder (20.22). */
  vaultFile?: string | null;
  /**
   * The config files of the vaults enclosing it (20.7), broadest first: deeper over broader, each
   * over your own and under the vault's. A vault's file all the same: it never names a program.
   */
  outerFiles?: string[];
  /** `--config` flag; overrides `SLIPBOX_CONFIG` and the XDG location. */
  configFile?: string;
  /**
   * Each file's last good contents, kept across reloads: a file that fails to parse (a typo while
   * it's being edited) then keeps what it said before instead of dropping to the defaults.
   */
  lastGood?: Map<string, Record<string, unknown>>;
}
