// The TUI app model (plan 3.x): tabs of one or two views over shared buffers, a file explorer,
// overlays, history, link-following, find, selection, and live reload from the watcher (5.1–5.4).
//
// Phase 2 is read-only: nothing here writes a note. It writes only its own state (reading
// positions, session) and the scratch, through core.
//
// This module does not import OpenTUI. It draws through `Canvas` and talks to the terminal
// through `Host`; tui/run.ts binds both to OpenTUI. That keeps the whole model testable.

import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { appendScratch, clearScratch, formatEntry, readScratch, scratchLocation } from "../core/capture.ts";
import { copyText } from "../core/clipboard.ts";
import { COMMAND_SPECS } from "../core/command-specs.ts";
import { type Command, CommandRegistry, Keymap } from "../core/commands.ts";
import type { Config } from "../core/config.ts";
import { glyphsFor, type Glyphs } from "../core/glyphs.ts";
import type { Graph } from "../core/graph.ts";
import type { Layout, LayoutLink } from "../core/layout/ir.ts";
import { layoutWidth } from "../core/note.ts";
import { slugify } from "../core/parse.ts";
import { stateDir } from "../core/paths.ts";
import { type Anchor, anchorAt, loadSession, PositionStore, rowFor, saveSession, type SessionState, TOP } from "../core/position.ts";
import { listThemes, loadTheme, type Theme } from "../core/theme/index.ts";
import type { VaultLocation } from "../core/vault.ts";
import { VaultWatcher, type WatchBatch } from "../core/watch.ts";
import { graphemes, graphemeWidth, stringWidth } from "../core/width.ts";
import { NoteBuffer } from "./buffer.ts";
import type { Canvas } from "./canvas.ts";
import { drawApp, type Geometry } from "./draw.ts";
import { rank } from "./fuzzy.ts";
import { DEFAULT_KEYS, prettyKey, SIDEBAR_KEYS } from "./keys.ts";

export interface Host {
  requestRender(): void;
  /** OSC 52 through the renderer, which owns the terminal. */
  osc52(text: string): boolean;
  quit(): void;
  setTitle?(title: string): void;
}

export type Level = "info" | "warn" | "error";

export interface Message {
  level: Level;
  text: string;
  at: number;
}

export interface Loc {
  key: string;
  anchor: Anchor;
}

export interface Selection {
  /** Anchor and head in layout coordinates (row, column). */
  a: { row: number; col: number };
  b: { row: number; col: number };
  active: boolean;
}

export interface FindState {
  query: string;
  matches: { row: number; col: number; len: number }[];
  current: number;
}

export interface View {
  buf: NoteBuffer;
  top: number;
  anchor: Anchor;
  focusLink: number;
  back: Loc[];
  fwd: Loc[];
  selection: Selection | null;
  find: FindState | null;
  /** Width/glyph key of the layout `top` refers to; when it changes, re-anchor. */
  layoutKey: string;
  /** Viewport height from the last draw. */
  height: number;
  width: number;
}

export interface Tab {
  views: View[];
  active: number;
}

export interface ListItem {
  label: string;
  detail?: string;
  /** Right-aligned hint, e.g. a key binding. */
  hint?: string;
  indent?: number;
  data: unknown;
}

export interface ListOverlay {
  kind: "list";
  title: string;
  input: string;
  filterable: boolean;
  items: ListItem[];
  filtered: { item: ListItem; positions: number[] }[];
  selected: number;
  scroll: number;
  accept: (item: ListItem) => void;
  move?: (item: ListItem) => void;
  cancel?: () => void;
}

export interface PromptOverlay {
  kind: "prompt";
  label: string;
  text: string;
  change?: (text: string) => void;
  accept: (text: string) => void;
  cancel?: () => void;
}

export type Overlay = ListOverlay | PromptOverlay;

export interface SidebarState {
  /** Preference on wide terminals: the explorer sits beside the content. */
  visible: boolean;
  /** Narrow terminals (3.14): the explorer is shown over the content only on demand. */
  overlay: boolean;
  expanded: Set<string>;
  selected: number;
  scroll: number;
}

export interface TreeRow {
  kind: "dir" | "note";
  path: string;
  name: string;
  depth: number;
}

const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 500;

export interface AppOptions {
  loc: VaultLocation;
  config: Config;
  graph: Graph;
  host: Host;
  warnings?: string[];
  /** Initial path to open (vault-relative or absolute). */
  open?: string | null;
  themeName?: string;
  /** Skip the watcher (tests drive changes by hand). */
  watch?: boolean;
  now?: () => number;
}

export class App {
  readonly loc: VaultLocation;
  config: Config;
  graph: Graph;
  theme: Theme;
  glyphs: Glyphs;
  readonly host: Host;
  readonly registry = new CommandRegistry<App>();
  readonly keymap: Keymap;
  readonly sidebarKeys: Keymap;
  readonly buffers = new Map<string, NoteBuffer>();
  tabs: Tab[] = [];
  activeTab = 0;
  region: "content" | "sidebar" = "content";
  sidebar: SidebarState;
  overlay: Overlay | null = null;
  pending: string[] = [];
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  messages: Message[] = [];
  transient: Message | null = null;
  private transientTimer: ReturnType<typeof setTimeout> | null = null;
  width = 80;
  height = 24;
  geometry: Geometry | null = null;
  positions: PositionStore;
  watcher: VaultWatcher | null = null;
  private tree: TreeRow[] | null = null;
  private dragging: { view: View; row: number; col: number } | null = null;
  readonly now: () => number;
  quitting = false;

  constructor(opts: AppOptions) {
    this.loc = opts.loc;
    this.config = opts.config;
    this.graph = opts.graph;
    this.host = opts.host;
    this.now = opts.now ?? Date.now;
    const t = loadTheme(opts.themeName ?? opts.config.theme);
    this.theme = process.env.NO_COLOR ? loadTheme("mono").theme : t.theme;
    this.glyphs = glyphsFor(opts.config.render.glyphs);
    this.keymap = new Keymap(DEFAULT_KEYS, opts.config.keys);
    this.sidebarKeys = new Keymap(SIDEBAR_KEYS);
    this.sidebar = { visible: opts.config.ui.sidebar, overlay: false, expanded: new Set(), selected: 0, scroll: 0 };
    this.positions = new PositionStore(this.loc.root);
    registerCommands(this);
    for (const w of opts.warnings ?? []) this.message("warn", w);
    if (t.warning) this.message("warn", t.warning);
    for (const e of this.graph.errors) this.message("warn", e);
    for (const bad of this.unknownBindings()) this.message("warn", `config: [keys] binds unknown command "${bad}"`);

    const restored = !opts.open && this.config.ui.restore_session && this.restoreSession();
    if (!restored) {
      const first = opts.open ?? this.defaultNote();
      if (first) this.openInNewTab(first);
    }
    if (!this.tabs.length) this.message("info", `no notes in ${this.loc.root}`);
    if (opts.watch !== false && this.config.watch.enabled) {
      this.startWatcher();
      this.watchOutsideFiles();
    }
    if (opts.watch !== false) this.indexInBackground();
  }

