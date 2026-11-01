import { loadSession } from "../../../core/workspace/session/position.ts";
import type { Config } from "../../../core/application/config/config.ts";
import { folderUnreadable } from "../../../core/foundation/platform/fsutil.ts";
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
import type { Vaults } from "../../workspace/vaults/vaults.ts";
import type { Level } from "../notifications/contracts.ts";

export const RECENT_MAX = 5;
/** Notes the switcher lists first, most recent first. */
export const RECENT_NOTES_MAX = 30;

export interface InitialWindowsContext {
  readonly loc: VaultLocation;
  readonly config: Pick<Config, "ui">;
  readonly handoff: Pick<Handoff, "remoteServer">;
  readonly history: Pick<History, "recentNotes">;
  readonly session: Pick<Session, "restoreUiOverrides" | "restoreFrom" | "restore">;
  readonly settings: Pick<Settings, "applyTheme" | "glyphSet">;
  readonly files: Pick<Files, "openNew">;
  readonly explorer: Pick<Explorer, "zoomTo">;
  readonly vaults: Pick<Vaults, "noNotes" | "offerMovedRelink" | "askDefaultCopy">;
  readonly tabs: Tab[];
  readonly overlay: Overlay | null;
  readonly homeFolder: string | null;
  readonly ui: UiState;
  recentCommands: string[];
  glyphs: Glyphs;
  defaultNote(folder: string | null): string | null;
  openInNewTab(path: string): void;
  message(level: Level, text: string): void;
}

export function openInitialWindows(
  context: InitialWindowsContext,
  options: Pick<AppOptions, "themeName" | "restarted" | "open" | "newFile" | "folder">,
  carriedFrom: string | null,
): void {
  context.recentCommands = (loadSession(context.loc)?.recent_commands ?? [])
    .filter((id) => typeof id === "string")
    .slice(0, RECENT_MAX);
  context.handoff.remoteServer = loadSession(context.loc)?.remote_server;
  context.history.recentNotes = (loadSession(context.loc)?.recent_notes ?? []).slice(0, RECENT_NOTES_MAX);
  context.session.restoreUiOverrides();
  if (options.themeName) context.ui.theme = options.themeName; // an explicit theme beats a remembered one
  context.settings.applyTheme();
  // A restart comes back with the window's own session, from its note, whatever restore_session says (UPG-D4).
  if (options.restarted) context.message(options.restarted.said.level, options.restarted.said.text);
  const restored = options.restarted?.session
    ? context.session.restoreFrom(options.restarted.session)
    : !options.open && context.config.ui.restore_session && context.session.restore();
  context.glyphs = context.settings.glyphSet(context.ui.glyphs);
  if (!restored) {
    if (options.newFile && options.open) context.files.openNew(options.open);
    const first = options.open ?? context.defaultNote(context.homeFolder);
    if (first) context.openInNewTab(first);
  }
  // The view starts at the folder opened (VV-D5): `x/y` shows y, in vault x — set once its notes are open, so
  // the one shown, outside it, leaves it be. A folder that can't be read says why.
  const opened = options.folder ?? (options.open ? null : context.loc.root);
  const unreadable = opened ? folderUnreadable(opened) : null;
  if (unreadable) context.message("warn", `can't read ${tildePath(opened!)}: ${unreadable}`);
  else if (options.folder && options.folder !== context.loc.root && isInside(context.loc.root, options.folder))
    context.explorer.zoomTo(options.folder);
  if (!context.tabs.length && !unreadable)
    context.message(
      "info",
      context.loc.mode === "folder"
        ? `${ELSEWHERE} — ${tildePath(context.loc.root)}: open a file from the explorer`
        : context.vaults.noNotes(),
    );
  // Moved here by hand, its state along (21.8): the links the move broke, their fix previewed (20.17).
  if (carriedFrom) context.vaults.offerMovedRelink();
  // A second copy of this folder (21.6): which one links open, asked once.
  if (!context.overlay) context.vaults.askDefaultCopy();
}
