// Preloaded into slipbox by a terminal check (its session's `preload`): the spell checker's thread holds before it
// builds the dictionary whose words are SPELL_HOLD_DIC (`holdBuild`), until the check creates SPELL_HOLD_GO; the hold's
// state written to SPELL_HOLD_STATE as it changes. A check's tool: slipbox itself never reads these.

import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { holdBuild } from "../../src/core/documents/diagnostics/spell-thread.ts";

const { SPELL_HOLD_DIC: dic, SPELL_HOLD_GO: go, SPELL_HOLD_STATE: stateFile } = process.env;
if (dic && go && stateFile) {
  /** The state, whole: written beside the file and renamed over it, so the check never reads it half written. */
  const say = (state: string) => {
    writeFileSync(`${stateFile}.new`, state);
    renameSync(`${stateFile}.new`, stateFile);
  };
  // Afresh for each slipbox started (a check's restart): nothing of the last one's said or let go.
  rmSync(go, { force: true });
  say("");
  const hold = await holdBuild(dic);
  let said = "";
  let gone = false;
  const watch = setInterval(() => {
    const state = hold.state();
    if (state !== said) say((said = state));
    if (!gone && state === "waiting" && existsSync(go)) {
      hold.letGo();
      gone = true;
    }
    if (state !== "set" && state !== "waiting") clearInterval(watch);
  }, 20);
  watch.unref();
}
