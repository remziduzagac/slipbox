// The TUI app model (plan 3.x; keymap in docs/design/keymap.md): tabs of one or two windows over
// shared buffers, a reading cursor with selection, the explorer and outline panes, overlays,
// history, link-following, find, the which-key popup, UI settings, live reload from the watcher
// (5.1–5.4), and live reload of the configuration itself.
//
// Phase 2 is read-only: nothing here writes a note. It writes only its own state (reading
// positions, session) and the scratch, through core.
//
// This module does not import OpenTUI. It draws through `Canvas` and talks to the terminal
// through `Host`; tui/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readText, WriteRefused, writeNote } from "../core/fsutil.ts";
import { toggleTask } from "../core/tasks.ts";
import { merge3, unifiedDiff } from "../core/merge.ts";
import { editorArgv } from "../core/editor.ts";
import { insertKey, insertText, stopInsert } from "./editing.ts";
import { newVimState, vimKey } from "./vim.ts";
import { discoverNvims, NVIM_REMOTE, type NvimServer, probeNvim } from "../core/nvim.ts";
import { homedir } from "node:os";
import { appendScratch, scratchLocation } from "../core/capture.ts";
import { copyText } from "../core/clipboard.ts";
import { canonKey, canonSeq, CommandRegistry, Keymap, unknownModifiers } from "../core/commands.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { glyphsFor, type Glyphs } from "../core/glyphs.ts";
import { Graph } from "../core/graph.ts";
import type { Layout } from "../core/layout/ir.ts";
import { layoutWidth } from "../core/note.ts";
import { stateDir, userConfigFile } from "../core/paths.ts";
import {
  type Anchor,
  anchorAt,
  type CursorAnchor,
  loadSession,
  PositionStore,
  rowFor,
  saveSession,
  type SessionState,
  TOP,
  type UiOverride,
} from "../core/position.ts";
import { applyColorOverrides, loadTheme, type Theme } from "../core/theme/index.ts";
import type { VaultLocation } from "../core/vault.ts";
import { VaultWatcher, type WatchBatch } from "../core/watch.ts";
import { sanitize } from "../core/sanitize.ts";
import { graphemes, graphemeWidth, stringWidth, truncate } from "../core/width.ts";
import { registerActions } from "./actions.ts";
import { NoteBuffer } from "./buffer.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { cells, clampPos, ordered, type Pos, snap, wordAt } from "./cursor.ts";
import { drawApp, type Geometry } from "./draw.ts";
import { fuzzy, rank } from "./fuzzy.ts";
import {
  DEFAULT_ALIASES,
  DEFAULT_EXPLORER_KEYS,
  DEFAULT_GROUPS,
  DEFAULT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_VISUAL_KEYS,
  DEFAULT_SOURCE_KEYS,
  EXPLORER_ACTIONS,
  OUTLINE_ACTIONS,
  RESIZE_ACTIONS,
  parseGroup,
  prettyKey,
} from "./keys.ts";

export interface Host {
  requestRender(): void;
  /** OSC 52 through the renderer, which owns the terminal. */
  osc52(text: string): boolean;
  quit(): void;
  setTitle?(title: string): void;
  /** Turn mouse capture on or off (off hands the mouse to the terminal). */
  setMouse?(on: boolean): void;
  /** Step aside for `argv` in this terminal and wait for it (the renderer suspended): its exit
   *  code, or an error message when it couldn't start. */
  runForeground?(argv: string[]): number | string;
  /** Start `argv` detached and don't wait; the promise settles with its exit code or an error. */
  runDetached?(argv: string[]): Promise<number | string>;
}

export type Level = "info" | "warn" | "error";

export interface Message {
  level: Level;
  text: string;
  at: number;
}

export interface Loc {
  key: string;
  anchor: Anchor;
  cursor?: CursorAnchor;
}

export interface Selection {
  /** The end that stays put; the cursor is the other end. */
  anchor: Pos;
  /** Whole rows (V) rather than characters. */
  line: boolean;
  /** The anchor in source terms, so a re-layout (resize, a pane toggled) keeps the same text. */
  src?: CursorAnchor;
}

export interface FindState {
  query: string;
  matches: { row: number; col: number; len: number }[];
  current: number;
  /** Whole words only (`*` / `#`): not inside a longer word. */
  whole?: boolean;
}

export interface View {
  buf: NoteBuffer;
  /** First row on screen. */
  top: number;
  cur: Pos;
  /** Column to return to when moving through shorter rows. */
  goal: number;
  sel: Selection | null;
  visual: "char" | "line" | null;
  /** Source-based positions, which survive re-layout (decision 3.5). */
  topAnchor: Anchor;
  curAnchor: CursorAnchor;
  back: Loc[];
  fwd: Loc[];
  find: FindState | null;
  layoutKey: string;
  height: number;
  width: number;
  /** First column on screen when wrapping is off (horizontal scroll). */
  left: number;
  /** Showing the note's raw markdown (source mode, 4.13) instead of its render. */
  source?: boolean;
  /** Typing into the text (insert mode); only in source mode. */
  insert?: boolean;
}

export interface Tab {
  views: View[];
  active: number;
  orientation: "side" | "stacked";
  /** Share of the width (side by side) or height (stacked) given to the first window. */
  ratio: number;
}

export interface ListItem {
  label: string;
  detail?: string;
  hint?: string;
  /** Key bindings, drawn as separate keycaps at the right (instead of `hint`). */
  keys?: string[];
  /** Further bindings, shown in the footer ("also"). */
  more?: string[];
  indent?: number;
  /** A group heading: drawn dim and bold, never selected. With `rule`, the line under a heading;
   * with an empty label, the blank row before one. */
  header?: boolean;
  rule?: boolean;
  /** A key that picks this item at once (a list that isn't filtered by typing): `l`, `k`… */
  hotkey?: string;
  data: unknown;
}

export interface ListOverlay {
  kind: "list";
  title: string;
  input: string;
  filterable: boolean;
  items: ListItem[];
  /** Items computed from the input instead of fuzzy-filtering `items` (the `:` prompt). */
  source?: (input: string) => ListItem[];
  filtered: { item: ListItem; positions: number[] }[];
  selected: number;
  scroll: number;
  accept: (item: ListItem) => void;
  /** Enter with the raw input, before `accept`; return true when handled (exact `:` aliases). */
  submit?: (input: string) => boolean;
  move?: (item: ListItem) => void;
  cancel?: () => void;
  /** Show the selected item's `detail` in a footer line instead of beside its label. */
  footer?: boolean;
  /** While filtering, keep the group headings of the items that match (help). */
  keepGroups?: boolean;
  /** The wheel scrolled the view last: the selection follows the view, not the other way. */
  wheeled?: boolean;
  /** Key columns sized over the whole list (fixed-meaning columns), not per section. */
  alignKeysAcrossList?: boolean;
  /** A dropdown hanging under this cell (the breadcrumb's `…`) instead of a centred list. */
  anchor?: { x: number; y: number };
}

export interface PromptOverlay {
  kind: "prompt";
  label: string;
  text: string;
  change?: (text: string) => void;
  accept: (text: string) => void;
  cancel?: () => void;
}

export type Overlay = ListOverlay | PromptOverlay;

export interface SidePaneState {
  /** Preference on wide terminals: shown beside the content. */
  visible: boolean;
  /** Narrow terminals (3.14): shown over the content, on demand. */
  overlay: boolean;
  selected: number;
  scroll: number;
  /** The wheel scrolled it: the view stays put, not pulled back to the selection. */
  pinned?: boolean;
  /** Scrolled sideways (rows wider than the pane): the first column shown. */
  left?: number;
  /** The left panel's filter (`/`): its text, and whether keys go to it. */
  filter?: string;
  filtering?: boolean;
}

/** What the left panel shows: the file tree or the window's history (more views to come). */
export type LeftView = "explorer" | "history";
/** What the right panel shows: the outline (more views to come: footnotes, comments). */
export type RightView = "outline";

/**
 * The panels' views, in rail order. Each side's panel shows one view at a time; its rail has a
 * button per view (bright while that view shows), and the view's own drawing and keys decide what
 * it does. A new view is an entry here, then its rows, drawing and keys.
 */
export interface PanelView<Id extends string> {
  id: Id;
  title: string;
  /** The rail button's glyph. */
  glyph: (g: Glyphs) => string;
}

export const LEFT_VIEWS: PanelView<LeftView>[] = [
  { id: "explorer", title: "Explorer", glyph: (g) => g.explorerButton },
  { id: "history", title: "History", glyph: (g) => g.historyButton },
];

export const RIGHT_VIEWS: PanelView<RightView>[] = [{ id: "outline", title: "Outline", glyph: (g) => g.outlineButton }];

/** One row of the history view: a place in the window's timeline, newest first. */
export interface HistoryRow {
  /** The note's name (the pane is narrow); `path` is what the filter matches. */
  label: string;
  path: string;
  hint: string;
  /** Its index in the timeline (oldest first). */
  index: number;
  here: boolean;
}

export interface TreeRow {
  kind: "dir" | "note";
  path: string;
  name: string;
  depth: number;
}

export type Region = "content" | "sidebar" | "outline";

/** Live UI settings (docs/design/keymap.md, `space u`). */
export interface UiState {
  cursorline: boolean;
  line_numbers: boolean;
  wrap: boolean;
  readable_width: boolean;
  zen: boolean;
  mouse: boolean;
  urls: boolean;
  theme: string;
  glyphs: string;
}

/** Each UI setting's config default, so a session override is kept only while that is unchanged. */
export function uiDefaults(c: Config): UiState {
  return {
    cursorline: c.ui.cursorline,
    line_numbers: c.ui.line_numbers,
    wrap: c.ui.wrap,
    readable_width: c.ui.readable_width,
    zen: c.ui.zen,
    mouse: c.ui.mouse,
    // "auto": URLs where colour can't mark links (NO_COLOR), as in `slipbox render`.
    urls: c.render.show_urls === "always" || (c.render.show_urls === "auto" && !!process.env.NO_COLOR),
    theme: c.theme,
    glyphs: c.render.glyphs,
  };
}

const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 500;

export interface AppOptions {
  loc: VaultLocation;
  config: Config;
  graph: Graph;
  host: Host;
  warnings?: string[];
  open?: string | null;
  themeName?: string;
  /** `--config`, remembered for reloads. */
  configFile?: string;
  watch?: boolean;
  now?: () => number;
}

export class App {
  readonly loc: VaultLocation;
  config: Config;
  graph: Graph;
  theme!: Theme;
  glyphs!: Glyphs;
  readonly host: Host;
  readonly registry = new CommandRegistry<App>();
  keymap!: Keymap;
  visualKeys!: Keymap;
  sourceKeys!: Keymap;
  explorerKeys!: Keymap;
  outlineKeys!: Keymap;
  resizeKeys!: Keymap;
  /** Resize mode: h j k l / arrows resize until esc (ctrl+alt+w, space w r). */
  resizeMode = false;
  /** Live side pane widths; start from config, changed in resize mode, kept in the session. */
  sideW: number;
  outW: number;
  aliases: Record<string, string> = {};
  groups = new Map<string, { name: string; desc: string }>();
  leader = "space";
  readonly buffers = new Map<string, NoteBuffer>();
  tabs: Tab[] = [];
  activeTab = 0;
  region: Region = "content";
  sidebar: SidePaneState;
  /** Source mode's vim state: counts, a pending operator, the register, the last change. */
  vim = newVimState();
  /** The left panel's view; the rail's buttons pick it. */
  leftView: LeftView = "explorer";
  /** Where each left view was when another took the panel: restored when it comes back. */
  private leftPositions = new Map<LeftView, Pick<SidePaneState, "selected" | "scroll" | "left" | "pinned" | "filter">>();
  outline: SidePaneState & { folded: Set<number>; forKey: string };
  expanded = new Set<string>();
  overlay: Overlay | null = null;
  pending: string[] = [];
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** The which-key popup is showing for `pending`. */
  whichKey = false;
  private whichKeyTimer: ReturnType<typeof setTimeout> | null = null;
  messages: Message[] = [];
  transient: Message | null = null;
  private transientTimer: ReturnType<typeof setTimeout> | null = null;
  width = 80;
  height = 24;
  geometry: Geometry | null = null;
  /** Id of the clickable region under the mouse, for hover highlighting. */
  hover: string | null = null;
  positions: PositionStore;
  watcher: VaultWatcher | null = null;
  ui: UiState;
  private drawFailed = false;

  /** Commands run from the palette or help, most recent first (kept in the session). */
  recentCommands: string[] = [];

