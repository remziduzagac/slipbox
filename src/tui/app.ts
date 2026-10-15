// The TUI app model (plan 3.x; keymap in docs/manual/keys.md): tabs of one or two windows over
// shared buffers, a reading cursor with selection, the explorer and outline panes, overlays,
// history, link-following, find, the which-key popup, UI settings, live reload from the watcher
// (5.1–5.4), and live reload of the configuration itself.
//
// Notes are written only through writeBuffer (atomic, inside the vault, the watcher told); besides
// them, its own state (reading positions, session) and the scratch, through core.
//
// This module does not import OpenTUI. It draws through `Canvas` and talks to the terminal
// through `Host`; tui/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { DOCUMENT_GRAMMARS, grammarFor } from "../core/syntax.ts";
import { onLoaded } from "../core/lazy.ts";
import { classify, extensionOf } from "../core/filetypes.ts";
import { accessSync, appendFileSync, constants as fsConstants, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { climbsOut, landsInside, WriteRefused, writeNote } from "../core/fsutil.ts";
import { writeDirty } from "../core/stale.ts";
import { placeAt, stopInsert } from "./editing.ts";
import { newVimState } from "./vim.ts";
import type { ReplaceState } from "./replacing.ts";
import { homedir } from "node:os";
import { copyText, readClipboard } from "../core/clipboard.ts";
import { CommandRegistry, type Keymap } from "../core/commands.ts";
import { type Config, loadConfig } from "../core/config.ts";
import type { Glyphs } from "../core/glyphs.ts";
import type { Graph } from "../core/graph.ts";
import { lintCommand } from "../core/lint.ts";
import { type Layout, posOfSrc, srcAt } from "../core/layout/ir.ts";
import { stateDir } from "../core/paths.ts";
import { type Anchor, type CursorAnchor, loadSession, PositionStore, TOP } from "../core/position.ts";
import type { Role, Theme } from "../core/theme/index.ts";
import { Reach } from "../core/reach.ts";
import { type Peek, vaultGraph } from "./peek.ts";
import type { DiffWindow } from "./diffview.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import { configFilesFor, isInside, vaultAt, vaultOf, recordLocation, type VaultLocation } from "../core/vault.ts";
import { VaultFeed } from "../core/vault-feed.ts";
import type { VaultWatcher } from "../core/watch.ts";
import type { SnippetSession } from "./snippets.ts";
import type { CompletionState, SignatureState } from "./completion.ts";
import { sanitize } from "../core/sanitize.ts";
import { truncate } from "../core/width.ts";
import { registerActions } from "./actions.ts";
import type { SaveAsOverlay } from "./saveas.ts";
import { NoteBuffer } from "./buffer.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { clampPos, type Pos } from "./cursor.ts";
import { drawApp, type Geometry } from "./draw.ts";
import { Settings } from "./settings.ts";
import { Pictures } from "./pictures.ts";
import { Languages } from "./languages.ts";
import { Git } from "./git.ts";
import { Search } from "./search.ts";
import { Views } from "./views.ts";
import { Lens, type LiveBase } from "./lens.ts";
import { Code } from "./code.ts";
import { Handoff } from "./handoff.ts";
import { Windows } from "./windows.ts";
import { Files } from "./files.ts";
import { Panels, type LeftView, type RightView } from "./panels.ts";
import { Footnotes } from "./footnotes.ts";
import { Properties } from "./properties.ts";
import { Overlays } from "./overlays.ts";
import { Problems } from "./problems.ts";
import { Info } from "./info.ts";
import { Linking } from "./linking.ts";
import { Explorer } from "./explorer.ts";
import { History } from "./history.ts";
import { OutlineView } from "./outline.ts";
import { Input } from "./input.ts";
import { Mouse } from "./mouse.ts";
import { Exporter } from "./exporter.ts";
import { Scratch } from "./scratch.ts";
import { Watch } from "./watch.ts";
import { Session } from "./session.ts";
import { Saving } from "./saving.ts";
import { Vaults, carried } from "./vaults.ts";
import { Renaming } from "./renaming.ts";
import { Speller } from "./spelling.ts";

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
  /** Pictures (12.x), as the renderer finds them: whether the terminal draws images (Kitty graphics, sixel), an image
   *  file's size in pixels (null when it isn't one), and a cell's size in pixels (null until the terminal says).
   *  Absent: no pictures, `▣ alt` the floor. */
  images?: {
    supported(): boolean;
    size(path: string): { width: number; height: number } | null;
    cell(): { width: number; height: number } | null;
    /** Whether pictures are drawn as Unicode placeholders (12.7): text that scrolls — then never held back. */
    placeholders?(): boolean;
  };
  /** The network, for pictures on the internet (12.12): fetch's own, unless the host stands in (the tests' never
   *  reaches it). */
  fetch?(url: string, init: RequestInit): Promise<Response>;
}

