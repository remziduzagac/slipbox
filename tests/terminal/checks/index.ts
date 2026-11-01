// Every terminal check, by area (TT-D3): each area's file holds its checks and what it leaves out (TT-D4).

import { type Check, CLI_CASES, type LeftOut } from "../check.ts";
import { AGENTS } from "./agents.ts";
import { APPEARANCE } from "./appearance.ts";
import { CODE_CELLS, LEFT_OUT_READING } from "./code-cells.ts";
import { CODE_FILES } from "./code-files.ts";
import { CONFIGURATION } from "./configuration.ts";
import { DATA_FILES } from "./data-files.ts";
import { DIAGRAMS } from "./diagrams.ts";
import { DOCUMENT_STRUCTURE } from "./document-structure.ts";
import { EDITING, LEFT_OUT_EDITING } from "./editing.ts";
import { ELSEWHERE } from "./elsewhere.ts";
import { EXPLORER_MARKS } from "./explorer-marks.ts";
import { EXPORT_ENTRY } from "./export-entry.ts";
import { EXPORT } from "./export.ts";
import { FILE_OPERATIONS } from "./files.ts";
import { FINDING } from "./finding.ts";
import { GIT_BRANCHES } from "./git-branches.ts";
import { GIT_DIFF } from "./git-diff.ts";
import { GIT_STEADY } from "./git-steady.ts";
import { GIT } from "./git.ts";
import { HELP } from "./help.ts";
import { UNWALKED_HOME } from "./home-watching.ts";
import { HOME } from "./home.ts";
import { HTML } from "./html.ts";
import { INDEX_SETTINGS } from "./index-settings.ts";
import { INFO } from "./info.ts";
import { LANGUAGE_SERVERS } from "./language-servers.ts";
import { LEFT_OUT_LINKS_AND_FILES, LINKS } from "./links.ts";
import { LIST_INTERACTIONS } from "./list-interactions.ts";
import { MARKDOWN_BLOCKS } from "./markdown-blocks.ts";
import { MARKDOWN_CONTENT } from "./markdown-content.ts";
import { MARKDOWN_INLINE } from "./markdown-inline.ts";
import { MOVING_LINKS } from "./moving-links.ts";
import { NAMED } from "./named-folders.ts";
import { NAVIGATION_TOOLS } from "./navigation-tools.ts";
import { NEW_FILE } from "./new-file.ts";
import { NOTES } from "./notes.ts";
import { PALETTE } from "./palette.ts";
import { PANELS } from "./panels.ts";
import { PEEK_BACKLINKS } from "./peek-backlinks.ts";
import { PEEK } from "./peek.ts";
import { PICTURES } from "./pictures.ts";
import { PROBLEMS_AND_LINT } from "./problems-and-lint.ts";
import { QUITTING } from "./quitting.ts";
import { REPORTING } from "./reporting.ts";
import { GIT_PANEL } from "./repositories.ts";
import { ROOTS } from "./roots.ts";
import { SAMPLES } from "./samples.ts";
import { SAVE_CONFLICTS } from "./save-conflicts.ts";
import { SAVING } from "./saving.ts";
import { SHELL_AND_CONTEXT } from "./shell-and-context.ts";
import { SLOW_DISK } from "./slow-disk.ts";
import { SOURCE_CONTROL } from "./source-control.ts";
import { START } from "./start.ts";
import { STATUS_LINE } from "./status-line.ts";
import { LINKED } from "./symlinks.ts";
import { TERMINAL_INPUT } from "./terminal-input.ts";
import { TERMINAL_STATE } from "./terminal-state.ts";
import { TEXT_FILES } from "./text-files.ts";
import { THEMES_AND_GLYPHS } from "./themes-and-glyphs.ts";
import { TRUST_AND_PRIVACY } from "./trust-and-privacy.ts";
import { UI_SETTINGS } from "./ui-settings.ts";
import { UPDATES } from "./updates.ts";
import { PEEKED } from "./vault-peek.ts";
import { VAULTS } from "./vaults.ts";
import { WATCHING } from "./watching.ts";
import { WHERE } from "./where.ts";
import { WHICH_KEY } from "./which-key.ts";
import { WINDOW_HEADER } from "./window-header.ts";
import { WINDOWS_AND_TABS } from "./windows-and-tabs.ts";

