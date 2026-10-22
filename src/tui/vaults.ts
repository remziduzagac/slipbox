// Vaults in the TUI (17.x, VV): switching into another and back, a folder made a vault or unmade, the named folders
// and their copies (21.x).

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative } from "node:path";
import { writeDirty } from "../core/stale.ts";
import { loadConfig } from "../core/config.ts";
import { Graph } from "../core/graph.ts";
import { leftOutOfHome } from "../core/home.ts";
import { lintCommand } from "../core/lint.ts";
import { slipboxOwn } from "../core/paths.ts";
import { type Anchor, type CursorAnchor, loadSession, PositionStore } from "../core/position.ts";
import { openVault, Reach } from "../core/reach.ts";
import {
  type Applied,
  applyPlan,
  planMakeVault,
  planRelink,
  planUnmakeVault,
  planVaultRename,
} from "../core/rename.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import {
  copyAvailable,
  folderIdentity,
  lookupFolder,
  type NamedFolder,
  pointerName,
  readFolders,
  repositoryCopies,
  setDefaultCopy,
  suggestFolderName,
} from "../core/folders.ts";
import {
  configFilesFor,
  initVault,
  isInside,
  locateVault,
  locationAt,
  vaultAt,
  vaultOf,
  recordLocation,
  rootAt,
  type VaultLocation,
} from "../core/vault.ts";
import type { App, ListItem, PromptOverlay } from "./app.ts";
import { uiDefaults, RECENT_MAX, RECENT_NOTES_MAX } from "./app.ts";
import { type ExplorerItem, listedDown, type TreeRow } from "./explorer.ts";

/** Vaults: switching, making and unmaking, named folders. */
export class Vaults {
  constructor(readonly app: App) {}

  /** Where the TUI was before each switch into another vault: `back` returns there (17.10) — to the folder of home it
   *  had open by name (VV-D2), when it had one. */
  trail: { root: string; path: string; anchor: Anchor; cursor: CursorAnchor; folder?: string }[] = [];

  /**
   * What's asked for, entering the vault open (VV-D2) — the one way in, from the start or a switch, a folder revealed
   * alike: a folder of home, by name (`folder`) or a file's (`open`; both absolute), its notes there at once
   * (`Graph.askFolder`). The one named is `app.homeFolder`, home's path for it: its own tabs, its own first note.
   */
  ask(folder: string | null, open: string | null): void {
    const asked = this.app.graph.askFolder(folder ?? (open ? dirname(open) : this.app.loc.root));
    this.app.homeFolder = folder ? asked : null;
  }

  /** What's said when no note opens: a folder of home its index leaves out (`~/Downloads`) says why (VV-D2). */
  noNotes(): string {
    const f = this.app.homeFolder;
    const abs = f ? join(this.app.loc.root, f) : this.app.loc.root;
    const why = f ? leftOutOfHome(this.app.loc.root, this.app.graph.filter, f) : null;
    return why
      ? `${tildePath(abs)}: left out of home's index (${why}) — its files are listed in the explorer, not indexed`
      : `no notes in ${tildePath(abs)}`;
  }

  /** `space v m` in a vault (18.13): the explorer's selected folder (or this note's) made a vault. */
  makeHere(): void {
    const f = this.app.explorer.folderTarget();
    if (!f) return;
    if (f.vault)
      return this.app.message(
        "info",
        `${f.rel} is a vault already — space v shift+m makes it part of the vault holding it`,
      );
    this.makeItem(f);
  }

  /** `space v shift+m` (18.13): the explorer's selected vault, or this one, made a plain folder of the vault holding it. */
  unmakeHere(): void {
    const item = this.app.explorer.focused() ? this.app.explorer.item() : null;
    if (item?.vault) return this.unmakeItem(item);
    if (item)
      return this.app.message(
        "info",
        "to make a vault part of this one, select a nested vault (its folder has its own icon)",
      );
    this.unmakeThis();
  }

