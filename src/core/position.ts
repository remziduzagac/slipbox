// Reading position per note (3.4) and reload anchoring (decision 3.5).
//
// A position is stored in *source* terms — never rendered rows, which change with every resize.
// The anchor is the nearest heading above the top of the viewport (slug plus occurrence), the
// source-line offset from it, and the absolute source line as a fallback. An agent inserting a
// paragraph above your reading position therefore does not move you.

import { existsSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { climbsOut, ensureDir, readJson, writeJson } from "./fsutil.ts";
import type { Layout } from "./layout/ir.ts";
import { type Keyed, stateDir, stateHome } from "./paths.ts";

/** Where a root's session lives: its state directory, by its path (21.8) — a plain folder's too. */
export interface StatePlace extends Keyed {
  mode: string;
  root: string;
}

export interface Anchor {
  heading: string | null;
  /** Occurrence index among headings with the same slug. */
  headingIndex: number;
  offset: number;
  line: number;
  /**
   * For headings that repeat (a log's `## Weather` entries): the heading's text, its occurrence
   * among those counted from the top and from the bottom, and the anchored row's text. An entry an
   * agent prepends shifts the one count but not the other; the row's text says which still holds.
   */
  headingText?: string;
  nth?: number;
  nthFromEnd?: number;
  rowText?: string;
  /** How many rows below the anchored one `rowText` is (it skips the heading and blank rows). */
  rowAfter?: number;
}

export const TOP: Anchor = { heading: null, headingIndex: 0, offset: 0, line: 1 };

/** The anchor for a viewport whose top row is `top`. */
export function anchorAt(layout: Layout, top: number): Anchor {
  const line = layout.lines[Math.max(0, Math.min(top, layout.lines.length - 1))];
  if (!line || top <= 0) return { ...TOP };
  const src = line.src;
  let heading: Layout["headings"][number] | null = null;
  for (const h of layout.headings) {
    if (h.line <= top) heading = h;
    else break;
  }
  if (!heading) return { heading: null, headingIndex: 0, offset: src - 1, line: src };
  const headingIndex = layout.headings.filter((h) => h.slug === heading!.slug && h.line < heading!.line).length;
  const same = layout.headings.filter((h) => h.text === heading!.text);
  if (same.length < 2) return { heading: heading.slug, headingIndex, offset: src - heading.src, line: src };
  const nth = same.indexOf(heading);
  // The row whose text tells the entries apart: the anchored row, or when that's a heading (the
  // same text in every entry) the first row of text after it.
  let probe = top;
  while (probe < layout.lines.length - 1 && (probe === heading.line || !rowTextOf(layout, probe))) probe++;
  return {
    heading: heading.slug,
    headingIndex,
    offset: src - heading.src,
    line: src,
    headingText: heading.text,
    nth,
    nthFromEnd: same.length - 1 - nth,
    rowText: rowTextOf(layout, probe),
    rowAfter: probe - top,
  };
}

function rowTextOf(layout: Layout, row: number): string {
  return (layout.lines[row]?.spans.map((s) => s.text).join("") ?? "").trim().slice(0, 60);
}

/** The top row for an anchor in a (possibly re-laid-out, possibly edited) layout. */
export function rowFor(layout: Layout, anchor: Anchor): number {
  if (!layout.lines.length) return 0;
  let targetSrc = anchor.line;
  if (anchor.headingText !== undefined && anchor.nth !== undefined && anchor.nthFromEnd !== undefined) {
    // A repeated heading: counted from the top, or from the bottom — whichever still has the row.
    const same = layout.headings.filter((h) => h.text === anchor.headingText);
    const tries = [same[anchor.nth], same[same.length - 1 - anchor.nthFromEnd]].filter(
      (h): h is NonNullable<typeof h> => !!h,
    );
    for (const h of tries) {
      const row = rowForSource(layout, h.src + anchor.offset);
      if (anchor.rowText && rowTextOf(layout, row + (anchor.rowAfter ?? 0)).startsWith(anchor.rowText)) return row;
    }
    if (tries[0]) return rowForSource(layout, tries[0].src + anchor.offset);
  }
  if (anchor.heading) {
    const matches = layout.headings.filter((h) => h.slug === anchor.heading);
    const h = matches[anchor.headingIndex] ?? matches[0];
    if (h) targetSrc = h.src + anchor.offset;
  } else if (anchor.line <= 1) return 0;
  return rowForSource(layout, targetSrc);
}

/**
 * The row holding source line `src` (rows are in source order): the first row of that line; else —
 * a line inside a block that wraps, where no row starts (a paragraph's later line) — the last row
 * before it, the block holding it, not the next block; past the end, the last row.
 */
export function rowForSource(layout: Layout, src: number): number {
  let before = -1;
  for (let i = 0; i < layout.lines.length; i++) {
    const at = layout.lines[i]!.src;
    if (at === src) return i;
    if (at > src) return before >= 0 ? before : i;
    before = i;
  }
  return Math.max(0, layout.lines.length - 1);
}

/** Where the reading cursor is, in source terms: an anchor for its row, which of that source
 *  line's wrapped rows it is on, and its display column. */
export interface CursorAnchor {
  anchor: Anchor;
  sub: number;
  col: number;
}

export function isCursorAnchor(v: unknown): v is CursorAnchor {
  const c = v as CursorAnchor;
  return !!c && typeof c === "object" && isAnchor(c.anchor) && Number.isInteger(c.sub) && Number.isInteger(c.col);
}

type PositionEntry = Anchor & { at: string; cursor?: CursorAnchor /** The root it was read from. */; root?: string };
type PositionMap = Record<string, PositionEntry>;

/** The newest kept, across every root. */
const MAX_POSITIONS = 5000;

/** Reading positions, by file (21.8): one file for the machine, each note by its absolute path. */
export function positionsFile(): string {
  return join(stateHome(), "positions.json");
}

function readPositions(file: string): PositionMap {
  const raw = readJson<unknown>(file, {});
  const out: PositionMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAnchor(v)) continue;
    const entry = v as PositionEntry;
    if (typeof entry.at !== "string") continue;
    if (entry.cursor !== undefined && !isCursorAnchor(entry.cursor)) delete entry.cursor;
    out[k] = entry;
  }
  return out;
}