export type Level = "info" | "warn" | "error";

export interface Message {
  level: Level;
  text: string;
  at: number;
  /** When its box was first drawn: its time to show counts from then (#40). */
  shown?: number;
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
  /** Its pictures (12.7): the top they were last drawn at, when it last scrolled, and whether they wait for it to rest. */
  pictures?: { top: number; at: number; wait: boolean };
  cur: Pos;
  /** Column to return to when moving through shorter rows. */
  goal: number;
  sel: Selection | null;
  visual: "char" | "line" | null;
  /** The text version the cursor's anchor was last re-derived at (layoutFor). */
  anchorVersion?: number;
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
  /** How far each code block that scrolls sideways is scrolled (`[render] code_wrap`), by its key (codeBlocks), while
   *  the window shows `buf`: another note shown, they start from the left again. */
  codeLeft?: { buf: NoteBuffer; at: Map<string, number> };
  /** A code block scrolled by the mouse (its wheel, its scrollbar): it stays where the mouse left it, the cursor in it
   *  out of sight or not, until the cursor next moves. */
  codeWheeled?: boolean;
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
  /** The lines the next lens opens on (a code cell's, 24.13), not the cursor's block. */
  lensRange?: [number, number];
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

/** Where to log each command run, for the terminal tests' coverage: `SLIPBOX_TRACE` (run.ts adds a `key` line for
 *  each key handled). */
const TRACE = process.env.SLIPBOX_TRACE;

/** A window whose text can be edited: source mode or live preview. */
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
  /** The label's colour (a diff's lines, a change's state), when not the list's. */
  role?: Role;
  detail?: string;
  /** Where to mark `detail` (UTF-16 ranges): a search hit's words. */
  detailMarks?: [number, number][];
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
  /** Shown for where the matches are (a tree's parents): the selection starts past it. */
  context?: boolean;
  data: unknown;
}

export interface ListOverlay {
  kind: "list";
  title: string;
  input: string;
  filterable: boolean;
  items: ListItem[];
  /** Items computed from the input instead of filtering `items` (the `:` prompt); null: `items` filtered. */
  source?: (input: string) => ListItem[] | null;
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
  /** With `anchor`: a menu — as narrow as its entries, from the cell's column (the explorer's …). */
  menu?: boolean;
  /** A tree's ← / →: fold or unfold the selected item (true when something changed; `source`
   *  then gives the rows again). */
  fold?: (item: ListItem, open: boolean) => boolean;
  /** `ctrl+a`: widen what the list covers (search: more vaults, 20.16); `source` then gives it again. */
  widen?: () => void;
}

export interface PromptOverlay {
  kind: "prompt";
  label: string;
  text: string;
  /** A yes-or-no question: `y` answers yes (`accept`), `n` or `esc` no (`cancel`); nothing typed. */
  confirm?: boolean;
  change?: (text: string) => void;
  accept: (text: string) => void;
  cancel?: () => void;
  /** Find's prompt: typed in that window's own find row, not on the bottom line. */
  view?: View;
  /** Find's replace field, when open (ctrl+h, space f r; tab from the find field). */
  replace?: ReplaceState;
  /** A find across files (25.4): the window whose find toggles it uses — alt+r, alt+w flip them — and its label. */
  toggles?: { view: View; label: () => string };
}

export type Overlay = ListOverlay | PromptOverlay | SaveAsOverlay;

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

export type Region = "content" | "sidebar" | "outline" | "problems";

/** Live UI settings (docs/manual/keys.md, `space u`). */
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
  /** The problems bar beside the text (19.9), and the problems' text marked (19.10). */
  problems_bar: boolean;
  /** The least severity underlined in the text (`off`: none); the Problems panel's choice is marked whatever it is. */
  problem_marks: "off" | "error" | "warning" | "info";
  /** How the code view draws a cell (24.13): in a box, or on a band. */
  code_cells: "box" | "band";
  /** A code block too wide for the window (`[render] code_wrap`): scrolled sideways on its own, or wrapped. */
  code_wrap: "scroll" | "wrap";
  /** Misspelt words marked in notes (25.6). */
  spell: boolean;
  /** Where the scratch shows (#43): floating over the windows, or in the window on the right. */
  scratch_in: "float" | "right";
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
    problems_bar: c.diagnostics.bar !== "off",
    problem_marks: c.diagnostics.marks,
    code_cells: c.render.code_cells,
    code_wrap: c.render.code_wrap,
    spell: c.spell.enabled,
    scratch_in: c.capture.open_in,
    // "auto": URLs where colour can't mark links (NO_COLOR), as in `slipbox render`.
    urls: c.render.show_urls === "always" || (c.render.show_urls === "auto" && !!process.env.NO_COLOR),
    theme: c.theme,
    glyphs: c.render.glyphs,
  };
}

