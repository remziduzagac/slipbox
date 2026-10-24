// The git panel's rows held steady as git answers (D261): each row known by what it is (`rowKey`), not by where it is.
// The selection stays on its row as rows come, go and are sorted; the row under a resting pointer stays on its line;
// a click, a key or the footer between frames finds the row the last frame drew there, or nothing when it's gone.

import type { App } from "./app.ts";
import type { Rect } from "./draw.ts";
import type { PanelRow } from "./gitpanel.ts";

/** The panel's hot id of a row or a row's button (`git:row:3`, `git:act:3:stage`, `git:bb:3:merge`): its parts. */
export function hotRow(id: string | null): { prefix: string; index: number; rest: string } | null {
  const m = /^(git:(?:row|act|bb):)(\d+)(.*)$/.exec(id ?? "");
  return m ? { prefix: m[1]!, index: Number(m[2]), rest: m[3]! } : null;
}

/**
 * A row's identity, whatever its place: its kind and what it's of — a change by its lines (hashed), not where they
 * are, so one edited is another. Rows alike are told apart by their order (`keysOf`).
 */
export function rowKey(row: PanelRow | undefined): string | null {
  if (!row) return null;
  switch (row.kind) {
    case "heading":
      return `heading\0${row.section}`;
    case "note":
      return `note\0${row.text}`;
    case "file":
      return `file\0${row.section}\0${row.entry.path}`;
    case "change": {
      const lines = Bun.hash(`${row.change.kind}\0${row.change.was.join("\n")}\0${row.change.now.join("\n")}`);
      return `change\0${row.section}\0${row.entry.path}\0${lines.toString(36)}`;
    }
    case "ahead":
      return `ahead\0${row.file.path}`;
    case "thisfile":
      return `thisfile\0${row.command}`;
    case "branch":
    case "bline":
    case "bbuttons":
      return `${row.kind}\0${row.branch.name}`;
    case "bsub":
      return `bsub\0${row.branch.name}\0${row.against}`;
    case "bfile":
      return `bfile\0${row.branch.name}\0${row.against}\0${row.path}`;
    case "repo":
      return `repo\0${row.repo.key}`;
    case "rcheckout":
      return `rcheckout\0${row.repo.key}\0${row.checkout.root}`;
    case "rfile":
      return `rfile\0${row.repo.key}\0${row.checkout.root}\0${row.entry.path}`;
  }
}

/** Each list of rows' keys, worked out once. */
const KEYS = new WeakMap<PanelRow[], (string | null)[]>();

/**
 * Every row's key in `rows`: one alike to a row before it is the next of its kind (`…\0#1`, as `watch.ts` tells notes'
 * headings apart), so two changes alike in a file are each found again, in their order.
 */
export function keysOf(rows: PanelRow[]): (string | null)[] {
  const had = KEYS.get(rows);
  if (had) return had;
  const seen = new Map<string, number>();
  const keys = rows.map((r) => {
    const k = rowKey(r);
    if (k === null) return null;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n ? `${k}\0#${n}` : k;
  });
  KEYS.set(rows, keys);
  return keys;
}

/** The row of `key` in `rows`; -1 when there's none. */
function only(rows: PanelRow[], key: string | null): number {
  return key === null ? -1 : keysOf(rows).indexOf(key);
}

/** How long a row gone from the frames is still the one kept to: a moment's (a file's changes read again), not more. */
const A_MOMENT = 1000;

/**
 * What the last frame drew: each row's key, the row it drew selected, the list's top, its scroll, the filter, and what
 * the rows were of.
 */
interface Drawn {
  keys: (string | null)[];
  selected: string | null;
  /** The list's height then. */
  h: number;
  y: number;
  scroll: number;
  filter: string;
  context: string;
}

/** The git panel's rows by what they are: the selection, the pointer's row, a click's or a key's (`GitPanel.steady`). */
export class Steady {
  constructor(readonly app: App) {}

  private drawn: Drawn | null = null;
  /**
   * The selection's row, and its index then; where the panel put it (the first row, the filter's first match). Gone
   * from the rows (`lost`: which row, since when — a file's changes read again, a moment without them), it's kept to
   * for a moment, and found again when back within it; another row picked meanwhile is another's moment.
   */
  private picked: string | null = null;
  private pickedAt = -1;
  private placed: number | null = null;
  private lost: { key: string; at: number } | null = null;
  /** Moved by a key since the last frame: shown, not held off by the pointer's row. */
  private navigated = false;
  /** Set (picked, put in a place) since the last frame: a key acts on that row, not on the one the frame drew. */
  private set = false;
  /** Where the pointer was when the rows weren't drawn, or the mouse was off: it holds them only once it moves. */
  private unmoved: { x: number; y: number } | null = null;
  /** The row under the pointer, to keep on its line, the line, and the pointer's report; gone from a frame, kept to. */
  private anchor: { key: string; y: number; pointer: { x: number; y: number } } | null = null;
  private anchorLost: number | null = null;
  /** What the rows were of when the selection was last set: a pick made there since its last frame is looked for. */
  private setIn = "";

