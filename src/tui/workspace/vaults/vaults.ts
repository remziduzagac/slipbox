import { VaultPrompts } from "./vault-prompts.ts";
// Vaults in the TUI (17.x, VV): switching into another and back, a folder made a vault or unmade, the named folders
// and their copies (21.x).

import { cancelGitRead } from "../git/gitquery.ts";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { writeDirty } from "../../../core/workspace/git/merge/stale.ts";
import { loadConfig } from "../../../core/application/config/config.ts";
import { Graph } from "../../../core/workspace/graph/graph.ts";
import { leftOutOfHome, walksInto } from "../../../core/workspace/vaults/home.ts";
import { lintCommand } from "../../../core/documents/diagnostics/lint.ts";
import { slipboxOwn } from "../../../core/foundation/platform/paths.ts";
import {
  type Anchor,
  type CursorAnchor,
  PositionStore,
  type SessionTab,
} from "../../../core/workspace/session/position.ts";
import { stopBacklinkJobs } from "../../../core/workspace/graph/backlinks-jobs.ts";
import { tuiReach } from "../../documents/navigation/peek.ts";
import { peekAt } from "../../documents/navigation/peek/opening.ts";
import { rootLabel, tildePath } from "../../../core/workspace/vaults/names.ts";
import {
  configFilesFor,
  isInside,
  locateVault,
  locationAt,
  vaultOf,
  recordLocation,
  rootAt,
  type VaultLocation,
} from "../../../core/workspace/vaults/vault.ts";
import type { App } from "../../app/runtime/app.ts";
import { uiDefaults } from "../../app/runtime/app.ts";
import { type ExplorerItem, listedDown, type TreeRow } from "../explorer/explorer.ts";

/** How a switch goes: `back` along the trail, into home's `folder` by name, `asked` already (a question answered),
 *  `made` (a vault made or made part of another: no question), and `after` runs once it went and what it opens is in:
 *  the note it opens once that's shown — read on a disk thread first, the keys waiting — never when it isn't (its read
 *  given up or failed); without one, once the tab shown or the vault's own note is (`Session.enter`). */
export type SwitchHow = { back?: boolean; folder?: string; asked?: boolean; made?: boolean; after?: () => void };

/** Vaults: switching, making and unmaking, named folders. */
export class Vaults {
  private readonly prompts: VaultPrompts;

  constructor(readonly app: App) {
    this.prompts = new VaultPrompts(app, (target, open, anchor, how) => this.switchVault(target, open, anchor, how));
  }

  /** Where the TUI was before each switch into another vault: `back` returns there (17.10) — to the folder of home it
   *  had open by name (VV-D2), when it had one. */
  trail: { root: string; path: string; anchor: Anchor; cursor: CursorAnchor; folder?: string }[] = [];

  /** Counted each time a vault is gone into: an answer that comes later, from git, knows whether it's still where it
   *  was asked (`BranchView.still`), the same vault never left — gone into again, it's another visit. */
  visits = 0;

  private pendingSwitch: {
    target: VaultLocation;
    open: string | null;
    anchor?: Anchor;
    how: SwitchHow;
  } | null = null;

  /** The answer to a switch's question: unsaved notes saved or left, the vault gone into, its note peeked at instead
   *  (D270), or none of it. */
  chooseSwitch(choice: "save" | "discard" | "go" | "peek" | "stay"): void {
    const pending = this.pendingSwitch;
    this.pendingSwitch = null;
    if (!pending || choice === "stay") return;
    // Peeked at instead, what was to follow it follows once the peek has it: a data file's section gone to (a link's
    // ctrl+click, `goThere`); a note made there isn't typed into in a peek, read-only (`promptNewNote`).
    if (choice === "peek") {
      if (pending.open) peekAt(this.app, pending.open, pending.target, pending.anchor, pending.how.after);
      return;
    }
    if (choice === "save") {
      for (const buffer of this.app.dirtyBuffers()) if (!this.app.saving.save(buffer)) return;
    }
    if (!this.switchVault(pending.target, pending.open, pending.anchor, { ...pending.how, asked: true })) return;
    if (pending.how.back) this.trail.pop();
  }

