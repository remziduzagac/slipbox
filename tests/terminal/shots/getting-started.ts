// docs/guides/getting-started.md: the first screen, the switcher, a line typed in the lens.

import { GUIDE, open, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "getting-started-first",
    options: GUIDE,
    take: async (s) => {
      await s.status("coffee.md");
    },
  },
  {
    name: "getting-started-switcher",
    options: GUIDE,
    take: async (s) => {
      await s.keys("ctrl+p");
      await s.see("Open note");
      await s.type("inbox");
      await s.see("inbox.md");
    },
  },
  {
    name: "getting-started-editing",
    options: GUIDE,
    take: async (s) => {
      await open(s, "inbox");
      await s.keys("/");
      await s.type("Try the new");
      await s.keys("enter", "escape", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Order more beans");
    },
  },
];
