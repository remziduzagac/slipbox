// Config loader (plans 0.9, 20.7): TOML, defaults ← yours ← each enclosing root's .slipbox/config.toml ← the
// root's own; deeper wins.
// Must run correctly with no config at all, and never crash on a bad one — problems become
// warnings in the message sink.

import { deepMerge, type LanguageConfig, type ServerConfig, SERVERS } from "./servers/languages.ts";
import { type LinterConfig, LINTERS } from "./servers/linters.ts";
import { existsSync } from "node:fs";
import { readRegular, SMALL_FILE } from "./fsutil.ts";
import { refName } from "./gitops.ts";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { tildePath, userConfigFile } from "./paths.ts";
import { KEY_KINDS, type TypeConfig } from "./doctypes.ts";

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
   * notes (core/convention.ts) — or set here, for every root, or in a root's own `.slipbox/config.toml`.
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
    /** The lens's counters: in a column of its own, each row's distance from the cursor's (the cursor's 0), vim's counts
     *  read off it (`5j`, `d3k`): "lens", or "off". */
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
    /** The bases a branch's own is guessed among (GIT-D10): the nearest of them, by merge base; `base` too, when set. */
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
   *  settings (`config`), environment — over the built-in ones (`core/servers/languages.ts`). */
  "language-server": Record<string, ServerConfig>;
  /** Languages in Helix's shape (`[[language]]`): a language's servers, roots and file types — and its
   *  linters without a server (`linters`, 19.19). */
  language: LanguageConfig[];
  /** Linters without a server (19.19), in efm-langserver's keys (`lint-command`, `lint-formats`,
   *  `lint-stdin`…): each changed or added by name over the built-in ones (`core/servers/linters.ts`). */
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
   *  conventions — each by name, over the built-in `skill` and `adr` (`core/doctypes.ts`). */
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

/** Settings that were, and why they aren't: said once, never an unknown key's warning. */
const RETIRED: Record<string, string> = {
  "ui.top_bar": "the top bar is always shown",
  rename: "renames no longer write a note's old name into it; links reach notes by their paths",
};

/** Values your config may still say vault for, each read as the word that took its place (DF-D22). */
const OLD_VALUES: Record<string, Record<string, string>> = {
  "capture.location": { vault: "root" },
  // The explorer's actions, bound in [keys.explorer].
  "keys.explorer": { rename_vault: "rename_root", make_vault: "make_root", unmake_vault: "unmake_root" },
};

/** The word that took an old one's place where `path` takes it, else the value as given. */
function renewed(path: string, value: string): string {
  const old = Object.hasOwn(OLD_VALUES, path) ? OLD_VALUES[path]! : {};
  return Object.hasOwn(old, value) ? old[value]! : value;
}

/** Keys whose values come from a fixed set. Anything else is a warning and the default stays. */
const ENUMS: Record<string, readonly string[]> = {
  "render.glyphs": ["auto", "nerd", "unicode", "ascii"],
  "render.show_urls": ["auto", "always", "never"],
  "render.code_cells": ["box", "band"],
  "render.code_wrap": ["scroll", "wrap"],
  "render.caption": ["bottom", "top"],
  "render.images": ["auto", "never"],
  "render.images_remote": ["ask", "show", "never"],
  "render.mermaid": ["text", "picture"],
  "render.math": ["text", "picture"],
  "capture.location": ["state", "root"],
  "capture.open_in": ["float", "right"],
  "git.signs_at": ["gutter_left", "gutter_right", "window_right"],
  "git.diff": ["blocks", "source"],
  "git.diff_layout": ["auto", "unified", "split"],
  "lint.enabled": ["auto", "on", "off"],
  "search.engine": ["auto", "index", "scan"],
  "diagnostics.bar": ["auto", "on", "off"],
  "diagnostics.marks": ["off", "error", "warning", "info"],
  "diagnostics.severity": ["error", "warning", "info", "hint"],
  "ui.lines": ["light", "heavy"],
  "ui.relative_numbers": ["lens", "source", "both", "off"],
  "files.show": ["auto", "notes", "renderable", "all"],
  "editor.edit_in": ["source", "lens", "live"],
  "links.style": ["auto", "markdown", "wiki"],
  "links.path": ["auto", "relative", "root", "name"],
  "links.extension": ["auto", "keep", "drop"],
};

