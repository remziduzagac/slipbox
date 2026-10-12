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

import { fileURLToPath, pathToFileURL } from "node:url";
import {
  commentLinks,
  DOCUMENT_GRAMMARS,
  grammarFor,
  grammarNow,
  type OutlineEntry,
  parseSyntax,
  type Span as SyntaxSpan,
} from "../core/syntax.ts";
import {
  type DocumentSymbol,
  type SymbolInformation,
  SymbolKind,
  type TextEdit as LspTextEdit,
  type WorkspaceEdit,
} from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { lazy, loadError, onLoaded } from "../core/lazy.ts";
import {
  addOwnWord,
  Checker,
  dictionaryFiles,
  noteLanguages,
  openSpeller,
  ownWordsFile,
  proseWords,
  type Speller,
  type SpellWord,
} from "../core/spell.ts";
import ignore from "ignore";
import { classify, extensionOf, type FileGroup, isKnownExtension } from "../core/filetypes.ts";
import {
  appendFileSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import {
  climbsOut,
  ensureDir,
  landsInside,
  readJson,
  readRegular,
  readText,
  realTarget,
  WriteRefused,
  writeJson,
  writeNote,
} from "../core/fsutil.ts";
import {
  defaultTarget,
  type ExportFormat,
  exportNotes,
  exportTarget,
  FORMATS,
  formatFor,
  writeExport,
} from "../core/export/index.ts";
import { listTasks, toggleTask } from "../core/tasks.ts";
import { merge3, unifiedDiff } from "../core/merge.ts";
import { compilePattern, findAll } from "../core/replace.ts";
import { planReplace } from "../core/replace-files.ts";
import { writeDirty } from "../core/stale.ts";
import { editorArgv } from "../core/editor.ts";
import {
  cannotEdit,
  deleteTypedSelection,
  insertKey,
  insertText,
  lineOf,
  offsetOf,
  placeAt,
  startInsert,
  stopInsert,
  typedSelection,
} from "./editing.ts";
import { matchBracket } from "../core/brackets.ts";
import { insertRecord, newVimState, PASTE, put, vimKey, visualKey } from "./vim.ts";
import * as R from "./replacing.ts";
import type { ReplaceState } from "./replacing.ts";
import { cellBlocks } from "../core/layout/code.ts";
import { type Block, blockAt, blockRanges, composeLive, LENS_COUNTERS, sectionRanges } from "../core/layout/live.ts";
import { discoverNvims, NVIM_REMOTE, type NvimServer, probeNvim } from "../core/nvim.ts";
import { homedir } from "node:os";
import { appendScratch, fence, fenceLanguage, formatEntry, scratchLocation } from "../core/capture.ts";
import { copyText, readClipboard } from "../core/clipboard.ts";
import { canonKey, canonSeq, CommandRegistry, Keymap, unknownModifiers } from "../core/commands.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { type ConventionPart, conventionOf, describeConvention } from "../core/convention.ts";
import { type LinkEnds, linkEnds, writeLink } from "../core/write-link.ts";
import { glyphsFor, type Glyphs } from "../core/glyphs.ts";
import { describeLanding, Graph, type LinkProblem } from "../core/graph.ts";
import { type LintCmd, type LintIssue, lintCommand, lintFailure, runLint } from "../core/lint.ts";
import { type Layout, type LayoutLink, type Picture, posOfSrc, srcAt } from "../core/layout/ir.ts";
import type { PictureSource, RenderOptions } from "../core/layout/render.ts";
import { type Rasterizer, rasterizer } from "../core/svg.ts";
import { layoutWidth, pictureLocator } from "../core/note.ts";
import { cacheHome, ensureCacheHome, stateDir, userConfigFile, userFolders } from "../core/paths.ts";
import {
  SESSION_BRANCHES,
  type SessionTab,
  type Anchor,
  anchorAt,
  type CursorAnchor,
  loadSession,
  PositionStore,
  rowFor,
  SESSION_HISTORY,
  saveSession,
  type SessionState,
  TOP,
  type UiOverride,
} from "../core/position.ts";
import { applyColorOverrides, colorHex, listThemes, loadTheme, type Role, type Theme } from "../core/theme/index.ts";
import { normKey } from "../core/links.ts";
import { openVault, Reach } from "../core/reach.ts";
import { buildContext } from "../core/context.ts";
import { IndexJob, indexFile, search, type SearchHit, SearchIndex, type SearchResult } from "../core/search.ts";
import { type Checkout, checkoutOf, headOf } from "../core/git.ts";
import {
  baseBranch,
  branchesOf,
  changedSince,
  type GitState,
  inCheckout,
  inVault,
  mergeBaseOf,
  showAt,
  showLater,
  stateOf,
  worktreeList,
} from "../core/gitops.ts";
import {
  commitLater,
  createBranch,
  entriesLater,
  type GitDone,
  lastMessage,
  sections,
  type StatusEntry,
  switchBranch,
} from "../core/gitstage.ts";
import { type GitRow, gitRows, gitViewAction } from "./gitview.ts";
import { type GitChange, gitChanges } from "../core/gitsigns.ts";
import { describeBreak, type MergeBreak, type MergeReview, reviewMerge } from "../core/mergereview.ts";
import { diffLines, diffRows } from "../core/merge.ts";
import { planConvert } from "../core/convert.ts";
import {
  type Ambiguous,
  type Applied,
  applyPlan,
  moveTarget,
  planFolderMove,
  planHeadingRename,
  planMakeVault,
  planNoteRename,
  planRelink,
  planUndo,
  planUnmakeVault,
  planVaultFolderMove,
  planVaultRename,
  type RenamePlan,
} from "../core/rename.ts";
import {
  addFootnote,
  deleteFootnote,
  editFootnote,
  type Footnote,
  footnotesOf,
  renameFootnote,
  type TextEdit,
} from "../core/footnotes.ts";
import { copyPath, emptyTrash, linksInto, listTrash, restorePath, type TrashItem, trashPath } from "../core/files.ts";
import { readIdentity, slugName, vaultConfigFile } from "../core/registry.ts";
import { activityFile, AutoIndex } from "../core/autoindex.ts";
import { notesOfType, ofType, type TypedNote } from "../core/doctypes.ts";
import { type Scope, SCOPES, searchOthers } from "../core/scope.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import {
  copyAvailable,
  folderIdentity,
  lookupFolder,
  type NamedFolder,
  pointerName,
  privateNameWarning,
  readFolders,
  repositoryCopies,
  setDefaultCopy,
  suggestFolderName,
} from "../core/folders.ts";
import {
  configFilesFor,
  findVaultRoot,
  folderAt,
  hasMarker,
  homeFolder,
  initVault,
  isInside,
  isListed,
  isVaultRoot,
  locateVault,
  recordLocation,
  rootAt,
  rootMarkers,
  setRootMarkers,
  type VaultLocation,
} from "../core/vault.ts";
import { isTrusted, setTrust, setTrustedRoots, trustOf } from "../core/trust.ts";
import { type Head, VaultFeed, applyToGraph } from "../core/vault-feed.ts";
import { VaultWatcher, type WatchBatch } from "../core/watch.ts";
import {
  atLeast,
  frontmatterFindings,
  lintProblems,
  noteProblems,
  type Problem,
  rootTypes,
  SEVERITIES,
  syntaxProblems,
} from "../core/diagnostics.ts";
import { languageOf, serverTable, type ServerTable } from "../core/servers/languages.ts";
import { type LinterDef, linterRoot, linterTable, runLinter } from "../core/servers/linters.ts";
import { rootFor } from "../core/servers/find.ts";
import { ServerManager } from "../core/servers/manager.ts";
import { afterSnippetKey, type SnippetSession, snippetKey } from "./snippets.ts";
import {
  afterInsertKey,
  completeWords,
  type CompletionState,
  completionKey,
  type SignatureState,
} from "./completion.ts";
import { sanitize } from "../core/sanitize.ts";
import { graphemes, graphemeWidth, stringWidth, truncate, truncateStart } from "../core/width.ts";
import { registerActions } from "./actions.ts";
import { openSaveAs, type SaveAsOverlay, saveAsKey, saveAsMouse, type SavePlace } from "./saveas.ts";
import { newParseCache, parseMarkdown } from "../core/parse.ts";
import { parseInBackground } from "../core/parse-pool.ts";
import { BACKGROUND_PARSE, NoteBuffer } from "./buffer.ts";
import { fitPicture, RemoteImages, svgText } from "./images.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { cells, clampPos, ordered, type Pos, snap, wordAt } from "./cursor.ts";
import { drawApp, type Geometry } from "./draw.ts";
import { match, rank } from "./match.ts";
import {
  DEFAULT_ALIASES,
  DEFAULT_EXPLORER_KEYS,
  EXPLORER_ACTION_INFO,
  HISTORY_ACTION_INFO,
  GIT_ACTION_INFO,
  PROBLEMS_ACTION_INFO,
  OUTLINE_ACTION_INFO,
  FOOTNOTE_ACTION_INFO,
  DEFAULT_GROUPS,
  DEFAULT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
  FOOTNOTE_ACTIONS,
  DEFAULT_INFO_KEYS,
  INFO_ACTIONS,
  INFO_ACTION_INFO,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_VISUAL_KEYS,
  DEFAULT_SOURCE_KEYS,
  EXPLORER_ACTIONS,
  OUTLINE_ACTIONS,
  RESIZE_ACTIONS,
  keyChar,
  parseGroup,
  prettyKey,
} from "./keys.ts";

/** A folder's git state is its strongest file's (5.11). */
const GIT_RANK: Record<GitState, number> = { deleted: 0, renamed: 1, modified: 2, new: 3, conflict: 4 };

/** The first line of a file with a merge's conflict marker, or 0. */
function conflictLine(abs: string): number {
  try {
    return (
      readText(abs)
        .text.split(/\r?\n/)
        .findIndex((l) => /^<{7}( |$)/.test(l)) + 1
    );
  } catch {
    return 0;
  }
}

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

/** A picture's most rows (12.x): a big screenshot never takes the page over. */
export const PICTURE_ROWS = 12;
/** At most this many rows for what slipbox draws as a picture (12.16, 12.17): a diagram may be tall. */
export const DRAWING_ROWS = 60;
/** A terminal's words are about this much of its cell's height: what a drawing's are sized to. */
const TEXT_EM = 0.8;
/** How long a view rests from quick scrolling before its pictures are drawn again (12.7). */
export const PICTURES_REST_MS = 120;

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
  /** The whole piece around a line when it fits the lens — a code cell (24.16), a note's innermost section — or null:
   *  the lens opens on one alone, and moves to the next whole rather than gathering it. */
  unit?: (line: number) => Block | null;
}

/** Where to log each command run, for the terminal tests' coverage: `SLIPBOX_TRACE`. */
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

/** What the left panel shows: the file tree, the window's history, or source control (26.2). */
export type LeftView = "explorer" | "history" | "git";
/** What the right panel shows, always of the file on screen: its Info, its outline, its footnotes
 *  (more to come: comments). */
export type RightView = "info" | "outline" | "footnotes";

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
  { id: "git", title: "Source control", glyph: (g) => g.gitButton },
];

/** One row of the Problems panel's All tab (1.7): a section's heading, a note with problems under it, or a problem. */
export interface ProblemRow {
  section: string;
  heading: boolean;
  /** A note's row (its problems under it): its path. */
  note?: string;
  /** What's shown first: a heading's name and count, a note's path, a problem's line (`L12`). */
  label: string;
  /** How it's written, and why it's a problem. */
  detail: string;
  text: string;
  folded: boolean;
  link?: LinkProblem;
  /** A linter's finding (3.21). */
  lint?: LintIssue;
  /** A file in a merge's conflict (5.12), at its first marker. */
  conflict?: { path: string; line: number };
  /** Frontmatter that breaks its document type's rules (22.2), at its line. */
  frontmatter?: { path: string; line: number };
}

export const RIGHT_VIEWS: PanelView<RightView>[] = [
  { id: "info", title: "Info", glyph: (g) => g.infoButton },
  { id: "outline", title: "Outline", glyph: (g) => g.outlineButton },
  { id: "footnotes", title: "Footnotes", glyph: (g) => g.footnotesButton },
];

/**
 * One row of the Info view (3.19): a section's heading, or a name and its value under one. `act`:
 * what `enter` does with it.
 */
export interface InfoRow {
  section: string;
  heading: boolean;
  key: string;
  value: string;
  /** A nested property's depth under its section. */
  depth: number;
  /** What the filter matches. */
  text: string;
  folded: boolean;
  act?: { copy: string } | { line: number } | { tag: string } | { run: string };
}

/**
 * One row of the footnotes view (3.17): a footnote — its label and text — or, unfolded under it,
 * one of its references with its line.
 */
export interface FootnoteRow {
  fn: Footnote;
  /** A reference's row: where it is. */
  ref: { line: number; column: number } | null;
  /** What the row shows (and the filter matches). */
  text: string;
  hasChildren: boolean;
  folded: boolean;
}

/**
 * One row of the history view: a place in the window's timeline, newest first; then the notes
 * read lately in this vault in other windows and sessions, under a heading.
 */
export interface HistoryRow {
  /** The note's name (the pane is narrow); `path` is what the filter matches. */
  label: string;
  path: string;
  hint: string;
  /** Its index in the timeline (oldest first); -1 for a recent note or the heading. */
  index: number;
  here: boolean;
  /** A note read lately, not in this window's timeline: its buffer key, opened here. */
  recent?: string;
  /** The heading over the recent notes: drawn dim, never selected. */
  heading?: boolean;
}

/** What an explorer operation acts on (18.x): a note or file, a folder, or a nested vault's folder. */
export interface ExplorerItem {
  rel: string;
  dir: boolean;
  vault?: boolean;
}

export interface TreeRow {
  /** "note": a row the explorer opens — a note, or a data or text file (`group` says which).
   *  "root": a folder that is another root — a vault, a repository — or, in a loose folder, a
   *  folder beside it: opening one switches the TUI there (17.13, 17.14). */
  kind: "dir" | "note" | "root";
  path: string;
  name: string;
  depth: number;
  /** A file beyond notes: its group (16.x). */
  group?: FileGroup;
  /** A root row: what it is, where it is, and the vault's name when it isn't the folder's; `other`:
   *  another of the explorer's roots (20.15), beside the vault open — unfolded, not entered; `here`:
   *  the root open, in a folder above it the explorer climbed to (`..`) — its tree under it. */
  root?: { kind: "vault" | "folder"; abs: string; name?: string; other?: boolean; here?: boolean };
  /** A row of another root (20.15): that root's folder. Opening its file switches into it. */
  under?: string;
  /** A row above the root open (`..` climbed): its path absolute, listed a level at a time. Opening
   *  its file switches into the file's root, as a link does. */
  outside?: boolean;
}

export type Region = "content" | "sidebar" | "outline" | "problems";

/** The Problems panel's least height (1.7), its tabs' row included, on a screen tall enough for it. */
export const PANEL_ROWS = 12;

/**
 * The Problems panel (1.7, 19.8), full width at the bottom: in tabs, the file on screen's problems — from every
 * source, each with its line — and the root's (its links' and lint's, its conflicts, its orphans). Each tab keeps its
 * selection, its first row shown and its filter (`/`).
 */
export interface ProblemsPanel {
  shown: boolean;
  tab: "file" | "all";
  /** Its height, its tabs' row included, as resized (resize mode, a drag of its rule); null: a third of the screen. */
  height: number | null;
  file: PanelList;
  all: PanelList;
}

/** One of the Problems panel's lists: its selection, its first row shown, its filter and whether keys go to it. */
export interface PanelList {
  selected: number;
  scroll: number;
  filter: string;
  filtering: boolean;
}

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
  /** Misspelt words marked in notes (25.6). */
  spell: boolean;
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
    spell: c.spell.enabled,
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
  /** Show the named folders at once (17.14, 21.10): slipbox was opened on a loose folder, not a file. */
  launcher?: boolean;
  /** The folder slipbox was opened on, inside its root: the explorer starts there (`..` climbs). */
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
  private leftPositions = new Map<
    LeftView,
    Pick<SidePaneState, "selected" | "scroll" | "left" | "pinned" | "filter">
  >();
  /** What the right panel shows (3.17); `outline` is its state, whichever view that is. */
  rightView: RightView = "outline";
  private rightPositions = new Map<
    RightView,
    Pick<SidePaneState, "selected" | "scroll" | "left" | "pinned" | "filter">
  >();
  /** The Problems panel (1.7, at the bottom): shown or not, its tab, each tab's place. */
  problemsPanel: ProblemsPanel = {
    shown: false,
    tab: "file",
    height: null,
    file: { selected: 0, scroll: 0, filter: "", filtering: false },
    all: { selected: 0, scroll: 0, filter: "", filtering: false },
  };
  /** The panel's keys: the explorer's (as configured), and tab / shift+tab between its tabs. */
  problemsKeys!: Keymap;
  /** The Problems panel's folded sections (All), by name (1.7). */
  problemsFolded = new Set<string>();
  /** The Info view's folded sections, by name (3.19). */
  infoFolded = new Set<string>();
  private infoCache: { key: string; rows: Omit<InfoRow, "folded">[] } | null = null;
  /** The footnotes whose references are unfolded in the footnotes view, by id. */
  footnotesOpen = new Set<string>();
  private footnoteCache: { key: string; list: Footnote[] } | null = null;
  outline: SidePaneState & { folded: Set<number>; forKey: string };
  expanded = new Set<string>();
  /**
   * The explorer's top folder (absolute): the root's, or the folder slipbox was opened on; `..` climbs
   * from it — above the root too, to `/`, a folder listed a level at a time (never walked).
   */
  explorerTop = "";
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
  private picturesTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the wheel last scrolled (12.7). */
  private wheelAt = -Infinity;

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
  /** Other roots, reached by paths out of this root and by pointers (`slipbox://name/…`), and their backlinks. */
  reach: Reach;
  watcher: VaultWatcher | null = null;
  ui: UiState;
  private drawFailed = false;
  /** The terminal's title as last told (host.setTitle). */
  private termTitle: string | null = null;

  /** Commands run from the palette or help, most recent first (kept in the session). */
  recentCommands: string[] = [];

  /** UI settings changed in this session, with the config value each overrode. */
  uiOverrides: Record<string, UiOverride> = {};
  private tree: TreeRow[] | null = null;
  private readonly configFile: string | undefined;
  private readonly configLastGood = new Map<string, Record<string, unknown>>();
  /** Which file set each setting taken, for saying where one came from (the links' convention, 21.4). */
  configOrigins: Record<string, string> = {};
  private configStamps = new Map<string, number>();
  readonly now: () => number;
  quitting = false;
  indexing = 0;
  /** Watching, polling and indexing in the background (off in tests that drive time themselves). */
  private readonly live: boolean;
  /** `--theme`: kept over a vault's own theme when switching vaults. */
  private readonly explicitTheme: string | undefined;
  /** Where the TUI was before each switch into another vault: `back` returns there (17.10). */
  vaultTrail: { root: string; path: string; anchor: Anchor; cursor: CursorAnchor }[] = [];

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.explorerTop = opts.loc.root;
    if (opts.folder && opts.folder !== opts.loc.root && isInside(opts.loc.root, opts.folder))
      this.setExplorerTop(opts.folder);
    this.mainRoot = opts.loc.root;
    this.mainKey = opts.loc.key;
    this.pinnedRoots = new Set(readJson<string[]>(this.pinnedRootsFile(), []).filter((r) => typeof r === "string"));
    this.config = opts.config;
    this.graph = opts.graph;
    // This machine sees the root (17.6); a named folder moved here by hand brought its state (21.8).
    const { carriedFrom } = opts.recorded ?? recordLocation(opts.loc);
    this.reach = new Reach(opts.loc);
    this.graph.reach ??= this.reach;
    this.lintCmd = lintCommand(opts.config.lint, opts.loc.root, undefined, opts.config.lsp.auto_install);
    this.host = opts.host;
    this.configFile = opts.configFile;
    this.live = opts.watch !== false;
    this.followGraph();
    this.explicitTheme = opts.themeName;
    // Each config file's last good contents, so a typo saved mid-edit keeps what it said (reload).
    this.configOrigins = loadConfig({
      ...configFilesFor(opts.loc),
      configFile: opts.configFile,
      lastGood: this.configLastGood,
    }).origins;
    this.now = opts.now ?? Date.now;
    this.feed = new VaultFeed({
      checkout: () => this.checkout,
      graph: () => this.graph,
      now: () => this.now(),
      locked: () => this.gitIndexLocked(),
      apply: (b) => {
        this.applyChanges(b);
        this.host.requestRender();
      },
      headMoved: (was, now, moves) => this.headMoved(was, now, moves),
      gitNews: () => this.refreshGit(),
    });
    this.ui = uiDefaults(opts.config);
    if (opts.themeName) this.ui.theme = opts.themeName;
    if (process.env.NO_COLOR) this.ui.theme = "mono";
    this.sidebar = { visible: opts.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.sideW = opts.config.ui.sidebar_width;
    this.outW = opts.config.ui.outline_width;
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
    this.applyKeys();
    for (const w of opts.warnings ?? []) this.message("warn", w);
    for (const e of this.graph.errors) this.message("warn", e);
    if (carriedFrom) this.message("info", carried(this.loc, carriedFrom));

    this.recentCommands = (loadSession(this.loc)?.recent_commands ?? [])
      .filter((id) => typeof id === "string")
      .slice(0, RECENT_MAX);
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
    // Moved here by hand, its state along (21.8): the links the move broke, their fix previewed (20.17).
    if (carriedFrom) this.offerMovedRelink();
    // Opened on a loose folder, the named folders to go into (17.14, 21.10).
    if (opts.launcher && !this.overlay && this.folderChoices().length) this.openFolders();
    // A second copy of this folder (21.6): which one links open, asked once.
    if (!this.overlay) this.askDefaultCopy();
    // A grammar (or anything lazy) that finished loading: lay out again and draw.
    this.stopLazy = onLoaded((name) => {
      this.graph.grammarsChanged(); // code files' comment links can be read now (16.10)
      // Notes drawn while it loaded (a Mermaid diagram as its code, 12.10): drawn again — those only.
      for (const b of this.buffers.values()) b.arrived(name);
      this.relayoutAll();
      this.host.requestRender();
    });
    this.publishState();
    this.recordConfigStamps();
    if (opts.watch !== false) {
      this.startServers();
      if (this.config.watch.enabled) this.startWatcher();
      this.startPolling();
      this.indexInBackground();
      this.refreshGit();
      this.startAutoIndex();
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
      this.message(
        "warn",
        `config: input.leader "${c.input.leader}" is also ${DEFAULT_KEYS[leader]}: that key now waits for more`,
      );
    }
    this.leader = leader;
    const { visual, explorer, outline, footnotes, info, resize, source, ...normal } = c.keys;
    this.keymap = new Keymap(DEFAULT_KEYS, normal as Record<string, string>, this.leader);
    this.visualKeys = new Keymap(DEFAULT_VISUAL_KEYS, visual ?? {}, this.leader);
    this.sourceKeys = new Keymap(DEFAULT_SOURCE_KEYS, source ?? {}, this.leader);
    this.explorerKeys = new Keymap(DEFAULT_EXPLORER_KEYS, explorer ?? {}, this.leader);
    this.problemsKeys = new Keymap(
      { ...DEFAULT_EXPLORER_KEYS, tab: "switch", "shift+tab": "switch" },
      explorer ?? {},
      this.leader,
    );
    this.outlineKeys = new Keymap(DEFAULT_OUTLINE_KEYS, outline ?? {}, this.leader);
    this.footnoteKeys = new Keymap(DEFAULT_FOOTNOTE_KEYS, footnotes ?? {}, this.leader);
    this.infoKeys = new Keymap(DEFAULT_INFO_KEYS, info ?? {}, this.leader);
    this.resizeKeys = new Keymap(DEFAULT_RESIZE_KEYS, resize ?? {}, this.leader);
    // No prototype: a typed :toString or :constructor is an unknown alias, not Object's.
    this.aliases = Object.assign(Object.create(null) as Record<string, string>, DEFAULT_ALIASES);
    for (const [k, v] of Object.entries(c.aliases)) {
      if (v === "") delete this.aliases[k];
      else this.aliases[k] = v;
    }
    this.groups = new Map();
    for (const [k, v] of Object.entries({ ...DEFAULT_GROUPS, ...c.groups }))
      this.groups.set(canonSeq(k, this.leader), parseGroup(v));
    const ids = new Set(this.registry.list().map((x) => x.id));
    const bad = [...this.keymap.entries(), ...this.visualKeys.entries(), ...this.sourceKeys.entries()]
      .map(([, v]) => v.split(" ")[0]!)
      .filter((id) => !ids.has(id));
    for (const id of new Set(bad)) this.message("warn", `config: [keys] binds unknown command "${id}"`);
    for (const [a, v] of Object.entries(this.aliases))
      if (!ids.has(v.split(" ")[0]!)) this.message("warn", `config: [aliases] ${a} = unknown command "${v}"`);
    // Keys with a modifier slipbox doesn't know can never be pressed: say so.
    const tables: [string, Record<string, unknown>][] = [["keys", c.keys as Record<string, unknown>]];
    for (const sub of ["visual", "source", "explorer", "outline", "footnotes", "info", "resize"]) {
      const t = (c.keys as Record<string, unknown>)[sub];
      if (t && typeof t === "object") tables.push([`keys.${sub}`, t as Record<string, unknown>]);
    }
    for (const [table, map] of tables) {
      for (const k of Object.keys(map)) {
        const bad = unknownModifiers(k);
        if (bad.length)
          this.message(
            "warn",
            `config: [${table}] "${k}": unknown modifier ${bad.map((b) => `"${b}"`).join(", ")} (ctrl, alt, shift, cmd)`,
          );
      }
    }
    // The in-pane keymaps name actions, not commands: check them against their own lists.
    const panes: [string, Keymap, readonly string[]][] = [
      ["keys.explorer", this.explorerKeys, EXPLORER_ACTIONS],
      ["keys.outline", this.outlineKeys, OUTLINE_ACTIONS],
      ["keys.footnotes", this.footnoteKeys, FOOTNOTE_ACTIONS],
      ["keys.info", this.infoKeys, INFO_ACTIONS],
      ["keys.resize", this.resizeKeys, Object.keys(RESIZE_ACTIONS)],
    ];
    for (const [table, map, actions] of panes) {
      for (const a of new Set(map.entries().map(([, v]) => v)))
        if (!actions.includes(a))
          this.message("warn", `config: [${table}] binds unknown action "${a}" (${actions.join(", ")})`);
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

  /** Widths count another way now (the terminal's answer, `setWidthMethod`): every layout made again. */
  widthsChanged(): void {
    for (const b of this.buffers.values()) b.invalidateLayouts();
    this.relayoutAll();
    this.invalidateTree();
    this.host.requestRender();
  }

  /** Whether the terminal draws images, or its cell's size, changed (12.x): every note laid out again. */
  picturesChanged(): void {
    this.widthsChanged();
  }

  /**
   * Whether a view's pictures are drawn this frame (12.7). As Unicode placeholders, always: they're text. Otherwise —
   * OpenTUI's own picture path, which numbers pictures by the order they're drawn in and sends them again as that
   * changes — a step of scrolling draws them, but quick steps after it (a key held) don't, nor a wheel's from its
   * first tick: their rows stay, and they're drawn once it rests.
   */
  picturesNow(view: View): boolean {
    if (this.host.images?.placeholders?.()) return true;
    const now = this.now();
    const p = view.pictures;
    // Not scrolled yet: its first step is a step, however soon it comes.
    if (!p) view.pictures = { top: view.top, at: -Infinity, wait: false };
    else if (p.top !== view.top) {
      p.wait = now - p.at < PICTURES_REST_MS || now - this.wheelAt < PICTURES_REST_MS;
      p.top = view.top;
      p.at = now;
      if (p.wait) {
        // A frame when it has rested, to draw them.
        if (this.picturesTimer) clearTimeout(this.picturesTimer);
        this.picturesTimer = setTimeout(() => this.host.requestRender(), PICTURES_REST_MS + 10);
      }
    } else if (p.wait && now - p.at >= PICTURES_REST_MS) p.wait = false;
    return !view.pictures!.wait;
  }

  /** Pictures on the internet (12.12), fetched into the cache: there, the notes laid out again; failed, why. */
  readonly remoteImages = new RemoteImages(
    (url, init) => (this.host.fetch ? this.host.fetch(url, init) : fetch(url, init)),
    (url, error) => {
      if (error) this.message("warn", `couldn't fetch ${url}: ${error}`);
      else this.picturesChanged();
    },
  );

  /**
   * `enter` on a picture on the internet (12.12): fetched — `ask`'s question answered yes (this once, or for its site
   * from now on, this run), or at once where its site is said yes to or `show` fetches; with `never`, or fetched
   * already, its address copied as a link's is. True when it was the picture's to handle.
   */
  followRemoteImage(url: string): boolean {
    const mode = this.config.render.images_remote;
    const site = RemoteImages.site(url);
    if (!site || mode === "never" || this.remoteImages.cached(url)) return false;
    if (mode === "show" || this.remoteImages.sites.has(site)) {
      this.remoteImages.fetch(url, true);
      this.message("info", `fetching ${url}`);
      return true;
    }
    this.openList({
      title: `Fetch this picture from ${site}?`,
      filterable: false,
      items: [
        { label: "(o) Yes, this once", hotkey: "o", data: "once" },
        { label: `(s) Yes, and from ${site} without asking`, detail: "until slipbox quits", hotkey: "s", data: "site" },
        { label: "(n) No", hotkey: "n", data: "no" },
      ],
      accept: (item) => {
        if (item.data === "no") return;
        if (item.data === "site") this.remoteImages.sites.add(site);
        this.remoteImages.fetch(url, true);
        this.message("info", `fetching ${url}`);
      },
    });
    return true;
  }

  /**
   * A note's pictures (12.x): where the terminal draws images and `[render] images` lets it, an image file — found as
   * the note's links are, or fetched from the internet (12.12); an SVG rasterised (12.15) — sized to the width, its
   * proportions kept, at most PICTURE_ROWS rows; else none, `▣ alt` the floor. And what slipbox draws as pictures, as
   * chosen (12.16, 12.17): `drawings`, in the theme's colours.
   */
  picturesFor(buf: NoteBuffer):
    | {
        picture: (from: PictureSource, width: number) => Picture | null;
        key: string;
        drawings?: RenderOptions["drawings"];
      }
    | undefined {
    const images = this.host.images;
    if (this.config.render.images === "never" || !images?.supported()) return undefined;
    const cell = images.cell() ?? { width: 8, height: 16 };
    const drawings = this.drawings();
    // Found as the note's links are (12.13): a path from its folder, a name from where it is.
    const locate = pictureLocator(this.graph, buf.rel, buf.abs);
    return {
      key: `${cell.width}x${cell.height}|${JSON.stringify(drawings)}`,
      drawings,
      picture: (asked, width) => {
        const from = locate(asked);
        if (!from) return null;
        if ("svg" in from) return this.drawnPicture(from.svg, from.kind, width, cell);
        let path: string;
        if ("file" in from) path = from.file;
        else {
          // On the internet (12.12): drawn once it's fetched — `show` fetches it now, `ask` (its site said yes to) too.
          const url = from.url;
          const remote = this.config.render.images_remote;
          const site = RemoteImages.site(url);
          if (remote === "never" || !site) return null;
          const cached = this.remoteImages.cached(url);
          if (!cached) {
            if (remote === "show" || this.remoteImages.sites.has(site)) this.remoteImages.fetch(url);
            return null;
          }
          path = cached;
        }
        // An SVG (12.15): rasterised at the size it's drawn, its own size its natural one.
        const svg = svgText(path);
        const r = svg ? rasterizer() : null;
        const size = svg ? (r?.size(svg) ?? null) : images.size(path);
        if (!size || size.width <= 0 || size.height <= 0) return null;
        // Obsidian's size, `|300` its width and `|240x180` the box it fits in, in place of its own; proportions kept.
        const px =
          "file" in from && from.size
            ? Math.min(from.size.width, from.size.height ? (from.size.height * size.width) / size.height : Infinity)
            : size.width;
        const { cols, rows } = fitPicture(px, (px * size.height) / size.width, width, cell, PICTURE_ROWS);
        if (!svg) return { src: path, cols, rows };
        const png = r && this.rasterized(svg, cols * cell.width, r);
        return png ? { src: png, cols, rows } : null;
      },
    };
  }

  /**
   * What slipbox draws as pictures (12.16, 12.17), as `[render] mermaid` and `math` choose, in the theme's colours —
   * `ansi:N` as xterm has it, `default` the theme's kind's.
   */
  private drawings(): NonNullable<RenderOptions["drawings"]> {
    const r = this.config.render;
    const t = this.theme;
    const dark = t.kind === "dark";
    const fg = colorHex(t.roles.text.fg ?? t.fg, dark ? "#d4d4d4" : "#1f1f1f");
    const of = (role: Role) => colorHex(t.roles[role].fg ?? fg, fg);
    const colors = {
      bg: colorHex(t.bg, dark ? "#1e1e1e" : "#ffffff"),
      fg,
      line: of("table_border"),
      accent: of("link"),
      muted: of("dim"),
      math: of("math"),
    };
    return { mermaid: r.mermaid === "picture", math: r.math === "picture", colors };
  }

  /**
   * A drawing slipbox made (12.16, 12.17) as a picture: a diagram as big as the terminal's words would be beside it
   * (its words are 13 pixels; a terminal's, about 0.8 of its cell's height), a display's maths too (MathJax's sizes are
   * in `ex`). A diagram wider than the text is drawn smaller; maths isn't — it's text then. Null while resvg loads.
   */
  private drawnPicture(
    svg: string,
    kind: "diagram" | "math",
    width: number,
    cell: { width: number; height: number },
  ): Picture | null {
    const r = rasterizer();
    if (!r) return null;
    const em = cell.height * TEXT_EM;
    let w: number;
    let h: number;
    if (kind === "math") {
      const ex = (attr: string) =>
        Number(new RegExp(`<svg[^>]*\\b${attr}="([\\d.]+)ex"`).exec(svg)?.[1] ?? Number.NaN) * em * 0.431;
      [w, h] = [ex("width"), ex("height")];
      if (!(w > 0 && h > 0) || w > width * cell.width) return null;
    } else {
      // (resvg refuses an SVG without a size.)
      const size = r.size(svg);
      if (!size) return null;
      [w, h] = [(size.width * em) / 13, (size.height * em) / 13];
    }
    const { cols, rows } = fitPicture(w, h, width, cell, DRAWING_ROWS);
    const png = this.rasterized(svg, cols * cell.width, r);
    return png ? { src: png, cols, rows } : null;
  }

  /** An SVG rasterised `px` wide (12.15), kept in the cache by its text and width: the PNG's path, or null. */
  private rasterized(svg: string, px: number, r: Rasterizer): string | null {
    const dir = join(cacheHome(), "images");
    const file = join(dir, `svg-${createHash("sha256").update(svg).digest("hex").slice(0, 32)}-${px}.png`);
    if (existsSync(file)) return file;
    const png = r.png(svg, px);
    if (!png) return null;
    try {
      ensureCacheHome();
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${file}.part`, png);
      renameSync(`${file}.part`, file);
      return file;
    } catch {
      return null;
    }
  }

  private configFiles(): string[] {
    // Yours, the enclosing roots' (20.7) and the root's own: a change to any is a reload.
    const { vaultFile, outerFiles } = configFilesFor(this.loc);
    return [
      this.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile(),
      ...outerFiles,
      ...(vaultFile ? [vaultFile] : []),
    ];
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
    const loaded = loadConfig({
      ...configFilesFor(this.loc),
      configFile: this.configFile,
      lastGood: this.configLastGood,
    });
    this.configOrigins = loaded.origins;
    this.infoCache = null; // the links' convention may say otherwise now
    this.clearPending(); // a sequence begun under the old keys means nothing under the new ones
    const before = this.config;
    const next = loaded.config;
    this.config = next;
    setRootMarkers(next.walk.root_markers); // where roots are, from now on (21.1): your config only
    setTrustedRoots(next.trust.roots); // and which may run their own code (23.x): yours only too
    this.lintCmd = lintCommand(next.lint, this.loc.root, undefined, next.lsp.auto_install);
    const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const changed = (Object.keys(next) as (keyof Config)[]).filter((s) => differs(before[s], next[s]));
    if (changed.includes("search") && !changed.includes("walk")) this.startSearch();
    // Linters (19.19) tried again, and every file linted again, under the new ones.
    if (changed.some((s) => s === "linter" || s === "language" || s === "lint")) this.relint();

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
      this.followGraph();
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
    this.message(
      "info",
      `config reloaded (${reason}) — ${changed.length ? `changed: ${changed.join(", ")}` : "no changes"}`,
    );
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
    // The floating editor (3.20), while it's open, is the window the keys and commands act on.
    if (this.floating) return this.floating.view;
    return this.tabView;
  }

  /** The tab's active window: the one under the floating window while that is open. */
  get tabView(): View | null {
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
        this.message("warn", `${relRaw} points outside the root; not opening it`);
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
      // Links in its comments (16.10): URLs, and paths that name a file of the vault — where each goes, for the code view.
      const rel = buf.rel;
      const links = commentLinks(tree.comments()).flatMap((l) => {
        if (l.url) return [l];
        const path = rel ? this.graph.commentPath(l.target, rel) : null;
        return path ? [{ ...l, href: `/${path}${l.at ? `#L${l.at}` : ""}` }] : [];
      });
      // A part in another language (16.22): its lines highlighted in it.
      buf.syntax = {
        version: buf.version,
        spans,
        outline: tree.outline(),
        errors: tree.errors(),
        links,
        languages: tree.languages(),
        code: tree.codeModel(),
      };
      tree.delete();
      buf.invalidateLayouts();
      for (const v of this.allViews()) {
        if (v.buf !== buf) continue;
        v.layoutKey = "";
        // The code view's lens, not being typed into: its document made again on this parse (24.8).
        if (v.live && !v.insert && this.isCodeDocument(buf)) v.liveBase = undefined;
      }
      this.host.requestRender();
    };
    const t = setTimeout(run, buf.syntax ? 150 : 0);
    (t as { unref?: () => void }).unref?.();
    this.syntaxTimers.set(buf, t);
  }

  private readonly syntaxTimers = new Map<NoteBuffer, ReturnType<typeof setTimeout>>();

  // Language servers (19.x): the code's own servers — its problems, and later hover and jumps.

  /** The servers of the files open here; null when off (`[lsp] enabled`) or in tests that don't run them. */
  servers: ServerManager | null = null;
  /** Completion's popup while typing (19.16), and the signature being typed. */
  completion: CompletionState | null = null;
  signature: SignatureState | null = null;
  /** Each file's servers' trigger characters, asked once its servers run. */
  private readonly triggerCache = new Map<string, { completion: string[]; signature: string[] }>();

  /** The characters that ask a file's servers for completion and signature help (none until they've said). */
  serverTriggers(path: string): { completion: string[]; signature: string[] } {
    const known = this.triggerCache.get(path);
    if (known) return known;
    void this.servers?.triggers(path).then((t) => this.triggerCache.set(path, t));
    return { completion: [], signature: [] };
  }
  private readonly serverTimers = new Map<NoteBuffer, ReturnType<typeof setTimeout>>();

  /** A root's trust, to be asked (23.x): when nothing else is open and no one is typing. */
  private pendingTrust: { root: string; limits: string[] } | null = null;

  /**
   * The folder a trust answer is for: the root you opened, when the project is in it — every project
   * in it with one answer — else the project's own folder. Never a plain folder you opened (`~`).
   */
  trustTarget(path: string): string {
    const r = this.loc.root;
    if (this.loc.mode === "vault" && r !== homedir() && (path === r || path.startsWith(`${r}/`))) return r;
    return checkoutOf(path)?.root ?? path;
  }

  /** A root whose own code would run, not answered for yet: asked whether you trust it, once (23.x). */
  askTrust(root: string, limits: string[]): void {
    this.pendingTrust ??= { root, limits };
    this.askTrustNow();
  }

  /** The trust question, if one waits and nothing else is open, no one typing (a typed `n` would answer it). */
  askTrustNow(): void {
    const p = this.pendingTrust;
    if (!p || this.overlay || this.allViews().some((v) => v.insert)) return;
    this.pendingTrust = null;
    const at = this.trustTarget(p.root);
    if (trustOf(at) !== null) return;
    this.confirm(
      `Trust ${tildePath(at)}? Its own tools would run code it holds — ${p.limits.join("; ")}. Only a folder you know (y trusts it; n keeps it safe)`,
      () => this.trustRoot(at, true),
      () => this.trustRoot(at, false),
    );
  }

  /** A root trusted, or kept restricted, remembered (23.x): its servers started again, the way it now runs. */
  trustRoot(at: string, yes: boolean): void {
    const was = isTrusted(at);
    setTrust(at, yes ? "trusted" : "restricted");
    if (!yes && isTrusted(at))
      return this.message("warn", `${tildePath(at)} is still trusted: your config's [trust] roots lists it`);
    if (was !== yes) {
      this.servers?.restartUnder(at);
      this.refreshGit();
    }
    if (yes)
      this.message(
        "info",
        `trusted ${tildePath(at)}: its own tools run as they would anywhere — :untrust takes it back`,
      );
    else this.message("info", `${tildePath(at)} kept safe: nothing of its own runs — :trust trusts it`);
  }

  /** The manager started: it starts each server when a file first needs it. */
  startServers(): void {
    if (this.servers || !this.config.lsp.enabled) return;
    this.servers = new ServerManager({
      table: () => serverTable(this.config["language-server"], this.config.language),
      userTable: () => this.userServerTable(),
      autoInstall: () => this.config.lsp.auto_install,
      problems: (path, server, version, list, raw) => {
        const buf = [...this.buffers.values()].find((b) => b.abs === path);
        if (!buf) return;
        // Without a version, they're for the text it was last told.
        buf.serverProblems.set(server, { version: version ?? buf.serverVersion, list, raw });
        for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
        this.host.requestRender();
      },
      message: (level, text) => {
        this.message(level, text);
        this.host.requestRender();
      },
      applyEdit: (edit) => {
        const r = this.applyWorkspaceEdit(edit);
        this.host.requestRender();
        return r.files > 0;
      },
      ask: (root, limits) => {
        this.askTrust(root, limits);
        this.host.requestRender();
      },
    });
    // Exiting without quitting (a signal): the servers go too.
    process.once("exit", () => this.servers?.killAll());
  }

  /**
   * A file's symbols from its language server, as its outline (19.14) — only for a file tree-sitter
   * has no outline of (16.8): tree-sitter's is there at once, and leaves out the variables a server lists.
   */
  async serverSymbols(buf: NoteBuffer): Promise<void> {
    const s = this.servers;
    if (!s || buf.kind.group === "note" || grammarFor(buf.kind.format, extensionOf(buf.name))) return;
    const version = buf.version;
    const answer = await s.request<DocumentSymbol[] | SymbolInformation[]>(
      buf.abs,
      "textDocument/documentSymbol",
      { textDocument: { uri: pathToFileURL(buf.abs).href } },
      "documentSymbolProvider",
      "document-symbols",
    );
    if (!answer || buf.version !== version) return;
    buf.serverOutline = outlineOf(answer.result);
    buf.invalidateLayouts();
    for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
    this.host.requestRender();
  }

  /** A server's edit as each file's text edits: `changes`, or `documentChanges`' text edits (a file to make, move or delete is left out). */
  editsOf(edit: WorkspaceEdit): { path: string; edits: LspTextEdit[] }[] {
    const out = new Map<string, LspTextEdit[]>();
    const add = (uri: string, edits: LspTextEdit[]) => {
      if (!uri.startsWith("file:")) return;
      const path = fileURLToPath(uri);
      out.set(path, [...(out.get(path) ?? []), ...edits]);
    };
    for (const [uri, edits] of Object.entries(edit.changes ?? {})) add(uri, edits);
    for (const c of edit.documentChanges ?? [])
      if ("textDocument" in c)
        add(
          c.textDocument.uri,
          c.edits.filter((e): e is LspTextEdit => "newText" in e),
        );
    return [...out].map(([path, edits]) => ({ path, edits }));
  }

  /**
   * A server's edit made (19.15), through the buffers: each file's edits one undo step; a file no window
   * shows is saved (writeBuffer), so what's on disk is the edit's; one shown is left for its saving.
   */
  applyWorkspaceEdit(edit: WorkspaceEdit): { files: number; edits: number } {
    let files = 0;
    let count = 0;
    const shown = new Set(this.allViews().map((v) => v.buf));
    for (const { path, edits } of this.editsOf(edit)) {
      const inVault = path.startsWith(`${this.loc.root}/`);
      const buf = this.buffer(inVault ? path.slice(this.loc.root.length + 1) : path);
      if (!buf || !edits.length) continue;
      const wasDirty = buf.dirty;
      // Offsets as the preview's (and LSP's): a character past its line's end is the line's end.
      const doc = TextDocument.create("", "", 0, buf.source);
      const at = (p: { line: number; character: number }) => doc.offsetAt(p);
      // Last first, so each edit's offsets still hold; of inserts at one place, the later one first,
      // so their text reads in the array's order (as LSP has it, and as the preview showed it).
      const sorted = edits
        .map((e, i) => ({ from: at(e.range.start), to: at(e.range.end), text: e.newText, i }))
        .sort((a, b) => b.from - a.from || b.i - a.i);
      buf.beginStep(sorted.at(-1)!.from);
      for (const e of sorted) buf.edit(e.from, e.to - e.from, e.text);
      buf.endStep(sorted.at(-1)!.from);
      for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
      if (!shown.has(buf) && !wasDirty) this.saveBuffer(buf, true);
      files++;
      count += edits.length;
    }
    return { files, edits: count };
  }

  /** A server's edit previewed: each line it changes, in each file, before and after; enter makes it. */
  previewWorkspaceEdit(title: string, edit: WorkspaceEdit, done: () => void = () => {}): void {
    const items: ListItem[] = [];
    let n = 0;
    for (const { path, edits } of this.editsOf(edit)) {
      const open = [...this.buffers.values()].find((b) => b.abs === path);
      let text: string;
      try {
        text = open?.source ?? readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const doc = TextDocument.create("", "", 0, text);
      const next = TextDocument.applyEdits(doc, edits);
      const a = text.split("\n");
      const b = next.split("\n");
      const shown = path.startsWith(`${this.loc.root}/`) ? path.slice(this.loc.root.length + 1) : path;
      for (const h of diffLines(a, b)) {
        for (let k = 0; k < Math.max(h.aLen, h.bLen); k++) {
          items.push({
            label: `${shown}:${h.aStart + k + 1}`,
            detail: `${(a[h.aStart + k] ?? "").trim()}  →  ${(b[h.bStart + k] ?? "").trim()}`,
            data: null,
          });
          n++;
        }
      }
    }
    if (!items.length) return this.message("info", "the server changes nothing");
    const files = new Set(items.map((i) => i.label.slice(0, i.label.lastIndexOf(":")))).size;
    this.openList({
      title: `${title}: ${n} change${n === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"} — enter: do it, esc: cancel`,
      items,
      filterable: false,
      accept: () => {
        const r = this.applyWorkspaceEdit(edit);
        this.message(
          "info",
          `${title}: ${r.edits} change${r.edits === 1 ? "" : "s"} in ${r.files} file${r.files === 1 ? "" : "s"}`,
        );
        done();
      },
    });
  }

  /**
   * A file's servers told its text now, not after the pause: a request about it (a hover, a rename, a
   * code action) must be answered for the text as it is — a fix made a moment ago included. Sent
   * before the request on the same connection, so the server has it first.
   */
  syncServers(buf: NoteBuffer): void {
    const s = this.servers;
    if (!s?.isOpen(buf.abs) || buf.serverVersion === buf.version) return;
    const t = this.serverTimers.get(buf);
    if (t) clearTimeout(t);
    this.serverTimers.delete(buf);
    buf.serverVersion = buf.version;
    s.change(buf.abs, buf.version, buf.source);
  }

  /** A file's servers told about it: opened the first time it's shown, its text again 150 ms after
   *  typing pauses — never per key. */
  ensureServers(buf: NoteBuffer): void {
    const s = this.servers;
    if (!s || buf.virtual || buf.deleted || buf.serverVersion === buf.version || this.serverTimers.has(buf)) return;
    if (!s.isOpen(buf.abs)) {
      buf.serverVersion = buf.version;
      s.open(buf.abs, buf.version, buf.source);
      return void this.serverSymbols(buf);
    }
    const t = setTimeout(() => {
      this.serverTimers.delete(buf);
      buf.serverVersion = buf.version;
      s.change(buf.abs, buf.version, buf.source);
      void this.serverSymbols(buf);
    }, 150);
    (t as { unref?: () => void }).unref?.();
    this.serverTimers.set(buf, t);
  }

  // Linters without a server (19.19): a file's, by its language, each where its project asks for it —
  // one reading its input on the text as typed, once typing pauses; the others on the file as saved.

  private tablesMemo: { config: Config; servers: ServerTable; linters: Record<string, LinterDef> } | null = null;
  private userTableMemo: { config: Config; table: ServerTable } | null = null;
  /** The servers as your own config has them, no folder's: their settings in a root you don't trust (23.3). */
  userServerTable(): ServerTable {
    if (this.userTableMemo?.config !== this.config) {
      const yours = loadConfig({ configFile: this.configFile }).config;
      this.userTableMemo = { config: this.config, table: serverTable(yours["language-server"], yours.language) };
    }
    return this.userTableMemo.table;
  }
  /** The languages and linters in effect, as the config has them. */
  private tables(): { servers: ServerTable; linters: Record<string, LinterDef> } {
    if (this.tablesMemo?.config !== this.config)
      this.tablesMemo = {
        config: this.config,
        servers: serverTable(this.config["language-server"], this.config.language),
        linters: linterTable(this.config.linter),
      };
    return this.tablesMemo;
  }
  private readonly linterRuns = new Map<
    NoteBuffer,
    { timer: ReturnType<typeof setTimeout>; version: number } | "running"
  >();
  /** Linters that couldn't run: said once, and not tried again until the config changes. */
  private readonly linterFailed = new Set<string>();

  /** A file's linters, run when its text (or its saved text) hasn't been linted as it is: at once the first
   *  time, then 500 ms after typing pauses, or after a save. */
  ensureLinters(buf: NoteBuffer): void {
    if (this.config.lint.enabled === "off" || buf.virtual || buf.deleted) return;
    const typed = buf.linted.typed !== buf.version;
    const saved = !buf.dirty && buf.linted.saved !== buf.version;
    if (!typed && !saved) return;
    const pending = this.linterRuns.get(buf);
    if (pending === "running" || pending?.version === buf.version) return;
    const { servers, linters } = this.tables();
    const lang = languageOf(servers, buf.abs);
    const defs = (lang?.linters ?? [])
      .map((n) => linters[n])
      .filter((d): d is LinterDef => !!d?.command && !this.linterFailed.has(d.name));
    if (!lang || !defs.some((d) => (d.stdin ? typed : saved))) return;
    if (pending) clearTimeout(pending.timer);
    const project = rootFor(buf.abs, lang.roots);
    const t = setTimeout(
      () => {
        const version = buf.version;
        const text = buf.source;
        const due = defs.filter((d) =>
          d.stdin ? buf.linted.typed !== version : !buf.dirty && buf.linted.saved !== version,
        );
        buf.linted = { typed: version, saved: buf.dirty ? buf.linted.saved : version };
        this.linterRuns.set(buf, "running");
        void Promise.all(
          due.map(async (d) => {
            const root = linterRoot(d, buf.abs, project);
            if (!root) return void buf.linterProblems.delete(d.name); // the project doesn't ask for it
            const r = await runLinter(d, buf.abs, text, root);
            if ("problems" in r) buf.linterProblems.set(d.name, { version, list: r.problems });
            else this.linterCouldNot(d, r.failed, r.detail);
          }),
        ).then(() => {
          this.linterRuns.delete(buf);
          for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
          this.host.requestRender();
        });
      },
      buf.linted.typed >= 0 || buf.linted.saved >= 0 ? 500 : 0,
    );
    (t as { unref?: () => void }).unref?.();
    this.linterRuns.set(buf, { timer: t, version: buf.version });
  }

  /** Linters tried again, and every open file linted again: the config changed. */
  private relint(): void {
    this.linterFailed.clear();
    for (const b of this.buffers.values()) {
      b.linted = { typed: -1, saved: -1 };
      b.linterProblems.clear();
    }
  }

  /** A linter that couldn't run: said once — not installed (and how to get it), too slow, or failing. */
  private linterCouldNot(def: LinterDef, why: "missing" | "timeout" | "error", detail: string): void {
    if (this.linterFailed.has(def.name)) return;
    this.linterFailed.add(def.name);
    const program = def.command.trim().split(/\s+/)[0];
    const text =
      why === "missing"
        ? `linter ${def.name}: ${program} not found${def.hint ? ` — ${def.hint}` : ""}`
        : `linter ${def.name} couldn't run: ${detail}`;
    this.message("warn", text);
  }

  // The lint surface (3.21): your markdownlint-cli2 run on a note once it's saved — its findings
  // beside their lines, on the status line, in the Problems panel — and on the vault for that view.

  /** The linter (`[lint]`), or null: lint off, or it couldn't run. */
  lintCmd: LintCmd | null = null;
  private readonly lintRuns = new Map<NoteBuffer, ReturnType<typeof setTimeout> | "running">();
  /** The whole vault's findings, as last linted (the Problems panel's All tab): null until it's run. */
  vaultLint: { running: boolean; issues: LintIssue[] | null } = { running: false, issues: null };

  /** Lint a note when its text is the file's (saved) and hasn't been linted as it is: at once the
   *  first time, then 300 ms after it's saved again. */
  ensureLint(buf: NoteBuffer): void {
    const cmd = this.lintCmd;
    if (!cmd || buf.kind.group !== "note" || buf.kind.format !== "markdown" || buf.rel === null || buf.virtual) return;
    if (buf.dirty || buf.deleted || buf.lint?.version === buf.version || this.lintRuns.has(buf)) return;
    const version = buf.version;
    const t = setTimeout(
      () => {
        this.lintRuns.set(buf, "running");
        void runLint(cmd, [buf.abs], this.loc.root, undefined, this.sayInstalling).then((issues) => {
          this.lintRuns.delete(buf);
          if (issues === null) return this.lintFailed();
          buf.lint = { version, issues: issues.filter((i) => i.file === buf.abs) };
          // The vault's list follows this note's.
          if (this.vaultLint.issues)
            this.vaultLint.issues = [
              ...this.vaultLint.issues.filter((i) => i.file !== buf.abs),
              ...buf.lint.issues,
            ].sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
          for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
          this.host.requestRender();
        });
      },
      buf.lint ? 300 : 0,
    );
    (t as { unref?: () => void }).unref?.();
    this.lintRuns.set(buf, t);
  }

  /** Lint every note (the Problems panel's Lint section), in runs of a few hundred files. */
  lintVault(): void {
    const cmd = this.lintCmd;
    if (!cmd || this.vaultLint.running) return;
    const files = [...this.graph.notes.keys()]
      .filter((rel) => /\.(md|markdown)$/i.test(rel))
      .sort()
      .map((rel) => join(this.loc.root, rel));
    this.vaultLint = { running: true, issues: this.vaultLint.issues };
    void (async () => {
      const all: LintIssue[] = [];
      for (let i = 0; i < files.length; i += 300) {
        const got = await runLint(cmd, files.slice(i, i + 300), this.loc.root, undefined, this.sayInstalling);
        if (got === null) {
          this.vaultLint = { running: false, issues: null };
          this.lintFailed();
          return this.host.requestRender();
        }
        all.push(...got);
      }
      this.vaultLint = { running: false, issues: all };
      this.host.requestRender();
    })();
  }

  /** markdownlint-cli2 installed first (19.21): said, as a server's install is. */
  private readonly sayInstalling = (text: string) => {
    this.message("info", text);
    this.host.requestRender();
  };

  /** The linter couldn't run: said once, and not tried again until the config says otherwise. */
  private lintFailed(): void {
    if (!this.lintCmd) return;
    this.lintCmd = null;
    this.message(
      "warn",
      `lint: ${lintFailure(this.config)} — [lint] command sets another; enabled = "off" stops trying`,
    );
  }

  // -------------------------------------------------------------------------------------------
  // Search (6.5, 6.9): the vault's index kept as the app runs — brought up to the files in idle
  // slices when the vault opens, then each file as the graph hears it change (a save here, the
  // watcher, a rename) — and a list ranked as you type.

  private checkoutMemo: { root: string; c: Checkout | null; at: number } | null = null;

  /** The git checkout the vault is in (17.19): the main one or a worktree. Read once per vault —
   *  none, again after a second (`git init` may make one). */
  get checkout(): Checkout | null {
    const m = this.checkoutMemo;
    if (m?.root !== this.loc.root || (!m.c && this.now() - m.at > 1000))
      this.checkoutMemo = {
        root: this.loc.root,
        c: this.loc.mode === "vault" ? checkoutOf(this.loc.root) : null,
        at: this.now(),
      };
    return this.checkoutMemo!.c;
  }

  // -------------------------------------------------------------------------------------------
  // Git (5.9, 5.10): what git does to the vault's files as one event — a branch switch, a merge, a
  // reset. The watcher's batches are held while git holds its index lock, then applied together;
  // the files a branch switch brings and takes aren't taken for moves; each branch keeps its tabs.

  /** The watcher's news, held while git writes, applied to the graph (5.9, 5.10). */
  readonly feed: VaultFeed;

  /** HEAD as last seen: its branch, or (detached) its commit. */
  private get head(): Head | null {
    return this.feed.head;
  }

  /** git is mid-commit (or mid-anything) in the vault's checkout (5.10). Looked up afresh when none
   *  is known — a repository can appear, and a loose folder's is checked too: it runs only when an
   *  autosave is due or the watcher has news. */
  private gitIndexLocked(): boolean {
    const c = this.checkout ?? checkoutOf(this.loc.root);
    return !!c && existsSync(join(c.gitDir, "index.lock"));
  }

  /** A batch from the watcher: applied now — or, while git writes, held with the rest it writes. */
  receiveBatch(b: WatchBatch): void {
    this.feed.receive(b);
  }

  /** HEAD looked at (the poll, each batch): when it moved, said so, and the branch's tabs back.
   *  True when it moved. Not while git still writes: then it hasn't finished moving. */
  checkHead(): boolean {
    return this.feed.checkHead();
  }

  // What git knows of the files (5.11–5.14): each one's state for the explorer's marks and the
  // Problems' conflicts — asked of git in the background, a moment after anything changed — and,
  // on request, what this branch changed against the base, a note's diff, the worktrees.

  /** Each changed file's state, by vault path; null until git has answered (or with no git). */
  gitStates: Map<string, GitState> | null = null;
  /** A folder's: the strongest of what's in it. */
  gitFolders = new Map<string, GitState>();
  private gitTimer: ReturnType<typeof setTimeout> | null = null;
  private gitAsking: Promise<void> | null = null;

  /** Ask git again, a moment from now (many changes, one question). */
  refreshGit(): void {
    if (this.gitTimer || !this.live) return;
    this.gitTimer = setTimeout(() => {
      this.gitTimer = null;
      void this.refreshGitNow().then(() => this.host.requestRender());
    }, 250);
    (this.gitTimer as { unref?: () => void }).unref?.();
  }

  /** Ask git now: each file's state, by vault path, and each folder's. */
  refreshGitNow(): Promise<void> {
    if (this.gitAsking) return this.gitAsking;
    const c = this.checkout;
    const root = this.loc.root;
    if (!c) {
      this.gitStates = null;
      this.gitFolders.clear();
      return Promise.resolve();
    }
    this.gitAsking = entriesLater(c)
      .then((entries) => {
        if (this.loc.root !== root) return;
        // Each file's two letters for the source control view (26.2); one state each for the explorer's marks.
        this.gitEntries = entries;
        const status = entries && new Map(entries.map((e) => [e.path, stateOf(e.x + e.y)] as const));
        const states = new Map<string, GitState>();
        const folders = new Map<string, GitState>();
        for (const [path, st] of status ?? []) {
          const rel = inVault(c, root, path);
          if (rel === null || st === "deleted") continue;
          states.set(rel, st);
          for (let d = posix.dirname(rel); d !== "."; d = posix.dirname(d)) {
            const had = folders.get(d);
            if (!had || GIT_RANK[st] > GIT_RANK[had]) folders.set(d, st);
          }
        }
        this.gitStates = status ? states : null;
        this.gitFolders = folders;
        this.invalidateTree();
        // What's staged may have changed with it: the gutter's asked again (26.1), and the view's texts (26.2).
        this.gitGeneration++;
      })
      .finally(() => {
        this.gitAsking = null;
      });
    return this.gitAsking;
  }

  /** Each open file's text as staged (26.1), by buffer: asked of git in the background, again when git has news. Null:
   *  a file git hasn't (untracked: every line added); "none": nothing to compare (ignored, outside the checkout). */
  private readonly staged = new WeakMap<NoteBuffer, { text: string | null | "none"; generation: number }>();
  private readonly stagedAsking = new WeakSet<NoteBuffer>();
  /** Bumped each time git has answered: what's staged read again. */
  gitGeneration = 0;
  /** The checkout's changed files, each with its two letters (26.2); null until git has answered, or with no git. */
  gitEntries: StatusEntry[] | null = null;
  /** The source control view's files opened up into their changes, `section:path`. */
  readonly gitOpen = new Set<string>();
  private readonly gitChangeMemo = new WeakMap<
    NoteBuffer,
    { version: number; generation: number; changes: GitChange[] }
  >();

  /**
   * A file's changes against what's staged (26.1) — its text as it is now, unsaved typing included — or null where there's
   * nothing to compare: signs off, no checkout, a file outside the root, git not answered yet (it's asked now).
   */
  gitChangesOf(view: View): GitChange[] | null {
    const buf = view.buf;
    const c = this.checkout;
    // By its path, not the graph's name for it: a file just made is git's before the walk's.
    if (
      !this.config.git.signs ||
      !c ||
      buf.virtual ||
      !buf.abs ||
      !isInside(c.root, buf.abs) ||
      !isInside(this.loc.root, buf.abs)
    )
      return null;
    const known = this.staged.get(buf);
    if (known?.generation !== this.gitGeneration && !this.stagedAsking.has(buf)) {
      this.stagedAsking.add(buf);
      const generation = this.gitGeneration;
      const rel = relative(this.loc.root, buf.abs).split(sep).join("/");
      void showLater(c, "", relative(c.root, buf.abs)).then((text) => {
        this.stagedAsking.delete(buf);
        // Not staged: a file git doesn't have is all new; one it ignores, or can't show, has no signs.
        const untracked = text === null && this.gitStates?.get(rel) === "new";
        this.staged.set(buf, { text: text ?? (untracked ? null : "none"), generation });
        this.host.requestRender();
      });
    }
    if (!known || known.text === "none") return null;
    const memo = this.gitChangeMemo.get(buf);
    if (memo && memo.version === buf.version && memo.generation === known.generation) return memo.changes;
    const changes = gitChanges(known.text, buf.source);
    this.gitChangeMemo.set(buf, { version: buf.version, generation: known.generation, changes });
    return changes;
  }

  /** The base branch here: `[git] base`, else main or master; null (said) when there's none. */
  private gitBase(c: Checkout): string | null {
    const base = baseBranch(c, this.config.git.base);
    if (!base)
      this.message(
        "warn",
        this.config.git.base
          ? `no branch or commit "${this.config.git.base}" ([git] base)`
          : "no base branch: neither main nor master is there — [git] base sets one",
      );
    return base;
  }

  /** `space g c` (5.13): what this branch changed against the base, committed or not; enter: its diff. */
  openChanges(): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not in a git repository");
    const base = this.gitBase(c);
    if (!base) return;
    const r = changedSince(c, base);
    if (!r) return this.message("warn", "git couldn't say what changed");
    const files = r.files.map((f) => ({ ...f, rel: inVault(c, this.loc.root, f.path) })).filter((f) => f.rel !== null);
    if (!files.length) return this.message("info", `nothing changed against ${base}`);
    const letter: Record<GitState, string> = { new: "+", modified: "M", renamed: "R", deleted: "D", conflict: "!" };
    const role: Record<GitState, Role> = {
      new: "git_new",
      modified: "git_modified",
      renamed: "git_modified",
      deleted: "diff_del",
      conflict: "git_conflict",
    };
    this.openList({
      title: `Changed against ${base} (${files.length}) — enter: the diff`,
      items: files.map((f) => ({
        label: `${letter[f.state]} ${f.rel}`,
        role: role[f.state],
        detail: f.from ? `from ${inVault(c, this.loc.root, f.from) ?? f.from}` : undefined,
        data: f,
      })),
      accept: (item) => {
        const f = item.data as { rel: string; path: string; state: GitState };
        this.showGitDiff(f.rel, () => this.openChanges());
      },
    });
  }

  /** `space g d` (5.13): this note's changes on the branch — against where it left the base. */
  openGitDiff(): void {
    const rel = this.view?.buf.rel;
    if (!rel) return this.message("info", "diff: open a note first");
    this.showGitDiff(rel);
  }

  /** A file's diff against the merge base, a row a line, coloured; enter goes to the line; esc: `back`. */
  showGitDiff(rel: string, back?: () => void): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not in a git repository");
    const base = this.gitBase(c);
    if (!base) return;
    const mergeBase = mergeBaseOf(c, base);
    if (!mergeBase) return this.message("warn", `this branch and ${base} have no commit in common`);
    const before = showAt(c, mergeBase, inCheckout(c, this.loc.root, rel)) ?? "";
    let now = "";
    const open = this.buffers.get(rel);
    try {
      now = open ? open.source : readText(join(this.loc.root, rel)).text;
    } catch {}
    this.showLineDiff(
      before,
      now,
      rel,
      `${rel} against ${base}${back ? " — esc: the changes" : ""}`,
      `no differences from ${base}`,
      back,
    );
  }

  /** A diff, `before` to `now`, a row a line, coloured; enter goes to the line in `rel`; esc: `back`. */
  showLineDiff(
    before: string,
    now: string,
    rel: string,
    title: string,
    none = "no differences",
    back?: () => void,
  ): void {
    const rows = diffRows(before, now);
    const role: Record<string, Role> = { "@@": "diff_head", "+": "diff_add", "-": "diff_del" };
    this.openList({
      title,
      filterable: false,
      items: rows.length
        ? rows.map((r) => ({
            label: r.kind === "@@" ? `@@ ${r.text}` : `${r.kind} ${sanitize(r.text.replace(/\t/g, "  "))}`,
            role: role[r.kind],
            data: r,
          }))
        : [{ label: none, data: null }],
      accept: (item) => {
        const r = item.data as { line: number } | null;
        if (r && existsSync(join(this.loc.root, rel))) this.openAt(rel, r.line);
      },
      ...(back ? { cancel: back } : {}),
    });
  }

  /** A file as it was (26.4, 22.1), read-only in the floating window: a note rendered, any other file as its text. */
  showVersion(text: string, path: string, title: string): void {
    const note = /\.(md|markdown)$/i.test(path);
    this.openHover(note ? text : fence(text, fenceLanguage(path)), title);
  }

  /**
   * `space g o` (26.5): the branches, this one marked; one picked is checked out — unsaved notes saved, or kept as they
   * are, first — and "a new branch from here…" makes one there. git's refusal (a change it would overwrite) is said in its
   * words; a switch done is one event, each branch keeping its tabs (5.9).
   */
  openBranches(): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not a git checkout");
    const branches = branchesOf(c);
    if (!branches) return this.message("warn", "git couldn't list the branches");
    const current = headOf(c).branch;
    const NEW = Symbol("new");
    this.openList({
      title: `Branches (${branches.length}) — enter: check one out`,
      items: [
        ...branches.map((b) => ({ label: sanitize(b), detail: b === current ? "here" : "", data: b })),
        {
          label: "A new branch from here…",
          detail: current ? `from ${sanitize(current)}` : "from this commit",
          data: NEW,
        },
      ],
      selected: Math.max(0, branches.indexOf(current ?? "")),
      accept: (item) => {
        if (item.data === NEW) {
          return this.prompt("new branch: ", (name) => {
            if (name.trim()) this.beforeCheckout(() => this.checkedOut(createBranch(c, name.trim())));
          });
        }
        const name = item.data as string;
        if (name === current) return this.message("info", `already on ${name}`);
        this.beforeCheckout(() => this.checkedOut(switchBranch(c, name)));
      },
    });
  }

  /** Unsaved notes before a checkout changes the files under them: saved, or kept as they are — asked; none, at once. */
  private beforeCheckout(go: () => void): void {
    const dirty = this.dirtyBuffers();
    if (!dirty.length) return go();
    const names = dirty.map((b) => this.displayName(b)).join(", ");
    this.openList({
      title: `Unsaved: ${names}`,
      items: [
        { label: "Save them, then switch", data: "save" },
        {
          label: "Switch, keeping them unsaved",
          detail: "their text as typed; a file the switch changes, a conflict to settle on saving",
          data: "keep",
        },
        { label: "Cancel", data: "cancel" },
      ],
      accept: (item) => {
        if (item.data === "cancel") return;
        if (item.data === "save" && !dirty.every((b) => this.saveBuffer(b, true)))
          return this.message("warn", "not every note saved — nothing switched");
        go();
      },
    });
  }

  /** A checkout done — the switch handled as one event (5.9) — or git's refusal said. */
  private checkedOut(why: GitDone): void {
    if (why) return this.message("warn", `git: ${why}`);
    this.checkHead();
    void this.refreshGitNow().then(() => this.host.requestRender());
  }

  /** `space g w` (5.14): the repository's checkouts by branch; enter goes into one, at this note. */
  openWorktrees(): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not in a git repository");
    const list = worktreeList(c);
    if (!list?.length) return this.message("warn", "git couldn't list the worktrees");
    const here = relative(c.root, this.loc.root);
    const note = this.view?.buf.rel ?? null;
    this.openList({
      title: `Worktrees (${list.length}) — enter: this note there`,
      items: list.map((w) => ({
        label: `${w.path === c.root ? "● " : "  "}${this.glyphs.branch} ${w.branch ?? `(${w.head?.slice(0, 7) ?? "detached"})`}`,
        detail: `${w.path}${w.main ? "  (main)" : ""}`,
        data: w,
      })),
      accept: (item) => {
        const w = item.data as { path: string };
        if (w.path === c.root) return;
        const vault = join(w.path, here);
        if (!isVaultRoot(vault))
          return this.message(
            "warn",
            `${vault} isn't a root on that branch (none of ${rootMarkers().join(", ")} in it)`,
          );
        const there = note && existsSync(join(vault, note)) ? join(vault, note) : null;
        const v = this.view;
        this.switchVault(rootAt(vault), there, there && v ? { ...v.topAnchor } : undefined);
        if (note && !there) this.message("info", `${note} isn't on that branch: its root opened instead`);
      },
    });
  }

  /**
   * `space g m` (20.21): before a merge, the links it would break — git's tentative result, the working
   * tree untouched. A branch picked: this branch into the base, or another branch into this one.
   */
  openMergeReview(): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not in a git repository");
    const here = headOf(c).branch;
    if (!here) return this.message("info", "merge review: HEAD is detached — check out the branch to merge into");
    const base = baseBranch(c, this.config.git.base);
    const others = (branchesOf(c) ?? []).filter((b) => b !== here);
    const choices = [
      ...(base && base !== here ? [{ from: here, into: base }] : []),
      ...others.map((b) => ({ from: b, into: here })),
    ];
    if (!choices.length) return this.message("info", "merge review: no other branch to merge");
    this.openList({
      title: "Review a merge — enter: the links it would break",
      items: choices.map((m) => ({
        label: `${this.glyphs.branch} ${m.from} → ${m.into}`,
        detail: m.into === here ? "into this branch" : "this branch into the base",
        data: m,
      })),
      accept: (item) => this.showMergeReview(item.data as { from: string; into: string }),
    });
  }

  /** The links merging `from` into `into` would break, each with its cause; enter goes to one; esc: the branches. */
  showMergeReview(m: { from: string; into: string }): void {
    const c = this.checkout;
    if (!c) return;
    let r: MergeReview;
    try {
      r = reviewMerge(c, this.loc.root, m.from, m.into);
    } catch (err) {
      return this.message("warn", `merge review: ${(err as Error).message}`);
    }
    const conflicts = r.conflicts.length
      ? ` — git can't merge ${r.conflicts.length} file${r.conflicts.length === 1 ? "" : "s"}`
      : "";
    if (!r.breaks.length) return this.message("info", `merging ${r.from} into ${r.into} breaks no link${conflicts}`);
    this.openList({
      title: `Merging ${r.from} into ${r.into}: ${r.breaks.length} link${r.breaks.length === 1 ? "" : "s"} would break${conflicts} — esc: the branches`,
      items: r.breaks.map((b) => ({
        label: `${b.path}:${b.line}  ${sanitize(b.target)}`,
        role: b.fix ? "git_modified" : "diff_del",
        detail: sanitize(describeBreak(b)),
        data: b,
      })),
      accept: (item) => {
        const b = item.data as MergeBreak;
        if (!existsSync(join(this.loc.root, b.path)))
          return this.message("info", `${b.path} isn't here yet: it comes with ${r.from}`);
        this.openAt(b.path, b.line, b.column);
      },
      cancel: () => this.openMergeReview(),
    });
  }

  private headMoved(
    was: { branch: string | null; commit: string | null },
    now: { branch: string | null; commit: string | null },
    moves: [string, string][] = [],
  ): void {
    const name = (h: typeof now) =>
      h.branch ? `branch ${h.branch}` : `a detached HEAD (${h.commit?.slice(0, 7) ?? "?"})`;
    // HEAD moved on its branch — a merge, a pull, a commit — is no switch (20.21): git's renames since
    // (`moves`, taken as evidence) let a link broken by one say where its file went.
    if (was.branch && was.branch === now.branch) {
      const n = moves.length;
      if (n)
        this.message(
          "info",
          `${name(now)} moved on: git moved ${n} file${n === 1 ? "" : "s"} — links to ${n === 1 ? "it" : "them"} say where (space v p); space l r relinks a note's`,
        );
      return;
    }
    // The branch left keeps its tabs; the one switched to has its own back — when it has some, and
    // nothing open is unsaved (closing it would lose that).
    if (this.config.ui.restore_session) {
      this.saveState(was.branch);
      const theirs = now.branch ? loadSession(this.loc)?.branches?.[now.branch] : undefined;
      if (theirs?.tabs.length) {
        if (this.dirtyBuffers().length)
          return this.message(
            "info",
            `switched to ${name(now)} — unsaved notes stay open, so its tabs aren't brought back`,
          );
        this.overlay = null;
        this.tabs = [];
        this.openTabs(theirs.tabs, theirs.activeTab);
        if (!this.tabs.length) this.restoreSession();
        return this.message("info", `switched to ${name(now)}: its tabs are back`);
      }
    }
    this.message("info", `switched to ${name(now)}`);
  }

  /** The branch checked out (a detached HEAD: its commit, short), or null outside git. */
  branch(): string | null {
    const c = this.checkout;
    if (!c) return null;
    const h = headOf(c);
    return h.branch ?? (h.commit ? h.commit.slice(0, 7) : null);
  }

  /**
   * Where the file is, as the status line says it (21.9): the root's name if it has one, else its path,
   * else the folder opened; a repository's branch after it — `research · main`, `~/src/experiment ·
   * main`, `notes`, `~/scratch`; a named worktree, its name and branch in one, `research@refactor`.
   */
  vaultStatus(max = Number.POSITIVE_INFINITY): string {
    const b = this.loc.mode === "vault" ? this.branch() : null;
    const named = this.loc.mode === "vault" ? this.loc.name : null;
    const where = named ?? tildePath(this.loc.root);
    const after = named && this.loc.worktree ? (b ? `@${b}` : "") : b ? ` · ${b}` : "";
    // Short of room, a path is cut from the front: its last folders, and the branch, are kept.
    if (stringWidth(where + after) <= max) return where + after;
    return named ? truncate(where + after, max) : truncateStart(where, Math.max(4, max - stringWidth(after))) + after;
  }

  /** The root's search index; null: none here (`~` or `/` opened as a plain folder, `[search] engine = "scan"`, SQLite couldn't). */
  searchIndex: SearchIndex | null = null;
  /** Bringing the index up to the files, a slice at a time; null when it's done. */
  searchJob: IndexJob | null = null;
  private stopSearchFeed: (() => void) | null = null;
  /** The search list on screen, refreshed when the index is ready. */
  private searchList: ListOverlay | null = null;

  private stopEmbedFeed: (() => void) | null = null;
  private stopRetargetFeed: (() => void) | null = null;

  /** How a link under the cursor landed when a tie decided it ("the nearest of 2 named so"); else null. */
  linkLanded(view: View, link: LayoutLink): string | null {
    const from = link.from ?? view.buf.rel;
    if (from === null || link.kind === "tag" || link.kind === "footnote") return null;
    return describeLanding(this.graph.resolveLink({ kind: link.kind, target: link.target }, from));
  }

  /** A new graph (the vault opened, switched, walked again): the search index and embeds follow it. */
  private followGraph(): void {
    this.startSearch();
    // A note coming or going sent links by name elsewhere: said, never silent.
    this.stopRetargetFeed?.();
    this.stopRetargetFeed = this.graph.onRetarget((rs) => {
      const first = rs[0]!;
      this.message(
        "warn",
        `${rs.length === 1 ? `[[${first.target}]] in ${first.from}` : `${rs.length} links by name`} reach${rs.length === 1 ? "es" : ""} ${first.now} now, not ${first.was}`,
      );
    });
    // A note drawn inside another (1.11) changed: whatever shows it lays out again.
    this.stopEmbedFeed?.();
    const g = this.graph;
    this.stopEmbedFeed = g.onChange((c) => {
      const paths = c.kind === "moved" ? [c.from, c.to] : [c.path];
      const abs = new Set(paths.map((p) => g.abs(p)));
      let again = false;
      for (const b of this.buffers.values()) {
        if (![...b.embedded].some((p) => abs.has(p))) continue;
        b.invalidateLayouts();
        again = true;
      }
      if (again) {
        for (const v of this.allViews()) v.layoutKey = "";
        this.host.requestRender();
      }
    });
  }

  /** The index opened (or made) and caught up in the background; the graph's changes followed. */
  startSearch(): void {
    this.stopSearchFeed?.();
    this.stopSearchFeed = null;
    this.searchIndex?.close();
    this.searchIndex = null;
    this.searchJob = null;
    if (isListed(this.loc) || this.config.search.engine === "scan") return;
    const idx = SearchIndex.open(this.loc);
    if (!idx) return;
    const g = this.graph;
    this.searchIndex = idx;
    // Every change the graph hears of, at once: a file is quick to index again.
    this.stopSearchFeed = g.onChange((c) => {
      if (this.searchIndex !== idx || c.kind === "moved") return;
      try {
        indexFile(g, idx, c.path);
      } catch {}
    });
    let job: IndexJob;
    try {
      job = new IndexJob(g, idx);
    } catch {
      return;
    }
    if (job.done) {
      job.step();
      return;
    }
    this.searchJob = job;
    const tick = () => {
      if (this.searchJob !== job) return;
      let done = false;
      try {
        done = job.step(12);
      } catch {
        done = true;
      }
      if (!done) {
        const t = setTimeout(tick, 0);
        (t as { unref?: () => void }).unref?.();
        return;
      }
      this.searchJob = null;
      if (this.overlay && this.overlay === this.searchList) refilter(this.overlay);
      this.host.requestRender();
    };
    const t = setTimeout(tick, 0);
    (t as { unref?: () => void }).unref?.();
  }

  /** Once the index is built and caught up (tests). */
  async whenSearchIndexed(): Promise<void> {
    while (this.searchJob) await new Promise((r) => setTimeout(r, 5));
  }

  /**
   * Search the vault: the index once it's caught up, else a scan of the files. Unsaved notes count
   * as they are on screen: scanned, in place of what the index has of them.
   */
  searchVault(input: string, limit = 50): SearchResult {
    const idx = this.searchIndex && !this.searchJob ? this.searchIndex : null;
    const unsaved = new Map<string, string>();
    for (const b of this.dirtyBuffers())
      if (b.rel !== null && !b.virtual && (this.graph.notes.has(b.rel) || b.kind.group === "data"))
        unsaved.set(b.rel, b.source);
    if (!idx) return search(this.graph, null, input, { limit, texts: unsaved });
    const r = search(this.graph, idx, input, { limit });
    if (!unsaved.size) return r;
    const mine = new Map(
      search(this.graph, null, input, { limit, texts: unsaved, only: [...unsaved.keys()], relax: r.relaxed }).hits.map(
        (h) => [h.path, h],
      ),
    );
    const hits = r.hits.filter((h) => !unsaved.has(h.path) || mine.has(h.path)).map((h) => mine.get(h.path) ?? h);
    for (const h of mine.values()) if (!hits.includes(h)) hits.unshift(h);
    return { ...r, hits: hits.slice(0, limit) };
  }

  /** The search list (6.5): notes ranked by the words as they're typed; enter opens one at its match. */
  openSearch(seed = ""): void {
    let list: ListOverlay | null = null;
    // By root (20.16, 21.10): here; ctrl+a widens to the folders linked to or from it, then to every one.
    let scope: Scope = "here";
    const titled = (t: string) => {
      if (list) list.title = t;
      return t;
    };
    const where = () =>
      scope === "here" ? "" : scope === "linked" ? " — and the folders linked to it" : " — and every folder known";
    const HELP =
      'search here — words, "a phrase", prefix*, -not, title:word, #tag, path:folder/ — ctrl+a: more folders';
    const item = (h: SearchHit & { shown?: string }): ListItem => {
      const lead = h.heading ? `${h.heading} — ` : "";
      return {
        label: `${h.shown ?? h.path}:${h.line}`,
        detail: `${lead}${h.snippet}`,
        detailMarks: h.marks.map(([a, b]) => [a + lead.length, b + lead.length] as [number, number]),
        hint: h.more ? `+${h.more}` : undefined,
        data: h,
      };
    };
    const source = (input: string): ListItem[] => {
      if (!input.trim()) return titled(`${HELP}${where()}`), [];
      const job = this.searchJob;
      if (job && this.searchIndex)
        return (
          titled(
            `search — the folder is being indexed: ${job.indexed.toLocaleString("en")} of ${job.todo.length.toLocaleString("en")} files…`,
          ),
          []
        );
      const r = this.searchVault(input);
      const others = scope === "here" ? null : searchOthers(this.graph, input, scope);
      const n = r.hits.length + (others?.hits.length ?? 0);
      titled(
        `"${input.trim()}" — ${n} ${n === 1 ? "file" : "files"}${r.relaxed ? " with some of the words" : ""}${r.engine === "scan" ? " (scanned: no index here)" : ""}${where()}`,
      );
      const items = r.hits.map(item);
      if (others?.hits.length)
        items.push(
          { label: scope === "linked" ? "linked folders" : "other folders", header: true, data: null },
          ...others.hits.map(item),
        );
      return items;
    };
    this.openList({
      title: HELP,
      items: [],
      source,
      input: seed,
      accept: (item) => {
        const h = item.data as { path: string; line: number; column: number; abs?: string; vault?: string | null };
        // Another root's: into it, at the line (a switch, as a link into it is).
        if (h.vault !== undefined && h.vault !== null && h.abs)
          return void this.intoOtherVault(h.abs, { heading: null, headingIndex: 0, offset: 0, line: h.line });
        this.openAt(h.path, h.line, h.column);
      },
      widen: () => {
        scope = SCOPES[(SCOPES.indexOf(scope) + 1) % SCOPES.length]!;
      },
    });
    list = this.overlay as ListOverlay;
    this.searchList = list;
    if (seed) list.title = titled(list.title);
  }

  private stopLazy: (() => void) | null = null;

  /** Whether a file has a rendered view: markdown notes do, data files while they parse
   *  (16.11–16.14), text files never. */
  canRender(buf: NoteBuffer): boolean {
    if (buf.kind.group === "data") return !buf.parsed.error;
    return buf.kind.group === "note" || this.isCodeDocument(buf); // every note format has a reader (16.2)
  }

  /** Code that renders as a document (24.x): a language the view maps, unless `[render] code` says source. */
  isCodeDocument(buf: NoteBuffer): boolean {
    if (buf.kind.group !== "text" || this.config.render.code !== "document") return false;
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    return !!g && DOCUMENT_GRAMMARS.has(g);
  }

  /** Notes and files most recently shown, newest first (the switcher lists them first). */
  recentNotes: string[] = [];
  /** When each note was opened this session (the history's recent notes show it). */
  private readonly openedAt = new Map<string, number>();

  /** A note was shown in a window: it's the most recent now. */
  touchRecent(key: string): void {
    this.openedAt.set(key, this.now());
    this.recentNotes = [key, ...this.recentNotes.filter((k) => k !== key)].slice(0, RECENT_NOTES_MAX);
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    if (this.intoOtherVault(path, anchor)) return;
    const buf = this.buffer(path);
    if (!buf) return;
    this.touchRecent(buf.key);
    this.tabs.push({
      views: [this.makeView(buf, anchor)],
      active: 0,
      orientation: "side",
      ratio: this.config.ui.split_ratio,
    });
    this.activeTab = this.tabs.length - 1;
    this.region = "content";
    this.revealInSidebar();
  }

  /** Switch to a tab already showing this note, or open it in a new one. */
  openOrSwitchTab(path: string): void {
    if (this.intoOtherVault(path)) return;
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
      if (!this.closeFloating()) return;
      if (from) view = this.view;
    }
    if (!view) return this.openInNewTab(path, anchor);
    if (this.intoOtherVault(path, anchor)) return;
    const buf = this.buffer(path);
    if (!buf) return;
    // A pinned tab keeps its note: another one opens in a new tab.
    if (buf !== view.buf && this.tabs.find((t) => t.views.includes(view))?.pinned)
      return this.openInNewTab(path, anchor);
    this.touchRecent(buf.key);
    this.pushHistory(view);
    if (buf === view.buf && anchor) {
      this.jumpTo(view, anchor);
      return;
    }
    this.remember(view);
    const before = view.buf;
    if (view.insert) stopInsert(this, view);
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
    // A floating window (the properties, a hover, a file from git) isn't a place read.
    if (view.buf.virtual) return;
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
    if (!loc && dir === "back" && this.vaultBack()) return;
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
    if (view.insert && buf !== before) stopInsert(this, view);
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

  /** A data file that opens in source mode because it doesn't parse (16.14): the error said. */
  private saySourceWhy(buf: NoteBuffer): void {
    const error = buf.kind.group === "data" ? buf.parsed.error : null;
    if (error) this.message("warn", `${buf.name} doesn't parse — ${error}: source mode`);
  }

  /**
   * A window now showing another buffer: the old one's lens and rows go (its render, size, place and
   * inner scroll), so a lens left open opens again on the new note's cursor block.
   */
  resetForBuffer(view: View): void {
    Object.assign(view, {
      liveBase: undefined,
      lensSize: undefined,
      lensPin: undefined,
      lensInner: 0,
      lensStep: undefined,
      lensClick: undefined,
      topSub: 0,
      anchorVersion: undefined,
      layoutKey: "",
    });
  }

  /**
   * After a window changes file: one with no render goes to source mode; a window that was only in
   * source mode for such a file (from `before`) renders again for one that can; the old file's lens
   * state goes (resetForBuffer).
   */
  fitMode(view: View, before: NoteBuffer): void {
    if (view.buf !== before) this.resetForBuffer(view);
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
    // A big note parsing on other threads (15.1): a line saying so, and nothing of the view moved
    // (its reading position stays for the real layout, a moment later).
    if (!view.source && !view.live && view.buf.parseAhead())
      return this.readingLayout(view.buf, this.textWidth(paneWidth, gutter));
    // A data file that stopped parsing (16.14) goes to source mode, the error said — when insert
    // mode ends, never mid-typing (an open quote is normal while a value is typed).
    if (!view.source && !view.insert && !this.canRender(view.buf)) {
      const error = view.buf.kind.group === "data" ? view.buf.parsed.error : null;
      Object.assign(view, { source: true, live: false, liveBase: undefined, layoutKey: "" });
      if (error) this.message("warn", `${view.buf.name} doesn't parse — ${error}: source mode`);
    }
    // Source mode: the whole text column (no readable width), less one for a cursor after a full
    // row's end; unwrapped, as long as the longest line.
    const code = !view.source && !view.live && this.isCodeDocument(view.buf);
    const width = view.source
      ? Math.max(10, paneWidth - gutter - 2)
      : this.ui.wrap
        ? this.textWidth(paneWidth, gutter)
        : code
          ? layoutWidth(paneWidth - gutter, this.config.render.inset, NOWRAP_PROBE)
          : this.nowrapWidth(view, paneWidth, gutter);
    if (view.source || this.isCodeDocument(view.buf)) this.ensureSyntax(view.buf);
    this.ensureLint(view.buf);
    this.ensureLinters(view.buf);
    this.ensureServers(view.buf);
    const layout = view.source
      ? view.buf.sourceLayout(width, this.ui.wrap, this.glyphs)
      : view.live
        ? this.liveLayout(view, width)
        : code
          ? view.buf.codeLayout(width, this.ui.wrap, this.glyphs, this.ui.code_cells, this.cellProblems(view))
          : view.buf.layout(
              width,
              this.glyphs,
              this.ui.urls,
              view.buf.rel ? this.graph : null,
              this.picturesFor(view.buf),
            );
    const block = view.live && view.liveBase ? `${view.liveBase.active[0]}-${view.liveBase.active[1]}` : "";
    const key = `${view.source ? "s" : view.live ? "l" : "r"}${block}:${width}:${this.glyphs.mode}:${this.ui.urls}:${layout.lines.length}:${view.buf.version}:${view.height}`;
    if (view.layoutKey !== key) {
      view.layoutKey = key;
      view.cur = this.cursorFromAnchor(layout, view.curAnchor, view.insert);
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
      if (view.find)
        view.find = computeFind(layout, view.find.query, view.find.current, view.find.whole, view.find.regex);
      // (While typing, its end may be past a row's last character, as the cursor may.)
      if (view.sel)
        view.sel.anchor = view.sel.src
          ? this.cursorFromAnchor(layout, view.sel.src, view.insert)
          : clampPos(layout, view.sel.anchor);
    }
    if (view.live && view.liveBase) this.pinLens(view, layout);
    return layout;
  }

  /** What a big note shows while its parse runs on other threads (15.1); keys wait for it. */
  private readingLayout(buf: NoteBuffer, width: number): Layout {
    const parse = buf.parsing!;
    if (!this.parses.has(parse)) {
      this.parses.add(parse);
      void parse.finally(() => {
        this.parses.delete(parse);
        for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
        this.host.requestRender();
      });
    }
    const text = truncate(
      `reading ${this.displayName(buf)} — ${buf.lineStarts().length.toLocaleString("en")} lines…`,
      width,
    );
    return {
      lines: [{ spans: [{ text, role: "dim", attrs: 0 }], src: 1 }],
      links: [],
      headings: [],
      width,
      clipped: 0,
    };
  }

  /** Big notes' parses running on other threads: a key waits for them, a click is dropped. */
  private readonly parses = new Set<Promise<void>>();

  /** Once every big note's parse has landed (tests, the benchmark). */
  async whenParsed(): Promise<void> {
    while (this.parses.size) await Promise.all(this.parses);
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
      view.lensPin = { range, screen: this.visibleBetween(hidden, view.top, top) };
      return;
    }
    const click = view.lensClick;
    view.lensClick = undefined;
    if (pin.range !== range) {
      pin.range = range;
      // A click: the clicked line stays under the pointer. The keyboard: the lens stays put.
      view.top = this.clampTop(
        view,
        layout,
        click !== undefined
          ? this.stepVisible(layout, hidden, view.cur.row, -click)
          : this.stepVisible(layout, hidden, top, -pin.screen),
      );
      this.anchorTop(view, layout);
      this.ensureCursorVisible(view, layout);
    }
    pin.screen = this.visibleBetween(hidden, view.top, top);
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
    // Rows a run of lines takes in the lens (wrapped at the width its counters leave).
    const textWidth = width - (this.config.ui.relative_numbers === "lens" ? LENS_COUNTERS : 0);
    const rowsOf = (s: number, e: number) => {
      let n = 0;
      for (let k = s; k <= e; k++)
        n += wrap ? Math.max(1, Math.ceil(stringWidth(texts[k - 1] ?? "") / Math.max(1, textWidth))) : 1;
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
    const maxRows =
      view.lensSize !== undefined || rows
        ? minRows
        : Math.max(minRows, Math.floor(Math.max(1, view.height) * this.config.editor.lens_max));
    // The lens on the cursor's block, grown by its neighbours (below, then above) to the minimum — or its unit whole (a
    // code cell, a note's section), alone.
    const openOn = (blocks: Block[], at: number, unit?: (line: number) => Block | null): Block => {
      const whole = unit?.(at);
      if (whole) return whole;
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
    // The cursor past an edge: the blocks up to its one come in; far ones go past the maximum. Into a unit whole (a code
    // cell, a note's section): the lens moves to it.
    const follow = (blocks: Block[], range: Block, at: number, unit?: (line: number) => Block | null): Block => {
      if (at >= range[0] && at <= range[1]) return range;
      if (cards) return openOn(blocks, at);
      const whole = unit?.(at);
      if (whole) return whole;
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
    // Code (24.8): the document view around a lens of its own blocks — a cell whole when it fits (24.16), else a line,
    // a doc comment, the imports. A note: its innermost section whole when it fits, else its blocks. A size set by hand
    // is the lens's, whatever the unit.
    const code = this.isCodeDocument(buf);
    const fits = (s: number, e: number) => rowsOf(s, e) <= maxRows;
    const fresh = (prev?: Block): LiveBase => {
      const rendered = code
        ? buf.codeLayout(width, wrap, this.glyphs, this.ui.code_cells, this.cellProblems(view))
        : buf.layout(width, this.glyphs, this.ui.urls, buf.rel ? this.graph : null, this.picturesFor(buf));
      let blocks = code ? buf.codeBlocks(lineCount) : blockRanges(buf.parsed.tree, lineCount);
      let unit: ((at: number) => Block | null) | undefined;
      if (code) {
        const cells = cellBlocks(blocks, rendered.cells ?? [], fits);
        blocks = cells.blocks;
        unit = (at) => blocks.find((b) => at >= b[0] && at <= b[1] && cells.whole.has(b[0])) ?? null;
      } else if (buf.kind.group === "note") {
        const sections = sectionRanges(buf.parsed.tree, lineCount);
        unit = (at) => {
          const s = sections.filter((x) => x[0] <= at).at(-1);
          return s && at <= s[1] && fits(s[0], s[1]) ? s : null;
        };
      }
      if (view.lensSize !== undefined) unit = undefined;
      // After an edit, the lens keeps covering the lines it did (snapped to whole blocks).
      let range: Block;
      if (prev) {
        const s = blockAt(blocks, Math.min(prev[0], lineCount));
        const e = blockAt(blocks, Math.min(Math.max(prev[0], prev[1]), lineCount));
        range = follow(blocks, [s[0], e[1]], Math.min(line, lineCount), unit);
      } else range = openOn(blocks, Math.min(line, lineCount), unit);
      return {
        rendered,
        width,
        wrap,
        renderedVersion: buf.version,
        version: buf.version,
        blocks,
        unit,
        old: range,
        active: range,
        ...around(range),
        lineCount,
      };
    };
    let base = view.liveBase;
    // A cell's ✎ (24.13): the lens on its lines.
    const asked = view.lensRange;
    view.lensRange = undefined;
    if (!base || base.width !== width || base.wrap !== wrap || asked) base = fresh(asked);
    else if (buf.version !== base.version) {
      // Typed into the lens, the rest untouched: the same render, the lens longer or shorter.
      // …and the line break that ends the lens survived (a delete at its last line's end joins the
      // line below into it: that's an edit across the edge, not inside).
      const edgeKept = !base.after || buf.source[buf.source.length - base.after.length - 1] === "\n";
      const untouched =
        buf.source.startsWith(base.before) &&
        buf.source.endsWith(base.after) &&
        buf.source.length >= base.before.length + base.after.length &&
        edgeKept;
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
        // A size set by hand (+, -) slides at that size: no unit to jump to.
        const range = follow(base.blocks, base.active, line, view.lensSize === undefined ? base.unit : undefined);
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
          else this.message("info", `the lens holds the whole ${buf.kind.group === "note" ? "note" : "file"}`);
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
    const spans = code ? buf.syntax?.spans : undefined;
    const layout = composeLive(base.rendered, base.old, base.active, texts, {
      width,
      wrap,
      rule: this.glyphs.lensRule,
      editing,
      ...(this.config.ui.relative_numbers === "lens" ? { counters: LENS_COUNTERS } : {}),
      ...(code ? { language: buf.kind.format, ...(spans ? { spans: (l: number) => spans.get(l) } : {}) } : {}),
    });
    base.composed = { key, layout };
    return layout;
  }

  currentLayout(view: View): Layout {
    return this.layoutFor(view, view.width, this.gutterWidth(view));
  }

  /** The gutter's width for a view: the problems bar's or the line numbers', then a column of the page's between it
   *  and the text (0 when both are off). */
  gutterWidth(view: View): number {
    const w = this.barWidth(view) + (this.ui.line_numbers ? String(view.buf.lineStarts().length).length + 1 : 0);
    // Its last column has the git signs (26.1); with nothing else in it, it's theirs alone, once the file has had any.
    if (!w && this.gitChangesOf(view)?.length) view.buf.gitColumn = true;
    return w ? w + 1 : view.buf.gitColumn ? 1 : 0;
  }

  /** The problems the code view's cells count in their headers (24.13): each by its line and severity. */
  cellProblems(view: View): { line: number; severity: Problem["severity"] }[] {
    return this.problemsShown(view).map((p) => ({ line: p.start.line, severity: p.severity }));
  }

  /** The code view's cell (24.13) holding line `line` — the innermost (a method's, not its class's) — or starting there. */
  cellAt(view: View, line: number): NonNullable<Layout["cells"]>[number] | null {
    const cells = this.currentLayout(view).cells ?? [];
    return (
      cells.filter((c) => line >= c.from && line <= c.to).sort((a, b) => a.to - a.from - (b.to - b.from))[0] ?? null
    );
  }

  /**
   * A cell's action (24.13), from its header's button or the key on the cursor's cell: fold it to its header, edit it (the
   * lens on its lines), copy its code, where its definition is used, its problems, or add it to the scratch.
   */
  cellAction(action: string, from?: number): void {
    const v = this.view;
    if (!v || !this.isCodeDocument(v.buf) || v.source)
      return this.message("info", "a cell is the code view's: a file of a language it maps, as a document");
    const line = from ?? srcAt(this.currentLayout(v).lines[v.cur.row] ?? { src: 1, spans: [] }, v.cur.col);
    const cell =
      from !== undefined
        ? ((this.currentLayout(v).cells ?? []).find((c) => c.from === from) ?? null)
        : this.cellAt(v, line);
    if (!cell) return this.message("info", "no cell here: the cursor's on prose, or between cells");
    const text = v.buf
      .lines()
      .slice(cell.from - 1, cell.to)
      .join("\n");
    const lines = cell.from === cell.to ? `line ${cell.from}` : `lines ${cell.from}–${cell.to}`;
    switch (action) {
      case "fold":
        if (!v.buf.codeFolded.delete(cell.from)) v.buf.codeFolded.add(cell.from);
        for (const x of this.allViews()) if (x.buf === v.buf) x.layoutKey = "";
        return;
      case "edit":
        this.placeAtLine(v, cell.from);
        v.lensRange = [cell.from, cell.to];
        if (!v.live) this.setViewMode(v, "live");
        else v.liveBase = undefined;
        this.region = "content";
        return;
      case "copy":
        this.copy(text, false);
        return this.message("info", `copied ${cell.title} — ${lines}`);
      case "references":
        if (!cell.name) return this.message("info", `${cell.title}: no definition to look for`);
        placeAt(this, v, (v.buf.lineStarts()[cell.name.line - 1] ?? 0) + cell.name.column);
        void this.run("lsp.references");
        return;
      case "problems": {
        this.openProblems("file");
        const list = this.fileRows();
        const i = list.findIndex((p) => p.start.line >= cell.from && p.start.line <= cell.to);
        if (i >= 0) {
          this.problemsPanel.file.selected = i;
          this.showFileProblem(list[i]);
        }
        return;
      }
      case "scratch":
        this.capture(
          formatEntry(
            { ref: { path: v.buf.abs, startLine: cell.from, endLine: cell.to }, snippetText: text, lang: "" },
            this.loc.root,
          ),
        );
        return this.message("info", `${cell.title} — ${lines} added to the scratch`);
    }
  }

  /** The problems bar's width (19.9): a sign, a count when more than one, a space — while it's on; with `auto`,
   *  once the file has had problems, and from then on, so the text doesn't move as they come and go. None beside line
   *  numbers: a line's number takes its worst problem's colour, and is clicked as a sign is. */
  barWidth(view: View): number {
    if (!this.ui.problems_bar || this.ui.line_numbers) return 0;
    if (this.config.diagnostics.bar === "on" || view.buf.problemBar) return 3;
    if (this.problemsShown(view, true).length) view.buf.problemBar = true;
    return view.buf.problemBar ? 3 : 0;
  }

  /** A note's own problems — its links, its conflicts — kept until the vault or the note changes. */
  private readonly noteProblemCache = new WeakMap<NoteBuffer, { key: string; list: Problem[] }>();

  /**
   * A file's problems as they are now (19.8), from every source, at least `[diagnostics] severity`:
   * its syntax errors (16.9; in source mode and the code view, out of insert, for the text as it is), the linter's
   * findings (3.21; for the text they were found in), and a vault note's links and conflict markers
   * (while it's as saved: the graph has the file's). `any`: whether there are some at all — the syntax
   * errors of the last parse too, insert or not.
   */
  problemsShown(view: View, any = false): Problem[] {
    const buf = view.buf;
    const out: Problem[] = [];
    const syn = buf.syntax;
    // A language server, once it's said what it finds, has the file's syntax errors: tree-sitter's are then left out.
    // Shown in source mode and the code view alike (DF-D10).
    const shows = view.source || this.isCodeDocument(buf);
    if (
      syn?.errors.length &&
      !buf.serverProblems.size &&
      (any || (shows && !view.insert && syn.version === buf.version))
    )
      out.push(...syntaxProblems(syn.errors));
    if (buf.lint?.issues.length && (any || buf.lint.version === buf.version))
      out.push(...lintProblems(buf.lint.issues));
    // Its language servers' (19.1), for the text they were found in: typing hides them until they answer again.
    for (const p of buf.serverProblems.values()) if (any || p.version === buf.version) out.push(...p.list);
    // Its linters' (19.19), likewise: one reading the file, until it's saved and run again.
    for (const p of buf.linterProblems.values()) if (any || p.version === buf.version) out.push(...p.list);
    if (buf.rel && this.graph.notes.has(buf.rel) && (any || !buf.dirty)) {
      const key = `${this.graph.generation}:${buf.version}`;
      let hit = this.noteProblemCache.get(buf);
      if (hit?.key !== key) {
        hit = { key, list: noteProblems(this.graph, buf.rel) };
        this.noteProblemCache.set(buf, hit);
      }
      out.push(...hit.list);
    }
    const min = this.config.diagnostics.severity;
    return out.filter((p) => atLeast(p.severity, min));
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

  private cursorFromAnchor(layout: Layout, c: CursorAnchor, insert = false): Pos {
    const first = rowFor(layout, c.anchor);
    const src = layout.lines[first]?.src;
    let row = first;
    for (let k = 0; k < c.sub && layout.lines[row + 1]?.src === src; k++) row++;
    const pos = clampPos(layout, { row, col: c.col });
    // Typing at a line's end, the cursor is past its last character: a relayout then (the
    // problems bar appearing, a resize) keeps it there, or the next key goes in before that one.
    const cs = insert ? cells(layout.lines[pos.row]) : [];
    const last = cs[cs.length - 1];
    if (last && c.col >= last.x + last.w) pos.col = last.x + last.w;
    return pos;
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
      const why =
        view.buf.kind.group === "data"
          ? `doesn't parse — ${view.buf.parsed.error}`
          : view.buf.kind.group === "text"
            ? "has no rendered view"
            : "has no rendered view yet";
      return this.message(view.buf.kind.group === "data" ? "warn" : "info", `${view.buf.name} ${why}: source mode`);
    }
    if (view.insert) stopInsert(this, view);
    this.remember(view);
    // On a row of the file's text, the cursor keeps its character, not its column (a code cell's rows are framed).
    const keep = this.currentLayout(view).lines[view.cur.row]?.srcMap ? offsetOf(this, view) : null;
    view.source = mode === "source";
    view.live = mode === "live";
    view.liveBase = undefined;
    view.lensSize = undefined; // a lens opened again sizes itself
    view.lensPin = undefined;
    view.lensInner = 0;
    view.layoutKey = ""; // re-derive the rows from the anchors: the same source line
    view.sel = null;
    view.visual = null;
    if (keep !== null) placeAt(this, view, keep);
  }

  /** The mode the editing keys switch a rendered window to (`[editor] edit_in`), code's document view too (24.8). */
  editMode(_view?: View | null): "source" | "live" {
    return this.config.editor.edit_in === "live" ? "live" : "source";
  }

  /** The code view's run of imports on the cursor's row (24.5), folded or unfolded; false when the row isn't one. */
  toggleCodeFold(view: View): boolean {
    const at = this.currentLayout(view).lines[view.cur.row]?.fold;
    if (at === undefined) return false;
    if (!view.buf.codeOpen.delete(at)) view.buf.codeOpen.add(at);
    for (const v of this.allViews()) if (v.buf === view.buf) v.layoutKey = "";
    return true;
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
    return Math.max(
      this.config.editor.lens_min_rows,
      Math.floor(Math.max(1, view.height) * this.config.editor.lens_max),
    );
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
    for (let r = view.top; r < layout.lines.length && out.length < view.height; r++)
      if (!isHidden(hidden, r)) out.push(r);
    return out;
  }

  /** How many shown rows lie between `a` and `b` (negative when `b` is before `a`). */
  private visibleBetween(hidden: [number, number][], a: number, b: number): number {
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
      const d = this.visibleBetween(hidden, view.top, view.cur.row);
      if (d < so) view.top = this.stepVisible(layout, hidden, view.cur.row, -so);
      else if (d > view.height - 1 - so)
        view.top = this.stepVisible(layout, hidden, view.cur.row, -(view.height - 1 - so));
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

  /** The selection's first and last lines as the buffer's `'<` `'>` marks, which move with the text. */
  markSelection(view: View, layout: Layout = this.currentLayout(view)): void {
    if (!view.sel) return;
    const x = layout.lines[view.sel.anchor.row]?.src ?? 1;
    const y = layout.lines[view.cur.row]?.src ?? 1;
    const starts = view.buf.lineStarts();
    view.buf.visualMarks = [starts[Math.min(x, y) - 1] ?? 0, starts[Math.max(x, y) - 1] ?? 0];
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
    if (view.sel) this.markSelection(view, layout);
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
    // zt and zb keep ui.scrolloff rows to the edge, as the view always does (and H and L land there).
    const so = Math.max(0, Math.min(this.config.ui.scrolloff, Math.floor((view.height - 1) / 2)));
    const up = where === "top" ? so : where === "center" ? Math.floor((view.height - 1) / 2) : view.height - 1 - so;
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
    const i =
      where === "top"
        ? view.top === 0
          ? 0
          : so
        : where === "bottom"
          ? lastShown
            ? rows.length - 1
            : rows.length - 1 - so
          : Math.floor((rows.length - 1) / 2);
    const row = rows[Math.max(0, Math.min(i, rows.length - 1))]!;
    return { row, col: 0 };
  }

  /** `:q`: this window, or its tab; the very last one quits. */
  closeOrQuit(): void {
    if (this.floating) return void this.closeFloating();
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
      // Drawn on one row: a setext heading's line break, or the two spaces a footnote mark leaves, fold.
      chain.push({ text: h.text.replace(/\s+/g, " "), line: h.line, level: h.level });
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
      items: chain.map((c, k) => ({
        label: c.text,
        indent: k,
        hint: k === chain.length - 1 ? "here" : undefined,
        data: c.line,
      })),
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

  /** Toggle a task's checkbox (plan 4.11): `ctrl+l` (`space n t`), or a click on it. */
  toggleTaskAt(view: View, task = this.taskAt(view)): void {
    if (!task) return this.message("info", "no task here — ctrl+l toggles a list item's [ ]");
    const buf = view.buf;
    if (buf.deleted) return this.message("warn", `${buf.key} was deleted on disk — nothing to toggle`);
    if (buf.dirty) {
      // Unsaved changes: toggle in the buffer (an undo step), not on disk under them.
      const r = toggleTask(new TextEncoder().encode(buf.source), task.line);
      if (!r) return this.message("warn", `line ${task.line} has no task marker`);
      const at =
        buf.lineStarts()[task.line - 1]! +
        /\[([ xX])\]/.exec(buf.source.slice(buf.lineStarts()[task.line - 1]!))!.index +
        1;
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
      this.message(
        "error",
        err instanceof WriteRefused ? err.message : `can't write ${buf.key}: ${(err as Error).message}`,
      );
      return false;
    }
    // Stamped as written: an agent's write landing right after is a change, not ours.
    if (buf.rel !== null) this.watcher?.noteOwnWrite(buf.rel, written);
    this.refreshGit();
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
      this.servers?.save(buf.abs, buf.source);
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

  /**
   * The file a hand-off gives the editor, and the line: the view's, at the cursor; from the floating
   * properties editor, its note at the top (the editor closed first, its text written back); none
   * (said) from another floating window, which isn't a file.
   */
  private handOffTarget(view: View): { buf: NoteBuffer; line: number } | null {
    if (!view.buf.virtual) return { buf: view.buf, line: this.cursorLine(view) };
    const f = this.floating;
    if (f?.kind === "properties" && view === f.view) return this.closeFloating() ? { buf: f.note, line: 1 } : null;
    this.message("info", "nothing to hand off: this window isn't a file");
    return null;
  }

  /** Step aside for the editor (4.1): it runs in this terminal; the note reloads after it. */
  editInEditor(view: View): void {
    if (!this.host.runForeground) return this.message("error", "can't hand off to an editor here");
    const target = this.handOffTarget(view);
    if (!target) return;
    const buf = target.buf;
    // The editor reads the file: unsaved changes go there first (4.10).
    if (buf.dirty && !this.saveBuffer(buf))
      return this.message("warn", `${this.displayName(buf)} isn't saved — not handing it off`);
    const argv = editorArgv(this.config.editor.command, buf.abs, target.line);
    const r = this.host.runForeground(argv);
    if (typeof r === "string") return this.message("error", `couldn't start ${argv[0]}: ${r}`);
    if (buf.changedOnDisk()) this.reloadBuffer(buf);
    if (r !== 0) this.message("warn", `${argv[0]} exited with ${r}`);
  }

  /** How the running nvims are found and asked; tests replace these. */
  nvimDiscovery: () => NvimServer[] = () => discoverNvims();
  /** Home, for an export's places and `~/` (a test's own, never yours). */
  home = homedir();
  nvimProbe: (socket: string) => NvimServer | null = (s) => probeNvim(s);
  /** The nvim `space n s` sends to, picked once per vault and kept while it answers. */
  remoteServer: string | undefined;

  /**
   * `space n s`: the note, at the cursor's line, to an editor running elsewhere. With the nvim
   * preset (the default) or a `{server}` template, the nvim is the one picked before while it
   * answers; else the only one running; else a picker — which `choose` (`space n p`) always opens.
   */
  sendToEditor(from: View, choose = false): void {
    const target = this.handOffTarget(from);
    if (!target) return;
    const view = target;
    if (view.buf.dirty && !this.saveBuffer(view.buf))
      return this.message("warn", `${this.displayName(view.buf)} isn't saved — not sending it`);
    const raw = this.config.editor.remote.filter((t) => t.trim());
    if (!raw.length) return this.message("info", "set [editor] remote in the config to send notes to a running editor");
    const templates = raw.length === 1 && raw[0]!.trim() === "nvim" ? NVIM_REMOTE : raw;
    if (!templates.some((t) => t.includes("{server}"))) return this.sendWith(view, templates, "");
    if (!choose && this.remoteServer) {
      const known = this.nvimProbe(this.remoteServer);
      if (known) return this.sendWith(view, templates, known);
    }
    const found = this.nvimDiscovery();
    if (!found.length)
      return this.message("info", "no nvim is running with a server — start nvim (0.9 or later) and try again");
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
    const shown = (s: NvimServer) =>
      s.file ? (s.cwd && s.file.startsWith(`${s.cwd}/`) ? s.file.slice(s.cwd.length + 1) : tilde(s.file)) : "no file";
    this.openList({
      title: "Send to which nvim?",
      items: ordered.map((s) => ({
        label: tilde(s.cwd || s.socket),
        detail: shown(s),
        hint: s.socket === this.remoteServer ? "last used" : holds(s) ? "holds this note" : undefined,
        data: s,
      })),
      accept: (item) => pick(item.data as NvimServer),
    });
  }

  private sendWith(view: { buf: NoteBuffer; line: number }, templates: string[], server: NvimServer | ""): void {
    const run = this.host.runDetached;
    if (!run) return this.message("error", "can't start an editor from here");
    const line = view.line;
    // Each command a template of its own; no {file} means none is appended (nvim's --remote-send).
    const socket = server ? server.socket : "";
    const cmds = templates.map((t) => editorArgv(t, view.buf.abs, line, process.env, false, socket));
    const cwd = server ? server.cwd : "";
    const where = cwd ? ` (${cwd.split("/").pop()})` : "";
    this.message("info", `sent to ${cmds[0]![0]}${where} at line ${line}`);
    void (async () => {
      for (const argv of cmds) {
        const r = await run(argv);
        if (r === 0) continue;
        this.message(
          "error",
          typeof r === "string" ? `couldn't start ${argv[0]}: ${r}` : `${argv.slice(0, 2).join(" ")} exited with ${r}`,
        );
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
    // Made while typing: the text between its ends, the character after the cursor not taken (DF-D15).
    const typed = typedSelection(this, view);
    if (typed) return view.buf.source.slice(typed[0], typed[1]);
    if (this.isCodeDocument(view.buf) && !view.source && !view.live) return this.codeSelectionText(view);
    return selectedText(this.currentLayout(view), view.sel, view.cur);
  }

  /**
   * A selection in the code view (24.x): the file's text between its ends — never the rows as drawn, whose guides,
   * breaks and folds are the view's. A line selection, its lines whole; a doc comment's row, its line whole.
   */
  private codeSelectionText(view: View): string {
    const layout = this.currentLayout(view);
    const [a, b] = ordered(view.sel!.anchor, view.cur);
    const src = view.buf.source;
    const starts = view.buf.lineStarts();
    const lineEnd = (ln: number) => {
      const e = src.indexOf("\n", starts[ln - 1] ?? src.length);
      return e < 0 ? src.length : e;
    };
    const rowLine = (row: number) => layout.lines[row]?.src ?? 1;
    const offset = (p: Pos, after: boolean): number => {
      const line = layout.lines[p.row];
      if (!line) return src.length;
      const base = starts[line.src - 1] ?? 0;
      if (!line.srcMap || view.sel!.line) return after ? lineEnd(line.src) : base;
      const c = cells(line).find((x) => p.col >= x.x && p.col < x.x + x.w);
      if (c?.at === undefined) return after ? base + line.srcMap.end : base + (line.srcMap.cells[0] ?? 0);
      return base + c.at + (after ? (graphemes(src.slice(base + c.at, base + c.at + 16))[0]?.length ?? 1) : 0);
    };
    let from = offset(a, false);
    let to = offset(b, true);
    if (view.sel!.line) {
      from = starts[rowLine(a.row) - 1] ?? 0;
      to = lineEnd(rowLine(b.row));
    }
    return src.slice(from, Math.max(from, to));
  }

  // -------------------------------------------------------------------------------------------
  // Tabs and the split (3.3)

  splitWith(orientation: Tab["orientation"]): void {
    // The floating window closes first: the split is of the window under it, never of the floating
    // one (its buffer isn't a file, and a tab keeping it would lose what's typed there).
    if (this.floating && !this.closeFloating()) return;
    const t = this.tab;
    const view = this.tabView;
    if (!t || !view || view.buf.virtual) return;
    t.orientation = orientation;
    if (t.views.length === 1) {
      t.views.push(this.makeView(view.buf, { ...view.topAnchor }, { ...view.curAnchor }));
      t.active = 1;
    }
  }

  /** Focus the split's other window, splitting first when there's one: where "in the split" opens. */
  otherWindow(): void {
    if (this.floating && !this.closeFloating()) return;
    const t = this.tab;
    if (!t) return;
    if (t.views.length === 1) this.splitWith(t.orientation ?? "side");
    else t.active = 1 - t.active;
  }

  closeWindow(): void {
    if (this.floating) return void this.closeFloating();
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
   * one. Vault-relative, "" for the root; null for another root's row, which isn't this root's.
   */
  newItemBase(): string | null {
    if (this.region === "sidebar" && this.leftView === "explorer") {
      const row = this.explorerRows()[this.sidebar.selected];
      // Another root's row (20.15), or one under it, or above the root: none of this root's folders (null, refused).
      if (row?.under || row?.root?.other || row?.outside) return null;
      if (row?.root?.here) return "";
      if (row) return row.kind === "dir" ? row.path : posix.dirname(row.path) === "." ? "" : posix.dirname(row.path);
    }
    const rel = this.view?.buf.rel;
    return rel && posix.dirname(rel) !== "." ? posix.dirname(rel) : "";
  }

  /** A new note, folder or paste with another root's row selected: refused, its files aren't this root's. */
  private refuseOtherRoot(): void {
    this.message("warn", "another root's folder: select a folder of this root");
  }

  /** A path typed for a new note or folder, from `base` (or the root, with a leading `/`); null
   *  (and said) when it leaves the vault or names nothing. */
  private newPath(input: string, base: string): string | null {
    const typed = input.trim();
    if (!typed) return null;
    const rel = posix.normalize(typed.startsWith("/") ? typed.slice(1) : posix.join(base, typed)).replace(/\/+$/, "");
    if (!rel || rel === "." || rel.startsWith("../") || rel === ".." || posix.isAbsolute(rel)) {
      this.message("warn", `${typed}: not inside the root`);
      return null;
    }
    // Through a symlinked folder or not, never outside the vault.
    const target = realTarget(join(this.loc.root, rel));
    let root = this.loc.root;
    try {
      root = realpathSync(root);
    } catch {}
    if (climbsOut(relative(root, target))) {
      this.message("warn", `${typed} resolves outside the root — not creating it`);
      return null;
    }
    return rel;
  }

  /** The folders a new path makes, known to the walk and the watcher (and the explorer shows); not
   *  one the walk leaves out (`walk.exclude`) or a root nested in this one, nor anything under it. */
  private addFolders(rel: string): void {
    const parts = rel.split("/");
    let added = false;
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!this.graph.admits(dir, true)) break;
      if (!this.graph.dirs.includes(dir)) {
        this.graph.dirs.push(dir);
        added = true;
      }
    }
    if (added)
      this.watcher?.sync(isListed(this.loc) ? [""] : this.graph.dirs, this.knownFromGraph(), this.sizesFromGraph());
  }

  /**
   * Create a note (ctrl+n, `:new`): `input` from `base`, `.md` added unless it names a known
   * extension (`.toml`, `.py`…); missing folders made. A note starts with its title as a heading
   * (`# Name`). An existing file is just opened. Its vault path, whether it was made, and the path
   * to open it by, or null. One the walk leaves out (`walk.exclude`) or in a root nested in this one
   * isn't this root's note: it's made, but not indexed here, and opened by its absolute path (into
   * the nested root).
   */
  createNote(input: string, base: string | null): { rel: string; created: boolean; open: string } | null {
    if (base === null) return this.refuseOtherRoot(), null;
    let rel = this.newPath(input, base);
    if (!rel) return null;
    const ext = extensionOf(rel);
    if (!ext || !isKnownExtension(ext)) rel = `${rel}.md`;
    const abs = join(this.loc.root, rel);
    const ours = this.graph.admits(rel);
    const open = ours ? rel : abs;
    if (existsSync(abs)) {
      if (statSync(abs).isDirectory()) {
        this.message("warn", `${rel} is a folder`);
        return null;
      }
      this.message("info", `${rel} exists — opened`);
      return { rel, created: false, open };
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
    this.watcher?.noteOwnWrite(rel, stamp);
    if (ours) {
      const dir = posix.dirname(rel);
      if (dir !== ".") this.addFolders(dir);
      if (kind.group === "note") this.graph.updateFile(rel, { rel, abs, size: stamp.size, mtimeMs: stamp.mtimeMs });
      else this.graph.addAsset(rel);
      this.invalidateTree();
      this.relayoutAll(); // links to it resolve now
    }
    this.message("info", `created ${rel}`);
    return { rel, created: true, open };
  }

  /**
   * Ask for a new note's name and make it: opened, and typed into below its title. `prefill`: the
   * name already typed (a link to a note that doesn't exist yet).
   */
  promptNewNote(base = this.newItemBase(), prefill = "", allowed = ""): void {
    if (base === null) return this.refuseOtherRoot();
    const make = (text: string) => {
      // A name another note already has makes [[name]] ambiguous (17.5): a distinct one is
      // suggested, from the folder; typed again, the name is made anyway (a suggestion, not a rule).
      const clash = text.trim() !== allowed ? this.nameClash(text, base) : null;
      if (clash) {
        this.message(
          "info",
          `a note named ${clash.name} is at ${clash.at}: [[${clash.name}]] would reach either — suggested ${clash.suggested} (type ${clash.name} again to keep it)`,
        );
        return this.promptNewNote(base, clash.suggested, text.trim());
      }
      const r = this.createNote(text, base);
      if (!r) return;
      this.region = "content";
      const abs = join(this.loc.root, r.rel); // before the open, which may switch roots
      this.open(r.open);
      const v = this.view;
      // Typing on the line after the title's blank one (as `o` there would): a source view has no
      // row past the file's last line break, so the insert begins with one.
      if (r.created && v?.buf.abs === abs) {
        startInsert(this, v, (w) => w.buf.source.length);
        insertText(this, v, v.buf.eol);
      }
    };
    this.prompt(`new note in ${base ? `${base}/` : "the root"}`, make);
    if (prefill && this.overlay?.kind === "prompt") this.overlay.text = prefill;
  }

  /**
   * A new note's name another note of the vault already has (17.5): where that one is, and a
   * distinct name from the new one's folder (`ideas-plan`, `ideas-plan-2`…).
   */
  nameClash(input: string, base: string): { name: string; at: string; suggested: string } | null {
    const rel = this.newPath(input, base);
    if (!rel) return null;
    const ext = extensionOf(rel);
    const full = !ext || !isKnownExtension(ext) ? `${rel}.md` : rel;
    if (classify(full, this.config.walk.extensions).group !== "note" || this.graph.notes.has(full)) return null;
    const name = posix.basename(full).replace(/\.(md|markdown)$/i, "");
    const same = (n: string) =>
      [...this.graph.notes.keys()].find(
        (p) => normKey(posix.basename(p).replace(/\.(md|markdown)$/i, "")) === normKey(n),
      );
    const at = same(name);
    if (!at) return null;
    const dir = posix.dirname(full);
    const folder = dir === "." ? (this.loc.name ?? basename(this.loc.root)) : posix.basename(dir);
    const stem = `${folder}-${name}`;
    let suggested = stem;
    for (let i = 2; same(suggested); i++) suggested = `${stem}-${i}`;
    const prefix = input.includes("/") ? input.slice(0, input.lastIndexOf("/") + 1) : "";
    return { name, at, suggested: prefix + suggested };
  }

  // -------------------------------------------------------------------------------------------
  // File operations in the explorer (18.x)

  /** Copied or cut in the explorer, for `p`. */
  fileClip: ({ mode: "copy" | "cut" } & ExplorerItem) | null = null;
  /** What was deleted last this session: `u` in the explorer puts it back. */
  private lastTrashed: string | null = null;

  /** What the explorer's selected row names: a note or file, a folder, or a vault nested in this
   *  one (its folder); `..` and a loose folder's rows name nothing to change. */
  explorerItem(): ExplorerItem | null {
    if (this.leftView !== "explorer") return null;
    const row = this.explorerRows()[this.sidebar.selected];
    if (!row) return null;
    // Another root's (20.15), or above the root: its files aren't this one's to rename, move or delete here.
    if (row.under || row.root?.other || row.outside || row.root?.here) return null;
    if (row.kind === "root")
      return row.root?.kind === "vault" && this.loc.mode === "vault" ? { rel: row.path, dir: true, vault: true } : null;
    return { rel: row.path, dir: row.kind === "dir" };
  }

  /** The plan moving an item to `to`: a note's, a folder's, or a nested vault's (18.3, 18.7). */
  private movePlan(item: ExplorerItem, to: string): () => RenamePlan {
    return () =>
      item.vault
        ? planVaultFolderMove(this.graph, item.rel, to)
        : item.dir
          ? planFolderMove(this.graph, item.rel, to)
          : planNoteRename(this.graph, item.rel, to);
  }

  /** Select a path in the explorer, unfolding its folders. */
  selectInExplorer(rel: string): void {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    this.invalidateTree();
    const at = this.explorerRows().findIndex((r) => r.path === rel);
    if (at >= 0) this.sidebar.selected = at;
  }

  /**
   * The selected row's menu (its `…` button, `.`): what can be done to it, each with its key in the
   * explorer, which picks it here too. It hangs from the button (by key without one: the row).
   */
  openItemMenu(): void {
    const item = this.explorerItem();
    if (!item) return this.message("info", "menu: select a note, file or folder first");
    const actions: [string, string][] = [];
    if (item.dir && !item.vault) actions.push(["new_note", "New note here"], ["new_folder", "New folder here"]);
    actions.push(["rename", item.vault ? "Rename the folder" : "Rename"]);
    if (item.vault) actions.push(["rename_root", "Name it"]);
    actions.push(["move", "Move to…"], ["copy", "Copy"], ["cut", "Cut"]);
    if (item.dir)
      actions.push(item.vault ? ["unmake_root", "Make it a plain folder"] : ["make_root", "Give it .slipbox/"]);
    if (this.fileClip)
      actions.push([
        "paste",
        this.fileClip.mode === "cut"
          ? `Paste ${posix.basename(this.fileClip.rel)} here (move)`
          : `Paste a copy of ${posix.basename(this.fileClip.rel)} here`,
      ]);
    actions.push(["delete", item.vault ? "Delete the root" : "Delete"]);
    const items: ListItem[] = actions.map(([action, label]) => {
      const key = this.explorerKeys.keysFor(action)[0];
      const shifted = key ? /^shift\+(.)$/.exec(key) : null;
      const hotkey = shifted ? shifted[1]!.toUpperCase() : key && [...key].length === 1 ? key : undefined;
      return {
        label,
        hint: hotkey ?? (key ? prettyKey(key, this.leader) : undefined),
        ...(hotkey ? { hotkey } : {}),
        data: action,
      };
    });
    const g = this.geometry;
    const button = g?.hot.find((h) => h.id === "xrow:menu");
    const anchor = button
      ? { x: button.x, y: button.y }
      : g?.sidebar
        ? { x: g.sidebar.x + 2, y: g.sidebar.y + this.sidebar.selected - this.sidebar.scroll }
        : undefined;
    this.openList({
      title: `${posix.basename(item.rel)}${item.dir ? "/" : ""}`,
      items,
      filterable: false,
      anchor,
      menu: true,
      accept: (it) => {
        this.region = "sidebar";
        this.itemAction(it.data as string, item);
      },
    });
  }

  /** An explorer action on a note, file, folder or nested vault: its keys' and its menu's. */
  itemAction(action: string, item: ExplorerItem): void {
    const folder = item.dir ? item.rel : posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    switch (action) {
      case "rename":
        return this.renameItem(item);
      case "rename_root":
        return this.renameVaultItem(item);
      case "move":
        return this.moveItem(item);
      case "delete":
        return this.deleteItem(item);
      case "copy":
      case "cut":
        return this.clipItem(action, item);
      case "paste":
        return this.pasteItem();
      case "new_note":
        return this.promptNewNote(folder);
      case "new_folder":
        return this.promptNewFolder(folder);
      case "make_root":
        return item.dir && !item.vault
          ? this.makeVaultItem(item)
          : this.message(
              "info",
              item.vault
                ? `${item.rel} is a root already — shift+v makes it a plain folder`
                : "give a folder .slipbox/: select a folder first",
            );
      case "unmake_root":
        return item.vault
          ? this.unmakeVaultItem(item)
          : this.message("info", "make a plain folder: select a nested root (its folder has its own icon)");
    }
  }

  /** The vault's tags (1.6), with how many notes carry each, nested ones under their parents: pick one for its notes. */
  openTagList(): void {
    const tags = this.graph.tags();
    if (!tags.length) return this.message("info", "no tags here: #tag in a note, or tags: in its frontmatter");
    this.openList({
      title: `Tags (${tags.length})`,
      items: tags.map((t) => ({
        label: `#${t.tag}`,
        hint: `${t.count} note${t.count === 1 ? "" : "s"}`,
        indent: t.tag.split("/").length - 1,
        data: t.tag,
      })),
      accept: (it) => this.openTagNotes(it.data as string),
    });
  }

  /** The document types here (22.3) — skill, adr, the config's — each with how many notes are of it: pick one for its
   *  notes. */
  openTypeList(): void {
    const types = rootTypes(this.graph);
    const notes = [...this.graph.notes.keys()];
    const findings = frontmatterFindings(this.graph);
    this.openList({
      title: `Document types (${types.length})`,
      items: types.map((t) => {
        const n = notes.filter((rel) => ofType(rel, t)).length;
        const bad = findings.filter((f) => ofType(f.path, t)).length;
        return {
          label: t.name,
          hint: `${n} note${n === 1 ? "" : "s"}${bad ? `, ${bad} breaking its rules` : ""}${t.source === "config" ? " · yours" : ""}`,
          data: t.name,
        };
      }),
      accept: (it) => this.openTypeNotes(it.data as string),
    });
  }

  /** A type's notes (22.3), by number then path, each its status — what supersedes it too: pick one to open. */
  openTypeNotes(name: string): void {
    const t = rootTypes(this.graph).find((x) => x.name === name);
    if (!t) return this.message("info", `no document type "${name}" here: space f d lists them`);
    const list = this.typedNotes(t.name);
    if (!list.length) return this.message("info", `no ${t.name} notes here (${t.paths.join(", ")})`);
    this.openList({
      title: `${t.name} — ${list.length} note${list.length === 1 ? "" : "s"}`,
      items: list.map((n) => ({
        label: `${n.number === null ? "" : `${n.number}  `}${n.title || n.path}`,
        hint: `${n.status ? `${n.status}${n.supersededBy ? ` → ${n.supersededBy}` : ""} · ` : ""}${n.path}`,
        data: n.path,
      })),
      accept: (it) => {
        this.region = "content";
        this.open(it.data as string);
      },
    });
  }

  /** A type's notes, in their order, titles read. */
  private typedNotes(name: string): TypedNote[] {
    const t = rootTypes(this.graph).find((x) => x.name === name);
    if (!t) return [];
    const notes = [...this.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" }));
    return notesOfType(t, notes, (rel) => this.graph.textOf(rel));
  }

  /** `] t` / `[ t` (22.3): the next or previous note of this note's document type, in the type's order. */
  typeStep(dir: 1 | -1): void {
    const rel = this.view?.buf.rel;
    if (!rel) return this.message("info", "open a note of a document type: space f d lists them");
    const t = rootTypes(this.graph).find((x) => ofType(rel, x));
    if (!t) return this.message("info", `${rel} is of no document type: space f d lists them`);
    const list = this.typedNotes(t.name);
    const i = list.findIndex((n) => n.path === rel);
    const next = list[i + dir];
    if (!next) return this.message("info", `the ${dir > 0 ? "last" : "first"} ${t.name} (${list.length})`);
    this.open(next.path);
    this.message("info", `${t.name} ${i + dir + 1} of ${list.length}${next.status ? ` — ${next.status}` : ""}`);
  }

  /** The notes with a tag (1.6) — its nested tags' too: pick one to open. */
  openTagNotes(tag: string): void {
    const t = this.graph.tagged(tag);
    if (!t) return this.message("info", `no note has #${tag.replace(/^#/, "")}`);
    this.openList({
      title: `#${t.tag} — ${t.notes.length} note${t.notes.length === 1 ? "" : "s"}`,
      items: t.notes.map((rel) => ({ label: rel, hint: this.graph.notes.get(rel)?.title ?? "", data: rel })),
      accept: (it) => {
        this.region = "content";
        this.open(it.data as string);
      },
    });
  }

  /** Whether the explorer has the keys (its tree shown and focused). */
  explorerFocused(): boolean {
    return this.region === "sidebar" && this.sidebarShown && this.leftView === "explorer";
  }

  /** What `space n …` acts on (18.13): the explorer's selected note or file when it has focus, else
   *  this note; null (and said) without one. */
  noteTarget(): ExplorerItem | null {
    if (this.explorerFocused()) {
      const item = this.explorerItem();
      if (item && !item.dir) return item;
      this.message("info", "space n acts on a note: select one (space d on a folder)");
      return null;
    }
    const rel = this.view?.buf.rel ?? null;
    if (rel === null) this.message("info", "open a note of this root, or select one in the explorer");
    return rel === null ? null : { rel, dir: false };
  }

  /** What `space d …` acts on (18.13): the explorer's selected folder (or vault, or a file's folder)
   *  when it has focus, else this note's folder; null (and said) at the vault's root. */
  folderTarget(): ExplorerItem | null {
    const item = this.explorerFocused()
      ? this.explorerItem()
      : this.view?.buf.rel
        ? { rel: this.view.buf.rel, dir: false }
        : null;
    if (item?.dir) return item;
    const folder = item ? posix.dirname(item.rel) : ".";
    if (folder !== ".") return { rel: folder, dir: true };
    this.message(
      "info",
      item
        ? `${item.rel} is at the root: select a folder in the explorer`
        : "select a folder in the explorer, or open a note in one",
    );
    return null;
  }

  /** `space v m` in a vault (18.13): the explorer's selected folder (or this note's) made a vault. */
  makeVaultHere(): void {
    const f = this.folderTarget();
    if (!f) return;
    if (f.vault) return this.message("info", `${f.rel} is a root already — space v shift+m makes it a plain folder`);
    this.makeVaultItem(f);
  }

  /** `space v shift+m` (18.13): the explorer's selected vault, or this one, made a plain folder of the vault holding it. */
  unmakeVaultHere(): void {
    const item = this.explorerFocused() ? this.explorerItem() : null;
    if (item?.vault) return this.unmakeVaultItem(item);
    if (item) return this.message("info", "make a plain folder: select a nested root (its folder has its own icon)");
    this.unmakeThisVault();
  }

  /**
   * This vault, nested in another, made a plain folder of it (18.11, `space v shift+m` from a note): the
   * preview from the vault holding it; then into that vault, the note still open.
   */
  unmakeThisVault(): void {
    const holder = this.loc.mode === "vault" ? findVaultRoot(dirname(this.loc.root)) : null;
    if (!holder)
      return this.message(
        "info",
        `${this.loc.name ?? this.loc.root} isn't inside another root: only a root nested in another becomes a plain folder (of the root holding it)`,
      );
    // Refused before anything changes when the switch into the holder would be: never a root
    // whose .slipbox/ is gone, still open.
    if (!this.canLeave()) return;
    const parent = openVault(holder);
    const rel = relative(holder, this.loc.root);
    const open = this.view?.buf.abs ?? null;
    this.previewRename(
      () => planUnmakeVault(parent, rel),
      (plan) => {
        if (!this.canLeave()) return; // changed while the preview showed
        let applied: Applied;
        try {
          applied = applyPlan(parent, plan);
        } catch (err) {
          return this.message("error", (err as Error).message);
        }
        const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
        this.switchVault(rootAt(holder), open && existsSync(open) ? open : null);
        this.message(
          "info",
          `made ${rel}/ a plain folder of ${plan.to} (its .slipbox/ is in the trash): ${n} change${n === 1 ? "" : "s"} in ${applied.written.length} file${applied.written.length === 1 ? "" : "s"}`,
        );
      },
    );
  }

  /**
   * A folder given a `.slipbox/` of its own — a root (18.11): its name asked, a distinct one suggested,
   * none when cleared (21.10); then the preview of the links that would stop reaching across, fixed. A
   * loose folder's: the choice `vault.init` gives, and into it.
   */
  makeVaultItem(item: ExplorerItem): void {
    const abs = join(this.loc.root, item.rel);
    if (this.loc.mode !== "vault") return this.vaultChoices(abs);
    this.prompt(`give ${item.rel}/ its .slipbox/, called (empty: no name): `, (name) => {
      this.previewRename(() => planMakeVault(this.graph, item.rel, name.trim() || null));
    });
    if (this.overlay?.kind === "prompt") this.overlay.text = suggestFolderName(abs, this.loc.name);
  }

  /** A vault nested here made a plain folder of this one (18.11): the preview, then done. */
  unmakeVaultItem(item: ExplorerItem): void {
    this.previewRename(() => planUnmakeVault(this.graph, item.rel));
  }

  /** Unsaved notes among `rel` and what's in it: a file operation would leave them behind. */
  private unsavedIn(rel: string): NoteBuffer[] {
    return this.dirtyBuffers().filter((b) => b.rel !== null && (b.rel === rel || b.rel.startsWith(`${rel}/`)));
  }

  /** Rename in place: a new name, in the same folder; every link fixed after a preview. */
  renameItem(item: ExplorerItem): void {
    const name = posix.basename(item.rel);
    const dir = posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    this.prompt(`rename ${item.rel}${item.dir ? "/" : ""} to: `, (text) => {
      const typed = text.trim().replace(/\/+$/, "");
      if (!typed || typed === name) return;
      if (typed.includes("/")) return this.message("warn", `a name, not a path: m moves ${name} to another folder`);
      this.previewRename(this.movePlan(item, dir ? `${dir}/${typed}` : typed));
    });
    (this.overlay as PromptOverlay).text = item.dir ? name : name.replace(/\.(md|markdown)$/i, "");
  }

  /** Move to another folder, picked from the vault's folders as a tree; links fixed after a preview. */
  moveItem(item: ExplorerItem): void {
    const here = posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    const name = posix.basename(item.rel);
    this.pickFolder({
      title: `Move ${item.rel}${item.dir ? "/" : ""} to… — type to filter, ← → fold`,
      current: here,
      // A folder can't move into itself.
      exclude: (d) => item.dir && (d === item.rel || d.startsWith(`${item.rel}/`)),
      pick: (d) => this.previewRename(this.movePlan(item, d ? `${d}/${name}` : name)),
    });
  }

  /**
   * Pick a folder of the vault (18.8): a tree like the explorer's — its folds to begin with — the
   * root first; ← folds, → unfolds; typing filters to the matching folders under their parents.
   */
  pickFolder(opts: {
    title: string;
    current: string;
    exclude: (dir: string) => boolean;
    pick: (dir: string) => void;
  }): void {
    const g = this.glyphs;
    const open = new Set(this.expanded);
    for (let d = opts.current; d; d = posix.dirname(d) === "." ? "" : posix.dirname(d)) open.add(d); // where it is, unfolded
    const dirs = [...new Set(this.graph.dirs)]
      .filter((d) => d && !opts.exclude(d))
      .sort((a, b) => {
        const pa = a.split("/");
        const pb = b.split("/");
        for (let i = 0; i < Math.min(pa.length, pb.length); i++)
          if (pa[i] !== pb[i]) return pa[i]!.localeCompare(pb[i]!, undefined, { sensitivity: "base" });
        return pa.length - pb.length;
      });
    const row = (d: string, unfolded: boolean, context = false): ListItem => ({
      label: `${"  ".repeat(d.split("/").length)}${unfolded ? g.dirOpen : g.dirClosed} ${posix.basename(d)}`,
      hint: d === opts.current ? "here" : "",
      data: d,
      ...(context ? { context } : {}),
    });
    const source = (input: string): ListItem[] => {
      const out: ListItem[] = [
        { label: `${g.dirOpen} / (the root)`, hint: opts.current === "" ? "here" : "", data: "" },
      ];
      const q = input.trim();
      if (q) {
        // The matches, with their parents for where they are; enter takes the first match.
        const shown = new Set<string>();
        const hits = new Set<string>();
        for (const d of dirs) {
          if (!match(q, d)) continue;
          hits.add(d);
          const parts = d.split("/");
          for (let i = 1; i <= parts.length; i++) shown.add(parts.slice(0, i).join("/"));
        }
        out[0]!.context = true;
        return [...out, ...dirs.filter((d) => shown.has(d)).map((d) => row(d, true, !hits.has(d)))];
      }
      for (const d of dirs) {
        const parts = d.split("/");
        if (parts.slice(0, -1).every((_, i) => open.has(parts.slice(0, i + 1).join("/"))))
          out.push(row(d, open.has(d)));
      }
      return out;
    };
    const first = source("");
    this.openList({
      title: opts.title,
      items: [],
      source,
      selected: Math.max(
        0,
        first.findIndex((it) => it.data === opts.current),
      ),
      accept: (it) => opts.pick(it.data as string),
      fold: (it, unfold) => {
        // As in the explorer, a folder folds whatever it holds; what unfolds under it here is its folders.
        const d = it.data as string;
        if (!d || unfold === open.has(d)) return false;
        if (unfold) open.add(d);
        else open.delete(d);
        return true;
      },
    });
  }

  /** Delete to the vault's trash, after asking — saying how many links it breaks. */
  deleteItem(item: ExplorerItem): void {
    const unsaved = this.unsavedIn(item.rel);
    if (unsaved.length)
      return this.message(
        "warn",
        `unsaved: ${unsaved.map((b) => this.displayName(b)).join(", ")} — save or revert it first`,
      );
    const breaking = linksInto(this.graph, item.rel);
    let what = item.dir ? `${item.rel}/ and everything in it` : item.rel;
    if (item.vault) {
      // A whole vault: said so, with how much it holds.
      const g = openVault(join(this.loc.root, item.rel));
      what = `the root ${g.loc.name ?? item.rel} (${item.rel}/, ${g.notes.size} note${g.notes.size === 1 ? "" : "s"})`;
    }
    const warn = breaking ? ` ${breaking} link${breaking === 1 ? "" : "s"} to it will break.` : "";
    this.confirm(`Delete ${what}?${warn} It goes to the trash: u restores it.`, () => {
      let t: ReturnType<typeof trashPath>;
      try {
        t = trashPath(this.graph, this.loc, item.rel);
      } catch (err) {
        return this.message("warn", (err as Error).message);
      }
      this.lastTrashed = t.id;
      // Open notes that went with it show their last text, marked deleted (as when deleted on disk).
      for (const b of this.buffers.values())
        if (b.rel !== null && (b.rel === item.rel || b.rel.startsWith(`${item.rel}/`))) b.deleted = true;
      this.afterFileOp();
      this.message("info", `deleted ${item.rel} to the trash — u in the explorer (or :trash) restores it`);
    });
  }

  /** Put back what was deleted last; with nothing deleted this session, the trash. */
  restoreLast(): void {
    if (!this.lastTrashed) return this.openTrash();
    this.restoreItem(this.lastTrashed);
  }

  private restoreItem(id: string): void {
    let item: TrashItem;
    try {
      item = restorePath(this.graph, this.loc, id);
    } catch (err) {
      return this.message("warn", (err as Error).message);
    }
    if (this.lastTrashed === id) this.lastTrashed = null;
    for (const b of this.buffers.values())
      if (b.deleted && (b.abs === item.abs || b.abs.startsWith(`${item.abs}/`))) this.reloadBuffer(b);
    this.afterFileOp();
    this.selectInExplorer(item.shown);
    this.message("info", `restored ${item.shown}`);
  }

  /**
   * The vault's trash (`:trash`): enter restores an item; its last row empties it (DF-D14), after asking —
   * the list being what goes. `empty` (`trash.empty`): opened on that row.
   */
  openTrash(empty = false): void {
    const items = listTrash(this.loc);
    if (!items.length) return this.message("info", "the trash is empty");
    const EMPTY = Symbol("empty");
    this.openList({
      title: `Trash (${items.length}) — enter restores`,
      items: [
        ...items.map(
          (i): ListItem => ({
            label: `${i.shown}${i.dir ? "/" : ""}`,
            hint: i.at.slice(0, 16).replace("T", " "),
            data: i.id,
          }),
        ),
        { label: "", header: true, data: null },
        { label: "Empty the trash…", hint: "for good, after asking", data: EMPTY },
      ],
      selected: empty ? items.length + 1 : 0,
      accept: (it) => (it.data === EMPTY ? this.emptyTrashAsk(items) : this.restoreItem(it.data as string)),
    });
  }

  /** Empty the trash of `items`, what the list showed, after a yes-or-no question: gone for good. */
  private emptyTrashAsk(items: TrashItem[]): void {
    const one = items.length === 1 ? items[0]! : null;
    const what = one
      ? `${one.shown}${one.dir ? "/" : ""} goes for good: it can't be restored`
      : `Its ${items.length} items go for good: none can be restored`;
    this.confirm(`Empty the trash? ${what}.`, () => {
      const gone = emptyTrash(
        this.loc,
        items.map((i) => i.id),
      );
      if (gone.some((i) => i.id === this.lastTrashed)) this.lastTrashed = null;
      this.message("info", `emptied the trash: ${gone.length} item${gone.length === 1 ? "" : "s"} gone for good`);
    });
  }

  /** Copy or cut the selected item, for `p`. */
  clipItem(mode: "copy" | "cut", item: ExplorerItem): void {
    this.fileClip = { mode, ...item };
    this.message(
      "info",
      `${mode === "copy" ? "copied" : "cut"} ${item.rel}${item.dir ? "/" : ""} — p in the explorer (space d p) pastes it in a folder`,
    );
  }

  /** Paste into the selected folder (or beside the selected file): a copy, or what was cut, moved. */
  pasteItem(): void {
    const clip = this.fileClip;
    if (!clip) return this.message("info", "nothing copied or cut: y copies, x cuts");
    if (!existsSync(join(this.loc.root, clip.rel))) {
      this.fileClip = null;
      return this.message("warn", `${clip.rel} isn't there any more`);
    }
    const into = this.newItemBase();
    if (into === null) return this.refuseOtherRoot();
    const from = posix.dirname(clip.rel) === "." ? "" : posix.dirname(clip.rel);
    const name = posix.basename(clip.rel);
    const to = into ? `${into}/${name}` : name;
    if (clip.mode === "cut") {
      if (into === from) return this.message("info", `${clip.rel} is already in ${into || "the root"}`);
      if (clip.dir && (into === clip.rel || into.startsWith(`${clip.rel}/`)))
        return this.message("warn", `${clip.rel} can't move into itself`);
      return this.previewRename(this.movePlan(clip, to));
    }
    let r: ReturnType<typeof copyPath>;
    try {
      // Into its own folder: beside it, as name-copy.
      r = copyPath(this.graph, clip.rel, into === from ? undefined : to);
    } catch (err) {
      return this.message("warn", (err as Error).message);
    }
    this.afterFileOp();
    this.selectInExplorer(r.to);
    this.message("info", `copied ${r.from} → ${r.to}`);
  }

  /** After files moved, came or went: the tree, the watcher and the layouts follow. */
  private afterFileOp(): void {
    this.refreshGit();
    this.invalidateTree();
    this.watcher?.sync(isListed(this.loc) ? [""] : this.graph.dirs, this.knownFromGraph(), this.sizesFromGraph());
    for (const b of this.buffers.values()) b.invalidateLayouts();
    this.relayoutAll();
  }

  /** A nested root's name (`R`, the row's button): its `.slipbox/` name, which pointers use (17.15, 21.10: `slipbox name`); links are paths and don't change. */
  renameVaultItem(item: ExplorerItem): void {
    if (!item.vault) return this.message("info", "R names a nested root: select one (its folder has its own icon)");
    const root = join(this.loc.root, item.rel);
    const name = rootAt(root).name ?? posix.basename(item.rel);
    this.prompt(`name ${name}, as pointers name it: `, (text) => {
      const typed = text.trim();
      if (!typed || typed === name) return;
      this.previewRename(() => planVaultRename(rootAt(root), typed));
    });
    (this.overlay as PromptOverlay).text = name;
  }

  /** Ask for a new folder's name and make it. */
  promptNewFolder(base = this.newItemBase()): void {
    if (base === null) return this.refuseOtherRoot();
    this.prompt(`new folder in ${base ? `${base}/` : "the root"}`, (text) => void this.createFolder(text, base));
  }

  /** Create a folder (`shift+n` in the explorer, `space d n`, `:mkdir`): selected in the explorer. */
  createFolder(input: string, base: string | null): string | null {
    if (base === null) return this.refuseOtherRoot(), null;
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
    return (
      this.usableWidth -
      (this.sidebarBeside ? this.sidebarWidth() + 1 : 0) -
      (this.outlineBeside ? this.outlineWidth() + 1 : 0)
    );
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
      this.problemsPanel.height = null;
      return;
    }
    const grow = action === "wider" || action === "taller" ? 1 : -1;
    const horizontal = action === "wider" || action === "narrower";
    // The Problems panel, focused: taller and shorter, from its height as drawn.
    if (this.region === "problems" && this.problemsPanel.shown) {
      if (horizontal) return this.message("info", "the Problems panel spans the screen: j / k resize it");
      const drawn = this.geometry?.problems?.h;
      return this.resizeProblems((drawn ?? this.problemsPanel.height ?? PANEL_ROWS) + grow);
    }
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
    if (!t || t.views.length < 2)
      return this.message("info", "one window — resize mode sizes a split, or the explorer and outline when focused");
    const side = this.effectiveOrientation(t) === "side";
    if (side !== horizontal)
      return this.message("info", side ? "side-by-side split: h / l resize it" : "stacked split: j / k resize it");
    const total = side ? this.contentWidth() : this.height;
    // Growing the first window raises the ratio; growing the second lowers it.
    const delta = ((grow * step) / Math.max(10, total)) * (t.active === 0 ? 1 : -1);
    t.ratio = Math.max(0.15, Math.min(0.85, t.ratio + delta));
  }

  showSidebar(on: boolean): void {
    if (this.narrow || this.ui.zen) this.sidebar.overlay = on;
    else this.sidebar.visible = on;
    if (!on && this.region === "sidebar") this.region = "content";
  }

  /**
   * A right rail button, or its command (3.17): show the right panel on `view` and focus it; if
   * it's already showing that view, hide it (`cycle`: focus it first when it's open but not focused).
   * A view shown the first time starts on the cursor's place: its section, its footnote.
   */
  openRightView(view: RightView, mode: "toggle" | "cycle" = "toggle"): void {
    const showing = this.outlineShown && this.rightView === view;
    if (showing && mode === "cycle" && this.region !== "outline") {
      this.region = "outline";
      this.outline.pinned = false;
      return;
    }
    if (showing) return this.showOutline(false);
    const restored = this.switchRightView(view);
    this.outline.filtering = false;
    this.showOutline(true);
    this.region = "outline";
    if (restored) return;
    this.outline.filter = "";
    this.outline.pinned = false;
    this.outline.selected = Math.max(
      0,
      view === "outline" ? this.currentSection() : view === "footnotes" ? this.currentFootnote() : 0,
    );
  }

  /** Put `view` in the right panel: each view keeps its own place, as the left panel's do. */
  switchRightView(view: RightView): boolean {
    if (this.rightView === view) return false;
    const o = this.outline;
    this.rightPositions.set(this.rightView, {
      selected: o.selected,
      scroll: o.scroll,
      left: o.left,
      pinned: o.pinned,
      filter: o.filter,
    });
    this.rightView = view;
    o.filtering = false;
    const saved = this.rightPositions.get(view);
    Object.assign(o, saved ?? { selected: 0, scroll: 0, left: 0, pinned: false, filter: "" });
    return !!saved;
  }

  /** The current note's footnotes (3.17), parsed once per version of its text. */
  footnotes(): Footnote[] {
    const buf = this.view?.buf;
    if (buf?.kind.group !== "note") return [];
    // Parsing on other threads (15.1): none yet, rather than the whole parse here.
    if (buf.parsing) return [];
    const key = `${buf.key}:${buf.version}`;
    if (this.footnoteCache?.key !== key) this.footnoteCache = { key, list: footnotesOf(buf.parsed) };
    return this.footnoteCache.list;
  }

  /** The footnotes view's rows: each footnote, its references under it when unfolded; filtered by `/`. */
  footnoteRows(): FootnoteRow[] {
    const q = this.rightView === "footnotes" ? (this.outline.filter ?? "") : "";
    const lines = this.view?.buf.source.split("\n") ?? [];
    const rows: FootnoteRow[] = [];
    for (const fn of this.footnotes()) {
      const text = `[${fn.label}] ${fn.text ?? "(no definition)"}`;
      if (q && !match(q, text)) continue;
      const folded = !this.footnotesOpen.has(fn.id);
      rows.push({ fn, ref: null, text, hasChildren: fn.references.length > 0, folded });
      if (folded) continue;
      for (const ref of fn.references) {
        const around = (lines[ref.line - 1] ?? "").trim();
        rows.push({ fn, ref, text: `L${ref.line}  ${around}`, hasChildren: false, folded: false });
      }
    }
    return rows;
  }

  /** Index into footnoteRows() of the footnote the cursor's line holds (a reference to it, or its
   *  definition), else the last one before it; -1 with none. */
  currentFootnote(): number {
    const view = this.view;
    if (!view) return -1;
    const line = this.cursorLine(view);
    const rows = this.footnoteRows();
    const on = rows.findIndex((r) =>
      r.ref ? r.ref.line === line : r.fn.line === line || (r.folded && r.fn.references.some((x) => x.line === line)),
    );
    if (on >= 0) return on;
    let best = -1;
    rows.forEach((r, i) => {
      if (!r.ref && Math.min(r.fn.line ?? Infinity, r.fn.references[0]?.line ?? Infinity) <= line) best = i;
    });
    return best;
  }

  /** Move the note to a footnote row's place: the definition, or that reference — the rendered
   *  reference itself when the window renders the note, the source text's place in source mode. */
  jumpToFootnote(row: FootnoteRow): void {
    const view = this.view;
    if (!view) return;
    const layout = this.currentLayout(view);
    this.pushHistory(view);
    if (row.ref) {
      const onLine = row.fn.references.filter((r) => r.line === row.ref!.line);
      const nth = onLine.findIndex((r) => r.column === row.ref!.column);
      const drawn = layout.links.filter(
        (l) => l.kind === "footnote" && l.target.toLowerCase() === row.fn.id && l.src === row.ref!.line,
      )[nth];
      if (drawn && drawn.line >= 0) this.moveCursor(view, { row: drawn.line, col: drawn.col });
      else placeAt(this, view, (view.buf.lineStarts()[row.ref.line - 1] ?? 0) + row.ref.column - 1);
    } else {
      if (row.fn.line === null) return this.message("warn", `footnote [^${row.fn.label}] has no definition`);
      const def = layout.lines.findIndex(
        (l) => l.footnoteDef !== undefined && l.footnoteDef.toLowerCase() === row.fn.id,
      );
      if (def >= 0) this.moveCursor(view, { row: def, col: 0 });
      else placeAt(this, view, view.buf.lineStarts()[row.fn.line - 1] ?? 0);
    }
    this.region = "content";
    if (this.narrow || this.ui.zen) this.outline.overlay = false;
  }

  // The floating editor (3.20): a view over the windows, of text that isn't a file of its own — a
  // note's frontmatter — with every editing key there is; closed (esc, q, :q) or saved (ctrl+s,
  // :w), its text goes back where it came from, as one undo step there.

  floating:
    | ((
        | { kind: "properties"; note: NoteBuffer; format: "yaml" | "toml"; original: string }
        | { kind: "hover" }
        | { kind: "commit"; amend: boolean; from: Region }
      ) & { view: View; title: string })
    | null = null;

  /** The frontmatter's span in a note's text: the fences, and the text between them; null without one. */
  private frontmatterSpan(source: string): {
    start: number;
    end: number;
    innerStart: number;
    innerEnd: number;
    bare: boolean;
    format: "yaml" | "toml";
  } | null {
    // CRLF lines too; an empty one (the closing fence right after the opening) is tried first, so
    // it never reaches on to a `---` rule further down.
    const m = /^(---|\+\+\+)[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??(---|\.\.\.|\+\+\+)[ \t]*(?:\r?\n|$)/.exec(source);
    if (!m || (m[1] === "+++") !== (m[3] === "+++")) return null;
    const innerStart = /^(---|\+\+\+)[ \t]*\r?\n/.exec(source)![0].length;
    const innerEnd = innerStart + (m[2]?.length ?? 0);
    // bare: no line between the fences, so text put there brings its own line end.
    return {
      start: 0,
      end: m[0].length,
      innerStart,
      innerEnd,
      bare: m[2] === undefined,
      format: m[1] === "+++" ? "toml" : "yaml",
    };
  }

  /** Edit the current note's properties — its frontmatter, YAML or TOML — in a floating editor (3.20). */
  openPropertiesEditor(): void {
    const view = this.view;
    if (this.floating) return;
    if (view?.buf.kind.group !== "note" || view.buf.rel === null)
      return this.message("info", "properties are a note's: its frontmatter");
    const why = cannotEdit(view);
    if (why) return this.message("warn", `${why} — not editing`);
    const note = view.buf;
    const span = this.frontmatterSpan(note.source);
    const original = span ? note.source.slice(span.innerStart, span.innerEnd).replace(/\r\n/g, "\n") : "";
    const format = span?.format ?? "yaml";
    const buf = new NoteBuffer(null, `${note.abs}#properties`, `${note.key}#properties`);
    buf.kind = { group: "data", format };
    buf.virtual = { save: (text) => this.writeProperties(text) };
    buf.loadText(original ? `${original}\n` : "");
    const fv = this.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.floating = {
      kind: "properties",
      view: fv,
      note,
      format,
      original,
      title: `Properties — ${this.displayName(note)} (${format === "toml" ? "TOML" : "YAML"})`,
    };
    this.setViewMode(fv, "source");
    this.region = "content";
  }

  /**
   * Write the floating editor's text into its note's frontmatter: one undo step there, the note
   * saved. Text that doesn't parse, or a frontmatter changed under it meanwhile, asks first; false
   * while it asks (the editor stays). `close`: asked by closing the editor, which a yes then closes;
   * from `ctrl+s` or `:wa`, a yes keeps it open, its text saved.
   */
  private writeProperties(text: string, sure = false, close = false): boolean {
    const f = this.floating;
    if (f?.kind !== "properties") return false;
    const note = f.note;
    const body = text.replace(/\s+$/, "");
    const span = this.frontmatterSpan(note.source);
    const now = span ? note.source.slice(span.innerStart, span.innerEnd).replace(/\r\n/g, "\n") : "";
    if (!sure && now !== f.original) {
      this.confirm(`${this.displayName(note)}'s properties changed while you edited them. Write yours over them?`, () =>
        this.writtenAfterAsking(f, text, close),
      );
      return false;
    }
    if (!sure && body) {
      const probe = parseMarkdown(f.format === "toml" ? `+++\n${body}\n+++\n` : `---\n${body}\n---\n`).frontmatter;
      if (probe?.error) {
        this.confirm(`The properties don't parse (${probe.error.split("\n")[0]}). Write them anyway?`, () =>
          this.writtenAfterAsking(f, text, close),
        );
        return false;
      }
    }
    const fence = f.format === "toml" ? "+++" : "---";
    // Written with the note's own line ends (a CRLF note stays CRLF).
    const eol = note.eol;
    const lines = body.replace(/\r?\n/g, eol);
    // Emptied: the frontmatter goes; new: it comes first.
    const edit = span
      ? body
        ? { at: span.innerStart, length: span.innerEnd - span.innerStart, text: span.bare ? `${lines}${eol}` : lines }
        : { at: 0, length: span.end, text: "" }
      : body
        ? { at: 0, length: 0, text: `${fence}${eol}${lines}${eol}${fence}${eol}` }
        : null;
    // The note gone on disk (or never valid UTF-8) meanwhile: not written, nor brought back.
    const why = cannotEdit({ buf: note });
    if (why) this.message("warn", `${why} — not writing the properties`);
    else if (edit && !(span && body === now)) {
      note.edit(edit.at, edit.length, edit.text); // one edit: one undo step
      for (const v of this.allViews()) if (v.buf === note) v.layoutKey = "";
      if (this.saveBuffer(note, true)) this.message("info", `properties written to ${this.displayName(note)}`);
      // Any other failure has said why already.
      else if (note.changedOnDisk() && !note.deleted)
        this.message(
          "warn",
          `${this.displayName(note)}'s properties changed — not saved yet (the file changed on disk: space n w decides)`,
        );
    }
    f.original = body;
    return true;
  }

  /** A yes to writing the properties: written; then the editor closed, or (from a save) its text saved. */
  private writtenAfterAsking(f: NonNullable<App["floating"]>, text: string, close: boolean): void {
    if (!this.writeProperties(text, true, close)) return;
    if (close) this.floating = null;
    else if (f.view.buf.source === text) f.view.buf.markSaved();
  }

  /** Close the floating editor, writing its text back first when it changed; false while that asks. A commit's: left. */
  closeFloating(): boolean {
    const f = this.floating;
    if (!f) return true;
    if (f.kind === "properties" && f.view.buf.dirty && !this.writeProperties(f.view.buf.source, false, true))
      return false;
    this.floating = null;
    if (f.kind === "commit") {
      this.message("info", f.amend ? "not amended" : "not committed");
      this.commitDone(f.from);
    }
    return true;
  }

  /**
   * A commit (26.3): its message in the floating editor — `ctrl+s` (`:w`) commits what's staged, or amends the last
   * commit with it; closing it (`esc`, `q`) leaves it. Its `#` lines say what's staged and are left out. In a root not
   * trusted, said: its hooks don't run, and it isn't signed.
   */
  openCommitEditor(amend: boolean): void {
    const c = this.checkout;
    if (!c) return this.message("info", "not a git checkout");
    if (this.floating && !this.closeFloating()) return;
    const staged = sections(this.gitEntries ?? []).staged.map((e) => e.path);
    if (!amend && !staged.length)
      return this.message("info", "nothing staged — s stages a file in source control (space g s)");
    const last = amend ? lastMessage(c) : null;
    if (amend && last === null) return this.message("info", "no commit to amend yet");
    const trusted = isTrusted(c.root);
    const files = staged.length ? ` (${staged.slice(0, 5).join(", ")}${staged.length > 5 ? ", …" : ""})` : "";
    const guide = [
      `# ${amend ? "Amending the last commit" : "Committing"}: ${staged.length} file${staged.length === 1 ? "" : "s"} staged${files}.`,
      "# Lines starting with # are left out. ctrl+s commits; esc leaves it.",
      ...(trusted
        ? []
        : ["# This root isn't trusted: its hooks don't run, and the commit isn't signed (:trust trusts it)."]),
    ];
    const buf = new NoteBuffer(null, `${c.root}#commit`, `commit:${c.root}`);
    buf.kind = { group: "text", format: "text" };
    buf.virtual = { save: (text) => (this.commitWith(text, amend), true) };
    buf.loadText(`${last ?? ""}\n\n${guide.join("\n")}\n`);
    const fv = this.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.floating = {
      kind: "commit",
      amend,
      from: this.region,
      view: fv,
      title: amend ? "Amend the last commit" : "Commit",
    };
    this.setViewMode(fv, "source");
    this.region = "content";
    // A new commit's message is the first thing typed: its editor opens typing, on the empty first line. An amend's
    // has its message to change: it opens as any editor does.
    if (!amend) startInsert(this, fv, () => 0);
    if (!trusted) this.message("warn", "this root isn't trusted: the commit's hooks don't run, and it isn't signed");
  }

  /** The commit editor gone: back to where it was opened from — source control, when it's still there. */
  private commitDone(from: Region): void {
    this.region = from === "sidebar" && !this.sidebarShown ? "content" : from;
  }

  /** The commit editor's text committed: in the background; the editor closed when it's done, kept (said why) when not. */
  private commitWith(text: string, amend: boolean): void {
    const c = this.checkout;
    if (!c) return;
    this.message("info", amend ? "amending…" : "committing…");
    void commitLater(c, text, amend).then((r) => {
      if ("why" in r) this.message("warn", `git: ${r.why}`);
      else {
        const f = this.floating;
        if (f?.kind === "commit") {
          this.floating = null;
          this.commitDone(f.from);
        }
        this.message("info", `${amend ? "amended" : "committed"} ${r.hash}: ${r.subject}`);
        void this.refreshGitNow().then(() => this.host.requestRender());
      }
      this.host.requestRender();
    });
  }

  /**
   * What's under the cursor, in the floating window (19.12): markdown, rendered — a language server's
   * hover, or where a note's link lands. Read-only; esc or q closes it.
   */
  openHover(markdown: string, title: string): void {
    if (this.floating && !this.closeFloating()) return;
    const buf = new NoteBuffer(null, `hover:${title}`, `hover:${title}`);
    buf.kind = { group: "note", format: "markdown" };
    buf.virtual = { save: () => true };
    // Read, selected and copied from — never typed in (a version from git said read-only took typing).
    buf.readOnly = "the floating window is read-only";
    buf.loadText(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    const fv = this.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.floating = { kind: "hover", view: fv, title };
    this.region = "content";
  }

  /**
   * A pointer to a branch not checked out here (21.7): the file as it is there, from git, read-only,
   * in the floating window — a note rendered, any other file as its text.
   */
  showFromGit(ref: { root: string; rel: string; branch: string }, link: string): void {
    const c = checkoutOf(ref.root);
    const text = c ? showAt(c, ref.branch, ref.rel) : null;
    if (text === null) return this.message("warn", `${link}: no ${ref.rel} on ${ref.branch}`);
    const note = /\.(md|markdown)$/i.test(ref.rel);
    this.openHover(
      note ? text : fence(text, fenceLanguage(ref.rel)),
      `${ref.rel} on ${ref.branch}, read-only from git`,
    );
  }

  /** A position in a source-mode view as the protocol counts it: line and UTF-16 character, from 0. */
  lspPosition(view: View): { line: number; character: number } {
    const at = offsetOf(this, view);
    const starts = view.buf.lineStarts();
    let line = starts.length - 1;
    while (line > 0 && starts[line]! > at) line--;
    return { line, character: at - starts[line]! };
  }

  /** Open a file (absolute) at a line and a UTF-16 character, from 0: a location a server gives. */
  openLocation(abs: string, line: number, character: number): void {
    const inVault = abs.startsWith(`${this.loc.root}/`);
    const target = inVault ? abs.slice(this.loc.root.length + 1) : abs;
    this.open(target, { heading: null, headingIndex: 0, offset: 0, line: line + 1 });
    const v = this.view;
    if (!v || v.buf.abs !== abs) return;
    const start = v.buf.lineStarts()[line] ?? 0;
    const text = v.buf.source.slice(start, start + character);
    this.placeAtLine(v, line + 1, [...text].length + 1);
    this.region = "content";
  }

  // The Problems panel (1.7, 19.8), at the bottom: the file on screen's problems, and the root's — links that
  // reach nothing or several notes, lint, conflicts, orphans — each opened where it is.

  /** The file on screen's problems, every source's, by where they start: the panel's This file tab. */
  fileProblems(): Problem[] {
    const v = this.view;
    if (!v) return [];
    return [...this.problemsShown(v)].sort(
      (a, b) =>
        a.start.line - b.start.line ||
        a.start.column - b.start.column ||
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
    );
  }

  /** This file's problems as its tab lists them: those its filter matches — the place, the message, who found it, the line. */
  fileRows(): Problem[] {
    const list = this.fileProblems();
    const q = this.problemsPanel.file.filter;
    if (!q) return list;
    const lines = this.view?.buf.lines() ?? [];
    return list.filter((p) =>
      match(
        q,
        `${p.start.line}:${p.start.column} ${p.message} ${p.source} ${p.code ?? ""} ${lines[p.start.line - 1] ?? ""}`,
      ),
    );
  }

  /** The panel's problem chosen in This file, while it has the focus: marked in the text whatever the marks say. */
  chosenProblem(): Problem | undefined {
    const p = this.problemsPanel;
    if (!p.shown || p.tab !== "file" || this.region !== "problems") return undefined;
    return this.fileRows()[p.file.selected];
  }

  /**
   * The panel's height (its tabs' row included) in the `rows` the windows and it share: as resized, else a third
   * of them — at least PANEL_ROWS where that's under 40% of them — always leaving the note 4; 0 when it can't have 3.
   */
  problemsPanelRows(rows: number): number {
    if (!this.problemsPanel.shown) return 0;
    const h = this.problemsPanel.height ?? Math.min(Math.max(PANEL_ROWS, Math.floor(rows / 3)), Math.floor(rows * 0.4));
    const fit = Math.min(h, rows - 5);
    return fit >= 3 ? fit : 0;
  }

  /** The panel resized to `h` rows (resize mode, a drag of its rule): kept, within what the screen allows. */
  resizeProblems(h: number): void {
    this.problemsPanel.height = Math.max(3, Math.min(200, Math.round(h)));
  }

  /**
   * A sign of the problems bar, clicked (19.9): the panel on This file, that problem chosen — the worst starting
   * there — the note on it, the panel keeping the keys.
   */
  openProblemAt(line: number, column: number): void {
    const p = this.problemsPanel;
    p.file.filter = "";
    p.file.filtering = false;
    const list = this.fileRows();
    const i = list.findIndex((x) => x.start.line === line && x.start.column === column);
    p.shown = true;
    p.tab = "file";
    p.file.selected = Math.max(0, i);
    this.region = "problems";
    this.showFileProblem(list[p.file.selected]);
  }

  /**
   * The Problems panel opened on a tab and focused (`space n q` This file, `space v p` All; the status line's
   * problems, clicked, This file); already open there and focused, closed.
   */
  openProblems(tab: "file" | "all"): void {
    const p = this.problemsPanel;
    if (p.shown && p.tab === tab && this.region === "problems") return this.closeProblems();
    if (tab === "all") {
      this.graph.forgetProblems();
      this.lintVault();
    }
    // This file: the problem at the cursor's line, or the next one after it.
    if (tab === "file" && this.view) {
      const at = this.view.cur.row;
      const line = srcAt(this.currentLayout(this.view).lines[at] ?? ({ src: 1 } as never), this.view.cur.col);
      const list = this.fileRows();
      const i = list.findIndex((x) => x.end.line >= line);
      p.file.selected = Math.max(0, i < 0 ? list.length - 1 : i);
    }
    p.shown = true;
    p.tab = tab;
    this.region = "problems";
  }

  closeProblems(): void {
    const p = this.problemsPanel;
    p.shown = false;
    p.all.filtering = false;
    p.file.filtering = false;
    if (this.region === "problems") this.region = "content";
  }

  /** The panel's keys: the explorer's moves, `tab` between its tabs; This file's moves take the cursor to the problem. */
  problemsPanelAction(action: string): void {
    const p = this.problemsPanel;
    if (action === "switch") {
      if (p.tab === "file") this.openProblems("all");
      else p.tab = "file";
      return;
    }
    if (p.tab === "all") return this.problemsAction(action);
    const list = this.fileRows();
    const s = p.file;
    const go = (i: number) => {
      s.selected = Math.max(0, Math.min(list.length - 1, i));
      this.showFileProblem(list[s.selected]);
    };
    switch (action) {
      case "down":
        return go(s.selected + 1);
      case "up":
        return go(s.selected - 1);
      case "top":
        return go(0);
      case "bottom":
        return go(list.length - 1);
      case "open":
      case "open_tab":
      case "expand":
      case "open_split":
        return this.showFileProblem(list[s.selected], true);
      case "filter":
        s.filtering = true;
        return;
      case "close":
        return this.closeProblems();
      case "leave":
        this.region = "content";
        return;
    }
  }

  /** A problem of the file on screen: the cursor onto it — the panel keeping the focus, unless `go` (enter) moves it there. */
  showFileProblem(pr: Problem | undefined, go = false): void {
    const v = this.view;
    if (!v || !pr) return;
    if (go) this.pushHistory(v);
    this.placeAtLine(v, pr.start.line, pr.start.column);
    if (go) this.region = "content";
  }

  /** The panel's tab's list state: This file's or All's. */
  problemsList(): PanelList {
    const p = this.problemsPanel;
    return p.tab === "file" ? p.file : p.all;
  }

  /** How many problems the All tab has: links, lint, conflicts — orphans, notes nothing links to, aside. */
  problemCount(): number {
    const p = this.graph.problems();
    const conflicts = [...(this.gitStates ?? [])].filter(([, st]) => st === "conflict").length;
    const frontmatter = frontmatterFindings(this.graph).reduce((n, f) => n + f.problems.length, 0);
    return (
      p.broken.length +
      p.ambiguous.length +
      p.fragile.length +
      frontmatter +
      (this.vaultLint.issues?.length ?? 0) +
      conflicts
    );
  }

  /** A click on a row of the panel: This file's selects its problem (the note shows it), a second click goes there;
   *  All's opens it in a tab (a heading folds), as `enter` does. */
  clickProblemRow(i: number, clicks: number): void {
    const p = this.problemsPanel;
    this.region = "problems";
    if (p.tab === "file") {
      const list = this.fileRows();
      p.file.selected = i;
      return this.showFileProblem(list[i], clicks >= 2);
    }
    const rows = this.problemRows();
    const row = rows[i];
    if (!row) return;
    p.all.selected = i;
    if (row.heading) return this.problemsAction(row.folded ? "expand" : "collapse");
    // One click opens it (a tab); the second of a double-click has nothing left to do.
    if (clicks >= 2) return;
    // The clicked row, of the filtered list (as enter in the filter): the filter clears.
    p.all.filter = "";
    p.all.filtering = false;
    return this.openProblemRow(row, rows);
  }

  /** Its rows: each section's heading (with its count), its problems under it unless folded; `/` filters. */
  problemRows(): ProblemRow[] {
    const q = this.problemsPanel.all.filter;
    const p = this.graph.problems();
    const out: ProblemRow[] = [];
    const written = (l: LinkProblem) => (l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}]]` : l.target);
    const section = (name: string, list: LinkProblem[], why: (l: LinkProblem) => string) => {
      const rows = list
        .map((l) => ({ l, label: `L${l.line}`, detail: `${written(l)}${why(l) ? `  ${why(l)}` : ""}` }))
        .filter((r) => !q || match(q, `${r.l.from} ${r.label} ${r.detail}`));
      if (q && !rows.length) return;
      const folded = !q && this.problemsFolded.has(name);
      out.push({ section: name, heading: true, label: `${name} (${list.length})`, detail: "", text: name, folded });
      if (folded) return;
      // Under the note each is in: the path once, then its problems by line.
      let note = "";
      for (const r of rows) {
        if (r.l.from !== note) {
          note = r.l.from;
          out.push({ section: name, heading: false, note, label: note, detail: "", text: note, folded: false });
        }
        out.push({
          section: name,
          heading: false,
          label: r.label,
          detail: r.detail,
          text: `${r.l.from} ${r.label} ${r.detail}`,
          folded: false,
          link: r.l,
        });
      }
    };
    section("Broken links", p.broken, (l) => l.reason ?? "");
    section("Ambiguous links", p.ambiguous, (l) => `— ${l.candidates.length} notes`);
    // Won by where they're written: a note of the name nearer would take them (code actions name them for sure).
    section("Fragile links", p.fragile, (l) => `— ${l.reason}; [[${l.fix}]] for sure`);
    // Frontmatter (22.2): notes breaking their document type's rules, by note, each finding at its line.
    const fm = frontmatterFindings(this.graph);
    const fmRows = fm
      .flatMap((f) =>
        f.problems.map((x) => ({ path: f.path, line: x.start.line, label: `L${x.start.line}`, detail: x.message })),
      )
      .filter((r) => !q || match(q, `${r.path} ${r.label} ${r.detail}`));
    if (fmRows.length) {
      const folded = !q && this.problemsFolded.has("Frontmatter");
      out.push({
        section: "Frontmatter",
        heading: true,
        label: `Frontmatter (${fm.reduce((n, f) => n + f.problems.length, 0)})`,
        detail: "",
        text: "Frontmatter",
        folded,
      });
      if (!folded) {
        let note = "";
        for (const r of fmRows) {
          if (r.path !== note) {
            note = r.path;
            out.push({
              section: "Frontmatter",
              heading: false,
              note,
              label: note,
              detail: "",
              text: note,
              folded: false,
            });
          }
          out.push({
            section: "Frontmatter",
            heading: false,
            label: r.label,
            detail: r.detail,
            text: `${r.path} ${r.label} ${r.detail}`,
            folded: false,
            frontmatter: { path: r.path, line: r.line },
          });
        }
      }
    }
    // Lint (3.21): the linter's findings over the vault, by note; while it runs, said so.
    if (this.lintCmd || this.vaultLint.issues) {
      const all = this.vaultLint.issues;
      const rows = (all ?? [])
        .map((i) => ({
          i,
          rel: relative(this.loc.root, i.file),
          label: `L${i.line}`,
          detail: `${i.rule} ${i.name}  ${i.description}`,
        }))
        .filter((r) => !q || match(q, `${r.rel} ${r.label} ${r.detail}`));
      if (!q || rows.length) {
        const folded = !q && this.problemsFolded.has("Lint");
        out.push({
          section: "Lint",
          heading: true,
          label: all ? `Lint (${all.length})${this.vaultLint.running ? " …" : ""}` : "Lint — linting…",
          detail: "",
          text: "Lint",
          folded,
        });
        if (!folded) {
          let note = "";
          for (const r of rows) {
            if (r.rel !== note) {
              note = r.rel;
              out.push({ section: "Lint", heading: false, note, label: note, detail: "", text: note, folded: false });
            }
            out.push({
              section: "Lint",
              heading: false,
              label: r.label,
              detail: r.detail,
              text: `${r.rel} ${r.label} ${r.detail}`,
              folded: false,
              lint: r.i,
            });
          }
        }
      }
    }
    // A merge's conflicts (5.12): the files git says are unmerged, each at its first marker.
    const conflicts = [...(this.gitStates ?? [])]
      .filter(([, st]) => st === "conflict")
      .map(([path]) => path)
      .sort();
    const shownConflicts = conflicts.filter((n) => !q || match(q, n));
    if (shownConflicts.length) {
      const folded = !q && this.problemsFolded.has("Conflicts");
      out.push({
        section: "Conflicts",
        heading: true,
        label: `Conflicts (${conflicts.length})`,
        detail: "",
        text: "Conflicts",
        folded,
      });
      if (!folded) {
        for (const path of shownConflicts) {
          const line = conflictLine(join(this.loc.root, path));
          out.push({
            section: "Conflicts",
            heading: false,
            label: path,
            detail: line ? `L${line}` : "",
            text: path,
            folded: false,
            conflict: { path, line: Math.max(1, line) },
          });
        }
      }
    }
    // Orphans (9.5): each a note's row alone.
    const orphans = p.orphans.filter((n) => !q || match(q, n));
    if (!q || orphans.length) {
      const folded = !q && this.problemsFolded.has("Orphans");
      out.push({
        section: "Orphans",
        heading: true,
        label: `Orphans (${p.orphans.length})`,
        detail: "",
        text: "Orphans",
        folded,
      });
      if (!folded)
        for (const n of orphans)
          out.push({ section: "Orphans", heading: false, note: n, label: n, detail: "", text: n, folded: false });
    }
    return out;
  }

  /**
   * A file opened at a line (the Problems panel's All, 1.7): in this window, in a tab — its own, or the one
   * showing it, a place pushed onto that window's history — or in the split's other window.
   */
  private openWhere(rel: string, line: number, where: "here" | "tab" | "split"): void {
    if (where === "tab") {
      const shown = this.tabs.some((t) => t.views.some((v) => v.buf.rel === rel));
      this.openOrSwitchTab(rel);
      if (shown && this.view?.buf.rel === rel) this.pushHistory(this.view);
      return;
    }
    if (where === "split") this.otherWindow();
    this.open(rel, { heading: null, headingIndex: 0, offset: 0, line });
  }

  /** Open a problem's note at it: the line, the cursor on the link. */
  jumpToProblem(l: LinkProblem, where: "here" | "tab" | "split" = "here"): void {
    this.openWhere(l.from, l.line, where);
    const v = this.view;
    if (v && v.buf.rel === l.from) {
      // Rendered, onto the link as drawn (the ones with its target on its line, in order); in source mode, its text.
      const same = this.problemsAt(l.from).filter((x) => x.line === l.line && x.target === l.target);
      const drawn = this.currentLayout(v).links.filter((x) => x.src === l.line && x.target === l.target)[
        Math.max(0, same.indexOf(l))
      ];
      if (drawn && drawn.line >= 0 && !this.currentLayout(v).lines[drawn.line]?.srcMap)
        this.moveCursor(v, { row: drawn.line, col: drawn.col });
      else placeAt(this, v, (v.buf.lineStarts()[l.line - 1] ?? 0) + l.column - 1);
    }
    this.region = "content";
    if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
  }

  /** Open a linter's finding: its note at its line (and column, when it says one). */
  jumpToLint(i: LintIssue, where: "here" | "tab" | "split" = "here"): void {
    this.openAt(relative(this.loc.root, i.file), i.line, i.column ?? 1, where);
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
    if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
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

  /** A Problems row opened — in a tab by default (`enter`, a click), as the explorer opens a note: its problem; a note's
   *  row, the note at its first in that section, of `rows` (the ones shown, so a filter's pick) — an orphan's, the
   *  note. A heading's does nothing. */
  private openProblemRow(row: ProblemRow, rows: ProblemRow[], where: "here" | "tab" | "split" = "tab"): void {
    if (row.conflict) return this.openAt(row.conflict.path, row.conflict.line, 1, where);
    if (row.frontmatter) return this.openAt(row.frontmatter.path, row.frontmatter.line, 1, where);
    if (row.link) return this.jumpToProblem(row.link, where);
    if (row.lint) return this.jumpToLint(row.lint, where);
    if (!row.note || row.heading) return;
    const first = rows.find(
      (r) =>
        r.section === row.section &&
        (r.link?.from === row.note || (r.lint && relative(this.loc.root, r.lint.file) === row.note)),
    );
    if (first?.link) return this.jumpToProblem(first.link, where);
    if (first?.lint) return this.jumpToLint(first.lint, where);
    this.openWhere(row.note, 1, where);
    this.region = "content";
    if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
  }

  /** A note's problems, as the graph has them. */
  private problemsAt(rel: string): LinkProblem[] {
    const p = this.graph.problems();
    return [...p.broken, ...p.ambiguous].filter((x) => x.from === rel);
  }

  /** The panel's All tab's keys (the explorer's keymap): move, go there, fold its sections, filter, close, leave. */
  problemsAction(action: string): void {
    const s = this.problemsPanel.all;
    const rows = this.problemRows();
    const row = rows[s.selected];
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
      case "open_split":
        // As the explorer's keys: enter and l a tab of its own (or the tab showing it), o this window, s the split.
        if (!row) break;
        if (row.heading) {
          if (row.folded) this.problemsFolded.delete(row.section);
          else if (action !== "expand") this.problemsFolded.add(row.section);
        } else this.openProblemRow(row, rows, action === "open" ? "here" : action === "open_split" ? "split" : "tab");
        break;
      case "collapse":
        if (!row) break;
        if (!row.heading) s.selected = rows.findIndex((r) => r.heading && r.section === row.section);
        else this.problemsFolded.add(row.section);
        break;
      case "filter":
        s.filtering = true;
        break;
      case "close":
        this.closeProblems();
        break;
      case "leave":
        this.region = "content";
        break;
      // The explorer's other actions (new, rename…) mean nothing here.
    }
  }

  /** Keys while a tab's filter has them: type, move, go there, clear. */
  private problemsFilterKey(key: string): void {
    const p = this.problemsPanel;
    const s = p.tab === "file" ? p.file : p.all;
    const rows: unknown[] = p.tab === "file" ? this.fileRows() : this.problemRows();
    const typed = keyChar(key);
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        s.filter = "";
        s.filtering = false;
        return;
      case "enter": {
        if (p.tab === "file") {
          const pr = rows[s.selected] as Problem | undefined;
          s.filter = "";
          s.filtering = false;
          if (!pr) return;
          s.selected = Math.max(0, this.fileRows().indexOf(pr));
          return this.showFileProblem(pr, true);
        }
        const all = rows as ProblemRow[];
        // On a heading (rows that came after the typing, a section's git or lint arriving): its first problem.
        let row = all[s.selected];
        if (row?.heading) row = all.slice(s.selected).find((r) => !r.heading) ?? row;
        if (!row) return;
        s.filter = "";
        s.filtering = false;
        return this.openProblemRow(row, all);
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
        s.filter = [...s.filter].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        s.filter = s.filter.replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        s.filter = "";
        break;
      default:
        if (typed === null) return;
        s.filter += typed;
    }
    this.problemsRefiltered();
  }

  /** A tab's filter changed (typed, pasted): the selection to the first problem shown. */
  private problemsRefiltered(): void {
    const p = this.problemsPanel;
    const s = p.tab === "file" ? p.file : p.all;
    s.scroll = 0;
    s.selected =
      p.tab === "file"
        ? 0
        : Math.max(
            0,
            this.problemRows().findIndex((r) => !r.heading),
          );
  }

  // The Info view (3.19): what the file on screen is — where, which vault, its size and dates, its
  // text's counts and state — its properties (the frontmatter), its tags, its links and backlinks.

  /** The Info view's rows, sections folded as the view has them, filtered by `/`. */
  infoRows(): InfoRow[] {
    const q = this.rightView === "info" ? (this.outline.filter ?? "") : "";
    const out: InfoRow[] = [];
    let section: InfoRow | null = null;
    let kept: InfoRow[] = [];
    const flush = () => {
      if (section && (!q || kept.length)) out.push(section, ...(section.folded ? [] : kept));
      kept = [];
    };
    for (const r of this.infoData()) {
      if (r.heading) {
        flush();
        section = { ...r, folded: !q && this.infoFolded.has(r.section) };
      } else if (!q || match(q, r.text)) kept.push({ ...r, folded: false });
    }
    flush();
    return out;
  }

  /** The rows' data, for the file on screen: made again when its text, or the notes', change. */
  private infoData(): Omit<InfoRow, "folded">[] {
    const view = this.view;
    if (!view) return [];
    const b = view.buf;
    const key = `${b.key}:${b.version}:${this.graph.generation}:${b.dirty}:${b.deleted}:${!!b.parsing}`;
    if (this.infoCache?.key === key) return this.infoCache.rows;
    const rows: Omit<InfoRow, "folded">[] = [];
    const head = (section: string) =>
      rows.push({ section, heading: true, key: section, value: "", depth: 0, text: section });
    const row = (section: string, k: string, value: string, act?: InfoRow["act"], depth = 0) =>
      rows.push({ section, heading: false, key: k, value, depth, text: `${k} ${value}`, act: act ?? { copy: value } });
    const entry = b.rel ? this.graph.entry(b.rel) : undefined;
    const note = b.kind.group === "note";
    // The file.
    head("File");
    row("File", "path", b.rel ?? b.abs, { copy: b.abs });
    row(
      "File",
      "root",
      this.loc.mode === "folder" ? `none — the plain folder ${tildePath(this.loc.root)}` : rootLabel(this.loc),
      { copy: this.loc.root },
    );
    row(
      "File",
      "kind",
      note ? `note (${b.kind.format})` : `${b.kind.group === "data" ? "data" : "text"} (${b.kind.format})`,
    );
    if (b.stamp) {
      const size = b.stamp.size;
      row(
        "File",
        "size",
        size < 1024
          ? `${size} bytes`
          : size < 1048576
            ? `${(size / 1024).toFixed(1)} KB`
            : `${(size / 1048576).toFixed(1)} MB`,
      );
      row("File", "modified", new Date(b.stamp.mtimeMs).toLocaleString());
    }
    const words = b.words();
    row(
      "File",
      "words",
      note
        ? `${words.toLocaleString("en")} (~${Math.max(1, Math.round(words / 230))} min)`
        : words.toLocaleString("en"),
    );
    row("File", "lines", b.lineStarts().length.toLocaleString("en"));
    row(
      "File",
      "encoding",
      [b.invalidUtf8 ? "invalid UTF-8" : "UTF-8", b.eol === "\r\n" ? "CRLF" : "LF", ...(b.bom ? ["BOM"] : [])].join(
        ", ",
      ),
    );
    // How it's indented (25.1), and where that was found.
    const ind = b.indent();
    const said =
      ind.from === "editorconfig" ? ".editorconfig" : ind.from === "file" ? "as the file is" : "its language's";
    const onSave = [ind.trimTrailing ? "trailing whitespace trimmed" : "", ind.finalNewline ? "a final newline" : ""]
      .filter(Boolean)
      .join(", ");
    row(
      "File",
      "indent",
      `${ind.tabs ? `tabs, ${ind.tabWidth} wide` : `${ind.size} spaces`} (${said})${onSave ? `; on save: ${onSave}` : ""}`,
    );
    row(
      "File",
      "state",
      b.deleted
        ? "deleted on disk"
        : b.conflictKept
          ? "unsaved — differs from disk"
          : b.dirty
            ? "unsaved changes"
            : "saved",
    );
    // Its properties: the frontmatter, nested maps under their keys.
    // Parsing on other threads (15.1): the properties and tasks when it's done.
    const parsed = note && !b.parsing ? b.parsed : null;
    const fm = parsed ? parsed.frontmatter : null;
    if (fm) {
      head("Properties");
      const lines = fm.raw.split("\n");
      const lineOf = (k: string, from: number) => {
        const re = new RegExp(`^\\s*\\[?\\s*["']?${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*(\\]|[:=])`);
        const i = lines.findIndex((l, n) => n >= from && re.test(l));
        return i < 0 ? -1 : i;
      };
      const walk = (obj: Record<string, unknown>, depth: number, from: number) => {
        for (const [k, v] of Object.entries(obj)) {
          const at = lineOf(k, from);
          const act = at >= 0 ? { line: at + 2 } : undefined;
          if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            row("Properties", k, "", act, depth);
            walk(v as Record<string, unknown>, depth + 1, Math.max(from, at));
          } else {
            const shown = Array.isArray(v)
              ? v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
              : v instanceof Date
                ? v.toISOString().slice(0, 10)
                : String(v);
            row("Properties", k, shown, act, depth);
          }
        }
      };
      if (fm.error) row("Properties", "error", fm.error, { line: 1 });
      else if (fm.data) walk(fm.data, 0, 0);
    }
    // Its tags.
    const tags = entry?.tags ?? [];
    if (tags.length) {
      head("Tags");
      for (const t of tags) row("Tags", `#${t}`, "", { tag: t });
    }
    // What it links to and what links to it.
    head("Links");
    const links = b.rel ? this.graph.linksOf(b.rel) : [];
    const broken = links.filter((l) => l.resolvedKind === "unresolved").length;
    row("Links", "links", `${links.length}${broken ? ` (${broken} unresolved)` : ""}`, { run: "links.open" });
    row("Links", "backlinks", String(b.rel ? this.graph.backlinks(b.rel).length : 0), { run: "backlinks.open" });
    row("Links", "headings", String(this.currentLayout(view).headings.length), { run: "outline.toggle" });
    if (note) {
      row("Links", "footnotes", String(this.footnotes().length), { run: "footnotes.toggle" });
      const tasks = parsed ? listTasks(parsed.tree) : [];
      if (tasks.length) row("Links", "tasks", `${tasks.filter((t) => t.checked).length} of ${tasks.length} done`);
      // How the links slipbox makes here look (21.4), and what said so (every note read, as for the
      // backlinks) — short, for a narrow panel: `y` copies it whole, as `slipbox info` says it.
      const c = conventionOf(this.graph, this.config, this.configOrigins);
      const copy = { copy: describeConvention(c) };
      const by = (p: ConventionPart<string>) =>
        p.source === "setting"
          ? "setting"
          : p.source === "tool"
            ? c.tool === "obsidian"
              ? "Obsidian"
              : "zk"
            : p.source === "notes"
              ? `notes ${p.share}%`
              : "ours";
      const one = new Set([c.style, c.path, c.extension].map(by)).size === 1;
      const shown = (value: string, p: ConventionPart<string>) => (one ? value : `${value} (${by(p)})`);
      row("Links", "writes", shown(c.style.value === "wiki" ? "wikilinks" : "markdown", c.style), copy);
      row(
        "Links",
        "path",
        shown({ relative: "relative", root: "from the root", name: "by name" }[c.path.value], c.path),
        copy,
        1,
      );
      row("Links", ".md", shown(c.extension.value, c.extension), copy, 1);
      if (one) row("Links", "from", by(c.style), copy, 1);
    }
    this.infoCache = { key, rows };
    return rows;
  }

  /** `enter` on an Info row: a property's line, a tag's notes, a list or view, else its value copied. */
  openInfoRow(row: InfoRow): void {
    if (row.heading) {
      // This row's section, whatever is selected (from the filter, the rows it's among are gone).
      if (!this.infoFolded.delete(row.section)) this.infoFolded.add(row.section);
      this.outline.selected = Math.max(
        0,
        this.infoRows().findIndex((r) => r.heading && r.section === row.section),
      );
      return;
    }
    const act = row.act;
    const view = this.view;
    if (!act || !view) return;
    if ("tag" in act) return this.openTagNotes(act.tag);
    if ("run" in act) {
      this.region = "content";
      return void this.run(act.run);
    }
    if ("line" in act) {
      this.pushHistory(view);
      placeAt(this, view, view.buf.lineStarts()[act.line - 1] ?? 0);
      this.region = "content";
      if (this.narrow || this.ui.zen) this.outline.overlay = false;
      return;
    }
    this.copy(act.copy);
  }

  /** The Info view's keys (the outline's keymap, and `y`): move, open, fold its sections, filter, copy. */
  infoAction(action: string): void {
    this.outline.pinned = false;
    if (action === "filter") {
      this.outline.filtering = true;
      return;
    }
    const rows = this.infoRows();
    const row = rows[this.outline.selected];
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
        if (row) this.openInfoRow(row);
        break;
      case "fold":
        if (!row) break;
        if (!row.heading) this.outline.selected = rows.findIndex((r) => r.heading && r.section === row.section);
        else this.infoFolded.add(row.section);
        break;
      case "unfold":
        if (row?.heading) this.infoFolded.delete(row.section);
        break;
      case "copy":
        if (row && !row.heading) this.copy(row.act && "copy" in row.act ? row.act.copy : row.value);
        break;
      case "edit":
        return this.openPropertiesEditor();
      case "close":
        this.showOutline(false);
        break;
      case "leave":
        this.region = "content";
        if (this.narrow || this.ui.zen) this.outline.overlay = false;
        break;
      default:
        this.message("error", `unknown Info action: ${action}`);
    }
  }

  // Adding and changing footnotes (3.18): the edits core/footnotes.ts makes, to the buffer as one
  // undo step, then saved — as a task's tick is.

  /**
   * Where a new footnote's `[^N]` goes: while typing, at the cursor; else after the word the cursor
   * is on (on a sign, after the sign). A rendered row maps to its source only by line, so there the
   * word is found in its paragraph's source by how many times it came before; never inside a link's
   * or code's syntax (after it instead).
   */
  footnoteRefAt(view: View): number {
    const buf = view.buf;
    const src = buf.source;
    const layout = this.currentLayout(view);
    const line = layout.lines[view.cur.row];
    const word = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);
    // Out of `[[…]]`, `[…](…)` and `` `…` ``: to their end.
    const outOfSyntax = (at: number, from: number, to: number) => {
      for (const m of src.slice(from, to).matchAll(/!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`/g)) {
        const s = from + m.index;
        if (at > s && at < s + m[0].length) return s + m[0].length;
      }
      return at;
    };
    const starts = buf.lineStarts();
    if (line?.srcMap) {
      const at = offsetOf(this, view);
      if (view.insert) return at;
      let end = at;
      // Never past a line's end: a CRLF note's blank line has the cursor on its CR.
      if (word(src[end])) while (word(src[end])) end++;
      else if (end < src.length && src[end] !== "\n" && src[end] !== "\r") end++;
      const ls = starts[line.src - 1] ?? 0;
      const nl = src.indexOf("\n", ls);
      return outOfSyntax(end, ls, nl < 0 ? src.length : src[nl - 1] === "\r" ? nl - 1 : nl);
    }
    // A rendered row: the paragraph's rows up to the cursor's, and its source lines.
    const rowText = (r: number) => layout.lines[r]?.spans.map((s) => s.text).join("") ?? "";
    let first = view.cur.row;
    while (
      first > 0 &&
      rowText(first - 1).trim() &&
      !layout.lines[first - 1]!.srcMap &&
      !layout.lines[first - 1]!.decor
    )
      first--;
    const blockStart = starts[(layout.lines[first]?.src ?? line?.src ?? 1) - 1] ?? 0;
    const blank = /\r?\n[ \t]*\r?\n/g;
    blank.lastIndex = blockStart;
    const blockEnd = blank.exec(src)?.index ?? src.replace(/\s+$/, "").length;
    const text = rowText(view.cur.row);
    // The cursor's column as an index into the row's text.
    let idx = 0;
    for (let w = 0; idx < text.length && w + stringWidth(text[idx]!) <= view.cur.col; idx++)
      w += stringWidth(text[idx]!);
    if (!word(text[idx])) while (idx > 0 && !word(text[idx])) idx--;
    let ws = idx;
    let we = idx;
    while (ws > 0 && word(text[ws - 1])) ws--;
    while (we < text.length && word(text[we])) we++;
    const w = text.slice(ws, we);
    if (!w || !word(w[0])) return blockEnd;
    const whole = (s: string) => [
      ...s.matchAll(
        new RegExp(`(?<![\\p{L}\\p{N}_])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu"),
      ),
    ];
    let k = 0;
    for (let r = first; r < view.cur.row; r++) k += whole(rowText(r)).length;
    k += whole(text.slice(0, ws)).length;
    const hits = whole(src.slice(blockStart, blockEnd));
    const hit = hits[k] ?? hits[hits.length - 1];
    return hit ? outOfSyntax(blockStart + hit.index + w.length, blockStart, blockEnd) : blockEnd;
  }

  /** The edits made to the current note as one undo step, then saved; `done` said when they are. */
  applyNoteEdits(edits: TextEdit[], done: string, cursorAfter?: number): void {
    const view = this.view;
    if (!view) return;
    const buf = view.buf;
    // Asked again when it's made: the file can go while a question is open.
    const why = cannotEdit(view);
    if (why) return this.message("warn", `${why} — not editing`);
    const before = view.cur;
    buf.beginStep(offsetOf(this, view));
    const order = edits.map((e, i) => ({ e, i })).sort((a, b) => b.e.at - a.e.at || b.i - a.i);
    // The edits' new lines (`\n`) as the note's own: a CRLF note stays CRLF.
    for (const { e } of order) buf.edit(e.at, e.length, buf.eol === "\n" ? e.text : e.text.replace(/\r?\n/g, buf.eol));
    buf.endStep(cursorAfter ?? offsetOf(this, view));
    for (const v of this.allViews()) if (v.buf === buf) v.layoutKey = "";
    // Where the cursor was: in source mode, past what was typed before it; rendered, its row.
    if (cursorAfter !== undefined && this.currentLayout(view).lines[before.row]?.srcMap)
      placeAt(this, view, cursorAfter);
    if (this.saveBuffer(buf, true)) this.message("info", done);
    // Any other failure has said why already.
    else if (buf.changedOnDisk() && !buf.deleted)
      this.message("warn", `${done} — not saved yet (the file changed on disk: space n w decides)`);
  }

  /** Whether the current window's note can have footnotes changed: a markdown note of this vault. */
  private footnoteNote(): boolean {
    const view = this.view;
    if (view?.buf.kind.group !== "note" || view.buf.rel === null) {
      this.message("info", "footnotes are in this root's notes");
      return false;
    }
    // Deleted on disk, or not valid UTF-8: not edited (its save would bring it back, or change bytes).
    const why = cannotEdit(view);
    if (why) this.message("warn", `${why} — not editing`);
    return !why;
  }

  /**
   * A second copy of this folder seen (21.6): which one links to its name open — asked once, the
   * answer remembered; dismissed, the first found stays, and it isn't asked again.
   */
  askDefaultCopy(): void {
    const ident = this.loc.mode === "vault" ? folderIdentity(this.loc.root) : null;
    const f = ident ? readFolders().find((x) => x.key === ident.key) : undefined;
    const here = f?.copies.filter((c) => copyAvailable(c.path)) ?? [];
    if (!f?.ask || here.length < 2) return;
    this.openList({
      title: `${f.name}: ${here.length} copies on this machine — which do links to it open?`,
      items: here.map((c) => ({
        label: tildePath(c.path),
        hint: c.path === f.default ? "links open it now" : undefined,
        data: c.path,
      })),
      selected: Math.max(
        0,
        here.findIndex((c) => c.path === f.default),
      ),
      filterable: false,
      accept: (item) => {
        setDefaultCopy(f.key, item.data as string);
        this.message("info", `links to ${f.name} open ${tildePath(item.data as string)}`);
      },
      cancel: () => setDefaultCopy(f.key, null),
    });
  }

  /**
   * The link picker (21.5): a note or file of this root picked, and a link to it written at the
   * cursor as the root's convention writes one — typing, where the cursor is; reading, after the word
   * under it (out of a link or code span), as a footnote's reference goes — then saved.
   */
  insertLink(view: View): void {
    const why =
      view.buf.kind.group !== "note" || view.buf.rel === null
        ? "links are written in this folder's notes"
        : cannotEdit(view);
    if (why) return this.message("info", why);
    const g = this.graph;
    const version = view.buf.version;
    const rels = [...g.notes.keys(), ...g.filePaths()].filter((r) => r !== view.buf.rel).sort();
    this.openList({
      title: "Link to…",
      items: rels.map((r) => ({ label: r, data: r })),
      accept: (item) => {
        if (view.buf.version !== version)
          return this.message("warn", "the note changed while you picked: insert the link again");
        // A pointer by a name different folders share asks first; a private one is said (D74, D83).
        this.writeLinkAsked(view.buf.abs, g.abs(item.data as string), (ends) => {
          if (view.buf.version !== version)
            return this.message("warn", "the note changed while you picked: insert the link again");
          const c = conventionOf(g, this.config, this.configOrigins);
          const title = ends.to.note ? (g.entry(item.data as string)?.title ?? "") : "";
          const link = writeLink(
            c,
            c.style.value,
            ends,
            c.style.value === "wiki" ? "" : title || posix.basename(item.data as string),
          );
          if (view.insert) {
            insertText(this, view, link);
            return this.message("info", `linked ${item.data as string}`);
          }
          const at = this.footnoteRefAt(view);
          const before = view.buf.source[at - 1];
          const text = `${before && !/\s/.test(before) ? " " : ""}${link}`;
          this.applyNoteEdits([{ at, length: 0, text }], `linked ${item.data as string}: ${link}`, at + text.length);
        });
      },
    });
  }

  /**
   * A link about to be written from `fromAbs` to `toAbs` (21.5), its ends worked out now. A pointer by a name different
   * folders share asks first (D74, D83): rename one of them — `slipbox name`'s rename, the parent folder's name
   * prefixed as a suggestion, previewed — and the link is written once that's done, by the name it has then; or
   * write the qualified name, or, with none, the short one, which asks which when followed. Esc writes nothing. A
   * private name, once written, is said: the pointer works on this machine only.
   */
  writeLinkAsked(fromAbs: string, toAbs: string, write: (ends: LinkEnds) => void): void {
    const ends = linkEnds(this.graph, fromAbs, toAbs);
    const n = ends.pointer ? ends.naming : null;
    const done = () => {
      write(ends);
      const priv = n ? privateNameWarning(n) : null;
      if (priv) this.message("warn", priv);
    };
    if (!n?.clash.length) return done();
    const items: ListItem[] = [
      n.name !== n.short
        ? { label: `Write it by its qualified name, ${n.name}`, detail: ends.pointer!, data: null }
        : { label: `Write it by ${n.short} as it is`, detail: "followed, it asks which folder is meant", data: null },
    ];
    // Renaming one that has it as its name, a `.slipbox/` one: the folder linked to, or another (an alias stays).
    const there = findVaultRoot(toAbs);
    const named = n.clash
      .filter((f) => f.name.toLowerCase() === n.short.toLowerCase())
      .map((f) => ({ name: f.name, at: f.default ?? f.copies[0]?.path }));
    for (const f of [...(there ? [{ name: n.short, at: there }] : []), ...named]) {
      if (f.at && hasMarker(f.at))
        items.push({
          label: `Rename ${tildePath(f.at)}'s name first…`,
          detail: `${f.name} → ${slugName(posix.basename(posix.dirname(f.at)))}-${f.name}`,
          data: f,
        });
    }
    this.openList({
      title: `${n.short}: ${n.clash.length + 1} different folders have this name — how is the link written?`,
      items,
      filterable: false,
      accept: (item) => {
        const f = item.data as { name: string; at: string } | null;
        if (!f) return done();
        this.prompt(`rename ${f.name} at ${tildePath(f.at)} to: `, (typed) => {
          if (!typed.trim()) return;
          this.previewRename(
            () => planVaultRename(rootAt(f.at), typed.trim()),
            (plan) => {
              this.applyRename(plan);
              this.writeLinkAsked(fromAbs, toAbs, write);
            },
          );
        });
        if (this.overlay?.kind === "prompt")
          this.overlay.text = `${slugName(posix.basename(posix.dirname(f.at)))}-${f.name}`;
      },
    });
  }

  /** Add a footnote (3.18): its text asked; `[^N]` after the cursor's word, `[^N]: text` at the end. */
  addFootnote(): void {
    if (!this.footnoteNote()) return;
    const view = this.view!;
    const at = this.footnoteRefAt(view);
    const version = view.buf.version;
    this.prompt("Add a footnote — its text:", (text) => {
      if (!text.trim()) return;
      if (view.buf.version !== version)
        return this.message("warn", "the note changed while you typed: add the footnote again");
      const r = addFootnote(view.buf.source, this.footnotes(), at, text);
      this.applyNoteEdits(r.edits, `added footnote [^${r.label}]`, at + `[^${r.label}]`.length);
    });
  }

  private editFootnoteRow(row: FootnoteRow): void {
    if (!this.footnoteNote()) return;
    const fn = row.fn;
    if (!fn.def) return this.message("warn", `footnote [^${fn.label}] has no definition to edit`);
    this.prompt(`Footnote [^${fn.label}] — its text:`, (text) => {
      if (!text.trim() || text.trim() === fn.text) return;
      const now = this.footnotes().find((f) => f.id === fn.id);
      if (!now) return this.message("warn", `footnote [^${fn.label}] isn't there any more`);
      this.applyNoteEdits(editFootnote(this.view!.buf.source, now, text), `edited footnote [^${fn.label}]`);
    });
    if (this.overlay?.kind === "prompt") this.overlay.text = fn.text ?? "";
  }

  private deleteFootnoteRow(row: FootnoteRow): void {
    if (!this.footnoteNote()) return;
    const fn = row.fn;
    const n = fn.references.length;
    this.confirm(`Delete footnote [^${fn.label}]: its definition and ${n} reference${n === 1 ? "" : "s"}?`, () => {
      const now = this.footnotes().find((f) => f.id === fn.id);
      if (!now) return this.message("warn", `footnote [^${fn.label}] isn't there any more`);
      this.applyNoteEdits(deleteFootnote(this.view!.buf.source, now), `deleted footnote [^${fn.label}]`);
    });
  }

  private renameFootnoteRow(row: FootnoteRow): void {
    if (!this.footnoteNote()) return;
    const fn = row.fn;
    this.prompt(`Rename footnote [^${fn.label}] to:`, (text) => {
      const label = text.trim().replace(/^\[\^|\]$/g, "");
      if (!label || label === fn.label) return;
      const list = this.footnotes();
      const now = list.find((f) => f.id === fn.id);
      if (!now) return this.message("warn", `footnote [^${fn.label}] isn't there any more`);
      let edits: TextEdit[];
      try {
        edits = renameFootnote(this.view!.buf.source, now, list, label);
      } catch (err) {
        return this.message("warn", (err as Error).message);
      }
      this.applyNoteEdits(edits, `renamed footnote [^${fn.label}] → [^${label}]`);
    });
    if (this.overlay?.kind === "prompt") this.overlay.text = fn.label;
  }

  /** The footnotes view's keys (the outline's keymap): move, jump, fold its references, filter, close, leave. */
  footnoteAction(action: string): void {
    this.outline.pinned = false;
    if (action === "filter") {
      this.outline.filtering = true;
      return;
    }
    const rows = this.footnoteRows();
    const row = rows[this.outline.selected];
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
        if (row) this.jumpToFootnote(row);
        break;
      case "fold":
        if (!row) break;
        // A reference: to its footnote; a footnote: its references folded.
        if (row.ref) this.outline.selected = rows.findIndex((r) => r.fn === row.fn && !r.ref);
        else this.footnotesOpen.delete(row.fn.id);
        break;
      case "unfold":
        if (row?.hasChildren) this.footnotesOpen.add(row.fn.id);
        break;
      case "add":
        return this.addFootnote();
      case "edit":
      case "delete":
      case "rename":
        if (!row) return this.message("info", "no footnote selected");
        return action === "edit"
          ? this.editFootnoteRow(row)
          : action === "delete"
            ? this.deleteFootnoteRow(row)
            : this.renameFootnoteRow(row);
      case "close":
        this.showOutline(false);
        break;
      case "leave":
        this.region = "content";
        if (this.narrow || this.ui.zen) this.outline.overlay = false;
        break;
      default:
        this.message("error", `unknown footnotes action: ${action}`);
    }
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
    const mode = this.sidebar.allFiles ? "all" : this.filesShown();
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    const out: { path: string; group: FileGroup }[] = [];
    for (const path of this.graph.filePaths()) {
      const { group } = classify(path, this.config.walk.extensions);
      if (group === "binary" || excl?.ignores(path)) continue;
      if (incl?.ignores(path) || mode === "all" || (mode === "renderable" && group === "data"))
        out.push({ path, group });
    }
    return out;
  }

  /** A root's name beside its folder's, when it has another one; a worktree's, its branch (17.19). */
  private rootName(abs: string): string | undefined {
    const n = readIdentity(vaultConfigFile(abs)).name;
    const name = n && n !== basename(abs) ? n : undefined;
    // A worktree of a repository (17.19): its branch beside it — every worktree has the
    // repository's name, so the branch is what tells them apart.
    const c = checkoutOf(abs);
    if (!c?.worktree) return name;
    const h = headOf(c);
    return `${this.glyphs.branch} ${h.branch ?? h.commit?.slice(0, 7) ?? c.worktree}`;
  }

  /**
   * What `files.show` lists here: `auto` — notes and data files in a notes root (one with `.slipbox/`),
   * every text file anywhere else (a repository, where code lives; a plain folder).
   */
  filesShown(): "notes" | "renderable" | "all" {
    const show = this.config.files.show;
    if (show !== "auto") return show;
    return this.loc.mode === "vault" && hasMarker(this.loc.root) ? "renderable" : "all";
  }

  /**
   * The tree's folders that are roots of their own (17.13): vaults and repositories nested in this
   * one; in a loose folder, every folder in it — each a root, or a loose folder to go into.
   */
  private rootRows(): Map<string, NonNullable<TreeRow["root"]>> {
    const out = new Map<string, NonNullable<TreeRow["root"]>>();
    const named = (abs: string) => this.rootName(abs);
    if (!isListed(this.loc)) {
      for (const s of this.graph.skipped) {
        if (s.reason !== "nested root") continue;
        const abs = join(this.loc.root, s.rel);
        out.set(s.rel, { kind: "vault", abs, name: named(abs) });
      }
      return out;
    }
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(this.loc.root, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const abs = join(this.loc.root, e.name);
      out.set(e.name, isVaultRoot(abs) ? { kind: "vault", abs, name: named(abs) } : { kind: "folder", abs });
    }
    return out;
  }

  treeRows(): TreeRow[] {
    // The folders of files open beside this root come and go with their tabs (21.9).
    const beside = `${this.besideRoots().join("\n")}\n${this.explorerTop}`;
    if (this.tree && this.treeBeside === beside) return this.tree;
    this.treeBeside = beside;
    const R = this.loc.root;
    const T = this.explorerTop;
    const rows: TreeRow[] = [];
    // `..` (17.14): the explorer up a folder — no fence at the root, up to `/`.
    if (dirname(T) !== T)
      rows.push({ kind: "root", path: "..", name: "..", depth: 0, root: { kind: "folder", abs: dirname(T) } });
    if (T === R) rows.push(...this.rootTree());
    else if (isInside(R, T)) {
      // A folder of the root: its rows, from it.
      const sub = relative(R, T).split(sep).join("/");
      const d = sub.split("/").length;
      for (const r of this.rootTree()) if (r.path.startsWith(`${sub}/`)) rows.push({ ...r, depth: r.depth - d });
    } else this.outsideRows(T, 0, rows);
    // The explorer's other roots (20.15), each by its name, unfolded on a key; their rows are theirs —
    // those in the folder climbed to are there already.
    for (const abs of this.otherRoots()) {
      if (!isInside(R, T) && isInside(T, abs)) continue;
      const vault = isVaultRoot(abs);
      const name = vault ? (this.reach?.vaultOf(abs) ?? basename(abs)) : tildePath(abs);
      rows.push({
        kind: "root",
        path: abs,
        name,
        depth: 0,
        root: { kind: vault ? "vault" : "folder", abs, name, other: true },
      });
      if (vault && this.expanded.has(abs)) this.otherRootRows(abs, rows);
    }
    this.tree = rows;
    return rows;
  }

  /**
   * A folder above the root open, listed a level at a time (never walked): its folders — the root
   * open marked, its tree under it while unfolded; other roots by their icon and name — then its files,
   * as `files.show` would list them in their root.
   */
  private outsideRows(dir: string, depth: number, out: TreeRow[]): void {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const R = this.loc.root;
    const byName = (a: Dirent, b: Dirent) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const isDir = (e: Dirent) => {
      if (e.isDirectory()) return true;
      if (!e.isSymbolicLink()) return false;
      try {
        return statSync(join(dir, e.name)).isDirectory();
      } catch {
        return false;
      }
    };
    const shown = entries.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules");
    for (const e of shown.filter(isDir).sort(byName)) {
      const abs = join(dir, e.name);
      if (abs === R) {
        out.push({
          kind: "root",
          path: R,
          name: e.name,
          depth,
          root: { kind: this.loc.mode, abs: R, name: this.rootName(R), here: true },
        });
        if (this.expanded.has(R)) for (const r of this.rootTree()) out.push({ ...r, depth: r.depth + depth + 1 });
        continue;
      }
      if (isVaultRoot(abs))
        out.push({
          kind: "root",
          path: abs,
          name: e.name,
          depth,
          root: { kind: "vault", abs, name: this.rootName(abs) },
          outside: true,
        });
      else out.push({ kind: "dir", path: abs, name: e.name, depth, outside: true });
      if (this.expanded.has(abs)) this.outsideRows(abs, depth + 1, out);
    }
    // Its files as their root lists them: auto, every text file but in a notes root.
    const show = this.sidebar.allFiles ? "all" : this.config.files.show;
    const own = findVaultRoot(dir);
    const mode = show === "auto" ? (own && hasMarker(own) ? "renderable" : "all") : show;
    for (const e of shown.filter((e) => !isDir(e) && (e.isFile() || e.isSymbolicLink())).sort(byName)) {
      const abs = join(dir, e.name);
      const { group } = classify(abs, this.config.walk.extensions);
      if (group === "binary" || (group !== "note" && (mode === "notes" || (mode === "renderable" && group !== "data"))))
        continue;
      out.push({ kind: "note", path: abs, name: e.name, depth, outside: true, ...(group !== "note" ? { group } : {}) });
    }
  }

  /** The explorer's top to `dir`, the folders down to it unfolded (inside the root, by their paths there). */
  setExplorerTop(dir: string): void {
    const R = this.loc.root;
    this.explorerTop = dir;
    if (dir !== R && isInside(R, dir)) {
      const parts = relative(R, dir).split(sep);
      for (let i = 1; i <= parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    }
    this.invalidateTree();
  }

  /**
   * `..` (17.14): the explorer up a folder — past the root too, to `/`. The folder it showed stays in
   * the tree, unfolded and selected (the root open marked).
   */
  explorerUp(): void {
    const R = this.loc.root;
    const from = this.explorerTop;
    const up = dirname(from);
    if (up === from) return;
    this.explorerTop = up;
    const inside = from !== R && isInside(R, from);
    this.expanded.add(inside ? relative(R, from).split(sep).join("/") : from);
    this.invalidateTree();
    const key = inside ? relative(R, from).split(sep).join("/") : from;
    this.sidebar.selected = Math.max(
      0,
      this.explorerRows().findIndex((r) => r.path === key),
    );
    this.sidebar.scroll = 0;
  }

  /** The root's own tree: its folders, notes and files, and the roots in it (17.13). */
  private rootTree(): TreeRow[] {
    const rows: TreeRow[] = [];
    const groups = new Map(this.shownFiles().map((f) => [f.path, f.group]));
    // The walk's folders too, so one with nothing listed in it (just made, or holding only files
    // the explorer leaves out) is still there to open and to create in.
    const folders = new Set(this.graph.dirs.filter((d) => d));
    const roots = this.rootRows();
    const paths = [...this.graph.notes.keys(), ...groups.keys(), ...folders, ...roots.keys()].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1 && !folders.has(a) && !roots.has(a);
        const lastB = i === db.length - 1 && !folders.has(b) && !roots.has(b);
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
      if (visible && roots.has(p))
        rows.push({
          kind: "root",
          path: p,
          name: parts[parts.length - 1]!,
          depth: parts.length - 1,
          root: roots.get(p)!,
        });
      else if (visible && !folders.has(p))
        rows.push({
          kind: "note",
          path: p,
          name: parts[parts.length - 1]!,
          depth: parts.length - 1,
          ...(groups.has(p) ? { group: groups.get(p) } : {}),
        });
    }
    return rows;
  }

  invalidateTree(): void {
    this.tree = null;
  }

  // -------------------------------------------------------------------------------------------
  // The explorer's roots (20.15)

  /** The vault or folder slipbox was opened on: always one of the explorer's roots. */
  readonly mainRoot: string;
  /** Roots kept beside it (`:pin-root`), with the opened vault's state. */
  readonly pinnedRoots: Set<string>;
  /** The opened vault's state key: where the pinned roots are kept. */
  private readonly mainKey: string;

  private pinnedRootsFile(): string {
    return join(stateDir({ key: this.mainKey }), "roots.json");
  }

  /**
   * The explorer's other roots, beside the root open (20.15, 21.9): the one opened, those pinned, and
   * the folders of files open beside it. A root followed into is the root open while it is; left, it
   * goes unless pinned. Never overlapping: one inside the root open, or around it, isn't listed apart —
   * its folder is in the tree, or the tree is in it.
   */
  otherRoots(): string[] {
    const here = this.loc.root;
    const out: string[] = [];
    for (const r of [this.mainRoot, ...this.pinnedRoots, ...this.besideRoots()]) {
      if (out.includes(r) || r === here || isInside(here, r) || isInside(r, here) || !existsSync(r)) continue;
      if (out.some((o) => isInside(o, r) || isInside(r, o))) continue;
      out.push(r);
    }
    return out;
  }

  private treeBeside = "";
  private besideOf = new Map<string, string>();

  /**
   * The folders of the files open beside this root (21.9: a loose file a link was followed to, one
   * opened by its path): each one's nearest root, else its folder — while a file of it is open. Never
   * the scratch's (slipbox's own state folder, by default) nor a virtual buffer's.
   */
  private besideRoots(): string[] {
    const here = this.loc.root;
    const scratch = this.scratch().path;
    const out: string[] = [];
    for (const t of this.tabs) {
      for (const v of t.views) {
        const abs = v.buf.abs;
        if (isInside(here, abs) || abs === scratch || v.buf.virtual) continue;
        let r = this.besideOf.get(abs);
        if (r === undefined) this.besideOf.set(abs, (r = findVaultRoot(abs) ?? dirname(abs)));
        if (!out.includes(r)) out.push(r);
      }
    }
    return out;
  }

  /** Keep the root open among the explorer's roots, or no longer (`:pin-root`). */
  togglePinnedRoot(): void {
    const r = this.loc.root;
    if (r === this.mainRoot) return this.message("info", "the folder slipbox was opened on is always a root");
    if (this.pinnedRoots.has(r)) this.pinnedRoots.delete(r);
    else this.pinnedRoots.add(r);
    this.saveRoots();
    this.invalidateTree();
    this.message(
      "info",
      this.pinnedRoots.has(r)
        ? `${this.vaultLabel(this.loc)}: a root of the explorer from now on`
        : `${this.vaultLabel(this.loc)}: no longer kept as a root`,
    );
  }

  private saveRoots(): void {
    try {
      ensureDir(stateDir({ key: this.mainKey }));
      writeJson(this.pinnedRootsFile(), [...this.pinnedRoots]);
    } catch {}
  }

  /** Another root's rows (20.15): its notes and files as its index has them, its folders as unfolded. */
  private otherRootRows(abs: string, rows: TreeRow[]): void {
    const g = this.reach?.graphAt(abs) ?? null;
    if (!g) return;
    const paths = [...g.notes.keys(), ...g.filePaths()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    const seen = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      let visible = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = `${abs}/${parts.slice(0, i + 1).join("/")}`;
        if (!seen.has(dir)) {
          seen.add(dir);
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i + 1, under: abs });
        }
        if (!this.expanded.has(dir)) {
          visible = false;
          break;
        }
      }
      if (visible)
        rows.push({
          kind: "note",
          path: `${abs}/${p}`,
          name: parts[parts.length - 1]!,
          depth: parts.length,
          under: abs,
        });
    }
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
      if (!match(q, row)) continue;
      const parts = row.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (seen.has(dir)) continue;
        seen.add(dir);
        rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i });
      }
      const group = this.graph.notes.has(row) ? undefined : classify(row, this.config.walk.extensions).group;
      rows.push({
        kind: "note",
        path: row,
        name: parts[parts.length - 1]!,
        depth: parts.length - 1,
        ...(group ? { group } : {}),
      });
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
    const v = this.tabView; // the window's, never a floating one's
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
    // Notes read in this vault, in other windows and tabs and in earlier sessions: the history of
    // more than this window, newest first.
    const inTimeline = new Set(timeline.map((l) => l.key));
    const recent: HistoryRow[] = this.readNotes()
      .filter((r) => !inTimeline.has(r.key))
      .slice(0, this.config.ui.history_limit)
      .map((r) => ({
        label: r.key.split("/").pop()!,
        path: r.key,
        hint: r.hint,
        index: -1,
        here: false,
        recent: r.key,
      }));
    const q = this.sidebar.filter ?? "";
    const mine = q ? rows.filter((r) => match(q, r.path)) : rows;
    const others = q ? recent.filter((r) => match(q, r.path)) : recent;
    return others.length
      ? [...mine, { label: "recent here", path: "", hint: "", index: -1, here: false, heading: true }, ...others]
      : mine;
  }

  /**
   * The notes read in this vault, newest first, each with its hint: opened this session, every
   * open tab's, and every note with a reading position (earlier sessions: `positions.json`, what
   * `slipbox history` lists). A note open in another tab says which.
   */
  private readNotes(): { key: string; hint: string }[] {
    const when = new Map<string, number>();
    for (const e of this.positions.entries()) when.set(e.key, Date.parse(e.at) || 0);
    for (const [k, t] of this.openedAt) when.set(k, Math.max(t, when.get(k) ?? 0));
    const tabOf = new Map<string, number>();
    this.tabs.forEach((t, i) => t.views.forEach((v) => tabOf.set(v.buf.key, tabOf.get(v.buf.key) ?? i + 1)));
    for (const k of [...tabOf.keys(), ...this.recentNotes]) if (!when.has(k)) when.set(k, 0);
    const order = new Map(this.recentNotes.map((k, i) => [k, i] as [string, number]));
    return [...when]
      .filter(([k]) => existsSync(isAbsolute(k) ? k : join(this.loc.root, k)))
      .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9) || a[0].localeCompare(b[0]))
      .map(([key, t]) => ({
        key,
        hint: tabOf.has(key) && tabOf.get(key) !== this.activeTab + 1 ? `tab ${tabOf.get(key)}` : this.whenRead(t),
      }));
  }

  /** When a note was last read, briefly: the time today, else the day; nothing when unknown. */
  private whenRead(ms: number): string {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date(this.now());
    if (d.toDateString() === now.toDateString())
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  /** A place in a window's history, said: its path, and the heading it's under. */
  private placeName(loc: Loc): string {
    const buf = this.buffers.get(loc.key);
    const path = buf ? this.displayName(buf) : loc.key;
    const heading = (loc.cursor?.anchor ?? loc.anchor).heading;
    return heading ? `${path} › ${heading}` : path;
  }

  /**
   * Where back or forward takes the window (the status line's ‹ ›, said on hover): the place, the
   * root it was in when back leaves this one (17.10); null when there's nowhere to go.
   */
  historyStep(dir: "back" | "forward"): string | null {
    const v = this.tabView;
    if (!v) return null;
    const loc = dir === "back" ? v.back.at(-1) : v.fwd.at(-1);
    if (loc) return this.placeName(loc);
    const t = dir === "back" ? this.vaultTrail.at(-1) : undefined;
    return t ? tildePath(t.path) : null;
  }

  /**
   * The status line's path, clicked (3.x): the window's history as a browser shows it — forward places
   * above, the place it's at marked, back places below — under "Copy path"; a place chosen, the window
   * goes there (several steps at once).
   */
  openPathMenu(): void {
    const v = this.tabView;
    if (!v) return;
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    const g = this.glyphs;
    const places: ListItem[] = timeline
      .map((l, i) => ({
        label: `${i === cur ? g.historyHere : " "} ${sanitize(this.placeName(l))}`,
        hint: i === cur ? "here" : i > cur ? "forward" : "back",
        data: i,
      }))
      .reverse();
    const key = this.keymap.keysFor("copy.path")[0];
    const items: ListItem[] = [
      { label: "  Copy path", hint: key ? prettyKey(key, this.leader) : undefined, data: "copy" },
      ...places,
    ];
    const hot = this.geometry?.hot.find((h) => h.id === "status:path");
    this.openList({
      title: "History",
      items,
      filterable: false,
      anchor: hot ? { x: Math.max(0, hot.x - 4), y: hot.y } : undefined,
      menu: true,
      selected: 1 + (timeline.length - 1 - cur),
      accept: (it) => (it.data === "copy" ? void this.copy(v.buf.abs) : this.jumpHistory(it.data as number)),
    });
  }

  /** Jump the window to entry `i` of its timeline: what's before it becomes back, after it forward. */
  jumpHistory(i: number): void {
    // As following a link: the floating window closes, and the window under it goes.
    if (this.floating && !this.closeFloating()) return;
    const v = this.tabView;
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
    else if (view === "git") {
      this.sidebar.selected = Math.max(
        0,
        gitRows(this).findIndex((r) => r.kind !== "heading"),
      );
      void this.refreshGitNow().then(() => this.host.requestRender());
    } else
      this.sidebar.selected = Math.max(
        0,
        this.historyRows().findIndex((r) => r.here),
      );
  }

  /**
   * Put `view` in the left panel: the view leaving keeps its position (selection, scroll, sideways
   * offset, filter text), and `view` gets back the one it had. False when it has none to restore
   * (its first showing, or already the panel's view).
   */
  switchLeftView(view: LeftView): boolean {
    if (this.leftView === view) return false;
    const s = this.sidebar;
    this.leftPositions.set(this.leftView, {
      selected: s.selected,
      scroll: s.scroll,
      left: s.left,
      pinned: s.pinned,
      filter: s.filter,
    });
    this.leftView = view;
    s.filtering = false;
    const saved = this.leftPositions.get(view);
    Object.assign(s, saved ?? { selected: 0, scroll: 0, left: 0, pinned: false, filter: "" });
    return !!saved;
  }

  /** Keys while the outline's filter has them: type, move, jump, clear. */
  private outlineFilterKey(key: string): void {
    const o = this.outline;
    // The footnotes and Info views filter the same way (3.17, 3.19).
    const notes = this.rightView === "footnotes";
    const info = this.rightView === "info";
    const rows: { text: string; line?: number }[] = notes
      ? this.footnoteRows()
      : info
        ? this.infoRows()
        : this.outlineRows();
    const typed = keyChar(key);
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
        if (notes) return this.jumpToFootnote(row as FootnoteRow);
        if (info) return this.openInfoRow(row as InfoRow);
        this.pushHistory(view);
        this.moveCursor(view, { row: row.line!, col: 0 });
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
    this.outlineRefiltered();
  }

  /** The right pane's filter changed (typed, pasted): the selection goes to the row that matches best. */
  private outlineRefiltered(): void {
    const o = this.outline;
    // The heading that matches best (never a parent only kept for context).
    o.scroll = 0;
    o.pinned = false;
    const q = o.filter ?? "";
    const next: { text: string; heading?: boolean }[] =
      this.rightView === "footnotes"
        ? this.footnoteRows()
        : this.rightView === "info"
          ? this.infoRows()
          : this.outlineRows();
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    if (q) {
      next.forEach((r, i) => {
        const m = match(q, r.text);
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
    const rows: unknown[] =
      this.leftView === "explorer" ? this.explorerRows() : this.leftView === "git" ? gitRows(this) : this.historyRows();
    const typed = keyChar(key);
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
        if (this.leftView === "git") {
          done();
          return gitViewAction(this, "open_tab");
        }
        if (this.leftView === "history") {
          // A note read elsewhere ("recent here") opens here; a place in this window's history is gone back to.
          const h = row as HistoryRow;
          if (h.heading) return;
          done();
          if (h.recent) this.open(h.recent);
          else this.jumpHistory(h.index);
          this.region = "content";
          if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
          return;
        }
        const tree = row as TreeRow;
        if (tree.kind === "dir") return;
        if (tree.kind === "root") {
          done();
          return this.enterRoot(tree);
        }
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
    this.sidebarRefiltered();
  }

  /** The left pane's filter changed (typed, pasted): the selection goes to the first match — the first note, in the explorer. */
  private sidebarRefiltered(): void {
    const s = this.sidebar;
    s.scroll = 0;
    s.pinned = false;
    const next: unknown[] =
      this.leftView === "explorer" ? this.explorerRows() : this.leftView === "git" ? gitRows(this) : this.historyRows();
    s.selected = Math.max(
      0,
      this.leftView === "explorer"
        ? next.findIndex((r) => (r as TreeRow).kind === "note")
        : this.leftView === "git"
          ? next.findIndex((r) => (r as GitRow).kind !== "heading")
          : next.findIndex((r) => !(r as HistoryRow).heading),
    );
  }

  /** The history view's keys (the explorer's keymap): move, jump, filter, close, leave. */
  historyAction(action: string): void {
    const s = this.sidebar;
    const rows = this.historyRows();
    // The heading over the recent notes is stepped over.
    const step = (from: number, by: number) => {
      let i = Math.max(0, Math.min(rows.length - 1, from + by));
      if (rows[i]?.heading) i = Math.max(0, Math.min(rows.length - 1, i + by));
      return rows[i]?.heading ? from : i;
    };
    switch (action) {
      case "down":
        s.selected = step(s.selected, 1);
        break;
      case "up":
        s.selected = step(s.selected, -1);
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
        if (!row || row.heading) break;
        if (row.recent) this.open(row.recent);
        else this.jumpHistory(row.index);
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

  /** The note on screen (or `rel`) shown in the explorer: its folders unfolded, its row selected; `open` a folder's own too. */
  revealInSidebar(rel: string | null | undefined = this.view?.buf.rel, open = false): void {
    this.sidebar.pinned = false;
    if (!rel) return;
    // Climbed above the root: the root unfolded in it. (Down in a folder of it, a path elsewhere isn't shown.)
    if (!isInside(this.loc.root, this.explorerTop)) this.expanded.add(this.loc.root);
    const parts = rel === "." ? [] : rel.split("/");
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    if (open && rel !== ".") this.expanded.add(rel);
    this.invalidateTree();
    const idx =
      rel === "."
        ? Math.max(
            0,
            this.treeRows().findIndex((r) => r.path !== ".."),
          )
        : this.treeRows().findIndex((r) => r.path === rel);
    if (idx >= 0) this.sidebar.selected = idx;
  }

  /**
   * A link to a folder followed (21.2): the folder revealed in the explorer, unfolded, the explorer
   * focused — in its own root when it's outside this one (that root's, or the folder opened).
   */
  revealFolder(path: string): void {
    if (isAbsolute(path)) {
      const root = findVaultRoot(path);
      if (!this.switchVault(root ? rootAt(root) : folderAt(path), null)) return;
      path = relative(this.loc.root, path) || ".";
    }
    this.switchLeftView("explorer");
    this.sidebar.filter = "";
    this.sidebar.filtering = false;
    this.showSidebar(true);
    this.revealInSidebar(path, true);
    this.region = "sidebar";
  }

  explorerAction(action: string): void {
    this.sidebar.pinned = false;
    if (this.leftView === "history") return this.historyAction(action);
    if (this.leftView === "git") return gitViewAction(this, action);
    if (action === "filter") {
      this.sidebar.filtering = true; // resumes a filter already there (a view's restored one)
      return;
    }
    const rows = this.explorerRows();
    const row = rows[this.sidebar.selected];
    const openNote = (where: "here" | "tab" | "split") => {
      if (!row) return;
      // Another root (20.15): unfolded and folded like a folder; a file of it, opened there.
      if (row.root?.other && row.root.kind === "vault") {
        if (this.expanded.has(row.path)) this.expanded.delete(row.path);
        else this.expanded.add(row.path);
        this.invalidateTree();
        return;
      }
      if (row.under && row.kind === "note") return void this.switchVault(rootAt(row.under), row.path);
      if (row.path === ".." && row.kind === "root") return this.explorerUp();
      // The root open, in a folder above it: the explorer back down to it.
      if (row.root?.here) {
        this.explorerTop = this.loc.root;
        this.invalidateTree();
        this.sidebar.selected = 0;
        return;
      }
      // Above the root, another root is a folder to unfold, like any (its file, opened, switches into it).
      if (row.kind === "root" && row.outside) {
        this.expanded.add(row.path);
        this.invalidateTree();
        return;
      }
      if (row.kind === "root") return this.enterRoot(row);
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
      case "rename":
      case "rename_root":
      case "move":
      case "delete":
      case "copy":
      case "cut":
      case "make_root":
      case "unmake_root": {
        // On the selected note, file, folder or vault (18.x).
        const item = this.explorerItem();
        if (!item) return this.message("info", `${action.replace("_", " ")}: select a note, file or folder first`);
        return this.itemAction(action, item);
      }
      case "paste":
        return this.pasteItem();
      case "menu":
        return this.openItemMenu();
      case "restore":
        return this.restoreLast();
      case "undo_rename":
        return this.undoRename();
      case "all_files": {
        // Every text file, or back to what files.show lists; the selection stays on its row.
        const at = row?.path;
        this.sidebar.allFiles = !this.sidebar.allFiles;
        this.invalidateTree();
        const again = this.explorerRows().findIndex((r) => r.path === at);
        if (again >= 0) this.sidebar.selected = again;
        const shown = this.filesShown();
        this.message(
          "info",
          this.sidebar.allFiles
            ? "explorer: every text file"
            : `explorer: ${shown === "notes" ? "notes" : shown === "all" ? "every text file" : "notes and data files"} (files.show)`,
        );
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
        // A folder unfolds (above the root, a root too, and the root open); a note opens as a tab.
        if (row?.kind === "dir") openNote("here");
        else if (row?.kind === "root" && (row.outside || row.root?.here)) {
          this.expanded.add(row.path);
          this.invalidateTree();
        } else openNote("tab");
        break;
      case "open_tab":
        if (row?.kind === "dir" || (row?.kind === "root" && row.outside)) {
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
        // Another root's row (20.15), the root open or one beside it above it: folded, the selection
        // staying on it (its path is absolute).
        if (row.root?.other || row.root?.here || (row.kind === "root" && row.outside)) {
          if (this.expanded.delete(row.path)) this.invalidateTree();
          break;
        }
        const dir =
          row.kind === "dir" && this.expanded.has(row.path) ? row.path : row.path.split("/").slice(0, -1).join("/");
        if (dir) {
          this.expanded.delete(dir);
          this.invalidateTree();
          this.sidebar.selected = Math.max(
            0,
            this.treeRows().findIndex((r) => r.path === dir),
          );
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
        if (!match(q, h.text)) return;
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
        if (keep.has(i))
          out.push({
            index: i,
            level: h.level,
            text: h.text.replace(/\s+/g, " "),
            line: h.line,
            folded: false,
            hasChildren: (hs[i + 1]?.level ?? 0) > h.level,
          });
      });
      return out;
    }
    let hideDeeperThan = Number.POSITIVE_INFINITY;
    hs.forEach((h, i) => {
      if (h.level <= hideDeeperThan) hideDeeperThan = Number.POSITIVE_INFINITY;
      else return;
      const hasChildren = (hs[i + 1]?.level ?? 0) > h.level;
      const folded = this.outline.folded.has(i);
      // Its text on one row (the layout keeps the heading's own, white space and all, for links).
      out.push({ index: i, level: h.level, text: h.text.replace(/\s+/g, " "), line: h.line, folded, hasChildren });
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
      case "rename":
        if (!row || !view) break;
        if (!view.buf.rel || !this.graph.notes.has(view.buf.rel))
          this.message("warn", "only a note of this root has its headings renamed with their links");
        else this.promptHeadingRename(view.buf.rel, row.text);
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
    source?: (input: string) => ListItem[] | null;
    submit?: (input: string) => boolean;
    footer?: boolean;
    keepGroups?: boolean;
    alignKeysAcrossList?: boolean;
    anchor?: { x: number; y: number };
    menu?: boolean;
    /** Already typed in its filter. */
    input?: string;
    fold?: (item: ListItem, open: boolean) => boolean;
    widen?: () => void;
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
      menu: opts.menu,
      fold: opts.fold,
      widen: opts.widen,
    };
    refilter(o);
    if (opts.selected !== undefined)
      o.selected = selectable(o, Math.max(0, Math.min(opts.selected, o.filtered.length - 1)), 1);
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

  prompt(
    label: string,
    accept: (text: string) => void,
    change?: (text: string) => void,
    cancel?: () => void,
    view?: View,
  ): void {
    this.overlay = { kind: "prompt", label, text: "", accept, change, cancel, view };
  }

  /** Ask a yes-or-no question (a floating window, like every question): `y` yes, `n` or `esc` no. */
  confirm(question: string, yes: () => void, no?: () => void): void {
    this.overlay = { kind: "prompt", label: question, text: "", confirm: true, accept: () => yes(), cancel: no };
  }

  /** A question's buttons, clicked: OK or Yes accepts, Cancel or No cancels. */
  answerDialog(ok: boolean): void {
    const o = this.overlay;
    if (o?.kind !== "prompt" || o.view) return;
    if (!ok) return this.closeOverlay(true);
    this.overlay = null;
    o.accept(o.text);
  }

  closeOverlay(cancelled: boolean): void {
    const o = this.overlay;
    this.overlay = null;
    if (cancelled) o?.cancel?.();
  }

  // -------------------------------------------------------------------------------------------
  // Input. Dispatch order (decision 3.11): a paste → overlay → a pane's filter → insert (the
  // completion popup's keys first) → a character awaited (f, t, r) → (in source and the lens: counts
  // and an operator's motion around the rest, vim.ts) → resize mode → pending sequence → the
  // focused pane's keys → visual mode's → source mode's → the normal keymap. The which-key popup
  // shows while a sequence is pending.

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
      // Into the text, its line breaks the note's own (over a selection made while typing); part of the change for `.`.
      deleteTypedSelection(this, iv);
      insertText(this, iv, text.replace(/\r\n?/g, "\n").replaceAll("\n", iv.buf.eol));
      return insertRecord(this, iv, `${PASTE}${text}`);
    }
    // In normal mode where the text is editable: put after the cursor, as p does — and, as p is,
    // a change `.` repeats (the paste a key of its own).
    if (!o && this.region === "content" && iv && editable(iv)) {
      const before = iv.buf.version;
      put(this, iv, true, text.replace(/\r\n?/g, "\n"));
      const s = this.vim;
      if (!s.replaying && iv.buf.version !== before) {
        s.seq = [`${PASTE}${text}`];
        s.seqVersion = before;
        s.undoing = false;
        s.inInsert = false;
        s.lastChange = [...s.seq];
      }
      return;
    }
    const line = sanitize(text.replace(/\r\n?/g, "\n").split("\n")[0] ?? "");
    if (!line) return;
    if (!o) {
      // A side pane's filter being typed in: its first line, as typed.
      if (this.region === "sidebar" && this.sidebarShown && this.sidebar.filtering) {
        this.sidebar.filter = (this.sidebar.filter ?? "") + line;
        this.sidebarRefiltered();
      } else if (this.region === "outline" && this.outlineShown && this.outline.filtering) {
        this.outline.filter = (this.outline.filter ?? "") + line;
        this.outlineRefiltered();
      } else if (this.region === "problems" && this.problemsList().filtering) {
        this.problemsList().filter += line;
        this.problemsRefiltered();
      }
      return;
    }
    if (o.kind === "prompt") {
      // Into the field being typed in: the replace field when it has focus; none in a yes/no
      // question or while each match is confirmed (keys there are answers, not text).
      if (o.confirm || o.replace?.confirm) return;
      if (o.replace?.focus) {
        o.replace.text += line;
        return;
      }
      o.text += line;
      o.change?.(o.text);
      if (o.replace && o.view) R.refresh(this, o, o.view);
    } else if (o.kind === "saveas") {
      // Into the name, or the new folder's.
      if (o.creating !== null) o.creating += line;
      else {
        o.name += line;
        o.focus = "name";
      }
    } else if (o.filterable) {
      o.input += line;
      refilter(o);
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    }
  }

  /** Focus never stays on a hidden pane (after zen, a config reload, a resize): back to the note. */
  fixRegion(): void {
    if (
      (this.region === "sidebar" && !this.sidebarShown) ||
      (this.region === "outline" && !this.outlineShown) ||
      (this.region === "problems" && !this.problemsPanel.shown)
    )
      this.region = "content";
  }

  /**
   * A key from the terminal. Keys are handled one at a time, in order: a key arriving while
   * another is still being handled (a fast typist, a paste, a command that awaits) waits its turn.
   */
  handleKey(key: string): Promise<void> {
    this.lastInputAt = this.now();
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
    // A big note still parsing (15.1): the key acts on it once it's there, not on its placeholder.
    while (this.parses.size) await Promise.all(this.parses);
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
    // A root's trust, asked while something else was open or someone typed: now, the same way.
    if (key !== "escape") this.askTrustNow();
    this.host.requestRender();
  }

  /**
   * The advisory staleness file (9.9, decision 9.4): the notes with unsaved changes here, for the
   * CLI to warn agents about. Written when the list changes; removed when it's empty, and on quit.
   */
  publishDirty(): void {
    const paths = this.dirtyBuffers()
      .map((b) => b.key)
      .sort();
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
    const sig = [
      this.activeTab,
      v ? `${v.buf.key}@${v.cur.row}` : "",
      this.remoteServer ?? "",
      ...this.tabs.map((t) => `${t.active}:${t.views.map((x) => x.buf.key).join(",")}`),
    ].join("|");
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
  private maps(): {
    map: Keymap;
    run: (spec: string) => Promise<void> | void;
    info?: Record<string, { title: string; desc: string }>;
  }[] {
    const out: {
      map: Keymap;
      run: (spec: string) => Promise<void> | void;
      info?: Record<string, { title: string; desc: string }>;
    }[] = [];
    // A pane's own actions carry their titles (which-key says "New note here", as help does).
    if (this.region === "sidebar" && this.sidebarShown)
      out.push({
        map: this.explorerKeys,
        run: (a) => this.explorerAction(a),
        info:
          this.leftView === "history"
            ? HISTORY_ACTION_INFO
            : this.leftView === "git"
              ? GIT_ACTION_INFO
              : EXPLORER_ACTION_INFO,
      });
    if (this.region === "problems" && this.problemsPanel.shown)
      out.push({ map: this.problemsKeys, run: (a) => this.problemsPanelAction(a), info: PROBLEMS_ACTION_INFO });
    if (this.region === "outline" && this.outlineShown) {
      out.push(
        this.rightView === "footnotes"
          ? { map: this.footnoteKeys, run: (a) => this.footnoteAction(a), info: FOOTNOTE_ACTION_INFO }
          : this.rightView === "info"
            ? { map: this.infoKeys, run: (a) => this.infoAction(a), info: INFO_ACTION_INFO }
            : { map: this.outlineKeys, run: (a) => this.outlineAction(a), info: OUTLINE_ACTION_INFO },
      );
    }
    if (this.view?.visual) out.push({ map: this.visualKeys, run: (s) => this.run(s) });
    // Source mode's own keys (x deletes a character there) before the reading ones.
    if (this.region === "content" && editable(this.view) && !this.view!.visual)
      out.push({ map: this.sourceKeys, run: (s) => this.run(s) });
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
    for (const { map, info } of this.maps()) {
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
        const action = info?.[c.spec ?? ""];
        seen.set(c.key, {
          key: c.key,
          label: action?.title ?? cmd?.title ?? c.spec?.replace(/_/g, " ") ?? "",
          desc: action?.desc ?? cmd?.description ?? "",
          group,
        });
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

  /**
   * A top-level prefix's explanation (`z`, `[`, `]`, `g`…), for its popup's title (DF-D31): no popup above it lists
   * its group with it, as the leader's lists `+links`. Empty for any other.
   */
  groupExplanation(prefix: string[]): string {
    return prefix.length === 1 ? (this.groups.get(prefix[0]!)?.desc ?? "") : "";
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
    if (this.region === "sidebar" && this.sidebarShown && this.sidebar.filtering && !this.pending.length)
      return this.filterKey(key);
    if (this.region === "outline" && this.outlineShown && this.outline.filtering && !this.pending.length)
      return this.outlineFilterKey(key);
    if (this.region === "problems" && this.problemsPanel.shown && this.problemsList().filtering && !this.pending.length)
      return this.problemsFilterKey(key);
    // Insert mode: keys are text, except the few that edit or move (editing.ts); save still works.
    const iv = this.view;
    if (this.region === "content" && iv?.insert && !this.pending.length) {
      if (key === "ctrl+s") return void this.run("note.save");
      // Undo and redo as a desktop editor has them (DF-D15): typing goes on after them.
      if (key === "ctrl+z" || key === "ctrl+y") return void this.run(key === "ctrl+z" ? "edit.undo" : "edit.redo");
      // The completion popup's keys first (19.16): moving in it, accepting, closing.
      if (completionKey(this, iv, key)) {
        // ctrl+e closing it is part of the change: `.` closes the popup its replay opens again.
        if (key === "ctrl+e") insertRecord(this, iv, key);
        return;
      }
      // None showing: a word from the open files' words (25.5). Not a key of the change: the word accepted is.
      if (key === "ctrl+n" || key === "ctrl+p") {
        iv.sel = null;
        return completeWords(this, iv, key === "ctrl+p");
      }
      // A snippet's stops (25.8): tab and shift+tab between them; the first key at one replacing its placeholder.
      if (snippetKey(this, iv, key)) return;
      insertKey(this, iv, key);
      afterInsertKey(this, iv, key);
      afterSnippetKey(this, iv);
      return insertRecord(this, iv, key);
    }
    // A command waiting for one character (f, t) in the render; in source vim.ts has it.
    if (this.region === "content" && this.vim.awaitChar && !editable(iv)) {
      const f = this.vim.awaitChar;
      this.vim.awaitChar = null;
      const ch = keyChar(key);
      if (ch !== null) f(ch);
      return;
    }
    // Source mode's normal mode: counts, operators and `.` around the keymaps (vim.ts).
    if (this.region === "content" && iv && editable(iv) && !iv.visual && !this.resizeMode)
      return vimKey(this, iv, key, () => this.dispatchMapped(key));
    if (this.region === "content" && iv?.visual && !this.resizeMode)
      return visualKey(this, iv, key, () => this.dispatchMapped(key));
    // From the render, a key that starts typing (o, i, a, A, I, O) switches the window to source:
    // the change it starts is recorded for `.` as if made there (insertRecord ends it at esc).
    const s = this.vim;
    const start =
      this.region === "content" && iv && !this.resizeMode && !s.replaying
        ? { keys: [...this.pending, key], version: iv.buf.version }
        : null;
    await this.dispatchMapped(key);
    const v = this.view;
    if (start && v && v === iv && v.insert && editable(v)) {
      s.seq = start.keys;
      s.seqVersion = start.version;
      s.undoing = false;
      s.inInsert = true;
    }
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
    // Only keymaps at or above the one holding the binding may turn the key into a prefix:
    // visual mode's `y` must not wait for the normal keymap's `y y`.
    const prefixAt = maps.slice(0, at >= 0 ? at + 1 : maps.length).findIndex((m) => m.map.isPrefix(seq));
    // …and a prefix in a keymap above the binding's is that keymap's own: the explorer's `n n`
    // isn't the note's `n` (find next) after a pause.
    const hit =
      at >= 0 && !(prefixAt >= 0 && prefixAt < at) ? { ...maps[at]!, spec: maps[at]!.map.lookup(seq) } : undefined;
    if (prefixAt >= 0) {
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
    if (o.kind === "saveas") return saveAsKey(this, o, key);
    // Replacing: closing the rows keeps the search, the cursor and the edits (nothing to cancel).
    if (o.kind === "prompt" && o.replace?.confirm && o.view) return R.confirmKey(this, o, o.view, key);
    if (o.kind === "prompt" && o.replace && (key === "escape" || key === "ctrl+c" || key === "ctrl+g")) {
      this.overlay = null;
      return o.accept(o.text);
    }
    if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return this.closeOverlay(true);
    const typed = keyChar(key);
    if (o.kind === "prompt" && o.confirm) {
      if (typed === "y" || typed === "Y") return this.answerDialog(true);
      if (typed === "n" || typed === "N") return this.answerDialog(false);
      return;
    }
    if (o.kind === "prompt") {
      // A find across files: the window's toggles, said in its label.
      if (o.toggles && (key === "alt+r" || key === "alt+w")) {
        this.toggleFindOpt(o.toggles.view, key === "alt+r" ? "regex" : "whole");
        o.label = o.toggles.label();
        return;
      }
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
    // A tree (the folder picker): ← folds, → unfolds; the selection stays on its item.
    if (o.fold && (key === "left" || key === "right")) {
      const cur = o.filtered[o.selected]?.item;
      if (cur && o.fold(cur, key === "right")) {
        refilter(o);
        const at = o.filtered.findIndex((e) => e.item.data === cur.data);
        if (at >= 0) o.selected = at;
      }
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
      case "ctrl+a":
        if (!o.widen) break;
        o.widen();
        refilter(o);
        return;
    }
    if (!o.filterable) {
      // An item's own key picks it.
      // Its case first (a menu's `R` isn't its `r`), then either.
      const exact = o.filtered.findIndex((e) => e.item.hotkey && e.item.hotkey === typed);
      const hot =
        exact >= 0
          ? exact
          : o.filtered.findIndex((e) => e.item.hotkey && e.item.hotkey === (typed ?? "").toLowerCase());
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

  /** Everything visible is clickable (docs/manual/keys.md, "Mouse"). */
  handleMouse(ev: {
    type: string;
    x: number;
    y: number;
    button: number;
    scroll?: { direction: string; delta: number };
  }): void {
    if (ev.type !== "move") this.lastInputAt = this.now();
    // A wheel spun (12.7): pictures held back from its first tick until it rests.
    if (ev.type === "scroll") this.wheelAt = this.now();
    // A big note still parsing (15.1): a click or a scroll would land on its placeholder.
    if (this.parses.size) return;
    this.handleMouseNow(ev);
    // As after a key: a click can save, load theirs, tick a task — the idle clock and the stale list
    // follow it too.
    if (ev.type !== "move" && ev.type !== "over" && ev.type !== "out") {
      this.scheduleAutosave();
      this.publishDirty();
      this.publishState();
    }
  }

  private handleMouseNow(ev: {
    type: string;
    x: number;
    y: number;
    button: number;
    scroll?: { direction: string; delta: number };
  }): void {
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
    if (o.kind === "saveas") {
      if (g.saveas)
        saveAsMouse(
          this,
          o,
          ev,
          g.saveas,
          ev.type === "down" ? (g.hot.find((h) => inRect(h, ev.x, ev.y))?.id ?? null) : null,
        );
      else if (ev.type === "down") this.closeOverlay(true);
      return;
    }
    // The find row's own buttons work while typing in it.
    if (o.kind === "prompt" && o.view && ev.type === "down") {
      const hot = g.hot.find((h) => inRect(h, ev.x, ev.y));
      if (hot?.id.startsWith("findopt:") || hot?.id.startsWith("findrep:")) return this.clickHot(hot.id);
    }
    // A question's window: its buttons answer; a click elsewhere in it does nothing, outside it cancels.
    if (o.kind === "prompt" && !o.view && g.dialog) {
      if (ev.type !== "down") return;
      const hot = g.hot.find((h) => inRect(h, ev.x, ev.y));
      if (hot?.id.startsWith("dlg:")) return this.answerDialog(hot.id === "dlg:ok");
      if (!inRect(g.dialog, ev.x, ev.y)) this.closeOverlay(true);
      return;
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
      const sidePane =
        g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)
          ? this.outline
          : g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)
            ? this.sidebar
            : null;
      if (sidePane) {
        sidePane.left = Math.max(0, (sidePane.left ?? 0) + side * n * 2);
        return;
      }
      if (pane && !this.ui.wrap) {
        const layout = this.currentLayout(pane.view);
        pane.view.left = Math.max(
          0,
          Math.min(Math.max(0, layout.width - this.textColumns(pane.view)), pane.view.left + side * n * 2),
        );
      }
      return;
    }
    // The Problems panel: its list scrolls, the selection moving only to stay in view (drawing keeps it there).
    if (g.problems && inRect(g.problems, ev.x, ev.y)) {
      const p = this.problemsPanel;
      const s = p.tab === "file" ? p.file : p.all;
      const shown = Math.max(1, g.problemsPage ?? 1);
      const count = p.tab === "file" ? this.fileRows().length : this.problemRows().length;
      s.scroll = Math.max(0, Math.min(Math.max(0, count - shown), s.scroll + dir * (p.tab === "file" ? 1 : n)));
      s.selected = Math.max(s.scroll, Math.min(s.selected, s.scroll + shown - 1));
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
    // The floating editor (3.20): a click outside its box (the which-key popup aside) closes it,
    // writing back, and does nothing else — before the tabs and panes, which would act under it.
    const inPopup = g.popup && inRect(g.popup, ev.x, ev.y);
    if (this.floating && g.floating && !inRect(g.floating, ev.x, ev.y) && !inPopup) return void this.closeFloating();
    if (hot?.startsWith("prow:")) return this.clickProblemRow(Number(hot.slice(5)), clicks);
    // A sign of the problems bar (19.9): its window active, the panel on that problem.
    if (hot?.startsWith("pbar:")) {
      const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
      const t = this.tab;
      if (pane && t && !this.floating && t.views.includes(pane.view)) t.active = t.views.indexOf(pane.view);
      const [line, column] = hot.slice(5).split(":").map(Number);
      return this.openProblemAt(line!, column!);
    }
    // The Problems panel's rule: dragged, its height.
    const panelRule = g.separators.find((s) => s.kind === "problems" && inRect(s, ev.x, ev.y));
    if (panelRule) {
      this.drag = { kind: "separator", sep: panelRule };
      return;
    }
    if (hot && !hot.startsWith("tab:")) return this.clickHot(hot);
    if (inPopup) return; // the which-key popup's background
    // The Problems panel: a click anywhere else in it focuses it.
    if (g.problems && inRect({ ...g.problems, y: g.problems.y - 1, h: g.problems.h + 1 }, ev.x, ev.y)) {
      this.region = "problems";
      return;
    }
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
      if (this.rightView === "info") {
        // A section's heading folds; a row opens (or copies) what it names.
        const ir = this.infoRows()[idx];
        if (!ir) return;
        this.outline.selected = idx;
        if (ir.heading) this.infoAction(ir.folded ? "unfold" : "fold");
        else this.openInfoRow(ir);
        return;
      }
      if (this.rightView === "footnotes") {
        // A footnote's fold marker folds; a click elsewhere on a row jumps there.
        const fr = this.footnoteRows()[idx];
        if (!fr) return;
        this.outline.selected = idx;
        if (fr.hasChildren && ev.x <= g.outline.x + 2) this.footnoteAction(fr.folded ? "unfold" : "fold");
        else {
          this.jumpToFootnote(fr);
          this.outline.filter = "";
          this.outline.filtering = false;
        }
        return;
      }
      const row = this.outlineRows()[idx];
      if (!row) return;
      this.outline.selected = idx;
      // The fold marker sits right after the indent.
      const markerX = g.outline.x + 1 + (row.level - 1) * 2;
      if (row.hasChildren && ev.x >= markerX - 1 && ev.x <= markerX + 1 && !this.outline.filter)
        this.outlineAction(row.folded ? "unfold" : "fold");
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
      if (this.leftView === "git") {
        const r = gitRows(this)[idx];
        if (!r || r.kind === "heading") return;
        this.sidebar.selected = idx;
        // One click selects; a double-click opens the file there, as enter does.
        if (clicks >= 2) gitViewAction(this, "open_tab");
        return;
      }
      if (this.leftView === "history") {
        const h = this.historyRows()[idx];
        if (!h || h.heading) return;
        this.sidebar.selected = idx;
        // As in the explorer: one click selects, a double-click (or enter) jumps there — the clicked
        // row, of the filtered list; the filter clears.
        if (clicks < 2) return;
        this.sidebar.filter = "";
        this.sidebar.filtering = false;
        if (h.recent) this.open(h.recent);
        else this.jumpHistory(h.index);
        this.region = "content";
        if (this.narrow || this.ui.zen) this.sidebar.overlay = false;
        return;
      }
      const row = this.explorerRows()[idx];
      if (!row) return;
      this.sidebar.selected = idx;
      // A note: one click selects it, a double-click opens it as a tab (enter too, from the keys).
      // A root (another vault) likewise: a double-click goes there.
      if ((row.kind === "note" || row.kind === "root") && clicks < 2) return;
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
    // The floating editor (3.20): a click in it is its (one outside closed it, above).
    const pane =
      (this.floating ? g.panes.find((p) => p.view === this.floating!.view && inRect(p, ev.x, ev.y)) : undefined) ??
      (this.floating ? undefined : g.panes.find((p) => inRect(p, ev.x, ev.y)));
    if (!pane) return;
    const t = this.tab!;
    if (!this.floating) t.active = t.views.indexOf(pane.view);
    this.region = "content";
    const view = pane.view;
    const layout = this.currentLayout(view);
    const shown = this.screenRows(view, layout);
    const pos = clampPos(layout, {
      row: shown[ev.y - pane.y] ?? shown[shown.length - 1] ?? 0,
      col: Math.max(0, ev.x - pane.textX) + view.left,
    });
    // Really on the text, not on blank space the cursor was clamped from (past a row's end, below
    // the note): only there does a click follow a link or tick a task.
    const clickedRow = shown[ev.y - pane.y];
    const clickedCol = ev.x - pane.textX + view.left;
    const onText =
      clickedRow !== undefined &&
      clickedCol >= 0 &&
      clickedCol < (layout.lines[clickedRow]?.spans.reduce((a, sp) => a + stringWidth(sp.text), 0) ?? 0);
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
      if (s.kind === "problems" && s.area) return this.resizeProblems(s.area.y + s.area.h - 1 - ev.y);
      if (s.kind === "sidebar")
        this.sideW = Math.max(12, Math.min(ev.x - this.leftRailWidth, Math.floor(this.usableWidth * 0.5)));
      else if (s.kind === "outline")
        this.outW = Math.max(
          12,
          Math.min(this.width - this.rightRailWidth - ev.x - 1, Math.floor(this.usableWidth * 0.5)),
        );
      else if (s.area && this.tab) {
        const r =
          s.kind === "split-side"
            ? (ev.x - s.area.x) / Math.max(1, s.area.w)
            : (ev.y - s.area.y) / Math.max(1, s.area.h);
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
    const pos = clampPos(layout, {
      row: shown[Math.max(0, Math.min(shown.length - 1, ev.y - pane.y))] ?? 0,
      col: Math.max(0, ev.x - pane.textX) + d.view.left,
    });
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
        this.message(
          "info",
          `copied ${text.length} characters · ${prettyKey(`${this.leader} s a`, this.leader)} adds it to the scratch`,
        );
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
      // The explorer's buttons (18.1): as its keys, on its selection.
      case "xnew":
      case "xrow":
        this.region = "sidebar";
        this.explorerAction(kind === "xnew" ? (arg === "note" ? "new_note" : "new_folder") : arg);
        break;
      case "fn":
        return this.addFootnote();
      // A code cell's button (24.13): `action:line`.
      case "cell": {
        const [action, line] = arg.split(":");
        return this.cellAction(action!, Number(line));
      }
      // The Problems panel's tabs and close button; the status line's problems open it on this file's.
      case "ptab":
        if (arg === "close") return this.closeProblems();
        if (arg === "all" && this.problemsPanel.tab !== "all") return this.openProblems("all");
        this.problemsPanel.tab = arg === "all" ? "all" : "file";
        this.region = "problems";
        break;
      case "btn":
        // The left rail's: the explorer, the history, source control.
        if (LEFT_VIEWS.some((v) => v.id === arg)) this.openLeftView(arg as LeftView);
        else if (arg === "outline") void this.run("outline.toggle");
        else if (arg === "footnotes") void this.run("footnotes.toggle");
        else if (arg === "info") void this.run("info.toggle");
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
        // The path: its window's history, and Copy path; the arrows around it, back and forward.
        if (arg === "path" && this.view) this.openPathMenu();
        else if (arg === "back" || arg === "forward") this.history(arg);
        else if (arg === "message") void this.run("messages.open");
        // The file's problems: the Problems panel on This file (1.7) — on All when it has none; open there, closed.
        else if (arg === "problems") {
          const tab = this.fileProblems().length ? "file" : "all";
          return this.problemsPanel.shown && this.problemsPanel.tab === tab
            ? this.closeProblems()
            : this.openProblems(tab);
        }
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

  /**
   * The note's context bundle (9.7) on the clipboard: it, what it links to and what links to it
   * (`[context]`), as one markdown document for an agent. A handoff (4.10): unsaved notes are
   * saved first, so the bundle holds what's on screen.
   */
  copyContext(): void {
    const buf = this.view?.buf;
    if (!buf || buf.rel === null || buf.virtual) return this.message("info", "context: open a note first");
    if (!this.savedForHandoff("context", "not copying")) return;
    const b = buildContext(this.graph, [buf.rel], this.config.context);
    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
    const links = b.items.filter((i) => i.why === "link").length;
    const backs = b.items.filter((i) => i.why === "backlink").length;
    const out = b.left.filter((l) => l.reason === "limit").length;
    this.copy(
      b.text,
      true,
      `the context of ${buf.rel}: ${n(b.items.length, "file")} (${links} linked, ${backs} linking to it${out ? `; ${out} past the limit` : ""}), ${b.text.length} characters`,
    );
  }

  /**
   * Every unsaved note saved, for a hand-off that reads them from disk (4.10): true when they are. When one couldn't be,
   * false, and said — never silent: `what` the hand-off, `not` what it didn't do.
   */
  savedForHandoff(what: string, not: string): boolean {
    for (const d of this.dirtyBuffers()) {
      if (d.virtual || this.saveBuffer(d, true)) continue;
      // Changed on disk meanwhile, the resolve's key; otherwise the write failed, and its error above says why.
      if (!d.changedOnDisk() || d.deleted)
        this.message("warn", `${what}: ${this.displayName(d)} couldn't be saved — ${not}`);
      else {
        const key = this.keymap.keysFor("note.resolve")[0];
        this.message(
          "warn",
          `${what}: ${this.displayName(d)} changed on disk while unsaved — ${key ? prettyKey(key, this.leader) : "note.resolve"} resolves it first`,
        );
      }
      return false;
    }
    return true;
  }

  /**
   * Export a note (10.x): the explorer's selected one, or this one. Its format picked — or named, `:export docx` — then
   * where asked: beside it, its name, unless you say otherwise.
   */
  exportNote(name?: string): void {
    const t = this.noteTarget();
    if (!t) return;
    if (!this.graph.notes.has(t.rel)) return this.message("info", `export: ${t.rel} isn't a note — a note is exported`);
    this.chooseExportFormat([t.rel], name);
  }

  /**
   * Export notes as one document (10.9), a chapter each: picked from the root's notes in the order wanted — the one on
   * screen (or the explorer's) first — each pick numbered, a pick again taken out; then "Export…", first in the list
   * whatever's typed, asks the format and where, as `space n o` does.
   */
  composeExport(picked?: string[], input = "", selected?: number): void {
    if (!picked) {
      const t = this.explorerFocused()
        ? this.explorerItem()
        : this.view?.buf.rel
          ? { rel: this.view.buf.rel, dir: false }
          : null;
      picked = t && !t.dir && this.graph.notes.has(t.rel) ? [t.rel] : [];
    }
    const chosen = picked;
    const go: ListItem[] = chosen.length
      ? [
          {
            label: `Export ${chosen.length === 1 ? chosen[0] : `these ${chosen.length} notes`}…`,
            hint: "enter",
            data: null,
          },
        ]
      : [];
    const notes: ListItem[] = [...this.graph.notes.keys()]
      .sort()
      .map((rel) => ({ label: rel, hint: chosen.includes(rel) ? String(chosen.indexOf(rel) + 1) : "", data: rel }));
    this.openList({
      title: chosen.length
        ? `Notes to export, in order — ${chosen.length} picked`
        : "Notes to export, in order: pick the first",
      items: [...go, ...notes],
      // The notes filtered by what's typed; "Export…" always first.
      source: (typed) => (typed.trim() ? [...go, ...rank(typed, notes, (i) => i.label).map((r) => r.item)] : null),
      input,
      ...(selected !== undefined ? { selected } : {}),
      accept: (item) => {
        if (item.data === null) return this.chooseExportFormat(chosen);
        const rel = item.data as string;
        const next = chosen.includes(rel) ? chosen.filter((r) => r !== rel) : [...chosen, rel];
        // "Export…" comes and goes: the selection stays on the note.
        const shift = (next.length ? 1 : 0) - (chosen.length ? 1 : 0);
        this.composeExport(next, list.input, list.selected + shift);
      },
    });
    const list = this.overlay as ListOverlay;
  }

  /** The format for an export of `rels` picked — or named — then where asked. */
  chooseExportFormat(rels: string[], name?: string): void {
    if (name) {
      const format = formatFor(name);
      if (!format) return this.message("warn", `export: no format ${name} — ${FORMATS.map((f) => f.name).join(", ")}`);
      return this.exportBrowser(rels, format);
    }
    const what = rels.length === 1 ? rels[0]! : `${rels.length} notes`;
    this.openList({
      title: `Export ${what} as`,
      items: FORMATS.map((f) => ({ label: f.title, hint: f.name, data: f })),
      accept: (item) => this.exportBrowser(rels, item.data as ExportFormat),
    });
  }

  /**
   * Where an export goes (10.14), in a Save As window: open where you exported last (else beside the note), the note's
   * name filled in — `enter` exports there — with places down its left, the folder's folders and files, folders made.
   */
  exportBrowser(rels: string[], format: ExportFormat): void {
    const beside = defaultTarget(this.graph.abs(rels[0]!), format);
    const last = this.lastExportDir();
    const what = rels.length === 1 ? rels[0]! : `${rels.length} notes`;
    const places: SavePlace[] = [{ label: "Beside the note", path: dirname(beside) }];
    if (last && last !== dirname(beside)) places.push({ label: "Last export", path: last });
    for (const f of userFolders(this.home)) places.push({ label: f.name, path: f.path });
    places.push({ label: "This root", path: this.loc.root });
    const o: SaveAsOverlay = openSaveAs(this, {
      title: `Export ${what} as ${format.title}`,
      dir: last ?? dirname(beside),
      name: basename(beside),
      places,
      accept: (path) => this.exportChosen(rels, format, path, o),
    });
  }

  /** The file picked for an export: never a note (said, the window back); a file there replaced once you say so. */
  private exportChosen(rels: string[], format: ExportFormat, path: string, o: SaveAsOverlay): void {
    let target: string;
    try {
      target = exportTarget(this.graph, rels[0]!, format, path, this.loc.root);
    } catch (err) {
      this.message("warn", `export: ${(err as Error).message}`);
      this.overlay = o;
      return;
    }
    const go = () => void this.writeExport(rels, format, target);
    if (existsSync(target)) {
      return this.confirm(`${this.graph.shownPath(target)} is there — replace it?`, go, () => {
        this.overlay = o;
      });
    }
    go();
  }

  private bracketMemo: {
    buf: NoteBuffer;
    version: number;
    at: number;
    insert: boolean;
    marks: Map<number, { from: number; to: number }[]> | null;
  } | null = null;

  /**
   * The bracket at the cursor and the one matching it (25.3), each by its source line and its place in it, for the view
   * to mark — in source mode; while typing, the bracket just before the cursor too. Null where it's on none.
   */
  bracketMarks(view: View): Map<number, { from: number; to: number }[]> | null {
    if (!view.source) return null;
    const at = offsetOf(this, view);
    const m = this.bracketMemo;
    if (m && m.buf === view.buf && m.version === view.buf.version && m.at === at && m.insert === !!view.insert)
      return m.marks;
    const text = view.buf.source;
    let here = matchBracket(text, at) >= 0 ? at : -1;
    if (here < 0 && view.insert && at > 0 && matchBracket(text, at - 1) >= 0) here = at - 1;
    let marks: Map<number, { from: number; to: number }[]> | null = null;
    if (here >= 0) {
      marks = new Map();
      const starts = view.buf.lineStarts();
      for (const o of [here, matchBracket(text, here)]) {
        const line = lineOf(view, o);
        const col = o - (starts[line - 1] ?? 0);
        marks.set(line, [...(marks.get(line) ?? []), { from: col, to: col + 1 }]);
      }
    }
    this.bracketMemo = { buf: view.buf, version: view.buf.version, at, insert: !!view.insert, marks };
    return marks;
  }

  /** A server's snippet being typed through (25.8): its stops. */
  snippet: SnippetSession | null = null;

  /** The command your shell is running (25.7): one at a time. */
  shellJob: { command: string; stop: () => void } | null = null;

  /** The dictionaries' checkers by their languages (25.6): each once its dictionaries are loaded. */
  private readonly checkers = new Map<string, Checker>();
  /** Languages already said to have no dictionary, or one that wouldn't load: said once. */
  private readonly spellSaid = new Set<string>();
  /** Bumped when your words change: the words found misspelt before are found again. */
  private spellGeneration = 0;
  private spellMemo: { buf: NoteBuffer; version: number; key: string; generation: number; words: SpellWord[] } | null =
    null;

  /** A note's languages for spelling: its front matter's `lang`, else `[spell] languages`. */
  private spellLanguages(view: View): string[] {
    return noteLanguages(view.buf.parsed.frontmatter?.data, this.config.spell.languages);
  }

  /**
   * A checker for some languages (25.6): their dictionaries, once all have loaded — each in the background the first
   * time, the window drawn again when it's there; null until then. A language with no dictionary is said once.
   */
  private spellChecker(langs: string[]): Checker | null {
    const key = langs.join(" ");
    const hit = this.checkers.get(key);
    if (hit) return hit;
    const spellers: Speller[] = [];
    let waiting = false;
    for (const lang of langs) {
      const files = dictionaryFiles(lang, this.config.spell.dictionaries);
      const name = files ? `spell:${files.aff}` : "";
      const s = files ? lazy(name, () => openSpeller(files)) : null;
      if (s) spellers.push(s);
      else if (files && !loadError(name)) waiting = true;
      else if (!this.spellSaid.has(lang)) {
        this.spellSaid.add(lang);
        this.message(
          "warn",
          files
            ? `spelling: ${lang}'s dictionary didn't load (${loadError(name)})`
            : `spelling: no dictionary for ${lang} — [spell] dictionaries can name yours`,
        );
      }
    }
    if (waiting) return null;
    const c = new Checker(spellers);
    this.checkers.set(key, c);
    return c;
  }

  /**
   * A note's misspelt words (25.6), in order, while spelling is on: its prose's words none of its languages' dictionaries
   * knows — null while they load, or for a file that isn't a note.
   */
  misspelt(view: View): SpellWord[] | null {
    if (!this.ui.spell || view.buf.kind.group !== "note") return null;
    const buf = view.buf;
    const langs = this.spellLanguages(view);
    const checker = this.spellChecker(langs);
    if (!checker) return null;
    const key = langs.join(" ");
    const m = this.spellMemo;
    if (m && m.buf === buf && m.version === buf.version && m.key === key && m.generation === this.spellGeneration)
      return m.words;
    const words = checker.misspelt(proseWords(buf.parsed.tree, buf.source));
    this.spellMemo = { buf, version: buf.version, key, generation: this.spellGeneration, words };
    return words;
  }

  /** What a word of the note might be instead: its languages' dictionaries' suggestions. */
  spellSuggestions(view: View, word: string): string[] {
    return this.spellChecker(this.spellLanguages(view))?.suggest(word) ?? [];
  }

  /** One of your words added (25.6): to your list, and to every dictionary loaded — marked no more anywhere. */
  addSpellWord(word: string): void {
    try {
      addOwnWord(word);
    } catch (err) {
      return this.message("error", `couldn't add "${word}" to your words: ${(err as Error).message}`);
    }
    for (const c of this.checkers.values()) for (const s of c.spellers) s.add(word);
    // Their answers so far are thrown away; the dictionaries, with the word in them now, stay.
    this.checkers.clear();
    this.spellGeneration++;
    this.message("info", `"${word}" added to your words (${this.graph.shownPath(ownWordsFile())})`);
  }

  /** A folder as an export's places show it: from the root inside it, `~/` under home, else whole. */
  shownDir(dir: string): string {
    const inRoot = relative(this.loc.root, dir);
    if (!climbsOut(inRoot) && !isAbsolute(inRoot)) return inRoot ? `${inRoot.split(sep).join("/")}/` : "./";
    const inHome = relative(this.home, dir);
    if (!climbsOut(inHome) && !isAbsolute(inHome)) return inHome ? `~/${inHome.split(sep).join("/")}/` : "~/";
    return `${dir}/`;
  }

  /** The folder an export went to last from this root (kept in its state), if it's still there. */
  lastExportDir(): string | null {
    const dir = readJson<{ dir?: unknown }>(join(stateDir(this.loc), "export.json"), {}).dir;
    return typeof dir === "string" && isDir(dir) ? dir : null;
  }

  /** The notes at `rels` exported as one document to `target`, unsaved ones saved first (4.10): what's on screen. */
  async writeExport(rels: string[], format: ExportFormat, target: string): Promise<void> {
    if (!this.savedForHandoff("export", "not exporting")) return;
    const shown = this.graph.shownPath(target);
    this.message("info", `exporting to ${shown}…`);
    this.host.requestRender();
    let files: string[];
    try {
      files = writeExport(target, await exportNotes(this.graph, rels, format, target));
    } catch (err) {
      return this.message("error", `export: ${shown} not written — ${(err as Error).message}`);
    }
    const beside = files.length ? `, ${files.length} file${files.length === 1 ? "" : "s"} beside it` : "";
    this.message(
      "info",
      `exported ${rels.length === 1 ? rels[0] : `${rels.length} notes`} to ${shown} (${format.title})${beside}`,
    );
    // Where it went, for "Where you exported last".
    try {
      writeJson(join(stateDir(this.loc), "export.json"), { dir: dirname(target) });
    } catch {}
    this.host.requestRender();
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
    if (!climbsOut(rel)) this.watcher?.noteOwnWrite(rel);
    const open = this.buffers.get(loc.path) ?? this.buffers.get(rel);
    if (open) {
      open.load();
      for (const v of this.allViews()) if (v.buf === open) v.layoutKey = "";
    }
    this.message("info", `added to the scratch · ${prettyKey(`${this.leader} s s`, this.leader)} opens it`);
  }

  allViews(): View[] {
    return [...this.tabs.flatMap((t) => t.views), ...(this.floating ? [this.floating.view] : [])];
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
    // A big note parses on other threads first (15.1), the main thread only putting its chunks
    // together: parsed here whole, one would hold every key for seconds. Where threads can't
    // start, it's parsed here after all.
    const elsewhere = new Set<string>();
    const failed = new Set<string>();
    const tick = () => {
      if (this.quitting) return;
      for (const f of this.graph.unparsedOver(BACKGROUND_PARSE)) {
        if (elsewhere.has(f.rel) || failed.has(f.rel)) continue;
        let text: string;
        try {
          text = readText(f.abs).text;
        } catch {
          continue; // unreadable: the parse here says so
        }
        const chunks = newParseCache();
        elsewhere.add(f.rel);
        void parseInBackground(text, chunks)
          .catch(() => false)
          .then((ok) => {
            elsewhere.delete(f.rel);
            if (!ok) failed.add(f.rel);
            else if (!this.quitting) this.graph.entry(f.rel, chunks);
          });
      }
      const left = this.graph.parseSome(12, elsewhere);
      this.indexing = left;
      if (left) {
        // Only notes parsing elsewhere left: look again in a while, not every millisecond.
        setTimeout(tick, left > elsewhere.size ? 1 : 50);
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

  /** Once the background pass over this vault's notes is done, however long it takes (tests). */
  async whenIndexed(): Promise<void> {
    while (this.indexing) await new Promise((r) => setTimeout(r, 5));
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
      dirs: isListed(this.loc) ? [""] : this.graph.dirs,
      debounceMs: this.config.watch.debounce_ms,
      pollMs: this.config.watch.poll_ms,
      known: this.knownFromGraph(),
      sizes: this.sizesFromGraph(),
      onBatch: (b) => this.receiveBatch(b),
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

  /** When a key or a click last came: the background auto-index waits while someone works (20.9). */
  lastInputAt = 0;
  autoIndex: AutoIndex | null = null;

  /**
   * Whether the background auto-index may work now (20.9): it's on, this vault's own index is done,
   * and nobody is working — no key or click here, no CLI command from an agent — for `idle_seconds`.
   */
  autoIndexDue(now = this.now()): boolean {
    if (!this.config.index.background || this.indexing) return false;
    const quiet = this.config.index.idle_seconds * 1000;
    if (now - this.lastInputAt < quiet) return false;
    try {
      if (now - statSync(activityFile()).mtimeMs < quiet) return false;
    } catch {}
    return true;
  }

  /** The background auto-index of the home folder (20.9): a slice of it every quarter second while due. */
  private startAutoIndex(): void {
    this.lastInputAt = this.now();
    const t = setInterval(() => {
      if (this.quitting) return clearInterval(t);
      if (!this.autoIndexDue()) return;
      this.autoIndex ??= new AutoIndex(homeFolder());
      if (this.autoIndex.idle) return;
      this.autoIndex.step(15);
    }, 250);
    (t as { unref?: () => void }).unref?.();
  }

  /** Poll what the vault watcher cannot see: files open from outside the vault (the scratch)
   *  and the config files, which reload automatically when saved. */
  private startPolling(): void {
    const t = setInterval(
      () => {
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
        // HEAD moved without a file changing with it (5.9): a switch between branches alike.
        if (this.checkHead()) changed = true;
        if (changed) this.host.requestRender();
      },
      Math.min(this.config.watch.poll_ms, 1000),
    );
    (t as { unref?: () => void }).unref?.();
  }

  applyChanges(batch: WatchBatch): void {
    // The panes' selections are row indexes: an agent's new or deleted note, or a heading added
    // above, would move them to another item. Kept by what they select, not where.
    const keep = this.rememberSelections();
    // Files moved elsewhere (an editor, a file manager, git), seen by their content as they went and came.
    const moves: [string, string][] = [];
    const stop = this.graph.onChange((c) => {
      if (c.kind === "moved") moves.push([c.from, c.to]);
    });
    try {
      this.applyChangesNow(batch);
    } finally {
      stop();
      keep();
    }
    if (moves.length) this.offerRelink(moves);
  }

  /**
   * A batch of moves made elsewhere broke links (21.11): the relink offered once for it — its preview,
   * nothing written unasked. Typing, or something else open: said instead, with where to find it.
   */
  private offerRelink(moves: [string, string][]): void {
    const plan = planRelink(this.graph, undefined, { pointers: false });
    if (!plan.files.length) return;
    const what = moves.length === 1 ? `${moves[0]![0]} moved to ${moves[0]![1]}` : `${moves.length} files moved`;
    const links = plan.files.reduce((n, f) => n + f.edits.length, 0);
    if (this.overlay || this.view?.insert)
      return this.message(
        "warn",
        `${what}: ${links} line${links === 1 ? "" : "s"} of links broke — space v p shows them, space l r relinks a note's`,
      );
    this.message("info", `${what}: ${links} line${links === 1 ? "" : "s"} of links broke — the relink, to look over`);
    this.previewRename(() => plan);
  }

  /** What the explorer and the outline have selected; the function puts them back on it. */
  private rememberSelections(): () => void {
    const explorer = this.leftView === "explorer" ? this.explorerRows()[this.sidebar.selected]?.path : undefined;
    const rows = this.outlineShown && this.rightView === "outline" ? this.outlineRows() : [];
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
    const { structural: setChanged, warnings } = applyToGraph(this.graph, batch, this.config.walk.max_file_size);
    for (const w of warnings) this.message("warn", w);
    if (batch.rescan) {
      this.indexInBackground();
      this.watcher?.sync(isListed(this.loc) ? [""] : this.graph.dirs, this.knownFromGraph(), this.sizesFromGraph());
      // The walk itself changed: any open note may have changed, appeared or gone.
      for (const buf of this.buffers.values()) if (buf.changedOnDisk()) this.reloadBuffer(buf);
    }
    for (const c of batch.changes) {
      // An open note reloads — a data or text file too, like a note (16.4) — and a big one still
      // does when it's out of the index. One gone again before it was looked at comes as deleted.
      const buf = this.buffers.get(c.rel);
      if (!buf || (c.isNote && c.kind !== "deleted" && !existsSync(buf.abs))) continue;
      this.reloadBuffer(buf, c.kind === "deleted");
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
        if (this.graph.linksOf(b.rel).some((l) => l.path !== null && l.path !== undefined && changed.has(l.path)))
          b.invalidateLayouts();
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
      this.message(
        "warn",
        `${this.displayName(buf)} changed on disk — the replace row closed (its selection is gone); select again`,
      );
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
    // This branch's tabs, when it has kept some (5.9); else the last ones.
    const mine = this.head?.branch ? s.branches?.[this.head.branch] : undefined;
    this.openTabs(mine?.tabs.length ? mine.tabs : s.tabs, mine?.tabs.length ? mine.activeTab : s.activeTab);
    if (!this.tabs.length) return false;
    this.sidebar.visible = s.sidebar;
    if (s.outline !== undefined) this.outline.visible = s.outline;
    if (s.sidebar_width) this.sideW = s.sidebar_width;
    if (s.problems_height) this.problemsPanel.height = s.problems_height;
    if (s.outline_width) this.outW = s.outline_width;
    this.revealInSidebar();
    return true;
  }

  /** Tabs from the session opened, after any there are; the active one as it was. */
  private openTabs(tabs: SessionTab[], activeTab: number): void {
    for (const t of tabs) {
      const views: View[] = [];
      for (const p of t.panes) {
        const buf = this.buffer(p.path);
        if (!buf) continue;
        const view = this.makeView(buf, p.anchor, p.cursor);
        // Its history too, so back, forward and the history list go on where they were.
        view.back = [...(p.back ?? [])];
        view.fwd = [...(p.fwd ?? [])];
        views.push(view);
      }
      if (views.length)
        this.tabs.push({
          views,
          active: Math.min(t.active, views.length - 1),
          orientation: t.orientation ?? "side",
          ratio: t.ratio ?? this.config.ui.split_ratio,
          ...(t.pinned ? { pinned: true } : {}),
        });
    }
    this.activeTab = Math.max(0, Math.min(activeTab, this.tabs.length - 1));
    for (const t of this.tabs) t.active = Math.max(0, Math.min(t.active, t.views.length - 1));
  }

  /** The session saved: the tabs, as the last ones and as `branch`'s (by default, HEAD's as last seen). */
  saveState(branch: string | null = this.head?.branch ?? null): void {
    for (const v of this.allViews()) this.remember(v);
    this.positions.save();
    const s: SessionState = {
      version: 1,
      tabs: this.tabs.map((t) => ({
        panes: t.views.map((v) => ({
          path: v.buf.key,
          anchor: v.topAnchor,
          cursor: v.curAnchor,
          back: v.back.slice(-SESSION_HISTORY),
          fwd: v.fwd.slice(-SESSION_HISTORY),
        })),
        active: t.active,
        orientation: t.orientation,
        ratio: t.ratio,
        ...(t.pinned ? { pinned: true } : {}),
      })),
      activeTab: this.activeTab,
      sidebar: this.sidebar.visible,
      outline: this.outline.visible,
      sidebar_width: this.sideW,
      problems_height: this.problemsPanel.height ?? undefined,
      outline_width: this.outW,
      ui: this.uiOverrides,
      recent_commands: this.recentCommands,
      recent_notes: this.recentNotes,
      ...(this.remoteServer ? { remote_server: this.remoteServer } : {}),
    };
    // Each branch's tabs, as it was left (5.9): the most recent few kept.
    const branches = { ...(loadSession(this.loc)?.branches ?? {}) };
    if (branch) branches[branch] = { tabs: s.tabs, activeTab: s.activeTab, at: new Date(this.now()).toISOString() };
    s.branches = Object.fromEntries(
      Object.entries(branches)
        .sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
        .slice(0, SESSION_BRANCHES),
    );
    saveSession(this.loc, s);
  }

  /** Buffers with unsaved changes. */
  dirtyBuffers(): NoteBuffer[] {
    return [...this.buffers.values()].filter((b) => b.dirty);
  }

  /** Quit, unless something is unsaved (`app.quit`; `:q!` quits anyway). */
  requestQuit(force = false): void {
    for (const v of this.allViews()) if (v.insert) stopInsert(this, v);
    // The properties editor's text (not a buffer of the list): written back first, or asked about.
    if (this.floating && !force && !this.closeFloating()) return;
    const dirty = this.dirtyBuffers();
    if (dirty.length && !force) {
      return this.message(
        "warn",
        `unsaved changes in ${dirty.map((b) => this.displayName(b)).join(", ")} — :w saves, :q! quits without saving`,
      );
    }
    this.quit();
  }

  /**
   * Save a buffer (`:w`, ctrl+s): its text, with its BOM and line endings, through writeBuffer. If
   * the file changed on disk since it was loaded, not blindly: after (K)eep yours it asks first;
   * otherwise the conflict prompt decides.
   */
  saveBuffer(buf: NoteBuffer, quiet = false): boolean {
    // A virtual buffer (3.20): its text written where it belongs (a note's frontmatter).
    if (buf.virtual) {
      if (!buf.virtual.save(buf.source)) return false;
      buf.markSaved();
      return true;
    }
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
    // What `.editorconfig` asks of a save (25.1): trailing whitespace, the final newline — in the text first.
    buf.applySaveRules();
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
        if (item.data === "y" && this.writeBuffer(buf, buf.contentToSave(), true))
          this.message("info", `saved ${this.displayName(buf)} over the file on disk`);
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
      if (!buf.conflictWaiting)
        this.message("warn", `${this.displayName(buf)} changed on disk — esc, then choose what to keep`);
      buf.conflictWaiting = true;
      return;
    }
    const waiting = buf.conflictWaiting;
    buf.conflictWaiting = false;
    if (this.overlay) {
      // Its own prompt already open: nothing to add. Another list open: said once, not per write.
      const own =
        this.overlay.kind === "list" && this.overlay.title.startsWith(`${this.displayName(buf)} changed on disk`);
      if (!own && !waiting)
        this.message(
          "warn",
          `${this.displayName(buf)} changed on disk while you have unsaved changes — space n c resolves it`,
        );
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
    this.message(
      r.conflicts ? "warn" : "info",
      r.conflicts
        ? `merged — ${r.conflicts} conflict${r.conflicts === 1 ? "" : "s"} marked <<<<<<< yours … >>>>>>> theirs; unsaved`
        : "merged cleanly — unsaved; :w writes it",
    );
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
      items: lines.length
        ? lines.map((l) => ({ label: sanitize(l), data: null }))
        : [{ label: "no differences", data: null }],
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

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.servers?.killAll();
    this.shellJob?.stop();
    try {
      writeDirty(this.loc, []);
    } catch {}
    this.watcher?.close();
    this.stopLazy?.();
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.saveState();
    this.host.quit();
  }

  // -------------------------------------------------------------------------------------------
  // Vaults (17.10, 17.13, 17.14)

  /**
   * Become another root's TUI, as if started there (17.10): its config, index, watcher, reading
   * positions and session — with `open` open (an absolute path), or the session's tabs. Leaving
   * saves this one's as quitting does. Refused while a note is unsaved: it would be left behind.
   */
  /** Whether this root can be left now: nothing unsaved; said when not. */
  private canLeave(): boolean {
    // The floating window first: changed properties go into their note (or it asks, and nothing
    // switches); the note they made unsaved then refuses the switch below.
    if (this.floating && !this.closeFloating()) return false;
    const dirty = this.dirtyBuffers();
    if (dirty.length) {
      this.message(
        "warn",
        `unsaved: ${dirty.map((b) => this.displayName(b)).join(", ")} — save (:wa) or revert before leaving ${this.vaultLabel(this.loc)}`,
      );
      return false;
    }
    return true;
  }

  switchVault(target: VaultLocation, open: string | null, anchor?: Anchor, how: { back?: boolean } = {}): boolean {
    if (!this.canLeave()) return false;
    const v = this.view;
    const from = v
      ? { root: this.loc.root, path: v.buf.abs, anchor: { ...v.topAnchor }, cursor: { ...v.curAnchor } }
      : null;
    // Leave, as quitting would.
    this.saveState();
    try {
      writeDirty(this.loc, []);
    } catch {}
    this.watcher?.close();
    this.watcher = null;
    // Enter.
    this.loc = target;
    this.feed.reset();
    const { carriedFrom } = recordLocation(target);
    this.configLastGood.clear();
    const loaded = loadConfig({
      ...configFilesFor(target),
      configFile: this.configFile,
      lastGood: this.configLastGood,
    });
    this.config = loaded.config;
    this.configOrigins = loaded.origins;
    this.lintCmd = lintCommand(this.config.lint, target.root, undefined, this.config.lsp.auto_install);
    this.vaultLint = { running: false, issues: null };
    this.relint();
    for (const w of loaded.warnings) this.message("warn", w);
    this.reach = new Reach(target);
    this.graph = new Graph(target, this.config).build(true, "lazy");
    this.graph.reach = this.reach;
    this.followGraph();
    if (this.live) this.loadCodeGrammars();
    for (const e of this.graph.errors) this.message("warn", e);
    this.positions = new PositionStore(target);
    for (const b of this.buffers.values()) this.servers?.close(b.abs);
    this.buffers.clear();
    this.tabs = [];
    this.activeTab = 0;
    this.overlay = null;
    this.expanded.clear();
    // The explorer climbed above the root left (`..`), to a folder the new one is in too: it stays there,
    // the new root unfolded in it (17.14). Else it starts at the new root.
    const top = this.explorerTop;
    const climbed = !!from && top !== from.root && !isInside(from.root, top);
    if (climbed && isInside(top, target.root) && top !== target.root) {
      for (let d = target.root; d !== top && isInside(top, d); d = dirname(d)) this.expanded.add(d);
    } else this.explorerTop = target.root;
    // The clipboard and the last delete name the old root's things: forgotten.
    this.fileClip = null;
    this.lastTrashed = null;
    // So are git's states (the explorer's marks, the Problems' conflicts): asked again, below.
    this.gitStates = null;
    this.gitFolders.clear();
    this.leftPositions.clear();
    this.sidebar = { visible: this.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.sideW = this.config.ui.sidebar_width;
    this.outW = this.config.ui.outline_width;
    this.outline = {
      visible: this.config.ui.outline,
      overlay: false,
      selected: 0,
      scroll: 0,
      folded: new Set(),
      forKey: "",
    };
    this.invalidateTree();
    this.ui = uiDefaults(this.config);
    if (process.env.NO_COLOR) this.ui.theme = "mono";
    this.uiOverrides = {};
    const session = loadSession(target);
    this.recentCommands = (session?.recent_commands ?? []).filter((id) => typeof id === "string").slice(0, RECENT_MAX);
    this.remoteServer = session?.remote_server;
    this.recentNotes = (session?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
    this.restoreUiOverrides();
    if (this.explicitTheme) this.ui.theme = this.explicitTheme;
    this.applyKeys();
    this.applyTheme();
    this.glyphs = this.glyphSet(this.ui.glyphs);
    this.host.setMouse?.(this.ui.mouse);
    const restored = this.config.ui.restore_session && this.restoreSession();
    if (open) {
      const i = this.tabs.findIndex((t) => t.views.some((x) => x.buf.abs === open));
      if (i >= 0) {
        this.activeTab = i;
        const t = this.tabs[i]!;
        t.active = t.views.findIndex((x) => x.buf.abs === open);
        if (anchor) this.jumpTo(t.views[t.active]!, anchor);
      } else this.openInNewTab(open, anchor);
    } else if (!restored) {
      const first = this.defaultNote();
      if (first) this.openInNewTab(first);
    }
    if (from && !how.back) this.vaultTrail.push(from);
    this.region = "content";
    if (carriedFrom) {
      this.message("info", carried(target, carriedFrom));
      this.offerMovedRelink();
    }
    this.askDefaultCopy();
    this.relayoutAll();
    this.publishState();
    this.recordConfigStamps();
    if (this.live) {
      if (this.config.watch.enabled) this.startWatcher();
      this.indexInBackground();
      this.refreshGit();
    }
    this.message(
      "info",
      target.mode === "vault" && target.name ? `${rootLabel(target)} — ${target.root}` : target.root,
    );
    this.host.requestRender();
    return true;
  }

  /** How a root is named to the user (21.9): its name, else its path; a plain folder, its path. */
  vaultLabel(loc: Pick<VaultLocation, "mode" | "name" | "root" | "worktree">): string {
    return rootLabel(loc);
  }

  /** A root row of the explorer: go into it (17.13). */
  enterRoot(row: TreeRow): void {
    const r = row.root;
    if (!r) return;
    this.switchVault(r.kind === "folder" ? folderAt(r.abs) : rootAt(r.abs), null);
  }

  /**
   * An absolute path that belongs to another vault or repository (a link into it, a backlink from
   * it): switch there and open it (17.10); true when it was (or the switch was refused). A loose
   * file opens as it is, beside this vault's notes: it has no vault to switch into.
   */
  private intoOtherVault(path: string, anchor?: Anchor): boolean {
    if (!isAbsolute(path) || !existsSync(path)) return false;
    let target: VaultLocation;
    try {
      target = locateVault({ path });
    } catch {
      return false;
    }
    if (target.mode === "folder" || target.root === this.loc.root) return false;
    this.switchVault(target, path, anchor);
    return true;
  }

  /** Back from the first place in this vault: to the vault before (17.10). */
  private vaultBack(): boolean {
    const t = this.vaultTrail.pop();
    if (!t) return false;
    let target: VaultLocation;
    try {
      target = existsSync(t.path) ? locateVault({ path: t.path }) : locateVault({ path: t.root });
    } catch {
      this.message("warn", `${t.root} is gone`);
      return true;
    }
    if (!this.switchVault(target, existsSync(t.path) ? t.path : null, t.anchor, { back: true }))
      this.vaultTrail.push(t);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Renames (17.15, 7.1–7.3)

  /**
   * A rename's preview (7.2): every line it changes, in every vault, and the warnings (7.3); enter
   * carries it out, esc leaves everything as it was. Refused while a file it touches is unsaved.
   */
  previewRename(
    make: () => RenamePlan,
    apply: (plan: RenamePlan) => void = (plan) => this.applyRename(plan),
    /** Rows of the plan's own (the converter's links to pick for), and what enter on one does: true when it's theirs. */
    extra?: (plan: RenamePlan) => { items: ListItem[]; pick: (item: ListItem) => boolean },
  ): void {
    let plan: RenamePlan;
    try {
      plan = make();
    } catch (err) {
      return this.message("warn", (err as Error).message);
    }
    // What it rewrites, and what it moves: a folder's every file (its open buffers are replaced by the moved files').
    const touched = new Set([
      ...plan.files.map((f) => f.abs),
      ...(plan.move ? [plan.move.from] : []),
      ...(plan.moves ?? []).map(([from]) => join(this.loc.root, from)),
    ]);
    const dirty = this.dirtyBuffers().filter((b) => touched.has(b.abs));
    if (dirty.length)
      return this.message(
        "warn",
        `unsaved: ${dirty.map((b) => this.displayName(b)).join(", ")} — save first: the ${plan.kind === "replace" ? "replace rewrites" : "rename rewrites or moves"} ${dirty.length === 1 ? "it" : "them"}`,
      );
    const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
    const more = extra?.(plan);
    const items: ListItem[] = [
      ...plan.warnings.map((w) => ({ label: `! ${w}`, data: plan })),
      ...(more?.items ?? []),
      ...plan.skipped.map((s) => ({ label: `skipped ${s.shown}:${s.line}`, detail: s.reason, data: plan })),
      // A replace's edit can span lines: each break shown.
      ...plan.files.flatMap((f) =>
        f.edits.map((e) => ({
          label: `${f.shown}:${e.line}`,
          detail: `${e.before.trim().replace(/\n/g, " ⏎ ")}  →  ${e.after.trim().replace(/\n/g, " ⏎ ")}`,
          data: plan,
        })),
      ),
    ];
    if (!plan.files.length)
      items.push({
        label:
          plan.kind === "relink"
            ? "no broken link points where a file moved from"
            : plan.kind === "convert"
              ? "nothing left to convert"
              : plan.kind === "replace"
                ? "nothing to replace"
                : "no links to change",
        data: plan,
      });
    const what =
      plan.kind === "note" || plan.kind === "heading"
        ? `${plan.from} → ${plan.to}`
        : plan.kind === "folder"
          ? `${plan.from}/ → ${plan.to}/`
          : plan.kind === "vault"
            ? `name ${plan.from} → ${plan.to}`
            : plan.kind === "make-vault"
              ? `${plan.from}/ → a root of its own${plan.to !== plan.from ? `, called ${plan.to}` : ""}`
              : plan.kind === "unmake-vault"
                ? `${plan.from}/ → a plain folder of ${plan.to}`
                : plan.kind === "convert"
                  ? "links → plain paths"
                  : plan.kind === "replace"
                    ? `${JSON.stringify(plan.from)} → ${JSON.stringify(plan.to)}`
                    : "relink";
    this.openList({
      title: `${plan.undo ? "undo: " : ""}${what}: ${n} change${n === 1 ? "" : "s"} in ${plan.files.length} file${plan.files.length === 1 ? "" : "s"} — enter: do it, esc: cancel`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => {
        if (!more?.pick(item)) apply(plan);
      },
    });
  }

  /**
   * The converter (20.1): links made plain paths, previewed as a rename is. A link several notes
   * answer to is a row of its own: enter picks its note, and the plan is made again with the pick.
   */
  previewConvert(rels?: string[], picks: Map<string, string> = new Map()): void {
    this.previewRename(
      () => planConvert(this.graph, rels, picks),
      undefined,
      (plan) => ({
        items: (plan.ambiguous ?? []).map((a) => ({
          label: `pick ${a.shown}:${a.line}`,
          detail: `${a.written} — ${a.candidates.length} notes answer to it: enter picks one`,
          data: a,
        })),
        pick: (item) => {
          const a = item.data as Ambiguous | undefined;
          if (!a || !("candidates" in a)) return false;
          this.openList({
            title: `${a.written} in ${a.shown}:${a.line} — which note?`,
            items: a.candidates.map((c) => ({ label: c, data: c })),
            accept: (it) => {
              picks.set(a.key, it.data as string);
              this.previewConvert(rels, picks);
            },
          });
          return true;
        },
      }),
    );
  }

  /** Carry out a previewed rename; open notes follow it (the moved one under its new path). */
  applyRename(plan: RenamePlan): void {
    if ((plan.kind === "relink" || plan.kind === "convert" || plan.kind === "replace") && !plan.files.length) return;
    let applied: Applied;
    try {
      applied = applyPlan(this.graph, plan);
    } catch (err) {
      return this.message("error", (err as Error).message);
    }
    const byAbs = (abs: string) => [...this.buffers.values()].find((b) => b.abs === abs);
    // Every file that moved (a folder's: each in it): its open buffer, views, history and recents
    // follow it to its new path.
    const moved = new Set<string>();
    for (const [fromRel, toRel] of plan.moves ?? []) {
      const old = byAbs(join(this.loc.root, fromRel));
      if (!old) continue;
      const nb = this.buffer(toRel);
      if (nb) {
        for (const v of this.allViews()) {
          for (const l of [...v.back, ...v.fwd]) if (l.key === old.key) l.key = nb.key;
          if (v.buf === old) {
            Object.assign(v, this.makeView(nb, v.topAnchor, v.curAnchor), { back: v.back, fwd: v.fwd });
            this.resetForBuffer(v);
          }
        }
        this.recentNotes = this.recentNotes.map((k) => (k === old.key ? nb.key : k));
        moved.add(nb.abs);
      }
      this.buffers.delete(old.key);
      this.servers?.close(old.abs);
    }
    if (plan.move?.dir) {
      // The folder's folds and selection go with it.
      const [from, to] = [relative(this.loc.root, plan.move.from), relative(this.loc.root, plan.move.to)];
      this.expanded = new Set(
        [...this.expanded].map((d) => (d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d)),
      );
    }
    // A cut that was pasted: done.
    if (plan.move && this.fileClip?.mode === "cut" && join(this.loc.root, this.fileClip.rel) === plan.move.from)
      this.fileClip = null;
    for (const abs of applied.written) {
      const b = byAbs(abs);
      if (b && !moved.has(b.abs)) this.reloadBuffer(b);
    }
    if (plan.makeVault || plan.unmakeVault) {
      // A vault made or unmade (18.11): the walk changed where it was (applyPlan rebuilt the index);
      // the machine's vaults, as reached from here, too.
      this.reach = new Reach(this.loc);
      this.graph.reach = this.reach;
      if (this.live) this.indexInBackground();
    }
    if (plan.vaults?.length) {
      // Vaults moved with a vault's folder (18.7): the machine's list, and this vault's own walk.
      for (const [, to] of plan.vaults) recordLocation(rootAt(to));
      this.graph.build(true, "lazy");
      if (this.live) this.indexInBackground();
    }
    // A vault renamed: this one (its name here), or one nested in it (the explorer's dimmed name).
    const renamedConfig =
      plan.kind === "vault"
        ? plan.files.find((f) => f.abs.endsWith(`${sep}.slipbox${sep}config.toml`))?.abs
        : undefined;
    if (renamedConfig && renamedConfig !== vaultConfigFile(this.loc.root))
      recordLocation(rootAt(dirname(dirname(renamedConfig))));
    if (renamedConfig === vaultConfigFile(this.loc.root)) {
      this.loc = rootAt(this.loc.root);
      recordLocation(this.loc);
      this.reach = new Reach(this.loc);
      this.graph = new Graph(this.loc, this.config).build(true, "lazy");
      this.graph.reach = this.reach;
      this.followGraph();
      if (this.live) this.indexInBackground();
    }
    this.afterFileOp();
    if (plan.move) this.selectInExplorer(relative(this.loc.root, plan.move.to));
    if (plan.makeVault || plan.unmakeVault) this.selectInExplorer(plan.from);
    const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
    const what = plan.undo
      ? {
          note: `renamed ${plan.from} back to ${plan.to}`,
          folder: `moved ${plan.from}/ back to ${plan.to}/`,
          vault: `named the folder ${plan.from} back to ${plan.to}`,
          relink: "undid the relink",
          "make-vault": "",
          "unmake-vault": "",
          heading: `renamed the heading ${plan.from} back to ${plan.to}`,
          convert: "undid the conversion to plain paths",
          replace: `undid the replace of ${JSON.stringify(plan.to)} with ${JSON.stringify(plan.from)}`,
        }[plan.kind]
      : plan.kind === "note" || plan.kind === "heading"
        ? `renamed ${plan.from} → ${plan.to}`
        : plan.kind === "folder"
          ? `moved ${plan.from}/ → ${plan.to}/`
          : plan.kind === "vault"
            ? `named the folder ${plan.from} → ${plan.to}`
            : plan.kind === "make-vault"
              ? `made ${plan.from}/ a root of its own${plan.to !== plan.from ? `, called ${plan.to}` : ""}`
              : plan.kind === "unmake-vault"
                ? `made ${plan.from}/ a plain folder of ${plan.to} (its .slipbox/ is in the trash)`
                : plan.kind === "convert"
                  ? "converted links to plain paths"
                  : plan.kind === "replace"
                    ? `replaced ${JSON.stringify(plan.from)} with ${JSON.stringify(plan.to)}`
                    : "relinked";
    this.message(
      "info",
      `${what}: ${n} change${n === 1 ? "" : "s"} in ${plan.files.length} file${plan.files.length === 1 ? "" : "s"}`,
    );
  }

  /** A find across files' label: what it asks, and which of the window's find toggles are on. */
  acrossLabel(base: string, view = this.view): string {
    const o = view?.findOpts;
    const on = [o?.regex && "regex", o?.whole && "whole words"].filter(Boolean);
    return `${base}${on.length ? ` (${on.join(", ")})` : ""}`;
  }

  /**
   * Replace across files (25.4): what to find — the find's query, or a selection on one line, typed already — then
   * what with, then the rename's preview of every line it changes, in every note and every file the explorer shows;
   * enter does it, `space v shift+u` takes it back. The window's find toggles are its (alt+r, alt+w flip them here).
   * Refused where an unsaved file has a match: its text on disk isn't what's open.
   */
  replaceInEveryNote(): void {
    const view = this.view;
    const opts = () => ({ ...(view?.findOpts ?? { regex: false, whole: false }) });
    const said = (base: string) => () => this.acrossLabel(base, view);
    const selected = view?.sel && !view.sel.line ? this.selectionText(view) : "";
    const seed = selected && !selected.includes("\n") ? selected : (view?.find?.query ?? "");
    const find = said("replace in every note — find");
    this.prompt(find(), (query) => {
      if (!query) return;
      const re = compilePattern(query, opts());
      if (typeof re === "string") return this.message("warn", `not a regex: ${re}`);
      const withLabel = said(`replace ${JSON.stringify(query)} in every note with`);
      this.prompt(withLabel(), (replacement) => {
        // The toggles as they are now: flipped here, the query may be no regex.
        const o = opts();
        const re = compilePattern(query, o);
        if (typeof re === "string") return this.message("warn", `not a regex: ${re}`);
        const rels = [...this.graph.notes.keys(), ...this.shownFiles().map((f) => f.path)];
        const abs = new Set(rels.map((r) => this.graph.abs(r)));
        const dirty = this.dirtyBuffers().filter(
          (b) => abs.has(b.abs) && findAll(b.source, re, 0, b.source.length, o.regex).length,
        );
        if (dirty.length)
          return this.message(
            "warn",
            `unsaved: ${dirty.map((b) => this.displayName(b)).join(", ")} — save first: the replace rewrites ${dirty.length === 1 ? "it" : "them"}`,
          );
        this.previewRename(() => planReplace(this.graph, query, replacement, rels, o));
      });
      if (view) (this.overlay as PromptOverlay).toggles = { view, label: withLabel };
    });
    (this.overlay as PromptOverlay).text = seed;
    if (view) (this.overlay as PromptOverlay).toggles = { view, label: find };
  }

  /** Undo the vault's last rename, move or relink (7.4): its preview, then carried out as a rename is. */
  undoRename(): void {
    this.previewRename(() => planUndo(this.graph));
  }

  /** Ask for a note's new path, then preview its rename. */
  promptRename(rel: string): void {
    this.prompt(`rename or move ${rel} to: `, (to) => {
      if (to.trim()) this.renameNoteTo(rel, to.trim());
    });
    (this.overlay as PromptOverlay).text = rel.replace(/\.(md|markdown)$/i, "");
  }

  /** Preview a note's rename or move to a typed path: a folder there, or a path ending in `/`, is into it (DF-D4). */
  renameNoteTo(rel: string, to: string): void {
    this.previewRename(() => planNoteRename(this.graph, rel, moveTarget(this.graph, rel, to)));
  }

  /** Ask for a heading's new name, then preview its rename (11.9): every link to it fixed. */
  promptHeadingRename(rel: string, heading: string): void {
    this.prompt(`rename the heading "${heading}" to: `, (to) => {
      if (to.trim()) this.previewRename(() => planHeadingRename(this.graph, rel, heading, to.trim()));
    });
    (this.overlay as PromptOverlay).text = heading;
  }

  /**
   * Make a loose folder `dir` a vault (`vault.init`): the choice, as a list. A git checkout is a vault
   * already (20.3), so a loose folder is never one: `.slipbox/` is the only way.
   */
  vaultChoices(dir: string): void {
    const items: ListItem[] = [
      {
        label: "Give it .slipbox/",
        detail: "settings of its own — committed with the folder like any file; :name names it for pointers",
        data: "vault",
      },
      { label: "Cancel", detail: "", data: "no" },
    ];
    this.openList({
      title: `${dir} is a folder without .slipbox/ — give it one?`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => (item.data === "no" ? undefined : this.makeVault(dir, false)),
    });
  }

  /** The links a move by hand broke, in and out of the root (20.17): their fix previewed — never written unasked. */
  private offerMovedRelink(): void {
    if (this.overlay) return;
    try {
      if (planRelink(this.graph).files.length) this.previewRename(() => planRelink(this.graph));
    } catch {}
  }

  /** Give `dir` a `.slipbox/` and go into it, the note open (17.18). */
  makeVault(dir: string, privately: boolean): void {
    const open = this.view?.buf.abs ?? null;
    let r: ReturnType<typeof initVault>;
    try {
      r = initVault(dir, undefined, { private: privately });
    } catch (err) {
      return this.message("warn", (err as Error).message);
    }
    this.switchVault(rootAt(r.root), open && existsSync(open) && open.startsWith(`${r.root}/`) ? open : null);
    this.message(
      "info",
      `${tildePath(r.root)} has its .slipbox/ now${r.excluded ? ` (private: in ${r.excluded})` : ""} — :name names it for pointers`,
    );
  }

  /**
   * The named folders to go into (21.6, 21.10): each by the name a pointer gives it, the copy it opens
   * here (its default, else one that's here) — this folder's own left out; those seen last first.
   */
  folderChoices(): { folder: NamedFolder; path: string; name: string }[] {
    const list = readFolders();
    const here = this.loc.root;
    const out: { folder: NamedFolder; path: string; name: string; seen: string }[] = [];
    for (const f of list) {
      const l = lookupFolder(pointerName(f, list), list);
      const path = l.status === "found" ? l.path : null;
      const seen = f.copies.find((c) => c.path === path)?.seen ?? "";
      if (path && path !== here) out.push({ folder: f, path, name: pointerName(f, list), seen });
    }
    return out.sort((a, b) => b.seen.localeCompare(a.seen) || a.name.localeCompare(b.name));
  }

  /** The named folders (`:folders`, `space v v`): enter goes into one (17.10). */
  openFolders(): void {
    const choices = this.folderChoices();
    if (!choices.length)
      return this.message(
        "info",
        "no other named folders here yet: a .slipbox/ name (:name), or a repository's remote, names one",
      );
    this.openList({
      title: `Folders (${choices.length}) — enter goes into one`,
      items: choices.map((c) => ({
        label: c.name,
        detail: tildePath(c.path),
        hint: c.folder.copies.length > 1 ? `${c.folder.copies.length} copies` : undefined,
        data: c.path,
      })),
      accept: (item) => {
        this.switchVault(rootAt(item.data as string), null);
      },
    });
  }

  /** Which copy a named folder's links open here (`:folders-default`; `slipbox folders default`). */
  chooseDefaultCopy(): void {
    // A repository's copies, a clone with a .slipbox/ name of its own among them (DF-D30).
    const all = readFolders();
    const copiesOf = (f: NamedFolder) => repositoryCopies(f, all);
    const list = all.filter((f) => copiesOf(f).length > 1);
    if (!list.length)
      return this.message("info", "no named folder has two copies here: each one's links open the only one");
    const pick = (f: NamedFolder) =>
      this.openList({
        title: `${f.name}: which copy do links open?`,
        filterable: false,
        selected: Math.max(
          0,
          copiesOf(f).findIndex((c) => c.path === f.default),
        ),
        items: copiesOf(f).map((c) => ({
          label: tildePath(c.path),
          hint: c.path === f.default ? "links open it" : copyAvailable(c.path) ? undefined : "not here",
          data: c.path,
        })),
        accept: (copy) => {
          setDefaultCopy(f.key, copy.data as string);
          this.message("info", `links to ${f.name} open ${tildePath(copy.data as string)}`);
        },
      });
    const ident = this.loc.mode === "vault" ? folderIdentity(this.loc.root) : null;
    const mine = list.find((f) => f.key === ident?.key);
    if (mine || list.length === 1) return pick(mine ?? list[0]!);
    this.openList({
      title: "Which folder's copies?",
      items: list.map((f) => ({ label: pointerName(f, list), hint: `${copiesOf(f).length} copies`, data: f })),
      accept: (item) => pick(item.data as NamedFolder),
    });
  }
}

/** A named folder moved here by hand, its state along (21.8): said once. */
function carried(loc: VaultLocation, from: string): string {
  return `${rootLabel(loc)} moved here from ${tildePath(from)}: its sessions, scratch, trash and reading positions came along`;
}

// ---------------------------------------------------------------------------------------------

/** Keys that run the same action share one which-key entry: `h left → Narrower`. */
function mergeSameAction(
  entries: { key: string; label: string; desc: string; group: boolean; spec: string | null }[],
): { key: string; label: string; desc: string; group: boolean }[] {
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
  const computed = o.source?.(o.input) ?? null;
  if (computed) {
    o.filtered = computed.map((item) => ({ item, positions: [] }));
  } else if (o.keepGroups && o.input.trim()) {
    // The matches in their original order, each under its group heading (with its blank row and
    // rule); a group with no match disappears, and the list never starts with a blank row.
    const ranked = rank(
      o.input,
      o.items.filter((i) => !i.header),
      (i) => [i.label, i.detail ?? ""],
    );
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
      for (const hd of heading)
        if (o.filtered.length || hd.label || hd.rule) o.filtered.push({ item: hd, positions: [] });
      heading = [];
      o.filtered.push({ item, positions: hit.get(item)! });
    }
  } else if (o.input.trim()) {
    const ranked = rank(
      o.input,
      o.items.filter((i) => !i.header),
      (i) => [i.label, i.detail ?? ""],
    );
    o.filtered = ranked.map((r) => ({ item: r.item, positions: r.match.positions }));
  } else {
    o.filtered = o.items.map((item) => ({ item, positions: [] }));
  }
  o.scroll = 0;
  o.wheeled = false;
  const hit = o.filtered.findIndex((e) => e.item.context);
  o.selected =
    hit >= 0
      ? Math.max(
          0,
          o.filtered.findIndex((e) => !e.item.context && !e.item.header),
        )
      : selectable(o, 0, 1);
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

/** The task whose checkbox glyph is at this cell, if any (its trailing space doesn't count). */
export function taskMarkAt(
  layout: Layout,
  row: number,
  col: number,
): { line: number; end: number; checked: boolean } | null {
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

/** Link index at a layout cell, or -1. */
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

export function computeFind(
  layout: Layout,
  query: string,
  current = 0,
  whole = false,
  regex = false,
  ignoreCase = false,
): FindState {
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
        for (const m of findAll(text, re))
          matches.push({ row, col: stringWidth(text.slice(0, m.from)), len: stringWidth(text.slice(m.from, m.to)) });
      });
    }
  }
  return { query, matches, current: Math.min(current, Math.max(0, matches.length - 1)), whole, regex, error };
}

/** A symbol's kind by its number, as the outline names it (`function`, `class`). */
export const KIND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(SymbolKind).map(([name, n]) => [n, name.toLowerCase()]),
);

/** A server's symbols as an outline: nested ones (`DocumentSymbol`) by their depth, flat ones in line order. */
function outlineOf(symbols: DocumentSymbol[] | SymbolInformation[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const walk = (list: DocumentSymbol[], depth: number) => {
    for (const d of [...list].sort((a, b) => a.selectionRange.start.line - b.selectionRange.start.line)) {
      out.push({ name: d.name, kind: KIND_NAMES[d.kind] ?? "symbol", line: d.selectionRange.start.line + 1, depth });
      if (d.children?.length) walk(d.children, depth + 1);
    }
  };
  if (symbols.length && "selectionRange" in symbols[0]!) walk(symbols as DocumentSymbol[], 0);
  else
    for (const i of [...(symbols as SymbolInformation[])].sort(
      (a, b) => a.location.range.start.line - b.location.range.start.line,
    ))
      out.push({ name: i.name, kind: KIND_NAMES[i.kind] ?? "symbol", line: i.location.range.start.line + 1, depth: 0 });
  return out;
}

/** Whether `path` is a folder (through a link); false where nothing's there. */
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