  /**
   * What the rows are of: the checkout; outside one, the folder whose repositories they list (`RepoView.listedDir`: the
   * last view's while the new one's are looked for, so its rows are never taken for the new one's). Another, and
   * nothing drawn before holds. Not the note open (This file's rows are known by what they do), nor in a checkout the
   * view: its rows are the checkout's whatever the view.
   */
  private context(): string {
    const c = this.app.git.checkout;
    return c ? c.root : `\0${this.app.gitPanel.repos.listedDir()}`;
  }

  /** The filter's state: typed or opened, the rows aren't held to the pointer across it. */
  private filter(): string {
    return `${this.app.sidebar.filtering ? 1 : 0}\0${this.app.gitPanel.filter()}`;
  }

  /**
   * Row `i` picked by the user (a key, a click, the panel following it to where it went): selected, kept on as rows
   * move. `move`, a key that moves it: shown, though the wheel had scrolled the panel, and not held off by the pointer.
   */
  select(i: number, rows: PanelRow[], move = false): void {
    this.put(i, move);
    this.picked = keysOf(rows)[i] ?? null;
    this.pickedAt = i;
    this.placed = null;
    // Picked again, even the row once gone and back: its moment starts afresh.
    this.lost = null;
    this.navigated ||= move;
    this.set = true;
    this.setIn = this.context();
  }

  /** The selection put in a place, not on a row: it stays at that place as rows move, until it's picked. */
  place(i: number, rows: PanelRow[]): void {
    this.put(i, false);
    this.picked = keysOf(rows)[i] ?? null;
    this.pickedAt = i;
    this.placed = i;
    this.set = true;
    this.setIn = this.context();
  }

  /**
   * The panel's selection at `i` (and shown, `unpin`): the left panel's when the git panel is in it, else the position
   * it gets back when it's shown again — an answer come with the explorer shown leaves the explorer's alone.
   */
  private put(i: number, unpin: boolean): void {
    const app = this.app;
    if (app.leftView === "git") {
      app.sidebar.selected = i;
      if (unpin) app.sidebar.pinned = false;
      return;
    }
    const kept = app.panels.leftPositions.get("git");
    if (kept) app.panels.leftPositions.set("git", { ...kept, selected: i, pinned: unpin ? false : kept.pinned });
  }

  /** The rows drawn last were of something else (another repository or view): nothing in them is looked for here. */
  private elsewhere(): boolean {
    return !!this.drawn && this.drawn.context !== this.context();
  }

  /**
   * Where the selection is in `rows`, between frames: the row a key moved it to, else the row the last frame drew
   * selected — or its place; -1 when that row is gone. Set by a writer that didn't say (a view's selection restored),
   * the index is taken as it is.
   */
  selected(rows: PanelRow[]): number {
    const s = this.app.sidebar;
    // The rows drawn last of something else: only a pick made here since, on its row still, is looked for.
    if (this.elsewhere())
      return this.set && this.setIn === this.context() && s.selected === this.pickedAt ? only(rows, this.picked) : -1;
    if (s.selected !== this.pickedAt) return s.selected;
    const key = this.sought();
    return key === null ? s.selected : only(rows, key);
  }

  /** The row a key between frames acts on, by its key: the one set since, else the one drawn selected. */
  sought(): string | null {
    return this.set ? this.picked : (this.drawn?.selected ?? this.picked);
  }

  /** The row the last frame drew at `i`, in `rows`: -1 when it's gone; `i` before any frame. */
  rowAt(i: number, rows: PanelRow[]): number {
    if (this.elsewhere()) return -1;
    const key = this.drawn?.keys[i];
    return key === undefined ? i : only(rows, key);
  }

  /** A hot id of the panel's rows (`git:row:3`, `git:act:3:stage`) taken to `rows`, the row it names now; else as is. */
  hotNow(id: string | null, rows: PanelRow[]): string | null {
    const h = hotRow(id);
    if (!h) return id;
    const i = this.rowAt(h.index, rows);
    return i < 0 ? null : `${h.prefix}${i}${h.rest}`;
  }

