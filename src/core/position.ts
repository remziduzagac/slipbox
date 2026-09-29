// Reading position per note (3.4) and reload anchoring (decision 3.5).
//
// A position is stored in *source* terms — never rendered rows, which change with every resize.
// The anchor is the nearest heading above the top of the viewport (slug plus occurrence), the
// source-line offset from it, and the absolute source line as a fallback. An agent inserting a
// paragraph above your reading position therefore does not move you.

import { isAbsolute, join } from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import type { Layout } from "./layout/ir.ts";
import { type Keyed, stateDir, vaultKey } from "./paths.ts";

/** Where a vault's positions and session live: its state directory. The home vault holds every
 *  loose folder's, so its keys are absolute and each folder has its own session (17.2). */
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
  return { heading: heading.slug, headingIndex, offset: src - heading.src, line: src, headingText: heading.text, nth, nthFromEnd: same.length - 1 - nth, rowText: rowTextOf(layout, probe), rowAfter: probe - top };
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
    const tries = [same[anchor.nth], same[same.length - 1 - anchor.nthFromEnd]].filter((h): h is NonNullable<typeof h> => !!h);
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

/** First row whose source line is ≥ `src` (rows are in source order). */
export function rowForSource(layout: Layout, src: number): number {
  for (let i = 0; i < layout.lines.length; i++) if (layout.lines[i]!.src >= src) return i;
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

type PositionMap = Record<string, Anchor & { at: string; cursor?: CursorAnchor }>;

const MAX_POSITIONS = 2000;

export class PositionStore {
  private readonly file: string;
  private data: PositionMap;
  /** The home vault's loose folder: keys are made absolute against it. */
  private readonly base: string | null;

  constructor(place: StatePlace) {
    this.file = join(stateDir(place), "positions.json");
    this.base = place.mode === "home" ? place.root : null;
    const raw = readJson<unknown>(this.file, {});
    this.data = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!isAnchor(v)) continue;
        const entry = v as PositionMap[string];
        if (entry.cursor !== undefined && !isCursorAnchor(entry.cursor)) delete entry.cursor;
        this.data[k] = entry;
      }
    }
  }

  /** The stored key for a buffer's key (a vault path, or absolute). */
  private k(rel: string): string {
    return this.base && !isAbsolute(rel) ? join(this.base, rel) : rel;
  }

  get(rel: string): Anchor | null {
    const a = this.data[this.k(rel)];
    return a ? { heading: a.heading, headingIndex: a.headingIndex, offset: a.offset, line: a.line } : null;
  }

  getCursor(rel: string): CursorAnchor | null {
    return this.data[this.k(rel)]?.cursor ?? null;
  }

  set(rel: string, anchor: Anchor, cursor?: CursorAnchor): void {
    this.data[this.k(rel)] = { ...anchor, at: new Date().toISOString(), ...(cursor ? { cursor } : {}) };
  }

  save(): void {
    // Another slipbox on this vault may have saved since this one loaded: its entries are kept,
    // the newer of two for the same note winning (never last-quit-wins).
    const onDisk = readJson<Record<string, { at?: string }>>(this.file, {});
    if (onDisk && typeof onDisk === "object" && !Array.isArray(onDisk)) {
      for (const [k, v] of Object.entries(onDisk)) {
        const mine = this.data[k];
        if (v && typeof v.at === "string" && isAnchor(v) && (!mine || mine.at < v.at)) this.data[k] = v as (typeof this.data)[string];
      }
    }
    const entries = Object.entries(this.data);
    if (entries.length > MAX_POSITIONS) {
      entries.sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
      this.data = Object.fromEntries(entries.slice(0, MAX_POSITIONS));
    }
    try {
      writeJson(this.file, this.data);
    } catch {}
  }
}

export interface SessionPane {
  path: string;
  anchor: Anchor;
  cursor?: CursorAnchor;
}

/** A UI setting changed in the TUI, with the config value it overrode (see keymap.md). */
export interface UiOverride {
  value: unknown;
  base: unknown;
}

export interface SessionState {
  version: 1;
  tabs: { panes: SessionPane[]; active: number; orientation?: "side" | "stacked"; ratio?: number; pinned?: boolean }[];
  activeTab: number;
  sidebar: boolean;
  outline?: boolean;
  sidebar_width?: number;
  outline_width?: number;
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
    !!a && typeof a === "object" && (a.heading === null || typeof a.heading === "string") &&
    Number.isInteger(a.headingIndex) && Number.isInteger(a.offset) && Number.isInteger(a.line)
  );
}

/** The session file: one per vault; in the home vault, one per loose folder. */
export function sessionFile(place: StatePlace): string {
  return place.mode === "home" ? join(stateDir(place), "sessions", `${vaultKey(place.root)}.json`) : join(stateDir(place), "session.json");
}

/** Load the session, dropping anything malformed rather than failing to start. */
export function loadSession(place: StatePlace): SessionState | null {
  const s = readJson<SessionState | null>(sessionFile(place), null);
  if (!s || typeof s !== "object" || s.version !== 1 || !Array.isArray(s.tabs)) return null;
  const tabs = s.tabs
    .filter((t) => t && Array.isArray(t.panes))
    .map((t) => ({
      panes: t.panes
        .filter((p) => p && typeof p.path === "string" && p.path)
        .map((p) => ({ path: p.path, anchor: isAnchor(p.anchor) ? p.anchor : { ...TOP }, ...(isCursorAnchor(p.cursor) ? { cursor: p.cursor } : {}) }))
        .slice(0, 2),
      active: Number.isInteger(t.active) ? t.active : 0,
      orientation: t.orientation === "stacked" ? ("stacked" as const) : ("side" as const),
      ratio: typeof t.ratio === "number" && t.ratio >= 0.15 && t.ratio <= 0.85 ? t.ratio : undefined,
      pinned: t.pinned === true ? true : undefined,
    }))
    .filter((t) => t.panes.length);
  return {
    version: 1,
    tabs,
    activeTab: Number.isInteger(s.activeTab) ? s.activeTab : 0,
    sidebar: typeof s.sidebar === "boolean" ? s.sidebar : true,
    outline: typeof s.outline === "boolean" ? s.outline : undefined,
    sidebar_width: validWidth(s.sidebar_width),
    outline_width: validWidth(s.outline_width),
    theme: typeof s.theme === "string" ? s.theme : undefined,
    ui: s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : {},
    recent_commands: Array.isArray(s.recent_commands) ? s.recent_commands.filter((x) => typeof x === "string") : [],
    recent_notes: Array.isArray(s.recent_notes) ? s.recent_notes.filter((x) => typeof x === "string") : [],
    remote_server: typeof s.remote_server === "string" ? s.remote_server : undefined,
  };
}

function validWidth(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 12 && v <= 200 ? v : undefined;
}

export function saveSession(place: StatePlace, s: SessionState): void {
  try {
    writeJson(sessionFile(place), s);
  } catch {}
}
