// The session: a vault's workspaces (WSP-D1, WSP-D2) — the tabs and windows kept per branch, per folder of home opened
// by name, else the vault's last — and what they share (the panes, the UI overrides, the recents), kept and restored
// on start; and the state published for the command line — the notes unsaved here (9.9), what's on screen. The code
// keeps the word session (WSP-D6); users read workspace.

import { writeDirty } from "../core/workspace/git/merge/stale.ts";
import {
  SESSION_BRANCHES,
  SESSION_FOLDERS,
  type SessionTab,
  loadSession,
  SESSION_HISTORY,
  saveSession,
  type SessionState,
  type TabSet,
} from "../core/workspace/session/position.ts";
import { listThemes } from "../core/rendering/theme/index.ts";
import type { App, View, UiState } from "./app.ts";
import { uiDefaults } from "./app.ts";

/** The workspaces kept and restored, and the state published for the CLI. */
export class Session {
  constructor(readonly app: App) {}

  /**
   * The advisory staleness file (9.9, decision 9.4): the notes with unsaved changes here, for the
   * CLI to warn agents about. Written when the list changes; removed when it's empty, and on quit.
   */
  publishDirty(): void {
    const paths = this.app
      .dirtyBuffers()
      .map((b) => b.key)
      .sort();
    const key = `${this.app.loc.root}\0${paths.join("\n")}`;
    if (key === this.lastDirty) return;
    this.lastDirty = key;
    try {
      writeDirty(this.app.loc, paths);
    } catch {}
  }

  private lastDirty = "";