  /** UI settings changed in this session, with the config value each overrode. */
  uiOverrides: Record<string, UiOverride> = {};
  private tree: TreeRow[] | null = null;
  private readonly configFile: string | undefined;
  private configStamps = new Map<string, number>();
  readonly now: () => number;
  quitting = false;
  indexing = 0;

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.config = opts.config;
    this.graph = opts.graph;
    this.host = opts.host;
    this.configFile = opts.configFile;
    this.now = opts.now ?? Date.now;
    this.ui = uiDefaults(opts.config);
    if (opts.themeName) this.ui.theme = opts.themeName;
    if (process.env.NO_COLOR) this.ui.theme = "mono";
    this.sidebar = { visible: opts.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.sideW = opts.config.ui.sidebar_width;
    this.outW = opts.config.ui.outline_width;
    this.outline = { visible: opts.config.ui.outline, overlay: false, selected: 0, scroll: 0, folded: new Set(), forKey: "" };
    this.positions = new PositionStore(this.loc.root);
    registerActions(this);
    this.applyKeys();
    for (const w of opts.warnings ?? []) this.message("warn", w);
    for (const e of this.graph.errors) this.message("warn", e);

    this.recentCommands = (loadSession(this.loc.root)?.recent_commands ?? []).filter((id) => typeof id === "string").slice(0, RECENT_MAX);
    this.remoteServer = loadSession(this.loc.root)?.remote_server;
    this.restoreUiOverrides();
    if (opts.themeName) this.ui.theme = opts.themeName; // an explicit theme beats a remembered one
    const restored = !opts.open && this.config.ui.restore_session && this.restoreSession();
    this.applyTheme();
    this.glyphs = this.glyphSet(this.ui.glyphs);
    if (!restored) {
      const first = opts.open ?? this.defaultNote();
      if (first) this.openInNewTab(first);
    }
    if (!this.tabs.length) this.message("info", `no notes in ${this.loc.root}`);
    this.recordConfigStamps();
    if (opts.watch !== false) {
      if (this.config.watch.enabled) this.startWatcher();
      this.startPolling();
      this.indexInBackground();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Configuration: keys, theme, glyphs, and live reload.

  /** (Re)build every keymap, the groups and the aliases from defaults plus config. */
  applyKeys(): void {
    const c = this.config;
    this.leader = canonKey(c.input.leader || "space");
    const { visual, explorer, outline, resize, source, ...normal } = c.keys;
    this.keymap = new Keymap(DEFAULT_KEYS, normal as Record<string, string>, this.leader);
    this.visualKeys = new Keymap(DEFAULT_VISUAL_KEYS, visual ?? {}, this.leader);
    this.sourceKeys = new Keymap(DEFAULT_SOURCE_KEYS, source ?? {}, this.leader);
    this.explorerKeys = new Keymap(DEFAULT_EXPLORER_KEYS, explorer ?? {}, this.leader);
    this.outlineKeys = new Keymap(DEFAULT_OUTLINE_KEYS, outline ?? {}, this.leader);
    this.resizeKeys = new Keymap(DEFAULT_RESIZE_KEYS, resize ?? {}, this.leader);
    this.aliases = { ...DEFAULT_ALIASES };
    for (const [k, v] of Object.entries(c.aliases)) {
      if (v === "") delete this.aliases[k];
      else this.aliases[k] = v;
    }
    this.groups = new Map();
    for (const [k, v] of Object.entries({ ...DEFAULT_GROUPS, ...c.groups })) this.groups.set(canonSeq(k, this.leader), parseGroup(v));
    const ids = new Set(this.registry.list().map((x) => x.id));
    const bad = [...this.keymap.entries(), ...this.visualKeys.entries(), ...this.sourceKeys.entries()].map(([, v]) => v.split(" ")[0]!).filter((id) => !ids.has(id));
    for (const id of new Set(bad)) this.message("warn", `config: [keys] binds unknown command "${id}"`);
    for (const [a, v] of Object.entries(this.aliases)) if (!ids.has(v.split(" ")[0]!)) this.message("warn", `config: [aliases] ${a} = unknown command "${v}"`);
    // Keys with a modifier slipbox doesn't know can never be pressed: say so.
    const tables: [string, Record<string, unknown>][] = [["keys", c.keys as Record<string, unknown>]];
    for (const sub of ["visual", "source", "explorer", "outline", "resize"]) {
      const t = (c.keys as Record<string, unknown>)[sub];
      if (t && typeof t === "object") tables.push([`keys.${sub}`, t as Record<string, unknown>]);
    }
    for (const [table, map] of tables) {
      for (const k of Object.keys(map)) {
        const bad = unknownModifiers(k);
        if (bad.length) this.message("warn", `config: [${table}] "${k}": unknown modifier ${bad.map((b) => `"${b}"`).join(", ")} (ctrl, alt, shift, cmd)`);
      }
    }
    // The in-pane keymaps name actions, not commands: check them against their own lists.
    const panes: [string, Keymap, readonly string[]][] = [
      ["keys.explorer", this.explorerKeys, EXPLORER_ACTIONS],
      ["keys.outline", this.outlineKeys, OUTLINE_ACTIONS],
      ["keys.resize", this.resizeKeys, Object.keys(RESIZE_ACTIONS)],
    ];
    for (const [table, map, actions] of panes) {
      for (const a of new Set(map.entries().map(([, v]) => v))) if (!actions.includes(a)) this.message("warn", `config: [${table}] binds unknown action "${a}" (${actions.join(", ")})`);
    }
  }

  applyTheme(): void {
    const t = this.themeNamed(this.ui.theme);
    for (const w of t.warnings) this.message("warn", w);
    this.theme = t.theme;
  }

  /** A theme by name with the config's `[colors]` overrides on top; always mono under NO_COLOR. */
  themeNamed(name: string): { theme: Theme; warnings: string[] } {
    const t = loadTheme(process.env.NO_COLOR ? "mono" : name);
    const o = applyColorOverrides(t.theme, this.config.colors);
    return { theme: o.theme, warnings: [...(t.warning ? [t.warning] : []), ...o.warnings] };
  }

  /** Change a UI setting from the TUI; remembered in the session against its config default. */
  setUi<K extends keyof UiState>(key: K, value: UiState[K]): void {
    this.ui[key] = value;
    const base = uiDefaults(this.config)[key];
    if (value === base) delete this.uiOverrides[key];
    else this.uiOverrides[key] = { value, base };
    this.applyUi(key);
  }

  private applyUi(key: keyof UiState): void {
    if (key === "theme") this.applyTheme();
    else if (key === "glyphs") this.glyphs = this.glyphSet(this.ui.glyphs);
    else if (key === "mouse") this.host.setMouse?.(this.ui.mouse);
    this.relayoutAll();
  }

  /** The glyph set for `mode`, with the frame's lines as `ui.lines` asks. */
  glyphSet(mode: string): Glyphs {
    return glyphsFor(mode, process.env, this.config.ui.lines);
  }

  relayoutAll(): void {
    for (const v of this.allViews()) v.layoutKey = "";
  }

  private configFiles(): string[] {
    const files = [this.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile()];
    if (this.loc.mode === "vault") files.push(join(this.loc.root, ".slipbox", "config.toml"));
    return files;
  }

  private recordConfigStamps(): void {
    this.configStamps = new Map(this.configFiles().map((f) => [f, fileStamp(f)]));
  }

  /** True when a config file was created, changed or removed since the last load. */
  configChangedOnDisk(): boolean {
    for (const [f, before] of this.configStamps) if (fileStamp(f) !== before) return true;
    return false;
  }

  /**
   * Reload config and apply what changed, live: keys, aliases, groups, theme and colour
   * overrides, every UI setting, render settings, the walk (rebuild), the watcher. A UI setting whose config value
   * changed takes the new value, replacing any session override of it.
   */
  reloadConfig(reason: "manual" | "file changed" = "manual"): void {
    this.recordConfigStamps();
    const loaded = loadConfig({ vaultRoot: this.loc.mode === "vault" ? this.loc.root : null, configFile: this.configFile });
    const before = this.config;
    const next = loaded.config;
    this.config = next;
    const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const changed = (Object.keys(next) as (keyof Config)[]).filter((s) => differs(before[s], next[s]));

    const oldUi = uiDefaults(before);
    const newUi = uiDefaults(next);
    for (const key of Object.keys(newUi) as (keyof UiState)[]) {
      if (differs(oldUi[key], newUi[key])) {
        delete this.uiOverrides[key];
        (this.ui as unknown as Record<string, unknown>)[key] = newUi[key];
        this.applyUi(key);
      }
    }
    if (before.ui.lines !== next.ui.lines) this.glyphs = this.glyphSet(this.ui.glyphs);
    if (before.ui.sidebar !== next.ui.sidebar) this.sidebar.visible = next.ui.sidebar;
    if (before.ui.outline !== next.ui.outline) this.outline.visible = next.ui.outline;
    if (before.ui.sidebar_width !== next.ui.sidebar_width) this.sideW = next.ui.sidebar_width;
    if (before.ui.outline_width !== next.ui.outline_width) this.outW = next.ui.outline_width;
    if (before.ui.split_ratio !== next.ui.split_ratio) for (const t of this.tabs) t.ratio = next.ui.split_ratio;
    if (changed.some((s) => s === "keys" || s === "aliases" || s === "groups" || s === "input")) this.applyKeys();
    if (changed.includes("colors") && !differs(oldUi.theme, newUi.theme)) this.applyTheme();
    if (changed.includes("render")) {
      for (const b of this.buffers.values()) b.invalidateLayouts();
      this.relayoutAll();
    }
    if (changed.includes("walk")) {
      this.graph = new Graph(this.loc, this.config).build(true, "lazy");
      this.indexInBackground();
      this.invalidateTree();
      for (const b of this.buffers.values()) b.invalidateLayouts();
      this.relayoutAll();
      this.watcher?.close();
      this.watcher = null;
      if (next.watch.enabled) this.startWatcher();
    } else if (changed.includes("watch")) {
      this.watcher?.close();
      this.watcher = null;
      if (next.watch.enabled) this.startWatcher();
    }
    for (const w of loaded.warnings) this.message("warn", w);
    this.message("info", `config reloaded (${reason}) — ${changed.length ? `changed: ${changed.join(", ")}` : "no changes"}`);
  }

  // -------------------------------------------------------------------------------------------
  // Messages (3.13)

  message(level: Level, text: string): void {
    const m = { level, text, at: this.now() };
    this.messages.push(m);
    if (this.messages.length > MESSAGE_LIMIT) this.messages.shift();
    this.transient = m;
    if (this.transientTimer) clearTimeout(this.transientTimer);
    this.transientTimer = setTimeout(
      () => {
        if (this.transient === m) this.transient = null;
        this.host.requestRender();
      },
      level === "error" ? 8000 : 4000,
    );
    (this.transientTimer as { unref?: () => void }).unref?.();
  }

  // -------------------------------------------------------------------------------------------
  // Buffers and views

  get tab(): Tab | null {
    return this.tabs[this.activeTab] ?? null;
  }

  get view(): View | null {
    const t = this.tab;
    return t ? (t.views[t.active] ?? null) : null;
  }

  private defaultNote(): string | null {
    const notes = [...this.graph.notes.keys()];
    for (const pref of ["index.md", "README.md", "readme.md", "home.md"]) if (notes.includes(pref)) return pref;
    return notes[0] ?? null;
  }

  /** Buffer for a vault-relative or absolute path. Keyed by path, not graph membership. */
  buffer(pathOrRel: string): NoteBuffer | null {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.loc.root, pathOrRel);
    const relRaw = relative(this.loc.root, abs);
    const inside = !relRaw.startsWith("..") && !relRaw.startsWith("/");
    const key = inside ? relRaw : abs;
    let buf = this.buffers.get(key);
    if (!buf) {
      const rel = inside && this.graph.notes.has(relRaw) ? relRaw : null;
      buf = new NoteBuffer(rel, abs, key);
      if (!buf.load()) {
        this.message("error", `cannot read ${pathOrRel}`);
        return null;
      }
      if (buf.invalidUtf8) this.message("warn", `${buf.key}: not valid UTF-8; invalid bytes shown as �`);
      this.buffers.set(key, buf);
    }
    return buf;
  }

  makeView(buf: NoteBuffer, anchor?: Anchor, cursor?: CursorAnchor): View {
    const topAnchor = anchor ?? this.positions.get(buf.key) ?? { ...TOP };
    const curAnchor = cursor ?? (anchor ? { anchor, sub: 0, col: 0 } : (this.positions.getCursor(buf.key) ?? { anchor: topAnchor, sub: 0, col: 0 }));
    return {
      buf,
      top: 0,
      cur: { row: 0, col: 0 },
      goal: curAnchor.col,
      sel: null,
      visual: null,
      topAnchor,
      curAnchor,
      back: [],
      fwd: [],
      find: null,
      layoutKey: "",
      height: this.height,
      width: this.width,
      left: 0,
    };
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    const buf = this.buffer(path);
    if (!buf) return;
    this.tabs.push({ views: [this.makeView(buf, anchor)], active: 0, orientation: "side", ratio: this.config.ui.split_ratio });
    this.activeTab = this.tabs.length - 1;
    this.region = "content";
    this.revealInSidebar();
  }

  /** Switch to a tab already showing this note, or open it in a new one. */
  openOrSwitchTab(path: string): void {
    const buf = this.buffer(path);
    if (!buf) return;
    const i = this.tabs.findIndex((t) => t.views.some((v) => v.buf === buf));
    if (i < 0) return this.openInNewTab(path);
    const t = this.tabs[i]!;
    this.activeTab = i;
    t.active = t.views.findIndex((v) => v.buf === buf);
    this.region = "content";
  }

  /** Open a note in a view, pushing history (3.6) and remembering the old position (3.4). */
  open(path: string, anchor?: Anchor, view = this.view): void {
    if (!view) return this.openInNewTab(path, anchor);
    const buf = this.buffer(path);
    if (!buf) return;
    this.pushHistory(view);
    if (buf === view.buf && anchor) {
      this.jumpTo(view, anchor);
      return;
    }
    this.remember(view);
    Object.assign(view, this.makeView(buf, anchor), { back: view.back, fwd: [] });
    this.region = "content";
    this.revealInSidebar();
  }

  pushHistory(view: View): void {
    view.back.push({ key: view.buf.key, anchor: { ...view.topAnchor }, cursor: { ...view.curAnchor } });
    if (view.back.length > HISTORY_LIMIT) view.back.shift();
    view.fwd = [];
  }

  remember(view: View): void {
    this.positions.set(view.buf.key, view.topAnchor, view.curAnchor);
  }

  jumpTo(view: View, anchor: Anchor): void {
    view.topAnchor = anchor;
    view.curAnchor = { anchor, sub: 0, col: 0 };
    view.goal = 0;
    view.layoutKey = "";
    view.sel = null;
    view.visual = null;
  }

  history(dir: "back" | "forward"): void {
    const view = this.view;
    if (!view) return;
    const from = dir === "back" ? view.back : view.fwd;
    const to = dir === "back" ? view.fwd : view.back;
    const loc = from.pop();
    if (!loc) return this.message("info", dir === "back" ? "no earlier location" : "no later location");
    // Load first: a location that can no longer be opened is dropped, and nothing else moves.
    const buf = this.buffer(loc.key);
    if (!buf) return;
    to.push({ key: view.buf.key, anchor: { ...view.topAnchor }, cursor: { ...view.curAnchor } });
    this.remember(view);
    this.showLoc(view, buf, loc);
  }

  showLoc(view: View, buf: NoteBuffer, loc: Loc): void {
    Object.assign(view, {
      buf,
      topAnchor: loc.anchor,
      curAnchor: loc.cursor ?? { anchor: loc.anchor, sub: 0, col: 0 },
      layoutKey: "",
      sel: null,
      visual: null,
      find: null,
    });
    view.goal = view.curAnchor.col;
    this.revealInSidebar();
  }

  // -------------------------------------------------------------------------------------------
  // Layout access. Views store source anchors; rows are derived per width (decision 3.5).

  /** Width of the text column for a pane of `paneWidth`, after line numbers and readable width. */
  textWidth(paneWidth: number, gutter: number): number {
    const w = layoutWidth(paneWidth - gutter, this.config.render.inset, this.config.render.max_width);
    return this.ui.readable_width || this.ui.zen ? Math.min(w, this.config.ui.readable_max) : w;
  }

  /**
   * Wrapping off: the note at its natural width (laid out very wide once, then at the widest real
   * row), never narrower than the pane; the view scrolls sideways instead.
   */
  private nowrapWidth(view: View, paneWidth: number, gutter: number): number {
    const probe = view.buf.layout(NOWRAP_PROBE, this.glyphs, this.ui.urls, view.buf.rel ? this.graph : null);
    let natural = naturalWidths.get(probe);
    if (natural === undefined) {
      natural = naturalWidth(probe);
      naturalWidths.set(probe, natural);
    }
    return Math.max(layoutWidth(paneWidth - gutter, this.config.render.inset, NOWRAP_PROBE), natural);
  }

  /** Columns of text visible in a view (what drawPane gives the text). */
  textColumns(view: View): number {
    return Math.max(1, view.width - 1 - this.gutterWidth(view));
  }

  layoutFor(view: View, paneWidth: number, gutter = 0): Layout {
    // Source mode: the whole text column (no readable width), less one for a cursor after a full
    // row's end; unwrapped, as long as the longest line.
    const width = view.source
      ? Math.max(10, paneWidth - gutter - 2)
      : this.ui.wrap
        ? this.textWidth(paneWidth, gutter)
        : this.nowrapWidth(view, paneWidth, gutter);
    const layout = view.source ? view.buf.sourceLayout(width, this.ui.wrap, this.glyphs) : view.buf.layout(width, this.glyphs, this.ui.urls, view.buf.rel ? this.graph : null);
    const key = `${view.source ? "s" : "r"}:${width}:${this.glyphs.mode}:${this.ui.urls}:${layout.lines.length}:${view.buf.version}:${view.height}`;
    if (view.layoutKey !== key) {
      view.layoutKey = key;
      view.cur = this.cursorFromAnchor(layout, view.curAnchor);
      // Re-derive the anchor from where the cursor landed, so its fallback line tracks the file:
      // after an insertion above, a later removal of the heading must not use a stale line.
      view.curAnchor = { ...this.cursorAnchorFor(layout, view.cur), col: view.curAnchor.col };
      view.top = this.clampTop(view, layout, rowFor(layout, view.topAnchor));
      this.ensureCursorVisible(view, layout);
      if (view.find) view.find = computeFind(layout, view.find.query, view.find.current, view.find.whole);
      if (view.sel) view.sel.anchor = view.sel.src ? this.cursorFromAnchor(layout, view.sel.src) : clampPos(layout, view.sel.anchor);
    }
    return layout;
  }

  currentLayout(view: View): Layout {
    return this.layoutFor(view, view.width, this.gutterWidth(view));
  }

  /** Source line-number gutter width for a view (0 when line numbers are off). */
  gutterWidth(view: View): number {
    if (!this.ui.line_numbers) return 0;
    return String(view.buf.source.split("\n").length).length + 1;
  }

  private cursorFromAnchor(layout: Layout, c: CursorAnchor): Pos {
    const first = rowFor(layout, c.anchor);
    const src = layout.lines[first]?.src;
    let row = first;
    for (let k = 0; k < c.sub && layout.lines[row + 1]?.src === src; k++) row++;
    return clampPos(layout, { row, col: c.col });
  }

  /** After placing `view.cur` directly (editing): its anchor, and the view following it. */
  setCursorAnchor(view: View, layout: Layout): void {
    view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    this.ensureCursorVisible(view, layout);
  }

  /** Show a window's note as its markdown (`on`) or rendered; the cursor keeps its source line. */
  setSource(view: View, on: boolean): void {
    if (!!view.source === on) return;
    if (!on && view.insert) stopInsert(this, view);
    this.remember(view);
    view.source = on;
    view.layoutKey = ""; // re-derive the rows from the anchors: the same source line
    view.sel = null;
    view.visual = null;
  }

  private cursorAnchorFor(layout: Layout, p: Pos): CursorAnchor {
    const src = layout.lines[p.row]?.src;
    let sub = 0;
    while (p.row - sub - 1 >= 0 && layout.lines[p.row - sub - 1]?.src === src) sub++;
    return { anchor: anchorAt(layout, p.row - sub), sub, col: p.col };
  }

  private clampTop(view: View, layout: Layout, top: number): number {
    const max = Math.max(0, layout.lines.length - Math.max(1, view.height));
    return Math.max(0, Math.min(top, max));
  }

  /** Keep the cursor inside the view with `scrolloff` rows of margin. */
  ensureCursorVisible(view: View, layout: Layout): void {
    const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
    if (view.cur.row < view.top + so) view.top = view.cur.row - so;
    else if (view.cur.row > view.top + view.height - 1 - so) view.top = view.cur.row - view.height + 1 + so;
    view.top = this.clampTop(view, layout, view.top);
    view.topAnchor = anchorAt(layout, view.top);
    // Sideways, when wrapping is off: keep the cursor a few columns from either edge.
    if (this.ui.wrap) view.left = 0;
    else {
      const w = this.textColumns(view);
      const margin = Math.min(4, Math.floor(w / 4));
      if (view.cur.col < view.left + margin) view.left = view.cur.col - margin;
      else if (view.cur.col > view.left + w - 1 - margin) view.left = view.cur.col - w + 1 + margin;
      view.left = Math.max(0, Math.min(view.left, Math.max(0, layout.width - w)));
    }
  }

  /** Start a selection anchored at `anchor`, remembering it in source terms too. */
  select(view: View, anchor: Pos, line: boolean): void {
    view.sel = { anchor, line, src: this.cursorAnchorFor(this.currentLayout(view), anchor) };
  }

  /** Move the cursor (extending the selection when asked, or in visual mode). */
  moveCursor(view: View, to: Pos, opts: { extend?: boolean; keepGoal?: boolean } = {}): void {
    this.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.currentLayout(view);
    const extend = opts.extend || view.visual !== null;
    if (extend && !view.sel) this.select(view, { ...view.cur }, view.visual === "line");
    if (!extend && view.sel && !view.visual) view.sel = null;
    view.cur = clampPos(layout, to);
    if (!opts.keepGoal) view.goal = view.cur.col;
    view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    this.ensureCursorVisible(view, layout);
  }

  /** Scroll by rows; the cursor moves with the view (ctrl+d/u, pages) or only as needed (wheel). */
  scrollBy(view: View, delta: number, moveCursor: boolean): void {
    this.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.currentLayout(view);
    view.top = this.clampTop(view, layout, view.top + delta);
    view.topAnchor = anchorAt(layout, view.top);
    const last = Math.max(0, layout.lines.length - 1);
    let row = view.cur.row;
    if (moveCursor) row = Math.max(0, Math.min(view.cur.row + delta, last));
    else {
      const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
      row = Math.max(0, Math.min(Math.max(view.top + so, Math.min(view.cur.row, view.top + view.height - 1 - so)), last));
    }
    if (row !== view.cur.row) {
      view.cur = { row, col: snap(layout, row, view.goal) };
      view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    }
    if (moveCursor) this.ensureCursorVisible(view, layout);
  }

  /** Put the cursor on a heading row and scroll the window so that row is its first. */
  revealHeading(view: View, row: number): void {
    this.pushHistory(view);
    this.moveCursor(view, { row, col: 0 });
    const layout = this.currentLayout(view);
    view.top = this.clampTop(view, layout, view.cur.row);
    view.topAnchor = anchorAt(layout, view.top);
  }

  /** The headings the cursor is in, outermost first: each window's breadcrumb. */
  breadcrumb(view = this.view): { text: string; line: number }[] {
    if (!view) return [];
    const hs = this.currentLayout(view).headings;
    const chain: { text: string; line: number; level: number }[] = [];
    for (const h of hs) {
      if (h.line > view.cur.row) break;
      while (chain.length && chain[chain.length - 1]!.level >= h.level) chain.pop();
      chain.push({ text: h.text, line: h.line, level: h.level });
    }
    return chain.map(({ text, line }) => ({ text, line }));
  }

  /**
   * The breadcrumb's whole path as a dropdown under its `…` (or its icon when nothing is
   * collapsed, centred when there is no breadcrumb): picking a heading scrolls the window to it.
   */
  openHeadingPath(): void {
    const t = this.tab;
    const view = this.view;
    if (!t || !view) return;
    const chain = this.breadcrumb(view);
    if (!chain.length) return this.message("info", "no heading above the cursor");
    const w = t.active;
    const hot = this.geometry?.hot ?? [];
    const at = hot.find((h) => h.id === `crumbmore:${w}`) ?? hot.find((h) => h.id === `crumbicon:${w}`);
    // The selection starts on the current heading (the last), marked `here`.
    const selected = chain.length - 1;
    this.openList({
      title: "Path",
      items: chain.map((c, k) => ({ label: c.text, indent: k, hint: k === chain.length - 1 ? "here" : undefined, data: c.line })),
      selected,
      anchor: at ? { x: at.x, y: at.y } : undefined,
      accept: (item) => {
        t.active = w;
        this.region = "content";
        this.revealHeading(view, item.data as number);
      },
    });
  }

  // -------------------------------------------------------------------------------------------
  // Writing notes (phase 3). Every write goes through writeBuffer: atomic, inside the vault, the
  // watcher told it's ours, the buffer reloaded with its views' anchors kept.

  /** The task item at the cursor: the innermost one whose source lines hold the cursor's row. */
  taskAt(view: View): { line: number; end: number; checked: boolean } | null {
    const layout = this.currentLayout(view);
    const src = layout.lines[view.cur.row]?.src;
    if (src === undefined) return null;
    for (let r = view.cur.row; r >= 0; r--) {
      for (const s of layout.lines[r]!.spans) if (s.task && src >= s.task.line && src <= s.task.end) return s.task;
    }
    return null;
  }

  /** Toggle a task's checkbox (plan 4.11): `x`, or a click on it. */
  toggleTaskAt(view: View, task = this.taskAt(view)): void {
    if (!task) return this.message("info", "no task here — x toggles a list item's [ ]");
    const buf = view.buf;
    if (buf.deleted) return this.message("warn", `${buf.key} was deleted on disk — nothing to toggle`);
    if (buf.dirty) {
      // Unsaved changes: toggle in the buffer (an undo step), not on disk under them.
      const r = toggleTask(new TextEncoder().encode(buf.source), task.line);
      if (!r) return this.message("warn", `line ${task.line} has no task marker`);
      const at = buf.lineStarts()[task.line - 1]! + /\[([ xX])\]/.exec(buf.source.slice(buf.lineStarts()[task.line - 1]!))!.index + 1;
      buf.edit(at, 1, r.checked ? "x" : " ");
      return this.message("info", r.checked ? "done ✓ (unsaved)" : "not done (unsaved)");
    }
    if (buf.changedOnDisk()) {
      // Line numbers may have moved: show the new version first.
      this.reloadBuffer(buf);
      return this.message("warn", `${this.displayName(buf)} changed on disk — reloaded; toggle again`);
    }
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(buf.abs);
    } catch (err) {
      return this.message("error", `can't read ${buf.key}: ${(err as Error).message}`);
    }
    const r = toggleTask(bytes, task.line);
    if (!r) return this.message("warn", `line ${task.line} of ${buf.key} has no task marker`);
    if (this.writeBuffer(buf, r.bytes)) this.message("info", r.checked ? "done ✓" : "not done");
  }

