// Config loader (plan 0.9): TOML, defaults ← user ← vault marker, vault wins.
// Must run correctly with no config at all, and never crash on a bad one — problems become
// warnings in the message sink.

import { existsSync, readFileSync } from "node:fs";
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
  };
  input: {
    /** The leader key; `leader` in `[keys]` means this. */
    leader: string;
    /** Show the which-key popup for pending key sequences. */
    which_key: boolean;
    /** Delay before the popup appears for prefixes other than the leader. */
    which_key_delay_ms: number;
  };
  capture: {
    location: "state" | "vault";
    /** Scratch file name; relative to the vault root when location = "vault". */
    file: string;
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
  },
  input: { leader: "space", which_key: true, which_key_delay_ms: 500 },
  capture: { location: "state", file: "scratch.md" },
  editor: { command: "", remote: ["nvim"], autosave_ms: 30000 },
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
  "ui.lines": ["light", "heavy"],
};

/** Numeric keys and their allowed range. */
const RANGES: Record<string, [number, number]> = {
  "editor.autosave_ms": [0, 3_600_000],
  "render.inset": [0, 40],
  "render.max_width": [0, 1000],
  "walk.max_file_size": [1, 1 << 30],
  "ui.sidebar_width": [8, 200],
  "ui.outline_width": [8, 200],
  "ui.split_ratio": [0.2, 0.8],
  "ui.readable_max": [20, 1000],
  "ui.scrolloff": [0, 50],
  "input.which_key_delay_ms": [0, 10_000],
  "ui.narrow_width": [0, 1000],
  "watch.debounce_ms": [0, 10_000],
  "watch.poll_ms": [50, 600_000],
};

export interface LoadedConfig {
  config: Config;
  sources: string[];
  warnings: string[];
}

export interface LoadConfigOptions {
  vaultRoot?: string | null;
  /** `--config` flag; overrides `SLIPBOX_CONFIG` and the XDG location. */
  configFile?: string;
}

export function loadConfig(opts: LoadConfigOptions = {}): LoadedConfig {
  const warnings: string[] = [];
  const sources: string[] = [];
  let config = structuredClone(DEFAULT_CONFIG);

  const userFile = opts.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile();
  const files = [userFile];
  if (opts.vaultRoot) files.push(join(opts.vaultRoot, ".slipbox", "config.toml"));

  for (const file of files) {
    if (!existsSync(file)) {
      if (file === opts.configFile) warnings.push(`config: ${file} does not exist`);
      continue;
    }
    try {
      const data = parseToml(readFileSync(file, "utf8")) as Record<string, unknown>;
      config = merge(config, data, file, "", warnings);
      sources.push(file);
    } catch (err) {
      warnings.push(`config: ${file}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  // The scratch's file name: a plain relative path inside the project, never empty, absolute or
  // climbing out (a cloned vault's config must not aim `slipbox capture` at any file).
  if (!isSafeRelative(config.capture.file) || !/\.(md|markdown)$/i.test(config.capture.file)) {
    warnings.push(`config: capture.file must be a relative .md path inside the project, not hidden (got ${JSON.stringify(config.capture.file)}); using "${DEFAULT_CONFIG.capture.file}"`);
    config.capture.file = DEFAULT_CONFIG.capture.file;
  }
  return { config, sources, warnings };
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
    if (prefix === "keys" || prefix === "aliases" || prefix === "groups" || /^keys\.(visual|source|explorer|outline|resize)$/.test(prefix)) {
      if (typeof value === "string") out[key] = value;
      else if (prefix === "keys" && ["visual", "source", "explorer", "outline", "resize"].includes(key) && isPlainObject(value)) {
        out[key] = merge((out[key] as Record<string, string> | undefined) ?? {}, value, file, `keys.${key}`, warnings);
      } else warnings.push(`config: ${file}: ${path} must be a string`);
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
      if (Array.isArray(value)) out[key] = value.map(String);
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
const FRACTIONAL = new Set(["ui.split_ratio"]);

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
