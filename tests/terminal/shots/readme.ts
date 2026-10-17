// README.md's first picture (and the docs site's home page).

import { HOME, leader, quiet, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    // An agent's change to a design doc, read, reviewed and edited where it stands. The agent rewords a sentence and
    // adds one (git's signs beside them), gathers two references in the scratch (on the right), and you type in the
    // lens on its line. The explorer is put away, so the note and the scratch fit.
    name: "readme-hero",
    options: HOME("work/kestrel/docs/sync.md"),
    take: async (s) => {
      const kestrel = "~/work/kestrel";
      await s.status("sync.md");
      await quiet(s);
      await leader(s, "e");
      await leader(s, "e");
      await s.notSee("Explorer");
      s.cliIn(
        kestrel,
        "replace",
        "docs/sync.md",
        "Until the retry budget of [ADR 4](adr/0004-retry-budget.md) is on, an op is retried forever.",
        "With the retry budget of [ADR 4](adr/0004-retry-budget.md), an op is retried five times, then parked.",
      );
      s.cliIn(
        kestrel,
        "replace",
        "docs/sync.md",
        "(../src/sync/retry.ts#L17-L21).\n",
        "(../src/sync/retry.ts#L17-L21).\n\nThe budget is behind the `retry_budget` flag until 2.4. Without it, an op is retried forever.\n",
      );
      await s.see("retried five times", 8000);
      s.cliIn(kestrel, "capture", "--ref", "src/sync/retry.ts:17-21", "--snippet");
      s.cliIn(kestrel, "capture", "--ref", "docs/adr/0004-retry-budget.md:16-19", "five attempts, then parked");
      await leader(s, "s", "r");
      await s.see("DEFAULT_POLICY");
      await s.keys("ctrl+w", "h");
      await s.keys("ctrl+f");
      await s.type("behind the");
      await s.keys("enter", "escape");
      await s.keys("i");
      await s.status("LENS");
      await s.keys("shift+a");
      await s.type(" Priya turns it on per device.");
      await s.status("INSERT");
      // The messages fade: the reload's, and the lens's first-use hint.
      await s.notSee("changed on disk", 15000);
      await s.notSee("esc closes it", 15000);
    },
  },
];