  /** Write a buffer's file and take the result back in; false (with a message) if refused. */
  writeBuffer(buf: NoteBuffer, content: string | Uint8Array, saving = false): boolean {
    // A vault note stays inside the vault; a file from outside it (the scratch) inside its folder.
    const root = buf.rel !== null ? this.loc.root : dirname(buf.abs);
    try {
      writeNote(root, buf.abs, content);
    } catch (err) {
      this.message("error", err instanceof WriteRefused ? err.message : `can't write ${buf.key}: ${(err as Error).message}`);
      return false;
    }
    if (buf.rel !== null) this.watcher?.noteOwnWrite(buf.rel);
    if (saving) {
      // The text on disk is what's in the buffer: keep it, its history and every cursor.
      buf.deleted = false;
      buf.markSaved();
      return true;
    }
    buf.load();
    for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = ""; // keeps the anchors (3.5)
    return true;
  }

  /** The source line under the cursor: where a hand-off opens the note. */
  cursorLine(view: View): number {
    return this.currentLayout(view).lines[view.cur.row]?.src ?? 1;
  }

  /** Step aside for the editor (4.1): it runs in this terminal; the note reloads after it. */
  editInEditor(view: View): void {
    if (!this.host.runForeground) return this.message("error", "can't hand off to an editor here");
    const buf = view.buf;
    // The editor reads the file: unsaved changes go there first (4.10).
    if (buf.dirty && !this.saveBuffer(buf)) return this.message("warn", `${this.displayName(buf)} isn't saved — not handing it off`);
    const argv = editorArgv(this.config.editor.command, buf.abs, this.cursorLine(view));
    const r = this.host.runForeground(argv);
    if (typeof r === "string") return this.message("error", `couldn't start ${argv[0]}: ${r}`);
    if (buf.changedOnDisk()) this.reloadBuffer(buf);
    if (r !== 0) this.message("warn", `${argv[0]} exited with ${r}`);
  }

  /** Send the note to an editor already running elsewhere (4.12); its saves arrive through the
   *  watcher. */
  /** How the running nvims are found and asked; tests replace these. */
  nvimDiscovery: () => NvimServer[] = () => discoverNvims();
  nvimProbe: (socket: string) => NvimServer | null = (s) => probeNvim(s);
  /** The nvim `space n s` sends to, picked once per vault and kept while it answers. */
  remoteServer: string | undefined;

