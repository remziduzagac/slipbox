// Another vault's note in a peek: reading only, with its file preserved.

import { type Check, follow, opened } from "../check.ts";
import { ARCHITECTURE, PEEK_HINT } from "../support/links.ts";

// --- the peek ---------------------------------------------------------------------------------------------------

export const PEEKED: Check[] = [
  {
    area: "links-and-files",
    name: "peek: another vault's note read in a peek is read-only — typing refused, said; the file as it was (VV-D7)",
    covers: { cases: ["links/travel", "vault"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const file = "~/work/kestrel/docs/architecture.md";
      const before = s.read(file);
      await follow(s, ARCHITECTURE);
      await s.see("kestrel › docs/architecture.md", 5000);
      await s.see(PEEK_HINT);
      await s.keys("i");
      await s.message("a peek is read-only");
      await s.keys("x");
      await s.see(PEEK_HINT);
      s.expect(s.read(file) === before, "the peeked file as it was");
      await s.keys("escape");
      await s.notSee(PEEK_HINT);
      await opened(s, "index.md");
    },
  },
];
