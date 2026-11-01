// The Git panel in a vault holding repositories: attention order, checkouts, diffs and navigation.

import { type Check, leader } from "../check.ts";
import { repositories } from "../support/vaults.ts";

export const GIT_PANEL: Check[] = [
  {
    area: "links-and-files",
    name: "git panel: in a vault of repositories they're the panel, by what needs attention; one opened up, its checkouts and changes, a change's diff; o goes into one (VV-D10)",
    covers: { cases: ["git", "vault", "multiple-roots"], commands: ["git.view"] },
    options: { startAt: "projects/a.md", config: "[ui]\nsidebar_width = 90\n", setup: repositories },
    run: async (s) => {
      await s.where(/projects$/, /a\.md/);
      await leader(s, "g");
      await s.status("GIT");
      await s.see(/projects holds 3 repositories/, 10_000);
      // By what needs attention, as git says: beta's worktree to review, gamma's change, alpha clean.
      const repo = (name: string) => s.rowOf(new RegExp(`[▸▾] ${name}(\\s|$)`));
      await s.until(
        () => repo("beta") >= 0 && repo("beta") < repo("gamma") && repo("gamma") < repo("alpha"),
        15_000,
        "beta, gamma, alpha: by what needs attention",
      );
      await s.see(/▸ beta\b.*✎1.*◆/);
      await s.see(/▸ gamma\b.*✎1/);
      await s.see(/▸ alpha\b.*clean/);
      // The first, opened up in place: its checkouts, the main one and the worktree by its branch; the worktree's file.
      await s.keys("g", "g");
      await s.see("enter open up");
      await s.keys("enter");
      await s.see(/▾ beta\b/);
      await s.see(/● main .*\/projects\/beta(?!-)/);
      await s.see(/⎇ agent .*\/projects\/beta-agent\b/);
      await s.see(/\? y\.md/, 5000);
      // Its change: its diff, against the last commit; esc back to the panel.
      await s.keys("j", "j", "j");
      await s.see("enter diff");
      await s.keys("enter");
      await s.see(/beta-agent: y\.md against its last commit/);
      await s.keys("escape");
      await s.notSee(/y\.md against its last commit/);
      // o on the last, alpha: gone into.
      await s.keys("shift+g");
      await s.see("o go in");
      await s.keys("o");
      await s.where(/alpha │ main$/, null, 5000);
    },
  },
];
