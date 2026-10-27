import { Html } from "./html.ts";
import type { ListOverlay } from "./list-types.ts";
export type { ListItem, ListOverlay } from "./list-types.ts";
import { Background } from "./background.ts";
// The TUI app model (plan 3.x; keymap in docs/manual/keys.md): the state every part shares — the vault open, its
// graph and config, tabs of one or two windows over shared buffers, the panels' state, the overlay and the floating
// window, messages, the UI settings — and the wiring: the start, opening a note, a window's layout and cursor, the
// one write path, drawing, quitting. Each feature is a controller of its own, in its own file, holding the App and
// whatever state is the feature's alone (D235): `app.explorer`, `app.git`, `app.lens`, `app.mouse`, …
//
// Notes are written only through writeBuffer (atomic, inside the vault, the watcher told); besides
// them, its own state (reading positions, session) and the scratch, through core.
//
// This module does not import OpenTUI. It draws through `Canvas` and talks to the terminal
// through `Host`; tui/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { cancelGitRead } from "./gitquery.ts";
import { DOCUMENT_GRAMMARS, grammarFor } from "../core/documents/syntax/syntax.ts";
import { MERMAID } from "../core/diagrams.ts";
import { REGEX, stopRegexJobs } from "../core/regex-jobs.ts";
import { stopParsePool } from "../core/documents/markdown/parse-pool.ts";
import { stopWalkThreads } from "../core/workspace/walk/walk-thread.ts";
import { Listings } from "./listings.ts";
import { stopBacklinkJobs } from "../core/workspace/graph/backlinks-jobs.ts";
import { stopSpellThread } from "../core/spell-thread.ts";
import { stopSyntaxThread } from "../core/documents/syntax/syntax-thread.ts";
import { onLoaded } from "../core/foundation/platform/lazy.ts";
import { classify, extensionOf } from "../core/documents/model/filetypes.ts";
import { accessSync, appendFileSync, constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { climbsOut, folderUnreadable, WriteRefused, writeNote } from "../core/foundation/platform/fsutil.ts";
import { linkSaid, writesThrough } from "../core/workspace/vaults/symlinks.ts";
import { writeDirty } from "../core/stale.ts";
import { placeAt, stopInsert } from "./editing.ts";
import { newVimState } from "./vim.ts";
import type { ReplaceState } from "./replacing.ts";
import { homedir } from "node:os";
import { copyTextAsync, osc52Sequence, readClipboardAsync } from "../core/foundation/platform/clipboard.ts";
import { CommandRegistry, type Keymap } from "../core/application/commands/registry.ts";
import { type Config, loadConfig } from "../core/application/config/config.ts";
import type { Glyphs } from "../core/glyphs.ts";
import type { Graph } from "../core/workspace/graph/graph.ts";
import { lintCommand } from "../core/lint.ts";
import { type Layout, posOfSrc, srcAt } from "../core/layout/ir.ts";
import { slipboxOwn, stateDir } from "../core/foundation/platform/paths.ts";
import { type Anchor, type CursorAnchor, loadSession, PositionStore, TOP } from "../core/workspace/session/position.ts";
import type { Theme } from "../core/theme/index.ts";
import type { Reach } from "../core/workspace/links/reach.ts";
import { keepCaughtUp, type Peek, tuiReach, vaultGraph } from "./peek.ts";
import type { DiffWindow } from "./diffview.ts";
import type { MergeState } from "./mergescreen.ts";
import type { Review } from "./review.ts";
import { ELSEWHERE, rootLabel, tildePath } from "../core/workspace/vaults/names.ts";
import { configFilesFor, isInside, vaultAt, vaultOf, recordLocation } from "../core/workspace/vaults/vault.ts";
import type { VaultLocation } from "../core/workspace/vaults/vault.ts";
import { VaultFeed } from "../core/workspace/vaults/vault-feed.ts";
import type { VaultWatcher } from "../core/workspace/graph/watch.ts";
import type { SnippetSession } from "./snippets.ts";
import type { CompletionState, SignatureState } from "./completion.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { truncate } from "../core/foundation/text/width.ts";
import { registerActions } from "./actions.ts";
import type { SaveAsOverlay } from "./saveas.ts";
import type { DialogOverlay } from "./dialog.ts";
import { NoteBuffer } from "./buffer.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { clampPos, type Pos } from "./cursor.ts";
import { drawApp, type Geometry } from "./draw.ts";
import { Settings } from "./settings.ts";
import { Pictures } from "./pictures.ts";
import { Languages } from "./languages.ts";
import { Git } from "./git.ts";
import { GitPanel } from "./gitpanel.ts";
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
import { Reporter } from "./report.ts";
import type { TerminalAnswer } from "../core/report.ts";
import { Watch } from "./watch.ts";
import { Session } from "./session.ts";
import { Saving } from "./saving.ts";
import { Vaults, carried } from "./vaults.ts";
import { Renaming } from "./renaming.ts";
import { Speller } from "./spelling.ts";
import { Following } from "./following.ts";
import { Updates } from "./updates.ts";
import type { SessionState } from "../core/workspace/session/position.ts";
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
  /** What the terminal said of itself, as the renderer found it asking: a report's facts (RPT). Absent: nothing. */
  terminal?(): TerminalAnswer | null;
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
  pending?: boolean;
  limited?: boolean;
  failed?: boolean;
  /** Why the regex isn't one, when it isn't. */
  error?: string;
}

