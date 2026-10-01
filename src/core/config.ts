// Config loader (plan 0.9): TOML, defaults ← user ← vault marker, vault wins.
// Must run correctly with no config at all, and never crash on a bad one — problems become
// warnings in the message sink.

import { existsSync } from "node:fs";
import { readRegular, SMALL_FILE } from "./fsutil.ts";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { userConfigFile } from "./paths.ts";

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
  };
  walk: {
    extensions: string[];
    exclude: string[];
    max_file_size: number;
  };
  /** Files beyond notes (16.x): which the explorer, the switcher and find show. */
  files: {
    /** "notes": notes only; "renderable": notes and data files (JSON, YAML, TOML, INI, CSV);
     *  "all": every text file the walk sees. The explorer's key toggles to "all" and back. */
    show: "notes" | "renderable" | "all";
    /** gitignore-syntax patterns shown whatever `show` says (`*.ts`, `scripts/`). */
    include: string[];
    /** gitignore-syntax patterns never shown (the walk's own excludes apply too). */
    exclude: string[];
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
    /** Wrap long lines to the pane; off, notes keep their natural width and scroll sideways. */
    wrap: boolean;
    /** Cap the text column at `readable_max` columns, centred. */
    readable_width: boolean;
    readable_max: number;
    /** Hide the top bar, frame, explorer, outline, tab strip, breadcrumbs and status line; readable width on. */
    zen: boolean;
    /** The top bar: the explorer button, the app chip, vault state. */
    top_bar: boolean;
    /** The outline breadcrumb at the top of each window. */
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
  /** Renames (17.15). */
  rename: {
    /** A renamed note keeps its old name in its frontmatter's `previous_names`, so links this
     *  machine can't reach still find it. */
    previous_names: boolean;
  };
  /**
   * The lint surface (3.21): your markdownlint-cli2's findings in notes — slipbox ships no linter.
   * `enabled`: "auto" when a markdownlint config is there (~/.markdownlint-cli2.jsonc, or the
   * vault's own), "on", "off". `command`: the linter, the files appended; empty: markdownlint-cli2
   * through npx, with ~/.markdownlint-cli2.jsonc unless the vault has a config of its own. Your
   * own config only (it names a program).
   */
  lint: {
    enabled: "auto" | "on" | "off";
    command: string[];
  };
  capture: {
    location: "state" | "vault";
    /** Scratch file name; relative to the vault root when location = "vault". */
    file: string;
  };
  /** Search (6.x): `auto`, the index when it's built, else a scan of the files; `index`, the index
   *  (built first when there's none); `scan`, the files every time (no index kept). */
  search: {
    engine: "auto" | "index" | "scan";
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
     * find the running nvims, pick one (remembered per vault), then those two commands. The watcher
     * picks up its saves. Empty: off.
     */
    remote: string[];
    /**
     * Save a changed note after this long without a key (ms); 0: never. Not mid-insert, not over a
     * file changed on disk, not after (K)eep yours until a confirmed save, not during a git commit.
     */
    autosave_ms: number;
    /** What the editing keys (i, a, o…) switch a rendered window to: "source" or "live" preview. */
    edit_in: "source" | "live";
    /** The lens (live preview): at least this many rows of markdown, its neighbours pulled in. */
    lens_min_rows: number;
    /** …and it stops taking in neighbours at this share of the window (a bigger block shows whole). */
    lens_max: number;
  };
  watch: {
    enabled: boolean;
    debounce_ms: number;
    /** Interval for directories that cannot be watched, and for everything when watching degrades. */
    poll_ms: number;
  };
  /**
   * key sequence → command spec, e.g. `"leader l n" = "link.next"`; `""` unbinds a default.
   * Sub-tables `visual`, `explorer`, `outline` and `resize` hold the keymaps of those contexts.
   */
  keys: Record<string, string> & {
    visual?: Record<string, string>;
    /** Source mode's own keys, before the reading ones (`x` deletes a character there). */
    source?: Record<string, string>;
    explorer?: Record<string, string>;
    outline?: Record<string, string>;
    /** The footnotes view's own keys (3.18): the outline's, and a / e / d / r. */
    footnotes?: Record<string, string>;
    /** The Info view's own keys (3.19): the outline's, and y. */
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
  render: { inset: 4, max_width: 0, glyphs: "auto", show_urls: "auto" },
  walk: { extensions: ["md", "markdown"], exclude: [], max_file_size: 4 * 1024 * 1024 },
  files: { show: "renderable", include: [], exclude: [] },
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
    line_numbers: false,
    wrap: true,
    readable_width: false,
    readable_max: 100,
    zen: false,
    top_bar: true,
    breadcrumb: true,
    lines: "light",
    left_rail: true,
    right_rail: true,
    scrolloff: 3,
    history_limit: 100,
  },
  input: { leader: "space", which_key: true, which_key_delay_ms: 500 },
  rename: { previous_names: true },
  lint: { enabled: "auto", command: [] },
  capture: { location: "state", file: "scratch.md" },
  search: { engine: "auto" },
  context: { depth: 1, backlinks: true, limit: 25 },
  editor: { command: "", remote: ["nvim"], autosave_ms: 30000, edit_in: "source", lens_min_rows: 6, lens_max: 0.5 },
  watch: { enabled: true, debounce_ms: 120, poll_ms: 2000 },
  keys: {},
  aliases: {},
  colors: {},
  groups: {},
};