  /**
   * `space n s`: the note, at the cursor's line, to an editor running elsewhere. With the nvim
   * preset (the default) or a `{server}` template, the nvim is the one picked before while it
   * answers; else the only one running; else a picker — which `choose` (`space n p`) always opens.
   */
  sendToEditor(view: View, choose = false): void {
    if (view.buf.dirty && !this.saveBuffer(view.buf)) return this.message("warn", `${this.displayName(view.buf)} isn't saved — not sending it`);
    const raw = this.config.editor.remote.filter((t) => t.trim());
    if (!raw.length) return this.message("info", "set [editor] remote in the config to send notes to a running editor");
    const templates = raw.length === 1 && raw[0]!.trim() === "nvim" ? NVIM_REMOTE : raw;
    if (!templates.some((t) => t.includes("{server}"))) return this.sendWith(view, templates, "");
    if (!choose && this.remoteServer) {
      const known = this.nvimProbe(this.remoteServer);
      if (known) return this.sendWith(view, templates, known);
    }
    const found = this.nvimDiscovery();
    if (!found.length) return this.message("info", "no nvim is running with a server — start nvim (0.9 or later) and try again");
    const pick = (s: NvimServer) => {
      this.remoteServer = s.socket;
      this.sendWith(view, templates, s);
    };
    if (found.length === 1 && !choose) return pick(found[0]!);
    // The nvim working where the note lives first (the closest folder), then the rest.
    const abs = view.buf.abs;
    const holds = (s: NvimServer) => !!s.cwd && (abs === s.cwd || abs.startsWith(`${s.cwd}/`));
    const ordered = [...found].sort((a, b) => Number(holds(b)) - Number(holds(a)) || b.cwd.length - a.cwd.length);
    const home = homedir();
    const tilde = (p: string) => (p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
    const shown = (s: NvimServer) => (s.file ? (s.cwd && s.file.startsWith(`${s.cwd}/`) ? s.file.slice(s.cwd.length + 1) : tilde(s.file)) : "no file");
    this.openList({
      title: "Send to which nvim?",
      items: ordered.map((s) => ({ label: tilde(s.cwd || s.socket), detail: shown(s), hint: s.socket === this.remoteServer ? "last used" : holds(s) ? "holds this note" : undefined, data: s })),
      accept: (item) => pick(item.data as NvimServer),
    });
  }

  private sendWith(view: View, templates: string[], server: NvimServer | ""): void {
    const run = this.host.runDetached;
    if (!run) return this.message("error", "can't start an editor from here");
    const line = this.cursorLine(view);
    // Each command a template of its own; no {file} means none is appended (nvim's --remote-send).
    const socket = server ? server.socket : "";
    const cmds = templates.map((t) => editorArgv(t, view.buf.abs, line, process.env, false, socket));
    const where = server && server.cwd ? ` (${server.cwd.split("/").pop()})` : "";
    this.message("info", `sent to ${cmds[0]![0]}${where} at line ${line}`);
    void (async () => {
      for (const argv of cmds) {
        const r = await run(argv);
        if (r === 0) continue;
        this.message("error", typeof r === "string" ? `couldn't start ${argv[0]}: ${r}` : `${argv.slice(0, 2).join(" ")} exited with ${r}`);
        this.host.requestRender();
        return;
      }
    })();
  }

  /** The link under the cursor, if any. */
  linkUnderCursor(view = this.view): number {
    if (!view) return -1;
    return linkAt(this.currentLayout(view), view.cur.row, view.cur.col);
  }

  /** The link under the cursor, else the first link on the cursor row. */
  linkForFollow(view: View): number {
    const layout = this.currentLayout(view);
    const at = linkAt(layout, view.cur.row, view.cur.col);
    if (at >= 0) return at;
    for (const s of layout.lines[view.cur.row]?.spans ?? []) if (s.link !== undefined) return s.link;
    return -1;
  }

  selectionText(view: View): string {
    if (!view.sel) return "";
    return selectedText(this.currentLayout(view), view.sel, view.cur);
  }

  // -------------------------------------------------------------------------------------------
  // Tabs and the split (3.3)

  splitWith(orientation: Tab["orientation"]): void {
    const t = this.tab;
    const view = this.view;
    if (!t || !view) return;
    t.orientation = orientation;
    if (t.views.length === 1) {
      t.views.push(this.makeView(view.buf, { ...view.topAnchor }, { ...view.curAnchor }));
      t.active = 1;
    }
  }

  closeWindow(): void {
    const t = this.tab;
    if (!t) return;
    if (t.views.length > 1) {
      const closed = t.views.splice(t.active, 1)[0]!;
      this.remember(closed);
      t.active = 0;
      return;
    }
    if (this.tabs.length > 1) return this.closeTab();
    this.message("info", "last window — ctrl+q quits");
  }

  closeTab(): void {
    if (this.tabs.length <= 1) return this.message("info", "last tab — ctrl+q quits");
    const t = this.tabs.splice(this.activeTab, 1)[0]!;
    for (const v of t.views) this.remember(v);
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
  }

  /** Move focus in a direction: between the two windows, and out to the side panes. */
  focusDir(dir: "left" | "right" | "up" | "down"): void {
    const t = this.tab;
    if (this.region === "sidebar") {
      if (dir === "right") this.region = "content";
      return;
    }
    if (this.region === "outline") {
      if (dir === "left") this.region = "content";
      return;
    }
    if (!t) return;
    const side = t.views.length > 1 && this.effectiveOrientation(t) === "side";
    const stacked = t.views.length > 1 && !side;
    if (dir === "left") {
      if (side && t.active === 1) t.active = 0;
      else if (this.sidebarShown) this.region = "sidebar";
    } else if (dir === "right") {
      if (side && t.active === 0) t.active = 1;
      else if (this.outlineShown) this.region = "outline";
    } else if (stacked) t.active = dir === "up" ? 0 : 1;
  }

  /** Move the active window to a side, choosing the split's orientation. */
  moveWindow(dir: "left" | "right" | "up" | "down"): void {
    const t = this.tab;
    if (!t || t.views.length < 2) return this.message("info", "only one window — ctrl+w v splits");
    t.orientation = dir === "left" || dir === "right" ? "side" : "stacked";
    const want = dir === "left" || dir === "up" ? 0 : 1;
    if (t.active !== want) {
      t.views.reverse();
      t.active = want;
    }
  }

  effectiveOrientation(t: Tab): Tab["orientation"] {
    return t.orientation === "side" && this.contentWidth() < 80 ? "stacked" : t.orientation;
  }

  /** The left rail's columns (one button wide, then its border), when it shows: never in zen. */
  get leftRailWidth(): number {
    return this.config.ui.left_rail && !this.ui.zen ? this.railCols : 0;
  }

  /** A rail's columns: a tinted column, one button wide; without colour to tint it, a border too. */
  get railCols(): number {
    return this.theme.roles.rail.bg ? RAIL_WIDTH - 1 : RAIL_WIDTH;
  }

  /** The right rail's columns (its border, then one button wide): with a note, never in zen. */
  get rightRailWidth(): number {
    return this.config.ui.right_rail && !this.ui.zen && this.tabs.length ? this.railCols : 0;
  }

  /** The terminal's width less the rails': what the panes and the note share. */
  get usableWidth(): number {
    return this.width - this.leftRailWidth - this.rightRailWidth;
  }

  contentWidth(): number {
    return this.usableWidth - (this.sidebarBeside ? this.sidebarWidth() + 1 : 0) - (this.outlineBeside ? this.outlineWidth() + 1 : 0);
  }

  // -------------------------------------------------------------------------------------------
  // Side panes: explorer (3.7) and outline

  /** Narrow: side panes open over the note. Never wider than two 12-column panes and the note. */
  get narrow(): boolean {
    return this.usableWidth < Math.max(this.config.ui.narrow_width, 2 * 13 + MIN_CONTENT);
  }

  get sidebarShown(): boolean {
    return this.narrow || this.ui.zen ? this.sidebar.overlay : this.sidebar.visible;
  }

  get sidebarBeside(): boolean {
    return this.sidebarShown && !this.narrow && !this.ui.zen;
  }

  get outlineShown(): boolean {
    return this.narrow || this.ui.zen ? this.outline.overlay : this.outline.visible;
  }

  get outlineBeside(): boolean {
    return this.outlineShown && !this.narrow && !this.ui.zen;
  }

  /**
   * Side pane widths: at least 12, at most half the terminal, and never so wide together that the
   * note gets under MIN_CONTENT columns (whatever the config, resize mode or a drag asked for).
   */
  sidebarWidth(): number {
    const room = this.usableWidth - MIN_CONTENT - 1 - (this.outlineBeside ? 13 : 0);
    return Math.max(12, Math.min(this.sideW, Math.floor(this.usableWidth * 0.5), room));
  }

  outlineWidth(): number {
    const room = this.usableWidth - MIN_CONTENT - 1 - (this.sidebarBeside ? this.sidebarWidth() + 1 : 0);
    return Math.max(12, Math.min(this.outW, Math.floor(this.usableWidth * 0.5), room));
  }

  /**
   * One resize step (resize mode). What resizes follows focus: the explorer or outline width
   * when one is focused, otherwise the active window's share of the split. "Narrower" and
   * "wider" apply to the focused thing.
   */
  resizeAction(action: string): void {
    const step = 2;
    if (!(action in RESIZE_ACTIONS)) return this.message("error", `unknown resize action: ${action}`);
    if (action === "leave") {
      this.resizeMode = false;
      return;
    }
    if (action === "equalize") {
      const t = this.tab;
      if (t) t.ratio = 0.5;
      this.sideW = this.config.ui.sidebar_width;
      this.outW = this.config.ui.outline_width;
      return;
    }
    const grow = action === "wider" || action === "taller" ? 1 : -1;
    const horizontal = action === "wider" || action === "narrower";
    if (this.region === "sidebar" && horizontal) {
      this.sideW = Math.max(12, Math.min(this.sideW + grow * step, Math.floor(this.width * 0.5)));
      return;
    }
    if (this.region === "outline" && horizontal) {
      this.outW = Math.max(12, Math.min(this.outW + grow * step, Math.floor(this.width * 0.5)));
      return;
    }
    const t = this.tab;
    if (!t || t.views.length < 2) return this.message("info", "one window — resize mode sizes a split, or the explorer and outline when focused");
    const side = this.effectiveOrientation(t) === "side";
    if (side !== horizontal) return this.message("info", side ? "side-by-side split: h / l resize it" : "stacked split: j / k resize it");
    const total = side ? this.contentWidth() : this.height;
    // Growing the first window raises the ratio; growing the second lowers it.
    const delta = (grow * step) / Math.max(10, total) * (t.active === 0 ? 1 : -1);
    t.ratio = Math.max(0.15, Math.min(0.85, t.ratio + delta));
  }

  showSidebar(on: boolean): void {
    if (this.narrow || this.ui.zen) this.sidebar.overlay = on;
    else this.sidebar.visible = on;
    if (!on && this.region === "sidebar") this.region = "content";
  }

  /** Show the outline and focus it, its selection on the cursor's section. */
  openOutline(): void {
    this.outline.pinned = false;
    this.showOutline(true);
    this.outline.selected = Math.max(0, this.currentSection());
    this.region = "outline";
  }

  showOutline(on: boolean): void {
    if (this.narrow || this.ui.zen) this.outline.overlay = on;
    else this.outline.visible = on;
    if (!on && this.region === "outline") this.region = "content";
  }

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    const rows: TreeRow[] = [];
    const paths = [...this.graph.notes.keys()].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1;
        const lastB = i === db.length - 1;
        if (da[i] !== db[i]) {
          if (lastA !== lastB) return lastA ? 1 : -1; // directories first
          return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
        }
      }
      return da.length - db.length;
    });
    const seen = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      let visible = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (!seen.has(dir) && visible) {
          seen.add(dir);
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i });
        }
        if (!this.expanded.has(dir)) {
          visible = false;
          break;
        }
      }
      if (visible) rows.push({ kind: "note", path: p, name: parts[parts.length - 1]!, depth: parts.length - 1 });
    }
    this.tree = rows;
    return rows;
  }

  invalidateTree(): void {
    this.tree = null;
  }

  /** The explorer's rows: the tree, or while filtering the matching notes under their folders
   *  (all unfolded), in tree order. */
  explorerRows(): TreeRow[] {
    const q = this.sidebar.filter ?? "";
    if (!q) return this.treeRows();
    if (this.filtered?.query === q && this.filtered.tree === this.treeRows()) return this.filtered.rows;
    const rows: TreeRow[] = [];
    const seen = new Set<string>();
    for (const row of this.allNotesInTreeOrder()) {
      if (!fuzzy(q, row)) continue;
      const parts = row.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (seen.has(dir)) continue;
        seen.add(dir);
        rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i });
      }
      rows.push({ kind: "note", path: row, name: parts[parts.length - 1]!, depth: parts.length - 1 });
    }
    this.filtered = { query: q, tree: this.treeRows(), rows };
    return rows;
  }

  private filtered: { query: string; tree: TreeRow[]; rows: TreeRow[] } | null = null;

  /** Every note's path, directories first at each level, as the tree orders them. */
  private allNotesInTreeOrder(): string[] {
    return [...this.graph.notes.keys()].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1;
        const lastB = i === db.length - 1;
        if (da[i] !== db[i]) {
          if (lastA !== lastB) return lastA ? 1 : -1;
          return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
        }
      }
      return da.length - db.length;
    });
  }

  /** The history view's rows: the active window's timeline, newest first, filtered. */
  historyRows(): HistoryRow[] {
    const v = this.view;
    if (!v) return [];
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    const rows = timeline
      .map((l, i) => {
        const path = this.buffers.get(l.key) ? this.displayName(this.buffers.get(l.key)!) : l.key;
        return {
          label: path.split("/").pop()!.replace(/\.(md|markdown)$/i, ""),
          path,
          hint: i === cur ? "here" : `line ${l.cursor?.anchor.line ?? l.anchor.line}`,
          index: i,
          here: i === cur,
        };
      })
      .reverse();
    const q = this.sidebar.filter ?? "";
    return q ? rows.filter((r) => fuzzy(q, r.path)) : rows;
  }

  /** Jump the window to entry `i` of its timeline: what's before it becomes back, after it forward. */
  jumpHistory(i: number): void {
    const v = this.view;
    if (!v) return;
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    if (i === cur) return;
    const loc = timeline[i];
    const buf = loc && this.buffer(loc.key);
    if (!loc || !buf) return;
    this.remember(v);
    v.back = timeline.slice(0, i);
    v.fwd = timeline.slice(i + 1).reverse();
    this.showLoc(v, buf, loc);
  }

  /**
   * A rail button, or its command: show the left panel on `view` and focus it; if it's already
   * showing that view, hide it (`cycle`: focus it first when it's open but not focused).
   */
  openLeftView(view: LeftView, mode: "toggle" | "cycle" = "toggle"): void {
    const showing = this.sidebarShown && this.leftView === view;
    if (showing && mode === "cycle" && this.region !== "sidebar") {
      this.region = "sidebar";
      this.sidebar.pinned = false;
      return;
    }
    if (showing) return this.showSidebar(false);
    const restored = this.switchLeftView(view);
    this.sidebar.filtering = false;
    this.showSidebar(true);
    this.region = "sidebar";
    if (restored) return;
    // Its first showing (or reopened on the same view): the current note, or the current place.
    this.sidebar.filter = "";
    this.sidebar.pinned = false;
    if (view === "explorer") this.revealInSidebar();
    else this.sidebar.selected = Math.max(0, this.historyRows().findIndex((r) => r.here));
  }

  /**
   * Put `view` in the left panel: the view leaving keeps its position (selection, scroll, sideways
   * offset, filter text), and `view` gets back the one it had. False when it has none to restore
   * (its first showing, or already the panel's view).
   */
  switchLeftView(view: LeftView): boolean {
    if (this.leftView === view) return false;
    const s = this.sidebar;
    this.leftPositions.set(this.leftView, { selected: s.selected, scroll: s.scroll, left: s.left, pinned: s.pinned, filter: s.filter });
    this.leftView = view;
    s.filtering = false;
    const saved = this.leftPositions.get(view);
    Object.assign(s, saved ?? { selected: 0, scroll: 0, left: 0, pinned: false, filter: "" });
    return !!saved;
  }

  /** Keys while the left panel's filter has them: type, move, open, clear. */
  private filterKey(key: string): void {
    const s = this.sidebar;
    const rows = this.leftView === "explorer" ? this.explorerRows() : this.historyRows();
    const typed = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    const done = () => {
      s.filter = "";
      s.filtering = false;
    };
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        done();
        if (this.leftView === "explorer") this.revealInSidebar();
        return;
      case "enter": {
        const row = rows[s.selected];
        if (!row) return;
        if (this.leftView === "history") {
          const i = (row as HistoryRow).index;
          done();
          this.jumpHistory(i);
          this.region = "content";
          return;
        }
        const tree = row as TreeRow;
        if (tree.kind === "dir") return;
        done();
        this.openOrSwitchTab(tree.path);
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        s.selected = Math.min(rows.length - 1, s.selected + 1);
        return;
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        s.selected = Math.max(0, s.selected - 1);
        return;
      case "backspace":
        s.filter = [...(s.filter ?? "")].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        s.filter = (s.filter ?? "").replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        s.filter = "";
        break;
      default:
        if (typed === null) return;
        s.filter = (s.filter ?? "") + typed;
    }
    // The selection goes to the first match: the first note, in the explorer.
    s.scroll = 0;
    s.pinned = false;
    const next = this.leftView === "explorer" ? this.explorerRows() : this.historyRows();
    s.selected = Math.max(0, this.leftView === "explorer" ? next.findIndex((r) => (r as TreeRow).kind === "note") : 0);
  }

  /** The history view's keys (the explorer's keymap): move, jump, filter, close, leave. */
  historyAction(action: string): void {
    const s = this.sidebar;
    const rows = this.historyRows();
    switch (action) {
      case "down":
        s.selected = Math.min(rows.length - 1, s.selected + 1);
        break;
      case "up":
        s.selected = Math.max(0, s.selected - 1);
        break;
      case "top":
        s.selected = 0;
        break;
      case "bottom":
        s.selected = rows.length - 1;
        break;
      case "open":
      case "open_tab":
      case "expand":
      case "open_split": {
        const row = rows[s.selected];
        if (!row) break;
        this.jumpHistory(row.index);
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
        break;
      }
      case "filter":
        s.filtering = true;
        break;
      case "collapse":
        break;
      case "close":
        this.showSidebar(false);
        break;
      case "leave":
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
        break;
      default:
        this.message("error", `unknown explorer action: ${action}`);
    }
  }

  revealInSidebar(): void {
    this.sidebar.pinned = false;
    const rel = this.view?.buf.rel;
    if (!rel) return;
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    this.invalidateTree();
    const idx = this.treeRows().findIndex((r) => r.path === rel);
    if (idx >= 0) this.sidebar.selected = idx;
  }

  explorerAction(action: string): void {
    this.sidebar.pinned = false;
    if (this.leftView === "history") return this.historyAction(action);
    if (action === "filter") {
      this.sidebar.filtering = true; // resumes a filter already there (a view's restored one)
      return;
    }
    const rows = this.explorerRows();
    const row = rows[this.sidebar.selected];
    const openNote = (where: "here" | "tab" | "split") => {
      if (!row) return;
      if (row.kind === "dir") {
        this.expanded.add(row.path);
        this.invalidateTree();
        return;
      }
      if (where === "tab") this.openOrSwitchTab(row.path);
      else if (where === "split") {
        this.splitWith(this.tab?.orientation ?? "side");
        this.open(row.path);
      } else this.open(row.path);
      this.region = "content";
      if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
    };
    switch (action) {
      case "down":
        this.sidebar.selected = Math.min(rows.length - 1, this.sidebar.selected + 1);
        break;
      case "up":
        this.sidebar.selected = Math.max(0, this.sidebar.selected - 1);
        break;
      case "top":
        this.sidebar.selected = 0;
        break;
      case "bottom":
        this.sidebar.selected = rows.length - 1;
        break;
      case "open":
        if (row?.kind === "dir" && this.expanded.has(row.path)) break;
        openNote("here");
        break;
      case "expand":
        // A folder unfolds; a note opens as a tab.
        if (row?.kind === "dir") openNote("here");
        else openNote("tab");
        break;
      case "open_tab":
        if (row?.kind === "dir") {
          if (this.expanded.has(row.path)) this.expanded.delete(row.path);
          else this.expanded.add(row.path);
          this.invalidateTree();
        } else openNote("tab");
        break;
      case "open_split":
        openNote("split");
        break;
      case "collapse": {
        if (!row) break;
        const dir = row.kind === "dir" && this.expanded.has(row.path) ? row.path : row.path.split("/").slice(0, -1).join("/");
        if (dir) {
          this.expanded.delete(dir);
          this.invalidateTree();
          this.sidebar.selected = Math.max(0, this.treeRows().findIndex((r) => r.path === dir));
        }
        break;
      }
      case "close":
        this.showSidebar(false);
        break;
      case "leave":
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
        break;
      default:
        this.message("error", `unknown explorer action: ${action}`);
    }
  }

  /** Visible outline rows for the current view: headings, folds applied. */
  outlineRows(): { index: number; level: number; text: string; line: number; folded: boolean; hasChildren: boolean }[] {
    const view = this.view;
    if (!view) return [];
    if (this.outline.forKey !== view.buf.key) {
      this.outline.forKey = view.buf.key;
      this.outline.pinned = false;
      this.outline.folded = new Set();
      this.outline.scroll = 0;
      this.outline.left = 0;
    }
    const hs = this.currentLayout(view).headings;
    const out: ReturnType<App["outlineRows"]> = [];
    let hideDeeperThan = Number.POSITIVE_INFINITY;
    hs.forEach((h, i) => {
      if (h.level <= hideDeeperThan) hideDeeperThan = Number.POSITIVE_INFINITY;
      else return;
      const hasChildren = (hs[i + 1]?.level ?? 0) > h.level;
      const folded = this.outline.folded.has(i);
      out.push({ index: i, level: h.level, text: h.text, line: h.line, folded, hasChildren });
      if (folded && hasChildren) hideDeeperThan = h.level;
    });
    return out;
  }

  /** Index into outlineRows() of the section the cursor is in. */
  currentSection(): number {
    const view = this.view;
    if (!view) return -1;
    let best = -1;
    this.outlineRows().forEach((r, i) => {
      if (r.line <= view.cur.row) best = i;
    });
    return best;
  }

  outlineAction(action: string): void {
    this.outline.pinned = false;
    const rows = this.outlineRows();
    const row = rows[this.outline.selected];
    const view = this.view;
    switch (action) {
      case "down":
        this.outline.selected = Math.min(rows.length - 1, this.outline.selected + 1);
        break;
      case "up":
        this.outline.selected = Math.max(0, this.outline.selected - 1);
        break;
      case "top":
        this.outline.selected = 0;
        break;
      case "bottom":
        this.outline.selected = rows.length - 1;
        break;
      case "jump":
        if (row && view) {
          this.pushHistory(view);
          this.moveCursor(view, { row: row.line, col: 0 });
          this.region = "content";
          if (this.narrow || this.ui.zen) this.outline.overlay = false;
        }
        break;
      case "fold":
        if (!row) break;
        if (row.hasChildren && !row.folded) this.outline.folded.add(row.index);
        else {
          // Already folded, or a leaf: go to the parent heading.
          const before = rows.slice(0, this.outline.selected);
          for (let i = before.length - 1; i >= 0; i--) {
            if (before[i]!.level < row.level) {
              this.outline.selected = i;
              break;
            }
          }
        }
        break;
      case "unfold":
        if (row) this.outline.folded.delete(row.index);
        break;
      case "close":
        this.showOutline(false);
        break;
      case "leave":
        this.region = "content";
        if (this.narrow || this.ui.zen) this.outline.overlay = false;
        break;
      default:
        this.message("error", `unknown outline action: ${action}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Overlays

  openList(opts: {
    title: string;
    items: ListItem[];
    accept: (item: ListItem) => void;
    move?: (item: ListItem) => void;
    cancel?: () => void;
    filterable?: boolean;
    selected?: number;
    source?: (input: string) => ListItem[];
    submit?: (input: string) => boolean;
    footer?: boolean;
    keepGroups?: boolean;
    alignKeysAcrossList?: boolean;
    anchor?: { x: number; y: number };
  }): void {
    const o: ListOverlay = {
      kind: "list",
      title: opts.title,
      input: "",
      filterable: opts.filterable ?? true,
      items: opts.items,
      source: opts.source,
      filtered: [],
      selected: 0,
      scroll: 0,
      accept: opts.accept,
      submit: opts.submit,
      move: opts.move,
      cancel: opts.cancel,
      footer: opts.footer,
      keepGroups: opts.keepGroups,
      alignKeysAcrossList: opts.alignKeysAcrossList,
      anchor: opts.anchor,
    };
    refilter(o);
    if (opts.selected !== undefined) o.selected = selectable(o, Math.max(0, Math.min(opts.selected, o.filtered.length - 1)), 1);
    this.overlay = o;
  }

  prompt(label: string, accept: (text: string) => void, change?: (text: string) => void, cancel?: () => void): void {
    this.overlay = { kind: "prompt", label, text: "", accept, change, cancel };
  }

  closeOverlay(cancelled: boolean): void {
    const o = this.overlay;
    this.overlay = null;
    if (cancelled) o?.cancel?.();
  }

  // -------------------------------------------------------------------------------------------
  // Input. Dispatch order (decision 3.11): overlay → resize mode → pending sequence → focused
  // pane keys → visual-mode keys → the normal keymap. The which-key popup shows while a sequence is pending.

  /**
   * Pasted text (bracketed paste): into the open list's filter or prompt, first line only and
   * sanitized; elsewhere nothing (the reader has nowhere to put it).
   */
  paste(text: string): void {
    const o = this.overlay;
    const iv = this.view;
    if (!o && this.region === "content" && iv?.insert) {
      // Into the text, its line breaks the note's own.
      return insertText(this, iv, text.replace(/\r\n?/g, "\n").replaceAll("\n", iv.buf.eol));
    }
    if (!o) return;
    const line = sanitize(text.replace(/\r\n?/g, "\n").split("\n")[0] ?? "");
    if (!line) return;
    if (o.kind === "prompt") {
      o.text += line;
      o.change?.(o.text);
    } else if (o.filterable) {
      o.input += line;
      refilter(o);
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    }
  }

  /** Focus never stays on a hidden pane (after zen, a config reload, a resize): back to the note. */
  fixRegion(): void {
    if ((this.region === "sidebar" && !this.sidebarShown) || (this.region === "outline" && !this.outlineShown)) this.region = "content";
  }

  /**
   * A key from the terminal. Keys are handled one at a time, in order: a key arriving while
   * another is still being handled (a fast typist, a paste, a command that awaits) waits its turn.
   */
  handleKey(key: string): Promise<void> {
    const start = () => {
      this.keysInFlight++;
      return this.processKey(key).finally(() => this.keysInFlight--);
    };
    // Nothing in flight: start now (a click's key acts at once); else after the ones before it.
    this.keyQueue = this.keysInFlight === 0 ? start() : this.keyQueue.then(start);
    return this.keyQueue;
  }

  private keyQueue: Promise<void> = Promise.resolve();
  private keysInFlight = 0;

  /** Handle a key now, not queued: `.` replays its keys through this, inside its own turn. */
  async processKey(key: string): Promise<void> {
    this.fixRegion();
    try {
      await this.dispatchKey(key);
    } catch (err) {
      this.message("error", (err as Error).message);
    }
    this.scheduleAutosave(); // the idle clock starts again at each key
    this.host.requestRender();
  }

  /** The keymaps consulted in the current state, in priority order, with how to run a hit. */
  private maps(): { map: Keymap; run: (spec: string) => Promise<void> | void }[] {
    const out: { map: Keymap; run: (spec: string) => Promise<void> | void }[] = [];
    if (this.region === "sidebar" && this.sidebarShown) out.push({ map: this.explorerKeys, run: (a) => this.explorerAction(a) });
    if (this.region === "outline" && this.outlineShown) out.push({ map: this.outlineKeys, run: (a) => this.outlineAction(a) });
    if (this.view?.visual) out.push({ map: this.visualKeys, run: (s) => this.run(s) });
    // Source mode's own keys (x deletes a character there) before the reading ones.
    if (this.region === "content" && this.view?.source && !this.view.visual) out.push({ map: this.sourceKeys, run: (s) => this.run(s) });
    out.push({ map: this.keymap, run: (s) => this.run(s) });
    return out;
  }

  /** which-key entries one level below the pending prefix, across the active keymaps. */
  whichKeyEntries(): { key: string; label: string; desc: string; group: boolean }[] {
    if (this.resizeMode && !this.pending.length) {
      return mergeSameAction(
        this.resizeKeys.children("").map((c) => {
          const a = RESIZE_ACTIONS[c.spec ?? ""];
          return { key: c.key, label: a?.title ?? c.spec ?? "", desc: a?.desc ?? "", group: false, spec: c.spec };
        }),
      );
    }
    const prefix = this.pending.join(" ");
    const seen = new Map<string, { key: string; label: string; desc: string; group: boolean }>();
    const specs = new Map<string, string>();
    for (const { map } of this.maps()) {
      for (const c of map.children(prefix)) {
        if (seen.has(c.key)) continue;
        if (c.spec && !(c.group && !c.spec)) specs.set(c.key, c.spec);
        const full = prefix ? `${prefix} ${c.key}` : c.key;
        const group = c.group && !c.spec;
        if (group) {
          const g = this.groups.get(full);
          seen.set(c.key, { key: c.key, label: `+${g?.name ?? "more"}`, desc: g?.desc ?? "", group });
          continue;
        }
        const id = c.spec?.split(" ")[0] ?? "";
        const cmd = this.registry.get(id);
        seen.set(c.key, { key: c.key, label: cmd?.title ?? c.spec?.replace(/_/g, " ") ?? "", desc: cmd?.description ?? "", group });
      }
    }
    return mergeSameAction([...seen.values()].map((e) => ({ ...e, spec: specs.get(e.key) ?? null })));
  }

  groupName(prefix: string[]): string {
    if (this.resizeMode && !prefix.length) return "resize";
    const seq = prefix.join(" ");
    if (seq === this.leader) return "leader";
    return this.groups.get(seq)?.name ?? "";
  }

  clearPending(): void {
    this.pending = [];
    this.whichKey = false;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (this.whichKeyTimer) clearTimeout(this.whichKeyTimer);
    this.pendingTimer = null;
    this.whichKeyTimer = null;
  }

  private startPending(key: string): void {
    this.pending.push(key);
    if (!this.config.input.which_key) return;
    if (this.pending[0] === this.leader) this.whichKey = true;
    else if (!this.whichKey && !this.whichKeyTimer) {
      this.whichKeyTimer = setTimeout(() => {
        this.whichKeyTimer = null;
        if (this.pending.length) {
          this.whichKey = true;
          this.host.requestRender();
        }
      }, this.config.input.which_key_delay_ms);
      (this.whichKeyTimer as { unref?: () => void }).unref?.();
    }
  }

  private async dispatchKey(key: string): Promise<void> {
    if (this.overlay) return this.overlayKey(this.overlay, key);
    if (this.region === "sidebar" && this.sidebarShown && this.sidebar.filtering && !this.pending.length) return this.filterKey(key);
    // Insert mode: keys are text, except the few that edit or move (editing.ts); save still works.
    const iv = this.view;
    if (this.region === "content" && iv?.insert && !this.pending.length) {
      if (key === "ctrl+s") return void this.run("note.save");
      return insertKey(this, iv, key);
    }
    // A command waiting for one character (f, t) in the render; in source vim.ts has it.
    if (this.region === "content" && this.vim.awaitChar && !iv?.source) {
      const f = this.vim.awaitChar;
      this.vim.awaitChar = null;
      const ch = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
      if (ch !== null) f(ch);
      return;
    }
    // Source mode's normal mode: counts, operators and `.` around the keymaps (vim.ts).
    if (this.region === "content" && iv?.source && !iv.visual && !this.resizeMode) return vimKey(this, iv, key, () => this.dispatchMapped(key));
    return this.dispatchMapped(key);
  }

  /** A key through the keymaps: resize mode's, then pending sequences, then the bindings. */
  private async dispatchMapped(key: string): Promise<void> {
    if (this.resizeMode && !this.pending.length) {
      const action = this.resizeKeys.lookup(key);
      if (action) return this.resizeAction(action);
      // Any other key leaves resize mode and does what it normally does.
      this.resizeMode = false;
    }
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.pending.length && key === "escape") return this.clearPending();
    if (this.pending.length && key === "backspace") {
      this.pending.pop();
      if (!this.pending.length) this.clearPending();
      return;
    }
    const seq = [...this.pending, key].join(" ");
    const maps = this.maps();
    const at = maps.findIndex((m) => m.map.lookup(seq) !== undefined);
    const hit = at >= 0 ? { ...maps[at]!, spec: maps[at]!.map.lookup(seq) } : undefined;
    // Only keymaps at or above the one holding the binding may turn the key into a prefix:
    // visual mode's `y` must not wait for the normal keymap's `y y`.
    const prefix = maps.slice(0, at >= 0 ? at + 1 : maps.length).some((m) => m.map.isPrefix(seq));
    if (prefix) {
      this.startPending(key);
      if (hit) {
        // Both a binding and a prefix: run it unless another key follows promptly.
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          this.clearPending();
          void Promise.resolve(hit.run(hit.spec!)).then(() => this.host.requestRender());
        }, this.config.input.which_key_delay_ms);
      }
      return;
    }
    this.clearPending();
    if (hit) return hit.run(hit.spec!);
    if (key !== "escape") this.message("info", `${prettyKey(seq, this.leader)} is not bound — ? lists keys`);
  }

  async run(spec: string): Promise<void> {
    if (!(await this.registry.run(this, spec))) this.message("error", `unknown command: ${spec}`);
  }

  private overlayKey(o: Overlay, key: string): void {
    if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return this.closeOverlay(true);
    const typed = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    if (o.kind === "prompt") {
      if (key === "enter") {
        this.overlay = null;
        return o.accept(o.text);
      }
      if (key === "backspace") o.text = [...o.text].slice(0, -1).join("");
      else if (key === "ctrl+w" || key === "ctrl+backspace") o.text = o.text.replace(/\S*\s*$/, "");
      else if (key === "ctrl+u") o.text = "";
      else if (typed !== null) o.text += typed;
      else return;
      o.change?.(o.text);
      return;
    }
    const n = o.filtered.length;
    // Group headings are skipped, in the direction of travel.
    const moveTo = (i: number, dir = i >= o.selected ? 1 : -1) => {
      o.wheeled = false;
      o.selected = selectable(o, Math.max(0, Math.min(n - 1, i)), dir);
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    };
    switch (key) {
      case "enter": {
        if (o.submit?.(o.input)) {
          if (this.overlay === o) this.overlay = null;
          return;
        }
        const item = o.filtered[o.selected];
        if (!item) return this.closeOverlay(true); // nothing to accept: undo any live preview
        this.overlay = null;
        o.accept(item.item);
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        return moveTo(step(o, 1), 1);
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        return moveTo(step(o, -1), -1);
      case "pagedown":
      case "ctrl+d":
        return moveTo(o.selected + 10);
      case "pageup":
      case "ctrl+u":
        return moveTo(o.selected - 10);
    }
    if (!o.filterable) {
      // An item's own key picks it.
      const hot = o.filtered.findIndex((e) => e.item.hotkey && e.item.hotkey === (typed ?? "").toLowerCase());
      if (hot >= 0) {
        o.selected = hot;
        return this.overlayKey(o, "enter");
      }
      if (key === "j") return moveTo(o.selected + 1);
      if (key === "k") return moveTo(o.selected - 1);
      return;
    }
    if (key === "backspace") o.input = [...o.input].slice(0, -1).join("");
    else if (key === "ctrl+w" || key === "ctrl+backspace") o.input = o.input.replace(/\S*\s*$/, "");
    else if (typed !== null) o.input += typed;
    else return;
    refilter(o);
    const item = o.filtered[o.selected];
    if (item) o.move?.(item.item);
  }

  private lastClick: { x: number; y: number; at: number; count: number } | null = null;
  private drag:
    | { kind: "select"; view: View; start: Pos; moved: boolean }
    | { kind: "tab"; index: number }
    | { kind: "separator"; sep: import("./draw.ts").Separator }
    | { kind: "scrollbar"; bar: import("./draw.ts").ScrollbarGeom }
    | null = null;

  /** Everything visible is clickable (docs/design/keymap.md, "Mouse"). */
  handleMouse(ev: { type: string; x: number; y: number; button: number; scroll?: { direction: string; delta: number } }): void {
    const g = this.geometry;
    if (!g) return;
    const hotAt = () => g.hot.find((h) => inRect(h, ev.x, ev.y));
    if (ev.type === "move" || ev.type === "over" || ev.type === "out") {
      this.hover = hotAt()?.id ?? null;
      return;
    }
    if (this.overlay) return this.overlayMouse(ev, g);
    if (ev.type === "scroll") return this.wheel(ev, g);
    if (ev.type === "down") {
      // A click ends typing (its undo step closes), then does what it does.
      for (const v of this.allViews()) if (v.insert) stopInsert(this, v);
      return this.mouseDown(ev, g, hotAt()?.id ?? null);
    }
    if (ev.type === "drag" && this.drag) return this.mouseDrag(ev, g);
    if ((ev.type === "up" || ev.type === "drag-end") && this.drag) return this.mouseUp();
  }

  private overlayMouse(ev: { type: string; x: number; y: number; scroll?: { direction: string } }, g: Geometry): void {
    const o = this.overlay!;
    if (o.kind !== "list" || !g.overlay) {
      if (ev.type === "down") this.closeOverlay(true);
      return;
    }
    const r = g.overlay;
    if (ev.type === "scroll") {
      if (ev.scroll?.direction !== "up" && ev.scroll?.direction !== "down") return; // sideways: nothing
      // The wheel scrolls the list, three rows a notch, like the note and the side panes; the
      // selection moves only to stay in view.
      const d = (ev.scroll?.direction === "up" ? -1 : 1) * 3;
      const n = o.filtered.length;
      o.scroll = Math.max(0, Math.min(Math.max(0, n - r.rows), o.scroll + d));
      o.wheeled = true;
      const before = o.selected;
      if (o.selected < o.scroll) o.selected = selectable(o, o.scroll, 1);
      else if (o.selected >= o.scroll + r.rows) o.selected = selectable(o, Math.min(n - 1, o.scroll + r.rows - 1), -1);
      const item = o.filtered[o.selected];
      if (item && o.selected !== before) o.move?.(item.item);
      return;
    }
    if (ev.type !== "down") return;
    const idx = ev.y - r.listY + o.scroll;
    if (ev.x >= r.x && ev.x < r.x + r.w && ev.y >= r.listY && ev.y < r.listY + r.rows && idx < o.filtered.length) {
      if (o.filtered[idx]!.item.header) return;
      o.selected = idx;
      return void this.overlayKey(o, "enter");
    }
    if (!inRect(r, ev.x, ev.y)) this.closeOverlay(true);
  }

  private wheel(ev: { x: number; y: number; scroll?: { direction: string; delta: number } }, g: Geometry): void {
    const n = Math.max(1, ev.scroll?.delta ?? 1) * 3;
    const dir = ev.scroll?.direction === "up" ? -1 : 1;
    const sideways = ev.scroll?.direction === "left" || ev.scroll?.direction === "right";
    if (!sideways && g.tabStrip && inRect(g.tabStrip, ev.x, ev.y) && this.tabs.length) {
      this.activeTab = (this.activeTab + dir + this.tabs.length) % this.tabs.length;
      return;
    }
    const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
    // Sideways (a horizontal wheel or trackpad), when wrapping is off: the view moves, not the cursor.
    const side = ev.scroll?.direction === "left" ? -1 : ev.scroll?.direction === "right" ? 1 : 0;
    if (side) {
      // Side panes first (they lie over the note on narrow screens); drawing clamps the offset.
      const sidePane = g.outlinePane && inRect(g.outlinePane, ev.x, ev.y) ? this.outline : g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y) ? this.sidebar : null;
      if (sidePane) {
        sidePane.left = Math.max(0, (sidePane.left ?? 0) + side * n * 2);
        return;
      }
      if (pane && !this.ui.wrap) {
        const layout = this.currentLayout(pane.view);
        pane.view.left = Math.max(0, Math.min(Math.max(0, layout.width - this.textColumns(pane.view)), pane.view.left + side * n * 2));
      }
      return;
    }
    // Side panes first: on narrow screens they lie over the note.
    if (g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)) {
      this.outline.scroll = Math.max(0, this.outline.scroll + dir * n);
      this.outline.pinned = true;
    } else if (g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)) {
      this.sidebar.scroll = Math.max(0, this.sidebar.scroll + dir * n);
      this.sidebar.pinned = true;
    } else if (pane) this.scrollBy(pane.view, dir * n, false);
  }

  /** Click count at this spot: 1, 2 (double) or 3 (triple), within 400 ms. */
  private clicks(ev: { x: number; y: number }): number {
    const now = this.now();
    const l = this.lastClick;
    const count = l && l.x === ev.x && l.y === ev.y && now - l.at < 400 ? Math.min(3, l.count + 1) : 1;
    this.lastClick = { x: ev.x, y: ev.y, at: now, count };
    return count;
  }

  private mouseDown(ev: { x: number; y: number; button: number }, g: Geometry, hot: string | null): void {
    // Middle-click closes a tab.
    if (ev.button === 1) {
      const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
      if (tab) this.closeTabAt(tab.index);
      return;
    }
    if (ev.button !== 0) return;
    const clicks = this.clicks(ev);
    if (hot && !hot.startsWith("tab:")) return this.clickHot(hot);
    if (g.popup && inRect(g.popup, ev.x, ev.y)) return; // the which-key popup's background
    const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
    if (tab) {
      this.activeTab = tab.index;
      this.drag = { kind: "tab", index: tab.index };
      return;
    }
    // A side pane's own scrollbars first: they sit inside the pane, and focus it like any click there.
    const paneBar = g.scrollbars.find((b) => b.pane && inRect(b, ev.x, ev.y));
    if (paneBar) {
      this.region = paneBar.pane!;
      this.drag = { kind: "scrollbar", bar: paneBar };
      this.scrollbarTo(paneBar, ev.y, ev.x);
      return;
    }
    // Side panes before the note's borders and scrollbars: on narrow screens they lie over the
    // note, the outline over the explorer. A click anywhere in one (its title, blank rows, below
    // the list, its border) focuses it.
    if (g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)) {
      this.region = "outline";
      if (!g.outline || !inRect(g.outline, ev.x, ev.y)) return;
      const idx = ev.y - g.outline.y + this.outline.scroll;
      const row = this.outlineRows()[idx];
      if (!row) return;
      this.outline.selected = idx;
      // The fold marker sits right after the indent.
      const markerX = g.outline.x + 1 + (row.level - 1) * 2;
      if (row.hasChildren && ev.x >= markerX - 1 && ev.x <= markerX + 1) this.outlineAction(row.folded ? "unfold" : "fold");
      else this.outlineAction("jump"); // a choice: the note moves there and takes the focus
      return;
    }
    if (g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)) {
      this.region = "sidebar";
      if (!g.sidebar || !inRect(g.sidebar, ev.x, ev.y)) return;
      const idx = ev.y - g.sidebar.y + this.sidebar.scroll;
      if (this.leftView === "history") {
        const h = this.historyRows()[idx];
        if (!h) return;
        this.sidebar.selected = idx;
        this.sidebar.filter = "";
        this.sidebar.filtering = false;
        this.historyAction("open");
        return;
      }
      const row = this.explorerRows()[idx];
      if (!row) return;
      this.sidebar.selected = idx;
      if (row.kind === "note" && this.sidebar.filter) {
        // Picked from the filter: open it, and the tree comes back.
        this.sidebar.filter = "";
        this.sidebar.filtering = false;
        this.openOrSwitchTab(row.path);
        this.region = "content";
        return;
      }
      if (row.kind === "dir") {
        if (this.expanded.has(row.path)) this.expanded.delete(row.path);
        else this.expanded.add(row.path);
        this.invalidateTree();
      } else this.explorerAction("open_tab"); // a second click finds the tab it opened
      return;
    }
    const sep = g.separators.find((s) => inRect(s, ev.x, ev.y));
    if (sep) {
      this.drag = { kind: "separator", sep };
      return;
    }
    const bar = g.scrollbars.find((b) => inRect(b, ev.x, ev.y));
    if (bar) {
      this.drag = { kind: "scrollbar", bar };
      this.scrollbarTo(bar, ev.y, ev.x);
      return;
    }
    const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
    if (!pane) return;
    const t = this.tab!;
    t.active = t.views.indexOf(pane.view);
    this.region = "content";
    const view = pane.view;
    const layout = this.currentLayout(view);
    const pos = clampPos(layout, { row: view.top + (ev.y - pane.y), col: Math.max(0, ev.x - pane.textX) + view.left });
    view.visual = null;
    if (clicks === 2) {
      // Double-click selects the word, triple-click the row; either is copied, like a terminal.
      const [a, b] = wordAt(layout, pos);
      this.select(view, { row: pos.row, col: a }, false);
      this.moveCursor(view, { row: pos.row, col: b }, { extend: true });
      this.copySelectionQuietly(view);
      return;
    }
    if (clicks === 3) {
      this.select(view, { row: pos.row, col: 0 }, true);
      view.cur = pos;
      view.curAnchor = this.cursorAnchorFor(layout, pos);
      this.copySelectionQuietly(view);
      return;
    }
    view.sel = null;
    this.moveCursor(view, pos);
    this.drag = { kind: "select", view, start: pos, moved: false };
  }

  private copySelectionQuietly(view: View): void {
    const text = this.selectionText(view);
    if (!text) return;
    this.copy(text, false);
    this.message("info", `copied ${text.length} characters`);
  }

  private mouseDrag(ev: { x: number; y: number }, g: Geometry): void {
    const d = this.drag!;
    if (d.kind === "tab") {
      const over = g.tabs.find((t) => ev.x >= t.x && ev.x < t.x + t.w);
      if (over && over.index !== d.index) {
        const [moved] = this.tabs.splice(d.index, 1);
        this.tabs.splice(over.index, 0, moved!);
        this.activeTab = over.index;
        d.index = over.index;
      }
      return;
    }
    if (d.kind === "separator") {
      const s = d.sep;
      if (s.kind === "sidebar") this.sideW = Math.max(12, Math.min(ev.x - this.leftRailWidth, Math.floor(this.usableWidth * 0.5)));
      else if (s.kind === "outline") this.outW = Math.max(12, Math.min(this.width - this.rightRailWidth - ev.x - 1, Math.floor(this.usableWidth * 0.5)));
      else if (s.area && this.tab) {
        const r = s.kind === "split-side" ? (ev.x - s.area.x) / Math.max(1, s.area.w) : (ev.y - s.area.y) / Math.max(1, s.area.h);
        this.tab.ratio = Math.max(0.15, Math.min(0.85, r));
      }
      return;
    }
    if (d.kind === "scrollbar") return this.scrollbarTo(d.bar, ev.y, ev.x);
    const pane = g.panes.find((p) => p.view === d.view);
    if (!pane) return;
    if (ev.y < pane.y) this.scrollBy(pane.view, -1, false);
    if (ev.y >= pane.y + pane.h) this.scrollBy(pane.view, 1, false);
    const layout = this.currentLayout(d.view);
    const pos = clampPos(layout, { row: d.view.top + Math.max(0, Math.min(pane.h - 1, ev.y - pane.y)), col: Math.max(0, ev.x - pane.textX) + d.view.left });
    if (!d.view.sel || d.view.sel.anchor !== d.start) this.select(d.view, d.start, false);
    d.view.cur = pos;
    d.view.goal = pos.col;
    // The anchor too, so a re-layout (a message line appearing, a resize) keeps the cursor here.
    d.view.curAnchor = this.cursorAnchorFor(layout, pos);
    d.moved = true;
  }

  private mouseUp(): void {
    const d = this.drag!;
    this.drag = null;
    if (d.kind !== "select") return;
    if (d.moved && d.view.sel) {
      const text = this.selectionText(d.view);
      if (text) {
        this.copy(text, false);
        this.message("info", `copied ${text.length} characters · ${prettyKey(`${this.leader} s a`, this.leader)} adds it to the scratch`);
      }
      return;
    }
    d.view.sel = null;
    const layout = this.currentLayout(d.view);
    const link = linkAt(layout, d.start.row, d.start.col);
    if (link >= 0) return void this.run("link.follow").then(() => this.host.requestRender());
    const task = taskMarkAt(layout, d.start.row, d.start.col);
    if (task) this.toggleTaskAt(d.view, task);
  }

  private scrollbarTo(bar: import("./draw.ts").ScrollbarGeom, y: number, x = bar.x): void {
    const frac = Math.max(0, Math.min(1, (y - bar.y) / Math.max(1, bar.h - 1)));
    if (bar.pane) {
      // A side pane's view moves, pinned like the wheel's; its selection stays.
      const state = bar.pane === "sidebar" ? this.sidebar : this.outline;
      if (bar.horizontal) {
        const fx = Math.max(0, Math.min(1, (x - bar.x) / Math.max(1, bar.w - 1)));
        state.left = Math.round(fx * Math.max(0, bar.total - bar.w));
        return;
      }
      state.scroll = Math.round(frac * Math.max(0, bar.total - bar.h));
      state.pinned = true;
      return;
    }
    if (!bar.view) return;
    if (bar.horizontal) {
      const fx = Math.max(0, Math.min(1, (x - bar.x) / Math.max(1, bar.w - 1)));
      bar.view.left = Math.round(fx * Math.max(0, bar.total - bar.w));
      return;
    }
    const target = Math.round(frac * Math.max(0, bar.total - bar.view.height));
    this.scrollBy(bar.view, target - bar.view.top, false);
  }

  /** What a click on a region of the chrome does. */
  clickHot(id: string): void {
    const [kind, arg] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    switch (kind) {
      case "btn":
        if (arg === "explorer") this.openLeftView("explorer");
        else if (arg === "history") this.openLeftView("history");
        else if (arg === "outline") void this.run("outline.toggle");
        else if (arg === "palette") void this.run("palette.open");
        break;
      case "tabclose":
        this.closeTabAt(Number(arg));
        break;
      case "tabmore":
        // The tabs that don't fit in the strip: pick one from the tab list.
        void this.run("tab.list");
        break;
      case "crumb": {
        // crumb:<window>:<row> — that window scrolls to the heading, and takes the focus.
        const [w, row] = arg.split(":").map(Number) as [number, number];
        const t = this.tab;
        const v = t?.views[w];
        if (!t || !v) break;
        t.active = w;
        this.region = "content";
        this.revealHeading(v, row);
        break;
      }
      case "crumbmore": {
        const t = this.tab;
        if (!t?.views[Number(arg)]) break;
        t.active = Number(arg);
        this.region = "content";
        void this.run("breadcrumb.path");
        break;
      }
      case "crumbicon": {
        const t = this.tab;
        if (!t?.views[Number(arg)]) break;
        t.active = Number(arg);
        this.region = "content";
        void this.run("outline.pick");
        break;
      }
      case "status":
        if (arg === "path" && this.view) this.copy(this.view.buf.abs);
        else if (arg === "message") void this.run("messages.open");
        break;
      case "wk":
        void this.handleKey(arg);
        break;
    }
  }

  /** Remember a command run from the palette or help, for the palette's "Recent" group. */
  noteRecent(id: string): void {
    this.recentCommands = [id, ...this.recentCommands.filter((x) => x !== id)].slice(0, RECENT_MAX);
  }

  /** Close a tab by index; the tab you're on stays active (shifted if one before it closed). */
  closeTabAt(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    if (index === this.activeTab) return this.closeTab();
    if (this.tabs.length <= 1) return;
    const [t] = this.tabs.splice(index, 1);
    for (const v of t!.views) this.remember(v);
    if (index < this.activeTab) this.activeTab--;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  draw(canvas: Canvas): void {
    this.width = canvas.width;
    this.height = canvas.height;
    this.fixRegion();
    try {
      this.geometry = drawApp(this, canvas);
    } catch (err) {
      // A drawing bug must never take the app down: report it, and say so on screen too (the
      // message line may be what failed to draw).
      const text = `drawing failed: ${(err as Error).message}`;
      if (!this.drawFailed) this.message("error", text);
      this.drawFailed = true;
      canvas.fill(0, 0, canvas.width, canvas.height, null);
      drawText(canvas, 0, 0, truncate(`slipbox: ${text} — resize, or esc`, canvas.width), { fg: "default", bg: null, bold: true, italic: false, underline: false, strike: false, dim: false });
      return;
    }
    this.drawFailed = false;
  }

  // -------------------------------------------------------------------------------------------
  // Clipboard, capture

  copy(text: string, announce = true): boolean {
    const r = copyText(text, { osc52: (t) => this.host.osc52(t), fallbackDir: stateDir(this.loc.root) });
    if (announce) this.message("info", r.file ? `clipboard unavailable — wrote ${r.file}` : `copied ${text.length} characters`);
    return !r.file;
  }

  scratch() {
    return scratchLocation(this.loc.root, this.config);
  }

  capture(entry: string): void {
    const loc = this.scratch();
    // An open, changed scratch is saved first, so the entry goes after what you typed (4.10).
    const scratchBuf = this.buffers.get(loc.path) ?? this.buffers.get(relative(this.loc.root, loc.path));
    if (scratchBuf?.dirty && !this.saveBuffer(scratchBuf)) return;
    appendScratch(loc, entry);
    const rel = relative(this.loc.root, loc.path);
    if (!rel.startsWith("..")) this.watcher?.noteOwnWrite(rel);
    const open = this.buffers.get(loc.path) ?? this.buffers.get(rel);
    if (open) {
      open.load();
      for (const v of this.allViews()) if (v.buf === open) v.layoutKey = "";
    }
    this.message("info", `added to the scratch · ${prettyKey(`${this.leader} s s`, this.leader)} opens it`);
  }

  allViews(): View[] {
    return this.tabs.flatMap((t) => t.views);
  }

  displayName(buf: NoteBuffer): string {
    return buf.abs === this.scratch().path ? "scratch" : buf.key;
  }

  // -------------------------------------------------------------------------------------------
  // Background indexing, watching (5.1–5.4), polling outside files and the config.

  indexInBackground(): void {
    if (this.indexing) return; // a pass is already running; it picks up the new stubs
    const total = this.graph.pendingCount;
    if (!total) return;
    this.indexing = total;
    const t0 = this.now();
    const tick = () => {
      if (this.quitting) return;
      const left = this.graph.parseSome(12);
      this.indexing = left;
      if (left) {
        setTimeout(tick, 1);
        if (total > 200) this.host.requestRender();
        return;
      }
      this.invalidateTree();
      if (total > 200) this.message("info", `indexed ${total} notes in ${((this.now() - t0) / 1000).toFixed(1)} s`);
      this.host.requestRender();
    };
    setTimeout(tick, 1);
  }

  private knownFromGraph(): Map<string, number> {
    return new Map([...this.graph.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
  }

  private sizesFromGraph(): Map<string, number> {
    return new Map([...this.graph.notes.values()].map((n) => [n.rel, n.size] as [string, number]));
  }

  startWatcher(): void {
    this.watcher = new VaultWatcher({
      root: this.loc.root,
      filter: this.graph.filter,
      dirs: this.loc.mode === "vault" ? this.graph.dirs : [""],
      debounceMs: this.config.watch.debounce_ms,
      pollMs: this.config.watch.poll_ms,
      known: this.knownFromGraph(),
      sizes: this.sizesFromGraph(),
      onBatch: (b) => {
        this.applyChanges(b);
        this.host.requestRender();
      },
      onDegraded: (reason) => {
        this.message("error", `watching degraded: ${reason}`);
        this.host.requestRender();
      },
      onWarn: (text) => {
        this.message("warn", text);
        this.host.requestRender();
      },
      pollTargets: () => [...this.buffers.values()].filter((b) => b.rel).map((b) => b.rel!),
    });
  }

  /** Poll what the vault watcher cannot see: files open from outside the vault (the scratch)
   *  and the config files, which reload automatically when saved. */
  private startPolling(): void {
    const t = setInterval(() => {
      if (this.quitting) return clearInterval(t);
      let changed = false;
      for (const buf of this.buffers.values()) {
        if (buf.rel !== null || buf.key !== buf.abs) continue;
        if (buf.changedOnDisk()) {
          this.reloadBuffer(buf);
          changed = true;
        }
      }
      if (this.configChangedOnDisk()) {
        this.reloadConfig("file changed");
        changed = true;
      }
      if (changed) this.host.requestRender();
    }, Math.min(this.config.watch.poll_ms, 1000));
    (t as { unref?: () => void }).unref?.();
  }

  applyChanges(batch: WatchBatch): void {
    let setChanged = false;
    if (batch.rescan) {
      this.graph.build(true, "lazy");
      this.indexInBackground();
      this.watcher?.sync(this.loc.mode === "vault" ? this.graph.dirs : [""], this.knownFromGraph(), this.sizesFromGraph());
      setChanged = true;
      // The walk itself changed: any open note may have changed, appeared or gone.
      for (const buf of this.buffers.values()) if (buf.changedOnDisk()) this.reloadBuffer(buf);
    }
    for (const c of batch.changes) {
      if (!c.isNote) {
        // An attachment appeared or went: ![[embeds]] of it change status.
        // Only a real change to the index re-lays anything out (a rewrite of a known image doesn't).
        if (c.kind === "deleted" ? this.graph.removeAsset(c.rel) : this.graph.addAsset(c.rel)) setChanged = true;
        continue;
      }
      if (c.kind === "deleted") {
        this.graph.removeFile(c.rel);
        setChanged = true;
      } else {
        const abs = join(this.loc.root, c.rel);
        let st: { size: number; mtimeMs: number } | null = null;
        try {
          st = statSync(abs);
        } catch {}
        if (!st) continue;
        // The walk's size cap holds for notes that appear or grow later too: out of the index (an
        // open buffer still reloads below); back in when it shrinks under the cap again.
        if (st.size > this.config.walk.max_file_size) {
          if (this.graph.notes.has(c.rel)) {
            this.graph.removeFile(c.rel);
            this.message("warn", `${c.rel} is larger than walk.max_file_size — left out of the index`);
          }
          setChanged = true;
        } else {
          if (c.kind === "created" || !this.graph.notes.has(c.rel)) setChanged = true;
          this.graph.updateFile(c.rel, { rel: c.rel, abs, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
      const buf = this.buffers.get(c.rel);
      if (buf) this.reloadBuffer(buf, c.kind === "deleted");
    }
    if (setChanged) {
      // New or removed notes change link statuses everywhere and the explorer.
      this.invalidateTree();
      for (const b of this.buffers.values()) b.invalidateLayouts();
      this.relayoutAll();
    } else if (batch.changes.length) {
      // Only changed notes: their own buffers reloaded above; others re-lay out only when they
      // link to one (its headings, and so a [[note#heading]]'s status, may have changed).
      const changed = new Set(batch.changes.map((c) => c.rel));
      for (const b of this.buffers.values()) {
        if (!b.rel || changed.has(b.rel)) continue;
        if (this.graph.linksOf(b.rel).some((l) => l.path !== null && l.path !== undefined && changed.has(l.path))) b.invalidateLayouts();
      }
    }
  }

  reloadBuffer(buf: NoteBuffer, deleted = false): void {
    if (buf.dirty && !deleted) {
      // Unsaved changes here and a new version there: the conflict prompt decides (5.5).
      if (!buf.conflictKept) this.conflictPrompt(buf);
      return;
    }
    if (deleted || !buf.load()) {
      buf.deleted = true;
      buf.changedAt = this.now();
      this.message("warn", `${buf.key} was deleted on disk — still showing the last version`);
      return;
    }
    buf.changedAt = this.now();
    for (const v of this.allViews()) {
      if (v.buf !== buf) continue;
      // Keep the anchors (3.5): the heading above the viewport and the cursor's source line.
      v.layoutKey = "";
      v.sel = null;
      v.visual = null;
    }
    this.message("info", `↻ ${this.displayName(buf)} changed on disk — reloaded`);
    setTimeout(() => this.host.requestRender(), 3100).unref?.();
  }

  // -------------------------------------------------------------------------------------------
  // Session (3.15)

  /**
   * UI settings changed in the TUI, on every start (with a path too, and with restore_session
   * off): a session value is kept only while the config value it overrode is unchanged.
   */
  private restoreUiOverrides(): void {
    const s = loadSession(this.loc.root);
    const defaults = uiDefaults(this.config);
    for (const [k, o] of Object.entries(s?.ui ?? {})) {
      if (!(k in defaults) || !o || typeof o !== "object") continue;
      if (JSON.stringify(defaults[k as keyof UiState]) !== JSON.stringify(o.base)) continue;
      if (typeof o.value !== typeof defaults[k as keyof UiState]) continue;
      (this.ui as unknown as Record<string, unknown>)[k] = o.value;
      this.uiOverrides[k] = o;
    }
  }

  private restoreSession(): boolean {
    const s = loadSession(this.loc.root);
    if (!s) return false;
    for (const t of s.tabs) {
      const views: View[] = [];
      for (const p of t.panes) {
        const buf = this.buffer(p.path);
        if (buf) views.push(this.makeView(buf, p.anchor, p.cursor));
      }
      if (views.length) this.tabs.push({ views, active: Math.min(t.active, views.length - 1), orientation: t.orientation ?? "side", ratio: t.ratio ?? this.config.ui.split_ratio });
    }
    if (!this.tabs.length) return false;
    this.activeTab = Math.max(0, Math.min(s.activeTab, this.tabs.length - 1));
    for (const t of this.tabs) t.active = Math.max(0, Math.min(t.active, t.views.length - 1));
    this.sidebar.visible = s.sidebar;
    if (s.outline !== undefined) this.outline.visible = s.outline;
    if (s.sidebar_width) this.sideW = s.sidebar_width;
    if (s.outline_width) this.outW = s.outline_width;
    this.revealInSidebar();
    return true;
  }

  saveState(): void {
    for (const v of this.allViews()) this.remember(v);
    this.positions.save();
    const s: SessionState = {
      version: 1,
      tabs: this.tabs.map((t) => ({
        panes: t.views.map((v) => ({ path: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor })),
        active: t.active,
        orientation: t.orientation,
        ratio: t.ratio,
      })),
      activeTab: this.activeTab,
      sidebar: this.sidebar.visible,
      outline: this.outline.visible,
      sidebar_width: this.sideW,
      outline_width: this.outW,
      ui: this.uiOverrides,
      recent_commands: this.recentCommands,
      ...(this.remoteServer ? { remote_server: this.remoteServer } : {}),
    };
    saveSession(this.loc.root, s);
  }

  /** Buffers with unsaved changes. */
  dirtyBuffers(): NoteBuffer[] {
    return [...this.buffers.values()].filter((b) => b.dirty);
  }

  /** Quit, unless something is unsaved (`app.quit`; `:q!` quits anyway). */
  requestQuit(force = false): void {
    for (const v of this.allViews()) if (v.insert) stopInsert(this, v);
    const dirty = this.dirtyBuffers();
    if (dirty.length && !force) {
      return this.message("warn", `unsaved changes in ${dirty.map((b) => this.displayName(b)).join(", ")} — :w saves, :q! quits without saving`);
    }
    this.quit();
  }

  /**
   * Save a buffer (`:w`, ctrl+s): its text, with its BOM and line endings, through writeBuffer. If
   * the file changed on disk since it was loaded, not blindly: after (K)eep yours it asks first;
   * otherwise the conflict prompt decides.
   */
  saveBuffer(buf: NoteBuffer, quiet = false): boolean {
    if (buf.invalidUtf8) {
      this.message("error", `${buf.key} isn't valid UTF-8 — not saving over it`);
      return false;
    }
    if (buf.changedOnDisk() && !buf.deleted) {
      if (quiet) return false;
      if (buf.conflictKept) this.confirmOverwrite(buf);
      else this.conflictPrompt(buf);
      return false;
    }
    return this.writeBuffer(buf, buf.contentToSave(), true);
  }

  /** After (K)eep yours: a save asks before writing over the file's other version. */
  private confirmOverwrite(buf: NoteBuffer): void {
    this.openList({
      title: `${this.displayName(buf)} changed on disk — write yours over it?`,
      filterable: false,
      items: [
        { label: "(y) Yes, write mine over it", hotkey: "y", data: "y" },
        { label: "(n) No, keep both as they are", hotkey: "n", data: "n" },
        { label: "(d) Show the differences first", hotkey: "d", data: "d" },
      ],
      accept: (item) => {
        if (item.data === "y" && this.writeBuffer(buf, buf.contentToSave(), true)) this.message("info", `saved ${this.displayName(buf)} over the file on disk`);
        else if (item.data === "d") this.showDiff(buf, () => this.confirmOverwrite(buf));
      },
    });
  }

  /**
   * The conflict prompt (5.5): a note with unsaved changes changed on disk. (L)oad theirs — yours
   * stays one `u` away; (K)eep yours — autosave off, and saving asks first; (D)iff; (M)erge the two
   * against the version you started from, marking what both changed.
   */
  conflictPrompt(buf: NoteBuffer): void {
    if (this.overlay) {
      this.message("warn", `${this.displayName(buf)} changed on disk while you have unsaved changes — space n c resolves it`);
      return;
    }
    for (const v of this.allViews()) if (v.insert && v.buf === buf) stopInsert(this, v);
    const name = this.displayName(buf);
    this.openList({
      title: `${name} changed on disk, and you have unsaved changes`,
      filterable: false,
      items: [
        { label: "(l) Load theirs", detail: "yours stays one u away", hotkey: "l", data: "l" },
        { label: "(k) Keep yours", detail: "autosave off; saving asks first", hotkey: "k", data: "k" },
        { label: "(d) Diff", detail: "yours → theirs", hotkey: "d", data: "d" },
        { label: "(m) Merge", detail: "both, conflicts marked", hotkey: "m", data: "m" },
      ],
      accept: (item) => this.resolveConflict(buf, item.data as string),
      cancel: () => {
        buf.conflictKept = true;
        this.message("warn", `${name}: keeping yours for now — space n c to resolve`);
      },
    });
  }

  resolveConflict(buf: NoteBuffer, choice: string): void {
    const name = this.displayName(buf);
    const views = this.allViews().filter((v) => v.buf === buf);
    if (choice === "l") {
      if (!buf.load()) return this.message("warn", `${buf.key} is gone from disk`);
      for (const v of views) v.layoutKey = "";
      return this.message("info", `loaded theirs — u brings yours back`);
    }
    if (choice === "k") {
      buf.conflictKept = true;
      return this.message("info", `keeping yours — autosave is off for ${name} until you save (it asks first)`);
    }
    let theirs: string;
    try {
      theirs = readText(buf.abs).text;
    } catch {
      return this.message("warn", `${buf.key} is gone from disk`);
    }
    if (choice === "d") return this.showDiff(buf, () => this.conflictPrompt(buf), theirs);
    // Merge: base (as loaded), yours, theirs. The result is an undo step; the file is theirs now.
    const r = merge3(buf.baseText, buf.source, theirs);
    buf.edit(0, buf.source.length, r.text);
    buf.rebase(theirs);
    for (const v of views) v.layoutKey = "";
    this.message(r.conflicts ? "warn" : "info", r.conflicts ? `merged — ${r.conflicts} conflict${r.conflicts === 1 ? "" : "s"} marked <<<<<<< yours … >>>>>>> theirs; unsaved` : "merged cleanly — unsaved; :w writes it");
  }

  /** Yours → theirs as a read-only list; closing it goes back to where it came from. */
  showDiff(buf: NoteBuffer, back: () => void, theirs?: string): void {
    let disk = theirs;
    if (disk === undefined) {
      try {
        disk = readText(buf.abs).text;
      } catch {
        return this.message("warn", `${buf.key} is gone from disk`);
      }
    }
    const lines = unifiedDiff(buf.source, disk);
    this.openList({
      title: `Diff — yours → theirs (${this.displayName(buf)})`,
      filterable: false,
      items: lines.length ? lines.map((l) => ({ label: sanitize(l), data: null })) : [{ label: "no differences", data: null }],
      accept: () => back(),
      cancel: () => back(),
    });
  }

  // Autosave (4.7): a changed note is saved after `editor.autosave_ms` with no key pressed.

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** (Re)start the idle clock, when something is unsaved. */
  scheduleAutosave(): void {
    const ms = this.config.editor.autosave_ms;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (!ms || this.quitting || !this.dirtyBuffers().length) return;
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.autosave();
      this.host.requestRender();
    }, ms);
    (this.autosaveTimer as { unref?: () => void }).unref?.();
  }

  /** Save what can be: not mid-insert, not after (K)eep yours, not over a changed file (the
   *  conflict prompt comes instead, 5.6), not while git holds its index lock (5.10). */
  autosave(): void {
    let later = false;
    for (const buf of this.dirtyBuffers()) {
      if (this.allViews().some((v) => v.buf === buf && v.insert) || this.gitIndexLocked()) {
        later = true;
        continue;
      }
      if (buf.conflictKept || buf.invalidUtf8 || buf.deleted) continue;
      if (buf.changedOnDisk()) {
        this.conflictPrompt(buf);
        continue;
      }
      if (this.writeBuffer(buf, buf.contentToSave(), true)) this.message("info", `autosaved ${this.displayName(buf)}`);
    }
    if (later) this.scheduleAutosave();
  }

  /** git is mid-commit (or mid-anything) in the vault's repository. Looked up each time: it runs
   *  only when an autosave is due, and a repository can appear. */
  private gitIndexLocked(): boolean {
    for (let d = this.loc.root; ; d = dirname(d)) {
      if (existsSync(join(d, ".git"))) return existsSync(join(d, ".git", "index.lock"));
      if (dirname(d) === d) return false;
    }
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.watcher?.close();
    this.saveState();
    this.host.quit();
  }
}

