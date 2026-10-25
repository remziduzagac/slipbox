// docs/guides/from-obsidian-or-zk.md: an Obsidian vault's home note, its picture drawn.

import { HOME, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "obsidian-home",
    options: HOME("hobbies/cooking/Home.md"),
    pictures: ["home/hobbies/cooking/attachments/dal.png"],
    take: async (s) => {
      await s.status("Home.md");
      await s.see("properties");
      await s.keys(":");
      await s.type("18");
      await s.keys("enter", "ctrl+d");
      await s.see("⧉p");
    },
  },
];