/** Numeric keys and their allowed range. */
const RANGES: Record<string, [number, number]> = {
  "editor.lens_min_rows": [1, 200],
  "editor.lens_max": [0.1, 1],
  "editor.autosave_ms": [0, 3_600_000],
  "render.inset": [0, 40],
  "render.max_width": [0, 1000],
  "walk.max_file_size": [1, 1 << 30],
  "index.idle_seconds": [1, 86_400],
  "ui.sidebar_width": [8, 200],
  "ui.outline_width": [8, 200],
  "ui.split_ratio": [0.2, 0.8],
  "ui.readable_max": [20, 1000],
  "ui.scrolloff": [0, 50],
  // Up to 2,000 of the reading positions kept (positions.json holds the newest 5,000, every root's).
  "ui.history_limit": [0, 2000],
  "input.which_key_delay_ms": [0, 10_000],
  "ui.narrow_width": [0, 1000],
  "watch.debounce_ms": [0, 10_000],
  "watch.poll_ms": [50, 600_000],
  "context.depth": [0, 5],
  "context.limit": [1, 500],
};

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

export function loadConfig(opts: LoadConfigOptions = {}): LoadedConfig {
  const warnings: string[] = [];
  const sources: string[] = [];
  const origins: Record<string, string> = {};
  let config = structuredClone(DEFAULT_CONFIG);

  const userFile = opts.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile();
  const files = [userFile, ...(opts.outerFiles ?? []).filter((f) => f !== userFile)];
  if (opts.vaultFile) files.push(opts.vaultFile);
  else if (opts.vaultRoot) files.push(join(opts.vaultRoot, ".slipbox", "config.toml"));

  for (const file of files) {
    // Named in its warnings as it's read best, `~/…`: a row of the messages list is cut where the window ends (#40).
    const shown = tildePath(file);
    if (!existsSync(file)) {
      if (file === opts.configFile) warnings.push(`config: ${shown} does not exist`);
      continue;
    }
    let data: Record<string, unknown>;
    try {
      data = parseToml(readRegular(file, SMALL_FILE).toString("utf8")) as Record<string, unknown>;
      opts.lastGood?.set(file, structuredClone(data));
    } catch (err) {
      const kept = opts.lastGood?.get(file);
      warnings.push(
        `config: ${shown}: ${(err as Error).message.split("\n")[0]}${kept ? " — keeping what it said before" : ""}`,
      );
      if (!kept) continue;
      data = structuredClone(kept);
    }
    // The vault's identity (17.4) isn't a setting: read by core/registry.ts, never merged.
    if ("vault" in data) {
      if (file === userFile)
        warnings.push(`config: ${shown}: [vault] belongs in a folder's .slipbox/config.toml (its identity); ignored`);
      delete data.vault;
    }
    if (file !== userFile) dropUserOnly(data, shown, warnings);
    // `marks` was on or off before it was a severity: on marked every problem shown, off none.
    const diag = data.diagnostics;
    if (isPlainObject(diag) && typeof diag.marks === "boolean") diag.marks = diag.marks ? "info" : "off";
    config = merge(config, data, shown, "", warnings);
    // A key this file set, and the merge took (a bad value is warned of and left as it was).
    for (const [section, table] of Object.entries(data)) {
      if (!isPlainObject(table)) continue;
      const now = (config as unknown as Record<string, unknown>)[section];
      if (!isPlainObject(now)) continue;
      for (const [key, value] of Object.entries(table))
        if (JSON.stringify(now[key]) === JSON.stringify(value)) origins[`${section}.${key}`] = file;
    }
    sources.push(file);
  }
  // Trusted roots (23.x): strings only — a path, `~`, a glob.
  const roots = config.trust.roots.filter((r) => typeof r === "string" && r.trim() !== "");
  if (roots.length !== config.trust.roots.length) {
    warnings.push(
      `config: trust.roots takes paths and globs ("~/Projects/*"); ignored ${JSON.stringify(config.trust.roots.filter((r) => !roots.includes(r)))}`,
    );
    config.trust.roots = roots;
  }
  // Root markers (21.1): plain names, each a file or folder looked for in a folder — never a path.
  const markers = config.walk.root_markers.filter(
    (m) => typeof m === "string" && m !== "" && m !== "." && m !== ".." && !/[/\\]/.test(m),
  );
  if (markers.length !== config.walk.root_markers.length) {
    warnings.push(
      `config: walk.root_markers takes names (".git", ".obsidian"), not paths; ignored ${JSON.stringify(config.walk.root_markers.filter((m) => !markers.includes(m)))}`,
    );
    config.walk.root_markers = markers;
  }
  // The scratch's file name: a plain relative path inside the project, never empty, absolute or
  // climbing out (a cloned vault's config must not aim `slipbox capture` at any file; symlinks on
  // the way are refused where the path is used, in core/capture.ts).
  if (!isSafeRelative(config.capture.file) || !/\.(md|markdown)$/i.test(config.capture.file)) {
    warnings.push(
      `config: capture.file must be a relative .md path inside the project, not hidden (got ${JSON.stringify(config.capture.file)}); using "${DEFAULT_CONFIG.capture.file}"`,
    );
    config.capture.file = DEFAULT_CONFIG.capture.file;
  }
  // A base (GIT-D10): a branch's name, a tag's or a commit's, as git takes one; anything else left out.
  if (config.git.base && !refName(config.git.base)) {
    warnings.push(`config: git.base takes a branch's name; ignored ${JSON.stringify(config.git.base)}`);
    config.git.base = "";
  }
  const bases = config.git.bases.filter((b) => typeof b === "string" && refName(b));
  if (bases.length !== config.git.bases.length) {
    warnings.push(
      `config: git.bases takes branches' names; ignored ${JSON.stringify(config.git.bases.filter((b) => !bases.includes(b)))}`,
    );
    config.git.bases = bases;
  }
  return { config, sources, warnings, origins };
}