/** Why a folder can't be read, in a few words (VV-D5); null when it can. */
export function folderUnreadable(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) return "it isn't a folder";
    // Listed (read) and gone into (searched): both, as the account running slipbox may.
    accessSync(dir, fsConstants.R_OK | fsConstants.X_OK);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") return "you may not read it (no permission)";
    if (code === "ENOENT") return "it isn't there";
    if (code === "ENOTDIR") return "it isn't a folder";
    return code ?? (err as Error).message;
  }
}

/** Why a file can't be written, when it can be read (VV-D5): not by you, or not in its folder; null when it can. */
export function fileUnwritable(path: string): string | null {
  try {
    accessSync(path, fsConstants.W_OK);
    // A save writes beside it and renames it over the file: its folder must take that.
    accessSync(dirname(path), fsConstants.W_OK);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM" || code === "EROFS"
      ? code === "EROFS"
        ? "its disk is read-only"
        : "you may not write it (no permission)"
      : null;
  }
}
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
  /** The folder slipbox was opened on, inside its vault: the explorer's view starts there (VV-D5). */
  folder?: string;
  /**
   * The root already recorded as seen, and what that found (21.8): the TUI's start records it before
   * the graph opens, so a moved folder's cache is adopted first. Left out, the App records it itself.
   */
  recorded?: { carriedFrom: string | null };
}

