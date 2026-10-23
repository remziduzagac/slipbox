// Every terminal check, by area (TT-D3): each area's file holds its checks and what it leaves out (TT-D4).

import { CLI_CASES, type Check, type LeftOut } from "../check.ts";
import { EDITING, LEFT_OUT_EDITING } from "./editing.ts";
import { GIT_DIFF } from "./git-diff.ts";
import { LEFT_OUT_LINKS_AND_FILES, LINKS_AND_FILES } from "./links-and-files.ts";
import { LEFT_OUT_NAVIGATING, NAVIGATING } from "./navigating.ts";
import { LEFT_OUT_OUTSIDE_AND_CODE, OUTSIDE_AND_CODE } from "./outside-and-code.ts";
import { PANELS } from "./panels.ts";
import { LEFT_OUT_READING, READING } from "./reading.ts";
import { SOURCE_CONTROL } from "./source-control.ts";
import { VAULTS } from "./vaults.ts";

/** Each file's checks, by its name: `bun run test:terminal <name>` runs them. */
export const CHECK_FILES: Record<string, Check[]> = {
  reading: READING,
  editing: EDITING,
  navigating: NAVIGATING,
  "links-and-files": LINKS_AND_FILES,
  // Vaults, home and Elsewhere, the view, marks, links, the peek: their own file, in the areas they belong to.
  vaults: VAULTS,
  "outside-and-code": OUTSIDE_AND_CODE,
  // Source control's, in the outside-and-code area: their own file.
  "source-control": SOURCE_CONTROL,
  // The diff window's later edges (a block by its lines, enter on a line before, what no line shows): source
  // control's too, in a file of their own, source-control.ts being near the size limit.
  "git-diff": GIT_DIFF,
  // The panels as the checks' shared helpers drive them (#18): the which-key popup, the explorer, the outline, the git
  // panel; in the navigating area, navigating.ts being past the size limit.
  panels: PANELS,
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