/** Keys whose values come from a fixed set. Anything else is a warning and the default stays. */
const ENUMS: Record<string, readonly string[]> = {
  "render.glyphs": ["auto", "nerd", "unicode", "ascii"],
  "render.show_urls": ["auto", "always", "never"],
  "capture.location": ["state", "vault"],
  "lint.enabled": ["auto", "on", "off"],
  "search.engine": ["auto", "index", "scan"],
  "ui.lines": ["light", "heavy"],
  "files.show": ["notes", "renderable", "all"],
  "editor.edit_in": ["source", "live"],
};

/** Numeric keys and their allowed range. */
const RANGES: Record<string, [number, number]> = {
  "editor.lens_min_rows": [1, 200],
  "editor.lens_max": [0.1, 1],
  "editor.autosave_ms": [0, 3_600_000],
  "render.inset": [0, 40],
  "render.max_width": [0, 1000],
  "walk.max_file_size": [1, 1 << 30],
  "ui.sidebar_width": [8, 200],
  "ui.outline_width": [8, 200],
  "ui.split_ratio": [0.2, 0.8],
  "ui.readable_max": [20, 1000],
  "ui.scrolloff": [0, 50],
  // Up to every reading position kept (positions.json holds the newest 2,000).
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
}

export interface LoadConfigOptions {
  vaultRoot?: string | null;
  /** The vault's config file, in place of `vaultRoot` (the home vault's is elsewhere: 17.2). */
  vaultFile?: string | null;
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
  let config = structuredClone(DEFAULT_CONFIG);

  const userFile = opts.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile();
  const files = [userFile];
  if (opts.vaultFile) files.push(opts.vaultFile);
  else if (opts.vaultRoot) files.push(join(opts.vaultRoot, ".slipbox", "config.toml"));

  for (const file of files) {
    if (!existsSync(file)) {
      if (file === opts.configFile) warnings.push(`config: ${file} does not exist`);
      continue;
    }
    let data: Record<string, unknown>;
    try {
      data = parseToml(readRegular(file, SMALL_FILE).toString("utf8")) as Record<string, unknown>;
      opts.lastGood?.set(file, structuredClone(data));
    } catch (err) {
      const kept = opts.lastGood?.get(file);
      warnings.push(`config: ${file}: ${(err as Error).message.split("\n")[0]}${kept ? " — keeping what it said before" : ""}`);
      if (!kept) continue;
      data = structuredClone(kept);
    }
    // The vault's identity (17.4) isn't a setting: read by core/registry.ts, never merged.
    if ("vault" in data) {
      if (file === userFile) warnings.push(`config: ${file}: [vault] belongs in a vault's .slipbox/config.toml; ignored`);
      delete data.vault;
    }
    if (file !== userFile) dropUserOnly(data, file, warnings);
    config = merge(config, data, file, "", warnings);
    sources.push(file);
  }
  // The scratch's file name: a plain relative path inside the project, never empty, absolute or
  // climbing out (a cloned vault's config must not aim `slipbox capture` at any file; symlinks on
  // the way are refused where the path is used, in core/capture.ts).
  if (!isSafeRelative(config.capture.file) || !/\.(md|markdown)$/i.test(config.capture.file)) {
    warnings.push(`config: capture.file must be a relative .md path inside the project, not hidden (got ${JSON.stringify(config.capture.file)}); using "${DEFAULT_CONFIG.capture.file}"`);
    config.capture.file = DEFAULT_CONFIG.capture.file;
  }
  return { config, sources, warnings };
}