// ---------------------------------------------------------------------------------------------

/** Keys that run the same action share one which-key entry: `h left → Narrower`. */
function mergeSameAction(entries: { key: string; label: string; desc: string; group: boolean; spec: string | null }[]): { key: string; label: string; desc: string; group: boolean }[] {
  const out: { key: string; label: string; desc: string; group: boolean; spec: string | null }[] = [];
  for (const e of entries.sort((a, b) => Number(b.group) - Number(a.group) || a.key.localeCompare(b.key))) {
    const same = !e.group && e.spec ? out.find((o) => !o.group && o.spec === e.spec) : undefined;
    if (same) same.key = `${same.key} ${e.key}`;
    else out.push({ ...e });
  }
  // Within an entry, letters before named keys (`j down`, `q enter escape`); entries by first key.
  const order = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  for (const o of out) o.key = o.key.split(" ").sort(order).join(" ");
  out.sort((a, b) => Number(b.group) - Number(a.group) || order(a.key.split(" ")[0]!, b.key.split(" ")[0]!));
  return out.map(({ spec: _, ...rest }) => rest);
}

function fileStamp(path: string): number {
  try {
    return existsSync(path) ? statSync(path).mtimeMs : -1;
  } catch {
    return -1;
  }
}

function inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

const RECENT_MAX = 5;
/** The note keeps at least this many columns beside the side panes. */
const MIN_CONTENT = 24;
/** The rail: its border, then a button (a glyph with a space either side). */
export const RAIL_WIDTH = 4;

