// History: each window's timeline of places (back and forward, as a browser's), the notes read lately, and the
// history view that lists both.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { stopInsert } from "./editing.ts";
import type { Anchor } from "../core/workspace/session/position.ts";
import { peekStep } from "./peek.ts";
import { tildePath } from "../core/workspace/vaults/names.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import type { NoteBuffer } from "./buffer.ts";
import { match } from "./match.ts";
import { prettyKey } from "./shell/input/keys.ts";
import type { App, Loc, View, ListItem } from "./app/runtime/app.ts";
import { RECENT_NOTES_MAX } from "./app/runtime/app.ts";

/** Each window's history, the notes read lately, and the history view. */
export class History {
  constructor(readonly app: App) {}

  /** Notes and files most recently shown, newest first (the switcher lists them first). */
  recentNotes: string[] = [];
  /** When each note was opened this session (the history's recent notes show it). */
  private readonly openedAt = new Map<string, number>();

  /** A note was shown in a window: it's the most recent now. */
  touchRecent(key: string): void {
    this.openedAt.set(key, this.app.now());
    this.recentNotes = [key, ...this.recentNotes.filter((k) => k !== key)].slice(0, RECENT_NOTES_MAX);
  }

  push(view: View): void {
    view.back.push({ key: view.buf.key, anchor: { ...view.topAnchor }, cursor: { ...view.curAnchor } });
    if (view.back.length > HISTORY_LIMIT) view.back.shift();
    view.fwd = [];
  }

  remember(view: View): void {
    // A floating window (the properties, a hover, a file from git) isn't a place read.
    if (view.buf.virtual) return;
    this.app.positions.set(view.buf.key, view.topAnchor, view.curAnchor);
  }

  jumpTo(view: View, anchor: Anchor): void {
    if (view.buf.kind.group === "note") this.app.html.reveal(view, anchor.line);
    view.topAnchor = anchor;
    view.topSub = 0;
    view.curAnchor = { anchor, sub: 0, col: 0 };
    view.goal = 0;
    view.layoutKey = "";
    view.sel = null;
    view.visual = null;
  }

  go(dir: "back" | "forward"): void {
    const view = this.app.view;
    if (!view) return;
    // Inside a peek (VV-D7): the files its links moved it to, never the window under it.
    if (this.app.floating?.kind === "peek" && view === this.app.floating.view) return peekStep(this.app, dir);
    const from = dir === "back" ? view.back : view.fwd;
    const to = dir === "back" ? view.fwd : view.back;
    const loc = from.pop();
    if (!loc && dir === "back" && this.app.vaults.back()) return;
    if (!loc) return this.app.message("info", dir === "back" ? "no earlier location" : "no later location");
    // Load first: a location that can no longer be opened is dropped, and nothing else moves.
    const buf = this.app.buffer(loc.key);
    if (!buf) return;
    to.push({ key: view.buf.key, anchor: { ...view.topAnchor }, cursor: { ...view.curAnchor } });
    this.remember(view);
    this.showLoc(view, buf, loc);
  }

  showLoc(view: View, buf: NoteBuffer, loc: Loc): void {
    const before = view.buf;
    // Opened again (15.1, 16.7).
    if (buf !== before) {
      buf.retryParse();
      this.app.languages.retrySyntax(buf);
    }
    if (view.insert && buf !== before) stopInsert(this.app, view);
    this.touchRecent(buf.key);
    Object.assign(view, {
      buf,
      // Another note: its pictures fitted again (PIC-D4).
      ...(buf !== before ? { picturesOwn: undefined } : {}),
      topAnchor: loc.anchor,
      curAnchor: loc.cursor ?? { anchor: loc.anchor, sub: 0, col: 0 },
      layoutKey: "",
      sel: null,
      visual: null,
      find: null,
    });
    view.goal = view.curAnchor.col;
    this.app.lens.fitMode(view, before);
    this.app.explorer.reveal(undefined, false, true);
  }

  /** The history view's rows: the active window's timeline, newest first, filtered. */
  rows(): HistoryRow[] {
    const v = this.app.tabView; // the window's, never a floating one's
    if (!v) return [];
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    const rows = timeline
      .map((l, i) => {
        const path = this.app.buffers.get(l.key) ? this.app.displayName(this.app.buffers.get(l.key)!) : l.key;
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
      .slice(0, this.app.config.ui.history_limit)
      .map((r) => ({
        label: r.key.split("/").pop()!,
        path: r.key,
        hint: r.hint,
        index: -1,
        here: false,
        recent: r.key,
      }));
    const q = this.app.sidebar.filter ?? "";
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
    for (const e of this.app.positions.entries()) when.set(e.key, Date.parse(e.at) || 0);
    for (const [k, t] of this.openedAt) when.set(k, Math.max(t, when.get(k) ?? 0));
    const tabOf = new Map<string, number>();
    this.app.tabs.forEach((t, i) => t.views.forEach((v) => tabOf.set(v.buf.key, tabOf.get(v.buf.key) ?? i + 1)));
    for (const k of [...tabOf.keys(), ...this.recentNotes]) if (!when.has(k)) when.set(k, 0);
    const order = new Map(this.recentNotes.map((k, i) => [k, i] as [string, number]));
    return [...when]
      .filter(([k]) => existsSync(isAbsolute(k) ? k : join(this.app.loc.root, k)))
      .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9) || a[0].localeCompare(b[0]))
      .map(([key, t]) => ({
        key,
        hint: tabOf.has(key) && tabOf.get(key) !== this.app.activeTab + 1 ? `tab ${tabOf.get(key)}` : this.whenRead(t),
      }));
  }