/**
 * Settings only your own config may set: each names a program slipbox runs. A vault's committed
 * config comes with whatever you clone, so it never chooses what runs on your machine.
 */
export const USER_ONLY = ["editor.command", "editor.remote", "lint.command"];

/**
 * Commands a vault's keys and aliases may not name: each throws work away (quit without saving,
 * revert, overwrite, clear), and a cloned vault could otherwise put one on ctrl+s or :wq.
 */
export const VAULT_FORBIDDEN_COMMANDS = ["app.quit_force", "note.revert", "note.save_force", "scratch.clear"];

function dropUserOnly(data: Record<string, unknown>, file: string, warnings: string[]): void {
  // Keys and aliases (every mode's table) that name a command throwing work away.
  const strip = (table: unknown, where: string) => {
    if (!isPlainObject(table)) return;
    for (const [k, v] of Object.entries(table)) {
      if (isPlainObject(v)) strip(v, `${where}.${k}`);
      else if (typeof v === "string" && VAULT_FORBIDDEN_COMMANDS.includes(v.split(" ")[0]!)) {
        delete table[k];
        warnings.push(`config: ${file} binds ${where}.${k} to ${v}, which only your own config may (it throws work away); ignored`);
      }
    }
  };
  strip(data.keys, "keys");
  strip(data.aliases, "aliases");
  for (const key of USER_ONLY) {
    const [table, name] = key.split(".") as [string, string];
    const t = data[table];
    if (!isPlainObject(t) || !(name in t)) continue;
    delete (t as Record<string, unknown>)[name];
    warnings.push(`config: ${file} sets ${key}, which only your own config may set (it runs a program); ignored`);
  }
}

/** Merge `over` into `base`, typed by `base`'s shape. Unknown keys and wrong types are warnings. */
function merge<T>(base: T, over: Record<string, unknown>, file: string, prefix: string, warnings: string[]): T {
  const out = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(over)) {
    const path = prefix ? `${prefix}.${key}` : key;
    // Colour overrides: kept as given (tables merge by key) and validated against the theme.
    if (prefix === "colors") {
      const prev = out[key];
      out[key] = isPlainObject(prev) && isPlainObject(value) ? { ...prev, ...value } : value;
      continue;
    }
    // String maps: key bindings (with context sub-tables), aliases, group names.
    if (prefix === "keys" || prefix === "aliases" || prefix === "groups" || /^keys\.(visual|source|explorer|outline|footnotes|info|resize)$/.test(prefix)) {
      const table = prefix === "keys" && ["visual", "source", "explorer", "outline", "footnotes", "info", "resize"].includes(key);
      if (table && !isPlainObject(value)) warnings.push(`config: ${file}: ${path} must be a table of key = "command" (a mode's own keys)`);
      else if (typeof value === "string") out[key] = value;
      else if (table) out[key] = merge((out[key] as Record<string, string> | undefined) ?? {}, value as Record<string, unknown>, file, `keys.${key}`, warnings);
      else warnings.push(`config: ${file}: ${path} must be a string`);
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
        if (path === "walk.extensions" && !value.length) warnings.push(`config: ${file}: "${path}" can't be empty (no note would be found); keeping ${JSON.stringify(current)}`);
        else out[key] = value;
      } else if (Array.isArray(value)) warnings.push(`config: ${file}: "${path}" must be a list of strings`);
      else if (path === "editor.remote" && typeof value === "string") out[key] = value.trim() ? [value] : []; // one command
      else warnings.push(`config: ${file}: "${path}" must be an array`);
    } else if (typeof current === typeof value) {
      const allowed = ENUMS[path];
      const range = RANGES[path];
      if (allowed && !allowed.includes(value as string)) {
        warnings.push(`config: ${file}: "${path}" must be one of ${allowed.join(", ")} (got "${value}")`);
      } else if (range && (!Number.isFinite(value as number) || (value as number) < range[0] || (value as number) > range[1])) {
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

export const VAULT_CONFIG_TEMPLATE = `# slipbox vault config. Settings here override ~/.config/slipbox/config.toml.
# See docs/design/configuration.md for every key.

# theme = "tokyo-night"

[walk]
# Extra gitignore-syntax patterns to leave out of the vault, on top of .gitignore.
# exclude = ["archive/"]
`;