/** Wrapping off: how wide a note is laid out first, to find its natural width. */
const NOWRAP_PROBE = 2000;
const naturalWidths = new WeakMap<Layout, number>();

/**
 * The widest real row of a very wide layout: trailing spaces don't count, nor does a trailing run
 * of one repeated glyph (a rule, or the tail of a titled rule like `── ≡ properties ────`), nor
 * right-aligned decorations far out (a code block's language label).
 */
export function naturalWidth(layout: Layout): number {
  let max = 0;
  for (const line of layout.lines) {
    let col = 0;
    let end = 0;
    // The current run of one glyph: its glyph, where it started, and the end before it.
    let run = "";
    let runStart = 0;
    let before = 0;
    for (const span of line.spans) {
      for (const g of graphemes(span.text)) {
        const w = graphemeWidth(g);
        if (g.trim() && col < layout.width * 0.75) {
          if (g !== run) {
            run = g;
            runStart = col;
            before = end;
          }
          end = col + w;
        }
        col += w;
      }
    }
    if (run && end - runStart > 20) end = before;
    max = Math.max(max, end);
  }
  return max;
}

export function refilter(o: ListOverlay): void {
  if (o.source) {
    o.filtered = o.source(o.input).map((item) => ({ item, positions: [] }));
  } else if (o.keepGroups && o.input.trim()) {
    // The matches in their original order, each under its group heading (with its blank row and
    // rule); a group with no match disappears, and the list never starts with a blank row.
    const ranked = rank(o.input, o.items.filter((i) => !i.header), (i) => (i.detail ? `${i.label} ${i.detail}` : i.label));
    const hit = new Map(ranked.map((r) => [r.item, r.match.positions]));
    o.filtered = [];
    let heading: ListItem[] = [];
    let prevHeader = false;
    for (const item of o.items) {
      if (item.header) {
        if (!prevHeader) heading = [];
        heading.push(item);
        prevHeader = true;
        continue;
      }
      prevHeader = false;
      if (!hit.has(item)) continue;
      for (const hd of heading) if (o.filtered.length || hd.label || hd.rule) o.filtered.push({ item: hd, positions: [] });
      heading = [];
      o.filtered.push({ item, positions: hit.get(item)! });
    }
  } else if (o.input.trim()) {
    const ranked = rank(o.input, o.items.filter((i) => !i.header), (i) => (i.detail ? `${i.label} ${i.detail}` : i.label));
    o.filtered = ranked.map((r) => ({ item: r.item, positions: r.match.positions }));
  } else {
    o.filtered = o.items.map((item) => ({ item, positions: [] }));
  }
  o.scroll = 0;
  o.wheeled = false;
  o.selected = selectable(o, 0, 1);
}