/** The newer of each note's, on disk and here: never last-quit-wins. */
function merged(mine: PositionMap, theirs: PositionMap): PositionMap {
  const out = { ...mine };
  for (const [k, v] of Object.entries(theirs)) if (!out[k] || out[k].at < v.at) out[k] = v;
  return out;
}

function writePositions(data: PositionMap): void {
  let entries = Object.entries(data);
  if (entries.length > MAX_POSITIONS)
    entries = entries.sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(0, MAX_POSITIONS);
  try {
    ensureDir(stateHome());
    writeJson(positionsFile(), Object.fromEntries(entries));
  } catch {}
}

/**
 * A root moved by hand, its state carried along (21.8): its notes' positions, kept by path, follow
 * it from `from` to `to`.
 */
export function carryPositions(from: string, to: string): void {
  const data = readPositions(positionsFile());
  const out: PositionMap = {};
  let moved = false;
  for (const [k, v] of Object.entries(data)) {
    const rel = relative(from, k);
    const inside = rel !== "" && !climbsOut(rel);
    const root = v.root === from ? to : v.root;
    if (inside || root !== v.root) moved = true;
    out[inside ? join(to, rel) : k] = { ...v, ...(root ? { root } : {}) };
  }
  if (moved) writePositions(out);
}

/**
 * The reading positions a root uses: the machine's, by file (21.8) — so a note opened from another
 * root, or `project/docs/` opened instead of `project/`, is where it was left. Asked by a root path
 * (`notes/a.md`) or an absolute one. The positions a root kept itself before are taken in once.
 */
export class PositionStore {
  private data: PositionMap;

  constructor(private readonly place: StatePlace) {
    this.data = readPositions(positionsFile());
    // Today's, moved once: the root's own positions.json (before 21.8), by its paths.
    const own = join(stateDir(place), "positions.json");
    if (existsSync(own)) {
      const before: PositionMap = {};
      for (const [k, v] of Object.entries(readPositions(own)))
        before[isAbsolute(k) ? k : join(place.root, k)] = { ...v, root: place.root };
      this.data = merged(this.data, before);
      writePositions(this.data);
      rmSync(own, { force: true });
    }
  }

  /** The stored key for a buffer's key: a root path, or absolute (a file outside it). */
  private k(rel: string): string {
    return isAbsolute(rel) ? rel : join(this.place.root, rel);
  }

