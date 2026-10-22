// docs/guides/agents.md: an agent's write to a note with unsaved changes.

import { GUIDE, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "agents-conflict",
    options: { ...GUIDE, startAt: "home/slipbox-tour/inbox.md" },
    take: async (s) => {
      await s.status("inbox.md");
      // A task of yours, typed under the last one and not saved.
      await s.keys("ctrl+f");
      await s.type("Try the new");
      await s.keys("enter", "escape", "i");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Ask about the grinder");
      await s.keys("escape");
      await s.status("LENS");
      await s.notSee("the lens: the markdown", 8000);
      // The agent's, appended on disk meanwhile, as the guide's first write.
      s.cliIn("~/slipbox-tour", "write", "inbox", "--append", "--paragraph", "--", "- [ ] Call the plumber");
      await s.see(/changed on disk/i, 8000);
    },
  },
];