/**
 * Settings only your own config may set, each with why. A folder's committed config comes with whatever you clone,
 * so it never sets slipbox's own commands (a known server's `config` still reaches the server, trusted as everything
 * is: 19.6, configuration.md), nor what reaches the network: fetching a note's web pictures tells their sites who read
 * what, installing fetches from npm (DF-D1), and the update check asks slipbox's releases (DF-D23).
 */
export const USER_ONLY: Record<string, string> = {
  "editor.command": "it runs a program",
  "editor.remote": "it runs a program",
  "lint.command": "it runs a program",
  "render.images_remote": "what reaches the network is yours to allow",
  "lsp.auto_install": "what reaches the network is yours to allow",
  "update.check": "what reaches the network is yours to allow",
  "git.worktrees": "it says where slipbox makes folders, outside the vault",
};

/**
 * Commands a vault's keys and aliases may not name: each throws work away (quit without saving,
 * revert, overwrite, clear), and a cloned vault could otherwise put one on ctrl+s or :wq.
 */
export const VAULT_FORBIDDEN_COMMANDS = [
  "app.quit_force",
  "note.revert",
  "note.save_force",
  "scratch.clear",
  "shell.run",
  "shell.filter",
  "help.report_send",
];

/** Of those, the ones that run a program (25.7, RPT-D6): a folder's key would run what the folder chose. */
const RUNS_A_PROGRAM = new Set(["shell.run", "shell.filter", "help.report_send"]);

function dropUserOnly(data: Record<string, unknown>, file: string, warnings: string[]): void {
  // Keys and aliases (every mode's table) that name a command throwing work away.
  const strip = (table: unknown, where: string) => {
    if (!isPlainObject(table)) return;
    for (const [k, v] of Object.entries(table)) {
      if (isPlainObject(v)) strip(v, `${where}.${k}`);
      else if (typeof v === "string" && VAULT_FORBIDDEN_COMMANDS.includes(v.split(" ")[0]!)) {
        delete table[k];
        warnings.push(
          `config: ${file} binds ${where}.${k} to ${v}, which only your own config may (${RUNS_A_PROGRAM.has(v.split(" ")[0]!) ? "it runs a program" : "it throws work away"}); ignored`,
        );
      }
    }
  };
  strip(data.keys, "keys");
  strip(data.aliases, "aliases");
  // A server's program is the user's choice (19.2): a vault may tune a known server's settings, never
  // name what runs — its command, arguments, environment, or a server slipbox doesn't know (its name
  // would be the program run).
  const servers = data["language-server"];
  if (isPlainObject(servers)) {
    for (const [name, s] of Object.entries(servers)) {
      if (!Object.hasOwn(SERVERS, name)) {
        delete servers[name];
        warnings.push(
          `config: ${file} adds the language server ${name}, which only your own config may (it runs a program); ignored`,
        );
        continue;
      }
      for (const k of ["command", "args", "environment"]) {
        if (!isPlainObject(s) || !(k in s)) continue;
        delete s[k];
        warnings.push(
          `config: ${file} sets language-server.${name}.${k}, which only your own config may set (it runs a program); ignored`,
        );
      }
    }
  }
  // A linter's likewise (19.19): its command, or a linter slipbox doesn't know.
  const linters = data.linter;
  if (isPlainObject(linters)) {
    for (const [name, l] of Object.entries(linters)) {
      if (!Object.hasOwn(LINTERS, name)) {
        delete linters[name];
        warnings.push(
          `config: ${file} adds the linter ${name}, which only your own config may (it runs a program); ignored`,
        );
        continue;
      }
      if (isPlainObject(l) && "lint-command" in l) {
        delete l["lint-command"];
        warnings.push(
          `config: ${file} sets linter.${name}.lint-command, which only your own config may set (it runs a program); ignored`,
        );
      }
    }
  }
  // Which roots may run their own code (23.x): a folder can't vouch for itself.
  if ("trust" in data) {
    delete data.trust;
    warnings.push(
      `config: ${file} sets [trust], which only your own config may set (a folder can't trust itself); ignored`,
    );
  }
  // Where roots are (21.1) is found before any folder's config is: only yours can say.
  const walk = data.walk;
  if (isPlainObject(walk) && "root_markers" in walk) {
    delete walk.root_markers;
    warnings.push(
      `config: ${file} sets walk.root_markers, which only your own config may set (it decides where vaults are); ignored`,
    );
  }
  for (const [key, why] of Object.entries(USER_ONLY)) {
    const [table, name] = key.split(".") as [string, string];
    const t = data[table];
    if (!isPlainObject(t) || !(name in t)) continue;
    delete (t as Record<string, unknown>)[name];
    warnings.push(`config: ${file} sets ${key}, which only your own config may set (${why}); ignored`);
  }
}