export interface View {
  buf: NoteBuffer;
  /** First row on screen. */
  top: number;
  /** Its pictures (12.7): where they were last drawn (its top, how far it and its pictures are scrolled sideways),
   *  when it last scrolled, and whether they wait for it to rest; its size, the sizes of those in sight, and when a
   *  resize last changed one (PIC-D5). */
  pictures?: { top: string; at: number; wait: boolean; size?: string; sizes?: Map<string, string>; sizedAt?: number };
  /** The pictures it shows at their own size (PIC-D4), by their files, while it shows `buf`: another note shown, they're
   *  fitted again. */
  picturesOwn?: { buf: NoteBuffer; files: Set<string> };
  /** Its text rows were its find row closed: what its pictures are fitted to (PIC), so find doesn't resize them. */
  pictureRows?: number;
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

export interface PromptOverlay {
  kind: "prompt";
  label: string;
  text: string;
  /** A yes-or-no question: `y` answers yes (`accept`), `n` or `esc` no (`cancel`); nothing typed. */
  confirm?: boolean;
  change?: (text: string) => unknown;
  accept: (text: string) => unknown;
  cancel?: () => void;
  /** Find's prompt: typed in that window's own find row, not on the bottom line. */
  view?: View;
  /** Find's replace field, when open (ctrl+h, space f r; tab from the find field). */
  replace?: ReplaceState;
  /** A find across files (25.4): the window whose find toggles it uses — alt+r, alt+w flip them — and its label. */
  toggles?: { view: View; label: () => string };
}

export type Overlay = ListOverlay | PromptOverlay | SaveAsOverlay | DialogOverlay;

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
  /** The row atop each window (HDR-D3), and the breadcrumb on it. */
  window_header: boolean;
  breadcrumb: boolean;
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
  /** The explorer lists hidden files and folders (`files.hidden`; its `shift+h`), `.git` aside. */
  hidden_files: boolean;
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
    window_header: c.ui.window_header,
    breadcrumb: c.ui.breadcrumb,
    problems_bar: c.diagnostics.bar !== "off",
    problem_marks: c.diagnostics.marks,
    code_cells: c.render.code_cells,
    code_wrap: c.render.code_wrap,
    spell: c.spell.enabled,
    scratch_in: c.capture.open_in,
    hidden_files: c.files.hidden,
    // "auto": URLs where colour can't mark links (NO_COLOR), as in `slipbox render`.
    urls: c.render.show_urls === "always" || (c.render.show_urls === "auto" && !!process.env.NO_COLOR),
    theme: c.theme,
    glyphs: c.render.glyphs,
  };
}

/** A file you may read but not write (VV-D5), said as its window's read-only reason; null when you may write it. */
export function lockedSaid(key: string, abs: string): string | null {
  const locked = fileUnwritable(abs);
  return locked ? `${tildePath(key)} is read-only: ${locked}` : null;
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
  /** Said on opening, as information: what `--base` kept (D255). */
  notes?: string[];
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
  /** The explorer's listings read off the main thread (T12): the TUI's; a test's App reads them at once. */
  listOffThread?: boolean;
  /** Started by a restart (UPG): this window's session, from its note, and what's said of it. */
  restarted?: { session: SessionState | null; said: { level: Level; text: string } };
}

