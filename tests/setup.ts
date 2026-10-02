// Preloaded by `bun test` (bunfig.toml): every temporary file a run makes — thousands of vaults, the
// CLI's too, as it inherits the environment — goes in one folder of the run's own, removed when the
// run ends. Left behind, they filled /tmp run by run until its inodes ran out (2026-10-02).
import { afterAll } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = tmpdir();

/** A process still running (or one this user can't signal: someone else's, so not ours to judge). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

// A run that ended without its `afterAll` — `--bail`, a crash, `kill -9` — left its folder: named by
// its process, which is gone, so it goes now.
for (const name of readdirSync(base)) {
  const m = /^slipbox-run-(\d+)-/.exec(name);
  if (m && Number(m[1]) !== process.pid && !alive(Number(m[1]))) rmSync(join(base, name), { recursive: true, force: true });
}

const run = mkdtempSync(join(base, `slipbox-run-${process.pid}-`));
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