  /**
   * This vault, nested in another, made a plain folder of it (18.11, `space v shift+m` from a note): the
   * preview from the vault holding it; then into that vault, the note still open.
   */
  unmakeThis(): void {
    const holder = this.app.loc.mode === "vault" ? vaultOf(dirname(this.app.loc.root)) : null;
    if (!holder)
      return this.app.message(
        "info",
        `${this.app.loc.name ?? this.app.loc.root} isn't inside another vault: only a vault nested in another becomes part of the vault holding it`,
      );
    // Refused before anything changes when the switch into the holder would be: never a root
    // whose .slipbox/ is gone, still open.
    if (!this.app.saving.canLeave()) return;
    const parent = openVault(holder);
    const rel = relative(holder, this.app.loc.root);
    const open = this.app.view?.buf.abs ?? null;
    this.app.renaming.preview(
      () => planUnmakeVault(parent, rel),
      (plan) => {
        if (!this.app.saving.canLeave()) return; // changed while the preview showed
        let applied: Applied;
        try {
          applied = applyPlan(parent, plan);
        } catch (err) {
          return this.app.message("error", (err as Error).message);
        }
        const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
        this.switchVault(vaultAt(holder), open && existsSync(open) ? open : null);
        this.app.message(
          "info",
          `made ${rel}/ part of ${plan.to} (its .slipbox/ is in the trash): ${n} change${n === 1 ? "" : "s"} in ${applied.written.length} file${applied.written.length === 1 ? "" : "s"}`,
        );
      },
    );
  }

  /**
   * A folder given a `.slipbox/` of its own — a root (18.11): its name asked, a distinct one suggested,
   * none when cleared (21.10); then the preview of the links that would stop reaching across, fixed. A
   * loose folder's: the choice `vault.init` gives, and into it.
   */
  makeItem(item: ExplorerItem): void {
    const abs = join(this.app.loc.root, item.rel);
    if (this.app.loc.mode === "folder") return this.choices(abs);
    this.app.overlays.prompt(`give ${item.rel}/ its .slipbox/, called (empty: no name): `, (name) => {
      this.app.renaming.preview(() => planMakeVault(this.app.graph, item.rel, name.trim() || null));
    });
    if (this.app.overlay?.kind === "prompt") this.app.overlay.text = suggestFolderName(abs, this.app.loc.name);
  }

  /** A vault nested here made a plain folder of this one (18.11): the preview, then done. */
  unmakeItem(item: ExplorerItem): void {
    this.app.renaming.preview(() => planUnmakeVault(this.app.graph, item.rel));
  }

  /** A nested root's name (`R`, the row's button): its `.slipbox/` name, which pointers use (17.15, 21.10: `slipbox name`); links are paths and don't change. */
  renameItem(item: ExplorerItem): void {
    if (!item.vault)
      return this.app.message("info", "R names a nested vault: select one (its folder has its own icon)");
    const root = join(this.app.loc.root, item.rel);
    const name = rootAt(root).name ?? posix.basename(item.rel);
    this.app.overlays.prompt(`name ${name}, as pointers name it: `, (text) => {
      const typed = text.trim();
      if (!typed || typed === name) return;
      this.app.renaming.preview(() => planVaultRename(rootAt(root), typed));
    });
    (this.app.overlay as PromptOverlay).text = name;
  }

