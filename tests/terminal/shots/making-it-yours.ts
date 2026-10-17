// docs/guides/making-it-yours.md: the theme picker, the settings list.

import { HOME, leader, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "making-it-yours-theme",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "u", "t");
      await s.see("Theme");
      await s.keys("down", "down", "down");
    },
  },
  {
    name: "making-it-yours-settings",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "u", "u");
      await s.see("Readable width");
    },
  },
];
