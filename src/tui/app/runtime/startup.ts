import { loadSession, recentCommands } from "../../../core/workspace/session/position.ts";
import type { Config } from "../../../core/application/config/config.ts";
import type { Glyphs } from "../../../core/rendering/theme/glyphs.ts";
import { ELSEWHERE, tildePath } from "../../../core/workspace/vaults/names.ts";
import { isInside, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import type { AppOptions, Tab, UiState, Overlay } from "./contracts.ts";
import type { Handoff } from "../../documents/saving/handoff.ts";
import type { History } from "../../workspace/history/history.ts";
import type { Session } from "../../workspace/session/session.ts";
import type { Settings } from "../settings/settings.ts";
import type { Files } from "../../workspace/explorer/files.ts";
import type { Explorer } from "../../workspace/explorer/explorer.ts";
import { andThen, type KeyReads } from "./key-reads.ts";
import type { Vaults } from "../../workspace/vaults/vaults.ts";
import type { Level } from "../notifications/contracts.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import type { Builds } from "./builds.ts";

export const RECENT_MAX = 5;
/** Notes the switcher lists first, most recent first. */
export const RECENT_NOTES_MAX = 30;

export interface InitialWindowsContext {
  readonly loc: VaultLocation;
  readonly graph: Pick<Graph, "errors">;
  readonly config: Pick<Config, "ui">;
  readonly handoff: Pick<Handoff, "remoteServer">;
  readonly history: Pick<History, "recentNotes">;
  readonly session: Pick<
    Session,
    "restoreUiOverrides" | "restoreFrom" | "restore" | "openDefault" | "restoring" | "behind"
  >;
  readonly settings: Pick<Settings, "applyTheme" | "glyphSet">;
  readonly files: Pick<Files, "openNew">;
  readonly explorer: Pick<Explorer, "zoomTo">;
  readonly reads: Pick<KeyReads, "folder" | "hold">;
  readonly vaults: Pick<Vaults, "noNotes" | "offerMovedRelink" | "askDefaultCopy">;
  readonly watch: { readonly builds: Pick<Builds, "after"> };
  readonly tabs: Tab[];
  readonly overlay: Overlay | null;
  readonly homeFolder: string | null;
  readonly ui: UiState;
  recentCommands: string[];
  glyphs: Glyphs;
  openInNewTab(path: string): void | Promise<void>;
  message(level: Level, text: string): void;
}

/**
 * The windows the TUI starts with, once its screen is up (SD-D9, SD-T10): the vault's walk and index are read on a disk
 * thread meanwhile (`Vaults.ask`, as the App starts), and what's opened is read as a key's own read (SD-D4) — the note
 * named, the session's tabs (a restart's, its window's), or the vault's own note once the graph says which — each
 * waiting for the graph to be drawn (`reading the vault…`), the keys waiting for it all, `q` and `ctrl+c` quitting
 * meanwhile. A test's App reads it all here, at once.
 */
export function openInitialWindows(
  context: InitialWindowsContext,
  options: Pick<AppOptions, "themeName" | "restarted" | "open" | "newFile" | "folder">,
  carriedFrom: string | null,
): void {
  context.recentCommands = recentCommands(loadSession(context.loc), RECENT_MAX);
  context.handoff.remoteServer = loadSession(context.loc)?.remote_server;
  context.history.recentNotes = (loadSession(context.loc)?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
  context.session.restoreUiOverrides();
  if (options.themeName) context.ui.theme = options.themeName; // an explicit theme beats a remembered one
  context.settings.applyTheme();
  // What the graph found wrong, said once it's built.
  context.watch.builds.after(() => {
    for (const e of context.graph.errors) context.message("warn", e);
  });
  // The vault's own note, once its graph says which: none, said below.
  let none = false;
  const own = () => context.session.openDefault(() => void (none = true));
  // A restart comes back with the window's own session, from its note, whatever restore_session says (UPG-D4).
  if (options.restarted) context.message(options.restarted.said.level, options.restarted.said.text);
  const restored = options.restarted?.session
    ? context.session.restoreFrom(options.restarted.session, { none: own })
    : !options.open && context.config.ui.restore_session && context.session.restore({ none: own });
  context.glyphs = context.settings.glyphSet(context.ui.glyphs);
  let opening: void | Promise<void>;
  // The tab shown, read first; when it couldn't be, the rest — the vault's own note after them, when none could be.
  if (restored)
    opening = andThen(context.session.restoring ?? undefined, () =>
      context.tabs.length ? undefined : (context.session.behind ?? undefined),
    );
  else {
    if (options.newFile && options.open) context.files.openNew(options.open);
    opening = options.open ? context.openInNewTab(options.open) : own();
  }
  // The view starts at the folder opened (VV-D5): `x/y` shows y, in vault x — set once its notes are open, so
  // the one shown, outside it, leaves it be. A folder that can't be read says why, asked as a key's own read (SD-T7).
  const opened = options.folder ?? (options.open ? null : context.loc.root);
  const start = (unreadable: string | null) => {
    if (unreadable) context.message("warn", `can't read ${tildePath(opened!)}: ${unreadable}`);
    else if (options.folder && options.folder !== context.loc.root && isInside(context.loc.root, options.folder))
      context.explorer.zoomTo(options.folder, true);
    if (none && !context.tabs.length && !unreadable)
      context.message(
        "info",
        context.loc.mode === "folder"
          ? `${ELSEWHERE} — ${tildePath(context.loc.root)}: open a file from the explorer`
          : context.vaults.noNotes(),
      );
  };
  const shown = andThen(opening, () => (opened ? context.reads.folder(opened, "not opened", start) : start(null)));
  // The keys wait for all of it, as one: none slips in between the note's read and the folder's.
  if (shown instanceof Promise) void context.reads.hold(shown.catch((err) => context.message("error", err.message)));
  // Moved here by hand, its state along (21.8): the links the move broke, their fix previewed (20.17), once it's read.
  if (carriedFrom) context.watch.builds.after(() => context.vaults.offerMovedRelink());
  // A second copy of this folder (21.6): which one links open, asked once.
  if (!context.overlay) context.vaults.askDefaultCopy();
}