export class App {
  /** The root the TUI is in; it changes when a link or the explorer leads into another (17.10). */
  loc: VaultLocation;
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
  footnoteKeys!: Keymap;
  infoKeys!: Keymap;
  resizeKeys!: Keymap;
  /** The peek's own keys (VV-D7), over the note's while one is open: o, t, z. */
  peekKeys!: Keymap;
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
  /** What the right panel shows (3.17); `outline` is its state, whichever view that is. */
  rightView: RightView = "outline";
  /** The panel's keys: the explorer's (as configured), and tab / shift+tab between its tabs. */
  problemsKeys!: Keymap;
  outline: SidePaneState & { folded: Set<number>; forKey: string };
  overlay: Overlay | null = null;
  pending: string[] = [];
  messages: Message[] = [];
  /** The messages showing as floating boxes, newest first (each for 4 s, 8 s an error, from when it's first drawn). */
  toasts: Message[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** The newest message still showing. */
  get transient(): Message | null {
    return this.toasts[0] ?? null;
  }
  width = 80;
  height = 24;
  geometry: Geometry | null = null;
  positions: PositionStore;
  /** Other roots, reached by paths out of this root and by pointers (`slipbox://name/…`), and their backlinks. */
  reach: Reach;
  watcher: VaultWatcher | null = null;
  ui: UiState;
  private drawFailed = false;
  /** The terminal's title as last told (host.setTitle). */
  private termTitle: string | null = null;

  /** Commands run from the palette or help, most recent first (kept in the session). */
  recentCommands: string[] = [];
  readonly configFile: string | undefined;
  readonly now: () => number;
  quitting = false;
  indexing = 0;
  /** Watching, polling and indexing in the background (off in tests that drive time themselves). */
  readonly live: boolean;
  /** `--theme`: kept over a vault's own theme when switching vaults. */
  readonly explicitTheme: string | undefined;
  /** The configuration: keys, theme, glyphs, the UI settings, and live reload. */
  readonly settings = new Settings(this);
  /** Pictures (12.x): drawn, fetched, and held back while a view scrolls. */
  readonly pictures = new Pictures(this);
  /** Syntax, language servers, linters, and the trust they need. */
  readonly languages = new Languages(this);
  /** Source control: git's view of the files, its diffs, branches and commits. */
  readonly git = new Git(this);
  /** Search: the index and its list, tags and types, replace across notes. */
  readonly search = new Search(this);
  /** Views: layout, anchors, cursor and selection, scrolling. */
  readonly views = new Views(this);
  /** The lens, live preview and source mode. */
  readonly lens = new Lens(this);
  /** Code blocks scrolled sideways, and the code view's cells. */
  readonly code = new Code(this);
  /** Hand-offs to an editor or an agent. */
  readonly handoff = new Handoff(this);
  /** Windows and tabs. */
  readonly windows = new Windows(this);
  /** File operations: new, rename, move, copy, delete, the trash. */
  readonly files = new Files(this);
  /** The side panels: widths, rails, views, filters, resize mode. */
  readonly panels = new Panels(this);
  /** The footnotes view. */
  readonly footnotes = new Footnotes(this);
  /** The properties editor. */
  readonly properties = new Properties(this);
  /** Lists, prompts, dialogs, and the floating window's closing. */
  readonly overlays = new Overlays(this);
  /** The Problems panel and the problems marked in the text. */
  readonly problems = new Problems(this);
  /** The Info view. */
  readonly info = new Info(this);
  /** Links under the cursor, and links inserted. */
  readonly linking = new Linking(this);
  /** The explorer: its tree, its view and breadcrumb, its keys. */
  readonly explorer = new Explorer(this);
  /** Each window's history, the notes read lately, and the history view. */
  readonly history = new History(this);
  /** The outline view and the breadcrumb. */
  readonly outlineView = new OutlineView(this);
  /** Keys and pastes: dispatch, sequences, the which-key popup. */
  readonly input = new Input(this);
  /** The mouse: clicks, drags, the wheel. */
  readonly mouse = new Mouse(this);
  /** Export: notes, a format, a place. */
  readonly exporter = new Exporter(this);
  /** Spelling: checkers, misspelt words, suggestions. */
  readonly speller = new Speller(this);
  /** The scratch and capture. */
  readonly scratch = new Scratch(this);
  /** The watcher, polling, indexing in the background, and reloads. */
  readonly watch = new Watch(this);
  /** The session kept and restored, and the state published for the CLI. */
  readonly session = new Session(this);
  /** Saving, autosave, conflicts with the disk, and leaving. */
  readonly saving = new Saving(this);
  /** Vaults: switching, making and unmaking, named folders. */
  readonly vaults = new Vaults(this);
  /** Renames and their previews. */
  readonly renaming = new Renaming(this);

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.explorer.top = this.explorer.trail = opts.loc.root;
    this.config = opts.config;
    this.graph = opts.graph;
    // This machine sees the root (17.6); a named folder moved here by hand brought its state (21.8).
    const { carriedFrom } = opts.recorded ?? recordLocation(opts.loc);
    this.reach = new Reach(opts.loc);
    this.graph.reach ??= this.reach;
    this.languages.lintCmd = lintCommand(opts.config.lint, opts.loc.root, undefined, opts.config.lsp.auto_install);
    this.host = opts.host;
    this.configFile = opts.configFile;
    this.live = opts.watch !== false;
    this.watch.followGraph();
    this.explicitTheme = opts.themeName;
    // Each config file's last good contents, so a typo saved mid-edit keeps what it said (reload).
    this.settings.origins = loadConfig({
      ...configFilesFor(opts.loc),
      configFile: opts.configFile,
      lastGood: this.settings.lastGood,
    }).origins;
    this.now = opts.now ?? Date.now;
    this.feed = new VaultFeed({
      checkout: () => this.git.checkout,
      graph: () => this.graph,
      now: () => this.now(),
      locked: () => this.git.indexLocked(),
      apply: (b) => {
        this.watch.applyChanges(b);
        this.host.requestRender();
      },
      headMoved: (was, now, moves) => this.git.headMoved(was, now, moves),
      gitNews: () => this.git.refresh(),
    });
    this.ui = uiDefaults(opts.config);
    if (opts.themeName) this.ui.theme = opts.themeName;
    if (process.env.NO_COLOR) this.ui.theme = "mono";
    this.sidebar = { visible: opts.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.panels.sideW = opts.config.ui.sidebar_width;
    this.panels.outW = opts.config.ui.outline_width;
    this.outline = {
      visible: opts.config.ui.outline,
      overlay: false,
      selected: 0,
      scroll: 0,
      folded: new Set(),
      forKey: "",
    };
    this.positions = new PositionStore(this.loc);
    registerActions(this);
    this.settings.applyKeys();
    for (const w of opts.warnings ?? []) this.message("warn", w);
    for (const e of this.graph.errors) this.message("warn", e);
    if (carriedFrom) this.message("info", carried(this.loc, carriedFrom));

    this.recentCommands = (loadSession(this.loc)?.recent_commands ?? [])
      .filter((id) => typeof id === "string")
      .slice(0, RECENT_MAX);
    this.handoff.remoteServer = loadSession(this.loc)?.remote_server;
    this.history.recentNotes = (loadSession(this.loc)?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
    this.session.restoreUiOverrides();
    if (opts.themeName) this.ui.theme = opts.themeName; // an explicit theme beats a remembered one
    const restored = !opts.open && this.config.ui.restore_session && this.session.restore();
    this.settings.applyTheme();
    this.glyphs = this.settings.glyphSet(this.ui.glyphs);
    if (!restored) {
      const first = opts.open ?? this.defaultNote();
      if (first) this.openInNewTab(first);
    }
    // The view starts at the folder opened (VV-D5): `x/y` shows y, in vault x — set once its notes are open, so
    // the one shown, outside it, leaves it be. A folder that can't be read says why.
    const opened = opts.folder ?? (opts.open ? null : this.loc.root);
    const unreadable = opened ? folderUnreadable(opened) : null;
    if (unreadable) this.message("warn", `can't read ${tildePath(opened!)}: ${unreadable}`);
    else if (opts.folder && opts.folder !== this.loc.root && isInside(this.loc.root, opts.folder))
      this.explorer.zoomTo(opts.folder);
    if (!this.tabs.length && !unreadable) this.message("info", `no notes in ${this.loc.root}`);
    // Moved here by hand, its state along (21.8): the links the move broke, their fix previewed (20.17).
    if (carriedFrom) this.vaults.offerMovedRelink();
    // A second copy of this folder (21.6): which one links open, asked once.
    if (!this.overlay) this.vaults.askDefaultCopy();
    // A grammar (or anything lazy) that finished loading: lay out again and draw.
    this.stopLazy = onLoaded((name) => {
      this.graph.grammarsChanged(); // code files' comment links can be read now (16.10)
      // Notes drawn while it loaded (a Mermaid diagram as its code, 12.10): drawn again — those only.
      for (const b of this.buffers.values()) b.arrived(name);
      this.relayoutAll();
      this.host.requestRender();
    });
    this.session.publishState();
    this.settings.recordStamps();
    if (opts.watch !== false) {
      this.languages.startServers();
      if (this.config.watch.enabled) this.watch.startWatcher();
      this.watch.startPolling();
      this.watch.indexInBackground();
      this.git.refresh();
      this.watch.startAutoIndex();
      this.loadCodeGrammars();
    }
  }

  /**
   * The vault's code files' grammars, loaded in the background (20.19): their comments' links count
   * as backlinks, and a rename or move rewrites them — laid out again once they're in.
   */
  loadCodeGrammars(): void {
    const g = this.graph;
    void g.loadGrammars().then(() => {
      if (this.graph !== g || this.quitting) return;
      for (const b of this.buffers.values()) b.invalidateLayouts();
      this.relayoutAll();
      this.host.requestRender();
    });
  }

  relayoutAll(): void {
    for (const v of this.allViews()) v.layoutKey = "";
  }

  /** Widths count another way now (the terminal's answer, `setWidthMethod`): every layout made again. */
  widthsChanged(): void {
    for (const b of this.buffers.values()) b.invalidateLayouts();
    this.relayoutAll();
    this.explorer.invalidateTree();
    this.host.requestRender();
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

  /** Drop the messages whose time is up, and wake again when the next one's is. One not drawn yet keeps its time:
   *  said while slipbox was busy (a start indexing, a slow machine), it isn't gone before it's seen (#40). */
  private scheduleToasts(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    const now = this.now();
    const ends = (t: Message) => (t.shown ?? now) + this.toastMs(t);
    this.toasts = this.toasts.filter((t) => ends(t) > now);
    const drawn = this.toasts.filter((t) => t.shown !== undefined);
    if (!drawn.length) return;
    const next = Math.min(...drawn.map(ends)) - now;
    this.toastTimer = setTimeout(
      () => {
        this.scheduleToasts();
        this.host.requestRender();
      },
      Math.max(10, next),
    );
    (this.toastTimer as { unref?: () => void }).unref?.();
  }

  /** The messages a frame has just drawn: their time begins, those not drawn before. */
  toastsDrawn(drawn: Message[]): void {
    const now = this.now();
    let fresh = false;
    for (const t of drawn) if (t.shown === undefined) (t.shown = now), (fresh = true);
    if (fresh) this.scheduleToasts();
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
    // The floating editor (3.20), while it's open, is the window the keys and commands act on.
    if (this.floating) return this.floating.view;
    return this.tabView;
  }

  /** The tab's active window: the one under the floating window while that is open. */
  get tabView(): View | null {
    const t = this.tab;
    return t ? (t.views[t.active] ?? null) : null;
  }

  defaultNote(): string | null {
    const notes = [...this.graph.notes.keys()];
    for (const pref of ["index.md", "README.md", "readme.md", "home.md"]) if (notes.includes(pref)) return pref;
    return notes[0] ?? null;
  }

  /** Buffer for a vault-relative or absolute path. Keyed by path, not graph membership. */
  buffer(pathOrRel: string): NoteBuffer | null {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.loc.root, pathOrRel);
    const relRaw = relative(this.loc.root, abs);
    const inside = !climbsOut(relRaw);
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
      // A path in the vault that a symlink leads out of: not a file of the vault (the walk leaves
      // it out, the CLI refuses it), so nothing from outside is read through it.
      if (inside && !landsInside(this.loc.root, abs)) {
        this.message("warn", `${relRaw} points outside the vault; not opening it`);
        return null;
      }
      buf = new NoteBuffer(rel, abs, key);
      buf.kind = kind;
      if (!inside) this.markElsewhere(buf);
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
      // A file you may read but not write opens all the same, read-only, and says so (VV-D5); another vault's is
      // read-only here already, for its own reason.
      const locked = buf.elsewhere ? null : fileUnwritable(abs);
      if (locked) {
        buf.readOnly = `${tildePath(buf.key)} is read-only: ${locked}`;
        this.message("info", buf.readOnly);
      }
      this.buffers.set(key, buf);
    }
    return buf;
  }

  /**
   * Another vault's file opened here — a tab kept from a peek (VV-D7), back with the session: read-only, editing it
   * being going there, marked with its vault's name, its links read in its vault. The scratch is slipbox's own.
   */
  private markElsewhere(buf: NoteBuffer): void {
    if (buf.abs === this.scratch.location().path) return;
    // Its vault: a marker's, or home (VV-D2).
    const root = vaultOf(buf.abs);
    if (!root || root === this.loc.root) return;
    const label = rootLabel(vaultAt(root));
    const graph = vaultGraph(this, root);
    buf.elsewhere = { vault: label, graph, rel: graph ? relative(root, buf.abs) : null };
    buf.readOnly = `read-only here: ${label}'s — go into ${label} to edit it`;
  }

  makeView(buf: NoteBuffer, anchor?: Anchor, cursor?: CursorAnchor): View {
    const topAnchor = anchor ?? this.positions.get(buf.key) ?? { ...TOP };
    const curAnchor =
      cursor ??
      (anchor
        ? { anchor, sub: 0, col: 0 }
        : (this.positions.getCursor(buf.key) ?? { anchor: topAnchor, sub: 0, col: 0 }));
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
      ...(this.canRender(buf) ? {} : (this.lens.saySourceWhy(buf), { source: true })),
    };
  }
  /** Completion's popup while typing (19.16), and the signature being typed. */
  completion: CompletionState | null = null;
  signature: SignatureState | null = null;