  /** A stored key as this root names it: a path in it, else absolute. */
  private shown(abs: string): string {
    const rel = relative(this.place.root, abs);
    return rel && !climbsOut(rel) ? rel.split(sep).join("/") : abs;
  }

  /**
   * The notes read here, with when and the line: this root's files, and those read from it outside
   * it — each by the key a buffer has.
   */
  entries(): { key: string; at: string; line: number }[] {
    return Object.entries(this.data)
      .filter(([k, v]) => v.root === this.place.root || this.shown(k) !== k)
      .map(([k, v]) => ({ key: this.shown(k), at: v.at, line: v.cursor?.anchor.line ?? v.line }));
  }

  /** When a note was last read (ISO 8601), if it ever was. */
  readAt(rel: string): string | null {
    return this.data[this.k(rel)]?.at ?? null;
  }

  get(rel: string): Anchor | null {
    const a = this.data[this.k(rel)];
    return a ? { heading: a.heading, headingIndex: a.headingIndex, offset: a.offset, line: a.line } : null;
  }

  getCursor(rel: string): CursorAnchor | null {
    return this.data[this.k(rel)]?.cursor ?? null;
  }

  set(rel: string, anchor: Anchor, cursor?: CursorAnchor): void {
    this.data[this.k(rel)] = {
      ...anchor,
      at: new Date().toISOString(),
      root: this.place.root,
      ...(cursor ? { cursor } : {}),
    };
  }

  save(): void {
    // Another slipbox may have saved since this one loaded: its entries are kept, the newer of two
    // for the same note winning (never last-quit-wins).
    this.data = merged(this.data, readPositions(positionsFile()));
    writePositions(this.data);
  }
}

/** A place in a window's timeline (its back and forward stacks). */
export interface SessionPlace {
  key: string;
  anchor: Anchor;
  cursor?: CursorAnchor;
}

export interface SessionPane {
  path: string;
  anchor: Anchor;
  cursor?: CursorAnchor;
  /** The window's history (3.6), oldest first, and its forward stack: kept across restarts. */
  back?: SessionPlace[];
  fwd?: SessionPlace[];
}

/** A timeline read back: malformed places dropped, the newest kept. */
function places(v: unknown): SessionPlace[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p) => p && typeof p.key === "string" && p.key && isAnchor(p.anchor))
    .map((p) => ({ key: p.key, anchor: p.anchor, ...(isCursorAnchor(p.cursor) ? { cursor: p.cursor } : {}) }))
    .slice(-SESSION_HISTORY);
}

/** Places of each window's history kept in the session, each way. */
export const SESSION_HISTORY = 50;

/** A UI setting changed in the TUI, with the config value it overrode (see keymap.md). */
export interface UiOverride {
  value: unknown;
  base: unknown;
}

export interface SessionTab {
  panes: SessionPane[];
  active: number;
  orientation?: "side" | "stacked";
  ratio?: number;
  pinned?: boolean;
}

/** A workspace kept apart (WSP-D1), and when it was left: a branch's (5.9), a folder of home's (VV-D2). */
export interface TabSet {
  tabs: SessionTab[];
  activeTab: number;
  at: string;
}

/** A vault's `session.json`: its workspaces, and what they share (WSP-D2): the panes, the UI overrides, the recents. */
export interface SessionState {
  version: 1;
  /** The tabs as they were last — whatever the branch, or the folder of home: the vault's own workspace. */
  tabs: SessionTab[];
  activeTab: number;
  /** The tabs each branch had when it was left (5.9): a switch back brings them back. */
  branches?: Record<string, TabSet>;
  /** Home's (VV-D2): the tabs of each folder of it opened by name (`slipbox ~/notes`), by home's path for it, and of
   *  its top (`""`) — each brought back when it's opened again. */
  folders?: Record<string, TabSet>;
  sidebar: boolean;
  outline?: boolean;
  sidebar_width?: number;
  outline_width?: number;
  /** The Problems panel's height, as resized (1.7). */
  problems_height?: number;
  theme?: string;
  ui?: Record<string, UiOverride>;
  /** Commands run from the palette or help, most recent first. */
  recent_commands?: string[];
  /** Notes and files shown, most recent first (the switcher lists them first). */
  recent_notes?: string[];
  /** The nvim socket `space n s` sends to (picked once, then used while it answers). */
  remote_server?: string;
}