  /**
   * A second copy of this folder seen (21.6): which one links to its name open — asked once, the
   * answer remembered; dismissed, the first found stays, and it isn't asked again.
   */
  askDefaultCopy(): void {
    const ident = this.app.loc.mode === "vault" ? folderIdentity(this.app.loc.root) : null;
    const f = ident ? readFolders().find((x) => x.key === ident.key) : undefined;
    const here = f?.copies.filter((c) => copyAvailable(c.path)) ?? [];
    if (!f?.ask || here.length < 2) return;
    this.app.overlays.openList({
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
        this.app.message("info", `links to ${f.name} open ${tildePath(item.data as string)}`);
      },
      cancel: () => setDefaultCopy(f.key, null),
    });
  }

  /**
   * Become another root's TUI, as if started there (17.10): its config, index, watcher, reading
   * positions and session — with `open` open (an absolute path), or the session's tabs. Leaving
   * saves this one's as quitting does. Refused while a note is unsaved: it would be left behind.
   * `folder`: a folder of home gone into by name (VV-D2: a folder revealed), as `slipbox ~/notes` opens it.
   */
  switchVault(
    target: VaultLocation,
    open: string | null,
    anchor?: Anchor,
    how: { back?: boolean; folder?: string } = {},
  ): boolean {
    if (!this.app.saving.canLeave()) return false;
    const v = this.app.view;
    const folder = this.app.homeFolder !== null ? join(this.app.loc.root, this.app.homeFolder) : undefined;
    const from = v
      ? {
          root: this.app.loc.root,
          path: v.buf.abs,
          anchor: { ...v.topAnchor },
          cursor: { ...v.curAnchor },
          ...(folder ? { folder } : {}),
        }
      : null;
    // Leave, as quitting would.
    this.app.session.save();
    try {
      writeDirty(this.app.loc, []);
    } catch {}
    this.app.watcher?.close();
    this.app.watcher = null;
    // What was looked at through a link there is behind you (VV-D6).
    this.app.following.left();
    // The explorer's unfolded folders, by their whole paths: the vault's own are its paths in it.
    const unfolded = [...this.app.explorer.expanded].map((k) => this.app.explorer.rowAbs({ path: k }));
    // Enter.
    this.app.loc = target;
    this.app.feed.reset();
    const { carriedFrom } = recordLocation(target);
    this.app.settings.lastGood.clear();
    const loaded = loadConfig({
      ...configFilesFor(target),
      configFile: this.app.configFile,
      lastGood: this.app.settings.lastGood,
    });
    this.app.config = loaded.config;
    this.app.settings.origins = loaded.origins;
    this.app.languages.lintCmd = lintCommand(
      this.app.config.lint,
      target.root,
      undefined,
      this.app.config.lsp.auto_install,
    );
    this.app.languages.vaultLint = { running: false, issues: null };
    this.app.languages.relint();
    for (const w of loaded.warnings) this.app.message("warn", w);
    this.app.reach = new Reach(target);
    this.app.graph = new Graph(target, this.app.config).build(true, "lazy");
    this.app.graph.reach = this.app.reach;
    // A folder of home gone into, by name or a file's (VV-D2): its notes there at once, as when slipbox starts there.
    this.ask(how.folder ?? null, open);
    this.app.watch.followGraph();
    if (this.app.live) this.app.loadCodeGrammars();
    for (const e of this.app.graph.errors) this.app.message("warn", e);
    this.app.positions = new PositionStore(target);
    for (const b of this.app.buffers.values()) this.app.languages.servers?.close(b.abs);
    this.app.buffers.clear();
    this.app.tabs = [];
    this.app.activeTab = 0;
    this.app.overlay = null;
    // The explorer's view (VV-D5): holding the vault gone into, it stays, the vault unfolded in it; else it
    // zooms out to the common parent of the two, only their paths unfolded. Where the tree can't show the
    // vault (in a hidden folder: a worktree in .claude/), it moves to the vault.
    this.app.explorer.expanded = new Set(unfolded.map((a) => this.app.explorer.rowPath(a)));
    this.app.explorer.invalidateTree();
    const T = this.app.explorer.top;
    if (
      isInside(T, target.root) ? !listedDown(T, target.root) : !this.app.explorer.zoomToHold(target.root, target.root)
    ) {
      this.app.explorer.top = this.app.explorer.trail = target.root;
      this.app.explorer.expanded.clear();
    } else if (isInside(T, target.root)) {
      for (let d = target.root; d !== T; d = dirname(d)) this.app.explorer.expanded.add(this.app.explorer.rowPath(d));
      if (target.root !== T) this.app.explorer.trail = target.root;
    }
    this.app.explorer.invalidateTree();
    // The clipboard and the last delete name the old root's things: forgotten.
    this.app.files.clip = null;
    this.app.files.lastTrashed = null;
    // So are git's states (the explorer's marks, the Problems' conflicts): asked again, below.
    this.app.git.states = null;
    this.app.git.folders.clear();
    // And the git panel's: the files git listed, where the branch stood, those opened up, and the message typed for a
    // commit there — never committed in another vault.
    this.app.git.entries = null;
    this.app.git.track = null;
    this.app.git.opened.clear();
    this.app.gitPanel.message = "";
    this.app.gitPanel.typing = false;
    this.app.panels.leftPositions.clear();
    this.app.sidebar = { visible: this.app.config.ui.sidebar, overlay: false, selected: 0, scroll: 0 };
    this.app.panels.sideW = this.app.config.ui.sidebar_width;
    this.app.panels.outW = this.app.config.ui.outline_width;
    this.app.outline = {
      visible: this.app.config.ui.outline,
      overlay: false,
      selected: 0,
      scroll: 0,
      folded: new Set(),
      forKey: "",
    };
    this.app.explorer.invalidateTree();
    this.app.ui = uiDefaults(this.app.config);
    if (process.env.NO_COLOR) this.app.ui.theme = "mono";
    this.app.settings.uiOverrides = {};
    const session = loadSession(target);
    this.app.recentCommands = (session?.recent_commands ?? [])
      .filter((id) => typeof id === "string")
      .slice(0, RECENT_MAX);
    this.app.handoff.remoteServer = session?.remote_server;
    this.app.history.recentNotes = (session?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
    this.app.session.restoreUiOverrides();
    if (this.app.explicitTheme) this.app.ui.theme = this.app.explicitTheme;
    this.app.settings.applyKeys();
    this.app.settings.applyTheme();
    this.app.glyphs = this.app.settings.glyphSet(this.app.ui.glyphs);
    this.app.host.setMouse?.(this.app.ui.mouse);
    const restored = this.app.config.ui.restore_session && this.app.session.restore();
    if (open) {
      const i = this.app.tabs.findIndex((t) => t.views.some((x) => x.buf.abs === open));
      if (i >= 0) {
        this.app.activeTab = i;
        const t = this.app.tabs[i]!;
        t.active = t.views.findIndex((x) => x.buf.abs === open);
        if (anchor) this.app.history.jumpTo(t.views[t.active]!, anchor);
      } else this.app.openInNewTab(open, anchor);
    } else if (!restored) {
      const first = this.app.defaultNote(this.app.homeFolder);
      if (first) this.app.openInNewTab(first);
    }
    if (from && !how.back) this.trail.push(from);
    this.app.region = "content";
    if (carriedFrom) {
      this.app.message("info", carried(target, carriedFrom));
      this.offerMovedRelink();
    }
    this.askDefaultCopy();
    this.app.relayoutAll();
    this.app.session.publishState();
    this.app.settings.recordStamps();
    if (this.app.live) {
      if (this.app.config.watch.enabled) this.app.watch.startWatcher();
      this.app.watch.indexInBackground();
      this.app.git.refresh();
      // Home never walked yet (VV-D2): its top alone, the rest while nobody is working.
      if (this.app.graph.home?.walked === null) this.app.watch.walkHomeAgain();
      // Its followed links' targets asked whether they answer (VV-D6), walked once they do.
      this.app.following.probe();
    }
    this.app.message(
      "info",
      target.mode === "folder"
        ? `${rootLabel(target)} — ${tildePath(open ?? target.root)}`
        : target.mode === "vault" && target.name
          ? `${rootLabel(target)} — ${target.root}`
          : target.root,
    );
    this.app.host.requestRender();
    return true;
  }

  /** How a root is named to the user (21.9): its name, else its path; a plain folder, its path. */
  label(loc: Pick<VaultLocation, "mode" | "name" | "root" | "worktree">): string {
    return rootLabel(loc);
  }

  /** A root row of the explorer: go into it (17.13). */
  enterRoot(row: TreeRow): void {
    const r = row.root;
    if (!r) return;
    this.switchVault(r.kind === "folder" ? locationAt(r.abs) : rootAt(r.abs), null);
  }

  /**
   * An absolute path that belongs to another vault or repository, or to Elsewhere (VV-D3), opened by choice (`:e`,
   * the explorer, a peek's `o`; a link, a backlink or a search hit only peeks, VV-D7): switch there and open it
   * (17.10, VV-D4); true when it was (or the switch was refused). In Elsewhere, a file of Elsewhere opens there: it's
   * one place, wherever its files are.
   */
  intoOther(path: string, anchor?: Anchor): boolean {
    // slipbox's own files (the scratch, in its state folder under ~) are no vault's to go into, home's neither (VV-D2).
    if (!isAbsolute(path) || !existsSync(path) || slipboxOwn(path)) return false;
    let target: VaultLocation;
    try {
      target = locateVault({ path });
    } catch {
      return false;
    }
    if (target.mode === "folder" ? this.app.loc.mode === "folder" : target.root === this.app.loc.root) return false;
    this.switchVault(target, path, anchor);
    return true;
  }

  /** Back from the first place in this vault: to the vault before (17.10). */
  back(): boolean {
    const t = this.trail.pop();
    if (!t) return false;
    let target: VaultLocation;
    let open: string | null = null;
    try {
      const file = existsSync(t.path) ? locateVault({ path: t.path }) : null;
      // A file of another vault read there, kept from a peek (VV-D7), is no way back into it: its vault, its tabs —
      // Elsewhere's (VV-D3) neither, kept in a vault.
      const kept = !!file && (file.mode === "folder" ? vaultOf(t.root) !== null : file.root !== t.root);
      target = file && !kept ? file : locateVault({ path: t.root });
      if (file && !kept) open = t.path;
    } catch {
      this.app.message("warn", `${t.root} is gone`);
      return true;
    }
    // Back into home, to the folder of it that was open by name (VV-D2): its tabs, as they were.
    const folder = target.mode === "home" && target.root === t.root ? t.folder : undefined;
    if (!this.switchVault(target, open, t.anchor, { back: true, ...(folder ? { folder } : {}) })) this.trail.push(t);
    return true;
  }

  /**
   * Make a loose folder `dir` a vault (`vault.init`): the choice, as a list. A git checkout is a vault
   * already (20.3), so a loose folder is never one: `.slipbox/` is the only way.
   */
  choices(dir: string): void {
    const items: ListItem[] = [
      {
        label: "Give it .slipbox/",
        detail: "settings of its own — committed with the folder like any file; :name names it for pointers",
        data: "vault",
      },
      { label: "Cancel", detail: "", data: "no" },
    ];
    this.app.overlays.openList({
      title: `${dir} is a folder without .slipbox/ — give it one?`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => (item.data === "no" ? undefined : this.make(dir, false)),
    });
  }

  /** The links a move by hand broke, in and out of the root (20.17): their fix previewed — never written unasked. */
  offerMovedRelink(): void {
    if (this.app.overlay) return;
    try {
      if (planRelink(this.app.graph).files.length) this.app.renaming.preview(() => planRelink(this.app.graph));
    } catch {}
  }

  /** Give `dir` a `.slipbox/` and go into it, the note open (17.18). */
  make(dir: string, privately: boolean): void {
    const open = this.app.view?.buf.abs ?? null;
    let r: ReturnType<typeof initVault>;
    try {
      r = initVault(dir, undefined, { private: privately });
    } catch (err) {
      return this.app.message("warn", (err as Error).message);
    }
    this.switchVault(rootAt(r.root), open && existsSync(open) && open.startsWith(`${r.root}/`) ? open : null);
    this.app.message(
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
    const here = this.app.loc.root;
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
      return this.app.message(
        "info",
        "no other named folders here yet: a .slipbox/ name (:name), or a repository's remote, names one",
      );
    this.app.overlays.openList({
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
      return this.app.message("info", "no named folder has two copies here: each one's links open the only one");
    const pick = (f: NamedFolder) =>
      this.app.overlays.openList({
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
          this.app.message("info", `links to ${f.name} open ${tildePath(copy.data as string)}`);
        },
      });
    const ident = this.app.loc.mode === "vault" ? folderIdentity(this.app.loc.root) : null;
    const mine = list.find((f) => f.key === ident?.key);
    if (mine || list.length === 1) return pick(mine ?? list[0]!);
    this.app.overlays.openList({
      title: "Which folder's copies?",
      items: list.map((f) => ({ label: pointerName(f, list), hint: `${copiesOf(f).length} copies`, data: f })),
      accept: (item) => pick(item.data as NamedFolder),
    });
  }
}

/** A named folder moved here by hand, its state along (21.8): said once. */
export function carried(loc: VaultLocation, from: string): string {
  return `${rootLabel(loc)} moved here from ${tildePath(from)}: its sessions, scratch, trash and reading positions came along`;
}