  /** When a note was last read, briefly: the time today, else the day; nothing when unknown. */
  private whenRead(ms: number): string {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date(this.app.now());
    if (d.toDateString() === now.toDateString())
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  /** A place in a window's history, said: its path, and the heading it's under. */
  private placeName(loc: Loc): string {
    const buf = this.app.buffers.get(loc.key);
    const path = buf ? this.app.displayName(buf) : loc.key;
    const heading = (loc.cursor?.anchor ?? loc.anchor).heading;
    return heading ? `${path} › ${heading}` : path;
  }

  /**
   * Where back or forward takes the window (the status line's ‹ ›, said on hover): the place, the
   * root it was in when back leaves this one (17.10); null when there's nowhere to go.
   */
  step(dir: "back" | "forward"): string | null {
    const v = this.app.tabView;
    if (!v) return null;
    const loc = dir === "back" ? v.back.at(-1) : v.fwd.at(-1);
    if (loc) return this.placeName(loc);
    const t = dir === "back" ? this.app.vaults.trail.at(-1) : undefined;
    return t ? tildePath(t.path) : null;
  }

  /**
   * The status line's path, clicked (3.x): the window's history as a browser shows it — forward places
   * above, the place it's at marked, back places below — under "Copy path"; a place chosen, the window
   * goes there (several steps at once).
   */
  openPathMenu(): void {
    const v = this.app.tabView;
    if (!v) return;
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    const g = this.app.glyphs;
    const places: ListItem[] = timeline
      .map((l, i) => ({
        label: `${i === cur ? g.historyHere : " "} ${sanitize(this.placeName(l))}`,
        hint: i === cur ? "here" : i > cur ? "forward" : "back",
        data: i,
      }))
      .reverse();
    const key = this.app.keymap.keysFor("copy.path")[0];
    const items: ListItem[] = [
      { label: "  Copy path", hint: key ? prettyKey(key, this.app.leader) : undefined, data: "copy" },
      ...places,
    ];
    const hot = this.app.geometry?.hot.find((h) => h.id === "status:path");
    this.app.overlays.openList({
      title: "History",
      items,
      filterable: false,
      anchor: hot ? { x: Math.max(0, hot.x - 4), y: hot.y } : undefined,
      menu: true,
      selected: 1 + (timeline.length - 1 - cur),
      accept: (it) => (it.data === "copy" ? void this.app.copy(v.buf.abs) : this.jump(it.data as number)),
    });
  }

  /** Jump the window to entry `i` of its timeline: what's before it becomes back, after it forward. */
  jump(i: number): void {
    // As following a link: the floating window closes, and the window under it goes.
    if (this.app.floating && !this.app.overlays.closeFloating()) return;
    const v = this.app.tabView;
    if (!v) return;
    const here: Loc = { key: v.buf.key, anchor: v.topAnchor, cursor: v.curAnchor };
    const timeline = [...v.back, here, ...[...v.fwd].reverse()];
    const cur = v.back.length;
    if (i === cur) return;
    const loc = timeline[i];
    const buf = loc && this.app.buffer(loc.key);
    if (!loc || !buf) return;
    this.remember(v);
    v.back = timeline.slice(0, i);
    v.fwd = timeline.slice(i + 1).reverse();
    this.showLoc(v, buf, loc);
  }

  /** The history view's keys (the explorer's keymap): move, jump, filter, close, leave. */
  action(action: string): void {
    const s = this.app.sidebar;
    const rows = this.rows();
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
        if (row.recent) this.app.open(row.recent);
        else this.jump(row.index);
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
        break;
      }
      case "filter":
        s.filtering = true;
        break;
      case "collapse":
      case "zoom_in":
      case "zoom_out":
        break;
      case "close":
        this.app.panels.showSidebar(false);
        break;
      case "leave":
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
        break;
      default:
        this.app.message("error", `unknown explorer action: ${action}`);
    }
  }
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

const HISTORY_LIMIT = 200;