  /**
   * The session and positions, which `slipbox history` reads (what's open, the note on screen, the
   * nvim picked for send): kept current while slipbox runs, not only at quit, so an agent sees what
   * the user sees and a crash loses little. Saved a second after they last change.
   */
  publishState(): void {
    const v = this.app.view;
    const sig = [
      this.app.activeTab,
      v ? `${v.buf.key}@${v.cur.row}` : "",
      this.app.handoff.remoteServer ?? "",
      ...this.app.tabs.map((t) => `${t.active}:${t.views.map((x) => x.buf.key).join(",")}`),
    ].join("|");
    if (sig === this.lastState || this.app.quitting) return;
    this.lastState = sig;
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      if (this.app.quitting) return;
      try {
        this.save();
      } catch {}
    }, 1000);
    (this.stateTimer as { unref?: () => void }).unref?.();
  }

  private lastState = "";
  stateTimer: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------------------------------
  // Session (3.15)

  /**
   * UI settings changed in the TUI, on every start (with a path too, and with restore_session
   * off): a session value is kept only while the config value it overrode is unchanged.
   */
  restoreUiOverrides(): void {
    const s = loadSession(this.app.loc);
    const defaults = uiDefaults(this.app.config);
    for (const [k, o] of Object.entries(s?.ui ?? {})) {
      if (!(k in defaults) || !o || typeof o !== "object") continue;
      if (JSON.stringify(defaults[k as keyof UiState]) !== JSON.stringify(o.base)) continue;
      if (typeof o.value !== typeof defaults[k as keyof UiState]) continue;
      // A value that isn't one any more (a glyph set that doesn't exist, a theme file since deleted)
      // is dropped, not kept and saved again forever.
      if (k === "glyphs" && !["nerd", "unicode", "ascii", "auto"].includes(o.value as string)) continue;
      if (k === "theme" && !listThemes().some((t) => t.name === o.value)) continue;
      if (k === "scratch_in" && o.value !== "float" && o.value !== "right") continue;
      if (k === "code_wrap" && o.value !== "scroll" && o.value !== "wrap") continue;
      (this.app.ui as unknown as Record<string, unknown>)[k] = o.value;
      this.app.settings.uiOverrides[k] = o;
    }
  }

  restore(): boolean {
    const s = loadSession(this.app.loc);
    if (!s) return false;
    const set = this.tabsOf(s);
    if (!set) return false;
    return this.apply(s, set);
  }

  /** A window's own session restored, as a restart's note keeps it (UPG-D4): never `session.json`'s, which another
   *  window on the vault may have written meanwhile. */
  restoreFrom(s: SessionState): boolean {
    return this.apply(s, s);
  }

  private apply(s: SessionState, set: Pick<TabSet, "tabs" | "activeTab">): boolean {
    this.openTabs(set.tabs, set.activeTab);
    if (!this.app.tabs.length) return false;
    this.app.sidebar.visible = s.sidebar;
    if (s.outline !== undefined) this.app.outline.visible = s.outline;
    if (s.sidebar_width) this.app.panels.sideW = s.sidebar_width;
    if (s.problems_height) this.app.problems.panel.height = s.problems_height;
    if (s.outline_width) this.app.panels.outW = s.outline_width;
    this.app.explorer.reveal();
    return true;
  }

  /** The tabs `restore` brings back here: none, without a session or with nothing kept for here. */
  toRestore(): SessionTab[] {
    const s = loadSession(this.app.loc);
    return (s && this.tabsOf(s)?.tabs) || [];
  }

  /**
   * The tabs `s` brings back: this branch's, when it has kept some (5.9), else the last ones. In home (VV-D2), a folder
   * opened by name has its own — none yet, none: its own note opens — and home's top its own, once folders keep theirs.
   */
  private tabsOf(s: SessionState): Pick<TabSet, "tabs" | "activeTab"> | undefined {
    const home = this.app.loc.mode === "home";
    if (home && this.app.homeFolder !== null) return s.folders?.[this.app.homeFolder];
    const b = this.app.git.head?.branch;
    const mine = b ? s.branches?.[b] : undefined;
    if (mine?.tabs.length) return mine;
    return (home ? s.folders?.[""] : undefined) ?? s;
  }

  /** Tabs from the session opened, after any there are; the active one as it was. */
  openTabs(tabs: SessionTab[], activeTab: number): void {
    // In home, their folders asked for first (VV-D2): a tab in one its walk hasn't reached is a note of home's all the same.
    this.app.vaults.askTabs(tabs);
    for (const t of tabs) {
      const views: View[] = [];
      for (const p of t.panes) {
        const buf = this.app.buffer(p.path);
        if (!buf) continue;
        const view = this.app.makeView(buf, p.anchor, p.cursor);
        // Its history too, so back, forward and the history list go on where they were.
        view.back = [...(p.back ?? [])];
        view.fwd = [...(p.fwd ?? [])];
        views.push(view);
      }
      if (views.length)
        this.app.tabs.push({
          views,
          active: Math.min(t.active, views.length - 1),
          orientation: t.orientation ?? "side",
          ratio: t.ratio ?? this.app.config.ui.split_ratio,
          ...(t.pinned ? { pinned: true } : {}),
        });
    }
    this.app.activeTab = Math.max(0, Math.min(activeTab, this.app.tabs.length - 1));
    for (const t of this.app.tabs) t.active = Math.max(0, Math.min(t.active, t.views.length - 1));
  }

  /** This window's session as it is now: what `save` keeps, and what a restart's note carries (UPG). */
  snapshot(): SessionState {
    for (const v of this.app.allViews()) this.app.history.remember(v);
    return {
      version: 1,
      tabs: this.app.tabs.map((t) => ({
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
      activeTab: this.app.activeTab,
      sidebar: this.app.sidebar.visible,
      outline: this.app.outline.visible,
      sidebar_width: this.app.panels.sideW,
      problems_height: this.app.problems.panel.height ?? undefined,
      outline_width: this.app.panels.outW,
      ui: this.app.settings.uiOverrides,
      recent_commands: this.app.recentCommands,
      recent_notes: this.app.history.recentNotes,
      ...(this.app.handoff.remoteServer ? { remote_server: this.app.handoff.remoteServer } : {}),
    };
  }

  /** The session saved: the tabs, as the last ones and as `branch`'s (by default, HEAD's as last seen). */
  save(branch: string | null = this.app.git.head?.branch ?? null): void {
    const s = this.snapshot();
    this.app.positions.save();
    const before = loadSession(this.app.loc);
    const at = new Date(this.app.now()).toISOString();
    const set = { tabs: s.tabs, activeTab: s.activeTab, at };
    // A folder of home opened by name keeps its own tabs (VV-D2); home's top keeps its own beside them — what it had
    // before folders kept theirs, the first time one does. A branch's are its top's.
    const folder = this.app.loc.mode === "home" ? this.app.homeFolder : null;
    if (this.app.loc.mode === "home") {
      const folders = { ...(before?.folders ?? {}) };
      if (folder !== null && !folders[""])
        folders[""] = { tabs: before?.tabs ?? [], activeTab: before?.activeTab ?? 0, at: "" };
      folders[folder ?? ""] = set;
      s.folders = recent(folders, SESSION_FOLDERS, "");
    }
    // Each branch's tabs, as it was left (5.9): the most recent few kept.
    const branches = { ...(before?.branches ?? {}) };
    if (branch && folder === null) branches[branch] = set;
    s.branches = recent(branches, SESSION_BRANCHES);
    saveSession(this.app.loc, s);
  }
}

/** The `n` sets of tabs left most recently, `keep`'s always among them. */
function recent(sets: Record<string, TabSet>, n: number, keep?: string): Record<string, TabSet> {
  const sorted = Object.entries(sets).sort((a, b) =>
    a[0] === keep ? -1 : b[0] === keep ? 1 : a[1].at < b[1].at ? 1 : -1,
  );
  return Object.fromEntries(sorted.slice(0, n));
}
