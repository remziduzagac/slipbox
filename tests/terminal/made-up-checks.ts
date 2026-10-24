// Preloaded into the runner by its own test (tests/terminal-harness.test.ts): checks made up for it, quarantined, joined
// to the registry before run.ts reads it. Never started: a worker, which loads no preload, wouldn't find them. Imported
// by nothing, so they never join the registry of a test's own process.

import { CHECKS } from "./checks/index.ts";

/** What the made-up checks' names start with: the filter that chooses them alone. */
const MADE_UP = "made up for the runner's test";

// The field by shorthand, so that a grep for it lists only the checks and tests quarantined for real.
const quarantined = "#0";
const never = async () => {
  throw new Error("a quarantined check is never run");
};
CHECKS.push(
  // In the pool, and the release builds' (UPG): none made for it.
  { area: "reading", name: `${MADE_UP}: quarantined`, covers: {}, releases: true, quarantined, run: never },
  // Timed alone, after the pool.
  { area: "reading", name: `${MADE_UP}: quarantined, alone`, covers: {}, alone: true, quarantined, run: never },
);
