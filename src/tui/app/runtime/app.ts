import { openInitialWindows, RECENT_MAX } from "./startup.ts";
export { RECENT_MAX, RECENT_NOTES_MAX } from "./startup.ts";
import type { Host, View, Tab, Overlay, SidePaneState, UiState, AppOptions, FloatingWindow } from "./contracts.ts";
export type {
  Host,
  Loc,
  Selection,
  FindState,
  View,
  Tab,
  PromptOverlay,
  Overlay,
  SidePaneState,
  UiState,
  AppOptions,
  Region,
} from "./contracts.ts";
import { uiDefaults } from "../settings/ui-state.ts";
export { uiDefaults } from "../settings/ui-state.ts";
export { lockedSaid, fileUnwritable } from "../../documents/buffers/opening.ts";
import { BufferOpening } from "../../documents/buffers/opening.ts";
import { Opening } from "../../documents/navigation/opening.ts";
import { ViewPolicy } from "../../documents/views/policy.ts";
import { Frame } from "../../shell/screen/frame.ts";
import { Html } from "../../documents/views/html.ts";
export type { ListItem, ListOverlay } from "../../shell/overlays/list-types.ts";
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
// through `Host`; tui/shell/terminal/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { cancelGitRead } from "../../workspace/git/gitquery.ts";
import { stopRegexJobs } from "../../../core/workspace/search/regex-jobs.ts";
import { stopParsePool } from "../../../core/documents/markdown/parse-pool.ts";
import { stopWalkThreads } from "../../../core/workspace/walk/walk-thread.ts";
import { Listings } from "../../workspace/explorer/listings.ts";
import { stopBacklinkJobs } from "../../../core/workspace/graph/backlinks-jobs.ts";
import { stopSpellThread } from "../../../core/documents/diagnostics/spell-thread.ts";
import { stopSyntaxThread } from "../../../core/documents/syntax/syntax-thread.ts";
import { appendFileSync } from "node:fs";
import { writeDirty } from "../../../core/workspace/git/merge/stale.ts";
import { placeAt, stopInsert } from "../../documents/editing/editing.ts";
import { newVimState } from "../../shell/input/vim.ts";
import { homedir } from "node:os";
import { Clipboard } from "../clipboard/clipboard.ts";
import { Messages } from "../notifications/messages.ts";
import { CommandRegistry, type Keymap } from "../../../core/application/commands/registry.ts";
import { type Config, loadConfig } from "../../../core/application/config/config.ts";
import type { Glyphs } from "../../../core/rendering/theme/glyphs.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import { lintCommand } from "../../../core/documents/diagnostics/lint.ts";
import type { Layout } from "../../../core/rendering/layout/ir.ts";
import { type Anchor, type CursorAnchor, PositionStore } from "../../../core/workspace/session/position.ts";
import type { Theme } from "../../../core/rendering/theme/index.ts";
import type { Reach } from "../../../core/workspace/links/reach.ts";
import { keepCaughtUp, tuiReach, vaultGraph } from "../../documents/navigation/peek.ts";
import { configFilesFor, recordLocation, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import { VaultFeed } from "../../../core/workspace/vaults/vault-feed.ts";
import type { VaultWatcher } from "../../../core/workspace/graph/watch.ts";
import type { SnippetSession } from "../../documents/editing/snippets.ts";
import type { CompletionState, SignatureState } from "../../documents/editing/completion.ts";
import { registerActions } from "../../actions/actions.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { Canvas } from "../../shell/terminal/canvas.ts";
import type { Pos } from "../../documents/editing/cursor.ts";
import { drawApp, type Geometry } from "../../shell/screen/draw.ts";
import { Settings } from "../settings/settings.ts";
import { Pictures } from "../../documents/media/pictures.ts";
import { Languages } from "../../documents/diagnostics/languages.ts";
import { Git } from "../../workspace/git/git.ts";
import { GitPanel } from "../../workspace/git/views/panel/gitpanel.ts";
import { Search } from "../../workspace/search/search.ts";
import { Views } from "../../documents/views/views.ts";
import { Lens } from "../../documents/editing/lens.ts";
import { Code } from "../../documents/views/code.ts";
import { Handoff } from "../../documents/saving/handoff.ts";
import { Windows } from "../../windows/layout/windows.ts";
import { Files } from "../../workspace/explorer/files.ts";
import { Panels, type LeftView, type RightView, type Region } from "../../shell/panels/panels.ts";
import { Footnotes } from "../../documents/tools/footnotes/footnotes.ts";
import { Properties } from "../../documents/tools/info/properties.ts";
import { Overlays } from "../../shell/overlays/overlays.ts";
import { Problems } from "../../documents/diagnostics/problems.ts";
import { Info } from "../../documents/tools/info/info.ts";
import { Linking } from "../../documents/navigation/linking.ts";
import { Explorer } from "../../workspace/explorer/explorer.ts";
import { History } from "../../workspace/history/history.ts";
import { OutlineView } from "../../documents/tools/outline/outline.ts";
import { Input } from "../../shell/input/input.ts";
import { Mouse } from "../../shell/input/mouse.ts";
import { Exporter } from "../../documents/export/exporter.ts";
import { Scratch } from "../scratch/scratch.ts";
import { Reporter } from "../distribution/report.ts";
import { Watch } from "./watch.ts";
import { Session } from "../../workspace/session/session.ts";
import { writeBuffer } from "../../documents/saving/write-buffer.ts";
import { Saving } from "../../documents/saving/saving.ts";
import { Vaults, carried } from "../../workspace/vaults/vaults.ts";
import { Renaming } from "../../workspace/explorer/renaming.ts";
import { Speller } from "../../documents/diagnostics/spelling.ts";
import { Following } from "../../documents/navigation/following.ts";
import { Updates } from "../distribution/updates.ts";

import type { Level, Message } from "../notifications/contracts.ts";
export type { Level, Message } from "../notifications/contracts.ts";

/** Where to log each command run, for the terminal tests' coverage: `SLIPBOX_TRACE` (run.ts adds a `key` line for
 *  each key handled). */
const TRACE = process.env.SLIPBOX_TRACE;

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
  /** The messages showing as floating boxes, newest first (each for 4 s, 8 s an error, from when it's first drawn). */
  toasts: Message[] = [];
  private readonly notifications = new Messages(this);

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
  floating: FloatingWindow = null;
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

  private readonly bufferOpening = new BufferOpening(this, { vaultGraph: (root) => vaultGraph(this, root) });
  private readonly opening = new Opening(this, {
    cancelGitRead: () => cancelGitRead(this),
    stopInsert: (view) => stopInsert(this, view),
  });
  private readonly viewPolicy = new ViewPolicy(this, {
    keepCaughtUp: (graph) => keepCaughtUp(this, graph),
    placeAt: (view, offset) => placeAt(this, view, offset),
  });
  private readonly frame = new Frame(this, (canvas) => drawApp(this, canvas));

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

    openInitialWindows(this, opts, carriedFrom);
    this.stopLazy = this.viewPolicy.followLazy();
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

  loadCodeGrammars(): void {
    this.viewPolicy.loadCodeGrammars();
  }

  relayoutAll(): void {
    this.viewPolicy.relayoutAll();
  }

  widthsChanged(): void {
    this.viewPolicy.widthsChanged();
  }

  sayingOnce<T>(fn: () => T): T {
    return this.notifications.sayingOnce(fn);
  }

  message(level: Level, text: string): void {
    this.notifications.message(level, text);
  }

  whileDrawing<T>(paint: () => T): T {
    return this.notifications.whileDrawing(paint);
  }

  listMessage(level: Level, text: string): Message {
    return this.notifications.listMessage(level, text);
  }

  toastsDrawn(drawn: Message[]): void {
    this.notifications.toastsDrawn(drawn);
  }

  dismissToasts(): void {
    this.notifications.dismissToasts();
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

  defaultNote(folder: string | null = null): string | null {
    return this.opening.defaultNote(folder);
  }

  absOf(pathOrRel: string): string {
    return this.opening.absOf(pathOrRel);
  }

  claimKnown(): void {
    this.bufferOpening.claimKnown();
  }

  claim(b: NoteBuffer): boolean {
    return this.bufferOpening.claim(b);
  }

  buffer(pathOrRel: string): NoteBuffer | null {
    return this.bufferOpening.buffer(pathOrRel);
  }

  makeView(buf: NoteBuffer, anchor?: Anchor, cursor?: CursorAnchor): View {
    return this.viewPolicy.makeView(buf, anchor, cursor);
  }

  canRender(buf: NoteBuffer): boolean {
    return this.viewPolicy.canRender(buf);
  }

  isCodeDocument(buf: NoteBuffer): boolean {
    return this.viewPolicy.isCodeDocument(buf);
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    this.opening.openInNewTab(path, anchor);
  }

  openOrSwitchTab(path: string): void {
    this.opening.openOrSwitchTab(path);
  }

  open(path: string, anchor?: Anchor, view = this.view): void {
    this.opening.open(path, anchor, view);
  }

  currentLayout(view: View): Layout {
    return this.viewPolicy.currentLayout(view);
  }

  moveCursor(view: View, to: Pos, opts: { extend?: boolean; keepGoal?: boolean } = {}): void {
    this.viewPolicy.moveCursor(view, to, opts);
  }

  // -------------------------------------------------------------------------------------------
  // Writing notes (phase 3). Every write goes through writeBuffer: atomic, inside the vault, the
  // watcher told it's ours, the buffer reloaded with its views' anchors kept.

  /** Write a buffer's file and take the result back in; false (with a message) if refused. */
  writeBuffer(buf: NoteBuffer, content: string | Uint8Array, saving = false, overwriteNew = false): boolean {
    return writeBuffer(this, buf, content, saving, overwriteNew);
  }

  cursorLine(view: View): number {
    return this.viewPolicy.cursorLine(view);
  }

  // -------------------------------------------------------------------------------------------
  // A file opened at a line, a command run, the screen drawn.

  openWhere(rel: string, line: number, where: "here" | "tab" | "split"): void {
    this.opening.openWhere(rel, line, where);
  }

  openAt(rel: string, line: number, column = 1, where: "here" | "tab" | "split" = "here"): void {
    this.opening.openAt(rel, line, column, where);
  }

  placeAtLine(v: View, line: number, column = 1): void {
    this.viewPolicy.placeAtLine(v, line, column);
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
    this.whileDrawing(() => this.frame.draw(canvas));
  }

  // -------------------------------------------------------------------------------------------
  // The clipboard, every view and buffer, quitting.

  private readonly clipboard = new Clipboard(this);

  /** System clipboard first, otherwise the current vim register, preserving linewise copies. */
  pasteText(): Promise<{ text: string; linewise: boolean } | null> {
    return this.clipboard.pasteText();
  }

  /** Text on the clipboard; said so unless `announce` is false. */
  copy(text: string, announce = true, what = `${text.length} characters`): Promise<boolean> {
    return this.clipboard.copy(text, announce, what);
  }

  allViews(): View[] {
    return [...this.tabs.flatMap((t) => t.views), ...(this.floating ? [this.floating.view] : [])];
  }

  displayName(buf: NoteBuffer): string {
    return this.bufferOpening.displayName(buf);
  }

  /** Buffers with unsaved changes. */
  dirtyBuffers(): NoteBuffer[] {
    return [...this.buffers.values()].filter((b) => b.dirty);
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.clipboard.abort();
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