/** Merge `over` into `base`, typed by `base`'s shape. Unknown keys and wrong types are warnings. */
function merge<T>(base: T, over: Record<string, unknown>, file: string, prefix: string, warnings: string[]): T {
  const out = { ...(base as Record<string, unknown>) };
  for (const [key, supplied] of Object.entries(over)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value =
      path === "render.code" && typeof supplied === "string" && ["document", "source"].includes(supplied)
        ? supplied === "document"
        : path === "editor.edit_in" && supplied === "live"
          ? "lens"
          : supplied;
    // Colour overrides: kept as given (tables merge by key) and validated against the theme. A
    // role's fields merge, at the top and in a theme's own table ([colors.<theme>]) alike.
    if (prefix === "colors") {
      const prev = out[key];
      const fields = (p: unknown, v: unknown) => (isPlainObject(p) && isPlainObject(v) ? { ...p, ...v } : v);
      out[key] =
        isPlainObject(prev) && isPlainObject(value)
          ? { ...prev, ...Object.fromEntries(Object.entries(value).map(([r, v]) => [r, fields(prev[r], v)])) }
          : value;
      continue;
    }
    // Language servers (19.2): each by name, its settings merged (all the way down), the rest
    // replaced; languages by name. A field of the wrong type is dropped with a warning.
    if (!prefix && key === "language-server") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [language-server.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, ServerConfig>;
        const next: Record<string, ServerConfig> = { ...was };
        for (const [name, given] of Object.entries(value)) {
          const s = checkFields(
            given as Record<string, unknown>,
            SERVER_FIELDS,
            `language-server.${name}`,
            file,
            warnings,
          ) as ServerConfig;
          const before = (Object.hasOwn(next, name) ? next[name] : undefined) ?? {};
          next[name] = {
            ...before,
            ...s,
            ...(before.config && s.config ? { config: deepMerge(before.config, s.config) } : {}),
          };
        }
        out[key] = next;
      }
      continue;
    }
    // Linters (19.19): each by name, the keys given replacing its own.
    if (!prefix && key === "linter") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [linter.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, LinterConfig>;
        const checked = Object.entries(value).map(
          ([name, l]) =>
            [name, checkFields(l as Record<string, unknown>, LINTER_FIELDS, `linter.${name}`, file, warnings)] as const,
        );
        out[key] = {
          ...was,
          ...Object.fromEntries(
            checked.map(([name, l]) => [name, { ...(Object.hasOwn(was, name) ? was[name] : undefined), ...l }]),
          ),
        };
      }
      continue;
    }
    // Document types (22.2, 22.3): each by name, the fields given replacing its own — a folder's too: they only read.
    if (!prefix && key === "types") {
      if (!isPlainObject(value) || !Object.values(value).every(isPlainObject))
        warnings.push(`config: ${file}: [types.<name>] must be tables`);
      else {
        const was = out[key] as Record<string, TypeConfig>;
        const checked = Object.entries(value).map(
          ([name, t]) =>
            [name, checkFields(t as Record<string, unknown>, TYPE_FIELDS, `types.${name}`, file, warnings)] as const,
        );
        out[key] = {
          ...was,
          ...Object.fromEntries(
            checked.map(([name, t]) => [name, { ...(Object.hasOwn(was, name) ? was[name] : undefined), ...t }]),
          ),
        };
      }
      continue;
    }
    if (!prefix && key === "language") {
      if (!Array.isArray(value) || !value.every((l) => isPlainObject(l) && typeof l.name === "string"))
        warnings.push(`config: ${file}: [[language]] entries need a name`);
      else {
        const list = [...(out[key] as LanguageConfig[])];
        for (const given of value as Record<string, unknown>[]) {
          const l = checkFields(
            given,
            LANGUAGE_FIELDS,
            `language.${given.name}`,
            file,
            warnings,
          ) as unknown as LanguageConfig;
          const i = list.findIndex((x) => x.name === l.name);
          if (i >= 0) list[i] = { ...list[i]!, ...l };
          else list.push(l);
        }
        out[key] = list;
      }
      continue;
    }
    // String maps: key bindings (with context sub-tables), aliases, group names, dictionaries by language.
    if (
      prefix === "keys" ||
      prefix === "aliases" ||
      prefix === "groups" ||
      prefix === "spell.dictionaries" ||
      /^keys\.(visual|source|explorer|git|outline|footnotes|info|resize)$/.test(prefix)
    ) {
      const table =
        prefix === "keys" &&
        ["visual", "source", "explorer", "git", "outline", "footnotes", "info", "resize"].includes(key);
      if (table && !isPlainObject(value))
        warnings.push(`config: ${file}: ${path} must be a table of key = "command" (a mode's own keys)`);
      else if (typeof value === "string") out[key] = renewed(prefix, value);
      else if (table)
        out[key] = merge(
          (out[key] as Record<string, string> | undefined) ?? {},
          value as Record<string, unknown>,
          file,
          `keys.${key}`,
          warnings,
        );
      else warnings.push(`config: ${file}: ${path} must be a string`);
      continue;
    }
    if (RETIRED[path]) {
      warnings.push(`config: ${file}: "${path}" is retired — ${RETIRED[path]}`);
      continue;
    }
    if (!(key in out)) {
      warnings.push(`config: ${file}: unknown key "${path}"`);
      continue;
    }
    const current = out[key];
    if (isPlainObject(current)) {
      if (isPlainObject(value)) out[key] = merge(current, value, file, path, warnings);
      else warnings.push(`config: ${file}: "${path}" must be a table`);
    } else if (Array.isArray(current)) {
      // Strings only: an inline table in the list is a mistake to report, not to crash the file on.
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        if (path === "walk.extensions" && !value.length)
          warnings.push(
            `config: ${file}: "${path}" can't be empty (no note would be found); keeping ${JSON.stringify(current)}`,
          );
        else out[key] = value;
      } else if (Array.isArray(value)) warnings.push(`config: ${file}: "${path}" must be a list of strings`);
      else if (path === "editor.remote" && typeof value === "string")
        out[key] = value.trim() ? [value] : []; // one command
      else warnings.push(`config: ${file}: "${path}" must be an array`);
    } else if (typeof current === typeof value) {
      if (typeof value === "string" && renewed(path, value) !== value) {
        out[key] = renewed(path, value);
        continue;
      }
      const allowed = ENUMS[path];
      const range = RANGES[path];
      if (allowed && !allowed.includes(value as string)) {
        // The value as written in JSON: a control character in it shown as `\u001b`, never stripped to look allowed.
        warnings.push(`config: ${file}: "${path}" must be one of ${allowed.join(", ")} (got ${JSON.stringify(value)})`);
      } else if (
        range &&
        (!Number.isFinite(value as number) || (value as number) < range[0] || (value as number) > range[1])
      ) {
        warnings.push(`config: ${file}: "${path}" must be between ${range[0]} and ${range[1]} (got ${value})`);
      } else if (range && !FRACTIONAL.has(path) && !Number.isInteger(value)) {
        warnings.push(`config: ${file}: "${path}" must be a whole number (got ${value})`);
      } else out[key] = value;
    } else {
      warnings.push(`config: ${file}: "${path}" must be a ${typeof current}`);
    }
  }
  return out as T;
}

