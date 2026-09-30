// The TUI app model (plan 3.x; keymap in docs/design/keymap.md): tabs of one or two windows over
// shared buffers, a reading cursor with selection, the explorer and outline panes, overlays,
// history, link-following, find, the which-key popup, UI settings, live reload from the watcher
// (5.1–5.4), and live reload of the configuration itself.
//
// Notes are written only through writeBuffer (atomic, inside the vault, the watcher told); besides
// them, its own state (reading positions, session) and the scratch, through core.
//
// This module does not import OpenTUI. It draws through `Canvas` and talks to the terminal
// through `Host`; tui/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { commentLinks, grammarFor, grammarNow, parseSyntax, type Span as SyntaxSpan } from "../core/syntax.ts";
import { onLoaded } from "../core/lazy.ts";
import ignore from "ignore";
import { classify, extensionOf, type FileGroup, isKnownExtension } from "../core/filetypes.ts";
import { appendFileSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { readRegular, readText, realTarget, SMALL_FILE, WriteRefused, writeNote } from "../core/fsutil.ts";
import { toggleTask } from "../core/tasks.ts";
import { merge3, unifiedDiff } from "../core/merge.ts";
import { compilePattern, findAll } from "../core/replace.ts";
import { writeDirty } from "../core/stale.ts";
import { editorArgv } from "../core/editor.ts";
import { insertKey, insertText, offsetOf, startInsert, stopInsert } from "./editing.ts";
import { insertRecord, newVimState, PASTE, put, vimKey, visualKey } from "./vim.ts";
import * as R from "./replacing.ts";
import type { ReplaceState } from "./replacing.ts";
import { type Block, blockAt, blockRanges, composeLive } from "../core/layout/live.ts";
import { discoverNvims, NVIM_REMOTE, type NvimServer, probeNvim } from "../core/nvim.ts";
import { homedir } from "node:os";
import { appendScratch, scratchLocation } from "../core/capture.ts";
import { copyText, readClipboard } from "../core/clipboard.ts";
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
import { applyColorOverrides, listThemes, loadTheme, type Theme } from "../core/theme/index.ts";
import { Reach } from "../core/reach.ts";
import { type VaultLocation, vaultConfigPath } from "../core/vault.ts";
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
  /** Whole words only (`*` / `#`, `alt+w`): not inside a longer word. */
  whole?: boolean;
  /** A regular expression (`alt+r`), not plain text. */
  regex?: boolean;
  /** Why the regex isn't one, when it isn't. */
  error?: string;
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
  /** The text version the cursor's anchor was last re-derived at (layoutFor). */
  anchorVersion?: number;
  /** The last selection's source lines, 1-based: `:'<,'>s` works on them. */
  visualLines?: [number, number];
  /** Source-based positions, which survive re-layout (decision 3.5). */
  topAnchor: Anchor;
  /** Which of the top anchor's line's rows is the top (a wrapped line has several): 0, the first. */
  topSub?: number;
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
  /** Live preview (4.14): rendered, with the cursor's block as its markdown, editable in place. */
  live?: boolean;
  /** Live preview's render and blocks, kept while the cursor's block is being typed into. */
  liveBase?: LiveBase;
  /** The lens's size set by hand (`+` `-`, in rows), kept as it moves; `=` lets it size itself. */
  lensSize?: number;
  /** A `+` or `-` waiting for the next layout (which has the lens's blocks). */
  lensStep?: 1 | -1;
  /** Where the lens sits on screen (rows from the window's top to its top rule), kept as it moves. */
  lensPin?: { range: string; screen: number };
  /** A click moved the cursor: the screen row it was on, which the clicked line keeps. */
  lensClick?: number;
  /** An oversized lens's inner scroll: the first of its rows shown (4.15). */
  lensInner?: number;
  /** The find row's toggles, kept for the window's next search: regex, whole words. */
  findOpts?: { regex: boolean; whole: boolean };
  /** Typing into the text (insert mode); in source mode or live preview. */
  insert?: boolean;
  /** Where the current insert began (moved by arrow keys): ctrl+u and ctrl+w stop there first. */
  insertFrom?: number;
}

/** What live preview composes from: a render, the blocks of its parse, and which one is active. */
export interface LiveBase {
  rendered: Layout;
  width: number;
  wrap: boolean;
  /** The buffer version the render was made from, and the one the block was last matched to. */
  renderedVersion: number;
  version: number;
  blocks: Block[];
  /** The active block in the render's numbering, and now (grown or shrunk by typing). */
  old: Block;
  active: Block;
  /** The text around the block when the render was made: typing must leave it alone. */
  before: string;
  after: string;
  lineCount: number;
  composed?: { key: string; layout: Layout };
}

/** A window whose text can be edited: source mode or live preview. */
/** Where to log each command run, for the terminal tests' coverage: `SLIPBOX_TRACE`. */
const TRACE = process.env.SLIPBOX_TRACE;

export function editable(view: View | null | undefined): boolean {
  return !!view && (!!view.source || !!view.live);
}

export interface Tab {
  views: View[];
  active: number;
  orientation: "side" | "stacked";
  /** Share of the width (side by side) or height (stacked) given to the first window. */
  ratio: number;
  /** Pinned: kept at the left with the other pinned tabs, skipped by close others / close all, and
   *  its note stays — what would open over it opens in a new tab. */
  pinned?: boolean;
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
  /** Find's prompt: typed in that window's own find row, not on the bottom line. */
  view?: View;
  /** Find's replace field, when open (ctrl+h, space f r; tab from the find field). */
  replace?: ReplaceState;
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
  /** The explorer's toggle (`a`): every text file, whatever `files.show` says. */
  allFiles?: boolean;
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
  /** "note": a row the explorer opens — a note, or a data or text file (`group` says which). */
  kind: "dir" | "note";
  path: string;
  name: string;
  depth: number;
  /** A file beyond notes: its group (16.x). */
  group?: FileGroup;
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
  breadcrumb: boolean;
  top_bar: boolean;
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
    breadcrumb: c.ui.breadcrumb,
    top_bar: c.ui.top_bar,
    // "auto": URLs where colour can't mark links (NO_COLOR), as in `slipbox render`.
    urls: c.render.show_urls === "always" || (c.render.show_urls === "auto" && !!process.env.NO_COLOR),
    theme: c.theme,
    glyphs: c.render.glyphs,
  };
}