  /**
   * What's asked for, entering the vault open (VV-D2) — the one way in, from the start or a switch, a folder revealed
   * alike: a folder of home, by name (`folder`) or a file's (`open`; both absolute), its notes there at once — and,
   * `restoring`, the folders of the tabs the session brings back (`askTabs`). The graph, not built yet as the TUI starts
   * or goes into a vault, is built here, once for them all (`Graph.askFolders`). The one named is `app.homeFolder`,
   * home's path for it: its own tabs, its own first note.
   */
  ask(folder: string | null, open: string | null, restoring = false): void {
    const g = this.app.graph;
    this.app.homeFolder = folder ? g.homePath(folder) : null;
    const tabs = restoring && this.app.loc.mode === "home" ? this.tabFolders(this.app.session.toRestore()) : [];
    g.askFolders([folder ?? (open ? dirname(open) : this.app.loc.root), ...tabs]);
  }

  /**
   * Tabs a session brings back into home (VV-D2), before they open — a branch's, when it's checked out: each file's
   * folder asked for, as a file opened by name has its own, so each is a note of home's, its links and backlinks there.
   * The graph built again once for them all, what follows it follows (`Watch.rebuilt`).
   */
  askTabs(tabs: readonly SessionTab[]): void {
    if (this.app.graph.askFolders(this.tabFolders(tabs))) this.app.watch.rebuilt();
  }