  /** Parse notes the cache could not supply in small slices, so the first note paints at once. */
  indexing = 0;
  indexInBackground(): void {
    if (this.indexing) return; // a pass is already running; it picks up the new stubs
    const total = this.graph.pendingCount;
    if (!total) return;
    this.indexing = total;
    const t0 = this.now();
    const tick = () => {
      if (this.quitting) return;
      const left = this.graph.parseSome(12);
      this.indexing = left;
      if (left) {
        setTimeout(tick, 1);
        if (total > 200) this.host.requestRender();
        return;
      }
      this.invalidateTree();
      if (total > 200) this.message("info", `indexed ${total} notes in ${((this.now() - t0) / 1000).toFixed(1)} s`);
      this.host.requestRender();
    };
    setTimeout(tick, 1);
  }

  private unknownBindings(): string[] {
    const ids = new Set(this.registry.list().map((c) => c.id));
    return Object.values(this.config.keys).filter((v) => v && !ids.has(v.split(" ")[0]!));
  }

  // -------------------------------------------------------------------------------------------
  // Messages (3.13): one sink for errors, warnings and info.

  message(level: Level, text: string): void {
    const m = { level, text, at: this.now() };
    this.messages.push(m);
    if (this.messages.length > MESSAGE_LIMIT) this.messages.shift();
    this.transient = m;
    if (this.transientTimer) clearTimeout(this.transientTimer);
    this.transientTimer = setTimeout(
      () => {
        if (this.transient === m) this.transient = null;
        this.host.requestRender();
      },
      level === "error" ? 8000 : 4000,
    );
    (this.transientTimer as { unref?: () => void }).unref?.();
  }

  // -------------------------------------------------------------------------------------------
  // Buffers and views

  get tab(): Tab | null {
    return this.tabs[this.activeTab] ?? null;
  }

  get view(): View | null {
    const t = this.tab;
    return t ? (t.views[t.active] ?? null) : null;
  }

  private defaultNote(): string | null {
    const notes = [...this.graph.notes.keys()];
    for (const pref of ["index.md", "README.md", "readme.md", "home.md"]) if (notes.includes(pref)) return pref;
    return notes[0] ?? null;
  }