  // -------------------------------------------------------------------------------------------
  // Git (5.9, 5.10): what git does to the vault's files as one event — a branch switch, a merge, a
  // reset. The watcher's batches are held while git holds its index lock, then applied together;
  // the files a branch switch brings and takes aren't taken for moves; each branch keeps its tabs.

  /** The watcher's news, held while git writes, applied to the graph (5.9, 5.10). */
  readonly feed: VaultFeed;

  private stopLazy: (() => void) | null = null;

  /** Whether a file has a rendered view: markdown notes do, data files while they parse
   *  (16.11–16.14), text files never. */
  canRender(buf: NoteBuffer): boolean {
    if (buf.drawn) return true; // a layout of its own (a diff)
    if (buf.kind.group === "data") return !buf.parsed.error;
    return buf.kind.group === "note" || this.isCodeDocument(buf); // every note format has a reader (16.2)
  }

  /** Code that renders as a document (24.x): a language the view maps, unless `[render] code` says source. */
  isCodeDocument(buf: NoteBuffer): boolean {
    if (buf.kind.group !== "text" || this.config.render.code !== "document") return false;
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    return !!g && DOCUMENT_GRAMMARS.has(g);
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    if (this.vaults.intoOther(path, anchor)) return;
    const buf = this.buffer(path);
    if (!buf) return;
    this.history.touchRecent(buf.key);
    this.tabs.push({
      views: [this.makeView(buf, anchor)],
      active: 0,
      orientation: "side",
      ratio: this.config.ui.split_ratio,
    });
    this.activeTab = this.tabs.length - 1;
    this.region = "content";
    this.explorer.reveal(undefined, false, true); // gone there: the view zooms out to hold it (VV-D5)
  }

