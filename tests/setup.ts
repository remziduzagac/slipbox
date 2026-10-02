// Preloaded by `bun test` (bunfig.toml): every temporary file a run makes — thousands of vaults, the
// CLI's too, as it inherits the environment — goes in one folder of the run's own, removed when the
// run ends. Left behind, they filled /tmp run by run until its inodes ran out (2026-10-02).
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = mkdtempSync(join(tmpdir(), "slipbox-run-"));
process.env.TMPDIR = run;
const remove = () => rmSync(run, { recursive: true, force: true });
// Preloaded, `afterAll` is the whole run's: after the last file (`bun test` fires no `exit` here).
afterAll(remove);
// Interrupted (ctrl+c) or stopped: the folder still goes.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  process.on(signal, () => {
    remove();
    process.exit(code);
  });
}