  /**
   * A frame begins (`GitPanel.drawnRows`): the selection's row taken from a writer that didn't say (`rows()`, the
   * order drawn); whether the pointer holds the rows — on them as the last frame drew them, reported since they showed,
   * the mouse on — and, holding, the row under it, kept on its line unless the view was scrolled, filtered or
   * navigated on purpose, or the rows are of something else now.
   */
  begin(rows: () => PanelRow[]): boolean {
    const app = this.app;
    const s = app.sidebar;
    const mouse = app.mouse;
    const list = app.geometry?.gitRows;
    // Of another repository, note or view now: what was selected or under the pointer there isn't looked for here.
    if (this.elsewhere()) {
      // A pick made there since is the one to look for.
      if (!(this.set && this.setIn === this.context())) this.picked = null;
      this.lost = null;
      this.anchor = null;
      this.anchorLost = null;
    } else if (s.selected !== this.pickedAt) {
      this.picked = keysOf(rows())[s.selected] ?? null;
      this.pickedAt = s.selected;
      if (this.placed !== s.selected) this.placed = null;
    }
    if (!app.ui.mouse || !list) this.unmoved = mouse.at;
    // On the rows, not their scrollbar's column: a thumb held is the user's scrolling.
    const holds = !!mouse.at && mouse.at !== this.unmoved && !!list && mouse.over({ ...list, w: list.w - 1 });
    const d = this.drawn;
    // Scrolled past the list's end (for the pointer's row), the wheel down has nothing more to show: kept as it was,
    // never the rows moved down as the scroll comes back to the list's end.
    if (d && s.scroll > d.scroll && d.scroll > Math.max(0, d.keys.length - d.h)) s.scroll = d.scroll;
    const steady =
      holds &&
      d &&
      !this.navigated &&
      s.scroll === d.scroll &&
      this.filter() === d.filter &&
      this.context() === d.context;
    // Under the pointer: its row; below the last, the last, kept where it is so nothing comes under the pointer. One
    // gone from the last frame is still the one, the pointer not having moved.
    const moment = this.anchorLost !== null && app.now() - this.anchorLost < A_MOMENT;
    if (steady && this.anchor && moment && this.anchor.pointer === mouse.at) return holds;
    // Another anchor, or none: the last one's moment goes with it.
    this.anchorLost = null;
    const at = steady ? Math.min(mouse.at!.y - d.y + d.scroll, d.keys.length - 1) : -1;
    const key = d && at >= 0 ? d.keys[at] : null;
    this.anchor = d && key ? { key, y: d.y + at - d.scroll, pointer: mouse.at! } : null;
    return holds;
  }

  /**
   * The frame's rows worked out: the selection moved to its row, when that's elsewhere now (scrolled to, unless the
   * wheel had scrolled the panel away, or the pointer rests on the rows). Gone a moment, it's still the one; longer,
   * the row in its place is.
   */
  follow(rows: PanelRow[]): void {
    const s = this.app.sidebar;
    if (this.placed !== null || this.picked === null) return;
    const i = only(rows, this.picked);
    const lost = this.lost?.key === this.picked ? this.lost : null;
    if (i < 0) {
      this.lost = lost ?? { key: this.picked, at: this.app.now() };
      return;
    }
    this.lost = null;
    // Back after more than a moment (no frame drawn meanwhile to let go of it): let go now.
    if (lost && this.app.now() - lost.at >= A_MOMENT) {
      this.picked = null;
      return;
    }
    s.selected = i;
  }

  /**
   * The frame's list laid out (`list`, the selection kept in view): the row under a resting pointer back on its line,
   * scrolled past the list's end if it must (blank under it until the pointer leaves) — but rows gone above it at the
   * top, it moves up.
   */
  settle(rows: PanelRow[], list: Rect): void {
    const s = this.app.sidebar;
    if (!this.anchor) return;
    const i = only(rows, this.anchor.key);
    // Gone (a file staged by its +): the rows move as they come, nothing kept in its place.
    if (i < 0) {
      this.anchorLost ??= this.app.now();
      return;
    }
    this.anchorLost = null;
    // Its line no longer the list's (the panel's top grew over it): nothing to keep it on.
    const line = this.anchor.y - list.y;
    if (line < 0 || line >= list.h) return;
    s.scroll = Math.max(0, i - line);
  }

  /** The frame is drawn: what it drew, for the clicks, keys and frame after it. */
  done(rows: PanelRow[], list: Rect): void {
    const s = this.app.sidebar;
    const keys = keysOf(rows);
    this.drawn = {
      keys,
      selected: keys[s.selected] ?? null,
      h: list.h,
      y: list.y,
      scroll: s.scroll,
      filter: this.filter(),
      context: this.context(),
    };
    // The selection's row kept to while it's gone a moment; else the row it's on now.
    const lost = this.lost;
    if (!lost || this.app.now() - lost.at >= A_MOMENT) {
      this.picked = keys[s.selected] ?? null;
      this.lost = null;
    }
    this.pickedAt = s.selected;
    if (this.placed !== null && this.placed !== s.selected) this.placed = null;
    this.navigated = false;
    this.set = false;
  }
}
