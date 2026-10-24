// Preloaded into slipbox by a terminal check (its session's `preload`): the first export's staging is cleared
// (`PreparedExport.dispose`) only once the check creates EXPORT_HOLD_GO, so the check can act while the export's file is
// there and the export not yet over; the hold's state written to EXPORT_HOLD_STATE as it changes ("waiting", then
// "let go"). A check's tool: slipbox itself never reads these.

import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { PreparedExport } from "../../src/core/export/spool.ts";

const { EXPORT_HOLD_GO: go, EXPORT_HOLD_STATE: stateFile } = process.env;
if (go && stateFile) {
  /** The state, whole: written beside the file and renamed over it, so the check never reads it half written. */
  const say = (state: string) => {
    writeFileSync(`${stateFile}.new`, state);
    renameSync(`${stateFile}.new`, stateFile);
  };
  // Afresh for each slipbox started: nothing of the last one's said or let go.
  rmSync(go, { force: true });
  say("");
  const dispose = PreparedExport.prototype.dispose;
  let held = false;
  PreparedExport.prototype.dispose = async function (this: PreparedExport) {
    if (!held) {
      held = true;
      say("waiting");
      while (!existsSync(go)) await Bun.sleep(20);
      say("let go");
    }
    return dispose.call(this);
  };
}
