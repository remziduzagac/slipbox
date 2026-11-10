// The session: a vault's workspaces (WSP-D1, WSP-D2) — the tabs and windows kept per branch, per folder of home opened
// by name, else the vault's last — and what they share (the panes, the UI overrides, the recents), kept and restored
// on start; and the state published for the command line — the notes unsaved here (9.9), what's on screen. The code
// keeps the word session (WSP-D6); users read workspace.

import { resolve } from "node:path";
import { writeDirty } from "../../../core/workspace/git/merge/stale.ts";
import {
  type Anchor,
  SESSION_BRANCHES,
  SESSION_FOLDERS,
  type SessionTab,
  loadSession,
  recentCommands,
  SESSION_HISTORY,
  saveSession,
  type SessionState,
  type TabSet,
} from "../../../core/workspace/session/position.ts";
import { type SessionRead, sessionRead } from "../../../core/workspace/walk/own-jobs.ts";
import { diskThreads } from "../../../core/workspace/walk/walk-thread.ts";
import { listThemes } from "../../../core/rendering/theme/index.ts";
import type { App, Tab, View, UiState } from "../../app/runtime/app.ts";
import { RECENT_MAX, RECENT_NOTES_MAX } from "../../app/runtime/startup.ts";
import type { NoteBuffer } from "../../documents/buffers/buffer.ts";
import { defaultNote } from "../../documents/navigation/opening.ts";
import { tildePath } from "../../../core/workspace/vaults/names.ts";
import { uiDefaults } from "../../app/runtime/app.ts";

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
  restoreUiOverrides(s = loadSession(this.app.loc)): boolean {
    const defaults = uiDefaults(this.app.config);
    let any = false;
    for (const [k, o] of Object.entries(s?.ui ?? {})) {
      if (!(k in defaults) || !o || typeof o !== "object") continue;
      // Changed here while the session was read (a vault gone into, SD-T9): yours.
      if (k in this.app.settings.uiOverrides) continue;
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
      any = true;
    }
    return any;
  }

  /** The UI's settings as they are now put to use: the keys, the theme (one named on the command line over the
   *  session's), the glyphs, the mouse. */
  private applyUi(): void {
    const app = this.app;
    if (app.explicitTheme) app.ui.theme = app.explicitTheme;
    app.settings.applyKeys();
    app.settings.applyTheme();
    app.glyphs = app.settings.glyphSet(app.ui.glyphs);
    app.host.setMouse?.(app.ui.mouse);
  }

  /**
   * The session's tabs brought back here: whether they are, or come (read on the disk threads, SD-T5) — then `how.none`
   * once none of them could be read, the window left empty; the tab with `how.open` (absolute) shown first.
   */
  restore(how: TabsHow = {}, s = loadSession(this.app.loc)): boolean {
    if (!s) return false;
    const set = this.tabsOf(s);
    if (!set) return false;
    return this.apply(s, set, how);
  }

  /** The vault gone into's session not read yet, or given up on (SD-T9): none saved over it this visit. */
  unread = false;
  /** The vault gone into's session being read, settled once it's applied or given up on (tests). */
  entering: Promise<void> = Promise.resolve();

  /**
   * A vault gone into (17.10), the rest of it entered: its session read — on a disk thread, the keys answering
   * meanwhile, what the vault left kept nothing of (SD-T9); a test's App reads it here, at once — and what it keeps
   * then applied (`entered`). An answer for a vault since left is dropped (SD-D5); one given up on is said, the vault
   * open without its tabs and its own never saved over. `then` once what the switch opens is in (`show`,
   * `afterOpening`): the note asked for, never when it isn't; else the tab shown or the vault's own note.
   */
  enter(open: string | null, anchor?: Anchor, then?: () => void): void {
    const app = this.app;
    app.recentCommands = [];
    app.history.recentNotes = [];
    app.handoff.remoteServer = undefined;
    const loc = app.loc;
    // From the key it went on, not the keys taken so far: one already behind it counts as typed since (`afterOpening`).
    const after = then && { run: then, keys: app.input.keyAt };
    if (!app.reads.offThread) return this.entered(sessionRead(loc), open, anchor, true, after);
    // The config's meanwhile.
    this.applyUi();
    this.unread = true;
    const visit = app.vaults.visits;
    const here = () => app.loc === loc && app.vaults.visits === visit && !app.quitting;
    this.entering = diskThreads()
      .own({ op: "session", place: { key: loc.key, mode: loc.mode, root: loc.root } }, "key")
      .then(
        (a) => {
          if (!here() || !("session" in a)) return;
          this.unread = false;
          this.entered(a.session, open, anchor, false, after);
          app.relayoutAll();
          app.host.requestRender();
        },
        (err: Error) => {
          if (!here()) return;
          app.message(
            "warn",
            `${loc.root}: its workspace couldn't be read (${err.message}): its tabs aren't brought back`,
          );
          if (app.tabs.length) this.meanwhile(open, anchor, after);
          else if (open) void this.show(open, anchor, after);
          else this.afterOpening(this.openDefault(), false, after);
          app.host.requestRender();
        },
      );
  }

  /** What a vault's session keeps, applied as it's gone into: the positions it kept itself before taken in, the recents
   *  (those of the moment it was read first), the UI's settings changed here, and its tabs — none over tabs opened
   *  meanwhile — with `open` shown, or the default note; the UI's settings put to use when they changed, or `apply`;
   *  `after` once what it opens is in. */
  private entered(read: SessionRead, open: string | null, anchor?: Anchor, apply = false, after?: After): void {
    const app = this.app;
    const session = read.session;
    app.positions.takeIn(read.positions);
    const first = <T>(meanwhile: T[], kept: T[], n: number) => [...new Set([...meanwhile, ...kept])].slice(0, n);
    app.recentCommands = first(app.recentCommands, recentCommands(session, RECENT_MAX), RECENT_MAX);
    app.history.recentNotes = first(app.history.recentNotes, session?.recent_notes ?? [], RECENT_NOTES_MAX);
    app.handoff.remoteServer ??= session?.remote_server;
    if (this.restoreUiOverrides(session) || apply) this.applyUi();
    if (app.tabs.length) return this.meanwhile(open, anchor, after);
    // Read on the disk threads (SD-T5): the default note once none of the tabs could be, as when none was kept.
    const none = open ? undefined : () => this.openDefault();
    const restored = app.config.ui.restore_session && this.restore({ open, none }, session);
    // The file asked for once the tab shown is back — the keys waiting for both, the rest coming in the background;
    // that tab failed, said, the file all the same; the vault left meanwhile, neither: it's another vault's.
    const coming = restored ? this.restoring : null;
    if (coming && open) {
      const here = this.stillIn();
      const shown = () => (here() ? this.show(open, anchor, after) : undefined);
      void app.reads.hold(coming.catch(this.failed(`${tildePath(app.loc.root)}'s tabs`, here)).then(shown));
    } else if (open) void this.show(open, anchor, after);
    else this.afterOpening(restored ? coming : this.openDefault(), coming !== null, after);
  }

  /** Tabs opened while the session was read (SD-T9): they stay, the session's tabs not brought back over them, but the
   *  note the switch was for is opened and shown all the same — unless you opened it yourself meanwhile, where you've
   *  gone since being yours, and `after` isn't run; with none asked for, `after` at once. */
  private meanwhile(open: string | null, anchor?: Anchor, after?: After): void {
    if (!open) return after?.run();
    if (!this.app.tabs.some((t) => t.views.some((x) => x.buf.abs === open))) void this.show(open, anchor, after);
  }

  /** `abs` shown: its tab, the view on it, at `anchor`; in a tab of its own when none has it, read on a disk thread
   *  first. `after` once it's shown, the keys waiting for it as for the read — never when it isn't: the read given up
   *  (`esc`) or failed (said), the vault left meanwhile or slipbox quitting. */
  private show(abs: string, anchor?: Anchor, after?: After): void | Promise<void> {
    const app = this.app;
    const here = this.stillIn();
    const shown = () => {
      if (after && here() && app.view?.buf.abs === abs) after.run();
    };
    const i = app.tabs.findIndex((t) => t.views.some((x) => x.buf.abs === abs));
    if (i < 0) {
      const opening = app.openInNewTab(abs, anchor);
      if (!(opening instanceof Promise)) return shown();
      return app.reads.hold(opening.then(shown, this.failed(tildePath(abs), here)));
    }
    app.activeTab = i;
    const t = app.tabs[i]!;
    t.active = t.views.findIndex((x) => x.buf.abs === abs);
    if (anchor) app.history.jumpTo(t.views[t.active]!, anchor);
    shown();
  }

  /**
   * `after`, for a switch with no note asked for, once what it opens is in, read or not (failed, said) — the keys
   * waiting for it: the vault's own note, or the tab shown (`restoring`). When that tab couldn't be, once the tabs
   * behind it are read too (the vault's own note may open after them), which no key waits for: not when a key was
   * taken since the switch — it would take the keys from what you're typing. Run after it, a folder revealed keeps the
   * explorer it was revealed in. Not once the vault is left, or slipbox quits.
   */
  private afterOpening(opening: void | Promise<void> | null, restoring: boolean, after?: After): void {
    if (!after) return;
    const app = this.app;
    const here = this.stillIn();
    const now = () => {
      if (here()) after.run();
    };
    const idle = () => {
      if (app.input.keysSeen === after.keys) now();
    };
    const done = () => (restoring && !app.tabs.length ? void Promise.resolve(this.behind).then(idle, idle) : now());
    if (!(opening instanceof Promise)) return done();
    const failed = this.failed(`${tildePath(app.loc.root)}'s ${restoring ? "tabs" : "own note"}`, here);
    void app.reads.hold(
      opening.then(done, (err) => {
        failed(err);
        done();
      }),
    );
  }

  /** Whether the vault open now is still the one it was, slipbox not quitting: what a switch opens there, and what
   *  follows it, dropped once it isn't. */
  private stillIn(): () => boolean {
    const app = this.app;
    const visit = app.vaults.visits;
    return () => app.vaults.visits === visit && !app.quitting;
  }

  /** A switch's opening that failed: said, as a key's read says its own — unless the vault was left meanwhile. */
  private failed(what: string, here: () => boolean): (err: unknown) => void {
    return (err) => {
      if (here()) this.app.message("warn", `${what} couldn't be opened (${(err as Error).message})`);
    };
  }

  /** The note opened when none is named or brought back (`defaultNote`), in a tab of its own; read on a disk thread, a
   *  promise of it. */
  openDefault(): void | Promise<void> {
    const first = defaultNote(this.app.graph, this.app.homeFolder);
    if (first) return this.app.openInNewTab(first);
  }

  /** A window's own session restored, as a restart's note keeps it (UPG-D4): never `session.json`'s, which another
   *  window on the vault may have written meanwhile. */
  restoreFrom(s: SessionState): boolean {
    return this.apply(s, s);
  }

  /** The tab shown being brought back on the disk threads (SD-T5), till it's read: what opens after it waits. */
  restoring: Promise<void> | null = null;
  /** The tabs after it, read in the background till the last is: the keys never wait for them. */
  behind: Promise<void> | null = null;

  private apply(s: SessionState, set: Pick<TabSet, "tabs" | "activeTab">, how: TabsHow = {}): boolean {
    const coming = this.openTabs(set.tabs, set.activeTab, how);
    this.restoring = coming instanceof Promise ? coming : null;
    // Read on the disk threads, the tabs come as they're read: brought back, unless none is kept.
    if (this.restoring ? !set.tabs.length : !this.app.tabs.length) return false;
    this.app.sidebar.visible = s.sidebar;
    if (s.outline !== undefined) this.app.outline.visible = s.outline;
    if (s.sidebar_width) this.app.panels.sideW = s.sidebar_width;
    if (s.problems_height) this.app.problems.panel.height = s.problems_height;
    if (s.outline_width) this.app.panels.outW = s.outline_width;
    this.app.explorer.reveal();
    return true;
  }

  /** The tabs `restore` brings back here: none, without a session or with nothing kept for here. */
  toRestore(s = loadSession(this.app.loc)): SessionTab[] {
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

  /**
   * Tabs from the session opened, after any there are; the active one as it was. Read on the disk threads (SD-T5,
   * SD-D12), a promise of the tab shown, read first, the keys waiting for it as for any note opened; then the rest in
   * order, one at a time, in the background, each in its place as it comes, the keys free meanwhile — so a thread stays
   * free for the watcher's look and a key's read — and `how.none` once none could be read. A test's App, and the start
   * (SD-T10's), read here at once.
   */
  openTabs(tabs: SessionTab[], activeTab: number, how: TabsHow = {}): void | Promise<void> {
    // In home, their folders asked for first (VV-D2): a tab in one its walk hasn't reached is a note of home's all the same.
    this.app.vaults.askTabs(tabs);
    if (this.app.reads.offThread) return this.readTabs(tabs, activeTab, how);
    for (const t of tabs) {
      const tab = this.tabOf(t, (path) => this.app.buffer(path));
      if (tab) this.app.tabs.push(tab);
    }
    this.app.activeTab = Math.max(0, Math.min(activeTab, this.app.tabs.length - 1));
  }

  /** `openTabs` off the screen's thread: the tab shown, the keys waiting for it, then the rest, each read and put in its
   *  place; none once the vault is left. The tab with `how.open` is the one shown, when there's one. */
  private readTabs(tabs: SessionTab[], activeTab: number, how: TabsHow): Promise<void> {
    const loc = this.app.loc;
    const has = (t: SessionTab) => t.panes.some((p) => resolve(loc.root, p.path) === how.open);
    const shown = (how.open ? tabs.find(has) : undefined) ?? tabs[Math.max(0, Math.min(activeTab, tabs.length - 1))];
    const placed = new Map<SessionTab, Tab>();
    const place = async (t: SessionTab): Promise<boolean> => {
      const first = t === shown;
      const read = new Map<string, NoteBuffer | null>();
      for (const p of t.panes)
        if (!read.has(p.path))
          read.set(p.path, await this.app.bufferOpening.load(p.path, first ? this.app.view : null, !first));
      if (this.app.loc !== loc || this.app.quitting) return false;
      const tab = this.tabOf(t, (path) => read.get(path) ?? null);
      if (!tab) return true;
      // Before the first of those come so far that the session has after it; the tab you're on stays yours.
      const on = this.app.tab;
      const after = [...placed].filter(([x]) => tabs.indexOf(x) > tabs.indexOf(t)).map(([, x]) => x);
      const at = after.length ? Math.min(...after.map((x) => this.app.tabs.indexOf(x))) : this.app.tabs.length;
      this.app.tabs.splice(at, 0, tab);
      placed.set(t, tab);
      this.app.activeTab = Math.max(0, this.app.tabs.indexOf(first || !on ? tab : on));
      if (first) this.app.explorer.reveal();
      this.app.host.requestRender();
      return true;
    };
    // The rest after it, in the background: a read of one is a background read (`load`'s), never held.
    const rest = async (): Promise<void> => {
      for (const t of tabs) if (t !== shown && !(await place(t))) return;
      if (!placed.size && !this.app.tabs.length) await how.none?.();
    };
    const first = shown ? this.app.reads.hold(place(shown)) : Promise.resolve(false);
    // The tab shown failed (said where it's waited for, `entered`): the rest read all the same.
    this.behind = first.then((on) => (on ? rest() : undefined), rest);
    return first.then(() => {});
  }

  /** A tab of the session's, its windows of the notes `bufferOf` gives (null: not opened, left out); null with none. */
  private tabOf(t: SessionTab, bufferOf: (path: string) => NoteBuffer | null): Tab | null {
    const views: View[] = [];
    for (const p of t.panes) {
      const buf = bufferOf(p.path);
      if (!buf) continue;
      const view = this.app.makeView(buf, p.anchor, p.cursor);
      // Its history too, so back, forward and the history list go on where they were.
      view.back = [...(p.back ?? [])];
      view.fwd = [...(p.fwd ?? [])];
      views.push(view);
    }
    if (!views.length) return null;
    return {
      views,
      active: Math.max(0, Math.min(t.active, views.length - 1)),
      orientation: t.orientation ?? "side",
      ratio: t.ratio ?? this.app.config.ui.split_ratio,
      ...(t.pinned ? { pinned: true } : {}),
    };
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

  /** The session saved: the tabs, as the last ones and as `branch`'s (by default, HEAD's as last seen). The positions
   *  alone while the vault's own isn't read (`unread`): nothing saved over what it couldn't read yet. */
  save(branch: string | null = this.app.git.head?.branch ?? null): void {
    const s = this.snapshot();
    this.app.positions.save();
    if (this.unread) return;
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

/** What follows a switch (`SwitchHow.after`), and the key it went on (`Input.keyAt`). */
interface After {
  run: () => void;
  keys: number;
}

/** How the session's tabs come back: the tab with `open` (absolute) shown first; `none` once none could be read, read on
 *  the disk threads (here, `restore` says false), the tabs behind the one shown done once it is (`behind`). */
interface TabsHow {
  open?: string | null;
  none?: () => void | Promise<void>;
}

/** The `n` sets of tabs left most recently, `keep`'s always among them. */
function recent(sets: Record<string, TabSet>, n: number, keep?: string): Record<string, TabSet> {
  const sorted = Object.entries(sets).sort((a, b) =>
    a[0] === keep ? -1 : b[0] === keep ? 1 : a[1].at < b[1].at ? 1 : -1,
  );
  return Object.fromEntries(sorted.slice(0, n));
}