const isString = (v: unknown): boolean => typeof v === "string";
const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every(isString);
const isBoolean = (v: unknown): boolean => typeof v === "boolean";
/** A language's server: its name, or `{ name, only-features, except-features }` (Helix's). */
const isServerRef = (v: unknown): boolean =>
  isString(v) ||
  (isPlainObject(v) &&
    isString(v.name) &&
    (v["only-features"] === undefined || isStrings(v["only-features"])) &&
    (v["except-features"] === undefined || isStrings(v["except-features"])));

/**
 * A field's type check, and how a warning says what it must be. Fields not named here are kept as given,
 * silently, so a Helix `languages.toml` section (or efm's keys) pastes in; only a known field spelled with
 * underscores (`lint_command`, `file_types`) is warned of, a slip in these tables of hyphens.
 */
type FieldCheck = [check: (v: unknown) => boolean, must: string];
const STRINGS: FieldCheck = [isStrings, "a list of strings"];
const SERVER_FIELDS: Record<string, FieldCheck> = {
  command: [isString, "a string"],
  args: STRINGS,
  config: [isPlainObject, "a table"],
  environment: [(v) => isPlainObject(v) && Object.values(v).every(isString), "a table of strings"],
  "required-root-patterns": STRINGS,
};
const LANGUAGE_FIELDS: Record<string, FieldCheck> = {
  "language-servers": [
    (v) => Array.isArray(v) && v.every(isServerRef),
    "a list of server names, or of { name, only-features, except-features }",
  ],
  roots: STRINGS,
  "file-types": STRINGS,
  "language-id": [isString, "a string"],
  linters: STRINGS,
};
const LINTER_FIELDS: Record<string, FieldCheck> = {
  "lint-command": [isString, "a string"],
  "lint-stdin": [isBoolean, "true or false"],
  "lint-formats": STRINGS,
  "lint-source": [isString, "a string"],
  "lint-severity": [(v) => v === 1 || v === 2 || v === 3 || v === 4, "1, 2, 3 or 4"],
  "lint-ignore-exit-code": [isBoolean, "true or false"],
  "root-markers": STRINGS,
  "require-marker": [isBoolean, "true or false"],
};