  /** Switch to a tab already showing this note, or open it in a new one. */
  openOrSwitchTab(path: string): void {
    if (this.vaults.intoOther(path)) return;
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
    // From the floating editor (a link in the properties): it closes first, and the window under it opens it.
    if (this.floating) {
      const from = view === this.floating.view;
      if (!this.overlays.closeFloating()) return;
      if (from) view = this.view;
    }
    if (!view) return this.openInNewTab(path, anchor);
    if (this.vaults.intoOther(path, anchor)) return;
    const buf = this.buffer(path);
    if (!buf) return;
    // A pinned tab keeps its note: another one opens in a new tab.
    if (buf !== view.buf && this.tabs.find((t) => t.views.includes(view))?.pinned)
      return this.openInNewTab(path, anchor);
    this.history.touchRecent(buf.key);
    this.history.push(view);
    if (buf === view.buf && anchor) {
      this.history.jumpTo(view, anchor);
      return;
    }
    this.history.remember(view);
    const before = view.buf;
    if (view.insert) stopInsert(this, view);
    Object.assign(view, this.makeView(buf, anchor), { back: view.back, fwd: [] });
    this.lens.fitMode(view, before);
    this.region = "content";
    this.explorer.reveal(undefined, false, true);
  }

  currentLayout(view: View): Layout {
    return this.views.layoutFor(view, view.width, this.views.gutterWidth(view));
  }

