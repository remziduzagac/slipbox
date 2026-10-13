// Every terminal check, by area (TT-D3): each area's file holds its checks and what it leaves out (TT-D4).

import { CLI_CASES, type Check, type LeftOut } from "../check.ts";
import { EDITING, LEFT_OUT_EDITING } from "./editing.ts";
import { LEFT_OUT_LINKS_AND_FILES, LINKS_AND_FILES } from "./links-and-files.ts";
import { LEFT_OUT_NAVIGATING, NAVIGATING } from "./navigating.ts";
import { LEFT_OUT_OUTSIDE_AND_CODE, OUTSIDE_AND_CODE } from "./outside-and-code.ts";
import { LEFT_OUT_READING, READING } from "./reading.ts";

export const CHECKS: Check[] = [...READING, ...EDITING, ...NAVIGATING, ...LINKS_AND_FILES, ...OUTSIDE_AND_CODE];

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