  /**
   * The folders of home a session's tabs are in, every window's (VV-D2); none in a vault. A file gone is no reason to
   * walk its folder, and one behind a link not followed (VV-D6) isn't looked at: it doesn't open. A folder home's walk
   * never goes into (`~/Downloads`, the scratch's) isn't asked for: there's nothing to walk.
   */
  private tabFolders(tabs: readonly SessionTab[]): string[] {
    if (this.app.loc.mode !== "home") return [];
    const g = this.app.graph;
    return tabs
      .flatMap((t) => t.panes.map((p) => this.app.absOf(p.path)))
      .filter((abs) => !this.app.following.blocked(abs) && existsSync(abs))
      .map((abs) => dirname(abs))
      .filter((dir) => {
        const rel = g.homePath(dir);
        return rel !== null && walksInto(g.root, g.filter, rel);
      });
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

  makeHere(): void {
    this.prompts.makeHere();
  }
  unmakeHere(): void {
    this.prompts.unmakeHere();
  }
  unmakeThis(): void {
    this.prompts.unmakeThis();
  }
  makeItem(item: ExplorerItem): void {
    this.prompts.makeItem(item);
  }
  unmakeItem(item: ExplorerItem): void {
    this.prompts.unmakeItem(item);
  }
  renameItem(item: ExplorerItem): void {
    this.prompts.renameItem(item);
  }
  askDefaultCopy(): void {
    this.prompts.askDefaultCopy();
  }

  /**
   * Become another root's TUI, as if started there (17.10): its config, index, watcher, reading
   * positions and session — with `open` open (an absolute path), or the session's tabs. Leaving
   * saves this one's as quitting does. It asks first (D270): to go, peek at `open` instead or stay — or, with unsaved
   * notes, to save all, discard or stay. False while it asks; `how.after` runs once it went (`SwitchHow`).
   * `folder`: a folder of home gone into by name (VV-D2: a folder revealed), as `slipbox ~/notes` opens it.
   */
  switchVault(target: VaultLocation, open: string | null, anchor?: Anchor, how: SwitchHow = {}): boolean {
    const peeking = this.app.floating?.kind === "peek";
    if (this.app.floating && !this.app.overlays.closeFloating()) return false;
    if (!how.asked && this.app.dirtyBuffers().length) {
      this.pendingSwitch = { target, open, anchor, how };
      this.app.overlays.openList({
        title: "Unsaved notes — change vault?",
        filterable: false,
        items: [
          { label: "Save all and go", hotkey: "s", data: "save" },
          { label: "Discard and go", hotkey: "d", data: "discard" },
          { label: "Stay", hotkey: "c", data: "stay" },
        ],
        accept: (item) => this.app.run(`vault.switch_${item.data}`),
        cancel: () => {
          this.pendingSwitch = null;
        },
      });
      return false;
    }
    // Every way into another vault asks (D270): your workspace there takes this one's place. A vault made, or made part
    // of the one holding it, is gone into as that was what was asked.
    if (!how.asked && !how.made) {
      this.pendingSwitch = { target, open, anchor, how };
      const name = how.folder && target.mode === "home" ? tildePath(how.folder) : rootLabel(target);
      // From a peek, staying is going back to it: no other peek offered.
      const file = open && !peeking && existsSync(open) && statSync(open).isFile() ? open : null;
      this.app.overlays.openList({
        title: `Go into ${name}? Your tabs there replace these`,
        filterable: false,
        items: [
          { label: "Go", hotkey: "g", data: "go" },
          ...(file ? [{ label: `Peek at ${basename(file)}: read it here, read-only`, hotkey: "p", data: "peek" }] : []),
          { label: "Stay", hotkey: "c", data: "stay" },
        ],
        accept: (item) => this.app.run(`vault.switch_${item.data}`),
        cancel: () => {
          this.pendingSwitch = null;
        },
      });
      return false;
    }
    cancelGitRead(this.app);
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
    // Release every owner of notes and index data before restoring the destination's workspace.
    this.app.background.cancelAll();
    this.app.exporter.cancel(true);
    this.app.search.stop();
    this.app.places.left();
    this.app.languages.leaveVault();
    this.app.geometry = null;
    this.app.mouse.leaveVault();
    this.app.views.parses.clear();
    this.app.completion = null;
    this.app.signature = null;
    this.app.snippet = null;
    this.app.floating = null;
    this.app.overlay = null;
    this.app.indexing = 0;
    for (const buffer of this.app.buffers.values()) buffer.cancelParse();
    this.app.buffers.clear();
    this.app.tabs = [];
    // Enter.
    this.app.loc = target;
    this.visits++;
    this.app.feed.reset();
    const { carriedFrom } = recordLocation(target);
    // Your config as the look last read it, not read again (SD-T9); the vault's read.
    const yours = this.app.settings.yoursKept();
    this.app.settings.lastGood.clear();
    const loaded = loadConfig({
      ...configFilesFor(target),
      configFile: this.app.configFile,
      lastGood: this.app.settings.lastGood,
      ...(yours ? { kept: yours } : {}),
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
    // Whatever the backlinks' thread works on is for the vault left: its answers would find nobody (#10).
    stopBacklinkJobs();
    this.app.reach = tuiReach(this.app, target);
    this.app.graph = new Graph(target, this.app.config);
    this.app.graph.reach = this.app.reach;
    // Built as what's asked for is (VV-D2): a folder of home gone into, by name or a file's, and the tabs brought back,
    // their notes there at once, as when slipbox starts there — its walk and index read on a disk thread (SD-T8), what
    // needs the graph once it's built (`after`).
    this.app.watch.builds.adopt(this.app.graph);
    // Off the screen's thread, the tabs' folders are asked for as they come (`openTabs`): the session isn't read yet.
    this.ask(how.folder ?? null, open, this.app.config.ui.restore_session && !this.app.reads.offThread);
    if (this.app.live) this.app.loadCodeGrammars();
    this.app.watch.builds.after(() => {
      for (const e of this.app.graph.errors) this.app.message("warn", e);
    });
    // The machine's positions, as the vault left just saved them: none read (SD-T9).
    this.app.positions = new PositionStore(target, this.app.positions);
    // Moved by hand: the positions kept here follow it, as `recordLocation` moved the file's.
    if (carriedFrom) this.app.positions.carry(carriedFrom, target.root);
    for (const b of this.app.buffers.values()) this.app.languages.servers?.close(b.abs);
    for (const buffer of this.app.buffers.values()) buffer.cancelParse();
    this.app.languages.stopSyntax(); // its code files' passes too: the thread's for the next vault's
    this.app.buffers.clear();
    // Followed once the vault left has no buffers here: none of its is this graph's.
    this.app.watch.followGraph();
    this.app.tabs = [];
    this.app.activeTab = 0;
    this.app.overlay = null;
    // The explorer's view (VV-D5): holding the vault gone into, it stays, the vault unfolded in it; else it
    // zooms out to the common parent of the two, only their paths unfolded. Where the tree can't show the
    // vault (in a hidden folder, hidden names not listed: a worktree in .claude/), it moves to the vault.
    this.app.explorer.expanded = new Set(unfolded.map((a) => this.app.explorer.rowPath(a)));
    this.app.explorer.invalidateTree();
    const T = this.app.explorer.top;
    const held = isInside(T, target.root)
      ? listedDown(T, target.root, this.app.ui.hidden_files)
      : this.app.explorer.zoomToHold(target.root, target.root);
    if (!held) {
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
    // Its session read on a disk thread (SD-T9): its tabs, recents and settings changed here come once it is, and
    // `how.after` once what it opens is in — read here at once (a test's App), after the rest of the switch.
    let entering = true;
    let entered = false;
    this.app.session.enter(open, anchor, how.after && (() => (entering ? (entered = true) : how.after?.())));
    entering = false;
    if (from && !how.back) this.trail.push(from);
    this.app.region = "content";
    if (carriedFrom) {
      this.app.message("info", carried(target, carriedFrom));
      this.app.watch.builds.after(() => this.offerMovedRelink());
    }
    this.askDefaultCopy();
    this.app.relayoutAll();
    this.app.session.publishState();
    this.app.settings.recordStamps(undefined, yours);
    if (this.app.live) {
      this.app.languages.startServers();
      if (this.app.config.watch.enabled) this.app.watch.startWatcher();
      this.app.watch.indexInBackground();
      this.app.git.refresh();
      // Home never walked yet (VV-D2): its top alone, the rest while nobody is working.
      this.app.watch.builds.after(() => {
        if (this.app.graph.home?.walked === null) this.app.watch.walkHomeAgain();
      });
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
    if (entered) how.after?.();
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
   * (17.10, VV-D4); true when it was (or the switch was refused), `after` once it's open (`SwitchHow`). In Elsewhere, a
   * file of Elsewhere opens there: it's one place, wherever its files are.
   */
  intoOther(path: string, anchor?: Anchor, after?: () => void): boolean {
    // slipbox's own files (the scratch, in its state folder under ~) are no vault's to go into, home's neither (VV-D2).
    if (!isAbsolute(path) || !existsSync(path) || slipboxOwn(path)) return false;
    let target: VaultLocation;
    try {
      target = locateVault({ path });
    } catch {
      return false;
    }
    if (target.mode === "folder" ? this.app.loc.mode === "folder" : target.root === this.app.loc.root) return false;
    this.switchVault(target, path, anchor, after ? { after } : {});
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

  choices(dir: string): void {
    this.prompts.choices(dir);
  }
  offerMovedRelink(): void {
    this.prompts.offerMovedRelink();
  }
  make(dir: string, privately: boolean): void {
    this.prompts.make(dir, privately);
  }
  openFolders(): void {
    this.prompts.openFolders();
  }
  chooseDefaultCopy(): void {
    this.prompts.chooseDefaultCopy();
  }
}

/** A named folder moved here by hand, its state along (21.8): said once. */
export function carried(loc: VaultLocation, from: string): string {
  return `${rootLabel(loc)} moved here from ${tildePath(from)}: its workspaces, scratch, trash and reading positions came along`;
}
