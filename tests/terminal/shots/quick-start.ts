// docs/guides/quick-start.md: a note of your own in ~/notes, read.

import { NOTES, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "quick-start-reading",
    options: NOTES,
    take: async (s) => {
      await s.status("inbox.md");
      await s.status("READ");
    },
  },
];