const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 500;
/** Floating messages at once; older ones stay in the messages list. */
const TOAST_LIMIT = 4;

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
  /** The messages showing as floating boxes, newest first (each for 4 s, 8 s an error). */
  toasts: Message[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** The newest message still showing. */
  get transient(): Message | null {
    return this.toasts[0] ?? null;
  }
  width = 80;
  height = 24;
  geometry: Geometry | null = null;
  /** Id of the clickable region under the mouse, for hover highlighting. */
  hover: string | null = null;
  positions: PositionStore;
  /** Other vaults, reached by `[[vault:note]]`, paths out of this root, and their backlinks. */
  reach: Reach;
  watcher: VaultWatcher | null = null;
  ui: UiState;
  private drawFailed = false;

  /** Commands run from the palette or help, most recent first (kept in the session). */
  recentCommands: string[] = [];

  /** UI settings changed in this session, with the config value each overrode. */
  uiOverrides: Record<string, UiOverride> = {};
  private tree: TreeRow[] | null = null;
  private readonly configFile: string | undefined;
  private readonly configLastGood = new Map<string, Record<string, unknown>>();
  private configStamps = new Map<string, number>();
  readonly now: () => number;
  quitting = false;
  indexing = 0;

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.config = opts.config;
    this.graph = opts.graph;
    this.reach = new Reach(opts.loc);
    this.graph.reach ??= this.reach;
    this.host = opts.host;
    this.configFile = opts.configFile;
    // Each config file's last good contents, so a typo saved mid-edit keeps what it said (reload).
    loadConfig({ vaultFile: vaultConfigPath(opts.loc), configFile: opts.configFile, lastGood: this.configLastGood });
    this.now = opts.now ?? Date.now;
    this.ui = uiDefaults(opts.config);
    if (opts.themeName) this.ui.theme = opts.themeName;
    if (process.env.NO_COLOR) this.ui.theme = "mono";
    this.sidebar = { visible: opts.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.sideW = opts.config.ui.sidebar_width;
    this.outW = opts.config.ui.outline_width;
    this.outline = { visible: opts.config.ui.outline, overlay: false, selected: 0, scroll: 0, folded: new Set(), forKey: "" };
    this.positions = new PositionStore(this.loc);
    registerActions(this);
    this.applyKeys();
    for (const w of opts.warnings ?? []) this.message("warn", w);
    for (const e of this.graph.errors) this.message("warn", e);

    this.recentCommands = (loadSession(this.loc)?.recent_commands ?? []).filter((id) => typeof id === "string").slice(0, RECENT_MAX);
    this.remoteServer = loadSession(this.loc)?.remote_server;
    this.recentNotes = (loadSession(this.loc)?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
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
    // A grammar (or anything lazy) that finished loading: lay out again and draw.
    this.stopLazy = onLoaded(() => {
      this.graph.grammarsChanged(); // code files' comment links can be read now (16.10)
      this.relayoutAll();
      this.host.requestRender();
    });
    this.publishState();
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
    // The leader: a real key, and not one already bound on its own (it would wait before acting).
    let leader = canonKey(c.input.leader || "space");
    if (unknownModifiers(leader).length) {
      this.message("warn", `config: input.leader "${c.input.leader}" isn't a key slipbox knows; using space`);
      leader = "space";
    } else if (leader !== "space" && DEFAULT_KEYS[leader] !== undefined) {
      this.message("warn", `config: input.leader "${c.input.leader}" is also ${DEFAULT_KEYS[leader]}: that key now waits for more`);
    }
    this.leader = leader;
    const { visual, explorer, outline, resize, source, ...normal } = c.keys;
    this.keymap = new Keymap(DEFAULT_KEYS, normal as Record<string, string>, this.leader);
    this.visualKeys = new Keymap(DEFAULT_VISUAL_KEYS, visual ?? {}, this.leader);
    this.sourceKeys = new Keymap(DEFAULT_SOURCE_KEYS, source ?? {}, this.leader);
    this.explorerKeys = new Keymap(DEFAULT_EXPLORER_KEYS, explorer ?? {}, this.leader);
    this.outlineKeys = new Keymap(DEFAULT_OUTLINE_KEYS, outline ?? {}, this.leader);
    this.resizeKeys = new Keymap(DEFAULT_RESIZE_KEYS, resize ?? {}, this.leader);
    // No prototype: a typed :toString or :constructor is an unknown alias, not Object's.
    this.aliases = Object.assign(Object.create(null) as Record<string, string>, DEFAULT_ALIASES);
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
    const vaultFile = vaultConfigPath(this.loc);
    if (vaultFile) files.push(vaultFile);
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
    const loaded = loadConfig({ vaultFile: vaultConfigPath(this.loc), configFile: this.configFile, lastGood: this.configLastGood });
    this.clearPending(); // a sequence begun under the old keys means nothing under the new ones
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
      this.graph.reach = this.reach;
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
    // The same message again (a key held down) refreshes its box rather than stacking another.
    this.toasts = [m, ...this.toasts.filter((t) => t.text !== text || t.level !== level)].slice(0, TOAST_LIMIT);
    this.scheduleToasts();
  }

  /** How long a message shows. */
  private toastMs(m: Message): number {
    return m.level === "error" ? 8000 : 4000;
  }

  /** Drop the messages whose time is up, and wake again when the next one's is. */
  private scheduleToasts(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    const now = this.now();
    this.toasts = this.toasts.filter((t) => t.at + this.toastMs(t) > now);
    if (!this.toasts.length) return;
    const next = Math.min(...this.toasts.map((t) => t.at + this.toastMs(t))) - now;
    this.toastTimer = setTimeout(
      () => {
        this.scheduleToasts();
        this.host.requestRender();
      },
      Math.max(10, next),
    );
    (this.toastTimer as { unref?: () => void }).unref?.();
  }

  /** Clear the floating messages (a click on one opens the messages list; they're all there). */
  dismissToasts(): void {
    this.toasts = [];
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
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
      // Inside the vault, a note or any file the walk saw has its vault path (the watcher, saves).
      const known = inside && (this.graph.notes.has(relRaw) || this.graph.filePaths().includes(relRaw));
      const rel = known ? relRaw : null;
      const kind = classify(abs, this.config.walk.extensions);
      if (kind.group === "binary") {
        this.message("warn", `${relRaw || abs} is a binary file; slipbox opens text`);
        return null;
      }
      buf = new NoteBuffer(rel, abs, key);
      buf.kind = kind;
      if (!buf.load()) {
        this.message("error", `cannot read ${pathOrRel}`);
        return null;
      }
      // Named like text, holding binary bytes (a NUL early on, as git decides): not opened.
      if (kind.group !== "note" && buf.source.slice(0, 8192).includes("\u0000")) {
        this.message("warn", `${buf.key} holds binary bytes; slipbox opens text`);
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
      // A data or text file opens in source mode (16.4); data files render once they can (16.11).
      ...(this.canRender(buf) ? {} : (this.saySourceWhy(buf), { source: true })),
    };
  }

  /**
   * A source file's tree-sitter pass (16.7–16.9), kept current: at once the first time, then
   * 150 ms after edits stop (a big file's parse takes tens of milliseconds, never paid per key).
   * The grammar loads lazily; until it lands, highlight.js colours alone.
   */
  ensureSyntax(buf: NoteBuffer): void {
    if (buf.kind.group !== "text" || buf.syntax?.version === buf.version || this.syntaxTimers.has(buf)) return;
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    const loaded = g ? grammarNow(g) : null;
    if (!loaded) return; // loading: onLoaded draws again, and this runs then
    const run = () => {
      this.syntaxTimers.delete(buf);
      const tree = parseSyntax(loaded, buf.source);
      if (!tree) return;
      const spans = new Map<number, SyntaxSpan[]>();
      for (const s of tree.spans()) spans.set(s.line, [...(spans.get(s.line) ?? []), s]);
      // Links in its comments (16.10): URLs, and paths that name a file of the vault.
      const rel = buf.rel;
      const links = commentLinks(tree.comments()).filter((l) => l.url || (rel && this.graph.commentPath(l.target, rel)));
      buf.syntax = { version: buf.version, spans, outline: tree.outline(), errors: tree.errors(), links };
      tree.tree.delete();
      buf.invalidateLayouts();
      for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
      this.host.requestRender();
    };
    const t = setTimeout(run, buf.syntax ? 150 : 0);
    (t as { unref?: () => void }).unref?.();
    this.syntaxTimers.set(buf, t);
  }

  private readonly syntaxTimers = new Map<NoteBuffer, ReturnType<typeof setTimeout>>();
  private stopLazy: (() => void) | null = null;

  /** Whether a file has a rendered view: markdown notes do, data files while they parse
   *  (16.11–16.14), text files never. */
  canRender(buf: NoteBuffer): boolean {
    if (buf.kind.group === "data") return !buf.parsed.error;
    return buf.kind.group === "note"; // every note format has a reader (16.2)
  }

  /** Notes and files most recently shown, newest first (the switcher lists them first). */
  recentNotes: string[] = [];

  /** A note was shown in a window: it's the most recent now. */
  touchRecent(key: string): void {
    this.recentNotes = [key, ...this.recentNotes.filter((k) => k !== key)].slice(0, RECENT_NOTES_MAX);
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    const buf = this.buffer(path);
    if (!buf) return;
    this.touchRecent(buf.key);
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
    // A pinned tab keeps its note: another one opens in a new tab.
    if (buf !== view.buf && this.tabs.find((t) => t.views.includes(view))?.pinned) return this.openInNewTab(path, anchor);
    this.touchRecent(buf.key);
    this.pushHistory(view);
    if (buf === view.buf && anchor) {
      this.jumpTo(view, anchor);
      return;
    }
    this.remember(view);
    const before = view.buf;
    Object.assign(view, this.makeView(buf, anchor), { back: view.back, fwd: [] });
    this.fitMode(view, before);
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
    view.topSub = 0;
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
    const before = view.buf;
    this.touchRecent(buf.key);
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
    this.fitMode(view, before);
    this.revealInSidebar();
  }

  /**
   * After a window changes file: one with no render goes to source mode; a window that was only in
   * source mode for such a file (from `before`) renders again for one that can.
   */
  /** A data file that opens in source mode because it doesn't parse (16.14): the error said. */
  private saySourceWhy(buf: NoteBuffer): void {
    const error = buf.kind.group === "data" ? buf.parsed.error : null;
    if (error) this.message("warn", `${buf.name} doesn't parse — ${error}: source mode`);
  }

  fitMode(view: View, before: NoteBuffer): void {
    const forced = !this.canRender(before);
    if (!this.canRender(view.buf)) {
      const was = view.source; // already so from makeView, which said why
      Object.assign(view, { source: true, live: false, liveBase: undefined });
      if (!was) this.saySourceWhy(view.buf);
    } else if (forced) Object.assign(view, { source: false, live: false, liveBase: undefined });
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
    // A data file that stopped parsing (16.14) goes to source mode, the error said — when insert
    // mode ends, never mid-typing (an open quote is normal while a value is typed).
    if (!view.source && !view.insert && !this.canRender(view.buf)) {
      const error = view.buf.kind.group === "data" ? view.buf.parsed.error : null;
      Object.assign(view, { source: true, live: false, liveBase: undefined, layoutKey: "" });
      if (error) this.message("warn", `${view.buf.name} doesn't parse — ${error}: source mode`);
    }
    // Source mode: the whole text column (no readable width), less one for a cursor after a full
    // row's end; unwrapped, as long as the longest line.
    const width = view.source
      ? Math.max(10, paneWidth - gutter - 2)
      : this.ui.wrap
        ? this.textWidth(paneWidth, gutter)
        : this.nowrapWidth(view, paneWidth, gutter);
    if (view.source) this.ensureSyntax(view.buf);
    const layout = view.source
      ? view.buf.sourceLayout(width, this.ui.wrap, this.glyphs)
      : view.live
        ? this.liveLayout(view, width)
        : view.buf.layout(width, this.glyphs, this.ui.urls, view.buf.rel ? this.graph : null);
    const block = view.live && view.liveBase ? `${view.liveBase.active[0]}-${view.liveBase.active[1]}` : "";
    const key = `${view.source ? "s" : view.live ? "l" : "r"}${block}:${width}:${this.glyphs.mode}:${this.ui.urls}:${layout.lines.length}:${view.buf.version}:${view.height}`;
    if (view.layoutKey !== key) {
      view.layoutKey = key;
      view.cur = this.cursorFromAnchor(layout, view.curAnchor);
      // Re-derive the anchor from where the cursor landed, so its fallback line tracks the file:
      // after an insertion above, a later removal of the heading must not use a stale line. Only
      // when the text changed: a re-wrap alone can leave no row starting on the anchor's line (the
      // paragraph reflowed), and the next row's line would then replace the true one for good.
      if (view.anchorVersion !== view.buf.version) {
        view.curAnchor = { ...this.cursorAnchorFor(layout, view.cur), col: view.curAnchor.col };
        view.anchorVersion = view.buf.version;
      }
      view.top = this.clampTop(view, layout, this.rowFromAnchor(layout, view.topAnchor, view.topSub ?? 0));
      this.ensureCursorVisible(view, layout);
      if (view.find) view.find = computeFind(layout, view.find.query, view.find.current, view.find.whole, view.find.regex);
      if (view.sel) view.sel.anchor = view.sel.src ? this.cursorFromAnchor(layout, view.sel.src) : clampPos(layout, view.sel.anchor);
    }
    if (view.live && view.liveBase) this.pinLens(view, layout);
    return layout;
  }

  /**
   * The lens keeps its height on screen: when it moves or grows, the page scrolls under it. While it
   * stays the same, wherever it is now (the wheel, the cursor) is where it's kept.
   */
  private pinLens(view: View, layout: Layout): void {
    const top = layout.lines.findIndex((l) => l.lens === "top");
    if (top < 0) return;
    const range = `${view.liveBase!.active[0]}-${view.liveBase!.active[1]}`;
    const hidden = this.lensHidden(view, layout);
    const pin = view.lensPin;
    if (!pin) {
      view.lensPin = { range, screen: this.visibleBetween(layout, hidden, view.top, top) };
      return;
    }
    const click = view.lensClick;
    view.lensClick = undefined;
    if (pin.range !== range) {
      pin.range = range;
      // A click: the clicked line stays under the pointer. The keyboard: the lens stays put.
      view.top = this.clampTop(view, layout, click !== undefined ? this.stepVisible(layout, hidden, view.cur.row, -click) : this.stepVisible(layout, hidden, top, -pin.screen));
      this.anchorTop(view, layout);
      this.ensureCursorVisible(view, layout);
    }
    pin.screen = this.visibleBetween(layout, hidden, view.top, top);
  }

  /**
   * The lens (live preview, 4.14): the render, with whole blocks around the cursor's line as their
   * markdown between two rules. It opens on the cursor's block, grown by its neighbours to
   * `lens_min_rows`; the cursor reaching past an edge brings the next block in, dropping the far
   * ones past `lens_max` of the window; a jump moves it to the block landed on. While it's typed
   * into, the render around it is reused (no re-parse); leaving insert mode, or an edit reaching
   * outside it, lays the note out afresh.
   */
  private liveLayout(view: View, width: number): Layout {
    const buf = view.buf;
    const line = Math.max(1, view.curAnchor.anchor.line || 1);
    const wrap = this.ui.wrap;
    const starts = buf.lineStarts();
    const lineCount = Math.max(1, starts.length - (buf.source.endsWith("\n") && starts.length > 1 ? 1 : 0));
    const texts = buf.lines();
    // Rows a run of lines takes in the lens (wrapped at the width).
    const rowsOf = (s: number, e: number) => {
      let n = 0;
      for (let k = s; k <= e; k++) n += wrap ? Math.max(1, Math.ceil(stringWidth(texts[k - 1] ?? "") / Math.max(1, width))) : 1;
      return n;
    };
    // A data file's blocks are cards (a key and its values, 16.12): the lens is the cursor's card,
    // never padded with pieces of its neighbours, and it moves to the next card rather than
    // gathering them.
    // A CSV or TSV is rows: the lens is a few of them around the cursor, sliding a row at a time.
    const rows = buf.kind.format === "csv" || buf.kind.format === "tsv";
    const cards = buf.kind.group === "data" && !rows;
    // A size set by hand (`+` `-`) is the lens's size wherever it goes, until `=`.
    const minRows = view.lensSize ?? (cards ? 1 : this.config.editor.lens_min_rows);
    const maxRows = view.lensSize !== undefined || rows ? minRows : Math.max(minRows, Math.floor(Math.max(1, view.height) * this.config.editor.lens_max));
    // The lens on the cursor's block, grown by its neighbours (below, then above) to the minimum.
    const openOn = (blocks: Block[], at: number): Block => {
      const i = blocks.findIndex((b) => at >= b[0] && at <= b[1]);
      let lo = i < 0 ? blocks.length - 1 : i;
      let hi = lo;
      // A neighbour comes in only if the lens still fits its maximum with it: a small block next to
      // a huge one stays small rather than swallowing it.
      const fits = (a: number, b: number) => rowsOf(blocks[a]![0], blocks[b]![1]) <= maxRows;
      let below = true;
      let above = true;
      while (rowsOf(blocks[lo]![0], blocks[hi]![1]) < minRows && (below || above)) {
        below = hi + 1 < blocks.length && fits(lo, hi + 1);
        if (below) hi++;
        if (rowsOf(blocks[lo]![0], blocks[hi]![1]) >= minRows) break;
        above = lo > 0 && fits(lo - 1, hi);
        if (above) lo--;
      }
      return [blocks[lo]![0], blocks[hi]![1]];
    };
    // The cursor past an edge: the blocks up to its one come in; far ones go past the maximum.
    const follow = (blocks: Block[], range: Block, at: number): Block => {
      if (at >= range[0] && at <= range[1]) return range;
      if (cards) return openOn(blocks, at);
      let lo = blocks.findIndex((b) => b[0] === range[0]);
      let hi = blocks.findIndex((b) => b[1] === range[1]);
      const i = blocks.findIndex((b) => at >= b[0] && at <= b[1]);
      if (lo < 0 || hi < 0 || i < 0 || i > hi + 1 || i < lo - 1) return openOn(blocks, at); // a jump
      if (i > hi) hi = i;
      else lo = i;
      while (rowsOf(blocks[lo]![0], blocks[hi]![1]) > maxRows && lo < hi) {
        if (i === hi) lo++;
        else hi--;
      }
      return [blocks[lo]![0], blocks[hi]![1]];
    };
    const around = (range: Block) => ({
      before: buf.source.slice(0, starts[range[0] - 1] ?? 0),
      after: buf.source.slice(starts[range[1]] ?? buf.source.length),
    });
    const fresh = (prev?: Block): LiveBase => {
      const rendered = buf.layout(width, this.glyphs, this.ui.urls, buf.rel ? this.graph : null);
      const blocks = blockRanges(buf.parsed.tree, lineCount);
      // After an edit, the lens keeps covering the lines it did (snapped to whole blocks).
      let range: Block;
      if (prev) {
        const s = blockAt(blocks, Math.min(prev[0], lineCount));
        const e = blockAt(blocks, Math.min(Math.max(prev[0], prev[1]), lineCount));
        range = follow(blocks, [s[0], e[1]], Math.min(line, lineCount));
      } else range = openOn(blocks, Math.min(line, lineCount));
      return { rendered, width, wrap, renderedVersion: buf.version, version: buf.version, blocks, old: range, active: range, ...around(range), lineCount };
    };
    let base = view.liveBase;
    if (!base || base.width !== width || base.wrap !== wrap) base = fresh();
    else if (buf.version !== base.version) {
      // Typed into the lens, the rest untouched: the same render, the lens longer or shorter.
      // …and the line break that ends the lens survived (a delete at its last line's end joins the
      // line below into it: that's an edit across the edge, not inside).
      const edgeKept = !base.after || buf.source[buf.source.length - base.after.length - 1] === "\n";
      const untouched = buf.source.startsWith(base.before) && buf.source.endsWith(base.after) && buf.source.length >= base.before.length + base.after.length && edgeKept;
      const grew = lineCount - base.lineCount;
      const active: Block = [base.active[0], Math.max(base.active[0], base.active[1] + grew)];
      if (view.insert && untouched) base = { ...base, version: buf.version, active, lineCount, composed: undefined };
      // Your own edit (typing across an edge, dd, a replace inside it): the lens keeps its lines,
      // grown or shrunk by it, and typing extends it to wherever the cursor goes (below). A change
      // from elsewhere while you're not typing (an agent's, a :%s) says nothing about where the
      // lens should be: it opens on the cursor's block again, the size it would open at.
      else base = view.insert || untouched ? fresh(active) : fresh();
    } else if (line < base.active[0] || line > base.active[1]) {
      if (base.renderedVersion === buf.version) {
        const range = follow(base.blocks, base.active, line);
        base = { ...base, old: range, active: range, ...around(range), composed: undefined };
      } else base = fresh(view.insert ? [Math.min(base.active[0], line), Math.max(base.active[1], line)] : base.active); // typing never sits outside it
    }
    if (!view.insert && base.renderedVersion !== buf.version) base = fresh(base.active);
    // `+` / `-`: a block more (below, or above at the note's end), or the one farthest from the
    // cursor less; the size it comes to is kept.
    const step = view.lensStep;
    view.lensStep = undefined;
    if (step && base.renderedVersion === buf.version) {
      const bl = base.blocks;
      let lo = bl.findIndex((b) => b[0] === base!.active[0]);
      let hi = bl.findIndex((b) => b[1] === base!.active[1]);
      if (lo >= 0 && hi >= 0) {
        const at = bl.findIndex((b) => line >= b[0] && line <= b[1]);
        if (step > 0) {
          if (hi + 1 < bl.length) hi++;
          else if (lo > 0) lo--;
          else this.message("info", "the lens holds the whole note");
        } else if (lo < hi) {
          if (at - lo >= hi - at) lo++;
          else hi--;
        } else this.message("info", "the lens is one block — esc closes it");
        const range: Block = [bl[lo]![0], bl[hi]![1]];
        view.lensSize = rowsOf(range[0], range[1]);
        base = { ...base, old: range, active: range, ...around(range), composed: undefined };
      }
    }
    view.liveBase = base;
    const editing = !!view.insert;
    const key = `${base.active[0]}-${base.active[1]}:${buf.version}:${base.renderedVersion}:${editing ? "e" : "v"}`;
    if (base.composed?.key === key) return base.composed.layout;
    const layout = composeLive(base.rendered, base.old, base.active, texts, { width, wrap, rule: this.glyphs.lensRule, editing });
    base.composed = { key, layout };
    return layout;
  }

  currentLayout(view: View): Layout {
    return this.layoutFor(view, view.width, this.gutterWidth(view));
  }

  /** Source line-number gutter width for a view (0 when line numbers are off). */
  gutterWidth(view: View): number {
    if (!this.ui.line_numbers) return 0;
    return String(view.buf.lineStarts().length).length + 1;
  }

  /** The view's top, remembered as its source line and the row within it: a re-layout (a resize, a
   *  reload) brings back the same row of a wrapped paragraph or a table, not the block's first. */
  private anchorTop(view: View, layout: Layout): void {
    const c = this.cursorAnchorFor(layout, { row: view.top, col: 0 });
    view.topAnchor = c.anchor;
    view.topSub = c.sub;
  }

  /** The row `sub` rows into the line an anchor names (as far as that line has rows). */
  private rowFromAnchor(layout: Layout, anchor: Anchor, sub: number): number {
    const first = rowFor(layout, anchor);
    const src = layout.lines[first]?.src;
    let row = first;
    for (let k = 0; k < sub && layout.lines[row + 1]?.src === src; k++) row++;
    return row;
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
    this.setViewMode(view, on ? "source" : "rendered");
  }

  /** A window's mode: rendered, source (the markdown), or live preview. The cursor keeps its line. */
  setViewMode(view: View, mode: "rendered" | "source" | "live"): void {
    const now = view.source ? "source" : view.live ? "live" : "rendered";
    if (now === mode) return;
    if (mode !== "source" && !this.canRender(view.buf)) {
      const why = view.buf.kind.group === "data" ? `doesn't parse — ${view.buf.parsed.error}` : view.buf.kind.group === "text" ? "has no rendered view" : "has no rendered view yet";
      return this.message(view.buf.kind.group === "data" ? "warn" : "info", `${view.buf.name} ${why}: source mode`);
    }
    if (view.insert) stopInsert(this, view);
    this.remember(view);
    view.source = mode === "source";
    view.live = mode === "live";
    view.liveBase = undefined;
    view.lensSize = undefined; // a lens opened again sizes itself
    view.lensPin = undefined;
    view.lensInner = 0;
    view.layoutKey = ""; // re-derive the rows from the anchors: the same source line
    view.sel = null;
    view.visual = null;
  }

  /** The mode the editing keys switch a rendered window to (`[editor] edit_in`). */
  editMode(): "source" | "live" {
    return this.config.editor.edit_in === "live" ? "live" : "source";
  }

  private cursorAnchorFor(layout: Layout, p: Pos): CursorAnchor {
    const src = layout.lines[p.row]?.src;
    let sub = 0;
    while (p.row - sub - 1 >= 0 && layout.lines[p.row - sub - 1]?.src === src) sub++;
    return { anchor: anchorAt(layout, p.row - sub), sub, col: p.col };
  }

  private clampTop(view: View, layout: Layout, top: number): number {
    const hidden = this.lensHidden(view, layout);
    if (!hidden.length) {
      const max = Math.max(0, layout.lines.length - Math.max(1, view.height));
      return Math.max(0, Math.min(top, max));
    }
    // The last screenful starts `height` visible rows before the end; never on a hidden row.
    const max = this.stepVisible(layout, hidden, layout.lines.length, -Math.max(1, view.height));
    let t = Math.max(0, Math.min(top, max));
    while (isHidden(hidden, t) && t < layout.lines.length - 1) t++;
    return t;
  }

  // The lens's inner window (4.15): a lens taller than `lens_max` of the window shows that many of
  // its rows, scrolled to keep the cursor in; the rest of its rows stay in the layout (so motions,
  // find and editing see them) but aren't drawn. These helpers map screen rows to layout rows
  // around them — the drawing, clicks, drags and scrolling go through them.

  /** Rows the lens may show at once. */
  lensRows(view: View): number {
    return Math.max(this.config.editor.lens_min_rows, Math.floor(Math.max(1, view.height) * this.config.editor.lens_max));
  }

  /** The lens's rows left out of the drawing: above its inner window and below it ([a, b) each). */
  lensHidden(view: View, layout: Layout): [number, number][] {
    if (!view.live) return [];
    const first = layout.lines.findIndex((l) => l.lens === "source");
    if (first < 0) return [];
    let n = 0;
    while (layout.lines[first + n]?.lens === "source") n++;
    const max = this.lensRows(view);
    if (n <= max) {
      view.lensInner = 0;
      return [];
    }
    const inner = Math.max(0, Math.min(view.lensInner ?? 0, n - max));
    view.lensInner = inner;
    const out: [number, number][] = [];
    if (inner > 0) out.push([first, first + inner]);
    if (inner + max < n) out.push([first + inner + max, first + n]);
    return out;
  }

  /** From `row`, `n` shown rows on (back when negative), skipping hidden ones; within the layout. */
  stepVisible(layout: Layout, hidden: [number, number][], row: number, n: number): number {
    let r = row;
    let k = Math.abs(n);
    const dir = n < 0 ? -1 : 1;
    while (k > 0) {
      const next = r + dir;
      if (next < 0 || next > layout.lines.length) break;
      r = next;
      if (r < layout.lines.length && !isHidden(hidden, r)) k--;
    }
    return Math.max(0, Math.min(r, Math.max(0, layout.lines.length - 1)));
  }

  /** The layout rows a window shows, top to bottom. */
  screenRows(view: View, layout: Layout): number[] {
    const hidden = this.lensHidden(view, layout);
    const out: number[] = [];
    for (let r = view.top; r < layout.lines.length && out.length < view.height; r++) if (!isHidden(hidden, r)) out.push(r);
    return out;
  }

  /** How many shown rows lie between `a` and `b` (negative when `b` is before `a`). */
  private visibleBetween(layout: Layout, hidden: [number, number][], a: number, b: number): number {
    let n = 0;
    for (let r = Math.min(a, b); r < Math.max(a, b); r++) if (!isHidden(hidden, r)) n++;
    return b >= a ? n : -n;
  }

  /** The cursor inside an oversized lens: its window scrolls to keep it two rows from the rules. */
  private followInLens(view: View, layout: Layout): void {
    if (!view.live || layout.lines[view.cur.row]?.lens !== "source") return;
    const first = layout.lines.findIndex((l) => l.lens === "source");
    const max = this.lensRows(view);
    const idx = view.cur.row - first;
    const m = Math.min(2, Math.floor((max - 1) / 2));
    let inner = view.lensInner ?? 0;
    if (idx < inner + m) inner = idx - m;
    else if (idx > inner + max - 1 - m) inner = idx - max + 1 + m;
    view.lensInner = Math.max(0, inner);
  }

  /** Keep the cursor inside the view with `scrolloff` rows of margin. */
  ensureCursorVisible(view: View, layout: Layout): void {
    const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
    this.followInLens(view, layout);
    const hidden = this.lensHidden(view, layout);
    if (!hidden.length) {
      if (view.cur.row < view.top + so) view.top = view.cur.row - so;
      else if (view.cur.row > view.top + view.height - 1 - so) view.top = view.cur.row - view.height + 1 + so;
    } else {
      const d = this.visibleBetween(layout, hidden, view.top, view.cur.row);
      if (d < so) view.top = this.stepVisible(layout, hidden, view.cur.row, -so);
      else if (d > view.height - 1 - so) view.top = this.stepVisible(layout, hidden, view.cur.row, -(view.height - 1 - so));
    }
    view.top = this.clampTop(view, layout, view.top);
    this.anchorTop(view, layout);
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
    // The selection's lines, kept after it ends: `:'<,'>s` works on the last one, as vim's marks.
    if (view.sel) {
      const x = layout.lines[view.sel.anchor.row]?.src ?? 1;
      const y = layout.lines[view.cur.row]?.src ?? 1;
      view.visualLines = [Math.min(x, y), Math.max(x, y)];
    }
    this.ensureCursorVisible(view, layout);
  }

  /** Scroll by rows; the cursor moves with the view (ctrl+d/u, pages) or only as needed (wheel). */
  scrollBy(view: View, delta: number, moveCursor: boolean): void {
    this.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.currentLayout(view);
    const hidden = this.lensHidden(view, layout);
    view.top = this.clampTop(view, layout, this.stepVisible(layout, hidden, view.top, delta));
    this.anchorTop(view, layout);
    const last = Math.max(0, layout.lines.length - 1);
    let row = view.cur.row;
    if (moveCursor) row = Math.max(0, Math.min(this.stepVisible(layout, hidden, view.cur.row, delta), last));
    else {
      // The wheel: the cursor moves only to stay on screen, scrolloff rows in.
      const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
      const rows = this.screenRows(view, layout);
      const lo = rows[Math.min(so, rows.length - 1)] ?? 0;
      const hi = rows[Math.max(0, rows.length - 1 - so)] ?? last;
      if (view.cur.row < lo || isHidden(hidden, view.cur.row)) row = lo;
      else if (view.cur.row > hi) row = hi;
    }
    if (row !== view.cur.row) {
      view.cur = { row, col: snap(layout, row, view.goal) };
      view.curAnchor = this.cursorAnchorFor(layout, view.cur);
    }
    if (moveCursor) this.ensureCursorVisible(view, layout);
  }

  /** vim's zz / zt / zb: scroll so the cursor's row is in the middle, at the top or the bottom. */
  scrollCursorTo(view: View, where: "center" | "top" | "bottom"): void {
    const layout = this.currentLayout(view);
    const hidden = this.lensHidden(view, layout);
    const up = where === "top" ? 0 : where === "center" ? Math.floor((view.height - 1) / 2) : view.height - 1;
    view.top = this.clampTop(view, layout, this.stepVisible(layout, hidden, view.cur.row, -up));
    this.anchorTop(view, layout);
  }

  /** vim's H / M / L: the row on screen at the top, the middle or the bottom (scrolloff rows in,
   *  unless the note's edge is on screen), its first non-blank. */
  screenRow(view: View, where: "top" | "middle" | "bottom"): Pos {
    const layout = this.currentLayout(view);
    const rows = this.screenRows(view, layout);
    if (!rows.length) return view.cur;
    const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((rows.length - 1) / 2)));
    const lastShown = rows[rows.length - 1] === layout.lines.length - 1;
    const i = where === "top" ? (view.top === 0 ? 0 : so) : where === "bottom" ? (lastShown ? rows.length - 1 : rows.length - 1 - so) : Math.floor((rows.length - 1) / 2);
    const row = rows[Math.max(0, Math.min(i, rows.length - 1))]!;
    return { row, col: 0 };
  }

  /** `:q`: this window, or its tab; the very last one quits. */
  closeOrQuit(): void {
    const t = this.tab;
    if (!t || (t.views.length <= 1 && this.tabs.length <= 1)) return this.requestQuit();
    this.closeWindow();
  }

  /** Put the cursor on a heading row and scroll the window so that row is its first. */
  revealHeading(view: View, row: number): void {
    this.pushHistory(view);
    this.moveCursor(view, { row, col: 0 });
    const layout = this.currentLayout(view);
    view.top = this.clampTop(view, layout, view.cur.row);
    this.anchorTop(view, layout);
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
    if (!task) return this.message("info", "no task here — ctrl+l toggles a list item's [ ]");
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
      bytes = readRegular(buf.abs);
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
    let written: ReturnType<typeof writeNote>;
    try {
      written = writeNote(root, buf.abs, content);
    } catch (err) {
      this.message("error", err instanceof WriteRefused ? err.message : `can't write ${buf.key}: ${(err as Error).message}`);
      return false;
    }
    // Stamped as written: an agent's write landing right after is a change, not ours.
    if (buf.rel !== null) this.watcher?.noteOwnWrite(buf.rel, written);
    // The index learns what we wrote (the watcher skips our own writes): the note's links, for
    // backlinks, and its stamp — a later watcher resync from the index must not take our own
    // save for someone else's change.
    if (buf.rel !== null && this.graph.notes.has(buf.rel)) this.graph.updateFile(buf.rel, { rel: buf.rel, abs: buf.abs, size: written.size, mtimeMs: written.mtimeMs });
    else if (buf.rel !== null) this.graph.fileChanged(buf.rel);
    if (saving) {
      // The text on disk is what's in the buffer: keep it, its history and every cursor.
      buf.deleted = false;
      buf.markSaved(written);
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

  /** Focus the split's other window, splitting first when there's one: where "in the split" opens. */
  otherWindow(): void {
    const t = this.tab;
    if (!t) return;
    if (t.views.length === 1) this.splitWith(t.orientation ?? "side");
    else t.active = 1 - t.active;
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

  /**
   * Where a new note or folder goes: the explorer's selected folder (or the folder of its selected
   * file) when the explorer has focus, else the current note's folder; the vault's root without
   * one. Vault-relative, "" for the root.
   */
  newItemBase(): string {
    if (this.region === "sidebar" && this.leftView === "explorer") {
      const row = this.explorerRows()[this.sidebar.selected];
      if (row) return row.kind === "dir" ? row.path : posix.dirname(row.path) === "." ? "" : posix.dirname(row.path);
    }
    const rel = this.view?.buf.rel;
    return rel && posix.dirname(rel) !== "." ? posix.dirname(rel) : "";
  }

  /** A path typed for a new note or folder, from `base` (or the root, with a leading `/`); null
   *  (and said) when it leaves the vault or names nothing. */
  private newPath(input: string, base: string): string | null {
    const typed = input.trim();
    if (!typed) return null;
    const rel = posix.normalize(typed.startsWith("/") ? typed.slice(1) : posix.join(base, typed)).replace(/\/+$/, "");
    if (!rel || rel === "." || rel.startsWith("../") || rel === ".." || posix.isAbsolute(rel)) {
      this.message("warn", `${typed}: not inside the vault`);
      return null;
    }
    // Through a symlinked folder or not, never outside the vault.
    const target = realTarget(join(this.loc.root, rel));
    let root = this.loc.root;
    try {
      root = realpathSync(root);
    } catch {}
    const r = relative(root, target);
    if (r.startsWith("..") || isAbsolute(r)) {
      this.message("warn", `${typed} resolves outside the vault — not creating it`);
      return null;
    }
    return rel;
  }

  /** The folders a new path makes, known to the walk and the watcher (and the explorer shows). */
  private addFolders(rel: string): void {
    const parts = rel.split("/");
    let added = false;
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!this.graph.dirs.includes(dir)) {
        this.graph.dirs.push(dir);
        added = true;
      }
    }
    if (added) this.watcher?.sync(this.loc.mode !== "home" ? this.graph.dirs : [""], this.knownFromGraph(), this.sizesFromGraph());
  }

  /**
   * Create a note (ctrl+n, `:new`): `input` from `base`, `.md` added unless it names a known
   * extension (`.toml`, `.py`…); missing folders made. A note starts with its title as a heading
   * (`# Name`). An existing file is just opened. Its vault path
   * and whether it was made, or null.
   */
  createNote(input: string, base: string): { rel: string; created: boolean } | null {
    let rel = this.newPath(input, base);
    if (!rel) return null;
    const ext = extensionOf(rel);
    if (!ext || !isKnownExtension(ext)) rel = `${rel}.md`;
    const abs = join(this.loc.root, rel);
    if (existsSync(abs)) {
      if (statSync(abs).isDirectory()) {
        this.message("warn", `${rel} is a folder`);
        return null;
      }
      this.message("info", `${rel} exists — opened`);
      return { rel, created: false };
    }
    const kind = classify(rel, this.config.walk.extensions);
    const name = posix.basename(rel).replace(/\.[^.]+$/, "");
    const content = kind.group === "note" ? `# ${name}\n\n` : "";
    let stamp: { mtimeMs: number; size: number };
    try {
      mkdirSync(dirname(abs), { recursive: true });
      stamp = writeNote(this.loc.root, abs, content);
    } catch (err) {
      this.message("error", `can't create ${rel}: ${(err as Error).message}`);
      return null;
    }
    const dir = posix.dirname(rel);
    if (dir !== ".") this.addFolders(dir);
    this.watcher?.noteOwnWrite(rel, stamp);
    if (kind.group === "note") this.graph.updateFile(rel, { rel, abs, size: stamp.size, mtimeMs: stamp.mtimeMs });
    else this.graph.addAsset(rel);
    this.invalidateTree();
    this.relayoutAll(); // links to it resolve now
    this.message("info", `created ${rel}`);
    return { rel, created: true };
  }

  /**
   * Ask for a new note's name and make it: opened, and typed into below its title. `prefill`: the
   * name already typed (a link to a note that doesn't exist yet).
   */
  promptNewNote(base = this.newItemBase(), prefill = ""): void {
    const make = (text: string) => {
      const r = this.createNote(text, base);
      if (!r) return;
      this.region = "content";
      this.open(r.rel);
      const v = this.view;
      // Typing on the line after the title's blank one (as `o` there would): a source view has no
      // row past the file's last line break, so the insert begins with one.
      if (r.created && v?.buf.rel === r.rel) {
        startInsert(this, v, (w) => w.buf.source.length);
        insertText(this, v, v.buf.eol);
      }
    };
    this.prompt(`new note in ${base ? `${base}/` : "the vault"}`, make);
    if (prefill && this.overlay?.kind === "prompt") this.overlay.text = prefill;
  }

  /** Ask for a new folder's name and make it. */
  promptNewFolder(base = this.newItemBase()): void {
    this.prompt(`new folder in ${base ? `${base}/` : "the vault"}`, (text) => void this.createFolder(text, base));
  }

  /** Create a folder (`d` in the explorer, `space v d`, `:mkdir`): selected in the explorer. */
  createFolder(input: string, base: string): string | null {
    const rel = this.newPath(input, base);
    if (!rel) return null;
    const abs = join(this.loc.root, rel);
    if (existsSync(abs)) {
      this.message("warn", `${rel} exists`);
      return null;
    }
    try {
      mkdirSync(abs, { recursive: true });
    } catch (err) {
      this.message("error", `can't create ${rel}: ${(err as Error).message}`);
      return null;
    }
    this.addFolders(rel);
    // Unfolded to it, and selected, in a shown explorer.
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    this.invalidateTree();
    this.switchLeftView("explorer");
    this.showSidebar(true);
    const at = this.explorerRows().findIndex((r) => r.kind === "dir" && r.path === rel);
    if (at >= 0) this.sidebar.selected = at;
    this.region = "sidebar";
    this.message("info", `created ${rel}/`);
    return rel;
  }

  /** Keep only this tab (`:tabonly`) and the pinned ones. The notes' buffers stay, unsaved
   *  changes and all. */
  closeOtherTabs(): void {
    const t = this.tab;
    if (!t) return;
    const gone = this.tabs.filter((x) => x !== t && !x.pinned);
    if (!gone.length) return this.message("info", this.tabs.length > 1 ? "the other tabs are pinned" : "only one tab");
    for (const other of gone) for (const v of other.views) this.remember(v);
    this.tabs = this.tabs.filter((x) => x === t || x.pinned);
    this.activeTab = this.tabs.indexOf(t);
    this.message("info", `closed ${gone.length} other tab${gone.length === 1 ? "" : "s"}`);
  }

  /** Close every tab but the pinned ones; with none left, the "no note open" page, the explorer
   *  focused to open one. */
  closeAllTabs(): void {
    if (!this.tabs.length) return;
    const t = this.tab;
    for (const x of this.tabs) if (!x.pinned) for (const v of x.views) this.remember(v);
    this.tabs = this.tabs.filter((x) => x.pinned);
    if (this.tabs.length) {
      this.activeTab = t?.pinned ? this.tabs.indexOf(t) : this.tabs.length - 1;
      return this.message("info", "closed the tabs that aren't pinned");
    }
    this.activeTab = 0;
    this.showSidebar(true);
    this.region = "sidebar";
  }

  /** Pin or unpin this tab: pinned tabs keep together at the left, in the order pinned. */
  togglePin(): void {
    const t = this.tab;
    if (!t) return;
    const rest = this.tabs.filter((x) => x !== t);
    t.pinned = !t.pinned;
    const firstUnpinned = rest.findIndex((x) => !x.pinned);
    const at = firstUnpinned < 0 ? rest.length : firstUnpinned; // the pinned group's end
    rest.splice(at, 0, t);
    this.tabs = rest;
    this.activeTab = at;
    this.message("info", t.pinned ? "pinned: links open in new tabs, close others / all keep it" : "unpinned");
  }

  /** Move this tab one place, within its group (pinned tabs stay left of the others). */
  moveTab(dir: -1 | 1): void {
    const i = this.activeTab;
    const j = i + dir;
    const t = this.tabs[i];
    const other = this.tabs[j];
    if (!t || !other || !!other.pinned !== !!t.pinned) return;
    [this.tabs[i], this.tabs[j]] = [other, t];
    this.activeTab = j;
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
      // From the drawn width, which the room left can hold below the stored one: every step shows.
      this.sideW = Math.max(12, Math.min(this.sidebarWidth() + grow * step, Math.floor(this.width * 0.5)));
      return;
    }
    if (this.region === "outline" && horizontal) {
      this.outW = Math.max(12, Math.min(this.outlineWidth() + grow * step, Math.floor(this.width * 0.5)));
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

  /**
   * The files beyond notes the explorer and the switcher list (16.5): by `files.show` — or all
   * text files while the explorer's toggle is on — then `files.include` patterns always, and
   * `files.exclude` never. Binary files are never listed.
   */
  shownFiles(): { path: string; group: FileGroup }[] {
    const f = this.config.files;
    const mode = this.sidebar.allFiles ? "all" : f.show;
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    const out: { path: string; group: FileGroup }[] = [];
    for (const path of this.graph.filePaths()) {
      const { group } = classify(path, this.config.walk.extensions);
      if (group === "binary" || excl?.ignores(path)) continue;
      if (incl?.ignores(path) || mode === "all" || (mode === "renderable" && group === "data")) out.push({ path, group });
    }
    return out;
  }

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    const rows: TreeRow[] = [];
    const groups = new Map(this.shownFiles().map((f) => [f.path, f.group]));
    // The walk's folders too, so one with nothing listed in it (just made, or holding only files
    // the explorer leaves out) is still there to open and to create in.
    const folders = new Set(this.graph.dirs.filter((d) => d));
    const paths = [...this.graph.notes.keys(), ...groups.keys(), ...folders].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1 && !folders.has(a);
        const lastB = i === db.length - 1 && !folders.has(b);
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
      // A folder: its own row (its parents first), when they're unfolded.
      const own = folders.has(p) ? parts.length : parts.length - 1;
      for (let i = 0; i < own; i++) {
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
      if (visible && !folders.has(p)) rows.push({ kind: "note", path: p, name: parts[parts.length - 1]!, depth: parts.length - 1, ...(groups.has(p) ? { group: groups.get(p) } : {}) });
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
      const group = this.graph.notes.has(row) ? undefined : classify(row, this.config.walk.extensions).group;
      rows.push({ kind: "note", path: row, name: parts[parts.length - 1]!, depth: parts.length - 1, ...(group ? { group } : {}) });
    }
    this.filtered = { query: q, tree: this.treeRows(), rows };
    return rows;
  }

  private filtered: { query: string; tree: TreeRow[]; rows: TreeRow[] } | null = null;

  /** Every note's path, directories first at each level, as the tree orders them. */
  private allNotesInTreeOrder(): string[] {
    return [...this.graph.notes.keys(), ...this.shownFiles().map((f) => f.path)].sort((a, b) => {
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
          label: path.split("/").pop()!, // with its extension, as the explorer and tabs show names
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

  /** Keys while the outline's filter has them: type, move, jump, clear. */
  private outlineFilterKey(key: string): void {
    const o = this.outline;
    const rows = this.outlineRows();
    const typed = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    const done = () => {
      o.filter = "";
      o.filtering = false;
    };
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        return done();
      case "enter": {
        const row = rows[o.selected];
        const view = this.view;
        done();
        if (!row || !view) return;
        this.pushHistory(view);
        this.moveCursor(view, { row: row.line, col: 0 });
        this.region = "content";
        if (this.narrow || this.ui.zen) o.overlay = false;
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        o.selected = Math.min(rows.length - 1, o.selected + 1);
        return;
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        o.selected = Math.max(0, o.selected - 1);
        return;
      case "backspace":
        o.filter = [...(o.filter ?? "")].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        o.filter = (o.filter ?? "").replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        o.filter = "";
        break;
      default:
        if (typed === null) return;
        o.filter = (o.filter ?? "") + typed;
    }
    // The selection goes to the heading that matches best (never a parent only kept for context).
    o.scroll = 0;
    o.pinned = false;
    const q = o.filter ?? "";
    const next = this.outlineRows();
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    if (q) {
      next.forEach((r, i) => {
        const m = fuzzy(q, r.text);
        if (m && m.score > bestScore) {
          bestScore = m.score;
          best = i;
        }
      });
    }
    o.selected = best;
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
        this.otherWindow();
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
      case "new_note":
        return this.promptNewNote(this.newItemBase());
      case "new_folder":
        return this.promptNewFolder(this.newItemBase());
      case "all_files": {
        // Every text file, or back to what files.show lists; the selection stays on its row.
        const at = row?.path;
        this.sidebar.allFiles = !this.sidebar.allFiles;
        this.invalidateTree();
        const again = this.explorerRows().findIndex((r) => r.path === at);
        if (again >= 0) this.sidebar.selected = again;
        this.message("info", this.sidebar.allFiles ? "explorer: every text file" : `explorer: ${this.config.files.show === "notes" ? "notes" : this.config.files.show === "all" ? "every text file" : "notes and data files"} (files.show)`);
        break;
      }
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
        // A filtered list shows every match whatever is folded: folding would act on rows not shown.
        if (!row || this.sidebar.filter) break;
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
    // Filtering (`/`): the headings that match and the ones they sit under, folds ignored.
    const q = this.outline.filter ?? "";
    if (q) {
      const keep = new Set<number>();
      hs.forEach((h, i) => {
        if (!fuzzy(q, h.text)) return;
        keep.add(i);
        let level = h.level;
        for (let k = i - 1; k >= 0 && level > 1; k--) {
          if (hs[k]!.level < level) {
            keep.add(k);
            level = hs[k]!.level;
          }
        }
      });
      hs.forEach((h, i) => {
        if (keep.has(i)) out.push({ index: i, level: h.level, text: h.text, line: h.line, folded: false, hasChildren: (hs[i + 1]?.level ?? 0) > h.level });
      });
      return out;
    }
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
    if (action === "filter") {
      this.outline.filtering = true; // resumes a filter already there
      return;
    }
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
    /** Already typed in its filter. */
    input?: string;
  }): void {
    const o: ListOverlay = {
      kind: "list",
      title: opts.title,
      input: opts.input ?? "",
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

  /** ⇄ / alt+h: the replace row under a window's find row, opened (with find, if need be) or closed. */
  async toggleReplaceRow(view: View): Promise<void> {
    const o = this.overlay;
    const typing = o?.kind === "prompt" && o.view === view ? o : null;
    if (typing?.replace?.confirm) return;
    if (typing?.replace) {
      typing.replace = undefined;
      typing.change?.(typing.text);
    } else if (typing) R.openReplace(this, typing, view);
    else await this.run("find.replace");
  }

  /** Flip a window's find toggle (regex, whole words); the search it has redoes itself with it. */
  toggleFindOpt(view: View, key: "regex" | "whole"): void {
    const o = { ...(view.findOpts ?? { regex: false, whole: false }) };
    o[key] = !o[key];
    view.findOpts = o;
    const typing = this.overlay?.kind === "prompt" && this.overlay.view === view;
    if (view.find && !typing) {
      const f = computeFind(this.currentLayout(view), view.find.query, view.find.current, o.whole, o.regex);
      view.find = f;
    }
    this.message("info", `${key === "regex" ? "regex" : "whole words"}: ${o[key] ? "on" : "off"}`);
  }

  /** Keys in the replace field: its text, enter replaces one, alt+enter (alt+a) all, ctrl+n/p move. */
  private replaceFieldKey(o: PromptOverlay, view: View, key: string, typed: string | null): void {
    const r = o.replace!;
    switch (key) {
      case "enter":
        return R.replaceOne(this, o, view);
      case "alt+enter":
      case "alt+a":
        return R.replaceAll(this, o, view);
      case "ctrl+n":
      case "down":
        return R.stepMatch(this, o, view, 1);
      case "ctrl+p":
      case "up":
        return R.stepMatch(this, o, view, -1);
      case "backspace":
        r.text = [...r.text].slice(0, -1).join("");
        return;
      case "ctrl+w":
      case "ctrl+backspace":
        r.text = r.text.replace(/\S*\s*$/, "");
        return;
      case "ctrl+u":
        r.text = "";
        return;
    }
    if (typed !== null) r.text += typed;
  }

  prompt(label: string, accept: (text: string) => void, change?: (text: string) => void, cancel?: () => void, view?: View): void {
    this.overlay = { kind: "prompt", label, text: "", accept, change, cancel, view };
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
   * Pasted text (bracketed paste): into the text while typing, after the cursor in normal mode
   * (as p), into the open list's filter or prompt (first line only, sanitized); reading, nowhere.
   */
  paste(text: string): Promise<void> {
    // In turn with the keys (never between two of them), and recorded as a key of its own.
    return this.handleKey(`${PASTE}${text}`);
  }

  private pasteNow(text: string): void {
    const o = this.overlay;
    const iv = this.view;
    if (!o && this.region === "content" && iv?.insert) {
      // Into the text, its line breaks the note's own; part of the change for `.`.
      insertText(this, iv, text.replace(/\r\n?/g, "\n").replaceAll("\n", iv.buf.eol));
      return insertRecord(this, iv, `${PASTE}${text}`);
    }
    // In normal mode where the text is editable: put after the cursor, as p does.
    if (!o && this.region === "content" && iv && editable(iv)) return put(this, iv, true, text.replace(/\r\n?/g, "\n"));
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
    this.publishDirty();
    this.publishState();
    // A conflict that arrived while typing: its prompt now that typing stopped — not on the esc that
    // stopped it, since a second esc (closing the lens) would dismiss it unread.
    if (!this.overlay && key !== "escape" && !this.allViews().some((v) => v.insert)) {
      const waiting = this.allViews().find((v) => v.buf.conflictWaiting)?.buf;
      if (waiting) {
        if (waiting.dirty && waiting.changedOnDisk()) this.conflictPrompt(waiting);
        else waiting.conflictWaiting = false;
      }
    }
    this.host.requestRender();
  }

  /**
   * The advisory staleness file (9.9, decision 9.4): the notes with unsaved changes here, for the
   * CLI to warn agents about. Written when the list changes; removed when it's empty, and on quit.
   */
  publishDirty(): void {
    // The home vault's list covers every loose folder: its paths are absolute (17.2).
    const paths = this.dirtyBuffers().map((b) => (this.loc.mode === "home" ? b.abs : b.key)).sort();
    const key = paths.join("\n");
    if (key === this.lastDirty) return;
    this.lastDirty = key;
    try {
      writeDirty(this.loc, paths);
    } catch {}
  }

  private lastDirty = "";

  /**
   * The session and positions, which `slipbox history` reads (what's open, the note on screen, the
   * nvim picked for send): kept current while slipbox runs, not only at quit, so an agent sees what
   * the user sees and a crash loses little. Saved a second after they last change.
   */
  publishState(): void {
    const v = this.view;
    const sig = [this.activeTab, v ? `${v.buf.key}@${v.cur.row}` : "", this.remoteServer ?? "", ...this.tabs.map((t) => `${t.active}:${t.views.map((x) => x.buf.key).join(",")}`)].join("|");
    if (sig === this.lastState || this.quitting) return;
    this.lastState = sig;
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      if (this.quitting) return;
      try {
        this.saveState();
      } catch {}
    }, 1000);
    (this.stateTimer as { unref?: () => void }).unref?.();
  }

  private lastState = "";
  private stateTimer: ReturnType<typeof setTimeout> | null = null;

  /** The keymaps consulted in the current state, in priority order, with how to run a hit. */
  private maps(): { map: Keymap; run: (spec: string) => Promise<void> | void }[] {
    const out: { map: Keymap; run: (spec: string) => Promise<void> | void }[] = [];
    if (this.region === "sidebar" && this.sidebarShown) out.push({ map: this.explorerKeys, run: (a) => this.explorerAction(a) });
    if (this.region === "outline" && this.outlineShown) out.push({ map: this.outlineKeys, run: (a) => this.outlineAction(a) });
    if (this.view?.visual) out.push({ map: this.visualKeys, run: (s) => this.run(s) });
    // Source mode's own keys (x deletes a character there) before the reading ones.
    if (this.region === "content" && editable(this.view) && !this.view!.visual) out.push({ map: this.sourceKeys, run: (s) => this.run(s) });
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
    if (key.startsWith(PASTE)) return this.pasteNow(key.slice(PASTE.length));
    if (this.overlay) return this.overlayKey(this.overlay, key);
    if (this.region === "sidebar" && this.sidebarShown && this.sidebar.filtering && !this.pending.length) return this.filterKey(key);
    if (this.region === "outline" && this.outlineShown && this.outline.filtering && !this.pending.length) return this.outlineFilterKey(key);
    // Insert mode: keys are text, except the few that edit or move (editing.ts); save still works.
    const iv = this.view;
    if (this.region === "content" && iv?.insert && !this.pending.length) {
      if (key === "ctrl+s") return void this.run("note.save");
      insertKey(this, iv, key);
      return insertRecord(this, iv, key);
    }
    // A command waiting for one character (f, t) in the render; in source vim.ts has it.
    if (this.region === "content" && this.vim.awaitChar && !editable(iv)) {
      const f = this.vim.awaitChar;
      this.vim.awaitChar = null;
      const ch = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
      if (ch !== null) f(ch);
      return;
    }
    // Source mode's normal mode: counts, operators and `.` around the keymaps (vim.ts).
    if (this.region === "content" && iv && editable(iv) && !iv.visual && !this.resizeMode) return vimKey(this, iv, key, () => this.dispatchMapped(key));
    if (this.region === "content" && iv?.visual && !this.resizeMode) return visualKey(this, iv, key, () => this.dispatchMapped(key));
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
    // The terminal tests' coverage (tests/e2e): every command run, one id per line.
    if (TRACE) appendFileSync(TRACE, `${spec.split(" ")[0]}\n`);
    if (!(await this.registry.run(this, spec))) this.message("error", `unknown command: ${spec}`);
  }

  private overlayKey(o: Overlay, key: string): void {
    // Replacing: closing the rows keeps the search, the cursor and the edits (nothing to cancel).
    if (o.kind === "prompt" && o.replace?.confirm && o.view) return R.confirmKey(this, o, o.view, key);
    if (o.kind === "prompt" && o.replace && (key === "escape" || key === "ctrl+c" || key === "ctrl+g")) {
      this.overlay = null;
      return o.accept(o.text);
    }
    if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return this.closeOverlay(true);
    const typed = key === "space" ? " " : [...key].length === 1 ? key : /^shift\+.$/.test(key) ? key.slice(6).toUpperCase() : null;
    if (o.kind === "prompt") {
      // The find row's toggles, while typing in it.
      if (o.view && (key === "alt+r" || key === "alt+w")) {
        this.toggleFindOpt(o.view, key === "alt+r" ? "regex" : "whole");
        if (o.replace) R.refresh(this, o, o.view);
        else o.change?.(o.text);
        return;
      }
      if (o.view && key === "alt+h") return void this.toggleReplaceRow(o.view);
      // Find's replace field: tab or ctrl+h into it, shift+tab back to the find field.
      if (o.view && (key === "tab" || key === "ctrl+h")) return R.openReplace(this, o, o.view);
      if (o.view && o.replace && key === "shift+tab") {
        o.replace.focus = false;
        return;
      }
      if (o.view && o.replace?.focus) return this.replaceFieldKey(o, o.view, key, typed);
      if (o.view && o.replace && key === "enter") {
        // Closing the pair keeps the search (and what was replaced); it doesn't undo anything.
        this.overlay = null;
        return o.accept(o.text);
      }
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
      if (o.replace && o.view) R.refresh(this, o, o.view); // the count of what enter would replace, as you type
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
    | { kind: "select"; view: View; start: Pos; moved: boolean; onText: boolean }
    | { kind: "tab"; index: number }
    | { kind: "separator"; sep: import("./draw.ts").Separator }
    | { kind: "scrollbar"; bar: import("./draw.ts").ScrollbarGeom }
    | null = null;

  /** Everything visible is clickable (docs/design/keymap.md, "Mouse"). */
  handleMouse(ev: { type: string; x: number; y: number; button: number; scroll?: { direction: string; delta: number } }): void {
    this.handleMouseNow(ev);
    // As after a key: a click can save, load theirs, tick a task — the idle clock and the stale list
    // follow it too.
    if (ev.type !== "move" && ev.type !== "over" && ev.type !== "out") {
      this.scheduleAutosave();
      this.publishDirty();
      this.publishState();
    }
  }

  private handleMouseNow(ev: { type: string; x: number; y: number; button: number; scroll?: { direction: string; delta: number } }): void {
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
      // A click ends typing (its undo step closes), and a half-typed sequence (space, then the
      // click) unless it's on the which-key popup's own entries; then does what it does.
      for (const v of this.allViews()) if (v.insert) stopInsert(this, v);
      const hot = hotAt()?.id ?? null;
      if (this.pending.length && !hot?.startsWith("wk:")) this.clearPending();
      return this.mouseDown(ev, g, hot);
    }
    if (ev.type === "drag" && this.drag) return this.mouseDrag(ev, g);
    if ((ev.type === "up" || ev.type === "drag-end") && this.drag) return this.mouseUp();
  }

  private overlayMouse(ev: { type: string; x: number; y: number; scroll?: { direction: string } }, g: Geometry): void {
    const o = this.overlay!;
    // The find row's own buttons work while typing in it.
    if (o.kind === "prompt" && o.view && ev.type === "down") {
      const hot = g.hot.find((h) => inRect(h, ev.x, ev.y));
      if (hot?.id.startsWith("findopt:") || hot?.id.startsWith("findrep:")) return this.clickHot(hot.id);
    }
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
    } else if (pane) {
      // Over an oversized lens: its inside scrolls first; at its end, the page (4.15).
      const v = pane.view;
      if (v.live) {
        const layout = this.currentLayout(v);
        const row = this.screenRows(v, layout)[ev.y - pane.y];
        if (row !== undefined && layout.lines[row]?.lens === "source" && this.lensHidden(v, layout).length) {
          const before = v.lensInner ?? 0;
          v.lensInner = Math.max(0, before + dir * n);
          this.lensHidden(v, layout); // clamps it to the lens
          if (v.lensInner !== before) {
            // The cursor comes along as far as it must: never left on a row the lens now hides,
            // where the next edit would change text out of sight.
            const shown = this.screenRows(v, layout).filter((r) => layout.lines[r]?.lens === "source");
            if (shown.length && !shown.includes(v.cur.row)) {
              const to = v.cur.row < shown[0]! ? shown[0]! : shown[shown.length - 1]!;
              this.moveCursor(v, { row: to, col: v.goal }, { keepGoal: true });
            }
            return;
          }
        }
      }
      this.scrollBy(v, dir * n, false);
    }
  }

  /** Click count at this spot: 1, 2 (double) or 3 (triple), within 400 ms. */
  private clicks(ev: { x: number; y: number }): number {
    const now = this.now();
    const l = this.lastClick;
    const again = l && l.x === ev.x && l.y === ev.y && now - l.at < 400;
    if (again && l.count === 0) {
      this.lastClick = null;
      return 0;
    }
    const count = again ? Math.min(3, l.count + 1) : 1;
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
    if (clicks === 0) {
      this.drag = null;
      return;
    }
    if (hot && !hot.startsWith("tab:")) return this.clickHot(hot);
    if (g.popup && inRect(g.popup, ev.x, ev.y)) return; // the which-key popup's background
    const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
    if (tab) {
      this.activeTab = tab.index;
      this.region = "content"; // the tab's note has the keys now, not a pane focused before
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
      if (row.hasChildren && ev.x >= markerX - 1 && ev.x <= markerX + 1 && !this.outline.filter) this.outlineAction(row.folded ? "unfold" : "fold");
      else {
        this.outlineAction("jump"); // a choice: the note moves there and takes the focus
        this.outline.filter = "";
        this.outline.filtering = false;
      }
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
        // As in the explorer: one click selects, a double-click (or enter) jumps there.
        if (clicks < 2) return;
        this.sidebar.filter = "";
        this.sidebar.filtering = false;
        this.historyAction("open");
        return;
      }
      const row = this.explorerRows()[idx];
      if (!row) return;
      this.sidebar.selected = idx;
      // A note: one click selects it, a double-click opens it as a tab (enter too, from the keys).
      if (row.kind === "note" && clicks < 2) return;
      if (row.kind === "note" && this.sidebar.filter) {
        // Picked from the filter: open it, and the tree comes back.
        this.sidebar.filter = "";
        this.sidebar.filtering = false;
        this.openOrSwitchTab(row.path);
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false; // an overlaid pane closes after a pick
        return;
      }
      if (row.kind === "dir") {
        if (this.sidebar.filter) return; // a filtered list ignores folds: a click there only selects
        if (this.expanded.has(row.path)) this.expanded.delete(row.path);
        else this.expanded.add(row.path);
        this.invalidateTree();
      } else this.explorerAction("open_tab");
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
    const shown = this.screenRows(view, layout);
    const pos = clampPos(layout, { row: shown[ev.y - pane.y] ?? shown[shown.length - 1] ?? 0, col: Math.max(0, ev.x - pane.textX) + view.left });
    // Really on the text, not on blank space the cursor was clamped from (past a row's end, below
    // the note): only there does a click follow a link or tick a task.
    const clickedRow = shown[ev.y - pane.y];
    const clickedCol = ev.x - pane.textX + view.left;
    const onText = clickedRow !== undefined && clickedCol >= 0 && clickedCol < (layout.lines[clickedRow]?.spans.reduce((a, sp) => a + stringWidth(sp.text), 0) ?? 0);
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
    // With the lens open, a click that moves it keeps the clicked line under the pointer (set now,
    // for the layout that moves the lens, not the one moveCursor started from).
    if (view.live) view.lensClick = ev.y - pane.y;
    // Where the cursor really is now (the lens may have moved): a drag starts from there.
    this.currentLayout(view);
    view.lensClick = undefined;
    this.drag = { kind: "select", view, start: { ...view.cur }, moved: false, onText };
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
      // A drag stays within its group: pinned tabs keep left of the others.
      if (over && over.index !== d.index && !!this.tabs[over.index]?.pinned === !!this.tabs[d.index]?.pinned) {
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
    const shown = this.screenRows(d.view, layout);
    const pos = clampPos(layout, { row: shown[Math.max(0, Math.min(shown.length - 1, ev.y - pane.y))] ?? 0, col: Math.max(0, ev.x - pane.textX) + d.view.left });
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
      // Where the text is editable, a drag is a visual selection (as vim's mouse makes one): d, c,
      // x, >, < and y act on it, and esc leaves it — an edit never lands beside a highlight.
      if (editable(d.view) && !d.view.insert && !d.view.visual) d.view.visual = d.view.sel.line ? "line" : "char";
      return;
    }
    d.view.sel = null;
    if (!d.onText) return;
    const layout = this.currentLayout(d.view);
    const link = linkAt(layout, d.start.row, d.start.col);
    if (link >= 0) {
      // A double-click's second click lands in the note the first opened: it's swallowed, never a
      // click (or a double-click, copying a word) on text the user hasn't seen yet.
      if (this.lastClick) this.lastClick.count = 0;
      return void this.run("link.follow").then(() => this.host.requestRender());
    }
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
      case "findrep": {
        // findrep:<one|all>:<window>
        const [which] = arg.split(":");
        const o = this.overlay;
        if (o?.kind !== "prompt" || !o.view || !o.replace || o.replace.confirm) break;
        if (which === "all") R.replaceAll(this, o, o.view);
        else R.replaceOne(this, o, o.view);
        break;
      }
      case "findopt": {
        // findopt:<regex|whole|replace>:<window>
        const [which, w] = arg.split(":");
        const v = this.tab?.views[Number(w)];
        if (!v) break;
        const o = this.overlay;
        const typing = o?.kind === "prompt" && o.view === v ? o : null;
        if (which === "replace") {
          this.tab!.active = Number(w);
          this.region = "content";
          void this.toggleReplaceRow(v).then(() => this.host.requestRender());
          break;
        }
        this.toggleFindOpt(v, which === "regex" ? "regex" : "whole");
        if (typing?.replace) R.refresh(this, typing, v);
        else typing?.change?.(typing.text);
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
      case "toast":
        this.dismissToasts();
        void this.run("messages.open");
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

  /**
   * What `p` puts: the system clipboard when it can be read and holds something else than the
   * register (text copied in another app); else the register — whose line-wise-ness a clipboard
   * that holds the same text keeps.
   */
  pasteText(): { text: string; linewise: boolean } | null {
    const reg = this.vim.register;
    const clip = readClipboard(stateDir(this.loc));
    if (clip === null || clip === "" || (reg && clip === reg.text)) return reg;
    return { text: clip, linewise: false };
  }

  copy(text: string, announce = true): boolean {
    const r = copyText(text, { osc52: (t) => this.host.osc52(t), fallbackDir: stateDir(this.loc) });
    // SLIPBOX_CLIPBOARD=file sends copies to the file on purpose; otherwise the file means no clipboard answered.
    const onPurpose = process.env.SLIPBOX_CLIPBOARD === "file";
    if (announce) this.message("info", r.file ? (onPurpose ? `copied ${text.length} characters to ${r.file}` : `clipboard unavailable — wrote ${r.file}`) : `copied ${text.length} characters`);
    return !r.file;
  }

  scratch() {
    return scratchLocation(this.loc, this.config);
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
      // A link that reaches a note by its alias resolves only now that every note is parsed (17.7).
      for (const b of this.buffers.values()) b.invalidateLayouts();
      this.relayoutAll();
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
      dirs: this.loc.mode !== "home" ? this.graph.dirs : [""],
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
    // The panes' selections are row indexes: an agent's new or deleted note, or a heading added
    // above, would move them to another item. Kept by what they select, not where.
    const keep = this.rememberSelections();
    try {
      this.applyChangesNow(batch);
    } finally {
      keep();
    }
  }

  /** What the explorer and the outline have selected; the function puts them back on it. */
  private rememberSelections(): () => void {
    const explorer = this.leftView === "explorer" ? this.explorerRows()[this.sidebar.selected]?.path : undefined;
    const rows = this.outlineShown ? this.outlineRows() : [];
    const heading = rows[this.outline.selected];
    const nth = heading ? rows.slice(0, this.outline.selected).filter((r) => r.text === heading.text).length : 0;
    return () => {
      if (explorer !== undefined) {
        const i = this.explorerRows().findIndex((r) => r.path === explorer);
        if (i >= 0) this.sidebar.selected = i;
      }
      if (heading) {
        const now = this.outlineRows();
        const same = now.map((r, i) => ({ r, i })).filter((x) => x.r.text === heading.text);
        const hit = same[Math.min(nth, same.length - 1)];
        if (hit) this.outline.selected = hit.i;
      }
    };
  }

  private applyChangesNow(batch: WatchBatch): void {
    let setChanged = false;
    if (batch.rescan) {
      this.graph.build(true, "lazy");
      this.indexInBackground();
      this.watcher?.sync(this.loc.mode !== "home" ? this.graph.dirs : [""], this.knownFromGraph(), this.sizesFromGraph());
      setChanged = true;
      // The walk itself changed: any open note may have changed, appeared or gone.
      for (const buf of this.buffers.values()) if (buf.changedOnDisk()) this.reloadBuffer(buf);
    }
    for (const c of batch.changes) {
      if (!c.isNote) {
        // An attachment appeared or went: ![[embeds]] of it change status.
        // Only a real change to the index re-lays anything out (a rewrite of a known image doesn't).
        if (c.kind === "deleted" ? this.graph.removeAsset(c.rel) : this.graph.addAsset(c.rel)) setChanged = true;
        this.graph.fileChanged(c.rel); // a data or code file's links may have changed (16.15, 16.10)
        // An open data or text file reloads like a note (16.4).
        const open = this.buffers.get(c.rel);
        if (open) this.reloadBuffer(open, c.kind === "deleted");
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
    // Back after being deleted (recreated): not deleted any more, whatever happens next.
    if (!deleted && buf.deleted && existsSync(buf.abs)) buf.deleted = false;
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
    // A selection the replace row keeps to was offsets into the old text: they mean nothing now.
    const o = this.overlay;
    if (o?.kind === "prompt" && o.replace?.range && o.view?.buf === buf) {
      // Closed rather than widened: replace-all must never reach text you didn't select.
      o.replace = undefined;
      o.change?.(o.text);
      this.message("warn", `${this.displayName(buf)} changed on disk — the replace row closed (its selection is gone); select again`);
    }
    // The reload was an undo step of its own: typing going on in it continues as one step again.
    const typing = this.allViews().find((v) => v.buf === buf && v.insert);
    if (typing) buf.beginStep(offsetOf(this, typing));
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
    const s = loadSession(this.loc);
    const defaults = uiDefaults(this.config);
    for (const [k, o] of Object.entries(s?.ui ?? {})) {
      if (!(k in defaults) || !o || typeof o !== "object") continue;
      if (JSON.stringify(defaults[k as keyof UiState]) !== JSON.stringify(o.base)) continue;
      if (typeof o.value !== typeof defaults[k as keyof UiState]) continue;
      // A value that isn't one any more (a glyph set that doesn't exist, a theme file since deleted)
      // is dropped, not kept and saved again forever.
      if (k === "glyphs" && !["nerd", "unicode", "ascii", "auto"].includes(o.value as string)) continue;
      if (k === "theme" && !listThemes().some((t) => t.name === o.value)) continue;
      (this.ui as unknown as Record<string, unknown>)[k] = o.value;
      this.uiOverrides[k] = o;
    }
  }

  private restoreSession(): boolean {
    const s = loadSession(this.loc);
    if (!s) return false;
    for (const t of s.tabs) {
      const views: View[] = [];
      for (const p of t.panes) {
        const buf = this.buffer(p.path);
        if (buf) views.push(this.makeView(buf, p.anchor, p.cursor));
      }
      if (views.length) this.tabs.push({ views, active: Math.min(t.active, views.length - 1), orientation: t.orientation ?? "side", ratio: t.ratio ?? this.config.ui.split_ratio, ...(t.pinned ? { pinned: true } : {}) });
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
        ...(t.pinned ? { pinned: true } : {}),
      })),
      activeTab: this.activeTab,
      sidebar: this.sidebar.visible,
      outline: this.outline.visible,
      sidebar_width: this.sideW,
      outline_width: this.outW,
      ui: this.uiOverrides,
      recent_commands: this.recentCommands,
      recent_notes: this.recentNotes,
      ...(this.remoteServer ? { remote_server: this.remoteServer } : {}),
    };
    saveSession(this.loc, s);
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
    // A note deleted on disk that's there again (an agent recreated it) is a change like any:
    // never written over without asking.
    if (buf.deleted && existsSync(buf.abs)) buf.deleted = false;
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
    // Not while you type, into it or any note: letters meant for the text would pick l, k, d or m.
    // It opens once typing has stopped (processKey).
    if (this.allViews().some((v) => v.insert)) {
      if (!buf.conflictWaiting) this.message("warn", `${this.displayName(buf)} changed on disk — esc, then choose what to keep`);
      buf.conflictWaiting = true;
      return;
    }
    buf.conflictWaiting = false;
    if (this.overlay) {
      // Its own prompt already open: nothing to add. Another list open: said once, not per write.
      const own = this.overlay.kind === "list" && this.overlay.title.startsWith(`${this.displayName(buf)} changed on disk`);
      if (!own && !buf.conflictWaiting) this.message("warn", `${this.displayName(buf)} changed on disk while you have unsaved changes — space n c resolves it`);
      buf.conflictWaiting = !own;
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
    buf.markers = r.conflicts > 0; // autosave must not put <<<<<<< on disk; :w does, on purpose
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
      if (buf.conflictKept || buf.markers || buf.invalidUtf8 || buf.deleted) continue;
      if (buf.changedOnDisk()) {
        this.conflictPrompt(buf);
        continue;
      }
      if (this.writeBuffer(buf, buf.contentToSave(), true)) this.message("info", `autosaved ${this.displayName(buf)}`);
    }
    if (later) this.scheduleAutosave();
    this.publishDirty();
  }

  /** git is mid-commit (or mid-anything) in the vault's repository. Looked up each time: it runs
   *  only when an autosave is due, and a repository can appear. */
  private gitIndexLocked(): boolean {
    for (let d = this.loc.root; ; d = dirname(d)) {
      const dotGit = join(d, ".git");
      if (existsSync(dotGit)) {
        // A worktree or submodule has a .git file pointing at its git directory.
        let gitDir = dotGit;
        try {
          if (statSync(dotGit).isFile()) {
            const m = /^gitdir:\s*(.+)$/m.exec(readRegular(dotGit, SMALL_FILE).toString("utf8"));
            if (m) gitDir = resolve(d, m[1]!.trim());
          }
        } catch {}
        return existsSync(join(gitDir, "index.lock"));
      }
      if (dirname(d) === d) return false;
    }
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    try {
      writeDirty(this.loc, []);
    } catch {}
    this.watcher?.close();
    this.stopLazy?.();
    if (this.stateTimer) clearTimeout(this.stateTimer);
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
/** Notes the switcher lists first, most recent first. */
const RECENT_NOTES_MAX = 30;
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

/** Whether layout row `r` is left out of the drawing (an oversized lens's hidden rows). */
export function isHidden(hidden: [number, number][], r: number): boolean {
  for (const [a, b] of hidden) if (r >= a && r < b) return true;
  return false;
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

export function computeFind(layout: Layout, query: string, current = 0, whole = false, regex = false, ignoreCase = false): FindState {
  const matches: FindState["matches"] = [];
  let error: string | undefined;
  if (query) {
    // Match on the original text (never a lowercased copy, whose length can differ: "İ"), with
    // smart case, plain text unless regex is on, whole words when asked (core/replace.ts).
    const re = compilePattern(query, { regex, whole, ignoreCase });
    if (typeof re === "string") error = re;
    else {
      layout.lines.forEach((line, row) => {
        if (line.decor) return; // the lens's rules aren't the note's text
        const text = line.spans.map((s) => s.text).join("");
        for (const m of findAll(text, re)) matches.push({ row, col: stringWidth(text.slice(0, m.from)), len: stringWidth(text.slice(m.from, m.to)) });
      });
    }
  }
  return { query, matches, current: Math.min(current, Math.max(0, matches.length - 1)), whole, regex, error };
}
