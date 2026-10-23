// Preloaded into slipbox by a terminal check (`BUN_OPTIONS=--preload …`): the spell checker's thread holds before it
// builds the dictionary whose words are SPELL_HOLD_DIC (`holdBuild`), until the check creates SPELL_HOLD_GO; the hold's
// state written to SPELL_HOLD_STATE as it changes. A check's tool: slipbox itself never reads these.

import { existsSync, writeFileSync } from "node:fs";
import { holdBuild } from "../../src/core/spell-thread.ts";

const { SPELL_HOLD_DIC: dic, SPELL_HOLD_GO: go, SPELL_HOLD_STATE: stateFile } = process.env;
if (dic && go && stateFile) {
  const hold = await holdBuild(dic);
  let said = "";
  const watch = setInterval(() => {
    const state = hold.state();
    if (state !== said) writeFileSync(stateFile, (said = state));
    if (state === "waiting" && existsSync(go)) hold.letGo();
    if (state === "let go" || state === "ran out") clearInterval(watch);
  }, 20);
  watch.unref();
}
