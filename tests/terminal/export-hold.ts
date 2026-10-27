// Preloaded into slipbox by a terminal check (its session's `preload`): the first export's staging is cleared
// (`PreparedExport.dispose`) only once the check creates EXPORT_HOLD_GO, so the check can act while the export's file is
// there and its staging not yet cleared; the hold's state written to EXPORT_HOLD_STATE as it changes ("waiting", then
// "let go"). With EXPORT_HOLD_AT=publication, the first publication (`PreparedExport.publish`) returns only then
// instead: its document in place, the export not yet told. A check's tool: slipbox itself never reads these.

import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { PreparedExport } from "../../src/core/rendering/export/spool.ts";

const { EXPORT_HOLD_GO: go, EXPORT_HOLD_STATE: stateFile, EXPORT_HOLD_AT: at } = process.env;
if (go && stateFile) {
  /** The state, whole: written beside the file and renamed over it, so the check never reads it half written. */
  const say = (state: string) => {
    writeFileSync(`${stateFile}.new`, state);
    renameSync(`${stateFile}.new`, stateFile);
  };
  // Afresh for each slipbox started: nothing of the last one's said or let go.
  rmSync(go, { force: true });
  say("");
  let held = false;
  /** The first time only: till the check lets it go. */
  const hold = async () => {
    if (held) return;
    held = true;
    say("waiting");
    while (!existsSync(go)) await Bun.sleep(20);
    say("let go");
  };
  if (at === "publication" || at === "before-publication") {
    const publish = PreparedExport.prototype.publish;
    PreparedExport.prototype.publish = async function (this: PreparedExport, ...args) {
      if (at === "before-publication") await hold();
      const files = await publish.apply(this, args);
      if (at === "publication") await hold();
      return files;
    };
  } else {
    const dispose = PreparedExport.prototype.dispose;
    PreparedExport.prototype.dispose = async function (this: PreparedExport) {
      await hold();
      return dispose.call(this);
    };
  }
}