  /** Buffer for a vault-relative path or an absolute path. */
  buffer(pathOrRel: string): NoteBuffer | null {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.loc.root, pathOrRel);
    const relRaw = relative(this.loc.root, abs);
    const inside = !relRaw.startsWith("..") && !relRaw.startsWith("/");
    // Keyed by path, not by graph membership: a note deleted on disk keeps its buffer (and its
    // "still showing the last version" promise), and history and the buffer list still find it.
    const key = inside ? relRaw : abs;
    let buf = this.buffers.get(key);
    if (!buf) {
      const rel = inside && this.graph.notes.has(relRaw) ? relRaw : null;
      buf = new NoteBuffer(rel, abs, key);
      if (!buf.load()) {
        this.message("error", `cannot read ${pathOrRel}`);
        return null;
      }
      if (buf.invalidUtf8) this.message("warn", `${buf.key}: not valid UTF-8; invalid bytes shown as �`);
      this.buffers.set(key, buf);
    }
    return buf;
  }

  private makeView(buf: NoteBuffer, anchor?: Anchor): View {
    return {
      buf,
      top: 0,
      anchor: anchor ?? this.positions.get(buf.key) ?? { ...TOP },
      focusLink: -1,
      back: [],
      fwd: [],
      selection: null,
      find: null,
      layoutKey: "",
      height: this.height,
      width: this.width,
    };
  }

  openInNewTab(path: string, anchor?: Anchor): void {
    const buf = this.buffer(path);
    if (!buf) return;
    this.tabs.push({ views: [this.makeView(buf, anchor)], active: 0 });
    this.activeTab = this.tabs.length - 1;
    this.region = "content";
    this.revealInSidebar();
  }

  /** Open a note in the active view, pushing history (3.6) and remembering the old position (3.4). */
  open(path: string, anchor?: Anchor, view = this.view): void {
    if (!view) return this.openInNewTab(path, anchor);
    const buf = this.buffer(path);
    if (!buf) return;
    if (buf === view.buf && anchor) {
      this.pushHistory(view);
      this.jumpTo(view, anchor);
      return;
    }
    this.pushHistory(view);
    this.remember(view);
    Object.assign(view, this.makeView(buf, anchor), { back: view.back, fwd: [] });
    this.region = "content";
    this.revealInSidebar();
  }

  private pushHistory(view: View): void {
    view.back.push({ key: view.buf.key, anchor: { ...view.anchor } });
    if (view.back.length > HISTORY_LIMIT) view.back.shift();
    view.fwd = [];
  }

  private remember(view: View): void {
    this.positions.set(view.buf.key, view.anchor);
  }

  private jumpTo(view: View, anchor: Anchor): void {
    view.anchor = anchor;
    view.layoutKey = "";
    view.focusLink = -1;
  }

  history(dir: "back" | "forward"): void {
    const view = this.view;
    if (!view) return;
    const from = dir === "back" ? view.back : view.fwd;
    const to = dir === "back" ? view.fwd : view.back;
    const loc = from.pop();
    if (!loc) return this.message("info", dir === "back" ? "no earlier location" : "no later location");
    // Load first: a location that can no longer be opened is dropped, and nothing else moves.
    const buf = this.buffer(loc.key);
    if (!buf) return;
    to.push({ key: view.buf.key, anchor: { ...view.anchor } });
    this.remember(view);
    Object.assign(view, { buf, anchor: loc.anchor, layoutKey: "", focusLink: -1, selection: null, find: null });
    this.revealInSidebar();
  }

  // -------------------------------------------------------------------------------------------
  // Layout access. Views store source anchors; rows are derived per width (3.5).

  layoutFor(view: View, paneWidth: number): Layout {
    const width = layoutWidth(paneWidth, this.config.render.inset, this.config.render.max_width);
    const showUrls = this.config.render.show_urls === "always";
    const layout = view.buf.layout(width, this.glyphs, showUrls, view.buf.rel ? this.graph : null);
    const key = `${width}:${this.glyphs.mode}:${this.theme.name}:${layout.lines.length}`;
    if (view.layoutKey !== key) {
      view.layoutKey = key;
      view.top = this.clampTop(view, layout, rowFor(layout, view.anchor));
      // Refresh the anchor from where we landed, so its fallback line tracks the current file:
      // after an insertion above, a later removal of the heading must not fall back to a stale
      // pre-insertion line. Keep the anchor as-is when the view is clamped at the end.
      if (view.top === rowFor(layout, view.anchor)) view.anchor = anchorAt(layout, view.top);
      if (view.focusLink >= layout.links.length) view.focusLink = -1;
      if (view.find) view.find = computeFind(layout, view.find.query, view.find.current);
    }
    return layout;
  }

  /** Current layout of a view at its last drawn width. */
  currentLayout(view: View): Layout {
    return this.layoutFor(view, view.width);
  }

  private clampTop(view: View, layout: Layout, top: number): number {
    const max = Math.max(0, layout.lines.length - Math.max(1, view.height));
    return Math.max(0, Math.min(top, max));
  }

  scrollTo(view: View, top: number): void {
    const layout = this.currentLayout(view);
    view.top = this.clampTop(view, layout, top);
    view.anchor = anchorAt(layout, view.top);
  }

  scrollBy(view: View, delta: number): void {
    this.scrollTo(view, view.top + delta);
  }

  /** Scroll so `row` is visible, with a little context. */
  ensureVisible(view: View, row: number): void {
    const margin = Math.min(3, Math.floor(view.height / 4));
    if (row < view.top + margin) this.scrollTo(view, row - margin);
    else if (row >= view.top + view.height - margin) this.scrollTo(view, row - view.height + margin + 1);
  }

  // -------------------------------------------------------------------------------------------
  // Links

  visibleLinks(view: View): number[] {
    const layout = this.currentLayout(view);
    return layout.links.map((_, i) => i).filter((i) => layout.links[i]!.line >= 0);
  }

  cycleLink(dir: 1 | -1): void {
    const view = this.view;
    if (!view) return;
    const layout = this.currentLayout(view);
    const links = this.visibleLinks(view);
    if (!links.length) return this.message("info", "no links in this note");
    let next: number | undefined;
    const cur = view.focusLink >= 0 ? layout.links[view.focusLink] : null;
    const onScreen = (i: number) => layout.links[i]!.line >= view.top && layout.links[i]!.line < view.top + view.height;
    if (!cur || !onScreen(view.focusLink)) {
      // Start from the viewport rather than from wherever focus was left.
      const inView = links.filter(onScreen);
      next = dir === 1 ? (inView[0] ?? links.find((i) => layout.links[i]!.line >= view.top)) : (inView[inView.length - 1] ?? [...links].reverse().find((i) => layout.links[i]!.line < view.top));
    } else {
      const idx = links.indexOf(view.focusLink);
      next = links[(idx + dir + links.length) % links.length];
    }
    if (next === undefined) next = dir === 1 ? links[0] : links[links.length - 1];
    view.focusLink = next!;
    this.ensureVisible(view, layout.links[next!]!.line);
  }

  focusedLink(view = this.view): LayoutLink | null {
    if (!view || view.focusLink < 0) return null;
    return this.currentLayout(view).links[view.focusLink] ?? null;
  }

  /** Follow a link (link-follow, pulled into phase 2). */
  follow(link: LayoutLink, inSplit = false): void {
    const view = this.view;
    if (!view) return;
    const from = view.buf.rel;
    const heading = link.heading;
    const go = (path: string, h: string | null) => {
      const anchor = h ? this.headingAnchor(path, h) : undefined;
      if (inSplit) {
        this.ensureSplit();
        const t = this.tab!;
        t.active = t.views.length - 1;
      }
      this.open(path, anchor);
    };
    switch (link.kind) {
      case "footnote": {
        const layout = this.currentLayout(view);
        const row = layout.lines.findIndex((l) => l.spans[0]?.role === "footnote" && l.spans[0].text.startsWith(`${link.target}.`));
        if (row < 0) return this.message("warn", `footnote [^${link.target}] has no definition`);
        this.pushHistory(view);
        this.scrollTo(view, row - 1);
        return;
      }
      case "wiki":
      case "embed": {
        if (!link.target) {
          if (heading) return this.jumpToHeading(view, heading);
          return;
        }
        if (!from) return this.message("warn", `[[${link.target}]]: links resolve only inside the vault`);
        const r = this.graph.resolveLink({ kind: link.kind, target: link.target }, from);
        if (r.resolvedKind === "note") return go(r.path!, heading);
        if (r.resolvedKind === "file") return this.fileLink(r.path!);
        if (r.resolvedKind === "ambiguous") {
          return this.openList({
            title: `[[${link.target}]] matches ${r.candidates.length} notes`,
            items: r.candidates.map((c) => ({ label: c, data: c })),
            accept: (item) => go(item.data as string, heading),
          });
        }
        return this.message("warn", `unresolved link [[${link.target}]] — no note named "${link.target}"`);
      }
      case "markdown":
      case "image": {
        if (!from && !/^[a-z][a-z0-9+.-]*:/i.test(link.target)) return this.message("warn", `${link.target}: links resolve only inside the vault`);
        const r = this.graph.resolveLink({ kind: link.kind === "image" ? "image" : "markdown", target: link.target }, from ?? "");
        if (r.resolvedKind === "external") {
          const ok = this.copy(link.target, false);
          return this.message("info", `${ok ? "copied" : "external link"}: ${link.target}`);
        }
        if (r.resolvedKind === "anchor") {
          const frag = link.target.split("#")[1];
          if (frag) this.jumpToHeading(view, decodeURIComponent(frag));
          return;
        }
        if (r.resolvedKind === "note") return go(r.path!, link.target.includes("#") ? decodeURIComponent(link.target.split("#")[1]!) : null);
        if (r.resolvedKind === "file") return this.fileLink(r.path!);
        return this.message("warn", `broken link: ${link.target}`);
      }
    }
  }

  private fileLink(rel: string): void {
    const abs = join(this.loc.root, rel);
    this.copy(abs, false);
    this.message("info", `attachment ${rel} — path copied (images render in a later phase)`);
  }

  headingAnchor(path: string, heading: string): Anchor | undefined {
    const rel = path.startsWith("/") ? relative(this.loc.root, path) : path;
    const note = this.graph.entry(rel);
    const slug = slugify(heading);
    const h = note?.headings.find((x) => x.slug === slug || x.text.toLowerCase() === heading.toLowerCase());
    if (!h) {
      this.message("warn", `no heading "${heading}" in ${rel}`);
      return undefined;
    }
    const idx = note!.headings.filter((x) => x.slug === h.slug && x.line < h.line).length;
    return { heading: h.slug, headingIndex: idx, offset: 0, line: h.line };
  }

  private jumpToHeading(view: View, heading: string): void {
    const layout = this.currentLayout(view);
    const slug = slugify(heading);
    const h = layout.headings.find((x) => x.slug === slug || x.text.toLowerCase() === heading.toLowerCase());
    if (!h) return this.message("warn", `no heading "${heading}" here`);
    this.pushHistory(view);
    this.scrollTo(view, h.line);
  }

  // -------------------------------------------------------------------------------------------
  // Split and tabs (3.3)

  ensureSplit(): void {
    const t = this.tab;
    const view = this.view;
    if (!t || !view || t.views.length > 1) return;
    const clone = this.makeView(view.buf, { ...view.anchor });
    t.views.push(clone);
  }

  toggleSplit(): void {
    const t = this.tab;
    if (!t) return;
    if (t.views.length > 1) {
      const closed = t.views.splice(t.active === 0 ? 1 : 0, 1)[0]!;
      this.remember(closed);
      t.active = 0;
    } else {
      this.ensureSplit();
      t.active = 1;
    }
  }

  closeTab(): void {
    if (this.tabs.length <= 1) return this.message("info", "last tab — q quits");
    const t = this.tabs.splice(this.activeTab, 1)[0]!;
    for (const v of t.views) this.remember(v);
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
  }

  // -------------------------------------------------------------------------------------------
  // Sidebar (3.7)

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    const rows: TreeRow[] = [];
    const paths = [...this.graph.notes.keys()].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1;
        const lastB = i === db.length - 1;
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
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (!seen.has(dir) && visible) {
          seen.add(dir);
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i });
        }
        if (!this.sidebar.expanded.has(dir)) {
          visible = false;
          break;
        }
      }
      if (visible) rows.push({ kind: "note", path: p, name: parts[parts.length - 1]!, depth: parts.length - 1 });
    }
    this.tree = rows;
    return rows;
  }

  invalidateTree(): void {
    this.tree = null;
  }

  revealInSidebar(): void {
    const rel = this.view?.buf.rel;
    if (!rel) return;
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.sidebar.expanded.add(parts.slice(0, i).join("/"));
    this.invalidateTree();
    const idx = this.treeRows().findIndex((r) => r.path === rel);
    if (idx >= 0) this.sidebar.selected = idx;
  }

  sidebarAction(action: string): void {
    const rows = this.treeRows();
    const row = rows[this.sidebar.selected];
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
      case "bottom":
        this.sidebar.selected = rows.length - 1;
        break;
      case "open":
        if (!row) break;
        if (row.kind === "dir") {
          if (this.sidebar.expanded.has(row.path)) this.sidebar.expanded.delete(row.path);
          else this.sidebar.expanded.add(row.path);
          this.invalidateTree();
        } else {
          this.open(row.path);
          if (this.narrow) this.sidebar.overlay = false;
        }
        break;
      case "collapse": {
        if (!row) break;
        const dir = row.kind === "dir" && this.sidebar.expanded.has(row.path) ? row.path : row.path.split("/").slice(0, -1).join("/");
        if (dir) {
          this.sidebar.expanded.delete(dir);
          this.invalidateTree();
          this.sidebar.selected = Math.max(0, this.treeRows().findIndex((r) => r.path === dir));
        }
        break;
      }
      case "leave":
        this.region = "content";
        if (this.narrow) this.sidebar.overlay = false;
        break;
    }
  }

  /** Narrow terminals (3.14): the sidebar cannot sit beside the content, so it overlays it. */
  get narrow(): boolean {
    return this.width < this.config.ui.narrow_width;
  }

  get sidebarShown(): boolean {
    return this.narrow ? this.sidebar.overlay : this.sidebar.visible;
  }

  showSidebar(on: boolean): void {
    if (this.narrow) this.sidebar.overlay = on;
    else this.sidebar.visible = on;
  }

  // -------------------------------------------------------------------------------------------
  // Overlays

  openList(opts: { title: string; items: ListItem[]; accept: (item: ListItem) => void; move?: (item: ListItem) => void; cancel?: () => void; filterable?: boolean; selected?: number }): void {
    const o: ListOverlay = {
      kind: "list",
      title: opts.title,
      input: "",
      filterable: opts.filterable ?? true,
      items: opts.items,
      filtered: [],
      selected: 0,
      scroll: 0,
      accept: opts.accept,
      move: opts.move,
      cancel: opts.cancel,
    };
    refilter(o);
    if (opts.selected !== undefined) o.selected = Math.max(0, Math.min(opts.selected, o.filtered.length - 1));
    this.overlay = o;
  }

  prompt(label: string, accept: (text: string) => void, change?: (text: string) => void, cancel?: () => void): void {
    this.overlay = { kind: "prompt", label, text: "", accept, change, cancel };
  }

  closeOverlay(cancelled: boolean): void {
    const o = this.overlay;
    this.overlay = null;
    if (cancelled) o?.cancel?.();
  }

  // -------------------------------------------------------------------------------------------
  // Input (dispatch order, decision 3.11: overlay → pending → region → global)

  async handleKey(key: string): Promise<void> {
    try {
      await this.dispatchKey(key);
    } catch (err) {
      this.message("error", (err as Error).message);
    }
    this.host.requestRender();
  }

  private async dispatchKey(key: string): Promise<void> {
    if (this.overlay) return this.overlayKey(this.overlay, key);
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const seq = [...this.pending, key].join(" ");
    const km = this.region === "sidebar" && this.sidebarShown ? this.sidebarKeys : null;
    if (km) {
      const action = km.lookup(seq);
      if (action && !km.isPrefix(seq)) {
        this.pending = [];
        return this.sidebarAction(action);
      }
      if (km.isPrefix(seq) || (action && km.isPrefix(seq))) {
        this.pending.push(key);
        return;
      }
    }
    const cmd = this.keymap.lookup(seq);
    if (this.keymap.isPrefix(seq)) {
      this.pending.push(key);
      if (cmd) {
        // Both a binding and a prefix (`space`): run it unless another key follows promptly.
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          this.pending = [];
          void this.run(cmd).then(() => this.host.requestRender());
        }, 400);
      }
      return;
    }
    this.pending = [];
    if (cmd) return this.run(cmd);
    if (key !== "escape") this.message("info", `${prettyKey(seq)} is not bound — ? lists keys`);
  }

  async run(spec: string): Promise<void> {
    if (!(await this.registry.run(this, spec))) this.message("error", `unknown command: ${spec}`);
  }

  private overlayKey(o: Overlay, key: string): void {
    if (key === "escape" || key === "ctrl+c" || key === "ctrl+g") return this.closeOverlay(true);
    if (o.kind === "prompt") {
      if (key === "enter") {
        this.overlay = null;
        return o.accept(o.text);
      }
      if (key === "backspace") o.text = [...o.text].slice(0, -1).join("");
      else if (key === "ctrl+u") o.text = "";
      else if (key === "space") o.text += " ";
      else if ([...key].length === 1) o.text += key;
      else return;
      o.change?.(o.text);
      return;
    }
    const n = o.filtered.length;
    const moveTo = (i: number) => {
      o.selected = Math.max(0, Math.min(n - 1, i));
      const item = o.filtered[o.selected];
      if (item) o.move?.(item.item);
    };
    switch (key) {
      case "enter": {
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
        return moveTo(o.selected + 1 >= n ? 0 : o.selected + 1);
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        return moveTo(o.selected - 1 < 0 ? n - 1 : o.selected - 1);
      case "pagedown":
      case "ctrl+d":
        return moveTo(o.selected + 10);
      case "pageup":
      case "ctrl+u":
        return moveTo(o.selected - 10);
    }
    if (!o.filterable) {
      if (key === "j") return moveTo(o.selected + 1);
      if (key === "k") return moveTo(o.selected - 1);
      return;
    }
    if (key === "backspace") o.input = [...o.input].slice(0, -1).join("");
    else if (key === "ctrl+w") o.input = o.input.replace(/\S*\s*$/, "");
    else if (key === "space") o.input += " ";
    else if ([...key].length === 1) o.input += key;
    else return;
    refilter(o);
    const item = o.filtered[o.selected];
    if (item) o.move?.(item.item);
  }

  handleMouse(ev: { type: string; x: number; y: number; button: number; scroll?: { direction: string; delta: number } }): void {
    const g = this.geometry;
    if (!g) return;
    if (this.overlay && ev.type === "down") {
      if (this.overlay.kind === "list" && g.overlay) {
        const r = g.overlay;
        const idx = ev.y - r.listY + this.overlay.scroll;
        if (ev.x >= r.x && ev.x < r.x + r.w && ev.y >= r.listY && idx < this.overlay.filtered.length) {
          this.overlay.selected = idx;
          return void this.overlayKey(this.overlay, "enter");
        }
      }
      return this.closeOverlay(true);
    }
    if (ev.type === "scroll") {
      const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
      const n = Math.max(1, ev.scroll?.delta ?? 1) * 3;
      const dir = ev.scroll?.direction === "up" ? -1 : 1;
      if (pane) this.scrollBy(pane.view, dir * n);
      else if (g.sidebar && inRect(g.sidebar, ev.x, ev.y)) {
        this.sidebar.scroll = Math.max(0, this.sidebar.scroll + dir * n);
      }
      return;
    }
    if (ev.type === "down" && ev.button === 0) {
      const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
      if (tab) {
        this.activeTab = tab.index;
        return;
      }
      if (g.sidebar && inRect(g.sidebar, ev.x, ev.y)) {
        const idx = ev.y - g.sidebar.y + this.sidebar.scroll;
        if (idx < this.treeRows().length) {
          this.sidebar.selected = idx;
          this.region = "sidebar";
          this.sidebarAction("open");
        }
        return;
      }
      const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
      if (!pane) return;
      const t = this.tab!;
      t.active = t.views.indexOf(pane.view);
      this.region = "content";
      const row = pane.view.top + (ev.y - pane.y);
      const col = ev.x - pane.textX;
      pane.view.selection = null;
      this.dragging = { view: pane.view, row, col };
      return;
    }
    if (ev.type === "drag" && this.dragging) {
      const pane = g.panes.find((p) => p.view === this.dragging!.view);
      if (!pane) return;
      if (ev.y < pane.y) this.scrollBy(pane.view, -1);
      if (ev.y >= pane.y + pane.h) this.scrollBy(pane.view, 1);
      const row = pane.view.top + Math.max(0, Math.min(pane.h - 1, ev.y - pane.y));
      const col = Math.max(0, ev.x - pane.textX);
      pane.view.selection = { a: { row: this.dragging.row, col: this.dragging.col }, b: { row, col }, active: true };
      return;
    }
    if ((ev.type === "up" || ev.type === "drag-end") && this.dragging) {
      const d = this.dragging;
      this.dragging = null;
      const sel = d.view.selection;
      if (sel && (sel.a.row !== sel.b.row || sel.a.col !== sel.b.col)) {
        sel.active = false;
        // Mouse selection copies on release, like a terminal would (beat leaf: no selection there).
        const text = selectedText(this.currentLayout(d.view), sel);
        if (text) {
          this.copy(text, false);
          this.message("info", `copied ${text.length} characters · c s captures it to the scratch`);
        }
        return;
      }
      d.view.selection = null;
      // A click (no drag) on a link follows it.
      const layout = this.currentLayout(d.view);
      const link = linkAt(layout, d.row, d.col);
      if (link >= 0) {
        d.view.focusLink = link;
        this.follow(layout.links[link]!);
      }
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  draw(canvas: Canvas): void {
    this.width = canvas.width;
    this.height = canvas.height;
    this.geometry = drawApp(this, canvas);
  }

  // -------------------------------------------------------------------------------------------
  // Clipboard, capture

  /** Copy via OSC 52 (through the renderer) plus a local tool when there is one (8.5). */
  copy(text: string, announce = true): boolean {
    const r = copyText(text, { osc52: (t) => this.host.osc52(t), fallbackDir: stateDir(this.loc.root) });
    if (announce) this.message("info", r.file ? `clipboard unavailable — wrote ${r.file}` : `copied ${text.length} characters`);
    return !r.file;
  }

  scratch() {
    return scratchLocation(this.loc.root, this.config);
  }

  /** Append to the scratch, telling the watcher it was our own write. */
  capture(entry: string): void {
    const loc = this.scratch();
    appendScratch(loc, entry);
    const rel = relative(this.loc.root, loc.path);
    if (!rel.startsWith("..")) this.watcher?.noteOwnWrite(rel);
    const open = this.buffers.get(loc.path) ?? this.buffers.get(rel);
    if (open) {
      open.load();
      for (const v of this.allViews()) if (v.buf === open) v.layoutKey = "";
    }
    this.message("info", `captured to scratch · space s opens it`);
  }

  allViews(): View[] {
    return this.tabs.flatMap((t) => t.views);
  }

  // -------------------------------------------------------------------------------------------
  // Watching (5.1–5.4): reload clean buffers silently, keep the reading position, say so.

  private knownFromGraph(): Map<string, number> {
    return new Map([...this.graph.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
  }

  startWatcher(): void {
    const known = this.knownFromGraph();
    this.watcher = new VaultWatcher({
      root: this.loc.root,
      filter: this.graph.filter,
      dirs: this.loc.mode === "vault" ? this.graph.dirs : [""],
      debounceMs: this.config.watch.debounce_ms,
      pollMs: this.config.watch.poll_ms,
      known,
      onBatch: (b) => {
        this.applyChanges(b);
        this.host.requestRender();
      },
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

  /** Files open from outside the vault (the scratch in the state dir) are not under the vault
   *  watcher; poll them, so an agent's `slipbox capture` shows up while you look at the scratch. */
  private watchOutsideFiles(): void {
    const t = setInterval(() => {
      if (this.quitting) return clearInterval(t);
      let changed = false;
      for (const buf of this.buffers.values()) {
        if (buf.rel !== null || buf.key !== buf.abs) continue;
        if (buf.changedOnDisk()) {
          this.reloadBuffer(buf);
          changed = true;
        }
      }
      if (changed) this.host.requestRender();
    }, Math.min(this.config.watch.poll_ms, 1000));
    (t as { unref?: () => void }).unref?.();
  }

  /** How a buffer is named in the status line and titles. */
  displayName(buf: NoteBuffer): string {
    return buf.abs === this.scratch().path ? "scratch" : buf.key;
  }

  applyChanges(batch: WatchBatch): void {
    let setChanged = false;
    if (batch.rescan) {
      this.graph.build(true, "lazy");
      this.indexInBackground();
      this.watcher?.sync(this.loc.mode === "vault" ? this.graph.dirs : [""], this.knownFromGraph());
      setChanged = true;
      // The walk itself changed: any open note may have changed, appeared or gone.
      for (const buf of this.buffers.values()) if (buf.changedOnDisk()) this.reloadBuffer(buf);
    }
    for (const c of batch.changes) {
      if (c.kind === "deleted") {
        this.graph.removeFile(c.rel);
        setChanged = true;
      } else {
        const abs = join(this.loc.root, c.rel);
        let st: { size: number; mtimeMs: number } | null = null;
        try {
          st = statSync(abs);
        } catch {}
        if (!st) continue;
        if (c.kind === "created") setChanged = true;
        this.graph.updateFile(c.rel, { rel: c.rel, abs, size: st.size, mtimeMs: st.mtimeMs });
      }
      const buf = this.buffers.get(c.rel);
      if (buf) this.reloadBuffer(buf, c.kind === "deleted");
    }
    if (setChanged) {
      // New or removed notes change link statuses everywhere and the explorer.
      this.invalidateTree();
      for (const b of this.buffers.values()) b.invalidateLayouts();
      for (const v of this.allViews()) v.layoutKey = "";
    }
    // A changed note may have gained or lost links to open notes: cheap to re-lay-out all.
    else if (batch.changes.length) for (const b of this.buffers.values()) b.invalidateLayouts();
  }

  reloadBuffer(buf: NoteBuffer, deleted = false): void {
    if (deleted || !buf.load()) {
      buf.deleted = true;
      buf.changedAt = this.now();
      this.message("warn", `${buf.key} was deleted on disk — still showing the last version`);
      return;
    }
    buf.changedAt = this.now();
    for (const v of this.allViews()) {
      if (v.buf !== buf) continue;
      // Keep the anchor (3.5): the heading above the viewport, not the row number.
      v.layoutKey = "";
      v.focusLink = -1;
      v.selection = null;
    }
    this.message("info", `↻ ${this.displayName(buf)} changed on disk — reloaded`);
    setTimeout(() => this.host.requestRender(), 3100).unref?.();
  }

  // -------------------------------------------------------------------------------------------
  // Session (3.15)

  private restoreSession(): boolean {
    const s = loadSession(this.loc.root);
    if (!s) return false;
    for (const t of s.tabs) {
      const views: View[] = [];
      for (const p of t.panes) {
        const buf = this.buffer(p.path);
        if (buf) views.push(this.makeView(buf, p.anchor));
      }
      if (views.length) this.tabs.push({ views, active: Math.min(t.active, views.length - 1) });
    }
    if (!this.tabs.length) return false;
    this.activeTab = Math.max(0, Math.min(s.activeTab, this.tabs.length - 1));
    for (const t of this.tabs) t.active = Math.max(0, Math.min(t.active, t.views.length - 1));
    this.sidebar.visible = s.sidebar;
    if (s.theme && s.theme !== this.theme.name) {
      const t = loadTheme(s.theme);
      if (!t.warning) this.theme = t.theme;
    }
    this.revealInSidebar();
    return true;
  }

  saveState(): void {
    for (const v of this.allViews()) this.remember(v);
    this.positions.save();
    const s: SessionState = {
      version: 1,
      tabs: this.tabs.map((t) => ({ panes: t.views.map((v) => ({ path: v.buf.key, anchor: v.anchor })), active: t.active })),
      activeTab: this.activeTab,
      sidebar: this.sidebar.visible,
      theme: this.theme.name,
    };
    saveSession(this.loc.root, s);
  }

  quit(): void {
    if (this.quitting) return;
    this.quitting = true;
    this.watcher?.close();
    this.saveState();
    this.host.quit();
  }
}

// ---------------------------------------------------------------------------------------------

function inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function refilter(o: ListOverlay): void {
  const ranked = rank(o.input, o.items, (i) => (i.detail ? `${i.label} ${i.detail}` : i.label));
  o.filtered = ranked.map((r) => ({ item: r.item, positions: r.match.positions }));
  o.selected = 0;
  o.scroll = 0;
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

/** Text of a selection in reading order, rows joined with newlines, trailing space trimmed. */
export function selectedText(layout: Layout, sel: Selection): string {
  let [a, b] = [sel.a, sel.b];
  if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
  const out: string[] = [];
  for (let r = a.row; r <= b.row; r++) {
    const line = layout.lines[r];
    if (!line) continue;
    const from = r === a.row ? a.col : 0;
    const to = r === b.row ? b.col + 1 : Number.POSITIVE_INFINITY;
    let x = 0;
    let text = "";
    for (const s of line.spans) {
      for (const g of graphemes(s.text)) {
        const w = graphemeWidth(g);
        if (x + Math.max(1, w) > from && x < to) text += g;
        x += w;
      }
    }
    out.push(text.replace(/\s+$/, ""));
  }
  return out.join("\n");
}

export function computeFind(layout: Layout, query: string, current = 0): FindState {
  const matches: FindState["matches"] = [];
  if (query) {
    // Match on the original text (never a lowercased copy, whose length can differ: "İ"), with
    // smart case: case-insensitive unless the query has an uppercase letter.
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), /\p{Lu}/u.test(query) ? "gu" : "giu");
    layout.lines.forEach((line, row) => {
      const text = line.spans.map((s) => s.text).join("");
      for (const m of text.matchAll(re)) {
        if (!m[0]) break;
        matches.push({ row, col: stringWidth(text.slice(0, m.index)), len: stringWidth(m[0]) });
      }
    });
  }
  return { query, matches, current: Math.min(current, Math.max(0, matches.length - 1)) };
}

// ---------------------------------------------------------------------------------------------
// Command implementations. Ids and titles come from core/command-specs.ts so the CLI can list
// them and the parity test can check them; this is where each one does its work.

function registerCommands(app: App): void {
  const impl: Record<string, Command<App>["run"]> = {
    "scroll.down": (a) => withView(a, (v) => a.scrollBy(v, 1)),
    "scroll.up": (a) => withView(a, (v) => a.scrollBy(v, -1)),
    "scroll.half_down": (a) => withView(a, (v) => a.scrollBy(v, Math.max(1, Math.floor(v.height / 2)))),
    "scroll.half_up": (a) => withView(a, (v) => a.scrollBy(v, -Math.max(1, Math.floor(v.height / 2)))),
    "scroll.page_down": (a) => withView(a, (v) => a.scrollBy(v, Math.max(1, v.height - 2))),
    "scroll.page_up": (a) => withView(a, (v) => a.scrollBy(v, -Math.max(1, v.height - 2))),
    "scroll.top": (a) => withView(a, (v) => a.scrollTo(v, 0)),
    "scroll.bottom": (a) => withView(a, (v) => a.scrollTo(v, Number.MAX_SAFE_INTEGER)),
    "heading.next": (a) =>
      withView(a, (v) => {
        const h = a.currentLayout(v).headings.find((x) => x.line > v.top);
        if (h) a.scrollTo(v, h.line);
      }),
    "heading.prev": (a) =>
      withView(a, (v) => {
        const h = [...a.currentLayout(v).headings].reverse().find((x) => x.line < v.top);
        a.scrollTo(v, h ? h.line : 0);
      }),
    "note.open": (a, arg) => {
      if (arg) return a.open(arg);
      return a.run("switcher.open");
    },
    "note.reload": (a) =>
      withView(a, (v) => {
        a.reloadBuffer(v.buf);
      }),
    "note.copy_path": (a) => withView(a, (v) => void a.copy(v.buf.abs)),
    "note.copy_ref": (a) =>
      withView(a, (v) => {
        const line = a.currentLayout(v).lines[v.top]?.src ?? 1;
        a.copy(`${v.buf.rel ?? v.buf.abs}:${line}`);
      }),
    "link.next": (a) => a.cycleLink(1),
    "link.prev": (a) => a.cycleLink(-1),
    "link.follow": (a) => {
      const l = a.focusedLink();
      if (l) a.follow(l);
      else a.message("info", "no link focused — Tab moves between links");
    },
    "link.follow_split": (a) => {
      const l = a.focusedLink();
      if (l) a.follow(l, true);
      else a.message("info", "no link focused — Tab moves between links");
    },
    "link.copy": (a) => {
      const l = a.focusedLink();
      if (!l) return a.message("info", "no link focused");
      const view = a.view!;
      const r = view.buf.rel && l.kind !== "footnote" ? a.graph.resolveLink({ kind: l.kind, target: l.target }, view.buf.rel) : null;
      a.copy(r?.path && r.resolvedKind !== "external" ? join(a.loc.root, r.path) : l.target);
    },
    "history.back": (a) => a.history("back"),
    "history.forward": (a) => a.history("forward"),
    "switcher.open": (a) => {
      const notes = [...a.graph.notes.values()];
      a.openList({
        title: `Open note (${notes.length})`,
        items: notes.map((n) => ({ label: n.rel, detail: n.title !== n.rel.replace(/\.(md|markdown)$/i, "").split("/").pop() ? n.title : undefined, data: n.rel })),
        accept: (item) => a.open(item.data as string),
      });
    },
    "outline.open": (a) =>
      withView(a, (v) => {
        const layout = a.currentLayout(v);
        if (!layout.headings.length) return a.message("info", "no headings in this note");
        const current = [...layout.headings].reverse().findIndex((h) => h.line <= v.top);
        a.openList({
          title: `Outline — ${v.buf.name}`,
          items: layout.headings.map((h) => ({ label: h.text, indent: h.level - 1, hint: `${h.src}`, data: h.line })),
          accept: (item) => {
            a.scrollTo(v, item.data as number);
          },
          selected: current < 0 ? 0 : layout.headings.length - 1 - current,
        });
      }),
    "links.open": (a) =>
      withView(a, (v) => {
        const layout = a.currentLayout(v);
        if (!layout.links.length) return a.message("info", "no links in this note");
        a.openList({
          title: `Links from ${v.buf.name}`,
          items: layout.links.map((l, i) => ({ label: l.text, detail: l.kind === "markdown" || l.kind === "image" ? l.target : `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]`, hint: l.status, data: i })),
          accept: (item) => {
            v.focusLink = item.data as number;
            a.follow(layout.links[item.data as number]!);
          },
        });
      }),
    "backlinks.open": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("info", "backlinks exist only for vault notes");
        const bl = a.graph.backlinks(v.buf.rel);
        if (!bl.length) return a.message("info", `no notes link to ${v.buf.rel}`);
        a.openList({
          title: `Linking to ${v.buf.name} (${bl.length})`,
          items: bl.map((b) => ({ label: b.from, detail: b.text, hint: `${b.line}`, data: b })),
          accept: (item) => {
            const b = item.data as { from: string; line: number };
            a.open(b.from, { heading: null, headingIndex: 0, offset: b.line - 1, line: b.line });
          },
        });
      }),
    "palette.open": (a) => {
      const cmds = a.registry.list().filter((c) => !c.hidden);
      a.openList({
        title: "Commands",
        items: cmds.map((c) => ({ label: c.title, detail: c.id, hint: a.keymap.keysFor(c.id).slice(0, 2).map(prettyKey).join("  "), data: c.id })),
        accept: (item) => void a.run(item.data as string).then(() => a.host.requestRender()),
      });
    },
    "find.open": (a) =>
      withView(a, (v) => {
        const prev = v.find;
        const top = v.top;
        a.prompt(
          "/",
          (text) => {
            v.find = computeFind(a.currentLayout(v), text, v.find?.current ?? 0);
            if (!v.find.matches.length && text) a.message("info", `not found: ${text}`);
          },
          (text) => {
            v.find = computeFind(a.currentLayout(v), text);
            const first = v.find.matches.findIndex((m) => m.row >= top);
            if (first >= 0) {
              v.find.current = first;
              a.ensureVisible(v, v.find.matches[first]!.row);
            }
          },
          () => {
            v.find = prev;
            a.scrollTo(v, top);
          },
        );
      }),
    "find.next": (a) => findStep(a, 1),
    "find.prev": (a) => findStep(a, -1),
    "tab.new": (a) =>
      withView(a, (v) => {
        a.tabs.push({ views: [{ ...v, back: [], fwd: [], selection: null, find: null, layoutKey: "" }], active: 0 });
        a.activeTab = a.tabs.length - 1;
      }),
    "tab.close": (a) => a.closeTab(),
    "tab.next": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab + 1) % a.tabs.length;
    },
    "tab.prev": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab - 1 + a.tabs.length) % a.tabs.length;
    },
    "split.toggle": (a) => a.toggleSplit(),
    "split.focus": (a) => {
      const t = a.tab;
      if (a.region === "sidebar") {
        a.region = "content";
        if (a.narrow) a.sidebar.overlay = false;
        return;
      }
      if (t && t.views.length > 1) t.active = (t.active + 1) % t.views.length;
    },
    "buffers.open": (a) => {
      const bufs = [...a.buffers.values()];
      a.openList({
        title: `Buffers (${bufs.length})`,
        items: bufs.map((b) => ({ label: b.key, hint: b.deleted ? "deleted" : undefined, data: b.abs })),
        accept: (item) => a.open(item.data as string),
      });
    },
    "sidebar.toggle": (a) => {
      a.showSidebar(!a.sidebarShown);
      a.region = a.sidebarShown ? "sidebar" : "content";
      if (a.sidebarShown) a.revealInSidebar();
    },
    "sidebar.focus": (a) => {
      a.showSidebar(true);
      a.region = "sidebar";
      a.revealInSidebar();
    },
    "sidebar.reveal": (a) => {
      a.showSidebar(true);
      a.revealInSidebar();
    },
    "capture.ref": (a) =>
      withView(a, (v) => {
        const line = a.currentLayout(v).lines[v.top]?.src ?? 1;
        a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: line, endLine: line } }, a.loc.root));
      }),
    "capture.selection": (a) =>
      withView(a, (v) => {
        const sel = v.selection;
        if (!sel) return a.message("info", "no selection — drag with the mouse to select");
        const layout = a.currentLayout(v);
        const text = selectedText(layout, sel);
        const r1 = layout.lines[Math.min(sel.a.row, sel.b.row)]?.src ?? 1;
        const r2 = layout.lines[Math.max(sel.a.row, sel.b.row)]?.src ?? r1;
        a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: r1, endLine: r2 }, snippetText: text, lang: "" }, a.loc.root));
      }),
    "scratch.open": (a) => {
      const loc = a.scratch();
      if (!readScratch(loc).trim()) return a.message("info", "the scratch is empty — c c captures a reference");
      a.open(loc.path);
    },
    "scratch.copy": (a) => {
      const text = readScratch(a.scratch());
      if (!text.trim()) return a.message("info", "the scratch is empty");
      a.copy(text);
    },
    "scratch.clear": (a) => {
      a.prompt("clear the scratch? type y ", (t) => {
        if (t.trim().toLowerCase() !== "y") return;
        clearScratch(a.scratch());
        a.message("info", "scratch cleared");
        const buf = a.buffers.get(a.scratch().path);
        if (buf) a.reloadBuffer(buf);
      });
    },
    "selection.copy": (a) =>
      withView(a, (v) => {
        if (!v.selection) return a.message("info", "no selection — drag with the mouse to select");
        a.copy(selectedText(a.currentLayout(v), v.selection));
      }),
    "theme.select": (a) => {
      const before = a.theme;
      const themes = listThemes();
      a.openList({
        title: "Theme (live preview)",
        items: themes.map((t) => ({ label: t.name, hint: t.source, data: t.name })),
        selected: themes.findIndex((t) => t.name === before.name),
        move: (item) => {
          a.theme = loadTheme(item.data as string).theme;
        },
        accept: (item) => {
          a.theme = loadTheme(item.data as string).theme;
          a.message("info", `theme ${a.theme.name} — set theme = "${a.theme.name}" in config to keep it`);
        },
        cancel: () => {
          a.theme = before;
        },
      });
    },
    "theme.set": (a, arg) => {
      if (!arg) return a.run("theme.select");
      const t = loadTheme(arg);
      if (t.warning) return a.message("warn", t.warning);
      a.theme = t.theme;
    },
    "glyphs.cycle": (a) => {
      const order = ["nerd", "unicode", "ascii"] as const;
      a.glyphs = glyphsFor(order[(order.indexOf(a.glyphs.mode) + 1) % order.length]!);
      for (const v of a.allViews()) v.layoutKey = "";
      a.message("info", `glyphs: ${a.glyphs.mode}`);
    },
    "messages.open": (a) => {
      if (!a.messages.length) return a.message("info", "no messages");
      a.openList({
        title: "Messages",
        items: [...a.messages].reverse().map((m) => ({ label: m.text, hint: `${m.level} ${new Date(m.at).toTimeString().slice(0, 8)}`, data: m })),
        accept: (item) => void a.copy((item.data as Message).text),
      });
    },
    "help.open": (a) => {
      const items: ListItem[] = [];
      for (const c of a.registry.list()) {
        const keys = a.keymap.keysFor(c.id);
        items.push({ label: c.title, detail: c.id, hint: keys.map(prettyKey).join("  ") || "—", data: c.id });
      }
      a.openList({ title: "Keys — Enter runs, Esc closes", items, accept: (item) => void a.run(item.data as string).then(() => a.host.requestRender()) });
    },
    "vault.reindex": (a) => {
      a.graph.build(true, "lazy");
      a.indexInBackground();
      a.invalidateTree();
      for (const b of a.buffers.values()) b.invalidateLayouts();
      for (const v of a.allViews()) v.layoutKey = "";
      a.message("info", `reindexed ${a.graph.notes.size} notes in ${a.graph.stats.ms.toFixed(0)} ms`);
    },
    "app.quit": (a) => a.quit(),
    "overlay.close": (a) => {
      const v = a.view;
      if (a.overlay) return a.closeOverlay(true);
      if (v?.selection) v.selection = null;
      else if (v?.find) v.find = null;
      else if (v && v.focusLink >= 0) v.focusLink = -1;
      else if (a.region === "sidebar") a.sidebarAction("leave");
    },
  };
  for (const spec of COMMAND_SPECS) {
    const run = impl[spec.id];
    if (!run) continue;
    app.registry.register({ id: spec.id, title: spec.title, run, hidden: spec.id === "overlay.close" });
  }
  for (const id of Object.keys(impl)) if (!app.registry.get(id)) throw new Error(`command ${id} has no spec in core/command-specs.ts`);
}

function withView(a: App, fn: (v: View) => void): void {
  const v = a.view;
  if (!v) return a.message("info", "no note open");
  fn(v);
}

function findStep(a: App, dir: 1 | -1): void {
  const v = a.view;
  if (!v?.find || !v.find.matches.length) return a.message("info", "no search — / starts one");
  const n = v.find.matches.length;
  v.find.current = (v.find.current + dir + n) % n;
  a.ensureVisible(v, v.find.matches[v.find.current]!.row);
  a.message("info", `${v.find.current + 1}/${n}  ${v.find.query}`);
}
