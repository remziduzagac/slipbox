// docs/manual/introduction.md: an ordinary reading session, a note with its properties, headings and links rendered
// beside the explorer.

import { HOME, leader, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "introduction-overview",
    options: HOME("notes/projects/kestrel-v2-3.md"),
    take: async (s) => {
      await s.status("kestrel-v2-3.md");
      // The explorer zoomed in on the note's folder, projects: its notes, not the reference set's odd names.
      await leader(s, "shift+e");
      await s.status("FILES");
      await s.keys("z");
      await s.see("› projects ›");
      await s.keys("escape");
      await s.status("READ");
    },
  },
];