const TYPE_FIELDS: Record<string, FieldCheck> = {
  paths: STRINGS,
  required: STRINGS,
  keys: [
    (v) => isPlainObject(v) && Object.values(v).every((k) => (KEY_KINDS as readonly unknown[]).includes(k)),
    `a table of key = kind (${KEY_KINDS.join(", ")})`,
  ],
  values: [(v) => isPlainObject(v) && Object.values(v).every(Array.isArray), "a table of key = [allowed values]"],
  number: [
    (v) => typeof v === "string" && validRegex(v),
    "a pattern (a regular expression) whose first group is the number",
  ],
  status: [isString, "a frontmatter key"],
};

function validRegex(s: string): boolean {
  try {
    new RegExp(s);
    return true;
  } catch {
    return false;
  }
}

/** A copy of `table` without the fields of the wrong type, or a known one spelled with underscores, each warned of; the rest kept. */
function checkFields(
  table: Record<string, unknown>,
  fields: Record<string, FieldCheck>,
  where: string,
  file: string,
  warnings: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(table)) {
    const field = Object.hasOwn(fields, k) ? fields[k] : undefined;
    const hyphened = k.replace(/_/g, "-");
    if (!field && hyphened !== k && Object.hasOwn(fields, hyphened))
      warnings.push(`config: ${file}: ${where}.${k} is spelled ${hyphened}; ignored`);
    else if (field && !field[0](v)) warnings.push(`config: ${file}: ${where}.${k} must be ${field[1]}; ignored`);
    else out[k] = v;
  }
  return out;
}

/** Ranged settings that may be fractional; every other ranged number must be whole. */
const FRACTIONAL = new Set(["ui.split_ratio", "editor.lens_max"]);

/** A relative path that stays inside its base: not empty, not absolute, no `..` segment. */
export function isSafeRelative(p: string): boolean {
  if (!p.trim() || p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  // No "..", and no hidden segment: .git/, .slipbox/ and dot-files are never a scratch.
  return !p.split(/[\\/]/).some((seg) => seg === ".." || seg.startsWith("."));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

export const VAULT_CONFIG_TEMPLATE = `# slipbox: this folder's settings. They override ~/.config/slipbox/config.toml.
# Every key: docs/manual/configuration.md in slipbox's documentation.

# theme = "tokyo-night"

[walk]
# Extra gitignore-syntax patterns to leave out of this vault, on top of .gitignore.
# exclude = ["archive/"]
`;