/** Each file's checks, by its name: `bun run test:terminal <name>` runs them. */
export const CHECK_FILES: Record<string, Check[]> = {
  html: HTML,
  start: START,
  diagrams: DIAGRAMS,
  "markdown-content": MARKDOWN_CONTENT,
  "text-files": TEXT_FILES,
  "data-files": DATA_FILES,
  "code-files": CODE_FILES,
  "markdown-inline": MARKDOWN_INLINE,
  info: INFO,
  "trust-and-privacy": TRUST_AND_PRIVACY,
  "markdown-blocks": MARKDOWN_BLOCKS,
  "themes-and-glyphs": THEMES_AND_GLYPHS,
  "status-line": STATUS_LINE,
  "document-structure": DOCUMENT_STRUCTURE,
  "code-cells": CODE_CELLS,
  samples: SAMPLES,
  editing: EDITING,
  "new-file": NEW_FILE,
  // The screen and navigation: panes, tabs, windows, the palette, which-key, find, replace, search, tags, the
  // explorer, settings, and the terminal's own behaviour: keys as sent, pastes, the session, resizes, signals (TT-T5).
  "windows-and-tabs": WINDOWS_AND_TABS,
  "navigation-tools": NAVIGATION_TOOLS,
  finding: FINDING,
  palette: PALETTE,
  "ui-settings": UI_SETTINGS,
  "terminal-state": TERMINAL_STATE,
  "terminal-input": TERMINAL_INPUT,
  appearance: APPEARANCE,
  "list-interactions": LIST_INTERACTIONS,
  help: HELP,
  "index-settings": INDEX_SETTINGS,
  "which-key": WHICH_KEY,
  quitting: QUITTING,
  links: LINKS,
  roots: ROOTS,
  "named-folders": NAMED,
  files: FILE_OPERATIONS,
  git: GIT,
  notes: NOTES,
  peek: PEEK,
  // The peek's backlinks (#10): their own file, in the links-and-files area.
  "peek-backlinks": PEEK_BACKLINKS,
  // Vault switching, home and Elsewhere, the view, marks, links, peek and repositories, in their original order.
  vaults: VAULTS,
  home: HOME,
  "home-watching": UNWALKED_HOME,
  elsewhere: ELSEWHERE,
  "explorer-marks": EXPLORER_MARKS,
  symlinks: LINKED,
  "vault-peek": PEEKED,
  repositories: GIT_PANEL,
  // A link renamed or moved itself, and what a rename writes through links (D260): links-and-files', a file of their own.
  "moving-links": MOVING_LINKS,
  // What comes from outside (agents' edits, the watcher, the CLI beside the TUI), language servers, linters, the
  // problems panel, your shell, and export (TT-T7).
  "export-entry": EXPORT_ENTRY,
  "problems-and-lint": PROBLEMS_AND_LINT,
  "language-servers": LANGUAGE_SERVERS,
  watching: WATCHING,
  agents: AGENTS,
  "save-conflicts": SAVE_CONFLICTS,
  configuration: CONFIGURATION,
  saving: SAVING,
  "shell-and-context": SHELL_AND_CONTEXT,
  export: EXPORT,
  // Source control's, in the outside-and-code area: their own file.
  "source-control": SOURCE_CONTROL,
  // The diff window's later edges (a block by its lines, enter on a line before, what no line shows): source
  // control's too, in a file of their own, source-control.ts being near the size limit.
  "git-diff": GIT_DIFF,
  // The panels as the checks' shared helpers drive them (#18): the which-key popup, the explorer, the outline, the git
  // panel; in the navigating area, in a file of their own.
  panels: PANELS,
  // A slow disk read off the main thread (T12): home's walk, the background index, the explorer's listings.
  "slow-disk": SLOW_DISK,
  // The window header's buttons (HDR), in the editing area: their own file, editing.ts being near the size limit.
  "window-header": WINDOW_HEADER,
  // What the branches do once git answers in the background (D263): source control's too, in a file of their own.
  "git-branches": GIT_BRANCHES,
  // Reporting a problem (RPT): help's, in the navigating area, in a file of their own.
  reporting: REPORTING,
  // Pictures sized to their window, at their own size on a click (#52): in the reading area.
  pictures: PICTURES,
  // Where you are on the top bar (WSP-D4, WSP-D5): its cases of its own, in the areas they belong to.
  where: WHERE,
  // The git panel holding still as git answers (D261): source control's too, in a file of its own.
  "git-steady": GIT_STEADY,
  // Upgrading and restarting (UPG): two release builds of this checkout, made once a run.
  updates: UPDATES,
};

export const CHECKS: Check[] = Object.values(CHECK_FILES).flat();

const LEFT_OUT_NAVIGATING: LeftOut = {};
const LEFT_OUT_OUTSIDE_AND_CODE: LeftOut = {};

const AREAS: LeftOut[] = [
  LEFT_OUT_READING,
  LEFT_OUT_EDITING,
  LEFT_OUT_NAVIGATING,
  LEFT_OUT_LINKS_AND_FILES,
  LEFT_OUT_OUTSIDE_AND_CODE,
  // The command line's own areas: what an agent or a script runs, with no screen to read.
  { cases: Object.fromEntries(CLI_CASES.map((a) => [a, "the command line's: tests/cli/ covers it"])) },
];

/** Everything left out, with its reason, from every area. */
export const LEFT_OUT: Required<LeftOut> = {
  commands: Object.assign({}, ...AREAS.map((a) => a.commands ?? {})),
  cases: Object.assign({}, ...AREAS.map((a) => a.cases ?? {})),
};