  /** Move the cursor (extending the selection when asked, or in visual mode). */
  moveCursor(view: View, to: Pos, opts: { extend?: boolean; keepGoal?: boolean } = {}): void {
    this.outline.pinned = false; // the outline follows the cursor's section again
    const layout = this.currentLayout(view);
    const extend = opts.extend || view.visual !== null;
    if (extend && !view.sel) this.views.select(view, { ...view.cur }, view.visual === "line");
    if (!extend && view.sel && !view.visual) view.sel = null;
    view.cur = clampPos(layout, to);
    view.codeWheeled = false;
    view.curAnchor = this.views.cursorAnchorFor(layout, view.cur);
    // The selection's lines, kept after it ends: `:'<,'>s` works on the last one, as vim's marks.
    if (view.sel) this.views.markSelection(view, layout);
    this.views.ensureCursorVisible(view, layout);
    // The column on screen, once a code block the cursor is in has scrolled to it.
    if (!opts.keepGoal) view.goal = this.code.screenCol(view, layout, view.cur.row, view.cur.col);
  }

  /** Write a buffer's file and take the result back in; false (with a message) if refused. */
  writeBuffer(buf: NoteBuffer, content: string | Uint8Array, saving = false): boolean {
    // A vault note stays inside the vault; a file from outside it (the scratch) inside its folder.
    const root = buf.rel !== null ? this.loc.root : dirname(buf.abs);
    let written: ReturnType<typeof writeNote>;
    try {
      written = writeNote(root, buf.abs, content);
    } catch (err) {
      this.message(
        "error",
        err instanceof WriteRefused ? err.message : `can't write ${buf.key}: ${(err as Error).message}`,
      );
      return false;
    }
    // Stamped as written: an agent's write landing right after is a change, not ours.
    if (buf.rel !== null) this.watcher?.noteOwnWrite(buf.rel, written);
    this.git.refresh();
    // The index learns what we wrote (the watcher skips our own writes): the note's links, for
    // backlinks, and its stamp — a later watcher resync from the index must not take our own
    // save for someone else's change.
    if (buf.rel !== null && this.graph.notes.has(buf.rel))
      this.graph.updateFile(buf.rel, { rel: buf.rel, abs: buf.abs, size: written.size, mtimeMs: written.mtimeMs });
    else if (buf.rel !== null) this.graph.fileChanged(buf.rel);
    if (saving) {
      // The text on disk is what's in the buffer: keep it, its history and every cursor.
      buf.deleted = false;
      buf.markSaved(written);
      this.languages.servers?.save(buf.abs, buf.source);
      return true;
    }
    buf.load();
    for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = ""; // keeps the anchors (3.5)
    return true;
  }

  /** The source line under the cursor (the span's it's on): where a hand-off opens the note. */
  cursorLine(view: View): number {
    const line = this.currentLayout(view).lines[view.cur.row];
    return line ? srcAt(line, view.cur.col) : 1;
  }
  /** Home, for an export's places and `~/` (a test's own, never yours). */
  home = homedir();

  // The floating editor (3.20): a view over the windows, of text that isn't a file of its own — a
  // note's frontmatter — with every editing key there is; closed (esc, q, :q) or saved (ctrl+s,
  // :w), its text goes back where it came from, as one undo step there.

  floating:
    | ((
        | { kind: "properties"; note: NoteBuffer; format: "yaml" | "toml"; original: string }
        | { kind: "hover" }
        | { kind: "commit"; amend: boolean; from: Region }
        | { kind: "scratch" }
        | { kind: "diff"; diff: DiffWindow }
        | { kind: "peek"; peek: Peek }
      ) & { view: View; title: string })
    | null = null;

  /**
   * A file opened at a line (the Problems panel's All, 1.7): in this window, in a tab — its own, or the one
   * showing it, a place pushed onto that window's history — or in the split's other window.
   */
  openWhere(rel: string, line: number, where: "here" | "tab" | "split"): void {
    if (where === "tab") {
      const shown = this.tabs.some((t) => t.views.some((v) => v.buf.rel === rel));
      this.openOrSwitchTab(rel);
      if (shown && this.view?.buf.rel === rel) this.history.push(this.view);
      return;
    }
    if (where === "split") this.windows.other();
    this.open(rel, { heading: null, headingIndex: 0, offset: 0, line });
  }

  /**
   * Open a file at a line and column (1-based; the column in code points): rendered, at the start of
   * the line's row — a rendered row has no source columns; in source mode, on the column.
   */
  openAt(rel: string, line: number, column = 1, where: "here" | "tab" | "split" = "here"): void {
    this.openWhere(rel, line, where);
    const v = this.view;
    if (v && v.buf.rel === rel) this.placeAtLine(v, line, column);
    this.region = "content";
    if (this.panels.narrow || this.ui.zen) this.sidebar.overlay = false;
  }

