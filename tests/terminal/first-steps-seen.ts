// The first steps' hint is a first start's alone. A harness that starts slipbox with a state folder of its own marks it
// seen there, so no check, screenshot or live scenario meets it unless it asks to (`firstSteps`).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { firstStepsFile } from "../../src/tui/app/notifications/first-steps.ts";
import { storeDir } from "../../src/core/foundation/platform/paths.ts";

/** The marker's path for a check whose folder is `dir` (its `XDG_STATE_HOME` is `<dir>/state`). */
export function firstStepsMarker(dir: string): string {
  return firstStepsFile(storeDir("state", process.platform, { XDG_STATE_HOME: `${dir}/state` }));
}

/** Marks the hint seen in a check's folder. */
export function markFirstStepsSeen(dir: string): void {
  const file = firstStepsMarker(dir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "shown\n");
}
