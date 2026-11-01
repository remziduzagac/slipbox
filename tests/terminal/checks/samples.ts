// The sample agent replay script.

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, downloadsVault } from "../check.ts";

export const SAMPLES: Check[] = [
  {
    area: "reading",
    name: "samples: the agent replay script edits a folder while it's shown — its note comes and goes in the explorer, the plan beside it untouched",
    covers: { cases: ["samples-meta"] },
    // Downloads beside home, a vault of its own, walked and watched whole (home's index leaves Downloads out).
    options: { home: true, startAt: "downloads/plan.md", setup: downloadsVault },
    run: async (s) => {
      const dir = join(s.dir, "downloads");
      const plan = s.read(join(dir, "plan.md"));
      const script = s.path("~/work/kestrel/scripts/dev/agent-replay.sh");
      // Its first pause, after it writes the note, held until the explorer shows it: on a slow runner the watcher
      // reports late, and paced by the clock alone, the note could come and go before slipbox is told. bash reads
      // BASH_ENV first, and a function named sleep comes before the command; every other pause is the clock's.
      const hold = join(s.dir, "tmp", "hold");
      const held = join(s.dir, "tmp", "held.bash");
      writeFileSync(hold, "");
      writeFileSync(held, 'sleep() { while [ -e "$HOLD" ]; do command sleep 0.05; done; command sleep "$@"; }\n');
      const env = { PATH: process.env.PATH ?? "", PAUSE: "0.3", BASH_ENV: held, HOLD: hold };
      const run = Bun.spawn(["bash", script, dir], { env, stdout: "pipe" });
      try {
        await s.see("agent-scratch.md");
      } finally {
        rmSync(hold, { force: true }); // on its way, seen or not
      }
      await run.exited;
      s.expect(run.exitCode === 0, `the script ran to its end (exit ${run.exitCode})`);
      await s.notSee("agent-scratch", 5000);
      await s.status("plan.md");
      s.expect(s.read(join(dir, "plan.md")) === plan, "the plan untouched");
    },
  },
];
