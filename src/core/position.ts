// Reading position per note (3.4) and reload anchoring (decision 3.5).
//
// A position is stored in *source* terms — never rendered rows, which change with every resize.
// The anchor is the nearest heading above the top of the viewport (slug plus occurrence), the
// source-line offset from it, and the absolute source line as a fallback. An agent inserting a
// paragraph above your reading position therefore does not move you.

import { join } from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import type { Layout } from "./layout/ir.ts";
import { stateDir } from "./paths.ts";

export interface Anchor {
  heading: string | null;
  /** Occurrence index among headings with the same slug. */
  headingIndex: number;
  offset: number;
  line: number;
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
  return { heading: heading.slug, headingIndex, offset: src - heading.src, line: src };
}

/** The top row for an anchor in a (possibly re-laid-out, possibly edited) layout. */
export function rowFor(layout: Layout, anchor: Anchor): number {
  if (!layout.lines.length) return 0;
  let targetSrc = anchor.line;
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

  constructor(root: string) {
    this.file = join(stateDir(root), "positions.json");
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

  get(rel: string): Anchor | null {
    const a = this.data[rel];
    return a ? { heading: a.heading, headingIndex: a.headingIndex, offset: a.offset, line: a.line } : null;
  }

  getCursor(rel: string): CursorAnchor | null {
    return this.data[rel]?.cursor ?? null;
  }

  set(rel: string, anchor: Anchor, cursor?: CursorAnchor): void {
    this.data[rel] = { ...anchor, at: new Date().toISOString(), ...(cursor ? { cursor } : {}) };
  }

  save(): void {
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
  tabs: { panes: SessionPane[]; active: number; orientation?: "side" | "stacked"; ratio?: number }[];
  activeTab: number;
  sidebar: boolean;
  outline?: boolean;
  sidebar_width?: number;
  outline_width?: number;
  theme?: string;
  ui?: Record<string, UiOverride>;
  /** Commands run from the palette or help, most recent first. */
  recent_commands?: string[];
}

export function isAnchor(v: unknown): v is Anchor {
  const a = v as Anchor;
  return (
    !!a && typeof a === "object" && (a.heading === null || typeof a.heading === "string") &&
    Number.isInteger(a.headingIndex) && Number.isInteger(a.offset) && Number.isInteger(a.line)
  );
}

/** Load the session, dropping anything malformed rather than failing to start. */
export function loadSession(root: string): SessionState | null {
  const s = readJson<SessionState | null>(join(stateDir(root), "session.json"), null);
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
  };
}

function validWidth(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 12 && v <= 200 ? v : undefined;
}

export function saveSession(root: string, s: SessionState): void {
  try {
    writeJson(join(stateDir(root), "session.json"), s);
  } catch {}
}
