// docs/guides/agents.md: an agent's write to a note with unsaved changes.

import { GUIDE, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "agents-conflict",
    options: { ...GUIDE, startAt: "home/notes/inbox.md" },
    take: async (s) => {
      await s.status("inbox.md");
      // A task of yours, typed under the last one and not saved.
      await s.keys("/");
      await s.type("Try the new");
      await s.keys("enter", "escape", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Ask about the grinder");
      await s.keys("escape");
      await s.status("LENS");
      // The agent's, appended on disk meanwhile.
      s.cliIn("~/notes", "write", "inbox.md", "--append", "--paragraph", "--", "- [ ] Call the plumber");
      await s.see(/changed on disk/i, 8000);
    },
  },
];