/** Buffers of another vault's file whose vault a view of them has had caught up (`makeView`, #10). */
const caughtUpOnce = new WeakSet<NoteBuffer>();

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
  /** The git panel's own keys (GIT-D12), `[keys.git]`. */
  gitKeys!: Keymap;
  outlineKeys!: Keymap;
  footnoteKeys!: Keymap;
  infoKeys!: Keymap;
  resizeKeys!: Keymap;
  /** The peek's own keys (VV-D7), over the note's while one is open: o, t, z. */
  peekKeys!: Keymap;
  /** A review's own keys (GIT-D3), and the merge screen's (GIT-D5), over the note's while one is open. */
  reviewKeys!: Keymap;
  mergeKeys!: Keymap;
  /** A diff window's own keys (GIT-D2), over the note's while it has the cursor: tab. */
  diffKeys!: Keymap;
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
  /** While a click is handled (`sayingOnce`): the messages it has said, by level and words. */
  private saidInClick: Set<string> | null = null;
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
  /** Frames being painted, by `whileDrawing`: a message said meanwhile asks for no other (`message`). */
  private drawing = 0;
  /** The terminal's title as last told (host.setTitle). */
  private termTitle: string | null = null;

  /** Commands run from the palette or help, most recent first (kept in the session). */
  recentCommands: string[] = [];
  /** The folder of home opened by name (VV-D2: `slipbox ~/notes`), home's path for it — its own tabs, its own first
   *  note; null at home's top, and in a vault (`Vaults.ask`). */
  homeFolder: string | null = null;
  readonly configFile: string | undefined;
  readonly now: () => number;
  quitting = false;
  indexing = 0;
  /** Watching, polling and indexing in the background (off in tests that drive time themselves). */
  readonly live: boolean;
  /** `--theme`: kept over a vault's own theme when switching vaults. */
  readonly explicitTheme: string | undefined;
  /**
   * The floating window (3.20): a view over the windows, of text that isn't a file of its own — a note's frontmatter,
   * a hover, a commit's message, the scratch, a diff, a peek, a review, the merge screen, a report — with every editing key there
   * is; closed (esc, q, :q) or saved (ctrl+s, :w), its text goes back where it came from, as one undo step there.
   */
  floating:
    | ((
        | { kind: "properties"; note: NoteBuffer; format: "yaml" | "toml"; original: string }
        | { kind: "hover" }
        | { kind: "commit"; amend: boolean; from: Region }
        | { kind: "scratch" }
        | { kind: "diff"; diff: DiffWindow }
        | { kind: "peek"; peek: Peek }
        | { kind: "review"; review: Review }
        | { kind: "merge"; merge: MergeState }
        | { kind: "report"; from: Region }
      ) & { view: View; title: string })
    | null = null;
  /** Completion's popup while typing (19.16), and the signature being typed. */
  completion: CompletionState | null = null;
  signature: SignatureState | null = null;
  /** A server's snippet being typed through (25.8): its stops. */
  snippet: SnippetSession | null = null;
  /** The command your shell is running (25.7): one at a time. */
  shellJob: { command: string; stop: () => void } | null = null;
  /**
   * The watcher's news, held while git writes, applied to the graph (5.9, 5.10): what git does to the vault's files is
   * one event — a branch switch, a merge, a reset — whose batches are held while git holds its index lock, then applied
   * together; the files a branch switch brings and takes aren't taken for moves; each branch keeps its tabs.
   */
  readonly feed: VaultFeed;
  /** When a key or a click last came: the background auto-index waits while someone works (20.9). */
  lastInputAt = 0;
  /** Home, for an export's places and `~/` (a test's own, never yours). */
  home = homedir();
  /** Stops following what loads lazily (a grammar), on quit. */
  private stopLazy: (() => void) | null = null;

  // The features, each a controller of its own (D235).
  /** The configuration: keys, theme, glyphs, the UI settings, and live reload. */
  readonly settings = new Settings(this);
  /** Pictures (12.x): drawn, fetched, and held back while a view scrolls. */
  readonly pictures = new Pictures(this);
  readonly html = new Html(this);
  /** Syntax, language servers, linters, and the trust they need. */
  readonly languages = new Languages(this);
  /** Source control: git's view of the files, its diffs, branches and commits. */
  readonly git = new Git(this);
  /** The git panel (GIT-D8): its message, its sections folded, its branches and repositories, its keys and mouse. */
  readonly gitPanel = new GitPanel(this);
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
  readonly background = new Background(this);
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
  /** Links out of the vault, followed only when you say so (VV-D6). */
  readonly following = new Following(this);
  /** Reporting a problem (RPT): the report's window, the screen kept for it, its sending. */
  readonly report = new Reporter(this);
  /** The update offer, `:upgrade`, `:restart` (UPG). */
  readonly updates = new Updates(this);

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.explorer.top = this.explorer.trail = opts.loc.root;
    if (opts.listOffThread) this.explorer.listings = new Listings(this, true);
    this.config = opts.config;
    this.graph = opts.graph;
    // This machine sees the root (17.6); a named folder moved here by hand brought its state (21.8).
    const { carriedFrom } = opts.recorded ?? recordLocation(opts.loc);
    // The vaults it reaches never parsed whole here (`thorough`): that holds the keys. Caught up on a thread instead.
    this.reach = tuiReach(this, opts.loc);
    this.graph.reach ??= this.reach;
    this.languages.lintCmd = lintCommand(opts.config.lint, opts.loc.root, undefined, opts.config.lsp.auto_install);
    this.host = opts.host;
    this.configFile = opts.configFile;
    this.live = opts.watch !== false;
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
    // A folder of home opened by name, or a file's (VV-D2): what was asked for, its notes there at once, home walked
    // or not — and a folder's own tabs, or its own note, not home's. The tabs brought back too, their folders asked for
    // with it (the branch's, now HEAD is known): the graph built once. Then search, on it.
    this.vaults.ask(
      opts.folder ?? null,
      opts.open ? this.absOf(opts.open) : null,
      !opts.open && opts.config.ui.restore_session,
    );
    this.watch.followGraph();
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
    for (const n of opts.notes ?? []) this.message("info", n);
    for (const e of this.graph.errors) this.message("warn", e);
    if (carriedFrom) this.message("info", carried(this.loc, carriedFrom));

    this.recentCommands = (loadSession(this.loc)?.recent_commands ?? [])
      .filter((id) => typeof id === "string")
      .slice(0, RECENT_MAX);
    this.handoff.remoteServer = loadSession(this.loc)?.remote_server;
    this.history.recentNotes = (loadSession(this.loc)?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
    this.session.restoreUiOverrides();
    if (opts.themeName) this.ui.theme = opts.themeName; // an explicit theme beats a remembered one
    this.settings.applyTheme();
    // A restart comes back with the window's own session, from its note, whatever restore_session says (UPG-D4).
    if (opts.restarted) this.message(opts.restarted.said.level, opts.restarted.said.text);
    const restored = opts.restarted?.session
      ? this.session.restoreFrom(opts.restarted.session)
      : !opts.open && this.config.ui.restore_session && this.session.restore();
    this.glyphs = this.settings.glyphSet(this.ui.glyphs);
    if (!restored) {
      const first = opts.open ?? this.defaultNote(this.homeFolder);
      if (first) this.openInNewTab(first);
    }
    // The view starts at the folder opened (VV-D5): `x/y` shows y, in vault x — set once its notes are open, so
    // the one shown, outside it, leaves it be. A folder that can't be read says why.
    const opened = opts.folder ?? (opts.open ? null : this.loc.root);
    const unreadable = opened ? folderUnreadable(opened) : null;
    if (unreadable) this.message("warn", `can't read ${tildePath(opened!)}: ${unreadable}`);
    else if (opts.folder && opts.folder !== this.loc.root && isInside(this.loc.root, opts.folder))
      this.explorer.zoomTo(opts.folder);
    if (!this.tabs.length && !unreadable)
      this.message(
        "info",
        this.loc.mode === "folder"
          ? `${ELSEWHERE} — ${tildePath(this.loc.root)}: open a file from the explorer`
          : this.vaults.noNotes(),
      );
    // Moved here by hand, its state along (21.8): the links the move broke, their fix previewed (20.17).
    if (carriedFrom) this.vaults.offerMovedRelink();
    // A second copy of this folder (21.6): which one links open, asked once.
    if (!this.overlay) this.vaults.askDefaultCopy();
    // A grammar (or anything lazy) that finished loading: lay out again and draw.
    this.stopLazy = onLoaded((name) => {
      if (name !== MERMAID && name !== "pictures" && name !== REGEX) this.graph.grammarsChanged(); // code files' comment links can be read now (16.10)
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
      // The followed links' targets asked whether they answer, in the background (VV-D6): walked once they do.
      this.following.probe();
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

  /**
   * `fn`, a click's handling, each message it says said once (HDR-D2): ending typing can say a data file doesn't parse,
   * and the click's own command the same words; a second click is its own, and says them again.
   */
  sayingOnce<T>(fn: () => T): T {
    const was = this.saidInClick;
    this.saidInClick = new Set();
    try {
      return fn();
    } finally {
      this.saidInClick = was;
    }
  }

  message(level: Level, text: string): void {
    const said = `${level} ${text}`;
    if (this.saidInClick?.has(said)) return;
    this.saidInClick?.add(said);
    const m = this.listMessage(level, text);
    // The same message again (a key held down) refreshes its box rather than stacking another.
    this.toasts = [m, ...this.toasts.filter((t) => t.text !== text || t.level !== level)].slice(0, TOAST_LIMIT);
    this.scheduleToasts();
    // Drawn as it's said, wherever from: a key's command, or git answering in the background, with nothing else to
    // draw it (D263). Said while a frame is painted, it waits for the next, as before: OpenTUI draws again at once for a
    // request made while it draws, so something said on every frame would keep drawing. Said before the host is there
    // (starting up), the first frame draws it.
    if (!this.drawing) this.host?.requestRender();
  }

  /** `paint` as one frame is painted: a message said in it asks for no other frame (`message`). */
  whileDrawing<T>(paint: () => T): T {
    this.drawing++;
    try {
      return paint();
    } finally {
      this.drawing--;
    }
  }

  /** Said to the messages list alone, no box: kept for the record (UPG: the daily check's line, its offer shown). */
  listMessage(level: Level, text: string): Message {
    const m = { level, text, at: this.now() };
    this.messages.push(m);
    if (this.messages.length > MESSAGE_LIMIT) this.messages.shift();
    return m;
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

  /** The note opened when none is named or restored: `index.md`, `README.md` or `home.md`, else the first note by
   *  path — the vault's; in `folder` (home's path for a folder of it opened by name, VV-D2), the folder's own — one
   *  directly in it before one in a folder of it — or none. */
  defaultNote(folder: string | null = null): string | null {
    const at = folder ? `${folder}/` : "";
    const notes = [...this.graph.notes.keys()].filter((n) => n.startsWith(at));
    for (const pref of ["index.md", "README.md", "readme.md", "home.md"])
      if (notes.includes(`${at}${pref}`)) return `${at}${pref}`;
    if (!folder) return notes[0] ?? null;
    const depth = (n: string) => n.split("/").length;
    return notes.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
  }

  /** A vault-relative or absolute path, absolute. */
  absOf(pathOrRel: string): string {
    return pathOrRel.startsWith("/") ? pathOrRel : join(this.loc.root, pathOrRel);
  }

  /**
   * Buffers opened before the graph knew their file — a note a branch brings, its tab back before the watcher says so;
   * one in a folder of home not walked yet, one reached — given their vault path now it does: their links and
   * backlinks. Each build calls it (`Watch.followGraph`); a change to one file claims that file's buffer, and one read
   * again is claimed then (`Watch.reloadBuffer`, `Watch.poll`).
   */
  claimKnown(): void {
    for (const b of this.buffers.values()) this.claim(b);
  }

  /**
   * One buffer given its vault path, when the graph knows its file; true when it was. Not one changed on disk since it
   * was read: the poll reads it again first, then claims it, so it never shows what the file no longer says
   * (`Watch.poll`). One read-only as read through a link not followed (VV-D6) is the vault's only once that link is
   * followed (`claimThroughLink`).
   */
  claim(b: NoteBuffer): boolean {
    if (b.virtual || b.elsewhere) return false;
    if (b.throughLink) return this.claimThroughLink(b);
    if (b.rel !== null || isAbsolute(b.key) || !this.graph.known(b.key) || b.changedOnDisk()) return false;
    b.rel = b.key;
    this.claimed(b);
    return true;
  }

  /**
   * A window read-only as read through a link not followed (VV-D6), looked at or forgotten, whose link is followed now
   * (`Following.follow`): writable, unless the file itself isn't, and the vault's once the graph knows it. In a vault,
   * only once it's the vault's note: a write there never lands outside it through a link, so one the graph doesn't take
   * (past `walk.max_file_size`) stays read-only. In home and Elsewhere, a write through a followed link is allowed.
   */
  private claimThroughLink(b: NoteBuffer): boolean {
    // Its link followed, and its target answered: never while it's looked at, nor asked, nor once it gave up.
    if (this.following.blocked(b.abs, true)) return false;
    const known = !isAbsolute(b.key) && this.graph.known(b.key) && !b.changedOnDisk();
    if (this.loc.mode === "vault" && !known) return false;
    b.throughLink = false;
    b.readOnly = lockedSaid(b.key, b.abs);
    if (known) b.rel = b.key;
    this.claimed(b);
    return true;
  }

  /** A buffer claimed in the middle of anything (a render reaching a file): drawn again, its links and backlinks. */
  private claimed(b: NoteBuffer): void {
    b.invalidateLayouts();
    this.host.requestRender();
  }

  /** Buffer for a vault-relative or absolute path. Keyed by path, not graph membership. */
  buffer(pathOrRel: string): NoteBuffer | null {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.loc.root, pathOrRel);
    const relRaw = relative(this.loc.root, abs);
    // Elsewhere (VV-D3) is one place, wherever its files are: each by its whole path.
    const inside = this.loc.mode !== "folder" && !climbsOut(relRaw);
    const key = inside ? relRaw : abs;
    let buf = this.buffers.get(key);
    if (!buf) {
      // Inside the vault, a note or any file the walk saw has its vault path (the watcher, saves).
      const known = inside && this.graph.known(relRaw);
      const rel = known ? relRaw : null;
      const kind = classify(abs, this.config.walk.extensions);
      if (kind.group === "binary") {
        this.message("warn", `${relRaw || abs} is a binary file; slipbox opens text`);
        return null;
      }
      // A path a link not followed leads to (VV-D6): nothing is read through it — the walk leaves it out, the CLI
      // refuses it — until you say so, opening it.
      const blocked = this.following.blocked(abs);
      if (blocked) {
        this.message("warn", `${linkSaid(blocked.link, blocked.target)} isn't followed — open it to choose`);
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
      const locked = buf.elsewhere ? null : lockedSaid(buf.key, abs);
      if (locked) {
        buf.readOnly = locked;
        this.message("info", buf.readOnly);
      }
      // Read through a link you're only looking at (VV-D6): read-only, and never indexed — it isn't the vault's.
      const look = buf.elsewhere ? null : this.following.lookedAt(abs);
      if (look) {
        buf.readOnly = `just looking: ${tildePath(look)} isn't followed — read-only`;
        buf.throughLink = true;
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
    if (buf.abs === this.scratch.location().path || slipboxOwn(buf.abs)) return;
    // Its vault: a marker's, or home (VV-D2); else Elsewhere's (VV-D3), read-only here as another vault's file is.
    const root = vaultOf(buf.abs);
    if (!root) {
      if (this.loc.mode === "folder") return;
      buf.elsewhere = { vault: ELSEWHERE, graph: null, rel: null };
      buf.readOnly = `read-only here: ${ELSEWHERE}'s — o goes there, to edit it`;
      return;
    }
    if (root === this.loc.root) return;
    const label = rootLabel(vaultAt(root));
    const graph = vaultGraph(this, root);
    buf.elsewhere = { vault: label, graph, rel: graph ? relative(root, buf.abs) : null };
    buf.readOnly = `read-only here: ${label}'s — go into ${label} to edit it`;
  }

  makeView(buf: NoteBuffer, anchor?: Anchor, cursor?: CursorAnchor): View {
    // Opened again: a big note its threads failed on for their own reason is parsed again (15.1), a code file's
    // structure likewise (16.7).
    buf.retryParse();
    this.languages.retrySyntax(buf);
    // Another vault's file shown — a tab kept from a peek, back with the session; not a buffer read for an edit, nor
    // the peek's own: its graph caught up on a thread, as a peek's is (#10), its index built if it has none, home's
    // excepted (VV-D2) — or a link by a name in a note changed since would never be found: the TUI never parses a
    // vault whole to look (`thorough`). Even when its index here isn't behind its walk: the thread's walk asks the
    // links its vault follows first (VV-D6), and finds the folders through them this walk leaves out until they answer.
    // With its first view, not every split of it.
    if (buf.elsewhere?.graph && !buf.virtual && !caughtUpOnce.has(buf)) {
      caughtUpOnce.add(buf);
      keepCaughtUp(this, buf.elsewhere.graph);
    }
    if (anchor && buf.kind.group === "note") this.html.revealIn(buf, anchor.line);
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
      ...(this.lens.opensInSource(buf) ? { source: true } : {}),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Opening a note, and a window's layout and cursor (the rest of the view's work is app.views').

  /** Whether a file has a rendered view: markdown notes do, data files while they parse
   *  (16.11–16.14), text files never. */
  canRender(buf: NoteBuffer): boolean {
    if (buf.drawn) return true; // a layout of its own (a diff)
    if (buf.kind.group === "data") return !buf.parsed.error;
    return buf.kind.group === "note" || this.isCodeDocument(buf); // every note format has a reader (16.2)
  }

  /** Code that renders as a document (24.x): a language the view maps, independent of its opening default. */
  isCodeDocument(buf: NoteBuffer): boolean {
    if (buf.kind.group !== "text") return false;
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    return !!g && DOCUMENT_GRAMMARS.has(g);
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    if (this.vaults.intoOther(path, anchor)) return;
    if (this.following.gate(this.absOf(path), () => this.openInNewTab(path, anchor))) return;
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
    cancelGitRead(this);
    if (this.vaults.intoOther(path)) return;
    if (this.following.gate(this.absOf(path), () => this.openOrSwitchTab(path))) return;
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
    if (this.following.gate(this.absOf(path), () => this.open(path, anchor))) return;
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
    // Another note: its pictures fitted again (PIC-D4), even one the window shows as source or code between.
    Object.assign(view, this.makeView(buf, anchor), {
      back: view.back,
      fwd: [],
      picturesOwn: buf === before ? view.picturesOwn : undefined,
    });
    this.lens.fitMode(view, before);
    this.region = "content";
    this.explorer.reveal(undefined, false, true);
  }

  /** A window's layout at its width now, its gutter taken off. */
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

  // -------------------------------------------------------------------------------------------
  // Writing notes (phase 3). Every write goes through writeBuffer: atomic, inside the vault, the
  // watcher told it's ours, the buffer reloaded with its views' anchors kept.

  /** Write a buffer's file and take the result back in; false (with a message) if refused. */
  writeBuffer(buf: NoteBuffer, content: string | Uint8Array, saving = false): boolean {
    // A virtual buffer (3.20) is no file: its text goes where it belongs by its own save, never to its name on disk.
    if (buf.virtual) {
      this.message("warn", `${this.displayName(buf)} is the floating window's, not a file: not written`);
      return false;
    }
    // Read through a link not followed now (VV-D6: looked at, or forgotten with unsaved text): never written through it.
    if (buf.throughLink) {
      this.message("warn", `${buf.key} not written: ${buf.readOnly ?? "read through a link not followed"}`);
      return false;
    }
    // A vault's file stays inside the vault, one its graph doesn't know too (past `walk.max_file_size`); a file from
    // outside it (the scratch) inside its folder. Through a link you follow, home's and Elsewhere's are written where it
    // leads; a vault's never out of it (VV-D6).
    const inVault =
      buf.rel !== null || (this.loc.mode === "vault" && !buf.elsewhere && isInside(this.loc.root, buf.abs));
    const root = inVault ? this.loc.root : dirname(buf.abs);
    const through = this.loc.mode !== "vault" && !buf.elsewhere && writesThrough(this.loc, buf.abs);
    let written: ReturnType<typeof writeNote>;
    try {
      written = writeNote(root, buf.abs, content, { through });
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

  // -------------------------------------------------------------------------------------------
  // A file opened at a line, a command run, the screen drawn.

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
    if (!v.source && v.buf.kind.group === "note") this.html.reveal(v, line);
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

  /** A frame drawn on `canvas`: what's said while it's drawn asks for no other (`whileDrawing`). */
  draw(canvas: Canvas): void {
    this.whileDrawing(() => this.drawFrame(canvas));
  }

  private drawFrame(canvas: Canvas): void {
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
    // A report waiting for the screen: this frame kept as text too, and the report opened on the next (RPT-D2) — the
    // frame saying drawing failed among them: a report is wanted most then.
    const c = this.report.canvas(canvas);
    try {
      this.geometry = drawApp(this, c);
      this.mouse.rehover();
      this.report.drawn();
    } catch (err) {
      // A drawing bug must never take the app down: report it, and say so on screen too (the
      // message line may be what failed to draw).
      const text = `drawing failed: ${(err as Error).message}`;
      if (!this.drawFailed) this.message("error", text);
      this.drawFailed = true;
      c.fill(0, 0, canvas.width, canvas.height, null);
      drawText(c, 0, 0, truncate(`slipbox: ${text} — resize, or esc`, canvas.width), {
        fg: "default",
        bg: null,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        dim: false,
      });
      this.report.drawn();
      return;
    }
    this.drawFailed = false;
  }

  // -------------------------------------------------------------------------------------------
  // The clipboard, every view and buffer, quitting.

  private clipboardTask: Promise<unknown> = Promise.resolve();
  private clipboardAbort = new AbortController();
  private clipboardPending = 0;

  /**
   * What `p` puts: the system clipboard when it can be read and holds something else than the
   * register (text copied in another app); else the register — whose line-wise-ness a clipboard
   * that holds the same text keeps.
   */
  async pasteText(): Promise<{ text: string; linewise: boolean } | null> {
    await this.clipboardTask;
    const reg = this.vim.register;
    const clip = await readClipboardAsync(stateDir(this.loc), this.clipboardAbort.signal);
    if (clip === null || clip === "" || (reg && clip === reg.text)) return reg;
    return { text: clip, linewise: false };
  }

  /** Text on the clipboard; said so (`what` names it: "copied <what>"), unless `announce` is false. */
  copy(text: string, announce = true, what = `${text.length} characters`): Promise<boolean> {
    // Said whether or not the caller announces: its own "copied" or "yanked" would claim a copy that never happens.
    if (this.clipboardPending >= 8) {
      this.message("warn", "clipboard busy — copy again after it finishes");
      return Promise.resolve(false);
    }
    // OSC 52 now, in the order copies are made, as it was when copying waited for the helpers: the terminal's
    // clipboard never waits for them, only the system's.
    const osc52 = osc52Sequence(text) !== null && this.host.osc52(text);
    const run = async () => {
      if (this.quitting) return false;
      const r = await copyTextAsync(text, {
        osc52: () => osc52,
        fallbackDir: stateDir(this.loc),
        signal: this.clipboardAbort.signal,
      });
      if (this.quitting) return false;
      // SLIPBOX_CLIPBOARD=file sends copies to the file on purpose; otherwise the file means no clipboard answered.
      const onPurpose = process.env.SLIPBOX_CLIPBOARD === "file";
      if (announce) {
        this.message(
          "info",
          r.file
            ? onPurpose
              ? `copied ${what} to ${r.file}`
              : `clipboard unavailable — wrote ${r.file} (${what})`
            : `copied ${what}`,
        );
        // The helper answered after the key's frame was drawn: drawn now, not at the next key.
        this.host.requestRender();
      }
      return !r.file;
    };
    this.clipboardPending++;
    const task = this.clipboardTask.then(run).catch((err) => {
      if (this.quitting) return false;
      this.message("warn", `clipboard: ${(err as Error).message}`);
      this.host.requestRender();
      return false;
    });
    task.finally(() => this.clipboardPending--);
    this.clipboardTask = task;
    return task;
  }

  allViews(): View[] {
    return [...this.tabs.flatMap((t) => t.views), ...(this.floating ? [this.floating.view] : [])];
  }

  displayName(buf: NoteBuffer): string {
    // Another vault's file read here (VV-D7): by that vault's name and its path there; outside every vault, its path.
    const e = buf.elsewhere;
    if (e) return e.rel !== null ? `${e.vault}: ${e.rel}` : buf.abs;
    return buf.abs === this.scratch.location().path ? "scratch" : buf.key;
  }

  /** Buffers with unsaved changes. */
  dirtyBuffers(): NoteBuffer[] {
    return [...this.buffers.values()].filter((b) => b.dirty);
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.clipboardAbort.abort();
    this.pictures.dispose();
    this.languages.stopSyntax();
    this.languages.stopTools();
    this.languages.servers?.killAll();
    this.shellJob?.stop();
    cancelGitRead(this);
    try {
      writeDirty(this.loc, []);
    } catch {}
    this.watcher?.close();
    this.exporter.cancel(true);
    this.stopLazy?.();
    stopParsePool();
    stopWalkThreads();
    stopBacklinkJobs();
    stopSpellThread();
    stopSyntaxThread();
    stopRegexJobs();
    if (this.session.stateTimer) clearTimeout(this.session.stateTimer);
    this.session.save();
    this.host.quit();
  }
}

export const RECENT_MAX = 5;
/** Notes the switcher lists first, most recent first. */
export const RECENT_NOTES_MAX = 30;