  /**
   * The cursor onto a source line (1-based; the column in code points): rendered, onto that line's
   * text — at its row's start, or inside a paragraph joined from several lines; in source mode, on
   * the column. A rendered row has no source columns: the column counts there only in source mode.
   */
  placeAtLine(v: View, line: number, column = 1): void {
    {
      const layout = this.currentLayout(v);
      const row = layout.lines.findIndex((l) => l.src === line && !l.decor);
      // Rendered: inside a paragraph joined from several lines, onto that line's text.
      const inside = row < 0 && !v.source ? posOfSrc(layout.lines, line) : null;
      if (inside && !layout.lines[inside.row]!.srcMap) this.moveCursor(v, inside);
      else if (row >= 0 && !layout.lines[row]!.srcMap) this.moveCursor(v, { row, col: 0 });
      else {
        const start = v.buf.lineStarts()[line - 1] ?? 0;
        const end = v.buf.source.indexOf("\n", start);
        const text = v.buf.source.slice(start, end < 0 ? undefined : end);
        placeAt(this, v, start + [...text].slice(0, Math.max(0, column - 1)).join("").length);
      }
    }
  }

  async run(spec: string): Promise<void> {
    // The terminal tests' coverage (tests/terminal): every command run, one id per line.
    if (TRACE) appendFileSync(TRACE, `${spec.split(" ")[0]}\n`);
    if (!(await this.registry.run(this, spec))) this.message("error", `unknown command: ${spec}`);
  }

  /** Remember a command run from the palette or help, for the palette's "Recent" group. */
  noteRecent(id: string): void {
    this.recentCommands = [id, ...this.recentCommands.filter((x) => x !== id)].slice(0, RECENT_MAX);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  draw(canvas: Canvas): void {
    this.width = canvas.width;
    this.height = canvas.height;
    this.panels.fixRegion();
    // The terminal's title follows what's on screen: the file, else the folder open. Sanitized: a
    // name's control characters would end the title's escape sequence and write to the terminal.
    const title = sanitize(`slipbox — ${this.view?.buf.key ?? this.loc.root}`);
    if (title !== this.termTitle) {
      this.termTitle = title;
      this.host.setTitle?.(title);
    }
    try {
      this.geometry = drawApp(this, canvas);
    } catch (err) {
      // A drawing bug must never take the app down: report it, and say so on screen too (the
      // message line may be what failed to draw).
      const text = `drawing failed: ${(err as Error).message}`;
      if (!this.drawFailed) this.message("error", text);
      this.drawFailed = true;
      canvas.fill(0, 0, canvas.width, canvas.height, null);
      drawText(canvas, 0, 0, truncate(`slipbox: ${text} — resize, or esc`, canvas.width), {
        fg: "default",
        bg: null,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        dim: false,
      });
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

  /** Text on the clipboard; said so (`what` names it: "copied <what>"), unless `announce` is false. */
  copy(text: string, announce = true, what = `${text.length} characters`): boolean {
    const r = copyText(text, { osc52: (t) => this.host.osc52(t), fallbackDir: stateDir(this.loc) });
    // SLIPBOX_CLIPBOARD=file sends copies to the file on purpose; otherwise the file means no clipboard answered.
    const onPurpose = process.env.SLIPBOX_CLIPBOARD === "file";
    if (announce)
      this.message(
        "info",
        r.file
          ? onPurpose
            ? `copied ${what} to ${r.file}`
            : `clipboard unavailable — wrote ${r.file} (${what})`
          : `copied ${what}`,
      );
    return !r.file;
  }

  /** A server's snippet being typed through (25.8): its stops. */
  snippet: SnippetSession | null = null;

  /** The command your shell is running (25.7): one at a time. */
  shellJob: { command: string; stop: () => void } | null = null;

  allViews(): View[] {
    return [...this.tabs.flatMap((t) => t.views), ...(this.floating ? [this.floating.view] : [])];
  }

  displayName(buf: NoteBuffer): string {
    // Another vault's file read here (VV-D7): by that vault's name and its path there; outside every vault, its path.
    const e = buf.elsewhere;
    if (e) return e.rel !== null ? `${e.vault}: ${e.rel}` : buf.abs;
    return buf.abs === this.scratch.location().path ? "scratch" : buf.key;
  }

  /** When a key or a click last came: the background auto-index waits while someone works (20.9). */
  lastInputAt = 0;

  /** Buffers with unsaved changes. */
  dirtyBuffers(): NoteBuffer[] {
    return [...this.buffers.values()].filter((b) => b.dirty);
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.languages.servers?.killAll();
    this.shellJob?.stop();
    try {
      writeDirty(this.loc, []);
    } catch {}
    this.watcher?.close();
    this.stopLazy?.();
    if (this.session.stateTimer) clearTimeout(this.session.stateTimer);
    this.session.save();
    this.host.quit();
  }
}

export const RECENT_MAX = 5;
/** Notes the switcher lists first, most recent first. */
export const RECENT_NOTES_MAX = 30;
