import { HTML } from "./html.ts";
// Every terminal check, by area (TT-D3): each area's file holds its checks and what it leaves out (TT-D4).

import { CLI_CASES, type Check, type LeftOut } from "../check.ts";
import { EDITING, LEFT_OUT_EDITING } from "./editing.ts";
import { GIT_BRANCHES } from "./git-branches.ts";
import { GIT_DIFF } from "./git-diff.ts";
import { GIT_STEADY } from "./git-steady.ts";
import { LEFT_OUT_LINKS_AND_FILES, LINKS_AND_FILES } from "./links-and-files.ts";
import { MOVING_LINKS } from "./moving-links.ts";
import { LEFT_OUT_NAVIGATING, NAVIGATING } from "./navigating.ts";
import { PEEK_BACKLINKS } from "./peek-backlinks.ts";
import { LEFT_OUT_OUTSIDE_AND_CODE, OUTSIDE_AND_CODE } from "./outside-and-code.ts";
import { PANELS } from "./panels.ts";
import { PICTURES } from "./pictures.ts";
import { LEFT_OUT_READING, READING } from "./reading.ts";
import { REPORTING } from "./reporting.ts";
import { SLOW_DISK } from "./slow-disk.ts";
import { SOURCE_CONTROL } from "./source-control.ts";
import { UPDATES } from "./updates.ts";
import { VAULTS } from "./vaults.ts";
import { WINDOW_HEADER } from "./window-header.ts";
import { WHERE } from "./where.ts";

/** Each file's checks, by its name: `bun run test:terminal <name>` runs them. */
export const CHECK_FILES: Record<string, Check[]> = {
  html: HTML,
  reading: READING,
  editing: EDITING,
  navigating: NAVIGATING,
  "links-and-files": LINKS_AND_FILES,
  // The peek's backlinks (#10): their own file, in the links-and-files area.
  "peek-backlinks": PEEK_BACKLINKS,
  // Vaults, home and Elsewhere, the view, marks, links, the peek: their own file, in the areas they belong to.
  vaults: VAULTS,
  // A link renamed or moved itself, and what a rename writes through links (D260): links-and-files', a file of their own.
  "moving-links": MOVING_LINKS,
  "outside-and-code": OUTSIDE_AND_CODE,
  // Source control's, in the outside-and-code area: their own file.
  "source-control": SOURCE_CONTROL,
  // The diff window's later edges (a block by its lines, enter on a line before, what no line shows): source
  // control's too, in a file of their own, source-control.ts being near the size limit.
  "git-diff": GIT_DIFF,
  // The panels as the checks' shared helpers drive them (#18): the which-key popup, the explorer, the outline, the git
  // panel; in the navigating area, navigating.ts being past the size limit.
  panels: PANELS,
  // A slow disk read off the main thread (T12): home's walk, the background index, the explorer's listings.
  "slow-disk": SLOW_DISK,
  // The window header's buttons (HDR), in the editing area: their own file, editing.ts being near the size limit.
  "window-header": WINDOW_HEADER,
  // What the branches do once git answers in the background (D263): source control's too, in a file of their own.
  "git-branches": GIT_BRANCHES,
  // Reporting a problem (RPT): help's, in the navigating area, navigating.ts being past the size limit.
  reporting: REPORTING,
  // Pictures sized to their window, at their own size on a click (#52): in the reading area, reading.ts being past the
  // size limit.
  pictures: PICTURES,
  // Where you are on the top bar (WSP-D4, WSP-D5): its cases of its own, in the areas they belong to.
  where: WHERE,
  // The git panel holding still as git answers (D261): source control's too, in a file of its own.
  "git-steady": GIT_STEADY,
  // Upgrading and restarting (UPG): two release builds of this checkout, made once a run.
  updates: UPDATES,
};

export const CHECKS: Check[] = Object.values(CHECK_FILES).flat();

const AREAS: LeftOut[] = [
  LEFT_OUT_READING,
  LEFT_OUT_EDITING,
  LEFT_OUT_NAVIGATING,
  LEFT_OUT_LINKS_AND_FILES,
  LEFT_OUT_OUTSIDE_AND_CODE,
  // The command line's own areas: what an agent or a script runs, with no screen to read.
  { cases: Object.fromEntries(CLI_CASES.map((a) => [a, "the command line's: tests/cli.test.ts covers it"])) },
];

/** Everything left out, with its reason, from every area. */
export const LEFT_OUT: Required<LeftOut> = {
  commands: Object.assign({}, ...AREAS.map((a) => a.commands ?? {})),
  cases: Object.assign({}, ...AREAS.map((a) => a.cases ?? {})),
};