export function isAnchor(v: unknown): v is Anchor {
  const a = v as Anchor;
  return (
    !!a &&
    typeof a === "object" &&
    (a.heading === null || typeof a.heading === "string") &&
    Number.isInteger(a.headingIndex) &&
    Number.isInteger(a.offset) &&
    Number.isInteger(a.line)
  );
}

/** The session file: one per root, and per plain folder opened (21.8). */
export function sessionFile(place: StatePlace): string {
  return join(stateDir(place), "session.json");
}

/** Load the session, dropping anything malformed rather than failing to start. */
export function loadSession(place: StatePlace): SessionState | null {
  const s = readJson<SessionState | null>(sessionFile(place), null);
  if (!s || typeof s !== "object" || s.version !== 1 || !Array.isArray(s.tabs)) return null;
  const tabs = sessionTabs(s.tabs);
  const folders = tabSets(s.folders);
  return {
    version: 1,
    tabs,
    activeTab: Number.isInteger(s.activeTab) ? s.activeTab : 0,
    branches: tabSets(s.branches) ?? {},
    ...(folders ? { folders } : {}),
    sidebar: typeof s.sidebar === "boolean" ? s.sidebar : true,
    outline: typeof s.outline === "boolean" ? s.outline : undefined,
    sidebar_width: validWidth(s.sidebar_width),
    outline_width: validWidth(s.outline_width),
    problems_height:
      typeof s.problems_height === "number" &&
      Number.isInteger(s.problems_height) &&
      s.problems_height >= 3 &&
      s.problems_height <= 200
        ? s.problems_height
        : undefined,
    theme: typeof s.theme === "string" ? s.theme : undefined,
    ui: s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : {},
    recent_commands: Array.isArray(s.recent_commands) ? s.recent_commands.filter((x) => typeof x === "string") : [],
    recent_notes: Array.isArray(s.recent_notes) ? s.recent_notes.filter((x) => typeof x === "string") : [],
    remote_server: typeof s.remote_server === "string" ? s.remote_server : undefined,
  };
}

/** Sets of tabs by name as the session holds them (a branch's, a folder's), anything malformed dropped; none, null. */
function tabSets(v: unknown): Record<string, TabSet> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, TabSet> = {};
  for (const [k, x] of Object.entries(v as Record<string, TabSet>)) {
    if (!x || typeof x !== "object" || !Array.isArray(x.tabs)) continue;
    out[k] = {
      tabs: sessionTabs(x.tabs),
      activeTab: Number.isInteger(x.activeTab) ? x.activeTab : 0,
      at: typeof x.at === "string" ? x.at : "",
    };
  }
  return out;
}

/** Tabs as the session holds them, anything malformed dropped. */
function sessionTabs(list: unknown[]): SessionTab[] {
  return (list as SessionTab[])
    .filter((t) => t && Array.isArray(t.panes))
    .map((t) => ({
      panes: t.panes
        .filter((p) => p && typeof p.path === "string" && p.path)
        .map((p) => ({
          path: p.path,
          anchor: isAnchor(p.anchor) ? p.anchor : { ...TOP },
          ...(isCursorAnchor(p.cursor) ? { cursor: p.cursor } : {}),
          back: places(p.back),
          fwd: places(p.fwd),
        }))
        .slice(0, 2),
      active: Number.isInteger(t.active) ? t.active : 0,
      orientation: t.orientation === "stacked" ? ("stacked" as const) : ("side" as const),
      ratio: typeof t.ratio === "number" && t.ratio >= 0.15 && t.ratio <= 0.85 ? t.ratio : undefined,
      pinned: t.pinned === true ? true : undefined,
    }))
    .filter((t) => t.panes.length);
}

/** How many branches' tabs a session keeps: the ones left most recently. */
export const SESSION_BRANCHES = 30;

/** How many folders of home a session keeps the tabs of (VV-D2): its top's, and those left most recently. */
export const SESSION_FOLDERS = 30;

function validWidth(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 12 && v <= 200 ? v : undefined;
}

export function saveSession(place: StatePlace, s: SessionState): void {
  try {
    writeJson(sessionFile(place), s);
  } catch {}
}