/** One entry up or down, skipping headings, wrapping around past the first or last entry. */
function step(o: ListOverlay, dir: number): number {
  const n = o.filtered.length;
  for (let k = o.selected + dir; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  for (let k = dir > 0 ? 0 : n - 1; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  return o.selected;
}

/** The nearest item at or after `i` (before, for dir -1) that is not a group heading. */
export function selectable(o: ListOverlay, i: number, dir: number): number {
  const n = o.filtered.length;
  for (let k = i; k >= 0 && k < n; k += dir) if (!o.filtered[k]!.item.header) return k;
  for (let k = i; k >= 0 && k < n; k -= dir) if (!o.filtered[k]!.item.header) return k;
  return 0;
}

/** Link index at a layout cell, or -1. */
/** The task whose checkbox glyph is at this cell, if any (its trailing space doesn't count). */
export function taskMarkAt(layout: Layout, row: number, col: number): { line: number; end: number; checked: boolean } | null {
  let x = 0;
  for (const s of layout.lines[row]?.spans ?? []) {
    const w = stringWidth(s.text);
    if (s.task && col >= x && col < x + stringWidth(s.text.trimEnd())) return s.task;
    x += w;
  }
  return null;
}

export function linkAt(layout: Layout, row: number, col: number): number {
  const line = layout.lines[row];
  if (!line) return -1;
  let x = 0;
  for (const s of line.spans) {
    const w = stringWidth(s.text);
    if (col >= x && col < x + w && s.link !== undefined) return s.link;
    x += w;
  }
  return -1;
}

/**
 * Text of a selection from `sel.anchor` to the cursor, inclusive, in reading order; rows joined
 * with newlines and trailing blanks trimmed. Line selections take whole rows.
 */
export function selectedText(layout: Layout, sel: Selection, cur: Pos): string {
  const [a, b] = ordered(sel.anchor, cur);
  const out: string[] = [];
  for (let r = a.row; r <= b.row; r++) {
    const cs = cells(layout.lines[r]);
    const from = sel.line || r !== a.row ? 0 : a.col;
    const to = sel.line || r !== b.row ? Number.POSITIVE_INFINITY : b.col;
    // A grapheme is selected when any of its cells is — so a wide character counts once.
    out.push(
      cs
        .filter((c) => c.x + c.w > from && c.x <= to)
        .map((c) => c.g)
        .join("")
        .replace(/\s+$/, ""),
    );
  }
  return out.join("\n");
}

export function computeFind(layout: Layout, query: string, current = 0, whole = false): FindState {
  const matches: FindState["matches"] = [];
  if (query) {
    // Match on the original text (never a lowercased copy, whose length can differ: "İ"), with
    // smart case: case-insensitive unless the query has an uppercase letter. Whole words: not
    // next to another letter, digit or underscore (in any script).
    const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = whole ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal;
    const re = new RegExp(source, /\p{Lu}/u.test(query) ? "gu" : "giu");
    layout.lines.forEach((line, row) => {
      const text = line.spans.map((s) => s.text).join("");
      for (const m of text.matchAll(re)) {
        if (!m[0]) break;
        matches.push({ row, col: stringWidth(text.slice(0, m.index)), len: stringWidth(m[0]) });
      }
    });
  }
  return { query, matches, current: Math.min(current, Math.max(0, matches.length - 1)), whole };
}
