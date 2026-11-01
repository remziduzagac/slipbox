import type { Config } from "../../../core/application/config/config.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { Anchor, CursorAnchor, SessionState } from "../../../core/workspace/session/position.ts";
import type { VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import type { TerminalAnswer } from "../../../core/application/distribution/report.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import type { Pos } from "../../documents/editing/cursor.ts";
import type { LiveBase } from "../../documents/editing/lens.ts";
import type { ReplaceState } from "../../documents/search/replacing.ts";
import type { SaveAsOverlay } from "../../documents/saving/saveas.ts";
import type { DialogOverlay } from "../../shell/overlays/dialog.ts";
import type { ListOverlay } from "../../shell/overlays/list-types.ts";
import type { Region } from "../../shell/panels/panels.ts";
import type { DiffWindow } from "../../workspace/git/views/changes/diffview.ts";
import type { MergeState } from "../../workspace/git/views/review/mergescreen.ts";
import type { Review } from "../../workspace/git/views/review/review.ts";
import type { Peek } from "../../documents/navigation/peek.ts";
import type { Level } from "../notifications/contracts.ts";
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

export type { Region };

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

export interface AppOptions {
  loc: VaultLocation;
  config: Config;
  graph: Graph;
  host: Host;
  warnings?: string[];
  /** Said on opening, as information: what `--base` kept (D255). */
  notes?: string[];
  open?: string | null;
  /** The startup path has no file yet; saving creates it. */
  newFile?: boolean;
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

export type FloatingWindow =
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
  | null;
